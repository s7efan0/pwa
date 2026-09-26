import type { TeamId } from "./common";

export interface Team {
  id: TeamId;
  /** TheSportsDB idTeam. Upsert key. */
  externalId: string;
  name: string;
  shortName: string | null;
  badgeUrl: string | null;
}
