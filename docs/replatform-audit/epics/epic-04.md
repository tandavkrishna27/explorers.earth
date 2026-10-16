# Epic 4: Catalog category parity

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [4.1](../tickets/ticket-4-1.md) | partial | Preserve Movies 24; separate missing provider/whole-ticket qualification from accepted manual owner/public flow. |
| [4.2](../tickets/ticket-4-2.md) | partial | Preserve committed manual Games 46ee; package G-provider owns IGDB, search and taxonomy parity with explicit provider access. |
| [4.3](../tickets/ticket-4-3.md) | ready after shared handoff | Package Apps: typed price tiers/platforms/screenshots and manual fallback, production adapter, persisted owner/public browser cases. Coordinate shared DTO/routes with root. |
| [4.4](../tickets/ticket-4-4.md) | ready after shared handoff | Package Products: exact decimal/currency/null contracts and independent recommendation ownership; production adapter and persisted browser cases. Can pair with Apps. |
| [4.5](../tickets/ticket-4-5.md) | ready after shared handoff | Package People: preserve alias/profile/social metadata and explicit ownership; same-name and login-handle negatives. Can pair with Places after capacity opens. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

## Independent review correction (2026-10-05)

**Epic verdict: INCOMPLETE.** Unchanged. No exit criterion is relaxed and nothing below is a pass claim.

**2 of 6 producers exist.** Counting the category producers this epic is responsible for, verified path-by-path at `225d83e5`: Movies and Games have delivered manual slices; **Apps, Products and People have none of their five mandated files each — 15 of 15 absent** — and their live consumers are still Apollo/Strapi GraphQL (`features/AppsAndTools/api/query.ts:1,6`, `features/Products/api/query.ts:1,6`, `features/People/api/query.ts:1,6`). The sixth producer in the epic's declared set, Places (5.1), is owned by Epic 5 and is also unstarted. That record of Apps/Products/People as incomplete with live Apollo consumers is correct and is preserved exactly as it stands.

| Ticket | Corrected disposition | Correction that changes how the row reads |
|---|---|---|
| 4.1 | BOUNDED-SLICE | **24 identities verified** (12 `test(` × 2 projects), committed. The two cases named at `ticket-4-1.md:39` — `movie_and_tv_same_id_remain_distinct`, `creator_note_does_not_mutate_catalog_or_other_creator` — **do not exist by name anywhere in source**, and the adapter test covers 3 of the required field cases, so per-assertion traceability is owed. Live TMDB qualification open. |
| 4.2 | INCOMPLETE | Manual slice real (**20 identities**, 10 × 2) and browser-credential retirement delivered. But **the provider is dead code**: `tunes/server/application/catalog.ts:35` throws unconditionally and `:41` does the same for provider-games, while a complete IGDB/Twitch implementation in `services/gameCatalog.ts` and `gameProviderTransport.ts` has **no production call site**. `tunes/shared` has **no `game_entity_details` table in any of the 38 migrations**, so `GameProviderFacts` cannot round-trip. Four named provider cases absent by name; `VITE_IGDB_*` still declared as build inputs at `explorers-earth/e2e/general.vite.config.ts:25-26`. |
| 4.3 | NOT-STARTED | All five mandated files missing. Owes a **contract + migration + storage**, not just a UI adapter — plus the shared fixtures module (below). |
| 4.4 | NOT-STARTED | All five mandated files missing. Owes a **contract + migration + storage**. |
| 4.5 | NOT-STARTED | All five mandated files missing. Owes a **contract + migration + storage**. |

**The legacy category fields are currently unrepresentable, so 4.3–4.5 are backend tickets, not adapter tickets.** Manual resolve accepts `{title}` only — `resolveManualEntitySchema` at `tunes/shared/explorersContract.ts:87` has `details:z.object({title:displayTitleWriteSchema}).strict()` — and `tunes/server/application/publicContent.ts:34` **rejects any display-override key other than `title`** for every category except books and movies. There is therefore no typed storage and no write path for `app_url` / `price_tier` (`Free|Freemium|Paid|Subscription|null`), `product_url` / `price` / `currency`, or person `name` / `primary_platform` / `social_urls`. Each of 4.3, 4.4 and 4.5 owes a shared-contract extension, an append-only migration, a storage implementation and a public display-override allowlist entry before its adapter and its round-trip assertions can exist. The dispositions "ready after shared handoff" in the table above must be read with that scope: the handoff they await is a typed-storage producer, not only the 3.1/3.2 interface.

