# Epic 7: Cross-category completion

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [7.1](../tickets/ticket-7-1.md) | partial / full parity waiting | Package N-shared review proceeds now using existing producer contracts; N-full requires all nine categories, privacy/public media, pins and cold-entry positives. Full-ticket dependencies do not block the shared slice. |
| [7.2](../tickets/ticket-7-2.md) | split preparation ready | Package A-dashboard can prepare session-authority conversion now; A-reference inventories actual legal/localized inputs independently. A-full category totals waits for producers. Preserve consent/dedupe/UTC bounds. |
| [7.3](../tickets/ticket-7-3.md) | waiting | Run full retained regression only after reviewed producers; preserve required red positives and publish exact-source evidence, not fixture aggregates. |

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

**Auth qualification update:** [Pinned Better Auth schema and local probe results](../auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.

## Independent review verification (2026-10-05)

Epic 7 is **INCOMPLETE**. Measured against source at `225d83e5`; per-ticket detail lives in [7.1](../tickets/ticket-7-1.md), [7.2](../tickets/ticket-7-2.md) and [7.3](../tickets/ticket-7-3.md). The `:14`–`:16` dispositions stand.

Five measured facts set the epic's state:

1. **One uncommitted shared slice against roughly nine ticket-level gates.** The canonical navigation/settings slice exists only in the uncommitted working-tree overlay, and that overlay was reviewed **REVISE**: `explorers-earth/e2e/setup/category-navigation.ts:407` throws `legacy navigation GraphQL denied` for `SettingsAccount`/`PublicCategoryListCounts`/`CheckPublishedLists`/`UpdateTabVisibility`, while unmodified `explorers-earth/e2e/category-navigation-a.spec.ts:478` and `explorers-earth/e2e/music-publish-controls.spec.ts:85,139,149,265,320,427` still assert exactly those operations. Uncommitted work is not delivered scope and must not be recorded as a receipt.

2. **3 of 9 public categories.** `tunes/server/publicProfile/postgresPublicProfileGateway.ts:58` dispatches only `games`, `movies` and `books`; places, guides, music, apps, products and people fall through to `{ items: [], nextCursor: null }`, and `:61` returns `undefined` for their details. An all-category 7.1 pass would read "category empty" rather than "unimplemented", so 7.1 now owes an explicit typed unsupported-category error until each producer lands.

3. **The analytics dashboard is unmigrated and structurally dead.** `explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx:38,66-68,85` reads `usersPermissionsUser(documentId)`→`accounts`, `:211` gates on `token` and `:232` sends it; `explorers-earth/src/services/explorersAnalyticsClient.ts:176,197` require and send a Bearer — while canonical auth sets `token: null` (`explorers-earth/src/store/store.ts:76`). Its 3.4 producer input **is** landed and mounted, so the blocker is the frontend consumer.

4. **No reference content.** `tunes/server/application/referenceContent.ts`, `tunes/server/routes/explorersReferenceRoutes.ts` and reference-content seeds do not exist. Legacy `faq` and `platform-term` are i18n-localized with no canonical per-field locale equivalent; missing real legal and localized copy is a blocked acceptance input, never invented seed text.

5. **No milestone evidence.** `docs/replatform/evidence/milestone-2.md` does not exist, and 7.3's mandated wrapper flags (`--suite all --milestone 2 --project desktop-chromium --environment local`) are not accepted by `scripts/replatform-e2e.mjs:47-48`, which takes exactly `--milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt <fresh owned temp dir>` over a fixed six-lane set. Weakening that runner guard to satisfy the documented spelling is forbidden.

Also open: the P0 subject conflation behind the first failure of all three red Explorers lanes — `explorers-earth/src/store/store.ts:76-77` places the canonical account UUID in `user.documentId`, and `explorers-earth/src/features/navigation/categoryNavigationApi.ts:7-9` and `:86` feed it into `usersPermissionsUser(documentId:)` and `updateAccount(documentId:)`. And the public media boundary at `explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts:35-38,59` still admits the Strapi origin and any S3 host, so hiding an attachment does not deny its bytes.

Nothing above weakens an exit criterion. The epic remains INCOMPLETE.

## Individual ticket files

- [Ticket 7.1: Public navigation and profile parity](../tickets/ticket-7-1.md)
- [Ticket 7.2: Analytics and platform content](../tickets/ticket-7-2.md)
- [Ticket 7.3: All-category regression and milestone evidence](../tickets/ticket-7-3.md)
