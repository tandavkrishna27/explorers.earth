import { placeListPath } from "../../Favorites/placeListRoute";

export const CATEGORY_KEYS = ["places", "movies", "books", "games", "apps", "products", "people", "guides"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type ItemTopPickCategory = "movies" | "books" | "games" | "apps" | "products" | "people";
export type TopPicksMode = "items" | "lists";

export interface CategoryConfig {
  key: CategoryKey;
  topPicks: TopPicksMode;
  pinLimit: number;
  visibilityField: "public_recommendations" | "public_movie" | "public_books" | "public_games" | "public_apps" | "public_products" | "public_people" | "public_guides";
  /** Covers on cards: portrait posters, landscape place photos, square logos. */
  coverShape: "portrait" | "landscape" | "square";
  listRoute: (id: string) => string;
}

const items = (key: ItemTopPickCategory, visibilityField: CategoryConfig["visibilityField"], coverShape: CategoryConfig["coverShape"]): CategoryConfig => ({
  key, topPicks: "items", pinLimit: 15, visibilityField, coverShape, listRoute: (id) => `/recommendations/${key}/${id}`,
});

export const CATEGORY_CONFIG: Record<CategoryKey, CategoryConfig> = {
  // WP0B's Places deep link (features/Favorites/placeListRoute.ts): /recommendations/places?list=<id>.
  places: { key: "places", topPicks: "lists", pinLimit: 5, visibilityField: "public_recommendations", coverShape: "landscape", listRoute: (id) => placeListPath(id) },
  movies: items("movies", "public_movie", "portrait"),
  books: items("books", "public_books", "portrait"),
  games: items("games", "public_games", "portrait"),
  apps: items("apps", "public_apps", "square"),
  products: items("products", "public_products", "square"),
  people: items("people", "public_people", "square"),
  guides: { key: "guides", topPicks: "lists", pinLimit: 5, visibilityField: "public_guides", coverShape: "landscape", listRoute: (id) => `/guides/${id}` },
};

export const isItemCategory = (key: CategoryKey): key is ItemTopPickCategory => CATEGORY_CONFIG[key].topPicks === "items";
