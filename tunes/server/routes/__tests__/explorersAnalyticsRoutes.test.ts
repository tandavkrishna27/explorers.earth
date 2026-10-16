import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupExplorersAnalyticsRoutes } from "../explorersAnalyticsRoutes";
import { createLoopbackSupertestScope } from "../../test/helpers/loopback-supertest";

const input = {
  consent: true,
  eventId: "evt-20260824-route-1",
  accountId: "account-1",
  event: {
    type: "view",
    timestamp: "2026-08-24T03:30:00.000Z",
    page: "public-profile",
    canonicalPath: "/tk2727",
  },
};

const musicInput = {
  consent: true,
  eventId: "evt-20260829-music-1",
  event: {
    name: "request_submitted",
    outcome: "rate_limited",
  },
  utmParams: { utm_source: "newsletter", utm_medium: "email" },
};

const buildApp = ({ authorized = true } = {}) => {
  const service = {
    ingest: vi.fn().mockResolvedValue({
      status: "committed",
      documentId: "strapi-event-1",
      duplicate: false,
    }),
    readAccountEvents: vi.fn().mockResolvedValue([{ eventId: "evt-1" }]),
  };
  const authorizeOwner = vi.fn().mockResolvedValue(authorized);
  const validatePublicTarget = vi.fn().mockResolvedValue(true);
  const allowWrite = vi.fn().mockReturnValue(true);
  const resolvePublicMusicAnalyticsTarget = vi.fn().mockResolvedValue({
    accountId: "account-1",
    mode: "public",
  });
  const resolveFriendlyMusicAnalyticsTarget = vi.fn().mockResolvedValue({ accountId: "account-1", mode: "friendly" });
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  setupExplorersAnalyticsRoutes(app, {
    service,
    authorizeOwner,
    validatePublicTarget,
    allowWrite,
    resolvePublicMusicAnalyticsTarget,
    resolveFriendlyMusicAnalyticsTarget,
  });
  return {
    app,
    service,
    authorizeOwner,
    validatePublicTarget,
    allowWrite,
    resolvePublicMusicAnalyticsTarget,
    resolveFriendlyMusicAnalyticsTarget,
  };
};

const loopback = createLoopbackSupertestScope();

