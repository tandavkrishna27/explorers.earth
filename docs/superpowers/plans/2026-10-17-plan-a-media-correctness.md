# Plan A — Media correctness across all eight categories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make owner-uploaded media work and appear publicly for all eight recommendation categories, and fix the two regressions the first honest CI run exposed.

**Architecture:** Owner media is uploaded to a private S3 bucket and served only through `GET /api/explorers/v1/media/:id/content`, authorised by `MediaRepository.isPublicAttachment`. That function is a UNION of arms, each pairing a storage table with a `required_category`. A category's media is publicly visible only when a public projection emits its URL **and** a gate arm admits it. This plan closes both halves, always changing projection and gate in the same commit.

**Tech Stack:** TypeScript (strict), PostgreSQL via `pg`, Express, Vitest, Playwright, React 18 + Vite.

**Revision:** v2, after two independent reviews. v1 had four defects that would have produced broken code; each is called out inline as **[v1 defect]** so the correction is not silently lost.

---

## Decisions implemented

| Decision | Choice |
|---|---|
| D-1 products/people snapshot uploads | **Complete the feature** — add public reads, then widen the gate |
| D-2 places creator uploads | **Route into the typed `photoMediaIds` path**, create *and* edit |
| D-3 paste-a-link enrichment | Out of scope — Plan B |

## Verified facts (do not re-derive)

- The gate is `MediaRepository.isPublicAttachment` (`tunes/server/repositories/mediaRepository.ts:59-108`). `isPubliclyVisible` does not exist.
- A projection may read media through an **imported module**. `publicGamesProjection.ts:140` uses `readManualGamePresentation`. Never conclude "no media read" from grepping one file.
- **Neither** the ref-count query (`mediaRepository.ts:116-122`) **nor** `abandoned` (`:149-166`) needs changing — both already enumerate `recommendation_media` and `recommendation_place_photos`.
- The place-photo guard (`tunes/migrations/0047_explorers_place_photo_media.sql:31-50`) requires only `status='ready'`, `purpose='recommendation'`, an image MIME and ≤ 5 MiB on a `places` recommendation — no provider-only semantics. Its slot cap is 10 (`0047…:22`, `slot_index BETWEEN 0 AND 9`), matching the `recommendation` upload limit of exactly 5 MiB (`tunes/server/application/media.ts:28-29`).
- `entities.kind` accepts `'product'` and `'person'` (`0029…:4`); `product_entity_details(entity_id, product_url)` has `product_url` as its only NOT NULL (`0044…:26-28`); `person_entity_details(entity_id)` has everything else nullable (`0045…:24-36`).
- `tsc -p tsconfig.json` in `explorers-earth` checks nothing. Use `tsconfig.app.json`.
- Run the `explorers-earth` unit lane **serially** (`--no-file-parallelism`); it is the only gate that catches cross-ticket DTO-shape regressions.
- **`.github/workflows/test.yml:225` names every integration file explicitly.** A new test file that is not added there never runs on a PR.

---

## Task 1: Re-pin the Apps private-files seal in all four places

**[v1 defect]** v1 fixed one of four sites and asserted the others did not exist.

The stale hash `d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764` pins `tunes/scripts/music-local-private-files.ps1`, which was edited earlier in this effort. Four production sites still carry it, so three preflights keep refusing even after v1's fix.

