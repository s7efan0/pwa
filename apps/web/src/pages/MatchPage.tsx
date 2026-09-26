import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useState } from "react";
import { Bell, BellOff, Loader2, WifiOff } from "lucide-react";
import { formatEvent, type MatchEvent } from "@livescore/types";
import { api } from "@/lib/api";
import { useMatchStream } from "@/hooks/useMatchStream";
import { useOnline } from "@/hooks/useOnline";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  followMatch,
  followedMatchIds,
  isStandalone,
  pushSupported,
  unfollowMatch,
} from "@/lib/push";
import { MatchClock } from "@/components/MatchClock";
import { TeamBadge } from "@/components/TeamBadge";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function TeamSide({
  name,
  badge,
  align,
}: {
  name: string;
  badge: string | null;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-2 ${
        align === "start" ? "sm:items-end" : "sm:items-start"
      }`}
    >
      <TeamBadge url={badge} size={40} />
      <span className="line-clamp-2 text-center text-sm font-medium text-balance sm:text-base">
        {name}
      </span>
    </div>
  );
}

function EventItem({ e }: { e: MatchEvent }) {
  return (
    <li className="flex gap-3 border-b py-2 last:border-b-0">
      <span
        className={`shrink-0 text-xs ${
          e.isHome ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {e.isHome ? "H" : "A"}
      </span>
      <span className="text-sm">{formatEvent(e)}</span>
    </li>
  );
}

export default function MatchPage() {
  const online = useOnline();
  const { id } = useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => api.match(id!),
    enabled: !!id,
  });

  useMatchStream(id);
  // Keep the screen awake only while the match is actually in play.
  useWakeLock(data?.status === "live");

  // Follow state lives on the server, keyed by this browser's push endpoint —
  // so it survives reloads instead of resetting to "not following".
  const { data: followed } = useQuery({
    queryKey: ["push", "following"],
    queryFn: followedMatchIds,
    enabled: pushSupported(),
    staleTime: 60_000,
  });
  const isFollowing = !!id && !!followed?.includes(id);

  async function toggle() {
    if (!id) return;
    setBusy(true);
    setPushError(null);
    try {
      if (isFollowing) await unfollowMatch(id);
      else await followMatch(id);
      await qc.invalidateQueries({ queryKey: ["push", "following"] });
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading match">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  // Only `!data`, never `isError` on its own: a refetch that fails while we
  // still hold a saved copy must show the copy. Testing this offline, the
  // match rendered and then vanished into this error state once the retry
  // gave up — which is exactly when the saved copy matters most.
  if (!data) {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load this match"
        description={
          online
            ? "The match may have been removed, or the server is unavailable."
            : "You're offline and this match isn't saved on your device."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {!online && (
        <p
          role="status"
          className="text-muted-foreground flex items-center gap-1.5 text-xs"
        >
          <WifiOff className="size-3.5" aria-hidden="true" />
          Offline — showing the last score saved on this device.
        </p>
      )}
      <section className="rounded-xl border p-4 sm:p-6">
        <div className="mb-3 flex justify-center">
          <MatchClock
            status={data.status}
            minute={data.minute}
            stoppage={data.stoppage}
            kickoff={data.kickoff}
            stale={!online}
          />
        </div>

        {/* Three columns so the score can never wrap into the team names. */}
        <h1 className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <TeamSide
            name={data.homeTeam.name}
            badge={data.homeTeam.badgeUrl}
            align="start"
          />
          <span className="font-mono text-2xl font-semibold sm:text-4xl">
            {data.score
              ? `${data.score.home}–${data.score.away}`
              : "vs"}
          </span>
          <TeamSide
            name={data.awayTeam.name}
            badge={data.awayTeam.badgeUrl}
            align="end"
          />
        </h1>

        {data.halfTimeScore && (
          <p className="text-muted-foreground mt-3 text-center text-xs">
            Half-time {data.halfTimeScore.home}–{data.halfTimeScore.away}
          </p>
        )}
      </section>

      <section className="space-y-2">
        {pushSupported() ? (
          <>
            <Button
              onClick={() => void toggle()}
              disabled={busy}
              aria-pressed={isFollowing}
              aria-busy={busy}
              variant={isFollowing ? "outline" : "default"}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : isFollowing ? (
                <BellOff aria-hidden="true" />
              ) : (
                <Bell aria-hidden="true" />
              )}
              {busy
                ? "Working…"
                : isFollowing
                  ? "Notifications on"
                  : "Notify me about this match"}
            </Button>
            {pushError && (
              <p role="alert" className="text-destructive text-xs">
                {pushError}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            {isStandalone()
              ? "Notifications aren't supported in this browser."
              : "Add this app to your Home Screen to enable match notifications."}
          </p>
        )}
      </section>

      <section aria-labelledby="events-heading" className="space-y-2">
        <h2
          id="events-heading"
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          Match events
        </h2>
        {data.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No events recorded for this match.
          </p>
        ) : (
          // Events arrive over SSE; without a live region they appear silently
          // for screen-reader users on a live-score app.
          <ol aria-live="polite" aria-relevant="additions" className="text-sm">
            {data.events.map((e) => (
              <EventItem key={e.id} e={e} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
