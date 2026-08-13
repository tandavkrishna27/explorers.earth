# Explorers Music Identity and Provisioning Design

**Date:** 2026-08-13
**Status:** Proposed for implementation-plan review
**Related investigation:** `memory/2026-08-13-local-tunes-sync-investigation.md`

## 1. Purpose

Make Music a reliable built-in capability of every verified, fully onboarded Explorers account. Google and manual-email authentication must converge on the same provisioning and authorization path. Mutable profile fields must remain synchronized without changing the Music owner identity or losing playlists.

This is a clean cutover. There are no production Music users or data to migrate, match, preserve, or backfill.

## 2. Success criteria

1. A Google user who completes onboarding can open Music without a second registration or Tunes-specific setup.
2. A manual-email user is provisioned only after email verification, authenticated login, and completed onboarding.
3. Repeated and concurrent provisioning requests create exactly one Music user.
4. Username, email, and Explorers account-name changes update the same Music row and preserve its numeric ID and guest URL.
5. Deactivated users cannot use private Music APIs or public guest access. Reactivation restores the same Music identity.
6. Permanent Explorer account deletion removes its Music user and all dependent Music data immediately.
7. No owner endpoint authorizes a request using a username supplied by the browser.
8. Production deployment creates and migrates the database before the new application version becomes ready.
9. A failed migration or unhealthy application fails the deployment without silently reporting success.
10. Unit, contract, database integration, concurrency, security, frontend, E2E, migration, deployment, failure-injection, and production-canary tests cover the flow.

## 3. Non-goals

- Migrating or matching existing Music users; none exist.
- Introducing Kafka, Redis, RabbitMQ, or a general-purpose event platform.
- Replacing the Tunes numeric primary key used by playlists, songs, sessions, and analytics.
- Rewriting the standalone/local Tunes authentication model outside the routes used by embedded Explorers Music.
- Synchronizing Music-owned preferences such as theme and guest-control toggles back to Strapi.
- Repairing all pre-existing Tunes TypeScript errors in unrelated legacy UI and admin modules.
- Merging the old `database-change` branch wholesale. Its migration research may be reused selectively against current `origin/main`.

## 4. Source-of-truth boundaries

### Strapi / Explorers owns

- Immutable Explorer user identity: `documentId`.
- Numeric Strapi user ID used by the JWT subject.
- Authentication provider and email-verification state.
- Username.
- Email address.
- Account name shown as the Music venue/display name.
- Onboarding completion.
- Blocked/deactivated state.
- Permanent account existence.

### Tunes owns

- Numeric Music user ID.
- Stable random public `guestUrl`.
- Playlists, playlist songs, queue, history, sessions, analytics, and guest interactions.
- Music preferences: theme and the `allow*` controls.

### Consistency model

- Server-side `ensure` makes Strapi-owned profile fields converge synchronously when called.
- Ensure is triggered after onboarding, after profile changes, after authenticated login, and when Music opens.
- An hourly reconciliation job repairs missed calls or temporary outages.
- Music-owned settings are never overwritten by an ensure operation.
- Stale browser payloads cannot overwrite canonical identity fields because Tunes ignores them and fetches current data directly from Strapi.

## 5. Approaches considered

### Selected: secure local projection

Keep the Tunes numeric user and add an immutable unique Strapi identity. Tunes validates the Strapi token, loads canonical Strapi data, and atomically upserts the local Music projection.

This fits the existing application boundaries, preserves Music foreign keys, avoids new infrastructure, and supports rename/update behavior cleanly.

### Rejected for this phase: Strapi webhook/outbox

A durable Strapi outbox would improve immediate event delivery, but the Strapi backend source is not in this workspace. Adding a queue also exceeds what is required when authenticated ensure calls and reconciliation provide eventual convergence.

### Rejected: key all Music data directly by Strapi document ID

This would require changing most Music tables and storage APIs while providing no additional user-visible value for the current goal.

## 6. Target architecture

```text
Google OAuth ─────────┐
                     ├─> Strapi JWT ─> completed onboarding ─┐
Email verification ──┘                                      │
                                                            v
                                                   POST /api/auth/ensure
                                                            │
                                                            v
                                           Validate bearer token with Strapi
                                                            │
                                                            v
                                         Fetch canonical user + account details
                                                            │
                                                            v
                                      Atomic upsert by strapi_user_document_id
                                                            │
                                                            v
                                       Stable Tunes ID + stable random guest URL
                                                            │
                                                            v
                                                  Embedded Music dashboard
```

