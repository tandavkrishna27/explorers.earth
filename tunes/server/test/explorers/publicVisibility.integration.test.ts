/**
 * Ticket 7.1's named public-visibility acceptance, against real PostgreSQL.
 *
 * The ticket asks for this file by name and states the cases precisely:
 *
 *   "create 53 items with duplicate order values and assert cursor traversal returns
 *    exactly 53 unique IDs in deterministic order; change account/category visibility
 *    between pages and assert the continuation cannot disclose now-hidden rows.
 *    Revalidate a cached ETag after unpublish and assert response is denial/new safe
 *    state, never 304 carrying old private data."
 *
 *   "Same list slug on two accounts resolves to its own owner; missing/private/archived
 *    detail has the same public unavailable response."
 *
 * Books is the carrier category because it is a complete native producer using the
 * bounded-offset cursor every category shares (`publicProfileCursorStart`). These cases
 * are about the visibility gate and the cursor, not about book fields.
 *
 * Deliberately NOT here: the Music public/unlisted/revoked semantics and the
 * `public-parity.spec.ts` browser lane. The ticket makes both dependent on 6.3, which
 * has not landed.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../../auth/betterAuth";
import { LocalObjectStorage } from "../../services/objectStorage";
import { ProfileInputError, ProfileService } from "../../application/profiles";
import type { Actor } from "../../application/actor";
import { OwnerContentService } from "../../application/ownerContent";
import { PUBLIC_RECOMMENDATION_CATEGORIES } from "../../publicProfile/publicProfilePolicy";

let pool: pg.Pool;
let app: ReturnType<typeof createCanonicalApp>["app"];
let storage: LocalObjectStorage;
let storageRoot: string;

const STORAGE_PREFIX = "public-visibility-media-";

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 });
  // Real bytes on disk, so the media case asserts a served response rather than a mock.
  storageRoot = await mkdtemp(join(tmpdir(), STORAGE_PREFIX));
  storage = new LocalObjectStorage(storageRoot);
  app = createCanonicalApp(pool, resolveExplorersAuthConfig({
    EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
    EXPLORERS_AUTH_SECRET: "public-visibility-secret-".repeat(2),
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture",
  }), { mediaStorage: storage }).app;
});

afterAll(async () => {
  await pool.end();
  if (storageRoot) {
    // Refuse to recurse anywhere this suite did not create.
    const absolute = resolve(storageRoot);
    const parent = resolve(tmpdir()) + sep;
    if (!absolute.startsWith(parent) || !absolute.slice(parent.length).startsWith(STORAGE_PREFIX)) {
      throw new Error("media storage cleanup refused");
    }
    await rm(absolute, { recursive: true, force: true });
  }
});

const categoryPath = (handle: string) => `/api/explorers/v1/profiles/${handle}/recommendations/books`;
const detailPath = (handle: string, slug: string) => `${categoryPath(handle)}/${slug}`;

/**
 * The ticket asks for "53 items with duplicate order values". **That cannot be seeded,
 * and the reason is the finding.**
 *
 * `collection_items` carries `UNIQUE(collection_id,display_order) DEFERRABLE INITIALLY
 * DEFERRED` (`0029_explorers_recommendations.sql:56`), so a second item at the same order
 * in one collection is rejected at COMMIT. The requirement was written against Strapi,
 * where order was a plain integer and a duplicate was an ordinary state the reader had to
 * survive. The canonical schema makes that state unreachable instead, which is strictly
 * stronger than a traversal that copes with it.
 *
 * So the hazard is discharged in two parts: the traversal case below keeps the 53 items
 * and the multi-page assertions, and a dedicated case asserts the constraint actually
 * enforces uniqueness - because "duplicates are impossible" is only a real answer while
 * something holds it true. The deferrable half matters too: a reorder has to pass through
 * an intermediate duplicate inside its transaction, so the constraint must *not* reject
 * mid-transaction, only at COMMIT.
 */
const orderFor = (index: number) => index;

/*
 * A real rich note, because this read path validates one. `{"private":"secret"}` - which
 * the older public-content fixture uses against a different route family - fails
 * `richNoteSchema`, and `normalizeRichNote` throws rather than skipping the row, which
 * the route turns into a 503 for the whole page. So an invalid note anywhere in a
 * collection takes the page down, and a fixture that used one would be testing the error
 * path while appearing to test the happy one.
 */
