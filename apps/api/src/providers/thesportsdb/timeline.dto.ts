/**
 * One entry from lookuptimeline.php.
 *
 * Naming convention across this folder:
 *   ...Dto      = a single record
 *   ...Response = the envelope the API wraps records in
 */
export type TsdbTimelineDto = {
  idTimeline: string | null;
  idEvent: string | null;
  strTimeline: string | null;
  strTimelineDetail: string | null;
  strHome: string | null;
  idPlayer: string | null;
  strPlayer: string | null;
  idAssist: string | null;
  strAssist: string | null;
  intTime: string | null;
  strPeriod: string | null;
  idTeam: string | null;
  strTeam: string | null;
};

/** lookuptimeline.php returns null — not [] — when a match has no events. */
export type TsdbTimelineResponse = { timeline: TsdbTimelineDto[] | null };
