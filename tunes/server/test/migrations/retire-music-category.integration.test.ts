import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMusicMigrations, migrateMusicDatabase, verifyMusicDatabase } from "../../db/migrate";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../../shared/music-migration-contract";

/**
 * P3-6: 0057 retires the music category. Every case runs against ONE database that was
 * migrated to 0056, seeded with exactly the shapes 0057 has to clean, and only then
 * upgraded - without the seed each assertion would pass vacuously on an empty table.
 */
const adminUrl = process.env.DATABASE_URL_TEST ?? "";
const describePostgres = process.env.MUSIC_C3_POSTGRES_TEST === "1" ? describe.sequential : describe.skip;
const RETIREMENT = "0057_retire_music_category";
const databaseName = `music_c3_retire_music_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
const seeded = {
  music: "", duplicates: "", malformed: "", untouched: "",
  musicEventId: "", booksEventId: "",
};

async function account(categories: readonly string[], pinned: Record<string, number> = {}): Promise<string> {
  const id = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
  for (const [order, category] of categories.entries()) {
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order,pinned_order) VALUES($1,$2,true,$3,$4)",
      [id, category, order, pinned[category] ?? null]);
  }
  return id;
}

async function presentation(accountId: string, themeSettings: unknown): Promise<void> {
  await pool.query("INSERT INTO account_presentation(account_id,theme_settings) VALUES($1,$2)", [accountId, JSON.stringify(themeSettings)]);
}

async function event(accountId: string, page: string, category: string): Promise<string> {
  const clientEventId = `event-${randomUUID()}`;
  const id = (await pool.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,occurred_at,
      canonical_path,consent_version) VALUES($1,$2,'view',$3,$4,now(),'/owner','explorers-analytics-v1') RETURNING id`,
    [accountId, clientEventId, page, category])).rows[0].id as string;
  await pool.query("INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id) VALUES($1,$2,$3,$4)",
    [accountId, clientEventId, createHash("sha256").update(clientEventId).digest(), id]);
  return id;
}

const ALL_NINE = ["places", "guides", "music", "movies", "books", "games", "apps", "products", "people"] as const;
const SURVIVING = ["places", "guides", "movies", "books", "games", "apps", "products", "people"];

