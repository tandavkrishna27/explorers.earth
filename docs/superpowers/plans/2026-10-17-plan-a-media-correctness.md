# Plan A — Media correctness across all eight categories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make owner-uploaded media work and appear publicly for all eight recommendation categories, and fix the two regressions the first honest CI run exposed.

**Architecture:** Owner media is uploaded to a private S3 bucket and served only through `GET /api/explorers/v1/media/:id/content`, authorised by `MediaRepository.isPublicAttachment`. That function is a UNION of arms, each arm pairing a storage table with a `required_category`. A category's media is publicly visible only when a public projection emits its URL **and** a gate arm admits it. Today three categories emit a cover URL the gate refuses, and three store owner uploads the gate correctly refuses because no projection reads them. This plan closes both halves, always changing projection and gate in the same commit.

**Tech Stack:** TypeScript (strict), PostgreSQL via `pg`, Express, Vitest, Playwright, React 18 + Vite.

---

## Decisions this plan implements

| Decision | Choice |
|---|---|
| D-1 products/people snapshot uploads | **Complete the feature** — add public reads, then widen the gate |
| D-2 places creator uploads | **Route into the typed `photoMediaIds` path**, not the generic table |
| D-3 paste-a-link enrichment | Out of scope here — Plan B |

## Key facts established by investigation (do not re-derive)

- The gate function is `MediaRepository.isPublicAttachment` (`tunes/server/repositories/mediaRepository.ts:59-108`). `isPubliclyVisible` does **not** exist.
- A projection may read its media through an **imported module**, not inline SQL. `publicGamesProjection.ts:140` reads via `readManualGamePresentation`. Never conclude "no media read" from grepping one file.
- Both public consumers already have a key waiting, so **no frontend rendering change is needed**: products render `product.images` (`explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx:163-168`), people render `Media[0].url` (`explorers-earth/src/features/PublicHome/components/PlaceDetails/PersonOverview.tsx:340`).
- The place-photo guard trigger (`tunes/migrations/0047_explorers_place_photo_media.sql:31-50`) requires only `status='ready'`, `purpose='recommendation'`, an image MIME and ≤ 5 MiB on a `places` recommendation. It has **no provider-only semantics**, so creator uploads satisfy it.
- `tsc -p tsconfig.json` in `explorers-earth` checks nothing. Use `tsconfig.app.json`.
- Run the whole `explorers-earth` unit lane **serially**; it is the only gate that catches cross-ticket DTO-shape regressions.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `tunes/scripts/apps-browser-fixture.ts` | Apps protected-fixture preflight; pins a helper by content hash | 1 |
| `explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx` | Product owner form; must rehydrate existing media | 2 |
| `explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx` | Person owner form; same | 2 |
| `tunes/server/publicProfile/publicProductsProjection.ts` | Public Products read; gains an owner-media read | 3 |
| `tunes/server/publicProfile/publicPeopleProjection.ts` | Public People read; gains an owner-media read | 3 |
| `tunes/server/repositories/mediaRepository.ts` | **The** visibility authority; both arms widen here | 3, 4 |
| `tunes/server/test/explorers-media-cover.integration.test.ts` | New: cover-arm parity across all eight categories | 4 |
| 6 × `tunes/server/publicProfile/public*Projection.ts` | Cover joins gain a `status='ready'` guard | 5 |
| `explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts` | Places upload partition; creator uploads re-routed | 6 |
| `explorers-earth/src/features/Favorites/api/placesClient.ts` | Places commands; `mediaIds` leg removed | 6 |
| `explorers-earth/src/components/AuthSyncManager.tsx` | Identity sync; must not fire for anonymous visitors | 8 |

---

## Task 1: Re-pin the Apps fixture seal

A seal pins `tunes/scripts/music-local-private-files.ps1` by SHA-256. That helper was edited earlier in this effort without updating the constant, so the Apps protected fixture refuses at preflight on **every** platform, including a developer machine. Not a line-ending artifact: the git blob and the working file hash identically.

**Files:**
- Modify: `tunes/scripts/apps-browser-fixture.ts:945`

- [ ] **Step 1: Confirm the mismatch**

```bash
git show HEAD:tunes/scripts/music-local-private-files.ps1 | sha256sum
grep -c "d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764" tunes/scripts/apps-browser-fixture.ts
```

