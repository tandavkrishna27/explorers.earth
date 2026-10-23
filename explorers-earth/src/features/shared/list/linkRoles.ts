import { LIST_LINK_ROLE_SUGGESTIONS, LIST_LINK_ROLE_MAX } from "../../../../../tunes/shared/explorersListLinkContract";
import { CATEGORY_CONFIG, CATEGORY_KEYS, type CategoryKey } from "../category/categoryConfig";

/** LNK-08. Suggested roles for guides; any other label up to LIST_LINK_ROLE_MAX is allowed. */
export const roleSuggestions = LIST_LINK_ROLE_SUGGESTIONS;
export const roleMax = LIST_LINK_ROLE_MAX;

const isCategory = (value: string): value is CategoryKey => (CATEGORY_KEYS as readonly string[]).includes(value);

/** The owner page of any list, by category (Places is still `?list=`, guides `/guides/<id>`). */
export function linkedListPath(category: string, collectionId: string): string {
  return isCategory(category) ? CATEGORY_CONFIG[category].listRoute(collectionId) : `/recommendations/${category}/${collectionId}`;
}