describePostgres("0057 retire music category", () => {
  beforeAll(async () => {
    const target = validateIntegrationDatabaseTarget(adminUrl);
    admin = new pg.Pool({ connectionString: target.toString(), max: 2 });
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 4 });

    const prior = loadMusicMigrations().filter((migration) => migration.id < RETIREMENT);
    expect(prior.at(-1)?.id).toBe("0056_explorers_app_enrichment_jobs");
    await migrateMusicDatabase(pool, { migrations: prior, testOnlyExpectedIds: prior.map((migration) => migration.id) });

    // A new account as initialAccount.ts seeded it: nine rows, music at display order 2,
    // music pinned first and books second, a music first view and music in the order.
    seeded.music = await account(ALL_NINE, { music: 0, books: 1 });
    await presentation(seeded.music, { landingTab: "music", recommendations: { layout: "grid", categoryOrder: ["books", "music", "places"] } });
    // Nine non-music entries with duplicates are valid under today's .max(9) and would
    // fail .max(8) after narrowing if only "music" were stripped.
    seeded.duplicates = await account(ALL_NINE);
    await presentation(seeded.duplicates, { recommendations: { categoryOrder: Array(9).fill("books") } });
    // A categoryOrder that is not an array: jsonb_array_elements on it would abort 0057.
    seeded.malformed = await account(ALL_NINE);
    await presentation(seeded.malformed, { landingTab: "books", recommendations: { categoryOrder: "books" } });
    // An account already free of music must come through untouched.
    seeded.untouched = await account(SURVIVING, { places: 0 });
    await presentation(seeded.untouched, { landingTab: "places", recommendations: { categoryOrder: ["people", "places"] } });
    // A music analytics event WITH a receipt: the receipt FK is ON DELETE RESTRICT.
    seeded.musicEventId = await event(seeded.music, "public-music", "music");
    seeded.booksEventId = await event(seeded.music, "public-books", "books");

    const upgraded = await migrateMusicDatabase(pool);
    // Later migrations apply on top; this suite is about 0057's effect, not the head.
    expect(upgraded.appliedIds[0]).toBe(RETIREMENT);
    expect((await verifyMusicDatabase(pool)).currentId).toBe(EXPECTED_MUSIC_MIGRATION_ID);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (!admin) return;
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.end();
  });

  it("removes every music category row and keeps display and pinned order contiguous", async () => {
    expect((await pool.query("SELECT count(*)::int AS n FROM account_category_settings WHERE category='music'")).rows[0].n).toBe(0);
    const gaps = await pool.query(`SELECT account_id FROM account_category_settings GROUP BY account_id
      HAVING max(display_order) <> count(*) - 1
          OR coalesce(max(pinned_order), -1) <> count(pinned_order) - 1`);
    expect(gaps.rows).toEqual([]);
    const rows = (await pool.query<{ category: string; display_order: number; pinned_order: number | null }>(
      "SELECT category,display_order,pinned_order FROM account_category_settings WHERE account_id=$1 ORDER BY display_order",
      [seeded.music])).rows;
    // Relative order survives; books moves from pinned 1 to pinned 0.
    expect(rows.map((row) => row.category)).toEqual(SURVIVING);
    expect(rows.filter((row) => row.pinned_order !== null)).toEqual([{ category: "books", display_order: 3, pinned_order: 0 }]);
  });

  it("refuses a new music category row", async () => {
    // Break caught: rows deleted but the CHECK still admits music, so an old API
    // container re-inserts one and the next owner read 503s.
    await expect(pool.query("INSERT INTO account_category_settings(account_id,category,display_order) VALUES ($1,'music',99)",
      [seeded.untouched])).rejects.toMatchObject({ code: "23514" });
  });

  it("removes music analytics events even when they have receipts, and keeps the receipt as retired", async () => {
    // Break caught: analytics_event_receipts.event_id references analytics_events ON
    // DELETE RESTRICT. A bare DELETE raises 23503 and the whole migration rolls back.
    expect((await pool.query("SELECT count(*)::int AS n FROM analytics_events WHERE category='music' OR page='public-music'")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT id FROM analytics_events WHERE id=$1", [seeded.booksEventId])).rows).toHaveLength(1);
    const receipts = (await pool.query("SELECT event_id,retired_at FROM analytics_event_receipts WHERE account_id=$1 ORDER BY event_id NULLS FIRST",
      [seeded.music])).rows;
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({ event_id: null });
    expect(receipts[0].retired_at).toBeInstanceOf(Date);
    expect(receipts[1]).toMatchObject({ event_id: seeded.booksEventId, retired_at: null });
  });

  it("refuses a new music analytics category or public-music page", async () => {
    for (const [page, category] of [["public-music", "places"], ["public-books", "music"]]) {
      await expect(pool.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,occurred_at,
          canonical_path,consent_version) VALUES($1,$2,'view',$3,$4,now(),'/owner','explorers-analytics-v1')`,
        [seeded.untouched, `event-${randomUUID()}`, page, category])).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("rewrites a stored music landing tab and strips music from category order", async () => {
    const bad = await pool.query(`SELECT count(*)::int AS n FROM account_presentation
      WHERE theme_settings->>'landingTab'='music' OR theme_settings->'recommendations'->'categoryOrder' ? 'music'`);
    expect(bad.rows[0].n).toBe(0);
    const theme = (await pool.query("SELECT theme_settings FROM account_presentation WHERE account_id=$1", [seeded.music])).rows[0].theme_settings;
    expect(theme).toEqual({ landingTab: "all-recommendations", recommendations: { layout: "grid", categoryOrder: ["books", "places"] } });
  });

  it("normalises a category order with duplicates and no music", async () => {
    // Break caught: nine "books" survive a music-only rewrite and then fail .max(8),
    // taking that owner's profile read down with a 503.
    const theme = (await pool.query("SELECT theme_settings FROM account_presentation WHERE account_id=$1", [seeded.duplicates])).rows[0].theme_settings;
    expect(theme.recommendations.categoryOrder).toEqual(["books"]);
    const tooLong = await pool.query(`SELECT count(*)::int AS n FROM account_presentation
      WHERE jsonb_typeof(theme_settings->'recommendations'->'categoryOrder')='array'
        AND jsonb_array_length(theme_settings->'recommendations'->'categoryOrder') > 8`);
    expect(tooLong.rows[0].n).toBe(0);
  });

  it("drops a category order that is not an array instead of aborting", async () => {
    const theme = (await pool.query("SELECT theme_settings FROM account_presentation WHERE account_id=$1", [seeded.malformed])).rows[0].theme_settings;
    expect(theme).toEqual({ landingTab: "books", recommendations: {} });
  });

  it("leaves an account that never had music exactly as it was", async () => {
    const theme = (await pool.query("SELECT theme_settings FROM account_presentation WHERE account_id=$1", [seeded.untouched])).rows[0].theme_settings;
    expect(theme).toEqual({ landingTab: "places", recommendations: { categoryOrder: ["people", "places"] } });
    const rows = (await pool.query("SELECT category,display_order,pinned_order FROM account_category_settings WHERE account_id=$1 ORDER BY display_order",
      [seeded.untouched])).rows;
    expect(rows).toEqual(SURVIVING.map((category, order) => ({ category, display_order: order, pinned_order: category === "places" ? 0 : null })));
  });
});