**Files:**
- Modify: `tunes/scripts/apps-browser-fixture.ts:945`
- Modify: `tunes/scripts/apps-retained-acl-adoption.ts:7` and `:96` (the second is the same literal embedded in generated C#)
- Modify: `tunes/scripts/apps-retained-recovery.ts:154`
- Modify: `tunes/server/test/contracts/apps-retained-recovery.test.ts:80`

- [ ] **Step 1: Confirm the current hash and every site**

```bash
git show HEAD:tunes/scripts/music-local-private-files.ps1 | sha256sum
grep -rn "d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764" --include=*.ts --include=*.json --include=*.mjs . | grep -v node_modules
```

Expected: hash `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0`, and six hits — four in `tunes/scripts/*.ts`, one in `tunes/server/test/contracts/apps-retained-recovery.test.ts:80`, one in `docs/replatform-audit/receipts/wave2-7f536e55/qualification.json:4774`.

- [ ] **Step 2: Replace the hash in all four script sites**

Replace every occurrence of `d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764` with `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0` in `apps-browser-fixture.ts` and `apps-retained-acl-adoption.ts` (both sites) and `apps-retained-recovery.ts`.

Leave `docs/replatform-audit/receipts/wave2-7f536e55/qualification.json` untouched — it is a historical receipt, and rewriting a recorded receipt would falsify evidence.

- [ ] **Step 3: Update the contract test's stub**

`apps-retained-recovery.test.ts:80` injects a `createHash` stub whose `digest()` returns the **stale** hash, so `requireValue` at `apps-retained-recovery.ts:154` would now fail. Change that stub's return value to `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0`.

- [ ] **Step 4: Verify**

```bash
grep -rn "d35c7b8a9281" --include=*.ts . | grep -v node_modules
cd tunes && npx vitest run server/test/contracts/apps-retained-recovery.test.ts
```

Expected: no `.ts` hits remain; the contract test passes.

- [ ] **Step 5: Commit**

```bash
git add tunes/scripts/apps-browser-fixture.ts tunes/scripts/apps-retained-acl-adoption.ts tunes/scripts/apps-retained-recovery.ts tunes/server/test/contracts/apps-retained-recovery.test.ts
git commit -m "fix(apps): re-pin the private-files seal at all four sites"
```

**Carry forward:** a seal that pins a sibling script by content hash across four files will break again on the next edit. Worth a follow-up that derives the constant once.

---

## Task 2: Stop re-edits from detaching product and person photos

The hydration effect never restores `media` from `observed.detail.mediaIds`, so re-editing submits `mediaIds: []` and detaches every prior upload. `AddAppPage.tsx:85` and `AddGamePage.tsx:39` already do this correctly.

**[v1 correction]** Extend the **existing** edit-flow describes rather than hand-rolling a third route spelling, and assert the submitted patch, not just the thumbnail — otherwise a refactor that renders thumbnails straight from the observation would keep the test green while still detaching.

**Files:**
- Modify: `explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx:82`
- Modify: `explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx:90`
- Test: `explorers-earth/src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx` (`describe('manual Products edit')`, line 185-243)
- Test: `explorers-earth/src/features/People/components/dashboard/__tests__/manualPersonFlow.test.tsx` (`describe('manual People edit')`, line 172)

- [ ] **Step 1: Extend the existing edit fixture with media**

In `manualProductFlow.test.tsx`, add `mediaIds` to whatever observation `loaded()` returns, defaulting to `[]` so existing cases are unaffected:

```tsx
 const loaded = (mediaIds: string[] = []) => { /* existing body, with mediaIds added to the detail it seeds */ };
```

Keep the existing call sites working by leaving the parameter optional. While here, correct that describe's stale route spelling to the real one, `/recommendations/products/:listId/edit/:productId` (`src/routes/ProtectedRoutes.tsx:90`).

- [ ] **Step 2: Write the failing test**

```tsx
 it('keeps previously uploaded snapshots through a re-edit', async () => {
  const existing = '11111111-2222-3333-4444-555555555555';
  loaded([existing]);
  vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({id: 'product-1'} as never);

  await editElement();

  // The thumbnail comes back...
  expect(await screen.findByAltText('Product snapshot'))
   .toHaveAttribute('src', `/api/explorers/v1/media/${existing}/content`);

  // ...and, decisively, the saved patch still carries the id.
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalled());
  expect(vi.mocked(ProductsClient.updateRecommendation).mock.calls.at(-1)?.[1])
   .toMatchObject({mediaIds: [existing]});
 });
```

Mirror it in `manualPersonFlow.test.tsx` using that file's own `loaded()`/edit helper, `PeopleClient.updateRecommendation`, and `findByAltText('Person snapshot')`.

- [ ] **Step 3: Run and confirm failure**

```bash
cd explorers-earth && npx vitest run src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx
```

Expected: FAIL — `Unable to find an element with the alt text: Product snapshot`.

- [ ] **Step 4: Rehydrate `media`**

In `AddProductPage.tsx`, immediately after `setRating(product.user_rating);` (line 82):

```tsx
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
```

Add the identical line in `AddPersonPage.tsx` immediately after `setRating(person.user_rating);` (line 90). `mediaIds` exists on every recommendation detail, so **no category guard is needed** — unlike `appScreenshots` at `AddAppPage.tsx:85`.

- [ ] **Step 5: Run both files, then the serial unit lane**

```bash
cd explorers-earth && npx vitest run src/features/Products src/features/People && npx vitest run --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add explorers-earth/src/features/Products explorers-earth/src/features/People
git commit -m "fix(products,people): rehydrate uploaded media so a re-edit cannot detach it"
```

---

## Task 3: Make products and people snapshot uploads publicly visible

Decision D-1. Projection, contract schema and gate **must land in one commit**.

**[v1 defect — would have 500'd production]** `richPerson` is shared by `publicPeopleProjection` **and** `publicPeopleSectorProjection`, and the sector path validates every person through `publicPersonSchema`, which is **`.strict()`** (`tunes/shared/explorersPublicPeopleSectorContract.ts:4`, parsed at `publicPeopleProjection.ts:169`). Adding any new key to the person literal makes that `parse` throw `Unrecognized key(s) in object: 'Media'` for every person — including when the value is `null` — breaking the sector page and at least six existing cases in `tunes/server/test/publicProfile/publicPeopleSector.test.ts`. The schema must be extended in the same commit.

**[v1 defect]** v1 cited `PersonOverview.tsx:340` as proof no frontend change was needed. That line is the **SEO** `og:image` prop. The *visible* gallery reads `fetchedPerson?.media_details?.imageDetails` (`PersonOverview.tsx:123`), and the legacy Strapi selection confirms `media_details` is the consumed key (`strapiPublicProfileGateway.ts:148` lists it and not `Media`). Emit **both**, exactly as Places does (`publicPlacesProjection.ts:79-80`).

**Files:**
- Modify: `tunes/server/publicProfile/publicProductsProjection.ts` (`richProduct`, lines 40-59)
- Modify: `tunes/server/publicProfile/publicPeopleProjection.ts` (`richPerson`, lines 45-67)
- Modify: `tunes/shared/explorersPublicPeopleSectorContract.ts:4` (`publicPersonSchema`)
- Modify: `tunes/server/repositories/mediaRepository.ts:101-102`
- Test: `tunes/server/test/explorers-media.integration.test.ts` (extend the existing loop)

- [ ] **Step 1: Extend the existing parameterised fixture to products and people**

**[v1 correction]** v1 added a parallel loop that tested only the happy path. The existing loop at `explorers-media.integration.test.ts:44-66` already walks a **twelve-dimension withdrawal table** (`:90-115`: account status, onboarding, `public_profile`, category `is_public`, collection visibility / publication / archival, recommendation publication / archival, membership deletion, plus the independent cover answer via `deniesCover`). Extending it means products and people inherit all of that; a parallel loop would leave them materially less protected than apps and places.

Change line 44 from `for (const category of ["apps", "places"] as const)` to:

```ts
  for (const category of ["apps", "places", "products", "people"] as const) {
    const table = category === "apps" ? "recommendation_app_screenshots"
      : category === "places" ? "recommendation_place_photos" : "recommendation_media";
```

In `attach()`, branch the entity kind and detail row for the two new categories, and the insert for the generic table (which has `display_order`, not `slot_index`):

```ts
        const kind = category === "apps" ? "app" : category === "places" ? "place" : category === "products" ? "product" : "person";
        const entity = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Typed media fixture','manual') RETURNING id", [kind])).rows[0].id;
        if (category === "apps") await pool.query("INSERT INTO app_entity_details(entity_id,app_url) VALUES($1,'https://example.invalid/app')", [entity]);
        else if (category === "places") await pool.query("INSERT INTO place_entity_details(entity_id) VALUES($1)", [entity]);
        else if (category === "products") await pool.query("INSERT INTO product_entity_details(entity_id,product_url) VALUES($1,'https://example.invalid/product')", [entity]);
        else await pool.query("INSERT INTO person_entity_details(entity_id) VALUES($1)", [entity]);
```

and, for the attachment itself:

```ts
        if (table === "recommendation_media") await pool.query("INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)", [recommendation, owner.accountId, mediaId]);
        else await pool.query(`INSERT INTO ${table}(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)`, [recommendation, owner.accountId, mediaId]);
```

Extend the projection assertion in the existing `it` to cover the new categories:

```ts
      else if (category === "products") {
        const projection = await publicProductsProjection(pool, f.handle, 24);
        expect(projection?.productLists[0].recommended_products[0].images).toEqual([f.url]);
      } else if (category === "people") {
        const projection = await publicPeopleProjection(pool, f.handle, 24);
        expect(projection?.personLists[0].recommended_people[0].media_details.imageDetails).toEqual([{ id: f.id, url: f.url }]);
      }
```

Add `publicProductsProjection` and `publicPeopleProjection` to the file's imports.

- [ ] **Step 2: Run and confirm the two new categories fail**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media.integration.test.ts
```

Expected: `apps` and `places` PASS; `products` and `people` FAIL — `images` is `null`, `media_details` is undefined, and `isPublicAttachment` is `false`.

- [ ] **Step 3: Read owner media in the Products projection**

In `publicProductsProjection.ts`, inside `richProduct`, after `const offer = await readProductOffer(...)`:

```ts
 const uploads=(await db.query(`SELECT m.id FROM recommendation_media rm JOIN media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE rm.recommendation_id=$1 AND m.status='ready' ORDER BY rm.display_order,m.id LIMIT 21`,[row.id])).rows.map(m=>`/api/explorers/v1/media/${m.id}/content`);
 if(uploads.length>20)throw new Error('Public Product exceeds media read bound');
```

Replace the `images` property. Owner uploads come **first** and the combined array is bounded, because the card renderer takes only element `[0]` (`ProfileRecommendationsTab.tsx:161-171`) and `image_urls` is itself capped at 20 (`0044…:36`), so a naive concatenation could reach 40:

```ts
 images:uploads.length||facts.imageUrls.length?[...uploads,...facts.imageUrls].slice(0,20):null,
```

- [ ] **Step 4: Read owner media in the People projection and extend its strict schema**

In `publicPeopleProjection.ts`, inside `richPerson`, after the `const primary = ...` line:

```ts
 const uploads=(await db.query(`SELECT m.id,m.alternative_text,m.caption FROM recommendation_media rm JOIN media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE rm.recommendation_id=$1 AND m.status='ready' ORDER BY rm.display_order,m.id LIMIT 21`,[row.id])).rows.map(m=>({documentId:m.id,url:`/api/explorers/v1/media/${m.id}/content`,alternativeText:m.alternative_text,caption:m.caption}));
 if(uploads.length>20)throw new Error('Public Person exceeds media read bound');
```

Add to the `person` object literal, after `avatar_url:facts.avatarUrl,` — both keys, matching Places:

```ts
 media_details:uploads.length?{imageDetails:uploads.map(u=>({id:u.documentId,url:u.url}))}:null,
 Media:uploads.length?uploads:null,
```

Then extend `publicPersonSchema` in `tunes/shared/explorersPublicPeopleSectorContract.ts` so the `.strict()` parse accepts them:

```ts
  media_details: z.object({ imageDetails: z.array(z.object({ id: z.string().uuid(), url: z.string() }).strict()).max(20) }).strict().nullable(),
  Media: z.array(z.object({ documentId: z.string().uuid(), url: z.string(), alternativeText: z.string().nullable(), caption: z.string().nullable() }).strict()).max(20).nullable(),
```

- [ ] **Step 5: Widen both gate lists together**

In `mediaRepository.ts`, replace lines 101-102:

```sql
      WHERE rm.media_id=$1 AND r.category IN('books','movies','games','apps','places')
        AND ((rm.required_category IS NULL AND r.category IN('books','movies','games')) OR rm.required_category=r.category)
```

with:

```sql
      WHERE rm.media_id=$1 AND r.category IN('books','movies','games','apps','places','products','people')
        AND ((rm.required_category IS NULL AND r.category IN('books','movies','games','products','people')) OR rm.required_category=r.category)
```

Both lists must change: the outer alone leaves the generic arm refusing them, the inner alone is unreachable. This correctly keeps apps/places generic media refused, which `explorers-media.integration.test.ts:157-158` asserts.

- [ ] **Step 6: Run the media suite and the People sector suite**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media.integration.test.ts
npx vitest run server/test/publicProfile/publicPeopleSector.test.ts
```

Expected: both PASS. The sector suite is the guard against the `.strict()` regression; if it throws `Unrecognized key(s)`, Step 4's schema edit is incomplete.

- [ ] **Step 7: Commit**

```bash
git add tunes/server/publicProfile/publicProductsProjection.ts tunes/server/publicProfile/publicPeopleProjection.ts tunes/shared/explorersPublicPeopleSectorContract.ts tunes/server/repositories/mediaRepository.ts tunes/server/test/explorers-media.integration.test.ts
git commit -m "feat(products,people): publish owner snapshot media and admit it at the gate"
```

**Note for later:** `media_assets.alternative_text` and `caption` are unbounded `text` with no CHECK (`0024…:12-13`). Nothing writes them today, so the People page's 4 MiB bound is not currently at risk, but Books carries the same latent exposure at `publicBooksProjection.ts:23-24`. Not this plan's job.

---

## Task 4: Admit books, movies and games list covers, with a drift-proof oracle

`git log -L 68,77:tunes/server/repositories/mediaRepository.ts` shows the cover arm's category list grew by accretion — `('places','products','people')`, `+'guides'`, `+'apps'` — and these three were never appended, though public consumers exist (`publicBooksProjection.ts:62`, `publicMoviesProjection.ts:89`, `publicGamesProjection.ts:158`).

**[v1 defect]** v1's self-review claimed its test made the accretion bug unrepeatable. It did not: the category list was a hand-written literal, i.e. a second list that drifts. Both reviewers converged on the fix — drive the loop from the single source of truth, and assert the **invariant** rather than per-key shapes.

**Files:**
- Create: `tunes/server/test/explorers-media-cover.integration.test.ts`
- Modify: `tunes/server/repositories/mediaRepository.ts:74`
- Modify: `.github/workflows/test.yml:225`

- [ ] **Step 1: Write the drift-proof test**

Two things matter here. The category list comes from `contentCategorySchema.options` (`tunes/shared/explorersContract.ts:29`), which is exactly the eight categories that can own a collection and matches the `collections.category` CHECK (`0029…:25`) — so a ninth category fails this test on the day it is added. And the assertion is **key-name agnostic**: it harvests every media URL anywhere in the projection's JSON, so `Guide_Media` vs `cover_image` vs `coverUrl` vs `images` vs `screenshots` vs `Media` stops mattering.

```ts
import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MediaRepository } from "../repositories/mediaRepository";
import { createCanonicalApp } from "../auth/canonicalApp";
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

let harness: ReturnType<typeof createMediaHarness>, composed: ReturnType<typeof createCanonicalApp>;

const projectionFor: Record<string, (pool: pg.Pool, handle: string) => Promise<unknown>> = {
  places: (p, h) => publicPlacesProjection(p, h, 24), guides: (p, h) => publicGuidesProjection(p, h, 24),
  movies: (p, h) => publicMoviesProjection(p, h, 24), books: (p, h) => publicBooksProjection(p, h, 24),
  games: (p, h) => publicGamesProjection(p, h, 24), apps: (p, h) => publicAppsProjection(p, h, 24),
  products: (p, h) => publicProductsProjection(p, h, 24), people: (p, h) => publicPeopleProjection(p, h, 24),
};

// Every media URL anywhere in the payload, whatever key holds it.
function mediaUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") { if (/^\/api\/explorers\/v1\/media\/[0-9a-f-]{36}\/content$/.test(value)) found.push(value); return found; }
  if (Array.isArray(value)) { for (const item of value) mediaUrls(item, found); return found; }
  if (value && typeof value === "object") { for (const item of Object.values(value)) mediaUrls(item, found); return found; }
  return found;
}

describe("public media URLs are always servable", () => {
  beforeAll(() => { harness = createMediaHarness(); composed = createCanonicalApp(harness.pool, harness.config); });
  afterAll(async () => { await harness.end(); });

  for (const category of contentCategorySchema.options) {
    it(`serves every media URL the public ${category} read emits`, async () => {
      const owner = await harness.persona();
      const handle = `m${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      await harness.pool.query("UPDATE creator_accounts SET handle=$2,display_name='Cover creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId, handle]);
      await harness.pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
      const collection = (await harness.pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Cover list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `cover-${randomUUID()}`])).rows[0].id;
      const cover = await harness.upload(owner.cookie, harness.png, "image/png", "collection");
      expect(cover.status).toBe(201);
      const coverId = cover.body.media.id as string;
      await harness.pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, coverId]);

      // Positive control: the projection must actually emit something, or the
      // assertion below would pass vacuously on an empty payload.
      const urls = mediaUrls(await projectionFor[category](harness.pool, handle));
      expect(urls, `${category} projection emitted no media URL`).not.toHaveLength(0);
      expect(urls).toContain(`/api/explorers/v1/media/${coverId}/content`);

      // The invariant: anything the public read emits must be servable.
      for (const url of urls) expect((await request(composed.app).get(url)).status, url).toBe(200);
      expect(await new MediaRepository(harness.pool).isPublicAttachment(coverId)).toBe(true);

      // And withdrawing the list withdraws the cover.
      await harness.pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1", [collection]);
      expect(await new MediaRepository(harness.pool).isPublicAttachment(coverId)).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Extract the harness as a factory, not a move**

