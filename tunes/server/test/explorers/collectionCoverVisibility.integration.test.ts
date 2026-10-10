import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../../auth/betterAuth";
import { LocalObjectStorage } from "../../services/objectStorage";

// Exactly seven test identities; category and policy phases are explicit loops.
const categories = ["places", "products", "people"] as const;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const prefix = "collection-cover-visibility-";
const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "collection-cover-secret-".repeat(3), GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture" });
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;
let storage: HeldLocalStorage;
let root: string;

class HeldLocalStorage extends LocalObjectStorage {
  getAttempts = 0;
  private hold?: { key: string; entered: () => void; resumed: Promise<void> };
  holdRead(key: string) {
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    this.hold = { key, entered, resumed };
    return { reached, release };
  }
  override async get(key: string): Promise<Buffer> {
    this.getAttempts++;
    const bytes = await super.get(key);
    const hold = this.hold;
    if (hold?.key === key) {
      this.hold = undefined;
      hold.entered();
      await hold.resumed;
    }
    return bytes;
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 });
  root = await mkdtemp(join(tmpdir(), prefix));
  storage = new HeldLocalStorage(root);
  composed = createCanonicalApp(pool, config, { mediaStorage: storage });
});
afterAll(async () => {
  await pool?.end();
  if (root) {
    const absolute = resolve(root), parent = resolve(tmpdir()) + sep;
    if (!absolute.startsWith(parent) || !absolute.slice(parent.length).startsWith(prefix)) throw new Error("cover storage cleanup refused");
    await rm(absolute, { recursive: true, force: true });
  }
});

async function persona() {
  const userId = `cover-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const initial = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(initial.status).toBe(200);
  const handle = `p${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const completed = await request(composed.app).patch("/api/explorers/v1/account").set("cookie", cookie).set("origin", config.baseURL)
    .send({ expectedRevision: initial.body.account.revision, handle, displayName: "Public", accountType: "Creator", onboardingStatus: "complete" });
  expect(completed.status).toBe(200);
  return { accountId: initial.body.account.id as string, handle, cookie };
}
type Owner = Awaited<ReturnType<typeof persona>>;
async function collection(owner: Owner, category = "places") {
  await pool.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order)
    SELECT $1,$2,true,coalesce(max(display_order)+1,0) FROM account_category_settings WHERE account_id=$1
    ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`, [owner.accountId, category]);
  const slug = `cover-${randomUUID()}`;
  const row = (await pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state)
    SELECT $1,$2,'Cover list',$3,coalesce(max(display_order)+1,0),'public','published' FROM collections WHERE account_id=$1 AND category=$2 RETURNING id`, [owner.accountId, category, slug])).rows[0];
  return { id: row.id as string, slug, category };
}
async function asset(owner: Owner, purpose = "collection", status = "ready", environment = "local") {
  const id = randomUUID(), key = `local/${owner.accountId}/${id}`, hash = createHash("sha256").update(png).digest();
  await storage.put(key, png);
  await pool.query(`INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
    VALUES($1,$2,$3,$4,'image/png',$5,$6,CASE WHEN $4='ready' THEN now() ELSE NULL END)`, [id, owner.accountId, purpose, status, png.length, hash]);
  await pool.query(`INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256)
    VALUES($1,'original',$2,$3,'image/png',$4,$5)`, [id, environment, environment === "local" ? key : key.replace("local/", `${environment}/`), png.length, hash]);
  return { id, key, url: `/api/explorers/v1/media/${id}/content` };
}
type Asset = Awaited<ReturnType<typeof asset>>;
async function attach(owner: Owner, list: { id: string }, media: Asset) {
  await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [list.id, owner.accountId, media.id]);
}
async function fixture(category = "places", owner?: Owner) {
  const person = owner ?? await persona(), list = await collection(person, category), media = await asset(person);
  await attach(person, list, media);
  return { owner: person, list, media };
}
async function positive(media: Asset, cookie?: string) {
  const response = cookie ? await request(composed.app).get(media.url).set("cookie", cookie) : await request(composed.app).get(media.url);
  expect(response.status).toBe(200);
  expect(response.body).toEqual(png);
  expect(response.headers["cache-control"]).toBe(cookie ? "no-store" : "public, max-age=300, must-revalidate");
  expect(response.headers.etag).toBe(`"${createHash("sha256").update(png).digest("hex")}"`);
  return response.headers.etag as string;
}
async function denied(media: Asset, etag: string, cookie?: string) {
  for (const mode of ["get", "head", "range", "conditional"]) {
    let pending = mode === "head" ? request(composed.app).head(media.url) : request(composed.app).get(media.url);
    if (mode === "range") pending = pending.set("range", "bytes=0-3");
    if (mode === "conditional") pending = pending.set("if-none-match", etag);
    if (cookie) pending = pending.set("cookie", cookie);
    const response = await pending;
    expect(response.status, mode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.etag).not.toBe(etag);
    expect(response.headers["content-type"] ?? "").not.toContain("image/png");
    expect(response.body).not.toEqual(png);
    expect(response.body).not.toEqual(png.subarray(0, 4));
    if (mode === "head") expect(response.text ?? "").toBe("");
    else expect(response.body.error).toMatchObject({ code: "NOT_FOUND", message: "Media unavailable" });
  }
}
async function rejectedWrite(sql: string, values: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await expect((async () => { await client.query(sql, values); await client.query("SET CONSTRAINTS ALL IMMEDIATE"); })()).rejects.toThrow();
  } finally { await client.query("ROLLBACK"); client.release(); }
}