Expected: hash `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0`, grep count `1`.

- [ ] **Step 2: Replace the constant**

Change `'d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764'` to `'a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0'`.

- [ ] **Step 3: Confirm no other seal pins the same helper**

```bash
grep -rn "d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764" --include=*.ts --include=*.json --include=*.mjs . | grep -v node_modules
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add tunes/scripts/apps-browser-fixture.ts
git commit -m "fix(apps): re-pin the private-files seal to the current helper"
```

---

## Task 2: Stop re-edits from detaching product and person photos

`AddProductPage.tsx` and `AddPersonPage.tsx` initialise their form from `observed.detail` but never restore `media` from `observed.detail.mediaIds`. `AddAppPage.tsx:85` and `AddGamePage.tsx:39` do. So re-editing submits `mediaIds: []` and silently detaches every previously uploaded snapshot. This is live data loss and is fixed first.

**Files:**
- Modify: `explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx:82` (end of the hydration `useEffect`)
- Modify: `explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx` (end of its hydration `useEffect`)
- Test: `explorers-earth/src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx`, `explorers-earth/src/features/People/components/dashboard/__tests__/manualPersonFlow.test.tsx`

- [ ] **Step 1: Write the failing test** (products; mirror it for people)

Add to `manualProductFlow.test.tsx`, inside the existing `describe('native manual Products', …)`. It asserts the form restores the thumbnail, which tests rehydration directly without mocking the save path.

```tsx
 it('restores previously uploaded snapshots when re-editing', async () => {
  const existing = '11111111-2222-3333-4444-555555555555';
  fixture.content.view.lists = [{documentId: 'list-1', recommended_products: [{documentId: 'product-1',
   title: 'Keyboard', product_url: 'https://example.com/kb', brand: null, logo_url: null, description: null,
   buy_url: null, specifications: null, user_recommendation_note: '', user_rating: null}]}];
  fixture.content.details.set('product-1', {detail: {id: 'product-1', category: 'products',
   mediaIds: [existing], productOffer: {price: null, currencyCode: null, buyUrl: null}}});

  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1/edit/product-1']}>
   <Routes><Route path="/recommendations/products/:listId/edit/:productId" element={<AddProductPage />} /></Routes>
  </MemoryRouter></MockedProvider>);

  // The owner's existing snapshot must come back, or saving would detach it.
  expect(await screen.findByAltText('Product snapshot'))
   .toHaveAttribute('src', `/api/explorers/v1/media/${existing}/content`);
 });
```

Mirror it in `manualPersonFlow.test.tsx` using that file's own fixture object, the route `/recommendations/people/list-1/edit/person-1`, a `recommended_people` row keyed `documentId: 'person-1'`, and `findByAltText('Person snapshot')`.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd explorers-earth && npx vitest run src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx
```

Expected: FAIL — `Unable to find an element with the alt text: Product snapshot`.

- [ ] **Step 3: Rehydrate `media`**

In `AddProductPage.tsx`, as the last statement inside the hydration `useEffect`, immediately after `setRating(product.user_rating);` (line 82):

```tsx
  setMedia((observed.detail.mediaIds ?? []).map(id => ({ id, url: `/api/explorers/v1/media/${id}/content` })));
```

Add the identical line in `AddPersonPage.tsx` immediately after `setRating(person.user_rating);` (line 90). The `{ id, url }` shape and URL template match what the upload handlers already store (`AddProductPage.tsx:109`, `AddPersonPage.tsx:117`), so the thumbnail renders at `AddProductPage.tsx:225` / `AddPersonPage.tsx:245` with no further change.

`mediaIds` is present on every recommendation detail regardless of category, so — unlike `appScreenshots` in `AddAppPage.tsx:85` — **no category guard is needed**.

- [ ] **Step 4: Run both tests and confirm they pass**

```bash
cd explorers-earth && npx vitest run src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx src/features/People/components/dashboard/__tests__/manualPersonFlow.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx explorers-earth/src/features/Products/components/dashboard/__tests__/manualProductFlow.test.tsx explorers-earth/src/features/People/components/dashboard/__tests__/manualPersonFlow.test.tsx
git commit -m "fix(products,people): rehydrate uploaded media so a re-edit cannot detach it"
```

---

## Task 3: Make products and people snapshot uploads publicly visible

This is decision D-1. The projections and the gate **must change in the same commit**: a projection without the gate emits URLs that 404, and the gate without a projection publishes assets nothing references.

**Files:**
- Modify: `tunes/server/publicProfile/publicProductsProjection.ts:40-59` (`richProduct`)
- Modify: `tunes/server/publicProfile/publicPeopleProjection.ts:45-67` (`richPerson`)
- Modify: `tunes/server/repositories/mediaRepository.ts:101-102`
- Test: `tunes/server/test/explorers-media.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `tunes/server/test/explorers-media.integration.test.ts`, inside the existing `describe("private local media", …)` block and at top level within it — **not** nested inside another `it`.

