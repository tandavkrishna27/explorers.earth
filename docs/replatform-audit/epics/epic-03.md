# Epic 3: Recommendation core and Books

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [3.1](../tickets/ticket-3-1.md) | partial | Reuse reviewed core packages; inventory outstanding scale and downstream obligations. Technical producer readiness does not wait for complete 2.4 socket closure. |
| [3.2](../tickets/ticket-3-2.md) | partial | Reuse media/catalog contracts; qualify remaining live storage/provider cases separately from delivered Books media. |
| [3.3](../tickets/ticket-3-3.md) | partial | Preserve canonical Books 20; reconcile outstanding original requirements and external obligations without rebuilding owner/public slice. |
| [3.4](../tickets/ticket-3-4.md) | partial | Preserve event foundation and canonical 10; inventory unexecuted consent/privacy/consumer obligations. Dashboard UI belongs to 7.2. |
| [3.5](../tickets/ticket-3-5.md) | open | Package Q1: artifact and readiness preparation now. Q2: selected milestone acceptance and required hosted gates. Q3: actual QA only after separate deployment decision; retain provider limitations. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

## Independent review correction (2026-10-05)

**Epic verdict: INCOMPLETE.** Unchanged. Nothing below is a pass claim, and no exit criterion is relaxed.

**Disposition alignment with the corrected ticket files.** Read each row with the dated correction in its ticket; the dispositions in the table above are otherwise retained.

| Ticket | Corrected disposition | Correction that changes how the row reads |
|---|---|---|
| 3.1 | BOUNDED-SLICE | **Revision-checked identity replacement IS delivered and route-mounted** — the former "not delivered" claim in `ticket-3-1.md` was false and introduced by the docs-only head commit `225d83e5`; it is withdrawn. Outstanding: foreign-owner and unchanged-other-creator server negatives, frontend aggregate closure, and UI adoption (no non-test caller exists in `explorers-earth/src`). |
| 3.2 | BOUNDED-SLICE | Books provider and media routes mounted, but the mandated edits to `explorers-earth/src/hooks/useFileUpload.ts` and `Profile/components/ImageUpload.tsx` were **not made**; live storage/provider smoke stays deferred to 3.5. |
| 3.3 | BOUNDED-SLICE | **20 identities verified** (10 `test(` × 2 projects), committed, `dirty:false`, matching the committed manifest. "No Books flow requires Strapi" is still **unproven at an exact SHA** — the real-backend spec is local-fixture only. |
| 3.4 | INCOMPLETE | Producer chain real and mounted, but the "10 browser cases" are **authored with no supported runner and 0 attested**. A lane/script must be registered before any analytics acceptance claim. Dashboard stays in 7.2. |
| 3.5 | BLOCKED-EXTERNAL | **No artifact producer exists**: `platform-candidate.yml` and `platform-qa.yml` do not exist, so Q2 cannot be attempted and `scripts/platform-release.ts` has no trusted producer to verify. Q2 also remains blocked by the red required aggregates. |

**The shared-contract freeze is substantially delivered.** The contracts this epic freezes before downstream category work — `tunes/shared/explorersContract.ts`, `tunes/server/application/actor.ts` and `explorers-earth/src/lib/explorersApiClient.ts` — exist, and the owner command surface is mounted and inventoried in `tunes/server/test/contracts/runtime-surface-inventory.test.ts`. **This includes revision-checked identity replacement**, contrary to the superseded text formerly in `ticket-3-1.md:66`: `replaceRecommendationEntity` is implemented at `tunes/server/repositories/explorersRecommendationRepository.ts:301`, exposed through `tunes/server/application/recommendations.ts:75-78`, mounted as `POST /api/explorers/v1/recommendations/:id/entity` at `tunes/server/routes/explorersRecommendationRoutes.ts:89`, frozen as `replaceRecommendationEntitySchema` at `tunes/shared/explorersBookContract.ts:20`, and listed in the frozen surface inventory at `:78` and `:96`. It landed in `4aa1f67e`. Downstream category dispatch must treat it as a **verification** item, never as a producer to re-author. Substantially delivered is not fully delivered: the rich typed provider/category detail contracts remain delegated to 3.2/4.x/5.x, and categories outside books/movies still cannot carry typed display fields (`tunes/server/application/publicContent.ts:34`).

**The epic's wrapper command is not supported and must not be dispatched as written.** `epic-03.md:119` (and the per-ticket matrix rows at `:131`, `:132`, `:135`, `:138`, `:139`) specify `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local`. The implemented runner accepts **none of those flags**. `scripts/replatform-e2e.mjs:47` fails unless it receives **exactly six arguments**, and `:47`–`:49` accept only:

```
npm run platform:test:e2e -- --milestone delivered-auth-profile-books \
  --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 \
  --receipt <fresh absolute temp dir named replatform-e2e-*>
```

`--milestone` must equal the single scope string `delivered-auth-profile-books` (`:48`); `--ack` must equal `TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`; `--receipt` must be an absolute path **directly** inside the OS temp directory, matching `^replatform-e2e-[A-Za-z0-9-]{8,64}$`, and **must not already exist** (`:49`). There is no `--suite`, no `--project`, no `--environment` and no numeric `--milestone 1|2|3|4`. The lane set is **fixed** at `scripts/replatform-e2e.mjs:11` to exactly `auth`, `profile`, `books`, `lifecycle`, `movies`, `games` — it cannot be narrowed to one suite, and it cannot be widened to `apps`, `products`, `people`, `places`, `guides`, `music`, `music-owner`, `music-public` or `platform`. The historical commands remain **behavioral obligations**: every requirement they expressed is still required, and the absence of a flag is not permission to skip the behavior it selected. See the [command custody correction](../command-custody-2026-10-05.md).

**Preserved honesty.** No `test.skip`, `describe.skip`, `.todo` or conditional skip exists anywhere in `explorers-earth/e2e/replatform/`; the authored identities are real. The audit's record of Apps, Products and People as incomplete with live Apollo/Strapi GraphQL consumers is accurate and must stay — nothing in this correction implies any of them is started.

# Identity, recommendation core and Music implementation plan

