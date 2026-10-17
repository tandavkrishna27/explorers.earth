# Identity, recommendation core and Music implementation plan

## Current authority (2026-10-05)

Historical draft/review below preserves requirements, not current completion or execution order. Use the [current status](current-status-2026-10-05.md), [individual ticket plans](ticket-index.md) and [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Seven original tickets remain complete. Do not regenerate amended tickets from grouped drafts; the organizer now validates custody read-only. Proposed original paths/commands need current-source verification before implementation.


**Database authority:** [Consolidated target schema](target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes for requirements. The [durable implementation ledger](../../.superpowers/sdd/epic-01/progress.md) records actual progress; this document does not claim completion.

**Goal:** Deliver Epics 2, 3 and 6 while preserving the existing Explorers interface and moving authority from Strapi to canonical accounts.

**Architecture:** Extend the current Express server. Better Auth manages Google identity and web sessions; creator accounts own application content through membership. HTTP and later MCP adapters invoke the same account-authorized services; existing Music transactions remain behind a canonical account-to-numeric-owner mapping.

**Tech stack:** Existing TypeScript, Express 5, PostgreSQL 15 qualification harness, Drizzle, Vitest, Playwright and React. Better Auth and its adapter versions must be verified and pinned during ticket 2.1; they are not installed or compatibility-proven by this plan.

**Spec:** [Agreed direction](revised-direction.md), [backlog](epics-and-tickets.md), [verified Strapi schema inventory](strapi-schema-inventory.md). Application baseline: `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`.

## Global constraints

Apply the [shared execution checklist](execution-checklist.md) to affected tickets. Its producer/consumer, typed payload, repeat-save, cache/media, migration, CI and handoff checks are required evidence where relevant.

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

**Frontend consumer closure (2.3):** also modify `explorers-earth/src/components/Header.tsx`, `Sidenav.tsx`, `store/useSetupStore.ts` and the account/profile readers in `pages/Home.tsx`, `pages/Favorites.tsx`. Read [frontend auth gap review](frontend-auth-gap-review.md) for exact source findings and existing test paths.

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

**Frontend authority closure (2.4):** include `components/ProtectedRoute.tsx`, `GuestRoute.tsx`, `OnboardingCheckError.tsx`, `main.tsx`, `pages/OnBoarding.tsx`, `ReactivateAccount.tsx`, `ReactivateConfirm.tsx`, `features/Settings/Settings.tsx`, `features/navigation/CategoryNavigationProvider.tsx`, `services/useAccountLifecycleIdentity.ts` and their source-listed tests. The [auth gap review](frontend-auth-gap-review.md) is part of this ticket's required file/test inventory.

- [ ] Implement explicit verified-session states: loading, signed-out, active/incomplete, active/complete, recovery-only, terminal and retryable error. Stale local auth storage cannot authorize rendering. Test private/public deep links, reload and no home/onboarding redirect loop.
- [ ] Replace all logout entry points with one server-session-ending coordinator. Immediately fence local authority, cancel old work, clear account-scoped stores/caches, disconnect sockets and notify other tabs. Preserve theme/language. A failed revocation stays visible as retryable; do not silently rehydrate old authority or claim server logout completed.
- [ ] Handle definitive session expiry once across simultaneous requests; do not globally log out for ordinary404/403/provider outages. Never automatically replay a failed mutation after re-login. Test delayed A→B→A responses and stale navigation/lifecycle callbacks under a new session generation.
- [ ] Replace email/token recovery page integrations and corresponding text with the agreed Google recovery flow. This is an explicit Google-only auth exception to visual-behavior parity. Test cancellation, wrong identity, expired/replayed proof, deleted account and fresh-session success; legacy URL tokens confer no authority.
- [ ] Remove new-auth dependency on qrtoken from global bootstrap. Clearly fence temporarily retained Apollo traffic until category conversion; new session credentials never go to Strapi. Extend every named existing test in the gap review and the real auth/profile browser suites before the Books milestone.

## Epic 3 — Recommendation foundation and Books

### 3.1 Shared entities, recommendations and collections

**Depends on:** Epic 2. **Extend:** `tunes/shared/explorersContract.ts` with recommendation/category DTOs and existing `explorers-earth/src/lib/explorersApiClient.ts`. **Create:** `tunes/server/application/recommendations.ts`, `tunes/server/application/catalog.ts`, `tunes/server/application/discovery.ts`, `tunes/server/repositories/explorersRecommendationRepository.ts`, `tunes/server/routes/explorersRecommendationRoutes.ts`, the next append-only `explorers_recommendations` migration, `tunes/server/test/explorers-recommendations.integration.test.ts`.

**Modify:** schema exports, migration manifest/readiness/role grants and `tunes/server/routes/index.ts`.

- [ ] Add failing tests: two accounts share one provider entity but independent notes/media/rating; same title/different provider IDs remain distinct; recommendation FK cannot attach another account's collection/media; stale update returns conflict; reorder rejects omitted/duplicate/foreign members and commits atomically; private parent hides all descendants. Delete a collection and an empty guide-kind collection, retry deletion, check foreign-owner denial and confirm public membership disappears while shared entity/other collection data survives. Rich guide-section cascading is tested in 5.3 once its schema exists, not claimed by the earlier empty-guide test.
- [ ] Implement catalog entities/provider identifiers, account-owned recommendations and collections/items, typed category payloads, revision/idempotency records and media references. Unique provider identity includes provider + entity kind + external ID (movie/TV distinct; book edition IDs distinct); no fuzzy automatic dedupe. Guides use their own ordered section operations in Epic 5; Music remains its existing domain, not forced into generic CRUD.
- [ ] Implement named shared operations above, entity resolution in `application/catalog.ts`, public projection and owner HTTP routes: `/entities/resolve`, `/collections`, `/collections/:id`, `/collections/:id/order`, `/recommendations`, `/recommendations/:id`, `/recommendations/search`. Mutations carry expected revision for existing aggregates and Idempotency-Key for retriable creates; bind replay to account/operation/input hash and reject changed payload. Archive retries with the same key return the original success before re-evaluating the now-archived revision; unrelated stale commands remain 409. Declare static `/recommendations/search` before parameterized `/:id` routes to avoid route capture.
- [ ] Generate or export typed DTO consumption without importing server runtime into Vite. Validate limits and opaque cursor/filter binding at the boundary.
- [ ] Run repository/database/API tests including rollback and public pagination beyond first page. Commit. **Done:** contracts stable for Epics 4/5/7/9/10; isolated accounts and no private nested leakage demonstrated.

**Frontend aggregate closure (3.1):** implement category-wide top-pick tables, revision, GET/PUT/PATCH operations and exact save timing specified by [the schema](target-database-schema.md). List-only reorder is not a substitute. Add cross-list pins, max15 explicit-save, mixed staged membership/autosave, stale revision and foreign membership tests from [feature review](frontend-feature-gap-review.md). Preserve source save timing through atomic upsert-order rather than silently normalizing it to a different UX.

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

### 3.5 QA and Milestone 1 evidence

The single authoritative implementation for this ticket is **3.5 in [the operations plan](implementation-operations.md)**. It consumes completed 2.1–2.4/3.1–3.4 and Epic 1 safe CI. Keep execution evidence under `docs/replatform/evidence/`; do not maintain a second QA deployment or acceptance implementation here.

## Epic 6 — Music on canonical identity

### 6.1 Replace the identity bridge

**Depends on:** 2.2 authority contract and 3.1 shared runtime; may run before unrelated category tickets after these prerequisites. **Create:** `tunes/server/music/accountMusicRepository.ts`, `tunes/server/music/musicSocketCredential.ts`, `tunes/server/test/canonical-music-identity.integration.test.ts` and the next append-only canonical Music migration.

**Modify:** `tunes/server/music/canonicalMusicPrincipal.ts`, `tunes/server/routes/index.ts`, `tunes/server/middleware/musicPrincipal.ts`, `tunes/server/routes/musicIdentityRoutes.ts`, `tunes/server/repositories/musicIdentityRepository.ts`, `tunes/server/repositories/musicDomainRepository.ts`, `tunes/server/services/musicLifecycleService.ts`, `tunes/server/socket/musicSocketServer.ts`, `tunes/shared/schema.ts`, Music SQL manifest/readiness/role grants; `explorers-earth/src/lib/localTunesApiClient.ts`, `musicCredentialStore.ts`, `explorers-earth/src/features/music/musicIdentityCoordinator.ts` and `musicSessionBoundary.ts`.

**Contract:** `ensureMusicAccount(actor:Actor): Promise<{musicUserId:number;accountId:string}>` transactional one-to-one mapping. Owner HTTP consumes canonical session directly. `POST /api/explorers/v1/music/socket-credential` accepts only a current web-session Actor and issues a memory-only purpose-limited 60-second **handshake** credential bound to user/account/session ID and session version; it is not a general HTTP bearer or OAuth token. OAuth Actors cannot acquire web socket credentials through a fabricated session ID. Verify expiry/audience and current state at connect; an established connection subsequently checks current membership/session/account state per owner event and is disconnected on logout/suspension. The handshake's 60-second expiry does not itself end an otherwise valid live session; reconnect always requests a fresh credential. Existing MusicPrincipal compatibility names may exist only at an adapter boundary; no Strapi-origin values are required.

> **Independent review correction (2026-10-05) — this Contract paragraph is a target, not a description of current source.** This grouped document duplicates the ticket 6.1 contract verbatim, so a writer reading it instead of [`tickets/ticket-6-1.md`](tickets/ticket-6-1.md) gets an uncorrected picture. The authoritative, corrected version is the ticket; read it first. Measured facts that this paragraph does not convey:
>
> - **`ensureMusicAccount` does not exist in source.** `tunes/server/music/canonicalMusicPrincipal.ts:13-16` is SELECT-only and self-documents at `:8` that provisioning "belongs to 6.1". Every `INSERT INTO account_music_identity` in the repository is a test fixture (`tunes/server/test/explorers-lifecycle.integration.test.ts:338,374`, `explorers-analytics-events.integration.test.ts:149,174`), so a real new owner can never acquire a mapping row today and any 6.1 slice would pass only on seeded rows. A transactional `ensureMusicAccount(actor)` plus a provisioning-concurrency test and a no-seeded-row proof are owed in the same package.
> - **`POST /api/explorers/v1/music/socket-credential` does not exist**, and neither does `musicSocketCredential.ts`. The owner socket currently consumes the **same general HTTP bearer** (`explorers-earth/src/hooks/useTunesDashboard.ts:107-109` → `tunes/server/socket/musicSocketServer.ts:272,278`).
> - **The "60-second" lifetime is not implemented.** The credential's lifetime is hard-pinned to **600 seconds** by `tunes/server/services/musicTokenService.ts:127-128`; the `60_000` at `explorers-earth/src/lib/localTunesApiClient.ts:84` is `refreshWindowMs`, a pre-expiry refresh window, not a TTL. So a leaked socket handshake value is today a full 10-minute HTTP bearer, which violates this paragraph's own "not a general HTTP bearer" clause by construction.
> - **Already delivered, and to be preserved rather than rebuilt:** memory-only credential storage (`explorers-earth/src/lib/musicCredentialStore.ts:8`), verified audience/expiry/session-version (`musicTokenService.ts:81,86-87,160-169`), and per-event re-authorization with revocation (`musicSocketServer.ts:194,231,378-379`). Genuinely missing: purpose limitation, the 60-second bound, session-ID binding and OAuth-Actor exclusion.
> - **Blocking preflight.** [ADR-005](../adr/005-music-identity-migration-deployment-authority.md) `:16-20` is still **Accepted** and ratifies the bodyless proof boundary this contract replaces; [ADR-006](../adr/006-canonical-music-identity-supersedes-strapi-proof.md) is **Proposed** only. Do not dispatch 6.1 until that supersession is accepted — otherwise a writer following current ADR authority rebuilds the proof exchange. Do not mint a fixture proof to work around it.

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


**Auth qualification update:** [Pinned Better Auth schema and local probe results](auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.