```ts
for (const category of ["products", "people"] as const) {
  it(`${category} owner snapshots are publicly visible once published`, async () => {
    const owner = await persona();
    const handle = `m${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Media creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId, handle]);
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
    const uploaded = await upload(owner.cookie, png, "image/png", "recommendation");
    expect(uploaded.status).toBe(201);
    const id = uploaded.body.media.id as string;
    const url = `/api/explorers/v1/media/${id}/content`;
    const repository = new MediaRepository(pool);

    // Before attachment the asset is owner-only.
    expect(await repository.isPublicAttachment(id)).toBe(false);

    const entity = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Generic media fixture','manual') RETURNING id", [category === "products" ? "product" : "person"])).rows[0].id;
    if (category === "products") await pool.query("INSERT INTO product_entity_details(entity_id,product_url) VALUES($1,'https://example.invalid/product')", [entity]);
    else await pool.query("INSERT INTO person_entity_details(entity_id) VALUES($1)", [entity]);
    const collection = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Media list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `media-${randomUUID()}`])).rows[0].id;
    const recommendation = (await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,$2,$3,'published') RETURNING id", [owner.accountId, category, entity])).rows[0].id;
    await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,0)", [collection, recommendation, owner.accountId, category]);
    await pool.query("INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)", [recommendation, owner.accountId, id]);

    // The public projection must emit it, and the gate must admit it.
    if (category === "products") {
      const projection = await publicProductsProjection(pool, handle, 24);
      expect(projection?.productLists[0].recommended_products[0].images).toEqual([url]);
    } else {
      const projection = await publicPeopleProjection(pool, handle, 24);
      expect(projection?.personLists[0].recommended_people[0].Media).toEqual([{ documentId: id, url, alternativeText: null, caption: null }]);
    }
    expect(await repository.isPublicAttachment(id)).toBe(true);
    expect((await request(composed.app).get(url)).status).toBe(200);
  });
}
```

Add `publicProductsProjection` and `publicPeopleProjection` to the file's imports if absent.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media.integration.test.ts
```

Expected: FAIL — `images` is `null` / `Media` is undefined, and `isPublicAttachment` is `false`.

- [ ] **Step 3: Read owner media in the Products projection**

In `publicProductsProjection.ts`, inside `richProduct`, after the `const offer = await readProductOffer(...)` line:

```ts
 const uploads=(await db.query(`SELECT m.id FROM recommendation_media rm JOIN media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE rm.recommendation_id=$1 AND m.status='ready' ORDER BY rm.display_order,m.id LIMIT 21`,[row.id])).rows.map(m=>`/api/explorers/v1/media/${m.id}/content`);
 if(uploads.length>20)throw new Error('Public Product exceeds media read bound');
```

Then replace the `images` property:

```ts
 images:facts.imageUrls.length||uploads.length?[...facts.imageUrls,...uploads]:null,
```

`images` is an array of URL strings and the public consumer already renders it (`ProfileRecommendationsTab.tsx:163-168`), so nothing on the frontend changes. The `LIMIT 21` plus the `> 20` throw is the bound Books already uses (`publicBooksProjection.ts:23-24`) — it detects an over-bound row rather than silently truncating.

- [ ] **Step 4: Read owner media in the People projection**

In `publicPeopleProjection.ts`, inside `richPerson`, after the `const primary = ...` line:

