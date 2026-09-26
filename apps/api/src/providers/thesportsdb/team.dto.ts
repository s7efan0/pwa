/**
 * Partial DTO for lookup_all_teams.php.
 * The API returns ~50 fields (fanart, social links, colours); we consume these.
 * Promote more deliberately if the UI ever needs them.
 */
export type TsdbTeamDto = {
  idTeam: string;
  idLeague: string | null;
  strTeam: string | null;
  strTeamShort: string | null;
  strTeamAlternate: string | null;
  strBadge: string | null;
  strStadium: string | null;
  strCountry: string | null;
};

export type TsdbTeamsResponse = { teams: TsdbTeamDto[] | null };
