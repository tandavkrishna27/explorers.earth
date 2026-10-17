export const PUBLIC_PROFILE_INVALIDATION_VERSION = "public-profile-invalidation/v1";
export const PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY = "explorers-public-profile-invalidation/v1";
export const PUBLIC_PROFILE_INVALIDATION_SEEN_EVENT_LIMIT = 200;

const LOCAL_EVENT = "explorers-public-profile-invalidation";
const categories = [
  "public_profile", "public_recommendations", "public_music", "public_guides", "public_movie",
  "public_books", "public_games", "public_apps", "public_products", "public_people",
] as const;
const actions = ["publish", "unpublish", "pin", "unpin", "set-auto-pinning", "content-changed"] as const;

export type PublicProfileInvalidationCategory = (typeof categories)[number];
export type PublicProfileInvalidationAction = (typeof actions)[number];
export type PublicProfileInvalidation = Readonly<{
  version: typeof PUBLIC_PROFILE_INVALIDATION_VERSION;
  eventId: string;
  accountDocumentId: string;
  username: string;
  category: PublicProfileInvalidationCategory;
  action: PublicProfileInvalidationAction;
  timestamp: number;
}>;
export type PublicProfileInvalidationInput = Omit<PublicProfileInvalidation, "version" | "timestamp">;

const listeners = new Set<(event: PublicProfileInvalidation) => void>();
const seenEventIds = new Set<string>();
let channel: BroadcastChannel | undefined;
let transportStarted = false;

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function parseInvalidation(value: unknown): PublicProfileInvalidation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Partial<PublicProfileInvalidation>;
  if (event.version !== PUBLIC_PROFILE_INVALIDATION_VERSION
    || typeof event.eventId !== "string" || event.eventId.trim().length === 0
    || typeof event.accountDocumentId !== "string" || event.accountDocumentId.trim().length === 0
    || typeof event.username !== "string" || event.username.trim().length === 0
    || !isOneOf(event.category, categories) || !isOneOf(event.action, actions)
    || typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) return undefined;
  return Object.freeze({
    version: PUBLIC_PROFILE_INVALIDATION_VERSION,
    eventId: event.eventId,
    accountDocumentId: event.accountDocumentId,
    username: event.username,
    category: event.category,
    action: event.action,
    timestamp: event.timestamp,
  });
}

function receive(value: unknown) {
  const event = parseInvalidation(value);
  if (!event || seenEventIds.has(event.eventId)) return;
  seenEventIds.add(event.eventId);
  if (seenEventIds.size > PUBLIC_PROFILE_INVALIDATION_SEEN_EVENT_LIMIT) {
    const oldest = seenEventIds.values().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }
  for (const listener of listeners) listener(event);
}

function onLocal(event: Event) {
  receive((event as CustomEvent<unknown>).detail);
}

function onStorage(event: StorageEvent) {
  if (event.key !== PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY || !event.newValue) return;
  try { receive(JSON.parse(event.newValue)); } catch { /* Storage is untrusted transport input. */ }
}

function onMessage(event: MessageEvent) {
  receive(event.data);
}

function startTransport() {
  if (transportStarted || typeof window === "undefined") return;
  transportStarted = true;
  window.addEventListener(LOCAL_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY);
      channel.addEventListener("message", onMessage);
    }
  } catch { /* Storage and same-document delivery remain available. */ }
}

function stopTransport() {
  if (!transportStarted || listeners.size > 0 || typeof window === "undefined") return;
  transportStarted = false;
  window.removeEventListener(LOCAL_EVENT, onLocal);
  window.removeEventListener("storage", onStorage);
  channel?.removeEventListener("message", onMessage);
  channel?.close();
  channel = undefined;
}

/**
 * Best-effort owner invalidation only. It never authorizes a public page: every
 * consumer still fetches and validates the public gateway response itself.
 */
export function publishPublicProfileInvalidation(input: PublicProfileInvalidationInput) {
  const event = parseInvalidation({ ...input, version: PUBLIC_PROFILE_INVALIDATION_VERSION, timestamp: Date.now() });
  if (!event || typeof window === "undefined") return;
  // Dashboard writers do not subscribe themselves, but must still open the
  // cross-tab transport before publishing their confirmed save.
  startTransport();
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: event }));
  try { channel?.postMessage(event); } catch { /* Fallback storage transport is independent. */ }
  try {
    window.localStorage.setItem(PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY, JSON.stringify(event));
    window.localStorage.removeItem(PUBLIC_PROFILE_INVALIDATION_STORAGE_KEY);
  } catch { /* Storage can be disabled in privacy contexts. */ }
}

export function subscribePublicProfileInvalidation(listener: (event: PublicProfileInvalidation) => void) {
  if (typeof window === "undefined") return () => undefined;
  startTransport();
  listeners.add(listener);
  return () => { listeners.delete(listener); stopTransport(); };
}