All authenticated Music owner routes use a common identity middleware:

```text
Bearer JWT
   │
   v
Strapi current-user validation
   │
   v
immutable documentId
   │
   v
Tunes user lookup
   │
   v
req.musicUser.id ──> playlist/song/settings ownership
```

`X-Username`, query-string username, and body username may remain temporarily as ignored compatibility input while the client rollout completes, but they never participate in authorization.

## 7. Database design

Add these columns to `tunes.users`:

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `strapi_user_document_id` | text | unique, nullable for native Tunes users | Immutable Explorer identity |
| `strapi_user_id` | text | indexed, nullable | Numeric Strapi/JWT identity for diagnostics and re-resolution |
| `auth_source` | text | not null, default `local` | `local` or `strapi` |
| `status` | text | not null, default `active` | `active` or `suspended` |
| `last_synced_at` | timestamp | nullable | Reconciliation and support visibility |

Constraints:

- A Strapi-provisioned row must have `strapi_user_document_id`.
- `strapi_user_document_id` is the only upsert conflict target for Explorer identities.
- Username and email may stay unique because there are no existing users, but all canonical values are normalized consistently before persistence.
- `guest_url` remains random, unique, and unchanged by identity/profile updates.
- `updated_at` and `last_synced_at` are explicitly advanced on a successful canonical update.

The migration is generated from the current `origin/main` schema and committed under `tunes/migrations/`. It must create the entire empty-database schema and the identity fields in a deterministic order.

## 8. Strapi identity gateway

Create one server module responsible for all Strapi identity resolution.

### Input

- `Authorization: Bearer <Strapi JWT>`.

### Validation

1. Reject missing or malformed bearer headers with 401.
2. Call Strapi's authenticated current-user endpoint using that same bearer token.
3. Query the user's account fields needed for onboarding and Music projection.
4. Validate the remote response with Zod.
5. Reject unconfirmed manual-email users with 403.
6. Reject blocked users with 403.
7. Reject users without a fully completed account with 409 `ONBOARDING_INCOMPLETE`.

Google-authenticated users are treated as email-verified by the authoritative Strapi provider/confirmation response. The server does not trust a provider value sent by the browser.

### Cache

- Cache successful identity resolution by a SHA-256 token fingerprint for no more than 30 seconds.
- Never store or log the bearer token itself.
- Do not cache 401, blocked, or malformed responses.
- A cache hit returns the canonical identity but still loads the local Tunes user by immutable document ID.
- Deactivation may therefore take at most 30 seconds to affect a previously validated token; explicit suspension occurs before the Strapi block mutation when deactivation originates from Explorers settings.

### Error contract

The gateway returns typed errors only:

| Code | HTTP | Meaning |
|---|---:|---|
| `AUTH_REQUIRED` | 401 | Missing/malformed token |
| `AUTH_INVALID` | 401 | Strapi rejected or could not validate token |
| `ACCOUNT_SUSPENDED` | 403 | User is blocked/suspended |
| `EMAIL_UNVERIFIED` | 403 | Manual email is not confirmed |
| `ONBOARDING_INCOMPLETE` | 409 | Required Account fields are absent |
| `IDENTITY_CONFLICT` | 409 | Canonical unique data conflicts unexpectedly |
| `UPSTREAM_UNAVAILABLE` | 503 | Strapi timed out or returned transient failure |
| `DATABASE_UNAVAILABLE` | 503 | PostgreSQL is unavailable |

Raw SQL, tokens, stack traces, emails, or request bodies are not returned to clients.

## 9. Provisioning service

Replace browser-supplied `syncUser(strapiUser)` with:

```ts
ensureMusicUser(identity: CanonicalStrapiIdentity): Promise<MusicUser>
```

The implementation uses one PostgreSQL `INSERT ... ON CONFLICT (strapi_user_document_id) DO UPDATE` operation.

### Insert behavior

- Store immutable Strapi IDs.
- Set username, normalized email, and account name from canonical Strapi data.
- Generate the random guest URL exactly once.
- Set `password` to a non-login sentinel compatible with the existing schema; Strapi rows cannot authenticate through the native password flow.
- Set `auth_source = 'strapi'`, `status = 'active'`, and `is_email_verified = true`.
- Apply normal default Music settings.

### Update behavior

- Update username, email, account/venue name, Strapi numeric ID, `status = 'active'`, timestamps, and no other fields.
- Preserve numeric Tunes ID, guest URL, playlists, queue, history, and Music preferences.

### Concurrency guarantee

