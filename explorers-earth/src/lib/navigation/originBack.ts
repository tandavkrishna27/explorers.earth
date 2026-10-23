/**
 * Back always returns to the origin (GL-03).
 * Order: router state.from (in-app navigation; survives a browser refresh because
 * BrowserRouter keeps it in window.history.state) -> a safe ?redirectBack= (linked
 * pages) -> the caller's fallback (deep links).
 */
export type Origin = { pathname: string; search?: string; label?: string };
export type OriginState = { from: Origin };
export type BackTarget = { to: string; label: string | undefined; source: "state" | "redirectBack" | "fallback" };

export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f]/.test(value);
}

export function withOrigin<T extends Record<string, unknown>>(
  location: { pathname: string; search?: string },
  label: string,
  extra?: T,
): (T & OriginState) | OriginState {
  const from: Origin = { pathname: location.pathname, search: location.search ?? "", label };
  return extra ? { ...extra, from } : { from };
}

export function readOrigin(state: unknown): Origin | null {
  if (!state || typeof state !== "object") return null;
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== "object") return null;
  const { pathname, search, label } = from as Record<string, unknown>;
  if (!isSafeInternalPath(pathname)) return null;
  const safeSearch = typeof search === "string" && (search === "" || search.startsWith("?")) ? search : "";
  return { pathname, search: safeSearch, label: typeof label === "string" && label.trim() ? label : undefined };
}

export function resolveBack(input: {
  state: unknown;
  search: string;
  currentPathname: string;
  fallback: { to: string; label: string };
}): BackTarget {
  const { state, search, currentPathname, fallback } = input;
  const origin = readOrigin(state);
  if (origin && origin.pathname !== currentPathname) {
    return { to: `${origin.pathname}${origin.search ?? ""}`, label: origin.label, source: "state" };
  }
  const redirectBack = new URLSearchParams(search).get("redirectBack");
  if (isSafeInternalPath(redirectBack) && redirectBack.split("?")[0] !== currentPathname) {
    return { to: redirectBack, label: undefined, source: "redirectBack" };
  }
  return { to: fallback.to, label: fallback.label, source: "fallback" };
}
