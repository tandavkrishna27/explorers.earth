import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository} from "../../repositories/explorersRecommendationRepository";
import {readLocationLink, readLinkedChildren} from "../../repositories/placeLinkRepository";
import {publicLinkedPeopleLists} from "../../publicProfile/publicPeopleProjection";
import {publicLinkedProductsLists} from "../../publicProfile/publicProductsProjection";

/**
 * Ticket 5.2. Linking a Products or People list to a location, against a real
 * PostgreSQL 15.
 *
 * Four rules carry this ticket, and each is asserted here by trying to break it:
 * one location parent per child, one account on both sides, a location list as the
 * parent (never a place recommendation), and a detach that leaves the child list and its
 * contents intact. The public half asserts that traversal re-gates every hop - a private
 * child under a public location is absent, and unpublishing the child's category removes
 * every linked child without touching a single link row.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_place_links_${process.pid}`;

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
  const revision = Number((await pool.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [collectionId])).rows[0].revision);
  return repository.updateCollection(accountId, collectionId, revision, {visibility: "public", publicationState: "published"}, key());
}

async function revision(collectionId: string) {
  return Number((await pool.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [collectionId])).rows[0].revision);
}

/** A parent that is not a list has no revision; the caller still believed one. */
async function optionalRevision(collectionId: string) {
  const row = (await pool.query("SELECT revision::text AS revision FROM collections WHERE id=$1", [collectionId])).rows[0];
  return row ? Number(row.revision) : 1;
}

/** Link rows for one account. The fixture database is shared across cases. */
async function linkCount(accountId: string) {
  return (await pool.query("SELECT count(*)::int AS count FROM collection_location_links WHERE account_id=$1", [accountId])).rows[0].count as number;
}

/** Snapshot all owned command effects, including failed receipts and category cursors. */
async function guardedCreateState(accountIds: string[]) {
  const collections = (await pool.query("SELECT id,account_id,category,revision::text,archived_at FROM collections WHERE account_id=ANY($1::uuid[]) ORDER BY id", [accountIds])).rows;
  const links = (await pool.query("SELECT * FROM collection_location_links WHERE account_id=ANY($1::uuid[]) ORDER BY child_collection_id", [accountIds])).rows;
  const categories = (await pool.query("SELECT * FROM account_category_content_state WHERE account_id=ANY($1::uuid[]) ORDER BY account_id,category", [accountIds])).rows;
  const receipts = (await pool.query("SELECT * FROM application_command_receipts WHERE account_id=ANY($1::uuid[]) ORDER BY id", [accountIds])).rows;
  return {collections, links, categories, receipts};
}

function guardedCreateInput(category: "products" | "people", parentId: string, parentExpectedRevision: number) {
  return {category, title: "Guarded child", slug: `guarded-${randomUUID()}`, parentLocationCollectionId: parentId, parentExpectedRevision};
}

async function attach(accountId: string, childId: string, locationId: string) {
  return repository.writeLocationMembership(accountId, {
    childCollectionId: childId, expectedChildRevision: await revision(childId),
    locationCollectionId: locationId, expectedLocationRevision: await optionalRevision(locationId),
  }, key(), true);
}

async function detach(accountId: string, childId: string) {
  return repository.writeLocationMembership(accountId, {
    childCollectionId: childId, expectedChildRevision: await revision(childId),
  }, key(), false);
}