Any number of simultaneous ensure requests for the same `documentId` return the same row. There is no preflight find-then-insert race.

## 10. API contracts

### `POST /api/auth/ensure`

- Requires a valid Strapi bearer token.
- Accepts no identity body.
- Resolves canonical identity and atomically creates/updates the Music projection.
- Returns `{ success: true, user: SanitizedMusicUser }`.
- Is safe to retry.

The existing `/api/auth/sync` becomes a temporary authenticated alias to the same handler so the server can deploy before the frontend. It ignores `strapiUser` if one is sent. The alias is removed after production verification.

### `GET /api/auth/user-data`

- Requires a valid bearer token.
- Resolves the current user by immutable Strapi ID.
- Does not accept a username lookup.

### Owner Music APIs

Every owner-only endpoint used by `MusicDashboard` receives `requireMusicUser` and uses `req.musicUser.id`. This includes:

- playlist list/create/update/delete/visibility;
- playlist-song add/delete/reorder/import;
- queue song add/delete/reorder/bulk delete/history;
- currently-playing state;
- user/Music settings;
- device/session APIs used by embedded Music;
- YouTube/Spotify import operations that mutate a user's data.

Resource routes validate both the resource ID and `user_id = req.musicUser.id`; knowing another playlist/song ID never grants access.

Public guest routes remain scoped only by random `guestUrl`, but return 404 when the owning user is suspended.

### Lifecycle APIs

Add authenticated, idempotent endpoints:

- `POST /api/auth/suspend` — marks the current Music user suspended.
- `POST /api/auth/reactivate` — canonical ensure reactivates after Strapi authentication succeeds.
- `DELETE /api/auth/user` — deletes the current Music user and all dependent Music data transactionally.

Suspension occurs before Explorers blocks the Strapi user. If the Strapi block mutation then fails, Explorers calls reactivation/ensure as compensation. Permanent deletion stops and shows an actionable error if Music deletion fails; it does not orphan Music data silently.

## 11. Referential deletion

The existing schema largely uses foreign keys without database-level cascading, and `storage.deleteUser` contains a manual multi-table transaction. For this clean cutover:

- Keep one tested transactional `deleteMusicUser(userId)` service as the deletion authority.
- Enumerate and delete all dependent tables in foreign-key order.
- Roll back the entire transaction on any failure.
- Ensure `DELETE /api/auth/user` can be repeated: an already-absent Music row returns success.
- Add integration tests for every dependent table so new Music tables cannot be added without extending the deletion contract.

## 12. Explorers client flow

### Authentication and onboarding

Manual email:

```text
register -> verify email -> login -> onboarding -> ensure Music -> home
```

Google:

```text
Google callback -> onboarding -> ensure Music -> home
```

Onboarding account creation remains the transaction that decides whether onboarding is complete. The Music call follows it and is non-blocking:

- success stores/reconciles the public guest URL;
- transient failure does not undo onboarding;
- a retry is scheduled through the normal query client;
- the next authenticated session and Music page retry automatically.

### Deduplication

Create one client `ensureMusicUser()` service and one React Query resource keyed by `['music-user', user.documentId]`.

- Remove provisioning from `Home`'s `useTunesDashboard` path.
- `AuthSyncManager` ensures only after a positive onboarding-complete query.
- Music consumes the same cached/in-flight ensure operation instead of initiating an independent request.
- React Strict Mode and multiple components share one request promise.
- The sessionStorage `localtunes_sync_done` flag is removed; server idempotency and React Query own retry/deduplication.

### Profile changes

After Strapi confirms a username, email, or Account_Name update:

- invalidate and refetch the `music-user` ensure query;
- never call a Tunes username-specific mutation;
- never roll back the Strapi profile merely because a non-critical Music refresh failed;
- show a non-alarming retry state only if the user immediately opens Music and ensure is still unavailable.

### Access gate

- Remove `/music` and `/recommendations/music` from routes allowed during incomplete onboarding.
- Remove `localtunes_integrated` as a Music entitlement gate.
- Continue using `public_music` only as a public-profile visibility preference.
- The local Tunes integration flag may remain as an emergency frontend kill switch, not a per-user enrollment field.

## 13. Reconciliation

Implement an authenticated internal reconciliation command in Tunes, not a public browser endpoint.

```text
scheduled GitHub Action or server cron
    -> list completed, unblocked Strapi accounts with service token
    -> page through results
    -> ensure each Music projection by documentId
    -> suspend local Strapi rows absent/blocked upstream
    -> emit summary metrics and non-PII conflict identifiers
```

