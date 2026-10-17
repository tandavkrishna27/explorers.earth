import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StrapiIdentityAbsenceProof } from "../services/strapiIdentityAbsenceProof";

const identity = { userDocumentId: "user-document-a", accountDocumentId: "account-document-a" };

describe("Strapi identity absence proof", () => {
  it("forwards the GraphQL POST body through the pinned live transport", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../config/music-identity-config.ts"), "utf8");
    expect(source).toContain("request.end(init.body ?? undefined)");
  });
  it("cancels non-success and oversized streams before returning", async () => {
    for (const fixture of [
      { status: 503, chunks: [new Uint8Array([1])], expected: "outage" },
      { status: 200, chunks: [new Uint8Array(64 * 1024), new Uint8Array([1])], expected: "unknown" },
    ] as const) {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { for (const chunk of fixture.chunks) controller.enqueue(chunk); },
        cancel() { cancelled = true; },
      });
      const proof = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
        fetchImpl: async () => new Response(body, { status: fixture.status }), timeoutMs: 1_000,
      });
      await expect(proof.prove(identity)).resolves.toBe(fixture.expected);
      expect(cancelled).toBe(true);
    }
  });

  it("proves absence only when both immutable identifiers are authoritatively missing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { usersPermissionsUser: null, account: null },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const proof = new StrapiIdentityAbsenceProof({
      baseUrl: "https://strapi.example", accessToken: "read-only-service-token", fetchImpl,
      timeoutMs: 1_000,
    });

    await expect(proof.prove(identity)).resolves.toBe("absent");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://strapi.example/graphql");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ authorization: "Bearer read-only-service-token" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ variables: identity });
  });

  it("reports present if either immutable upstream record survives", async () => {
    for (const data of [
      { usersPermissionsUser: { documentId: identity.userDocumentId }, account: null },
      { usersPermissionsUser: null, account: { documentId: identity.accountDocumentId } },
      { usersPermissionsUser: { documentId: identity.userDocumentId }, account: { documentId: identity.accountDocumentId } },
    ]) {
      const proof = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
        fetchImpl: async () => new Response(JSON.stringify({ data }), { status: 200 }), timeoutMs: 1_000,
      });
      await expect(proof.prove(identity)).resolves.toBe("present");
    }
  });

  it("returns unknown for malformed or contradictory success data and outage for dependency failure", async () => {
    const malformed = new StrapiIdentityAbsenceProof({
      baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
      fetchImpl: async () => new Response(JSON.stringify({ data: {
        usersPermissionsUser: { documentId: "different-user" }, account: null,
      } }), { status: 200 }), timeoutMs: 1_000,
    });
    await expect(malformed.prove(identity)).resolves.toBe("unknown");
    const contradictoryAccount = new StrapiIdentityAbsenceProof({
      baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
      fetchImpl: async () => new Response(JSON.stringify({ data: {
        usersPermissionsUser: null, account: { documentId: "different-account" },
      } }), { status: 200 }), timeoutMs: 1_000,
    });
    await expect(contradictoryAccount.prove(identity)).resolves.toBe("unknown");

    for (const body of [
      "not-json",
      JSON.stringify({ data: { usersPermissionsUser: null, account: null }, errors: [{ message: "partial" }] }),
      JSON.stringify({ data: { usersPermissionsUser: null } }),
      "x".repeat(64 * 1024 + 1),
    ]) {
      const uncertain = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
        fetchImpl: async () => new Response(body, { status: 200 }), timeoutMs: 1_000,
      });
      await expect(uncertain.prove(identity)).resolves.toBe("unknown");
    }

    for (const fetchImpl of [
      async () => new Response("upstream down", { status: 503 }),
      async () => { throw new Error("network outage"); },
      async () => new Response(new ReadableStream<Uint8Array>({
        pull(controller) { controller.error(new Error("stream outage")); },
      }), { status: 200 }),
    ]) {
      const outage = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token",
        fetchImpl: fetchImpl as typeof fetch, timeoutMs: 1_000,
      });
      await expect(outage.prove(identity)).resolves.toBe("outage");
    }
  });

  it("never interprets missing service authority as absence", async () => {
    const proof = new StrapiIdentityAbsenceProof({
      baseUrl: "https://strapi.example", accessToken: "", fetchImpl: vi.fn(), timeoutMs: 1_000,
    });
    await expect(proof.prove(identity)).resolves.toBe("outage");
    const invalidIdentity = new StrapiIdentityAbsenceProof({
      baseUrl: "https://strapi.example", accessToken: "read-only-service-token", fetchImpl: vi.fn(), timeoutMs: 1_000,
    });
    await expect(invalidIdentity.prove({ ...identity, userDocumentId: "" })).resolves.toBe("outage");
    await expect(invalidIdentity.prove({ ...identity, accountDocumentId: "" })).resolves.toBe("outage");
  });

  it("rejects unbounded configuration and supports the platform fetch", async () => {
    for (const options of [
      { baseUrl: "ftp://strapi.example", timeoutMs: 1_000 },
      { baseUrl: "https://strapi.example/path", timeoutMs: 1_000 },
      { baseUrl: "https://strapi.example", timeoutMs: 99 },
      { baseUrl: "https://strapi.example", timeoutMs: 30_001 },
      { baseUrl: "https://strapi.example", timeoutMs: 1_000.5 },
    ]) {
      expect(() => new StrapiIdentityAbsenceProof({ ...options, accessToken: "read-only-service-token" })).toThrow(
        "invalid Strapi identity absence proof configuration",
      );
    }
    const platformFetch = vi.fn(async () => new Response(JSON.stringify({
      data: { usersPermissionsUser: null, account: null },
    }), { status: 200 }));
    vi.stubGlobal("fetch", platformFetch);
    try {
      const proof = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token", timeoutMs: 1_000,
      });
      await expect(proof.prove(identity)).resolves.toBe("absent");
      expect(platformFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds a stalled dependency request", async () => {
    vi.useFakeTimers();
    try {
      const proof = new StrapiIdentityAbsenceProof({
        baseUrl: "https://strapi.example", accessToken: "read-only-service-token", timeoutMs: 100,
        fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })) as typeof fetch,
      });
      const result = proof.prove(identity);
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe("outage");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is composed into the bounded server worker and stopped with the server", () => {
    const routes = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    expect(app).toContain("new StrapiIdentityAbsenceProof");
    expect(routes).toContain("lifecycleAbsenceProof.proveAbsence");
    expect(routes).toContain("startMusicLifecycleWorker");
    expect(routes).toMatch(/server\.once\("close",\s*\(\)\s*=>\s*\{\s*void shutdown\(\)/);
    expect(routes).toMatch(/const shutdown = [\s\S]*?cleanupPromise \?\?= \(async \(\) => \{\s*lifecycleWorker\?\.stop\(\)/);
  });

  it("removes the proof credential before passing runtime configuration to route composition", () => {
    const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    expect(app).toContain("const { lifecycleProofToken, ...routeMusicConfig } = musicIdentityConfig");
    expect(app).toContain("registerRoutes(app, storage, routeMusicConfig");
  });
});