**The mandated shared fixtures module does not exist.** `epic-04.md:71` of this file requires `explorers-earth/e2e/replatform/fixtures.ts` to export `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context, with the Authentication owner defining it rather than category tickets. **The file DOES NOT EXIST**, and all six existing lanes (`auth`, `profile`, `books`, `lifecycle`, `movies`, `games`) roll **bespoke setup** instead — which is why no two lanes share an identity model and why the foreign-owner and suspended-owner negatives are not uniformly available.

- [ ] **Creating `explorers-earth/e2e/replatform/fixtures.ts` is folded into the first category package, 4.3**, with the exact surface named at `:71`. 4.4, 4.5 and later lanes consume it instead of re-deriving sign-in. Folding the file in does not transfer authority over the identity model away from the Authentication owner, must not add a publicly mounted test-login endpoint, and must not weaken the contained-test network restrictions to make a new suite pass.

**Count discipline.** The committed `explorers-earth/e2e/replatform/suite-manifest.json` totals **82 identities across six lanes**: auth 6 + profile 2 + books 20 + lifecycle 10 + movies 24 + games 20. The **Games lane is 20** and the **Movies lane is 24**. "Canonical 82" is the whole suite; presenting it as a Games figure overstates that lane 4×, and it must never be counted as Games while its Books-20 and Movies-24 components are counted separately elsewhere.

**Preserved honesty.** No `test.skip`, `describe.skip`, `.todo` or conditional skip exists anywhere in `explorers-earth/e2e/replatform/`. Nothing in this correction implies Apps, Products or People is started, or that any lane is attested beyond its committed, local owned-fixture receipt.

# Category parity and acceptance implementation plan

**Database authority:** [Consolidated target schema](../target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute backlog Epics 4, 5 and 7 without changing the existing Explorers experience, while replacing its Strapi persistence with account-owned application operations.

**Architecture:** Reuse the application operations established in Epic 3 and the existing public gateway response shape. Category adapters translate canonical entities/recommendations into existing view models; presentation components are retained. Domain validation and authorization execute in the backend, never exclusively in browser hooks.

**Tech Stack:** Existing React/TypeScript/Vite frontend, Express/TypeScript backend, PostgreSQL/Drizzle, Vitest and Playwright.

**Spec:** [Agreed direction](../revised-direction.md), [backlog](../epics-and-tickets.md), [operation proposal](../target-schema-and-migration.md), [verified Strapi structures](../strapi-schema-inventory.json).

## Global constraints

Apply the [shared execution checklist](../execution-checklist.md) to category and guide work. Map the changed API through owner, public, Settings/navigation and fixture consumers; exercise real typed payloads, blank optional values, stale revisions and complete affected frontend regressions.

- Planning only. No application code, database, deployment or executable test changes are made by this document.
- One integration branch; small commits by ticket; milestone reports rather than routine owner approvals.
- Fresh database; repeatable reference fixtures, no historical import or credential migration.
- Keep all nine categories and current screens/layout/navigation. Google-only authentication is the agreed UI exception.
- No following/community, new admin interface, monetization, or revival of intentionally retired scraping/AI/payment services.
- Creator accounts own content. A recommended person is not a login user; a shared entity is not an account-owned recommendation.
- Before deleting old files, Epic 8 checks callers and scripts. Category tickets replace their active wiring but do not opportunistically remove unrelated code.

## Source and command baseline

Inspected source is Explorers commit `79ef17d0b88c7e11b49d618fc7c888a513f29fa8` and the saved Strapi schema snapshot at `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`. Existing paths below were checked locally. New paths are explicitly marked **create**; no listed tests have been run for this planning task.

Existing commands, from the repository root:

```powershell
npm --prefix explorers-earth run test:unit -- src/features/Movies
npm --prefix explorers-earth run test:e2e -- --config=playwright.general-e2e.config.ts movies.spec.ts
npm --prefix tunes run test -- server/test/explorers/movies.test.ts
npm --prefix tunes run test:integration -- server/test/explorers/movies.integration.test.ts
```

The first two scripts exist; the last two scripts exist but the example test files are proposed by this plan. Substitute the explicit test names below. Existing general Playwright tests use mocked authentication and intercepted GraphQL; passing them proves UI behavior, **not** new database persistence or real Google login. Retain them as fast presentation checks and add full-stack tests separately.

Epic 1 must provide `explorers-earth/playwright.replatform.config.ts` and safe seeded local/QA runners. The **proposed** command for the real API tests is:

```powershell
npm --prefix explorers-earth run test:e2e -- --config=playwright.replatform.config.ts replatform/movies.spec.ts
```

Run the root **proposed** wrapper `npm run platform:test:e2e -- --suite movies --project desktop-chromium --environment local`; it provisions the attested local API/database and invokes that configuration. The direct command above documents the underlying process only; local/CI/QA acceptance must enter through the wrapper. Other category suite names are `games`, `apps`, `products`, `people`, `places`, `guides`, and `platform`; `places` includes place-links/claims, `platform` includes public-parity/analytics-content. `platform` and `all` additionally require `--milestone 2` for this plan so later retirement tests are not silently skipped. The same wrapper supports the QA environment under Epic 1's safety rules.

The configuration must use the real local API and disposable PostgreSQL, not intercept application requests. Only catalog-provider responses may be fixture-controlled; real-provider smoke tests are separately reported. `explorers-earth/e2e/replatform/fixtures.ts` exports `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context. Its identity test factory creates real sessions in-process; there is no publicly mounted test-login endpoint. Authentication owner defines that fixture, not category tickets. Never weaken the existing contained test network restrictions to make a new suite pass.

