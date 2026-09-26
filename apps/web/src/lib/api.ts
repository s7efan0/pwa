import type {
  Competition,
  CompetitionStats,
  MatchDetail,
  MatchSummary,
  StandingsRow,
} from "@livescore/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return (await res.json()) as T;
}

export const api = {
  competitions: () => get<Competition[]>("/competitions"),
  liveMatches: () => get<MatchSummary[]>("/matches/live"),
  match: (id: string) => get<MatchDetail>(`/matches/${id}`),
  standings: (competitionId: string) =>
    get<StandingsRow[]>(`/competitions/${competitionId}/standings`),
  stats: (competitionId: string) =>
    get<CompetitionStats>(`/competitions/${competitionId}/stats`),
  round: (competitionId: string, round: number) =>
    get<MatchSummary[]>(`/competitions/${competitionId}/rounds/${round}`),
};
