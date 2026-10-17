import { randomUUID } from "node:crypto";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MediaRepository } from "../repositories/mediaRepository";
import { contentCategorySchema } from "../../shared/explorersContract";
import { createMediaHarness } from "./helpers/explorersMediaHarness";
import { publicAppsProjection } from "../publicProfile/publicAppsProjection";
import { publicBooksProjection } from "../publicProfile/publicBooksProjection";
import { publicGamesProjection } from "../publicProfile/publicGamesProjection";
import { publicGuidesProjection } from "../publicProfile/publicGuidesProjection";
import { publicMoviesProjection } from "../publicProfile/publicMoviesProjection";
import { publicPeopleProjection } from "../publicProfile/publicPeopleProjection";
import { publicPlacesProjection } from "../publicProfile/publicPlacesProjection";
import { publicProductsProjection } from "../publicProfile/publicProductsProjection";

let harness: ReturnType<typeof createMediaHarness>;

const projectionFor: Record<string, (pool: pg.Pool, handle: string) => Promise<unknown>> = {
  places: (p, h) => publicPlacesProjection(p, h, 24), guides: (p, h) => publicGuidesProjection(p, h, 24),
  movies: (p, h) => publicMoviesProjection(p, h, 24), books: (p, h) => publicBooksProjection(p, h, 24),
  games: (p, h) => publicGamesProjection(p, h, 24), apps: (p, h) => publicAppsProjection(p, h, 24),
  products: (p, h) => publicProductsProjection(p, h, 24), people: (p, h) => publicPeopleProjection(p, h, 24),
};

/**
 * Every media URL anywhere in the payload, whatever key holds it.
 *
 * Key-agnostic on purpose. The eight projections spell this six different ways -
 * cover_image.url, coverUrl, Guide_Media[].url, images[], screenshots[], Media[].url - and
 * a reader that knew those names would silently return nothing for a seventh spelling,
 * which is exactly the shape of a vacuous pass.
 */
function mediaUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") { if (/^\/api\/explorers\/v1\/media\/[0-9a-f-]{36}\/content$/.test(value)) found.push(value); return found; }
  if (Array.isArray(value)) { for (const item of value) mediaUrls(item, found); return found; }
  if (value && typeof value === "object") { for (const item of Object.values(value)) mediaUrls(item, found); return found; }
  return found;
}

describe("public media URLs are always servable", () => {
  beforeAll(() => { harness = createMediaHarness(); });
  afterAll(async () => { await harness?.end(); });

  // Driven from contentCategorySchema.options, not a hand-written list. The cover arm's
  // category list grew by accretion - git log -L 68,77 on mediaRepository.ts shows
  // ('places','products','people'), then +'guides', then +'apps', with books, movies and
  // games never appended - and a second hand-written list here would be a second thing to
  // forget. A ninth category fails this on the day it joins the enum.
  for (const category of contentCategorySchema.options) {
    it(`serves every media URL the public ${category} read emits`, async () => {
      const { owner, handle, collection } = await harness.publicList(category);
      const cover = await harness.upload(owner.cookie, harness.png, "image/png", "collection");
      expect(cover.status).toBe(201);
      const coverId = cover.body.media.id as string;
      await harness.pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, coverId]);

      // Positive control first: an empty payload would make the invariant below vacuous.
      const urls = mediaUrls(await projectionFor[category](harness.pool, handle));
      expect(urls, `${category} projection emitted no media URL at all`).not.toHaveLength(0);
      expect(urls).toContain(`/api/explorers/v1/media/${coverId}/content`);

      // The invariant: anything the public read emits, the gate must serve.
      for (const url of new Set(urls)) expect((await request(harness.composed.app).get(url)).status, url).toBe(200);
      expect(await new MediaRepository(harness.pool).isPublicAttachment(coverId)).toBe(true);

      // And withdrawing the list withdraws the cover.
      await harness.pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1", [collection]);
      expect(await new MediaRepository(harness.pool).isPublicAttachment(coverId)).toBe(false);
      expect((await request(harness.composed.app).get(`/api/explorers/v1/media/${coverId}/content`)).status).toBe(404);
    }, 30_000);
  }

  it("refuses a cover the public read never emitted", async () => {
    const { owner, collection } = await harness.publicList("books");
    const emitted = await harness.upload(owner.cookie, harness.png, "image/png", "collection");
    await harness.pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, emitted.body.media.id]);
    // Uploaded by the same owner, attached to nothing. The inverse of the invariant above:
    // the gate must not serve what no projection references.
    const unattached = await harness.upload(owner.cookie, harness.png, "image/png", "collection");
    expect(unattached.status).toBe(201);
    expect(await new MediaRepository(harness.pool).isPublicAttachment(unattached.body.media.id)).toBe(false);
    expect((await request(harness.composed.app).get(`/api/explorers/v1/media/${unattached.body.media.id}/content`)).status).toBe(404);
  }, 30_000);
});
