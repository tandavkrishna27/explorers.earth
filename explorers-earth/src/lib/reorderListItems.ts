import { assertCompleteMyCategoryContent, explorersApiClient, ExplorersApiError } from './explorersApiClient';

export type ReorderableItemCategory = 'places' | 'movies' | 'books' | 'games' | 'apps' | 'products' | 'people';

/**
 * Writes the complete new order of the recommendations in one of the owner's lists.
 *
 * The order is composed against a fresh complete read of the category, so the revision the
 * server checks is the one the owner is looking at now; a list edited elsewhere in the
 * meantime is refused with a conflict rather than overwritten. The command is a single
 * transaction on the server, so the stored positions stay dense and unique.
 */
export async function reorderListItems(category: ReorderableItemCategory, listId: string, orderedRecommendationIds: string[], signal?: AbortSignal) {
  const observed = await explorersApiClient.getCompleteMyCategoryContent({ category, status: 'active' }, signal);
  assertCompleteMyCategoryContent(observed);
  if (observed.category !== category) throw new ExplorersApiError(409, 'CONFLICT', 'The list changed. Refresh before reordering.');
  try {
    return await explorersApiClient.reorderMyCollection(observed, listId, orderedRecommendationIds, crypto.randomUUID(), signal);
  } catch (failure) {
    if (failure instanceof ExplorersApiError && (failure.status === 409 || failure.status === 422)) {
      throw new ExplorersApiError(failure.status, failure.code, 'This list was changed somewhere else. It has been reloaded; try moving the item again.');
    }
    throw failure;
  }
}
