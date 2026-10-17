<!-- /autoplan restore point: C:/Users/TK/.gstack/projects/MeteoriteLabs-explorers.earth/codex-music-identity-provisioning-autoplan-restore-20260813-111628.md -->

# Explorers Music Identity Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.


**Goal:** Make Music a secure first-class Explorers capability with one user identity, stable ownership across profile changes, safe lifecycle handling, migration-safe production operation, and complete automated verification. The provisioning trigger and ownership unit are explicit user decision gates below.

**Architecture:** Strapi remains the identity and Account source of truth. Tunes validates a Strapi bearer only at the identity boundary, deterministically selects the approved Account, atomically projects immutable external IDs into PostgreSQL, and exchanges that proof for a short-lived Music-scoped credential. Ordinary owner REST and Socket.IO operations verify that credential locally and derive the numeric Music owner server-side. Entitlement, publication, content, and lifecycle are separate state axes. Durable tombstones prevent deleted identities from being recreated. A guarded, report-only-first reconciler repairs drift without trusting a single incomplete upstream scan.

**Actual stack:** React 18, TypeScript, Zustand, TanStack Query, Apollo Client, Axios, Express 5 runtime with existing Express 4 type-definition debt, PostgreSQL 15, Drizzle ORM/Kit plus legacy SQL, Zod, Vitest, Supertest, Playwright, Socket.IO, Docker Compose, and GitHub Actions.

## Authority and gates

This section is the only executable task sequence. The CEO, design, and engineering sections later in this document are decision evidence, not parallel work instructions.

- **GATE-U1 - RECORDED:** provision automatically after authoritative provider/email verification and completed onboarding. Music failure never rolls back completed onboarding.
- **GATE-U2 - RECORDED:** Music is person-owned for this release. Persist the immutable selected Account document ID as context and a future workspace-migration seam; do not put current domain ownership on mutable usernames or Account ordering.
- **GATE-U3 - RECORDED:** core personal Music is included for every eligible Explorer. Venue, admin, commercial, quota-expanding, and other premium capabilities remain separately server-derived and gated; identity existence never bypasses entitlement policy.
- **GATE-PROD - production mutation:** no deployment, credential rotation, migration, data edit, canary creation, or destructive operation is authorized by this implementation plan. Those actions require separate explicit authorization after local/staging evidence is complete.
- Security containment, read-only inventory, tests, documentation, and local/staging implementation may proceed before GATE-U1/U2. Product-flow implementation cannot.

## Global constraints

- Work only in the isolated codex/music-identity-provisioning worktree. Preserve the user's dirty original workspace.
- Use red-green-refactor for every behavior change: prove the focused test fails for the intended reason, implement the minimum change, rerun the focused test, and then run the affected suite.
- Capture the normalized full Tunes TypeScript diagnostic baseline before the first implementation edit. CI must reject every new diagnostic, while all new or touched identity/auth modules must be individually clean.
- Do not authorize with browser-supplied username, email, user ID, Account ID, playlist owner ID, document ID, X-Username, query parameters, or request bodies.
- Never decode an unverified token for authorization. Never use a fallback signing secret.
- Never log tokens, cookies, passwords, OTPs, verification tokens, email addresses, raw identity bodies, Strapi payloads, guest capability URLs, SQL containing user data, upstream error bodies, or response headers.
- Production PostgreSQL must be private, must not publish port 5433, and must use rotated non-default credentials.
- Migrations must be deterministic, forward-only, idempotent where promised, included in the immutable image, and complete before readiness reports healthy.
- Build once in CI, push to ghcr.io/<repository-owner>/explorers-tunes, deploy the resolved image digest, retain the previous secure digest, and never roll back below the containment release.
- Healthy identity projection is invisible to the user. Product copy says Music, not Local Tunes, integration, provisioning, Strapi, token, or second account.
- Public unknown, private, and suspended Music resources return the same safe 404. Unlisted capability URLs are noindex and excluded from sitemaps. Discoverable publication requires a separate explicit publish action.
- New identity, authorization, token, lifecycle-state, account-selection, state-precedence, and redaction modules require 100% line, branch, statement, and function coverage. Legacy repository-wide coverage may not regress.
- Commits are made only after the task's focused and affected-suite gates pass. Production rollout is never bundled into an implementation commit.

## Dependency graph

    C0 evidence/preflight + TS baseline
       |----------------------|
       v                      v
    C1 containment code    GATE-U1/U2/U3
       |                      |
       v                      v
    C2 immutable secure   C3 schema/migrations
       rollback floor        |
       |----------------------|
                   v
              C4 identity gateway/projection
                   |
                   v
              C5 Music credential
                /     \
               v       v
       C6 owner/guest  C7 lifecycle
          surfaces      |
               \       /
                v     v
              C8 reconciler
                   |
                   v
              C9 client/product UX
                   |
                   v
             C10 full qualification
                   |
                   v
             C11 CI/docs/runbooks
                   |
                   v
             C12 authorized canary

C0 and C1 may be developed in parallel, but containment cannot be deployed until C0 proves the exact target and backup/rollback facts. C3 cannot start until GATE-U2 fixes the ownership model. C9 cannot start until all three user/product gates are recorded.

## Release test matrix

| Layer | Required proof | Blocking gate |
|---|---|---|
| Static/type | Pre-change full diagnostic baseline; zero new diagnostics; touched identity/auth files clean | Every task |
| Unit | Parsers, selection, normalization, token verification/rotation/versioning, state machines, redaction, retry and threshold logic | 100% for new critical modules |
| Contract | Strapi user/Account/entitlement/lifecycle response fixtures; service-token permission allowlist; error mapping | C0, C4, C7, C8 |
| Migration | Complete runtime-table manifest, fresh PostgreSQL 15, repeated migrate, constraints/indexes, readiness | C3 |
| Real PostgreSQL integration | Atomic projection, conflicts, 20-way concurrency, owner predicates, tombstones, locks, transaction rollback | C3-C8 |
| REST/GraphQL security | Unauthenticated, invalid, cross-user, confused-deputy, suspended, tombstoned, and service-token proxy denial matrices | C1, C5, C6 |
| Socket security | Origin, owner/guest roles, event allowlist, room isolation, expiry, revocation, rate limits | C1, C5, C6 |
| Component/client | Bodyless ensure, in-memory credential refresh, state precedence, exact copy, banned terms, no duplicate triggers | C9 |
| Browser E2E | Google and email journeys, selected trigger, rename, publication modes, outage, retry, lifecycle across reload/multi-tab | C9-C10 |
| Accessibility/responsive | Axe, keyboard-only, focus, status announcements, reduced motion, 320/375px and desktop | C9-C10 |
| Load | Invalid-token storm, same-token single-flight, first projections, cached calls, DB pool, socket connections/events | C10 |
| Chaos | Strapi/DB outage, malformed/truncated upstream data, deadlock, key rotation, stale token, browser exit, duplicate reconciler | C10 |
| Deploy/rollback | Image digest, migration failure, readiness failure, exact prior digest, secure rollback floor, private DB | C2, C10 |
| Canary | Google/email, rename/content stability, publication, lifecycle, reconciliation, redacted metrics for a full cycle | C12 |

The detailed engineering test artifact is stored under the gstack project directory and must be kept consistent with this matrix.

## Canonical implementation tasks

### Task 0 (C0): Prove topology, contracts, inventory, and baselines

**Dependencies:** none. This task is read-only against production and may use disposable local databases.

