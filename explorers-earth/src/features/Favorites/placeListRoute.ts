/**
 * OWN-05. Which Places list is open is part of the URL, not only of the city store, so
 * a return from add/edit/linked pages and a click on Home land on that list.
 * WP6 moves Places onto `/recommendations/places/<listId>`; until then it is `?list=`.
 */
export const PLACE_LIST_PARAM = "list";

export function placeListPath(listId: string | null | undefined): string {
  return listId ? `/recommendations/places?${PLACE_LIST_PARAM}=${encodeURIComponent(listId)}` : "/recommendations/places";
}
