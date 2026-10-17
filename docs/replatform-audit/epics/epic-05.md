# Epic 5: Places and Guides

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [5.1](../tickets/ticket-5-1.md) | ready after shared handoff | Package Places: typed coordinates including zero/null, location-list distinction, taxonomy and private contact redaction; publish and persisted real-backend qualification. |
| [5.2](../tickets/ticket-5-2.md) | waiting | Freeze attachment DTOs first; then qualify map, QR and location links without inventing provider success. |
| [5.3](../tickets/ticket-5-3.md) | waiting | Prepare section field map now; implement versioned Guide aggregate and atomic order/archive/media race behavior after Places contract. |
| [5.4](../tickets/ticket-5-4.md) | waiting | Implement current claim/evidence eligibility only; no new administrator or implicit ownership grant. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

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

**Places suite selection correction (2026-10-05).** The grouped `places` alias above is a *full-milestone discovery* set, not a qualification selector. It must never be used to qualify [5.1](../tickets/ticket-5-1.md), because it pulls `place-links.spec.ts` (owned by [5.2](../tickets/ticket-5-2.md)) and `claims.spec.ts` (owned by [5.4](../tickets/ticket-5-4.md)) — neither of which exists in source at `225d83e5`. 5.1 qualifies against the reviewed, guarded PLACES-CORE selection defined at `ticket-5-1.md:48-50`; 5.2 and 5.4 qualify against their own. All three remain mandatory in full milestone discovery: nothing is removed, skipped or relabelled optional, and no required positive may be dropped to let core qualify. The same grouped selection appears at `epic-01.md:159`, which another owner must correct before 5.1 qualification.

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

**Correction (2026-10-05) — "the exact category suite" means the reviewed per-package selection, not the grouped alias.** For Places, the grouped `places` alias defined above spans three tickets, so using it as a per-ticket selector would require 5.1 to run 5.2's `place-links.spec.ts` and 5.4's `claims.spec.ts`. Each ticket's desktop and mobile runs use its own reviewed, guarded discovery; the grouped alias is reserved for full-milestone discovery, where all three packages are mandatory. Desktop *and* mobile remain required per package — this correction narrows which specs a package selects, never how many projects it runs.

## Review focus

1. Provider IDs collide across types: movie/TV identity test in 4.1; URLs/names alone must not silently merge entities in 4.3–4.5.
2. Nested private content leaks through a public parent or pagination/cache: 5.2 and 7.1 explicitly test it.
3. Partial saves lose rich guide blocks or media: 5.3 tests deep round-trip and failed replacement preservation.
4. Mocked UI passes while persistence/auth is broken: every category adds real API/database E2E; 7.3 reports the layers separately.
5. An empty dataset hides missing seeds or truncation: 5.1/7.2 seed required reference data and 7.1 uses pages larger than preview caps.


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


## Independent review verification (2026-10-05)

Epic 5 is **NOT-STARTED**. Measured against source at `225d83e5`; the four `:14`–`:17` dispositions stand.

**Negative evidence for all four tickets.** No `tunes/server/explorers/categories/places.ts` and no `guides.ts` (that directory holds only `movies.ts` and `movieGenreSeeds.ts`); no `explorersAdapter.ts` for Favorites or Guides (only Games and Movies have one); no category tests (`places.test.ts`, `places.integration.test.ts`, `guides.test.ts`, `guides.integration.test.ts`, `placeLinks.integration.test.ts`, `claims.test.ts`, `claims.integration.test.ts`) and no specs (`places.spec.ts`, `guides.spec.ts`, `place-links.spec.ts`, `claims.spec.ts`); `createCollectionSchema` at `tunes/shared/explorersContract.ts:60-62` is `.strict()` with no parent fields and `parentLocationCollectionId`/`parentExpectedRevision` have zero repository hits; no Guide or guide-section aggregate anywhere in `tunes/shared`; no claim service, repository, routes or migration.

**Guides is schema-unreachable, not merely unimplemented.** `tunes/migrations/0029_explorers_recommendations.sql:25` admits `'guides'` for `collections`, but `:40` (`recommendations`) and `:51` (`collection_items`) omit it, so a guides recommendation row is **rejected by the database**. [Ticket 5.3](../tickets/ticket-5-3.md) therefore owes a new append-only migration — next id `0039`, chain head `0038_explorers_movie_media.sql` — adding `'guides'` to both CHECK constraints, with chain/manifest/checksum updates and a migration test. Any reasoning of the form "the `guides` enum is present, therefore the category is covered" was wrong: it read `0029:25` and not `0029:40`/`0029:51`.

**Two structural ownership gaps.** [5.2](../tickets/ticket-5-2.md) owns `parentExpectedRevision`, atomic create-and-link and idempotent receipts, but the shared core create extension it requires is coordinator-reserved and in no writer's allowlist — its owner is currently **unallocated**, and a 5.2 writer may not self-grant the shared contract. [5.4](../tickets/ticket-5-4.md)'s whole legacy claim surface (`claimable-place-profile`, `verify-claim`, `account.Is_Claimable`) has no canonical equivalent, so `explorers-earth/src/pages/ClaimAccount.tsx` is unserved after Strapi retirement and the invariant "a pending claim must not grant ownership" has nowhere to be enforced.

**Places suite selection.** The two gate lines measured as `:68` and `:130` at `225d83e5` are corrected above so that 5.1's qualification no longer requires 5.2/5.4 artifacts: the suite-alias line is still `:68` with its correction at `:70`, and the full-stack completion check has shifted to `:132` with its correction at `:134`. `epic-01.md:159` carries the same grouped selection and is owned by another agent.

## Individual ticket files

- [Ticket 5.1: Places and taxonomy](../tickets/ticket-5-1.md)
- [Ticket 5.2: Maps, QR and linked lists](../tickets/ticket-5-2.md)
- [Ticket 5.3: Guides and sections](../tickets/ticket-5-3.md)
- [Ticket 5.4: Existing claim flow](../tickets/ticket-5-4.md)
