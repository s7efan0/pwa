import type { EventId, MatchId, TeamId } from './common';

interface BaseEvent {
  id: EventId;
  /** TheSportsDB idTimeline. Upsert key — this is what stops you pushing
   *  the same goal twice when the poller re-reads a timeline. */
  externalId: string;
  matchId: MatchId;
  teamId: TeamId;
  isHome: boolean;
  minute: number;
  stoppage: number | null;
}

export interface GoalEvent extends BaseEvent {
  kind: 'goal';
  scorerName: string | null;
  assistName: string | null;
  isPenalty: boolean;
  isOwnGoal: boolean;
}

export interface CardEvent extends BaseEvent {
  kind: 'card';
  card: 'yellow' | 'red' | 'second-yellow';
  playerName: string | null;
}

export interface SubstitutionEvent extends BaseEvent {
  kind: 'substitution';
  playerInName: string | null;
  playerOutName: string | null;
}

export type MatchEvent = GoalEvent | CardEvent | SubstitutionEvent;

/** Compile-time exhaustiveness guard. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

/** Shared by push payloads (api) and the live feed (web). */
export function formatEvent(e: MatchEvent): string {
  const t = e.stoppage ? `${e.minute}+${e.stoppage}'` : `${e.minute}'`;
  switch (e.kind) {
    case 'goal': {
      const kind = e.isOwnGoal ? 'Own goal' : e.isPenalty ? 'Penalty' : 'Goal';
      return `${t} ${kind} — ${e.scorerName ?? 'Unknown'}`;
    }
    case 'card':
      return `${t} ${e.card === 'yellow' ? 'Yellow' : 'Red'} card — ${e.playerName ?? 'Unknown'}`;
    case 'substitution':
      return `${t} Sub — ${e.playerInName ?? '?'} on, ${e.playerOutName ?? '?'} off`;
    default: {
      /*
       * This function renders both the UI event feed and push payloads, so it
       * must never throw: `kind` is a plain text column in Postgres, and a
       * value the client doesn't know would otherwise take the whole app down
       * with it. The `never` assignment keeps compile-time exhaustiveness —
       * adding a variant without handling it here is still a build error —
       * while the runtime degrades to a usable string.
       */
      const unknown: never = e;
      const kind = (unknown as { kind?: string }).kind ?? 'event';
      return `${t} ${kind}`;
    }
  }
}