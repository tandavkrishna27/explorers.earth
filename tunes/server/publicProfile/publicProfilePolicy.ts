export const PUBLIC_RECOMMENDATION_CATEGORIES = [
  "places", "movies", "books", "games", "guides", "apps", "products", "people",
] as const;

export type PublicCategory = (typeof PUBLIC_RECOMMENDATION_CATEGORIES)[number];

const visibilityField: Record<PublicCategory, string> = {
  places: "public_recommendations", movies: "public_movie", books: "public_books",
  games: "public_games", guides: "public_guides", apps: "public_apps",
  products: "public_products", people: "public_people",
};

export function parsePublicCategory(value: string): PublicCategory {
  if ((PUBLIC_RECOMMENDATION_CATEGORIES as readonly string[]).includes(value)) return value as PublicCategory;
  throw new Error("PUBLIC_CATEGORY_INVALID");
}

export function canReadPublicCategory(account: Record<string, unknown>, category: PublicCategory): boolean {
  return account.public_profile === "Yes" && account[visibilityField[category]] === "Yes";
}
