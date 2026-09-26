import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  Competition,
  CompetitionStats,
  MatchDetail,
  MatchEvent,
  MatchSummary,
  StandingsRow,
  Team,
} from '@livescore/types';
import { DRIZZLE, type Database } from '../db/db.module';
import { competitions, matchEvents, matches, teams } from '../db/schema';
import { computeStandings } from './standings';

type TeamRow = typeof teams.$inferSelect;
type MatchRow = typeof matches.$inferSelect;
type EventRow = typeof matchEvents.$inferSelect;

@Injectable()
export class ApiService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private toTeam(r: TeamRow): Team {
    return {
      id: r.id,
      externalId: r.externalId,
      name: r.name,
      shortName: r.shortName,
      badgeUrl: r.badgeUrl,
    };
  }

  private toSummary(
    m: MatchRow & { homeTeam: TeamRow; awayTeam: TeamRow },
  ): MatchSummary {
    return {
      id: m.id,
      competitionId: m.competitionId,
      round: m.round,
      kickoff: m.kickoff.toISOString(),
      status: m.status,
      minute: m.minute,
      stoppage: m.stoppage,
      // null and 0-0 are different states — preserve that distinction.
      score:
        m.scoreHome === null || m.scoreAway === null
          ? null
          : { home: m.scoreHome, away: m.scoreAway },
      halfTimeScore:
        m.htHome === null || m.htAway === null
          ? null
          : { home: m.htHome, away: m.htAway },
      homeTeam: this.toTeam(m.homeTeam),
      awayTeam: this.toTeam(m.awayTeam),
    };
  }

  private toEvent(e: EventRow): MatchEvent {
    const base = {
      id: e.id,
      externalId: e.externalId,
      matchId: e.matchId,
      teamId: e.teamId ?? '',
      isHome: e.isHome,
      minute: e.minute,
      stoppage: e.stoppage,
    };
    switch (e.kind) {
      case 'goal':
        return {
          ...base,
          kind: 'goal',
          scorerName: e.scorerName,
          assistName: e.assistName,
          isPenalty: e.isPenalty ?? false,
          isOwnGoal: e.isOwnGoal ?? false,
        };
      case 'card':
        return {
          ...base,
          kind: 'card',
          card: e.card ?? 'yellow',
          playerName: e.playerName,
        };
      default:
        return {
          ...base,
          kind: 'substitution',
          playerInName: e.playerInName,
          playerOutName: e.playerOutName,
        };
    }
  }

  async listCompetitions(): Promise<Competition[]> {
    // Only tracked competitions: the poller creates a row for every league it
    // sees in play so those matches can be displayed, but those have no
    // rounds and therefore no meaningful table or statistics.
    const rows = await this.db
      .select()
      .from(competitions)
      .where(eq(competitions.isTracked, true))
      .orderBy(competitions.name);
    return rows.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      name: c.name,
      season: c.season,
      badgeUrl: c.badgeUrl,
    }));
  }

  async getMatchesByRound(competitionId: string, round: number) {
    const rows = await this.db.query.matches.findMany({
      where: and(
        eq(matches.competitionId, competitionId),
        eq(matches.round, round),
        // A replay clone keeps its source's round and would appear twice.
        eq(matches.isReplay, false),
      ),
      with: { homeTeam: true, awayTeam: true },
      orderBy: matches.kickoff,
    });
    return rows.map((m) => this.toSummary(m));
  }

  async getLiveMatches() {
    const rows = await this.db.query.matches.findMany({
      where: inArray(matches.status, ['live', 'halftime']),
      with: { homeTeam: true, awayTeam: true },
      orderBy: matches.kickoff,
    });
    return rows.map((m) => this.toSummary(m));
  }

  async getMatch(id: string): Promise<MatchDetail | null> {
    const m = await this.db.query.matches.findFirst({
      where: eq(matches.id, id),
      with: { homeTeam: true, awayTeam: true, events: true },
    });
    if (!m) return null;
    return {
      ...this.toSummary(m),
      events: m.events
        .map((e) => this.toEvent(e))
        .sort(
          (a, b) =>
            a.minute - b.minute || (a.stoppage ?? 0) - (b.stoppage ?? 0),
        ),
    };
  }

  async getStandings(competitionId: string): Promise<StandingsRow[]> {
    const rows = await this.db.query.matches.findMany({
      // Replays are clones of real fixtures with the same teams, competition
      // and final status — counting them gives the replayed sides a phantom
      // extra result and silently corrupts the table mid-demo.
      where: and(
        eq(matches.competitionId, competitionId),
        eq(matches.isReplay, false),
      ),
      with: { homeTeam: true, awayTeam: true },
    });
    return computeStandings(
      rows.map((m) => ({
        homeTeam: this.toTeam(m.homeTeam),
        awayTeam: this.toTeam(m.awayTeam),
        scoreHome: m.scoreHome,
        scoreAway: m.scoreAway,
        status: m.status,
      })),
    );
  }

  async getStats(competitionId: string): Promise<CompetitionStats> {
    const [totals] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
        goals: sql<number>`coalesce(sum(${matches.scoreHome} + ${matches.scoreAway}), 0)::int`,
      })
      .from(matches)
      .where(
        and(
          eq(matches.competitionId, competitionId),
          eq(matches.status, 'finished'),
          eq(matches.isReplay, false),
        ),
      );

    // Goals per matchday, from SCORES rather than timelines — the provider
    // truncates its event feeds, so anything derived from match_events
    // undercounts. Scores are authoritative.
    const perRoundRows = await this.db
      .select({
        round: matches.round,
        goals: sql<number>`coalesce(sum(${matches.scoreHome} + ${matches.scoreAway}), 0)::int`,
        matches: sql<number>`count(*)::int`,
      })
      .from(matches)
      .where(
        and(
          eq(matches.competitionId, competitionId),
          eq(matches.status, 'finished'),
          eq(matches.isReplay, false),
        ),
      )
      .groupBy(matches.round)
      .orderBy(matches.round);

    const perRound = perRoundRows
      .filter((r) => r.round !== null)
      .map((r) => ({
        round: r.round as number,
        goals: r.goals,
        matches: r.matches,
      }));

    return {
      totalMatches: totals.matches,
      totalGoals: totals.goals,
      goalsPerMatch: totals.matches ? totals.goals / totals.matches : 0,
      perRound,
    };
  }
}
