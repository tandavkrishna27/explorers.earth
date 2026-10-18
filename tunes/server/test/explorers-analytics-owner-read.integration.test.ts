import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AnalyticsService } from "../application/analytics";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";

/**
 * P5-1. The owner analytics dashboard reads GET /api/explorers/analytics/events. In the
 * canonical runtime that read lazily loaded the legacy Strapi composition: a Bearer JWT
 * checked against Strapi and events read from Strapi. Canonical sign-in issues no such
 * token, so every owner saw "Detailed Analytics Unavailable". The read now comes from
 * the canonical analytics_events table, authorised by the canonical session.
 */
const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4), GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
afterAll(async () => { await pool?.end(); });

async function owner() {
  const userId = `analytics-owner-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${createHmac("sha256", config.secret).update(session.token).digest("base64")}`;
  const me = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(me.status).toBe(200);
  const accountId = me.body.account.id as string;
  const handle = `a${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Analytics',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [accountId, handle]);
  await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='places'", [accountId]);
  const collectionId = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,'places','Kochi','kochi','public','published',0) RETURNING id", [accountId])).rows[0].id as string;
  return { cookie, accountId, handle, collectionId };
}

const today = new Date().toISOString().slice(0, 10);
const read = (cookie: string | null, accountId: string) => {
  const call = request(composed.app).get("/api/explorers/analytics/events").query({ accountId, fromDate: today, toDate: today, timeZone: "UTC" });
  return cookie ? call.set("cookie", cookie) : call;
};

it("serves the owner's own events from canonical storage in the dashboard's record shape", async () => {
  const o = await owner();
  const occurred = new Date().toISOString();
  await new AnalyticsService(pool).recordAnalyticsEvent({ consent: true, eventId: `event-${randomUUID()}`, accountId: o.accountId, locationId: o.collectionId,
    event: { type: "view", page: "public-home", timestamp: occurred, canonicalPath: `/${o.handle}/places/kochi`,
      utmParams: { utm_source: "qr_code_scan", utm_medium: "qr_code" }, metadata: { cityname: "Kochi" } } }, { requestId: "owner-read", resolveCountry: () => "in" });
  await new AnalyticsService(pool).recordAnalyticsEvent({ consent: true, eventId: `event-${randomUUID()}`, accountId: o.accountId,
    event: { type: "click", page: "public-profile", element: "social-link-instagram", timestamp: occurred, canonicalPath: `/${o.handle}`,
      metadata: { platform: "instagram" } } }, { requestId: "owner-read" });

  const response = await read(o.cookie, o.accountId);
  expect(response.status).toBe(200);
  const records = response.body.events as Array<{ Account_Id: string; Location_Id: string | null; Recommendation_Id: string | null; Stats: any[] }>;
  expect(records).toHaveLength(2);
  const location = records.find((record) => record.Location_Id === o.collectionId)!;
  expect(location).toMatchObject({ Account_Id: o.accountId, Recommendation_Id: null });
  // City and guide subtype live in metadata, which the dashboard already reads; no new
  // summary dimension is needed for the city-level charts.
  expect(location.Stats).toEqual([{ type: "view", timestamp: occurred, page: "public-home", canonicalPath: `/${o.handle}/places/kochi`, country: "IN",
    utmParams: { utm_source: "qr_code_scan", utm_medium: "qr_code" }, metadata: { cityname: "Kochi" } }]);
  const profile = records.find((record) => record.Location_Id === null)!;
  expect(profile.Stats).toEqual([{ type: "click", timestamp: occurred, page: "public-profile", element: "social-link-instagram",
    canonicalPath: `/${o.handle}`, country: null, metadata: { platform: "instagram" } }]);
});

it("refuses another owner's account and an anonymous caller", async () => {
  const a = await owner(), b = await owner();
  expect((await read(a.cookie, b.accountId)).status).toBe(403);
  expect((await read(null, a.accountId)).status).toBe(403);
  expect((await read(a.cookie, a.accountId)).body).toEqual({ events: [] });
});
