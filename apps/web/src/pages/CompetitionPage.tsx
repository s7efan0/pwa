import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { GoalsPerRoundChart, PointsChart } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { TeamBadge } from "@/components/TeamBadge";
import { competitionBadge } from "@/lib/competitions";
import { Skeleton } from "@/components/ui/skeleton";

/** A single number never wants a chart — a stat tile is the right form. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 font-mono text-xl">{value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {children}
    </h2>
  );
}

export default function CompetitionPage() {
  const { id } = useParams();

  const { data: competitions } = useQuery({
    queryKey: ["competitions"],
    queryFn: api.competitions,
  });
  const competition = competitions?.find((c) => c.id === id);

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery({
    queryKey: ["stats", id],
    queryFn: () => api.stats(id!),
    enabled: !!id,
  });

  const { data: table, isError: tableError } = useQuery({
    queryKey: ["standings", id],
    queryFn: () => api.standings(id!),
    enabled: !!id,
  });

  if (statsLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading statistics">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Skeleton className="h-[70px] rounded-xl" />
          <Skeleton className="h-[70px] rounded-xl" />
          <Skeleton className="h-[70px] rounded-xl" />
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  // Data we already hold beats a failed request, so an offline visit shows the
  // saved table rather than an error.
  if (statsError && tableError && !stats && !table) {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load this competition"
        description="It may not exist, or the server is unavailable."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        {competition && (
          <TeamBadge
            url={competitionBadge(competition.externalId, competition.badgeUrl)}
            size={32}
            eager
          />
        )}
        <div>
        <h1 className="text-lg font-semibold tracking-tight text-balance">
          {competition?.name ?? "Competition"}
        </h1>
        {competition?.season && (
          <p className="text-muted-foreground text-xs">{competition.season}</p>
        )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Matches" value={String(stats?.totalMatches ?? "—")} />
        <Stat label="Goals" value={String(stats?.totalGoals ?? "—")} />
        <Stat
          label="Goals / match"
          value={stats ? stats.goalsPerMatch.toFixed(2) : "—"}
        />
      </div>

      {stats && stats.perRound.length > 0 && (
        <section>
          <SectionHeading>Goals per matchday</SectionHeading>
          <GoalsPerRoundChart perRound={stats.perRound} />
        </section>
      )}

      <section>
        <SectionHeading>Standings</SectionHeading>
        {!table?.length ? (
          <EmptyState
            icon={<BarChart3 className="size-6" />}
            title="No completed matches yet"
            description="The table appears once results are in."
          />
        ) : (
          <>
            {/* Table first: with 18 teams it is the primary artefact, and it
                is also the accessible alternative to the chart below.
                W/D/L are hidden below sm: rather than scrolling sideways. */}
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">
                League table, ordered by points then goal difference
              </caption>
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th scope="col" className="w-7 py-1 font-medium">
                    #
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Team
                  </th>
                  <th scope="col" className="w-8 py-1 text-right font-medium">
                    <abbr title="Played">P</abbr>
                  </th>
                  <th
                    scope="col"
                    className="hidden w-8 py-1 text-right font-medium sm:table-cell"
                  >
                    <abbr title="Won">W</abbr>
                  </th>
                  <th
                    scope="col"
                    className="hidden w-8 py-1 text-right font-medium sm:table-cell"
                  >
                    <abbr title="Drawn">D</abbr>
                  </th>
                  <th
                    scope="col"
                    className="hidden w-8 py-1 text-right font-medium sm:table-cell"
                  >
                    <abbr title="Lost">L</abbr>
                  </th>
                  <th scope="col" className="w-10 py-1 text-right font-medium">
                    <abbr title="Goal difference">GD</abbr>
                  </th>
                  <th scope="col" className="w-10 py-1 text-right font-medium">
                    <abbr title="Points">Pts</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.team.id} className="border-t">
                    <td className="text-muted-foreground py-1.5 text-xs">
                      {r.position}
                    </td>
                    <td className="min-w-0 py-1.5">
                      <span className="flex items-center gap-2">
                        <TeamBadge url={r.team.badgeUrl} size={20} />
                        <span className="truncate">{r.team.name}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{r.played}</td>
                    <td className="hidden py-1.5 text-right sm:table-cell">
                      {r.won}
                    </td>
                    <td className="hidden py-1.5 text-right sm:table-cell">
                      {r.drawn}
                    </td>
                    <td className="hidden py-1.5 text-right sm:table-cell">
                      {r.lost}
                    </td>
                    <td className="py-1.5 text-right">
                      {r.goalDifference > 0
                        ? `+${r.goalDifference}`
                        : r.goalDifference}
                    </td>
                    <td className="py-1.5 text-right font-semibold">
                      {r.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6">
              <SectionHeading>Points per team</SectionHeading>
              <PointsChart rows={table} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
