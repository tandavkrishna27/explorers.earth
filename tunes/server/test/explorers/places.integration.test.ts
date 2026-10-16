import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {insertPlaceDetails, readPlaceEntity, readPlaceContext, writePlaceContext, publicPlaceLookup, effectivePlaceDetails, readPlacePhotoMediaIds, writePlacePhotos, readPlaceCollectionDetails, writePlaceCollectionDetails} from "../../repositories/placeCatalogRepository";
import {placeEntityDetailsSchema, emptyPlaceDetails, emptyPlaceContext, emptyPlaceCollectionDetails, publicPlaceContact, legacyListNameDetails} from "../../../shared/explorersPlaceContract";

/**
 * Ticket 5.1. 0046's storage against a real PostgreSQL 15.
 *
 * Three things carry most of the weight: coordinates where zero is real and absent is
 * null, contact disclosure that is private until the creator says otherwise, and public
 * claim lookup counting distinct creators.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_places_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;

const details = (over: Record<string, unknown> = {}) => placeEntityDetailsSchema.parse({
  ...emptyPlaceDetails(), formattedAddress: "1 Example Street, Lisbon",
  addressComponents: [{longText: "Lisbon", shortText: "LIS", types: ["locality"]}],
  latitude: 38.7223, longitude: -9.1393, providerTypes: ["restaurant", "food"],
  providerRating: 4.5, ratingsCount: 1200, publicPhone: "+351 21 000 0000",
  websiteUrl: "https://example.com/place", priceLevel: 2, priceRange: {start: "10"}, ...over,
});

async function place(kind = "place", name = `Place ${randomUUID().slice(0, 6)}`) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const entityId = (await client.query("INSERT INTO entities(kind,title,origin) VALUES($1,$2,'manual') RETURNING id", [kind, name])).rows[0].id as string;
    const recommendationId = (await client.query(
      "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'places',$2,'draft') RETURNING id",
      [accountId, entityId])).rows[0].id as string;
    await client.query("COMMIT");
    return {accountId, entityId, recommendationId, name};
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function withClient<T>(run: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await run(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

/** Makes an account, list and recommendation publicly eligible. */
async function publish(accountId: string, recommendationId: string, handle: string) {
  return withClient(async client => {
    await client.query(`UPDATE creator_accounts SET handle=$2,display_name='Place owner',account_type='Creator',
      public_profile=true,onboarding_status='complete',status='active' WHERE id=$1`, [accountId, handle]);
    await client.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'places',true,0)
      ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId]);
    const collectionId = (await client.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order)
      VALUES($1,'places','City','city-${randomUUID().slice(0, 8)}','public','published',0) RETURNING id`, [accountId])).rows[0].id as string;
    await client.query("UPDATE recommendations SET publication_state='published' WHERE id=$1", [recommendationId]);
    await client.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'places',0)`,
      [collectionId, recommendationId, accountId]);
    return collectionId;
  });
}

