import { useContext, useMemo } from "react";
import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import { explorersApiClient, ExplorersApiError } from "../../../lib/explorersApiClient";
import { invalidateApps } from "../../AppsAndTools/hooks/useAppsOwner";
import { invalidatePlaces } from "../../Favorites/hooks/usePlacesOwner";
import { invalidateGames } from "../../Games/hooks/useGamesOwner";
import { invalidateGuides } from "../../Guides/hooks/useGuidesOwner";
import { invalidateMovies } from "../../Movies/api/explorersAdapter";
import { invalidatePeople } from "../../People/hooks/usePeopleOwner";
import { invalidateProducts } from "../../Products/hooks/useProductsOwner";

const newKey = () => crypto.randomUUID();

/**
 * Every owner read that can hold a sample collection: each category's lists, Top Picks and
 * list detail (the per-category change events), guide and linked-list chips (Guides and Places
 * events), and React Query reads such as navigation counts. A converted or deleted sample must
 * not survive as a stale copy anywhere.
 */
export function refreshSampleCaches(queryClient?: QueryClient | null) {
  invalidateApps(); invalidatePlaces(); invalidateGames(); invalidateGuides();
  invalidateMovies(); invalidatePeople(); invalidateProducts();
  void queryClient?.invalidateQueries();
}

/** A 409/404 on Make it mine means another tab already converted (or removed) it: just refetch. */
const alreadySettled = (error: unknown) => error instanceof ExplorersApiError && (error.status === 409 || error.status === 404);

/**
 * WP11. Make it mine and Delete for one sample list. Both read a fresh owner observation first
 * (as setListStatus does), so a card that only holds an id can run them. Delete is the permanent
 * purge: a deleted sample never comes back. `onChanged` lets the caller refetch its own read.
 */
export function sampleCommands(listId: string, onChanged?: () => void, queryClient?: QueryClient | null) {
  const settle = () => { refreshSampleCaches(queryClient); onChanged?.(); };
  return {
    makeMine: async () => {
      try {
        const observed = await explorersApiClient.getMyEditableCollection(listId);
        await explorersApiClient.makeMyCollectionMine(observed, newKey());
      } catch (error) {
        if (!alreadySettled(error)) throw error;
      }
      settle();
    },
    remove: async () => {
      const observed = await explorersApiClient.getMyEditableCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, newKey());
      settle();
    },
  };
}

export function useSampleCommands(listId: string, onChanged?: () => void) {
  const queryClient = useContext(QueryClientContext) ?? null;
  return useMemo(() => sampleCommands(listId, onChanged, queryClient), [listId, onChanged, queryClient]);
}

/** Maps the server's sample publish refusal (422) onto the same guidance the pill shows. */
export function isSamplePublishRefusal(error: unknown) {
  return error instanceof ExplorersApiError && error.status === 422 && /sample/i.test(error.message);
}
