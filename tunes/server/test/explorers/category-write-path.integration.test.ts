import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {ExplorersRecommendationRepository} from "../../repositories/explorersRecommendationRepository";
import {readAppScreenshotMediaIds} from "../../repositories/appCatalogRepository";
import {readProductOffer} from "../../repositories/productCatalogRepository";
import {readPlaceContext, readPlacePhotoMediaIds, readPlaceCollectionDetails} from "../../repositories/placeCatalogRepository";
import {emptyPlaceContext} from "../../../shared/explorersPlaceContract";

/**
 * Tickets 4.3 and 4.4. The owner write path for Apps and Products, end to end through the
 * repository against a real PostgreSQL 15.
 *
 * This file exists because three gaps were only visible from here. The command contract
 * accepted typed Apps and Products payloads, the storage existed, and the two were not
 * connected:
 *
 *  1. resolveEntity fell through to resolveManualEntity for both categories, so the
 *     entities row was written and the typed details were silently discarded. The client
 *     then rejected the untyped response, so creating one could not succeed at all.
 *  2. createRecommendation and updateRecommendation accepted appScreenshots and
 *     productOffer and wrote neither.
 *  3. updateRecommendation rejected any display override other than title for every
 *     category except Books and Movies, so editing an App's or a Product's presentational
 *     fields was impossible even though the command contract allows it.
 *
 * Each assertion below fails if its gap is reintroduced.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_write_path_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;
let repository: ExplorersRecommendationRepository;

const key = () => randomUUID();

async function account() {
  const accountId = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
  await pool.query("UPDATE creator_accounts SET status='active' WHERE id=$1", [accountId]);
  return accountId;
}
async function collection(accountId: string, category: string) {
  // revision is a bigint, which pg returns as a string; the repository requires a number.
  const row = (await pool.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order)
    VALUES($1,$2,'List',$3,'private','draft',0) RETURNING id,revision::text AS revision`, [accountId, category, `list-${randomUUID()}`])).rows[0];
  return {id: row.id as string, revision: Number(row.revision)};
}
async function readyMedia(accountId: string, salt: string, purpose = "recommendation") {
  return (await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
    VALUES($1,$3,'ready','image/png',1024,$2,now()) RETURNING id`,
    [accountId, createHash("sha256").update(salt).digest(), purpose])).rows[0].id as string;
}

describePg("owner write path for typed categories", () => {
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: exactTarget, max: 1});
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(exactTarget); url.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: url.toString(), max: 4});
    await migrateMusicDatabase(pool);
    repository = new ExplorersRecommendationRepository(pool);
  }, 300_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`); await admin.end(); }
  }, 120_000);

  it("persists the typed App details the manual resolve carries", async () => {
    const accountId = await account();
    const entity = await repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {
      title: "Focus Timer", appUrl: "https://example.com/focus", developer: "Quiet Software", priceTier: "Paid", platforms: ["iOS", "Web"],
    }}, key());
    expect(entity).toMatchObject({kind: "app", title: "Focus Timer", origin: "manual"});
    expect(entity.details).toMatchObject({appUrl: "https://example.com/focus", developer: "Quiet Software", priceTier: "Paid", platforms: ["iOS", "Web"]});
    // The details row exists in storage, not only in the response.
    expect((await pool.query("SELECT app_url FROM app_entity_details WHERE entity_id=$1", [entity.id])).rows[0].app_url).toBe("https://example.com/focus");
  });

  it("persists the typed Product details the manual resolve carries", async () => {
    const accountId = await account();
    const entity = await repository.resolveProductEntity(accountId, {kind: "manual", category: "products", details: {
      title: "Widget", productUrl: "https://example.com/widget", brand: "Acme", specifications: {Weight: "1kg"}, imageUrls: ["https://example.com/a.png"],
    }}, key());
    expect(entity).toMatchObject({kind: "product", title: "Widget", origin: "manual"});
    expect(entity.details).toMatchObject({productUrl: "https://example.com/widget", brand: "Acme", specifications: {Weight: "1kg"}});
    expect((await pool.query("SELECT product_url FROM product_entity_details WHERE entity_id=$1", [entity.id])).rows[0].product_url).toBe("https://example.com/widget");
  });

  it("writes App screenshots on create and replaces them on update", async () => {
    const accountId = await account();
    const entity = await repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {title: "Shots", appUrl: "https://example.com/shots"}}, key());
    const parent = await collection(accountId, "apps");
    const first = await readyMedia(accountId, `a-${accountId}`), second = await readyMedia(accountId, `b-${accountId}`);
    const created = await repository.createRecommendation(accountId, {category: "apps", entityId: entity.id, collectionId: parent.id,
      expectedCollectionRevision: parent.revision, appScreenshots: {screenshotMediaIds: [first, second]}}, key());
    expect(await readAppScreenshotMediaIds(pool, created.id, accountId)).toEqual([first, second]);
    await repository.updateRecommendation(accountId, created.id, created.revision, {appScreenshots: {screenshotMediaIds: [second]}}, key());
    expect(await readAppScreenshotMediaIds(pool, created.id, accountId)).toEqual([second]);
  });

  it("writes an offer on create, defaults it to unknown, and replaces it on update", async () => {
    const accountId = await account();
    const entity = await repository.resolveProductEntity(accountId, {kind: "manual", category: "products", details: {title: "Priced", productUrl: "https://example.com/priced"}}, key());
    const parent = await collection(accountId, "products");
    // No offer supplied: the row is created as unknown, never as free.
    const created = await repository.createRecommendation(accountId, {category: "products", entityId: entity.id, collectionId: parent.id,
      expectedCollectionRevision: parent.revision}, key());
    expect(await readProductOffer(pool, created.id, accountId)).toEqual({price: null, currencyCode: null, buyUrl: null});
    // The reader returns the empty offer for an absent row too, so assert the row itself
    // exists: this recommendation owns its offer from creation.
    expect((await pool.query("SELECT count(*)::int AS count FROM product_recommendation_context WHERE recommendation_id=$1", [created.id])).rows[0].count).toBe(1);
    const updated = await repository.updateRecommendation(accountId, created.id, created.revision, {productOffer: {price: "0.00", currencyCode: "USD", buyUrl: null}}, key());
    expect(await readProductOffer(pool, created.id, accountId)).toMatchObject({price: "0.00", currencyCode: "USD"});
    await repository.updateRecommendation(accountId, created.id, updated.revision, {productOffer: {price: null, currencyCode: null, buyUrl: null}}, key());
    expect(await readProductOffer(pool, created.id, accountId)).toEqual({price: null, currencyCode: null, buyUrl: null});
  });

  it("accepts an App and a Product display override on update", async () => {
    const accountId = await account();
    const app = await repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {title: "Editable", appUrl: "https://example.com/editable"}}, key());
    const appList = await collection(accountId, "apps");
    const appRow = await repository.createRecommendation(accountId, {category: "apps", entityId: app.id, collectionId: appList.id, expectedCollectionRevision: appList.revision}, key());
    await expect(repository.updateRecommendation(accountId, appRow.id, appRow.revision, {displayOverrides: {title: "Renamed", developer: "New dev"}}, key())).resolves.toBeTruthy();

    const product = await repository.resolveProductEntity(accountId, {kind: "manual", category: "products", details: {title: "Editable", productUrl: "https://example.com/editable-product"}}, key());
    const productList = await collection(accountId, "products");
    const productRow = await repository.createRecommendation(accountId, {category: "products", entityId: product.id, collectionId: productList.id, expectedCollectionRevision: productList.revision}, key());
    await expect(repository.updateRecommendation(accountId, productRow.id, productRow.revision, {displayOverrides: {title: "Renamed", brand: "New brand"}}, key())).resolves.toBeTruthy();
  });

  it("refuses a category payload on the wrong category, on create and on update", async () => {
    const accountId = await account();
    const app = await repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {title: "Wrong", appUrl: "https://example.com/wrong"}}, key());
    const appList = await collection(accountId, "apps");
    await expect(repository.createRecommendation(accountId, {category: "apps", entityId: app.id, collectionId: appList.id,
      expectedCollectionRevision: appList.revision, productOffer: {price: "1.00", currencyCode: "USD", buyUrl: null}}, key())).rejects.toThrow();
    const row = await repository.createRecommendation(accountId, {category: "apps", entityId: app.id, collectionId: appList.id, expectedCollectionRevision: appList.revision}, key());
    await expect(repository.updateRecommendation(accountId, row.id, row.revision, {productOffer: {price: "1.00", currencyCode: "USD", buyUrl: null}}, key())).rejects.toThrow();
    // The refused offer left nothing behind.
    expect(await readProductOffer(pool, row.id, accountId)).toEqual({price: null, currencyCode: null, buyUrl: null});
  });

  it("persists the typed Place facts and a context that starts private", async () => {
    const accountId = await account();
    const entity = await repository.resolvePlaceEntity(accountId, {kind: "manual", category: "places", details: {
      title: "Corner Cafe", formattedAddress: "1 Example Street", latitude: 0, longitude: 0, providerTypes: ["cafe"],
    }}, key());
    expect(entity).toMatchObject({kind: "place", title: "Corner Cafe", origin: "manual"});
    // Zero coordinates survive the write path, not just the repository.
    expect(entity.details).toMatchObject({formattedAddress: "1 Example Street", latitude: 0, longitude: 0, providerTypes: ["cafe"]});

    const parent = await collection(accountId, "places");
    const created = await repository.createRecommendation(accountId, {category: "places", entityId: entity.id,
      collectionId: parent.id, expectedCollectionRevision: parent.revision}, key());
    // A fresh Places row is explicitly private rather than absent and later defaulted.
    expect(await readPlaceContext(pool, created.id, accountId)).toEqual(emptyPlaceContext());
    expect((await pool.query("SELECT count(*)::int AS count FROM place_recommendation_context WHERE recommendation_id=$1", [created.id])).rows[0].count).toBe(1);

    const updated = await repository.updateRecommendation(accountId, created.id, created.revision, {placeContext: {
      ...emptyPlaceContext(), contactName: "Ana", contactNumber: "+351 911 111 111", contactVisibility: "public"}}, key());
    expect(await readPlaceContext(pool, created.id, accountId)).toMatchObject({contactName: "Ana", contactVisibility: "public"});

    const photo = await readyMedia(accountId, `place-${accountId}`);
    await repository.updateRecommendation(accountId, created.id, updated.revision, {placePhotos: {photoMediaIds: [photo]}}, key());
    expect(await readPlacePhotoMediaIds(pool, created.id, accountId)).toEqual([photo]);
  });

  it("refuses a Places payload on another category and the reverse", async () => {
    const accountId = await account();
    const app = await repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {title: "Wrong", appUrl: "https://example.com/wrong"}}, key());
    const appList = await collection(accountId, "apps");
    await expect(repository.createRecommendation(accountId, {category: "apps", entityId: app.id, collectionId: appList.id,
      expectedCollectionRevision: appList.revision, placeContext: emptyPlaceContext()}, key())).rejects.toThrow();
    const place = await repository.resolvePlaceEntity(accountId, {kind: "manual", category: "places", details: {title: "Right"}}, key());
    const placeList = await collection(accountId, "places");
    await expect(repository.createRecommendation(accountId, {category: "places", entityId: place.id, collectionId: placeList.id,
      expectedCollectionRevision: placeList.revision, productOffer: {price: "1.00", currencyCode: "USD", buyUrl: null}}, key())).rejects.toThrow();
  });

  it("accepts a Place display override but never the coordinates", async () => {
    const accountId = await account();
    const entity = await repository.resolvePlaceEntity(accountId, {kind: "manual", category: "places", details: {title: "Editable", latitude: 1.5, longitude: 2.5}}, key());
    const parent = await collection(accountId, "places");
    const row = await repository.createRecommendation(accountId, {category: "places", entityId: entity.id, collectionId: parent.id, expectedCollectionRevision: parent.revision}, key());
    await expect(repository.updateRecommendation(accountId, row.id, row.revision, {displayOverrides: {title: "Renamed", publicPhone: "+351 22 000 0000"}}, key())).resolves.toBeTruthy();
    // latitude is outside the override vocabulary, so the command is refused outright.
    const next = await repository.observeRevision?.(row.id) ?? row.revision + 1;
    await expect(repository.updateRecommendation(accountId, row.id, next, {displayOverrides: {latitude: 0}} as never, key())).rejects.toThrow();
  });

  it("gives every Places list a location row from creation, so a list is never location-less", async () => {
    // The storage for this existed and nothing wrote it: a list could be created and its
    // location could never be set through a command.
    const accountId = await account();
    const list = await repository.createCollection(accountId, {category: "places", title: "Lisbon", slug: `lisbon-${randomUUID()}`}, key());
    expect((await pool.query("SELECT count(*)::int AS count FROM place_collection_details WHERE collection_id=$1", [list.id])).rows[0].count).toBe(1);
    expect(await readPlaceCollectionDetails(pool, list.id, accountId)).toEqual({locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null});
  });

  it("creates a located list in one command and replaces its location on update", async () => {
    const accountId = await account();
    const snapshot = {version: 1 as const, name: "Lisbon", address: "Lisbon, Portugal", providerPlaceId: "ChIJ_city", latitude: 38.7223, longitude: -9.1393};
    const list = await repository.createCollection(accountId, {category: "places", title: "Lisbon", slug: `lisbon-${randomUUID()}`,
      placeLocation: {locationEntityId: null, locationSnapshot: snapshot, instagramMediaUrl: "https://example.com/reel"}}, key());
    expect(await readPlaceCollectionDetails(pool, list.id, accountId)).toEqual({locationEntityId: null, locationSnapshot: snapshot, instagramMediaUrl: "https://example.com/reel"});
    const moved = {...snapshot, name: "Porto", providerPlaceId: "ChIJ_porto", latitude: 41.1579, longitude: -8.6291};
    await repository.updateCollection(accountId, list.id, list.revision, {placeLocation: {locationEntityId: null, locationSnapshot: moved, instagramMediaUrl: null}}, key());
    const after = await readPlaceCollectionDetails(pool, list.id, accountId);
    // Replaced wholesale, not merged: a half-updated location is a different place.
    expect(after).toEqual({locationEntityId: null, locationSnapshot: moved, instagramMediaUrl: null});
  });

  it("refuses a location aggregate on a list of another category, on create and on update", async () => {
    const accountId = await account();
    const location = {locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null};
    await expect(repository.createCollection(accountId, {category: "books", title: "Reads", slug: `reads-${randomUUID()}`, placeLocation: location}, key())).rejects.toThrow();
    const books = await repository.createCollection(accountId, {category: "books", title: "Reads", slug: `reads-${randomUUID()}`}, key());
    await expect(repository.updateCollection(accountId, books.id, books.revision, {placeLocation: location}, key())).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM place_collection_details WHERE collection_id=$1", [books.id])).rows[0].count).toBe(0);
  });

  it("accepts a list cover whose asset carries the collection purpose and refuses any other", async () => {
    // The upload allowlist was narrower than the storage design, so no client could set a
    // list cover at all; 0030 requires the asset's purpose to be exactly 'collection'.
    const accountId = await account();
    const cover = await readyMedia(accountId, `cover-${randomUUID()}`, "collection");
    const list = await repository.createCollection(accountId, {category: "places", title: "Lisbon", slug: `lisbon-${randomUUID()}`, coverMediaId: cover}, key());
    expect(list.coverMediaId).toBe(cover);
    const wrong = await readyMedia(accountId, `wrong-${randomUUID()}`, "recommendation");
    await expect(repository.createCollection(accountId, {category: "places", title: "Porto", slug: `porto-${randomUUID()}`, coverMediaId: wrong}, key())).rejects.toThrow();
  });

  it("pins a list and moves it in the order, each on its own", async () => {
    // collections.pin_order has existed since the list schema and nothing wrote it, so a
    // list could be pinned in storage and never through a command.
    //
    // Updated for ticket 5.3: a list must be published and public before it can be
    // pinned, so this publishes first. The point of the case is unchanged - that a command
    // writes pin_order, that moving a list leaves its pin alone, and that unpinning is an
    // explicit null - but a draft list can no longer be pinned at all, because a pin on
    // something nobody can see promises a position on a public profile it never reaches.
    const accountId = await account();
    const list = await repository.createCollection(accountId, {category: "places", title: "Lisbon", slug: `lisbon-${randomUUID()}`}, key());
    const read = async () => (await pool.query("SELECT display_order,pin_order FROM collections WHERE id=$1", [list.id])).rows[0];
    expect(await read()).toMatchObject({pin_order: null});

    await expect(repository.updateCollection(accountId, list.id, list.revision, {pinOrder: 2}, key()))
      .rejects.toMatchObject({status: 422});
    const published = await repository.updateCollection(accountId, list.id, list.revision,
      {visibility: "public", publicationState: "published"}, key());
    await repository.updateCollection(accountId, list.id, published.revision, {pinOrder: 2}, key());
    expect((await read()).pin_order).toBe(2);

    // Moving the list leaves the pin where it was: they are separate decisions.
    const moved = (await pool.query("SELECT revision FROM collections WHERE id=$1", [list.id])).rows[0];
    await repository.updateCollection(accountId, list.id, Number(moved.revision), {displayOrder: 7}, key());
    expect(await read()).toMatchObject({display_order: 7, pin_order: 2});

    // Unpinning is an explicit null, not an omission.
    const after = (await pool.query("SELECT revision FROM collections WHERE id=$1", [list.id])).rows[0];
    await repository.updateCollection(accountId, list.id, Number(after.revision), {pinOrder: null}, key());
    expect((await read()).pin_order).toBeNull();
  });

  it("refuses to pin or move another account's list", async () => {
    const owner = await account();
    const stranger = await account();
    const list = await repository.createCollection(owner, {category: "places", title: "Lisbon", slug: `lisbon-${randomUUID()}`}, key());
    await expect(repository.updateCollection(stranger, list.id, list.revision, {pinOrder: 1}, key())).rejects.toThrow();
    expect((await pool.query("SELECT pin_order FROM collections WHERE id=$1", [list.id])).rows[0].pin_order).toBeNull();
  });

  it("refuses an App resolve without the URL its storage requires", async () => {
    const accountId = await account();
    await expect(repository.resolveAppEntity(accountId, {kind: "manual", category: "apps", details: {title: "No link"}}, key())).rejects.toThrow();
    await expect(repository.resolveProductEntity(accountId, {kind: "manual", category: "products", details: {title: "No link"}}, key())).rejects.toThrow();
  });

  it("replays one resolve command rather than creating a second entity", async () => {
    const accountId = await account();
    const commandKey = key();
    const input = {kind: "manual", category: "apps", details: {title: "Replayed", appUrl: "https://example.com/replayed"}} as const;
    const first = await repository.resolveAppEntity(accountId, input, commandKey);
    const second = await repository.resolveAppEntity(accountId, input, commandKey);
    expect(second.id).toBe(first.id);
    expect((await pool.query("SELECT count(*)::int AS count FROM entities WHERE title='Replayed'")).rows[0].count).toBe(1);
  });
});
