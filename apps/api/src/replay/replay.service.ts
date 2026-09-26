import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import type { MatchEvent } from '@livescore/types';
import { DRIZZLE, type Database } from '../db/db.module';
import { matchEvents, matches } from '../db/schema';

/** Real milliseconds per tick. */
const TICK_MS = 1000;
/** A football match, in virtual minutes, including generous stoppage. */
const FULL_TIME = 95;

type ReplayRun = {
  replayMatchId: string;
  sourceMatchId: string;
  timer: ReturnType<typeof setInterval>;
  speed: number;
  virtualMinute: number;
  cursor: number;
  events: MatchEvent[];
  home: number;
  away: number;
};

@Injectable()
export class ReplayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReplayService.name);
  private readonly runs = new Map<string, ReplayRun>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly events: EventEmitter2,
  ) {}

  /** Replays are ephemeral; a restart leaves orphans stuck at 'live'. */
  async onModuleInit() {
    const deleted = await this.db
      .delete(matches)
      .where(eq(matches.isReplay, true))
      .returning({ id: matches.id });
    if (deleted.length) {
      this.logger.log(`Cleared ${deleted.length} orphaned replay match(es)`);
    }
  }

  onModuleDestroy() {
    for (const run of this.runs.values()) clearInterval(run.timer);
  }

  async start(sourceMatchId: string, speed = 60) {
    const source = await this.db.query.matches.findFirst({
      where: eq(matches.id, sourceMatchId),
      with: { events: true },
    });
    if (!source) throw new Error(`No match ${sourceMatchId}`);
    if (source.events.length === 0) {
      throw new Error('Source match has no events — nothing to replay');
    }

    // Clone. Events dedupe on externalId, so the copy needs its own namespace.
    const [replay] = await this.db
      .insert(matches)
      .values({
        externalId: `replay:${crypto.randomUUID()}`,
        competitionId: source.competitionId,
        round: source.round,
        kickoff: new Date(),
        homeTeamId: source.homeTeamId,
        awayTeamId: source.awayTeamId,
        scoreHome: 0,
        scoreAway: 0,
        status: 'live',
        minute: 0,
        isReplay: true,
        lastUpdatedAt: new Date(),
      })
      .returning({ id: matches.id });

    const ordered = [...source.events].sort(
      (a, b) => a.minute - b.minute || (a.stoppage ?? 0) - (b.stoppage ?? 0),
    );

    const run: ReplayRun = {
      replayMatchId: replay.id,
      sourceMatchId,
      speed,
      virtualMinute: 0,
      cursor: 0,
      events: ordered as unknown as MatchEvent[],
      home: 0,
      away: 0,
      timer: setInterval(() => void this.tick(replay.id), TICK_MS),
    };
    this.runs.set(replay.id, run);

    this.logger.log(
      `Replay ${replay.id} started at ${speed}x (${ordered.length} events)`,
    );
    return { replayMatchId: replay.id, speed, totalEvents: ordered.length };
  }

  private async tick(replayMatchId: string) {
    const run = this.runs.get(replayMatchId);
    if (!run) return;

    // speed = virtual minutes per real minute.
    run.virtualMinute += (run.speed * TICK_MS) / 60_000;
    const now = run.virtualMinute;

    const due: MatchEvent[] = [];
    while (
      run.cursor < run.events.length &&
      run.events[run.cursor].minute <= now
    ) {
      const e = run.events[run.cursor++];
      due.push(e);
      if (e.kind === 'goal') {
        // An own goal by the home team scores for the away team.
        const forHome = e.isOwnGoal ? !e.isHome : e.isHome;
        if (forHome) run.home++;
        else run.away++;
      }
    }

    if (due.length > 0) {
      // Rebind identity FIRST, then use the same objects for both the insert
      // and the emit. Emitting the source event's externalId would make
      // PushService stamp notified_at on the ORIGINAL match's row instead of
      // this replay's — marking real events as notified that never were.
      const cloned: MatchEvent[] = due.map((e) => ({
        ...e,
        id: `${replayMatchId}:${e.externalId}`,
        externalId: `${replayMatchId}:${e.externalId}`,
        matchId: replayMatchId,
      }));

      await this.db.insert(matchEvents).values(
        cloned.map((e) => ({
          externalId: e.externalId,
          matchId: replayMatchId,
          teamId: e.teamId || null,
          isHome: e.isHome,
          kind: e.kind,
          minute: e.minute,
          stoppage: e.stoppage,
          scorerName: e.kind === 'goal' ? e.scorerName : null,
          assistName: e.kind === 'goal' ? e.assistName : null,
          isPenalty: e.kind === 'goal' ? e.isPenalty : null,
          isOwnGoal: e.kind === 'goal' ? e.isOwnGoal : null,
          card: e.kind === 'card' ? e.card : null,
          playerName: e.kind === 'card' ? e.playerName : null,
          playerInName: e.kind === 'substitution' ? e.playerInName : null,
          playerOutName: e.kind === 'substitution' ? e.playerOutName : null,
        })),
      );
      // Identical payload to the live path — SSE and push cannot tell them apart.
      this.events.emit('match.events', {
        matchId: replayMatchId,
        events: cloned,
      });
    }

    const done = now >= FULL_TIME;
    const status = done
      ? 'finished'
      : now >= 45 && now < 46
        ? 'halftime'
        : 'live';

    await this.db
      .update(matches)
      .set({
        scoreHome: run.home,
        scoreAway: run.away,
        status,
        minute: done ? null : Math.min(Math.floor(now), 90),
        lastUpdatedAt: new Date(),
      })
      .where(eq(matches.id, replayMatchId));

    this.events.emit('match.updated', {
      matchId: replayMatchId,
      score: { home: run.home, away: run.away },
      status,
      minute: done ? null : Math.min(Math.floor(now), 90),
      stoppage: null,
    });

    if (done) this.stop(replayMatchId);
  }

  stop(replayMatchId: string) {
    const run = this.runs.get(replayMatchId);
    if (!run) return { stopped: false };
    clearInterval(run.timer);
    this.runs.delete(replayMatchId);
    this.logger.log(`Replay ${replayMatchId} stopped`);
    return { stopped: true };
  }

  list() {
    return [...this.runs.values()].map((r) => ({
      replayMatchId: r.replayMatchId,
      sourceMatchId: r.sourceMatchId,
      speed: r.speed,
      minute: Math.floor(r.virtualMinute),
      released: r.cursor,
      total: r.events.length,
      score: `${r.home}-${r.away}`,
    }));
  }
}
