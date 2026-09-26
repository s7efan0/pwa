/**
 * Partial DTO for eventsround.php / lookupevent.php.
 * The API returns ~48 fields; these are the ones we consume.
 * Everything is a string or null — that is the provider's actual wire format.
 */
export type TsdbEventDto = {
  idEvent: string;
  idLeague: string | null;
  strLeague: string | null;
  strLeagueBadge: string | null;
  strSeason: string | null;
  intRound: string | null;
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
  strPostponed: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
};

/** eventsround.php returns null — not [] — for a round with no fixtures. */
export type TsdbEventsResponse = { events: TsdbEventDto[] | null };