## Shared interface and prerequisite gate

Consume `tunes/shared/explorersContract.ts` from Epic 3 for `CategoryKey`, `Page<T>`, `ApiError`, `RevisionInput` and `RequestContext`. The trusted `Actor` is server-only in `tunes/server/application/actor.ts`, with user/account/role and the web-session or OAuth credential union defined in [the backend plan](../implementation-backend.md). Owner operations mount under `/api/explorers/v1`; public routes remain `/api/explorers/v1/profiles/:username`. Do not define competing principal types or send Actor in browser payloads.

Reuse the operations from Epic 3: `resolveEntity`, `createRecommendation`, `updateRecommendation`, `archiveRecommendation`, `createCollection`, `updateCollection`, `archiveCollection`, `reorderCollection`, `getCollection`, `getCreatorProfile`, `listCreatorRecommendations` and `getCreatorAnalytics`. Profile writes use Epic 2 `updateAccount`; this supersedes the older illustrative `updateProfile` name. Public reads use the shared public authorization contract, not a fabricated owner Actor. A category ticket must not invent a second endpoint vocabulary or copy business logic into its adapter.

The earlier proposal omitted guide sections, linked lists and claims. The following **proposed contract additions** are owned by these tickets, with shared DTOs/validators added to `tunes/shared/explorersContract.ts`. They extend rather than replace Epic 3 operations. Route adapters mount under the shared prefix; body account IDs cannot select ownership.

| Owner | Proposed service signature and route | Contract |
|---|---|---|
| 5.1 | `listTaxonomy(input: {category: CategoryKey; parentId?: string}): Promise<TaxonomyDto[]>`, GET `/taxonomy` | `TaxonomyDto {id,category,parentId:string|null,label,slug}`; bounded seeded hierarchy, no mutation endpoint |
| 5.2 | `setLocationLinkedCollections(actor: Actor, placeCollectionId: string, input: RevisionInput & {productCollectionIds:string[];peopleCollectionIds:string[]}, context: RequestContext): Promise<CollectionDto>`, PUT `/collections/:id/linked-collections` | Parent is the Places/location list, not an individual place recommendation. Exact replacement set; same owner, parent category places and correct child categories; association write and parent revision bump in one transaction |
| 5.3 | `createGuideSection(actor: Actor, guideId: string, input: GuideSectionInput & RevisionInput, context: RequestContext): Promise<GuideSectionDto>`, POST `/collections/:id/sections` | Input expectedRevision is parent guide revision; child creation bumps it |
| 5.3 | `updateGuideSection(actor: Actor, guideId: string, sectionId: string, input: GuideSectionInput & RevisionInput, context: RequestContext): Promise<GuideSectionDto>`, PUT `/collections/:id/sections/:sectionId` | Full validated editable section replacement; expectedRevision is parent revision |
| 5.3 | `archiveGuideSection(actor: Actor, guideId: string, sectionId: string, input: RevisionInput, context: RequestContext): Promise<void>`, DELETE `/collections/:id/sections/:sectionId` | Soft archive; same guide/owner check; parent revision bump |
| 5.3 | `reorderGuideSections(actor: Actor, guideId: string, input: RevisionInput & {orderedSectionIds:string[]}, context: RequestContext): Promise<CollectionDto>`, POST `/collections/:id/sections/reorder` | Exact active child set, atomic positions; parent revision check |
| 5.4 | `findClaimablePlaces(input: {phone?:string;address?:string}): Promise<ClaimablePlaceDto[]>`, POST `/claims/lookup` | Exact normalized phone lookup then address fallback; rate-limited; max 10 public place candidates; response only id/name/public address; no private owner/claimant data |
| 5.4 | `submitClaim(actor: Actor, input: {placeId:string;name:string;email:string;phone:string;message:string;evidenceMediaIds:string[]}, context: RequestContext): Promise<{id:string;status:'pending'}>`, POST `/claims` | Google-authenticated claimant; name 2–50 characters, required valid email and phone, message 10–500 characters, at least one owned private evidence asset (PDF/DOC/DOCX/JPEG/PNG, each at most 5 MiB); idempotent; no membership change |
| 7.2 | `getReferenceContent(input: {kind:'faq'|'terms'|'privacy'|'cookies';locale:string}): Promise<ReferenceContentDto[]>`, GET `/reference-content/:kind` | `ReferenceContentDto {id,kind,locale,title,body,order}`; FAQ body is validated plain answer text, legal body is validated rich-text value. Separate terms/privacy/cookie records preserve the three bodies consumed by `usePlatformTerms`. Fallback locale is explicit in seed manifest. Deletion reasons are freeform writes owned by ticket 2.4, not reference rows |

