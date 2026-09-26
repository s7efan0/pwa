import type { CompetitionId } from "./common";

export interface Competition {
  id: CompetitionId;
  /** TheSportsDB idLeague, e.g. "4331". Upsert key — how we recognise this
   *  league on the next poll. Never exposed to the frontend. */
  externalId: string;
  name: string;
  /** TheSportsDB season format, e.g. "2025-2026". */
  season: string;
  badgeUrl: string | null;
}
