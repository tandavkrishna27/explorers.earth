import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
  GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;

async function persona() {
  const userId = `profile-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const response = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(response.status).toBe(200);
  return { accountId: response.body.account.id as string, cookie };
}

describe("canonical profile", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  it("round-trips editable fields and rejects a stale revision", async () => {
    const owner = await persona();
    const initial = await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie);
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const saved = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: initial.body.account.revision,
        handle, displayName: "Explorer", accountType: "Creator", bioPlain: "Hello", publicProfile: true });
    expect(saved.status).toBe(200);
    expect(saved.body.account).toMatchObject({ handle, bioPlain: "Hello", revision: initial.body.account.revision + 1 });
    const stale = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: initial.body.account.revision, bioPlain: "Lost" });
    expect(stale.status).toBe(409);
    const reload = await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie);
    expect(reload.body.account.bioPlain).toBe("Hello");
  });

  it("rejects server-owned and unknown fields", async () => {
    const owner = await persona();
    for (const field of [{ accountId: randomUUID() }, { status: "deleted" }, { revision: 88 }, { unexpected: true }]) {
      const result = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
        .set("origin", config.baseURL).send({ expectedRevision: 1, ...field });
      expect(result.status).toBe(422);
    }
  });

  it("normalizes handles, rejects reserved routes and case-insensitive collisions", async () => {
    const first = await persona();
    const second = await persona();
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const a = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", first.cookie).set("origin", config.baseURL)
      .send({ expectedRevision: 1, handle: handle.toUpperCase() });
    expect(a.status).toBe(200);
    expect(a.body.account.handle).toBe(handle);
    const b = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", second.cookie).set("origin", config.baseURL)
      .send({ expectedRevision: 1, handle });
    expect(b.status).toBe(409);
    const reserved = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", second.cookie).set("origin", config.baseURL)
      .send({ expectedRevision: 1, handle: "API" });
    expect(reserved.status).toBe(422);
  });

  it("preserves blank optional fields and serializes two concurrent saves", async () => {
    const owner = await persona();
    const attempts = await Promise.all(["First", "Second"].map((displayName) =>
      request(composed.app).patch("/api/explorers/v1/account")
        .set("cookie", owner.cookie).set("origin", config.baseURL)
        .send({ expectedRevision: 1, displayName, bioPlain: null, mobileNumber: null,
          primaryAddress: null, additionalAddresses: [], publicAddress: null })));
    expect(attempts.map((result) => result.status).sort()).toEqual([200, 409]);
    const reloaded = await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie);
    expect(reloaded.body.account).toMatchObject({ revision: 2, bioPlain: null,
      mobileNumber: null, primaryAddress: null, additionalAddresses: [], publicAddress: null });
  });

  it("keeps private contact data out of the public shell", async () => {
    const owner = await persona();
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const saved = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: 1, handle, displayName: "Public", accountType: "Creator",
        mobileNumber: "+12025550123", mobileNumberVisible: false, onboardingStatus: "complete" });
    expect(saved.status).toBe(200);
    const publicView = await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`);
    expect(publicView.status).toBe(200);
    expect(JSON.stringify(publicView.body)).not.toContain("+12025550123");
  });

  it("round-trips localized content, appearance, social, addresses and contact visibility", async () => {
    const owner = await persona();
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const saved = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", owner.cookie).set("origin", config.baseURL).send({ expectedRevision: 1,
        handle, displayName: "Localized", accountType: "Creator", onboardingStatus: "complete",
        locale: "hi", bioPlain: "Hello", bioRich: { blocks: [{ text: "नमस्ते" }] },
        primaryAddress: { address: "Jaipur, India" }, additionalAddresses: [{ city: "Jaipur" }],
        publicAddress: { city: "Jaipur", country: "India" }, profilePlaceDetails: { placeId: "fixture" },
        mobileNumber: "+12025550123", mobileNumberVisible: false,
        themeSettings: { preset: "cinematic-dark" }, businessDetails: { category: "travel" },
        socialLinks: [{ platform: "instagram", url: "https://instagram.com/example", visible: true },
          { platform: "facebook", url: "https://example.invalid/hidden", visible: false }] });
    expect(saved.status).toBe(200);
    const ownerView = await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie);
    expect(ownerView.body.account).toMatchObject({ locale: "hi", bioRich: { blocks: [{ text: "नमस्ते" }] },
      primaryAddress: { address: "Jaipur, India" }, additionalAddresses: [{ city: "Jaipur" }],
      publicAddress: { city: "Jaipur", country: "India" }, profilePlaceDetails: { placeId: "fixture" },
      mobileNumberVisible: false, themeSettings: { preset: "cinematic-dark" },
      businessDetails: { category: "travel" } });
    const publicView = await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`);
    expect(publicView.status).toBe(200);
    expect(JSON.stringify(publicView.body)).not.toContain("+12025550123");
    expect(JSON.stringify(publicView.body)).not.toContain("https://example.invalid/hidden");
    expect(publicView.body.social_media.instagram).toEqual({ link: "https://instagram.com/example", visibility: true });
    expect(publicView.body.social_media.facebook).toBeUndefined();
    expect(publicView.body.Bio).toBe("Hello");
    expect(publicView.body.social_media.theme_settings).toMatchObject({ preset: "cinematic-dark" });
  });

  it("persists owner feed media, serves an attached public item, and rejects foreign attachments", async () => {
    const owner = await persona();
    const stranger = await persona();
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const uploaded = await request(composed.app).post("/api/explorers/v1/media")
      .set("cookie", owner.cookie).set("origin", config.baseURL)
      .set("Content-Type", "image/png").set("X-Media-Purpose", "feed")
      .set("X-File-Name", "feed.png").send(bytes);
    expect(uploaded.status).toBe(201);
    const id = uploaded.body.media.id as string;
    const before = await request(composed.app).get(`/api/explorers/v1/media/${id}/content`);
    expect(before.status).toBe(404);
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const saved = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", owner.cookie).set("origin", config.baseURL).send({ expectedRevision: 1,
        handle, displayName: "Feed", accountType: "Creator", onboardingStatus: "complete",
        feedItems: [{ mediaId: id, externalUrl: null, source: "manual", type: "image", caption: null, details: { width: 100 } }] });
    expect(saved.status).toBe(200);
    expect(saved.body.account.feedItems).toMatchObject([{ mediaId: id, details: { width: 100 } }]);
    const shell = await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`);
    expect(shell.body.Feed_Data).toMatchObject([{ documentId: id, type: "image", width: 100 }]);
    const publicMedia = await request(composed.app).get(`/api/explorers/v1/media/${id}/content`);
    expect(publicMedia.status).toBe(200);
    const attachedDelete = await request(composed.app).delete(`/api/explorers/v1/media/${id}`)
      .set("cookie", owner.cookie).set("origin", config.baseURL);
    expect(attachedDelete.status).toBe(404);
    const foreign = await request(composed.app).patch("/api/explorers/v1/account")
      .set("cookie", stranger.cookie).set("origin", config.baseURL).send({ expectedRevision: 1,
        feedItems: [{ mediaId: id, externalUrl: null, source: "manual", type: "image", caption: null, details: {} }] });
    expect(foreign.status).toBe(422);
  });

  it("revokes a cached public phone and then the whole shell immediately after privacy changes", async () => {
    const owner = await persona();
    const handle = `p${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const first = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: 1, handle, displayName: "Privacy",
        accountType: "Creator", onboardingStatus: "complete",
        mobileNumber: "+12025550123", mobileNumberVisible: true, publicProfile: true });
    expect(first.status).toBe(200);
    const visible = await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`);
    expect(visible.body.mobile_number).toBe("+12025550123");
    expect(visible.headers["cache-control"]).toBe("no-store");
    const hiddenPhone = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: 2, mobileNumberVisible: false });
    expect(hiddenPhone.status).toBe(200);
    const redacted = await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`);
    expect(redacted.status).toBe(200);
    expect(JSON.stringify(redacted.body)).not.toContain("+12025550123");
    const hidden = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie)
      .set("origin", config.baseURL).send({ expectedRevision: 3, publicProfile: false });
    expect(hidden.status).toBe(200);
    expect((await request(composed.app).get(`/api/explorers/v1/profiles/${handle}`)).status).toBe(404);
  });
});
