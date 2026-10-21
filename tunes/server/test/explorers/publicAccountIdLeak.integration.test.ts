/**
 * SEC-03 contract: no anonymous public response carries an internal account id.
 *
 * The live UAT found the profile shell's `documentId` and every list's `account.documentId`
 * equal to the creator's account UUID. Public pages address a creator by handle; the UUID is
 * internal. This suite seeds one public creator with a list in every public category and walks
 * every anonymous read the SPA makes - profile, category, list detail, the /public content
 * family, search, the sitemap - failing if the UUID appears anywhere: in any JSON string, in
 * any header, or inside a signed continuation cursor (those are readable base64, so each
 * dot-separated segment is decoded and searched too). It also proves the anonymous analytics
 * write, which now names the creator by handle, still lands on the right account.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../../auth/betterAuth";
import { PUBLIC_RECOMMENDATION_CATEGORIES } from "../../publicProfile/publicProfilePolicy";

let pool: pg.Pool;
let app: ReturnType<typeof createCanonicalApp>["app"];

const RICH_NOTE = { version: 1 as const, format: "quill-html" as const, html: "<p>note</p>" };
const KIND: Record<string, string> = { places: "place", movies: "movie", books: "book", games: "game",
  apps: "app", products: "product", people: "person" };
const SLUG = "public-list";

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 });
  app = createCanonicalApp(pool, resolveExplorersAuthConfig({
    EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
    EXPLORERS_AUTH_SECRET: "public-account-id-secret-".repeat(2),
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture",
  })).app;
});

afterAll(async () => { await pool.end(); });

async function seedCreator() {
  const handle = `leak${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const account = (await pool.query(
    `INSERT INTO creator_accounts(handle,display_name,account_type,public_profile,onboarding_status)
     VALUES($1,'Public','Personal',true,'complete') RETURNING id`, [handle])).rows[0].id as string;
  await pool.query(`INSERT INTO account_presentation(account_id) VALUES($1)`, [account]);
  const categories = [...PUBLIC_RECOMMENDATION_CATEGORIES, "guides"].filter((c, i, all) => all.indexOf(c) === i);
  for (const [order, category] of categories.entries()) {
    await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order)
      VALUES($1,$2,true,$3) ON CONFLICT (account_id,category) DO UPDATE SET is_public=true`, [account, category, order]);
    const collection = (await pool.query(
      `INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state)
       VALUES($1,$2,'Public list',$3,0,'public','published') RETURNING id`, [account, category, SLUG])).rows[0].id;
    // Two books, so the category and list reads hand out a continuation cursor at limit=1.
    if (category !== "books") continue;
    for (let index = 0; index < 2; index++) {
      const entity = (await pool.query(`INSERT INTO entities(kind,title,origin) VALUES($1,$2,'manual') RETURNING id`,
        [KIND[category], `Title ${index}`])).rows[0].id;
      const recommendation = (await pool.query(
        `INSERT INTO recommendations(account_id,entity_id,category,user_rating,publication_state,note)
         VALUES($1,$2,$3,8,'published',$4) RETURNING id`, [account, entity, category, JSON.stringify(RICH_NOTE)])).rows[0].id;
      await pool.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order)
        VALUES($1,$2,$3,$4,$5)`, [collection, recommendation, account, category, index]);
    }
  }
  return { handle, account, categories };
}

/** Every place the UUID could hide in a response: body strings, headers, decoded cursor segments. */
function leaks(response: request.Response, accountId: string): string[] {
  const needle = accountId.toLowerCase(), found: string[] = [];
  const inspect = (where: string, text: string) => {
    if (text.toLowerCase().includes(needle)) found.push(where);
    for (const segment of text.split(/[.\s"]/)) {
      if (segment.length < 16 || !/^[A-Za-z0-9_-]+$/.test(segment)) continue;
      const decoded = Buffer.from(segment, "base64url").toString("utf8");
      if (decoded.toLowerCase().includes(needle)) found.push(`${where} (base64 segment)`);
    }
  };
  for (const [name, value] of Object.entries(response.headers)) inspect(`header ${name}`, String(value));
  inspect("body", response.text ?? "");
  return found;
}

describe("SEC-03 - anonymous public responses carry no internal account id", () => {
  it("walks every public read and finds the account UUID nowhere", async () => {
    const { handle, account, categories } = await seedCreator();
    const paths = [
      `/api/explorers/v1/profiles/${handle}`,
      ...categories.flatMap((category) => [
        `/api/explorers/v1/profiles/${handle}/recommendations/${category}`,
        `/api/explorers/v1/profiles/${handle}/recommendations/${category}/${SLUG}`,
        `/api/explorers/v1/public/profiles/${handle}/collections/${category}`,
        `/api/explorers/v1/public/profiles/${handle}/collections/${category}/${SLUG}/recommendations`,
      ]),
      `/api/explorers/v1/profiles/${handle}/recommendations/books?limit=1`,
      `/api/explorers/v1/profiles/${handle}/recommendations/books/${SLUG}?limit=1`,
      `/api/explorers/v1/public/profiles/${handle}/collections/books/${SLUG}/recommendations?limit=1`,
      `/api/explorers/v1/public/recommendations/search?creatorHandle=${handle}&category=books`,
      `/sitemap.xml`,
    ];
    const statuses: Record<string, number> = {};
    for (const path of paths) {
      const response = await request(app).get(path);
      statuses[path] = response.status;
      expect(leaks(response, account), `${path} -> ${response.status}`).toEqual([]);
    }
    // A walk of 404s proves nothing: the shell, every category and the book reads must answer.
    expect(statuses[`/api/explorers/v1/profiles/${handle}`]).toBe(200);
    for (const category of categories)
      expect(statuses[`/api/explorers/v1/profiles/${handle}/recommendations/${category}`], category).toBe(200);
    expect(statuses[`/api/explorers/v1/profiles/${handle}/recommendations/books/${SLUG}?limit=1`]).toBe(200);

    // The shell still names the creator - by handle - and each list's account keeps its handle.
    const shell = (await request(app).get(`/api/explorers/v1/profiles/${handle}`)).body;
    expect(shell.username).toBe(handle);
    expect(shell).not.toHaveProperty("documentId");
    const books = (await request(app).get(`/api/explorers/v1/profiles/${handle}/recommendations/books`)).body;
    expect(books.bookLists[0].account).toEqual({ username: handle });
    // The detail of one recommendation is public too.
    const listing = (await request(app).get(`/api/explorers/v1/public/profiles/${handle}/collections/books/${SLUG}/recommendations`)).body;
    const first = JSON.stringify(listing).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    if (first) {
      const detail = await request(app).get(`/api/explorers/v1/public/profiles/${handle}/collections/books/${SLUG}/recommendations/${first}`);
      expect(leaks(detail, account)).toEqual([]);
    }
  });

  it("records an anonymous analytics event that names the creator by handle", async () => {
    const { handle, account } = await seedCreator();
    const response = await request(app).post("/api/explorers/analytics/events").send({
      basis: "anonymous-v1", eventId: `evt-${randomUUID()}`, accountId: handle,
      event: { type: "view", timestamp: new Date().toISOString(), page: "public-profile", canonicalPath: `/${handle}` },
    });
    expect([200, 201], JSON.stringify(response.body)).toContain(response.status);
    expect(leaks(response, account)).toEqual([]);
    const stored = (await pool.query(`SELECT count(*)::int AS n FROM analytics_events WHERE account_id=$1`, [account])).rows[0].n;
    expect(stored).toBe(1);
  });
});