Create `tunes/server/application/places.ts` for taxonomy/attachments, `guides.ts` for section commands, `claims.ts` for claim commands and `referenceContent.ts` for reference reads. Category modules named below own mapping/validation; they do not become an alternate service layer.

**Final grooming additions:** consume Epic 3 `archiveCollection` for list and whole-guide deletion as well as `archiveRecommendation` for item removal. Location-list deletion detaches independent People/Product lists rather than deleting them. Add separate list-delete and item-delete cases in every category E2E. Consume Epic 3 `resolveEntity` provider/manual union and account-owned `displayOverrides`; category edits must not change another creator's title/cover/product-offer context.

**Guide parent contract (5.3):** add `GuideCollectionDetails` to `tunes/shared/guideContract.ts`, extending `category:'guides'` collection create/update/DTO with `guideType`, nullable `estimatedBudget: {amount: string|null; currency: string|null}` (decimal amount; preserve both source fields), `budgetType`, `isMulticity`, nullable `numberOfDays`, `tags`, validated `tips`, `placeDetails`, `transportation`, `bestTimeToVisit`, `guideCategories`, owned `mediaIds` and versioned `sectionDetails`. Port supported nested shapes from current guide types/wizard rather than inventing new fields. Persist through existing `createCollection`/`updateCollection`; keep order/pin/visibility outside arbitrary JSON. Include `GuidesPage.tsx` for parent order/archive. Test every parent field after save/reload, then edit parent after adding a section and confirm children survive.

**Empty-database claim population (5.1/5.4):** derive claim lookup directly from canonical place entities with approved public provider contact/address data and at least one currently public eligible recommendation; do not create a second asynchronously stale claim directory. Private creator contact notes are never searchable. Count distinct public recommending accounts. E2E must create/publish a place through the UI, look it up without a pre-seeded claim record, and submit a pending claim; private-only place lookup must fail. This supplies the current flow without new admin UI or automatic ownership.

`GuideSectionInput` contains `title:string`, `description:RichTextValue|null`, `blockSchemaVersion:1`, and `blocks:{timeline:TimelineData|null;transport:TransportData|null;stay:StayData|null;activities:ActivityData|null;budget:BudgetData|null;mapDetails:JsonValue;packingList:JsonValue;preTasks:JsonValue;tags:string[]}`, plus `mediaIds:string[]`. Port `TimelineData`, `TransportData`, `StayData`, `ActivityData`, `BudgetData` and nested types field-for-field from `explorers-earth/src/features/Guides/types/guideSectionTypes.ts` into a shared `tunes/shared/guideContract.ts`; frontend imports compatibility aliases, backend never imports React code. Replace the photo `documentId` field at the adapter with canonical owned media ID. `RichTextValue` is the core validated editor document; bounded recursive `JsonValue` is used only for existing map/packing/pre-task blocks whose source fields are JSON. Validators enforce depth/size limits and preserve supported source block shapes; arbitrary JSON is never used for ownership/visibility/order. `GuideSectionDto` adds `id`, `guideId`, `position`, and `guideRevision` to that input.

Claim ambiguity is resolved by requiring exactly one lookup match for the current single-card flow; multiple candidates return a recoverable validation error asking for a more precise address. The UI keeps its existing error treatment. Requiring Google login for submission is covered by the agreed auth change, not a new ownership-verification feature.

### Mandatory frontend interaction closure

The [frontend feature gap review](../frontend-feature-gap-review.md) is required acceptance input for tickets3.3,4.1–4.5,5.1–5.3 and7.1. Its findings extend, rather than replace, each ticket's tests. The authoritative schema resolves category-wide pins using separate Save and atomic upsert-order semantics; preserve the observed add→drag→close behavior.

- [ ] All six catalog managers consume category-wide pin operations and revision, not reorderCollection. Exercise cross-list order, staged unpin/cancel, Save, max15 selection and mixed add/drag behavior against the real API.
- [ ] Aggregate owner views load all required continuation pages before computing filters/counts or whole-set writes; assert27 lists and53 children, second-page failure and stale-account cancellation.
- [ ] Tickets4.3–4.5 replace URL/social-URL dedup heuristics with canonical recommendation identity in helper callsites. Same URL with distinct records stays independently editable; repeated transport copies of one record collapse. This follows the agreed distinct-manual-entity model and corrects that legacy edge, without redesigning cards.
- [ ] Preserve one-shot publish prompts and router state: empty-list creation does not prompt, first add prompts once after load, dismiss/back/refresh does not loop, list publish does not publish its category. Preserve linked Product/Person Save/Back return paths and direct-entry fallback.

