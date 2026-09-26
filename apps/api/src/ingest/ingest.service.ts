import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import type { MatchEvent } from '@livescore/types';
import { DRIZZLE, type Database } from '../db/db.module';
import { competitions, matchEvents, matches, teams } from '../db/schema';
import { TheSportsDbClient } from '../providers/thesportsdb/thesportsdb.client';
import {
  mapLiveScore,
  mapMatch,
  mapStatus,
  mapTimelineEvent,
  type MappedMatch,
} from '../providers/thesportsdb/mappers';
import { parseMinute, toInt } from '../providers/thesportsdb/coerce';
import { newGoalTallies, retractedGoalTallies } from './goal-diff';

/**
 * Upper bound on timeline fetches per poll cycle. Each costs one upstream
 * request against a shared 30/min budget, and the client serialises them
 * ~2.1s apart, so this also bounds how long a cycle can run.
 *
 * Four, not twelve: matches are visited round-robin, so four a cycle still
 * reaches every tracked match well inside 90s at the sizes we see, while
 * leaving most of the budget unspent. Twelve polled each match every 30s and
 * consumed 24/min of 30 to do it — for data the provider does not publish
 * until a match has finished.
 */
const TIMELINE_FETCHES_PER_CYCLE = 4;

/**
 * Separate, smaller budget for the opportunistic lookup after a score change.
 * Without a cap this is the one consumer that scales with the number of live
 * matches, which is exactly what the cycle must not do. Missing it costs only
 * a scorer's name — the goal itself is derived from the score regardless.
 */
const SCORE_LOOKUPS_PER_CYCLE = 3;

/**
 * How many timeline entries the plan returns before truncating. The free key
 * caps at 5 — measured, and stated in the docs as "Event Timelines: free 5,
 * premium 100". A match at the cap is FROZEN: the provider will never return
 * a sixth entry for it, so re-fetching it can only ever return the same rows.
 *
 * Raise this alongside the API plan, or the app will stop reading timelines
 * after the fifth event of every match.
 */
