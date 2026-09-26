import { useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFollowing } from "@/hooks/useFollowing";
import {
  followMatch,
  followMatches,
  unfollowMatch,
  unfollowMatches,
} from "@/lib/push";
import { cn } from "@/lib/utils";

type ErrorHandler = (message: string) => void;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Bell toggle for one match.
 *
 * Deliberately a sibling of the row's link rather than nested inside it:
 * a <button> inside an <a> is invalid HTML, and tapping it would otherwise
 * navigate to the match instead of subscribing.
 */
export function FollowButton({
  matchId,
  onError,
  className,
}: {
  matchId: string;
  onError?: ErrorHandler;
  className?: string;
}) {
  const { supported, following, refresh } = useFollowing();
  const [busy, setBusy] = useState(false);

  if (!supported) return null;
  const isFollowing = following.has(matchId);

  async function toggle() {
    setBusy(true);
    try {
      if (isFollowing) await unfollowMatch(matchId);
      else await followMatch(matchId);
      await refresh();
    } catch (e) {
      onError?.(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={isFollowing}
      aria-label={
        isFollowing
          ? "Stop notifications for this match"
          : "Notify me about this match"
      }
      // 44px on touch, tighter where there is a precise pointer.
      className={cn("size-11 shrink-0 sm:size-9", className)}
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : isFollowing ? (
        <BellRing className="text-live" aria-hidden="true" />
      ) : (
        <Bell className="text-muted-foreground" aria-hidden="true" />
      )}
    </Button>
  );
}

/**
 * Follow or unfollow every match currently listed, in a single request.
 *
 * Following 40 live matches one tap at a time is the thing this exists to
 * avoid; the server takes the whole set in one insert.
 */
export function FollowAllButton({
  matchIds,
  onError,
}: {
  matchIds: string[];
  onError?: ErrorHandler;
}) {
  const { supported, following, refresh } = useFollowing();
  const [busy, setBusy] = useState(false);

  if (!supported || matchIds.length === 0) return null;

  // "All" only counts as on when every listed match is followed, so the
  // button still offers to cover the ones added since you last pressed it.
  const allFollowed = matchIds.every((id) => following.has(id));

  async function toggle() {
    setBusy(true);
    try {
      if (allFollowed) await unfollowMatches(matchIds);
      else await followMatches(matchIds);
      await refresh();
    } catch (e) {
      onError?.(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={allFollowed ? "outline" : "default"}
      size="sm"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={allFollowed}
      // Same 44px touch rule as the per-match bell.
      className="h-11 shrink-0 sm:h-9"
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : allFollowed ? (
        <BellOff aria-hidden="true" />
      ) : (
        <BellRing aria-hidden="true" />
      )}
      {allFollowed ? "Stop all" : `Notify all (${matchIds.length})`}
    </Button>
  );
}