describe("collection cover public visibility", () => {
  it("serves public Places Products and People collection cover bytes through the canonical media route", async () => {
    for (const category of categories) {
      const { media } = await fixture(category), etag = await positive(media);
      const head = await request(composed.app).head(media.url);
      expect(head.status).toBe(200); expect(head.text ?? "").toBe("");
      expect(head.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
      const range = await request(composed.app).get(media.url).set("range", "bytes=0-3");
      expect(range.status).toBe(206); expect(range.body).toEqual(png.subarray(0, 4));
      expect(range.headers["content-range"]).toBe(`bytes 0-3/${png.length}`);
      const conditional = await request(composed.app).get(media.url).set("if-none-match", etag);
      expect(conditional.status).toBe(304); expect(conditional.text ?? "").toBe("");
    }
  });

  it("withdraws collection cover bytes for every account category and collection visibility gate", async () => {
    for (const category of categories) {
      const { owner, list, media } = await fixture(category);
      const phases: Array<[string, unknown[], string, unknown[], boolean]> = [
        ["UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1", [owner.accountId], true],
        ["UPDATE creator_accounts SET onboarding_status='incomplete' WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET onboarding_status='complete' WHERE id=$1", [owner.accountId], false],
        ["UPDATE creator_accounts SET public_profile=false WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET public_profile=true WHERE id=$1", [owner.accountId], false],
        ["UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category=$2", [owner.accountId, category], "UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category=$2", [owner.accountId, category], false],
        ["UPDATE collections SET visibility='private' WHERE id=$1", [list.id], "UPDATE collections SET visibility='public' WHERE id=$1", [list.id], false],
        ["UPDATE collections SET publication_state='draft' WHERE id=$1", [list.id], "UPDATE collections SET publication_state='published' WHERE id=$1", [list.id], false],
        ["UPDATE collections SET archived_at=now() WHERE id=$1", [list.id], "UPDATE collections SET archived_at=NULL WHERE id=$1", [list.id], false],
        ["DELETE FROM collection_media WHERE collection_id=$1", [list.id], "INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [list.id, owner.accountId, media.id], false],
      ];
      for (const [withdraw, parameters, restore, restoredParameters, inactive] of phases) {
        const etag = await positive(media);
        await pool.query(withdraw, parameters);
        try { await denied(media, etag); if (inactive) await denied(media, etag, owner.cookie); }
        finally { await pool.query(restore, restoredParameters); }
      }
      const replacement = await asset(owner), etag = await positive(media);
      await pool.query("UPDATE collection_media SET media_id=$2 WHERE collection_id=$1", [list.id, replacement.id]);
      await denied(media, etag); await positive(replacement);
      await positive(media, owner.cookie);
    }
  });

  it("keeps cover bytes public until the final eligible collection attachment is withdrawn", async () => {
    const { owner, list, media } = await fixture(), second = await collection(owner, "products");
    await attach(owner, second, media);
    await positive(media);
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [list.id]);
    const etag = await positive(media);
    await pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1", [second.id]);
    await denied(media, etag);
  });

  it("keeps independently public Products and People covers readable when their Places parent is hidden", async () => {
    const parent = await fixture(), product = await fixture("products", parent.owner), people = await fixture("people", parent.owner);
    const snapshot = { version: 1, name: "Lisbon", address: "Lisbon, Portugal", providerPlaceId: null, latitude: 38.7223, longitude: -9.1393 };
    await pool.query("INSERT INTO place_collection_details(collection_id,account_id,location_snapshot) VALUES($1,$2,$3)", [parent.list.id, parent.owner.accountId, snapshot]);
    for (const child of [product, people]) await pool.query("INSERT INTO collection_location_links(child_collection_id,account_id,child_category,location_collection_id) VALUES($1,$2,$3,$4)", [child.list.id, parent.owner.accountId, child.list.category, parent.list.id]);
    const manifest = (await pool.query("SELECT collection_id,media_id FROM collection_media WHERE account_id=$1 ORDER BY collection_id", [parent.owner.accountId])).rows;
    expect(manifest).toEqual([parent, product, people].map(f => ({ collection_id: f.list.id, media_id: f.media.id })).sort((a, b) => a.collection_id.localeCompare(b.collection_id)));
    const etags = await Promise.all([parent, product, people].map(f => positive(f.media)));
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [parent.list.id]);
    await denied(parent.media, etags[0]);
    for (const child of [product, people]) {
      const detail = await request(composed.app).get(`/api/explorers/v1/profiles/${parent.owner.handle}/recommendations/${child.list.category}/${child.list.slug}`);
      expect(detail.status).toBe(200); expect(JSON.stringify(detail.body)).toContain(child.media.url);
      await positive(child.media);
      const owned = await request(composed.app).get(`/api/explorers/v1/collections/${child.list.id}/editable`).set("cookie", parent.owner.cookie);
      expect(owned.status).toBe(200); expect(owned.body.collection.locationLink.locationCollectionId).toBe(parent.list.id);
    }
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [product.list.id]);
    await denied(product.media, etags[1]);
    await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='people'", [parent.owner.accountId]);
    await denied(people.media, etags[2]);
    await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='people'", [parent.owner.accountId]);
    await positive(people.media);
    await pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1", [parent.owner.accountId]);
    const covers = [parent, product, people];
    for (let index = 0; index < covers.length; index++) await denied(covers[index].media, etags[index]);
  });

  it("keeps detached and private collection cover bytes owner only and refuses foreign ownership", async () => {
    const { owner, list, media } = await fixture(), other = await persona(), foreignList = await collection(other);
    const etag = await positive(media);
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [list.id]);
    await positive(media, owner.cookie); await denied(media, etag); await denied(media, etag, other.cookie);
    const missing = await request(composed.app).get(`/api/explorers/v1/media/${randomUUID()}/content`);
    const hidden = await request(composed.app).get(media.url);
    expect(hidden.status).toBe(missing.status); expect(hidden.body.error.code).toBe(missing.body.error.code);
    expect(hidden.body.error.message).toBe(missing.body.error.message);
    await pool.query("DELETE FROM collection_media WHERE collection_id=$1", [list.id]);
    await positive(media, owner.cookie); await denied(media, etag); await denied(media, etag, other.cookie);
    await rejectedWrite("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [foreignList.id, other.accountId, media.id]);
    expect((await pool.query("SELECT count(*)::int AS count FROM collection_media WHERE media_id=$1", [media.id])).rows[0].count).toBe(0);
  });

  it("rechecks collection cover eligibility after real local storage reads before returning bytes", async () => {
    const { owner, list, media } = await fixture();
    const etag = await positive(media);
    for (const conditional of [false, true]) {
      const barrier = storage.holdRead(media.key);
      let pending = request(composed.app).get(media.url);
      if (conditional) pending = pending.set("if-none-match", etag);
      const response = pending.timeout({ response: 10_000, deadline: 15_000 }).then(response => response);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([barrier.reached, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Local cover read barrier was not reached")), 5_000);
        })]);
        await pool.query("DELETE FROM collection_media WHERE collection_id=$1", [list.id]);
      } finally { clearTimeout(timer); barrier.release(); }
      const deniedResponse = await response;
      expect(deniedResponse.status).toBe(404);
      expect(deniedResponse.headers["cache-control"]).toBe("no-store");
      expect(deniedResponse.headers.etag).not.toBe(etag);
      expect(deniedResponse.headers["content-type"] ?? "").not.toContain("image/png");
      expect(deniedResponse.body).not.toEqual(png);
      expect(deniedResponse.body).not.toEqual(png.subarray(0, 4));
      expect(deniedResponse.body.error).toMatchObject({ code: "NOT_FOUND", message: "Media unavailable" });
      await attach(owner, list, media); await positive(media);
    }
  });

  it("preserves collection media purpose readiness and storage boundaries", async () => {
    const { owner, media } = await fixture();
    const etag = await positive(media);
    for (const [purpose, status] of [["claim-evidence", "ready"], ["recommendation", "ready"], ["collection", "uploading"]]) {
      const invalid = await asset(owner, purpose, status), target = await collection(owner);
      await rejectedWrite("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [target.id, owner.accountId, invalid.id]);
      await denied(invalid, etag);
      if (status !== "ready") await denied(invalid, etag, owner.cookie);
    }
    await rejectedWrite("UPDATE media_assets SET status='uploading',ready_at=NULL WHERE id=$1", [media.id]);
    const beforePublicControl = storage.getAttempts;
    await positive(media);
    expect(storage.getAttempts).toBe(beforePublicControl + 1);
    const ownerControl = await asset(owner);
    const beforeOwnerControl = storage.getAttempts;
    await positive(ownerControl, owner.cookie);
    expect(storage.getAttempts).toBe(beforeOwnerControl + 1);
    const wrongEnvironment = await asset(owner, "collection", "ready", "qa");
    const eligibleList = await collection(owner);
    await attach(owner, eligibleList, wrongEnvironment);
    const beforeWrongEnvironment = storage.getAttempts;
    await denied(wrongEnvironment, etag);
    expect(storage.getAttempts).toBe(beforeWrongEnvironment);
    await denied(wrongEnvironment, etag, owner.cookie);
    expect(storage.getAttempts).toBe(beforeWrongEnvironment);
    const guide = await fixture("guides", owner);
    const guideEtag = await positive(guide.media);
    const publicGuideOwner = await request(composed.app).get(guide.media.url).set("cookie", owner.cookie);
    expect(publicGuideOwner.status).toBe(200); expect(publicGuideOwner.body).toEqual(png);
    expect(publicGuideOwner.headers.etag).toBe(guideEtag);
    expect(publicGuideOwner.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    await pool.query("UPDATE collections SET publication_state='draft',visibility='private' WHERE id=$1", [guide.list.id]);
    await denied(guide.media, guideEtag); await positive(guide.media, owner.cookie);
  });
});
