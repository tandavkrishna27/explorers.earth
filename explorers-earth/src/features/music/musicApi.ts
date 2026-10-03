import { runtimeOrigin } from "../../lib/publicRuntimeConfig";
import { createLocalTunesApiClient, type LocalTunesApiClient } from "../../lib/localTunesApiClient";
import useAuthStore from "../../store/store";
import { createMusicIdentityCoordinator } from "./musicIdentityCoordinator";
import { createMusicDevelopmentFetch } from "./musicDevelopmentTransport";

const musicOrigin = runtimeOrigin(import.meta.env.VITE_LOCAL_TUNES_API_URL || "https://localtunes.earth");

let client: LocalTunesApiClient | undefined;
let authority: string | undefined;

// Optional Music configuration must not prevent unrelated routes from mounting.
// Validation remains fail-closed, but runs when Music is actually requested.
function getClient(): LocalTunesApiClient {
  if (!client) {
    client = createLocalTunesApiClient({
      baseUrl: musicOrigin,
      fetchImpl: createMusicDevelopmentFetch(fetch, import.meta.env.DEV, musicOrigin),
      getStrapiBearer: async () => useAuthStore.getState().token ?? undefined,
    });
    client.setAuthority(authority);
  }
  return client;
}

export const musicApi: LocalTunesApiClient = {
  setAuthority(subject) { authority = subject; client?.setAuthority(subject); },
  async ensureIdentity() { return getClient().ensureIdentity(); },
  async refreshIdentity() { return getClient().refreshIdentity(); },
  async request(input) { return getClient().request(input); },
  logout() { authority = undefined; client?.logout(); },
};

export const musicIdentityCoordinator = createMusicIdentityCoordinator({
  ensureIdentity: () => musicApi.ensureIdentity(),
});

export function musicJson<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  return musicApi.request({ method, path, body, idempotencyKey }).then(async (response) => {
    if (response.ok) return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    throw new Error("Music request failed.");
  });
}