**[v1 defect]** v1 said to import `config, persona, png, upload` from a new helper. Those close over module-scope `pool` and `composed` assigned in `beforeAll` (`explorers-media.integration.test.ts:20-40`), so a straight move yields `undefined` at call time, and two files each running `afterAll(() => pool.end())` would race to kill a shared pool.

Create `tunes/server/test/helpers/explorersMediaHarness.ts` exporting `createMediaHarness()`, which owns **its own** pool and returns `{ pool, config, png, persona, upload, end }`. Move the bodies of `persona` and `upload` into it, taking `pool` from the closure the factory creates. Then have `explorers-media.integration.test.ts` call the factory too, so neither file owns a duplicate and each owns its own pool.

- [ ] **Step 3: Run and confirm exactly three failures**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media-cover.integration.test.ts
```

Expected: `books`, `movies`, `games` FAIL on the `status 200` assertion for the cover URL; the other five PASS.

- [ ] **Step 4: Add the three categories to the cover arm**

In `mediaRepository.ts:74`, replace:

```sql
        AND c.category IN ('apps','places','products','people','guides')
```

with:

```sql
        AND c.category IN ('apps','places','products','people','guides','books','movies','games')
```

- [ ] **Step 5: Register the new file in the PR lane**

Add `server/test/explorers-media-cover.integration.test.ts` to the explicit file list at `.github/workflows/test.yml:225`. Without this the test never runs on a PR, and it is this plan's anti-regression guard.

- [ ] **Step 6: Run and commit**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media-cover.integration.test.ts server/test/explorers-media.integration.test.ts
```

