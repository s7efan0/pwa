import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { CalendarX, WifiOff } from "lucide-react";
import type { MatchSummary } from "@livescore/types";
import { api } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { MatchClock } from "@/components/MatchClock";
import { TeamBadge } from "@/components/TeamBadge";
import { EmptyState } from "@/components/EmptyState";
import { FollowAllButton, FollowButton } from "@/components/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TeamLine({
  name,
  badge,
  score,
  leading,
}: {
  name: string;
  badge: string | null;
  score: number | null;
  leading: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamBadge url={badge} size={22} />
      <span className={cn("truncate text-sm", leading && "font-semibold")}>
        {name}
      </span>
      <span className="ml-auto pl-2 font-mono text-sm">
        {score === null ? "" : score}
      </span>
    </div>
  );
}

function MatchRow({
  m,
  stale,
  onError,
}: {
  m: MatchSummary;
  stale: boolean;
  onError: (msg: string) => void;
}) {
  const homeLeads = !!m.score && m.score.home > m.score.away;
  const awayLeads = !!m.score && m.score.away > m.score.home;

  return (
    // The border lives on the row, not the link, so the bell sits inside the
    // same card while remaining a sibling of the anchor.
    <li className="hover:bg-secondary/60 flex items-center rounded-xl border pr-1 transition-colors">
      <Link
        to={`/match/${m.id}`}
        className="focus-visible:ring-ring flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 focus-visible:ring-3 focus-visible:outline-none"
      >
        <div className="w-12 shrink-0">
          <MatchClock
            status={m.status}
            minute={m.minute}
            stoppage={m.stoppage}
            kickoff={m.kickoff}
            stale={stale}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <TeamLine
            name={m.homeTeam.name}
            badge={m.homeTeam.badgeUrl}
            score={m.score?.home ?? null}
            leading={homeLeads}
          />
          <TeamLine
            name={m.awayTeam.name}
            badge={m.awayTeam.badgeUrl}
            score={m.score?.away ?? null}
            leading={awayLeads}
          />
        </div>
      </Link>
      <FollowButton matchId={m.id} onError={onError} />
    </li>
  );
}

export default function LivePage() {
  const online = useOnline();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["matches", "live"],
    queryFn: api.liveMatches,
    // The poller writes every 30s; match that rather than hammering.
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading matches">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    // The live list is deliberately never cached — a stored "live now" would
    // be a lie — so offline it simply has no data. That is expected, not an
    // error, and must not surface as a raw fetch failure.
    return online ? (
      <EmptyState
        tone="error"
        title="Couldn't load live matches"
        description="The server didn't respond. This will retry automatically."
      />
    ) : (
      <EmptyState
        icon={<WifiOff className="size-6" />}
        title="You're offline"
        description="Live scores need a connection, but matches you've already opened are still available."
      />
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        icon={<CalendarX className="size-6" />}
        title="No matches in play"
        description="Pick a competition above to browse the table and statistics."
      />
    );
  }

  return (
    <section aria-labelledby="live-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="live-heading"
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          Live now ({data.length})
        </h2>
        <FollowAllButton
          matchIds={data.map((m) => m.id)}
          onError={setError}
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {data.map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            stale={!online}
            onError={setError}
          />
        ))}
      </ul>
    </section>
  );
}
