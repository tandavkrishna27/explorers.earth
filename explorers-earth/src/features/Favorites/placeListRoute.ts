/**
 * OWN-05. Which Places list is open is part of the URL, not only of the city store, so
 * a return from add/edit/linked pages and a click on Home land on that list.
 * WP6 moved Places onto the shared list page at `/recommendations/places/<listId>`; the
 * old `?list=<id>` deep link still works (pages/Favorites.tsx redirects it).
 */
export const PLACE_LIST_PARAM = "list";

export function placeListPath(listId: string | null | undefined): string {
  return listId ? `/recommendations/places/${encodeURIComponent(listId)}` : "/recommendations/places";
}