Expected: 8 passed in the new file, existing file still green.

```bash
git add tunes/server/repositories/mediaRepository.ts tunes/server/test/explorers-media-cover.integration.test.ts tunes/server/test/helpers/explorersMediaHarness.ts tunes/server/test/explorers-media.integration.test.ts .github/workflows/test.yml
git commit -m "fix(media): serve books, movies and games list covers, with a drift-proof oracle"
```

- [ ] **Step 7: Pin the lists to the contract**

Add to `tunes/server/test/contracts/` a unit test that converts future accretion into an instant failure. Export the two lists from `mediaRepository.ts` as `COVER_CATEGORIES` and `GENERIC_MEDIA_CATEGORIES`, build the SQL from them, and assert:

```ts
it("admits a cover for every category that can own a collection", () => {
  expect([...COVER_CATEGORIES].sort()).toEqual([...contentCategorySchema.options].sort());
});
```

Do **not** also pin `GENERIC_MEDIA_CATEGORIES` to an enum — it is deliberately a subset (guides has no `recommendations` rows, and apps/places use typed tables), so assert its exact expected membership with a comment saying why each is in or out.

---

## Task 5: Keep the cover `status='ready'` guard as defence-in-depth — and test the real enforcement

**[v1 defect]** v1 claimed an unready cover yields a 404ing URL and wrote eight tests for it. **That state is unreachable**, and the tests would have errored rather than asserted. `0030_explorers_media_purpose_guard.sql:26` creates `media_asset_reference_guard AFTER UPDATE OF status,purpose ON media_assets`, raising `23514 'Referenced media must remain ready'` when `collection_media` references the row (`:9-14`); and a cover can only be attached while ready (`0029…:107-119`). Both are `DEFERRABLE INITIALLY DEFERRED`, so the pair cannot be slipped through one transaction. `explorers-media.integration.test.ts:171` already pins this. `media.ts:153` independently 404s a non-`ready` asset.