describePg("Places storage against PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({connectionString: exactTarget, max: 1});
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(exactTarget); url.pathname = `/${databaseName}`;
    pool = new pg.Pool({connectionString: url.toString(), max: 4});
    await migrateMusicDatabase(pool);
  }, 300_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`); await admin.end(); }
  }, 120_000);

  it("round-trips the provider facts including components, types and price range", async () => {
    const {entityId} = await place();
    await withClient(client => insertPlaceDetails(client, entityId, details()));
    const entity = await readPlaceEntity(pool, entityId);
    expect(entity.kind).toBe("place");
    expect(entity.details).toEqual(details());
  });

  // The ticket's explicit coordinate assertions.
  it("keeps zero coordinates as zero and absent coordinates as null", async () => {
    const zero = await place();
    await withClient(client => insertPlaceDetails(client, zero.entityId, details({latitude: 0, longitude: 0})));
    const stored = await readPlaceEntity(pool, zero.entityId);
    expect(stored.details.latitude).toBe(0);
    expect(stored.details.longitude).toBe(0);
    expect(stored.details.latitude).not.toBeNull();

    const absent = await place();
    await withClient(client => insertPlaceDetails(client, absent.entityId, details({latitude: null, longitude: null})));
    const missing = await readPlaceEntity(pool, absent.entityId);
    expect(missing.details.latitude).toBeNull();
    expect(missing.details.longitude).toBeNull();
  });

  it("refuses a half-known coordinate pair in the contract and at the database", async () => {
    expect(placeEntityDetailsSchema.safeParse({...emptyPlaceDetails(), latitude: 38.7, longitude: null}).success).toBe(false);
    expect(placeEntityDetailsSchema.safeParse({...emptyPlaceDetails(), latitude: null, longitude: -9.1}).success).toBe(false);
    const {entityId} = await place();
    await expect(pool.query("INSERT INTO place_entity_details(entity_id,latitude) VALUES($1,38.7)", [entityId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO place_entity_details(entity_id,latitude,longitude) VALUES($1,120,0)", [entityId])).rejects.toThrow();
  });

  it("reads a place with nothing but a name as the empty record", async () => {
    const {entityId, name} = await place();
    const entity = await readPlaceEntity(pool, entityId);
    expect(entity.title).toBe(name);
    expect(entity.details).toEqual(emptyPlaceDetails());
  });

  // Contact disclosure.
  it("treats an absent context as a private self-recommendation", async () => {
    const {accountId, recommendationId} = await place();
    const context = await readPlaceContext(pool, recommendationId, accountId);
    expect(context).toEqual(emptyPlaceContext());
    expect(context.contactVisibility).toBe("private");
    expect(publicPlaceContact(context)).toEqual({contact_name: null, contact_number: null});
  });

  it("withholds contact details until the creator discloses them, and then only theirs", async () => {
    const {accountId, recommendationId} = await place();
    await withClient(client => writePlaceContext(client, recommendationId, accountId, {
      ...emptyPlaceContext(), contactName: "Ana", contactNumber: "+351 911 111 111"}));
    const privateContext = await readPlaceContext(pool, recommendationId, accountId);
    expect(privateContext.contactName).toBe("Ana");
    // Stored for the owner, withheld from readers.
    expect(publicPlaceContact(privateContext)).toEqual({contact_name: null, contact_number: null});

    await withClient(client => writePlaceContext(client, recommendationId, accountId, {
      ...privateContext, contactVisibility: "public"}));
    const disclosed = await readPlaceContext(pool, recommendationId, accountId);
    expect(publicPlaceContact(disclosed)).toEqual({contact_name: "Ana", contact_number: "+351 911 111 111"});
  });

  it("never lets one creator's contact details reach another's recommendation", async () => {
    const first = await place();
    await withClient(client => insertPlaceDetails(client, first.entityId, details()));
    const second = await withClient(async client => {
      const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
      const recommendationId = (await client.query(
        "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'places',$2,'draft') RETURNING id",
        [accountId, first.entityId])).rows[0].id as string;
      return {accountId, recommendationId};
    });
    await withClient(client => writePlaceContext(client, first.recommendationId, first.accountId, {
      ...emptyPlaceContext(), contactName: "Ana", contactNumber: "+351 911 111 111", contactVisibility: "public"}));
    // B's own context is untouched and private, on the same shared place.
    const bContext = await readPlaceContext(pool, second.recommendationId, second.accountId);
    expect(bContext).toEqual(emptyPlaceContext());
    expect(publicPlaceContact(bContext)).toEqual({contact_name: null, contact_number: null});
    // A creator's private number never reaches the shared entity's public phone.
    expect((await readPlaceEntity(pool, first.entityId)).details.publicPhone).toBe(details().publicPhone);
  });

  it("refuses an unsafe link, an unknown visibility and an out-of-range price level", async () => {
    const {accountId, recommendationId} = await place();
    for (const context of [{...emptyPlaceContext(), placeSocialUrl: "javascript:alert(1)"},
      {...emptyPlaceContext(), contactVisibility: "everyone"}, {...emptyPlaceContext(), creatorSocialUrl: "ftp://example.com/x"}])
      await expect(withClient(client => writePlaceContext(client, recommendationId, accountId, context as never))).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM place_recommendation_context WHERE recommendation_id=$1", [recommendationId])).rows[0].count).toBe(0);
    const {entityId} = await place();
    await expect(pool.query("INSERT INTO place_entity_details(entity_id,price_level) VALUES($1,9)", [entityId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO place_entity_details(entity_id,website_url) VALUES($1,'javascript:alert(1)')", [entityId])).rejects.toThrow();
  });

  it("keeps the person fields to a person recommendation and matches the entity kind", async () => {
    const {accountId, recommendationId} = await place();
    // A place recommendation may not carry person fields.
    await expect(withClient(client => writePlaceContext(client, recommendationId, accountId,
      {...emptyPlaceContext(), personAddress: "Somewhere"}))).rejects.toThrow();
    // Declaring 'person' over a place entity violates the deferred kind invariant.
    await expect(withClient(client => writePlaceContext(client, recommendationId, accountId,
      {...emptyPlaceContext(), recommendationType: "person"}))).rejects.toThrow();
    // A person entity inside a Places list is the supported case.
    const person = await place("person", "Recommended Person");
    await expect(withClient(client => writePlaceContext(client, person.recommendationId, person.accountId,
      {...emptyPlaceContext(), recommendationType: "person", personProfileUrl: "https://example.com/them", personAddress: "Lisbon"}))).resolves.toBeUndefined();
    const stored = await readPlaceContext(pool, person.recommendationId, person.accountId);
    expect(stored).toMatchObject({recommendationType: "person", personAddress: "Lisbon"});
  });

  it("never applies an override to the coordinates, address or provider facts", async () => {
    const facts = details();
    const applied = effectivePlaceDetails(facts, {
      latitude: 0, longitude: 0, formattedAddress: "Moved", addressComponents: [],
      providerRating: 1, ratingsCount: 1, providerTypes: ["bar"],
      publicPhone: "+351 22 000 0000", websiteUrl: "https://example.com/mine", priceLevel: 4,
    });
    // Identity and provider facts are untouched; the presentational remainder applies.
    expect(applied).toEqual({...facts, publicPhone: "+351 22 000 0000", websiteUrl: "https://example.com/mine", priceLevel: 4});
  });

  // Public claim lookup eligibility.
  it("finds a place once a public recommendation exists and loses it when the last is hidden", async () => {
    const owner = await place();
    await withClient(client => insertPlaceDetails(client, owner.entityId, details()));
    expect(await publicPlaceLookup(pool, owner.entityId)).toEqual({found: false, creators: 0});
    await publish(owner.accountId, owner.recommendationId, `placeowner${randomUUID().slice(0, 8)}`);
    expect(await publicPlaceLookup(pool, owner.entityId)).toEqual({found: true, creators: 1});
    await pool.query("UPDATE recommendations SET publication_state='draft' WHERE id=$1", [owner.recommendationId]);
    expect(await publicPlaceLookup(pool, owner.entityId)).toEqual({found: false, creators: 0});
  });

  it("counts distinct creators, so two recommendations by one account contribute one", async () => {
    const a = await place();
    await withClient(client => insertPlaceDetails(client, a.entityId, details()));
    const handleA = `ownera${randomUUID().slice(0, 8)}`;
    await publish(a.accountId, a.recommendationId, handleA);
    // A second recommendation of the same place by the same account.
    const secondByA = await withClient(async client => (await client.query(
      "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'places',$2,'published') RETURNING id",
      [a.accountId, a.entityId])).rows[0].id as string);
    await publish(a.accountId, secondByA, handleA);
    expect(await publicPlaceLookup(pool, a.entityId)).toEqual({found: true, creators: 1});

    // A public recommendation by a different account adds the second creator.
    const b = await withClient(async client => {
      const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
      const recommendationId = (await client.query(
        "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'places',$2,'draft') RETURNING id",
        [accountId, a.entityId])).rows[0].id as string;
      return {accountId, recommendationId};
    });
    await publish(b.accountId, b.recommendationId, `ownerb${randomUUID().slice(0, 8)}`);
    expect(await publicPlaceLookup(pool, a.entityId)).toEqual({found: true, creators: 2});
  });

  // Owner decision, 2026-10-07: all photos and media are stored in S3, so a place
  // gallery is owned media in ordered slots rather than provider URLs.
  it("stores the gallery as ordered owned media and compacts a removal", async () => {
    const {accountId, recommendationId} = await place();
    const media: string[] = [];
    for (let index = 0; index < 3; index += 1)
      media.push((await pool.query(
        `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
         VALUES($1,'recommendation','ready','image/jpeg',2048,$2,now()) RETURNING id`,
        [accountId, createHash("sha256").update(`photo-${index}-${recommendationId}`).digest()])).rows[0].id as string);
    await withClient(client => writePlacePhotos(client, recommendationId, accountId, media));
    expect(await readPlacePhotoMediaIds(pool, recommendationId, accountId)).toEqual(media);
    // A removal compacts the slots rather than leaving a hole.
    await withClient(client => writePlacePhotos(client, recommendationId, accountId, [media[2], media[0]]));
    expect(await readPlacePhotoMediaIds(pool, recommendationId, accountId)).toEqual([media[2], media[0]]);
    expect((await pool.query("SELECT slot_index FROM recommendation_place_photos WHERE recommendation_id=$1 ORDER BY slot_index", [recommendationId])).rows.map(r => r.slot_index)).toEqual([0, 1]);
  });

  it("refuses a duplicate, an unready and a foreign photo", async () => {
    const {accountId, recommendationId} = await place();
    const ready = (await pool.query(
      `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
       VALUES($1,'recommendation','ready','image/jpeg',2048,$2,now()) RETURNING id`,
      [accountId, createHash("sha256").update(`ready-${recommendationId}`).digest()])).rows[0].id as string;
    const pending = (await pool.query(
      `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256)
       VALUES($1,'recommendation','uploading','image/jpeg',2048,$2) RETURNING id`,
      [accountId, createHash("sha256").update(`pending-${recommendationId}`).digest()])).rows[0].id as string;
    const other = await place();
    const foreign = (await pool.query(
      `INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
       VALUES($1,'recommendation','ready','image/jpeg',2048,$2,now()) RETURNING id`,
      [other.accountId, createHash("sha256").update(`foreign-${recommendationId}`).digest()])).rows[0].id as string;
    await expect(withClient(client => writePlacePhotos(client, recommendationId, accountId, [ready, ready]))).rejects.toThrow();
    await expect(withClient(client => writePlacePhotos(client, recommendationId, accountId, [pending]))).rejects.toThrow();
    await expect(withClient(client => writePlacePhotos(client, recommendationId, accountId, [foreign]))).rejects.toThrow();
    expect(await readPlacePhotoMediaIds(pool, recommendationId, accountId)).toEqual([]);
  });

  it("round-trips the provider place identifier as entity identity, not as a display fact", async () => {
    // Consumers deduplicate and look places up by this, so the internal entity id must
    // never stand in for it and a manual place must report none.
    const {entityId} = await place();
    await withClient(client => insertPlaceDetails(client, entityId, details()));
    expect((await readPlaceEntity(pool, entityId)).providerPlaceId).toBeNull();
    await pool.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id) VALUES($1,'google_places','place','ChIJ_fixture')", [entityId]);
    const read = await readPlaceEntity(pool, entityId);
    expect(read.providerPlaceId).toBe("ChIJ_fixture");
    expect(read.providerPlaceId).not.toBe(entityId);
  });

  it("keeps a list's location distinct from the place recommendations inside it", async () => {
    const {accountId, recommendationId} = await place();
    const collectionId = await publish(accountId, recommendationId, `loc-${randomUUID().slice(0, 8)}`);
    expect(await readPlaceCollectionDetails(pool, collectionId, accountId)).toEqual(emptyPlaceCollectionDetails());
    const snapshot = {version: 1 as const, name: "Lisbon", address: "Lisbon, Portugal", providerPlaceId: "ChIJ_city", latitude: 38.7223, longitude: -9.1393};
    await withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: null, locationSnapshot: snapshot, instagramMediaUrl: "https://example.com/reel"}));
    const stored = await readPlaceCollectionDetails(pool, collectionId, accountId);
    expect(stored.locationSnapshot).toEqual(snapshot);
    // Removing every place leaves the list's own location intact, which is the point.
    await pool.query("DELETE FROM collection_items WHERE recommendation_id=$1", [recommendationId]);
    await pool.query("DELETE FROM recommendations WHERE id=$1", [recommendationId]);
    expect((await pool.query("SELECT count(*)::int AS count FROM collection_items WHERE collection_id=$1", [collectionId])).rows[0].count).toBe(0);
    expect((await readPlaceCollectionDetails(pool, collectionId, accountId)).locationSnapshot).toEqual(snapshot);
  });

  it("stores a located list's zero coordinates as zero and an unlocated list as null", async () => {
    const {accountId, recommendationId} = await place();
    const collectionId = await publish(accountId, recommendationId, `zero-${randomUUID().slice(0, 8)}`);
    const zero = {version: 1 as const, name: "Null island", address: null, providerPlaceId: null, latitude: 0, longitude: 0};
    await withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: null, locationSnapshot: zero, instagramMediaUrl: null}));
    expect((await readPlaceCollectionDetails(pool, collectionId, accountId)).locationSnapshot).toEqual(zero);
    const absent = {version: 1 as const, name: "Somewhere", address: null, providerPlaceId: null, latitude: null, longitude: null};
    await withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: null, locationSnapshot: absent, instagramMediaUrl: null}));
    const read = await readPlaceCollectionDetails(pool, collectionId, accountId);
    expect(read.locationSnapshot).toEqual(absent);
    // The legacy blob the cards read, assembled from the same mapper both edges use.
    expect(legacyListNameDetails(read.locationSnapshot, {note: "A guide", thumbnailUrl: null}).location).toEqual({latitude: null, longitude: null, address: null});
  });

  it("refuses a half-known list location and a location entity that is not a place", async () => {
    const {accountId, recommendationId} = await place();
    const collectionId = await publish(accountId, recommendationId, `guard-${randomUUID().slice(0, 8)}`);
    const half = {version: 1, name: "Half", address: null, providerPlaceId: null, latitude: 38.7223, longitude: null};
    await expect(withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: null, locationSnapshot: half, instagramMediaUrl: null} as never))).rejects.toThrow();
    const book = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Not a place','manual') RETURNING id")).rows[0].id as string;
    await expect(withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: book, locationSnapshot: null, instagramMediaUrl: null}))).rejects.toThrow();
    const city = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('place','Lisbon','manual') RETURNING id")).rows[0].id as string;
    await withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: city, locationSnapshot: null, instagramMediaUrl: null}));
    expect((await readPlaceCollectionDetails(pool, collectionId, accountId)).locationEntityId).toBe(city);
    // A linked location must not be deleted out from under the lists that point at it.
    await expect(pool.query("DELETE FROM entities WHERE id=$1", [city])).rejects.toThrow();
  });

  it("removes a list's location with the list and leaves the linked location entity", async () => {
    const {accountId, recommendationId} = await place();
    const collectionId = await publish(accountId, recommendationId, `cascade-${randomUUID().slice(0, 8)}`);
    const city = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('place','Porto','manual') RETURNING id")).rows[0].id as string;
    await withClient(client => writePlaceCollectionDetails(client, collectionId, accountId, {locationEntityId: city, locationSnapshot: null, instagramMediaUrl: null}));
    await pool.query("DELETE FROM collections WHERE id=$1", [collectionId]);
    expect((await pool.query("SELECT count(*)::int AS count FROM place_collection_details WHERE collection_id=$1", [collectionId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM entities WHERE id=$1", [city])).rows[0].count).toBe(1);
  });

  it("refuses a place detail row on an entity of another kind", async () => {
    const entityId = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Not a place','manual') RETURNING id")).rows[0].id as string;
    await expect(withClient(client => insertPlaceDetails(client, entityId, details()))).rejects.toThrow();
  });

  it("derives the normalized phone for lookup rather than accepting one", async () => {
    const {entityId} = await place();
    await withClient(client => insertPlaceDetails(client, entityId, details({publicPhone: "+351 21 000 0000"})));
    const row = (await pool.query("SELECT public_phone_normalized FROM place_entity_details WHERE entity_id=$1", [entityId])).rows[0];
    expect(row.public_phone_normalized).toBe("351210000000");
  });

  it("removes the creator's context on a terminal purge and leaves the shared place", async () => {
    const {accountId, entityId, recommendationId} = await place();
    await withClient(client => insertPlaceDetails(client, entityId, details()));
    await withClient(client => writePlaceContext(client, recommendationId, accountId, {...emptyPlaceContext(), contactName: "Ana"}));
    await pool.query("DELETE FROM recommendations WHERE id=$1", [recommendationId]);
    // Cascades with the recommendation, as the movie and product contexts do.
    expect((await pool.query("SELECT count(*)::int AS count FROM place_recommendation_context WHERE recommendation_id=$1", [recommendationId])).rows[0].count).toBe(0);
    expect((await readPlaceEntity(pool, entityId)).details.formattedAddress).toBe(details().formattedAddress);
  });
});
