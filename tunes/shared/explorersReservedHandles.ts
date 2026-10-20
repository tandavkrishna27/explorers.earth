/**
 * The one handle rule set. The account write (tunes), the public availability check and the
 * SPA's onboarding/profile validator all call into this file, so the three can no longer
 * disagree. Before this the SPA kept its own word list and matched it as a hyphen/digit
 * boundary pattern ("uat-owner-a" was refused, "alpha" differed) while the server only checked
 * shape + a short route list, and a creator could pick "about" and get a profile nobody could
 * reach because the SPA route wins over `/:username`. P5-2, UAT SEC-02.
 *
 * Decisions (product intent from docs/replatform-audit/schema-core-draft.md: shape rule +
 * "reserved routes validated against the application route registry"):
 *  - SHAPE: 3..30 chars, [a-z0-9-], starts with a letter, no leading/trailing hyphen, no "--",
 *    not all digits (implied by "starts with a letter").
 *  - ROUTES (RESERVED_HANDLES): exact match only. Every top-level SPA route segment and every
 *    server/nginx top-level path. `explorers-earth/src/routes/__tests__/reservedHandles.routes.test.ts`
 *    fails when a route is added without being listed here.
 *  - WORDS (RESERVED_WORDS): impersonation/system words, matched exactly or as word + digits
 *    ("admin", "admin1"). They are NOT matched as a hyphen-delimited fragment, so
 *    "uat-owner-a" and "test-kitchen" are fine; the old fragment match rejected ordinary handles.
 *    "alpha" stays reserved (exact / alpha + digits) - it is an environment name, kept as the SPA had it.
 *  - PROFANITY: whole-token match (split on non-letters), now enforced on the server too.
 */
export const RESERVED_HANDLES = Object.freeze([
  // SPA top-level routes (AppRoutes, AuthRoutes, ProtectedRoutes)
  "about", "analytics", "contact", "cookies", "email-confirmed", "email-verification", "forgot-password",
  "google-auth", "guides", "home", "hub", "login", "music", "onboarding", "privacy", "profile",
  "reactivate", "reactivate-confirm", "recommendations", "register", "reset-link-sent", "reset-password",
  "settings", "terms", "use-cases", "404",
  // Public-profile sections and retired/legacy routes
  "auth", "logout", "signup", "favorites", "books", "movies", "games", "apps", "products", "people", "places",
  "claimaccount", "admin",
  // Server / nginx top-level paths
  "api", "api-docs", "assets", "graphql", "health", "media", "robots", "sitemap", "socket", "socket.io",
  "twitch-api", "igdb-api", "runtime-config", "headers", "index", "static", "public",
] as const);

export const RESERVED_WORDS = Object.freeze([
  "admin", "administrator", "root", "system", "superuser", "sudo", "moderator",
  "user", "guest", "default", "staff", "owner", "master",
  "api", "graphql", "server", "config", "settings", "database", "db", "cache",
  "www", "ftp", "http", "https", "mail", "email", "smtp", "pop", "imap",
  "ssl", "tls", "cdn", "dns", "ip", "tcp", "udp", "ssh", "telnet",
  "support", "help", "info", "about", "terms", "privacy", "security", "policy",
  "auth", "login", "logout", "register", "signup", "signin", "password", "reset",
  "account", "profile", "dashboard", "home", "preferences",
  "follow", "like", "post", "comment", "share", "buy", "sell", "shop", "store",
  "cart", "checkout", "payment", "billing", "invoice", "order", "product",
  "active", "inactive", "enabled", "disabled", "banned", "suspended", "deleted",
  "pending", "approved", "rejected", "draft", "published",
  "file", "folder", "page", "data", "backup", "archive", "temp", "tmp",
  "upload", "download", "import", "export",
  "test", "demo", "dev", "development", "prod", "production", "staging", "beta",
  "alpha", "release", "version", "build",
  "explorers", "explorer", "qr", "code", "scan", "scanner", "places", "location", "map",
  "business", "review", "rating", "recommendation", "favorite", "bookmark",
] as const);

export const PROFANITY_WORDS = Object.freeze([
  "damn", "hell", "crap", "shit", "fuck", "bitch", "ass", "bastard",
  "piss", "cock", "dick", "pussy", "whore", "slut", "fag", "nigger",
  "retard", "gay", "lesbian", "homo", "tranny", "nazi", "hitler",
] as const);

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export type HandleRuleCode =
  | "invalidChars" | "minLength" | "maxLength" | "mustStartWithLetter" | "hyphenEdge"
  | "consecutiveHyphens" | "allNumbers" | "reserved" | "profanity";

const routes: ReadonlySet<string> = new Set(RESERVED_HANDLES);
const words: ReadonlySet<string> = new Set(RESERVED_WORDS);

/** Exact route/infra segment, or an impersonation word optionally followed by digits. */
export function isReservedHandle(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  if (routes.has(h)) return true;
  return words.has(h.replace(/[0-9]+$/, ""));
}

/** Profanity as a whole token: "bass" is fine, "ass" and "my-ass-1" are not. */
export function containsProfanity(handle: string): boolean {
  const tokens = handle.trim().toLowerCase().split(/[^a-z]+/);
  return PROFANITY_WORDS.some((word) => tokens.includes(word));
}

/** Every rule the handle breaks, in a stable order. Empty means acceptable. Input is trimmed and lower-cased. */
export function handleRuleViolations(raw: string): HandleRuleCode[] {
  const h = raw.trim().toLowerCase();
  const out: HandleRuleCode[] = [];
  if (!/^[a-z0-9-]+$/.test(h)) out.push("invalidChars");
  if (h.length < HANDLE_MIN_LENGTH) out.push("minLength");
  if (h.length > HANDLE_MAX_LENGTH) out.push("maxLength");
  if (!/^[a-z]/.test(h)) out.push("mustStartWithLetter");
  if (/^-|-$/.test(h)) out.push("hyphenEdge");
  if (h.includes("--")) out.push("consecutiveHyphens");
  if (/^[0-9]+$/.test(h)) out.push("allNumbers");
  if (isReservedHandle(h)) out.push("reserved");
  if (containsProfanity(h)) out.push("profanity");
  return out;
}

/**
 * The rules apply to a handle being CHOSEN, not to one already held: the list grows over time
 * (new routes, new words) and an existing holder must still be able to save other fields and
 * re-send their unchanged handle. Comparison is case-insensitive after trimming.
 */
export function handleViolationsOnSave(current: string | null | undefined, next: string): HandleRuleCode[] {
  const normalized = next.trim().toLowerCase();
  if (current && current.trim().toLowerCase() === normalized) return [];
  return handleRuleViolations(normalized);
}