**Database authority:** [Consolidated target schema](../target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes for requirements. The [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md) records actual progress; this document does not claim completion.

**Goal:** Deliver Epics 2, 3 and 6 while preserving the existing Explorers interface and moving authority from Strapi to canonical accounts.

**Architecture:** Extend the current Express server. Better Auth manages Google identity and web sessions; creator accounts own application content through membership. HTTP and later MCP adapters invoke the same account-authorized services; existing Music transactions remain behind a canonical account-to-numeric-owner mapping.

**Tech stack:** Existing TypeScript, Express 5, PostgreSQL 15 qualification harness, Drizzle, Vitest, Playwright and React. Better Auth and its adapter versions must be verified and pinned during ticket 2.1; they are not installed or compatibility-proven by this plan.

**Spec:** [Agreed direction](../revised-direction.md), [backlog](../epics-and-tickets.md), [verified Strapi schema inventory](../strapi-schema-inventory.md). Application baseline: `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`.

## Global constraints

Apply the [shared execution checklist](../execution-checklist.md) to affected tickets. Its producer/consumer, typed payload, repeat-save, cache/media, migration, CI and handoff checks are required evidence where relevant.

- Fresh database; no user/password/content import. Required reference fixtures must be sourced or reviewed, not invented from schema names.
- Google only; one initial creator account per user; no profile switcher, followers/community, new admin or monetization.
- Preserve screens, fields, ordering, privacy and routes; auth screens are the agreed exception. Internal adapters may change.
- Existing SQL migration history is immutable. Append reviewed migrations and update migration manifests/readiness/privileges; do not use ad hoc schema push as a production migration strategy.
- All paths below are repository-relative and pre-rename. Epic 8 mechanically moves `tunes` to `apps/api`; services and contracts retain their names.
- No browser authority from account IDs, persisted JWTs or UI visibility. Account ownership is resolved server-side on every operation.
- Local and CI PostgreSQL tests use the attested disposable database. QA and production each run their own self-hosted PostgreSQL; no RDS dependency. Agent acceptance is evidence, not product-owner sign-off.
- Use one existing S3 bucket with disjoint `qa/` and `prod/` prefixes, reusing existing AWS credentials after permission checks. Derive the prefix only from validated server configuration; neither caller input nor a media ID can select another environment. Use local storage emulation/fixtures for ordinary tests, not production objects.
- The accepted shared AWS principal may reach both prefixes: this is application-enforced environment separation, **not IAM credential isolation**. Tests must reject cross-prefix reads/writes/deletes at the application boundary; document that a compromised shared credential still has its configured bucket reach. Do not silently introduce separate IAM users or claim shared-key isolation.
- Use one Google OAuth Web client for QA and production (and the explicitly registered local callback), with environment-specific callback URLs. Generate separate Better Auth application secrets per environment; they are not the Google client secret. Credential presence does not prove callback configuration or permission.

## Review focus

1. Concurrent Google callbacks or retry after failed onboarding must create one owner account (2.1).
2. A public-looking nested resource must remain inaccessible when its account/category/list is private (3.1, 3.3, 6.3).
3. A logged-out or suspended owner must lose socket authority as well as HTTP access (2.4, 6.1).
4. Provider identifiers can identify an edition/item, but similar titles or names cannot safely merge catalog entities (3.1, 3.2).
5. Retried publication/queue writes and post-commit notifications must retain their existing transactional behavior (6.2, 6.3).

## Shared contracts: freeze these before downstream category work

Create `tunes/shared/explorersContract.ts` for wire DTOs, runtime validators and error codes; `tunes/server/application/actor.ts` for trusted server actors; `explorers-earth/src/lib/explorersApiClient.ts` for the same-origin credentialed HTTP adapter. Keep server-only actor construction out of browser exports.

```ts
type CategoryKey = 'places' | 'guides' | 'music' | 'movies' | 'books'
  | 'games' | 'apps' | 'products' | 'people';
type Actor = {
  userId: string; accountId: string; role: 'owner';
  credential:
    | {kind: 'web-session'; sessionId: string; sessionVersion: number}
    | {kind: 'oauth'; grantId: string; scopes: readonly string[]};
};
type RequestContext = {requestId: string; idempotencyKey?: string};
type Page<T> = {items: T[]; nextCursor: string | null};
type RevisionInput = {expectedRevision: number};
type ApiError = {error: {code: string; message: string; requestId: string}};
```

`userId` is Better Auth's stable local identity key; provider subject is held in its provider-account table. Creator `accountId` and catalog/content IDs are UUIDs. Reserve `auth_account` for provider credentials and `creator_accounts` for public profiles, avoiding the two meanings of “account.” `account_memberships` has unique `(user_id,account_id)`; an initial-owner binding unique on `user_id` enforces one initial account under concurrent provisioning without baking a forever-single-account assumption into content ownership. Public handles have a unique normalized key and reserved-route validation derived from the route matrix.

`requireActor(request): Promise<Actor>` resolves the session and membership, then active account state. Future OAuth resolver creates the other credential variant after audience/scope/grant verification. No arbitrary caller-created Actor crosses a transport boundary. Mutating application methods call `authorizeOperation(actor, operation, targetAccountId)` so the later MCP adapter cannot bypass ownership or scope requirements. Web-session authority uses current membership; OAuth additionally requires the named operation scope.

Owner routes are under `/api/explorers/v1`; auth library routes under `/api/auth`. Keep public `/api/explorers/v1/profiles/:username` and category/detail response shapes compatible with existing gateway clients. General authenticated errors: 401 absent/invalid credential, 403 suspended or disallowed operation, 404 unavailable/non-owned resource, 409 revision/idempotency conflict, 422 invalid input, 429 limit. Public private/missing resources both return 404. Do not leak whether another owner has an ID.

New recommendation services in `tunes/server/application/recommendations.ts` expose:

```ts
createRecommendation(actor: Actor, input: CreateRecommendationInput, context: RequestContext): Promise<RecommendationDto>
updateRecommendation(actor: Actor, id: string, input: UpdateRecommendationInput & RevisionInput, context: RequestContext): Promise<RecommendationDto>
archiveRecommendation(actor: Actor, id: string, input: RevisionInput, context: RequestContext): Promise<void>
createCollection(actor: Actor, input: CreateCollectionInput, context: RequestContext): Promise<CollectionDto>
updateCollection(actor: Actor, id: string, input: UpdateCollectionInput & RevisionInput, context: RequestContext): Promise<CollectionDto>
archiveCollection(actor: Actor, id: string, input: RevisionInput, context: RequestContext): Promise<void>
searchRecommendations(actor: Actor | null, input: RecommendationSearchInput): Promise<Page<RecommendationDto>>
```

`CreateRecommendationInput` is a discriminated category union containing `entityId`, `collectionId`, note/rating/media IDs and category-owned values; never `ownerUserId`. DTOs carry canonical `id`, `accountId`, `category`, `revision`; recommendation DTO adds `entity`, note/rating/media, pin/order and publication state. `CreateCollectionInput` contains category/title/description/slug/visibility; update inputs are explicit writable subsets, not arbitrary JSON patches. `RecommendationSearchInput` contains category, optional creator handle/entity IDs, query, cursor and limit. Public search always applies account/category/collection/item policy; authenticated owner queries remain explicitly scoped and cannot make private results available to public MCP tools. Public catalog metadata must not include another account's notes.

`reorderCollection(actor, collectionId, {expectedRevision, orderedRecommendationIds}, context): Promise<CollectionDto>` checks an exact set and writes one transaction. Default new non-Music pagination: 24, max 100; stable `(display_order,id)` or `(created_at,id)` cursor with filter binding. Public gateway preserves its existing 12/24 preview limits and exposes continuation. Music retains existing limits and contracts.

`archiveCollection` supplies existing list-delete behavior through DELETE `/collections/:id`: transactionally archive the collection, exclude its membership/sections from public queries and invalidate affected profile/category views. Shared catalog entities survive. A recommendation referenced elsewhere is not physically deleted; visibility must not be inferred solely from membership in the archived collection. Private media cleanup is reference-aware and asynchronous. Reject another owner's ID, require expected revision, and make retries safe. Guide deletion uses the same collection operation plus its child section policy, rather than a missing separate delete path.

**Entity resolution and edit boundary (3.1/3.2):** `resolveEntity(actor:Actor,input:ResolveEntityInput,context:RequestContext):Promise<EntityDto>` at POST `/entities/resolve`. Input is either `{kind:'provider',category,provider,externalKind,externalId}` or `{kind:'manual',category,details:TypedEntityDetails}`. Only approved providers/types are accepted; server re-fetches/validates provider facts. Manual creation creates a distinct entity by default, with command idempotency handling retries; title/URL similarity alone does not merge records. `CreateRecommendationInput`/`UpdateRecommendationInput` include category-typed `displayOverrides` for existing editable title/cover/metadata fields. Effective presentation is override over source value; one creator cannot edit shared canonical facts through recommendation editing. Replacing entity identity is explicit and revision-checked. Product offer price is creator context, represented on the wire as a decimal string plus currency, never binary floating arithmetic; validate currency precision and retain unknown values explicitly. Test provider-candidate to entity to recommendation, manual retry, and A's title/cover/price edits leaving B unchanged.

Public query operations in `tunes/server/application/discovery.ts` are `searchCreators(input: CreatorSearchInput): Promise<Page<CreatorProfileDto>>`, `getCreatorProfile(handle:string): Promise<CreatorProfileDto>`, `listCreatorRecommendations(handle:string,input:RecommendationSearchInput): Promise<Page<RecommendationDto>>`, and `getCollection(actor:Actor|null,id:string): Promise<CollectionDto>`. CreatorSearchInput contains query/category/cursor/limit. RecommendationSearchInput additionally allows `creatorAccountIds?: string[]` (at most 10) and `minDistinctCreators?: number` (1 through the supplied creator count). Overlap counts distinct public recommending accounts per canonical entity, not repeated recommendations by one account; invalid threshold is 422. Public MCP tools always call public operations and pass `null` to operations with optional Actor, even when a user has linked credentials. A separate explicitly scoped owner tool is required for private results. Epic 3 implements basic public category/profile/collection reads; Epic 9 extends indexed creator/overlap search without redefining authority.

Media operations in `application/media.ts` are `createMedia(actor:Actor,input:MediaUploadInput,context:RequestContext): Promise<MediaDto>`, `deleteMedia(actor:Actor,id:string,context:RequestContext): Promise<void>` and `resolveMediaContent(actor:Actor|null,id:string): Promise<AuthorizedMediaObject>`. MediaUploadInput carries a bounded file stream, declared filename/type/length and purpose; `AuthorizedMediaObject` is server-only storage key/content-type/length and never serialized to clients. `MediaDto` is `{id,url,mimeType,size,alternativeText,caption}`. Upload APIs return application media URLs; file bytes/MIME and declared purpose are validated. Recommendation create/update accepts owned ready media IDs, never arbitrary storage keys.

**Accepted media delivery contract for 2.3, extended in 3.2:** retain the single S3 bucket with private objects under QA/production prefixes; return same-origin `/api/explorers/v1/media/:id/content` application URLs, not raw storage keys. Upload POST validates account, purpose, MIME and byte limits before streaming; API GET and HEAD check current owner/public-attachment authority before replying, including conditional/range requests. Claim evidence is owner-only and never anonymously publishable. Initially use `Cache-Control: no-store` for mutable uploaded media; return 206 for a valid single video byte range and 416 for unsatisfiable ranges without revealing private object size. Use safe content types and `X-Content-Type-Options: nosniff`. Mark deletion/detachment in a transaction, then retry object cleanup; do not delete the old object before replacement succeeds. Never accept an arbitrary remote URL in the media GET route. The media review records historical/proposed alternatives; this paragraph is the current accepted first-release contract, not a verified current CDN configuration.

Actual upload callers span Profile FeedFields, Home, ClaimAccount, Favorites, all category Add pages and guide services; `useFileUpload` only validates selection. Each owning ticket must replace its network helper and add attachment/byte-delivery tests. `publicPlaceMedia.ts` currently allows Strapi/S3 hosts; ticket 7.1 must admit the controlled same-origin media path, not an unrestricted remote proxy. Shared selection defaults are 5 MiB images and 10 MiB video, but the baseline matrix must record per-screen overrides before setting matching server policies. Tests include direct old-URL denial after hiding, private evidence, wrong-owner attachment/deletion, spoofed MIME, failed replacement and real QA S3 upload/read/delete.

## Grounded test commands and preconditions

Existing scripts inspected: `tunes/package.json`, `tunes/vitest.integration.config.ts`, `tunes/server/test/integration-global-setup.ts`, `explorers-earth/package.json`, `explorers-earth/playwright.config.ts`.

- Unit: `npm --prefix tunes test -- server/test/<name>.test.ts`.
- Database: `npm --prefix tunes run test:integration -- server/test/<name>.integration.test.ts`. **Precondition:** Epic 1 supplies an attested disposable PostgreSQL 15 environment, `DATABASE_URL_TEST`, `MUSIC_C3_POSTGRES_TEST=1` and the applicable suite flag. Existing domain integration also checks `MUSIC_C6_POSTGRES_TEST=1`; a skipped suite is not a pass. Preserve global safety validation instead of relaxing it for convenience. New unified suites must fail missing prerequisites rather than silently skip.
- Frontend: `npm --prefix explorers-earth run test:unit -- src/<path>.test.tsx` (or `.test.ts`).
- Browser existing fast harness: `npm --prefix explorers-earth run test:e2e -- e2e/<name>.spec.ts --project=chromium-pr-safe`. It starts Vite but not a real API. Full-stack qualification uses the **proposed Epic 1 wrapper** `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local` (substitute profile/auth/music-owner/music-public). All new backend-plan E2E specs live in `explorers-earth/e2e/replatform/` with matching `<suite>.spec.ts` names. Epic 1 supplies the real local stack and isolated session fixture, disabled in production. Mock tests are labelled separately; desktop/mobile projects and applicable cross-browser cases run per the operations plan.
- Existing Music regressions: `npm --prefix tunes run test:music-critical-coverage`, `npm --prefix explorers-earth run test:music-critical-coverage`, `npm --prefix tunes run music:types:scoped`, `npm --prefix tunes run music:types:baseline`. Update retired Strapi-specific checks to equivalent canonical-authority coverage; do not simply lower thresholds or disable whole suites.
- Compilation/build: existing `npm --prefix explorers-earth run build` and the API-only build command delivered in Epic 1. Record the exact latter command in the execution log before using this plan; do not pretend that today's Tunes build is API-only.

### Per-ticket test execution matrix

These commands are executable targets after the named test files are created; their existence is not claimed today. Run the new regression once before implementation and require failure for the intended assertion, then run the same command after implementation. Database commands inherit the attested disposable setup above. A pass requires executed assertions, zero unexpected skips, and the listed outcome—not just process exit zero.

| Ticket | Exact primary commands from repository root | Key asserted result |
|---|---|---|
| 2.1 | `npm --prefix tunes test -- server/test/explorers-auth.test.ts`; `npm --prefix tunes run test:integration -- server/test/explorers-account-provision.integration.test.ts` | Concurrent callbacks return one account ID and one owner binding; rollback creates zero orphan accounts |
| 2.2 | `npm --prefix tunes test -- server/test/explorers-authorization.test.ts`; `npm --prefix tunes run test:integration -- server/test/explorers-authorization.integration.test.ts` | Foreign ID gives 404, anonymous 401, suspended 403; OAuth missing operation scope denied |
| 2.3 | `npm --prefix tunes run test:integration -- server/test/explorers-profile.integration.test.ts server/test/explorers-media.integration.test.ts`; `npm run platform:test:e2e -- --suite profile --project desktop-chromium --environment local` | Stale revision 409; private media URL denies anonymous; old photo survives failed replacement |
| 2.4 | `npm --prefix tunes run test:integration -- server/test/explorers-lifecycle.integration.test.ts`; `npm run platform:test:e2e -- --suite auth --project desktop-chromium --environment local` | Logout invalidates session, feedback retry records once, deactivation prevents re-entry |
| 3.1 | `npm --prefix tunes run test:integration -- server/test/explorers-recommendations.integration.test.ts` | Independent notes for shared entity; stale writes 409; exact-set reorder atomic; archive preserves other owner's data |
| 3.2 | `npm --prefix tunes test -- server/test/book-catalog.test.ts`; `npm --prefix tunes run test:integration -- server/test/explorers-media.integration.test.ts` | Provider failure is bounded; MIME spoof fails; QA key cannot address production prefix |
| 3.3 | `npm --prefix explorers-earth run test:unit -- src/features/Books/api/__tests__/booksClient.test.ts`; `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local` | Every edited book field survives reload and private/public transitions |
| 3.4 | `npm --prefix tunes run test:integration -- server/test/explorers-analytics-events.integration.test.ts`; `npm --prefix explorers-earth run test:unit -- src/services/__tests__/analyticsService.test.ts` | Same event ID/body produces one event; changed body conflicts; denied consent produces zero events |
| 6.1 | `npm --prefix tunes run test:integration -- server/test/canonical-music-identity.integration.test.ts`; `npm --prefix tunes test -- server/test/music-principal.test.ts server/test/music-socket-server.test.ts` | Canonical mapping one-to-one; revoked owner cannot reconnect or emit; zero Strapi calls |
| 6.2 | `npm --prefix tunes run test:integration -- server/test/music-domain-repository.integration.test.ts`; `npm run platform:test:e2e -- --suite music-owner --project desktop-chromium --environment local` | Rollback preserves prior queue; notification emitted only after commit |
| 6.3 | `npm --prefix tunes run test:integration -- server/test/music-publication-operation.integration.test.ts`; `npm --prefix tunes test -- server/test/music-public-socket.test.ts server/test/music-public-revision-contract.test.ts`; `npm run platform:test:e2e -- --suite music-public --project desktop-chromium --environment local` | Replay returns original publication result; revoked guest capability denied; reconnect reconciles current revision |

Repeat browser suites with the mobile project defined by Epic 1 and on QA at milestone gates. Preserve existing relevant unit/integration suites in addition to this bounded matrix. Google Console/provider smoke is recorded separately from simulated browser authentication.


## Epic 3 — Recommendation foundation and Books

### 3.1 Shared entities, recommendations and collections

**Depends on:** Epic 2. **Extend:** `tunes/shared/explorersContract.ts` with recommendation/category DTOs and existing `explorers-earth/src/lib/explorersApiClient.ts`. **Create:** `tunes/server/application/recommendations.ts`, `tunes/server/application/catalog.ts`, `tunes/server/application/discovery.ts`, `tunes/server/repositories/explorersRecommendationRepository.ts`, `tunes/server/routes/explorersRecommendationRoutes.ts`, the next append-only `explorers_recommendations` migration, `tunes/server/test/explorers-recommendations.integration.test.ts`.

**Modify:** schema exports, migration manifest/readiness/role grants and `tunes/server/routes/index.ts`.

- [ ] Add failing tests: two accounts share one provider entity but independent notes/media/rating; same title/different provider IDs remain distinct; recommendation FK cannot attach another account's collection/media; stale update returns conflict; reorder rejects omitted/duplicate/foreign members and commits atomically; private parent hides all descendants. Delete a collection and an empty guide-kind collection, retry deletion, check foreign-owner denial and confirm public membership disappears while shared entity/other collection data survives. Rich guide-section cascading is tested in 5.3 once its schema exists, not claimed by the earlier empty-guide test.
- [ ] Implement catalog entities/provider identifiers, account-owned recommendations and collections/items, typed category payloads, revision/idempotency records and media references. Unique provider identity includes provider + entity kind + external ID (movie/TV distinct; book edition IDs distinct); no fuzzy automatic dedupe. Guides use their own ordered section operations in Epic 5; Music remains its existing domain, not forced into generic CRUD.
- [ ] Implement named shared operations above, entity resolution in `application/catalog.ts`, public projection and owner HTTP routes: `/entities/resolve`, `/collections`, `/collections/:id`, `/collections/:id/order`, `/recommendations`, `/recommendations/:id`, `/recommendations/search`. Mutations carry expected revision for existing aggregates and Idempotency-Key for retriable creates; bind replay to account/operation/input hash and reject changed payload. Archive retries with the same key return the original success before re-evaluating the now-archived revision; unrelated stale commands remain 409. Declare static `/recommendations/search` before parameterized `/:id` routes to avoid route capture.
- [ ] Generate or export typed DTO consumption without importing server runtime into Vite. Validate limits and opaque cursor/filter binding at the boundary.
- [ ] Run repository/database/API tests including rollback and public pagination beyond first page. Commit. **Done:** contracts stable for Epics 4/5/7/9/10; isolated accounts and no private nested leakage demonstrated.

**Frontend aggregate closure (3.1):** implement category-wide top-pick tables, revision, GET/PUT/PATCH operations and exact save timing specified by [the schema](../target-database-schema.md). List-only reorder is not a substitute. Add cross-list pins, max15 explicit-save, mixed staged membership/autosave, stale revision and foreign membership tests from [feature review](../frontend-feature-gap-review.md). Preserve source save timing through atomic upsert-order rather than silently normalizing it to a different UX.

- [ ] Owner collection/item clients follow bounded sequential continuation until completion for aggregate managers. Test27 lists and53 children with late-page pins; page2 failure must block complete-set writes and show retry state, not return partial success. Cancel reads on account/session generation change.

### 3.2 Media and catalog providers

**Grooming focus:** extend the 2.3 media race and cleanup evidence to recommendation attachments and public delivery. Check visibility changes through both object delivery and caches, including concurrent attach/delete and retry after storage or database failure.

**Depends on:** 3.1 and the completed media service from 2.3. **Extend:** `tunes/server/application/media.ts`, `tunes/server/repositories/mediaRepository.ts`, `tunes/server/services/objectStorage.ts`, `tunes/server/routes/explorersMediaRoutes.ts`, `tunes/server/test/explorers-media.integration.test.ts`. **Create:** `tunes/server/services/bookCatalog.ts`, `tunes/server/routes/explorersCatalogRoutes.ts`, `tunes/server/test/book-catalog.test.ts`.

**Modify:** `explorers-earth/src/hooks/useFileUpload.ts`, `explorers-earth/src/features/Profile/components/ImageUpload.tsx`, API package/lockfile only for required verified storage/multipart dependencies. Base media tables already exist from 2.3; any new recommendation attachment/derivative schema gets the next append-only migration. Do not recreate media tables or edit an earlier migration after its ticket checkpoint.

**Contract:** authenticated `POST /media` multipart and `DELETE /media/:id`; `GET /catalog/books?query=...&cursor=...` returns bounded provider candidates with provenance, not saved recommendations. Provider response fields map to `BookEntityDetails` (title/subtitle/authors/year/covers/subjects/publisher/pageCount/providerRating/description/isbn13/previewLink/buyLinks).

- [ ] Add failing tests for spoofed MIME, oversized/truncated upload, wrong-owner attach/delete, profile image replacement, storage timeout and retry cleanup; provider timeout/quota/malformed metadata and safe handling of absent covers/ISBN.
- [ ] Implement MIME sniffing, explicit allowed types/limits from existing UI baseline, environment-separated keys, ownership and ready state. Public delivery checks visibility; no private object is exposed merely because its storage URL is known. Disallow arbitrary remote fetch or constrain it to approved provider origins with redirect/address checks.
- [ ] Implement server-side Google Books lookup with timeouts and bounded caching; provider metadata is not trusted HTML. Seed only reviewed taxonomy rows with deterministic IDs; record missing reference values as acceptance blockers.
- [ ] Run media DB and provider unit tests plus profile/Books upload browser cases. Smoke the real QA storage/provider in 3.5. Commit. **Done:** uploaded data survives reload and invalid/private media does not leak or become orphaned after failed save.

### 3.3 Books end to end

**Depends on:** 3.1/3.2/2.4. **Create:** `explorers-earth/src/features/Books/api/booksClient.ts`, `explorers-earth/src/features/Books/api/booksViewModel.ts`, `explorers-earth/src/features/Books/api/__tests__/booksClient.test.ts`, `explorers-earth/e2e/replatform/books.spec.ts`.

**Modify:** `explorers-earth/src/features/Books/components/dashboard/AddBookPage.tsx`, `BooksHome.tsx`, `BookListView.tsx`, `TopReadsManager.tsx` in that same dashboard directory; `explorers-earth/src/features/Books/components/public/PublicBooks.tsx`, `PublicBookList.tsx`, `PublicBookSubject.tsx`; current Books `api/query.ts`, `api/mutation.ts`, `types/index.ts`; `tunes/server/publicProfile/publicProfileService.ts` and its repository adapter.

- [ ] Add failing client/view-model tests proving every field in current `BookList`/`RecommendedBook` types survives round-trip, including lower-case list visibility, rich note, 1–10 rating, buy links, media, top reads heading and pin/order.
- [ ] Adapt existing components behind typed API calls; retain current forms, routes, empty/error states and sort behavior. Migrate public category reads through the existing public gateway seam, not direct privileged owner endpoints.
- [ ] Add E2E fixtures for owner A/B and anonymous sessions: create list, lookup/add book, edit note/rating/media, reorder/pin, hide/reveal, delete, reload, subject navigation and public detail. Assert another owner cannot mutate by changing request IDs and anonymous cannot fetch hidden items directly.
- [ ] Run client tests, existing Books helper/list-navigation/toggle/publish tests and real local browser spec desktop/mobile. Commit. **Done:** no Books flow requires Strapi; seed + Google + profile + Books demo is reproducible.

### 3.4 Analytics foundation

**Depends on:** 3.1 public policy. **Create:** `tunes/server/repositories/explorersAnalyticsEventRepository.ts`, `tunes/server/application/analytics.ts`, `tunes/server/test/explorers-analytics-events.integration.test.ts` and an append-only migration for payload events/receipt linkage.

**Modify:** `tunes/server/services/explorers-analytics-service.ts`, `explorers-analytics-composition.ts`, `explorers-analytics-adapters.ts` in the same services directory; `tunes/server/routes/explorersAnalyticsRoutes.ts`, `explorers-earth/src/services/analyticsService.ts` and its existing tests.

**Contract:** retain current ingestion route and validated input shape; `recordAnalyticsEvent(input,requestContext)` validates consent and target; `getCreatorAnalytics(actor,input: AnalyticsQuery): Promise<AnalyticsSummary>` is the sole owner read service for Epic 7/MCP. `AnalyticsQuery` supplies bounded date range, optional category/resource filters; response is aggregate counts/dimensions matching current dashboard requirements, not raw IPs or secrets.

Define `recordAnalyticsEvent(input:ExplorersAnalyticsInput,context:RequestContext):Promise<{eventId:string;status:'accepted'|'duplicate'}>` in `application/analytics.ts`; preserve route-level legacy response mapping where the current client expects different receipt states. AnalyticsQuery uses inclusive `from`, exclusive `to` instants and a maximum 366-day range; invalid/reversed ranges are 422. Owner account is always Actor-derived. OAuth calls require `analytics:read`. Add UTC day-boundary and duplicate-retry tests so dashboard totals are not changed by transport timezone parsing.

- [ ] Add failing cases for denied consent, duplicate same event, same ID/different payload conflict, private or forged target, receipt retry after crash, and owner analytics isolation.
- [ ] Replace Strapi publisher with a PostgreSQL event/receipt transaction. Existing receipt storage does not hold full event payload; add explicit event rows, minimal permitted attribution fields and retention/deletion behavior. Preserve metadata allowlist, rate limits and public target validation.
- [ ] Wire profile/Books instrumentation and assert consent controls both browser submission and server acceptance. Count observed events only; no inferred ChatGPT impressions.
- [ ] Run analytics service/client tests and new integration tests. Commit. **Done:** repeatable fixture counts stored independently of Strapi and readable only by owning account; Epic 7 completes dashboard/category coverage.


## Ticket 3.5 — QA deployment and Milestone 1 evidence

**Grooming focus:** keep migration manifest, generated inventory, readiness, privileges and deploy schema floor in the same reviewed change. Prove a clean `npm ci`/build/test in each CI package and inspect the actual runtime image scan. Guard real-API fixtures and synthetic identities before browser acceptance; classify build, registry, fixture and provider failures with secret-safe phase diagnostics.

**Prerequisite:** 1.3/1.4 and 2.1–3.4 technically complete; Books/profile acceptance fixtures exist. This is the sole detailed owner of ticket 3.5.

**Files:** create `.github/workflows/platform-candidate.yml`, `.github/workflows/platform-qa.yml`, `deploy/platform.compose.yml`, `deploy/platform-routing.yml`, `scripts/platform-release.ts`, `docs/replatform/qa-runbook.md`; modify `explorers-earth/Dockerfile`, frontend environment adapter/Vite proxy, `scripts/generate-static-files.js` as needed for environment-neutral build; create `tunes/server/test/contracts/platform-release.test.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/deployment.spec.ts`.

**Interface produced:** `ReleaseManifest { sourceCommit, apiImageDigest, webImageDigest, schemaVersion, testEvidenceRef }`; a single multi-platform manifest is allowed when host architectures differ. New `npm run platform:release -- verify --manifest <file> --environment qa|production` validates identity/architecture/schema compatibility without deploy. QA workflow accepts a verified manifest and deploys only to QA environment. Same-origin `/api` and `/socket.io` are environment-neutral; public runtime configuration contains no secrets and is explicitly allowlisted.

**Artifact producer:** `platform-candidate.yml` is manual dispatch on the integration branch, verifies the chosen source revision's required CI result, then builds/scans/publishes both images once. Extend the manifest with `producerRunId`, `producerWorkflow`, `manifestDigest` and provenance. QA consumes the artifact from that verified run, not a caller-authored manifest or arbitrary tag. Candidate publishing has registry permissions but no SSH deployment credentials; QA holds QA-only authority. Production checks the same source/digests and QA evidence independently.

**Manifest integrity:** `manifestDigest` is a detached SHA-256 over canonical UTF-8 JSON excluding that field, avoiding a self-referential hash. Verify the producer workflow's trusted repository/run/source identity and artifact attestation, not merely an attacker-supplied digest. For different architectures, use one immutable multi-platform index plus recorded per-platform digests, run each platform's image smoke, and deploy the recorded platform image. Same source alone is not proof that two independently rebuilt binaries are the same tested artifact.

**Nonsecret readiness manifest:** create `deploy/environments/qa.example.json` and `production.example.json` as validated templates. Pin host alias, SSH user/port, pinned-host-key source, architecture, Docker/Compose version, public origin, internal ports, PostgreSQL volume/database identifiers, S3 bucket name and exact environment prefix, Google client configuration reference/callback, and secret-store references (names only). Real secrets are runtime-injected. QA hostname remains pending; local work and workflow unit tests continue, but DNS/TLS/real callback acceptance cannot be marked complete until it is supplied.

**Runtime configuration:** allowlist only public origin, same-origin API/socket paths, restricted browser Maps key and explicitly enabled public analytics identifiers. Inject auth/provider/AWS secrets only into the API process. Render environment-dependent canonical metadata and robots rules at runtime/configuration mount without rebuilding images. QA is noindex and must not publish production sitemaps as QA URLs. Build once does not mean copying QA runtime secrets/configuration into production.

- [ ] Verify host architecture, disk/memory, Docker support, DNS/TLS ownership and environment secret **names/presence**, without revealing values. Existing secrets are an input to verify, not an established fact of tool access. Missing permissions/callbacks are reported as concrete blockers.
- [ ] Validate the two readiness manifests: different hosts, database credentials/volumes and app secrets; one S3 bucket with exactly `qa/` versus `prod/`; one Google client with the exact allowed callback set. Test missing QA hostname fails deployment validation with a named configuration error. Configure the real redirect addresses through the existing Google project; never ask for a secret pasted into chat.
- [ ] Test S3 key construction with traversal, encoded separators, absolute keys and requested `prod/` keys from QA. The server must reject caller-supplied object keys outside its environment and account scope. Check actual permissions using a disposable QA object only; do not probe production writes to prove isolation. Record whether the reused AWS principal can access both prefixes, and do not claim IAM isolation when it can.
- [ ] Add failing release tests rejecting mutable tags, unknown source, wrong environment, mismatched manifest digest, incompatible architecture/schema and public configuration containing server credentials.
- [ ] Build API and frontend once from the same commit. Eliminate environment-specific Vite endpoint compilation: same-origin endpoints by default; browser-exposed map keys if required come through public runtime configuration with domain restrictions. Do not move secret catalog keys into runtime browser config. Ensure static SEO build does not fetch production data or hardcode QA canonicals into promoted assets.
- [ ] Implement same-host proxy paths including sockets and Google callback. Run PostgreSQL 15 in a persistent container on each host with no public port, distinct migrator/runtime roles and environment-specific credentials/volumes. Deploy QA to former Tunes host only. No request to preserve old Tunes uptime is required.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/platform-release.test.ts`; compose validation in a context that redacts secret interpolation; image graph/health smoke. Configure deployment concurrency to serialize QA releases.
- [ ] Deploy the verified release to QA after implementation deployment authorization. Run `npm run platform:test:e2e -- --suite platform --milestone 1 --project desktop-chromium --environment qa`, then the auth/profile/books suites through the same wrapper with named QA authority and disposable QA acceptance users. The milestone-1 selection must not require unimplemented later categories. Test public/private, other-owner denial, uploads, reload/deep link, cookie flags, socket handshake and real Google callback separately.
- [ ] Repeat auth/profile/books acceptance using `--project mobile-chromium`; inspect keyboard focus, validation, loading/error states, upload replacement and anonymous reload through browser control. Capture actual before/after persisted results, screenshots/traces and request failures. Google popup/consent interactions requiring a human are reported explicitly; test-session fixtures do not substitute for this provider check.
- [ ] Publish `docs/replatform/evidence/milestone-1.md`: local suite results, GitHub runs, QA digest, real-provider results, skipped cases and owner demo steps. **Gate:** no required failing/skipped acceptance case is called passing; owner review is at milestone, not each ticket.


## Test lanes and honest reporting

### Shared real-API browser harness contract (owned by 1.2, completed with identity in 2.1)

These are proposed interfaces to implement, not existing exports. All feature plans consume this one harness rather than inventing separate login shortcuts or test databases.

**Files:** create root `scripts/replatform-e2e.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/fixtures.ts`, `explorers-earth/e2e/replatform/global-setup.ts`; add `platform:test:e2e` to root package scripts. Specs live under `explorers-earth/e2e/replatform/<feature>.spec.ts`. Projects are `desktop-chromium` and `mobile-chromium` (390×844 viewport); Firefox/WebKit qualification projects may be added without making every PR run every permutation.

**Command:** `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local`. Accepted suites are `auth`, `profile`, `books`, `movies`, `games`, `apps`, `products`, `people`, `places`, `guides`, `music`, `music-owner`, `music-public`, `platform`, `all`; environment is `local` or `qa`. `--suite all` is milestone qualification, not a default quick ticket check. The wrapper uses process argument arrays and supplies environment directly to children, so the command is the same on Windows and Linux; never require shell-specific inline environment assignments. Unknown suite/project/environment fails before startup. Production is not an accepted E2E environment.

Suite mapping includes ~~`places` → `places.spec.ts`, `place-links.spec.ts`, `claims.spec.ts`~~ **(grouped alias CORRECTED 2026-10-05 — see the note below this paragraph)**; `platform` → `public-parity.spec.ts`, `analytics-content.spec.ts`, `deployment.spec.ts`, `no-strapi.spec.ts`; other named suites target their corresponding file. Direct invocation through `npm --prefix explorers-earth run test:e2e -- --config=playwright.replatform.config.ts replatform/movies.spec.ts` is allowed only after the wrapper has provisioned the verified environment. Prefer the root wrapper for normal local/CI execution so no ticket skips authority setup.

> **Places suite-selection correction (2026-10-05, applies to `epic-03.md:244` above).** The grouped `places` alias is historical and must not be used as a qualification gate. `place-links.spec.ts` is a **5.2** artifact and `claims.spec.ts` is a **5.4** artifact, so selecting them under `places` makes **PLACES-CORE (5.1) unqualifiable without 5.2/5.4 deliverables** that 5.1 does not own and that do not exist in source. **PLACES-CORE qualification must not select the 5.2 place-links spec or the 5.4 claims spec.** Until the grouped alias is retired from every document carrying it, **guarded exact discovery is required**: name the exact spec file(s) for the lane being qualified and fail on a missing promised spec rather than resolving a group alias. The same grouped mapping appears at `docs/replatform-audit/epics/epic-01.md:159` and `docs/replatform-audit/epics/epic-05.md:68,130`, which their owners are correcting; this file's copy is corrected here so the alias is not kept alive by this document. **No positive is removed, skipped or deferred:** 5.1, 5.2 and 5.4 each remain mandatory in full and all three remain required in full milestone discovery. This narrows which specs gate 5.1; it narrows nothing about what any of the three tickets must deliver.

Maintain `explorers-earth/e2e/replatform/suite-manifest.json` with required spec paths per suite and delivered milestone. Add `--milestone 1|2|3|4` to the root wrapper, required for `platform` and `all`: milestone1 platform selection includes deployment only, milestone2 adds public-parity/analytics-content, milestone3 adds no-strapi. A missing spec promised by the selected milestone is a failure, not a silent skip. No flag may relabel a completed milestone to bypass its required tests. Later ticket gates use their own suite or the full delivered-milestone manifest. This resolves early QA versus not-yet-implemented retirement scenarios without masking omissions.

**Config behavior:** use testDir `e2e/replatform`, zero retries for local acceptance, retain failure trace/screenshot, HTML/JUnit outputs under `artifacts/replatform-e2e/`. Wrapper provisions/attests disposable DB and starts API plus web for local. QA mode reads only approved QA configuration, verifies its environment marker and exact release manifest, and targets an isolated acceptance dataset. It never sources `.env.production` or derives production access from a default URL. A successful mocked Google callback is separately labelled fixture auth; a real Google smoke is a separate recorded case.

**Shared exports in `fixtures.ts`:** `test` and `expect` extend Playwright; fixtures expose `acceptance: { accountA: { userId: string; accountId: string; handle: string }; accountB: { userId: string; accountId: string; handle: string }; suspended: { userId: string; accountId: string; handle: string } }`, `signInAs(persona: 'ownerA' | 'ownerB' | 'suspended'): Promise<void>`, and `api: APIRequestContext`. Sign-in fixture consumes real session cookies minted through an in-process test factory supplied by identity tests; never ship a public test-login endpoint. QA can receive ephemeral acceptance sessions from a host-side test command restricted to QA, not a production-enabled browser bypass.

**Tests required for harness itself:** reject production/unknown authority before I/O; missing seed manifest fails; database-backed create followed by fresh browser context read preserves the record; other-owner read fails; fixture network interception may replace only external providers and must not fulfill application `/api` calls. `signInAs` creates separate real sessions and cannot turn a suspended user into an active account. Auth assertions belong to Epic 2; this wrapper must not bypass their enforcement. Persisted fixture IDs are read from the seed manifest, never inferred by email.

Feature tickets add their spec and use these fixture exports. Existing rendering/mocked Playwright suites continue separately. Milestone evidence includes browser results plus repository/integration evidence; persistence is not claimed solely from an optimistic UI update.

| Lane | Existing foundation | Required additions / execution rule |
|---|---|---|
| Unit/component | Vitest both packages; contained frontend runner | Run relevant changed domain/components each ticket. Ownership/lifecycle/concurrency tests are mandatory for those changes. |
| Database integration | PG15 attestation, migration suites, role and repository suites | Canonical tables/seeds/constraints added by domain tickets; destructive suite only through disposable authority. |
| Deterministic browser | Playwright category shell/navigation/Music fixtures | New dedicated replatform config targets actual local API for application E2E; mock-only rendering suites remain separately labelled. |
| Real integrations | Existing live Music qualification mechanisms | Google callback, Maps/provider lookup, upload/email as applicable get nonproduction smoke; secrets never in artifacts. |
| Accessibility/visual | axe, Music specs and snapshots | Books/profile/all-category key flows, keyboard/focus/error states, desktop/mobile; deeper cross-browser milestone lane. |
| Security | Music authorization/security contracts | Canonical account ownership, CSRF/session, private nested resources, upload validation and no secret bundle checks. |
| Load/recovery | Music load/chaos and image/compose real-tool tests | Non-Music representative workloads, restart/restore and exact-artifact QA promotion. |

Do not run bare `npm run test:e2e` as a claim of a bounded CI gate: default project matches all specs and overlaps qualification projects. Existing fixture scripts can still depend on the sibling package after client removal; update those dependencies, not the assertions away. Tests run against API mocks do not verify PostgreSQL or real Google. `npm run music:types:baseline` checks a pre-existing type baseline and is not equivalent to full repository type correctness.

## Grooming review result

The backlog covers all operations commitments. Critical dependency corrections are explicit: local authority before destructive tests; safe triggers before push; environment-neutral build before immutable QA promotion; replacement Music client coverage before deletion; rename after removal; QA restore before production readiness. Workflow/secret/host configuration outside source remains an execution-time verification, not an assumed capability. Ticket 3.5 is intentionally here to prevent a second competing QA deployment implementation.

Music suite mapping: `music-owner` selects `e2e/replatform/music-owner.spec.ts`; `music-public` selects `e2e/replatform/music-public.spec.ts`; `music` selects both. All are owned by Epic 6 and run through the same real-stack wrapper.

**Auth qualification update:** [Pinned Better Auth schema and local probe results](../auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.

## Individual ticket files

- [Ticket 3.1: Shared entities, recommendations and collections](../tickets/ticket-3-1.md)
- [Ticket 3.2: Media and catalog providers](../tickets/ticket-3-2.md)
- [Ticket 3.3: Books end to end](../tickets/ticket-3-3.md)
- [Ticket 3.4: Analytics foundation](../tickets/ticket-3-4.md)
- [Ticket 3.5: QA deployment and Milestone 1 evidence](../tickets/ticket-3-5.md)