**Files and artifacts:**
- docs/operations/music-production-preflight.md
- docs/architecture/music-runtime-table-manifest.md
- docs/testing/music-typescript-baseline.md
- docs/development/music-implementation-playbook.md
- docs/development/music-command-contract.md
- docs/development/music-ownership-and-evidence.md
- scripts/music-cli.ts
- docker-compose.music-test.yml
- fixtures/strapi/music-identity/*
- .env.music.example
- .env.music.test.example
- tunes/scripts/verify-production-preflight.ts
- tunes/scripts/inventory-runtime-tables.ts
- tunes/server/test/contracts/strapi-identity-contract.test.ts
- tunes/server/test/contracts/runtime-table-manifest.test.ts

**Steps:**

- [ ] Capture the pre-change normalized Tunes TypeScript diagnostics and commit the baseline before implementation code changes.
- [ ] Establish a portable Node/TypeScript golden-path CLI before feature work. Root scripts expose music:bootstrap, music:doctor, music:up, music:test:smoke, music:test:all, music:down, music:db:status, music:db:migrate, and disposable-only music:db:reset.
- [ ] music:bootstrap installs the root and both child lockfiles reproducibly, generates disposable fixture secrets, validates the fixture schema, and never asks for a production API key or payment credential.
- [ ] Make fixture mode the safe default: disposable PostgreSQL 15, deterministic fake Strapi, Tunes, Explorers, seeded identities, health/readiness waits, an isolated Compose project, and sanitized artifacts. Live Strapi always requires explicit --mode live and separately supplied read-only credentials.
- [ ] music:doctor validates Node >=22.12 from .nvmrc/package engines, npm, Docker Compose v2, required files/environment, free ports, disk space, fixture version, recorded user gates, and database safety. It explains the failing check, exact fix, next command, and recovery command.
- [ ] Validate .env.music.example and .env.music.test.example against one server-side schema. Include signing key IDs/current and previous secrets, DATABASE_URL_TEST, fixture URL/version, timeouts, circuit/rate limits, kill switch/cohort, expected migration ID, and reconciliation controls. Generate disposable test credentials automatically.
- [ ] Define CLI output once: --format human|json; exit 0 success, 1 verification failure, 2 usage/config, 3 prerequisite/state mismatch, 4 dependency unavailable, 5 safety refusal, and 130 interruption. JSON ends with schemaVersion, command, runId, status, phase, durationMs, artifacts, checkpoint, and redacted error.
- [ ] On SIGINT/SIGTERM, stop owned child processes, atomically write .artifacts/music-runs/<runId>/checkpoint.json, and exit 130. Resume rejects a different commit, fixture version, gate values, or environment fingerprint.
- [ ] music:down preserves volumes by default. --volumes requires the resolved isolated project plus exact --confirm-project; cleanup refuses unlabeled or mismatched containers/volumes.
- [ ] Publish the implementation playbook and an ownership/evidence matrix with task, DRI role, reviewer/approver role, entry evidence, start command, exit command, artifact path, checkpoint, handoff recipient, and rollback owner. Assign named people before implementation begins.
- [ ] Inventory every registered REST route, GraphQL proxy, Socket.IO event, scheduled job, native-session route, public route, service-token call, owner identifier, and authorization middleware.
- [ ] Inventory every table, column, constraint, sequence, trigger, and raw SQL reference used by Drizzle, storage.ts, route controllers, YouTube modules, playback, widgets, analytics, subscriptions, sessions, and deletion.
- [ ] Probe the Strapi contracts for current user, completed Account selection, entitlement fields, pagination guarantees, block/reactivate/delete behavior, and service-token permissions. Record sanitized schemas only.
- [ ] Add music:fixtures:capture --mode live --format json as a read-only, explicitly credentialed command. Record schema/fixture version and capture time, redact and scan it, require identity-owner review, commit deterministic fixtures, and define refresh/drift policy. Offline fixture mode never needs production access.
- [ ] In the separately authorized read-only production preflight, record exact database host/name/schema, container/volume IDs, application DATABASE_URL target, row counts for every manifest table, migration history, historical URLs/volumes, access-log evidence, backup timestamp, and restore proof.
- [ ] Abort the clean-cutover design if any topology is ambiguous, any app/dependent row exists unexpectedly, any historical database may still be live, the backup cannot be restored, or required Strapi pagination/lifecycle contracts are unavailable.
- [ ] Classify every dependent data family as user content, PII, security audit, analytics, or financial record and assign delete, anonymize, or retain semantics.

**Tests and acceptance:**

- [ ] Contract fixtures reject missing IDs, ambiguous Accounts, schema drift, truncated pagination metadata, and overprivileged service-token operations.
- [ ] From a clean checkout on Windows and Ubuntu: nvm use; npm ci; music:bootstrap; music:doctor; music:up --detach --wait; music:test:smoke; music:down. Target <=10 minutes cold and <=5 minutes warm.
- [ ] Every golden-path command supports human and JSON output, returns the documented exit code, writes sanitized run evidence, and prints the next/recovery command.
- [ ] The runtime-table manifest test fails when a referenced table is absent from the manifest or from a fresh migrated database.
- [ ] A deliberate new TypeScript diagnostic proves the regression gate fails; remove the deliberate diagnostic afterward.
- [ ] C0 is complete only with a signed preflight result or a documented blocking abort. An inspected empty database alone is not proof.

**Commit:** docs(music): record topology contracts and baselines

### Task 1 (C1): Build the standalone security-containment release

**Dependencies:** C0 route/inventory evidence. Product gates are not required.

**Primary files:**
- tunes/server/auth-bridge-routes.ts
- tunes/server/jwt-auth-middleware.ts
- tunes/server/routes/index.ts
- tunes/server/routes/subscriptionRoutes.ts
- tunes/server/controllers/subscriptionController.ts
- tunes/server/legacy-routes.ts
- tunes/server/app.ts
- tunes/server/storage.ts
- tunes/docker-compose.yml
- explorers-earth/src/services/localTunesService.ts
- explorers-earth/src/lib/apiClient.ts

**Steps:**

- [ ] Write hostile tests first for unauthenticated sync, username/header/body ownership, cross-user bare IDs, subscription/limit IDOR, arbitrary GraphQL mutations through the service-token fallback, guest player_state, permissive socket origins, and raw secret/PII logging.
- [ ] Disable unauthenticated POST /api/auth/sync and username lookup routes. If a temporary compatibility alias is required, it must authenticate a verified principal, ignore the body, be metered, and expire after canary evidence shows zero use.
- [ ] A temporary alias returns Deprecation and Sunset headers, a versioned typed response, a named owner/removal date, and redacted usage metrics. Remove it only after zero legitimate calls for the approved observation window.
- [ ] Replace jwt.decode and fallback secrets with strict verification for any route that still accepts a JWT. Remove X-Username/query/body ownership and reject ambiguous credential combinations.
- [ ] Remove the public arbitrary GraphQL service-token proxy. Replace only demonstrably required operations with typed server endpoints or a strict persisted-operation allowlist; never infer safety from query substrings.
- [ ] Require authenticated principal plus server-derived entitlement/admin permission for subscription and quota reads/writes. The browser never supplies the target user, username, or documentId for owner operations.
- [ ] Define Socket.IO roles. Owners authenticate; guests may only read allowed public state or submit policy-limited requests. Guests cannot send player_state or any owner event. Enforce an exact origin allowlist, event schemas, payload limits, room isolation, and rate limits.
- [ ] Return the shared error envelope and request ID on every contained REST/socket failure; log the stable code and request ID so an operator can locate the sanitized trace.
- [ ] Harden the explicitly retained standalone native session: secure/httpOnly cookies, production SameSite policy, origin/CSRF enforcement on mutations, rotation on login, logout invalidation, and no use as an embedded fallback.
- [ ] Redact request bodies, email, OTP/verification fields, response headers, upstream errors, user rows, passwords, tokens, cookies, guest URLs, and socket room/capability data. Return typed safe errors without raw err.message.
- [ ] Remove the database host port and defaults from Compose. Add a mandatory-credential startup check and a runbook step to rotate exposed/default production credentials before any release.
- [ ] Rate-limit exposed auth/ensure-compatible endpoints and bound body size even before the final identity gateway exists.

**Tests and acceptance:**

- [ ] REST/GraphQL matrix covers none, malformed, forged, expired, session-A/token-B/resource-C, cross-user IDs, suspended users, and service-token escalation.
- [ ] Socket tests prove guest owner-event denial, origin rejection, room isolation, malformed/oversized event rejection, rate limiting, and valid guest request behavior.
- [ ] Native-session tests prove cookie flags, CSRF/origin denial, fixation prevention, logout invalidation, and no embedded fallback.
- [ ] Log-capture tests assert forbidden values never appear in stdout/stderr or client errors.
- [ ] Existing guest read/request behavior remains only where the explicit policy permits it.
- [ ] This release is independently deployable and becomes the oldest legal rollback target.

**Commit:** fix(music): contain legacy authorization surfaces

### Task 2 (C2): Make containment deployable and rollback-safe by immutable digest

**Dependencies:** C1; C0 has proved the target topology. Production execution remains behind GATE-PROD.

**Primary files:**
- .github/workflows/tunes.yml
- .github/workflows/tunes-deploy.yml
- .github/workflows/ci.yml
- tunes/Dockerfile
- tunes/docker-compose.yml
- docker-compose.yml
- docker-compose.music-test.yml
- tunes/server/app.ts
- tunes/server/db/readiness.ts
- docs/operations/music-deploy-runbook.md
- tunes/server/test/deployment/*.test.ts

**Steps:**

- [ ] Build once in CI, scan/test it, push ghcr.io/<repository-owner>/explorers-tunes, and propagate the resolved sha256 digest to deployment.
- [ ] Declare docker-compose.music-test.yml as the sole disposable local/test authority, root docker-compose.yml as the sole production topology authority, and tunes/docker-compose.yml as superseded. Declare one Tunes deployment workflow authoritative, disable/delete the competing main-branch workflow in the same release, and add a drift test that fails if a second active authority returns.
- [ ] Replace host-side source upload, docker compose down, and host rebuild with a pull-and-start sequence that keeps the healthy old app serving until the candidate is ready.
- [ ] Separate liveness from readiness. Readiness requires database connectivity, expected migration ID, mandatory secrets, and required upstream configuration.
- [ ] Add a one-shot migration job using the same immutable image. Application startup never silently creates schema.
- [ ] Retain the prior secure digest and record the containment digest as the permanent rollback floor.
- [ ] Add canary/cohort flags and a server-side kill switch that disable new Music entry without restoring insecure routes.
- [ ] Verify rendered Compose exposes no database host port and has no default credentials.

**Tests and acceptance:**

- [ ] Migration failure leaves the old application healthy and receiving traffic.
- [ ] Candidate readiness failure restores the exact prior digest.
- [ ] Rollback tooling refuses a digest older than containment.
- [ ] The running container reports the expected commit, image digest, and migration ID.
- [ ] A local disposable Compose rehearsal verifies labels before any volume cleanup.

**Commit:** build(music): deploy immutable migration-gated images

### Decision checkpoint before identity schema

- [x] Record GATE-U1 in docs/architecture/music-identity-decisions.md.
- [x] Record GATE-U2 in the same ADR. Person ownership was selected; Tasks C3-C9 retain the immutable Account migration seam.
- [x] Record GATE-U3 universal core behavior plus the exact `unknown | included | eligible | entitled | revoked` premium-policy/freshness contract. Quota and core read-only UX remain deferred to a future versioned contract.
- [ ] Confirm privacy/retention classification from C0.

### Task 3 (C3): Create the complete deterministic schema and migration chain

**Dependencies:** C0, C2 foundation, and recorded GATE-U2/U3.

**Primary files:**
- tunes/shared/schema.ts
- tunes/migrations/*
- tunes/server/db/migrate.ts
- tunes/server/db/readiness.ts
- tunes/server/repositories/musicIdentityRepository.ts
- tunes/server/test/migrations/*
- docs/architecture/music-runtime-table-manifest.md
- scripts/music-cli.ts

**Required identity/lifecycle fields:**

- Immutable strapi_user_document_id.
- Immutable selected strapi_account_document_id for the approved ownership mapping.
- Existing numeric Music users.id retained for all domain foreign keys.
- Mutable display snapshots: username, email, Account name, provider, and last_synced_at.
- Identity status active, suspended, or pending_deletion.
- session_version for immediate local token revocation.
- Entitlement state/version/source timestamp without putting mutable entitlement into the token.
- Lifecycle operation ID, state, attempts, timestamps, last safe error, and retention stage.
- Reconciliation last-seen run, consecutive-miss count, and timestamps.
- Separate durable tombstone sufficient to reject recreation after row cleanup.
- Random guest capability represented separately from public discoverability, with rotation/revocation metadata and no sitemap exposure.

**Steps:**

- [ ] Convert the C0 runtime manifest into an authoritative migration baseline covering every live runtime table, including tables used only by handwritten SQL.
- [ ] Add constraints and indexes for immutable external IDs, selected Account, status/session version, entitlement freshness, tombstone lookup, reconciliation scans, guest capability, and every owner foreign key.
- [ ] Preserve numeric IDs and all existing foreign-key relationships.
- [ ] Implement forward-only migration locking and a readiness check for exact migration state.
- [ ] Implement guarded music:db:status, music:db:migrate, music:db:verify, and music:db:reset. Reset is test-only, prints the resolved URL/database/project, requires DATABASE_URL_TEST plus an allowlisted test name and exact confirmation, and refuses production-like hosts/names.
- [ ] Generate no production assumptions from an empty selected database; the C0 result controls clean baseline versus explicit backfill.
- [ ] If unexpected rows exist, stop and write a conflict/backfill plan rather than matching by mutable username/email.

**Tests and acceptance:**

- [ ] Fresh PostgreSQL 15 migration and repeated migration are green.
- [ ] The runtime manifest and every registered route/service family smoke-test against the fresh database.
- [ ] Constraints reject duplicate external user IDs, invalid selected Account changes, invalid statuses, and broken foreign keys.
- [ ] Migration lock/concurrency, partial failure, and rollback-of-transaction tests are green.
- [ ] Readiness is 503 before migration and 200 only at the exact expected version.

**Commit:** feat(music): add complete identity and lifecycle schema

### Task 4 (C4): Implement the bounded identity gateway and atomic projection

**Dependencies:** C3 and recorded GATE-U1/U2/U3.

**Primary files:**
- tunes/server/services/strapiIdentityGateway.ts
- tunes/server/services/musicProjectionService.ts
- tunes/server/repositories/musicIdentityRepository.ts
- tunes/server/routes/musicIdentityRoutes.ts
- tunes/server/middleware/identityRateLimit.ts
- tunes/server/test/unit/*
- tunes/server/test/integration/musicProjection.integration.test.ts
- tunes/shared/musicError.ts

**Canonical contract:**

- POST /api/music/identity/ensure has no identity body.
- It accepts one Strapi Authorization bearer only at this boundary.
- Strapi /users/me supplies the immutable user documentId and provider/confirmation state.
- One typed Account query supplies candidates. Selection is deterministic and returns the exact selected Account documentId.
- Manual-email users require provider local plus confirmed true. Google uses authoritative provider state. Both require the product-approved completed Account.
- The immutable external user and selected Account IDs are persisted on first success and cannot silently switch.
- Mutable profile snapshots converge without changing the Music numeric ID, content, guest capability, or settings.
- All REST failures use one versioned envelope: error.code, error.message, error.action, error.retryable, and error.requestId. Responses return X-Request-Id and Retry-After where applicable. Socket connect_error.data and acknowledgement failures use the same error object.

**Steps:**

- [ ] Implement strict bearer parsing, explicit connect/read timeouts, bounded retries only for safe transient failures, a circuit breaker, and a capped upstream connection pool.
- [ ] Coalesce concurrent requests by a one-way token fingerprint. Apply IP plus fingerprint rate limits. Never store or log raw tokens.
- [ ] Cache only successful authoritative identity results for a short bounded interval; do not cache invalid tokens or ambiguous results.
- [ ] Make Account selection server-side and deterministic. Persist the selected ID and reject later reorder/switch ambiguity unless an explicit reassignment workflow is approved.
- [ ] Upsert atomically with INSERT ON CONFLICT inside a transaction. Map unique conflicts to typed 409 errors, upstream unavailable to 503 with Retry-After, invalid authentication to 401, eligibility to 403, and rate limits to 429.
- [ ] Define the REST contract with Zod/OpenAPI at the route boundary and generate shared frontend types. Contract tests reject undocumented response/status/error changes.
- [ ] Reject active tombstones and pending deletion before any create/update.
- [ ] Record structured redacted metrics for latency, cache/single-flight behavior, outcome, and conflict reason.
- [ ] Validate or generate a request ID at the edge and propagate it through Strapi calls, database/log context, Socket.IO acknowledgements, traces, and CLI evidence without including upstream bodies or secrets.

**Tests and acceptance:**

- [ ] Unit coverage includes missing/malformed headers, provider/confirmation, zero/one/multiple/reordered Accounts, mutable rename/email changes, timeouts, malformed upstream responses, cache rules, retry budget, circuit opening, and safe error mapping.
- [ ] Real PostgreSQL tests cover first projection, repeat, rename, 20-way same-user concurrency, two-user collision, selected Account switch, tombstone rejection, and transaction rollback.
- [ ] A 50-way same-token load test asserts a bounded upstream call count. An invalid-token storm cannot amplify unbounded Strapi traffic.
- [ ] No log or response contains a token, email, body, Strapi response, or stack trace.

**Commit:** feat(music): add bounded atomic identity projection

### Task 5 (C5): Exchange Strapi proof for a local Music credential

**Dependencies:** C4.

**Primary files:**
- tunes/server/services/musicTokenService.ts
- tunes/server/middleware/musicPrincipal.ts
- tunes/server/routes/musicIdentityRoutes.ts
- tunes/server/types/express.d.ts
- explorers-earth/src/lib/musicCredentialStore.ts
- explorers-earth/src/lib/localTunesApiClient.ts
- tunes/server/test/unit/musicTokenService.test.ts
- tunes/server/test/integration/musicPrincipal.integration.test.ts

**Credential contract:**

- Tunes mints a ten-minute HS256 Music token only after successful ensure.
- Signing requires a minimum 32-byte current secret and explicit kid. A previous kid/secret may verify only during a bounded rotation overlap. There is no default.
- Required claims are issuer explorers-tunes, audience music-api, subject immutable Strapi user documentId, jti, iat, exp, and sessionVersion. Do not include username, email, Account name, guest URL, or entitlement.
- Verification checks algorithm, signature, kid, issuer, audience, time with bounded clock skew, local identity status, tombstone, and sessionVersion on every request.
- The browser stores the credential in memory only. Reload or expiry performs bodyless ensure with the current Strapi bearer. Logout clears it.
- Socket.IO supplies the token in the authenticated handshake and rechecks revocation/status before sensitive owner events.
- Ordinary owner operations do not call Strapi. Local entitlement freshness is checked separately.

**Steps:**

- [ ] Write token tests first for algorithm confusion, unknown kid, wrong issuer/audience, expiry, future iat, rotation overlap/end, changed sessionVersion, suspended and tombstoned identities.
- [ ] Add a single req.musicPrincipal resolver and remove mixed credential fallback for embedded routes.
- [ ] Define refresh single-flight in the client; one 401 TOKEN_EXPIRED may cause one ensure-and-replay for an idempotent request. Non-idempotent mutations require an idempotency key or explicit user retry.
- [ ] Increment sessionVersion on logout-all, suspension, pending deletion, entitlement security revocation, and credential compromise.
- [ ] Document key generation, storage, rotation, rollback compatibility, and emergency revocation.

**Tests and acceptance:**

- [ ] Session A, Strapi bearer B, Music token C, and resource owner D confused-deputy matrix is green.
- [ ] Owner CRUD remains available during a simulated Strapi outage until the Music token expires; after expiry the UI enters the typed auth-unavailable state without data corruption.
- [ ] Rotation during an existing browser session and socket connection behaves according to the overlap contract.
- [ ] No Music token is written to localStorage, sessionStorage, cookies, URLs, logs, or analytics.

**Commit:** feat(music): add scoped local Music credentials

### Task 6 (C6): Convert every owner, guest, entitlement, GraphQL, and socket surface

**Dependencies:** C5 and C1 inventory.

**Primary files:**
- tunes/server/routes/*
- tunes/server/legacy-routes.ts
- tunes/server/storage.ts
- tunes/server/controllers/subscriptionController.ts
- tunes/server/routes/subscriptionRoutes.ts
- tunes/server/services/*
- tunes/server/seo-routes.ts
- tunes/server/test/security/*

**Steps:**

- [ ] Map every owner route to req.musicPrincipal.musicUserId and enforce the predicate inside the repository/storage query, not only in a controller.
- [ ] Remove username and bare owner IDs from owner route contracts. Resource IDs may remain only when the database query also requires the resolved owner ID.
- [ ] Replace duplicate legacy handlers with one canonical route implementation per operation.
- [ ] Keep the public arbitrary GraphQL proxy removed. Add only typed endpoints needed by the product.
- [ ] Use the shared REST/socket error object and X-Request-Id across every converted surface; no controller invents its own error body.
- [ ] Derive subscription/limit target and entitlement from the resolved principal. Treat identity existence and capability entitlement separately. Preserve universal core read/write and deny paid mutations when authoritative entitlement is unknown, non-entitled, or stale beyond the approved window. Any future quota or core read-only behavior requires a versioned contract.
- [ ] Apply the owner credential to Socket.IO. Guests use a separate capability role and explicit event allowlist; they never inherit an owner room's mutation authority.
- [ ] Define private, unlisted capability, and public/discoverable modes. Rotate/revoke guest capabilities, use at least 128 bits of randomness, exclude them from logs/sitemaps/indexing, and return one safe public 404 for unknown/private/suspended.
- [ ] Enforce request, queue, playlist, settings, device, analytics, subscription, YouTube, playback, venue, and public policies consistently.
- [ ] Remove X-Username support from client and server CORS headers.

**Tests and acceptance:**

- [ ] Generate an authorization matrix from the route inventory: unauthenticated, owner, other user, suspended, pending deletion, stale entitlement, guest valid/invalid/revoked, and internal admin where explicitly approved.
- [ ] Real PostgreSQL tests prove every read/update/delete query includes the owner predicate and user A cannot observe or mutate user B.
- [ ] Socket tests cover connection auth, reconnect after expiry, owner/guest event allowlists, room isolation, revocation, rate limiting, payload validation, and origin allowlist.
- [ ] Public tests cover unlisted noindex/no-sitemap, publish/unpublish, capability rotation, zero-public-playlist behavior, identical safe 404, and distinct 429.
- [ ] Search-based contract tests fail if X-Username, jwt.decode, unrestricted service-token proxying, or caller-owned target fields return.

**Commit:** refactor(music): enforce one principal across all surfaces

### Task 7 (C7): Implement durable lifecycle and retention-safe deletion

**Dependencies:** C3-C6 and C0 retention classification.

**Primary files:**
- tunes/server/services/musicLifecycleService.ts
- tunes/server/repositories/musicIdentityRepository.ts
- tunes/server/workers/musicLifecycleWorker.ts
- tunes/server/routes/musicIdentityRoutes.ts
- explorers-earth/src/services/accountLifecycleService.ts
- explorers-earth/src/pages/Settings/*
- tunes/server/test/integration/musicLifecycle.integration.test.ts
- explorers-earth/e2e/music-lifecycle.spec.ts

**State contract:**

    active -> suspended -> active
       |
       v
    pending_deletion -> retained/anonymized cleanup -> tombstoned

**Steps:**

- [ ] Start deletion with an idempotent server operation that writes pending_deletion and a durable operation ID before upstream account deletion is attempted.
- [ ] Immediately increment sessionVersion, deny ensure/token issuance, disconnect owner sockets, hide public resources, and preserve a resumable lifecycle status.
- [ ] Allow the Explorers deletion flow to resume after browser close/reload. It may initiate upstream deletion, but correctness cannot depend on the tab remaining open.
- [ ] Finalize Music cleanup only after authoritative absence is proven and retention policy is applied. Delete user content, anonymize retained analytics/audit records, retain required financial records, and persist the minimal tombstone.
- [ ] Define cancellation only before the irreversible upstream boundary. Define retry/backoff, dead-letter escalation, manual repair, and idempotency.
- [ ] Suspension/reactivation updates local status and sessionVersion without changing numeric ownership or content.
- [ ] Profile changes update mutable snapshots through ensure/reconciliation; they never remap by username/email.

**Tests and acceptance:**

- [ ] Real PostgreSQL tests cover prepare/finalize transactions, failure rollback, repeated operation IDs, tab close, multi-tab calls, stale tokens, socket disconnect, no recreation, partial cleanup, retention/anonymization, and repair.
- [ ] Browser tests cover pending state after reload, retry, allowed cancellation, completion destination, and typed escalation copy.
- [ ] Public resources become the safe 404 immediately on suspend or pending deletion.
- [ ] A deleted external ID cannot be provisioned again without an explicit audited restore policy.

**Commit:** feat(music): add durable identity lifecycle

### Task 8 (C8): Add a guarded report-only-first reconciler

**Dependencies:** C3, C4, C7, and verified C0 pagination contract.

**Primary files:**
- tunes/server/commands/reconcileMusicIdentities.ts
- tunes/server/services/musicReconciler.ts
- tunes/server/repositories/reconciliationRepository.ts
- tunes/server/test/integration/musicReconciler.integration.test.ts
- .github/workflows/music-reconcile.yml
- docs/operations/music-reconciliation-runbook.md

**Steps:**

- [ ] Enumerate upstream identities in a stable explicit order with validated pagination metadata, expected totals where available, and a recorded run/checkpoint ID.
- [ ] Batch projection updates; do not perform an unbounded N+1 request/query loop.
- [ ] Acquire a PostgreSQL advisory lock so workflow, host, and manual invocations cannot overlap.
- [ ] Default every environment to report-only. Mutation requires an explicit reviewed flag and eligible environment.
- [ ] Record absence as one miss only after a fully validated scan. Require two complete independent scans before suspension.
- [ ] Abort with zero suspension writes when counts/checksums shift beyond absolute or percentage thresholds, pagination is duplicated/reordered/truncated, schema changes, or upstream health is uncertain.
- [ ] Require explicit manual approval for any bulk action. Keep per-user actions idempotent and tombstone-aware.
- [ ] Emit redacted metrics and a human-readable dry-run report.
- [ ] Expose music:reconcile with --format human|json, safe default --dry-run, explicit --apply plus approval token for mutation, --checkpoint, and --resume. Use the common exit/signal contract; resume rejects changed commit, fixture/schema version, environment, threshold, or source snapshot.

**Tests and acceptance:**

- [ ] Tests cover stable pages, syntactically valid truncated final pages, reordered/duplicate pages, upstream mutations between pages, malformed totals, timeouts, concurrent jobs, advisory lock, one miss, two misses, threshold abort, manual approval, and zero writes on anomaly.
- [ ] First production execution is report-only and must not mutate.
- [ ] Reconciliation never reactivates, recreates, or deletes without the explicit lifecycle policy.

**Commit:** feat(music): add guarded identity reconciliation

### Task 9 (C9): Converge the Explorers client and Music product experience

**Dependencies:** C5-C8 and recorded GATE-U1/U2/U3.

**Primary files:**
- explorers-earth/src/services/localTunesService.ts
- explorers-earth/src/lib/localTunesApiClient.ts
- explorers-earth/src/components/AuthSyncManager.tsx
- explorers-earth/src/pages/OnBoarding/OnBoarding.tsx
- explorers-earth/src/pages/Music.tsx
- explorers-earth/src/components/MusicDashboard.tsx
- explorers-earth/src/pages/Settings/ConnectedAccounts.tsx
- explorers-earth/src/services/accountLifecycleService.ts
- relevant GraphQL documents and Apollo cache policy
- explorers-earth/src/features/music/*
- explorers-earth/src/**/*.test.tsx
- explorers-earth/e2e/music-*.spec.ts

