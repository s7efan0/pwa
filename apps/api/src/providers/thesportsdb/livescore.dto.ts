/**
 * One entry from livescore.php?s=Soccer — a match currently in play.
 *
 * NOTE: this endpoint only lists matches that are in play *right now*.
 * Finished matches drop off it entirely, so events must be persisted as
 * they are observed; there is no way to backfill from here.
 */
export type TsdbLiveScoreDto = {
  idLiveScore: string;
  idEvent: string | null;
  idLeague: string | null;
  strLeague: string | null;
  idHomeTeam: string | null;
  idAwayTeam: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strProgress: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
  updated: string | null;
};

/** The response key is `livescore`, not `livescores` or `liveMatches`. */
export type TsdbLiveScoreResponse = { livescore: TsdbLiveScoreDto[] | null };
