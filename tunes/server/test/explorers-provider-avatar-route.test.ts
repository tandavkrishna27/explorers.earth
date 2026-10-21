import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/explorersPrincipal", () => ({
  requireActor: vi.fn(async () => ({ userId: "user-1", accountId: "account-1", role: "owner" })),
  sendActorError: (_request: unknown, response: express.Response) => response.status(401).json({ error: { code: "UNAUTHENTICATED" } }),
}));
vi.mock("#auth-runtime", () => ({ fromNodeHeaders: (headers: unknown) => headers }));

import { setupExplorersMediaRoutes } from "../routes/explorersMediaRoutes";

/**
 * Onboarding offers the Google profile photo as the default avatar. Keeping it imports the
 * bytes server-side into the owner's own media, so public pages never hot-link Google and the
 * media gate and CSP stay as they are. The URL comes from the signed-in session only: a URL in
 * the request is never fetched, so this route cannot be pointed at an arbitrary host.
 */
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const origin = "https://explorers.test";
let sessionImage: string | null;
let fetched: string[];
let created: unknown[];

function app() {
  const instance = express();
  const auth = { api: { getSession: async () => ({ user: { id: "user-1", image: sessionImage }, session: { id: "s" } }) } };
  const service = { createMedia: async (_actor: unknown, input: unknown) => { created.push(input); return { id: "11111111-1111-4111-8111-111111111111", mimeType: "image/png", size: png.length }; } };
  const fetcher = { fetch: async (url: string) => { fetched.push(url); return { bytes: png, mimeType: "image/png" }; } };
  setupExplorersMediaRoutes(instance, {} as never, auth as never, { baseURL: origin } as never, service as never, undefined, fetcher as never);
  return instance;
}

beforeEach(() => { sessionImage = "https://lh3.googleusercontent.com/a/photo=s96-c"; fetched = []; created = []; });

describe("POST /api/explorers/v1/media/provider-avatar", () => {
  it("imports the session's Google photo as the owner's profile media", async () => {
    const response = await request(app()).post("/api/explorers/v1/media/provider-avatar").set("origin", origin);
    expect(response.status).toBe(201);
    expect(response.body.media.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(fetched).toEqual(["https://lh3.googleusercontent.com/a/photo=s96-c"]);
    expect(created).toEqual([expect.objectContaining({ purpose: "profile", mimeType: "image/png", length: png.length, bytes: png })]);
  });

  it("never fetches a URL supplied by the caller", async () => {
    await request(app()).post("/api/explorers/v1/media/provider-avatar").set("origin", origin)
      .send({ url: "https://evil.example/x.png", image: "https://evil.example/x.png" });
    expect(fetched).toEqual(["https://lh3.googleusercontent.com/a/photo=s96-c"]);
  });

  it("answers 404 and fetches nothing when the session has no photo", async () => {
    sessionImage = null;
    const response = await request(app()).post("/api/explorers/v1/media/provider-avatar").set("origin", origin);
    expect(response.status).toBe(404);
    expect(fetched).toEqual([]);
    expect(created).toEqual([]);
  });

  it("refuses an untrusted origin before touching the session", async () => {
    const response = await request(app()).post("/api/explorers/v1/media/provider-avatar").set("origin", "https://evil.example");
    expect(response.status).toBe(403);
    expect(fetched).toEqual([]);
  });

  it("answers 404 and stores nothing when Google refuses the photo", async () => {
    const instance = express();
    const auth = { api: { getSession: async () => ({ user: { id: "user-1", image: sessionImage }, session: { id: "s" } }) } };
    setupExplorersMediaRoutes(instance, {} as never, auth as never, { baseURL: origin } as never,
      { createMedia: async (_a: unknown, input: unknown) => { created.push(input); } } as never, undefined,
      { fetch: async () => { throw new Error("Google profile photo unavailable"); } } as never);
    const response = await request(instance).post("/api/explorers/v1/media/provider-avatar").set("origin", origin);
    expect(response.status).toBe(404);
    expect(created).toEqual([]);
  });
});
