# Epic 2: Google identity and accounts

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [2.1](../tickets/ticket-2-1.md) | complete | Reuse canonical cookie authority; no legacy subject substitution. |
| [2.2](../tickets/ticket-2-2.md) | complete | Reuse Actor contract; Music implementation belongs to 6.1. |
| [2.3](../tickets/ticket-2-3.md) | complete | Preserve the accepted 2.3 scope; new navigation overlay belongs to repair review, not reopening this ticket. **Correction (2026-10-05):** `8ce52776` is the acceptance-time **hosted head**, not the delivering commit — delivery is `79edeea8`. |
| [2.4](../tickets/ticket-2-4.md) | partial | Package L: map original 18 plus 3 recovery behaviors against the **10 committed** browser cases (corrected from "accepted 12"; cases 11-12 are overlay-only); implement missing held completion, response-loss and reload cases. Socket closure joins reviewed 6.1. **Blocking prerequisite:** the frozen 18+3 map is unwritten. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

### Epic exit status — independent review (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §3 P0-1, §6 rows 2.1–2.4, §7 Epic 02. Epic verdict **INCOMPLETE**.

**Exit criteria: 2.1, 2.2 and 2.3 are met. 2.4 is open.**

| Ticket | Verdict | Basis / what remains |
|---|---|---|
| 2.1 | **ACCEPTED** | Better Auth pinned 1.7.6, password auth off, implicit linking disabled, explicit callback allowlist, 3 mandatory failing tests present, 4/4 hosted `success`. Real Google smoke explicitly deferred to 2.4/3.5. One open test-lane defect below. |
| 2.2 | **ACCEPTED** (strongest in the set) | Commit content matches the claim: server-only Actor, ambiguous-header rejection, immutable mapping; 4/4 hosted `success`. |
| 2.3 | **ACCEPTED** | Implementation plus integration coverage present; 4/4 hosted `success`, 2026-10-01 confirmed. Delivery is `79edeea8`; `8ce52776…` is the acceptance-time hosted head. |
| 2.4 | **OPEN / INCOMPLETE** | Canonical server and client lifecycle are real, but: 10 committed browser cases (not 12); the frozen 18+3 requirement-to-receipt map is **unwritten**; the L0 observation contract is unresolved (and its absence claim overstated — see below); the real Google callback is absent; socket revocation is deferred to 6.1; and the legacy browser spec is unmigrated, leaving **no merge path**. Full detail and obligations in [ticket 2.4](../tickets/ticket-2-4.md). |

**Review-focus item 3 is UNPROVEN and deferred.** "A logged-out or suspended owner must lose socket authority as well as HTTP access" (Review focus §3 below, owned 2.4 + 6.1) has **no evidence** at the review SHA. `tunes/server/music/canonicalMusicPrincipal.ts:8` is an explicit mapping-lookup-only module that self-documents owner provisioning and socket credentials as belonging to 6.1, so socket authority closure is deferred to **reviewed 6.1** and is not evidenced by anything in Epic 2. Do not read 2.2's accepted Actor boundary as satisfying it: 2.2 delivers the HTTP-side adapter contract, not socket revocation.

#### How the auth constraint actually stands — P0, shared 2.4 / 7.1

The global constraint at the end of this section ("No browser authority from account IDs, persisted JWTs or UI visibility") holds **for bearer credentials** and is **violated for subjects**. Both halves are true and must be read together; one reviewer's "no violating path" finding was scoped to bearers only.

- **Bearer path — clean.** No canonical credential reaches a browser bearer path. `explorers-earth/src/store/store.ts:76` and `:83` force `token: null` on every verified transition and on verification failure, and the legacy bearer getters dead-end from there (`src/features/music/musicApi.ts:20` `getStrapiBearer` always yields `undefined`).
- **Subject path — violated.** The canonical account UUID **is** passed as a legacy Strapi *user* subject. `store.ts:76-77` sets `accountId: account.id` and `user: {id: account.userId, documentId: account.id}`; committed `src/features/navigation/categoryNavigationApi.ts:7-9` feeds that `documentId` straight into `usersPermissionsUser(documentId: $documentId)`, and `:86` into `updateAccount(documentId: origin.accountDocumentId)`. Two identifier spaces are conflated against a backend that mounts no GraphQL.