### Common category transaction and test cycle

Each 4.x ticket applies this checklist in addition to its specific cases:

- [ ] Add a failing server contract test proving a second account cannot read or mutate owner-only content by replacing an ID.
- [ ] Add a failing database integration test for create/edit/archive, list ownership, independent notes on a shared entity, and atomic ordering/revision conflict.
- [ ] Extend the canonical typed validator/mapper and repository using Epic 3 operations; persist provider facts separately from editorial note/rating/pins.
- [ ] Replace Apollo data/auth wiring at the listed screens with the shared client and category mapper, retaining loading/error/empty states and presentation.
- [ ] Run targeted unit and database tests; passing means all assertions execute without skipped required cases.
- [ ] Update/run existing mocked UI scenarios and the new full-stack scenario; reload a saved item to prove persistence, publish it, check anonymously, hide it, and check again anonymously.
- [ ] Exercise the same scenario by browser control on desktop and mobile; retain expected/actual outcome, commit/environment and screenshots/traces for failures. Record real provider checks separately.
- [ ] Commit the ticket and affected tests together. At meaningful checkpoints run branch CI; do not claim remote success from local results.

**Assertion-level common contract:** in each new `<category>.integration.test.ts`, `owner_isolation` creates an A-owned list/item, attempts GET/PATCH/DELETE as B and asserts 404 and unchanged persisted revision/count; anonymous owner-route requests assert 401. `stale_write_is_atomic` saves revision N+1, retries N and asserts 409 with no note/order/media change. `create_retry_is_single_write` repeats one idempotency key/body and asserts identical IDs and one database row, then changes the body with that key and asserts 409. `archive_collection_preserves_shared_entity` asserts archived list/detail are absent publicly, B's recommendation survives and the canonical entity still exists. Test item archive separately from list archive. Provider/catalog unit stubs never substitute for these database assertions.

**Adapter boundary:** each Epic 4 `api/explorersAdapter.ts` exports `to<Category>List(dto: CollectionDto)` and `toRecommended<Category>(dto: RecommendationDto)` returning the existing feature types, with category-specific names `Movie`, `Game`, `App`, `Product`, `Person`. These are pure mappings; requests use `explorersApiClient`, not a second fetch/auth implementation. Add `api/__tests__/explorersAdapter.test.ts` per category. Assert all current queried fields map, null stays null, canonical IDs only become `documentId` at the compatibility edge, and shared source metadata plus creator `displayOverrides` produce the expected view model. Category backend modules extend shared validators/repository dispatch without bypassing application authorization. The Guide adapter exports `toGuide(dto: CollectionDto): Guide` and `toGuideSection(dto: GuideSectionDto): GuideSection` using the existing guide types and the same rules.

**Full-stack completion check:** every category spec creates through the existing screen, asserts the successful API response ID, opens a fresh browser context using the same real session fixture, and sees the saved values after navigation/reload. A separate anonymous context verifies publish/hide behavior and controlled uploaded-media delivery. Required desktop and mobile runs use the root wrapper with the exact category suite; no application `/api` requests may be fulfilled by browser mocks. Every ticket runs its named database and adapter files, not merely the pre-existing frontend directory filter.

## Review focus

1. Provider IDs collide across types: movie/TV identity test in 4.1; URLs/names alone must not silently merge entities in 4.3–4.5.
2. Nested private content leaks through a public parent or pagination/cache: 5.2 and 7.1 explicitly test it.
3. Partial saves lose rich guide blocks or media: 5.3 tests deep round-trip and failed replacement preservation.
4. Mocked UI passes while persistence/auth is broken: every category adds real API/database E2E; 7.3 reports the layers separately.
5. An empty dataset hides missing seeds or truncation: 5.1/7.2 seed required reference data and 7.1 uses pages larger than preview caps.


## Epic 4 — Remaining catalog categories

### 4.1 Movies & Shows

**Depends on:** 3.1–3.3, including a passing Books slice. **Produces:** movie/TV entity detail mapping and unchanged owner/public flows through the shared operations.

**Existing files:** `explorers-earth/src/features/Movies/api/query.ts`, `api/mutation.ts`, `types/index.ts`, `hooks/useTMDBSearch.ts`, `components/dashboard/AddMoviePage.tsx`, `MovieListView.tsx`, `MoviesHome.tsx`, `TopPicksManager.tsx`, `components/public/PublicMovies.tsx`, `PublicMovieList.tsx`, `PublicMovieGenre.tsx`, `MovieDetailModal.tsx`; `explorers-earth/src/services/tmdbService.ts`.

