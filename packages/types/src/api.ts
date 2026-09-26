import type { CompetitionId, Instant, MatchId } from "./common";
import type { MatchEvent } from "./event";
import type { MatchStatus, Score } from "./match";
import type { Team } from "./team";

/** What list views need. Teams are embedded — the UI always wants names and badges. */
export interface MatchSummary {
  id: MatchId;
  competitionId: CompetitionId;
  round: number | null;
  kickoff: Instant;
  status: MatchStatus;
  minute: number | null;
  stoppage: number | null;
  score: Score | null;
  halfTimeScore: Score | null;
  homeTeam: Team;
  awayTeam: Team;
}

/** A single match page: everything above, plus the event feed. */
export interface MatchDetail extends MatchSummary {
  events: MatchEvent[];
}

/** Derived from stored results — TheSportsDB's own table endpoint caps at 5 rows. */
export interface StandingsRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface RoundGoals {
  round: number;
  goals: number;
  matches: number;
}

export interface CompetitionStats {
  totalMatches: number;
  /** From match scores — authoritative. */
  totalGoals: number;
  goalsPerMatch: number;
  /** Per matchday, derived from scores. Reliable. */
  perRound: RoundGoals[];
}