describe("explorers analytics routes", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => loopback.closeAll());

  it("attributes friendly unavailable events through account path authority only", async () => {
    const { app, service, resolveFriendlyMusicAnalyticsTarget } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/music-account/account-1/events")
      .send({ ...musicInput, event: { name: "unavailable", reason: "not_public" } });
    expect(response.status).toBe(201);
    expect(resolveFriendlyMusicAnalyticsTarget).toHaveBeenCalledWith("account-1");
    const forwarded = JSON.stringify(service.ingest.mock.calls[0][0].event);
    expect(forwarded).not.toContain("account-1");
    expect(JSON.stringify(response.body)).not.toContain("account-1");
  });

  it("resolves a public Music owner server-side and never returns or forwards route authority", async () => {
    const { app, service, resolvePublicMusicAnalyticsTarget } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/music/public-owner/events")
      .send(musicInput);

    expect(response.status).toBe(201);
    expect(resolvePublicMusicAnalyticsTarget).toHaveBeenCalledWith("public-owner", undefined);
    expect(service.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-1",
        event: expect.objectContaining({
          page: "public-music",
          canonicalPath: "/music/share",
          element: "request-submitted",
          metadata: { action: "request_submitted", context: "rate_limited" },
        }),
      }),
      expect.objectContaining({ getIp: expect.any(Function) }),
    );
    const forwarded = JSON.stringify(service.ingest.mock.calls[0][0].event);
    expect(forwarded).not.toContain("public-owner");
    expect(JSON.stringify(response.body)).not.toContain("account-1");
    expect(JSON.stringify(response.body)).not.toContain("public-owner");
  });

  it("revalidates unlisted capability authority from the header and fails closed generically", async () => {
    const capability = "C".repeat(43);
    const accepted = buildApp();
    accepted.resolvePublicMusicAnalyticsTarget.mockResolvedValue({ accountId: "account-1", mode: "unlisted" });
    const { request: acceptedRequest } = await loopback.open({ app: accepted.app });
    expect((await acceptedRequest
      .post("/api/explorers/analytics/music/unlisted-owner/events")
      .set("X-Music-Guest-Capability", capability)
      .send(musicInput)).status).toBe(201);
    expect(accepted.resolvePublicMusicAnalyticsTarget).toHaveBeenCalledWith("unlisted-owner", capability);

    for (const supplied of [undefined, "not-a-capability", "D".repeat(43)]) {
      const denied = buildApp();
      denied.resolvePublicMusicAnalyticsTarget.mockResolvedValue(undefined);
      const { request: deniedRequest } = await loopback.open({ app: denied.app });
      let operation = deniedRequest.post("/api/explorers/analytics/music/unlisted-owner/events");
      if (supplied) operation = operation.set("X-Music-Guest-Capability", supplied);
      const response = await operation.send(musicInput);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: "Music page unavailable" });
      expect(denied.service.ingest).not.toHaveBeenCalled();
    }
  });

  it("rejects identity, capability, URL, raw-query, and unknown fields in the Music event body", async () => {
    const { app, service, resolvePublicMusicAnalyticsTarget } = buildApp();
    const { request } = await loopback.open({ app });
    for (const forbidden of [
      { accountId: "account-1" },
      { publicSlug: "public-owner" },
      { capability: "C".repeat(43) },
      { query: "raw search" },
      { mediaUrl: "https://youtube.com/watch?v=abcdefghijk" },
      { credential: "secret" },
    ]) {
      const response = await request
        .post("/api/explorers/analytics/music/public-owner/events")
        .send({ ...musicInput, event: { ...musicInput.event, ...forbidden } });
      expect(response.status).toBe(400);
    }
    expect(resolvePublicMusicAnalyticsTarget).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it("preserves analytics receipt replay semantics and rate limits before authority lookup", async () => {
    const replay = buildApp();
    replay.service.ingest.mockResolvedValue({ status: "committed", documentId: "event-document", duplicate: true });
    const { request: replayRequest } = await loopback.open({ app: replay.app });
    expect((await replayRequest.post("/api/explorers/analytics/music/public-owner/events").send(musicInput)).status).toBe(200);

    const pending = buildApp();
    pending.service.ingest.mockResolvedValue({ status: "pending", duplicate: true });
    const { request: pendingRequest } = await loopback.open({ app: pending.app });
    expect((await pendingRequest.post("/api/explorers/analytics/music/public-owner/events").send(musicInput)).status).toBe(202);

    const dropped = buildApp();
    dropped.service.ingest.mockResolvedValue({ status: "dropped", duplicate: true });
    const { request: droppedRequest } = await loopback.open({ app: dropped.app });
    expect((await droppedRequest.post("/api/explorers/analytics/music/public-owner/events").send(musicInput)).status).toBe(409);

    const limited = buildApp();
    limited.allowWrite.mockReturnValue(false);
    const { request: limitedRequest } = await loopback.open({ app: limited.app });
    expect((await limitedRequest.post("/api/explorers/analytics/music/public-owner/events").send(musicInput)).status).toBe(429);
    expect(limited.resolvePublicMusicAnalyticsTarget).not.toHaveBeenCalled();
    expect(limited.service.ingest).not.toHaveBeenCalled();
  });

  it("accepts a canonical public event without returning or storing an IP", async () => {
    const { app, service } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .set("X-Forwarded-For", "203.0.113.90")
      .send(input);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      status: "committed",
      documentId: "strapi-event-1",
      duplicate: false,
    });
    expect(service.ingest).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ getIp: expect.any(Function) }),
    );
    expect(JSON.stringify(response.body)).not.toContain("203.0.113.90");
  });

  it("returns 204 when analytics consent is denied", async () => {
    const { app, service } = buildApp();
    service.ingest.mockResolvedValue({ status: "consent-denied" });

    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .send({ ...input, consent: false });

    expect(response.status).toBe(204);
  });

  it("rejects malformed events before target validation or ingestion", async () => {
    const { app, service, validatePublicTarget } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .send({ ...input, eventId: "short" });

    expect(response.status).toBe(400);
    expect(validatePublicTarget).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it.each(["/music/share", "/Music/SHARE", "/%6dusic/share"])(
    "rejects standalone Music attribution on the generic analytics endpoint for %s",
    async (canonicalPath) => {
      const { app, service, validatePublicTarget } = buildApp();
      const { request } = await loopback.open({ app });
      const response = await request
        .post("/api/explorers/analytics/events")
        .send({
          consent: true,
          eventId: "evt-standalone-music-generic",
          accountId: "attacker-selected-account",
          event: {
            type: "interaction",
            timestamp: "2026-08-24T03:30:00.000Z",
            page: "public-music",
            element: "navigation-opened",
            canonicalPath,
            metadata: { action: "navigation_opened" },
          },
        });

      expect(response.status).toBe(400);
      expect(validatePublicTarget).not.toHaveBeenCalled();
      expect(service.ingest).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for an analytics target that is not a real public account", async () => {
    const { app, service, validatePublicTarget } = buildApp();
    validatePublicTarget.mockResolvedValue(false);

    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .send(input);

    expect(response.status).toBe(404);
    expect(validatePublicTarget).toHaveBeenCalledWith(input);
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it("rate limits before spending a Strapi validation or write", async () => {
    const { app, service, validatePublicTarget, allowWrite } = buildApp();
    allowWrite.mockReturnValue(false);

    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .send(input);

    expect(response.status).toBe(429);
    expect(validatePublicTarget).not.toHaveBeenCalled();
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it("returns 202 for an in-flight duplicate", async () => {
    const { app, service } = buildApp();
    service.ingest.mockResolvedValue({ status: "pending", duplicate: true });
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/explorers/analytics/events")
      .send(input);
    expect(response.status).toBe(202);
  });

  it("maps idempotency conflicts to 409 and upstream failures to 502", async () => {
    const { IdempotencyConflictError } = await import(
      "../../services/explorers-analytics-service"
    );
    const conflict = buildApp();
    conflict.service.ingest.mockRejectedValue(new IdempotencyConflictError());
    const { request: conflictRequest } = await loopback.open({ app: conflict.app });
    expect(
      (
        await conflictRequest
          .post("/api/explorers/analytics/events")
          .send(input)
      ).status,
    ).toBe(409);

    const upstream = buildApp();
    upstream.service.ingest.mockRejectedValue(new Error("Strapi unavailable"));
    const { request: upstreamRequest } = await loopback.open({ app: upstream.app });
    expect(
      (
        await upstreamRequest
          .post("/api/explorers/analytics/events")
          .send(input)
      ).status,
    ).toBe(502);
  });

  it("denies cross-account owner reads before querying events", async () => {
    const { app, service, authorizeOwner } = buildApp({ authorized: false });

    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "other-account",
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        timeZone: "America/New_York",
      });

    expect(response.status).toBe(403);
    expect(authorizeOwner).toHaveBeenCalledWith(
      expect.anything(),
      "other-account",
    );
    expect(service.readAccountEvents).not.toHaveBeenCalled();
  });

  it("passes only the authorized account and date range to the scoped read", async () => {
    const { app, service } = buildApp();

    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "account-1",
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        timeZone: "America/New_York",
      });

    expect(response.status).toBe(200);
    expect(service.readAccountEvents).toHaveBeenCalledWith({
      accountId: "account-1",
      from: "2026-08-01T04:00:00.000Z",
      to: "2026-09-01T03:59:59.999Z",
    });
    expect(response.body).toEqual({ events: [{ eventId: "evt-1" }] });
  });

  it("rejects invalid read scopes before authorization", async () => {
    const { app, service, authorizeOwner } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({ accountId: "account-1", fromDate: "not-a-date", toDate: "also-bad", timeZone: "invalid" });
    expect(response.status).toBe(400);
    expect(authorizeOwner).not.toHaveBeenCalled();
    expect(service.readAccountEvents).not.toHaveBeenCalled();
  });

  it.each([
    {
      fromDate: "2026-08-31",
      toDate: "2026-08-01",
      timeZone: "America/New_York",
    },
    {
      fromDate: "2025-01-01",
      toDate: "2026-08-01",
      timeZone: "America/New_York",
    },
  ])("rejects reversed or oversized analytics windows", async (scope) => {
    const { app, authorizeOwner } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({ accountId: "account-1", ...scope });
    expect(response.status).toBe(400);
    expect(authorizeOwner).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-08-15", "2026-11-15"],
    ["2026-02-15", "2026-05-18"],
  ])("accepts 93 calendar days across DST in America/New_York", async (fromDate, toDate) => {
    const { app, service } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({ accountId: "account-1", fromDate, toDate, timeZone: "America/New_York" });

    expect(response.status).toBe(200);
    expect(service.readAccountEvents).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["2026-08-15", "2026-11-16"],
    ["2026-02-15", "2026-05-19"],
  ])("rejects 94 calendar days across DST in America/New_York", async (fromDate, toDate) => {
    const { app, service, authorizeOwner } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({ accountId: "account-1", fromDate, toDate, timeZone: "America/New_York" });

    expect(response.status).toBe(400);
    expect(authorizeOwner).not.toHaveBeenCalled();
    expect(service.readAccountEvents).not.toHaveBeenCalled();
  });

  it("rejects a civil date skipped by the accepted IANA timezone", async () => {
    const { app, service, authorizeOwner } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "account-1",
        fromDate: "2011-12-30",
        toDate: "2011-12-30",
        timeZone: "Pacific/Apia",
      });

    expect(response.status).toBe(400);
    expect(authorizeOwner).not.toHaveBeenCalled();
    expect(service.readAccountEvents).not.toHaveBeenCalled();
  });

  it.each(["2011-12-29", "2011-12-31"])(
    "accepts a valid calendar date adjacent to Pacific/Apia's skipped day: %s",
    async (date) => {
      const { app, service } = buildApp();
      const { request } = await loopback.open({ app });
      const response = await request
        .get("/api/explorers/analytics/events")
        .query({
          accountId: "account-1",
          fromDate: date,
          toDate: date,
          timeZone: "Pacific/Apia",
        });

      expect(response.status).toBe(200);
      expect(service.readAccountEvents).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a timezone alias that is not an IANA timezone", async () => {
    const { app, service, authorizeOwner } = buildApp();
    const { request } = await loopback.open({ app });
    const response = await request
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "account-1",
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        timeZone: "EST",
      });

    expect(response.status).toBe(400);
    expect(authorizeOwner).not.toHaveBeenCalled();
    expect(service.readAccountEvents).not.toHaveBeenCalled();
  });

  it("returns a controlled 502 when authorization or scoped reads fail", async () => {
    const authorizationFailure = buildApp();
    authorizationFailure.authorizeOwner.mockRejectedValue(
      new Error("identity provider unavailable"),
    );
    const { request: authorizationRequest } = await loopback.open({ app: authorizationFailure.app });
    const authResponse = await authorizationRequest
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "account-1",
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        timeZone: "America/New_York",
      });
    expect(authResponse.status).toBe(502);

    const readFailure = buildApp();
    readFailure.service.readAccountEvents.mockRejectedValue(
      new Error("Strapi unavailable"),
    );
    const { request: readRequest } = await loopback.open({ app: readFailure.app });
    const readResponse = await readRequest
      .get("/api/explorers/analytics/events")
      .query({
        accountId: "account-1",
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        timeZone: "America/New_York",
      });
    expect(readResponse.status).toBe(502);
  });
});

it('reports ingestion failure without logging private database error details',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{}),fixture=buildApp();fixture.service.ingest.mockRejectedValue(Error('private database payload marker'));
 try{const {request}=await loopback.open({app:fixture.app});expect((await request.post('/api/explorers/analytics/events').send(input)).status).toBe(502);expect(log).toHaveBeenCalledWith('Explorers analytics ingestion failed');}finally{log.mockRestore();await loopback.closeAll();}
});