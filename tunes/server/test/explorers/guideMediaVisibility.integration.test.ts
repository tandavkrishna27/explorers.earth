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
import { MediaRepository } from "../../repositories/mediaRepository";
import { MediaService } from "../../application/media";
import { guideEmptySectionBlocks, type GuideSectionBlocks } from "../../../shared/explorersGuideContract";

// Eight serialized identities; actual app, native commands and private local bytes.

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const prefix = "guide-media-visibility-";
const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "guide-media-secret-".repeat(3), GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture" });
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;
let storage: HeldLocalStorage;
let root: string;

class HeldLocalStorage extends LocalObjectStorage {
  getAttempts = 0; deleteAttempts = 0; failNextPut = false;
  override async put(key: string, bytes: Buffer): Promise<void> { if (this.failNextPut) { this.failNextPut = false; throw new Error("held fixture put failure"); } await super.put(key, bytes); }
  override async delete(key: string): Promise<void> { this.deleteAttempts++; await super.delete(key); }
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
async function collection(owner: Owner, category = "guides") {
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
async function fixture(category = "guides", owner?: Owner) {
  const person = owner ?? await persona(), list = await collection(person, category), media = await asset(person);
  await attach(person, list, media);
  return { owner: person, list, media };
}
async function positive(media: Asset, entitlement: "public" | "owner", cookie?: string) {
  const response = cookie ? await request(composed.app).get(media.url).set("cookie", cookie) : await request(composed.app).get(media.url);
  expect(response.status).toBe(200);
  expect(response.body).toEqual(png);
  expect(response.headers["cache-control"]).toBe(entitlement === "owner" ? "no-store" : "public, max-age=300, must-revalidate");
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

const shaEtag = `"${createHash("sha256").update(png).digest("hex")}"`;
const guideUrl = (id: string) => `/api/explorers/v1/collections/${id}/guide`;
async function aggregate(owner: Owner, list: {id: string}) {
  const result = await request(composed.app).get(guideUrl(list.id)).set("cookie", owner.cookie);
  expect(result.status).toBe(200); return result.body.guide;
}
async function command(owner: Owner, list: {id: string}, method: "put" | "post" | "patch" | "delete", suffix: string, body: Record<string, unknown>, revision?: number) {
  const observed = revision ?? (await aggregate(owner, list)).revision;
  return request(composed.app)[method](guideUrl(list.id) + suffix).set("cookie", owner.cookie)
    .set("origin", config.baseURL).set("Idempotency-Key", randomUUID()).send({revision: observed, ...body});
}
async function uploaded(owner: Owner, purpose = "guide") {
  const result = await request(composed.app).post("/api/explorers/v1/media").set("cookie", owner.cookie)
    .set("origin", config.baseURL).set("x-media-purpose", purpose).set("x-file-name", "guide.png")
    .set("content-type", "image/png").send(png);
  expect(result.status).toBe(201);
  const record = await new MediaRepository(pool).find(result.body.media.id);
  expect(record).toMatchObject({status: "ready", purpose, storage_environment: "local", mime_type: "image/png"});
  expect(record!.content_sha256.equals(createHash("sha256").update(png).digest())).toBe(true);
  return {id: result.body.media.id as string, key: record!.object_key, url: result.body.media.url as string};
}
function blocks(mediaIds: string[]): GuideSectionBlocks {
  return {...JSON.parse(JSON.stringify(guideEmptySectionBlocks)), timeline: {morning: [{
    localId: "stop", placeId: "ChIJstop", name: "Stop", formattedAddress: "Kochi",
    geometry: {location: {lat: 9.93, lng: 76.26}}, types: ["cafe"], tips: null,
    photos: mediaIds.map(mediaId => ({mediaId, fileName: null, width: null, height: null, aspectRatio: null})),
    priceLevel: null, priceRange: null, customBudget: null, budgetAmount: null, budgetCurrency: null,
    source: "google", verified: true,
  }], afternoon: [], evening: []}};
}
const draft = (ids: string[]) => ({title: "Day one", description: null, blocks: blocks(ids)});
async function nativeCover(owner: Owner, list: {id: string}, media: Asset) {
  const result = await command(owner, list, "put", "/cover", {mediaId: media.id});
  expect(result.status).toBe(200); expect(result.body.guide.coverMediaId).toBe(media.id);
}
async function nativeSection(owner: Owner, list: {id: string}, media: Asset) {
  const before = await aggregate(owner, list), result = await command(owner, list, "post", "/sections", draft([media.id]), before.revision);
  expect(result.status).toBe(201);
  const section = result.body.guide.sections.find((s: {id: string}) => !before.sections.some((old: {id: string}) => old.id === s.id));
  expect(section).toBeDefined();
  expect((await pool.query("SELECT media_id FROM guide_section_photos WHERE section_id=$1", [section.id])).rows).toEqual([{media_id: media.id}]);
  return section.id as string;
}
async function removePhoto(owner: Owner, list: {id: string}, section: string, deleting = false) {
  const result = await command(owner, list, deleting ? "delete" : "patch", `/sections/${section}`, deleting ? {} : draft([]));
  expect(result.status).toBe(200);
  expect((await pool.query("SELECT 1 FROM guide_section_photos WHERE section_id=$1", [section])).rowCount).toBe(0);
}
async function guideFixture(kind: "cover" | "photo", owner?: Owner) {
  const person = owner ?? await persona(), list = await collection(person), media = await uploaded(person, kind === "cover" ? "collection" : "guide");
  const section = kind === "photo" ? await nativeSection(person, list, media) : undefined;
  if (kind === "cover") await nativeCover(person, list, media);
  expect((await pool.query(`SELECT (SELECT count(*) FROM collection_media WHERE media_id=$1)
    +(SELECT count(*) FROM guide_section_photos WHERE media_id=$1) AS count`, [media.id])).rows[0].count).toBe("1");
  expect((await pool.query("SELECT 1 FROM profile_media WHERE media_id=$1", [media.id])).rowCount).toBe(0);
  return {owner: person, list, media, section};
}
async function methods(media: Asset) {
  const etag = await positive(media, "public");
  const head = await request(composed.app).head(media.url);
  expect(head.status).toBe(200); expect(head.text ?? "").toBe(""); expect(Number(head.headers["content-length"])).toBe(png.length);
  const conditional = await request(composed.app).get(media.url).set("if-none-match", etag);
  expect(conditional.status).toBe(304); expect(conditional.text ?? "").toBe("");
  const range = await request(composed.app).get(media.url).set("range", "bytes=0-3");
  expect(range.status).toBe(206); expect(range.body).toEqual(png.subarray(0, 4)); expect(range.headers["content-range"]).toBe(`bytes 0-3/${png.length}`);
  return etag;
}
async function denialNoRead(media: Asset, cookie?: string) {
  const attempts = storage.getAttempts; await denied(media, shaEtag, cookie); expect(storage.getAttempts).toBe(attempts);
}
const errorShape = (result: {status: number; body: {error: {code: string; message: string}}}) => ({status: result.status, code: result.body.error.code, message: result.body.error.message});
async function hiddenEqualsMissing(media: Asset, other: Owner) {
  const hidden = await request(composed.app).get(media.url).set("cookie", other.cookie);
  const missing = await request(composed.app).get(`/api/explorers/v1/media/${randomUUID()}/content`).set("cookie", other.cookie);
  expect(errorShape(hidden)).toEqual(errorShape(missing)); expect(hidden.status).toBe(404);
}
async function snapshot(owner: Owner, list: {id: string}) {
  return {guide: await aggregate(owner, list), cover: (await pool.query("SELECT * FROM collection_media WHERE collection_id=$1", [list.id])).rows,
    photos: (await pool.query("SELECT p.* FROM guide_section_photos p JOIN guide_sections s ON s.id=p.section_id WHERE s.collection_id=$1 ORDER BY p.section_id,p.media_id", [list.id])).rows};
}
async function aged(media: Asset) {await pool.query("UPDATE media_assets SET created_at=now()-interval '25 hours',ready_at=now()-interval '25 hours' WHERE id=$1", [media.id]);}
async function deleteHttp(owner: Owner, media: Asset) {
  return request(composed.app).delete(`/api/explorers/v1/media/${media.id}`).set("cookie", owner.cookie).set("origin", config.baseURL);
}
async function lifetimeBlocked(owner: Owner, media: Asset) {
  const repo = new MediaRepository(pool), before = await repo.find(media.id), deletes = storage.deleteAttempts;
  expect((await repo.abandoned(owner.accountId, "local")).map(row => row.id)).not.toContain(media.id);
  await expect(repo.markDelete(media.id, owner.accountId)).resolves.toBeUndefined();
  expect(await repo.find(media.id)).toEqual(before); expect(await storage.get(media.key)).toEqual(png);
  const refused = await deleteHttp(owner, media); expect(refused.status).toBe(404);
  expect(storage.deleteAttempts).toBe(deletes); expect(await repo.find(media.id)).toEqual(before);
}
async function held(media: Asset, conditional: boolean, withdraw: () => Promise<unknown>, allowed = false) {
  await positive(media, "public"); const barrier = storage.holdRead(media.key);
  let pending = request(composed.app).get(media.url);
  if (conditional) pending = pending.set("if-none-match", shaEtag);
  const settled = pending.timeout({response: 10_000, deadline: 15_000}).then(value => value);
  // Attach a rejection observer immediately; finally always releases and drains native work.
  void settled.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([barrier.reached, new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("Guide storage barrier not reached")), 5_000);})]);
    await withdraw();
  } finally {clearTimeout(timer); barrier.release(); await settled;}
  const result = await settled;
  if (allowed) {expect(result.status).toBe(200); expect(result.body).toEqual(png); return;}
  expect(result.status).toBe(404); expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.headers.etag).not.toBe(shaEtag); expect(result.body).not.toEqual(png);
  expect(result.headers["content-type"] ?? "").not.toContain("image/png");
  expect(result.body.error).toMatchObject({code: "NOT_FOUND", message: "Media unavailable"});
  await denialNoRead(media);
}

