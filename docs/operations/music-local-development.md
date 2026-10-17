# Local Music development: gated operational runbook

## Current implementation checkpoint — 2026-08-30

The approved isolated-backend implementation supersedes the historical inventory below. Policy, guarded provisioning/check, and API-only startup commands exist and passed task-scoped independent review, including the Windows-root correction and shutdown fix rounds. Do not use the old broad `dev:tunes` startup as a workaround. Full live Music/UAT and the final whole-branch review are not complete.

The frontend was restarted from the assigned worktree and verified in Chrome at `http://localhost:5173/settings`, logged in as the test account. Saved Music visibility is **Off**; it has not been changed. A served HTML page is not proof of Music/backend readiness.

The first provisioning attempt safely refused Windows packaged-app folder redirection. The reviewed correction now resolves the canonical private root through OS token/package evidence, retaining path/ACL checks. The subsequent approved provisioning created the dedicated container `explorers-local-music-pg15`, volume `explorers-local-music-pg15-data`, private manifest and independent local secret files, and database `explorers_music_local_uat` on `127.0.0.1:55433`. Runtime privilege-denial probes and canonical migrations passed. A restart of this exact owned container preserved its instance, migration and schema checksums; check still reports `databaseReady:true`.

Local startup is now verified with the user-authorized protected lifecycle proof file outside the repository. Read-only HTTPS GraphQL returned one test user and account; the runtime immutable-ID proof returned `present`. This proves required read access, not that the token lacks write permissions; administrative scope still needs confirmation. Rotate it after testing because it was supplied in chat. No token value is stored here or in frontend configuration.

The canonical check returned ready/databaseReady. The API listens on literal `127.0.0.1:5000`; `/health/live` and `/health/ready` returned200. Native auth, analytics publishing, reactivation and playlist imports remain disabled. Entry status returned kill switches on, cohort disabled and owner/guest workspaces off. Frontend5173 and dedicated DB55433 remain running. Fullstack proxy and Music UI UAT remain pending. Existing5432 and unrelated containers were untouched; no shared account setting, Strapi/RDS write, commit, push or deployment occurred.

### Current safe continuation

1. Resolve the manifest through the OS helper; do not construct a path from caller environment or use the old logical alias:

```powershell
$localIdentity = (& powershell.exe -NoProfile -NonInteractive -File .\tunes\scripts\music-local-private-files.ps1 identity | ConvertFrom-Json)
if (-not $localIdentity.ok) { throw 'Local identity refused' }
$localManifest = Join-Path $localIdentity.localAppData 'ExplorersMusicLocal\profile-uat-20260830\manifest.json'
npm run music:local:check -- --manifest $localManifest
```

2. Obtain separately authorized dedicated read-only lifecycle proof access. The existing proof query reads only `usersPermissionsUser(documentId)` and `account(documentId)` document IDs via HTTPS GraphQL. Verify actual permission behavior; do not infer it from a token label. Supply a protected file, never a pasted token or VITE variable. Do not change Strapi code.
3. Validate the supplied file and explicit immutable test cohort, update protected local configuration without replacing generated secrets, then use `music:local:start`. Missing proof must continue to refuse startup.
4. Only after real API readiness, configure the existing server-only loopback Vite proxy with logical origin `https://music.localhost`; preserve and record restoration of frontend config. Live settings/publication changes need action-time confirmation because Strapi data is shared. Capture and restore the Music-Off baseline.

Detailed PASS/FAIL/BLOCKED evidence: `docs/qa/2026-08-30-explorers-local-backend-verification.md`.

## Historical pre-implementation inventory

The following records the initial investigation, not the current availability of commands. At that time no launcher, provisioner, target validator, package command, credential, database, or role had been created.

Binding scope: `docs/superpowers/plans/2026-08-30-music-restoration-remaining.md`, Global constraints and corrected Task 1; `docs/superpowers/specs/2026-08-30-music-restoration-investigation.md`. Work only on `codex/profile-settings-tabs-rebase-20260828` in its existing worktree. Preserve unrelated dirty files. Do not commit, push, deploy, edit Strapi, or use a real account as part of preflight.

## Historical non-secret evidence (before implementation)

