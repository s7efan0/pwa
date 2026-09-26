import type { MatchStatus } from "@livescore/types";
import { cn } from "@/lib/utils";

function kickoffTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Status is never colour-alone: live shows a pulsing dot AND the minute,
 * everything else is plain text. Previously every status rendered in green,
 * including finished and postponed.
 */
export function MatchClock({
  status,
  minute,
  stoppage,
  kickoff,
  stale = false,
  className,
}: {
  status: MatchStatus;
  minute: number | null;
  stoppage: number | null;
  kickoff: string;
  /** True when showing cached data — a stored minute is not "now". */
  stale?: boolean;
  className?: string;
}) {
  if (stale) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>
        saved
      </span>
    );
  }

  if (status === "live" || status === "halftime") {
    const label =
      status === "halftime"
        ? "HT"
        : minute !== null
          ? `${minute}${stoppage ? `+${stoppage}` : ""}'`
          : "LIVE";
    return (
      <span
        className={cn("text-live inline-flex items-center gap-1.5", className)}
      >
        <span
          className="bg-live size-1.5 shrink-0 rounded-full motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <span className="text-xs font-medium">{label}</span>
        <span className="sr-only">in play</span>
      </span>
    );
  }

  if (status === "finished") {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>FT</span>
    );
  }

  if (status === "postponed") {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>
        Post.
      </span>
    );
  }

  // scheduled / unknown — the kickoff time is the useful thing to show, and
  // it was never displayed anywhere before.
  return (
    <span className={cn("text-muted-foreground text-xs", className)}>
      {kickoffTime(kickoff)}
    </span>
  );
}
