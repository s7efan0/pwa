import type { CompetitionId, Instant, MatchId, TeamId } from "./common";

export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "halftime",
  "finished",
  "postponed",
  "unknown",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface Score {
  home: number;
  away: number;
}

export interface Match {
  id: MatchId;
  /** TheSportsDB idEvent. Upsert key. */
  externalId: string;
  competitionId: CompetitionId;
  /** Matchday number (intRound), null for cup ties. */
  round: number | null;
  kickoff: Instant;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** null before kickoff — 0-0 and "not started" are different things. */
  score: Score | null;
  halfTimeScore: Score | null;
  status: MatchStatus;
  /** Minutes played; null unless live. 90+2 is minute=90, stoppage=2. */
  minute: number | null;
  stoppage: number | null;
  lastUpdatedAt: Instant;
}