**Create:** `tunes/server/explorers/categories/movies.ts`; `explorers-earth/src/features/Movies/api/explorersAdapter.ts`; `tunes/server/test/explorers/movies.test.ts`, `movies.integration.test.ts`; `explorers-earth/e2e/replatform/movies.spec.ts`. Extend the Epic 3 schema/operations in their owned files rather than a parallel schema.

**Behavior contract:** `(provider, media_type, tmdb_id)` identifies a screen work; equal numeric movie/TV IDs are different entities. Preserve title/original title, year, posters/backdrop, genres, director/runtime, rating, overview, season count, cast and watch-provider metadata. Creator rating, rich note, media, pin/order and list membership remain account-owned. Preserve genre routes and publish prompts.

**Provider interface:** extend `tunes/server/routes/explorersCatalogRoutes.ts` from 3.2 with GET `/catalog/movies?query=...&mediaType=movie|tv&cursor=...`; omitted mediaType searches both kinds. Create `tunes/server/services/movieCatalog.ts` with `searchMovies(actor:Actor,input:{query:string;mediaType?:'movie'|'tv';cursor?:string}):Promise<Page<MovieCatalogCandidate>>`. Candidate carries `provider:'tmdb'`, `externalKind:'movie'|'tv'`, `externalId:string` and typed display metadata; resolve/persist via `resolveEntity`. Bound trimmed query to 1–200 characters and page size to 24. Browser TMDB service becomes a client mapper; no server catalog credential is added to Vite. Full-detail/watch-provider enrichment belongs to the same provider service with the same verified media kind.

- [ ] Add `movie_and_tv_same_id_remain_distinct`, asserting two entities and independent collections; add `creator_note_does_not_mutate_catalog_or_other_creator`.
- [ ] Map every consumed movie field to the new DTO and existing view model; make nullable provider fields explicit rather than defaulting unknown values to zero.
- [ ] Run the common category cycle; add provider timeout, missing poster and stale edit conflict cases.
- [ ] Run `npm --prefix explorers-earth run test:unit -- src/features/Movies src/services/__tests__/tmdbService`; run the backend commands above with `movies`.
- [ ] Run existing `movies.spec.ts` with the general config and new `replatform/movies.spec.ts` with the proposed real API config. UAT: movie plus TV, list rename, edit notes, pin/reorder, detail modal, genre navigation and private/public toggles on desktop/mobile.
- [ ] In `movies.integration.test.ts`, resolve fixture movie ID 42 and TV ID 42; assert different canonical IDs, preserved `media_type` and season count only where supplied. A updates title/note/rating while B recommends the same movie: assert B's effective title/note/rating and the entity source remain unchanged. Add malformed provider metadata→recoverable error with no recommendation row.
- [ ] In `api/__tests__/explorersAdapter.test.ts`, assert runtime zero versus null, no fabricated year, and watch-provider/cast arrays preserved. In the real browser spec, pin two items, reorder them, reload and assert exact card order; remove one item and separately remove its list, verifying public direct URLs return unavailable.

**Acceptance gate:** common category assertions plus movie/TV disambiguation, genre/list public navigation and both deletion scopes pass. Provider timeout preserves entered creator notes and offers the existing retry/error state.

### 4.2 Games

**Depends on:** Epic 3 shared contracts; can follow 4.1 sequentially without new infrastructure. **Produces:** Games data mapper and server-owned provider access.

**Existing:** `explorers-earth/src/features/Games/api/query.ts`, `api/mutation.ts`, `components/dashboard/AddGamePage.tsx`, `GameListView.tsx`, `GamesHome.tsx`, `components/public/PublicGames.tsx`, `PublicGamesGenre.tsx`, `PublicGamesList.tsx`; `explorers-earth/src/services/igdbService.ts`, `src/types/igdbTypes.ts`.

**Create:** `tunes/server/explorers/categories/games.ts`, `tunes/server/explorers/providers/igdb.ts`; `explorers-earth/src/features/Games/api/explorersAdapter.ts`; `tunes/server/test/explorers/games.test.ts`, `games.integration.test.ts`; `explorers-earth/e2e/replatform/games.spec.ts`.

**Behavior contract:** Retain IGDB ID, source URLs/image IDs, platforms, genres, release information, modes, developer/publisher and media. Browser requests bounded catalog searches; server owns Twitch credentials/token refresh. Existing `VITE_IGDB_CLIENT_SECRET` usage must disappear from runtime browser code and build inputs. Missing credentials must produce a truthful unavailable state, never a fabricated successful catalog response.

**Provider interface:** extend `explorersCatalogRoutes.ts` with GET `/catalog/games?query=...&cursor=...`; `tunes/server/explorers/providers/igdb.ts` exports `searchGames(actor:Actor,input:{query:string;cursor?:string}):Promise<Page<GameCatalogCandidate>>`, sharing Epic 3 catalog error/candidate conventions. Candidate carries `provider:'igdb'`, `externalKind:'game'`, `externalId:string` and mapped metadata. Query length 1–200 and page size 24; server constructs IGDB queries rather than accepting caller query syntax. Resolve through the canonical `resolveEntity` provider registry, extending its allowlist in this ticket.