```ts
 const uploads=(await db.query(`SELECT m.id,m.alternative_text,m.caption FROM recommendation_media rm JOIN media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE rm.recommendation_id=$1 AND m.status='ready' ORDER BY rm.display_order,m.id LIMIT 21`,[row.id])).rows.map(m=>({documentId:m.id,url:`/api/explorers/v1/media/${m.id}/content`,alternativeText:m.alternative_text,caption:m.caption}));
 if(uploads.length>20)throw new Error('Public Person exceeds media read bound');
```

Then add to the `person` object literal, immediately after the `avatar_url:facts.avatarUrl,` line:

```ts
 Media:uploads.length?uploads:null,
```

This is the Books `Media` shape, which `PersonOverview.tsx:340` already reads as `fetchedPerson?.Media?.[0]?.url`.

- [ ] **Step 5: Widen both gate arms together**

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

Both lists must change. The outer list alone leaves the generic arm refusing them; the inner list alone is unreachable.

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media.integration.test.ts
```

Expected: PASS, including the pre-existing apps/places cases.

- [ ] **Step 7: Confirm the byte-count bound still holds**

The People projection enforces a 4 MiB page bound (`publicPeopleProjection.ts:131`). Twenty media objects per person across twelve people per list is new payload. Run the People e2e lane and confirm no `Public People page exceeds read bound`:

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/contracts/
```

Expected: PASS. If the bound trips, reduce the per-person cap rather than raising the page bound.

- [ ] **Step 8: Commit**

```bash
git add tunes/server/publicProfile/publicProductsProjection.ts tunes/server/publicProfile/publicPeopleProjection.ts tunes/server/repositories/mediaRepository.ts tunes/server/test/explorers-media.integration.test.ts
git commit -m "feat(products,people): publish owner snapshot media and admit it at the gate"
```

---

## Task 4: Admit books, movies and games list covers

`git log -L 68,77:tunes/server/repositories/mediaRepository.ts` shows the cover arm's category list grew one ticket at a time — `('places','products','people')`, then `+'guides'`, then `+'apps'` — and these three were never appended. A public consumer already exists for all three (`publicBooksProjection.ts:62`, `publicMoviesProjection.ts:89`, `publicGamesProjection.ts:158`), so the gate is wrong, not the projections.

The existing fixture loop in `explorers-media.integration.test.ts` is specialised per typed table, so a new focused test is clearer than contorting it. The cover arm joins only account, settings, collection and `collection_media`, so it needs no recommendation or entity.

**Files:**
- Create: `tunes/server/test/explorers-media-cover.integration.test.ts`
- Modify: `tunes/server/repositories/mediaRepository.ts:74`

- [ ] **Step 1: Write the failing test**

```ts
import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MediaRepository } from "../repositories/mediaRepository";
import { createCanonicalApp } from "../canonicalApp";
import { config, persona, png, upload } from "./helpers/explorersMediaHarness";

let pool: pg.Pool, composed: ReturnType<typeof createCanonicalApp>;

describe("collection cover visibility", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  // Every category that can hold a cover must serve it. The list in the gate grew by
  // accretion, so this asserts parity rather than the current contents.
  for (const category of ["places", "guides", "movies", "books", "games", "apps", "products", "people"] as const) {
    it(`serves a published ${category} list cover`, async () => {
      const owner = await persona();
      await pool.query("UPDATE creator_accounts SET display_name='Cover creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId]);
      await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
      const collection = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Cover list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `cover-${randomUUID()}`])).rows[0].id;
      const cover = await upload(owner.cookie, png, "image/png", "collection");
      expect(cover.status).toBe(201);
      const id = cover.body.media.id as string;
      await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, id]);

      expect(await new MediaRepository(pool).isPublicAttachment(id)).toBe(true);
      expect((await request(composed.app).get(`/api/explorers/v1/media/${id}/content`)).status).toBe(200);

      // Unpublishing the list must withdraw the cover again.
      await pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1", [collection]);
      expect(await new MediaRepository(pool).isPublicAttachment(id)).toBe(false);
    });
  }
});
```

Import `config`, `persona`, `png` and `upload` from wherever `explorers-media.integration.test.ts` already obtains them; if they are declared inline in that file rather than in a shared harness, extract them to `tunes/server/test/helpers/explorersMediaHarness.ts` first and have both files import from it, so neither file owns a duplicate.