Requirements:

- Hourly execution.
- Pagination with an explicit bounded page size.
- Idempotent restart after interruption.
- Per-user failure isolation; one failure does not abort the remaining page.
- Dry-run mode for production validation.
- Nonzero exit for systemic failure or unresolved identity conflicts.
- No automatic creation for incomplete or unconfirmed accounts.

Since there are no initial users, the first production reconciliation should report zero rows before synthetic canary accounts are created.

## 14. Database migration and deployment

### Migration lifecycle

1. Modify `shared/schema.ts`.
2. Run `drizzle-kit generate` against the current schema.
3. Commit and review generated SQL and metadata.
4. Run the migration against a disposable empty PostgreSQL database in CI.
5. Run it a second time to prove idempotent no-op behavior.
6. Start the application only after migration success.

`drizzle-kit push` is not used in production.

### Container changes

- Do not publish PostgreSQL to `0.0.0.0`. Prefer no host port; if operations require one, bind only to `127.0.0.1`.
- Remove default production credentials. `DB_PASS` is mandatory.
- Add PostgreSQL healthcheck and make migration depend on database health.
- Add a one-shot `migrate` Compose service built from the same application image.
- Copy migrations into the production image.
- Add `/health/live` for process liveness and `/health/ready` for required-schema/database readiness.
- Remove POST-body logging and redact authorization headers and PII.

### Deployment order

```text
upload code
  -> validate required secrets
  -> start/confirm database health
  -> build application image
  -> run one-shot migration service
  -> start new application
  -> wait for /health/ready
  -> run authenticated synthetic canary
  -> report success
```

The workflow must not use `docker compose down`; database uptime and volume attachment remain intact across application deploys.

### Rollback

- The initial migration is additive and safe for the prior server version.
- If migration fails, do not restart the application.
- If readiness or canary fails after application restart, redeploy the previously tagged image while keeping the additive schema.
- Never attempt an automatic destructive down migration.
- Capture app/migration logs as deployment artifacts or retained server logs.

### Production security operations

- Rotate the database password before the fixed deployment.
- Remove the existing public database port from firewall/security-group and Docker exposure.
- Rotate any secret that may have used the compose defaults.
- Verify externally that the PostgreSQL port is closed.

## 15. Observability

Structured server logs include:

- request ID;
- route and status;
- Strapi document-ID hash, not email or bearer token;
- ensure outcome: `created`, `updated`, `unchanged`, `suspended`, `deleted`;
- upstream and database latency;
- typed error code.

Metrics/counters:

- ensure attempts and outcomes;
- ensure p50/p95/p99 latency;
- Strapi validation failures and upstream timeouts;
- database errors and identity conflicts;
- reconciliation scanned/succeeded/failed/suspended totals;
- readiness failures;
- deployment canary failures.

Alerts:

- sustained `/api/auth/ensure` 5xx/503 rate;
- any migration failure;
- any identity conflict;
- reconciliation systemic failure;
- readiness failure after deploy.

## 16. Testing strategy

### 16.1 Schema and migration tests

- Apply all migrations to a brand-new PostgreSQL 15 database.
- Assert all schema tables exist.
- Assert identity columns, indexes, unique constraint, defaults, and status constraint.
- Run migrations a second time and assert no change/error.
- Start readiness check before migration and assert it fails.
- Apply migration and assert readiness succeeds.
- Verify the production image contains migrations and can run the one-shot migration command.

### 16.2 Unit tests

Identity gateway:

- parses a valid bearer header;
- rejects missing/malformed header;
- validates and maps Google and manual-email responses;
- rejects unconfirmed email, blocked, incomplete, malformed, and missing accounts;
- maps Strapi 401/403/404/429/5xx/timeout to the defined contract;
- caches only successful resolution;
- hashes cache/log keys and never records raw tokens;
- expires cache entries after 30 seconds.

Provisioning mapping:

- canonical username/email normalization;
- account name maps to venue name;
- Music-owned settings are excluded from updates;
- sanitized response exposes no password, OTP, token, internal Strapi service token, or status metadata not needed by clients.

Client:

- bodyless ensure call uses the authenticated API client;
- correct auth-storage token property is inspected;
- React Query key is immutable-document-ID based;
- retry policy retries 503/network failures but not 401/403/409;
- Apollo cache entities include stable identifiers or explicit merge policy so current-user queries do not warn.

### 16.3 Real-PostgreSQL integration tests

