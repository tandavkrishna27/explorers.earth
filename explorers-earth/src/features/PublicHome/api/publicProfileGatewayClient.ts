import { runtimeOrigin } from "../../../lib/publicRuntimeConfig";
export type PublicCategory = "places" | "movies" | "books" | "games" | "guides" | "apps" | "products" | "people";
export type PublicProfilePage = { limit?: number; cursor?: string };

type FetchLike = typeof fetch;

type PublicProfileGatewayEnvironment = {
  VITE_PUBLIC_PROFILE_GATEWAY_URL?: string;
  VITE_LOCAL_TUNES_API_URL?: string;
};

export function resolvePublicProfileGatewayOrigin(environment: PublicProfileGatewayEnvironment): string {
  return environment.VITE_PUBLIC_PROFILE_GATEWAY_URL
    || environment.VITE_LOCAL_TUNES_API_URL
    || "https://localtunes.earth";
}

export function createPublicProfileGatewayClient(baseUrl: string, fetchImpl: FetchLike = fetch) {
  const origin = baseUrl.replace(/\/$/, "");
  const cache = new Map<string, { etag?: string; value: unknown }>();
  const categoryPath = (username: string, category: PublicCategory) =>
    `/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}`;
  const request = async (path: string, signal?: AbortSignal, bypassCache = false): Promise<unknown> => {
    const url = `${origin}${path}`;
    const cached = cache.get(url);
    const response = await fetchImpl(url, {
      // Owner-controlled visibility and pinning must not be hidden behind a
      // browser's fresh/stale HTTP response after a public-page reload. This
      // still permits conditional ETag validation and the gateway's cache.
      cache: "no-cache",
      signal,
      headers: {
        Accept: "application/json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
        ...(bypassCache ? { "Cache-Control": "no-cache" } : {}),
      },
    });
    if (response.status === 304) {
      if (cached) return cached.value;
      throw new Error("PUBLIC_PROFILE_304");
    }
    if (!response.ok) throw new Error(`PUBLIC_PROFILE_${response.status}`);
    if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
    }
    const value = await response.json();
    const etag = response.headers.get("etag") ?? undefined;
    cache.set(url, { etag, value });
    return value;
  };
  const pageQuery = (page: PublicProfilePage = {}): string => {
    const params = new URLSearchParams();
    if (page.limit !== undefined) params.set("limit", String(page.limit));
    if (page.cursor !== undefined) params.set("cursor", page.cursor);
    const query = params.toString();
    return query ? `?${query}` : "";
  };
  return {
    async shell(username: string, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}`, signal, bypassCache);
    },
    async category(username: string, category: PublicCategory, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(categoryPath(username, category), signal, bypassCache);
    },
    peekCategory(username: string, category: PublicCategory): unknown | undefined {
      return cache.get(`${origin}${categoryPath(username, category)}`)?.value;
    },
    async detail(username: string, category: PublicCategory, slug: string, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}/${encodeURIComponent(slug)}`, signal, bypassCache);
    },
    async categoryPage(username: string, category: PublicCategory, page: PublicProfilePage, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}${pageQuery(page)}`, signal, bypassCache);
    },
    async detailPage(username: string, category: PublicCategory, slug: string, page: PublicProfilePage, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}/${encodeURIComponent(slug)}${pageQuery(page)}`, signal, bypassCache);
    },
  };
}

export const publicProfileGatewayClient = createPublicProfileGatewayClient(
  // Keep the runtime boundary explicit: this project's ImportMetaEnv may not
  // declare custom VITE_* fields even though Vite exposes them at runtime.
  runtimeOrigin(resolvePublicProfileGatewayOrigin({
    VITE_PUBLIC_PROFILE_GATEWAY_URL: import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL,
    VITE_LOCAL_TUNES_API_URL: import.meta.env.VITE_LOCAL_TUNES_API_URL,
  })),
);