- [ ] **Step 2: Run it and confirm exactly three failures**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media-cover.integration.test.ts
```

Expected: `books`, `movies` and `games` FAIL with `expected false to be true`; the other five PASS.

- [ ] **Step 3: Add the three categories to the cover arm**

In `mediaRepository.ts:74`, replace:

```sql
        AND c.category IN ('apps','places','products','people','guides')
```

with:

```sql
        AND c.category IN ('apps','places','products','people','guides','books','movies','games')
```

- [ ] **Step 4: Run it and confirm all eight pass**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media-cover.integration.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add tunes/server/repositories/mediaRepository.ts tunes/server/test/explorers-media-cover.integration.test.ts
git commit -m "fix(media): serve books, movies and games list covers at the gate"
```

---

## Task 5: Require ready media on every cover join

Only Places (`publicPlacesProjection.ts:126`) and People (`publicPeopleProjection.ts:95,118`) check that a cover's media is `ready`. Elsewhere an `uploading` or `pending_delete` cover yields a URL that 404s.

**Files:**
- Modify: `tunes/server/publicProfile/publicAppsProjection.ts`, `publicBooksProjection.ts`, `publicMoviesProjection.ts`, `publicGamesProjection.ts`, `publicProductsProjection.ts`, `publicGuidesProjection.ts`
- Test: `tunes/server/test/explorers-media-cover.integration.test.ts`

- [ ] **Step 1: Locate every unguarded cover join**

```bash
cd tunes && grep -rn "collection_media cm" server/publicProfile/ | grep -v "status='ready'"
```

Expected: the join sites in the six projections above. Each looks like:

```sql
LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
```

- [ ] **Step 2: Add the failing assertion**

In `explorers-media-cover.integration.test.ts`, add inside the same `for` loop a second test:

```ts
    it(`omits an unready ${category} list cover`, async () => {
      const owner = await persona();
      await pool.query("UPDATE creator_accounts SET display_name='Cover creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId]);
      await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
      const collection = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Cover list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `cover-${randomUUID()}`])).rows[0].id;
      const cover = await upload(owner.cookie, png, "image/png", "collection");
      const id = cover.body.media.id as string;
      await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)", [collection, owner.accountId, id]);
      // Return the asset to a non-servable state behind the projection's back.
      await pool.query("UPDATE media_assets SET status='uploading' WHERE id=$1", [id]);
      expect(await coverUrlFor(pool, category, owner.accountId)).toBeNull();
    });
```

Add a helper in the same file that calls the category's projection and returns its first list's cover URL or `null`, so the assertion names one behaviour:

```ts
async function coverUrlFor(pool: pg.Pool, category: string, accountId: string): Promise<string | null> {
  const handle = (await pool.query("SELECT handle FROM creator_accounts WHERE id=$1", [accountId])).rows[0].handle as string;
  const projections: Record<string, () => Promise<any>> = {
    places: () => publicPlacesProjection(pool, handle, 24), guides: () => publicGuidesProjection(pool, handle, 24),
    movies: () => publicMoviesProjection(pool, handle, 24), books: () => publicBooksProjection(pool, handle, 24),
    games: () => publicGamesProjection(pool, handle, 24), apps: () => publicAppsProjection(pool, handle, 24),
    products: () => publicProductsProjection(pool, handle, 24), people: () => publicPeopleProjection(pool, handle, 24),
  };
  const result = await projections[category]();
  const lists = result?.recommendationLists ?? result?.guides ?? result?.movieLists ?? result?.bookLists
    ?? result?.gameLists ?? result?.appLists ?? result?.productLists ?? result?.personLists ?? [];
  return lists[0]?.cover_image?.url ?? lists[0]?.coverUrl ?? null;
}
```

Set each persona's handle in the first test so the helper can resolve it; if the harness does not already assign one, add the same `UPDATE creator_accounts SET handle=…` used in Task 3.

- [ ] **Step 3: Run and confirm six failures**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers-media-cover.integration.test.ts
```

Expected: the six unguarded categories FAIL by returning a URL; `places` and `people` PASS.

- [ ] **Step 4: Add the guard to each of the six**

Append to each cover join located in Step 1, matching the Places/People form exactly:

```sql
 AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
```

- [ ] **Step 5: Run the whole server contract suite**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/
```

Expected: PASS.

- [ ] **Step 6: Run the explorers-earth unit lane serially**

```bash
cd explorers-earth && npx vitest run --no-file-parallelism
```