const TIMELINE_ENTRY_CAP = 5;

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  /**
   * When each match's timeline was last fetched, so a cycle can spend its
   * budget on the ones waiting longest instead of always the first few the
   * provider happens to list. In memory by design: losing it on restart just
   * means the next cycle treats every match as equally overdue.
   */
  private readonly timelineCheckedAt = new Map<string, number>();

  /**
   * Matches whose timeline has hit the plan's entry cap. Nothing new can come
   * back for these, so they leave the rotation entirely rather than being
   * re-fetched every few cycles for rows we already hold.
   */
  private readonly timelineFrozen = new Set<string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly client: TheSportsDbClient,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  /**
   * Competitions we backfill and build tables for. Everything else can still
   * appear live; it just has no rounds, standings or statistics.
   */
  get trackedLeagueIds(): string[] {
    return (this.config.get<string>('TSDB_LEAGUE_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private isTrackedLeague(externalId: string | null): boolean {
    return !!externalId && this.trackedLeagueIds.includes(externalId);
  }

  private async upsertCompetition(m: MappedMatch): Promise<string | null> {
    if (!m.competitionExternalId || !m.season) return null;
    const [row] = await this.db
      .insert(competitions)
      .values({
        externalId: m.competitionExternalId,
        name: m.competitionName ?? 'Unknown',
        season: m.season,
        badgeUrl: m.competitionBadge,
        isTracked: this.isTrackedLeague(m.competitionExternalId),
      })
      .onConflictDoUpdate({
        target: [competitions.externalId, competitions.season],
        set: {
          name: sql`excluded.name`,
          // Whatever is already stored WINS; the provider only fills a gap.
          //
          // Two reasons. The live feed carries no league badge at all, so a
          // poll must not wipe what backfill supplied. And the provider's
          // artwork is sometimes worse than what we have — its Champions
          // League badge is a white starball, invisible on a light chip — so
          // a curated value must survive the next import rather than being
          // silently reverted.
          badgeUrl: sql`coalesce(${competitions.badgeUrl}, excluded.badge_url)`,
          // Re-evaluated on every write so changing the configured league
          // list promotes or demotes existing rows without a manual fix-up.
          isTracked: sql`excluded.is_tracked`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: competitions.id });
    return row?.id ?? null;
  }

  private async upsertTeam(
    externalId: string | null,
    name: string | null,
    badgeUrl: string | null,
  ): Promise<string | null> {
    if (!externalId) return null;
    const [row] = await this.db
      .insert(teams)
      .values({ externalId, name: name ?? 'Unknown', badgeUrl })
      .onConflictDoUpdate({
        target: teams.externalId,
        set: {
          name: sql`excluded.name`,
          badgeUrl: sql`excluded.badge_url`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: teams.id });
    return row?.id ?? null;
  }

  /** Insert or update one match. Returns the internal id, or null if unusable. */
  async upsertMatch(m: MappedMatch, raw: unknown): Promise<string | null> {
    const competitionId = await this.upsertCompetition(m);
    const homeTeamId = await this.upsertTeam(
      m.homeTeamExternalId,
      m.homeTeamName,
      m.homeBadge,
    );
    const awayTeamId = await this.upsertTeam(
      m.awayTeamExternalId,
      m.awayTeamName,
      m.awayBadge,
    );

    if (!competitionId || !homeTeamId || !awayTeamId || !m.kickoff) {
      this.logger.warn(`Skipping match ${m.externalId}: missing required refs`);
      return null;
    }

    const [row] = await this.db
      .insert(matches)
      .values({
        externalId: m.externalId,
        competitionId,
        round: m.round,
        kickoff: new Date(m.kickoff),
        homeTeamId,
        awayTeamId,
        scoreHome: m.scoreHome,
        scoreAway: m.scoreAway,
        status: m.status,
        minute: m.minute,
        stoppage: m.stoppage,
        raw,
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matches.externalId,
        set: {
          scoreHome: sql`excluded.score_home`,
          scoreAway: sql`excluded.score_away`,
          status: sql`excluded.status`,
          minute: sql`excluded.minute`,
          stoppage: sql`excluded.stoppage`,
          round: sql`excluded.round`,
          kickoff: sql`excluded.kickoff`,
          raw: sql`excluded.raw`,
          lastUpdatedAt: new Date(),
        },
      })
      .returning({ id: matches.id });

    return row?.id ?? null;
  }

  /** Backfill one matchday. One API call. */
  async importRound(leagueId: string, round: number, season: string) {
    const res = await this.client.getRound(leagueId, round, season);
    const dtos = res.events ?? [];
    let imported = 0;
    for (const dto of dtos) {
      const id = await this.upsertMatch(mapMatch(dto), dto);
      if (id) imported++;
    }
    this.logger.log(`Round ${round}: imported ${imported}/${dtos.length}`);
    return { round, total: dtos.length, imported };
  }

  /**
   * Insert events, returning ONLY the ones that were genuinely new.
   * This is the diff: ON CONFLICT DO NOTHING ... RETURNING gives back just
   * the inserted rows, so re-reading the same timeline every 30 seconds
   * yields an empty array instead of duplicate notifications.
   */
  async insertNewEvents(
    matchId: string,
    events: MatchEvent[],
  ): Promise<MatchEvent[]> {
    if (events.length === 0) return [];

    const rows = events.map((e) => ({
      externalId: e.externalId,
      matchId,
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
    }));

    const inserted = await this.db
      .insert(matchEvents)
      .values(rows)
      .onConflictDoNothing({ target: matchEvents.externalId })
      .returning({ externalId: matchEvents.externalId });

    const newIds = new Set(inserted.map((r) => r.externalId));
    return events.filter((e) => newIds.has(e.externalId));
  }

  /** Fetch and store a match's timeline. One API call. */
  async syncTimeline(match: {
    id: string;
    externalId: string;
    homeTeamId: string;
    awayTeamId: string;
  }): Promise<MatchEvent[]> {
    const { fresh } = await this.fetchTimeline(match);
    return fresh;
  }

  /**
   * The same fetch, also reporting how many entries upstream held — which is
   * what tells us the response was truncated and the match can be retired
   * from the rotation. Kept separate so existing callers keep their shape.
   */
  private async fetchTimeline(match: {
    id: string;
    externalId: string;
    homeTeamId: string;
    awayTeamId: string;
  }): Promise<{ fresh: MatchEvent[]; total: number }> {
    const res = await this.client.getTimeline(match.externalId);
    const mapped = (res.timeline ?? [])
      .map((t) =>
        mapTimelineEvent(t, {
          matchId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
        }),
      )
      .filter((e): e is MatchEvent => e !== null);

    const fresh = await this.insertNewEvents(match.id, mapped);
    if (fresh.length > 0) {
      this.events.emit('match.events', { matchId: match.id, events: fresh });
    }

    const total = (res.timeline ?? []).length;
    if (total >= TIMELINE_ENTRY_CAP) this.timelineFrozen.add(match.id);

    return { fresh, total };
  }

  /**
   * Sync a stored match's timeline by its provider id. Lets us exercise the
   * event-diff path against a finished match, instead of waiting for a live one.
   */
  async syncTimelineByExternalId(externalId: string): Promise<MatchEvent[]> {
    const [row] = await this.db
      .select({
        id: matches.id,
        externalId: matches.externalId,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
      })
      .from(matches)
      .where(eq(matches.externalId, externalId))
      .limit(1);

    if (!row) {
      this.logger.warn(`No stored match with externalId ${externalId}`);
      return [];
    }
    return this.syncTimeline(row);
  }

  /**
   * One livescore call covers every in-play match globally, and we now show
   * all of them — a match in an untracked competition is created on the fly.
   *
   * Event timelines are a different matter: they cost one upstream request
   * EACH, against a 30/min budget shared by the whole app. With 40 matches in
   * play that alone would blow the limit, so timelines are fetched only for
   * tracked competitions and capped per cycle.
   */
  async syncLive(trackedLeagueIds: string[]) {
    const res = await this.client.getLiveScores();
    const all = res.livescore ?? [];

    let created = 0;
    let updated = 0;
    let newEvents = 0;
    let namedFromTimeline = 0;
    let derivedAnonymous = 0;
    let scoreLookupBudget = SCORE_LOOKUPS_PER_CYCLE;

    // Tracked matches seen this cycle, collected rather than fetched inline:
    // choosing which to spend the timeline budget on needs the whole set.
    const trackedRows: {
      id: string;
      externalId: string;
      homeTeamId: string;
      awayTeamId: string;
    }[] = [];

    for (const live of all) {
      const externalId = live.idEvent ?? live.idLiveScore;
      if (!externalId) continue;

      let [row] = await this.db
        .select({
          id: matches.id,
          externalId: matches.externalId,
          homeTeamId: matches.homeTeamId,
          awayTeamId: matches.awayTeamId,
          scoreHome: matches.scoreHome,
          scoreAway: matches.scoreAway,
        })
        .from(matches)
        .where(eq(matches.externalId, externalId))
        .limit(1);

      if (!row) {
        // Never seen — create it from the live payload so it can be shown.
        const id = await this.upsertMatch(mapLiveScore(live), live);
        if (!id) continue;
        const [fresh] = await this.db
          .select({
            id: matches.id,
            externalId: matches.externalId,
            homeTeamId: matches.homeTeamId,
            awayTeamId: matches.awayTeamId,
            scoreHome: matches.scoreHome,
            scoreAway: matches.scoreAway,
          })
          .from(matches)
          .where(eq(matches.id, id))
          .limit(1);
        if (!fresh) continue;
        row = fresh;
        created++;
      }

      // strProgress carries the match clock ("67", "90+2"); strStatus
      // distinguishes 1H/2H/HT. Hardcoding 'live' would show half-time
      // matches as in play and lose the clock entirely.
      const progress = parseMinute(live.strProgress);

      await this.db
        .update(matches)
        .set({
          scoreHome: toInt(live.intHomeScore),
          scoreAway: toInt(live.intAwayScore),
          status: mapStatus(live.strStatus),
          minute: progress?.minute ?? null,
          stoppage: progress?.stoppage ?? null,
          lastUpdatedAt: new Date(),
        })
        .where(eq(matches.id, row.id));
      updated++;

      const nextHome = toInt(live.intHomeScore);
      const nextAway = toInt(live.intAwayScore);
      const scoreChanged =
        (nextHome !== null &&
          row.scoreHome !== null &&
          nextHome > row.scoreHome) ||
        (nextAway !== null &&
          row.scoreAway !== null &&
          nextAway > row.scoreAway);

      // A score change is the one moment a scorer's name might be worth
      // chasing, so spend a request on the timeline for THIS match whatever
      // competition it is in. The provider usually has nothing live, but when
      // it does we get a real name instead of an anonymous "Goal" — and score
      // changes are rare enough that the budget can absorb it.
      if (
        scoreChanged &&
        scoreLookupBudget > 0 &&
        !this.timelineFrozen.has(row.id)
      ) {
        scoreLookupBudget--;
        const named = await this.syncTimeline(row);
        // Counts as this match's timeline check, so the round-robin below
        // does not immediately spend another request on the same match.
        this.timelineCheckedAt.set(row.id, Date.now());
        newEvents += named.length;
        if (named.length > 0) namedFromTimeline += named.length;
      }

      // Whatever the timeline did not cover, derive from the score itself.
      // deriveGoalsFromScore skips any side already credited at this minute,
      // so a named scorer is never overwritten by an anonymous duplicate.
      const fromScore = await this.deriveGoalsFromScore(row, {
        home: nextHome,
        away: nextAway,
        minute: progress?.minute ?? null,
        stoppage: progress?.stoppage ?? null,
      });
      newEvents += fromScore.length;
      derivedAnonymous += fromScore.length;

      this.events.emit('match.updated', {
        matchId: row.id,
        score:
          toInt(live.intHomeScore) === null || toInt(live.intAwayScore) === null
            ? null
            : {
                home: toInt(live.intHomeScore),
                away: toInt(live.intAwayScore),
              },
        status: mapStatus(live.strStatus),
        minute: progress?.minute ?? null,
        stoppage: progress?.stoppage ?? null,
      });

      // Timelines are the expensive part — one request each — so only
      // tracked competitions are candidates, and the spending happens after
      // the loop, once the full set is known.
      if (live.idLeague !== null && trackedLeagueIds.includes(live.idLeague)) {
        trackedRows.push(row);
      }
    }

    newEvents += await this.sweepTimelines(trackedRows);

    const finalized = await this.finaliseDroppedOff(
      all
        .map((m) => m.idEvent ?? m.idLiveScore)
        .filter((id): id is string => !!id),
    );

    return {
      liveTotal: all.length,
      created,
      updated,
      newEvents,
      namedFromTimeline,
      derivedAnonymous,
      finalized,
    };
  }

  /**
   * Spend the cycle's timeline budget on the tracked matches that have waited
   * longest, so every match is reached in turn instead of the first few
   * crowding out the rest. With B fetches a cycle and N tracked matches in
   * play, each is visited every ceil(N/B) cycles.
   *
   * The old code took the first B in provider order every cycle, which was
   * fine while N <= B and silently starved everything after the twelfth once
   * it was not.
   */
  private async sweepTimelines(
    rows: {
      id: string;
      externalId: string;
      homeTeamId: string;
      awayTeamId: string;
    }[],
  ): Promise<number> {
    if (rows.length === 0) {
      this.timelineCheckedAt.clear();
      return 0;
    }

    // Forget matches that have stopped playing, or these grow all season.
    const inPlayNow = new Set(rows.map((r) => r.id));
    for (const id of this.timelineCheckedAt.keys()) {
      if (!inPlayNow.has(id)) this.timelineCheckedAt.delete(id);
    }
    for (const id of this.timelineFrozen) {
      if (!inPlayNow.has(id)) this.timelineFrozen.delete(id);
    }

    // A match at the entry cap can never return anything new, so spending a
    // request on it is spending it on rows already in the database.
    const candidates = rows.filter((r) => !this.timelineFrozen.has(r.id));
    if (candidates.length === 0) return 0;

    // Never checked sorts first: a match we have just started showing is the
    // one most likely to have events we have not seen.
    const overdueFirst = [...candidates].sort(
      (a, b) =>
        (this.timelineCheckedAt.get(a.id) ?? 0) -
        (this.timelineCheckedAt.get(b.id) ?? 0),
    );

    let newEvents = 0;
    for (const row of overdueFirst.slice(0, TIMELINE_FETCHES_PER_CYCLE)) {
      // Stamped before the call, so a failure does not pin this match at the
      // front of the queue and block every other one behind it.
      this.timelineCheckedAt.set(row.id, Date.now());
      const { fresh } = await this.fetchTimeline(row);
      newEvents += fresh.length;
    }

    const frozen = rows.length - candidates.length;
    const cycles = Math.ceil(candidates.length / TIMELINE_FETCHES_PER_CYCLE);
    this.logger.debug(
      `${rows.length} tracked in play — ${candidates.length} still growing ` +
        `(checked every ${cycles} cycle(s), ~${cycles * 30}s), ` +
        `${frozen} at the ${TIMELINE_ENTRY_CAP}-entry cap and retired`,
    );

    return newEvents;
  }

  /**
   * Turn a score increase into goal event(s).
   *
   * These carry no scorer — the provider does not supply one live — but the
   * goal itself is real and authoritative, since scores are what the live feed
   * is genuinely good at. A null scorerName renders as plain "Goal", which is
   * honest rather than invented.
   */
  private async deriveGoalsFromScore(
    row: {
      id: string;
      homeTeamId: string;
      awayTeamId: string;
      scoreHome: number | null;
      scoreAway: number | null;
    },
    next: {
      home: number | null;
      away: number | null;
      minute: number | null;
      stoppage: number | null;
    },
  ): Promise<MatchEvent[]> {
    const minute = next.minute;
    // Without a clock we cannot place or de-duplicate the goal.
    if (minute === null) return [];

    const sides = [
      { isHome: true, prev: row.scoreHome, now: next.home },
      { isHome: false, prev: row.scoreAway, now: next.away },
    ];

    // A score can fall — VAR, or the provider correcting itself. Drop the
    // goals we invented above the new score; leaving them means the match
    // timeline shows a goal that never counted.
    const retracted = sides.flatMap((side) =>
      retractedGoalTallies(side.prev, side.now).map(
        (tally) => `derived:${row.id}:${side.isHome ? 'h' : 'a'}:${tally}`,
      ),
    );
    if (retracted.length > 0) {
      const removed = await this.db
        .delete(matchEvents)
        .where(inArray(matchEvents.externalId, retracted))
        .returning({ externalId: matchEvents.externalId });
      if (removed.length > 0) {
        this.logger.log(
          `Retracted ${removed.length} derived goal(s) on match ${row.id} ` +
            `after the score was corrected downwards`,
        );
      }
    }

    // Nothing rose — the common case. Bail before touching the database.
    if (!sides.some((s) => newGoalTallies(s.prev, s.now, 0).length > 0)) {
      return [];
    }

    // How many goals each side already has, whatever recorded them. The
    // timeline may have got there first, with a real scorer's name.
    const stored = await this.db
      .select({ isHome: matchEvents.isHome })
      .from(matchEvents)
      .where(
        and(eq(matchEvents.matchId, row.id), eq(matchEvents.kind, 'goal')),
      );
    let recordedHome = 0;
    let recordedAway = 0;
    for (const e of stored) {
      if (e.isHome) recordedHome++;
      else recordedAway++;
    }

    const derived: MatchEvent[] = [];
    for (const side of sides) {
      const already = side.isHome ? recordedHome : recordedAway;
      for (const tally of newGoalTallies(side.prev, side.now, already)) {
        const key = `derived:${row.id}:${side.isHome ? 'h' : 'a'}:${tally}`;
        derived.push({
          // Deterministic, so repeated polls collapse on the unique index.
          id: key,
          externalId: key,
          matchId: row.id,
          teamId: side.isHome ? row.homeTeamId : row.awayTeamId,
          isHome: side.isHome,
          minute,
          stoppage: next.stoppage,
          kind: 'goal',
          scorerName: null,
          assistName: null,
          isPenalty: false,
          isOwnGoal: false,
        });
      }
    }

    if (derived.length === 0) return [];

    const fresh = await this.insertNewEvents(row.id, derived);
    if (fresh.length > 0) {
      this.events.emit('match.events', { matchId: row.id, events: fresh });
      this.logger.log(
        `Derived ${fresh.length} goal(s) from a score change on match ${row.id}`,
      );
    }
    return fresh;
  }

  /**
   * A finished match disappears from livescore.php entirely. Without this,
   * anything we last saw in play would stay 'live' in the database forever —
   * the UI would show a permanent set of ghost matches.
   *
   * So: any match we believe is in play but which is absent from the current
   * feed gets looked up individually for its final score and status.
   * Capped per cycle to protect the 30/min budget.
   */
  private async finaliseDroppedOff(liveExternalIds: string[]): Promise<number> {
    const inPlay = and(
      inArray(matches.status, ['live', 'halftime']),
      eq(matches.isReplay, false),
    );

    /*
     * First, close out anything that cannot possibly still be in play.
     *
     * Whenever the server is stopped while matches are live, those rows stay
     * 'live' forever — nothing ever observes them leaving the feed. They pile
     * up across sessions: 61 matches were showing as live here when only 8
     * actually were, and 54 of them were over an hour stale.
     *
     * Looking each one up costs an upstream request, so at 10 per cycle that
     * backlog was spending ~20 requests a minute of a ~28/min budget purely on
     * cleanup. A match is over four hours after kickoff, so close them in a
     * single UPDATE and keep the paid lookups for genuinely recent drop-offs
     * where the true final score is still worth fetching.
     */
    const abandoned = await this.db
      .update(matches)
      .set({
        status: 'finished',
        minute: null,
        stoppage: null,
        lastUpdatedAt: new Date(),
      })
      .where(and(inPlay, lt(matches.kickoff, sql`now() - interval '4 hours'`)))
      .returning({ id: matches.id });

    if (abandoned.length > 0) {
      this.logger.log(
        `Closed ${abandoned.length} abandoned match(es) by age (no upstream calls)`,
      );
    }

    const stale = await this.db
      .select({ id: matches.id, externalId: matches.externalId })
      .from(matches)
      .where(
        liveExternalIds.length
          ? and(inPlay, notInArray(matches.externalId, liveExternalIds))
          : inPlay,
      )
      .limit(10);

    let finalized = 0;
    for (const m of stale) {
      const res = await this.client.getEvent(m.externalId);
      const dto = res.events?.[0];
      if (!dto) continue;

      const mapped = mapMatch(dto);
      await this.db
        .update(matches)
        .set({
          scoreHome: mapped.scoreHome,
          scoreAway: mapped.scoreAway,
          status: mapped.status,
          minute: null,
          stoppage: null,
          lastUpdatedAt: new Date(),
        })
        .where(eq(matches.id, m.id));
      finalized++;
    }
    if (finalized > 0) {
      this.logger.log(`Finalised ${finalized} match(es) that left the feed`);
    }
    return finalized + abandoned.length;
  }
}