So the SQL guard is worth adding for defence-in-depth and consistency with Places/People, but it fixes no live defect and must not be described as doing so.

**Files:**
- Modify: `publicAppsProjection.ts:72`, `publicBooksProjection.ts:53`, `publicGamesProjection.ts:155`, `publicGuidesProjection.ts:119`, `publicMoviesProjection.ts:80`, `publicProductsProjection.ts:87` **and `:110`** (seven sites in six files)
- Test: `tunes/server/test/explorers-media.integration.test.ts:169-185`

- [ ] **Step 1: Pin the enforcement that actually exists**

Extend the existing "actual schema rejects unsafe typed relations" case at `:169-185` with the `collection_media` pair, both directions:

```ts
    // A cover cannot be attached unless its asset is ready...
    await expect(pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, uploadingId]))
      .rejects.toMatchObject({ code: "23514" });
    // ...and a referenced cover cannot leave ready.
    await expect(pool.query("UPDATE media_assets SET status='uploading' WHERE id=$1", [attachedCoverId]))
      .rejects.toMatchObject({ code: "23514" });
```

- [ ] **Step 2: Run and confirm it passes immediately**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media.integration.test.ts
```

Expected: PASS with no production change — that is the point. It records an invariant the schema already enforces so a future migration cannot silently relax it.

- [ ] **Step 3: Locate the seven cover joins**

```bash
cd tunes && grep -rn "collection_media cm" server/publicProfile/ | grep -v "status='ready'"
```

Expected: the seven sites above. Note `publicProductsProjection.ts` has **two** (the linked-lists read and the main read), and `publicGamesProjection.ts:155` holds its whole query on one line, so that one is an in-string edit rather than a line append.

- [ ] **Step 4: Append the guard to each**

Match the Places/People form exactly:

```sql
 AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
