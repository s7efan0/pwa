import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { followedMatchIds, pushSupported } from "@/lib/push";

/**
 * Which matches this browser is following, shared by every follow control.
 *
 * One query for the whole page: a bell per row each fetching its own state
 * would be a request per match. The key matches MatchPage's, so TanStack
 * dedupes them and a toggle anywhere refreshes all of them at once.
 */
export function useFollowing() {
  const qc = useQueryClient();
  const supported = pushSupported();

  const { data } = useQuery({
    queryKey: ["push", "following"],
    queryFn: followedMatchIds,
    enabled: supported,
    staleTime: 60_000,
  });

  const following = useMemo(() => new Set(data ?? []), [data]);

  return {
    supported,
    following,
    refresh: () => qc.invalidateQueries({ queryKey: ["push", "following"] }),
  };
}