This is a **P0 shared 2.4 / 7.1 seam**, not an Epic 2 regression to be fixed in place by either ticket alone: it is the single defect behind the first failure of all three red Explorers lanes (category navigation A/B and Publishing), and after Strapi retirement those paths fail permanently. The correction is canonical transport plus renaming `documentId` → `accountId` in the store shape so the type system rejects the conflation. **Coordinator allocation is required** — the store and the navigation client are shared between 2.4 and 7.1, and `AuthSyncManager.tsx` / `Settings*` are on the never-parallel list.

- [ ] Resolve the canonical-UUID-as-legacy-subject conflation under coordinator allocation across 2.4 and 7.1, renaming the store field so the conflation is statically rejected rather than only removed at one call site. Removing the legacy query document alone is insufficient while the store still exports a canonical UUID under a legacy subject name.

**Latent defence-in-depth gap — a negative test is owed.** `explorers-earth/src/lib/localTunesApiClient.ts:53` defines `STRAPI_PROOF_PATTERN = /^[A-Za-z0-9._~-]{16,4096}$/`, which **would match a 36-character canonical account UUID**. Nothing at that boundary distinguishes a canonical account identifier from a legacy proof, so the boundary offers no second line of defence against the conflation above.

- [ ] Add a negative test asserting that a value shaped like a canonical `accountId` is **rejected** at the `localTunesApiClient` boundary as a legacy proof or subject. This is an owed negative, additional to the transport fix — do not substitute one for the other, and do not relax `STRAPI_PROOF_PATTERN` in a way that widens what the boundary accepts.

