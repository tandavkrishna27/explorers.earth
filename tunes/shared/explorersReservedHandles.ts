/**
 * Handles no account may hold: they collide with an SPA route or a retired one. The one
 * list both sides read - the account write, the public availability check and the SPA's
 * onboarding validator. Before this the server and the SPA kept separate lists, the SPA's
 * missed 14 of these, and a creator could pick "music", pass five onboarding steps, upload
 * two images and only then get a 422 from the final write. P5-2.
 *
 * "music" stays reserved after the Music product's removal (P3): /music was a public route,
 * and a handle equal to it would shadow old links.
 */
export const RESERVED_HANDLES = Object.freeze([
  "api", "auth", "login", "logout", "signup", "onboarding", "profile", "settings",
  "recommendations", "favorites", "music", "books", "movies", "games", "apps", "products", "people", "places",
  "guides", "claimaccount", "home", "reactivate", "admin", "assets",
] as const);

const reserved: ReadonlySet<string> = new Set(RESERVED_HANDLES);

export function isReservedHandle(handle: string): boolean {
  return reserved.has(handle.trim().toLowerCase());
}
