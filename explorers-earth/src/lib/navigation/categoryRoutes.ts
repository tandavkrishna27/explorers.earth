/** Seven non-Places categories (Places joins the shared route in WP6). */
export type CategoryKey = "movies" | "books" | "games" | "apps" | "products" | "people" | "guides";

export type CategoryRoute = {
  key: CategoryKey;
  /** i18n key for the category label used by Back ("Back to Movies & Shows"). */
  labelKey: `dashboard.wp1.back.categories.${CategoryKey}`;
  listParam: ":listId" | ":guideId";
  /** Path segment(s) after the list id for the add page; null when not a simple suffix. */
  addSuffix: string | null;
};

export const CATEGORY_ROUTES: readonly CategoryRoute[] = Object.freeze([
  { key: "movies", labelKey: "dashboard.wp1.back.categories.movies", listParam: ":listId", addSuffix: "add" },
  { key: "books", labelKey: "dashboard.wp1.back.categories.books", listParam: ":listId", addSuffix: "add" },
  { key: "games", labelKey: "dashboard.wp1.back.categories.games", listParam: ":listId", addSuffix: "add" },
  { key: "apps", labelKey: "dashboard.wp1.back.categories.apps", listParam: ":listId", addSuffix: "add" },
  { key: "products", labelKey: "dashboard.wp1.back.categories.products", listParam: ":listId", addSuffix: "add" },
  { key: "people", labelKey: "dashboard.wp1.back.categories.people", listParam: ":listId", addSuffix: "add" },
  { key: "guides", labelKey: "dashboard.wp1.back.categories.guides", listParam: ":guideId", addSuffix: "sections/new" },
]);

const byKey = (key: CategoryKey): CategoryRoute => {
  const route = CATEGORY_ROUTES.find(c => c.key === key);
  if (!route) throw new Error(`Unknown category ${key}`);
  return route;
};

export const categoryPath = (key: CategoryKey): string => `/recommendations/${byKey(key).key}`;
export const listPath = (key: CategoryKey, listId: string): string => `${categoryPath(key)}/${encodeURIComponent(listId)}`;
export const addItemPath = (key: CategoryKey, listId: string): string =>
  `${listPath(key, listId)}/${byKey(key).addSuffix ?? "add"}`;
export const categoryLabelKey = (key: CategoryKey) => byKey(key).labelKey;