**Steps:**

- [ ] Implement the selected GATE-U1 trigger once. Google and confirmed-email flows converge on the same bodyless ensure resource after the same eligibility condition. Remove duplicate triggers and sessionStorage flags.
- [ ] Consume the Music credential in memory and refresh through one single-flight ensure resource. Remove X-Username, owner IDs, embedded native login, registration, password, cookie/session, and Local Tunes connection code.
- [ ] Remove Tunes from Connected Accounts. Put privacy/link controls under Music.
- [ ] Implement one state-precedence selector across lifecycle, suspension/auth, onboarding, identity conflict, the exact existing entitlement enum, retryable setup, loading, ready-empty, and content. Under GATE-U3 all five retained entitlement values preserve core read/write; only `unknown` has a nonblocking checking treatment on the core page.
- [ ] Use the exact design state/copy table from Phase 2. Place one inline status below the Music title. Healthy projection and background profile convergence are silent.
- [ ] Preserve the Explorer shell and normal navigation during Music outages. Never undo completed onboarding because Music is unavailable.
- [ ] Implement private, unlisted, and public/discoverable controls and the unified public 404 behavior.
- [ ] Make every publication-mode change one durable owner-derived idempotent command. Migration `0011` stores only immutable owner/key hashes, the exact request fingerprint, a 24-hour response expiry, and an AES-256-GCM response envelope; append-only `0012` requires database `clock_timestamp()` to reach that expiry before the runtime role may shred it, and append-only `0013` makes the PostgreSQL transaction timestamp the immutable completion authority with expiry exactly 24 hours later. Same-key/same-request retries replay exactly across processes and restarts; application clock skew cannot shorten or lengthen the replay window; conflicting or expired replays make no mutation, and expired ciphertext is shredded while the tombstone permanently prevents key reuse.
- [ ] Keep an ambiguous publication command only in process memory, scoped to immutable Explorer user + selected Account + requested mode/fingerprint. Dialog closure, remount, mode toggles, and malformed or lost responses retain its idempotency key; only a strictly validated success or exact logout/account-scope reset clears it.
- [ ] Fix Apollo entity normalization by querying immutable IDs/documentIds or supplying an explicit safe merge policy; remove the current missing-ID warning.
- [ ] Converge username, email, profile picture, and Account name updates through immutable IDs. Never choose accounts[0] independently in the browser.
- [ ] Implement lifecycle pending/reload/retry behavior and remove two-backend language.