- First ensure creates one row.
- Second ensure returns the same row.
- Username update changes the same row.
- Email update changes the same row.
- Account-name update changes venue name.
- Numeric Music ID and guest URL remain stable through all updates.
- Music preferences and playlists remain unchanged.
- Suspend blocks owner and public guest access.
- Reactivate restores the same row.
- Permanent delete removes every dependent-table record in one transaction.
- Injected deletion failure rolls the transaction back.
- Unique conflicts return `IDENTITY_CONFLICT`, not raw PostgreSQL text.

### 16.4 Concurrency tests

- Send 20 and 50 parallel ensure calls for the same Strapi identity.
- Assert every successful response has the same Music ID and guest URL.
- Assert exactly one database row exists.
- Run parallel ensure calls with old and new client body usernames; assert canonical Strapi data wins.
- Run ensure concurrently with profile-field updates and assert a final ensure converges to the newest canonical state.

### 16.5 API contract and security tests

- `/api/auth/sync`, `/ensure`, user-data, and every owner route require authentication.
- Tampered, unsigned, expired, and random JWTs fail.
- Forged `strapiUser`, `X-Username`, query username, or body username cannot impersonate another user.
- User A cannot list, update, delete, reorder, import into, or play User B's playlist/song IDs.
- Suspended user tokens fail owner APIs.
- Suspended guest URLs return 404 without revealing suspension/account existence.
- Error bodies contain no SQL, stack, token, password, OTP, email verification token, database URL, or email address.
- Logs contain no bearer token or request-body PII.
- Ensure and lifecycle endpoints have rate limits that do not block normal duplicate rendering/retry behavior.
- CORS permits the production Explorers origin and rejects an unapproved origin.

### 16.6 Failure-injection tests

- Strapi timeout and connection reset return 503 and recover on retry.
- Strapi 429 preserves retry semantics without unbounded client storms.
- PostgreSQL unavailable returns 503 and readiness fails.
- Migration failure prevents application rollout.
- Music ensure failure after onboarding leaves onboarding complete and later succeeds.
- Suspension succeeds but Strapi block fails: compensation reactivates Music.
- Music deletion fails: Explorer deletion stops with an actionable retry state.
- Reconciliation continues after one malformed or failing account.

### 16.7 Explorers component and integration tests

- Google callback without Account redirects to onboarding and does not provision early.
- Verified email login without Account redirects to onboarding.
- Final onboarding submits Account once and starts one ensure operation.
- Strict Mode double effects still produce one in-flight ensure call.
- Home and Music sharing the resource do not duplicate ensure.
- Music route redirects incomplete users to onboarding.
- Completed users no longer depend on `localtunes_integrated`.
- Profile rename/email/account-name success invalidates Music identity.
- Profile update remains successful when Music refresh is temporarily unavailable.
- Deactivate, compensation, reactivate, and delete UI paths follow the lifecycle contract.

### 16.8 Browser E2E tests

Mocked deterministic CI flows:

1. Google auth -> onboarding -> Music loads -> create playlist -> add/reorder/delete song.
2. Manual email verification -> login -> onboarding -> Music loads.
3. Rename username/account name -> reload -> same guest URL and playlist remains.
4. Deactivate -> owner API denied and guest URL hidden -> reactivate -> same playlist returns.
5. Permanent deletion -> login fails and Music data is absent.
6. Tunes unavailable during onboarding -> onboarding completes -> later Music retry recovers.
7. Forged username and resource-ID attempts fail.

Local full-stack E2E uses disposable Strapi fixtures or a contract stub plus real Tunes PostgreSQL. Production E2E is limited to dedicated synthetic canary accounts and reversible content.

### 16.9 Performance tests

- Measure cold ensure latency with Strapi call and warm latency with validation cache.
- Set initial service target: p95 warm ensure under 300 ms and p95 cold ensure under 1.5 s, excluding an acknowledged upstream outage.
- Verify dashboard polling does not validate with Strapi on every five-second playlist refresh.
- Load-test 50 concurrent first-time provisions and 200 cached authenticated reads without duplicate rows or connection-pool exhaustion.
- Reconciliation processes paginated accounts without unbounded memory growth.

### 16.10 Deployment and production canaries

Pre-deploy:

- Docker Compose renders with mandatory secrets.
- Database has no public host binding.
- Migration service exits zero twice on disposable PostgreSQL.
- Unit, integration, concurrency, security, frontend, E2E, build, and scoped type checks pass.

Post-deploy:

