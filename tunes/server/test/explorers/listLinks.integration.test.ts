import {randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository} from "../../repositories/explorersRecommendationRepository";
import {readListLinksForCollection} from "../../repositories/listLinkRepository";
import {RecommendationService} from "../../application/recommendations";
import type {Actor} from "../../application/actor";
import {OwnerContentService} from "../../application/ownerContent";
import {publicLinkedLists} from "../../publicProfile/publicListLinkProjection";
import {publicLinkedProductsLists} from "../../publicProfile/publicProductsProjection";
import {publicLinkedPeopleLists} from "../../publicProfile/publicPeopleProjection";

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

/** A real owner membership, so the service's authorization passes for this account. */
async function ownerOf(accountId: string, scopes: string[]): Promise<Actor> {
  const userId = `u-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,'Owner',$2,true)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO user_security_state(user_id) VALUES($1)", [userId]);
  await pool.query("INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')", [accountId, userId]);
  return {userId, accountId, role: "owner", credential: {kind: "oauth", grantId: randomUUID(), scopes}};
}

async function attachVia(accountId: string, host: {id: string; category: string}, linked: {id: string; category: string}, extra: Record<string, unknown> = {}) {
  return repository.writeListLink(accountId, {hostCollectionId: host.id, expectedHostRevision: await categoryRevision(accountId, host.category),
    linkedCollectionId: linked.id, expectedLinkedRevision: await categoryRevision(accountId, linked.category), role: null, ...extra} as never, key());
}
const detachVia = async (accountId: string, hostCategory: string, linkId: string) =>
  repository.removeListLink(accountId, {linkId, expectedHostRevision: await categoryRevision(accountId, hostCategory)}, key());

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

describePg("list link commands (LNK-02, LNK-04, OWN-13)", () => {
  it("links any category to any category and bumps both category revisions", async () => {
    const owner = await account();
    const pairs: Array<[string, string]> = [["places", "books"], ["places", "apps"], ["places", "people"], ["places", "products"], ["guides", "products"], ["books", "apps"]];
    for (const [from, to] of pairs) {
      const host = await list(owner, from), linked = await list(owner, to);
      const before = {h: await categoryRevision(owner, from), l: await categoryRevision(owner, to)};
      const result = await attachVia(owner, host, linked);
      expect(result).toMatchObject({attached: true, link: {hostCollectionId: host.id, linkedCategory: to, displayOrder: 0}});
      expect(result.revisions[from as never]).toBeGreaterThan(before.h);
      expect(result.revisions[to as never]).toBeGreaterThan(before.l);
      expect(result.revisions).toEqual({[from]: await categoryRevision(owner, from), [to]: await categoryRevision(owner, to)});
    }
  });

  it("refuses a foreign linked list as 404 and writes nothing", async () => {
    const owner = await account(), other = await account();
    const mine = await list(owner, "places"), theirs = await list(other, "books");
    await expect(repository.writeListLink(owner, {hostCollectionId: mine.id, expectedHostRevision: await categoryRevision(owner, "places"),
      linkedCollectionId: theirs.id, expectedLinkedRevision: 1, role: null} as never, key())).rejects.toMatchObject({status: 404});
    expect((await pool.query("SELECT count(*)::int n FROM collection_list_links WHERE host_collection_id=$1", [mine.id])).rows[0].n).toBe(0);
  });

  it("refuses a stale host revision with 409", async () => {
    const owner = await account(); const s = await list(owner, "books"), t = await list(owner, "apps");
    await expect(repository.writeListLink(owner, {hostCollectionId: s.id, expectedHostRevision: 9999, linkedCollectionId: t.id,
      expectedLinkedRevision: await categoryRevision(owner, "apps"), role: null} as never, key())).rejects.toMatchObject({status: 409});
  });

  it("refuses the reverse of an existing link with 409 (one link per pair)", async () => {
    const owner = await account(); const s = await list(owner, "books"), t = await list(owner, "apps");
    await attachVia(owner, s, t);
    await expect(attachVia(owner, t, s)).rejects.toMatchObject({status: 409});
  });

  it("refuses a self link at the service boundary with 422", async () => {
    const owner = await account(); const s = await list(owner, "books");
    const service = new RecommendationService(pool);
    const actor = await ownerOf(owner, ["collections:write"]);
    const r = await categoryRevision(owner, "books");
    await expect(service.attachListLink(actor, s.id, {expectedHostRevision: r, linkedCollectionId: s.id, expectedLinkedRevision: r},
      {requestId: key(), idempotencyKey: key()} as never)).rejects.toMatchObject({status: 422});
  });

  it("the service lowercases both ids, so an upper-case id addresses the same lists", async () => {
    const owner = await account(); const s = await list(owner, "books"), t = await list(owner, "apps");
    const service = new RecommendationService(pool);
    const actor = await ownerOf(owner, ["collections:write"]);
    const result = await service.attachListLink(actor, s.id.toUpperCase(), {expectedHostRevision: await categoryRevision(owner, "books"),
      linkedCollectionId: t.id.toUpperCase(), expectedLinkedRevision: await categoryRevision(owner, "apps")}, {requestId: key(), idempotencyKey: key()} as never);
    expect(result.link).toMatchObject({hostCollectionId: s.id, linkedCollectionId: t.id});
  });

  it("detach returns the removed link and Undo restores role and position", async () => {
    const owner = await account(); const g = await list(owner, "guides");
    const a = await list(owner, "products"), b = await list(owner, "places"), c = await list(owner, "apps");
    await attachVia(owner, g, a, {role: "Packing list"}); const mid = await attachVia(owner, g, b, {role: "Places to choose from"}); await attachVia(owner, g, c);
    const removed = await detachVia(owner, "guides", mid.link.id);
    expect(removed).toMatchObject({attached: false, link: {linkedCollectionId: b.id, role: "Places to choose from", displayOrder: 1}});
    const outgoing = async () => (await readListLinksForCollection(pool, g.id, owner)).filter(x => x.direction === "outgoing");
    expect((await outgoing()).map(l => [l.collection.id, l.displayOrder])).toEqual([[a.id, 0], [c.id, 1]]);
    await attachVia(owner, g, b, {role: removed.link.role, position: removed.link.displayOrder});
    expect((await outgoing()).map(l => [l.collection.id, l.role, l.displayOrder])).toEqual([[a.id, "Packing list", 0], [b.id, "Places to choose from", 1], [c.id, null, 2]]);
  });

  it("detach keeps both lists and their items", async () => {
    const owner = await account(); const s = await list(owner, "places"), t = await list(owner, "people");
    const made = await attachVia(owner, s, t);
    await detachVia(owner, "places", made.link.id);
    expect((await pool.query("SELECT count(*)::int n FROM collections WHERE id=ANY($1::uuid[]) AND archived_at IS NULL", [[s.id, t.id]])).rows[0].n).toBe(2);
  });

  it("sets and clears a role", async () => {
    const owner = await account(); const g = await list(owner, "guides"), p = await list(owner, "products");
    const made = await attachVia(owner, g, p);
    const set = await repository.setListLinkRole(owner, {linkId: made.link.id, expectedHostRevision: await categoryRevision(owner, "guides"), role: "Packing list"}, key());
    expect(set.link.role).toBe("Packing list");
    const cleared = await repository.setListLinkRole(owner, {linkId: made.link.id, expectedHostRevision: await categoryRevision(owner, "guides"), role: null}, key());
    expect(cleared.link.role).toBeNull();
  });

  it("refuses detach of another account's link as 404", async () => {
    const owner = await account(), other = await account();
    const s = await list(owner, "books"), t = await list(owner, "apps");
    await list(other, "books");
    const made = await attachVia(owner, s, t);
    await expect(repository.removeListLink(other, {linkId: made.link.id, expectedHostRevision: await categoryRevision(other, "books")}, key())).rejects.toMatchObject({status: 404});
  });

  it("replays an identical command key without a second row", async () => {
    const owner = await account(); const s = await list(owner, "books"), t = await list(owner, "movies");
    const input = {hostCollectionId: s.id, expectedHostRevision: await categoryRevision(owner, "books"), linkedCollectionId: t.id,
      expectedLinkedRevision: await categoryRevision(owner, "movies"), role: null};
    const k = key();
    const first = await repository.writeListLink(owner, input as never, k);
    const again = await repository.writeListLink(owner, input as never, k);
    expect(again).toEqual(first);
    expect((await readListLinksForCollection(pool, s.id, owner))).toHaveLength(1);
  });
});

describePg("owner read (LNK-04, LNK-05)", () => {
  it("returns linkedLists for any category in both directions, one level, archived flagged", async () => {
    const owner = await account(); const s = await list(owner, "books"), t = await list(owner, "apps"), u = await list(owner, "movies");
    await attachVia(owner, s, t); await attachVia(owner, t, u);
    const reader = new OwnerContentService(pool, "x".repeat(32));
    const actor = await ownerOf(owner, ["collections:read"]);
    const read = await reader.getCollection(actor, s.id, {}, true) as any;
    expect(read.linkedLists.map((c: any) => [c.direction, c.collection.id])).toEqual([["outgoing", t.id]]);
    const middle = await reader.getCollection(actor, t.id, {}, true) as any;
    expect(middle.linkedLists.map((c: any) => [c.direction, c.collection.id])).toEqual([["outgoing", u.id], ["incoming", s.id]]);
    expect(read).not.toHaveProperty("locationLink");
    expect(read).not.toHaveProperty("linkedChildren");
    for (const category of ["places", "people", "products", "guides"]) {
      const empty = await reader.getCollection(actor, (await list(owner, category)).id, {}, true) as any;
      expect(empty.linkedLists).toEqual([]);
    }
    await pool.query("UPDATE collections SET archived_at=now() WHERE id=$1", [t.id]);
    expect(((await reader.getCollection(actor, s.id, {}, true)) as any).linkedLists.map((c: any) => c.collection.archived)).toEqual([true]);
  });
});

describePg("public link projection (LNK-07)", () => {
  it("returns a link only when both lists are public, published, live and not samples", async () => {
    const owner = await account();
    for (const c of ["places", "products", "people", "books", "apps"]) await categoryPublic(owner, c);
    const host = await list(owner, "places");
    const shown = await list(owner, "products"), draft = await list(owner, "people"), sample = await list(owner, "books"), onward = await list(owner, "apps");
    await publish(owner, host.id); await publish(owner, shown.id); await publish(owner, onward.id);
    await pool.query("UPDATE collections SET is_sample=true WHERE id=$1", [sample.id]); // samples are always private drafts (0071 CHECK)
    for (const t of [shown, draft, sample]) await attachVia(owner, host, t);
    await attachVia(owner, shown, onward);
    const db = await pool.connect();
    try {
      const cards = await publicLinkedLists(db, owner, host.id);
      expect(cards.map(c => c.collectionId)).toEqual([shown.id]);
      expect(cards[0]).not.toHaveProperty("linkedLists");
      expect((await publicLinkedProductsLists(db, owner, host.id)).map((l: any) => l.documentId)).toEqual([shown.id]);
      // The linked list sees the host as incoming, under the same rule.
      expect((await publicLinkedLists(db, owner, shown.id)).map(c => c.collectionId).sort()).toEqual([host.id, onward.id].sort());
      await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [host.id]);
      expect(await publicLinkedLists(db, owner, shown.id).then(r => r.map(c => c.collectionId))).toEqual([onward.id]);
      await categoryPublic(owner, "apps", false);
      expect(await publicLinkedLists(db, owner, shown.id)).toEqual([]);
    } finally { db.release(); }
  });

  it("serves rows backfilled from collection_location_links (LNK-09)", async () => {
    const owner = await account();
    for (const c of ["places", "people"]) await categoryPublic(owner, c);
    const location = await list(owner, "places"), people = await list(owner, "people");
    await publish(owner, location.id); await publish(owner, people.id);
    // S3-8 owns the SQL backfill; here we assert the projection reads the backfilled shape.
    await pool.query(`INSERT INTO collection_list_links(account_id,host_collection_id,host_category,linked_collection_id,linked_category,role,display_order)
      VALUES($1,$2,'places',$3,'people',NULL,0)`, [owner, location.id, people.id]);
    const db = await pool.connect();
    try {
      expect((await publicLinkedLists(db, owner, location.id, {category: "people"})).map(c => c.collectionId)).toEqual([people.id]);
      expect((await publicLinkedPeopleLists(db, owner, location.id)).map((l: any) => l.documentId)).toEqual([people.id]);
    } finally { db.release(); }
  });
});

describePg("create and attach (LNK-06)", () => {
  it("creates a list of any category and links it from the host atomically", async () => {
    const owner = await account(); const host = await list(owner, "guides");
    const before = await categoryRevision(owner, "guides");
    const created = await repository.createCollection(owner, {category: "products", title: "Packing", slug: `packing-${key()}`,
      attachTo: {hostCollectionId: host.id, expectedHostRevision: before, role: "Packing list"}} as never, key()) as any;
    expect(created.attachedTo).toMatchObject({hostCollectionId: host.id, hostCategoryRevision: await categoryRevision(owner, "guides")});
    const cards = await readListLinksForCollection(pool, host.id, owner);
    expect(cards.map(c => [c.direction, c.collection.id, c.role, c.linkId])).toEqual([["outgoing", created.id, "Packing list", created.attachedTo.linkId]]);
  });

  it("attaches through the service when the new list shares the host's category", async () => {
    const owner = await account(); const host = await list(owner, "books");
    const service = new RecommendationService(pool);
    const actor = await ownerOf(owner, ["collections:write"]);
    const created = await service.createCollection(actor, {category: "books", title: "Next", slug: `next-${key()}`,
      attachTo: {hostCollectionId: host.id.toUpperCase(), expectedHostRevision: await categoryRevision(owner, "books"), role: ""}}, {requestId: key(), idempotencyKey: key()} as never);
    expect(created.attachedTo).toMatchObject({hostCollectionId: host.id, hostCategoryRevision: await categoryRevision(owner, "books")});
    expect((await readListLinksForCollection(pool, host.id, owner)).map(c => [c.collection.id, c.role])).toEqual([[created.id, null]]);
  });

  it("rolls the new list back when the host revision is stale", async () => {
    const owner = await account(); const host = await list(owner, "places");
    const slug = `orphan-${key()}`;
    await expect(repository.createCollection(owner, {category: "people", title: "Orphan", slug,
      attachTo: {hostCollectionId: host.id, expectedHostRevision: 9999}} as never, key())).rejects.toMatchObject({status: 409});
    expect((await pool.query("SELECT count(*)::int n FROM collections WHERE account_id=$1 AND slug=$2", [owner, slug])).rows[0].n).toBe(0);
  });

  it("refuses a foreign or missing host as 404 without an orphan", async () => {
    const owner = await account(), other = await account(); const theirs = await list(other, "places");
    for (const hostId of [theirs.id, randomUUID()]) {
      const slug = `orphan-${key()}`;
      await expect(repository.createCollection(owner, {category: "people", title: "Orphan", slug,
        attachTo: {hostCollectionId: hostId, expectedHostRevision: 1, role: null}} as never, key())).rejects.toMatchObject({status: 404});
      expect((await pool.query("SELECT count(*)::int n FROM collections WHERE account_id=$1 AND slug=$2", [owner, slug])).rows[0].n).toBe(0);
    }
  });
});

/** A published person recommendation inside a list, so a linked list has content. */
async function person(accountId: string, collectionId: string, name: string) {
  const entity = await repository.resolvePersonEntity(accountId, {kind: "manual", category: "people", details: {title: name}} as never, key());
  const current = Number((await pool.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [collectionId])).rows[0].revision);
  const created = await repository.createRecommendation(accountId, {
    category: "people", entityId: entity.id, collectionId, expectedCollectionRevision: current, publicationState: "published",
  } as never, key());
  return created.id;
}
const linkCount = async (accountId: string) =>
  (await pool.query("SELECT count(*)::int AS n FROM collection_list_links WHERE account_id=$1", [accountId])).rows[0].n as number;

// Ported from the retired placeLinks.integration.test.ts: the rules that still hold when a
// Places list links a People or Products list through collection_list_links.
describePg("place links on the list link model (LNK-09)", () => {
  it("refuses a cross-account link from either direction", async () => {
    const owner = await account(), stranger = await account();
    const location = await list(owner, "places"), theirPeople = await list(stranger, "people");
    const myPeople = await list(owner, "people"), theirLocation = await list(stranger, "places");
    // Neither foreign list is visible to me, so each is 404 rather than a category complaint.
    await expect(attachVia(owner, location, theirPeople)).rejects.toMatchObject({status: 404});
    await expect(attachVia(owner, theirLocation, myPeople)).rejects.toMatchObject({status: 404});
    expect(await linkCount(owner)).toBe(0);
    expect(await linkCount(stranger)).toBe(0);
  });

  it("detaches without deleting the linked list or anything in it", async () => {
    const owner = await account();
    const location = await list(owner, "places"), people = await list(owner, "people");
    const recommendationId = await person(owner, people.id, "Ravi");
    const made = await attachVia(owner, location, people);
    await detachVia(owner, "places", made.link.id);
    expect(await linkCount(owner)).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM collections WHERE id=$1", [people.id])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM recommendations WHERE id=$1", [recommendationId])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM collection_items WHERE collection_id=$1", [people.id])).rows[0].n).toBe(1);
  });

  it("refuses to detach a link that does not exist", async () => {
    const owner = await account(); await list(owner, "places");
    await expect(detachVia(owner, "places", randomUUID())).rejects.toMatchObject({status: 404});
  });

  it("removes the link with either list and keeps the other", async () => {
    const owner = await account();
    const location = await list(owner, "places"), people = await list(owner, "people");
    await attachVia(owner, location, people);
    await pool.query("DELETE FROM collections WHERE id=$1", [location.id]);
    expect(await linkCount(owner)).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM collections WHERE id=$1", [people.id])).rows[0].n).toBe(1);
  });

  it("serves a public linked list under a public location, and hides a private one", async () => {
    const owner = await account();
    await categoryPublic(owner, "places"); await categoryPublic(owner, "people");
    const location = await list(owner, "places"); await publish(owner, location.id);
    const open = await list(owner, "people"), hidden = await list(owner, "people");
    await person(owner, open.id, "Public person"); await person(owner, hidden.id, "Private person");
    await publish(owner, open.id);
    await attachVia(owner, location, open); await attachVia(owner, location, hidden);
    const client = await pool.connect();
    try {
      const served = await publicLinkedPeopleLists(client, owner, location.id);
      // The private list is absent, not redacted.
      expect(served.map((entry: any) => entry.documentId)).toEqual([open.id]);
      expect((served[0] as any).recommended_people).toHaveLength(1);
    } finally { client.release(); }
  });

  it("removes every linked list when its category is unpublished, without touching a link", async () => {
    const owner = await account();
    await categoryPublic(owner, "places"); await categoryPublic(owner, "products");
    const location = await list(owner, "places"); await publish(owner, location.id);
    const products = await list(owner, "products"); await publish(owner, products.id);
    await attachVia(owner, location, products);
    const client = await pool.connect();
    try {
      expect((await publicLinkedProductsLists(client, owner, location.id)).map((entry: any) => entry.documentId)).toEqual([products.id]);
      await categoryPublic(owner, "products", false);
      expect(await publicLinkedProductsLists(client, owner, location.id)).toEqual([]);
      // The relation is intact; only its public traversal stopped.
      expect((await readListLinksForCollection(pool, location.id, owner)).map(c => c.collection.id)).toEqual([products.id]);
    } finally { client.release(); }
  });

  it("hides every linked list when the account stops being publicly eligible", async () => {
    const owner = await account();
    await categoryPublic(owner, "places"); await categoryPublic(owner, "people");
    const location = await list(owner, "places"); await publish(owner, location.id);
    const people = await list(owner, "people"); await publish(owner, people.id);
    await attachVia(owner, location, people);
    const client = await pool.connect();
    try {
      expect(await publicLinkedPeopleLists(client, owner, location.id)).toHaveLength(1);
      await pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1", [owner]);
      expect(await publicLinkedPeopleLists(client, owner, location.id)).toEqual([]);
    } finally { client.release(); }
  });

  it("serves a linked list only under the lists it is linked with", async () => {
    const owner = await account();
    await categoryPublic(owner, "places"); await categoryPublic(owner, "people");
    const mine = await list(owner, "places"), other = await list(owner, "places");
    await publish(owner, mine.id); await publish(owner, other.id);
    const people = await list(owner, "people"); await publish(owner, people.id);
    await attachVia(owner, mine, people);
    const client = await pool.connect();
    try {
      expect((await publicLinkedPeopleLists(client, owner, mine.id)).map((entry: any) => entry.documentId)).toEqual([people.id]);
      expect(await publicLinkedPeopleLists(client, owner, other.id)).toEqual([]);
    } finally { client.release(); }
  });

  it("is cleared by the statement a terminal purge runs for this account", async () => {
    // purge_explorers_account_content deletes the account's collections, which cascades every link.
    const owner = await account();
    const location = await list(owner, "places"), people = await list(owner, "people");
    await attachVia(owner, location, people);
    await pool.query("DELETE FROM collections WHERE account_id=$1", [owner]);
    expect(await linkCount(owner)).toBe(0);
  });
});

describePg("link commands are scoped to the list in the URL (review)", () => {
  const ctx = () => ({requestId: key(), idempotencyKey: key()}) as never;

  it("detach and role change 404 when the link does not touch the addressed list, and work from either end", async () => {
    const owner = await account();
    const a = await list(owner, "books"), b = await list(owner, "apps"), c = await list(owner, "movies");
    const made = await attachVia(owner, b, c);
    const service = new RecommendationService(pool);
    const actor = await ownerOf(owner, ["collections:write"]);
    await expect(service.setListLinkRole(actor, a.id, made.link.id, {expectedHostRevision: await categoryRevision(owner, "apps"), role: "Watch list"}, ctx()))
      .rejects.toMatchObject({status: 404, message: "Resource unavailable"});
    await expect(service.detachListLink(actor, a.id, made.link.id, {expectedHostRevision: await categoryRevision(owner, "apps")}, ctx()))
      .rejects.toMatchObject({status: 404, message: "Resource unavailable"});
    expect(await linkCount(owner)).toBe(1);
    // The linked end (incoming) may change the role; the host end may detach. Upper case addresses the same list.
    const role = await service.setListLinkRole(actor, c.id.toUpperCase(), made.link.id, {expectedHostRevision: await categoryRevision(owner, "apps"), role: "Watch list"}, ctx());
    expect(role.link.role).toBe("Watch list");
    const removed = await service.detachListLink(actor, b.id, made.link.id.toUpperCase(), {expectedHostRevision: await categoryRevision(owner, "apps")}, ctx());
    expect(removed).toMatchObject({attached: false, link: {id: made.link.id}});
  });

  it("create-and-attach lowercases the host id, so a mixed-case replay is the same request", async () => {
    const owner = await account(); const host = await list(owner, "guides");
    const service = new RecommendationService(pool);
    const actor = await ownerOf(owner, ["collections:write"]);
    const slug = `replay-${key()}`, idempotencyKey = key(), expectedHostRevision = await categoryRevision(owner, "guides");
    const input = (hostCollectionId: string) => ({category: "products", title: "Replay", slug, attachTo: {hostCollectionId, expectedHostRevision}});
    const first = await service.createCollection(actor, input(host.id.toUpperCase()), {requestId: key(), idempotencyKey} as never);
    const again = await service.createCollection(actor, input(host.id), {requestId: key(), idempotencyKey} as never);
    expect(again).toEqual(first);
    expect(first.attachedTo?.hostCollectionId).toBe(host.id);
    expect(await readListLinksForCollection(pool, host.id, owner)).toHaveLength(1);
  });
});