| Check | Observed result |
| --- | --- |
| Branch / source SHA | `codex/profile-settings-tabs-rebase-20260828` / `0327c51bb47b3de7aa4bcf4ade8744ad160f44ac`; dirty worktree, not a clean-release claim |
| Listener inventory | `127.0.0.1:5173`: node, PID 43940; `127.0.0.1:5432`: com.docker.backend, PID 23264 |
| Absent relevant listeners | 5000, 55432, 55000, 55173, 51337 at inspection time |
| Backend local sources | `tunes/.env`, `tunes/.env.local`, `tunes environment/`, and `explorers environment/` absent in this worktree; current agent process has no inspected Music/database/Strapi/session/cookie keys |
| Other ignored sources | `explorers-earth/.env` present; `.env.music.test` present but empty. Neither is a configured live Tunes environment |
| Frontend configuration | API/REST URLs are same-origin relative; Music origin is `http://localhost:5000`, local Tunes enabled. Vite `/api` and `/graphql` proxy to `http://77.42.95.255:1337` in current source |
| Protected authorities | Required live file-reference keys absent in inspected sources. No credential files opened, contents validated, or ACLs attested. This does not claim credentials are absent everywhere on disk |
| Database readiness | No approved effective target/credential/ownership proof. Existence, authentication, schema, and role readiness NOT CHECKED; no database connection made |
| Source migration contract | `0021_explorers_analytics_receipts`; source checksum `1affade4f5e897896bf1ba939f1975963b26d6c67ee131d5e83fef9af7bfb3ee`. This is not an applied-database checksum |

The listener owners do not establish the identity of the serving checkout or database. The current agent process environment is not an inspection of the running Vite process environment. Earlier legacy-database observations are not reused as current readiness evidence.

## Existing entry points and their limits

| Existing interface | Scope / operational limit |
| --- | --- |
| `npm run dev` in `tunes` | Executes `tsx --watch server/index.ts`; dotenv loads `.env` from working directory. Not safe to run under this preflight |
| `npm run dev:tunes` at root | Delegates to Tunes dev; has the same limits |
| `npm run start` in `tunes` | Production entry; not the local loopback recipe. Production containment rejects loopback database URLs |
| `resolveMusicIdentityRuntimeConfig` | Validates identity, secret files, trust proxy, and live HTTPS allowlist/DNS. Does not create identities. Full validation can read protected files and resolve DNS; do not dump its return object |
| `resolveMusicDatabaseConnection` | Reads protected password and constructs credentials in memory. Rejects ambient `DATABASE_URL`; does not enforce the exact local database/host target. Its host syntax rejects `::1` |
| `readMusicRuntimeRoleGraph` / `validateMusicRuntimeRoleGraph` | Catalog-only role graph inspection and pure validation; candidates for a later approved read-only connection |
| `inspectMusicDatabase` / `verifyMusicDatabase` | Read schema/journal/checksums, with an advisory lock; no migration DDL. Not run without an approved exact target, credentials, ownership, and bounded connection/lock policy |
| `verifyMusicRuntimeDatabaseConnection` / `verifyMusicRuntimeLogin` | NOT read-only preflight: they attempt denied CREATE, ALTER, DROP, TRUNCATE and DML operations inside rollback probes, plus role switching. Require separate activation/probe authorization |
| `validateMusicStartupEnvironment` | Calls the above active runtime verifier and derives `DATABASE_URL` into its environment object; do not use as a read-only inventory command |
| `server/deployment/run-migration-gate.ts` | Existing deployment entry performs migrations, role/privilege changes and attestation-file writes; no exact local-target/ownership/apply guard. Not a safe local preflight command |
| Root `music:bootstrap`, `music:doctor`, `music:up`, `music:db:*` | Existing fixture workflow, not a live-account local-backend substitute. Database commands require `--target test` and the exact fixture target; the workflow writes artifacts and bootstrap/configuration state |
| `music:local:check`, `music:local:provision`, `music:local:start` | UNAVAILABLE in root and Tunes package scripts. Do not run or implement them under this task |

## Required protected configuration categories

All names below are absent from the inspected backend activation sources unless explicitly noted. Presence is not validity or permission. Keep secret values and private credential paths out of reports, shell arguments, logs, screenshots, Vite variables, and tracked files. Do not copy a legacy `.env` or reuse deterministic fixture authorities with real Strapi.

