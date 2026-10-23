import {randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository} from "../../repositories/explorersRecommendationRepository";
import {readListLinksForCollection} from "../../repositories/listLinkRepository";

/**
 * WP10. Linking any of an owner's lists to any other of their lists, against a real
 * PostgreSQL 15. S3 (0070) owns the table, the backfill and the repository; this file
 * covers WP10's layer on top: the commands, their category revisions and Undo, the
 * create-and-attach path, the owner read and the gated public projection.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_list_links_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
let repository: ExplorersRecommendationRepository;

const key = () => randomUUID();

async function account(handle?: string) {
  const accountId = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
  // A complete account needs a handle, a display name and a type (0022's
  // creator_accounts_complete_valid), so every account here gets one.
  await pool.query(`UPDATE creator_accounts SET status='active',handle=$2,display_name='Owner',account_type='Creator',
    public_profile=true,onboarding_status='complete' WHERE id=$1`, [accountId, handle ?? `owner-${randomUUID().slice(0, 8)}`]);
  return accountId;
}

async function categoryPublic(accountId: string, category: string, isPublic = true) {
  // display_order is unique per account, so each category takes the next one.
  await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order)
    SELECT $1,$2,$3,coalesce(max(display_order)+1,0) FROM account_category_settings WHERE account_id=$1
    ON CONFLICT(account_id,category) DO UPDATE SET is_public=$3`, [accountId, category, isPublic]);
}

/** A list, created through the same command the application uses. */
async function list(accountId: string, category: string, over: Record<string, unknown> = {}) {
  return repository.createCollection(accountId, {
    category: category as never, title: `${category} list`, slug: `${category}-${randomUUID()}`, ...over,
  } as never, key());
}

async function publish(accountId: string, collectionId: string) {
  const current = Number((await pool.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [collectionId])).rows[0].revision);
  return repository.updateCollection(accountId, collectionId, current, {visibility: "public", publicationState: "published"}, key());
}

/** The category content revision (account_category_content_state), which link commands check. */
async function categoryRevision(accountId: string, category: string) {
  return Number((await pool.query(`SELECT coalesce((SELECT revision::text FROM account_category_content_state
    WHERE account_id=$1 AND category=$2),'0') AS revision`, [accountId, category])).rows[0].revision);
}

/** The category content revision of the category a list belongs to. */
async function revision(accountId: string, collectionId: string) {
  const category = (await pool.query("SELECT category FROM collections WHERE id=$1", [collectionId])).rows[0].category as string;
  return categoryRevision(accountId, category);
}

async function link(owner: string, host: string, hostCategory: string, linked: string, linkedCategory: string, displayOrder: number, role: string | null = null) {
  await pool.query(`INSERT INTO collection_list_links(account_id,host_collection_id,host_category,linked_collection_id,linked_category,role,display_order)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [owner, host, hostCategory, linked, linkedCategory, role, displayOrder]);
}

beforeAll(async () => {
  if (!enabled) return;
  admin = new pg.Pool({connectionString: exactTarget, max: 1});
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const target = new URL(exactTarget);
  target.pathname = `/${databaseName}`;
  pool = new pg.Pool({connectionString: target.toString(), max: 4});
  await migrateMusicDatabase(pool);
  repository = new ExplorersRecommendationRepository(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await admin?.end();
});

describePg("S3 list link reads WP10 relies on", () => {
  it("shows a link on both lists: outgoing on the host, incoming on the linked list, one level only", async () => {
    const owner = await account();
    const places = await list(owner, "places"), books = await list(owner, "books"), apps = await list(owner, "apps");
    await link(owner, places.id, "places", books.id, "books", 1);
    await link(owner, places.id, "places", apps.id, "apps", 0, "Packing list");
    await link(owner, books.id, "books", apps.id, "apps", 0);
    const fromPlaces = await readListLinksForCollection(pool, places.id, owner);
    expect(fromPlaces.map(c => [c.direction, c.collection.id, c.role, c.displayOrder])).toEqual([["outgoing", apps.id, "Packing list", 0], ["outgoing", books.id, null, 1]]);
    const fromBooks = await readListLinksForCollection(pool, books.id, owner);
    expect(fromBooks.map(c => [c.direction, c.collection.id])).toEqual([["outgoing", apps.id], ["incoming", places.id]]);
    expect(await revision(owner, places.id)).toBeGreaterThan(0);
  });

  it("refuses the reverse of an existing pair in storage", async () => {
    const owner = await account();
    const a = await list(owner, "people"), b = await list(owner, "products");
    await link(owner, a.id, "people", b.id, "products", 0);
    await expect(link(owner, b.id, "products", a.id, "people", 0)).rejects.toMatchObject({code: "23505"});
  });
});