```

- [ ] **Step 5: Run the server suites and the serial frontend lane**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/
cd ../explorers-earth && npx vitest run --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tunes/server/publicProfile/ tunes/server/test/explorers-media.integration.test.ts
git commit -m "chore(media): guard cover joins on ready media and pin the schema's own enforcement"
```

---

## Task 6: Route places creator uploads into the typed photo path, create *and* edit

Decision D-2. Places sends provider-origin ids to `photoMediaIds` (typed, gated, projected) and creator-origin ids to `mediaIds` (generic, publicly unreadable).

**[v1 defect]** v1 changed only the **create** path and would have left D-2 unfinished. The **edit** path at `useAddRecommendation.ts:528` also writes `mediaIds: [...existingMediaIds, ...uploadedIds]` into `attempt.patch`, dispatched at `:537` through `PlacesClient.updateRecommendation` (`placesCommands.ts:111`) — which is not among the lines v1 edited.

**Files:**
- Modify: `explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts:324-325` (create) and `:511-513,528` (edit)
- Modify: `explorers-earth/src/features/Favorites/api/placesClient.ts:25` and the payload sites at `:120,123,134,149,151`
- Test: `explorers-earth/src/features/Favorites/hooks/__tests__/useAddRecommendation.media.test.ts`

- [ ] **Step 1: Write the failing tests in the file that can run them**

**[v1 defect]** v1 put this in `placesViewModel.test.ts` and called `persistCreatedRecommendationMedia` directly. That function is an unexported closure inside the hook (`useAddRecommendation.ts:316`), and that test file is a pure mapping test with no `commands` and no upload stub — `upload` there is a UUID constant. Use `useAddRecommendation.media.test.ts`, which already mocks `upload`/`updatePlace` (`:18,33,104`) and drives the hook through `renderHook`.

Add two cases asserting the **command boundary**, not accumulator state:

```ts
it("sends a creator-origin upload as a place photo on create", async () => {
  // drive the hook's create flow with one creator-origin pending blob, per this file's existing pattern
  await waitFor(() => expect(updatePlace).toHaveBeenCalled());
  expect(updatePlace.mock.calls.at(-1)?.[1]).toMatchObject({ placePhotos: { photoMediaIds: [uploadedId] }, mediaIds: [] });
});

it("sends a creator-origin upload as a place photo on edit", async () => {
  // drive the hook's edit flow with one creator-origin pending blob
  await waitFor(() => expect(updatePlace).toHaveBeenCalled());
  const patch = updatePlace.mock.calls.at(-1)?.[1];
  expect(patch.placePhotos.photoMediaIds).toContain(uploadedId);
  expect(patch.mediaIds ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run and confirm both fail**

```bash
cd explorers-earth && npx vitest run src/features/Favorites/hooks/__tests__/useAddRecommendation.media.test.ts
```

Expected: FAIL — ids appear under `mediaIds` instead of `placePhotos.photoMediaIds`.

- [ ] **Step 3: Route the create path**

Replace `useAddRecommendation.ts:324-325`:

```ts
        if (media.origin === "provider") attempt.photoMediaIds.push(uploaded.id);
        else attempt.mediaIds.push(uploaded.id);
```

with:

```ts
        // Creator and provider uploads share the one typed, publicly projected photo path.
        attempt.photoMediaIds.push(uploaded.id);
```

- [ ] **Step 4: Route the edit path**

At `:511-513`, `existingMediaIds` is derived from `fetchedPlace?.media_details?.imageDetails`. On the public side that key now means `recommendation_place_photos`, so read the existing **photo** ids and merge the new uploads into `placePhotos` instead. Change `:528` from:

```ts
        mediaIds: [...existingMediaIds, ...uploadedIds],
```

to:

```ts
        placePhotos: { photoMediaIds: [...existingPhotoMediaIds, ...uploadedIds].slice(0, 10) },
```

and rename the `:511-513` derivation to `existingPhotoMediaIds`, sourcing it from the fetched place's photo ids. Do not leave a `mediaIds` key in the edit patch.

- [ ] **Step 5: Remove the dead field from the places contract**

**[v1 defect]** `ManualPlaceDraft.mediaIds` is declared **required** at `placesClient.ts:25`. Removing it from the five payload sites without touching the type leaves a required field nothing populates. Delete it from the type as well as from `:120,123,134,149,151`. Leave `mediaIds` in the shared `explorersContract.ts` — books, movies, games, products and people all still use it.

- [ ] **Step 6: Reconcile the owner-side consumer**

`placesViewModel.ts:92` reads `detail.mediaIds` into `row.Media` and `row.media_details.imageDetails`, and `placesViewModel.test.ts:44-45` asserts it with the comment "The owner's own uploads stay a separate gallery source". After this task nothing writes places `mediaIds`, so the owner's gallery would silently go empty for newly created places. Point that consumer at the place-photo ids instead, and update the test and its comment to match. Do not leave the view-model test documenting the opposite of Task 7's comment.

- [ ] **Step 7: Run the places tests and the serial lane**

```bash
cd explorers-earth && npx vitest run src/features/Favorites && npx vitest run --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add explorers-earth/src/features/Favorites
git commit -m "fix(places): route creator uploads into the typed public photo path on create and edit"
```

**Two consequences to accept explicitly.** A creator who previously had 10 provider photos *plus* uncapped own uploads now loses everything past the 10-slot migration cap (`0047…:22`) with no message — consider a user-visible refusal as a follow-up. And there is **no backfill**: creator uploads already sitting in `recommendation_media` for places stay publicly invisible, because the gate's inner list still correctly excludes `'places'`.

---

## Task 7: Correct the Places projection comment

`publicPlacesProjection.ts:24-27` claims photos are "concatenated with the owner's own uploads exactly as PlaceOverview already concatenates them". The code never concatenates — `photos` comes solely from `readPlacePhotoMediaIds`.

**Files:**
- Modify: `tunes/server/publicProfile/publicPlacesProjection.ts:24-27`

- [ ] **Step 1: Replace the comment** (accurate only once Task 6 is done, so sequence it after)

```ts
 * Photos are owned media served through the media route, read solely from
 * recommendation_place_photos. Creator and provider uploads are merged at upload time —
 * useAddRecommendation routes both into photoMediaIds on create and on edit — so this
 * read needs no union. Note that media_details.imageDetails means
 * recommendation_place_photos here; the owner side resolves the same key from its own
 * photo ids. The key is shared, the source is not.