- [ ] Add tests `provider_credentials_never_enter_browser_dto`, `token_refresh_is_shared_under_concurrency`, `provider_429_is_recoverable`, and `platforms_and_genres_round_trip`.
- [ ] Replace client-side token acquisition through the Epic 3 catalog boundary; coordinate removal of corresponding workflow/build secret injection in the same ticket.
- [ ] Execute the common cycle, then scan built JavaScript/source maps for the old secret variable and a nonsecret sentinel used in the test build. No real secret needs to be printed or logged.
- [ ] Run frontend unit tests filtered to `src/features/Games src/services/__tests__/igdbService`; backend commands with `games`; existing/new `games.spec.ts` via the respective configs.
- [ ] UAT: search, select, create list, edit rating, filter platform/genre, reorder, anonymous detail, provider failure. QA real IGDB lookup is reported separately from fixture lookup.
- [ ] In `games.test.ts`, run ten concurrent catalog requests with an expired server token and assert exactly one refresh; provider 429 produces the shared rate-limit/upstream error rather than empty success. In `games.integration.test.ts`, save two platform/genre values, reload, and assert both survive without converting provider rating into creator rating.
- [ ] In the real Games browser spec, fail the provider after typing a note, assert the draft remains, recover provider lookup and save once. Fetch uploaded cover bytes as owner/public after publication and assert another-owner attach is rejected. Run `npm --prefix explorers-earth run test:unit -- src/features/Games/api/__tests__/explorersAdapter.test.ts` in addition to existing units.

**Acceptance gate:** search→resolve→save→public view works; client build contains no IGDB credential input or server token; fixtures and actual QA provider smoke are reported separately.

### 4.3 Apps & Tools

**Depends on:** Epic 3. **Produces:** app entities and independent account recommendations using existing cards/forms.

**Existing:** `explorers-earth/src/features/AppsAndTools/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `components/dashboard/AddAppPage.tsx`, `AppListView.tsx`, `AppsHome.tsx`, `components/public/PublicApps.tsx`, `PublicAppList.tsx`, `AppDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/apps.ts`; `explorers-earth/src/features/AppsAndTools/api/explorersAdapter.ts`; `tunes/server/test/explorers/apps.test.ts`, `apps.integration.test.ts`; `explorers-earth/e2e/replatform/apps.spec.ts`.

**Behavior contract:** Preserve `app_url`, developer/platforms, screenshots, download URL and the exact price-tier choices `Free`, `Freemium`, `Paid`, `Subscription`, or null. This is descriptive app metadata, not a billing feature. Similar URLs or names do not establish entity identity. Preserve manual entry when enrichment is unavailable; do not revive retired scraper endpoints.

- [ ] Test `price_tier_and_platforms_round_trip`, `similar_urls_are_not_auto_merged`, `unsafe_outbound_scheme_is_rejected`, and retained manual fallback after enrichment failure.
- [ ] Implement adapter and common cycle, including modal keyboard focus/accessibility and returning from add/edit to the correct list.
- [ ] Run frontend unit tests filtered to `src/features/AppsAndTools`; backend commands with `apps`; existing/new `apps.spec.ts` with their configs.
- [ ] UAT: manually add app, edit note, upload/replace media, top picks, publish/unpublish and public modal on both viewport sizes.
- [ ] Parameterize `apps.integration.test.ts` over `Free`, `Freemium`, `Paid`, `Subscription`, null; assert exact saved tier and no payment/subscription record. Create manual apps with similar normalized URLs under separate commands and assert distinct entities; retry a single command and assert one entity.
- [ ] In the adapter test and browser spec, round-trip platforms/screenshots/download URL, restore focus to the originating card after modal close, and preserve draft text when enrichment is unavailable. Test keyboard activation and escape in the actual retained modal. Execute the new adapter test file explicitly.

**Acceptance gate:** manual Apps flow is fully persisted, existing list return navigation works after add/edit, and tier metadata does not require any retired billing endpoint.

### 4.4 Products

**Depends on:** Epic 3. **Produces:** product detail/offer representation and existing recommendation UX; attachment contract consumed in 5.2.

**Existing:** `explorers-earth/src/features/Products/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `utils/productHelpers.ts`, `components/dashboard/AddProductPage.tsx`, `ProductListView.tsx`, `ProductsHome.tsx`, `components/public/PublicProducts.tsx`, `PublicProductList.tsx`, `ProductDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/products.ts`; `explorers-earth/src/features/Products/api/explorersAdapter.ts`; `tunes/server/test/explorers/products.test.ts`, `products.integration.test.ts`; `explorers-earth/e2e/replatform/products.spec.ts`.

