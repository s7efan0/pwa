import type { MatchId } from "./common";
import type { MatchEvent } from "./event";
import type { MatchDetail } from "./api";
import type { MatchStatus, Score } from "./match";

/**
 * Everything that can travel over a match stream. A discriminated union so
 * the client's handler is exhaustive — and so adding a message kind later
 * breaks the client at compile time rather than being silently ignored.
 */
export type StreamMessage =
  /** Sent once on connect, so a late subscriber isn't left with a blank page. */
  | { type: "snapshot"; match: MatchDetail }
  | { type: "events"; matchId: MatchId; events: MatchEvent[] }
  | {
      type: "update";
      matchId: MatchId;
      score: Score | null;
      status: MatchStatus;
      minute: number | null;
      stoppage: number | null;
    }
  /** Keepalive. Idle connections get closed by proxies and phone radios. */
  | { type: "ping" };