- `/health/live` and `/health/ready` pass.
- External PostgreSQL port scan fails to connect.
- Create a synthetic Google account and a verified-email account.
- Complete onboarding and confirm one Music row per account.
- Create a playlist, rename the account, and confirm ID/guest URL/playlist stability.
- Deactivate/reactivate one canary and permanently delete the other.
- Verify database state and delete remaining canary data.
- Monitor logs and error metrics for at least one full reconciliation run.

## 17. CI quality gates

The root workflow gains a Tunes job backed by a disposable PostgreSQL 15 service.

Required gates:

- migrations on empty database;
- Tunes unit tests;
- Tunes real-database integration and concurrency tests;
- authentication/authorization security tests;
- scoped TypeScript compilation for new/modified identity modules;
- Tunes production build;
- Explorers lint, typecheck, unit tests, and production build;
- Music Playwright E2E;
- Docker Compose config validation and no-public-Postgres assertion;
- secret scan and dependency audit according to the repository's existing policy.

The current full Tunes `npm run check` remains visible as a known failing baseline until separately repaired. No new error may be introduced in modified files, and the scoped identity typecheck must be green.

## 18. Documentation updates

Update as part of the implementation, not afterward:

- Root `CLAUDE.md`: one-platform identity model, commands, migration workflow, and test commands.
- `explorers-earth/CLAUDE.md`: bodyless ensure flow, onboarding gate, client deduplication, lifecycle behavior.
- `tunes/CLAUDE.md`: immutable Strapi identity, authenticated route model, migration and reconciliation commands.
- `docs/architecture.md`: replace the two-account interpretation with the Explorer identity -> Music projection diagram.
- `docs/adr/002-auth-strategies.md`: supersede the insecure username/JWT mapping with server-side Strapi token introspection.
- New ADR: immutable external identity with local numeric Music primary key.
- `docs/tunes/database.md`: identity columns, generated migrations, delete lifecycle, and local/test database commands.
- `docs/tunes/security.md`: verified-token flow, authorization rules, cache window, public-guest suspension, logging redaction.
- `docs/tunes/deployment.md`: migration service, readiness, rollback, secret rotation, and port isolation.
- `docs/explorers-earth/integrations.md`: Google/email convergence, onboarding timing, retry and consistency rules.
- `docs/environment-variables.md` and `tunes/.env.example`: required database/Strapi/reconciliation variables without real secrets.
- Swagger/OpenAPI: ensure, lifecycle, error contracts, authorization, and removed username parameters.
- Operations runbook: migration failure, Strapi outage, database outage, reconciliation failure, identity conflict, account deletion retry.
- Test documentation: exact unit/integration/E2E/canary commands and disposable-database safety rules.
- Delete or clearly supersede stale Neon and `db:push` production guidance.

Documentation has CI assertions where practical: command existence, migration directory presence, OpenAPI generation/validation, and environment-variable example validation.

## 19. Delivery slices

The work is split into independently testable slices:

1. **Database and deployment foundation:** migrations, private PostgreSQL, mandatory credentials, migration service, readiness.
2. **Canonical identity foundation:** Strapi gateway, immutable schema fields, atomic ensure, sanitization.
3. **Owner authorization cutover:** common middleware and every embedded Music owner route.
4. **Explorers provisioning cleanup:** onboarding/login/Music deduplication and route gates.
5. **Profile and lifecycle convergence:** profile refresh, suspend/reactivate/delete compensation.
6. **Reconciliation and observability:** scheduled repair, metrics/logs, runbook.
7. **Full-system qualification:** browser E2E, load/failure tests, production canary, documentation validation.

Each slice is deployed only after its own test gates pass. The server compatibility alias allows slices 2–4 to deploy without an unsafe frontend/backend ordering dependency.

## 20. Acceptance checklist

- [ ] Empty production database is migrated automatically.
- [ ] PostgreSQL is not reachable publicly and credentials are rotated.
- [ ] Google and verified-email users provision only after onboarding.
- [ ] Ensure is authenticated, bodyless, idempotent, and atomic.
- [ ] Every owner Music route derives ownership from immutable authenticated identity.
- [ ] Username/email/account-name edits preserve Music ID, guest URL, and data.
- [ ] Deactivate/reactivate/delete behave consistently across both stores.
- [ ] Duplicate frontend triggers are removed/deduplicated.
- [ ] Reconciliation and operational alerts exist.
- [ ] All test layers and CI gates in Section 16–17 pass.
- [ ] Documentation in Section 18 is updated and reviewed.
- [ ] Production synthetic Google and email canaries pass and are cleaned up.
