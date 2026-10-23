import { useContext, useMemo } from "react";
import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import { explorersApiClient, ExplorersApiError } from "../../../lib/explorersApiClient";

const newKey = () => crypto.randomUUID();

/**
 * Every owner read that can hold a sample collection: each category's lists, Top Picks and
 * list detail (the per-category change events), guide and linked-list chips (Guides and Places
 * events), and React Query reads such as navigation counts. A converted or deleted sample must
 * not survive as a stale copy anywhere.
 */
// Loaded lazily so a category's import closure (e.g. the Books Strapi boundary) never gains the
// other categories' modules; by the time a sample command runs they are already loaded.
export async function refreshSampleCaches(queryClient?: QueryClient | null) {
  void queryClient?.invalidateQueries();
  const [apps, places, games, guides, movies, people, products] = await Promise.all([
    import("../../AppsAndTools/hooks/useAppsOwner"), import("../../Favorites/hooks/usePlacesOwner"),
    import("../../Games/hooks/useGamesOwner"), import("../../Guides/hooks/useGuidesOwner"),
    import("../../Movies/api/explorersAdapter"), import("../../People/hooks/usePeopleOwner"),
    import("../../Products/hooks/useProductsOwner"),
  ]);
  apps.invalidateApps(); places.invalidatePlaces(); games.invalidateGames(); guides.invalidateGuides();
  movies.invalidateMovies(); people.invalidatePeople(); products.invalidateProducts();
}

/** A 409/404 on Make it mine means another tab already converted (or removed) it: just refetch. */
const alreadySettled = (error: unknown) => error instanceof ExplorersApiError && (error.status === 409 || error.status === 404);

/**
 * WP11. Make it mine and Delete for one sample list. Both read a fresh owner observation first
 * (as setListStatus does), so a card that only holds an id can run them. Delete is the permanent
 * purge: a deleted sample never comes back. `onChanged` lets the caller refetch its own read.
 */
export function sampleCommands(listId: string, onChanged?: () => void, queryClient?: QueryClient | null) {
  const settle = async () => { onChanged?.(); await refreshSampleCaches(queryClient); };
  return {
    /** Converts in place; when `name` differs from `currentTitle`, renames through the ordinary update. */
    makeMine: async (name?: string, currentTitle?: string) => {
      try {
        const observed = await explorersApiClient.getMyEditableCollection(listId);
        await explorersApiClient.makeMyCollectionMine(observed, newKey());
      } catch (error) {
        if (!alreadySettled(error)) throw error;
      }
      try {
        const title = name?.trim();
        if (title && title !== currentTitle) {
          const converted = await explorersApiClient.getMyEditableCollection(listId);
          await explorersApiClient.updateMyCollection(converted, { title }, newKey());
        }
      } finally {
        await settle();
      }
    },
    remove: async () => {
      const observed = await explorersApiClient.getMyEditableCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, newKey());
      await settle();
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