| Category | Required interface / rule |
| --- | --- |
| Runtime and target | `MUSIC_MODE=live`; an explicitly approved local non-production runtime; `MUSIC_DATABASE_HOST`, `MUSIC_DATABASE_PORT`, `MUSIC_DATABASE_NAME`, `MUSIC_DATABASE_USER`, `MUSIC_DATABASE_MIGRATOR_USER`, `MUSIC_DATABASE_PASSWORD_FILE`. `DATABASE_URL` must be absent before the existing resolver derives it |
| Migrator / runtime separation | Migrator invocation uses its own `MUSIC_DATABASE_USER` and `MUSIC_DATABASE_PASSWORD_FILE`; the existing migration gate additionally consumes `MUSIC_RUNTIME_DATABASE_USER` and `MUSIC_RUNTIME_DATABASE_PASSWORD_FILE`. No superuser runtime and no runtime role equal to migrator, `postgres`, or `music_runtime` |
| Music bearer signing | `MUSIC_TOKEN_CURRENT_KID`, `MUSIC_TOKEN_CURRENT_SECRET_FILE`, `MUSIC_TOKEN_LIFETIME_SECONDS=600`, `MUSIC_TOKEN_CLOCK_SKEW_SECONDS` (0–30). Inline live `MUSIC_TOKEN_CURRENT_SECRET` is forbidden. Previous KID/file/exact-UTC expiry are optional only as a valid complete rotation set |
| Lifecycle absence proof | Dedicated `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE`, distinct from broad access authority. Verify permitted read-only immutable user/account queries before use; do not generate, widen, or substitute a token when missing |
| Publication response encryption | `MUSIC_PUBLICATION_RESPONSE_CURRENT_KID`, `MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE`; canonical base64url 256-bit material, distinct KID/material/file from other authorities. Optional previous KID/file/exact-UTC expiry must be complete, with positive overlap no greater than 24 hours |
| Public identifiers | `MUSIC_PUBLIC_ID_HMAC_KEY_FILE`; dedicated canonical base64url 256-bit material, no inline live key, distinct from signing/publication/upstream/database authorities |
| Session / cookie / existing Strapi compatibility | `SESSION_SECRET`, `COOKIE_SECRET`, `STRAPI_ACCESS_TOKEN`, `STRAPI_JWT_SECRET`. Existing consumers use environment values, not automatic `*_FILE` loading for these names. A protected operator-controlled injection mechanism is therefore still needed; do not invent a loader or use development fallback secrets |
| Upstream transport and browser origin | `STRAPI_URL`, `MUSIC_STRAPI_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS=1`, exact `MUSIC_TRUSTED_PROXY_IP`, explicit `ALLOWED_ORIGINS` for the verified local browser origin(s) |
| Canonical health | `MUSIC_DEPLOYMENT_HEALTH_ENABLED=true`, `MUSIC_IMAGE_DIGEST`, `MUSIC_IMAGE_COMMIT`, `MUSIC_MIGRATION_MARKER`, protected `MUSIC_GATE_ATTESTATION_KEY`, and existing attestation path/JSON interface. Never fabricate image or migration evidence to make readiness green |
| Upstream write capabilities | `STRAPI_ANALYTICS_ACCESS_TOKEN` is unfortunately required by current unconditional analytics composition; it must NOT be supplied as a workaround for the no-shared-write rule. Reconciliation credentials are not local startup prerequisites and must not be broadened or activated |

The secure-file reader requires an absolute canonical regular-file path, a single hard link, no symlink/reparse-path alias, 1–256 bytes, ASCII base64url characters and at most one trailing LF. Database password decoding requires at least 32 bytes and canonical base64url. On Windows the existing `windows-write-through.ps1 inspect-security` helper verifies the effective owner and zero unsafe-write principals for each file and immediate parent, with native identity revalidation. Do not weaken ACL checks; do not echo helper paths/output containing private data. No actual files were eligible for inspection here.

`YOUTUBE_API_KEY` is optional for server startup, but real search/video lookup behavior may need it. External media/network restrictions remain separate UAT outcomes. Payment, social, affiliate, and unrelated integration credentials are not permission to expand the activation scope.

## Safe execution sequence and STOP gates

