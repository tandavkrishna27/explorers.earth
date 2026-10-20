import { assertCompleteMyCategoryContent, explorersApiClient, ExplorersApiError } from './explorersApiClient';
import type { ReorderableItemCategory } from './reorderListItems';

export type ReorderableListCategory = ReorderableItemCategory | 'guides';

/**
 * Writes the complete new order of the owner's lists in one category.
 *
 * scope 'display' orders every active list; scope 'pinned' orders exactly the pinned ones.
 * The write is composed against a fresh complete read, so the category revision the server
 * checks is the one the owner is looking at now, and a category edited elsewhere in the
 * meantime is refused rather than overwritten.
 */
export async function reorderCategoryLists(category: ReorderableListCategory, scope: 'display' | 'pinned', orderedCollectionIds: string[], signal?: AbortSignal) {
  const observed = await explorersApiClient.getCompleteMyCategoryContent({ category, status: 'active' }, signal);
  assertCompleteMyCategoryContent(observed);
  const changed = () => new ExplorersApiError(409, 'CONFLICT', 'Your lists were changed somewhere else. They have been reloaded; try moving the list again.');
  if (observed.category !== category) throw changed();
  if (scope === 'display') {
    const active = observed.collections.filter(list => !list.archived).map(list => list.id);
    if (active.length !== orderedCollectionIds.length || orderedCollectionIds.some(id => !active.includes(id))) throw changed();
  }
  const response = await fetch(`/api/explorers/v1/categories/${category}/lists/order`, {
    method: 'PATCH', credentials: 'include', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ expectedCategoryRevision: observed.revision, scope, orderedCollectionIds }),
  });
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    try { code = (await response.json())?.error?.code ?? code; } catch { /* body is optional */ }
    if (response.status === 409 || response.status === 422) throw new ExplorersApiError(response.status, code, changed().message);
    throw new ExplorersApiError(response.status, code, 'The lists could not be reordered. Try again.');
  }
  const body = await response.json();
  return body?.lists as { category: string; scope: string; categoryRevision: string; lists: { id: string; position: number }[] };
}
