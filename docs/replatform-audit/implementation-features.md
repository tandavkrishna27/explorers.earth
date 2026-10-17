# Category parity and acceptance implementation plan

## Current authority (2026-10-05)

Historical draft/review below preserves requirements, not current completion or execution order. Use the [current status](current-status-2026-10-05.md), [individual ticket plans](ticket-index.md) and [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Seven original tickets remain complete. Do not regenerate amended tickets from grouped drafts; the organizer now validates custody read-only. Proposed original paths/commands need current-source verification before implementation.


**Database authority:** [Consolidated target schema](target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute backlog Epics 4, 5 and 7 without changing the existing Explorers experience, while replacing its Strapi persistence with account-owned application operations.

**Architecture:** Reuse the application operations established in Epic 3 and the existing public gateway response shape. Category adapters translate canonical entities/recommendations into existing view models; presentation components are retained. Domain validation and authorization execute in the backend, never exclusively in browser hooks.

**Tech Stack:** Existing React/TypeScript/Vite frontend, Express/TypeScript backend, PostgreSQL/Drizzle, Vitest and Playwright.

**Spec:** [Agreed direction](revised-direction.md), [backlog](epics-and-tickets.md), [operation proposal](target-schema-and-migration.md), [verified Strapi structures](strapi-schema-inventory.json).

## Global constraints

Apply the [shared execution checklist](execution-checklist.md) to category and guide work. Map the changed API through owner, public, Settings/navigation and fixture consumers; exercise real typed payloads, blank optional values, stale revisions and complete affected frontend regressions.

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

Consume `tunes/shared/explorersContract.ts` from Epic 3 for `CategoryKey`, `Page<T>`, `ApiError`, `RevisionInput` and `RequestContext`. The trusted `Actor` is server-only in `tunes/server/application/actor.ts`, with user/account/role and the web-session or OAuth credential union defined in [the backend plan](implementation-backend.md). Owner operations mount under `/api/explorers/v1`; public routes remain `/api/explorers/v1/profiles/:username`. Do not define competing principal types or send Actor in browser payloads.

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

The [frontend feature gap review](frontend-feature-gap-review.md) is required acceptance input for tickets3.3,4.1–4.5,5.1–5.3 and7.1. Its findings extend, rather than replace, each ticket's tests. The authoritative schema resolves category-wide pins using separate Save and atomic upsert-order semantics; preserve the observed add→drag→close behavior.

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

## Epic 5 — Places and Guides

### 5.1 Places and taxonomy

**Depends on:** 3.1/3.2; implements the taxonomy contract in the shared interface table.

**Existing:** `explorers-earth/src/features/Favorites/api/query.ts`, `api/mutation.ts`, `hooks/useCreateLocation.ts`, `hooks/useAddRecommendation.ts`, `components/ListForm.tsx`, `RecommendForm.tsx`, `Recommendations.tsx`; `explorers-earth/src/features/PublicHome/components/PublicPlaceCard.tsx`.

**Create:** `tunes/server/explorers/categories/places.ts`; `explorers-earth/src/features/Favorites/api/explorersAdapter.ts`; `tunes/server/test/explorers/places.test.ts`, `places.integration.test.ts`; `explorers-earth/e2e/replatform/places.spec.ts`.

**Behavior contract:** A location list remains distinct from its place recommendations. Preserve provider Place ID, location data, category/subcategory, recommendation type, notes, website/social/contact fields, media and user/provider ratings. Make category/subcategory reusable despite legacy one-to-one Strapi declarations. Public contact disclosure follows explicit current policy, never a broad serialization of private owner fields.

- [ ] Add tests for reusable categories across two places, subcategory belonging to the chosen category, repeated provider identity with independent creator notes and omitted private contact fields.
- [ ] Map consumed `Place_Details` JSON fields to typed public/owner DTOs without dropping data used by cards and maps; fixtures include null coordinates and provider photo failure.
- [ ] Seed required category/subcategory rows idempotently; no invented production taxonomy values hidden in tests.
- [ ] Run common persistence/ownership cycle; run frontend units filtered to `src/features/Favorites`; backend commands with `places`.
- [ ] Run existing `locations.spec.ts` with general config and new `replatform/places.spec.ts` with real API config. UAT: create city/location list, add/edit place, taxonomy filters, media, contact visibility and reload persistence.
- [ ] Implement public claim lookup eligibility as the direct canonical query specified above. In `places.integration.test.ts`, publish one place through the recommendation operation and assert lookup finds it without a claim seed; hide its last public recommendation and assert lookup no longer finds it. Two recommendations by A contribute one distinct creator; a public B recommendation contributes a second.
- [ ] Assert lat/lng zero survives rather than becoming missing; absent coordinates remain null rather than fabricated `(0,0)`. Assign an unrelated subcategory and assert 422 with no association written. Run the real browser add/edit route variants (`/:listId/new`, `/:placeId/edit`) as well as category navigation.

**Acceptance gate:** taxonomy reuse, location aggregate distinction, direct public redaction and new-place lookup population are proven against persisted rows; maps fixture success alone is insufficient.

### 5.2 Maps, QR and linked lists

**Depends on:** 5.1, 4.4, 4.5, explicit attachment command/DTO in shared contract.

**Existing:** `explorers-earth/src/features/Favorites/components/AddLinkedProductsPage.tsx`, `AddLinkedPeoplePage.tsx`, `LinksAndQR.tsx`, `QRSticker.tsx`; `explorers-earth/src/features/PublicHome/components/MapView.tsx`, `PlaceMapView.tsx`; `explorers-earth/src/utils/qrCodeService.ts`, `src/hooks/useQRActions.tsx`.

**Create:** `tunes/server/test/explorers/placeLinks.integration.test.ts`; `explorers-earth/e2e/replatform/place-links.spec.ts`; extend 5.1 category module and the shared collection association repository, not a separate authorization service.

**Behavior contract:** Account-owned Product/People lists attach only to account-owned place/location context allowed by current UI. Public traversal rechecks profile, category, list and target visibility. QR output retains its existing canonical web destination and optional UTM behavior; scanned links resolve to the same page. Browser map presentation remains unchanged.

- [ ] Test cross-account attachment denial, private child under public parent, detach without deleting the child list, and account/category unpublish invalidating public linked results.
- [ ] Add link association persistence and adapt existing pages; preserve map loading/failure/retry and directions behavior.
- [ ] Add unit assertions on QR payload URL and encoding; inspect generated QR by decoding it in the test rather than merely asserting that an image exists.
- [ ] Run `npm --prefix explorers-earth run test:unit -- src/utils/__tests__/qrCodeService.replatform.test.ts` for the new QR assertions; a missing decoder dependency is added to dev/test dependencies only after verifying the installed QR library cannot decode.
- [ ] Run `npm --prefix tunes run test:integration -- server/test/explorers/placeLinks.integration.test.ts`; run new `replatform/place-links.spec.ts` with the real API config.
- [ ] UAT: attach/detach both list kinds, public map navigation and directions, QR scan/decode/open on mobile, then hide a linked list and verify direct/public nested access is denied. A real Maps smoke remains separate from fixture map UI evidence.
- [ ] Add the existing `recommendation_list: locationId` create path to Product/People `CreateCollectionInput` as `parentLocationCollectionId?:string`. The application create transaction validates the parent and links the new list atomically. Failed parent ownership or revision validation must leave no orphan child; consume the same core create operation, not another list creator.
- [ ] Preserve one location parent per linked child list. In `placeLinks.integration.test.ts`, attach a child to location A, try attaching it to location B and assert 409 with the original relation unchanged; explicit detach followed by attach is permitted. A bare individual place recommendation ID supplied as parent must fail 404/422, never create an accidental relation.
- [ ] Add `explorers-earth/src/utils/__tests__/qrCodeService.replatform.test.ts`: decode generated profile/location QR bytes, assert exact canonical route and supplied UTM parameters, and verify URL encoding for spaces/non-ASCII handles. Missing location coordinates must show the existing no-map state, not a map pin at zero.

**Acceptance gate:** create-linked-list from the current location route needs no place item, detach preserves list/content, private child is absent from nested public responses, and both QR payload and opened destination are verified.

### 5.3 Guides and sections

**Depends on:** 3.1/3.2 and 5.1; implements the guide section contract in the shared interface table.

**Existing:** `explorers-earth/src/features/Guides/api/queries.ts`, `api/mutations.ts`, `guideService.ts`, `types/index.ts`, `types/guideSectionTypes.ts`, `components/CreateGuidePage.tsx`, `GuideSectionForm.tsx`, `pages/GuideDetailsPage.tsx`, `GuideSectionFormPage.tsx`; `explorers-earth/src/features/PublicHome/components/PublicGuideDetailPage.tsx`.

**Create:** `tunes/server/explorers/categories/guides.ts`; `explorers-earth/src/features/Guides/api/explorersAdapter.ts`; `tunes/server/test/explorers/guides.test.ts`, `guides.integration.test.ts`; `explorers-earth/e2e/replatform/guides.spec.ts`.

**Behavior contract:** Guides are account-owned collections with ordered sections, not flattened ordinary item rows. Preserve guide type, multi-city flag, days, tags/tips, best time, media, budget/type and location/transport data. Sections preserve title/description/order, activities, map data, packing/pre-tasks, tags, timeline, transport, stay and budget. Version the block schema. Preserve morning/afternoon/evening places, travel modes and photo metadata from current TypeScript types.

- [ ] Add a deep round-trip fixture containing every consumed guide/section field and non-ASCII rich text; assert editing one section leaves all other blocks unchanged.
- [ ] Test atomic reorder, stale revision conflict, wrong-guide section ID, rejected invalid block version, and public pagination beyond initial section previews.
- [ ] Replace Strapi numeric upload IDs and bearer-token media calls in `guideService.ts` with Epic 3 media contracts. Upload replacement must succeed and link before retiring the old asset; simulate upload failure and assert the original remains visible.
- [ ] Implement adapters and retain the existing wizard/details/itinerary components. Do not turn unavailable AI services into an unplanned integration rebuild; distinguish any baseline broken assistive action from required manual guide creation.
- [ ] Run frontend units filtered to `src/features/Guides src/features/PublicHome`; backend commands with `guides`; run existing/new `guides.spec.ts` under their respective configs.
- [ ] UAT: create multi-day and multi-city guides, add/edit/reorder sections, exercise timeline/stay/transport/budget/tips, replace media, reload and compare, then publish/unpublish on desktop/mobile.
- [ ] Modify `explorers-earth/src/features/Guides/GuidesPage.tsx` for parent data/order/pin/archive wiring. Create parent fixture values for every `GuideCollectionDetails` field, save/reload and assert deep equality; after adding a section update only parent title and assert section count/content unchanged. Keep parent metadata through generic collection discriminated inputs.
- [ ] In `guides.integration.test.ts`, create sections S1/S2 at parent revision N, reorder at N and assert one transaction produces [S2,S1] and revision N+1; attempt an old-revision edit and assert 409 with both sections unchanged. Delete S2 and assert it cannot be fetched through owner/public normal views; archive the whole guide and assert all public children disappear while shared place entities remain.
- [ ] Add `api/__tests__/explorersAdapter.test.ts` for current string/object compatibility of `Place_Details`, categories and `Guide_Section_Details`. Do not stringify twice or coerce an invalid existing block to empty success. Replace an image with forced storage failure and assert the prior asset ID and served bytes still match; then retry successfully and verify new bytes after reload.

**Acceptance gate:** both parent and section payloads survive unchanged, each deletion scope is covered, and rich content cannot smuggle executable HTML through the public renderer. Add a malicious link/HTML fixture to the existing safe-rich-text test rather than introducing a different editor.

**Inline guide editor closure (5.3):** include `Guides/components/GuideDetails/EditStayModal.tsx`, `EditTipModal.tsx`, `BudgetTable.tsx`, `GuideHeader.tsx`, `EditJourneyRouteModal.tsx`, `TransportationTimeline.tsx`, `EditGeneralTipsModal.tsx`, and `TipsTagsTab.tsx` plus parent mutation callbacks. Read exact cases in the feature gap review.

- [ ] Map each micro-editor to the current-revision aggregate operation. For full-section replacement, assemble validated complete state; missing partial fields never become null. Test each editor save against the real API and verify untouched blocks remain deep-equal. A stale conflict preserves entered form data and keeps the modal open.
- [ ] Enforce publish-before-pin and atomic unpublish+unpin for Guides and Places collection pins. No inferred15 limit. Test guide type/category/days/month/budget/location/multicity filter combinations and stable pinned-first results after reload.

### 5.4 Existing claim flow

**Depends on:** Epic 2 Google identity, Epic 3 private media contract, 5.1; implements the claim contract in the shared interface table.

**Existing:** `explorers-earth/src/pages/ClaimAccount.tsx`, `src/features/Authentication/api/queries.ts`, `components/VerificationForm.tsx`, `components/PlaceProfileCard.tsx`; `explorers-earth/src/features/Favorites/services/claimablePlaceProfileService.ts`.

**Create:** `tunes/server/application/claims.ts`, `tunes/server/repositories/claimRepository.ts`, `tunes/server/routes/explorersClaimRoutes.ts`; `tunes/server/test/explorers/claims.test.ts`, `claims.integration.test.ts`; `explorers-earth/e2e/replatform/claims.spec.ts`.

**Behavior contract:** Retain search/profile-details/evidence-submission flow, including no-match/error states. Submission is pending evidence, not verified ownership; no membership or account ownership change results. Evidence must not become publicly accessible. Replace the current first-result guess with the explicit ambiguous-target validation error defined below; phone/address lookup is not identity verification. Do not add an admin review UI.

- [ ] Define bounded lookup fields/results and authorization/rate limits with the identity owner; no endpoint returns arbitrary private claimant information.
- [ ] Test no match, multiple candidates, duplicate submission/retry, private evidence ownership and upload failure; assert memberships remain unchanged after successful submission.
- [ ] Implement pending submission persistence and adapt the current form through shared auth/media clients.
- [ ] Run frontend units filtered to `src/features/Favorites/__tests__/claimablePlaceProfileService`; backend commands with `claims`; run new `replatform/claims.spec.ts`.
- [ ] UAT: fixture claimable place, submit evidence, confirm existing success state; verify another account and anonymous browser cannot retrieve evidence. Multiple matches must use the existing error presentation and request more precise search input.
- [ ] Use `tunes/server/application/claims.ts` as the sole command service. Implement persistence in `tunes/server/repositories/claimRepository.ts` and an append-only claim/evidence migration in this ticket; mount `tunes/server/routes/explorersClaimRoutes.ts` from `routes/index.ts`.
- [ ] Pin lookup outcomes: no phone/address→422; zero candidates→200 empty array; one→200 single candidate; multiple after fallback→422 `AMBIGUOUS_CLAIM_TARGET`. Return only public name/address/id. Neither private owner contact nor another claimant's evidence appears. A claim submitted with anonymous authority is 401; wrong-owner media is 404; same idempotency key/body returns the same pending ID and one row; changed body→409.
- [ ] In real browser acceptance create/publish a place first, then use the current search/details/verification route. Assert successful pending receipt does not change membership count, `Is_Claimed` semantics or account permissions. Fetch the evidence byte URL as anonymous and B and assert 404 even when the place is public; owner A can retrieve its evidence.

**Acceptance gate:** an empty fresh deployment acquires eligible lookup data through normal Places use; no fixture-only directory or implicit ownership grant is needed.

## Epic 7 — Complete cross-category experience

### 7.1 Public navigation and profile parity

**Depends on:** Epics 4–6; all nine categories have real persisted fixtures.

**Existing:** `explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts`, `usePublicProfileShell.ts`, `usePublicRecommendationCategory.ts`, `usePublicProfileDetail.ts`, `usePublicPagedResource.ts`, `publicProfilePagination.ts`, `publicProfileInvalidation.ts`; `explorers-earth/src/routes/PublicRoutes.tsx`; `tunes/server/publicProfile/publicProfileService.ts`, `publicProfileContract.ts`, `publicProfilePolicy.ts`; `tunes/server/routes/explorersPublicProfileRoutes.ts`.

**Create:** `tunes/server/test/explorers/publicVisibility.integration.test.ts`; `explorers-earth/e2e/replatform/public-parity.spec.ts`. Modify existing gateway backend implementation to use shared operations while retaining public route/response compatibility.

**Behavior contract:** Default profile visibility stays public; category flags stay off until enabled. Keep pinned navigation, auto-pinning, top picks, category themes, canonical handles/slugs, deep links and desktop/mobile shells. Every page and nested result applies visibility; unpublished data must not survive in cached responses after a revision change.

- [ ] Seed more than 24 nested items and more than one category/list page; assert complete traversal without duplicates or omissions, including guide sections.
- [ ] Add a table-driven public matrix for profile/category/list/item visibility, owner/other-owner/anonymous modes and Music public/unlisted/revoked semantics from Epic 6.
- [ ] Test ETag invalidation, client cache reuse after logout/account change, same slug under two accounts, reserved handle protection and canonical URL resolution.
- [ ] Run `npm --prefix explorers-earth run test:unit -- src/features/PublicHome`; `npm --prefix tunes run test -- server/test/publicProfile`; `npm --prefix tunes run test:integration -- server/test/explorers/publicVisibility.integration.test.ts`.
- [ ] Run existing public-shell/category-navigation suites using their existing dedicated configs and new `replatform/public-parity.spec.ts`. UAT navigates every category on desktop/mobile, including keyboard/focus and long-name overflow cases; compare to Epic 1 baseline screenshots without blanket snapshot replacement.
- [ ] Include `explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts` in modified files: admit only the controlled same-origin media-content route alongside explicitly retained approved provider imagery; do not introduce a generic URL proxy. Test allowed uploaded image/video rendering, arbitrary remote URL rejection and retained video Range delivery through the media owner's contract.
- [ ] In `publicVisibility.integration.test.ts`, create 53 items with duplicate order values and assert cursor traversal returns exactly 53 unique IDs in deterministic order; change account/category visibility between pages and assert the continuation cannot disclose now-hidden rows. Revalidate a cached ETag after unpublish and assert response is denial/new safe state, never 304 carrying old private data.
- [ ] Pin route checks: `/:username`, all nine category routes, list slugs, genre/subject/sector routes, guide detail and Music shared capability route. Same list slug on two accounts resolves to its own owner; missing/private/archived detail has the same public unavailable response. Upload URL bytes fetched after hiding the only public attachment must be denied independently of the page cache.

**Acceptance gate:** complete traversal, nested policies, cached fetches and actual media bytes obey the same publication boundary. Owner preview visibility is not evidence of anonymous publication.

**Public-shell compatibility additions (source review):** include `routes/validators/TabVisibilityGuard.tsx`, `UsernameRootRedirect.tsx`, `layouts/PublicColdEntryBoundary.tsx`, `layouts/publicShellReadiness.ts`, `features/music/PublicMusicAvailabilityProvider.tsx`, and `features/PublicHome/api/publicProfileInvalidation.ts` in 7.1 scope.

- [ ] Map canonical boolean category settings into the existing compatibility `Yes`/`No` flags where retained guards consume them; test every flag including `public_movie` alias. Do not pass booleans into a guard that treats unknown values as hidden. Keep the profile-root fallback separate to prevent redirect loops.
- [ ] Test public cold entry on nested routes, invalid username, terminal API failure, rapid username A→B navigation and back/forward. A late A response must not reveal A content in B's shell; every terminal state releases the loading overlay.
- [ ] Preserve the existing account-scoped publish/unpublish/content invalidation transport across tabs. After confirmed unpublish, direct-category access remains hidden while refresh fails or returns stale data. Deduplicate repeated events; wrong-account events do not invalidate another profile. Preserve supported attribution query parameters through fallback redirects.

### 7.2 Analytics and platform content

**Depends on:** 3.4 analytics event storage, all categories, Epic 2 settings; implements the reference-content contract in the shared interface table.

**Existing:** `explorers-earth/src/services/analyticsService.ts`, `explorersAnalyticsClient.ts`; `src/features/Analytics/api/queries.ts`, `components/AnalyticsDashboard.tsx`, `utils/analyticsDateRange.ts`; `src/features/LandingPage/api/queries.ts`, `hooks/useFaqs.ts`, `hooks/usePlatformTerms.ts`; `src/features/Settings/api/mutation.ts`, `components/ProfileAccountSettings.tsx`; `tunes/server/routes/explorersAnalyticsRoutes.ts`, `services/explorers-analytics-service.ts`, `services/explorers-analytics-adapters.ts`.

**Create:** `tunes/server/test/explorers/analyticsParity.integration.test.ts`, `referenceContent.test.ts`; `explorers-earth/e2e/replatform/analytics-content.spec.ts`. Extend Epic 1 seed mechanism and Epic 3 analytics store, not another event writer.

**Behavior contract:** Consent denial sends no analytics; owner visits and retry dedupe follow established policy. Counts/date ranges/traffic-source and category breakdowns reflect persisted events; failures never display as successful zero totals. FAQ/terms/category values are seed content, not inferable from schemas. Deletion feedback is an authenticated write from 2.4 and must be covered in settings regression. Preserve current language behavior; no new authoring interface. Remaining settings use canonical account ownership; Google-only auth and deferred billing exclusions remain explicit.

- [ ] Fixture events across date boundaries, categories and two accounts; assert dashboard aggregates equal fixture expectations and never include the other account.
- [ ] Test no consent, duplicate event ID with same/different payload, hidden/invalid target, date-range validation and backend outage states.
- [ ] Inventory retained content/settings calls against the source inventory; add reviewed seeds and wire reads/settings to shared services. Missing real reference values remain a named acceptance blocker, never silently replaced by invented legal copy.
- [ ] Run frontend units filtered to `src/features/Analytics src/services/__tests__/analyticsService src/services/__tests__/explorersAnalyticsClient src/features/Settings`; backend integration command with `analyticsParity.integration.test.ts` and unit command with `referenceContent.test.ts`.
- [ ] Run existing `analytics.spec.ts`, `marketing-pages.spec.ts` with the general config and new `replatform/analytics-content.spec.ts`. UAT toggles consent, generates public interactions, checks dashboard ranges/counts, opens legal/help content and changes retained settings.
- [ ] Create `tunes/server/application/referenceContent.ts`, `tunes/server/routes/explorersReferenceRoutes.ts`, and typed reference-content schema/seed entries using the existing seed mechanism. Modify `explorers-earth/src/pages/Terms.tsx`, `Privacy.tsx`, `Cookies.tsx` only if their existing `usePlatformTerms` output mapping cannot stay unchanged. The hook combines distinct terms/privacy/cookies bodies; it must never return terms as all three documents. FAQ uses question/answer/sequence presentation.
- [ ] In `referenceContent.test.ts`, seed distinct sentinels in each legal body and two locales, assert correct kind and requested locale, explicit seed-manifest fallback for missing locale, and FAQ numeric sequence order. Locale change invalidates the previous content request/cache. Missing required legal copy is a blocked acceptance input, not a fabricated default.
- [ ] In `analyticsParity.integration.test.ts`, seed exactly three accepted A events and two B events in range plus one A event outside range; query A and assert count three, then replay one accepted event and assert count remains three. Denied consent and invalid/private targets add zero rows. Backend error must surface error state, never count zero. Browser acceptance advances through deletion feedback to assert the canonical 2.4 write replaces the old Strapi dependency.

**Acceptance gate:** dashboard numbers reconcile to a known event ledger, privacy/cookies/terms remain distinct, settings use canonical operations and every remaining active reference-content call has an assigned replacement.

### 7.3 All-category regression and milestone evidence

**Grooming focus:** the complete affected frontend suite and each package's clean isolated install/build/test are required before review. Any claimed baseline failure needs the same check reproduced on the base commit. Define real-API fixtures before dependent acceptance and keep mocked UI, provider simulation and hosted gates distinct in the report.

**Depends on:** 7.1/7.2 and all preceding functional gates; consumes, rather than replaces, per-ticket tests.

**Existing:** all category E2E specs, dedicated public/theme/Music configs, package scripts and CI jobs qualified by Epic 1. **Create:** `docs/replatform/evidence/milestone-2.md` during execution; the evidence document contains actual run results, not prefilled PASS entries.

- [ ] Run the complete frontend unit suite, backend unit suite and applicable disposable-database integration suite using existing package scripts; preserve required coverage gates or replace obsolete paths with equivalent behavioral coverage in the same change.
- [ ] Run all new real API scenarios using `npm run platform:test:e2e -- --suite all --milestone 2 --project desktop-chromium --environment local`; run retained Music full-stack/capability suites through the commands pinned by Epic 6.
- [ ] Run applicable baseline presentation suites, keyboard/accessibility checks and desktop/mobile visual comparisons. Fail on unexpected required scenario skips; record baseline defects separately.
- [ ] On QA, exercise Google login and each external provider with nonproduction configuration. Record provider quotas/outages as blocked checks, not successful fixture tests.
- [ ] Drive all nine categories and profile/settings/analytics/claim flows in the browser. Record expected versus actual behavior, screenshots/traces where useful, environment and exact tested commit; no claim of owner sign-off.
- [ ] Capture a network log proving retained runtime flows no longer require Strapi. Separately verify environment-neutral canonical URL output from static generation; the inspected generator has no established live Strapi fetch. Categorize remaining traffic rather than blocking all external catalog/CDN calls indiscriminately.
- [ ] Run branch CI at the tested checkpoint and link its results. Publish milestone report with delivered scope, local automated results, browser acceptance, QA/provider checks, remote CI, defects, blocked cases and optional owner reproduction steps.
- [ ] Gate Milestone 2 on all required category/ownership/privacy scenarios passing. Do not start destructive retirement work merely because mock UI tests pass.
- [ ] Repeat the milestone-2 wrapper with `--project mobile-chromium`, then both projects with `--environment qa`. Record exact discovered/executed/passed/failed/skipped scenario counts; fail the milestone for a required scenario that is absent from discovery, skipped or retried into an unexplained pass.
- [ ] Attach a nine-row category coverage table to the milestone report: owner create/edit/item-delete/list-delete, order/pin, publish/hide, anonymous detail, B denial, media byte check, desktop/mobile and real-provider result. Guides add parent/section round-trip and deletion; Music refers to its distinct owner/guest/socket/publication cases rather than generic collection semantics.

**Acceptance gate:** the route matrix from 1.1 reconciles one-to-one with executed scenarios or explicit agreed exclusions; optional owner testing is not a prerequisite, but required technical checks cannot be waived by silence.

## Self-review outcome and remaining grooming decisions

Coverage accounts for five remaining catalog categories, Places, Guides, claim flow, cross-category public behavior, analytics and reference content. Books, identity/media foundations and Music are consumed from their owning epics. No new product features are added.

All twelve ticket sections now identify their consumed/produced contracts, concrete assertion cases, real API/browser acceptance and completion gates. No new product decision is required by these feature tickets. Actual provider availability, local/QA credentials, reference-data values and legal text are execution readiness inputs, not facts established by this plan. The real-stack wrapper and shared principal/media contracts remain hard prerequisites from their owning tickets. A field-level compatibility matrix from the existing frontend DTOs and saved Strapi schema is produced during implementation; schemas alone cannot supply reference rows or prove live provider behavior. Existing mocked scraper/AI tests must not be mistaken for active backend capabilities or used as justification to revive retired services.

All commands were verified against package scripts/configuration by inspection; no implementation tests or acceptance runs occurred during this planning task.

**Auth qualification update:** [Pinned Better Auth schema and local probe results](auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.