describe.sequential("Guides media public visibility and reference lifetime", () => {
  it("serves Guides collection cover and section photo bytes through real upload and native attachment", async () => {
    const other = await persona();
    for (const kind of ["cover", "photo"] as const) {const {media, owner} = await guideFixture(kind); await methods(media); await positive(media, "public", owner.cookie); await positive(media, "public", other.cookie);}
  });

  it("withdraws sole Guides attachments and every ancestor without reading storage", async () => {
    const other = await persona();
    for (const kind of ["cover", "photo"] as const) {
      const f = await guideFixture(kind), {owner, list, media} = f;
      const phases: Array<[string, unknown[], string, unknown[], boolean]> = [
        ["UPDATE collections SET visibility='private' WHERE id=$1", [list.id], "UPDATE collections SET visibility='public' WHERE id=$1", [list.id], false],
        ["UPDATE collections SET publication_state='draft' WHERE id=$1", [list.id], "UPDATE collections SET publication_state='published' WHERE id=$1", [list.id], false],
        ["UPDATE collections SET archived_at=now() WHERE id=$1", [list.id], "UPDATE collections SET archived_at=NULL WHERE id=$1", [list.id], false],
        ["UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='guides'", [owner.accountId], "UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='guides'", [owner.accountId], false],
        ["UPDATE creator_accounts SET public_profile=false WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET public_profile=true WHERE id=$1", [owner.accountId], false],
        ["UPDATE creator_accounts SET onboarding_status='incomplete' WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET onboarding_status='complete' WHERE id=$1", [owner.accountId], false],
        ["UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [owner.accountId], "UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1", [owner.accountId], true],
      ];
      if (f.section) phases.push(["UPDATE guide_sections SET archived_at=now() WHERE id=$1", [f.section], "UPDATE guide_sections SET archived_at=NULL WHERE id=$1", [f.section], false]);
      for (const [withdraw, values, restore, restored, inactive] of phases) {
        await positive(media, "public"); await pool.query(withdraw, values);
        try {await denialNoRead(media); await denialNoRead(media, other.cookie); await hiddenEqualsMissing(media, other);
          if (inactive) await denialNoRead(media, owner.cookie); else await positive(media, "owner", owner.cookie);
        } finally {await pool.query(restore, restored);}
      }
      if (f.section) {
        await positive(media, "public"); await removePhoto(owner, list, f.section); await denialNoRead(media); await positive(media, "owner", owner.cookie);
        const section = await nativeSection(owner, list, media); await positive(media, "public");
        await removePhoto(owner, list, section, true); await denialNoRead(media); await positive(media, "owner", owner.cookie);
      } else {await positive(media, "public"); await pool.query("DELETE FROM collection_media WHERE collection_id=$1", [list.id]); await denialNoRead(media); await positive(media, "owner", owner.cookie);}
    }
  });

  it("retains public section bytes until the final eligible section attachment is withdrawn", async () => {
    const f = await guideFixture("photo"), second = await collection(f.owner), section = await nativeSection(f.owner, second, f.media);
    await methods(f.media); await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [f.list.id]); await methods(f.media);
    await pool.query("UPDATE guide_sections SET archived_at=now() WHERE id=$1", [section]); await denialNoRead(f.media);
    await aged(f.media); await lifetimeBlocked(f.owner, f.media);
    await pool.query("UPDATE collections SET visibility='public' WHERE id=$1", [f.list.id]); await positive(f.media, "public");
    await removePhoto(f.owner, f.list, f.section!, true); await denialNoRead(f.media); await lifetimeBlocked(f.owner, f.media);
    await pool.query("UPDATE guide_sections SET archived_at=NULL WHERE id=$1", [section]); await positive(f.media, "public");
  });

  it("rechecks Guides entitlement after held real storage reads before returning bytes or validators", async () => {
    for (const kind of ["cover", "photo"] as const) for (const conditional of [false, true]) {
      const f = await guideFixture(kind);
      await held(f.media, conditional, () => kind === "cover" ? pool.query("DELETE FROM collection_media WHERE collection_id=$1", [f.list.id]) : removePhoto(f.owner, f.list, f.section!));
      const ancestor = await guideFixture(kind);
      await held(ancestor.media, conditional, () => pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1", [ancestor.owner.accountId]));
    }
    const f = await guideFixture("photo"), second = await collection(f.owner); await nativeSection(f.owner, second, f.media);
    await held(f.media, false, () => removePhoto(f.owner, f.list, f.section!), true); await methods(f.media);
  });

  it("preserves valid Guides attachments across stale foreign and purpose readiness failures", async () => {
    const owner = await persona(), other = await persona(), list = await collection(owner), foreignList = await collection(other), otherGuide = await collection(owner);
    const cover = await uploaded(owner, "collection"), photo = await uploaded(owner), section = await nativeSection(owner, list, photo); await nativeCover(owner, list, cover);
    const validCover = await uploaded(owner, "collection"), validPhoto = await uploaded(owner);
    const before = await snapshot(owner, list);
    for (const [suffix, method, body] of [["/cover", "put", {mediaId: validCover.id}], [`/sections/${section}`, "patch", draft([validPhoto.id])]] as const) {
      const refusal = await command(owner, list, method, suffix, body, before.guide.revision - 1); expect(refusal.status).toBe(409);
      expect(await snapshot(owner, list)).toEqual(before);
    }
    const foreignCoverCommand = await command(owner, foreignList, "put", "/cover", {mediaId: validCover.id}, before.guide.revision);
    const missingCoverCommand = await command(owner, {id: randomUUID()}, "put", "/cover", {mediaId: validCover.id}, before.guide.revision);
    expect(errorShape(foreignCoverCommand)).toEqual(errorShape(missingCoverCommand)); expect(foreignCoverCommand.status).toBe(404);
    const wrongGuide = await command(owner, otherGuide, "patch", `/sections/${section}`, draft([validPhoto.id]));
    const missingSection = await command(owner, otherGuide, "patch", `/sections/${randomUUID()}`, draft([validPhoto.id]));
    expect(errorShape(wrongGuide)).toEqual(errorShape(missingSection)); expect(wrongGuide.status).toBe(404);
    const foreignSection = await command(other, foreignList, "patch", `/sections/${section}`, draft([]));
    const absentForeignSection = await command(other, foreignList, "patch", `/sections/${randomUUID()}`, draft([]));
    expect(errorShape(foreignSection)).toEqual(errorShape(absentForeignSection)); expect(foreignSection.status).toBe(404);
    expect(await snapshot(owner, list)).toEqual(before);
    const foreignCover = await uploaded(other, "collection"), foreignPhoto = await uploaded(other);
    for (const invalid of [foreignCover, await asset(owner, "collection", "uploading"), photo, await asset(owner, "claim-evidence")]) {
      const refusal = await command(owner, list, "put", "/cover", {mediaId: invalid.id}); expect(refusal.status).toBe(422);
      expect(await snapshot(owner, list)).toEqual(before); await positive(cover, "public"); await positive(photo, "public");
    }
    for (const invalid of [foreignPhoto, await asset(owner, "guide", "uploading"), cover, await asset(owner, "claim-evidence")]) {
      const refusal = await command(owner, list, "patch", `/sections/${section}`, draft([invalid.id])); expect(refusal.status).toBe(422);
      expect(await snapshot(owner, list)).toEqual(before); await positive(cover, "public"); await positive(photo, "public");
    }
    await rejectedWrite("UPDATE media_assets SET status='uploading',ready_at=NULL WHERE id=$1", [photo.id]);
    await rejectedWrite("UPDATE media_assets SET purpose='collection' WHERE id=$1", [photo.id]);
    await rejectedWrite("UPDATE media_assets SET status='uploading',ready_at=NULL WHERE id=$1", [cover.id]);
    await rejectedWrite("UPDATE media_assets SET purpose='guide' WHERE id=$1", [cover.id]);
    await rejectedWrite("DELETE FROM guide_section_photos WHERE section_id=$1", [section]);
    expect(await snapshot(owner, list)).toEqual(before);
    const wrongEnvironment = await asset(owner, "guide", "ready", "qa"), environmentList = await collection(owner);
    await nativeSection(owner, environmentList, wrongEnvironment); await denialNoRead(wrongEnvironment); await denialNoRead(wrongEnvironment, owner.cookie);
    const missing = {id: randomUUID(), key: "", url: `/api/explorers/v1/media/${randomUUID()}/content`}; await denialNoRead(missing); await denialNoRead(missing, owner.cookie);
    const foreignDelete = await deleteHttp(other, photo), missingDelete = await deleteHttp(other, missing); expect(errorShape(foreignDelete)).toEqual(errorShape(missingDelete));
    expect(foreignDelete.status).toBe(404);
    await nativeCover(owner, list, validCover);
    const replacement = await command(owner, list, "patch", `/sections/${section}`, draft([validPhoto.id])); expect(replacement.status).toBe(200);
    const reloaded = await aggregate(owner, list); expect(reloaded.coverMediaId).toBe(validCover.id);
    expect(reloaded.sections.find((s: {id: string}) => s.id === section).blocks).toEqual(blocks([validPhoto.id]));
    await positive(validCover, "public"); await positive(validPhoto, "public");
  });

  it("keeps attached Guides photos out of deletion and abandoned cleanup in every visibility state", async () => {
    const f = await guideFixture("photo"); await aged(f.media);
    await lifetimeBlocked(f.owner, f.media);
    for (const [withdraw, restore, id] of [
      ["UPDATE collections SET visibility='private' WHERE id=$1", "UPDATE collections SET visibility='public' WHERE id=$1", f.list.id],
      ["UPDATE collections SET archived_at=now() WHERE id=$1", "UPDATE collections SET archived_at=NULL WHERE id=$1", f.list.id],
      ["UPDATE guide_sections SET archived_at=now() WHERE id=$1", "UPDATE guide_sections SET archived_at=NULL WHERE id=$1", f.section!],
    ]) {await pool.query(withdraw, [id]); try {await lifetimeBlocked(f.owner, f.media);} finally {await pool.query(restore, [id]);}}
    const control = await guideFixture("cover"); await aged(control.media); await lifetimeBlocked(control.owner, control.media);
  });

  it("releases Guides photo lifetime only after every registry reference is removed", async () => {
    const f = await guideFixture("photo"), second = await collection(f.owner), section = await nativeSection(f.owner, second, f.media), repo = new MediaRepository(pool);
    await aged(f.media); await removePhoto(f.owner, f.list, f.section!); await lifetimeBlocked(f.owner, f.media);
    await removePhoto(f.owner, second, section, true);
    expect(await repo.abandoned(f.owner.accountId, "local")).toEqual([{id: f.media.id, status: "ready"}]);
    expect(await repo.abandoned(f.owner.accountId, "qa")).toEqual([]);
    expect(await repo.markDelete(f.media.id, f.owner.accountId)).toMatchObject({id: f.media.id, status: "pending_delete"});
    await new MediaService(pool, storage).retryPendingDeletes(f.owner.accountId);
    expect(await repo.find(f.media.id)).toMatchObject({status: "deleted"}); await expect(storage.get(f.media.key)).rejects.toThrow();
    // Separate recent asset avoids DELETE's aged-orphan cleanup prepass returning 404.
    const recent = await uploaded(f.owner), uploadingRecent = await asset(f.owner, "guide", "uploading"), uploadingOld = await asset(f.owner, "guide", "uploading");
    await pool.query("UPDATE media_assets SET created_at=now()-interval '11 minutes' WHERE id=$1", [uploadingOld.id]);
    const abandoned = await repo.abandoned(f.owner.accountId, "local"); expect(abandoned).toEqual([{id: uploadingOld.id, status: "uploading"}]);
    expect(abandoned.map(row => row.id)).not.toContain(uploadingRecent.id); expect(abandoned.map(row => row.id)).not.toContain(recent.id);
    const deleted = await deleteHttp(f.owner, recent); expect(deleted.status).toBe(204);
    expect(await repo.find(recent.id)).toMatchObject({status: "deleted"}); await expect(storage.get(recent.key)).rejects.toThrow();
  });

  it("retains old Guides cover bytes on failed replacement and commits a fresh successful retry", async () => {
    const f = await guideFixture("cover"), before = await snapshot(f.owner, f.list); await positive(f.media, "public");
    const previousAssets = (await pool.query("SELECT id FROM media_assets WHERE account_id=$1", [f.owner.accountId])).rows.map(row => row.id);
    storage.failNextPut = true;
    const failed = await request(composed.app).post("/api/explorers/v1/media").set("cookie", f.owner.cookie).set("origin", config.baseURL)
      .set("x-media-purpose", "collection").set("x-file-name", "guide.png").set("content-type", "image/png").send(png);
    expect(failed.status).toBe(503); expect(failed.body.media).toBeUndefined();
    const compensated = (await pool.query("SELECT id,status FROM media_assets WHERE account_id=$1 AND NOT(id=ANY($2::uuid[]))", [f.owner.accountId, previousAssets])).rows;
    expect(compensated).toHaveLength(1); expect(compensated[0].status).toBe("deleted");
    expect(await snapshot(f.owner, f.list)).toEqual(before); await positive(f.media, "public");
    const stale = await uploaded(f.owner, "collection");
    const refused = await command(f.owner, f.list, "put", "/cover", {mediaId: stale.id}, before.guide.revision - 1);
    expect(refused.status).toBe(409); expect(await snapshot(f.owner, f.list)).toEqual(before); await positive(f.media, "public");
    const retry = await uploaded(f.owner, "collection"); await nativeCover(f.owner, f.list, retry);
    expect((await aggregate(f.owner, f.list)).coverMediaId).toBe(retry.id); await methods(retry); await denialNoRead(f.media); await positive(f.media, "owner", f.owner.cookie);
  });
});