**Tests and acceptance:**

- [ ] Component tests assert exact copy, banned internal terms, hierarchy, state precedence, action enablement, and no duplicate ensure calls.
- [ ] Both auth-provider journeys prove no projection before the selected trigger and exactly one stable row afterward.
- [ ] Rename/profile tests preserve Music ID, content, guest capability, and publication settings.
- [ ] Accessibility tests cover aria-live, alert behavior, focus, dialogs, semantic tabs, keyboard reorder, 44px targets, contrast, and reduced motion.
- [ ] Responsive browser tests run at 320/375/640/768/1024 widths.
- [ ] Server, OpenAPI, client, and page tests cover every retained `unknown | included | eligible | entitled | revoked` value, reject unsupported values and impossible authority combinations, and prove lifecycle/auth/onboarding/conflict precedence still wins. Quota/reset/limit and core read-only UX are deferred to a future versioned contract and any separately reviewed migration it requires.
- [ ] Real PostgreSQL tests cover two repository instances, restart/eviction, same-key concurrency, lost response, rollback after each write, expiry and shredding under database time, owner deletion, current/previous response-key rotation, and startup refusal when a bounded representative unexpired response cannot be authenticated and decrypted with its recorded KID/AAD. Database and log scans contain no raw idempotency key or plaintext guest capability.

**Commit:** feat(music): converge Explorers identity and Music UX

### Task 10 (C10): Qualify failure, security, performance, accessibility, and recovery

**Dependencies:** C1-C9.