**Behavior contract:** Product/merchant URL, brand, image/specification data, price and currency round-trip. Persist money using the Epic 3 exact-decimal contract; zero is a valid amount, null is unknown, and unknown currency stays unknown. UI formatting and supported price sorts remain stable. This ticket does not implement purchase, affiliate attribution or subscriptions.

- [ ] Test zero versus null, decimal round-trip, missing currency and foreign-owner list assignment; assert similar merchant products are not silently merged.
- [ ] Connect existing price guard/manual form behavior to shared operations and execute the common cycle.
- [ ] Run frontend unit tests filtered to `src/features/Products`; backend commands with `products`; existing/new `products.spec.ts` with their configs.
- [ ] UAT: save zero-price and unknown-price products, edit currency, sort, open external link, upload imagery and publish/unpublish. Keep working manual entry when retired enrichment returns unavailable.
- [ ] In `products.integration.test.ts`, persist prices `"0.00"`, `"19.90"` and null with explicit currency/null; assert wire and stored exact decimal values, never floating sums or invented currency. A's changed recorded offer/title must not change B's recommendation of the same entity. Invalid negative amount and unsupported precision fail validation without a partial write.
- [ ] In `api/__tests__/explorersAdapter.test.ts`, assert conversions used by the current numeric UI preserve zero/null distinctions; in the browser spec assert sort by supported price modes matches the baseline comparator, no unrequested exchange-rate conversion, and unsafe external URL schemes cannot render executable links. Empty currency remains unknown after reload even if the current select offers a default on a new form.

**Acceptance gate:** numeric presentation retains current behavior while the API preserves exact values. Zero-price visibility bugs found in the existing UI are recorded as baseline defects; do not redesign formatting silently to satisfy a new snapshot.

### 4.5 People

**Depends on:** Epic 3. **Produces:** recommended-person records and existing list/public/sector flows; attachment contract consumed in 5.2.

**Existing:** `explorers-earth/src/features/People/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `utils/personHelpers.ts`, `components/dashboard/AddPersonPage.tsx`, `PersonListView.tsx`, `PeopleHome.tsx`, `components/public/PublicPeople.tsx`, `PublicPersonList.tsx`, `PublicPersonSector.tsx`, `PersonDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/people.ts`; `explorers-earth/src/features/People/api/explorersAdapter.ts`; `tunes/server/test/explorers/people.test.ts`, `people.integration.test.ts`; `explorers-earth/e2e/replatform/people.spec.ts`.

**Behavior contract:** Preserve name/handle, headline, location, avatar/media, social URLs/platform, skills/tags and sector/category. Preserve existing aliases (`full_name`, `profile_url`, `platform`, etc.) at the adapter edge until consuming components no longer need them. External follower-count metadata may remain; no Explorers follower relationships are created. Matching an account handle confers no ownership or login linkage.

- [ ] Test `same_name_people_remain_distinct`, `matching_login_handle_grants_no_authority`, and social/alias round-trip with optional fields absent.
- [ ] Implement mapper and common cycle, retaining keyboard navigation/focus behavior from the existing accessibility test.
- [ ] Run frontend unit tests filtered to `src/features/People`; backend commands with `people`; existing/new `people.spec.ts` with their configs.
- [ ] UAT: create/edit person manually, external profiles, sector browse, custom order/top picks and private/public views; enrichment failure must not erase a manual draft.
- [ ] In `people.integration.test.ts`, create two “Alex Lee” records without authoritative matching identifiers; assert distinct IDs. Set one handle equal to owner B's account handle and assert no membership or account link is created. Explicitly assert A's person data edit cannot change B's recommendation.
- [ ] In `api/__tests__/explorersAdapter.test.ts`, compare canonical and compatibility aliases, including `twitter`/`x` presentation normalization, missing avatar fallback and sector names. In the browser spec enter external social URLs and tags manually, save/reload, open/close detail by keyboard, and confirm the sector route lists only visible records.

**Acceptance gate:** recommended people remain data rather than identities, and external follower-count presentation creates no follower-network persistence or API dependency.


## Individual ticket files

- [Ticket 4.1: Movies & Shows](../tickets/ticket-4-1.md)
- [Ticket 4.2: Games](../tickets/ticket-4-2.md)
- [Ticket 4.3: Apps & Tools](../tickets/ticket-4-3.md)
- [Ticket 4.4: Products](../tickets/ticket-4-4.md)
- [Ticket 4.5: People](../tickets/ticket-4-5.md)

## Evidence-based grooming supplement

Apply [category delivery learnings and parallel work](../category-delivery-learnings.md) before each category delta review. Games preparation can run alongside Movies acceptance. Apps/Products/People readiness follows their declared Epic3 prerequisites; shared registry/schema/navigation/fixture mutations remain serialized. This is scheduling guidance, not a completion or release claim.