async function readyMedia(accountId: string, salt: string, purpose = "recommendation") {
  return (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
    VALUES($1,$3,'ready','image/png',1024,$2,now()) RETURNING id`,
    [accountId, createHash("sha256").update(salt).digest(), purpose])).rows[0].id as string;
}

/** A published person recommendation inside a child list, so a linked list has content. */
async function person(accountId: string, collectionId: string, name: string) {
  const entity = await repository.resolvePersonEntity(accountId, {kind: "manual", category: "people", details: {title: name}}, key());
  const created = await repository.createRecommendation(accountId, {
    category: "people", entityId: entity.id, collectionId, expectedCollectionRevision: await revision(collectionId),
    publicationState: "published",
  }, key());
  return created.id;
}

describePg("Places link storage against PostgreSQL", () => {
  beforeAll(async () => {
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

  it("links a child list to a location and reports it from both ends", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    await attach(accountId, people.id, location.id);

    expect(await readLocationLink(pool, people.id, accountId)).toEqual({
      childCollectionId: people.id, childCategory: "people", locationCollectionId: location.id,
    });
    expect(await readLinkedChildren(pool, location.id, accountId)).toEqual([
      {childCollectionId: people.id, childCategory: "people"},
    ]);
  });

  it("keeps one location parent per child, and permits an explicit detach then attach", async () => {
    const accountId = await account();
    const first = await list(accountId, "places");
    const second = await list(accountId, "places");
    const products = await list(accountId, "products");
    await attach(accountId, products.id, first.id);

    // The ticket's own case: attaching to a second location is refused and the original
    // relation is unchanged - not silently moved.
    await expect(attach(accountId, products.id, second.id)).rejects.toMatchObject({status: 409});
    expect((await readLocationLink(pool, products.id, accountId))?.locationCollectionId).toBe(first.id);

    await detach(accountId, products.id);
    await attach(accountId, products.id, second.id);
    expect((await readLocationLink(pool, products.id, accountId))?.locationCollectionId).toBe(second.id);
  });

  it("refuses a place recommendation id as the parent, and creates no accidental relation", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const entity = await repository.resolvePlaceEntity(accountId, {kind: "manual", category: "places", details: {title: "A place"}}, key());
    const place = await repository.createRecommendation(accountId, {
      category: "places", entityId: entity.id, collectionId: location.id, expectedCollectionRevision: await revision(location.id),
    }, key());
    const people = await list(accountId, "people");

    // A place recommendation id is not a list, so there is nothing to lock as a parent.
    await expect(attach(accountId, people.id, place.id)).rejects.toMatchObject({status: 404});
    expect(await readLocationLink(pool, people.id, accountId)).toBeNull();
    expect(await linkCount(accountId)).toBe(0);
  });

  it("refuses a parent that is not a location list", async () => {
    const accountId = await account();
    const books = await list(accountId, "books");
    const people = await list(accountId, "people");
    await expect(attach(accountId, people.id, books.id)).rejects.toMatchObject({status: 422});
    expect(await readLocationLink(pool, people.id, accountId)).toBeNull();
  });

  it("refuses a child that is not a Products or People list", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const books = await list(accountId, "books");
    await expect(attach(accountId, books.id, location.id)).rejects.toMatchObject({status: 422});
  });

  it("refuses a cross-account attachment from either direction", async () => {
    const owner = await account();
    const stranger = await account();
    const location = await list(owner, "places");
    const theirPeople = await list(stranger, "people");
    const myPeople = await list(owner, "people");
    const theirLocation = await list(stranger, "places");

    // The stranger's list under my location, and my list under the stranger's location.
    // Neither is visible to me, so each is 404 rather than a category complaint.
    await expect(attach(owner, theirPeople.id, location.id)).rejects.toMatchObject({status: 404});
    await expect(attach(owner, myPeople.id, theirLocation.id)).rejects.toMatchObject({status: 404});
    expect(await linkCount(owner)).toBe(0);
    expect(await linkCount(stranger)).toBe(0);
  });

  it("detaches without deleting the child list or anything in it", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    const recommendationId = await person(accountId, people.id, "Ravi");
    await attach(accountId, people.id, location.id);

    await detach(accountId, people.id);
    expect(await readLocationLink(pool, people.id, accountId)).toBeNull();
    // The list and its contents survive: a linked list is one list, reachable on its own.
    expect((await pool.query("SELECT count(*)::int AS count FROM collections WHERE id=$1", [people.id])).rows[0].count).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS count FROM recommendations WHERE id=$1", [recommendationId])).rows[0].count).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS count FROM collection_items WHERE collection_id=$1", [people.id])).rows[0].count).toBe(1);
  });

  it("refuses to detach a list that is not linked", async () => {
    const accountId = await account();
    const people = await list(accountId, "people");
    await expect(detach(accountId, people.id)).rejects.toMatchObject({status: 404});
  });

  it("creates a child list already linked, and leaves no orphan when the parent is bad", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const linked = await list(accountId, "people", {parentLocationCollectionId: location.id, parentExpectedRevision: await revision(location.id)});
    expect((await readLocationLink(pool, linked.id, accountId))?.locationCollectionId).toBe(location.id);

    // A failed parent must leave no orphan child - the whole create rolls back.
    const before = (await pool.query("SELECT count(*)::int AS count FROM collections WHERE account_id=$1", [accountId])).rows[0].count;
    await expect(list(accountId, "people", {parentLocationCollectionId: randomUUID(), parentExpectedRevision: 1})).rejects.toMatchObject({status: 404});
    expect((await pool.query("SELECT count(*)::int AS count FROM collections WHERE account_id=$1", [accountId])).rows[0].count).toBe(before);
  });

  it("guarded parent create preserves ordinary compatibility and rejects invalid revision pairs", async () => {
    const owner = await account(), parent = await list(owner, "places");
    const ordinaryInput = {category: "products" as const, title: "Ordinary", slug: `ordinary-${randomUUID()}`};
    const ordinaryKey = key(), ordinary = await repository.createCollection(owner, ordinaryInput, ordinaryKey);
    expect(ordinary).toEqual({id: expect.any(String), accountId: owner, ...ordinaryInput, visibility: "private", publicationState: "draft", revision: 1, description: null, heading: null, coverMediaId: null});
    const afterOrdinary = await guardedCreateState([owner]);
    expect(await repository.createCollection(owner, ordinaryInput, ordinaryKey)).toEqual(ordinary);
    expect(await guardedCreateState([owner])).toEqual(afterOrdinary);
    const paired = guardedCreateInput("products", parent.id, await revision(parent.id));
    const {parentExpectedRevision, ...idOnly} = paired;
    const {parentLocationCollectionId, ...revisionOnly} = paired;
    const invalid = [idOnly, revisionOnly, ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null].map(value => ({...paired, parentExpectedRevision: value})), ...["places", "books", "movies", "games", "apps", "guides"].map(category => ({...paired, category}))];
    for (const input of invalid) {
      const before = await guardedCreateState([owner]);
      await expect(repository.createCollection(owner, input as never, key())).rejects.toMatchObject({status: 422});
      expect(await guardedCreateState([owner])).toEqual(before);
    }
  });

  it("guarded parent create links Products and People atomically and refuses parents without orphans", async () => {
    const owner = await account(), stranger = await account();
    const parent = await list(owner, "places"), foreign = await list(stranger, "places"), wrong = await list(owner, "books"), archived = await list(owner, "places");
    await pool.query("UPDATE collections SET archived_at=now() WHERE id=$1", [archived.id]);
    // Empty Places collections are valid parents; no recommendation is required.
    expect((await pool.query("SELECT recommendation_id FROM collection_items WHERE collection_id=$1", [parent.id])).rowCount).toBe(0);
    for (const category of ["products", "people"] as const) {
      const observed = await revision(parent.id), before = await guardedCreateState([owner, stranger]);
      const child = await repository.createCollection(owner, guardedCreateInput(category, parent.id, observed) as never, key());
      expect(child).toMatchObject({id: expect.any(String), accountId: owner, category, revision: 1, parentLocation: {id: parent.id, revision: observed + 1}});
      expect(child.id).not.toBe(parent.id);
      expect(await revision(parent.id)).toBe(observed + 1);
      expect(await readLocationLink(pool, child.id, owner)).toEqual({childCollectionId: child.id, childCategory: category, locationCollectionId: parent.id});
      const after = await guardedCreateState([owner, stranger]);
      expect(after.collections).toHaveLength(before.collections.length + 1);
      expect(after.links).toHaveLength(before.links.length + 1);
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      for (const changed of ["places", category]) {
        const cursor = (state: typeof after) => Number(state.categories.find(row => row.account_id === owner && row.category === changed)?.revision ?? 0);
        expect(cursor(after)).toBeGreaterThan(cursor(before));
      }
    }
    const entity = await repository.resolvePlaceEntity(owner, {kind: "manual", category: "places", details: {title: "Bare place"}}, key());
    const bare = await repository.createRecommendation(owner, {category: "places", entityId: entity.id, collectionId: parent.id, expectedCollectionRevision: await revision(parent.id)}, key());
    for (const category of ["products", "people"] as const) {
      const cases = [[parent.id, (await revision(parent.id)) - 1, 409], [foreign.id, await revision(foreign.id), 404], [randomUUID(), 1, 404], [archived.id, await revision(archived.id), 404], [wrong.id, await revision(wrong.id), 422], [bare.id, 1, 404]] as const;
      for (const [id, expected, status] of cases) {
        const before = await guardedCreateState([owner, stranger]);
        await expect(repository.createCollection(owner, guardedCreateInput(category, id, expected) as never, key())).rejects.toMatchObject({status});
        expect(await guardedCreateState([owner, stranger])).toEqual(before);
      }
    }
  });

  it("guarded parent create replays its full receipt concurrently and after later parent mutation", async () => {
    for (const category of ["products", "people"] as const) {
      const owner = await account(), parent = await list(owner, "places"), other = await list(owner, "places");
      const observed = await revision(parent.id), input = guardedCreateInput(category, parent.id, observed), commandKey = key(), before = await guardedCreateState([owner]);
      const [first, concurrent] = await Promise.all([repository.createCollection(owner, input as never, commandKey), repository.createCollection(owner, input as never, commandKey)]);
      expect(first).toMatchObject({accountId: owner, category, revision: 1, parentLocation: {id: parent.id, revision: observed + 1}});
      expect(concurrent).toEqual(first);
      const committed = await guardedCreateState([owner]);
      expect(committed.collections).toHaveLength(before.collections.length + 1);
      expect(committed.links).toHaveLength(before.links.length + 1);
      expect(committed.receipts).toHaveLength(before.receipts.length + 1);
      expect(await revision(parent.id)).toBe(observed + 1);
      expect(committed.receipts.filter(row => row.operation === "createCollection" && row.response.id === first.id)).toHaveLength(1);
      expect(committed.receipts.find(row => row.response.id === first.id)?.response).toEqual(first);
      expect(await repository.createCollection(owner, input as never, commandKey)).toEqual(first);
      expect(await guardedCreateState([owner])).toEqual(committed);
      await repository.updateCollection(owner, parent.id, await revision(parent.id), {title: "Later mutation"}, key());
      const later = await guardedCreateState([owner]);
      expect(await repository.createCollection(owner, input as never, commandKey)).toEqual(first);
      expect(await guardedCreateState([owner])).toEqual(later);
      for (const changed of [{...input, title: "Changed"}, {...input, parentLocationCollectionId: other.id}, {...input, parentExpectedRevision: await revision(parent.id)}]) {
        await expect(repository.createCollection(owner, changed as never, commandKey)).rejects.toMatchObject({status: 409});
        expect(await guardedCreateState([owner])).toEqual(later);
      }
    }
  });

  it("guarded parent create with two keys at one expected revision commits once and refuses the stale contender", async () => {
    for (const category of ["products", "people"] as const) {
      const owner = await account(), parent = await list(owner, "places"), observed = await revision(parent.id);
      const input = guardedCreateInput(category, parent.id, observed), keys = [key(), key()], before = await guardedCreateState([owner]);
      const results = await Promise.allSettled(keys.map(commandKey => repository.createCollection(owner, input as never, commandKey)));
      const accepted = results.filter(result => result.status === "fulfilled"), refused = results.filter(result => result.status === "rejected");
      expect(accepted).toHaveLength(1); expect(refused).toHaveLength(1);
      expect(refused[0]).toMatchObject({reason: {status: 409}});
      expect(accepted[0]).toMatchObject({value: {revision: 1, parentLocation: {id: parent.id, revision: observed + 1}}});
      const after = await guardedCreateState([owner]);
      expect(after.collections).toHaveLength(before.collections.length + 1);
      expect(after.links).toHaveLength(before.links.length + 1);
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      expect(await revision(parent.id)).toBe(observed + 1);
      const loser = results.findIndex(result => result.status === "rejected");
      await expect(repository.createCollection(owner, input as never, keys[loser])).rejects.toMatchObject({status: 409});
      expect(await guardedCreateState([owner])).toEqual(after);
    }
  });

  it("removes the link with either list and keeps the other", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    await attach(accountId, people.id, location.id);

    await pool.query("DELETE FROM collections WHERE id=$1", [location.id]);
    expect(await linkCount(accountId)).toBe(0);
    // Losing the location must not lose the list.
    expect((await pool.query("SELECT count(*)::int AS count FROM collections WHERE id=$1", [people.id])).rows[0].count).toBe(1);
  });

  it("moves both categories' revisions when a link changes", async () => {
    // The location page and the child category's own page both change, so both reads
    // must invalidate.
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    const read = async () => Object.fromEntries((await pool.query(
      "SELECT category,revision::text AS revision FROM account_category_content_state WHERE account_id=$1", [accountId])).rows
      .map(row => [row.category, Number(row.revision)]));
    const before = await read();
    await attach(accountId, people.id, location.id);
    const after = await read();
    expect(after.places).toBeGreaterThan(before.places ?? 0);
    expect(after.people).toBeGreaterThan(before.people ?? 0);
  });

  it("serves a public linked list under a public location, and hides a private one", async () => {
    const accountId = await account(`linked-${randomUUID().slice(0, 8)}`);
    await categoryPublic(accountId, "places");
    await categoryPublic(accountId, "people");
    const location = await list(accountId, "places");
    await publish(accountId, location.id);
    const open = await list(accountId, "people");
    const hidden = await list(accountId, "people");
    await person(accountId, open.id, "Public person");
    await person(accountId, hidden.id, "Private person");
    await publish(accountId, open.id);
    await attach(accountId, open.id, location.id);
    await attach(accountId, hidden.id, location.id);

    const client = await pool.connect();
    try {
      const served = await publicLinkedPeopleLists(client, accountId, location.id);
      // The private child is absent, not redacted.
      expect(served.map(entry => entry.documentId)).toEqual([open.id]);
      expect(served[0].recommended_people).toHaveLength(1);
    } finally { client.release(); }
  });

  it("removes every linked child when the child's category is unpublished, without touching a link", async () => {
    const accountId = await account(`category-${randomUUID().slice(0, 8)}`);
    await categoryPublic(accountId, "places");
    await categoryPublic(accountId, "products");
    const location = await list(accountId, "places");
    await publish(accountId, location.id);
    const products = await list(accountId, "products");
    await publish(accountId, products.id);
    await attach(accountId, products.id, location.id);

    const client = await pool.connect();
    try {
      expect((await publicLinkedProductsLists(client, accountId, location.id)).map(entry => entry.documentId)).toEqual([products.id]);
      await categoryPublic(accountId, "products", false);
      expect(await publicLinkedProductsLists(client, accountId, location.id)).toEqual([]);
      // The relation is intact; only its public traversal stopped.
      expect((await readLocationLink(pool, products.id, accountId))?.locationCollectionId).toBe(location.id);
    } finally { client.release(); }
  });

  it("hides every linked child when the account stops being publicly eligible", async () => {
    const accountId = await account(`account-${randomUUID().slice(0, 8)}`);
    await categoryPublic(accountId, "places");
    await categoryPublic(accountId, "people");
    const location = await list(accountId, "places");
    await publish(accountId, location.id);
    const people = await list(accountId, "people");
    await publish(accountId, people.id);
    await attach(accountId, people.id, location.id);

    const client = await pool.connect();
    try {
      expect(await publicLinkedPeopleLists(client, accountId, location.id)).toHaveLength(1);
      await pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1", [accountId]);
      expect(await publicLinkedPeopleLists(client, accountId, location.id)).toEqual([]);
    } finally { client.release(); }
  });

  it("serves a linked child only under its own location", async () => {
    const accountId = await account(`scope-${randomUUID().slice(0, 8)}`);
    await categoryPublic(accountId, "places");
    await categoryPublic(accountId, "people");
    const mine = await list(accountId, "places");
    const other = await list(accountId, "places");
    await publish(accountId, mine.id);
    await publish(accountId, other.id);
    const people = await list(accountId, "people");
    await publish(accountId, people.id);
    await attach(accountId, people.id, mine.id);

    const client = await pool.connect();
    try {
      expect((await publicLinkedPeopleLists(client, accountId, mine.id)).map(entry => entry.documentId)).toEqual([people.id]);
      expect(await publicLinkedPeopleLists(client, accountId, other.id)).toEqual([]);
    } finally { client.release(); }
  });

  it("refuses an attach whose child or location revision is stale", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    const childRevision = await revision(people.id);
    const locationRevision = await revision(location.id);

    await expect(repository.writeLocationMembership(accountId, {
      childCollectionId: people.id, expectedChildRevision: childRevision + 1,
      locationCollectionId: location.id, expectedLocationRevision: locationRevision,
    }, key(), true)).rejects.toMatchObject({status: 409});
    await expect(repository.writeLocationMembership(accountId, {
      childCollectionId: people.id, expectedChildRevision: childRevision,
      locationCollectionId: location.id, expectedLocationRevision: locationRevision + 1,
    }, key(), true)).rejects.toMatchObject({status: 409});
    expect(await readLocationLink(pool, people.id, accountId)).toBeNull();
  });

  it("replays one attach command rather than linking twice", async () => {
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    const commandKey = key();
    const input = {
      childCollectionId: people.id, expectedChildRevision: await revision(people.id),
      locationCollectionId: location.id, expectedLocationRevision: await revision(location.id),
    };
    const first = await repository.writeLocationMembership(accountId, input, commandKey, true);
    const second = await repository.writeLocationMembership(accountId, input, commandKey, true);
    expect(second).toEqual(first);
    expect(await linkCount(accountId)).toBe(1);
  });

  it("is cleared by the statement a terminal purge runs for this account", async () => {
    // purge_explorers_account_content deletes the account's collections, which cascades
    // every link. The purge itself needs a running deletion operation, so what is asserted
    // here is the statement it runs - the cascade is the link's whole participation in it.
    const accountId = await account();
    const location = await list(accountId, "places");
    const people = await list(accountId, "people");
    const media = await readyMedia(accountId, `purge-${randomUUID()}`);
    expect(media).toBeTruthy();
    await attach(accountId, people.id, location.id);
    await pool.query("DELETE FROM collections WHERE account_id=$1", [accountId]);
    expect(await linkCount(accountId)).toBe(0);
  });
});
