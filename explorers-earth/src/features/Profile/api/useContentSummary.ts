import { useQuery } from "@tanstack/react-query";
import useAuthStore from "../../../store/store";
import { explorersApiClient } from "../../../lib/explorersApiClient";

export type HomeContentTotals = { activeLists: number; activeItems: number };

/**
 * HUB-X02. Home's counters from one server summary rather than a sum over eight category
 * lists that load at different times: undefined until the read lands, never a partial 0.
 */
export function useContentSummary() {
  const identityKey = useAuthStore((state) => state.user?.id ?? "cookie-session");
  const generation = useAuthStore((state) => state.generation);
  const summary = useQuery({
    queryKey: ["explorers-content-summary", identityKey, generation],
    queryFn: async ({ signal }) => {
      const value = await explorersApiClient.getMyContentSummary(signal);
      if (useAuthStore.getState().generation !== generation) throw new Error("Session changed");
      return value;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const totals: HomeContentTotals | undefined = summary.data
    ? summary.data.categories.reduce((sum, c) => ({ activeLists: sum.activeLists + c.activeLists, activeItems: sum.activeItems + c.activeItems }), { activeLists: 0, activeItems: 0 })
    : undefined;
  return { ...summary, totals };
}