Expected: PASS. This lane is the only gate that catches cross-ticket DTO-shape regressions.

- [ ] **Step 7: Commit**

```bash
git add tunes/server/publicProfile/ tunes/server/test/explorers-media-cover.integration.test.ts
git commit -m "fix(media): require ready media on every public cover join"
```

---

## Task 6: Route places creator uploads into the typed photo path

This is decision D-2. Places partitions uploads by origin: provider-origin ids go to `photoMediaIds` (typed, gated, projected) and creator-origin ids go to `mediaIds` (generic, publicly unreadable). Routing both into the typed path gives the same visible outcome with one fewer code path and no new gate surface. Verified safe: the place-photo guard trigger has no provider-only semantics.

**Files:**
- Modify: `explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts:325`
- Modify: `explorers-earth/src/features/Favorites/api/placesClient.ts:120,123,134,149,151`
- Test: `explorers-earth/src/features/Favorites/api/__tests__/placesViewModel.test.ts`

- [ ] **Step 1: Write the failing test**

In `placesViewModel.test.ts`, assert a creator-origin upload reaches the typed photo list:

```ts
it("sends creator-origin uploads as place photos", async () => {
  const attempt = { recommendationId: "rec", pending: [{ blob: new Blob([1]), fileName: "a.jpg", origin: "creator" as const }], mediaIds: [] as string[], photoMediaIds: [] as string[], attached: false };
  await persistCreatedRecommendationMedia(attempt);
  expect(attempt.photoMediaIds).toHaveLength(1);
  expect(attempt.mediaIds).toEqual([]);
});
```

Use the file's existing upload stub so `commands.upload` resolves to a fixed id.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd explorers-earth && npx vitest run src/features/Favorites/api/__tests__/placesViewModel.test.ts
```

Expected: FAIL — `photoMediaIds` is empty and `mediaIds` has one entry.

- [ ] **Step 3: Send every upload to the typed list**

In `useAddRecommendation.ts`, replace lines 324-325:

```ts
        if (media.origin === "provider") attempt.photoMediaIds.push(uploaded.id);
        else attempt.mediaIds.push(uploaded.id);
```

with:

```ts
        // Creator and provider uploads share the one typed, publicly projected photo path.
        attempt.photoMediaIds.push(uploaded.id);
```

The existing `updatePlace` call already caps the list with `attempt.photoMediaIds.slice(0, 10)`, matching the ten-slot bound the migration enforces.

- [ ] **Step 4: Drop the now-dead `mediaIds` leg from the places commands**

In `placesClient.ts`, remove `mediaIds` from the four command payloads at lines 120, 123, 134, 149 and 151. Leave `photoMediaIds` untouched. Do **not** remove `mediaIds` from the shared `explorersContract.ts` schema — books, movies, games, products and people all still use it.

- [ ] **Step 5: Run the places tests and the serial unit lane**

```bash
cd explorers-earth && npx vitest run src/features/Favorites/ && npx vitest run --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add explorers-earth/src/features/Favorites/
git commit -m "fix(places): route creator uploads into the typed public photo path"
```

---

## Task 7: Correct the Places projection comment

`publicPlacesProjection.ts:25-26` claims photos are "concatenated with the owner's own uploads exactly as PlaceOverview already concatenates them". The code never concatenates — `photos` comes solely from `readPlacePhotoMediaIds`. After Task 6 the claim is still wrong, because the concatenation happens at upload time, not read time.

**Files:**
- Modify: `tunes/server/publicProfile/publicPlacesProjection.ts:25-26`

- [ ] **Step 1: Replace the comment** with what the code now does:

```ts
 * Photos are owned media served through the media route, read solely from
 * recommendation_place_photos. Creator and provider uploads are merged at upload time
 * (useAddRecommendation routes both into photoMediaIds), so this read needs no union.
 * Note that media_details.imageDetails means recommendation_place_photos here and
 * recommendation_media on the owner side; the key is shared, the source is not.
