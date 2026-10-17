import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { setupLocalMusicBoundary } from "../routes/musicLocalBoundary";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

function harness() {
  const app = express();
  let calls = 0;
  app.use(express.json());
  setupLocalMusicBoundary(app);
  // A synthetic downstream handler records any escaped request without loading
  // auth, storage, DB, workers, or upstream integrations.
  app.use((_req, res) => { calls += 1; res.status(204).end(); });
  return { app, calls: () => calls };
}

const disabledPaths = [
  "/api/login", "/api/logout", "/api/register", "/api/check", "/api/csrf-token",
  "/api/auth", "/api/auth/google/callback", "/api/connect/google",
  "/api/verify-email/token", "/api/resend-verification",
  "/api/user/request-reactivation", "/api/user/reactivate?token=not-authority",
  "/api/explorers/analytics/events", "/api/explorers/analytics/music/slug/events",
  "/api/explorers/analytics/music-account/document-id/events", "/api/analytics/events",
  "/api/music/identity/lifecycle/prepare", "/api/music/identity/lifecycle/boundary",
  "/api/music/identity/lifecycle/cancel", "/api/music/identity/lifecycle/suspend",
  "/api/music/identity/lifecycle/resume",
];

describe("local Music disabled-capability boundary", () => {
  for (const method of ["get", "post"] as const) {
    it.each(disabledPaths)(`${method.toUpperCase()} %s never reaches a disabled handler`, async (url) => {
      const { app, calls } = harness();
      const { request } = await loopback.open({ app });
      const response = await request[method](url);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { code: "LOCAL_CAPABILITY_DISABLED" } });
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(calls()).toBe(0);
    });
  }

  it.each([
    "/API/REGISTER/", "/api/%6Cogin", "/api/%256cogin", "/api%2Flogout",
    "/api//register", "/api/auth/provider/deep/", "/API/USER/REACTIVATE/",
    "/api/user/request-reactivation/", "/api/user/%72eactivate",
    "/api/%76erify-email/token/", "/api/explorers/%61nalytics/events/",
    "/API/MUSIC/IDENTITY/LIFECYCLE/SUSPEND/", "/api/music/identity/lifecycle/%70repare",
    "/api/music/identity/lifecycle/unknown-future-mutation", "/api/music/identity/lifecycle/status",
  ])("blocks encoded, case, slash and namespace aliases: %s", async (url) => {
    const { app, calls } = harness();
    const { request } = await loopback.open({ app });
    const response = await request.post(url);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: "LOCAL_CAPABILITY_DISABLED" } });
    expect(calls()).toBe(0);
  });

  it.each(["put", "patch", "delete", "options"] as const)("does not allow %s to mutate lifecycle status", async (method) => {
    const { app, calls } = harness();
    const { request } = await loopback.open({ app });
    const response = await request[method]("/api/music/identity/lifecycle/status");
    expect(response.status).toBe(503);
    expect(calls()).toBe(0);
  });

  it.each([
    ["get", "/api/music-entry/status"], ["get", "/api/music/identity/lifecycle/status"],
    ["head", "/api/music/identity/lifecycle/status"],
    ["get", "/API/MUSIC/IDENTITY/LIFECYCLE/STATUS/"],
    ["post", "/api/music/identity/ensure"], ["get", "/api/music/identity/current"],
    ["get", "/api/music/dashboard"],
    ["post", "/api/music/publication"], ["post", "/api/music/queue/append"],
    ["get", "/api/music/public-profile/account-id"], ["get", "/api/music/public-resource/v1/slug"],
    ["get", "/api/playlist/slug"], ["post", "/api/playlist/slug/requests"],
    ["get", "/api/music/features"], ["get", "/health/live"], ["get", "/health/ready"],
    ["get", "/api/music/dashboard?returnTo=/api/login"],
  ] as const)("preserves canonical downstream %s %s", async (method, url) => {
    const { app, calls } = harness();
    const { request } = await loopback.open({ app });
    expect((await request[method](url)).status).toBe(204);
    expect(calls()).toBe(1);
  });

  it("wins before a downstream native-registration containment response", async () => {
    const app = express();
    setupLocalMusicBoundary(app);
    let calls = 0;
    app.post("/api/register", (_req, res) => { calls++; res.status(410).json({ error: "retired" }); });
    const { request } = await loopback.open({ app });
    expect((await request.post("/api/register")).status).toBe(503);
    expect(calls).toBe(0);
  });
});
