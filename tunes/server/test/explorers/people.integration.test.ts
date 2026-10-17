import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {insertPersonDetails, readPersonEntity, personSuppressed, effectivePersonDetails} from "../../repositories/personCatalogRepository";
import {publicPeopleProjection} from "../../publicProfile/publicPeopleProjection";
import {personEntityDetailsSchema, emptyPersonDetails, storedPlatform} from "../../../shared/explorersPersonContract";

/**
 * Ticket 4.5. 0045's storage against a real PostgreSQL 15.
 *
 * The point of most of this is that a recommended person stays data rather than an
 * identity: same-named people are distinct, a handle matching an account's handle confers
 * nothing, and one owner's edit cannot reach another owner's recommendation.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_people_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;

const details = (over: Record<string, unknown> = {}) => personEntityDetailsSchema.parse({
  ...emptyPersonDetails(), usernameHandle: "alexlee", headline: "Designer", locationText: "Lisbon",
  avatarUrl: "https://example.com/a.png", primaryPlatform: "twitter",
  socialUrls: {twitter: "https://example.com/alex", website: "https://alex.example.com"},
  skillsTags: ["design", "type"], externalFollowerCountText: "12.4k", ...over,
});

async function person(name = `Alex Lee ${randomUUID().slice(0, 6)}`) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const entityId = (await client.query("INSERT INTO entities(kind,title,origin) VALUES('person',$1,'manual') RETURNING id", [name])).rows[0].id as string;
    const recommendationId = (await client.query(
      "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'people',$2,'draft') RETURNING id",
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

describePg("People storage against PostgreSQL", () => {
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

  it("round-trips the typed facts including social links and skill tags", async () => {
    const {entityId} = await person();
    await withClient(client => insertPersonDetails(client, entityId, details()));
    const entity = await readPersonEntity(pool, entityId);
    expect(entity.kind).toBe("person");
    expect(entity.suppressed).toBe(false);
    expect(entity.details).toEqual(details());
  });

  it("reads a person with nothing but a name as the empty record, not a failure", async () => {
    // Every column is nullable, so an absent details row is a legitimate state - the
    // opposite of Apps and Products, whose URL columns are NOT NULL.
    const {entityId, name} = await person();
    const entity = await readPersonEntity(pool, entityId);
    expect(entity.title).toBe(name);
    expect(entity.details).toEqual(emptyPersonDetails());
  });

  it("round-trips with every optional field absent", async () => {
    const {entityId} = await person();
    await withClient(client => insertPersonDetails(client, entityId, personEntityDetailsSchema.parse(emptyPersonDetails())));
    expect((await readPersonEntity(pool, entityId)).details).toEqual(emptyPersonDetails());
  });

  // same_name_people_remain_distinct
  it("keeps same-named people distinct, with no authoritative matching identifier", async () => {
    const first = await person("Alex Lee"), second = await person("Alex Lee");
    await withClient(client => insertPersonDetails(client, first.entityId, details({headline: "Designer"})));
    await withClient(client => insertPersonDetails(client, second.entityId, details({headline: "Engineer"})));
    expect(first.entityId).not.toBe(second.entityId);
    expect((await readPersonEntity(pool, first.entityId)).details.headline).toBe("Designer");
    expect((await readPersonEntity(pool, second.entityId)).details.headline).toBe("Engineer");
    // Same handle on both, and still two people: a handle is not identity.
    expect((await readPersonEntity(pool, first.entityId)).details.usernameHandle)
      .toBe((await readPersonEntity(pool, second.entityId)).details.usernameHandle);
  });

  // matching_login_handle_grants_no_authority
  it("grants no account link or membership when a handle matches a real account handle", async () => {
    const owner = await person();
    const handle = `realowner${randomUUID().slice(0, 8)}`;
    const otherAccount = (await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
    await pool.query("UPDATE creator_accounts SET handle=$2,status='active' WHERE id=$1", [otherAccount, handle]);
    await withClient(client => insertPersonDetails(client, owner.entityId, details({usernameHandle: handle})));
    expect((await readPersonEntity(pool, owner.entityId)).details.usernameHandle).toBe(handle);
    // No membership, no binding, and the person entity is not an account.
    expect((await pool.query("SELECT count(*)::int AS count FROM account_memberships WHERE account_id=$1", [otherAccount])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM recommendations WHERE account_id=$1", [otherAccount])).rows[0].count).toBe(0);
    // The handle column carries no FK and no uniqueness, so a second person may hold it.
    const twin = await person();
    await expect(withClient(client => insertPersonDetails(client, twin.entityId, details({usernameHandle: handle})))).resolves.toBeUndefined();
  });

  it("never applies a usernameHandle override, so one owner cannot re-point a shared person", async () => {
    const facts = details();
    expect(effectivePersonDetails(facts, {usernameHandle: "someoneelse", headline: "Renamed"}))
      .toEqual({...facts, headline: "Renamed"});
  });

  it("keeps A's presentation of a shared person out of B's recommendation", async () => {
    const a = await person("Shared Person");
    await withClient(client => insertPersonDetails(client, a.entityId, details({headline: "Canonical headline"})));
    const b = await withClient(async client => {
      const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
      const recommendationId = (await client.query(
        "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'people',$2,'draft') RETURNING id",
        [accountId, a.entityId])).rows[0].id as string;
      return {accountId, recommendationId};
    });
    // A overrides the headline for their own presentation only.
    await pool.query(`INSERT INTO recommendation_display_overrides(recommendation_id,account_id,schema_version,display_values)
      VALUES($1,$2,1,$3::jsonb)`, [a.recommendationId, a.accountId, JSON.stringify({headline: "A's wording"})]);
    const shared = await readPersonEntity(pool, a.entityId);
    expect(effectivePersonDetails(shared.details, {headline: "A's wording"}).headline).toBe("A's wording");
    // B, with no override, still sees the canonical record.
    expect(effectivePersonDetails(shared.details, {}).headline).toBe("Canonical headline");
    expect(b.recommendationId).not.toBe(a.recommendationId);
  });

  it("refuses an unsafe social link, an unknown social key and a non-string value at the database", async () => {
    const {entityId} = await person();
    for (const social of ['{"twitter":"javascript:alert(1)"}', '{"myspace":"https://example.com/a"}', '{"twitter":42}'])
      await expect(pool.query("INSERT INTO person_entity_details(entity_id,social_urls) VALUES($1,$2::jsonb)", [entityId, social])).rejects.toThrow();
    await expect(pool.query("INSERT INTO person_entity_details(entity_id,avatar_url) VALUES($1,'javascript:alert(1)')", [entityId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO person_entity_details(entity_id,primary_platform) VALUES($1,'myspace')", [entityId])).rejects.toThrow();
  });

  it("refuses a person detail row on an entity of another kind", async () => {
    const entityId = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Not a person','manual') RETURNING id")).rows[0].id as string;
    await expect(withClient(client => insertPersonDetails(client, entityId, details()))).rejects.toThrow();
  });

  it("presents the stored platform for the frontend's x alias", () => {
    expect(storedPlatform("x")).toBe("twitter");
    expect(storedPlatform("X")).toBe("twitter");
    expect(storedPlatform("twitter")).toBe("twitter");
    expect(storedPlatform("myspace")).toBeUndefined();
  });

  it("omits a suppressed person from the public page while the record survives", async () => {
    const {accountId, entityId, recommendationId} = await person("Published Person");
    const handle = `people${Date.now().toString(36)}`;
    await withClient(async client => {
      await insertPersonDetails(client, entityId, details());
      await client.query(`UPDATE creator_accounts SET handle=$2,display_name='People owner',account_type='Creator',
        public_profile=true,onboarding_status='complete',status='active' WHERE id=$1`, [accountId, handle]);
      await client.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'people',true,0)
        ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId]);
      const collectionId = (await client.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order)
        VALUES($1,'people','Crew','crew','public','published',0) RETURNING id`, [accountId])).rows[0].id as string;
      await client.query("UPDATE recommendations SET publication_state='published' WHERE id=$1", [recommendationId]);
      await client.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'people',0)`,
        [collectionId, recommendationId, accountId]);
    });

    const before = await publicPeopleProjection(pool, handle, 12) as {personLists: any[]};
    expect(before.personLists[0].recommended_people).toHaveLength(1);
    const row = before.personLists[0].recommended_people[0];
    // Canonical fields plus the compatibility aliases the ticket requires.
    expect(row).toMatchObject({full_name: "Published Person", title: "Published Person",
      platform: "x", primary_platform: "twitter", profile_url: "https://example.com/alex",
      username_handle: "alexlee", follower_count: "12.4k", person_category: null});
    expect(row.skills_tags).toEqual(["design", "type"]);

    // Suppression is an operator action through the migrator role.
    await pool.query("UPDATE person_entity_details SET suppressed_at=now() WHERE entity_id=$1", [entityId]);
    expect(await personSuppressed(pool, entityId)).toBe(true);
    const after = await publicPeopleProjection(pool, handle, 12) as {personLists: any[]};
    expect(after.personLists[0].recommended_people).toEqual([]);
    // The owner's own record is untouched; only the public surface omits them.
    expect((await readPersonEntity(pool, entityId)).details.headline).toBe("Designer");
    expect((await pool.query("SELECT count(*)::int AS count FROM recommendations WHERE id=$1", [recommendationId])).rows[0].count).toBe(1);
  });

  it("removes the account's own content on a terminal purge and leaves the shared person", async () => {
    const {accountId, entityId, recommendationId} = await person();
    await withClient(client => insertPersonDetails(client, entityId, details()));
    const revision = (await pool.query<{revision: string}>("SELECT revision::text FROM creator_accounts WHERE id=$1", [accountId])).rows[0].revision;
    const receipt = (await pool.query(
      `INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response)
       VALUES($1,'account.delete',$2,$3,'{}'::jsonb) RETURNING id`,
      [accountId, createHash("sha256").update(`key-${accountId}`).digest(), createHash("sha256").update(`req-${accountId}`).digest()])).rows[0].id as string;
    const feedback = (await pool.query(
      "INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'integration purge') RETURNING id", [accountId])).rows[0].id as string;
    const operation = (await pool.query(
      `INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,receipt_id,feedback_id)
       VALUES($1,'delete','running',$2,$3,$4) RETURNING id`,
      [accountId, revision, receipt, feedback])).rows[0].id as string;
    await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1", [accountId]);
    await pool.query("SELECT purge_explorers_account_content($1,$2)", [accountId, operation]);
    expect((await pool.query("SELECT count(*)::int AS count FROM recommendations WHERE id=$1", [recommendationId])).rows[0].count).toBe(0);
    // A shared catalog row is not the account's to delete.
    expect((await readPersonEntity(pool, entityId)).details.headline).toBe("Designer");
  });
});