const RICH_NOTE = { version: 1 as const, format: "quill-html" as const, html: "<p>note</p>" };

async function seedCollection(count: number, slug = "reading") {
  const handle = `p${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const account = (await pool.query(
    `INSERT INTO creator_accounts(handle,display_name,account_type,public_profile,onboarding_status)
     VALUES($1,'Public','Personal',true,'complete') RETURNING id`, [handle])).rows[0].id;
  /*
   * `account_presentation` is required, not decorative: `resolveAccount` INNER JOINs it
   * (`postgresPublicProfileGateway.ts:29`), so an account without a presentation row is
   * invisible to every public profile read and each route answers 404. Found by this
   * fixture 404ing with a perfectly valid account - the defaults carry the whole row.
   */
  await pool.query(`INSERT INTO account_presentation(account_id) VALUES($1)`, [account]);
  await pool.query(
    `INSERT INTO account_category_settings(account_id,category,is_public,display_order)
     VALUES($1,'books',true,0)`, [account]);
  const collection = (await pool.query(
    `INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state)
     VALUES($1,'books','Reading',$2,0,'public','published') RETURNING id`, [account, slug])).rows[0].id;
  const entity = (await pool.query(
    `INSERT INTO entities(kind,title,origin) VALUES('book','Public title','manual') RETURNING id`)).rows[0].id;

  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const id = (await pool.query(
      `INSERT INTO recommendations(account_id,entity_id,category,user_rating,publication_state,note)
       VALUES($1,$2,'books',8,'published',$3) RETURNING id`,
      [account, entity, JSON.stringify(RICH_NOTE)])).rows[0].id;
    await pool.query(
      `INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order)
       VALUES($1,$2,$3,'books',$4)`, [collection, id, account, orderFor(index)]);
    ids.push(id);
  }
  return { account, collection, entity, handle, slug, ids };
}

/** The order the gate's `ORDER BY ci.display_order, r.id` must produce. */
async function expectedOrder(collection: string): Promise<string[]> {
  return (await pool.query(
    `SELECT r.id FROM collection_items ci JOIN recommendations r ON r.id=ci.recommendation_id
     WHERE ci.collection_id=$1 ORDER BY ci.display_order, r.id`, [collection])).rows.map((row) => row.id);
}

function readPage(body: any) {
  const list = body.bookLists?.[0];
  return {
    ids: (list?.recommended_books ?? []).map((book: any) => book.documentId) as string[],
    cursor: (list?.recommended_books_next_cursor ?? null) as string | null,
  };
}

describe("ticket 7.1 - public visibility against real PostgreSQL", () => {
  it("traverses 53 duplicate-ordered items as 53 unique IDs in deterministic order", async () => {
    const seeded = await seedCollection(53);

    const seen: string[] = [];
    let cursor: string | null = null;
    // 24 is the gate's maximum page size, so 53 items is two full pages and a short
    // tail - enough that a skip or a repeat at a page boundary has somewhere to hide.
    // The cursor is a bounded offset (`publicProfileCursorStart`), which is exactly the
    // shape that loses or repeats a row when the page boundary moves under it.
    for (let page = 0; page < 10; page++) {
      const query: Record<string, string> = { limit: "24", ...(cursor ? { cursor } : {}) };
      const response = await request(app).get(detailPath(seeded.handle, seeded.slug)).query(query);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const read = readPage(response.body);
      seen.push(...read.ids);
      cursor = read.cursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(53);
    expect(new Set(seen).size).toBe(53);
    expect(seen).toEqual(await expectedOrder(seeded.collection));
  });

  it("makes the duplicate order the ticket asks for unreachable, but only at COMMIT", async () => {
    const seeded = await seedCollection(2);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      /*
       * A reorder swaps two items' orders and has to pass through a duplicate to do it.
       * If the constraint were immediate this would fail here, and reordering a list
       * would need a temporary sentinel order. It is deferred, so the duplicate is
       * legal mid-transaction.
       */
      await client.query(
        `UPDATE collection_items SET display_order=$1 WHERE collection_id=$2 AND recommendation_id=$3`,
        [orderFor(0), seeded.collection, seeded.ids[1]]);
      const duplicated = await client.query(
        `SELECT count(*)::int AS n FROM collection_items
         WHERE collection_id=$1 AND display_order=$2`, [seeded.collection, orderFor(0)]);
      expect(duplicated.rows[0].n, "the duplicate must be legal inside the transaction").toBe(2);

      // And refused when the transaction tries to make it durable.
      await expect(client.query("COMMIT")).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("refuses the continuation rather than disclosing rows hidden mid-traversal", async () => {
    const seeded = await seedCollection(53);

    const first = await request(app).get(detailPath(seeded.handle, seeded.slug)).query({ limit: "24" });
    expect(first.status).toBe(200);
    const { cursor } = readPage(first.body);
    expect(cursor).toBeTruthy();

    /*
     * The creator turns the category off between pages. A continuation served from the
     * cursor alone would hand over the next 24 rows of a now non-public profile.
     *
     * What actually stops it, established by mutation rather than by reading: the
     * property is defended three times independently, and **no single mutation kills
     * this case**. Removing `s.is_public` from the projection's `gate`, removing
     * `canReadPublicCategory(before, ...)` in `freshBooksRead`, or removing its
     * `after` re-check each leaves all six cases green, because the other two still
     * refuse. Only all three at once fails this case, and only this case.
     *
     * So this is not a test of any one of those checks - it is a test that the cursor
     * carries no authority of its own. That is the regression worth catching: a new
     * read path that honours a cursor without re-applying the gate would pass every
     * existing unit test and fail here.
     */
    await pool.query(
      `UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='books'`,
      [seeded.account]);

    const continuation = await request(app)
      .get(detailPath(seeded.handle, seeded.slug)).query({ limit: "24", cursor: cursor as string });
    expect(continuation.status).toBe(404);
    expect(JSON.stringify(continuation.body)).not.toContain(seeded.ids[24]);
  });

  it("never answers 304 from an ETag captured before the rows were unpublished", async () => {
    const seeded = await seedCollection(3);

    const cached = await request(app).get(categoryPath(seeded.handle));
    expect(cached.status).toBe(200);
    const etag = cached.get("ETag");
    expect(etag).toBeTruthy();
    // The ETag must actually work, or the "not 304" assertion below would pass for the
    // wrong reason - a server that never answers 304 would satisfy it trivially.
    const revalidated = await request(app)
      .get(categoryPath(seeded.handle)).set("If-None-Match", etag as string);
    expect(revalidated.status).toBe(304);

    await pool.query(
      `UPDATE recommendations SET publication_state='draft' WHERE account_id=$1`, [seeded.account]);

    const afterUnpublish = await request(app)
      .get(categoryPath(seeded.handle)).set("If-None-Match", etag as string);
    expect(afterUnpublish.status).not.toBe(304);
    expect(JSON.stringify(afterUnpublish.body)).not.toContain(seeded.ids[0]);
  });

  it("resolves the same list slug on two accounts to its own owner", async () => {
    // The ticket's case. A slug is unique per account, not globally, so a read keyed on
    // the slug alone would serve one creator's list under the other's handle.
    const left = await seedCollection(2, "shared-slug");
    const right = await seedCollection(2, "shared-slug");
    expect(left.slug).toBe(right.slug);

    for (const owner of [left, right]) {
      const response = await request(app).get(detailPath(owner.handle, owner.slug));
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const read = readPage(response.body);
      expect(read.ids.slice().sort()).toEqual(owner.ids.slice().sort());
      expect(response.body.bookLists[0].account.username).toBe(owner.handle);
      // And not a single row belonging to the other account.
      const other = owner === left ? right : left;
      for (const id of other.ids) expect(JSON.stringify(response.body)).not.toContain(id);
    }
  });

  it("answers missing, private and archived detail identically", async () => {
    /*
     * The ticket requires one public unavailable response for all three. Distinguishing
     * them is the leak: a 404 for "no such list" and a 403 for "private list" tells an
     * anonymous caller which private lists exist, so the unavailable response has to be
     * byte-identical, not merely all-4xx.
     */
    const absent = await seedCollection(1, "present");
    const privateList = await seedCollection(1, "hidden");
    const archived = await seedCollection(1, "gone");

    await pool.query(`UPDATE collections SET visibility='private' WHERE account_id=$1`, [privateList.account]);
    await pool.query(`UPDATE collections SET archived_at=now() WHERE account_id=$1`, [archived.account]);

    const responses = await Promise.all([
      request(app).get(detailPath(absent.handle, "no-such-list")),
      request(app).get(detailPath(privateList.handle, privateList.slug)),
      request(app).get(detailPath(archived.handle, archived.slug)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(responses[0].status);
      expect(response.body).toEqual(responses[0].body);
    }
    expect(responses[0].status).toBe(404);
    // The one that exists but is hidden must not leak its rows in the body either.
    expect(JSON.stringify(responses[1].body)).not.toContain(privateList.ids[0]);
    expect(JSON.stringify(responses[2].body)).not.toContain(archived.ids[0]);
  });

  it("denies the bytes once the only public attachment is hidden", async () => {
    /*
     * The ticket: "Upload URL bytes fetched after hiding the only public attachment must
     * be denied independently of the page cache." The page and the bytes are separate
     * reads - a creator who unpublishes a recommendation has to lose the attachment too,
     * or the image URL remains a working back door to content removed from the profile.
     */
    const seeded = await seedCollection(1);
    const mediaId = randomUUID();
    const bytes = Buffer.from("public-attachment-bytes");
    const objectKey = `local/${seeded.account}/${mediaId}`;
    await storage.put(objectKey, bytes);
    await pool.query(
      `INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at)
       VALUES($1,$2,'recommendation','ready','image/png',$3,$4,now())`,
      [mediaId, seeded.account, bytes.length, createHash("sha256").update(bytes).digest()]);
    await pool.query(
      `INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256)
       VALUES($1,'original','local',$2,'image/png',$3,$4)`,
      [mediaId, objectKey, bytes.length, createHash("sha256").update(bytes).digest()]);
    await pool.query(
      `INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order)
       VALUES($1,$2,$3,0)`, [seeded.ids[0], seeded.account, mediaId]);

    const contentPath = `/api/explorers/v1/media/${mediaId}/content`;
    const served = await request(app).get(contentPath);
    expect(served.status, JSON.stringify(served.body)).toBe(200);
    expect(served.body).toEqual(bytes);
    const etag = served.get("ETag");
    // A public attachment is cacheable, which is exactly why the denial below has to be
    // independent of any cached page - the bytes carry their own revalidation.
    expect(served.get("Cache-Control")).toContain("must-revalidate");

    await pool.query(
      `UPDATE recommendations SET publication_state='draft' WHERE id=$1`, [seeded.ids[0]]);

    const denied = await request(app).get(contentPath);
    expect(denied.status).toBe(404);
    expect(denied.body?.error?.code ?? denied.body?.code).toBeDefined();
    // And a conditional request with the still-valid ETag must not be answered 304,
    // which would confirm the bytes and let a cache keep serving them.
    const revalidated = await request(app).get(contentPath).set("If-None-Match", etag as string);
    expect(revalidated.status).toBe(404);
  });

  /*
   * Reserved handle protection, which ticket 7.1 requires and which **nothing asserted**
   * before this: a search of `server/test` for `Handle is unavailable` returned zero
   * files.
   *
   * It matters because the reserved list is the only thing stopping a creator from
   * claiming a handle that shadows an application route. A profile at `settings` or
   * `music` would sit under the same path space the app serves its own pages from, and
   * the public read resolves purely on `handle_key`, so it cannot tell the difference.
   * Protection therefore lives entirely on the write path - which is why it needs a test
   * there, not only a 404 for a handle nobody holds.
   */
  describe("reserved handles", () => {
    /** An owner actor, via an oauth credential so no `auth_session` row is needed. */
    async function owner(): Promise<{ actor: Actor; handle: string }> {
      const handle = `p${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const account = (await pool.query(
        `INSERT INTO creator_accounts(handle,display_name,account_type,public_profile,onboarding_status)
         VALUES($1,'Owner','Personal',true,'complete') RETURNING id`, [handle])).rows[0].id;
      await pool.query(`INSERT INTO account_presentation(account_id) VALUES($1)`, [account]);
      const userId = `u-${randomUUID()}`;
      await pool.query(
        `INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,'Owner',$2,true)`,
        [userId, `${userId}@example.invalid`]);
      await pool.query(`INSERT INTO user_security_state(user_id) VALUES($1)`, [userId]);
      await pool.query(
        `INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')`,
        [account, userId]);
      return {
        handle,
        actor: { userId, accountId: account, role: "owner",
          credential: { kind: "oauth", grantId: randomUUID(), scopes: ["profile:write"] } },
      };
    }

    const context = { requestId: randomUUID() };

    /*
     * The message is asserted, not just the error type. `ProfileInputError` is also what
     * a schema failure throws ("Invalid profile fields"), so `toBeInstanceOf` alone would
     * have passed for every reserved word even if the reserved list were deleted - which
     * is exactly what the positive control below caught when the payload was malformed.
     */
    it.each(["api", "settings", "music", "admin", "assets", "guides"])(
      "refuses %s as a handle", async (reserved) => {
        const { actor } = await owner();
        const service = new ProfileService(pool);
        const update = service.updateAccount(actor, { handle: reserved, expectedRevision: 1 }, context);
        await expect(update).rejects.toBeInstanceOf(ProfileInputError);
        await expect(update).rejects.toThrow("Handle is unavailable");
      });

    it("still accepts an ordinary handle, so the refusals above are not refusing everything", async () => {
      const { actor } = await owner();
      const service = new ProfileService(pool);
      const accepted = `ok${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const updated = await service.updateAccount(actor, { handle: accepted, expectedRevision: 1 }, context);
      expect(updated.username ?? updated.handle).toBe(accepted);
    });

    it("answers a reserved handle on the public read with the ordinary unavailable response", async () => {
      // Transitive, but worth pinning: because the write path refuses them, no account
      // can hold one, so the public read must look exactly like any other missing handle.
      const missing = await request(app).get(categoryPath("no-such-handle-at-all"));
      for (const reserved of ["settings", "music", "admin"]) {
        const response = await request(app).get(categoryPath(reserved));
        expect(response.status).toBe(missing.status);
        expect(response.body).toEqual(missing.body);
      }
    });
  });

  /*
   * The ticket's "table-driven visibility matrix across owner/other-owner/anonymous".
   *
   * One hidden collection, read three ways. The interesting column is the middle one: a
   * second signed-in creator must be refused the same way an anonymous caller is, and
   * refused with "unavailable" rather than "forbidden" - a distinguishable refusal tells
   * a logged-in stranger that a private list exists and what its id is.
   *
   * The owner column is what makes the other two meaningful. Without it the matrix would
   * be satisfied by a collection that simply does not exist.
   */
  describe("visibility matrix", () => {
    const SECRET = "public-visibility-secret-".repeat(2);

    async function ownerOf(account: string): Promise<Actor> {
      const userId = `u-${randomUUID()}`;
      await pool.query(
        `INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,'Owner',$2,true)`,
        [userId, `${userId}@example.invalid`]);
      await pool.query(`INSERT INTO user_security_state(user_id) VALUES($1)`, [userId]);
      await pool.query(
        `INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')`,
        [account, userId]);
      return { userId, accountId: account, role: "owner",
        credential: { kind: "oauth", grantId: randomUUID(),
          scopes: ["collections:read", "profile:write"] } };
    }

    /*
     * `ownerRead` differs per row, and finding out why is worth recording: archiving
     * hides a collection from its **owner's** default view too, because
     * `statusPredicate` filters on `archived_at IS NULL` unless the request asks for
     * `archived` or `all` (`ownerContent.ts:37`, `explorersOwnerContentContract.ts:14`).
     * So "hidden from everyone but its owner" is true of private and unpublished
     * collections, and true of an archived one only when the owner asks for archived.
     * The first draft of this case asserted the default read and failed - correctly.
     */
    it.each([
      ["private visibility", "UPDATE collections SET visibility='private' WHERE account_id=$1", {}],
      ["unpublished state", "UPDATE collections SET publication_state='draft' WHERE account_id=$1", {}],
      ["archived", "UPDATE collections SET archived_at=now() WHERE account_id=$1", { status: "archived" }],
    ])("hides a %s collection from everyone but its owner", async (_label, hide, ownerRead) => {
      const seeded = await seedCollection(2);
      const mine = await ownerOf(seeded.account);
      const stranger = await seedCollection(1);
      const theirs = await ownerOf(stranger.account);
      const owners = new OwnerContentService(pool, SECRET);

      // Visible to its owner while still public, so the hide below is a change of state.
      await expect(owners.getCollection(mine, seeded.collection)).resolves.toBeDefined();

      await pool.query(hide, [seeded.account]);

      // owner: still theirs to see.
      await expect(owners.getCollection(mine, seeded.collection, ownerRead)).resolves.toBeDefined();

      // other owner: refused, and refused as unavailable rather than forbidden - with
      // the same request the owner just succeeded with, so the only difference is who
      // is asking.
      const crossRead = owners.getCollection(theirs, seeded.collection, ownerRead);
      await expect(crossRead).rejects.toMatchObject({ status: 404 });

      // anonymous: the list is gone from the public read, rows and all.
      const anonymous = await request(app).get(detailPath(seeded.handle, seeded.slug));
      expect(anonymous.status).toBe(404);
      for (const id of seeded.ids) expect(JSON.stringify(anonymous.body)).not.toContain(id);
    });

    it("refuses a stranger an id that does not exist the same way", async () => {
      // The pair that makes the middle column above a real guarantee: "someone else's
      // private list" and "no such list" must be indistinguishable to that stranger.
      const stranger = await seedCollection(1);
      const theirs = await ownerOf(stranger.account);
      const other = await seedCollection(1);
      const owners = new OwnerContentService(pool, SECRET);
      await pool.query(
        "UPDATE collections SET visibility='private' WHERE account_id=$1", [other.account]);

      const hidden = await owners.getCollection(theirs, other.collection).catch((error) => error);
      const absent = await owners.getCollection(theirs, randomUUID()).catch((error) => error);
      expect(hidden.status).toBe(absent.status);
      expect(hidden.message).toBe(absent.message);
    });
  });

  /*
   * The ticket's route pin: `/:username`, all nine category routes, list slugs, the
   * genre route and guide detail.
   *
   * What makes this worth asserting over HTTP rather than trusting the router: an
   * **unmounted** route and a mounted route with nothing to show both answer 404. The
   * difference is the body - a mounted route answers the typed
   * `explorers-public-error/v1` envelope, while an absent one falls through to Express's
   * default handler, which answers HTML. So the pin is "every one of these answers the
   * typed envelope or 200", never an untyped body.
   *
   * This is the same masking that `platform-fixture` has been failing on: a route absent
   * from a composition is answered by a catch-all, and a check that only looks at the
   * status code cannot see it. A typed-body assertion can.
   *
   * Category *dispatch* is pinned separately and enum-driven in
   * `contracts/public-category-coverage.test.ts`; this is only about the routes existing.
   */
  describe("route pins", () => {
    const typed = (body: unknown) =>
      typeof body === "object" && body !== null
      && (body as { version?: unknown }).version === "explorers-public-error/v1";

    it("mounts every public profile route with a typed body, never a catch-all", async () => {
      const seeded = await seedCollection(1);
      const paths = [
        `/api/explorers/v1/profiles/${seeded.handle}`,
        ...PUBLIC_RECOMMENDATION_CATEGORIES.map(
          (category) => `/api/explorers/v1/profiles/${seeded.handle}/recommendations/${category}`),
        // A list slug, the genre route and guide detail.
        detailPath(seeded.handle, seeded.slug),
        `/api/explorers/v1/profiles/${seeded.handle}/recommendations/movies/genres/action`,
        `/api/explorers/v1/profiles/${seeded.handle}/recommendations/guides/some-guide`,
      ];
      /*
       * Twelve, not the ticket's thirteen, and the gap is accounted for rather than
       * rounded away. `PUBLIC_RECOMMENDATION_CATEGORIES` holds **eight** entries -
       * `public-category-coverage.test.ts` pins that it does not quietly gain a ninth -
       * because Music is not a public recommendation category. The ticket counts it as
       * the ninth and lists its "shared capability route" separately, and that route is
       * mounted in `routes/index.ts`, the legacy composition, not in `canonicalApp.ts`.
       * Pinning it here would assert the canonical app mounts something it does not;
       * it belongs with 6.3, which the ticket already makes this part depend on.
       */
      expect(PUBLIC_RECOMMENDATION_CATEGORIES).toHaveLength(8);
      expect(paths).toHaveLength(12);

      for (const path of paths) {
        const response = await request(app).get(path);
        expect([200, 404, 503], `${path} answered ${response.status}`).toContain(response.status);
        if (response.status !== 200) {
          expect(typed(response.body), `${path} answered an untyped body`).toBe(true);
        }
        expect(response.get("Content-Type") ?? "").toContain("application/json");
      }
    });

    it("distinguishes a mounted route from one that is not, so the pin above can fail", async () => {
      // The control. A path under the same prefix that no route claims must NOT produce
      // the typed envelope - otherwise every assertion above would hold for a router
      // with nothing mounted at all.
      const absent = await request(app).get("/api/explorers/v1/profiles/x/not-a-real-subroute");
      expect(typed(absent.body)).toBe(false);
    });
  });
});