```

- [ ] **Step 2: Commit**

```bash
git add tunes/server/publicProfile/publicPlacesProjection.ts
git commit -m "docs(places): describe the actual photo source and the shared key"
```

---

## Task 8: Stop anonymous visitors bootstrapping a session — without deadlocking protected routes

The merge replaced a guarded `useQuery(musicEligibilityQuery, { skip: !isAuthenticated || !user?.documentId })` with an unconditional `useEffect(() => { void authClient.refresh(); }, [])` at `AuthSyncManager.tsx:24`, and `authClient.ts:19` opens with `fetch("/api/auth/get-session")`. Every anonymous visitor to a public profile now issues an auth request, which is unnecessary load on the most cacheable pages and fails `profile-tabs` 18/18 on `deniedAuthority === 0`.

**[v1 defect — all three of v1's variants were broken]**
1. The `explorers.session_hint` cookie v1 proposed **does not exist** anywhere in the repo; `betterAuth.ts:72` sets `cookieCache:{enabled:false}`. `hasSessionHint()` would always be `false`.
2. v1's fallback — gate on `isAuthenticated` — is **circular**. `authClient.refresh()` is the only producer of `isAuthenticated` (`authClient.ts:17-38`), and the store starts `status:"loading", isAuthenticated:false` (`store.ts:58,64`). Gating on it means nobody is ever signed in. v1's claim that this "restores pre-merge semantics" was wrong: the pre-merge guard protected a *music eligibility* query, not the session bootstrap.
3. **Either** variant leaves `status === "loading"` forever, and `ProtectedRoute.tsx:15` renders an infinite loader for that state instead of redirecting — so an anonymous visitor hitting a protected URL hangs.

The constraint this yields: **the store must always reach a terminal status**, and the bootstrap must happen before any protected route renders. `ProtectedRoute.tsx:16` already calls `authClient.refresh()` as a retry, so moving the bootstrap there satisfies both.

**Files:**
- Modify: `explorers-earth/src/components/AuthSyncManager.tsx:24`
- Modify: `explorers-earth/src/components/ProtectedRoute.tsx` (own the bootstrap)
- Test: `explorers-earth/src/components/__tests__/AuthSyncManager.test.tsx`, `AuthSyncManager.canonical.test.tsx`
- Test: `explorers-earth/e2e/profile-tab-hit-testing.spec.ts` (existing, unchanged)

- [ ] **Step 1: Reproduce**

```bash
cd explorers-earth && npx playwright test --config e2e/replatform/profile-tabs.playwright.config.ts
```

Expected: 18 failures, each `expect.soft(counters.deniedAuthority).toBe(0)` receiving `2` (two because StrictMode double-invokes the effect under the dev server; production would issue one).

- [ ] **Step 2: Decide where the bootstrap lives, from the evidence**

Confirm whether any **public** surface needs to know the viewer is signed in — for example an owner-only affordance rendered on a public profile:

```bash
cd explorers-earth && grep -rn "isAuthenticated\|useAuthStore" src/features/PublicHome/ | grep -v "__tests__"
```

- If this returns **nothing**, move the bootstrap into `ProtectedRoute` (Step 3a). Public pages then issue no auth request at all.
- If it returns real consumers, keep the bootstrap at the root but have those public surfaces request it explicitly, and instead make `AuthSyncManager` settle the store to a terminal signed-out status on public routes without fetching (Step 3b). Record which branch you took and why in the commit message.

- [ ] **Step 3a: Move the bootstrap into the protected gate**

Remove line 24 from `AuthSyncManager.tsx` entirely. In `ProtectedRoute.tsx`, bootstrap once on mount before gating, keeping its existing retry behaviour:

```tsx
  useEffect(() => { if (status === "idle") void authClient.refresh(); }, [status]);
  if (status === "loading" || status === "idle") return <EarthLoader />;
```

Add an `"idle"` initial status to the store if it does not already distinguish "never attempted" from "in flight" (`store.ts:58`); otherwise use the existing initial status and ensure `refresh()` is dispatched exactly once. The invariant to preserve: **no path leaves `status` non-terminal with no request in flight.**

- [ ] **Step 3b: Alternative — settle the store without fetching**

If Step 2 showed public consumers, replace line 24 with:

```tsx
  // A public profile view is anonymous. Settle the store rather than fetching, so
  // ProtectedRoute never sees a non-terminal status and no auth request leaves the page.
  useEffect(() => {
    if (!onPublicProfileRoute) { void authClient.refresh(); return; }
    const store = useAuthStore.getState();
    store.verificationFailed(store.beginVerification(), "signed-out");
  }, [onPublicProfileRoute]);
