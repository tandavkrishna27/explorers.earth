import {createHash, randomUUID} from "node:crypto";
import pg from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {migrateMusicDatabase} from "../../db/migrate";
import {insertProductDetails, readProductEntity, readProductOffer, writeProductOffer, effectiveProductDetails} from "../../repositories/productCatalogRepository";
import {publicProductsProjection} from "../../publicProfile/publicProductsProjection";
import {productEntityDetailsSchema, canonicalAmount} from "../../../shared/explorersProductContract";

/**
 * Ticket 4.4. 0044's storage against a real PostgreSQL 15, through the repository rather
 * than raw SQL, so the exact-decimal money path is exercised the way the application uses
 * it. Zero versus null and known versus unknown currency are the point of most of this.
 */
const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C6_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `explorers_products_${process.pid}`;

let admin: pg.Pool;
let pool: pg.Pool;

const details = (over: Record<string, unknown> = {}) => productEntityDetailsSchema.parse({
  productUrl: "https://example.com/widget", brand: "Acme", logoUrl: null, description: "Notes",
  specifications: {Weight: "1kg", Colour: "Black"}, imageUrls: ["https://example.com/a.png"], ...over,
});

/** An account with one products recommendation, ready to carry an offer. */
async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const entityId = (await client.query("INSERT INTO entities(kind,title,origin) VALUES('product',$1,'manual') RETURNING id", [`Product ${randomUUID()}`])).rows[0].id as string;
    const recommendationId = (await client.query(
      "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'products',$2,'draft') RETURNING id",
      [accountId, entityId])).rows[0].id as string;
    await client.query("COMMIT");
    return {accountId, entityId, recommendationId};
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function withClient<T>(run: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await run(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

describePg("Products storage against PostgreSQL", () => {
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

  it("round-trips the typed catalog facts including a bounded specification map", async () => {
    const {entityId} = await seed();
    await withClient(client => insertProductDetails(client, entityId, details()));
    const entity = await readProductEntity(pool, entityId);
    expect(entity.kind).toBe("product");
    expect(entity.details).toEqual(details());
    expect(entity.details.specifications).toEqual({Weight: "1kg", Colour: "Black"});
  });

  // The ticket's parameterisation: every amount, with an explicit currency and without.
  it.each([
    ["0.00", "USD", "0.00"],
    ["0", "USD", "0.00"],
    ["19.90", "USD", "19.90"],
    ["19.90", null, "19.9"],
    ["0.00", null, "0"],
    ["1234.567890", "USD", null],
    [null, "USD", null],
    [null, null, null],
    ["100", "JPY", "100"],
  ] as const)("persists price %s with currency %s exactly", async (price, currencyCode, expected) => {
    const {accountId, recommendationId} = await seed();
    if (expected === null && price !== null) {
      // 1234.567890 has six decimals, which no supported currency has, so the contract
      // refuses it rather than rounding an owner's number.
      await expect(withClient(client => writeProductOffer(client, recommendationId, accountId, {price, currencyCode, buyUrl: null}))).rejects.toThrow();
      return;
    }
    await withClient(client => writeProductOffer(client, recommendationId, accountId, {price, currencyCode, buyUrl: null}));
    const offer = await readProductOffer(pool, recommendationId, accountId);
    expect(offer.price).toBe(expected);
    expect(offer.currencyCode).toBe(currencyCode);
    // Zero is never read back as unknown and unknown is never read back as zero.
    if (price === null) expect(offer.price).toBeNull(); else expect(offer.price).not.toBeNull();
    const stored = (await pool.query("SELECT price::text AS price,currency_code FROM product_recommendation_context WHERE recommendation_id=$1", [recommendationId])).rows[0];
    expect(stored.currency_code).toBe(currencyCode);
    if (price === null) expect(stored.price).toBeNull();
    else expect(Number(stored.price)).toBe(Number(price));
  });

  it("treats an absent offer row as unknown rather than free", async () => {
    const {accountId, recommendationId} = await seed();
    expect(await readProductOffer(pool, recommendationId, accountId)).toEqual({price: null, currencyCode: null, buyUrl: null});
  });

  it("refuses a negative amount and an unsupported currency without a partial write", async () => {
    const {accountId, recommendationId} = await seed();
    for (const offer of [{price: "-1", currencyCode: "USD", buyUrl: null}, {price: "10.00", currencyCode: "XYZ", buyUrl: null},
      {price: "10.00", currencyCode: "usd", buyUrl: null}, {price: "10.500", currencyCode: "USD", buyUrl: null},
      {price: "100.50", currencyCode: "JPY", buyUrl: null}, {price: "10.00", currencyCode: "USD", buyUrl: "javascript:alert(1)"}])
      await expect(withClient(client => writeProductOffer(client, recommendationId, accountId, offer as never))).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM product_recommendation_context WHERE recommendation_id=$1", [recommendationId])).rows[0].count).toBe(0);
  });

  it("refuses a negative amount at the database even if the contract were bypassed", async () => {
    const {accountId, recommendationId} = await seed();
    await expect(pool.query("INSERT INTO product_recommendation_context(recommendation_id,account_id,price) VALUES($1,$2,-1)", [recommendationId, accountId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO product_recommendation_context(recommendation_id,account_id,currency_code) VALUES($1,$2,'usd')", [recommendationId, accountId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO product_recommendation_context(recommendation_id,account_id,buy_url) VALUES($1,$2,'javascript:alert(1)')", [recommendationId, accountId])).rejects.toThrow();
  });

  it("keeps one owner's offer out of another owner's recommendation of the same product", async () => {
    const first = await seed();
    await withClient(client => insertProductDetails(client, first.entityId, details()));
    const second = await withClient(async client => {
      const accountId = (await client.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id")).rows[0].id as string;
      const recommendationId = (await client.query(
        "INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'products',$2,'draft') RETURNING id",
        [accountId, first.entityId])).rows[0].id as string;
      return {accountId, recommendationId};
    });
    await withClient(client => writeProductOffer(client, first.recommendationId, first.accountId, {price: "19.90", currencyCode: "USD", buyUrl: null}));
    await withClient(client => writeProductOffer(client, second.recommendationId, second.accountId, {price: "24.00", currencyCode: "EUR", buyUrl: null}));
    expect(await readProductOffer(pool, first.recommendationId, first.accountId)).toMatchObject({price: "19.90", currencyCode: "USD"});
    expect(await readProductOffer(pool, second.recommendationId, second.accountId)).toMatchObject({price: "24.00", currencyCode: "EUR"});
    // Both recommendations still name the one shared entity, and its facts are untouched.
    expect((await readProductEntity(pool, first.entityId)).details).toEqual(details());
  });

  it("does not merge separate products whose merchant URLs only look similar", async () => {
    const urls = ["https://example.com/widget", "https://example.com/widget/", "https://www.example.com/widget", "https://example.com/widget?ref=a"];
    const ids: string[] = [];
    for (const productUrl of urls) {
      const {entityId} = await seed();
      await withClient(client => insertProductDetails(client, entityId, details({productUrl})));
      ids.push(entityId);
    }
    expect(new Set(ids).size).toBe(urls.length);
    for (const [index, id] of ids.entries()) expect((await readProductEntity(pool, id)).details.productUrl).toBe(urls[index]);
  });

  it("refuses a product detail row on an entity of another kind", async () => {
    const entityId = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Not a product','manual') RETURNING id")).rows[0].id as string;
    await expect(withClient(client => insertProductDetails(client, entityId, details()))).rejects.toThrow();
  });

  it("refuses an unsafe image URL and a non-string specification value at the database", async () => {
    const {entityId} = await seed();
    await expect(pool.query("INSERT INTO product_entity_details(entity_id,product_url,image_urls) VALUES($1,'https://example.com/w',ARRAY['javascript:alert(1)'])", [entityId])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO product_entity_details(entity_id,product_url,specifications) VALUES($1,'https://example.com/w','{"Weight":2}'::jsonb)`, [entityId])).rejects.toThrow();
    await expect(pool.query("INSERT INTO product_entity_details(entity_id,product_url) VALUES($1,'javascript:alert(1)')", [entityId])).rejects.toThrow();
  });

  it("never applies a productUrl override, so one owner cannot re-point a shared product", async () => {
    const facts = details();
    expect(effectiveProductDetails(facts, {productUrl: "https://evil.example.com/other", brand: "Renamed"}))
      .toEqual({...facts, brand: "Renamed"});
  });

  it("removes the offer with the account's content on a terminal purge", async () => {
    const {accountId, recommendationId, entityId} = await seed();
    await withClient(client => insertProductDetails(client, entityId, details()));
    await withClient(client => writeProductOffer(client, recommendationId, accountId, {price: "5.00", currencyCode: "USD", buyUrl: null}));
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
    expect((await pool.query("SELECT count(*)::int AS count FROM product_recommendation_context WHERE account_id=$1", [accountId])).rows[0].count).toBe(0);
    // The shared catalog row survives: it is not the account's to delete.
    expect((await readProductEntity(pool, entityId)).details.productUrl).toBe(details().productUrl);
  });

  it("serves a published Products list on the public projection instead of an empty page", async () => {
    const {accountId, entityId, recommendationId} = await seed();
    const handle = `products${Date.now().toString(36)}`;
    await withClient(async client => {
      await insertProductDetails(client, entityId, details());
      await writeProductOffer(client, recommendationId, accountId, {price: "19.90", currencyCode: "USD", buyUrl: "https://example.com/buy"});
      await client.query(`UPDATE creator_accounts SET handle=$2,display_name='Product owner',account_type='Creator',
        public_profile=true,onboarding_status='complete',status='active' WHERE id=$1`, [accountId, handle]);
      await client.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'products',true,0)
        ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [accountId]);
      const collectionId = (await client.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order)
        VALUES($1,'products','Gear','gear','public','published',0) RETURNING id`, [accountId])).rows[0].id as string;
      await client.query("UPDATE recommendations SET publication_state='published' WHERE id=$1", [recommendationId]);
      await client.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'products',0)`,
        [collectionId, recommendationId, accountId]);
    });
    const page = await publicProductsProjection(pool, handle, 12) as {productLists: any[]};
    expect(page.productLists).toHaveLength(1);
    const product = page.productLists[0].recommended_products[0];
    // Numbers at the display edge, exactly as RecommendedProduct declares them.
    expect(product).toMatchObject({price: 19.9, currency: "USD", buy_url: "https://example.com/buy", product_category: null});
    expect(product.specifications).toEqual({Weight: "1kg", Colour: "Black"});
    expect(product.images).toEqual(["https://example.com/a.png"]);
  });
});

describe("canonical amounts", () => {
  it("pads to the currency's minor units and keeps zero distinct from unknown", () => {
    expect(canonicalAmount("19.900000", "USD")).toBe("19.90");
    expect(canonicalAmount("0.000000", "USD")).toBe("0.00");
    expect(canonicalAmount("0.000000", null)).toBe("0");
    expect(canonicalAmount("100.000000", "JPY")).toBe("100");
    expect(canonicalAmount("19.900000", null)).toBe("19.9");
    expect(() => canonicalAmount("100.500000", "JPY")).toThrow();
  });
});
