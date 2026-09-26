import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MatchDetail, StreamMessage } from "@livescore/types";

export function useMatchStream(matchId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!matchId) return;

    const es = new EventSource(`/api/matches/${matchId}/stream`);

    es.onmessage = (e: MessageEvent<string>) => {
      // A malformed frame must not throw inside the handler — that would kill
      // the listener and silently stop all further updates.
      let msg: StreamMessage;
      try {
        msg = JSON.parse(e.data) as StreamMessage;
      } catch {
        console.warn("[stream] ignoring malformed frame");
        return;
      }

      switch (msg.type) {
        case "ping":
          return;

        case "snapshot":
          qc.setQueryData<MatchDetail>(["match", matchId], msg.match);
          return;

        case "update":
          qc.setQueryData<MatchDetail>(["match", matchId], (prev) =>
            prev
              ? {
                  ...prev,
                  score: msg.score,
                  status: msg.status,
                  minute: msg.minute,
                  stoppage: msg.stoppage,
                }
              : prev,
          );
          // The live list shows this match too.
          void qc.invalidateQueries({ queryKey: ["matches", "live"] });
          return;

        case "events":
          qc.setQueryData<MatchDetail>(["match", matchId], (prev) => {
            if (!prev) return prev;
            // The snapshot may already contain some of these — dedupe by id.
            const seen = new Set(prev.events.map((x) => x.id));
            const added = msg.events.filter((x) => !seen.has(x.id));
            if (added.length === 0) return prev;
            return {
              ...prev,
              events: [...prev.events, ...added].sort(
                (a, b) =>
                  a.minute - b.minute || (a.stoppage ?? 0) - (b.stoppage ?? 0),
              ),
            };
          });
          return;
      }
    };

    // EventSource reconnects on its own; log so failures aren't invisible.
    es.onerror = () => console.warn("[stream] disconnected, retrying…");

    return () => es.close();
  }, [matchId, qc]);
}
