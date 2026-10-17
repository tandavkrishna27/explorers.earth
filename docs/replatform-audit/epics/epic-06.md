# Epic 6: Music identity and parity

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [6.1](../tickets/ticket-6-1.md) | delivered 2026-10-06 | Canonical mapping, principal and session HTTP, token-null startup and generation fencing, purpose-limited socket credential. |
| [6.2](../tickets/ticket-6-2.md) | delivered 2026-10-07, one recorded deviation | Owner parity qualified. Reconnect and socket separation proved at real-stack level, desktop/mobile in the browser lanes; a single two-origin browser lane was not built and the reason is recorded in the ticket. |
| [6.3](../tickets/ticket-6-3.md) | delivered 2026-10-07, one recorded deviation | Guest capability, replay/revocation and socket separation qualified. Two browser contexts covered across the fixture lanes plus real-stack socket cases rather than one two-context real-stack lane. |
| [6.4](../tickets/ticket-6-4.md) | delivered 2026-10-06 | Canonical Music venue release, so an account deletion that owns one finalises. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

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


## Epic 6 — Music on canonical identity

### 6.1 Replace the identity bridge

**Depends on:** 2.2 authority contract and 3.1 shared runtime; may run before unrelated category tickets after these prerequisites. **Create:** `tunes/server/music/accountMusicRepository.ts`, `tunes/server/music/musicSocketCredential.ts`, `tunes/server/test/canonical-music-identity.integration.test.ts` and the next append-only canonical Music migration.

**Modify:** `tunes/server/music/canonicalMusicPrincipal.ts`, `tunes/server/routes/index.ts`, `tunes/server/middleware/musicPrincipal.ts`, `tunes/server/routes/musicIdentityRoutes.ts`, `tunes/server/repositories/musicIdentityRepository.ts`, `tunes/server/repositories/musicDomainRepository.ts`, `tunes/server/services/musicLifecycleService.ts`, `tunes/server/socket/musicSocketServer.ts`, `tunes/shared/schema.ts`, Music SQL manifest/readiness/role grants; `explorers-earth/src/lib/localTunesApiClient.ts`, `musicCredentialStore.ts`, `explorers-earth/src/features/music/musicIdentityCoordinator.ts` and `musicSessionBoundary.ts`.

**Contract:** `ensureMusicAccount(actor:Actor): Promise<{musicUserId:number;accountId:string}>` transactional one-to-one mapping. Owner HTTP consumes canonical session directly. `POST /api/explorers/v1/music/socket-credential` accepts only a current web-session Actor and issues a memory-only purpose-limited 60-second **handshake** credential bound to user/account/session ID and session version; it is not a general HTTP bearer or OAuth token. OAuth Actors cannot acquire web socket credentials through a fabricated session ID. Verify expiry/audience and current state at connect; an established connection subsequently checks current membership/session/account state per owner event and is disconnected on logout/suspension. The handshake's 60-second expiry does not itself end an otherwise valid live session; reconnect always requests a fresh credential. Existing MusicPrincipal compatibility names may exist only at an adapter boundary; no Strapi-origin values are required.

- [ ] Add failing tests for concurrent provision, two-owner isolation, revoked session replay, expired socket credential, changed account state after connection and no upstream request when Strapi is unreachable.
- [ ] Append explicit canonical mapping/provisioning SQL and adjust triggers/functions that currently require Strapi fields or frozen numeric identity. Retain numeric IDs, guest/publication state and transactional guarantees. Do not make every SQL constraint nullable as a shortcut; map each modified invariant to a canonical replacement and migration test.
- [ ] Recompose Music routes/lifecycle on canonical authority and remove upstream absence/reconciliation from the new runtime path. Keep lifecycle deletion/revocation/idempotency, replacing only Strapi proof assumptions. Remove legacy path files only in Epic 8.
- [ ] Change browser client to session HTTP and socket-ticket acquisition; retain single-flight coordination, generation cancellation and cross-tab invalidation. Audit lifecycle, entitlement, analytics and public descriptor queries that currently read `strapi_account_document_id`—all must resolve canonical mapping.
- [ ] Run canonical identity integration, updated principal/socket/lifecycle unit suites and runtime-role/migration tests. Commit. **Done:** Music starts and operates with zero required Strapi configuration; canonical account deletion/suspension revokes both transports.

### 6.2 Owner Music parity

**Depends on:** 6.1. **Modify:** `tunes/server/routes/musicSurfaceRoutes.ts`, `tunes/server/repositories/musicDomainRepository.ts`; `explorers-earth/src/features/music/musicWorkspaceClient.ts`, `musicQueueClient.ts`, `musicSearchClient.ts`, `musicApi.ts`; existing `tunes/server/test/music-domain-repository.integration.test.ts`, `music-surface-routes.test.ts`; create `explorers-earth/e2e/replatform/music-owner.spec.ts`.

- [ ] Adapt failing test fixtures to canonical owners while preserving assertions for playlist create/edit/delete, song add/remove/reorder, atomic queue replace/append, playback/current state, history, guest controls and entitlement. A retired paid import remains retired, not a new failure to fix.
- [ ] Replace principal plumbing only where needed; preserve existing URL/DTO/domain semantics and map canonical account profile data into existing screens.
- [ ] Run real PostgreSQL concurrency tests: rollback queue replacement leaves prior queue intact, duplicate command does not append twice, stale revision conflicts, notifications occur after commit only. Keep owner predicate tests against forged playlist/song IDs.
- [ ] Run existing Music client suites and new real-stack browser spec desktop/mobile; exercise refresh/reconnect and provider failure. Commit. **Done:** Music owner behavior matches baseline without duplicate Tunes UI or Strapi authentication.

