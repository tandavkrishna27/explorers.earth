import { afterEach, expect, it, vi } from "vitest";

// Ticket 6.1 / package M2 — the failing startup regression required before any
// implementation. ADR-006 (Accepted 2026-10-05) supersedes ADR-005's bodyless
// proof boundary: Music owner provisioning is reached through a canonical route
// that consumes requireActor and the canonical session cookie, takes its subject
// from the server-side Actor, and accepts no Strapi-issued proof or Explorer
// bearer.
//
// These cases are expected to FAIL against current source, and to fail for the
// right reason. Today `store.acceptVerified` sets token: null (store.ts), which
// musicApi feeds to getStrapiBearer, which localTunesApiClient treats as a
// missing proof — so startup throws "proof unavailable" and surfaces
// MusicClientError("AUTH_UNAVAILABLE", 503) before any request is made. That is
// the defect: Music 503s before it ever reaches a dashboard.
//
// Do not make these pass by minting a fixture proof, repopulating the store token,
// or restoring the legacy exchange behind a development shim. ADR-006 forbids all
// three explicitly.

const CANONICAL_ENSURE = "/api/explorers/v1/music/identity/ensure";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

async function canonicalStartup(fetchImpl: typeof fetch) {
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "https://music.example");
  vi.stubEnv("DEV", false);
  vi.stubGlobal("fetch", fetchImpl);
  const [{ musicApi }, { default: store }, credentials] = await Promise.all([
    import("../musicApi"), import("../../../store/store"), import("../../../lib/musicCredentialStore"),
  ]);
  credentials.clearMusicCredential();
  // Exactly what canonical verification produces: an authenticated account with
  // no browser-held token. This is the contract, not a defect to repair.
  const generation = store.getState().beginVerification();
  store.getState().acceptVerified(generation, {
    id: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", userId: "auth-user-a",
    username: "owner-a", email: "owner-a@example.com", onboardingStatus: "complete",
  } as never);
  expect(store.getState().token).toBeNull();
  return { musicApi, store, credentials };
}

function credentialResponse() {
  return new Response(JSON.stringify({
    version: "music-identity/v1",
    identity: { musicUserId: 41, status: "active" },
    credential: { token: "canonical.music.a", expiresAt: Date.now() + 600_000 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

it("initializes the Music owner over the canonical session route when the store holds no token", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(credentialResponse());
  const { musicApi } = await canonicalStartup(transport);

  // ensureIdentity is Promise<void>: resolving at all is the assertion.
  await expect(musicApi.ensureIdentity()).resolves.toBeUndefined();

  expect(transport).toHaveBeenCalled();
  const [input, init] = transport.mock.calls[0]!;
  expect(String(input)).toContain(CANONICAL_ENSURE);
  expect(init?.method).toBe("POST");
  // Cookie authority, not a bearer. The subject comes from the server-side Actor,
  // so the client must not send an account identifier of its own.
  expect(init?.credentials).toBe("include");
  expect(Object.keys(init?.headers ?? {}).map((key) => key.toLowerCase())).not.toContain("authorization");
  expect(init?.body ?? "").not.toContain("6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411");
});

it("requires no Strapi configuration or Strapi request to start Music", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(credentialResponse());
  const { musicApi } = await canonicalStartup(transport);

  // ensureIdentity is Promise<void>: resolving at all is the assertion.
  await expect(musicApi.ensureIdentity()).resolves.toBeUndefined();

  for (const [input] of transport.mock.calls) {
    expect(String(input)).not.toMatch(/strapi|:1337|\/api\/users\/me/i);
  }
  // The legacy exchange must not be reachable at all, not merely unused.
  expect(transport.mock.calls.some(([input]) => String(input).includes("/api/music/identity/ensure")
    && !String(input).includes(CANONICAL_ENSURE))).toBe(false);
});

it("issues no credential when the canonical session is not an eligible Music owner", async () => {
  for (const status of [401, 403, 404, 409] as const) {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status, headers: { "content-type": "application/json" } }),
    );
    const { musicApi, credentials } = await canonicalStartup(transport);

    const error = await musicApi.ensureIdentity().then(() => undefined, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    // The rejection must come from the server refusing an ineligible owner, not
    // from the client giving up before it asks. Without this the case would pass
    // vacuously today, since startup currently fails with AUTH_UNAVAILABLE before
    // any request is made — a test that passes because the feature is absent.
    expect(transport).toHaveBeenCalled();
    expect((error as { code?: string }).code).not.toBe("AUTH_UNAVAILABLE");
    // No credential may be retained for a wrong, ambiguous, foreign or suspended
    // owner, and no workspace data may be fetched on the back of one.
    expect(credentials.getMusicCredential(Date.now())).toBeUndefined();
    vi.resetModules();
  }
});