```

Derive `onPublicProfileRoute` from the router rather than from `window.location`, so it is testable.

- [ ] **Step 4: Fix the five existing unit tests and add the real oracle**

`AuthSyncManager.test.tsx:11` mocks `authClient` as `{ refresh: calls.refresh }`. Any new method called on that mock throws and takes **every** test in the file (and in `AuthSyncManager.canonical.test.tsx`) down with it, so update the mock to whatever shape Step 3 requires. `:26-29` (`it("starts cookie verification on mount")` asserting `refresh` called once from a `logout()` state) asserts the **old** behaviour and must be rewritten to the new contract.

Then add the pair that v1 lacked — v1's "a signed-in session still refreshes" was prose with no assertion, which is exactly how a wrong guard would ship green:

```tsx
it("issues no auth request for an anonymous public visitor", async () => {
  renderAtPublicProfile();
  await waitFor(() => expect(useAuthStore.getState().status).not.toBe("loading"));
  expect(calls.refresh).not.toHaveBeenCalled();
});

it("still bootstraps a session where auth is required", async () => {
  renderAtProtectedRoute();
  await waitFor(() => expect(calls.refresh).toHaveBeenCalledTimes(1));
});

it("never leaves the store non-terminal", async () => {
  renderAtPublicProfile();
  await waitFor(() => expect(["authenticated", "signed-out"]).toContain(useAuthStore.getState().status));
});
```

The third is the guard against the `ProtectedRoute` deadlock, which is the failure mode neither the e2e counter nor the first two would catch.

- [ ] **Step 5: Run the unit lane, then the two e2e lanes**

```bash
cd explorers-earth && npx vitest run --no-file-parallelism
npx playwright test --config e2e/replatform/profile-tabs.playwright.config.ts
npx playwright test --config e2e/replatform/auth.playwright.config.ts
```

Expected: unit lane PASS; `profile-tabs` 18 passed; auth lane PASS. The auth lane is the real check that sign-in still works — do not skip it, and do not widen the harness allowlist in `e2e/setup/profile-tab-hit-testing.ts` to make `profile-tabs` pass. The counter is the oracle.

- [ ] **Step 6: Commit**

```bash
git add explorers-earth/src/components explorers-earth/src/lib explorers-earth/src/store
git commit -m "fix(auth): bootstrap the session where it is needed, not on every public page"
```

---

## Out of scope

- Paste-a-link enrichment (Plan B).
- Unifying the two storage patterns (generic `recommendation_media` vs typed per-category tables). Typed tables exist where provider imports or slot ordering need their own semantics; collapsing them needs migrations and changes nothing a user sees.
- Production cutover — `docs/replatform-audit/production-cutover-runbook.md`.
- `explorersRecommendationRepository.ts:501-506`'s ref-count list omits `recommendation_app_screenshots` and `recommendation_place_photos`. It runs only on the `category==='movies'` branch (`:495`), so this plan does not regress it, but it is a parallel list that is already wrong.
- `real-stack books`, never green — `books.spec.ts:205` times out on `locator.click` at 120 s, desktop and mobile. Needs its own triage.

### `real-stack lifecycle` is a harness defect, not a cross-owner leak — triaged 2026-10-17

It is **not** a blocker, and not a security bug. `requireActor` (`tunes/server/middleware/explorersPrincipal.ts:9-33`) resolves the actor purely from the request's own headers: `auth.api.getSession({headers: fromNodeHeaders(request.headers)})`, then a query keyed `WHERE s.id=$1 AND s.user_id=$2` with the account reached through `initial_account_bindings` on `b.user_id=s.user_id`. There is no cache and no module-level state, so a `/me` response carrying an account id means **that request presented that account's cookie**. The server cannot answer with another owner's account.

The defect is in the oracle. `verifyReplacement` (`explorers-earth/e2e/replatform/lifecycle.spec.ts:181-200`) registers `page.waitForResponse(r => new URL(r.url()).pathname === …)` for `/api/auth/get-session` and `/me`, matching on **pathname alone** with no correlation to the `authClient.refresh()` it then triggers. It swaps the context cookie first (`:183`), so any app-initiated refresh already in flight — or triggered by the swap — produces a response with the same pathname that the waiter will happily capture. In the `returningA` case that is owner B's response, which is exactly the observed `5ca00a15…` vs `d75d80fb…` mismatch.

Two consequences. **Task 8 should reduce or remove this flake as a side effect**, because the unconditional mount-time `authClient.refresh()` it deletes is the main source of the uncorrelated in-flight refreshes. And the oracle wants fixing independently: correlate each wait to its own request (match on the request object the evaluate initiates, or assert against the response whose request carried the expected cookie) rather than on pathname. Re-run the lane after Task 8 before spending more on it.

## What the reviews changed

Recorded so the corrections are not re-litigated: Task 3 would have thrown `Unrecognized key(s)` on every public People sector request and broken six existing tests, and emitted a key only the SEO tag reads. Task 8's primary mechanism was a cookie that does not exist, its fallback was circular, and both variants deadlocked `ProtectedRoute`. Task 1 fixed one of four seal sites. Task 5 targeted a state the schema makes unreachable. Task 6 missed the edit-path producer, so D-2 would have stayed unfinished. Task 4's new file would never have run in the PR lane, and its "drift-proof" claim rested on a hand-written list that drifts.