```

- [ ] **Step 2: Commit**

```bash
git add tunes/server/publicProfile/publicPlacesProjection.ts
git commit -m "docs(places): describe the actual photo source and the shared key"
```

---

## Task 8: Stop anonymous visitors triggering an auth session fetch

The merge replaced a guarded `useQuery(musicEligibilityQuery, { skip: !isAuthenticated || !user?.documentId })` with an unconditional `useEffect(() => { void authClient.refresh(); }, [])`, and `authClient.refresh()` opens with `fetch("/api/auth/get-session")`. Every anonymous visitor to a public profile now fires an auth request — two under StrictMode in dev, one in production. It fails `profile-tabs` 18/18 on `deniedAuthority === 0`, and it is unnecessary load on the most cacheable pages.

**Do not** fix this by widening the harness allowlist in `explorers-earth/e2e/setup/profile-tab-hit-testing.ts`. The counter is the oracle.

**Files:**
- Modify: `explorers-earth/src/components/AuthSyncManager.tsx:24`
- Test: `explorers-earth/e2e/profile-tab-hit-testing.spec.ts` (existing, unchanged)

- [ ] **Step 1: Reproduce the failure**

```bash
cd explorers-earth && npx playwright test --config e2e/replatform/profile-tabs.playwright.config.ts
```

Expected: 18 failures, each `expect.soft(counters.deniedAuthority).toBe(0)` receiving `2`.

- [ ] **Step 2: Guard the refresh on a plausible session**

In `AuthSyncManager.tsx`, replace line 24:

```tsx
  useEffect(() => { void authClient.refresh(); }, []);
```

with:

```tsx
  // A public profile view is anonymous. Refreshing unconditionally put an auth request on
  // every cacheable public page, which is also what profile-tab hit testing counts.
  useEffect(() => { if (authClient.hasSessionHint()) void authClient.refresh(); }, []);
```

Then add `hasSessionHint` to the `authClient` object in `explorers-earth/src/lib/authClient.ts`:

```ts
  // Better Auth sets a client-readable session hint alongside its httpOnly cookie. Absent
  // hint means no session to refresh, so an anonymous visitor issues no auth request.
  hasSessionHint(): boolean {
    try { return document.cookie.split("; ").some(entry => entry.startsWith("explorers.session_hint=")); }
    catch { return false; }
  },
```

**Before implementing, verify the hint cookie's real name** by signing in locally and inspecting `document.cookie`:

```bash
cd tunes && grep -rn "session_hint\|cookiePrefix\|cookieName" server/auth.ts server/routes/musicIdentityRoutes.ts | head
```

If no client-readable hint cookie exists, fall back to gating on the already-available `isAuthenticated` value in this component — that restores the exact pre-merge semantics — and reference it in the dependency array.

- [ ] **Step 3: Confirm the lane passes**

```bash
cd explorers-earth && npx playwright test --config e2e/replatform/profile-tabs.playwright.config.ts
```

Expected: 18 passed.

- [ ] **Step 4: Confirm authenticated identity sync still works**

This component exists to reconcile Explorer identity with Music, so a regression here is worse than the test failure. Run the auth and lifecycle lanes:

```bash
cd explorers-earth && npx playwright test --config e2e/replatform/auth.playwright.config.ts
```

Expected: PASS, and a signed-in session still refreshes on mount.

- [ ] **Step 5: Commit**

```bash
git add explorers-earth/src/components/AuthSyncManager.tsx explorers-earth/src/lib/authClient.ts
git commit -m "fix(auth): do not refresh a session for anonymous public visitors"
```

---

## Out of scope

- Paste-a-link enrichment (Plan B).
- Unifying the two storage patterns (generic `recommendation_media` vs per-category typed tables). The typed tables exist where provider imports or slot ordering need their own semantics; collapsing them would need migrations and would change nothing a user sees.
- Production cutover — see `docs/replatform-audit/production-cutover-runbook.md`.
- `real-stack lifecycle` and `real-stack books`, neither of which has ever been green. **Triage `lifecycle` before executing this plan**: it failed because owner A's session refresh returned owner B's account id, and if that is a real cross-owner leak rather than harness reuse it outranks everything here.

## Self-review notes

- Every task changes projection and gate together where both are involved (Task 3), so no step leaves assets exposed without a consumer or URLs that 404.
- Task 4's test asserts parity across all eight categories rather than the current list contents, so the next category added cannot silently repeat the accretion bug.
- Task 8 deliberately leaves the guard mechanism to be confirmed against the real cookie name, with an explicit fallback that restores pre-merge semantics. That is a verification step, not a placeholder.