### 6.3 Guest, public and socket parity

**Depends on:** 6.2. **Modify:** `tunes/server/socket/musicSocketServer.ts`, `tunes/server/repositories/musicPublicationOperationRepository.ts`, `tunes/server/services/musicPublicChangeListener.ts`, `tunes/server/policies/musicSurfacePolicy.ts`; `explorers-earth/src/features/music/publicMusicClient.ts`, `publicMusicLiveClient.ts`, `ownerMusicLiveClient.ts`, `musicPublishCoordinator.ts`; existing `tunes/server/test/music-public-socket.test.ts`, `music-publication-operation.integration.test.ts`, `music-public-revision-contract.test.ts`; create `explorers-earth/e2e/replatform/music-public.spec.ts`.

- [ ] Add/update failing tests for public vs unlisted capability vs revoked sharing, repeated publication key, mismatched replay body, hidden queue controls, guest request limits, denied origin, expired authority and out-of-order revision notifications.
- [ ] Preserve hashed guest capability, durable encrypted replay and retired-key semantics; update account lookups to canonical mapping and keep guest transport separate from owner authentication.
- [ ] Run two browser contexts (owner and guest), guest request/owner acceptance, player-state update, connection drop/reconnect, revocation while connected and suspension. Verify hidden data never appears through socket payloads or direct public endpoint fetches.
- [ ] Run PostgreSQL publication integration, socket/security tests and real-stack browser spec plus existing Music public qualification command with its documented environment. Commit. **Done:** full owner/public/guest music coverage is ready for Milestone 2; no deferred UI rebuild is needed.

## Self-review and remaining implementation gates

- Product scope maps to these tickets; 2.3 owns basic profile/media before Epic 3, which extends upload attachment to recommendations. Identity/error primitives start in 2.1 and are extended in 3.1. There is no reverse dependency from Epic 2 to Epic 3.
- Canonical Actor supports future OAuth without inventing a browser session; all ownership remains account-based. Music numeric ID survives internally while upstream identity coupling is replaced.
- Migration filenames after 0022 are allocated serially at execution to avoid collisions across profile-media/category tickets. Every new migration updates expected chain/catalog/role tests. This is an execution ordering detail, not permission to edit prior migrations.
- Better Auth exact version/API, provider/storage configuration, authentic seed rows and configured Google callbacks are unverified implementation inputs. Resolve by source/config inspection and smoke tests; do not silently substitute assumptions or ask the user to paste secrets.
- Shared DTO schemas must enumerate every field from the retained feature types before the relevant ticket begins. The Books and profile source paths above are the initial field truth; Strapi exports verify structure but not actual reference rows.
- None of the commands or scenarios in this plan have been run as implementation verification. A completed plan is not a passing release.


**Auth qualification update:** [Pinned Better Auth schema and local probe results](../auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.

## Independent review verification (2026-10-05)

Epic 6 is **INCOMPLETE**. Measured against source at `225d83e5`; per-ticket detail lives in [6.1](../tickets/ticket-6-1.md), [6.2](../tickets/ticket-6-2.md) and [6.3](../tickets/ticket-6-3.md).

**The epic's own exit criterion is currently contradicted by source.** The `:156` **Done** condition requires Music to start and operate "with zero required Strapi configuration". `tunes/server/routes/index.ts:84-85` eagerly constructs `StrapiIdentityGateway` from a **required** `musicConfig.strapiOrigin`, and the runtime identity path still exchanges a Strapi proof upstream (`tunes/server/routes/musicIdentityRoutes.ts:83` → `tunes/server/services/strapiIdentityGateway.ts:346`). Source does the opposite of the exit criterion; that criterion is not weakened here, it is unmet.

**Blocking preflight for 6.1.** [ADR-005](../../adr/005-music-identity-migration-deployment-authority.md) `:16-20` is still Accepted and ratifies the bodyless `POST /api/music/identity/ensure` proof boundary that 6.1 exists to delete. [ADR-006](../../adr/006-canonical-music-identity-supersedes-strapi-proof.md) is drafted but **Proposed**; accepting it is the repository owner's decision. No 6.1 writer may be dispatched before that supersession, or the proof exchange will be rebuilt. 6.2 and 6.3 are transitively gated.

**The numeric→canonical bridge must close with 6.1.** `account_music_identity.music_user_id` is an `integer` FK to the serial `users(id)` (`tunes/migrations/0023_explorers_authorization.sql:17`), documented as transitional at `0023:14` ("Physical Music owner remains users until the 6.1 canonical Music migration") and hardened by the immutability trigger at `0023:24-25`. This is the only numeric→canonical identity bridge in the schema. The `:153` obligation to retain numeric IDs stands; retaining the numeric principal internally is not the same as retaining the Strapi-keyed bridge, and `tunes/server/repositories/musicDomainRepository.ts:1196,1209` still key on `strapi_account_document_id`.

**The 6.1 contract at `:150` describes a route and a lifetime that do not exist.** There is no `POST /api/explorers/v1/music/socket-credential` and no `tunes/server/music/musicSocketCredential.ts`; the owner socket consumes the same general HTTP bearer (`explorers-earth/src/hooks/useTunesDashboard.ts:107-109` → `tunes/server/socket/musicSocketServer.ts:272,278`) whose lifetime is pinned to **600** seconds by `tunes/server/services/musicTokenService.ts:127-128`, not 60. Read `:150` as the target contract, never as current behavior.

## Individual ticket files

- [Ticket 6.1: Replace the identity bridge](../tickets/ticket-6-1.md)
- [Ticket 6.2: Owner Music parity](../tickets/ticket-6-2.md)
- [Ticket 6.3: Guest, public and socket parity](../tickets/ticket-6-3.md)