1. **Inventory only (available now).** In the assigned worktree run `git branch --show-current`, `git rev-parse HEAD`, and `git status --short`. Inspect relevant listeners using `Get-NetTCPConnection -State Listen`; show only address/port/PID/process name, never process command lines. Read configuration key names/nonempty flags only. Do not start Tunes, invoke fixture commands, run database probes, or inspect credentials outside the approved sources.
2. **STOP: exact target and ownership approval.** The only candidate database name is `explorers_music_local_uat` on literal loopback. Policy permits literal `127.0.0.1` or `::1`, never `localhost`, hostnames, shared RDS or hosted Strapi addresses. With the existing resolver only `127.0.0.1` is usable; IPv6 needs a later implementation decision. Proposed port `5432` is not approved by the mere presence of a listener. Confirm port, instance ownership, and absence/ownership of the exact database first. Never connect to or use the legacy database as the target.
3. **STOP: roles and protected credentials.** Present proposed dedicated roles `explorers_music_local_uat_migrator` and `explorers_music_local_uat_runtime` for explicit approval, together with credential-file locations through a private channel. The fixed capability role `music_runtime` is cluster-wide: a new database name alone does not isolate it. If it belongs to another workload, stop and require a separately approved isolated PostgreSQL instance or other reviewed solution. Do not overwrite or adopt existing databases/roles from their names alone. Require dedicated permitted lifecycle proof and all protected local authorities; no regeneration or upstream permission changes in preflight.
4. **STOP: upstream and write-isolation approval.** Confirm the intended HTTPS identity endpoint. `https://api.localqr.earth` is production; `http://77.42.95.255:1337` is hosted dev; both share RDS. The HTTP endpoint cannot satisfy live identity validation. Live `STRAPI_URL` must be an exact credential-free HTTPS origin, with no path/query/fragment, explicitly in `MUSIC_STRAPI_ALLOWED_ORIGINS`, resolving only to public addresses. Existing identity transport pins resolved addresses and exact origin. Do not bypass TLS, use fixture mode, or silently fall back to production. No upstream requests were made in this inventory.
5. **STOP: unsafe current startup paths.** Resolve the gaps listed below through a separately approved operational/design decision. Until then there is no safe runnable local provisioning/start command in this runbook. Do not disguise a new launcher as a one-off shell command.
6. **After all preceding gates and separate apply authorization only:** reuse the existing component order demonstrated by the migration gate: resolve distinct migrator/runtime protected credentials; confirm exact target and catalog ownership; `assertMusicMigratorAuthority`; `assertMusicRuntimeCapabilityPreflight`; `migrateMusicDatabase`; verify exact ready journal/checksum; `provisionMusicRuntimeLogin`; `verifyMusicRuntimeLogin` with expressly authorized denial probes; create genuine same-image gate attestation. This is an interface sequence, NOT an executable approved command. Database/role creation and safe local invocation remain unresolved. Never call `music:db:reset`, migrate shared RDS, or import hosted Music data.
7. **After separate startup approval only:** preserve validation, role attestation, read-only analytics schema verification and publication replay checks; bind Tunes to literal loopback. `startMusicServer` supports a programmatic `dependencies.host`, but `server/index.ts` does not expose that through environment/CLI and defaults to `0.0.0.0`. No runnable safe invocation is currently supplied. Runtime must not execute migrations/DDL, use memory/fallback behavior as proof of readiness, or disable safety listeners to appear healthy.
8. **After safe startup only:** verify the expected listener and both canonical health responses below, restart once, recheck, then schedule separately approved real-account identity/owner/guest UAT. Empty local playlists are expected in a newly provisioned database; do not copy production data or call absence data loss. Publication/preferences/pins require action-time approval, saved baseline and verified restoration. Never test account deletion/suspension on tk2727.

### Startup effects that prevent activation today

- `routes/index.ts` always calls `createExplorersAnalyticsDependencies()` and mounts analytics routes. This throws without `STRAPI_ANALYTICS_ACCESS_TOKEN`; supplying it enables a publisher capable of shared-Strapi mutations. No runtime disable flag was found in that composition. Analytics publishing must remain disabled, so startup is blocked pending review. An invented `ENABLE_EXPLORERS_ANALYTICS=false` would not solve it.
- Reconciliation apply must remain off (`MUSIC_RECONCILIATION_APPLY_ENABLED=false` if used by a command); do not run `music:reconcile`. That command's controls do not disable server listeners or lifecycle workers. General `MUSIC_RECONCILIATION_ENABLED` belongs to fixture configuration and is not a live server worker-off switch.
- The lifecycle worker starts unconditionally every 30 seconds. Its upstream absence proof is a GraphQL read, but it claims/updates/finalizes local deletion operations. Publication response shred/compaction starts every 60 seconds; the PostgreSQL session store prunes hourly. There are no inspected environment-off controls for these jobs. Local-write side effects require explicit isolated-backend approval; do not invoke deletion/suspension flows. If the approved policy requires these jobs off, STOP rather than invent flags or edit them here.
- Public-change and reconciliation-suspension listeners start unconditionally for database notifications and fail-closed socket safety. They are not upstream reconciliation apply workers; do not disable them to bypass safety.
- Existing reactivation routes can update shared Strapi users; the existing Strapi service can create/update song-limit records. Never exercise these or native registration/admin flows during Music UAT. Route presence alone is not proof they were called. No such calls occurred here.
- CLI loopback binding, exact-target/ownership enforcement, secure injection for environment-only secrets, and truthful local readiness/image attestation are not solved by the present scripts. Full runtime role verification includes attempted DDL, so it cannot be reclassified as read-only because transactions roll back.

