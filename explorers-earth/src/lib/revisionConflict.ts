// A save that loses the optimistic-lock race, or that was composed against a view the
// server has since moved past, is not a generic failure. The owner needs to hear that it
// was changed elsewhere and be offered a reload; everything else keeps its own message.
//
// Duck-typed on purpose: explorersApiClient imports this module, so importing
// ExplorersApiError here would be a cycle.
export const REVISION_CONFLICT_EVENT = "explorers:revision-conflict";

// Conflicts that are not about a stale revision: a taken handle or slug, a replayed
// idempotency key, a cancelled command or a changed session. A reload would not help them.
const OTHER_CONFLICT = /handle|slug|key has already|existing resource|cancel|owner changed|deletion|unavailable/i;

export function isRevisionConflict(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const { status, code, message } = error as { status?: unknown; code?: unknown; message?: unknown };
  if (status === 412) return true;
  if (status !== 409) return false;
  if (code !== "CONFLICT" && code !== "REVISION_CONFLICT") return false;
  return !(typeof message === "string" && OTHER_CONFLICT.test(message));
}

let lastAnnounced = 0;
/** Milliseconds since a revision conflict was last announced (Infinity if never). */
export function sinceRevisionConflict(): number {
  return lastAnnounced === 0 ? Number.POSITIVE_INFINITY : Date.now() - lastAnnounced;
}

/**
 * Tells the app shell a save lost to a newer version. Returns the error so a throw site
 * can write `throw announceRevisionConflict(error)`; non-conflicts pass through untouched.
 */
export function announceRevisionConflict<T>(error: T): T {
  if (isRevisionConflict(error) && typeof window !== "undefined") {
    lastAnnounced = Date.now();
    window.dispatchEvent(new CustomEvent(REVISION_CONFLICT_EVENT));
  }
  return error;
}