**Primary files:**
- tunes/server/test/security/*
- tunes/server/test/integration/*
- tunes/server/test/load/*
- explorers-earth/e2e/music-fullstack.spec.ts
- explorers-earth/e2e/music-accessibility.spec.ts
- scripts/music-cli.ts
- docker-compose.music-test.yml
- docs/testing/music-release-evidence-template.md

**Steps:**

- [ ] Use the C0 portable fixture harness for every lane; PowerShell/POSIX files may only be thin wrappers around the same Node implementation.
- [ ] Enforce lanes and initial wall-clock budgets: fast affected type/unit/contract <=3 minutes; PR static/coverage/contracts/migration/real-DB/API/socket/frontend smoke <=15 minutes in parallel; nightly full browser/viewports/load/chaos/fixture drift <=45 minutes; release PR plus immutable-image/migration/readiness/rollback/evidence <=60 minutes.
- [ ] Run all unit and per-file 100% critical-module coverage gates.
- [ ] Run real-PostgreSQL migrations, repositories, concurrency, lifecycle, reconciliation, and owner predicates.
- [ ] Run the complete REST/GraphQL/socket security matrices.
- [ ] Run Google and email E2E for the approved trigger and ownership model; include incomplete/unconfirmed/ambiguous Accounts, refresh, rename, sharing, lifecycle, and outage.
- [ ] Run axe and keyboard-only journeys at 375px and desktop.
- [ ] Run load tests for 50 concurrent first ensures, 200 cached calls, invalid-token storms, same-token single-flight, DB pool saturation, sockets, and guest limits.
- [ ] Inject Strapi/DB outage, malformed identity and entitlement responses, deadlocks, partial transactions, truncated pagination, duplicate reconciliation, credential rotation, stale tokens, and browser exit.
- [ ] Rehearse migration failure, readiness failure, rollback by exact digest, kill switch, and the secure rollback floor.
- [ ] Assert telemetry cardinality is bounded and logs contain no forbidden data.
- [ ] Record cold/warm time-to-first-green, bootstrap/doctor/smoke success, stable failure codes, p50/p95 lane duration, flaky diagnostic reruns, interrupt cleanup, resume success, fixture age/drift, documentation-contract failures, and compatibility-route usage. No developer-identifying telemetry.

**Acceptance:**

- [ ] Zero correctness or authorization failures.
- [ ] Budget overruns fail with timing evidence. A failed test may receive one diagnostic rerun, but the rerun never converts the original failure to green or hides flakiness.
- [ ] p95 ensure and ordinary owner latency budgets are recorded and met under the agreed load; ordinary owner requests make zero Strapi calls.
- [ ] No new full-project TypeScript diagnostic; all touched critical files type-clean.
- [ ] Failure artifacts include sanitized traces/screenshots and never secrets.
- [ ] Every failure mode maps to an owned typed error and user recovery action.

**Commit:** test(music): qualify identity security and recovery

### Task 11 (C11): Make CI, documentation, and runbooks executable contracts

**Dependencies:** C10.

**Primary files:**
- .github/workflows/test.yml
- .github/workflows/tunes.yml
- .github/workflows/music-reconcile.yml
- docs/architecture/music-identity.md
- docs/api/music-identity-contract.md
- docs/security/music-auth-model.md
- docs/testing/music-identity-testing.md
- docs/operations/music-deploy-runbook.md
- docs/operations/music-reconciliation-runbook.md
- docs/operations/music-incident-runbook.md
- docs/design-system/design.md when behavior guidance changes
- README files and environment examples

**Steps:**

- [ ] Gate CI in dependency order: static baseline, unit/coverage, contracts, migration, real DB, API/socket security, frontend, E2E/a11y, load/chaos where scheduled, image/deploy contract.
- [ ] Run docs/environment/command contract checks on docs-only changes; remove docs/** and Markdown ignore rules or provide a dedicated always-triggered docs-contract workflow.
- [ ] Use explicit DATABASE_URL_TEST and refuse any migration/destructive test whose resolved database name is not the named disposable test database.
- [ ] Document identity versus Account versus entitlement versus publication versus content and lifecycle.
- [ ] Treat C11 as final verification/publication, not first authorship. Every C0-C10 task updates its affected getting-started, environment, security, database, API/socket, testing, and operations documentation in the same commit; delete X-Username, db:push-as-production, manual-only Tunes testing, Node 18, and obsolete deployment guidance when the corresponding contract changes.
- [ ] Document every endpoint/event claim and error code, token lifecycle, key rotation, guest capability rotation, standalone-session exception, and owner predicate.
- [ ] Document preflight, backup/restore, migration, readiness, digest deploy, rollback floor, kill switch, canary, reconciliation approval, lifecycle repair, and incident response.
- [ ] Add documentation contract tests for routes, scripts, environment names, migration IDs, and command existence.
- [ ] Update design-system guidance only where this feature establishes reusable status/lifecycle behavior.
- [ ] Record actual React 18 and Express 5 runtime/type-debt facts.

**Tests and acceptance:**

- [ ] CI fails when a new diagnostic, route without policy, table without migration manifest, undocumented error, stale command, missing environment variable, or forbidden auth pattern is introduced.
- [ ] A clean checkout can follow the docs to run all non-production tests.
- [ ] Secrets/examples use placeholders and no default production credential.

**Commit:** docs(music): publish identity security and operations contracts

### Task 12 (C12): Final independent review and separately authorized rollout

**Dependencies:** C11, all user gates, and GATE-PROD for any production mutation.

**Pre-authorization verification:**

- [ ] Run requesting-code-review and the repository review skill. Resolve every P0/P1 and every identity, authorization, data-loss, migration, lifecycle, or rollback issue.
- [ ] Run verification-before-completion and record exact commands, counts, coverage, migration IDs, load results, image digest, and known pre-existing debt.
- [ ] Confirm the diff contains no unrelated user changes and the original workspace is untouched.
- [ ] Build and retain the verified immutable candidate digest.
- [ ] Complete the ownership/evidence matrix: every task has a DRI, independent reviewer/approver, entry evidence, exit command, artifact/checkpoint path, handoff recipient, and rollback owner.
- [ ] Do not claim the production incident fixed yet.

**Authorized production sequence:**

- [ ] Re-run C0 read-only preflight immediately before change.
- [ ] Rotate exposed/default database and service credentials and verify the database port is externally closed.
- [ ] Deploy the containment digest first and prove all REST/GraphQL/subscription/socket hostile probes fail. Record it as rollback floor.
- [ ] Run migrations as a gated job; abort while containment remains serving if migration/readiness fails.
- [ ] Deploy the identity backend to an internal cohort, then Explorers UI only after backend canary passes.
- [ ] Exercise one Google and one manual-email canary according to GATE-U1 and prove one stable projection each.
- [ ] Create content, rename/profile-update one canary, and prove numeric ownership/content/capability stability.
- [ ] Exercise private, unlisted, public, suspend/reactivate, pending deletion, final deletion, and no-recreation behavior.
- [ ] Run reconciliation report-only. Review anomaly/threshold output; do not enable mutation on first run.
- [ ] Monitor ensure errors/latency, token refresh, owner 401/403/409/429/503, DB pool, sockets, entitlement freshness, lifecycle backlog, log redaction, and reconciliation for one full scheduled cycle.
- [ ] Remove deprecated compatibility routes only after access evidence shows zero legitimate use, as a separate cleanup release.

**Rollback:**

- Application failure: return to the exact previous containment-or-newer digest.
- Migration failure before readiness: old containment app continues serving; do not reverse destructive schema changes.
- Client failure: disable new Music entry with the server/cohort flag while secure backend containment remains.
- Upstream Strapi failure: existing unexpired Music credentials continue ordinary owner operations; new ensure/refresh returns typed temporary unavailability.
- Data/lifecycle anomaly: stop reconciler/lifecycle workers, preserve tombstones and audit evidence, and use the repair runbook.
- Never restore unauthenticated sync, X-Username ownership, unrestricted service-token GraphQL, guest owner events, or public database exposure.

**Commit:** chore(music): record verified release evidence

## Definition of done

- [ ] GATE-U1/U2/U3 decisions are explicit and reflected consistently in schema, routes, UX, tests, and docs.
- [ ] Production topology, all runtime tables, rows, history, volume, backup, and restore are proven before clean cutover.
- [ ] Containment closes unauthenticated sync, unrestricted service-token GraphQL, subscription/limit IDOR, username/body/header ownership, guest owner socket events, raw logging, default credentials, and public database access.
- [ ] No rollback can reintroduce those exposures.
- [ ] Immutable user and selected Account identities produce one stable numeric Music owner through first, repeated, concurrent, rename, and profile-update flows.
- [ ] Ordinary owner requests verify a short-lived local Music credential and do not call Strapi.
- [ ] Entitlement is server-derived and independent of identity creation.
- [ ] Every owner REST and socket operation is repository-scoped to the resolved numeric owner.
- [ ] Public/private/unlisted modes, capability rotation, noindex/sitemap, safe 404, and guest limits are verified.
- [ ] Suspension, reactivation, pending deletion, retention, tombstone, retry, and no-recreation survive browser/process failure.
- [ ] Reconciliation launches report-only with locks, validated scans, two misses, thresholds, anomaly aborts, and manual bulk approval.
- [ ] Google and email journeys, accessibility, responsive behavior, concurrency, load, chaos, migration, deploy, rollback, and canary evidence are green.
- [ ] New critical modules have 100% coverage; touched code is type-clean; the repository has no new TypeScript diagnostics.
- [ ] Architecture, API, security, testing, design, deployment, reconciliation, lifecycle, and incident documentation match executable behavior.
- [ ] Production is called fixed only after separately authorized canary and a full monitoring cycle succeed.

---

## Autoplan Phase 1 — CEO/Product Review

Review mode: **SELECTIVE EXPANSION**. The confirmed product direction remains the default: Music is part of Explorers, identity creation is automatic after verified authentication and completed onboarding, and production deployment remains separately authorized. Findings below refine how that direction ships; the one finding that would replace universal onboarding-time provisioning with a just-in-time pilot is recorded as an unresolved user challenge and is not silently applied.

### Step 0A — Premise challenge

| Premise | Evidence and evaluation | Result |
|---|---|---|
| Explorers owns login; Music has no separate consumer signup | Explicitly confirmed by the product owner; current dual-auth/native registration code contradicts the target | **CONFIRMED** for embedded consumer Music |
| Provision after provider/email verification and completed Account onboarding | Prevents orphan/incomplete projections and matches both auth journeys | **CONFIRMED** |
| Immutable Strapi user `documentId` identifies the person | Username/email are mutable and Google explicitly treats email as mutable | **CONFIRMED** as principal identity |
| A Tunes numeric row remains useful | Existing playlists, queue, sessions, analytics, and other foreign keys already depend on it | **CONFIRMED** |
| Creating an identity grants all Music/venue capabilities | Existing subscription/limit flows show that identity and product entitlement are different concepts | **REJECTED** — universal identity does not bypass server-side plan/capability gates |
| One person is permanently the correct owner for every venue/workspace resource | Tunes contains venue, device, staff, analytics, and subscription concepts; future team/multi-venue ownership is plausible | **USER CHALLENGE** — do not redesign ownership without approval; store Account identity now and document the migration seam |
| Every completed user should be provisioned during onboarding | Explicitly confirmed by the product owner; both outside voices recommend JIT-on-first-Music-use instead | **USER CHALLENGE** — original direction remains in force until the final gate |
| The inspected empty production database proves a clean cutover everywhere | The inspection proves the selected database has no app tables, not that no older database/volume/URL exists | **NOT YET PROVEN** — add a mandatory read-only topology/data preflight and abort rule |

### Step 0B — Existing-code leverage map

| Sub-problem | Existing implementation to reuse or replace |
|---|---|
| Explorers authentication state | Reuse `explorers-earth/src/features/Authentication/store/authStore.ts`; normalize its `token`/legacy `jwt` access |
| Onboarding Account gate | Reuse the positive Account-completeness checks in `ProtectedRoute`, Google callback, and `OnBoarding.tsx`; remove duplicate Tunes triggers |
| Tunes API transport | Reuse `explorers-earth/src/lib/localTunesApiClient.ts`; remove `X-Username`, legacy credential login, and owner identifiers |
| Projection persistence | Reuse Tunes numeric `users.id` and dependent foreign keys; replace username lookup and check-then-insert with an atomic repository |
| Route registration/storage | Reuse current Express/storage behavior where owner scoping is sound; remove duplicate embedded handlers and bare-ID mutations |
| Guest policy/rate limits | Reuse the existing `allowSongRequests` policy and limiter; change the locator to unindexed random `guestUrl` only |
| Session/device records | Reuse tables and cleanup behavior, but consumer owner authorization must be based on the exchanged Music identity, not supplied usernames |
| Profile updates | Reuse existing Strapi profile mutations; invalidate one immutable Music resource rather than calling a username-specific patch |
| Deployment | Reuse Docker Compose/GitHub Actions host deployment, but add deterministic migration/readiness and a secure rollback floor |
| Tests | Reuse Vitest/Supertest/Playwright infrastructure and existing 72 Tunes + 720 Explorers passing baseline tests |

### Step 0C — Dream-state delta

```text
CURRENT
  Strapi login
      |
      +--> client sends username/body/X-Username --> unauthenticated Tunes sync
      |                                              |
      |                                              +--> missing DB schema / 500
      |                                              +--> username ownership / IDOR
      +--> duplicated onboarding/profile triggers

THIS PLAN (after review corrections)
  verified Strapi principal + completed Account
      |
      +--> authenticated, bodyless ensure --> atomic Music projection
      |                                      +--> immutable principal + Account seam
      |                                      +--> entitlement evaluated separately
      +--> short-lived Music-scoped credential --> owner routes resolve musicUser.id
      +--> private, unindexed guest capability --> explicit public/guest policy
      +--> guarded reconciliation + tombstone lifecycle --> eventual repair

12-MONTH IDEAL
  Explorers identity platform
      +--> principals + memberships + workspaces + capabilities
      +--> event/outbox lifecycle from the authoritative backend
      +--> Music, Books, Games, Movies consume the same identity contract
      +--> measurable activation, retention, sharing, and paid-feature conversion
```

The reviewed plan establishes a secure Music projection and a reusable identity boundary. It does not yet create a general identity platform, durable Strapi outbox, multi-member workspaces, or validated Music product-market differentiation.

### Step 0C-bis — Implementation alternatives

| Approach | Human / CC effort | Benefits | Risks | Decision |
|---|---:|---|---|---|
| Patch schema + keep username sync | ~2–3d / ~4–6h | Fastest visible 500 fix | Leaves impersonation, rename breakage, drift, and insecure rollback | **Rejected** |
| Secure JIT projection on first Music intent | ~1–2w / ~2–4d | Smaller rollout, lower unused rows, measures demand | Contradicts confirmed onboarding-time universal identity; still needs security/deploy work | **User challenge at final gate** |
| Reviewed local projection + scoped Music credential | ~2–4w / ~5–8d | Complete security boundary, stable ownership, lower Strapi outage coupling | Broad blast radius and operational machinery | **Recommended/default** |
| Consolidate Music into Strapi/Explorers backend | ~1–2mo / ~2–4w | One data/auth plane | Rewrites venue/queue/session/storage behavior and backend is not in this workspace | **Deferred** |
| Durable Strapi outbox/workspace identity platform | ~1–2mo / ~2–3w plus backend ownership | Strong lifecycle and future multi-product reuse | Requires unavailable Strapi backend and new durable infrastructure | **Deferred with explicit seam** |

### Step 0D — Selective-expansion decisions

| ID | Classification | Decision | Why |
|---|---|---|---|
| CEO-D1 | Mechanical | **ACCEPT** security containment as Release 0 and permanent rollback floor | A security fix cannot depend on completion of the full product program |
| CEO-D2 | Mechanical | **ACCEPT** socket and subscription/billing authorization in the owner-security blast radius | Verified active surfaces also trust guest capabilities or caller IDs |
| CEO-D3 | Mechanical | **ACCEPT** identity/entitlement separation | Provisioning a principal must not silently grant paid venue features |
| CEO-D4 | Mechanical | **ACCEPT** production topology, backup, row-count, volume, and historical-URL preflight | The clean-slate migration assumption is otherwise unsafe |
| CEO-D5 | Mechanical | **ACCEPT** removal of guest capability URLs from sitemap/indexing | A URL cannot be both secret capability and intentionally indexed |
| CEO-D6 | Mechanical | **ACCEPT** retention classification plus tombstone-based deletion completion | Immediate deletion of financial/audit rows and browser-only choreography are unsafe assumptions |
| CEO-D7 | Mechanical | **ACCEPT** report-only reconciliation launch, two-miss rule, maximum-change threshold, and manual bulk approval | A valid-but-incomplete upstream result must not mass-suspend users |
| CEO-D8 | Taste | **RECOMMEND** short-lived Music-scoped credential after ensure | Separates ordinary owner availability from live Strapi calls and narrows bearer exposure |
| CEO-D9 | Taste | **RECOMMEND** remove native consumer auth from embedded/owner APIs; retain only separately inventoried admin/internal use | The confirmed one-platform premise should not preserve two consumer identity systems by default |
| CEO-D10 | User challenge | **UNRESOLVED** onboarding-time universal provisioning vs JIT-on-first-use | Both independent voices recommend JIT; the product owner explicitly chose onboarding-time provisioning |
| CEO-D11 | User challenge | **UNRESOLVED** person-owned resources vs Account/workspace ownership | Both voices flag future venue/team mismatch; changing the ownership model is a product architecture decision |

### Step 0E — Temporal interrogation

```text
HOUR 1   Contain: rotate/close DB exposure; disable unsafe sync and caller-owned IDs;
         secure sockets/subscription routes; establish secure rollback floor.
HOUR 2   Foundation: prove production topology; baseline migrations; readiness; identity schema.
HOUR 3   Identity: canonical Strapi gateway; atomic projection; scoped Music token exchange.
HOUR 4   Ownership: convert owner REST/socket/billing routes; preserve private guest behavior.
HOUR 5   Product flow: converge Google/email onboarding, profile refresh, UI states, entitlements.
HOUR 6+  Lifecycle/reconciliation: tombstones, guarded repair, retention, observability, full QA.
```

### Step 0F — Mode confirmation

**SELECTIVE EXPANSION retained.** Correctness and security work within the touched identity/authorization/deployment boundary is accepted. A general workspace platform, Strapi outbox, Music product redesign, or third-party playback strategy is deferred. The two changes that alter the owner's stated product structure remain user challenges.

### Independent CEO voices

#### CLAUDE SUBAGENT (CEO — strategic independence)

The independent review found 4 critical and 7 high-level concerns. Its central argument was to contain the security incident first, then provision an eligible cohort just-in-time and earn lifecycle/reconciliation complexity through measured activation. It also flagged entitlement/consent ambiguity, unproven empty-production assumptions, synchronous Strapi coupling, deletion retention, and mass-suspension risk.

#### CODEX SAYS (CEO — strategy challenge)

The independent model found 13 concerns. It agreed that the plan conflates identity creation with entitlement, preserves dual auth during a clean-slate window, couples Music availability to Strapi, relies on browser lifecycle choreography, omits socket/subscription attack surfaces, indexes guest capability URLs, under-proves the production topology, and lacks business success metrics. It additionally argued that venue resources may belong to an Account/workspace rather than directly to a person.

#### CEO dual-voice consensus

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Premises valid? | Partial | Partial | **CONFIRMED concern** — entitlement, topology, lifecycle premises need correction |
| Right problem? | Security yes; universal rollout challenged | Security yes; product/venue scope challenged | **DISAGREE with owner direction** — user challenge, no silent change |
| Scope calibrated? | Too broad before demand | 158-path program is too broad | **CONFIRMED concern** — split containment from platform rollout |
| Alternatives explored? | JIT/token exchange underexplored | JIT, BFF, token exchange, workspace model underexplored | **CONFIRMED concern** |
| Market/competitive risk? | Product metric and wedge missing | Venue incumbents/platform dependency absent | **CONFIRMED concern** |
| Six-month trajectory? | Bespoke distributed lifecycle debt | Wrong ownership/dual auth/availability debt | **CONFIRMED concern** |

### Section 1 — Architecture review

```text
                         +-------------------------------+
                         | Strapi / Explorers identity   |
                         | user + Account + entitlement  |
                         +---------------+---------------+
                                         |
                     full validation only| ensure/refresh/lifecycle
                                         v
+------------------+   Strapi bearer   +-----------------------+
| Explorers React  |------------------>| Tunes Identity Gateway|
| Google + email   |                   +-----------+-----------+
| onboarding       |                               |
+--------+---------+                               v
         |                              +-----------------------+
         | Music-scoped token           | Atomic Projection     |
         +<-----------------------------| immutable user seam   |
         |                              | + Account/entitlement |
         |                              +-----------+-----------+
         |                                          |
         v                                          v
+------------------+                     +-----------------------+
| Owner REST/socket|-- req.musicUser.id->| Music domain tables   |
| and paid features|                     | playlists/queue/etc.  |
+------------------+                     +-----------+-----------+
                                                       |
random, unindexed guestUrl + explicit policy ----------+
                                                       |
                          +----------------------------v--+
                          | Guarded reconciler/tombstones |
                          | dry-run -> threshold -> mutate |
                          +-------------------------------+
```

State machine:

```text
UNPROVISIONED --verified+onboarded ensure--> ACTIVE
     |                                          |
     | ineligible/incomplete                    | block/deactivate
     v                                          v
  NO CHANGE                                  SUSPENDED
                                                 |
                              fresh verified ensure/reactivate
                                                 v
                                              ACTIVE
                                                 |
                                  prepare delete / tombstone
                                                 v
                                         PENDING_DELETION
                                           |           |
                        Strapi still exists |           | absence confirmed + retention rules
                                  retry/cancel          v
                                           |         DELETED
                                           +--> SUSPENDED

Invalid transitions blocked:
- UNPROVISIONED -> ACTIVE without verification/Account: identity gateway rejects.
- SUSPENDED -> ACTIVE from cached identity: cache bypass + status/version check.
- PENDING_DELETION -> ACTIVE from automatic ensure: tombstone rejects recreation.
- first reconciler miss -> SUSPENDED/DELETED: two-miss + threshold/approval guard.
```

Architecture findings and decisions:

1. **CRITICAL GAP — insecure rollback floor.** Auto-decision: split a containment release that disables forged sync/owner inputs and secures sockets/subscription routes before all later work; no rollback image may predate it.
2. **HIGH — synchronous Strapi dependency on every owner call.** Auto-decision: full Strapi validation happens at ensure/refresh; ordinary owner APIs accept a short-lived, audience-scoped Music credential and still load current local status/version.
3. **HIGH — browser-only deletion saga.** Auto-decision: add a persistent `pending_deletion` tombstone; automatic ensure cannot recreate it, and reconciliation only finalizes after authoritative absence plus retention policy.
4. **HIGH — external Strapi API assumptions.** Auto-decision: gate implementation on a read-only contract probe for `/users/me`, Account GraphQL shape, pagination, permissions, rate limits, and service-token ownership.
5. **TASTE — principal versus workspace ownership.** Store both immutable user and Account document IDs and isolate ownership resolution behind a repository. Do not migrate all domain FKs to workspaces without the final user decision.

Scaling: at 10×, live Strapi validation and the PostgreSQL pool fail first; token exchange removes the steady-state Strapi calls and bounded pools/load gates expose DB pressure. At 100×, reconciliation must stream/page instead of retaining an unbounded upstream set, and socket fan-out/rate limiting requires dedicated qualification. Strapi, PostgreSQL, and the host deployment remain single points of failure; readiness, scoped credentials, retry budgets, and documented degradation cover them, but multi-region/high availability is outside this release.

Rollback posture: additive migrations remain; roll back application containers only to the secure containment image, keep the frontend kill switch server-independent, disable new ensure/token exchange via a server flag if needed, and never restore username/body authorization.

### Section 2 — Error and rescue registry

| Method/codepath | Failure/class | Rescued? | Action | User sees |
|---|---|---:|---|---|
| migration runner | connection/auth/SQL/migration checksum | Yes | fail closed; do not start app; preserve old image | No rollout; operator gets exact migration ID/code |
| readiness check | DB unavailable/schema missing | Yes | return 503 without stack/SQL | Temporary unavailable |
| production topology preflight | unexpected DB/volume/rows/backups absent | Yes | abort clean-cutover path | Deployment blocked before mutation |
| `/users/me` validation | missing/malformed token, 401/403, timeout/5xx, malformed JSON | Yes | typed 401/403/503; bounded retry only for transient errors | Sign in again or temporary unavailable |
| Account GraphQL lookup | timeout, GraphQL errors, no/ambiguous/incomplete Account | Yes | typed `ONBOARDING_REQUIRED`/`IDENTITY_CONFLICT`/503 | Finish onboarding, contact support, or retry |
| token exchange | signing-key missing, mint/verify/expiry/audience/version failure | Yes | fail closed; short-lived token; refresh through ensure | Reconnect/retry, never silent fallback |
| projection upsert | unique conflict, deadlock, pool outage | Yes | deterministic conflict result; bounded DB retry; rollback | Conflict or temporary unavailable |
| owner resolver | projection missing/suspended/tombstoned/cross-user ID | Yes | 401/404/409; no fallback to caller identity | Sign in, setup pending, or unavailable |
| guest resolver | invalid/indexed/unknown URL, private policy, suspension, rate limit | Yes | 404/429; no owner detail | Not found or retry later |
| lifecycle prepare/finalize | Tunes failure, Strapi failure, browser exit, retry | Yes | persistent tombstone, idempotency, retry state | Specific retry action without internals |
| reconciler | partial page, schema/filter drift, per-user conflict, threshold exceeded | Yes | abort mutation; report; quarantine conflict | No end-user bulk change; operator alert |
| client ensure | network/503/abort/navigation/Strict Mode duplicate | Yes | React Query dedupe + bounded retry; onboarding remains committed | Small recoverable Music status |
| profile refresh | Tunes unavailable after Strapi save | Yes | keep profile success; retry Music refresh | Profile saved; Music catches up |
| socket/subscription route | invalid credential, wrong guest role/owner ID | Yes | reject event/request; audit-safe metric | Unauthorized/not found |

Catch-all handlers may map unknown errors on…4984 tokens truncated…Events, tracing, panels, alerts, and safe admin CLI specified |
| Deployment | Containment-first, topology-gated sequence and secure rollback flow specified |
| Long term | Reversibility 3/5; Account/workspace/outbox seams documented |
| Design | UI scope confirmed; provisioning invisible when healthy; complete states required |
| Independent voices | Claude: 11 findings; Codex: 13 findings; 5/6 dimensions share a concern |
| Scope proposals | 9 accepted/recommended; 2 user challenges; 7 explicit non-scope items |

### Phase 1 unresolved decisions

1. **USER CHALLENGE:** retain automatic post-onboarding provisioning (owner's confirmed direction) or change to JIT-on-first-Music-use as both independent CEO voices recommend.
2. **USER CHALLENGE:** retain person-owned Music rows for this release or redesign around Account/workspace ownership before any users exist.

**Phase 1 status:** review complete with two user challenges intentionally held for the final approval gate. Proceeding to the dedicated design review under the original confirmed direction.

---

## Autoplan Phase 2 — Design/UX Review

### Step 0 — Design scope assessment

UI scope is **targeted APP UI flow/state work**, not a visual redesign. The authoritative references are `docs/design-system/design.md` and `docs/design-system/01-design-tokens.md`: the Music workspace must remain compact, content-first, evergreen/charcoal, Poppins-based, minimally chromed, and consistent with the persistent Explorer shell. Existing primitives to reuse include `Button`, `Modal`/`ConfirmationModal`, `tabs`, `RouteLoader`, `OnboardingCheckError`'s recoverable-error pattern, existing toast infrastructure for user-initiated confirmations, and the current Music dashboard/player/content layout.

Initial design completeness: **3/10**. The original plan named the right broad states but left hierarchy, copy, state precedence, entitlement/publication separation, responsive behavior, accessibility, and lifecycle recovery for implementers to invent.

No visual mockup generation is required: no new navigation or visual language is being introduced. The wire-level specifications below deliberately constrain changes to existing components and tokens. Post-implementation browser design QA remains required.

Prior learning applied: `prod-userdata-creds-leak-live` and `tunes-user-leak-9-sites` (confidence 9/10) reinforce that public/guest error and success UI must never assume the server may safely return a raw user row.

### Independent design voices

#### CLAUDE SUBAGENT (design — independent review)

Initial score **3/10**. It found 4 critical, 6 high, and 2 medium gaps: frontend tasks existed before exact UX acceptance criteria; the two product challenges alter the journey; entitlement variants were undefined; deletion still described the obsolete browser saga; hierarchy/state precedence/copy were vague; public states could leak lifecycle; and responsive/accessibility behavior was unscheduled.

#### CODEX SAYS (design — UX challenge)

The independent model agreed that the plan served backend implementation rather than user goals, mixed identity/entitlement/publication state, left core interaction behavior unnamed, contradicted the tombstone lifecycle, and omitted responsive/accessibility acceptance criteria. It recommended private/unlisted/public as three distinct publication modes and argued that the two product challenges must be resolved before frontend implementation.

#### Design consensus and litmus scorecard

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Information hierarchy explicit? | No | No | **CONFIRMED gap** |
| Loading/empty/error/success/partial complete? | No | No | **CONFIRMED gap** |
| Journey coherent? | Breaks on later Music surprise | Breaks on identity/entitlement ambiguity | **CONFIRMED gap** |
| UI specific rather than generic? | No | No | **CONFIRMED gap** |
| Responsive intentional? | No | No | **CONFIRMED gap** |
| Accessibility enforceable? | No | No | **CONFIRMED gap** |
| Product unmistakable in first screen? | Music can be | Current technical language obscures it | **CONFIRMED correction** — user copy says only “Music” |
| One strong visual anchor? | Existing player/artwork | Existing dashboard can provide it | **CONFIRMED reuse** |
| Scannable by headings? | Not yet | Not yet | **CONFIRMED correction** |
| Cards necessary? | Only for content | Avoid new status-card mosaic | **CONFIRMED** |
| Motion improves hierarchy? | Status only | Respect reduced motion | **CONFIRMED** |
| Premium without shadows? | Yes | Yes | **CONFIRMED** |

Both voices also repeated the two product-direction challenges. They remain unresolved until the final user gate; the detailed design below uses the owner's current default—automatic post-onboarding identity—while keeping its state model reusable if the trigger changes to first Music intent.

### Pass 1 — Information architecture (3/10 -> 10/10)

Constraint worship: every Music surface gets exactly three top-level priorities.

```text
AUTH / ONBOARDING
  1. Complete the Explorer Account/subscription flow already in progress
  2. Confirm completion and navigate normally
  3. Start invisible Music identity work; never add a Tunes step or password

OWNER MUSIC WORKSPACE
  1. Persistent Explorer shell + page title “Music”
  2. One primary Music action (ready-empty: “Create your first playlist”)
  3. Inline identity/entitlement status OR Music content, never contradictory panels

MUSIC SETTINGS / SHARING
  1. Visibility mode (Private / Unlisted / Public)
  2. Mode-specific explanation and link/preview
  3. One save/publish action

PUBLIC / GUEST
  1. Music owner/workspace public identity only after a valid public route resolves
  2. Public playlists and allowed guest action
  3. Rate-limit/request-policy feedback

ACCOUNT LIFECYCLE
  1. One Explorer-level action and consequence
  2. Persistent progress/pending state
  3. Retry/support or completion destination; never expose “Strapi vs Tunes”
```

The current `ConnectedAccounts` “Local Tunes connection” panel, password modal, Connect/Disconnect actions, and `Local Tunes Integration` hero are removed. Visibility/link controls move to Music sharing/settings. “Open full Local Tunes dashboard” is either renamed “Open Music workspace” with seamless auth or removed if it exposes native login.

### Pass 2 — Interaction-state coverage (2/10 -> 10/10)

State is modeled on four independent axes so an active-but-unentitled user never sees an identity error and a private page never looks like a billing problem.

```text
IDENTITY:     unknown -> setting_up -> ready -> retrying -> conflict
                    \-> onboarding_required / auth_expired / suspended
                    \-> pending_deletion -> deleted

ENTITLEMENT:  unknown | included | eligible | entitled | revoked
              (core read/write is included for all; only fresh entitled authorizes premium mutation)

PUBLICATION:  private | unlisted_capability | public_discoverable

CONTENT:      loading | ready_empty | ready_content | stale_content | failed
```

Precedence contract, highest first:

```text
pending deletion/deleted
  > suspended
  > authentication expired
  > onboarding incomplete
  > terminal identity conflict
  > entitlement unknown (nonblocking for core Music)
  > retryable identity setup failure
  > content loading/failure/empty/ready
```

| State | Surface and exact user-facing treatment | Primary action | Content visibility |
|---|---|---|---|
| Identity setting up | One inline `role=status` row immediately below “Music”: “Setting up Music…” | None; automatic | Shell remains; no false empty state |
| Identity retrying/offline/503 | Inline alert: “Music is taking longer than expected. Your Explorers account is ready.” | “Try again” | Previously cached content may remain read-only with “May be out of date” |
| Retry exhausted | Same placement: “Music is temporarily unavailable.” | “Try again”; secondary “Get help” after repeated failures | Safe cached content read-only; mutations disabled |
| Auth expired | Recoverable auth panel: “Sign in again to continue with Music.” | “Sign in” | No private content |
| Onboarding required | “Finish your Explorer profile to use Music.” | “Finish profile” | No Music content |
| Identity conflict | “We couldn’t finish setting up Music for this account.” | “Get help”; do not loop retry | No conflicting account detail |
| Suspended | “Music is unavailable while your Explorer account is deactivated.” | Existing account reactivation path | No owner/private/public content |
| Pending deletion | Persistent full-page account state: “Account deletion is in progress.” | “Check status”/safe retry after SLA; support | Music mutations and publication disabled immediately |
| Entitlement unknown | Short skeleton only within gated capability, not whole Music | Automatic refresh | Free/allowed content remains |
| Included / eligible / entitled / revoked | No whole-page entitlement status. Core Music remains available. `eligible` is not inferred as upgrade-required and `revoked` is not inferred as paused/read-only. A separately gated premium control follows only the server `paidMutation` decision. | Existing core actions | Full core content remains |
| Content loading | Existing Music skeleton beneath stable title/actions | None | No duplicate identity spinner |
| Ready empty | Title “Create your first playlist”; one sentence; primary “Create playlist”; no premium secondary action without a future capability contract | Create | N/A |
| Ready content | Existing Music dashboard | Existing actions | Full |
| Stale content | Existing content plus compact “May be out of date” status | Retry | Read-only until ownership/token refresh succeeds |
| Public unknown/private/suspended | Identical “Music page unavailable” 404 screen | Return to Explorers | No identity leak |
| Valid public owner, zero public playlists | “No public playlists yet.” | Return to Explorer profile | Public owner/workspace identity may remain |
| Guest rate limited | “Too many requests. Try again in {duration}.” | Retry after server-provided time | Public content remains |

Background profile-to-Music convergence is silent on success. A failure never changes the profile-save result; only a later Music surface shows stale/retry state.

### Pass 3 — User journey and emotional arc (3/10 -> 9/10)

| Step | User does | Intended feeling | Design support |
|---|---|---|---|
| 1 | Signs up with Google or email | Familiar, trustworthy | Existing Explorer auth only; no Tunes mention |
| 2 | Verifies email/provider | Secure | No Music row before eligibility |
| 3 | Completes onboarding/subscription | Finished | Existing completion feedback and immediate normal navigation |
| 4 | Background identity succeeds | Uninterrupted | No toast, modal, or connection ceremony |
| 5 | Opens Music | Oriented | Explorer shell, “Music,” one primary action/content |
| 6 | Creates/imports playlist | Capable | Existing workspace controls; entitlement explained only where relevant |
| 7 | Shares | In control | Private/unlisted/public modes are explicit and reversible |
| 8 | Encounters outage | Reassured | Explorer account remains ready; calm inline retry; cached content safe |
| 9 | Renames/profile updates | Confident | No reconnect; stable content and link semantics |
| 10 | Deactivates/deletes | Informed and safe | One-system language, persistent progress, clear completion/recovery |

5 seconds: the first Music viewport reads as Music content/action, never infrastructure. 5 minutes: playlist creation/sharing works without a second identity. 5 years: users remember one Explorer identity and predictable privacy controls. Score remains 9/10 until the provisioning trigger and ownership-unit challenges are explicitly decided.

### Pass 4 — AI-slop risk (8/10 -> 10/10)

Classifier: **APP UI**. No new hero, card grid, gradient, decorative icon circles, centered marketing copy, or “all-in-one” language. Status is a compact inline row/alert, not a large rounded card. Existing player/artwork remains the visual anchor. Headings use utility language (“Music,” “Create your first playlist,” “Sharing”), and buttons use action verbs. No UI copy may contain Local Tunes, integration, provisioning, projection, ensure, sync, database, Strapi, or token.

### Pass 5 — Design-system alignment (5/10 -> 9/10)

- Reuse `Button`, `Modal`/`ConfirmationModal`, existing tabs, toast infrastructure, and recoverable inline-error patterns.
- Use `--dash-bg`, `--dash-sidebar-bg`, `--dash-muted`, `--dash-accent`, `--dash-text`, and status semantic tokens; no new raw hex values.
- Use Poppins and the existing dashboard type scale. Body/error copy is at least 16px where required by the review hard rule; no new 10px status/tab labels.
- Use 4/8/16/24px spacing and existing radii; status does not introduce a decorative shadow.
- Loading uses one relevant skeleton; no identity spinner and content skeleton at the same time.
- Error copy always contains the user problem and recovery action, never raw technical detail.

The remaining one-point gap is pre-existing design-token debt (focus outlines, duplicate colors, tab typography) outside this feature's direct diff. This feature must not worsen it.

### Pass 6 — Responsive and accessibility (2/10 -> 10/10)

Responsive contract:

| Width | Required behavior |
|---|---|
| 320/375px | Single-column Music content; title/status remain visible below mobile header; primary action full-width; tabs horizontally scroll with visible selected state and no 10px labels; dialogs become safe-area-aware near-full-height sheets |
| 640px | Lists/forms stack; player and primary action precede secondary controls; sharing modes remain one-column |
| 768px | Existing hinge to Explorer bottom navigation/sidebar behavior; status stays within content, never behind sticky chrome |
| 1024px+ | Existing dashboard density; status width follows content column; no page-level centered card |

Accessibility acceptance:

- Setup/retry/recovery changes use `role="status"` with polite `aria-live`; terminal errors use `role="alert"` once, without repeated retry announcements.
- Dialogs trap focus, set meaningful initial focus, return focus to the invoking control, close by documented escape behavior, and label title/description.
- Retry moves focus to the resulting status only when initiated by the user; automatic recovery does not steal focus.
- Tabs use semantic tab roles and arrow-key behavior; playlist/song reordering has keyboard controls and announces position changes.
- Every target is at least 44×44px; focus indicators remain visible; text contrast is at least 4.5:1; state is never color-only.
- Skeletons are hidden from assistive technology with one textual loading status; animation honors `prefers-reduced-motion`.
- Add automated axe checks plus keyboard-only Playwright flows at 375px and desktop.

### Pass 7 — Resolved and unresolved design decisions

| Decision | Resolution |
|---|---|
| Product name in UI | “Music” only; Local Tunes remains an internal service name |
| Healthy provisioning feedback | Silent |
| Status placement | Directly below Music title, above primary action/content; never global toast spam |
| Onboarding failure behavior | Account/onboarding success remains; Music retry is contextual later |
| Settings placement | Remove Tunes from Connected Accounts; put visibility/link under Music sharing/settings |
| Ready-empty primary action | “Create playlist”; do not infer a premium secondary action from the five-value entitlement enum |
| Public privacy | Private and suspended look identical to unknown; unlisted link is always noindex; public discovery uses a separate explicit route/action |
| Lifecycle language | One Explorer account; never name the two backend systems |
| Ownership/provision trigger | **Unresolved user challenges**; frontend work cannot begin until final gate records the choices |

No mockups were generated. The existing UI direction is retained and the ASCII/state specifications are the approved reference.

### Design implementation tasks

- [ ] **DES-T1 (P1, human: ~1d / CC: ~2h)** — state model — Implement one state-precedence selector across identity, the existing five-value entitlement contract, publication, lifecycle, and content. Do not invent paused/quota/read-only/upgrade mappings without a future versioned authoritative contract.
  - Surfaced by: Pass 2 — independent axes currently risk contradictory UI.
  - Files: `MusicIdentityStatus`, Music page/dashboard hooks, lifecycle/settings state.
  - Verify: exhaustive unit table plus integration cases for overlapping states.
- [ ] **DES-T2 (P1, human: ~1d / CC: ~2h)** — Music entry — Replace all connection/integration/password UI with the exact Music hierarchy and copy matrix.
  - Surfaced by: Passes 1/4 — current page teaches a second-account mental model.
  - Files: `Music.tsx`, `MusicDashboard.tsx`, `ConnectedAccounts.tsx`, Music settings/sharing.
  - Verify: component tests reject banned terms and assert primary actions/status placement.
- [ ] **DES-T3 (P1, human: ~1d / CC: ~2h)** — sharing/privacy — Implement private, unlisted, and public/discoverable as distinct modes.
  - Surfaced by: Pass 2 — capability links cannot be indexed public routes.
  - Files: public Music route, SEO/sitemap, visibility controls, server policy.
  - Verify: noindex/sitemap/404 disclosure, durable same-command replay after a lost response, conflict/expiry without mutation, and publish/unpublish E2E.
- [ ] **DES-T4 (P1, human: ~1d / CC: ~2h)** — lifecycle — Replace backend-specific compensation UI with persistent pending-deletion UX.
  - Surfaced by: Passes 2/3 — closing/reloading must preserve one-system recovery.
  - Files: Settings lifecycle UI, lifecycle status API/query, confirmation components.
  - Verify: reload/multi-tab/stalled/completed deletion browser flows.
- [ ] **DES-T5 (P1, human: ~1d / CC: ~2h)** — accessibility/responsive — Add semantic status/dialog/tab/reorder behavior and narrow-viewport acceptance.
  - Surfaced by: Pass 6 — current plan had no enforceable a11y/mobile contract.
  - Files: Music status/dialog/tabs/reorder UI and Playwright specs.
  - Verify: axe, keyboard-only, reduced-motion, 375px and desktop E2E.

### Design NOT in scope

- Rebranding or visually redesigning the Music dashboard — retain the established dashboard expression.
- New design tokens or broad remediation of existing token debt — use current authoritative tokens and do not add drift.
- Marketing/landing-page work, animations, or decorative empty-state illustration.
- Multi-venue/team management screens — depends on the unresolved ownership challenge.

### Design: what already exists

Reuse the persistent Explorer shell, dashboard colors/type/spacing, Music player/artwork, `Button`, `Modal`/`ConfirmationModal`, tabs, toast system, loaders/skeleton patterns, and recoverable route-error behavior. Remove or rewrite the existing Local Tunes connection hero, password modal, Connected Accounts block, direct full-dashboard login link, and 10px compressed tab treatment where touched.

### Design completion summary

| Pass | Before | After |
|---|---:|---:|
| Information architecture | 3/10 | 10/10 |
| Interaction states | 2/10 | 10/10 |
| Journey/emotional arc | 3/10 | 9/10 |
| AI-slop resistance | 8/10 | 10/10 |
| Design-system alignment | 5/10 | 9/10 |
| Responsive/accessibility | 2/10 | 10/10 |
| Decisions | 8 unspecified | 8 specified; 2 cross-phase user challenges remain |
| Overall | **3/10** | **9/10 conditional** |

**Phase 2 status:** design-complete for the existing product direction, conditional on resolving the two product challenges before frontend implementation. Five design tasks were added; no aesthetic taste decision requires a mockup.

## Autoplan Phase 3 - Engineering Review

**Verdict:** BLOCKED before rewrite; conditionally implementation-ready only after this canonical task sequence replaces the contradictory Tasks 1-20 and GATE-U1/U2/U3 are resolved at the final user gate.

### Dual-review consensus

The fresh engineering reviewer and the Codex engineering reviewer independently agreed on the following release blockers:

| Priority | Confirmed problem | Evidence | Canonical correction |
|---|---|---|---|
| P0 | Subscription and quota routes accept caller identities and use a Strapi service token | tunes/server/routes/subscriptionRoutes.ts:22-28; tunes/server/controllers/subscriptionController.ts:293-365, 520-580, 629-718 | C1 and C6 authenticate, derive principal/entitlement, and add cross-user matrices |
| P0 | The public GraphQL proxy falls back to STRAPI_ACCESS_TOKEN for arbitrary operations | tunes/server/routes/index.ts:80-107 | C1 removes it; C6 permits typed endpoints only |
| P0 | Guest sockets bypass session checks, join owner rooms, and broadcast player_state; socket origin is permissive | tunes/server/legacy-routes.ts:5671-5677, 5683-5700, 5714-5755, 5771-5778 | C1 defines containment roles; C5/C6 implement token-bound owners and request-only guests |
| P0 | JWT authorization decodes without verification and trusts header/query/body identity | tunes/server/jwt-auth-middleware.ts:44, 67-83, 95-101, 123; tunes/server/auth-bridge-routes.ts:16-29 | C1 deletes the trust paths; C5 establishes one verified principal |
| P1 | Accepted Music token architecture had no executable mint/verify/refresh/rotation/revocation task | Old Task 6 versus Phase 1 token decision | C5 defines exact claims, TTL, storage, refresh, rotation, revocation, and outage behavior |
| P1 | Durable tombstone was prose-only while old tasks still hard-deleted in a browser saga | Old Tasks 9/15 versus Phase 1 pending-deletion decision | C3 schema plus C7 durable lifecycle |
| P1 | One syntactically valid truncated upstream scan could mass-suspend users | Old Task 10 | C8 report-only, lock, validated scan, two misses, thresholds, approval |
| P1 | Drizzle schema omits runtime tables used by handwritten SQL | tunes/shared/schema.ts; tunes/server/storage.ts:852-895 | C0 manifest plus C3 complete migration and route-family smoke |
| P1 | Current deployment rebuilds mutable source with downtime and cannot restore an exact digest | .github/workflows/tunes.yml:19-29, 85-88; tunes/docker-compose.yml:2-9 | C2 immutable digest, readiness, old-app continuity, secure rollback floor |
| P1 | Ensure can amplify Strapi calls under same-token or invalid-token storms | Old gateway/cache design | C4 IP/fingerprint limits, single-flight, connection cap, retry budget, circuit breaker |
| P1 | TypeScript baseline was scheduled after changes | Old Task 18 | C0 captures it before implementation and proves the CI rejection path |
| P1 | Selected Account was not persisted and browser code chooses accounts[0] | explorers-earth/src/components/AuthSyncManager.tsx:93-114 | C3 persists selected Account; C4 selects/pins it server-side |
| P1 | Logging exposes more than bearer data, including registration payloads, user rows, guest URLs, and upstream errors | tunes/server/app.ts:98-113, 135-139; explorers-earth/src/services/localTunesService.ts:127-203; tunes/server/storage.ts:260-295; tunes/server/legacy-routes.ts:5722, 5763-5768 | C1 redaction boundary and log-capture tests |
| P2 | Capability-link rotation and distributed legacy error disclosure were unspecified | public/SEO and subscription/controller surfaces | C6 capability rotation; C1/C6 typed safe errors |

### Engineering decisions auto-applied

- Replaced all prior numbered implementation tasks with one canonical dependency-ordered sequence.
- Added a security-containment release before feature work and made it the permanent rollback floor.
- Added explicit removal of the arbitrary GraphQL service-token proxy.
- Added explicit socket, subscription, native-session, database-exposure, and redaction work.
- Added a complete code-to-table runtime manifest before migration authoring.
- Added exact Music credential claims, ten-minute lifetime, in-memory client storage, key overlap, sessionVersion revocation, and Strapi-outage semantics.
- Added single-flight, rate limiting, upstream concurrency bounds, retry budget, and circuit breaking.
- Added a selected Account ID, durable lifecycle/tombstone fields, entitlement freshness, and reconciliation counters to schema requirements.
- Added advisory locking, validated pagination, two misses, thresholds, zero-write anomaly abort, and manual bulk approval.
- Moved the full TypeScript baseline to the first task and required zero new diagnostics.
- Corrected the plan from React 19/Express 4 to React 18/Express 5 runtime with Express 4 type debt.

### Required reuse and removal

**Reuse:** numeric Tunes user IDs and domain foreign keys; PostgreSQL; Vitest/Supertest/Playwright; authenticated native sessions only for explicitly standalone routes; Explorers auth store and HTTP infrastructure; existing Music dashboard/player; existing UI primitives; guest request-policy/rate-limit concepts; Apollo/React Query after identity normalization.

**Remove or replace:** unauthenticated sync and username lookup; jwt.decode; X-Username/body/query owner authorization; unrestricted GraphQL service-token proxy; caller-selected subscription identities; guest player_state; duplicate legacy owner handlers; embedded native Music login/registration/password flows; accounts[0] selection; sessionStorage provisioning flags; raw identity/credential/capability logging; public/default-credential database; SCP mutable source deployment and docker compose down.

### Engineering test pyramid

1. Unit: critical pure modules at 100% coverage.
2. Contract: Strapi identity, Account, entitlement, pagination, and lifecycle fixtures.
3. Real PostgreSQL: migrations, transactions, owner predicates, concurrency, lifecycle, and reconciliation.
4. REST/GraphQL/Socket security: hostile credential, cross-user, role, event, and origin matrices.
5. Client/component: ensure/token refresh/state precedence/copy.
6. Full browser: Google and email, chosen trigger, rename, sharing, lifecycle, outage, accessibility, responsive behavior.
7. Load/chaos: amplification, concurrency, pool pressure, sockets, upstream/DB failure, truncation, deadlock, rotation, browser exit.
8. Deployment: immutable image, migration/readiness failure, exact rollback digest, private database, secure rollback floor.
9. Canary: both auth paths, stable content, publication, lifecycle, report-only reconciliation, and one full monitoring cycle.

### Workstream parallelism and conflict control

- C0 evidence and C1 containment tests/code can proceed in parallel after the implementation session starts.
- C2 deployment and C3 schema can proceed in parallel only after C0 and the user gates; they touch different primary areas.
- C6 domain conversion and C7 lifecycle can split after C5, but shared route/schema files require explicit ownership and sequential integration.
- C9 frontend may start only after the C5 contract and all user gates are fixed.
- C10-C12 are integration/release phases and remain sequential.
- A single worktree is retained. If subagents are used during implementation, each receives non-overlapping file ownership and the main agent integrates after focused tests.

### Engineering completion summary

| Area | Before | After canonical rewrite |
|---|---:|---:|
| Task consistency | 2/10 | 10/10 |
| Auth/security coverage | 3/10 | 10/10 |
| Schema/migration completeness | 4/10 | 9/10, conditional on C0 inventory |
| Lifecycle/reconciliation safety | 3/10 | 10/10 |
| Availability/performance | 4/10 | 9/10, budgets measured in C10 |
| Deploy/rollback | 2/10 | 10/10 |
| Testability | 6/10 | 10/10 |
| Overall readiness | BLOCKED | 9/10 conditional on user gates and C0 proof |

**Unresolved engineering blockers:** GATE-U1 and GATE-U2 change schema, trigger, UX, and tests and therefore remain human decisions. GATE-U3 must also record product entitlement, but it does not change immutable identity mechanics. Production topology and upstream contracts remain untrusted until C0 proves them.

No implementation code was changed during engineering review.

---

## Autoplan Phase 4 - Developer Experience Review

**Verdict:** BLOCKED before DX corrections; 9/10 and executable after incorporating the golden path, authority map, command/error contracts, documentation sequencing, ownership model, and DX measurement into C0-C12. Product-dependent work remains behind the final user gate.

### Eight-pass dual-review scorecard

| Pass | Before | After corrections |
|---|---:|---:|
| Getting started | 2/10 | 10/10 |
| API/CLI design | 3/10 | 10/10 |
| Error messages/debugging | 4/10 | 9/10 |
| Documentation/learning | 3/10 | 10/10 |
| Upgrade/migration | 4/10 | 9/10 |
| Environment/tooling | 3/10 | 10/10 |
| Maintainability/ownership | 5/10 | 9/10 |
| DX measurement | 2/10 | 10/10 |
| Overall | 4/10 | 9/10 conditional |

Both the fresh DX reviewer and Codex DX reviewer independently confirmed:

- No clean-checkout command could create the fixture Strapi, disposable PostgreSQL, Tunes, Explorers, and browser state needed before C10.
- The proposed PowerShell runner could not be the Ubuntu CI authority.
- Root and Tunes Compose plus tunes.yml and tunes-deploy.yml represented competing production/development authorities.
- .nvmrc/package engines require Node 22/22.12+, while current getting-started material says Node 18+.
- Typed errors lacked a stable REST/socket wire envelope, request ID, operator lookup path, and generated client contract.
- Preflight, migrations, reconciliation, and test runners lacked stable flags, JSON output, exit codes, signal cleanup, checkpoints, and resume validation.
- Environment examples omitted Music signing/rotation, fixture, test database, circuit/rate-limit, cohort/kill-switch, migration, and reconciliation controls.
- Test scope was comprehensive but had no exact fast/PR/nightly/release commands or time budgets.
- Documentation was scheduled after implementation, while current docs still teach X-Username, db:push as setup, manual-only Tunes verification, and obsolete runtime/deploy paths.
- CI path ignores would allow documentation-only contract regressions to bypass validation.
- Ownership, review, evidence, handoff, checkpoint, and rollback roles were unspecified.
- Developer setup success, time-to-green, runtime, flake, cleanup/resume, fixture drift, and documentation drift were not measured.

### DX decisions auto-applied

- C0 now delivers the portable fixture harness and implementation playbook before feature code.
- The safe default is fixture mode. Live Strapi access requires explicit mode and a read-only credential.
- Root commands are implemented in portable Node/TypeScript; shell-specific wrappers cannot contain separate orchestration logic.
- The minimum golden path is:

      nvm use
      npm ci
      npm run music:bootstrap -- --mode fixture
      npm run music:doctor -- --mode fixture
      npm run music:up -- --mode fixture --detach --wait
      npm run music:test:smoke -- --mode fixture
      npm run music:down -- --mode fixture

- music:bootstrap installs root and both child lockfiles and creates disposable secrets.
- music:doctor validates Node >=22.12, npm, Compose v2, ports, disk, environment schema, fixtures, recorded gates, and database safety with actionable recovery.
- CLI exit codes are stable: 0 success, 1 verification failure, 2 usage/config, 3 prerequisite/state mismatch, 4 dependency unavailable, 5 safety refusal, and 130 interruption.
- Human and JSON output share one versioned result schema. Interrupts write an atomic checkpoint; resume rejects mismatched code, fixture, gate, schema, threshold, or environment state.
- music:down preserves volumes by default and requires exact isolated-project confirmation for volume deletion.
- REST, Socket.IO, and CLI diagnostics share stable codes and correlation IDs. Route schemas generate OpenAPI/client types.
- C2 declares one test Compose, one production Compose, and one active deployment workflow; competing definitions are retired and guarded by drift tests.
- C3 provides guarded database status/migrate/verify/reset commands with production-target refusal.
- C8 provides report-only reconciliation with explicit apply/approval, JSON schema, checkpoint, and resume.
- Test lanes are fast <=3 minutes, PR <=15 minutes, nightly <=45 minutes, and release <=60 minutes until measured baselines ratchet them.
- Documentation begins in C0 and changes with each contract-owning task. C11 verifies/publishes rather than reconstructing.
- Documentation-only changes run contract CI.
- The ownership matrix records DRI, reviewer/approver, entry/exit evidence, start/finish commands, artifacts, checkpoints, handoff, and rollback owner.
- Release evidence includes cold/warm time-to-first-green, setup/smoke success, stable failure codes, p50/p95 runtime, flakes, cleanup/resume success, fixture age/drift, documentation failures, and compatibility-route use.

### Developer-facing error contract

REST and socket failures use:

    {
      "error": {
        "code": "IDENTITY_UNAVAILABLE",
        "message": "Music is temporarily unavailable.",
        "action": "retry",
        "retryable": true,
        "requestId": "uuid"
      }
    }

X-Request-Id is returned and propagated through sanitized logs, upstream calls, database context, sockets, traces, and CLI evidence. Retry-After is required where the server knows a retry window. Raw upstream details, identity data, and secrets never enter the envelope.

### DX implementation tasks folded into canonical work

| DX task | Canonical owner |
|---|---|
| Portable golden path and fixture stack | C0 |
| One workflow/Compose authority map | C2 |
| Shared error envelope and request IDs | C1, C4-C6 |
| Stable CLI/JSON/exit/checkpoint/resume contracts | C0, C3, C8, C10 |
| Validated dev/test environment examples and doctor | C0 |
| Fast/PR/nightly/release command and budget matrix | C10-C11 |
| Playbook and documentation alongside code | C0-C11 |
| Ownership/evidence/handoff/rollback matrix | C0, C12 |
| DX measurement and post-implementation devex review | C10-C12 |

### DX completion summary

- Fresh-checkout target: <=10 minutes cold, <=5 minutes warm to deterministic Music smoke.
- Supported execution: Windows and Ubuntu CI through one implementation.
- Safety: fixture-default, live-explicit, test-DB allowlist, project-label verification, guarded destructive commands.
- Debugging: stable codes, request/run IDs, human and machine output, recovery commands, sanitized artifacts.
- Continuity: atomic checkpoints, validated resume, per-task evidence, named handoffs.
- Documentation: executable from C0, contract-tested on every relevant change.
- Measurement: setup, time-to-green, runtime, flake, recovery, fixture, docs, and compatibility metrics.

The gstack JSONL task ledger was not produced because jq is unavailable and the autoplan skill forbids hand-written JSONL. The Markdown plan and dedicated engineering test artifact remain the authoritative review records.

No implementation code was changed during DX review.

---

## Autoplan final review summary and approval gate

| Phase | Initial verdict | Result after grooming |
|---|---|---|
| CEO/product | Over-scoped and security containment delayed | Containment-first, topology-gated, entitlement-separated, rollback floor, guarded lifecycle/reconciliation |
| Design | 3/10 | 9/10 conditional; complete states, hierarchy, copy, privacy, lifecycle, responsive and accessibility contracts |
| Engineering | BLOCKED | 9/10 conditional; one canonical C0-C12 sequence, complete security/schema/token/lifecycle/deploy/test model |
| Developer experience | 4/10 | 9/10 conditional; portable golden path, command/error contracts, authority map, docs and evidence |

Plan outputs:

- 13 canonical implementation tasks with explicit dependencies, files, steps, tests, acceptance, commits, rollout, and rollback.
- Unit, contract, migration, real-PostgreSQL, REST/GraphQL/session, Socket.IO, component, Google/email E2E, accessibility, responsive, load, chaos, deployment, rollback, and canary verification.
- Architecture, API, security, testing, design, deployment, lifecycle, reconciliation, incident, and developer-playbook documentation.
- A separate detailed engineering test artifact under the gstack project directory.

### Final user challenges - resolved 2026-08-13

1. Provisioning trigger - **A selected**:
   - A: automatically after verified authentication and completed onboarding, matching the original product direction.
   - B: just in time on first Music intent, recommended by both independent CEO voices to reduce unused rows and lifecycle burden.
2. Ownership unit - **A selected**:
   - A: person-owned Music for this release, while persisting the immutable selected Account ID and keeping a future workspace migration seam.
   - B: Account/workspace-owned Music now; choosing this requires regenerating C3-C9 before implementation.
3. Entitlement - **A selected**:
   - A: core personal Music is included for every eligible Explorer; venue/admin/premium capabilities remain separately server-gated.
   - B: all Music capability remains plan-gated even when identity exists.

The selected release model is automatic post-onboarding provisioning, person-owned Music with an immutable Account context seam, and universal core personal Music with server-gated premium/venue capabilities. Product-dependent implementation may proceed under this model. Production mutation remains separately gated.