**2.1 open test-lane defect.** `tunes/server/test/account-recovery.test.ts` is **database-backed** (`:9` `let pool: pg.Pool`; `:28` `new pg.Pool({connectionString: process.env.DATABASE_URL_TEST})` in `beforeAll`) but carries no `.integration` segment in its filename, so it is **misfiled into the unit lane**. Per **Grounded test commands and preconditions** below, database suites run through `npm --prefix tunes run test:integration` with the attested disposable PostgreSQL 15 authority and the applicable suite flags, none of which the unit command supplies. A **ticket-mandated recovery proof may therefore not execute under the unit command** while appearing satisfied — and a skipped suite is not a pass. Recorded as an open obligation in [ticket 2.1](../tickets/ticket-2-1.md); 2.1's acceptance is not reopened.

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
- No browser authority from account IDs, persisted JWTs or UI visibility. Account ownership is resolved server-side on every operation. **Status (2026-10-05): holds for bearers, violated for subjects** — `store.ts:76,83` force `token:null`, but `store.ts:76-77` exports the canonical account UUID as `user.documentId`, which `categoryNavigationApi.ts:7-9,86` feeds into legacy Strapi `documentId` operations. P0, shared 2.4/7.1; see [Epic exit status — independent review (2026-10-05)](#epic-exit-status--independent-review-2026-10-05) above.
- Local and CI PostgreSQL tests use the attested disposable database. QA and production each run their own self-hosted PostgreSQL; no RDS dependency. Agent acceptance is evidence, not product-owner sign-off.
- Use one existing S3 bucket with disjoint `qa/` and `prod/` prefixes, reusing existing AWS credentials after permission checks. Derive the prefix only from validated server configuration; neither caller input nor a media ID can select another environment. Use local storage emulation/fixtures for ordinary tests, not production objects.
- The accepted shared AWS principal may reach both prefixes: this is application-enforced environment separation, **not IAM credential isolation**. Tests must reject cross-prefix reads/writes/deletes at the application boundary; document that a compromised shared credential still has its configured bucket reach. Do not silently introduce separate IAM users or claim shared-key isolation.
- Use one Google OAuth Web client for QA and production (and the explicitly registered local callback), with environment-specific callback URLs. Generate separate Better Auth application secrets per environment; they are not the Google client secret. Credential presence does not prove callback configuration or permission.

## Review focus

1. Concurrent Google callbacks or retry after failed onboarding must create one owner account (2.1).
2. A public-looking nested resource must remain inaccessible when its account/category/list is private (3.1, 3.3, 6.3).
3. A logged-out or suspended owner must lose socket authority as well as HTTP access (2.4, 6.1). **Status (2026-10-05): UNPROVEN, deferred to 6.1** — `tunes/server/music/canonicalMusicPrincipal.ts:8` defers socket credentials to 6.1, so no evidence for this item exists in Epic 2. The requirement stands in full; it is not satisfied by 2.2's HTTP-side Actor boundary.
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


## Epic 2 — Google identity and account-owned profiles

### 2.1 Auth and ownership schema

**Depends on:** Epic 1 local database, migration runner and route baseline. **Produces:** Google session, `ensureInitialAccount(userId): Promise<{accountId:string}>` and canonical persistence.

**Existing files:** `tunes/server/app.ts`, `tunes/server/routes/index.ts`, `tunes/server/db.ts`, `tunes/shared/schema.ts`, `tunes/server/db/migrate.ts`, `tunes/shared/music-migration-contract.ts`, `tunes/server/db/readiness.ts`, `tunes/server/db/music-runtime-role.ts`, `tunes/package.json`, `tunes/package-lock.json`.

**Create:** `tunes/shared/explorersContract.ts` (identity/error/profile/media primitives; 3.1 extends it), `tunes/server/auth/betterAuth.ts`, `tunes/server/auth/initialAccount.ts`, `tunes/shared/authSchema.ts`, `tunes/shared/explorersSchema.ts`, `tunes/migrations/0022_explorers_identity.sql`, `tunes/server/test/explorers-auth.test.ts`, `tunes/server/test/explorers-account-provision.integration.test.ts`.

- [ ] Verify current official Better Auth Express 5 integration, Drizzle PostgreSQL adapter, Google configuration, stable user ID and session-revocation APIs. Pin a supported package/version and record its generated table contract. Do not copy hypothetical library methods from this plan. MCP OAuth support is a later compatibility gate, not a reason to implement OAuth now.
- [ ] Add failing tests: two concurrent `ensureInitialAccount` calls return the same account, exactly one owner binding and membership; transaction failure leaves no orphan account; Google provider subject distinguishes identities even if emails/display names coincide. Run the named tests and record expected failures.
- [ ] Add auth/creator/membership migrations and constraints. Keep provider credentials inaccessible to public profile selects. Mount the auth handler in the ordering required by the verified Express integration, with explicit trusted origins and callback allowlists. No native password signup endpoint is enabled.
- [ ] Wire canonical auth/account startup through the API-only composition from Epic 1 so it boots without Strapi connectivity or a successful legacy Music proof exchange. Current `createApp(musicIdentityConfig,localProfile)` and `registerRoutes` construct Strapi adapters eagerly; keep legacy Music composition behind its explicit temporary path until 6.1, and prove canonical `/me` startup with a network stub that rejects every Strapi request. Do not fake Strapi credentials to make the new auth runtime start.
- [ ] Configure the single existing Google OAuth client with exact local/QA/prod `/api/auth/callback/google` URIs derived from approved public origins; set explicit Better Auth base URL per environment and generate independent application secrets. Verify project consent/audience/test-user settings without logging secret values. Do not auto-link identities solely on matching email; a verified provider subject is the authority, and any uniqueness collision must fail safely without granting another account.
- [ ] Implement idempotent initial provisioning in a transaction invoked after authenticated session establishment; use a unique binding plus conflict-safe retry, not an application-only precheck. Incomplete onboarding is a valid state and does not fabricate an address.
- [ ] Run unit/database commands above, negative callback/origin tests and compiled startup. Commit schema/auth/provisioning together. **Done:** repeat login/callback does not multiply accounts and invalid callbacks do not establish sessions. Real Google smoke is still mandatory in 2.4/3.5.

- [ ] Qualify the recovery contract specified in ticket 2.4 before closing 2.1: identify supported fresh-Google callback/session hooks, prove inactive identities can authenticate for recovery without ordinary access or automatic account provisioning, and create the server-only recovery proof tests. This prerequisite does not depend on implementing downstream content routes.

### 2.2 Authorization and Music boundary

**Depends on:** 2.1. **Produces:** Actor resolver and canonical Music adapter specification; consumers include all content services and 6.1.

**Create:** `tunes/server/application/actor.ts`, `tunes/server/middleware/explorersPrincipal.ts`, `tunes/server/application/authorization.ts`, `tunes/server/music/canonicalMusicPrincipal.ts`, `tunes/server/test/explorers-authorization.test.ts`, `tunes/server/test/explorers-authorization.integration.test.ts`. **Modify:** `tunes/server/routes/index.ts`, `tunes/server/types/express.d.ts` if present; otherwise create that declaration file, `tunes/server/security-containment.ts`, and `tunes/server/policies/musicRetirementPolicy.ts` only to admit explicitly new canonical routes without reopening retired ones.

- [ ] Add failing matrix tests for anonymous/owner/other-owner/suspended/pending-deletion; forged account ID, stale membership, stale session version and duplicate credentials. Add an OAuth Actor unit fixture to prove service authorization requires its operation scopes without introducing an OAuth transport.
- [ ] Implement `requireActor`, current-membership authorization and error envelope. Resolve lifecycle status on the server; tests must change state after session issuance and see access denied on the next request.
- [ ] Define `resolveCanonicalMusicPrincipal(actor): Promise<{musicUserId:number;accountId:string;userId:string;sessionVersion:number}>` and `account_music_identity` one-to-one mapping. Preserve numeric music ownership but never overload Strapi columns with canonical UUIDs. Define all owner Music REST to use the same web session; purpose-limited socket credentials are issued from it in 6.1.
- [ ] Run authorization unit/integration tests and existing retirement-policy tests. Commit. **Done:** new owner APIs cannot select their authority from body/query IDs; the Music boundary has a compiling adapter contract and failing isolation fixture ready for 6.1.

### 2.3 Profile/onboarding integration

**Depends on:** 2.2. This ticket delivers the base upload service required for profile parity; 3.2 extends it to recommendation/catalog usage, so Epic 2 has no dependency on Epic 3.

**Grooming focus:** inspect the actual Profile, Settings and onboarding payloads, including blank optional enum values, before finalizing validators. Exercise two tabs and repeated saves against the real API; prove public/private profile and media cache transitions, concurrent attachment/deletion and durable orphan cleanup. Complete the full affected frontend regression selection before review, with base-commit proof for any claimed preexisting failure. The hosted fixture and runtime image gates remain separate from local tests.

**Create:** `tunes/server/application/profiles.ts`, `tunes/server/routes/explorersAccountRoutes.ts`, `tunes/server/repositories/explorersAccountRepository.ts`, `explorers-earth/src/lib/explorersApiClient.ts`, `explorers-earth/src/features/Profile/api/profileClient.ts`, `tunes/server/test/explorers-profile.integration.test.ts`, `explorers-earth/e2e/replatform/profile.spec.ts`.

**Also create here:** `tunes/server/application/media.ts`, `tunes/server/repositories/mediaRepository.ts`, `tunes/server/services/objectStorage.ts`, `tunes/server/routes/explorersMediaRoutes.ts`, `tunes/server/test/explorers-media.integration.test.ts` and media persistence through an append-only migration. Implement the shared `createMedia`/`deleteMedia` contract for profile/avatar/background purposes, MIME/size validation, owner attachment/deletion, storage rollback cleanup and private delivery. Modify `explorers-earth/src/hooks/useFileUpload.ts` and `explorers-earth/src/features/Profile/components/ImageUpload.tsx` here. Ticket 3.2 extends these files rather than creating a second upload system.

**Modify:** `explorers-earth/src/pages/OnBoarding.tsx`, `explorers-earth/src/pages/onboardingAccountDecision.ts`, `explorers-earth/src/pages/onboardingFinalizeLock.ts`, `explorers-earth/src/features/Profile/components/ProfileForm.tsx`, `explorers-earth/src/features/Profile/components/FeedFields.tsx`, `explorers-earth/src/features/Profile/api/query.ts`, `explorers-earth/src/features/Profile/api/mutation.ts`, `explorers-earth/src/features/Authentication/hooks/useCurrentUser.ts`, `tunes/server/publicProfile/publicProfileService.ts`, `tunes/server/routes/explorersPublicProfileRoutes.ts`.

**Contract:** `GET /api/explorers/v1/me`, `PATCH /api/explorers/v1/account` with revision; `getMyProfile(actor:Actor): Promise<AccountDto>` and `updateAccount(actor,input & RevisionInput,context): Promise<AccountDto>` live in `application/profiles.ts`. Owner profile reads authorize `profile:read` for OAuth credentials and active membership for web sessions; public `getCreatorProfile` is a separate projection and cannot implement an owner-profile tool. AccountDto includes onboarding status, handle, profile field values, category flags, appearance/navigation preferences and revision. Preserve public profile Yes/category No/auto-pinning true defaults as semantic booleans internally; adapters retain current view-model shapes.

Define `UpdateAccountInput` in `shared/explorersContract.ts` as the explicit editable subset of AccountDto; the service signature is `updateAccount(actor:Actor,input:UpdateAccountInput & RevisionInput,context:RequestContext):Promise<AccountDto>`. Reject unknown fields and attempts to write owner IDs, lifecycle status or server revision. The public profile PostgreSQL adapter is created here as `tunes/server/publicProfile/postgresPublicProfileGateway.ts`, satisfying the existing public service's shell contract without importing the not-yet-created Epic 3 discovery module. Epic 3 extends that adapter for Books/category data. Before 2.4 connects the final Google UI, 2.3 browser tests use only the isolated development/CI session fixture from Epic 1; real Google profile flow is a combined 2.4/Milestone 1 acceptance case, not a backwards implementation dependency.

- [ ] Add failing tests for normalized handle collision/reserved route, concurrent saves, blank optional fields, lost-update rejection and public redaction; preserve baseline localized content, theme/feed/social/address and contact visibility field coverage from the schema inventory. Assert two distinct handles differing only by case cannot both commit, and an update at revision N fails after another update commits N+1.
- [ ] Implement repository/service/route, PostgreSQL public shell adapter and a compatibility view-model mapper in `profileClient.ts`; existing `documentId` UI fields may temporarily carry canonical IDs, clearly marked adapter-only. No persisted schema uses Strapi names solely to satisfy components. Move the public-place saved-media URL allowlist change forward to this ticket so profile/public media can render at Milestone 1: accept only the configured same-origin `/api/explorers/v1/media/` content route; retain provider-specific external media rules separately. Add the regression to `explorers-earth/src/features/PublicHome/components/__tests__/PublicHome.place-image.test.tsx`; Epic 7 broadens cross-category coverage rather than first enabling the new URL.
- [ ] Replace profile/onboarding data calls, preserving `ProfileSaveResult` deferred-save semantics and existing cross-tab completion behavior. Implement the base media service and profile photo/background wiring here; add failing unauthorized/invalid-upload/storage-failure tests before its implementation.
- [ ] Run profile integration, existing Profile save/cross-tab tests and `replatform/profile.spec.ts` on real local API at desktop/mobile widths. Commit. **Done:** onboarding and complete settings round-trip after reload, public policy holds, layouts match baseline.

**Frontend consumer closure (2.3):** also modify `explorers-earth/src/components/Header.tsx`, `Sidenav.tsx`, `store/useSetupStore.ts` and the account/profile readers in `pages/Home.tsx`, `pages/Favorites.tsx`. Read [frontend auth gap review](../frontend-auth-gap-review.md) for exact source findings and existing test paths.

- [ ] Header/sidebar/public links use canonical account handle/avatar, never Google display name or `accounts[0]`. Test incomplete onboarding, handle/avatar edit, reload and late A response after B login.
- [ ] Derive setup completion from canonical account state; scope/reset walkthrough state per account. Test B cannot inherit A's completion or pinned navigation, and onboarding failure is retryable rather than mistaken for incomplete data.

### 2.4 Auth UX and lifecycle

**Depends on:** 2.2/2.3; socket disconnection acceptance completes with 6.1.

**Grooming focus:** verify stale-session and cross-tab transitions using the actual web client, including in-flight response cancellation, repeat logout/recovery and guarded real-API sessions. A test fixture cannot stand in for the live Google callback acceptance.

**Create:** `explorers-earth/src/lib/authClient.ts`, `tunes/server/application/accountLifecycle.ts`, `tunes/server/routes/explorersLifecycleRoutes.ts`, `explorers-earth/e2e/replatform/auth.spec.ts`, `tunes/server/test/explorers-lifecycle.integration.test.ts`.

**Modify:** `explorers-earth/src/pages/Login.tsx`, `explorers-earth/src/pages/GoogleAuthRedirect.tsx`, `explorers-earth/src/routes/AuthRoutes.tsx`, `explorers-earth/src/store/store.ts`, `explorers-earth/src/components/AuthSyncManager.tsx`, `explorers-earth/src/hooks/useLogout.ts`, `explorers-earth/src/services/accountLifecycleService.ts`, `explorers-earth/src/features/Settings/Settings.tsx`, `explorers-earth/src/features/Settings/api/mutation.ts`, `explorers-earth/src/features/Settings/components/AccountDeletionLifecyclePanel.tsx`.

**Deletion feedback contract:** the current Settings wizard writes freeform reasons before advancing; this is not seeded reference content. Add `recordDeletionFeedback(actor, input:{reason:string}, context):Promise<{id:string}>` to `accountLifecycle.ts` with POST `/account/deletion-feedback`. Require trimmed nonempty reason, bound length to 2,000 characters, use idempotency, derive account/user from Actor and avoid copying private address/email into generic feedback. Preserve current required-reason/error/retry step behavior, and define restricted retention with deletion policy before production. Add tests for failed feedback retry, duplicate submit and no cross-account payload injection; full deletion E2E must prove no Strapi mutation remains.

**Lifecycle boundary:** define `requestAccountDeactivation(actor:Actor,input:RevisionInput,context:RequestContext):Promise<AccountLifecycleDto>`, `requestAccountDeletion(actor:Actor,input:RevisionInput & {feedbackId:string},context:RequestContext):Promise<AccountLifecycleDto>` and `getAccountLifecycle(actor:Actor):Promise<AccountLifecycleDto>`. AccountLifecycleDto is `{accountId,status:'active'|'suspended'|'pending_deletion'|'deleted',operationId:string|null,revision:number}`. Feedback must belong to the same account. Retain the currently exposed reactivation/cancellation journey through a purpose-bound recovery authority, not `requireActor` which correctly denies suspended accounts; pin that authority to the verified Better Auth session/re-authentication primitives during 2.1. Its implementation must reject cross-account, expired and replayed recovery authority. A deleted account must not be automatically recreated with the old content merely by repeating Google login. Retain a minimal deletion boundary or remove ownership references according to the reviewed deletion policy; test this separately from fresh first-login provisioning. Ticket 2.4 cannot pass before the following recovery contract is qualified.

**Recovery contract (owned by 2.1, consumed by 2.4):** create `server/auth/accountRecovery.ts` and `server/test/account-recovery.test.ts`. `requireRecoveryPrincipal(request):Promise<RecoveryPrincipal>` verifies fresh Google authentication through the pinned Better Auth integration and resolves only the existing identity/account binding. `RecoveryPrincipal` is a server-only `{userId:string,accountId:string,purpose:'account-recovery',proofId:string}` and is never assignable to `Actor`. Issue an opaque, single-use, five-minute recovery proof held in a secure HttpOnly same-site cookie; persist only its hash, binding and expiry. `recoverAccount(principal:RecoveryPrincipal,input:RevisionInput,context:RequestContext):Promise<AccountLifecycleDto>` consumes the proof atomically with the permitted reactivation/deletion-cancellation transition. It cannot recover terminally deleted accounts or provision a replacement account. Require the ordinary CSRF/origin protections. Successful recovery requires a new normal session; the recovery credential itself grants no profile/content/Music access. Qualification in 2.1 must identify the actual supported provider callback hook and prove inactive-account authentication can complete without provisioning or ordinary authorization. If the pinned library cannot support that flow, stop that ticket and amend the adapter design before downstream lifecycle implementation, rather than inventing an API.

- [ ] Assert `recovery_only_authorizes_recovery`: recovery proof is denied on ordinary content routes; another account ID, an expired proof and a replay each fail without state changes. Assert two simultaneous recoveries produce exactly one transition, Google re-login cannot restore a terminally deleted account, and a successful eligible recovery requires a fresh ordinary session before content access.

- [ ] Add failing tests for expired/revoked session, cross-origin mutation, logout in another tab, cancelled Google callback, blocked account login and repeated lifecycle request. Existing password-only routes redirect to Google sign-in without exposing broken forms; record this agreed visible change.
- [ ] Replace localStorage Strapi JWT authority with verified Better Auth session client; clear old auth cache on transition/logout, retain noncredential presentation preferences, and invalidate pending requests from the previous account generation.
- [ ] Implement deactivation/deletion/reactivation state transitions from the existing baseline, deriving ownership from Actor and requiring current authority for irreversible operations. Revoke sessions and publish disconnection after the transaction commits. Do not retain upstream absence polling as proof of canonical deletion.
- [ ] Run auth/lifecycle unit/integration and browser scenarios. Perform an actual development Google callback using configured credentials; provider simulation is separate evidence. Commit. **Done:** session behavior and existing lifecycle screens work; any provider access blocker is explicit, not a mock-based success claim.

**Frontend authority closure (2.4):** include `components/ProtectedRoute.tsx`, `GuestRoute.tsx`, `OnboardingCheckError.tsx`, `main.tsx`, `pages/OnBoarding.tsx`, `ReactivateAccount.tsx`, `ReactivateConfirm.tsx`, `features/Settings/Settings.tsx`, `features/navigation/CategoryNavigationProvider.tsx`, `services/useAccountLifecycleIdentity.ts` and their source-listed tests. The [auth gap review](../frontend-auth-gap-review.md) is part of this ticket's required file/test inventory.

- [ ] Implement explicit verified-session states: loading, signed-out, active/incomplete, active/complete, recovery-only, terminal and retryable error. Stale local auth storage cannot authorize rendering. Test private/public deep links, reload and no home/onboarding redirect loop.
- [ ] Replace all logout entry points with one server-session-ending coordinator. Immediately fence local authority, cancel old work, clear account-scoped stores/caches, disconnect sockets and notify other tabs. Preserve theme/language. A failed revocation stays visible as retryable; do not silently rehydrate old authority or claim server logout completed.
- [ ] Handle definitive session expiry once across simultaneous requests; do not globally log out for ordinary404/403/provider outages. Never automatically replay a failed mutation after re-login. Test delayed A→B→A responses and stale navigation/lifecycle callbacks under a new session generation.
- [ ] Replace email/token recovery page integrations and corresponding text with the agreed Google recovery flow. This is an explicit Google-only auth exception to visual-behavior parity. Test cancellation, wrong identity, expired/replayed proof, deleted account and fresh-session success; legacy URL tokens confer no authority.
- [ ] Remove new-auth dependency on qrtoken from global bootstrap. Clearly fence temporarily retained Apollo traffic until category conversion; new session credentials never go to Strapi. Extend every named existing test in the gap review and the real auth/profile browser suites before the Books milestone.


## Individual ticket files

- [Ticket 2.1: Auth and ownership schema](../tickets/ticket-2-1.md)
- [Ticket 2.2: Authorization and Music boundary](../tickets/ticket-2-2.md)
- [Ticket 2.3: Profile/onboarding integration](../tickets/ticket-2-3.md)
- [Ticket 2.4: Auth UX and lifecycle](../tickets/ticket-2-4.md)
