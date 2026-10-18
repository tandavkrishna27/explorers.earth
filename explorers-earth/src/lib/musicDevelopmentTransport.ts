export const MUSIC_DEVELOPMENT_PROXY_PREFIX = "/__localtunes";

// Matches the pre-existing owner/lifecycle Docker fixture authority contract.
// The actual browser location is required; a caller argument or runtime flag
// cannot enable cleartext transport from a deployed public origin.
function isSameOriginLocalFixture(url: URL): boolean {
  const browser = typeof globalThis.location === "undefined" ? undefined : globalThis.location;
  return url.protocol === "http:" && url.hostname === "localhost" && url.port === "55173"
    && browser?.protocol === "http:" && browser.hostname === "localhost" && browser.port === "55173"
    && browser.origin === url.origin;
}

export function normalizeMusicOrigin(value: string): string {
  const url = new URL(value);
  if ((url.protocol !== "https:" && !isSameOriginLocalFixture(url)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Music requires an HTTPS origin without embedded credentials, path, query or fragment.");
  }
  return url.origin;
}

export function resolveMusicDevelopmentProxyTarget(configuredOrigin?: string, local?: { enabled: boolean; target?: string }): string {
  if (local?.target) {
    const target = new URL(local.target);
    if (!local.enabled || !/^https?:\/\/(?:127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(local.target)
        || !["127.0.0.1", "[::1]"].includes(target.hostname)
        || !["http:", "https:"].includes(target.protocol) || target.username || target.password
        || target.pathname !== "/" || target.search || target.hash) {
      throw new Error("Local Music proxy requires explicit enablement and a literal loopback origin.");
    }
    return target.origin;
  }
  const target = new URL(configuredOrigin || "https://localtunes.earth");
  if (target.protocol !== "https:" || target.username || target.password) {
    throw new Error("Music development proxy requires an HTTPS origin without embedded credentials.");
  }
  return target.origin;
}

export function createMusicDevelopmentFetch(
  fetchImpl: typeof fetch,
  enabled: boolean,
  configuredOrigin: string,
): typeof fetch {
  return async (input, init) => {
    const authority = normalizeMusicOrigin(configuredOrigin);
    const raw = input instanceof Request ? input.url : String(input);
    const target = new URL(raw);
    if (target.origin !== authority || target.username || target.password) throw new Error("Music development proxy rejected an unexpected origin.");
    if (!enabled) return fetchImpl(input, init);
    const path = `${MUSIC_DEVELOPMENT_PROXY_PREFIX}${target.pathname}${target.search}`;
    if (input instanceof Request) {
      const merged = new Request(input, { ...init, referrerPolicy: init?.referrerPolicy ?? input.referrerPolicy });
      // A valid keepalive/no-cors Request can only have a finite body, but its
      // body getter exposes a stream. Restore bytes for those modes; retain
      // actual streaming behavior for cors/same-origin requests.
      const body = (merged.keepalive || merged.mode === "no-cors") && merged.body
        ? await merged.arrayBuffer() : merged.body;
      const options: RequestInit & { duplex?: string } = {
        method: merged.method, headers: merged.headers, body,
        credentials: merged.credentials, signal: merged.signal, cache: merged.cache,
        redirect: merged.redirect, referrer: merged.referrer, referrerPolicy: merged.referrerPolicy,
        integrity: merged.integrity, keepalive: merged.keepalive, mode: merged.mode,
        ...(merged.body ? { duplex: "half" } : {}),
      };
      return fetchImpl(new Request(new URL(path, window.location.origin), options));
    }
    return fetchImpl(path, init);
  };
}

export function resolveMusicSocketTransport(input: { development: boolean; musicOrigin: string; browserOrigin: string }) {
  const origin = normalizeMusicOrigin(input.musicOrigin);
  return input.development
    ? { origin: new URL(input.browserOrigin).origin, path: `${MUSIC_DEVELOPMENT_PROXY_PREFIX}/ws` }
    : { origin, path: "/ws" };
}