### Rollout controls: current defaults and future policy

All backend rollout keys are absent from the inspected activation sources. In actual source, absent `MUSIC_NEW_ENTRY_KILL_SWITCH` means enabled kill switch; `MUSIC_COHORT_ENABLED` defaults false; `MUSIC_COHORT_USER_DOCUMENT_IDS` is empty. Keep entry killed until readiness and admission approval. For later bounded UAT, use an explicitly approved small cohort of immutable user document IDs (maximum 100); never infer IDs from a handle or put them in public reports.

Absent `MUSIC_WORKSPACE_KILL_SWITCH` also means killed; `MUSIC_FEATURE_OWNER_WORKSPACE_ALLOWLIST`, `MUSIC_FEATURE_GUEST_WORKSPACE_ALLOWLIST`, `MUSIC_FEATURE_PLAYLIST_IMPORTS_ALLOWLIST` default empty, and corresponding `*_PERCENT` controls default zero. `MUSIC_FEATURE_COHORT_SALT` and `MUSIC_FEATURE_COHORT_VERSION` are the existing cohort inputs. Keep playlist imports and unrelated/new workspace rollout disabled unless specifically approved. These feature controls do not disable analytics, lifecycle jobs, or canonical route side effects.

## Health, failure reporting, and rollback

Once separately authorized and safely started, existing read-only HTTP probes are `Invoke-RestMethod http://127.0.0.1:5000/health/live` and `Invoke-RestMethod http://127.0.0.1:5000/health/ready`. Capture only canonical sanitized fields, not raw exceptions. Health routes exist only when `MUSIC_DEPLOYMENT_HEALTH_ENABLED=true`.

- Liveness must be HTTP 200 with `{ "live": true }`.
- Readiness must be HTTP 200 with `ready: true`, truthful immutable image digest/full commit/migration marker, exact current migration checksum and valid matching gate attestation. It also checks mandatory session/cookie/access/JWT secrets, HTTPS upstream, and database ping. A 200 HTML fallback, listening socket, fixture response, or login page is insufficient.
- Existing sanitized readiness reasons include `image-metadata-invalid`, `mandatory-secret-missing`, `upstream-config-invalid`, `database-unreachable`, `migration-state-invalid`, and `gate-attestation-mismatch`; failed readiness is HTTP 503.
- Inventory normalization should distinguish missing configuration, unapproved target, missing database, authentication failure, wrong runtime role, and missing/drifted schema only when actually proven. The current result is **missing configuration / unapproved target**, not “wrong password” or “database missing.” Existing runtime role verification collapses errors into a generic attestation failure, so it cannot establish those distinctions alone.
- Existing startup/deployment error handlers may include raw error details. Do not paste raw errors or returned config/connection objects; report only a known key name or an allowlisted category. The empty-input component probes here returned `MUSIC_MODE must be live or fixture` and `MUSIC_DATABASE_HOST is required` before file access/network/database activity.
- Rollback for this inventory is documentation review only: no service was started and no operational state needs restoration. For any future approved activation, stop only the exact process started for this work, keep entry killed, and preserve data/evidence. Do not kill existing Vite/Docker/Postgres services, reset/drop databases, revoke shared roles, revert another user's settings, or downgrade schema. Database migrations can impose compatibility floors and are not undone by rolling back application code.

No shared-service, account, environment, credential, database, role, migration, browser, or deployment writes occurred in Task 1. Only this runbook and the SDD ledger/report were written. Activation and real-account Music UAT remain blocked; deterministic product work may continue independently.
