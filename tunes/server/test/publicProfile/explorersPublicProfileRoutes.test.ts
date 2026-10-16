import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupExplorersPublicProfileRoutes } from "../../routes/explorersPublicProfileRoutes";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

describe("explorers public profile routes", () => {
  it("returns a safe public shell", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { shell: async () => ({ username: "tk2727", public_profile: "Yes" }), category: async () => undefined });
    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727").expect(200).expect({ username: "tk2727", public_profile: "Yes" });
  });
  it("revalidates the public shell without downstream storage", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { shell: async () => ({ username: "tk2727", public_profile: "Yes" }), category: async () => undefined });
    const { request } = await loopback.open({ app });
    const first = await request.get("/api/explorers/v1/profiles/tk2727").expect(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    await request.get("/api/explorers/v1/profiles/tk2727").set("If-None-Match", first.headers.etag).expect(304);
  });
  it("returns the same safe 404 for an unavailable category", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category: async () => undefined });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps").expect(404);
    expect(response.body).toEqual({ version: "explorers-public-error/v1", error: { code: "NOT_FOUND" } });
  });

  it("prevents downstream caching for an allowed category", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category: async () => ({ lists: [] }) });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps").expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.etag).toBeDefined();
  });

  it("maps upstream failures to a safe retryable response", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category: async () => { throw new Error("upstream credentials must stay private"); } });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps").expect(503);
    expect(response.body.error.code).toBe("UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("credentials");
  });

  it("bounds public-profile traffic with a safe retryable 429 response", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(
      app,
      { category: async () => ({ appLists: [] }) },
      { rateLimit: { limit: 1, windowMs: 60_000 } },
    );

    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps").expect(200);
    const response = await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps").expect(429);
    expect(response.body).toEqual({ version: "explorers-public-error/v1", error: { code: "RATE_LIMITED", retryable: true } });
  });

  it("rejects malformed public identifiers before calling the gateway", async () => {
    const category = vi.fn();
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category });
    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727%2Fadmin/recommendations/apps").expect(400);
    expect(category).not.toHaveBeenCalled();
  });

  it("returns a safe 400 for malformed request input without disclosing validation details", async () => {
    const category = vi.fn();
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category });

    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/v1/profiles/tk2727/recommendations/apps?limit=1000")
      .expect(400);

    expect(response.body).toEqual({ version: "explorers-public-error/v1", error: { code: "BAD_REQUEST" } });
    expect(category).not.toHaveBeenCalled();
  });

  it("honours the bounded page size and creator cache bypass", async () => {
    const category = vi.fn().mockResolvedValue({ lists: [] });
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps?limit=24").set("Cache-Control", "no-cache").expect(200);
    expect(category).toHaveBeenCalledWith("tk2727", "apps", 24, { bypassCache: true });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("passes a bounded cursor through to the category reader", async () => {
    const category = vi.fn().mockResolvedValue({ appLists: [] });
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category });

    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps?limit=12&cursor=o24").expect(200);
    expect(category).toHaveBeenCalledWith("tk2727", "apps", 12, { bypassCache: false, cursor: "o24" });
  });

  it("maps shell upstream failures to a safe retryable response", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, { shell: async () => { throw new Error("private upstream detail"); }, category: async () => undefined });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers/v1/profiles/tk2727").expect(503);
    expect(response.body.error.code).toBe("UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private");
  });

  it("uses the same safe detail route contract for a public list", async () => {
    const detail = vi.fn().mockResolvedValue({ appLists: [{ slug: "useful-apps" }] });
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category: async () => undefined, detail });
    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps/useful-apps?limit=24").expect(200).expect({ appLists: [{ slug: "useful-apps" }] });
    expect(detail).toHaveBeenCalledWith("tk2727", "apps", "useful-apps", 24, { bypassCache: false });
  });

  it("passes a bounded cursor through to the detail reader", async () => {
    const detail = vi.fn().mockResolvedValue({ appLists: [{ slug: "useful-apps" }] });
    const app = express();
    setupExplorersPublicProfileRoutes(app, { category: async () => undefined, detail });

    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/tk2727/recommendations/apps/useful-apps?limit=12&cursor=o24").expect(200);
    expect(detail).toHaveBeenCalledWith("tk2727", "apps", "useful-apps", 12, { bypassCache: false, cursor: "o24" });
  });
});
