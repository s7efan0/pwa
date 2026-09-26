import type { StandingsRow } from '@livescore/types';
import type { Team } from '@livescore/types';

export type FinishedMatch = {
  homeTeam: Team;
  awayTeam: Team;
  scoreHome: number | null;
  scoreAway: number | null;
  status: string;
};

type Acc = Omit<StandingsRow, 'position'>;

/**
 * Compute a league table from stored results.
 * Pure and synchronous: no database, no clock — so it is trivially testable
 * and could be reused on the client to build a table while offline.
 */
export function computeStandings(matches: FinishedMatch[]): StandingsRow[] {
  const table = new Map<string, Acc>();

  const seed = (team: Team): Acc => {
    const existing = table.get(team.id);
    if (existing) return existing;
    const row: Acc = {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    };
    table.set(team.id, row);
    return row;
  };

  for (const m of matches) {
    // Only completed matches with a real scoreline count.
    if (
      m.status !== 'finished' ||
      m.scoreHome === null ||
      m.scoreAway === null
    ) {
      continue;
    }
    const home = seed(m.homeTeam);
    const away = seed(m.awayTeam);

    home.played++;
    away.played++;
    home.goalsFor += m.scoreHome;
    home.goalsAgainst += m.scoreAway;
    away.goalsFor += m.scoreAway;
    away.goalsAgainst += m.scoreHome;

    if (m.scoreHome > m.scoreAway) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.scoreHome < m.scoreAway) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  return [...table.values()]
    .map((r) => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.team.name.localeCompare(b.team.name),
    )
    .map((r, i) => ({ ...r, position: i + 1 }));
}
