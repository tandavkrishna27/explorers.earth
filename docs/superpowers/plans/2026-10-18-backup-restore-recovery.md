# Backup, Restore and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a single encrypted backup of everything the running system cannot rebuild — PostgreSQL, S3 media bytes, and the host's signed deployment authority — taken automatically before every deploy and daily by cron, with a restore drill the owner can run on their own machine against a disposable PostgreSQL that proves the restored system boots, authenticates, serves all nine categories and resolves media through the gated route, and that reports a measured recovery time rather than an asserted one.

**Architecture:** one dependency-free Node script on the host collects four surfaces into one tar, encrypts it to an `age` public key the host does not hold the private half of, and uploads it to a bucket prefix the application is structurally unable to address. One TypeScript script on the owner's machine downloads a backup, restores it into a throwaway PostgreSQL 15 container, and uses the application's own boot-time attestations — the migration journal, the schema fingerprint, and the 118-table / 26-sequence / 99-function restricted-role matrix — as the restore-fidelity oracle, then boots the canonical app against the result and probes it. The drill writes a receipt; the promotion path refuses to deploy without a fresh backup and a drill receipt proven at the candidate's migration marker.

**Tech Stack:** Node 24 (dependency-free ESM on the host, `tsx` locally), PostgreSQL 15 (`pg_dump` custom format, run from the pinned `postgres:15-alpine` image so no client tooling is installed anywhere), `age` for asymmetric encryption, `amazon/aws-cli` pinned by digest for S3, Vitest for contracts, `node:test` for nothing here (the root `scripts/*.test.mjs` lane is reserved — see Task 1's note).

---

### Found during execution (2026-10-18) — implemented on `claude/backup-restore-recovery`

Main had moved since this plan was written (P1, P2 Tasks 1–8, P4 and the CI speed-up merged). The code follows reality; the task text below is left as written, and this table is the correction. The first three rows change the design; rows 4–6 are defects only a real restore could reveal, which the restore drill found on its first run.

| # | Plan said | Reality, and what was built |
|---|---|---|
| 1 | Back up the music deploy engine's signed authority (`deployment-state/`, `deployment-transactions/`, `deployment-routing/`) and wire the gate into `tunes-deploy.yml` | The launch path is `.github/workflows/explorers.yml` + `deploy/host/explorers-deploy.sh` (compose project `explorers-canonical`, service `postgres`, run as root via sudo). It has **no signed ledger, floor or epoch**, so surface 3 does not exist there. Archive members are four: `database/dump.pgc`, `database/globals.sql`, `host/configuration.tar` (`production.env`, `production.compose.yml`, the two `DB_*_PASSWORD_FILE_HOST` files), `media/inventory.jsonl`. The gate went into `explorers.yml` (still dormant) as upload → host `backup` phase → recovery-evidence gate → `stage`. `tunes-deploy.yml` is untouched |
| 2 | `verifyRecoveryEvidence` requires `manifest.migrationMarker === candidate.migrationMarker` and the drill's marker to equal the candidate's | That refuses every deploy that brings a migration, which is exactly what the pre-deploy backup exists for. The manifest records the **database's** head; the gate requires the candidate not to be older than it, and the drill receipt's marker to equal the **backup's** (the level a restore would land on). Also refuses a non-`prod` manifest |
| 3 | Host needs `age` installed (decision 6); `amazon/aws-cli` digest is a placeholder (decision 10); cron runs as `deploy` | `age` 1.2.1-r0 runs from a locally built image on `alpine:3.20@sha256:d9e853e8…`; the AWS CLI is `amazon/aws-cli:2.31.18@sha256:1a491b25…`. The host needs only Docker and **Node 24** (not currently installed there - listed as a host step). Cron runs as root because `production.env` and the secrets are root-owned 0600 |
| 4 | The journal row inside a dump is a complete restore-fidelity oracle | It is - and it caught that **no restored database of this schema could boot**: three varchar `CHECK` constraints (migrations 0011, 0015) deparse differently after dump/restore (`ARRAY[...]::text[]` comes back as `ARRAY['x'::varchar::text, ...]`), so `inspectMusicDatabase` throws `schema drift after 0056_…`. P3's 0057 does not drop those tables. The drill re-declares exactly those constraints from their migration text (`RESTORE_DEPARSE_REPAIRS`) and the oracle must still match exactly afterwards; the integration test pins the drift so a future migration that removes it is noticed. A forward migration fixing the constraints is the proper cure (follow-up; it would collide with P3's 0057 now) |
| 5 | The migrator stand-in is created unprivileged (Task 10) | `provision_music_runtime_login` is `SECURITY DEFINER` (0010:44), so it runs with its owner's authority and failed with "permission denied to create role". The stand-in now carries the attributes `database/globals.sql` records for the production migrator - read from the backup, never guessed - with NOLOGIN and no password. Capability roles stay unprivileged |
| 6 | (not in the plan) | The runtime attestation requires `pg_database.datdba` to be the migrator. The drill sets the drill database's owner to the manifest's migrator, as production's `POSTGRES_USER` is |
| 7 | Count rows and inventory media with separate queries | Both are read inside the `REPEATABLE READ` snapshot `pg_dump --snapshot` adopts (one held `psql` session exports it), so the manifest describes exactly the dump while the app keeps writing |
| 8 | Boot with `MUSIC_GATE_ATTESTATION_JSON` so `/health/ready` checks the gate attestation | The canonical `/health/ready` (`canonicalApp.ts`) checks only the migration journal; there is no attestation to supply. The gate-attestation volume is not captured: the migrate service regenerates it from `MUSIC_GATE_ATTESTATION_KEY`, which is in `production.env` |
| 9 | Probe `/api/explorers/v1/public/profiles/<u>/collections/<category>` for every `categoryKeys` member | The route is `/api/explorers/v1/profiles/:username/recommendations/:category`, and `categoryKeys` still includes `music`, which has no public route. Probes use `PUBLIC_RECOMMENDATION_CATEGORIES`; 200 and 404 (hidden category) are both legitimate, anything else fails |
| 10 | The oracle refuses pending migrations | Restore-forward is the only recovery, so a backup older than the drill's code restores and then migrates forward (`migrate-forward` phase) |
| 11 | "Authenticates" = anonymous `/me` 401 | Stronger proof added: the newest unexpired restored `auth_session` token, signed with the restored `EXPLORERS_AUTH_SECRET`, must get `/me` 200 |
| 12 | Add the integration test to `MUSIC_UAT_DATABASE_TEST_FILES`, or it "runs nowhere" | No workflow runs the UAT lane, and `tunes.yml`'s Test Tunes step runs `test:integration`, which collects every `*.integration.test.ts` (gated `MUSIC_C3_POSTGRES_TEST=1`). Adding it to the pinned list would ripple into two music lane manifests P3 is renaming, so it was not added. The test reaches the server through the pinned `postgres:15-alpine` client image by URL rather than `docker exec` into a UAT container id |
| 13 | `startOwnedUatDatabase` gives a drill database directly | It requires the database `music_uat_<runId>`; the drill creates `explorers_restore_drill_<8 hex>` inside it |
| 14 | — | A production-shaped local source did not exist, so `scripts/platform-recovery-fixture.ts` (`npm run platform:recovery-fixture -- up`, then `-- down`) builds one: labelled PG15, real migration runner, real runtime provisioning, accounts signed in through `/me`, every public category, media, throwaway age key, host-shaped `/opt/explorers` in the temp directory |

---

## Why this phase exists, and what it is designed against

There is no backup. Not "an untested backup" — none. Verified: no `pg_dump`, `pg_restore`, `pg_basebackup`, `wal-g`, `barman`, `pgbackrest`, `archive_command`, `archive_mode` or `wal_level` anywhere outside two disposable-fixture scripts, and `tunes/server/test/deployment/music-host-preflight.test.ts:59` actively asserts that the host preflight contains no `pg_dump`. No `platform:backup` or `platform:restore-drill` script exists in any `package.json`.

The two files that match a `backup|restore|recover` search are both false positives, as the brief said:

- `tunes/scripts/apps-retained-recovery.ts` destroys disposable UAT fixtures: it drops `music_uat_<runId>` (`:97`) and removes the container (`:100-102`), gated on `win32` and an ack string (`:8`, `:80`), hard-wired to 18 fixed run IDs (`:12-31`).
- `tunes/scripts/music-e2e-state-restore.mjs` resets the e2e fixture. `buildMusicFixtureRestoreOperation` (`:343-366`) disables triggers, `TRUNCATE … RESTART IDENTITY CASCADE`, replays a data-only plain dump, then re-enables. It is hard-coded to `explorers-music-fixture-postgres-1` on `127.0.0.1:55432` (`:316-341`). `docs/replatform-audit/tickets/ticket-8-5.md:73` already says this "must not be cited as partial recovery evidence".

**The failure mode this plan is designed against is not data loss. It is a backup nobody ever restored.** Every design choice below is biased toward being rehearsable on a Windows laptop with Docker Desktop in under an hour, because the owner is the only operator and an unrehearsed backup is indistinguishable from no backup. Where a more sophisticated option existed (WAL archiving with point-in-time recovery, streaming replication, a second host), it was rejected: it raises the recovery-point objective on paper while lowering the probability that anyone has ever executed a restore.

---

## The four surfaces, verified

A database-only backup cannot restore this system. Four independent surfaces must be captured, and only one of them is the database.

### 1. PostgreSQL

- A container in the production compose: `postgres:15-alpine` (`docker-compose.yml:146`), tag-pinned, no digest. Bootstrapped from `POSTGRES_USER=${DB_MIGRATOR_USER}`, `POSTGRES_DB=${DB_NAME}`, `POSTGRES_PASSWORD_FILE=/run/secrets/music-db-migrator` (`:149-151`).
- Data lives on the named volume `postgres-data` (`:153`, declared `:261`). Not a bind mount. The compose project is `explorers-production` (`:5`), so the volume resolves to `explorers-production_postgres-data` **by Compose convention, not by anything in code** — this must be confirmed on the host with `docker volume ls` before the first real backup. Earlier planning notes record a legacy project `tunes` with volume `tunes_postgres-data` (`docs/superpowers/plans/2026-09-12-tunes-production-migration.md:26`), so the two could coexist.
- The service is on the `internal` network only, which is `internal: true` (`:155-156`, `:256-258`), and publishes no ports. A backup therefore runs *inside* Docker's network or via `docker compose exec`, never from outside.
- 118 tables, 26 sequences, 99 functions and ~186 triggers in `public`; no extensions, no views, no materialized views, no enums, no domains, no RLS policies, no custom schemas. The authoritative inventory is `tunes/server/db/music-runtime-role.ts:6-125` (tables), `:126-153` (sequences), `:154-257` (functions).
- `pg_dump` alone is **not** sufficient, for three separate reasons:
  1. **Roles are cluster-global.** `music_runtime` is created inside migration `0010` (`tunes/migrations/0010_least_privilege_runtime_role.sql:9`). The four Apps roles — `app_enrichment_worker`, `app_enrichment_worker_owner`, `app_enrichment_retention`, `app_enrichment_retention_owner` — are created by `prepareAppWorkerCustody` (`tunes/server/db/app-enrichment-worker-custody.ts:4,33`), which the migration runner wraps around `0056`; migration `0056` itself only *asserts* they exist with exact attributes and `RAISE EXCEPTION USING ERRCODE='42501'` if not (`tunes/migrations/0056_explorers_app_enrichment_jobs.sql:3-10`). A restore into a fresh cluster lacking these roles fails on the first `ALTER FUNCTION … OWNER TO app_enrichment_worker_owner` (`0056:292`, `:351-352`).
  2. **Ownership is load-bearing and attested.** `music-runtime-role.ts:1038-1039` requires every `app_enrichment_worker_*` function to be owned by `app_enrichment_worker_owner`, every `app_enrichment_retention_*` function by `app_enrichment_retention_owner`, and all others by the migrator; tables at `:963` and sequences at `:1026` are attested the same way. **`pg_dump --no-owner` therefore breaks boot.** This is the single most important deviation from the existing `pg_dump --no-owner` precedents in the repo (`tunes/server/test/explorers/games.integration.test.ts:151`, `tunes/scripts/music-e2e-state-service.mjs:72-76`), which work only because their source and target share one owner.
  3. **Database-level ACLs are not in a table dump.** `REVOKE ALL PRIVILEGES ON DATABASE … FROM PUBLIC` and the `CONNECT`-only grant to the capability role are applied at `music-runtime-role.ts:679-685`; `REVOKE TEMPORARY ON DATABASE … FROM PUBLIC` at `app-enrichment-worker-custody.ts:44`. Boot asserts `has_database_privilege(current_user,current_database(),'TEMP')` is false (`music-runtime-role.ts:321-329`). The deploy gate re-applies the `music_runtime` and public-schema portion on every deploy (`:657-776`), so that part self-heals; it does **not** re-grant the four `app_enrichment_*` roles, so those must survive the backup.
- The runtime login's **password is not in any dump**. It comes from a root-owned secret file with no group or other bits (`tunes/server/config/secure-music-secret-file.ts:312-313`), must decode to ≥32 base64url bytes (`tunes/server/config/music-database-config.ts:54`), and the gate re-sets the login password from that file on every deploy (`tunes/server/deployment/run-migration-gate.ts:43`). The file is surface 4.
- **Collation risk.** The attested function inventory is ordered by `procedure.oid::regprocedure::text` (`music-runtime-role.ts:1036-1037`), which is locale-sensitive text compared against a hand-ordered array. Tables and sequences use `name`, which is C-collated. Restore must be into the same collation as the source; the Alpine image is effectively byte-ordered. The reasoning is recorded at `tunes/scripts/music-e2e-state-restore.mjs:192-200`.

### 2. S3 media

- Keys are exactly `${environment}/${accountId}/${id}` (`tunes/server/application/media.ts:109`), where `id = randomUUID()` (`:108`) and `accountId` is the uuid PK `creator_accounts.id` (`tunes/migrations/0022_explorers_identity.sql:63`). `assertObjectKey` enforces `^${environment}/[0-9a-f-]{36}/[0-9a-f-]{36}$` on every put, get and delete (`tunes/server/services/objectStorage.ts:81-84`), and the database enforces `CHECK (left(object_key,length(storage_environment)+1)=storage_environment||'/')` with `object_key UNIQUE` (`0024_explorers_profile_media.sql:32,40`). No extension, no suffix, no per-size variant: the only `variant` ever written is `'original'` (`tunes/server/db/mediaRepository.ts:44-46`, joined at `:76`).
- The bucket is shared between environments and separated only by the `qa/` and `prod/` prefixes — `validateEnvironmentPair` fails with `SHARED_SERVICE_POLICY_INVALID` if the bucket or region differ (`tunes/server/deployment/platform-release-contract.ts:62`). Real AWS S3; no endpoint override and no `forcePathStyle` anywhere, so MinIO is not an option.
- **This is why the backup prefix is safe.** A backup under `prod/backups/<run>/…` has more than three path segments, so `assertObjectKey` rejects it on every application code path — the application cannot read, write or delete it by construction, not by policy. That is the code-level isolation ticket 8.5 asks for.
- **S3 versioning is not a recovery mechanism here.** `S3ObjectStorage.delete` either deletes the named `VersionId` or lists every version and delete marker for the key and deletes each one (`objectStorage.ts:150-177`). Only a separate copy of the bytes, Object Lock, or an IAM deny on `DeleteObjectVersion` protects against an application-initiated delete.
- Nothing lists the bucket by prefix anywhere; the only `ListObjectVersions` call is an exact-key lookup inside `delete()` (`objectStorage.ts:163`). So the **database is the only index of what media exists**, and `media_objects` carries the key, version id, size and `media_assets.content_sha256` (`0024:28-42`) — which makes a per-object checksum manifest derivable from the dump and makes media verification exact.
- **Media restore has a destructive hazard.** Two sweepers run against whatever database the app is pointed at: `abandoned()` selects `ready` assets older than 24h with zero references across all nine link tables and deletes their bytes (`mediaRepository.ts:175-184` via `retryPendingDeletes`, `media.ts:62`), and the account-lifecycle loop deletes objects for pending deletions (`accountLifecycleMaintenance.ts:91`) at startup and every 60 seconds (`canonicalStartup.ts:30-31`, `:58-60`). **There is no flag to disable either.** Booting the real image against a database restored to time `T` while the bucket is at `T' > T` will delete the bytes of any asset whose link rows existed at `T'` but not at `T`. Task 9 adds the pause this requires.

### 3. Host deployment authority

Three directories under `$root` (default `/opt/explorers`; `tunes/deployment/music-deploy-engine.sh:200`, safety check at `:129-131`), created by the engine at `:278` with `install -d -m 700` (`:152-158`), every file committed `chmod 600` (`:160-163`):

| File | Contents | Written | Validated |
|---|---|---|---|
| `deployment-state/secure-images.tsv` | append-only hash-chained ledger, 7 fields per row, row 1 `GENESIS` | `:1043-1057` | `validate_ledger` `:292-338` |
| `deployment-state/music-floor.tsv` | permanent rollback floor, must equal ledger row 1 | `:1062-1066` | `validate_floor` `:342-356` |
| `deployment-state/music-state.tsv` | active slot + per-slot digests | `:1070-1073` | `validate_state` `:500-534` |
| `deployment-state/music-schema-floor.tsv` | **the compatibility floor** | `write_compatibility_floor` `:395-412` | `validate_compatibility_floor` `:364-393` |
| `deployment-transactions/schema-epoch.tsv` | signed epoch — **note: not in `deployment-state/`** | `write_schema_epoch` `:438-454` | `validate_schema_epoch` `:419-436` |
| `deployment-transactions/current/` | in-flight journal + `route.backup`, `ledger.backup`, `state.backup`, `floor.backup` | `create_transaction` `:970-990` | `recover_transaction` `:558-605`, run on every invocation at `:607` |
| `deployment-routing/music-router.yml` | Traefik file-provider config; **exactly one `.yml`/`.yaml` permitted** (`:801-802`) | `write_route` `:609-666` | required for non-bootstrap at `:714` |

Every TSV row is HMAC-SHA256 signed over its fields joined by literal TABs with no trailing newline, with the repository string as the second field; verification recomputes and compares, and any mismatch calls `fail` (exit 1) under `set -euo pipefail` (`:2`, `:86-89`). **The key is not on the host.** It is the GitHub environment secret `MUSIC_DEPLOY_STATE_HMAC_KEY` of environment `tunes-production` (`.github/workflows/tunes-deploy.yml:78,201,231`), shipped inside a per-run tarball (`:231,238-249`) and deleted at exit when `MUSIC_DEPLOY_EPHEMERAL_CREDENTIAL_FILES=1` (`tunes/deployment/music-deploy.sh:88-91`, `tunes-deploy.yml:256`).

Three consequences, and they are the reason this surface is not optional:

1. **These files cannot be regenerated, only restored byte-for-byte.** Forging one requires the HMAC key, the exact repository string, the exact field order, mode 600/400, and ownership matching the effective uid (`require_regular_file`, `:141-150`).
2. **There is no path that lowers or resets the compatibility floor.** `write_compatibility_floor` only checks `0 < rank ≤ current_marker_rank` (`:395-400`); monotonicity comes from the callers — first creation only when absent (`:890`), advance only when strictly greater and not a rollback (`:904`), pending→current keeping the marker (`:924`), and epoch recovery that can only raise it (`:468-475`). No flag, env var or subcommand lowers it. `MUSIC_DEPLOY_TEST_CURRENT_MARKER_OVERRIDE` is honoured only under `MUSIC_DEPLOY_TEST_MODE=1` (`:80-82`) and changes the engine's own ceiling, not the floor.
3. **Deleting the floor file is refused, not forgiven.** For a modern ledger, a missing `music-schema-floor.tsv` fails at `:726-727` — and that refusal runs *before* `recover_schema_epoch` at `:729`, so the epoch cannot rescue it. Restoring a ledger or state older than the floor is refused at `:723,732`. Re-bootstrapping from nothing refuses if the state, ledger or floor file exists (`:669-670`), requires the route file to still point `tunes-active` at the legacy service (`:675-693`), and requires a *running* legacy container with the Compose service label `tunes` (`music-deploy.sh:94-107`). **After the canonical cutover, that container will not exist. Losing `/opt/explorers/deployment-state` with no backup is therefore unrecoverable through any path the engine offers.**

### 4. Host configuration and secrets

The engine requires, and does not create, `$root/docker-compose.yml` and `$root/production.env` as regular non-symlink files (`:279-280`), then runs `verify-publication-authority.mjs` against `production.env` (`:281-282`), which requires seven secret files to be present, mode 0600/0400, owned by the effective uid, 1–4096 bytes, and distinct from the HMAC key (`tunes/deployment/verify-publication-authority.mjs:102-141`): publication `current` and `public-id`, the token directory `current`, the database runtime and migrator passwords, the Strapi lifecycle-proof token and the Strapi reconciliation token. **There are no host path defaults; every path comes from `production.env`.**

Also in this surface:

- The Docker named volume `music-gate-attestations`, mounted read-only into each slot at `/deployment-gates` (`docker-compose.yml:103`) and writable by the migrator (`:216`). `/health/ready` reads `/deployment-gates/<digest>.json` (`tunes/server/deployment/music-health.ts:52`) and `evaluateReadiness` fails without a valid one. It is regenerable by re-running the migrator gate — but only if `MUSIC_GATE_ATTESTATION_KEY` survives, and that lives in `production.env`.
- `EXPLORERS_AUTH_SECRET` (`tunes/server/auth/betterAuth.ts:30-31`, passed as `secret` at `:66`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`:32-33`). Better Auth is configured with no plugins and no JWKS (`:62-80`), so this secret is the only signing material and it is not in the database. **A perfect database restore with a rotated `EXPLORERS_AUTH_SECRET` leaves every `auth_session` row intact and every browser cookie invalid.**
- `MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY` decrypts `music_publication_operations.response_ciphertext` (`0011_*.sql:12-14`, `docker-compose.yml:85-90`). Without it those stored replay responses are unrecoverable ciphertext.

`production.env` and the globals file both contain secrets, and `auth_account` stores OAuth `access_token`, `refresh_token` and `id_token` in plaintext with no encryption configured (`tunes/shared/authSchema.ts:45-47`). **That is what forces client-side encryption of the whole archive, not server-side encryption at the destination.**

---

## The migration constraint, stated plainly

The brief said that "restoring an older database while a newer image is deployed may be refused by the deploy authority itself." That is close, but the mechanism is not where it looks, and getting it wrong would produce the wrong runbook. Three separate facts:

1. **The deploy engine never looks at the database.** It has no `psql` and no database access. The schema epoch is not derived from the database, a migration count or a hash — it is the image's marker string (`compatibility_marker_for`, `:102-119`; `current_marker` from the hard-coded `production_current_marker="0056_explorers_app_enrichment_jobs"`, `:20,79`), signed. Its only consumer is `recover_schema_epoch` (`:456-490`). **So the engine will happily deploy a current image onto a restored older database and notice nothing.**
2. **The application refuses, not the engine.** `startCanonicalServer` calls `checkMusicDatabaseReadiness` and throws `"Canonical identity schema is not ready"` if it is not ready (`canonicalStartup.ts:36-37`); the legacy path runs the same attestation at `tunes/server/config/music-startup.ts:91`. `checkMusicDatabaseReadiness` requires the journal's `currentId` and `checksum` to equal the chain tip computed from the files in the image (`tunes/server/db/readiness.ts:12-14`), and `inspectWithClient` separately recomputes the full `public` catalog fingerprint and throws `schema drift after <id>` on any mismatch (`tunes/server/db/migrate.ts:200-203`). `/health/ready` adds a third check: `state.currentChecksum` must equal the gate attestation's `migrationChecksum` (`tunes/server/deployment/music-deployment.ts:310-316`).
3. **The old image is separately unusable.** Once the floor reaches `0056`, every candidate whose compatibility-marker rank is lower is refused with `candidate refused: migration marker older than schema compatibility floor` (`:790-792`), and a rollback target below the floor with `rollback refused: digest older than schema compatibility floor` (`:762-767`). `rollback_compatibility_floor_marker` maps markers down only through the `0018`–`0030` range and is the identity for everything above (`music-deployment.ts:15-45`), so at `0056` the floor marker *is* `0056`.

**Therefore there is no rollback. There is restore-forward.**

The only recovery from a bad migration is: restore the dump taken immediately before it, let the migration gate apply the chain forward onto the restored database — which re-applies the bad migration — and then ship a *forward fix* migration. The restored database arrives at the schema the current image expects, which is the only state in which the application boots.

This has one hard, non-negotiable consequence for the design: **the pre-deploy backup is the only artifact that makes a bad migration survivable, so it must be taken by the deploy path itself and the deploy must refuse to proceed without it.** A daily cron backup up to 24 hours stale is not a migration safety net. That is Task 15.

A second consequence worth writing into the runbook: the three operations are distinct and the runbook must not blur them.

| Incident | Correct action | Why |
|---|---|---|
| Bad application code, schema unchanged | **App rollback** — `rollback` to a retained digest at or above the floor | Engine supports it; database untouched |
| Bad migration | **Forward fix** — new migration; restore only if data was corrupted | Floor refuses the old image; the chain cannot be reversed |
| Data loss or corruption | **Data restore** — restore the dump, let the gate migrate forward, then forward-fix | The schema level of the dump is irrelevant; the gate normalises it |
| Host loss | **Rebuild** — Docker, surface 4, surface 3 byte-for-byte, surface 1, re-run the gate | Needs the HMAC key from GitHub; see the host-loss objective below |

---

## Recovery objectives

These are the objectives the design *achieves*. Two are structural and can be stated now; the rest are placeholders that Task 16 fills in from the drill's own receipt. **No number below is asserted. Where a number is absent, that is deliberate — ticket 8.5 says "measure observed recovery duration/data-loss window rather than inventing an SLA", and the review correction at `ticket-8-5.md:79` says any figure appearing before a drill has run "would be invented".**

| Objective | Value | How it is established |
|---|---|---|
| **RPO, deploy-induced incident** | **0 relative to the deploy** | Task 15 makes a successful backup a precondition of the deploy transaction. No schema or data change can reach production without a backup taken after the last one |
| **RPO, all other incidents** | **≤ 24h + one backup duration** (the fixture backup took 1.9 s) | Daily cron (Task 7). The duration component is measured by the backup receipt and recorded in Task 16 |
| **RTO, database-only restore** | **6.2 s measured on the local fixture** (6,218 / 6,168 / 6,210 ms over three runs at `5f21884b`; 2.0 s of it is starting PostgreSQL and 1.7 s booting the app). A fixture-sized number: re-measure on the first production backup | Sum of the drill receipt's phase timings for download, decrypt, role bootstrap, `pg_restore`, deparse repair, attestation, boot, probes, media. [Evidence](../../replatform/evidence/milestone-3.md) |
| **RTO, full host loss** | **not measured** - needs a scratch host (listed under "Needs host access" in the PR) | Strictly larger. The canonical launch path has no signed ledger (see Found during execution), so the rebuild needs only the archive's host configuration and the deploy secrets in GitHub |
| **Drill freshness** | **≤ 30 days** | Task 15's gate refuses a drill receipt older than 30 days or proven at a different migration marker than the candidate |

Two honest limitations to record rather than engineer around:

- **Point-in-time recovery is out of scope.** No WAL archiving, no `archive_mode`, no replica. The recovery point is the last backup, full stop. Adding PITR would lower the stated RPO and lower the chance a restore is ever rehearsed; with only test accounts today (decision D1) the trade is clearly worth it. Revisit when real user content exists.
- **Real S3 semantics are unrehearsable locally.** There is no endpoint override and no `forcePathStyle` (`objectStorage.ts:190`), so versioning, IAM denials and `ListBucketVersions` behaviour cannot be exercised on the drill machine. The drill proves media *restore fidelity* — every object's bytes hash to `media_assets.content_sha256` and resolve through the gated route — against a filesystem store with the production environment value. The S3 copy itself is verified at the bucket by the backup script. This is a named gate, not a silent gap.

---

## Design decisions

| # | Decision | Rationale |
|---|---|---|
| R1 | **One archive, four surfaces, one manifest.** Not four independent backups | A database-only restore cannot boot. Coupling them in one manifest with one timestamp makes a partial capture structurally impossible to present as a restore candidate |
| R2 | **Host script is dependency-free ESM at `tunes/deployment/platform-backup.mjs`**, not `scripts/platform-backup.ts` as ticket 8.5 names | Node is already on the host — the engine runs `node "$hmac_helper_file"` (`music-deploy-engine.sh:230-232`) — but `tsx` and `node_modules` are not, and nothing ships them. `tunes/deployment/music-hmac.mjs` already establishes this directory as the shipped-to-host location. `npm run platform:backup` invokes the same file, so the ticket's command shape is preserved |
| R2b | **No new tooling on the host.** `pg_dump` runs from the already-present `postgres:15-alpine` image; the AWS CLI runs from `amazon/aws-cli` pinned by digest | Guarantees the dump's `pg_dump` major matches the server's. Avoids a host package install that nothing in the repo could verify |
| R3 | **`age` asymmetric encryption; the host holds only the public key** | The archive contains `production.env`, the globals file's SCRAM verifiers, and plaintext OAuth tokens from `auth_account`. Symmetric encryption would require the key on the host, which defeats the purpose: an attacker with the host has the backups. With `age`, full host and bucket compromise still yields ciphertext. It also makes key custody part of the drill — the drill cannot run without the owner's identity file, so a lost key is discovered by rehearsal rather than by an incident |
| R4 | **Destination `s3://<media bucket>/prod/backups/`**, the same bucket as media | Ticket 8.5's one-bucket layout, and `assertObjectKey` (`objectStorage.ts:81-84`) makes the prefix unaddressable from every application path. No new AWS principal is created, per the accepted reuse decision |
| R5 | **Media bytes are copied server-side inside the bucket, not downloaded, re-encrypted and re-uploaded** | No egress cost, no host disk requirement, and the copies inherit the bucket's existing encryption posture — which is what ticket 8.5 asks for ("use existing approved server-side encryption"). The asymmetry with R3 is deliberate: the dump and secrets are the irreplaceable, high-sensitivity part |
| R6 | **The restore oracle is the application's own boot attestation, not a hand-written table list** | `verifyMusicDatabase` recomputes the catalog fingerprint and compares it to the `schema_checksum` stored in the journal row that is *inside the dump* (`migrate.ts:200-203`), so the dump carries its own witness. `verifyMusicRuntimeDatabaseConnection` then checks exactly 118 tables / 26 sequences / 99 functions, their owners, a per-table privilege matrix, and ~100 denial probes that must each raise 42501 (`music-runtime-role.ts:845-1081`). Nothing a plan author could write by hand is remotely this strict, and it cannot go stale |
| R7 | **The drill runs the canonical app through `createCanonicalApp`, not `startCanonicalServer`** | `createCanonicalApp(pool, config, {mediaStorage})` accepts an injected `ObjectStorage` (`canonicalApp.ts:172`), which `startCanonicalServer` does not forward. That lets the drill supply a filesystem store whose `environment` is `"prod"`, so `resolveMediaContent`'s `storage_environment` check (`media.ts:153`) passes against production keys **with no mutation of restored data**. It also means the drill never starts the destructive 60-second maintenance loop |
| R8 | **Disposable PostgreSQL comes from `startOwnedUatDatabase`** (`tunes/scripts/music-uat-database.ts:281`) | It is the only mechanism with a per-run unique database name, an ephemeral loopback port (56000–60999, `:36-37,832-845`), `--rm` plus tmpfs, a full container attestation (`:170-215`), and teardown that verifies removal (`:701-734`). Reusing it means reusing its guard set rather than writing a weaker new one |
| R9 | **The drill reconstructs the production role namespace in the disposable cluster from the manifest, never from a guess** | Ownership is attested (R6/point 2 above) and the production migrator role name is not necessarily the UAT container's `music_migrator`. An allowlisted role bootstrap is Task 10 |
| R10 | **Two receipts, one gate.** A backup receipt per run, a drill receipt per drill; the promotion step consumes both and fails closed | This is the 8.4 join, which `ticket-8-4.md:67` records as existing "only as prose… no workflow reads, validates or blocks on an 8.5 recovery receipt", and `:70` says 8.4 is not mechanism-complete until it does |
| R11 | **Every drill run leaves an off-provider copy of the latest backup on the owner's machine** | The drill must download the archive to restore it. Making that download a retained, named artifact turns rehearsal into the second destination for free, and removes the "both copies in one bucket" single point of failure for the part that matters most |

### Deviations from ticket 8.5 as written, and why

Ticket 8.5 was authored against a world that no longer exists. Four of its requirements are unimplementable or dead; each is replaced rather than dropped.

1. **`--environment qa` and the whole QA half.** There is no hosted QA and `verifyRelease` is typed `: never` and unconditionally returns `fail('TRUSTED_AUTHORITY_UNAVAILABLE')` (`tunes/server/deployment/platform-release-contract.ts:68-72`). The flag accepts `prod | local`; `validateEnvironmentPair`'s QA/prod isolation checks are not exercised by this phase.
2. **"Restore uses new object keys beneath the drill prefix and rewrites restored references" (`ticket-8-5.md:43`).** Impossible: `assertObjectKey` requires exactly `<env>/<uuid>/<uuid>` (`objectStorage.ts:81-84`) and the database `CHECK` ties the key prefix to `storage_environment` (`0024:40`). A `qa/restore-drills/<run-id>/…` key is rejected on every path. Replaced by R7: restore to the original keys in a drill-local store whose `environment` is `"prod"`. The source objects are still never touched, which is what the requirement was protecting.
3. **"Music publication/replay constraints" in the third acceptance checkbox.** Decision D2 deletes Music entirely. The drill imports `categoryKeys` from `tunes/shared/explorersContract.ts:12-14` rather than hard-coding nine names, so it narrows to eight automatically when P3-5 lands.
4. **`apps/api/server/test/contracts/platform-recovery.test.ts`.** `apps/api/` does not exist. Real path: `tunes/server/test/contracts/platform-recovery.test.ts`, which is the directory the repo's other root-script contract tests already use (`tunes/server/test/contracts/replatform-local-authority.test.ts` imports `../../../../scripts/replatform-local`).

Deferred out of this phase, with reasons: the load-harness extension and capacity budget (checkbox 5) belongs with P5-1's analytics work and needs a real workload, not a recovery mechanism; the axe/keyboard accessibility matrix (checkbox 4) is unrelated to recovery and belongs to the frontend lane; the old-service retirement checklist (checkbox 7) belongs to P6.

---

## File structure

| Path | Responsibility | Lines (est.) |
|---|---|---|
| `tunes/shared/platformRecoveryContract.ts` | **create.** Zod schemas for the backup manifest and the drill receipt; `canonicalRecoveryDigest`; `verifyRecoveryReceipt` (the 8.4 join predicate). Imported by the drill, the tests and the promotion gate. Never imported by the host script | ~160 |
| `tunes/deployment/platform-backup.mjs` | **create.** The host script. Dependency-free ESM. Collects the four surfaces, encrypts, uploads, prunes, writes the manifest and the host-side `last-success` marker | ~420 |
| `scripts/platform-restore-drill.ts` | **create.** The drill. Downloads, decrypts, acquires a disposable PG15, bootstraps roles, restores, proves, boots, probes, writes the receipt | ~380 |
| `scripts/platform-recovery-gate.ts` | **create.** `verifyRecoveryEvidence` CLI for the promotion step; thin wrapper over the contract so the workflow has one command to call | ~70 |
| `tunes/server/test/contracts/platform-recovery.test.ts` | **create.** DB-free contract tests of every exported validator, plus the host script executed against fake `docker`/`age`/`aws` shims. Runs in the PR-gated tunes unit lane | ~450 |
| `tunes/server/test/explorers/platform-recovery.integration.test.ts` | **create.** Real-PostgreSQL round trip against a disposable database | ~200 |
| `tunes/server/auth/canonicalStartup.ts` | **modify** (`:30`, `:50-60`). Honour `EXPLORERS_MAINTENANCE_PAUSED` so a restored database can be inspected before the sweepers run | ~10 |
| `tunes/deployment/platform-backup.cron` | **create.** The cron fragment installed to `/etc/cron.d/` | ~6 |
| `.github/workflows/tunes-deploy.yml` | **modify.** A pre-engine backup step and a recovery-evidence gate step | ~45 |
| `package.json` | **modify.** `platform:backup`, `platform:restore-drill`, `platform:recovery-gate` | 3 |
| `docs/replatform/release-and-recovery.md` | **create.** The runbook: app rollback vs forward fix vs data restore vs host rebuild | — |
| `docs/replatform/evidence/milestone-3.md` | **create.** The evidence record with the measured numbers | — |

A note on where tests live, because the repo has two lanes and the wrong choice makes this invisible. Root `scripts/*.test.mjs` and `*.test.cjs` run under `node --test` on every pull request via a glob (`.github/workflows/test.yml:91`, in the `static` job; `on: pull_request: {}` at `:3`). Contract tests for root TypeScript scripts instead run in the tunes unit lane (`tunes/vitest.config.ts`), which is also PR-gated, and which `replatform-local-authority.test.ts` and `platform-release.test.ts` already use. Because `node --test` cannot import `.ts`, and this phase's pure logic is TypeScript, **all contract tests go in the tunes unit lane**. No workflow edit is needed for them to gate pull requests.

---

## Tasks

### Task 1: The recovery contract

Every later task validates or produces one of these two documents, so they are defined once, here, with the digest and the 8.4 join predicate.

**Files:**
- Create: `tunes/shared/platformRecoveryContract.ts`
- Test: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  backupManifestSchema,
  canonicalRecoveryDigest,
  drillReceiptSchema,
  verifyRecoveryEvidence,
} from "../../../shared/platformRecoveryContract";

const sha = (c: string) => c.repeat(64);
const digest = (c: string) => `sha256:${c.repeat(64)}`;

const manifest = () => ({
  version: "explorers-platform-backup/v1" as const,
  runId: "a".repeat(32),
  environment: "prod" as const,
  startedAt: "2026-10-18T02:00:00.000Z",
  completedAt: "2026-10-18T02:03:11.000Z",
  complete: true as const,
  reason: "scheduled" as const,
  sourceCommit: "c".repeat(40),
  imageDigest: digest("d"),
  migrationMarker: "0056_explorers_app_enrichment_jobs",
  journalChecksum: sha("e"),
  schemaChecksum: sha("f"),
  archive: { key: "prod/backups/20261018T020000Z-ccccccc/archive.tar.age", bytes: 4_194_304, sha256: sha("1") },
  members: [
    { name: "database/dump.pgc", bytes: 2_097_152, sha256: sha("2") },
    { name: "database/globals.sql", bytes: 8_192, sha256: sha("3") },
    { name: "host/deployment-authority.tar", bytes: 16_384, sha256: sha("4") },
    { name: "host/configuration.tar", bytes: 32_768, sha256: sha("5") },
    { name: "media/inventory.jsonl", bytes: 1_024, sha256: sha("6") },
  ],
  roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
    "app_enrichment_retention", "app_enrichment_retention_owner"],
  migratorRole: "music_migrator",
  runtimeLoginRole: "explorers_runtime",
  databaseName: "explorers",
  media: { objects: 12, bytes: 1_048_576, prefix: "prod/backups/20261018T020000Z-ccccccc/media/" },
  tableRowCounts: { creator_accounts: 2, auth_user: 2, recommendations: 9 },
});

const receipt = () => ({
  version: "explorers-platform-restore-drill/v1" as const,
  runId: "b".repeat(32),
  result: "passed" as const,
  drilledAt: "2026-10-18T09:14:00.000Z",
  drillCommit: "c".repeat(40),
  manifestDigest: sha("7"),
  migrationMarker: "0056_explorers_app_enrichment_jobs",
  schemaChecksum: sha("f"),
  cleanup: "database-dropped-container-removed" as const,
  phases: [
    { phase: "download", milliseconds: 4_000 },
    { phase: "decrypt", milliseconds: 900 },
    { phase: "acquire-target", milliseconds: 21_000 },
    { phase: "bootstrap-roles", milliseconds: 300 },
    { phase: "pg-restore", milliseconds: 11_000 },
    { phase: "attest-schema", milliseconds: 2_400 },
    { phase: "attest-runtime-role", milliseconds: 7_100 },
    { phase: "boot", milliseconds: 1_800 },
    { phase: "probe", milliseconds: 5_500 },
  ],
  recoveryMilliseconds: 54_000,
  proofs: {
    journal: { rows: 56, currentId: "0056_explorers_app_enrichment_jobs" },
    identity: { authUsers: 2, authSessions: 1, creatorAccounts: 2 },
    categories: { places: 1, guides: 1, movies: 1, books: 2, games: 1, apps: 1, products: 1, people: 1 },
    media: { objects: 12, hashesMatched: 12, gatedRouteResolved: 7 },
    rowCountsMatched: true as const,
  },
});

describe("platform recovery contract", () => {
  it("accepts a complete manifest and a passing receipt", () => {
    expect(backupManifestSchema.parse(manifest()).complete).toBe(true);
    expect(drillReceiptSchema.parse(receipt()).result).toBe("passed");
  });

  it("digests are stable under key reordering and change with content", () => {
    const a = canonicalRecoveryDigest(manifest());
    const reordered = Object.fromEntries(Object.entries(manifest()).reverse());
    expect(canonicalRecoveryDigest(reordered)).toBe(a);
    expect(canonicalRecoveryDigest({ ...manifest(), runId: "z".repeat(32) })).not.toBe(a);
  });

  it("rejects an incomplete manifest as a restore candidate", () => {
    const partial = { ...manifest(), complete: false };
    expect(() => backupManifestSchema.parse(partial)).toThrow();
  });

  it("rejects a manifest whose archive members do not include the database dump", () => {
    const without = { ...manifest(), members: manifest().members.filter(m => m.name !== "database/dump.pgc") };
    expect(() => backupManifestSchema.parse(without)).toThrow();
  });

  it("admits a deploy only with a fresh backup and a marker-matched drill", () => {
    const now = Date.parse("2026-10-18T02:05:00.000Z");
    expect(verifyRecoveryEvidence({
      manifest: manifest(),
      receipt: receipt(),
      candidate: { digest: digest("d"), commit: "c".repeat(40), migrationMarker: "0056_explorers_app_enrichment_jobs" },
      now,
    })).toEqual({ admitted: true });
  });

  it.each([
    ["BACKUP_STALE", { now: Date.parse("2026-10-18T04:06:00.000Z") }],
    ["BACKUP_CANDIDATE_MISMATCH", { candidate: { digest: digest("9"), commit: "c".repeat(40), migrationMarker: "0056_explorers_app_enrichment_jobs" } }],
    ["DRILL_MARKER_MISMATCH", { receipt: { ...receipt(), migrationMarker: "0055_explorers_app_enrichment" } }],
    ["DRILL_FAILED", { receipt: { ...receipt(), result: "failed" as const } }],
    ["DRILL_STALE", { receipt: { ...receipt(), drilledAt: "2026-08-01T00:00:00.000Z" } }],
  ])("refuses with %s", (code, override) => {
    expect(verifyRecoveryEvidence({
      manifest: manifest(),
      receipt: receipt(),
      candidate: { digest: digest("d"), commit: "c".repeat(40), migrationMarker: "0056_explorers_app_enrichment_jobs" },
      now: Date.parse("2026-10-18T02:05:00.000Z"),
      ...override,
    })).toEqual({ admitted: false, code });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts`
Expected: FAIL — `Failed to resolve import "../../../shared/platformRecoveryContract"`.

- [ ] **Step 3: Write the implementation**

```ts
// tunes/shared/platformRecoveryContract.ts
import { createHash } from "node:crypto";
import { z } from "zod";

/** Freshness budgets. A backup older than this cannot authorize a deploy; a drill
 *  older than this cannot either. Both are deliberately short enough that the
 *  owner notices the gate rather than the incident. */
export const BACKUP_FRESHNESS_MS = 2 * 60 * 60 * 1000;
export const DRILL_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

/** Members every restore candidate must carry. Media and host configuration are
 *  listed because a database-only archive cannot restore a working system. */
export const REQUIRED_ARCHIVE_MEMBERS = [
  "database/dump.pgc",
  "database/globals.sql",
  "host/deployment-authority.tar",
  "host/configuration.tar",
  "media/inventory.jsonl",
] as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: false }).refine(v => Number.isFinite(Date.parse(v)));
const roleName = z.string().regex(/^[a-z_][a-z0-9_]{1,62}$/);
const archiveMember = z.object({ name: z.string().min(1).max(256), bytes: z.number().int().nonnegative(), sha256 }).strict();

export const backupManifestSchema = z.object({
  version: z.literal("explorers-platform-backup/v1"),
  runId: z.string().regex(/^[a-f0-9]{32}$/),
  environment: z.enum(["prod", "local"]),
  startedAt: instant,
  completedAt: instant,
  // A partial capture is recorded with complete:false so it is auditable, and is
  // refused here so it can never become a restore candidate.
  complete: z.literal(true),
  reason: z.enum(["scheduled", "pre-deploy", "manual"]),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  migrationMarker: z.string().regex(/^[0-9]{4}_[a-z0-9_]+$/),
  journalChecksum: sha256,
  schemaChecksum: sha256,
  archive: z.object({ key: z.string().startsWith("prod/backups/"), bytes: z.number().int().positive(), sha256 }).strict(),
  members: z.array(archiveMember).min(REQUIRED_ARCHIVE_MEMBERS.length),
  roles: z.array(roleName).min(1),
  migratorRole: roleName,
  runtimeLoginRole: roleName,
  databaseName: roleName,
  media: z.object({ objects: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), prefix: z.string().startsWith("prod/backups/") }).strict(),
  tableRowCounts: z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/), z.number().int().nonnegative()),
}).strict()
  .refine(m => REQUIRED_ARCHIVE_MEMBERS.every(name => m.members.some(member => member.name === name)),
    { message: "archive is missing a required member" })
  .refine(m => m.migratorRole !== m.runtimeLoginRole, { message: "migrator and runtime login must differ" })
  .refine(m => Date.parse(m.completedAt) >= Date.parse(m.startedAt), { message: "completedAt precedes startedAt" });

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export const drillReceiptSchema = z.object({
  version: z.literal("explorers-platform-restore-drill/v1"),
  runId: z.string().regex(/^[a-f0-9]{32}$/),
  result: z.enum(["passed", "failed"]),
  drilledAt: instant,
  drillCommit: z.string().regex(/^[a-f0-9]{40}$/),
  manifestDigest: sha256,
  migrationMarker: z.string().regex(/^[0-9]{4}_[a-z0-9_]+$/),
  schemaChecksum: sha256,
  cleanup: z.enum(["database-dropped-container-removed", "leaked"]),
  phases: z.array(z.object({ phase: z.string().min(1), milliseconds: z.number().int().nonnegative() }).strict()).min(1),
  recoveryMilliseconds: z.number().int().nonnegative(),
  proofs: z.object({
    journal: z.object({ rows: z.number().int().positive(), currentId: z.string() }).strict(),
    identity: z.object({ authUsers: z.number().int().nonnegative(), authSessions: z.number().int().nonnegative(), creatorAccounts: z.number().int().nonnegative() }).strict(),
    categories: z.record(z.string(), z.number().int().nonnegative()),
    media: z.object({ objects: z.number().int().nonnegative(), hashesMatched: z.number().int().nonnegative(), gatedRouteResolved: z.number().int().nonnegative() }).strict(),
    rowCountsMatched: z.boolean(),
  }).strict(),
}).strict();

export type DrillReceipt = z.infer<typeof drillReceiptSchema>;

/** Key-order-independent digest. Mirrors the `canonical()` + `digest()` pair in
 *  `scripts/replatform-e2e.mjs` so receipts here hash the same way the e2e ones do. */
export function canonicalRecoveryDigest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, entry]) => [key, canonical(entry)]));
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export type RecoveryEvidenceCode =
  | "BACKUP_INVALID" | "BACKUP_STALE" | "BACKUP_CANDIDATE_MISMATCH"
  | "DRILL_INVALID" | "DRILL_FAILED" | "DRILL_STALE" | "DRILL_MARKER_MISMATCH";

/** The ticket-8.4 acceptance join, as a predicate rather than as prose. It fails
 *  closed: anything it cannot parse is a refusal, and no caller-supplied claim
 *  can substitute for a manifest and a receipt. */
export function verifyRecoveryEvidence(input: {
  manifest: unknown;
  receipt: unknown;
  candidate: { digest: string; commit: string; migrationMarker: string };
  now: number;
}): { admitted: true } | { admitted: false; code: RecoveryEvidenceCode } {
  const manifest = backupManifestSchema.safeParse(input.manifest);
  if (!manifest.success) return { admitted: false, code: "BACKUP_INVALID" };
  const receipt = drillReceiptSchema.safeParse(input.receipt);
  if (!receipt.success) return { admitted: false, code: "DRILL_INVALID" };
  if (input.now - Date.parse(manifest.data.completedAt) > BACKUP_FRESHNESS_MS) return { admitted: false, code: "BACKUP_STALE" };
  if (manifest.data.imageDigest !== input.candidate.digest
    || manifest.data.sourceCommit !== input.candidate.commit
    || manifest.data.migrationMarker !== input.candidate.migrationMarker) return { admitted: false, code: "BACKUP_CANDIDATE_MISMATCH" };
  if (receipt.data.result !== "passed") return { admitted: false, code: "DRILL_FAILED" };
  if (input.now - Date.parse(receipt.data.drilledAt) > DRILL_FRESHNESS_MS) return { admitted: false, code: "DRILL_STALE" };
  if (receipt.data.migrationMarker !== input.candidate.migrationMarker) return { admitted: false, code: "DRILL_MARKER_MISMATCH" };
  return { admitted: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts`
Expected: PASS, 6 tests (the `it.each` contributes 5).

- [ ] **Step 5: Commit**

```bash
git add tunes/shared/platformRecoveryContract.ts tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): define the backup manifest, drill receipt and 8.4 acceptance join"
```

---

### Task 2: Disposable restore-target refusals

The drill must be incapable of writing to production. This task is only the predicate, so it can be made strict before anything can execute.

**Files:**
- Create: `scripts/platform-restore-drill.ts`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { assertDisposableRestoreTarget, parseDrillCommand } from "../../../../scripts/platform-restore-drill";

const target = () => ({
  connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers_restore_drill_aaaaaaaa",
  containerId: "a".repeat(64),
  owned: true as const,
  port: 57421,
});

describe("disposable restore target", () => {
  it("accepts an owned loopback target in the drill database namespace", () => {
    expect(assertDisposableRestoreTarget(target(), {}).database).toBe("explorers_restore_drill_aaaaaaaa");
  });

  it.each([
    ["a non-loopback host", { connectionString: "postgresql://music_migrator:pw@db.example.com:5432/explorers_restore_drill_aaaaaaaa" }],
    ["a database outside the drill namespace", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers" }],
    ["a port outside the owned range", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:5432/explorers_restore_drill_aaaaaaaa", port: 5432 }],
    ["a target the harness does not own", { owned: false as unknown as true }],
    ["a query string", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers_restore_drill_aaaaaaaa?sslmode=require" }],
    ["a mismatched container", { containerId: "short" }],
  ])("refuses %s", (_name, override) => {
    expect(() => assertDisposableRestoreTarget({ ...target(), ...override }, {})).toThrow(/restore target/);
  });

  it.each(["DATABASE_URL", "DATABASE_URL_TEST", "GATE_PROD", "DOCKER_HOST", "DOCKER_CONTEXT", "MUSIC_DEPLOY_PRODUCTION"])(
    "refuses an ambient %s", (key) => {
      expect(() => assertDisposableRestoreTarget(target(), { [key]: "anything" })).toThrow(/ambient/);
    });

  it("refuses a populated namespace", () => {
    expect(() => assertDisposableRestoreTarget(target(), {}, { existingTables: ["creator_accounts"] }))
      .toThrow(/populated/);
  });
});

describe("drill command", () => {
  it("requires a manifest, an identity and a receipt directory", () => {
    expect(parseDrillCommand(["--manifest", "m.json", "--identity", "k.age", "--receipt", "r"]))
      .toEqual({ manifest: "m.json", identity: "k.age", receipt: "r", keepArchive: false });
  });

  it.each([
    [[]],
    [["--manifest", "m.json"]],
    [["--manifest", "m.json", "--identity", "k.age"]],
    [["--manifest", "m.json", "--identity", "k.age", "--receipt", "r", "--target", "postgresql://prod/db"]],
  ])("rejects %j", (args) => expect(() => parseDrillCommand(args)).toThrow(/arguments rejected/));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts`
Expected: FAIL — cannot resolve `../../../../scripts/platform-restore-drill`.

- [ ] **Step 3: Write the implementation** (the first exports of the new file)

```ts
// scripts/platform-restore-drill.ts
/**
 * Restore drill. Takes a backup manifest, restores it into a disposable
 * PostgreSQL 15 the harness owns, and proves the result by booting the
 * canonical application against it.
 *
 * It can only ever write to a database named `explorers_restore_drill_<8 hex>`
 * on 127.0.0.1 in the owned ephemeral port range. Production is not a
 * configurable target: there is no flag that names one.
 */

/** Forbidden ambient authority. Mirrors `music-uat-database.ts:38-45` and
 *  `replatform-local.ts:38-41` so the drill cannot inherit a production handle
 *  from the shell that started it. */
const FORBIDDEN_AMBIENT = ["DATABASE_URL", "DATABASE_URL_TEST", "GATE_PROD", "DOCKER_HOST", "DOCKER_CONTEXT"] as const;
const FORBIDDEN_AMBIENT_PREFIXES = [/^MUSIC_DEPLOY_/i, /^MUSIC_C10_STANDALONE_POSTGRES_/i] as const;

const DRILL_DATABASE = /^explorers_restore_drill_[a-f0-9]{8}$/;
const OWNED_PORT_MIN = 56_000;
const OWNED_PORT_MAX = 60_999;

export interface DisposableRestoreTarget {
  connectionString: string;
  containerId: string;
  owned: true;
  port: number;
}

export function assertDisposableRestoreTarget(
  target: DisposableRestoreTarget,
  environment: Record<string, string | undefined>,
  observed: { existingTables?: readonly string[] } = {},
): { database: string; host: string; port: number } {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();
    if ((FORBIDDEN_AMBIENT as readonly string[]).includes(upper) || FORBIDDEN_AMBIENT_PREFIXES.some(p => p.test(key))) {
      throw new Error(`ambient ${upper} is forbidden for the restore drill`);
    }
  }
  if (target.owned !== true) throw new Error("restore target is not harness-owned");
  if (!/^[a-f0-9]{64}$/.test(target.containerId)) throw new Error("restore target container identity is invalid");
  let url: URL;
  try { url = new URL(target.connectionString); }
  catch { throw new Error("restore target is unresolved"); }
  const database = url.pathname.slice(1);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.search || url.hash
    || !DRILL_DATABASE.test(database) || Number(url.port) !== target.port
    || target.port < OWNED_PORT_MIN || target.port > OWNED_PORT_MAX) {
    throw new Error("restore target is outside the disposable allowlist");
  }
  const existing = (observed.existingTables ?? []).filter(name => name !== "music_schema_migrations");
  if (existing.length) throw new Error(`restore target namespace is populated: ${existing.length} tables`);
  return { database, host: url.hostname, port: target.port };
}

export interface DrillCommand { manifest: string; identity: string; receipt: string; keepArchive: boolean }

export function parseDrillCommand(args: string[]): DrillCommand {
  const allowed = new Set(["--manifest", "--identity", "--receipt", "--keep-archive"]);
  const values = new Map<string, string>();
  let keepArchive = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error("restore drill arguments rejected");
    if (flag === "--keep-archive") { keepArchive = true; continue; }
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) throw new Error("restore drill arguments rejected");
    values.set(flag, value);
  }
  const manifest = values.get("--manifest"), identity = values.get("--identity"), receipt = values.get("--receipt");
  if (!manifest || !identity || !receipt) throw new Error("restore drill arguments rejected");
  return { manifest, identity, receipt, keepArchive };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts`
Expected: PASS. The `--target` rejection case passes because `--target` is not in the allowed flag set — production is not nameable.

- [ ] **Step 5: Commit**

```bash
git add scripts/platform-restore-drill.ts tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): refuse any restore target that is not a harness-owned disposable database"
```

---

### Task 3: Host script preflight and refusals

The host script runs unattended as `deploy` on the production box. Everything it refuses, it must refuse before it reads a secret or starts a container.

**Files:**
- Create: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const backupScript = resolve(import.meta.dirname, "../../../deployment/platform-backup.mjs");

/** A host-shaped root: the engine's three state directories, compose and env. */
function hostRoot(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "platform-backup-host-"));
  for (const directory of ["deployment-state", "deployment-routing", "deployment-transactions"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  const files: Record<string, string> = {
    "docker-compose.yml": "name: explorers-production\n",
    "production.env": [
      "DB_NAME=explorers",
      "DB_MIGRATOR_USER=music_migrator",
      "DB_RUNTIME_USER=explorers_runtime",
      "EXPLORERS_MEDIA_S3_BUCKET=explorers-media",
      "EXPLORERS_MEDIA_S3_REGION=ap-south-1",
      "EXPLORERS_MEDIA_ENVIRONMENT=prod",
      "EXPLORERS_BACKUP_AGE_RECIPIENT=age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg0r9rfkqput9pg",
      ...Object.entries(overrides).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`),
    ].join("\n") + "\n",
    "deployment-state/secure-images.tsv": "music-ledger-v2\t1\n",
    "deployment-state/music-floor.tsv": "music-floor-v1\n",
    "deployment-state/music-state.tsv": "music-state-v2\n",
    "deployment-state/music-schema-floor.tsv": "music-schema-floor-v2\n",
    "deployment-transactions/schema-epoch.tsv": "music-schema-epoch-v1\n",
    "deployment-routing/music-router.yml": "http: {}\n",
  };
  for (const [name, body] of Object.entries(files)) {
    if (overrides[name] === null) continue;
    writeFileSync(join(root, name), body, { mode: 0o600 });
  }
  return root;
}

/** Fake `docker`, `age` and `aws` on PATH so the script's refusals are the only
 *  thing under test. The shims are plain Node so this works on Windows too. */
function shimDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "platform-backup-shims-"));
  for (const name of ["docker", "age", "aws"]) {
    const body = `#!/usr/bin/env node\nprocess.stdout.write("");\n`;
    writeFileSync(join(directory, name), body, { mode: 0o755 });
    writeFileSync(join(directory, `${name}.cmd`), `@node "%~dp0${name}" %*\n`, { mode: 0o755 });
  }
  return directory;
}

function runBackup(root: string, extra: string[] = [], environment: Record<string, string> = {}) {
  const shims = shimDirectory();
  try {
    return spawnSync(process.execPath, [backupScript, "--environment", "prod", "--reason", "manual", ...extra], {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PATH: `${shims}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
        EXPLORERS_BACKUP_ROOT: root, ...environment },
    });
  } finally { rmSync(shims, { recursive: true, force: true }); }
}

describe("host backup preflight", () => {
  it("refuses a root that is not absolute, is / or is /opt", () => {
    for (const root of ["relative/path", "/", "/opt"]) {
      expect(runBackup(root).stderr).toMatch(/backup root is unsafe/);
    }
  });

  it("refuses a missing production.env", () => {
    const root = hostRoot({ "production.env": null });
    try { expect(runBackup(root).stderr).toMatch(/production\.env/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses when no age recipient is configured", () => {
    const root = hostRoot();
    writeFileSync(join(root, "production.env"), "DB_NAME=explorers\n", { mode: 0o600 });
    try { expect(runBackup(root).stderr).toMatch(/EXPLORERS_BACKUP_AGE_RECIPIENT/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses an age private identity pasted into the recipient variable", () => {
    const root = hostRoot({ EXPLORERS_BACKUP_AGE_RECIPIENT: "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ" });
    try {
      const result = runBackup(root);
      expect(result.stderr).toMatch(/recipient must be a public age key/);
      expect(result.stderr).not.toMatch(/AGE-SECRET-KEY/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a deployment-routing directory with more than one provider file", () => {
    const root = hostRoot();
    writeFileSync(join(root, "deployment-routing/extra.yml"), "http: {}\n", { mode: 0o600 });
    try { expect(runBackup(root).stderr).toMatch(/exactly one Traefik provider file/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a world-readable secret-bearing file", () => {
    if (process.platform === "win32") return;
    const root = hostRoot();
    chmodSync(join(root, "production.env"), 0o644);
    try { expect(runBackup(root).stderr).toMatch(/mode must be 0600 or 0400/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses an in-flight deployment transaction", () => {
    const root = hostRoot();
    mkdirSync(join(root, "deployment-transactions/current"), { recursive: true });
    try { expect(runBackup(root).stderr).toMatch(/deployment transaction is in flight/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("never prints a secret value on any refusal path", () => {
    const root = hostRoot();
    writeFileSync(join(root, "deployment-routing/extra.yml"), "http: {}\n", { mode: 0o600 });
    try {
      const result = runBackup(root);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/age1ql3z7hjy/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "host backup preflight"`
Expected: FAIL — the script does not exist, so `spawnSync` reports `Cannot find module`.

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// tunes/deployment/platform-backup.mjs
/**
 * Explorers platform backup. Runs on the production host as the same uid the
 * deploy engine runs as, with no dependency beyond Node, Docker and an `age`
 * binary. `pg_dump` and the AWS CLI are invoked from pinned container images so
 * nothing has to be installed.
 *
 * It captures four surfaces, because a database-only archive cannot restore a
 * working system:
 *   1. PostgreSQL          - custom-format dump WITH owners and ACLs, plus globals
 *   2. host authority      - deployment-state/, deployment-routing/, deployment-transactions/
 *   3. host configuration  - docker-compose.yml, production.env, the secret files
 *   4. S3 media            - a checksummed inventory plus a server-side copy
 *
 * Surfaces 1-3 are tarred and encrypted to a public age key. The host does not
 * hold the private half, so neither host nor bucket compromise reveals the
 * secrets inside.
 *
 * Usage:
 *   node tunes/deployment/platform-backup.mjs --environment prod --reason scheduled
 *   node tunes/deployment/platform-backup.mjs --environment prod --reason pre-deploy \
 *        --candidate-digest sha256:... --candidate-commit <40 hex>
 * Exit 0 on a complete backup, 1 on a refusal or failure. A partial run writes a
 * manifest with complete:false, which the recovery contract refuses as a
 * restore candidate.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

process.umask(0o077);

const AWS_CLI_IMAGE = "amazon/aws-cli@sha256:0000000000000000000000000000000000000000000000000000000000000000";
const POSTGRES_IMAGE = "postgres:15-alpine";

/** Authority files the engine signs. None can be regenerated: the HMAC key is a
 *  GitHub environment secret shipped per run and deleted at exit
 *  (tunes/deployment/music-deploy.sh:88-91), so these are byte-for-byte or nothing. */
const AUTHORITY_FILES = [
  "deployment-state/secure-images.tsv",
  "deployment-state/music-floor.tsv",
  "deployment-state/music-state.tsv",
  "deployment-state/music-schema-floor.tsv",
  "deployment-transactions/schema-epoch.tsv",
];

/** Secret-file variables production.env points at. verify-publication-authority.mjs
 *  requires each to exist at mode 0600/0400 owned by the effective uid. */
const SECRET_FILE_VARIABLES = [
  "DB_RUNTIME_PASSWORD_FILE_HOST",
  "DB_MIGRATOR_PASSWORD_FILE_HOST",
  "MUSIC_TOKEN_SECRET_DIRECTORY_HOST",
  "MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST",
  "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST",
];

function fail(message) {
  process.stderr.write(`platform-backup: ${message}\n`);
  process.exit(1);
}

/** Never let a value reach stdout or stderr. Refusals name the variable, not its
 *  contents - the same discipline as replatform-local.ts's redacted diagnostics. */
function requireSafeRoot(root) {
  if (!root || !isAbsolute(root) || root === "/" || root === "/opt") fail("backup root is unsafe");
  if (!existsSync(root) || !statSync(root).isDirectory()) fail("backup root is unsafe");
  return resolve(root);
}

function requireRegularPrivateFile(path, label) {
  if (!existsSync(path)) fail(`${label} is absent`);
  const stat = lstatSync(path);
  if (!stat.isFile()) fail(`${label} must be a regular file`);
  if (process.platform !== "win32") {
    const mode = stat.mode & 0o777;
    if (mode !== 0o600 && mode !== 0o400) fail(`${label} mode must be 0600 or 0400`);
    if (stat.uid !== process.getuid()) fail(`${label} has the wrong owner`);
  }
  return path;
}

export function parseEnvFile(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return values;
}

/** An age recipient is a public key. Refusing an identity here is the difference
 *  between "the host can encrypt" and "the host can also decrypt every backup". */
export function assertAgeRecipient(recipient) {
  if (!recipient) fail("EXPLORERS_BACKUP_AGE_RECIPIENT is required");
  if (/^AGE-SECRET-KEY-/i.test(recipient)) fail("EXPLORERS_BACKUP_AGE_RECIPIENT recipient must be a public age key");
  if (!/^age1[0-9a-z]{58}$/.test(recipient) && !/^ssh-(ed25519|rsa) /.test(recipient)) {
    fail("EXPLORERS_BACKUP_AGE_RECIPIENT recipient must be a public age key");
  }
  return recipient;
}

export function parseBackupCommand(args) {
  const allowed = new Set(["--environment", "--reason", "--candidate-digest", "--candidate-commit", "--output-manifest", "--prune"]);
  const values = new Map();
  let prune = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) fail("backup arguments rejected");
    if (flag === "--prune") { prune = true; continue; }
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) fail("backup arguments rejected");
    values.set(flag, value);
  }
  const environment = values.get("--environment"), reason = values.get("--reason");
  if (!["prod", "local"].includes(environment)) fail("backup arguments rejected");
  if (!["scheduled", "pre-deploy", "manual"].includes(reason)) fail("backup arguments rejected");
  if (reason === "pre-deploy" && !(/^sha256:[a-f0-9]{64}$/.test(values.get("--candidate-digest") ?? "")
    && /^[a-f0-9]{40}$/.test(values.get("--candidate-commit") ?? ""))) fail("backup arguments rejected");
  return { environment, reason, prune,
    candidateDigest: values.get("--candidate-digest"), candidateCommit: values.get("--candidate-commit"),
    outputManifest: values.get("--output-manifest") };
}

export function preflight(root) {
  const safeRoot = requireSafeRoot(root);
  if (existsSync(join(safeRoot, "deployment-transactions/current"))) {
    fail("a deployment transaction is in flight; refusing to capture inconsistent authority");
  }
  requireRegularPrivateFile(join(safeRoot, "docker-compose.yml"), "docker-compose.yml");
  const environmentFile = requireRegularPrivateFile(join(safeRoot, "production.env"), "production.env");
  const routing = readdirSync(join(safeRoot, "deployment-routing")).filter(name => /\.(ya?ml)$/.test(name));
  if (routing.length !== 1) fail("deployment-routing must hold exactly one Traefik provider file");
  for (const relative of AUTHORITY_FILES) requireRegularPrivateFile(join(safeRoot, relative), relative);
  const values = parseEnvFile(readFileSync(environmentFile, "utf8"));
  assertAgeRecipient(values.get("EXPLORERS_BACKUP_AGE_RECIPIENT"));
  for (const variable of SECRET_FILE_VARIABLES) {
    const path = values.get(variable);
    if (!path) fail(`${variable} is absent from production.env`);
    if (!existsSync(path)) fail(`${variable} points at an absent path`);
  }
  return { root: safeRoot, values, routeFile: join(safeRoot, "deployment-routing", routing[0]) };
}

// Entry point. Later tasks extend `main`.
export function main(argv) {
  const command = parseBackupCommand(argv);
  const context = preflight(process.env.EXPLORERS_BACKUP_ROOT ?? "/opt/explorers");
  process.stdout.write(`${JSON.stringify({ stage: "preflight", ok: true, reason: command.reason })}\n`);
  return { command, context };
}

if (resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  main(process.argv.slice(2));
}
```

Add to the root `package.json` `scripts`:

```json
"platform:backup": "node tunes/deployment/platform-backup.mjs"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "host backup preflight"`
Expected: PASS, 8 tests. On Windows the mode case returns early — the mode and owner checks only apply where POSIX modes are meaningful, exactly as `music-deploy-engine.sh:136,144,153` relaxes them under test mode.

**Do not reach for `whoami.exe` to harden a temp directory in these tests.** Eight tunes test files already fail on Windows because Git Bash's `whoami` shadows `whoami.exe` (the pattern at `tunes/server/test/deployment/music-deploy-executable.test.ts:40-50`). Returning early on `win32`, as above, keeps this file out of that family.

- [ ] **Step 5: Commit**

```bash
git add tunes/deployment/platform-backup.mjs package.json tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): host backup preflight refuses unsafe roots, loose modes and in-flight transactions"
```

---

### Task 4: Capture PostgreSQL

**Files:**
- Modify: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { buildDumpCommand, buildGlobalsCommand, assertDumpIsRestorable } from "../../../deployment/platform-backup.mjs";

describe("database capture", () => {
  const values = new Map([["DB_NAME", "explorers"], ["DB_MIGRATOR_USER", "music_migrator"]]);

  it("dumps custom format with owners and ACLs retained", () => {
    const command = buildDumpCommand({ values, project: "explorers-production", outputPath: "/tmp/dump.pgc" });
    expect(command.args).toContain("--format=custom");
    expect(command.args).toContain("--no-password");
    // Ownership is attested at boot (music-runtime-role.ts:1038-1039), so a
    // dump that drops it produces a database the application refuses to start on.
    expect(command.args).not.toContain("--no-owner");
    expect(command.args).not.toContain("--no-acl");
    expect(command.args).not.toContain("--data-only");
    expect(command.args.join(" ")).toContain("exec");
  });

  it("captures globals without role passwords", () => {
    const command = buildGlobalsCommand({ values, project: "explorers-production" });
    expect(command.args).toContain("--globals-only");
    // SCRAM verifiers are secrets we do not need: the deploy gate re-sets the
    // runtime login password from the secret file on every deploy
    // (run-migration-gate.ts:43), so the hash is never the authority.
    expect(command.args).toContain("--no-role-passwords");
  });

  it("refuses a dump that is empty or not a pg_dump custom archive", () => {
    expect(() => assertDumpIsRestorable(Buffer.alloc(0))).toThrow(/dump is empty/);
    expect(() => assertDumpIsRestorable(Buffer.from("-- plain sql\n"))).toThrow(/custom-format/);
    expect(assertDumpIsRestorable(Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(64)]))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "database capture"`
Expected: FAIL — `buildDumpCommand` is not exported.

- [ ] **Step 3: Write the implementation** (append to `platform-backup.mjs`)

```js
/** `pg_dump` runs inside the already-present postgres:15-alpine service, which
 *  guarantees the client major matches the server and installs nothing on the
 *  host. The database is on an `internal: true` network with no published ports
 *  (docker-compose.yml:155-156, :256-258), so `exec` is the only route in. */
export function buildDumpCommand({ values, project, outputPath }) {
  const database = values.get("DB_NAME"), user = values.get("DB_MIGRATOR_USER");
  if (!database || !user) fail("DB_NAME and DB_MIGRATOR_USER are required");
  return {
    file: "docker",
    args: ["compose", "--project-name", project, "exec", "-T", "db",
      "pg_dump", "--format=custom", "--compress=9", "--no-password",
      "--username", user, "--dbname", database],
    outputPath,
  };
}

/** Roles are cluster-global and are never in a per-database dump. music_runtime
 *  comes from migration 0010 and the four Apps roles from prepareAppWorkerCustody
 *  around 0056, and `pg_restore` needs all of them to exist before it can assign
 *  ownership. */
export function buildGlobalsCommand({ values, project }) {
  const user = values.get("DB_MIGRATOR_USER");
  if (!user) fail("DB_MIGRATOR_USER is required");
  return {
    file: "docker",
    args: ["compose", "--project-name", project, "exec", "-T", "db",
      "pg_dumpall", "--globals-only", "--no-role-passwords", "--no-password", "--username", user],
  };
}

/** A pg_dump custom archive starts with the literal "PGDMP". Checking the magic
 *  is what distinguishes "the dump failed and we stored the error" from a real
 *  archive; without it a zero-byte file would ship as a backup. */
export function assertDumpIsRestorable(bytes) {
  if (!bytes || bytes.length === 0) throw new Error("database dump is empty");
  if (bytes.subarray(0, 5).toString("latin1") !== "PGDMP") throw new Error("database dump is not a custom-format archive");
  return true;
}

export function captureDatabase(context, workDirectory, run = runCommand) {
  const project = context.values.get("COMPOSE_PROJECT_NAME") ?? "explorers-production";
  mkdirSync(join(workDirectory, "database"), { recursive: true, mode: 0o700 });
  const dumpPath = join(workDirectory, "database/dump.pgc");
  const dump = buildDumpCommand({ values: context.values, project, outputPath: dumpPath });
  const dumped = run(dump.file, dump.args, { encoding: "buffer" });
  assertDumpIsRestorable(dumped);
  writeFileSync(dumpPath, dumped, { mode: 0o600, flag: "wx" });
  const globals = buildGlobalsCommand({ values: context.values, project });
  const globalsText = run(globals.file, globals.args, { encoding: "utf8" });
  if (!/CREATE ROLE music_runtime/.test(globalsText)) throw new Error("globals capture does not contain music_runtime");
  writeFileSync(join(workDirectory, "database/globals.sql"), globalsText, { mode: 0o600, flag: "wx" });
  return { dumpPath, roles: [...globalsText.matchAll(/^CREATE ROLE ([a-z_][a-z0-9_]*)/gm)].map(match => match[1]) };
}

function runCommand(file, args, options = {}) {
  const result = spawnSync(process.platform === "win32" ? `${file}.cmd` : file, args,
    { windowsHide: true, maxBuffer: 1024 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${file} ${args[0]} failed with status ${result.status}`);
  return options.encoding === "buffer" ? result.stdout : String(result.stdout);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "database capture"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tunes/deployment/platform-backup.mjs tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): capture a custom-format dump with owners plus a password-free role inventory"
```

---

### Task 5: Capture host authority and configuration

**Files:**
- Modify: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { buildAuthorityTarCommand, buildConfigurationTarCommand } from "../../../deployment/platform-backup.mjs";

describe("host state capture", () => {
  it("tars the three authority directories preserving mode and numeric ownership", () => {
    const command = buildAuthorityTarCommand({ root: "/opt/explorers", outputPath: "/tmp/a.tar" });
    expect(command.args).toContain("--numeric-owner");
    expect(command.args).toContain("--preserve-permissions");
    for (const directory of ["deployment-state", "deployment-routing", "deployment-transactions"]) {
      expect(command.args).toContain(directory);
    }
    // Relative member paths: the restore untars into $root, wherever that is.
    expect(command.args).toContain("--directory");
    expect(command.args.some(a => a.startsWith("/opt/explorers/deployment"))).toBe(false);
  });

  it("tars compose, production.env and every secret file production.env names", () => {
    const values = new Map([
      ["DB_RUNTIME_PASSWORD_FILE_HOST", "/srv/secrets/db-runtime"],
      ["DB_MIGRATOR_PASSWORD_FILE_HOST", "/srv/secrets/db-migrator"],
      ["MUSIC_TOKEN_SECRET_DIRECTORY_HOST", "/srv/secrets/token"],
      ["MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST", "/srv/secrets/publication"],
      ["STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST", "/srv/secrets/strapi-lifecycle"],
    ]);
    const command = buildConfigurationTarCommand({ root: "/opt/explorers", values, outputPath: "/tmp/c.tar" });
    const rendered = command.args.join(" ");
    expect(rendered).toContain("docker-compose.yml");
    expect(rendered).toContain("production.env");
    for (const path of values.values()) expect(rendered).toContain(path);
    expect(command.args).toContain("--numeric-owner");
  });

  it("refuses to tar a secret path that escapes via a symlink", () => {
    const values = new Map([["DB_RUNTIME_PASSWORD_FILE_HOST", "/srv/secrets/../../etc/shadow"]]);
    expect(() => buildConfigurationTarCommand({ root: "/opt/explorers", values, outputPath: "/tmp/c.tar" }))
      .toThrow(/secret path/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "host state capture"`
Expected: FAIL — `buildAuthorityTarCommand` is not exported.

- [ ] **Step 3: Write the implementation** (append to `platform-backup.mjs`)

```js
/** The engine reads every authority file through require_regular_file
 *  (music-deploy-engine.sh:141-150), which demands a regular non-symlink file at
 *  mode 0600/0400 owned by the effective uid. A restore that loses mode or owner
 *  is refused with "wrong owner" or "mode must be 0600 or 0400", so the tar must
 *  carry both. Members are relative so the restore chooses $root. */
export function buildAuthorityTarCommand({ root, outputPath }) {
  return {
    file: "tar",
    args: ["--create", "--file", outputPath, "--numeric-owner", "--preserve-permissions",
      "--directory", root, "deployment-state", "deployment-routing", "deployment-transactions"],
  };
}

export function buildConfigurationTarCommand({ root, values, outputPath }) {
  const secrets = [];
  for (const variable of SECRET_FILE_VARIABLES) {
    const path = values.get(variable);
    if (!path) continue;
    if (!isAbsolute(path) || resolve(path) !== path || path.split("/").includes("..")) {
      throw new Error(`secret path for ${variable} is not a normalized absolute path`);
    }
    secrets.push(path);
  }
  return {
    file: "tar",
    args: ["--create", "--file", outputPath, "--numeric-owner", "--preserve-permissions",
      "--directory", root, "docker-compose.yml", "production.env",
      ...secrets.flatMap(path => ["--directory", dirname(path), basename(path)])],
    secrets,
  };
}

/** The gate attestation volume is tiny and regenerable - /health/ready reads
 *  /deployment-gates/<digest>.json (music-health.ts:52) and the migrator rewrites
 *  it on every deploy - but regenerating it needs MUSIC_GATE_ATTESTATION_KEY from
 *  production.env. Capturing it removes one ordering constraint from a rebuild. */
export function buildGateVolumeCommand({ project, outputPath }) {
  return {
    file: "docker",
    args: ["run", "--rm", "-v", `${project}_music-gate-attestations:/gates:ro`,
      "-v", `${dirname(outputPath)}:/out`, POSTGRES_IMAGE,
      "tar", "--create", "--file", `/out/${basename(outputPath)}`, "--directory", "/gates", "."],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "host state capture"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tunes/deployment/platform-backup.mjs tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): capture the signed deployment authority and host configuration with modes intact"
```

---

### Task 6: Capture media — inventory first, then bytes

The database is the only index of what media exists: nothing lists the bucket by prefix, and the only `ListObjectVersions` call is an exact-key lookup inside `delete()` (`objectStorage.ts:163`). So the inventory is derived from the dump's own tables, which also gives every object a checksum to verify against.

**Files:**
- Modify: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { MEDIA_INVENTORY_QUERY, buildMediaCopyCommand, parseMediaInventory, assertMediaInventoryComplete }
  from "../../../deployment/platform-backup.mjs";

describe("media capture", () => {
  it("inventories ready objects with key, version, size and content hash", () => {
    // Only `ready` rows have bytes that must exist; `uploading` and
    // `pending_delete` rows are intentionally excluded, because the sweeper will
    // delete their objects (mediaRepository.ts:170-187) and a backup must not
    // claim them as restorable.
    expect(MEDIA_INVENTORY_QUERY).toContain("media_objects");
    expect(MEDIA_INVENTORY_QUERY).toContain("media_assets");
    expect(MEDIA_INVENTORY_QUERY).toMatch(/status\s*=\s*'ready'/);
    expect(MEDIA_INVENTORY_QUERY).toContain("object_key");
    expect(MEDIA_INVENTORY_QUERY).toContain("content_sha256");
    expect(MEDIA_INVENTORY_QUERY).toContain("storage_version_id");
  });

  it("parses the inventory and rejects a key outside the environment prefix", () => {
    const rows = parseMediaInventory(
      `{"object_key":"prod/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222","bytes":10,"sha256":"${"a".repeat(64)}","version":null}\n`,
      "prod");
    expect(rows).toHaveLength(1);
    expect(() => parseMediaInventory(`{"object_key":"qa/x/y","bytes":1,"sha256":"${"a".repeat(64)}","version":null}\n`, "prod"))
      .toThrow(/outside the prod prefix/);
  });

  it("copies bytes server-side into the backup prefix", () => {
    const command = buildMediaCopyCommand({
      bucket: "explorers-media",
      sourceKey: "prod/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
      destinationPrefix: "prod/backups/20261018T020000Z-ccccccc/media/",
    });
    const rendered = command.args.join(" ");
    expect(rendered).toContain("s3");
    expect(rendered).toContain("cp");
    // Server-side: no egress, no host disk, and the copy inherits the bucket's
    // existing encryption posture.
    expect(rendered).toContain("s3://explorers-media/prod/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222");
    expect(rendered).toContain("s3://explorers-media/prod/backups/20261018T020000Z-ccccccc/media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222");
    // The destination has four path segments, so assertObjectKey
    // (objectStorage.ts:81-84) rejects it on every application path.
    expect(command.destinationKey.split("/").length).toBeGreaterThan(3);
  });

  it("marks the backup incomplete when a referenced object did not copy", () => {
    const inventory = [{ object_key: "prod/a/b", bytes: 10, sha256: "a".repeat(64), version: null }];
    expect(() => assertMediaInventoryComplete(inventory, { copied: [], failed: ["prod/a/b"] }))
      .toThrow(/1 referenced object/);
    expect(assertMediaInventoryComplete(inventory, { copied: ["prod/a/b"], failed: [] })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "media capture"`
Expected: FAIL — `MEDIA_INVENTORY_QUERY` is not exported.

- [ ] **Step 3: Write the implementation** (append to `platform-backup.mjs`)

```js
/** Derived from media_objects joined to media_assets (migrations/0024:28-42).
 *  Only `ready` assets are claimed: an `uploading` row older than ten minutes
 *  becomes pending_delete and its object is deleted, so claiming it would put a
 *  key in the manifest that the system is about to remove.
 *
 *  Size and hash come from media_objects, where both are NOT NULL (0024:34-35);
 *  media_assets.content_sha256 is nullable (0024:8) and guaranteed only once the
 *  status is 'ready' (0024:21). */
export const MEDIA_INVENTORY_QUERY = `
  SELECT json_build_object(
    'media_id', o.media_id,
    'object_key', o.object_key,
    'bytes', o.byte_size,
    'sha256', encode(o.content_sha256,'hex'),
    'version', o.storage_version_id
  )::text
  FROM media_objects o
  JOIN media_assets a ON a.id = o.media_id
  WHERE a.status = 'ready' AND o.variant = 'original' AND o.deleted_at IS NULL
  ORDER BY o.object_key`;

export function parseMediaInventory(text, environment) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    if (!String(row.object_key).startsWith(`${environment}/`)) {
      throw new Error(`media inventory contains a key outside the ${environment} prefix`);
    }
    if (!/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error("media inventory row has no content hash");
    rows.push(row);
  }
  return rows;
}

export function buildMediaCopyCommand({ bucket, sourceKey, destinationPrefix }) {
  // Keep the `<accountId>/<id>` tail so the restore can reconstruct the original
  // key without a lookup table.
  const tail = sourceKey.split("/").slice(1).join("/");
  const destinationKey = `${destinationPrefix}${tail}`;
  return {
    file: "docker",
    args: ["run", "--rm", "--env", "AWS_ACCESS_KEY_ID", "--env", "AWS_SECRET_ACCESS_KEY",
      "--env", "AWS_SESSION_TOKEN", "--env", "AWS_REGION", AWS_CLI_IMAGE,
      "s3", "cp", `s3://${bucket}/${sourceKey}`, `s3://${bucket}/${destinationKey}`,
      "--only-show-errors"],
    destinationKey,
  };
}

/** A list of live mutable URLs is not a media backup (ticket-8-5.md:45). If any
 *  referenced object failed to copy, the run is incomplete and the manifest's
 *  complete:false makes it unusable as a restore candidate. */
export function assertMediaInventoryComplete(inventory, outcome) {
  const missing = inventory.filter(row => !outcome.copied.includes(row.object_key));
  if (missing.length) throw new Error(`${missing.length} referenced object(s) did not copy into the backup prefix`);
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "media capture"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tunes/deployment/platform-backup.mjs tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): inventory referenced media from the database and copy the bytes server-side"
```

---

### Task 7: Encrypt, upload, and write the manifest

**Files:**
- Modify: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`
- Create: `tunes/deployment/platform-backup.cron`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { buildEncryptCommand, buildUploadCommand, buildManifest } from "../../../deployment/platform-backup.mjs";
import { backupManifestSchema } from "../../../shared/platformRecoveryContract";

describe("archive, encrypt and publish", () => {
  const recipient = "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg0r9rfkqput9pg";

  it("encrypts to a recipient and never to a passphrase", () => {
    const command = buildEncryptCommand({ recipient, inputPath: "/tmp/a.tar", outputPath: "/tmp/a.tar.age" });
    expect(command.args).toEqual(["--encrypt", "--recipient", recipient, "--output", "/tmp/a.tar.age", "/tmp/a.tar"]);
    // A passphrase would have to live on the host, which is the thing we are
    // protecting against.
    expect(command.args).not.toContain("--passphrase");
  });

  it("uploads the ciphertext under prod/backups/ with no ACL change", () => {
    const command = buildUploadCommand({ bucket: "explorers-media", localPath: "/tmp/a.tar.age",
      key: "prod/backups/20261018T020000Z-ccccccc/archive.tar.age" });
    expect(command.args.join(" ")).toContain("s3://explorers-media/prod/backups/20261018T020000Z-ccccccc/archive.tar.age");
    expect(command.args).not.toContain("--acl");
  });

  it("builds a manifest that the recovery contract accepts", () => {
    const manifest = buildManifest({
      runId: "a".repeat(32), environment: "prod", reason: "pre-deploy",
      startedAt: "2026-10-18T02:00:00.000Z", completedAt: "2026-10-18T02:03:11.000Z",
      sourceCommit: "c".repeat(40), imageDigest: `sha256:${"d".repeat(64)}`,
      migrationMarker: "0056_explorers_app_enrichment_jobs",
      journalChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64),
      archive: { key: "prod/backups/20261018T020000Z-ccccccc/archive.tar.age", bytes: 4096, sha256: "1".repeat(64) },
      members: [
        { name: "database/dump.pgc", bytes: 2048, sha256: "2".repeat(64) },
        { name: "database/globals.sql", bytes: 64, sha256: "3".repeat(64) },
        { name: "host/deployment-authority.tar", bytes: 64, sha256: "4".repeat(64) },
        { name: "host/configuration.tar", bytes: 64, sha256: "5".repeat(64) },
        { name: "media/inventory.jsonl", bytes: 64, sha256: "6".repeat(64) },
      ],
      roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
        "app_enrichment_retention", "app_enrichment_retention_owner"],
      migratorRole: "music_migrator", runtimeLoginRole: "explorers_runtime", databaseName: "explorers",
      media: { objects: 1, bytes: 10, prefix: "prod/backups/20261018T020000Z-ccccccc/media/" },
      tableRowCounts: { creator_accounts: 2 },
    });
    expect(() => backupManifestSchema.parse(manifest)).not.toThrow();
  });

  it("refuses to build a complete manifest when a required member is absent", () => {
    expect(() => buildManifest({ members: [{ name: "database/dump.pgc", bytes: 1, sha256: "2".repeat(64) }] }))
      .toThrow(/required member/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "archive, encrypt and publish"`
Expected: FAIL — `buildEncryptCommand` is not exported.

- [ ] **Step 3: Write the implementation** (append to `platform-backup.mjs`)

```js
export function buildEncryptCommand({ recipient, inputPath, outputPath }) {
  assertAgeRecipient(recipient);
  return { file: "age", args: ["--encrypt", "--recipient", recipient, "--output", outputPath, inputPath] };
}

export function buildUploadCommand({ bucket, localPath, key }) {
  if (!key.startsWith("prod/backups/") && !key.startsWith("local/backups/")) {
    throw new Error("backup objects may only be written under a backups prefix");
  }
  return {
    file: "docker",
    args: ["run", "--rm", "--env", "AWS_ACCESS_KEY_ID", "--env", "AWS_SECRET_ACCESS_KEY",
      "--env", "AWS_SESSION_TOKEN", "--env", "AWS_REGION",
      "-v", `${dirname(localPath)}:/payload:ro`, AWS_CLI_IMAGE,
      "s3", "cp", `/payload/${basename(localPath)}`, `s3://${bucket}/${key}`, "--only-show-errors"],
  };
}

/** The required-member check lives here as well as in the zod schema on purpose:
 *  the host script does not import zod, so it would otherwise be able to write a
 *  manifest claiming complete:true that only the drill would later reject. */
export function buildManifest(input) {
  const required = ["database/dump.pgc", "database/globals.sql",
    "host/deployment-authority.tar", "host/configuration.tar", "media/inventory.jsonl"];
  const names = new Set((input.members ?? []).map(member => member.name));
  const absent = required.filter(name => !names.has(name));
  if (absent.length) throw new Error(`archive is missing a required member: ${absent.join(", ")}`);
  return { version: "explorers-platform-backup/v1", complete: true, ...input };
}

export function writeManifest(path, manifest) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function runIdentifier() { return randomBytes(16).toString("hex"); }
```

Wire these into `main` so a full run executes preflight → `captureDatabase` → authority/configuration tars → media inventory and copy → one `tar` of the work directory → `age` encrypt → upload → `manifest.json` upload → `LATEST.json` upload → write `$root/deployment-state/backup-last-success.json` (mode 0600) with the run id, completion time and archive key. On any failure after the work directory exists, write a `complete: false` manifest locally, upload it next to the partial archive, and exit 1. Remove the plaintext work directory in a `finally`.

- [ ] **Step 4: Create the cron fragment**

```
# tunes/deployment/platform-backup.cron
# Install as /etc/cron.d/explorers-backup, mode 0644, owned by root.
# Runs as the same user the deploy engine runs as, so file ownership of the
# authority tar matches what require_regular_file expects on restore.
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 2 * * * deploy /usr/bin/node /opt/explorers/platform-backup.mjs --environment prod --reason scheduled --prune >> /var/log/explorers-backup.log 2>&1
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "archive, encrypt and publish"`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add tunes/deployment/platform-backup.mjs tunes/deployment/platform-backup.cron tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): encrypt the archive to a public age key, publish it and record a manifest"
```

---

### Task 8: Retention, with a named gate instead of a silent failure

**Files:**
- Modify: `tunes/deployment/platform-backup.mjs`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { planRetention, RETENTION } from "../../../deployment/platform-backup.mjs";

describe("retention", () => {
  const run = (day: number, reason: string) => ({
    key: `prod/backups/20261${String(day).padStart(3, "0")}T020000Z-abc1234/archive.tar.age`,
    completedAt: new Date(Date.UTC(2026, 9, day, 2, 0, 0)).toISOString(),
    reason,
  });

  it("keeps the documented windows", () => {
    expect(RETENTION).toEqual({ scheduledDays: 14, preDeployDays: 30, monthlyCount: 12 });
  });

  it("keeps 14 dailies and deletes the 15th", () => {
    const runs = Array.from({ length: 20 }, (_, index) => run(20 - index, "scheduled"));
    const plan = planRetention(runs, { now: Date.parse("2026-10-20T03:00:00.000Z") });
    expect(plan.keep).toHaveLength(14);
    expect(plan.delete).toHaveLength(6);
  });

  it("keeps a pre-deploy backup for longer than a scheduled one", () => {
    const plan = planRetention([run(1, "pre-deploy"), run(1, "scheduled")],
      { now: Date.parse("2026-10-20T03:00:00.000Z") });
    expect(plan.keep.map(entry => entry.reason)).toEqual(["pre-deploy"]);
  });

  it("never plans a delete outside the backups prefix", () => {
    expect(() => planRetention([{ key: "prod/aaaa/bbbb", completedAt: run(1, "scheduled").completedAt, reason: "scheduled" }],
      { now: Date.parse("2026-10-20T03:00:00.000Z") })).toThrow(/outside the backups prefix/);
  });

  it("reports a named gate rather than failing when deletion is denied", () => {
    const outcome = applyRetention({ delete: [run(1, "scheduled")], keep: [] },
      { run: () => { throw new Error("AccessDenied"); } });
    expect(outcome).toEqual({ pruned: 0, gate: "BACKUP_DELETE_PERMISSION_UNAVAILABLE" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "retention"`
Expected: FAIL — `planRetention` is not exported.

- [ ] **Step 3: Write the implementation** (append to `platform-backup.mjs`)

```js
/** Engineering defaults proposed by ticket-8-5.md:40 ("a daily backup schedule
 *  and 14-day retention as initial engineering defaults"), with two additions:
 *  pre-deploy backups live longer because they are the only migration safety
 *  net, and one backup a month is kept for a year. Confirm against bucket rules
 *  and cost before applying - see the owner decisions section. */
export const RETENTION = { scheduledDays: 14, preDeployDays: 30, monthlyCount: 12 };

export function planRetention(runs, { now }) {
  for (const entry of runs) {
    if (!/^(prod|local)\/backups\//.test(entry.key)) throw new Error("retention candidate is outside the backups prefix");
  }
  const monthly = new Set();
  const keep = [], remove = [];
  for (const entry of [...runs].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))) {
    const ageDays = (now - Date.parse(entry.completedAt)) / 86_400_000;
    const month = entry.completedAt.slice(0, 7);
    const withinWindow = entry.reason === "pre-deploy"
      ? ageDays <= RETENTION.preDeployDays
      : ageDays <= RETENTION.scheduledDays;
    const monthlyKeeper = !monthly.has(month) && monthly.size < RETENTION.monthlyCount;
    if (withinWindow || monthlyKeeper) { monthly.add(month); keep.push(entry); }
    else remove.push(entry);
  }
  return { keep, delete: remove };
}

/** ticket-8-5.md:41 says to inspect existing IAM rather than assume lifecycle or
 *  deletion authority, and that "missing encryption permission is a named gate".
 *  The same applies to deletion: a denial is reported, never swallowed and never
 *  fatal, because a backup that succeeded must not be failed by a prune. */
export function applyRetention(plan, { run = runCommand, bucket } = {}) {
  let pruned = 0;
  for (const entry of plan.delete) {
    try {
      run("docker", ["run", "--rm", "--env", "AWS_ACCESS_KEY_ID", "--env", "AWS_SECRET_ACCESS_KEY",
        "--env", "AWS_SESSION_TOKEN", "--env", "AWS_REGION", AWS_CLI_IMAGE,
        "s3", "rm", `s3://${bucket}/${dirname(entry.key)}`, "--recursive", "--only-show-errors"]);
      pruned += 1;
    } catch {
      return { pruned, gate: "BACKUP_DELETE_PERMISSION_UNAVAILABLE" };
    }
  }
  return { pruned };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "retention"`
Expected: PASS, 5 tests. Add `applyRetention` to the test file's import list.

- [ ] **Step 5: Commit**

```bash
git add tunes/deployment/platform-backup.mjs tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): prune only inside the backups prefix and report a denied delete as a gate"
```

---

### Task 9: A maintenance pause, so a restored database can be inspected before it is swept

This is the one application change in the phase, and it is not cosmetic. Two sweepers run against whatever database the process is pointed at, with no way to stop them: `startAnalyticsMaintenance` at `canonicalStartup.ts:50` and the account-lifecycle loop at `:52-60`, which calls `runAccountLifecycleMaintenance(pool, storage)` immediately and then every 60 seconds, and that in turn calls `storage.delete` for pending deletions (`accountLifecycleMaintenance.ts:91`). The media sweeper reaches S3 too: `abandoned()` selects `ready` assets older than 24 hours with zero references across all nine link tables (`mediaRepository.ts:175-184`) and `retryPendingDeletes` deletes their bytes (`media.ts:62`).

Restore a database to time `T` while the bucket is at `T' > T`, boot the production image, and any asset whose link rows existed at `T'` but not at `T` has its bytes deleted within sixty seconds. **That is data destruction during recovery, and it is the default behaviour today.**

**Files:**
- Modify: `tunes/server/auth/canonicalStartup.ts`
- Create: `tunes/server/test/contracts/canonical-maintenance-pause.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveMaintenanceAdmission } from "../../auth/canonicalStartup";

describe("canonical maintenance admission", () => {
  it("runs maintenance by default", () => {
    expect(resolveMaintenanceAdmission({})).toEqual({ paused: false });
  });

  it("pauses only on the exact acknowledgement token", () => {
    expect(resolveMaintenanceAdmission({ EXPLORERS_MAINTENANCE_PAUSED: "RESTORE_IN_PROGRESS" }))
      .toEqual({ paused: true });
  });

  it.each(["1", "true", "yes", "", "restore_in_progress"])("refuses to pause on %j", (value) => {
    expect(() => resolveMaintenanceAdmission({ EXPLORERS_MAINTENANCE_PAUSED: value }))
      .toThrow(/EXPLORERS_MAINTENANCE_PAUSED/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/canonical-maintenance-pause.test.ts`
Expected: FAIL — `resolveMaintenanceAdmission` is not exported from `canonicalStartup`.

- [ ] **Step 3: Write the implementation**

In `tunes/server/auth/canonicalStartup.ts`, add the export:

```ts
/** Recovery-only pause for the two maintenance loops. Both reach S3: the account
 *  lifecycle loop deletes objects for pending deletions
 *  (accountLifecycleMaintenance.ts:91) and the lazy media sweeper deletes the
 *  bytes of any ready asset with no remaining references
 *  (mediaRepository.ts:175-184 via media.ts:62). Booting against a database
 *  restored to an earlier point than the bucket would therefore destroy bytes
 *  that the restore is trying to preserve.
 *
 *  A truthy-string check is deliberately rejected: an accidental
 *  EXPLORERS_MAINTENANCE_PAUSED=1 left in production would silently stop every
 *  account deletion, which is a legal obligation, so only the exact
 *  acknowledgement is honoured and anything else is a hard startup failure. */
export function resolveMaintenanceAdmission(environment: Environment): { paused: boolean } {
  const value = environment.EXPLORERS_MAINTENANCE_PAUSED;
  if (value === undefined) return { paused: false };
  if (value !== "RESTORE_IN_PROGRESS") {
    throw new Error("EXPLORERS_MAINTENANCE_PAUSED must be absent or exactly RESTORE_IN_PROGRESS");
  }
  return { paused: true };
}
```

Then in `startCanonicalServer`, call it before the server listens and gate both loops:

```ts
const maintenanceAdmission = resolveMaintenanceAdmission(environment);
// ... after httpServer.listen resolves:
const storage = resolveObjectStorage(environment);
if (maintenanceAdmission.paused) {
  process.stderr.write("Maintenance loops are paused for recovery; account deletion and media sweeps will not run\n");
}
const stopAnalyticsMaintenance = maintenanceAdmission.paused
  ? async () => undefined
  : startAnalyticsMaintenance(pool);
let maintenance: Promise<void> | undefined;
const maintain = () => { /* unchanged */ };
if (!maintenanceAdmission.paused) {
  maintain();
}
const maintenanceTimer = setInterval(() => { if (!maintenanceAdmission.paused) maintain(); }, 60_000);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/canonical-maintenance-pause.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole tunes unit lane to confirm nothing regressed**

Run: `npm --prefix tunes test`
Expected: PASS. Compare the failure count to the pre-change baseline recorded in this worktree; on Windows, eight files fail in the baseline because Git Bash's `whoami` shadows `whoami.exe` — run from PowerShell, where `whoami.exe` resolves, and that baseline is clean.

- [ ] **Step 6: Commit**

```bash
git add tunes/server/auth/canonicalStartup.ts tunes/server/test/contracts/canonical-maintenance-pause.test.ts
git commit -m "feat(recovery): allow the maintenance loops to be paused during a restore"
```

---

### Task 10: Reconstruct the production role namespace, then restore

Ownership is attested at boot, and the production migrator role is not necessarily the disposable container's `music_migrator`. The drill therefore rebuilds the role namespace from the manifest and the globals file — never from a guess — before `pg_restore` runs.

**Files:**
- Modify: `scripts/platform-restore-drill.ts`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { planRoleBootstrap, buildRestoreCommand, PERMITTED_RESTORE_ROLES }
  from "../../../../scripts/platform-restore-drill";

describe("role bootstrap", () => {
  const globals = [
    "CREATE ROLE music_runtime;",
    "ALTER ROLE music_runtime WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
    "CREATE ROLE app_enrichment_worker;",
    "ALTER ROLE app_enrichment_worker WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
    "CREATE ROLE app_enrichment_worker_owner;",
    "CREATE ROLE app_enrichment_retention;",
    "CREATE ROLE app_enrichment_retention_owner;",
    "CREATE ROLE music_migrator WITH SUPERUSER CREATEDB CREATEROLE LOGIN;",
    "CREATE ROLE explorers_runtime WITH LOGIN PASSWORD 'SCRAM-SHA-256$4096:abc';",
  ].join("\n");

  const manifest = { roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
    "app_enrichment_retention", "app_enrichment_retention_owner"],
    migratorRole: "prod_migrator", runtimeLoginRole: "explorers_runtime" };

  it("creates exactly the five capability roles plus a placeholder for the production migrator", () => {
    const plan = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator"] });
    expect(plan.create).toEqual([
      "music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
      "app_enrichment_retention", "app_enrichment_retention_owner", "prod_migrator",
    ]);
    // 0056 asserts NOINHERIT on the four Apps roles
    // (0056_explorers_app_enrichment_jobs.sql:4-7), so the DDL must match.
    expect(plan.statements.join("\n")).toContain("CREATE ROLE app_enrichment_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
    expect(plan.statements.join("\n")).toContain("CREATE ROLE music_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS");
  });

  it("never creates a login, a password or a privileged role", () => {
    const plan = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator"] });
    const rendered = plan.statements.join("\n");
    expect(rendered).not.toMatch(/PASSWORD/);
    expect(rendered).not.toMatch(/\bSUPERUSER\b(?!\s)/);
    expect(rendered).not.toMatch(/\bLOGIN\b(?!\w)/);
    expect(rendered).not.toContain("SCRAM-SHA-256");
    // 0056:8 refuses if app_enrichment_worker has any member.
    expect(rendered).not.toMatch(/GRANT app_enrichment_worker/);
  });

  it("refuses a role the manifest did not declare", () => {
    expect(() => planRoleBootstrap(`${globals}\nCREATE ROLE attacker;`,
      { ...manifest, roles: [...manifest.roles, "attacker"] }, { existingRoles: [] }))
      .toThrow(/not a permitted restore role/);
    expect(PERMITTED_RESTORE_ROLES).toEqual(["music_runtime", "app_enrichment_worker",
      "app_enrichment_worker_owner", "app_enrichment_retention", "app_enrichment_retention_owner"]);
  });

  it("skips a role the disposable cluster already owns", () => {
    const plan = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator", "music_runtime"] });
    expect(plan.create).not.toContain("music_runtime");
  });
});

describe("pg_restore invocation", () => {
  it("restores with owners and ACLs into a single transaction and stops on error", () => {
    const command = buildRestoreCommand({ containerId: "a".repeat(64), database: "explorers_restore_drill_aaaaaaaa",
      user: "music_migrator", dumpPath: "/restore/dump.pgc" });
    expect(command.args).toContain("--exit-on-error");
    expect(command.args).toContain("--single-transaction");
    expect(command.args).not.toContain("--no-owner");
    expect(command.args).not.toContain("--no-acl");
    expect(command.args).not.toContain("--clean");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "role bootstrap"`
Expected: FAIL — `planRoleBootstrap` is not exported.

- [ ] **Step 3: Write the implementation** (append to `scripts/platform-restore-drill.ts`)

```ts
/** The only roles a restore may create. Five NOLOGIN capability roles, nothing
 *  more: music_runtime from migrations/0010:9, and the four Apps roles that
 *  prepareAppWorkerCustody creates around 0056
 *  (app-enrichment-worker-custody.ts:4,33) and that 0056:4-8 then asserts exist
 *  with exact attributes. */
export const PERMITTED_RESTORE_ROLES = [
  "music_runtime",
  "app_enrichment_worker",
  "app_enrichment_worker_owner",
  "app_enrichment_retention",
  "app_enrichment_retention_owner",
] as const;

/** 0056:4-7 requires NOT rolinherit on all four Apps roles; 0010:9 creates
 *  music_runtime with INHERIT. Getting this wrong fails the migration with
 *  'Apps worker custody must be provisioned before migration'. */
const ROLE_INHERITANCE: Record<string, "INHERIT" | "NOINHERIT"> = {
  music_runtime: "INHERIT",
  app_enrichment_worker: "NOINHERIT",
  app_enrichment_worker_owner: "NOINHERIT",
  app_enrichment_retention: "NOINHERIT",
  app_enrichment_retention_owner: "NOINHERIT",
};

export function planRoleBootstrap(
  globals: string,
  manifest: { roles: readonly string[]; migratorRole: string; runtimeLoginRole: string },
  observed: { existingRoles: readonly string[] },
): { create: string[]; statements: string[] } {
  for (const role of manifest.roles) {
    if (!(PERMITTED_RESTORE_ROLES as readonly string[]).includes(role)) {
      throw new Error(`${role} is not a permitted restore role`);
    }
  }
  const declared = [...globals.matchAll(/^CREATE ROLE ([a-z_][a-z0-9_]*)/gm)].map(match => match[1]);
  for (const role of manifest.roles) {
    if (!declared.includes(role)) throw new Error(`${role} is declared in the manifest but absent from the globals capture`);
  }
  const existing = new Set(observed.existingRoles);
  const create: string[] = [], statements: string[] = [];
  for (const role of PERMITTED_RESTORE_ROLES) {
    if (!manifest.roles.includes(role) || existing.has(role)) continue;
    create.push(role);
    statements.push(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE ${ROLE_INHERITANCE[role]} NOREPLICATION NOBYPASSRLS`);
  }
  // The dump assigns ownership to the production migrator by name. The role must
  // exist for pg_restore to succeed, but it is created unprivileged and without
  // login: the drill restores as the container's own superuser.
  if (!existing.has(manifest.migratorRole)) {
    create.push(manifest.migratorRole);
    statements.push(`CREATE ROLE ${manifest.migratorRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  }
  return { create, statements };
}

/** Owners and ACLs are retained deliberately: music-runtime-role.ts:963,1026,
 *  1038-1039 attest the owner of every table, sequence and function, so a
 *  --no-owner restore produces a database the application refuses to boot on.
 *  --clean is omitted because the target is required to be empty (Task 2). */
export function buildRestoreCommand(input: { containerId: string; database: string; user: string; dumpPath: string }) {
  return {
    file: "docker",
    args: ["exec", "-i", input.containerId,
      "pg_restore", "--exit-on-error", "--single-transaction", "--no-password",
      "--username", input.user, "--dbname", input.database, input.dumpPath],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "role bootstrap"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/platform-restore-drill.ts tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): rebuild the production role namespace from the manifest before restoring"
```

---

### Task 11: The restore oracle — the application's own attestations

Nothing a plan author writes by hand is as strict as what the application already checks at boot. This task wires those checks in as the pass criterion.

**Files:**
- Modify: `scripts/platform-restore-drill.ts`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { assertRestoredSchema, assertRowCounts } from "../../../../scripts/platform-restore-drill";

describe("restore fidelity oracle", () => {
  const state = {
    ready: true, currentId: "0056_explorers_app_enrichment_jobs",
    currentChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64),
    appliedIds: Array.from({ length: 56 }, (_, index) => `${String(index + 1).padStart(4, "0")}_x`),
    pendingIds: [] as string[],
  };
  const manifest = { migrationMarker: "0056_explorers_app_enrichment_jobs",
    journalChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64) };

  it("accepts a restore whose journal and live fingerprint both match the manifest", () => {
    expect(assertRestoredSchema(state, manifest)).toEqual({ rows: 56, currentId: state.currentId });
  });

  it.each([
    ["an unready journal", { ready: false }],
    ["a different chain tip", { currentId: "0055_explorers_app_enrichment" }],
    ["a different migration checksum", { currentChecksum: "0".repeat(64) }],
    // This is the case that catches a lossy dump: the journal row inside the dump
    // records the fingerprint the migration produced, and inspectMusicDatabase
    // recomputes it live (migrate.ts:200-203). If pg_restore dropped a default,
    // a trigger, an index or a function body, the two disagree.
    ["a drifted schema fingerprint", { schemaChecksum: "0".repeat(64) }],
    ["pending migrations", { pendingIds: ["0057_x"] }],
  ])("refuses %s", (_name, override) => {
    expect(() => assertRestoredSchema({ ...state, ...override }, manifest)).toThrow(/restored schema/);
  });

  it("compares every table's row count against the manifest and names the first divergence", () => {
    expect(assertRowCounts({ creator_accounts: 2, auth_user: 2 }, { creator_accounts: 2, auth_user: 2 })).toBe(true);
    expect(() => assertRowCounts({ creator_accounts: 1, auth_user: 2 }, { creator_accounts: 2, auth_user: 2 }))
      .toThrow(/creator_accounts/);
    expect(() => assertRowCounts({ creator_accounts: 2 }, { creator_accounts: 2, auth_user: 2 }))
      .toThrow(/auth_user/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "restore fidelity oracle"`
Expected: FAIL — `assertRestoredSchema` is not exported.

- [ ] **Step 3: Write the implementation** (append to `scripts/platform-restore-drill.ts`)

```ts
import { inspectMusicDatabase, verifyMusicDatabase } from "../tunes/server/db/migrate";
import { provisionMusicRuntimeLogin, verifyMusicRuntimeDatabaseConnection } from "../tunes/server/db/music-runtime-role";

export interface RestoredMigrationState {
  ready: boolean; currentId?: string; currentChecksum?: string; schemaChecksum?: string;
  appliedIds: readonly string[]; pendingIds: readonly string[];
}

/** The dump carries its own witness. music_schema_migrations stores a per-migration
 *  schema_checksum computed from the live catalog at apply time (migrate.ts:263),
 *  and inspectMusicDatabase recomputes that fingerprint and throws
 *  `schema drift after <id>` when it no longer matches (:200-203). Comparing both
 *  against the manifest closes the loop: the restore is faithful to what
 *  production had, not merely internally consistent. */
export function assertRestoredSchema(
  state: RestoredMigrationState,
  manifest: { migrationMarker: string; journalChecksum: string; schemaChecksum: string },
): { rows: number; currentId: string } {
  if (!state.ready) throw new Error("restored schema is not ready");
  if (state.pendingIds.length) throw new Error(`restored schema has ${state.pendingIds.length} pending migration(s)`);
  if (state.currentId !== manifest.migrationMarker) throw new Error(`restored schema is at ${state.currentId}, not ${manifest.migrationMarker}`);
  if (state.currentChecksum !== manifest.journalChecksum) throw new Error("restored schema migration checksum does not match the manifest");
  if (state.schemaChecksum !== manifest.schemaChecksum) throw new Error("restored schema fingerprint does not match the manifest");
  return { rows: state.appliedIds.length, currentId: state.currentId };
}

export function assertRowCounts(actual: Record<string, number>, expected: Record<string, number>): true {
  for (const [table, count] of Object.entries(expected)) {
    if (!(table in actual)) throw new Error(`restored database has no table ${table}`);
    if (actual[table] !== count) throw new Error(`restored ${table} has ${actual[table]} rows, manifest recorded ${count}`);
  }
  return true;
}

/** The second oracle: the restricted-role attestation the application runs before
 *  it creates its pool (canonicalStartup.ts:33, music-startup.ts:91). It checks
 *  the role graph, database and schema privileges, the SET ROLE boundary, the
 *  exact 118-table / 26-sequence / 99-function inventory with owners, a per-table
 *  privilege matrix, and roughly 100 denial probes that must each raise 42501
 *  (music-runtime-role.ts:845-1081). If this passes, the restored database is
 *  one the real image will boot against. */
export async function attestRestoredRuntimeRole(input: {
  ownerPool: import("pg").Pool;
  connection: { connectionString: string; user: string; password: string };
  migratorRole: string;
}): Promise<void> {
  await provisionMusicRuntimeLogin(input.ownerPool, { loginRole: input.connection.user, password: input.connection.password });
  await verifyMusicRuntimeDatabaseConnection(input.connection as never, input.migratorRole);
}

export async function proveRestoredDatabase(pool: import("pg").Pool, manifest: {
  migrationMarker: string; journalChecksum: string; schemaChecksum: string; tableRowCounts: Record<string, number>;
}): Promise<{ rows: number; currentId: string }> {
  // verifyMusicDatabase throws on a conflicting unversioned table and on any
  // state that is not exactly the chain tip (migrate.ts:284-291).
  await verifyMusicDatabase(pool);
  const state = await inspectMusicDatabase(pool);
  const proof = assertRestoredSchema(state as RestoredMigrationState, manifest);
  const counts: Record<string, number> = {};
  for (const table of Object.keys(manifest.tableRowCounts)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error("unsafe catalog identifier in manifest row counts");
    const result = await pool.query<{ rows: number }>(`SELECT count(*)::int AS rows FROM "${table}"`);
    counts[table] = result.rows[0]?.rows ?? 0;
  }
  assertRowCounts(counts, manifest.tableRowCounts);
  return proof;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "restore fidelity oracle"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/platform-restore-drill.ts tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): prove a restore with the journal, the live schema fingerprint and the role attestation"
```

---

### Task 12: Boot the restored system and probe it

A schema that attests is not a working product. This task boots the canonical application against the restored database and checks identity, every category, and media through the gated route.

**Files:**
- Modify: `scripts/platform-restore-drill.ts`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { RestoredMediaStore, drillProbePlan } from "../../../../scripts/platform-restore-drill";
import { categoryKeys } from "../../../shared/explorersContract";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";

describe("restored media store", () => {
  it("reports the production environment so resolveMediaContent admits prod keys", () => {
    // media.ts:153 refuses any row whose storage_environment differs from the
    // store's. LocalObjectStorage hard-codes "local" (objectStorage.ts:87), so a
    // prod-keyed restore cannot be served through it without mutating data.
    expect(new RestoredMediaStore("/tmp/x", "prod").environment).toBe("prod");
  });

  it("serves bytes by the original production key", async () => {
    const root = mkdtempSync(join(tmpdir(), "restored-media-"));
    const key = "prod/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
    try {
      mkdirSync(join(root, ...key.split("/").slice(0, -1)), { recursive: true });
      writeFileSync(join(root, ...key.split("/")), Buffer.from("bytes"));
      const store = new RestoredMediaStore(root, "prod");
      expect((await store.get(key)).toString()).toBe("bytes");
      expect(createHash("sha256").update(await store.get(key)).digest("hex")).toHaveLength(64);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a key outside the environment prefix and refuses every write", async () => {
    const store = new RestoredMediaStore("/tmp/x", "prod");
    await expect(store.get("local/a/b")).rejects.toThrow(/key/);
    await expect(store.put("prod/a/b", Buffer.alloc(0))).rejects.toThrow(/read-only/);
    await expect(store.delete("prod/a/b")).rejects.toThrow(/read-only/);
  });
});

describe("drill probe plan", () => {
  it("covers liveness, readiness, an unauthenticated principal and every category key", () => {
    const plan = drillProbePlan({ username: "owner" });
    expect(plan.map(probe => probe.path)).toContain("/health/live");
    expect(plan.map(probe => probe.path)).toContain("/health/ready");
    expect(plan.find(probe => probe.path === "/api/explorers/v1/me")?.expect).toBe(401);
    for (const category of categoryKeys) {
      expect(plan.map(probe => probe.path))
        .toContain(`/api/explorers/v1/public/profiles/owner/collections/${category}`);
    }
  });

  it("derives categories from the shared contract rather than a literal list", () => {
    // Decision D2 deletes Music, and P3-5 narrows categoryKeys from nine to
    // eight. Importing the contract means this drill narrows with it.
    expect(drillProbePlan({ username: "owner" }).filter(probe => probe.category).length).toBe(categoryKeys.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "restored media store"`
Expected: FAIL — `RestoredMediaStore` is not exported.

- [ ] **Step 3: Write the implementation** (append to `scripts/platform-restore-drill.ts`)

```ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath, sep } from "node:path";
import { categoryKeys } from "../tunes/shared/explorersContract";
import { createCanonicalApp } from "../tunes/server/auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../tunes/server/auth/betterAuth";
import type { ObjectStorage, StorageEnvironment } from "../tunes/server/services/objectStorage";

/** A read-only ObjectStorage over the restored media directory, reporting the
 *  production environment so media.ts:153 admits the restored rows unchanged.
 *  This is why the drill calls createCanonicalApp (which accepts options.mediaStorage,
 *  canonicalApp.ts:172) rather than startCanonicalServer, which does not forward it.
 *  Writes throw: a drill must never be able to mutate what it is verifying. */
export class RestoredMediaStore implements ObjectStorage {
  readonly environment: StorageEnvironment;
  private readonly root: string;
  constructor(root: string, environment: StorageEnvironment) {
    this.root = resolvePath(root);
    this.environment = environment;
  }
  private path(key: string): string {
    if (!new RegExp(`^${this.environment}/[0-9a-f-]{36}/[0-9a-f-]{36}$`).test(key)) {
      throw new Error("restored media key is invalid");
    }
    const path = resolvePath(this.root, ...key.split("/"));
    if (!path.startsWith(this.root + sep)) throw new Error("restored media key escapes the drill root");
    return path;
  }
  async get(key: string): Promise<Buffer> { return readFile(this.path(key)); }
  async put(): Promise<void> { throw new Error("the restored media store is read-only"); }
  async delete(): Promise<void> { throw new Error("the restored media store is read-only"); }
}

export interface DrillProbe { path: string; expect: number; category?: string }

export function drillProbePlan(input: { username: string }): DrillProbe[] {
  return [
    { path: "/health/live", expect: 200 },
    { path: "/health/ready", expect: 200 },
    { path: "/api/explorers/v1/me", expect: 401 },
    ...categoryKeys.map(category => ({
      path: `/api/explorers/v1/public/profiles/${input.username}/collections/${category}`,
      expect: 200,
      category,
    })),
  ];
}

/** Boots the restored system. The gate attestation is supplied through
 *  MUSIC_GATE_ATTESTATION_JSON, which music-health.ts:50-52 prefers over the
 *  file, and is signed with a drill-local key over the restored journal's own
 *  checksum via createGateAttestation (music-deployment.ts:96-106) - so
 *  /health/ready exercises the real evaluateReadiness comparison at :310-316
 *  against the restored database rather than being stubbed out. */
export async function bootRestoredSystem(input: {
  pool: import("pg").Pool;
  mediaRoot: string;
  environment: Record<string, string | undefined>;
  journalChecksum: string;
}): Promise<{ baseUrl: string; shutdown: () => Promise<void> }> {
  const config = resolveExplorersAuthConfig({ ...input.environment, EXPLORERS_MAINTENANCE_PAUSED: "RESTORE_IN_PROGRESS" });
  const app = createCanonicalApp(input.pool, config, { mediaStorage: new RestoredMediaStore(input.mediaRoot, "prod") });
  const httpServer = createServer(app);
  await new Promise<void>((done, failed) => {
    httpServer.once("error", failed);
    httpServer.listen(0, "127.0.0.1", () => { httpServer.off("error", failed); done(); });
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("restored system did not bind a port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    shutdown: () => new Promise<void>((done, failed) => httpServer.close(error => (error ? failed(error) : done()))),
  };
}

/** Media proof. Hashing the bytes ourselves is the point: the gated route's ETag
 *  is media_assets.content_sha256 read from the database (media.ts:175), never a
 *  hash of what S3 returned, so trusting the ETag would prove nothing about the
 *  restored bytes. Every object is hashed; public ones are additionally fetched
 *  through the gate, because a 404 there is indistinguishable from an
 *  authorization denial (explorersMediaRoutes.ts:93-99) and so cannot stand
 *  alone as evidence. */
export async function proveRestoredMedia(input: {
  baseUrl: string;
  store: RestoredMediaStore;
  inventory: ReadonlyArray<{ object_key: string; sha256: string; media_id: string; publicAttachment: boolean }>;
}): Promise<{ objects: number; hashesMatched: number; gatedRouteResolved: number }> {
  const { createHash } = await import("node:crypto");
  let hashesMatched = 0, gatedRouteResolved = 0;
  for (const row of input.inventory) {
    const bytes = await input.store.get(row.object_key);
    if (createHash("sha256").update(bytes).digest("hex") === row.sha256) hashesMatched += 1;
    else throw new Error(`restored object ${row.object_key} does not match its recorded content hash`);
    if (!row.publicAttachment) continue;
    const response = await fetch(`${input.baseUrl}/api/explorers/v1/media/${row.media_id}/content`);
    if (!response.ok) throw new Error(`gated media route refused a public object after restore: ${response.status}`);
    const served = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (served !== row.sha256) throw new Error(`gated media route served different bytes for ${row.object_key}`);
    gatedRouteResolved += 1;
  }
  return { objects: input.inventory.length, hashesMatched, gatedRouteResolved };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "restored media store"` and `… -t "drill probe plan"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/platform-restore-drill.ts tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): boot the restored system and prove identity, categories and gated media"
```

---

### Task 13: The drill receipt, and the measured recovery time

**Files:**
- Modify: `scripts/platform-restore-drill.ts`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { assertReceiptDirectory, buildDrillReceipt, writeDrillReceipt }
  from "../../../../scripts/platform-restore-drill";
import { drillReceiptSchema } from "../../../shared/platformRecoveryContract";
import { existsSync, readFileSync } from "node:fs";

describe("drill receipt", () => {
  it("requires a fresh directory directly under the system temp directory", () => {
    const parent = tmpdir();
    const fresh = join(parent, `platform-restore-drill-${"a".repeat(8)}`);
    expect(assertReceiptDirectory(fresh)).toBe(resolve(fresh));
    // The e2e runner's rule, for the same reason: a pre-existing directory could
    // already hold a receipt someone would read as this run's evidence
    // (scripts/replatform-e2e.mjs:90).
    const existing = mkdtempSync(join(parent, "platform-restore-drill-exists-"));
    try { expect(() => assertReceiptDirectory(existing)).toThrow(/must not exist/); }
    finally { rmSync(existing, { recursive: true, force: true }); }
    expect(() => assertReceiptDirectory("relative/dir")).toThrow(/absolute/);
    expect(() => assertReceiptDirectory(join(parent, "nested", "dir"))).toThrow(/temp/);
    expect(() => assertReceiptDirectory(join(parent, "wrong-prefix-aaaaaaaa"))).toThrow(/name/);
  });

  it("sums phase timings into the recovery measurement", () => {
    const receipt = buildDrillReceipt({
      runId: "b".repeat(32), result: "passed", drilledAt: "2026-10-18T09:14:00.000Z",
      drillCommit: "c".repeat(40), manifestDigest: "7".repeat(64),
      migrationMarker: "0056_explorers_app_enrichment_jobs", schemaChecksum: "f".repeat(64),
      cleanup: "database-dropped-container-removed",
      phases: [{ phase: "pg-restore", milliseconds: 1000 }, { phase: "boot", milliseconds: 500 }],
      proofs: {
        journal: { rows: 56, currentId: "0056_explorers_app_enrichment_jobs" },
        identity: { authUsers: 2, authSessions: 1, creatorAccounts: 2 },
        categories: { books: 2 }, media: { objects: 1, hashesMatched: 1, gatedRouteResolved: 1 },
        rowCountsMatched: true,
      },
    });
    expect(receipt.recoveryMilliseconds).toBe(1500);
    expect(() => drillReceiptSchema.parse(receipt)).not.toThrow();
  });

  it("writes the receipt owner-only and refuses to overwrite one", () => {
    const directory = join(tmpdir(), `platform-restore-drill-${randomBytes(4).toString("hex")}`);
    try {
      const receipt = buildDrillReceipt({ /* as above */ } as never);
      const path = writeDrillReceipt(directory, receipt);
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8")).version).toBe("explorers-platform-restore-drill/v1");
      expect(() => writeDrillReceipt(directory, receipt)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("records a failed drill rather than throwing it away", () => {
    const receipt = buildDrillReceipt({ result: "failed", cleanup: "leaked" } as never);
    expect(receipt.result).toBe("failed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "drill receipt"`
Expected: FAIL — `assertReceiptDirectory` is not exported.

- [ ] **Step 3: Write the implementation** (append to `scripts/platform-restore-drill.ts`)

```ts
import { mkdirSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";

const RECEIPT_NAME = /^platform-restore-drill-[A-Za-z0-9-]{8,64}$/;

/** The e2e runner's receipt discipline (scripts/replatform-e2e.mjs:90-91), for
 *  the same reasons: absolute, a direct child of the real system temp directory,
 *  a recognisable name, and crucially NOT already existing - a pre-existing
 *  directory could hold another run's receipt that a reader would attribute to
 *  this one. The repository lives under a OneDrive path, so receipts must not be
 *  written inside the worktree: a reparse point breaks realpath identity. */
export function assertReceiptDirectory(path: string): string {
  const resolved = resolvePath(path);
  if (resolved !== path && !isAbsolute(path)) throw new Error("receipt directory must be absolute");
  if (existsSync(resolved)) throw new Error("receipt directory must not exist");
  const parent = dirname(resolved);
  if (realpathSync(parent) !== realpathSync(tmpdir())) throw new Error("receipt directory must be a direct child of the system temp directory");
  if (!RECEIPT_NAME.test(basename(resolved))) throw new Error("receipt directory name is rejected");
  return resolved;
}

export function buildDrillReceipt(input: Omit<import("../tunes/shared/platformRecoveryContract").DrillReceipt, "version" | "recoveryMilliseconds">) {
  return {
    version: "explorers-platform-restore-drill/v1" as const,
    ...input,
    recoveryMilliseconds: input.phases.reduce((total, phase) => total + phase.milliseconds, 0),
  };
}

export function writeDrillReceipt(directory: string, receipt: unknown): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "receipt.json");
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return path;
}
```

Then write `main`, which is the drill itself: parse the command, assert the receipt directory, parse and digest the manifest, download the archive (retaining it under the receipt directory when `--keep-archive` is passed — decision R11), verify `archive.sha256` against the manifest, `age --decrypt --identity`, verify each member's hash, acquire the disposable database with `startOwnedUatDatabase` through `withOwnedUatDatabase`, `CREATE DATABASE explorers_restore_drill_<8 hex>`, `assertDisposableRestoreTarget`, `planRoleBootstrap` and apply, `buildRestoreCommand`, `proveRestoredDatabase`, `attestRestoredRuntimeRole`, `bootRestoredSystem`, run `drillProbePlan` and compare each category count against `manifest.tableRowCounts`, `proveRestoredMedia`, then write the receipt. Every stage is wrapped so its elapsed milliseconds becomes a phase entry, and a failure still writes a `result: "failed"` receipt with the phases completed so far — a failed drill is evidence too. Teardown runs in `finally` via `stopOwnedUatDatabase`, and `cleanup` records `database-dropped-container-removed` or `leaked`.

Add to the root `package.json` `scripts`:

```json
"platform:restore-drill": "tsx scripts/platform-restore-drill.ts"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "drill receipt"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/platform-restore-drill.ts package.json tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): emit a drill receipt whose phase timings are the measured recovery time"
```

---

### Task 14: The real round trip, against a real PostgreSQL

Everything so far is a contract test with the database faked. This task is the one that would actually have caught a lossy dump, and it is the first execution of a restore in this repository's history.

**Files:**
- Create: `tunes/server/test/explorers/platform-recovery.integration.test.ts`

- [ ] **Step 1: Pull the image the fixture attests but never pulls**

Run: `docker pull postgres:15-alpine`
Expected: `Status: Image is up to date for postgres:15-alpine`. The UAT fixture inspects the image and refuses if it is absent (`tunes/scripts/music-uat-database.ts:294-297`); it never pulls. CI does this explicitly at `.github/workflows/frontend-e2e-qualification.yml:145-150`.

- [ ] **Step 2: Write the failing test**

```ts
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { migrateMusicDatabase, inspectMusicDatabase } from "../../db/migrate";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";
import { assertRestoredSchema, assertRowCounts, planRoleBootstrap, buildRestoreCommand }
  from "../../../../scripts/platform-restore-drill";

// Same gate the other real-database suites use (music-migration.integration.test.ts:28-29).
const runIntegration = process.env.MUSIC_C3_POSTGRES_TEST === "1";
const describePostgres = runIntegration ? describe.sequential : describe.skip;

describePostgres("platform recovery round trip", () => {
  let admin: pg.Pool;
  const databases: string[] = [];
  const containerId = process.env.MUSIC_UAT_DATABASE_CONTAINER_ID ?? "";
  const adminUrl = process.env.DATABASE_URL_TEST!;

  const url = (name: string) => adminUrl.replace(/\/[^/]+$/, `/${name}`);
  const psql = (database: string, sql: string) => {
    const result = spawnSync("docker", ["exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
      "-U", "music_migrator", "-d", database, "-c", sql], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
    return result.stdout;
  };

  async function freshDatabase(name: string): Promise<pg.Pool> {
    await admin.query(`CREATE DATABASE ${name}`);
    databases.push(name);
    return new pg.Pool({ connectionString: url(name), max: 4 });
  }

  beforeAll(async () => {
    validateIntegrationDatabaseTarget(adminUrl);
    expect(containerId).toMatch(/^[a-f0-9]{64}$/);
    admin = new pg.Pool({ connectionString: adminUrl, max: 4 });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const name of databases.reverse()) {
        await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
        await admin.query(`DROP DATABASE ${name}`);
      }
    } finally { await admin.end(); }
  });

  it("round-trips a migrated database through a custom-format dump with the fingerprint intact", async () => {
    const sourceName = `platform_recovery_src_${process.pid}`;
    const source = await freshDatabase(sourceName);
    const applied = await migrateMusicDatabase(source);
    expect(applied.ready).toBe(true);
    const sourceState = await inspectMusicDatabase(source);
    const manifest = {
      migrationMarker: sourceState.currentId!,
      journalChecksum: sourceState.currentChecksum!,
      schemaChecksum: sourceState.schemaChecksum!,
      tableRowCounts: { music_schema_migrations: applied.appliedIds.length },
    };
    await source.end();

    const dumpPath = "/tmp/platform-recovery-roundtrip.pgc";
    const dumped = spawnSync("docker", ["exec", containerId, "pg_dump", "--format=custom", "--compress=9",
      "--no-password", "--username", "music_migrator", "--dbname", sourceName, "--file", dumpPath],
      { encoding: "utf8", windowsHide: true });
    expect(dumped.status).toBe(0);

    const globals = spawnSync("docker", ["exec", containerId, "pg_dumpall", "--globals-only",
      "--no-role-passwords", "--no-password", "--username", "music_migrator"],
      { encoding: "utf8", windowsHide: true });
    expect(globals.status).toBe(0);
    expect(globals.stdout).toContain("CREATE ROLE music_runtime");
    expect(globals.stdout).toContain("CREATE ROLE app_enrichment_worker_owner");
    expect(globals.stdout).not.toContain("SCRAM-SHA-256");

    const targetName = `explorers_restore_drill_${createHash("sha256").update(sourceName).digest("hex").slice(0, 8)}`;
    const target = await freshDatabase(targetName);
    const existing = (await admin.query<{ rolname: string }>("SELECT rolname FROM pg_roles")).rows.map(row => row.rolname);
    const plan = planRoleBootstrap(globals.stdout,
      { roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
        "app_enrichment_retention", "app_enrichment_retention_owner"],
        migratorRole: "music_migrator", runtimeLoginRole: "explorers_runtime" },
      { existingRoles: existing });
    // The cluster already carries them from the source migration, so nothing to create.
    expect(plan.create).toEqual([]);

    const restore = buildRestoreCommand({ containerId, database: targetName, user: "music_migrator", dumpPath });
    const restored = spawnSync(restore.file, restore.args, { encoding: "utf8", windowsHide: true });
    expect(restored.stderr).toBe("");
    expect(restored.status).toBe(0);

    // The assertion the whole phase exists for: the journal row inside the dump
    // records the fingerprint that the migration produced, and this recomputes it
    // against the restored catalog. If pg_restore lost a default, a trigger, an
    // index or a function body, these diverge (migrate.ts:200-203).
    const targetState = await inspectMusicDatabase(target);
    expect(assertRestoredSchema(targetState as never, manifest)).toEqual({
      rows: applied.appliedIds.length, currentId: manifest.migrationMarker,
    });
    const journal = await target.query<{ rows: number }>("SELECT count(*)::int AS rows FROM music_schema_migrations");
    assertRowCounts({ music_schema_migrations: journal.rows[0].rows }, manifest.tableRowCounts);
    await target.end();
  }, 600_000);

  it("refuses to restore into a populated namespace", async () => {
    const name = `explorers_restore_drill_${"b".repeat(8)}`;
    const populated = await freshDatabase(name);
    await populated.query("CREATE TABLE squatter(id int)");
    const tables = (await populated.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(row => row.table_name);
    expect(() => assertDisposableRestoreTarget(
      { connectionString: url(name), containerId, owned: true, port: Number(new URL(adminUrl).port) },
      {}, { existingTables: tables })).toThrow(/populated/);
    await populated.end();
  }, 120_000);

  it("proves that a restore stripped of owners is rejected", async () => {
    // --no-owner is what the repository's existing precedents use
    // (games.integration.test.ts:151), and it is wrong for a recovery: the
    // restricted-role attestation checks the owner of every function
    // (music-runtime-role.ts:1038-1039).
    const sourceName = `platform_recovery_noowner_${process.pid}`;
    const source = await freshDatabase(sourceName);
    await migrateMusicDatabase(source);
    await source.end();
    const dumpPath = "/tmp/platform-recovery-noowner.pgc";
    spawnSync("docker", ["exec", containerId, "pg_dump", "--format=custom", "--no-owner", "--no-password",
      "--username", "music_migrator", "--dbname", sourceName, "--file", dumpPath], { windowsHide: true });
    const targetName = `explorers_restore_drill_${"c".repeat(8)}`;
    const target = await freshDatabase(targetName);
    spawnSync("docker", ["exec", containerId, "pg_restore", "--exit-on-error", "--single-transaction",
      "--no-password", "--username", "music_migrator", "--dbname", targetName, dumpPath], { windowsHide: true });
    const owners = await target.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_roles r ON r.oid=p.proowner
       WHERE n.nspname='public' AND p.proname LIKE 'app_enrichment_worker_%' AND r.rolname<>'app_enrichment_worker_owner'`);
    expect(owners.rows[0].count).toBeGreaterThan(0);
    await target.end();
  }, 600_000);
});
```

- [ ] **Step 3: Run it against a disposable database**

```bash
docker pull postgres:15-alpine
npm run music:test:uat-database -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

The UAT lane runs a pinned file list from `MUSIC_UAT_DATABASE_TEST_FILES` (`tunes/scripts/music-vitest-evidence.ts`), so **add `server/test/explorers/platform-recovery.integration.test.ts` to that list in the same commit**, or the file runs nowhere and the whole phase becomes another authored-but-never-executed lane — the exact failure mode `REPLATFORM-STATUS-2026-10-17.md` §2.2 documents for 7 of 14 e2e lanes.

Expected: the envelope's `result` is `passed` with the new file in `vitest.files`, zero skipped and zero todo. Record the actual output in Task 16.

- [ ] **Step 4: Commit**

```bash
git add tunes/server/test/explorers/platform-recovery.integration.test.ts tunes/scripts/music-vitest-evidence.ts
git commit -m "test(recovery): round-trip a migrated database through a dump and verify the schema fingerprint"
```

---

### Task 15: Make the deploy refuse to proceed without recovery evidence

This closes the 8.4 join, which `docs/replatform-audit/tickets/ticket-8-4.md:67` records as existing "only as prose", and which `:70` says leaves 8.4 not mechanism-complete.

**Files:**
- Create: `scripts/platform-recovery-gate.ts`
- Modify: `.github/workflows/tunes-deploy.yml`
- Modify: `tunes/server/test/contracts/platform-recovery.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { parseGateCommand, evaluateGate } from "../../../../scripts/platform-recovery-gate";

describe("recovery evidence gate", () => {
  it("requires both documents and the candidate identity", () => {
    expect(parseGateCommand(["--manifest", "m.json", "--receipt", "r.json",
      "--candidate-digest", `sha256:${"d".repeat(64)}`, "--candidate-commit", "c".repeat(40),
      "--candidate-marker", "0056_explorers_app_enrichment_jobs"]).candidate.commit).toBe("c".repeat(40));
  });

  it.each([
    [["--manifest", "m.json"]],
    [["--manifest", "m.json", "--receipt", "r.json"]],
    // There is deliberately no --assume-verified, --force or --skip flag: the
    // ticket requires the step "cannot be satisfied by a manually asserted input"
    // (ticket-8-4.md:69).
    [["--assume-verified", "true"]],
  ])("rejects %j", (args) => expect(() => parseGateCommand(args)).toThrow(/arguments rejected/));

  it("exits non-zero with the refusal code on stale evidence", () => {
    const outcome = evaluateGate({ manifest: {}, receipt: {},
      candidate: { digest: `sha256:${"d".repeat(64)}`, commit: "c".repeat(40), migrationMarker: "0056_x" },
      now: Date.now() });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.code).toBe("BACKUP_INVALID");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts -t "recovery evidence gate"`
Expected: FAIL — cannot resolve `../../../../scripts/platform-recovery-gate`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/platform-recovery-gate.ts
/**
 * The ticket-8.4 promotion gate. It resolves recovery evidence for the exact
 * candidate and fails closed. There is no flag that asserts the answer.
 */
import { readFileSync } from "node:fs";
import { verifyRecoveryEvidence } from "../tunes/shared/platformRecoveryContract";

export function parseGateCommand(args: string[]) {
  const allowed = new Set(["--manifest", "--receipt", "--candidate-digest", "--candidate-commit", "--candidate-marker"]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error("recovery gate arguments rejected");
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) throw new Error("recovery gate arguments rejected");
    values.set(flag, value);
  }
  const manifest = values.get("--manifest"), receipt = values.get("--receipt");
  const digest = values.get("--candidate-digest"), commit = values.get("--candidate-commit");
  const migrationMarker = values.get("--candidate-marker");
  if (!manifest || !receipt || !digest || !commit || !migrationMarker) throw new Error("recovery gate arguments rejected");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("recovery gate arguments rejected");
  return { manifest, receipt, candidate: { digest, commit, migrationMarker } };
}

export function evaluateGate(input: Parameters<typeof verifyRecoveryEvidence>[0]) {
  const outcome = verifyRecoveryEvidence(input);
  return outcome.admitted ? { exitCode: 0 as const } : { exitCode: 1 as const, code: outcome.code };
}

export function main(argv: string[]): void {
  const command = parseGateCommand(argv);
  const outcome = evaluateGate({
    manifest: JSON.parse(readFileSync(command.manifest, "utf8")),
    receipt: JSON.parse(readFileSync(command.receipt, "utf8")),
    candidate: command.candidate,
    now: Date.now(),
  });
  if (outcome.exitCode !== 0) {
    process.stderr.write(`recovery evidence refused: ${outcome.code}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({ recoveryEvidence: "admitted" })}\n`);
}
```

Add to the root `package.json` `scripts`:

```json
"platform:recovery-gate": "tsx scripts/platform-recovery-gate.ts"
```

- [ ] **Step 4: Add the two workflow steps**

In `.github/workflows/tunes-deploy.yml`, in the job that ssh's to the host, **before** the step that invokes `tunes/deployment/music-deploy.sh**:

```yaml
      - name: Take a pre-deploy backup
        uses: appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a17 # v1.2.0
        with:
          host: ${{ secrets.TUNES_DEPLOY_HOST }}
          username: deploy
          key: ${{ secrets.TUNES_DEPLOY_KEY }}
          fingerprint: ${{ secrets.TUNES_DEPLOY_SSH_FINGERPRINT }}
          port: 22
          command_timeout: 20m
          script: |
            set -euo pipefail
            node /opt/explorers/platform-backup.mjs \
              --environment prod --reason pre-deploy \
              --candidate-digest '${{ inputs.candidate_digest }}' \
              --candidate-commit '${{ inputs.candidate_commit }}' \
              --output-manifest /opt/explorers/deployment-state/backup-candidate.json

      - name: Refuse the deploy without recovery evidence
        run: |
          set -euo pipefail
          npm run --silent platform:recovery-gate -- \
            --manifest "$RUNNER_TEMP/backup-candidate.json" \
            --receipt docs/replatform/evidence/recovery-receipt.json \
            --candidate-digest '${{ inputs.candidate_digest }}' \
            --candidate-commit '${{ inputs.candidate_commit }}' \
            --candidate-marker '0056_explorers_app_enrichment_jobs'
```

The manifest is fetched back from the host by an `scp` step between the two (the workflow already has the credentials for it), and `docs/replatform/evidence/recovery-receipt.json` is the committed receipt from the owner's most recent drill. Both are inputs the gate reads; neither can be asserted.

**Record this honestly in the plan's evidence doc:** `tunes-deploy.yml` has never succeeded — 11 runs, 10 failed and 1 cancelled, all 17–18 March — and `verifyRelease` still returns `fail('TRUSTED_AUTHORITY_UNAVAILABLE')` unconditionally (`tunes/server/deployment/platform-release-contract.ts:68-72`). So these two steps are *mechanism*, verified by their own contract tests, and will not have been exercised by a real deploy until P2 runs. Do not claim otherwise.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix tunes test -- server/test/contracts/platform-recovery.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 6: Commit**

```bash
git add scripts/platform-recovery-gate.ts .github/workflows/tunes-deploy.yml package.json tunes/server/test/contracts/platform-recovery.test.ts
git commit -m "feat(recovery): wire the 8.4 acceptance join into the deploy as a fail-closed gate"
```

---

### Task 16: Run the drill, then write the runbook with the numbers in it

Everything before this is mechanism. This is the only task that produces recovery objectives, and it produces them by measurement.

**Files:**
- Create: `docs/replatform/release-and-recovery.md`
- Create: `docs/replatform/evidence/milestone-3.md`
- Create: `docs/replatform/evidence/recovery-receipt.json`

- [ ] **Step 1: Generate an age keypair and record custody**

```bash
age-keygen -o "$HOME/.explorers/backup-identity.age"
```

Expected: the public key on stdout as `Public key: age1…`. Put the public key in `production.env` as `EXPLORERS_BACKUP_AGE_RECIPIENT`. **The private file never goes on the production host and never goes in the repository.** Record in the runbook where the owner keeps it and its second copy; a backup whose only key lives on one laptop has swapped one single point of failure for another.

- [ ] **Step 2: Take a backup of the local stack**

```bash
npm run platform:backup -- --environment local --reason manual --output-manifest "$HOME/drills/manifest.json"
```

Expected: exit 0, and `manifest.json` parses against `backupManifestSchema` with `complete: true` and all five required members.

- [ ] **Step 3: Run the drill**

```bash
docker pull postgres:15-alpine
R="$(mktemp -d "$TMPDIR/platform-restore-drill-XXXXXXXX")" && rmdir "$R"
npm run platform:restore-drill -- \
  --manifest "$HOME/drills/manifest.json" \
  --identity "$HOME/.explorers/backup-identity.age" \
  --receipt "$R" --keep-archive
```

Expected: exit 0 and `"$R"/receipt.json` with `result: "passed"`, `cleanup: "database-dropped-container-removed"`, a non-zero `recoveryMilliseconds`, `proofs.media.hashesMatched` equal to `proofs.media.objects`, and `proofs.categories` with one entry per `categoryKeys` member.

The `rmdir` is deliberate: `assertReceiptDirectory` refuses a directory that already exists, for the same reason the e2e runner does (`scripts/replatform-e2e.mjs:90`).

- [ ] **Step 4: Record the measured objectives**

Copy the receipt to `docs/replatform/evidence/recovery-receipt.json` and write `docs/replatform/evidence/milestone-3.md` in the house format (`docs/replatform/evidence/README.md:5-16`): `scenarioIds`, `sourceCommit` with dirty state, `artifactDigest`, `environment: local-fixture`, `fixture`, `commandOrSteps`, `actualResult` (never inferred from exit status alone), artifact SHA-256s, `defects`, `skippedReason`, `operatorAndTime`. Scrub tokens, cookies, emails and connection strings, and do not commit the dump.

Then fill in the three empty cells in this plan's **Recovery objectives** table from the receipt:

| Objective | Source |
|---|---|
| RTO, database-only restore | `receipt.recoveryMilliseconds`, with the per-phase breakdown |
| RTO, full host loss | the drill's number plus the measured time to install Docker, untar surface 3 and 4, and run the migration gate — timed once on a scratch VM or the owner's machine, not estimated |
| RPO, all other incidents | 24h plus the backup receipt's own `completedAt - startedAt` |

**If the measured RTO exceeds what the owner finds acceptable, that is a finding, not a reason to adjust the number.** Record it and propose the change that would reduce it (more frequent backups, a warm standby database, a pre-pulled image set).

- [ ] **Step 5: Write the runbook**

`docs/replatform/release-and-recovery.md` must distinguish the four operations from the table in **The migration constraint** above, and must state in its opening paragraph that **the compatibility floor cannot be lowered**, so once the floor reaches a marker there is no image rollback below it and recovery is always forward. Include:

- The decision tree: bad code → app rollback; bad migration → forward fix; data loss → restore then forward fix; host loss → rebuild.
- The exact restore sequence for production, with `EXPLORERS_MAINTENANCE_PAUSED=RESTORE_IN_PROGRESS` set for the verification window and the explicit step that removes it, including what stops while it is set: every account deletion (a legal obligation) and every media sweep.
- The host-loss sequence, naming `MUSIC_DEPLOY_STATE_HMAC_KEY` as a dependency on GitHub access, and the fact that re-bootstrapping without surface 3 is impossible after the canonical cutover because `music-deploy.sh:94-107` requires a running legacy container with the Compose service label `tunes`.
- The two named gates: real S3 semantics are not rehearsed locally, and `BACKUP_DELETE_PERMISSION_UNAVAILABLE` if the credential cannot prune.
- A monthly reminder that the drill must be re-run, because `DRILL_FRESHNESS_MS` is 30 days and the deploy gate will start refusing.

- [ ] **Step 6: Commit**

```bash
git add docs/replatform/release-and-recovery.md docs/replatform/evidence/milestone-3.md docs/replatform/evidence/recovery-receipt.json docs/superpowers/plans/2026-10-18-backup-restore-recovery.md
git commit -m "docs(recovery): runbook, milestone-3 evidence and the measured recovery objectives"
```

---

## Owner decisions required before implementation starts

Six of these block a task; the rest can be answered while earlier tasks run. Ticket 8.5 is explicit that "backup destination, retention, encryption authority and media deletion/versioning policy must be recorded in the nonsecret readiness manifest before this ticket's execution" and that "current secret-name presence does not supply those choices" (`ticket-8-5.md:38-40`).

| # | Decision | Blocks | Why it is yours, not mine |
|---|---|---|---|
| 1 | **Where the `age` private identity lives, and its second copy.** | Task 16 | A backup with one key on one laptop has traded a server single-point-of-failure for a personal one. A password manager plus a printed or offline copy is the usual answer, but it is a custody decision |
| 2 | **Does the application's AWS credential have `s3:DeleteObject` on `prod/backups/*`?** If yes, do you want a bucket policy that denies it, so a compromised application cannot destroy the backups it cannot read? | Task 8 ships either way, but the answer changes the risk | Ticket 8.5 says to inspect IAM and not to create a new principal "contrary to the accepted reuse decision". Inspecting live IAM is yours |
| 3 | **Retention: 14 daily / 30 pre-deploy / 12 monthly — confirm against bucket rules and cost.** | Task 8's constants | The ticket asks to "confirm compatibility with existing bucket rules and cost before applying". The dump is small today and will not be forever |
| 4 | **Is one bucket acceptable for both the backup archive and the media copies?** | Task 7 as written | R11 gives a free off-provider copy of the archive on every drill, but the media copies stay in the one bucket. A second destination is the alternative |
| 5 | **Confirm the production data volume and compose project on the host** (`docker volume ls`, `docker compose ls`). | Task 4's `--project-name` default | Nothing in code establishes it. `explorers-production_postgres-data` is a Compose convention; a legacy `tunes_postgres-data` may also exist and picking the wrong one backs up an empty database |
| 6 | **Is `age` acceptable as a new host binary, installed from a pinned release with a verified SHA-256?** | Task 7 | The alternative is `gpg`, which is usually already present but fussier headless. If you would rather not add a binary, say so and the plan changes to `gpg --encrypt --recipient` |
| 7 | **The backup window.** The cron fragment proposes 02:17 UTC daily. | Task 7's cron | `pg_dump` holds no exclusive locks, but it is the owner's traffic pattern |
| 8 | **Does the deploy gate land now or with P2?** Task 15 edits `tunes-deploy.yml`, which has never succeeded. | Task 15's workflow edit only | Landing it now means the first ever successful deploy also exercises a new gate. Landing it with P2 means P2 carries one more change |
| 9 | **Should the drill run on a schedule?** The gate refuses a receipt older than 30 days, which is a forcing function; a calendar reminder may be enough. | nothing | A scheduled reminder is cheap; a scheduled *drill* needs the private key somewhere automated, which conflicts with decision 1 |
| 10 | **Pin `amazon/aws-cli` by digest — which digest?** The plan has a placeholder. | Task 6, Task 7 | Pick and record the current digest at implementation time; `replatform-local.ts:139` sets the precedent for digest-pinning an external image |

---

## Contradictions and corrections to the brief

Recorded because the brief was accurate enough to be useful and wrong in ways that would have produced the wrong runbook.

1. **"The host-side deployment state the blue/green engine keeps under `/opt/explorers/deployment-state`."** It keeps state in **three** directories, and the schema epoch is not in that one — it is `deployment-transactions/schema-epoch.tsv` (`music-deploy-engine.sh:275`). The route file is in `deployment-routing/` and is **unsigned**, validated only structurally (exactly one `.yml`/`.yaml`, `:801-802`; register-compat router lines required when the floor is pending or at rank parity, `:803-807`). A fourth surface the brief did not mention is mandatory: `$root/docker-compose.yml`, `$root/production.env` and the seven secret files `verify-publication-authority.mjs:102-141` requires, with no path defaults.

2. **"`music-deploy-engine.sh` writes a signed ledger, a schema epoch and a compatibility floor."** True, and the HMAC key that signs them **is not on the host** — it is the GitHub environment secret `MUSIC_DEPLOY_STATE_HMAC_KEY`, shipped per run and deleted at exit (`tunes-deploy.yml:231,238-249,256`; `music-deploy.sh:88-91`). So the files cannot be regenerated, only restored as bytes; and host-loss recovery is gated on GitHub access.

3. **"The compatibility floor means restoring an older database while a newer image is deployed may be refused by the deploy authority itself."** The deploy authority never looks at the database — it has no `psql` and the epoch is derived from the image's marker string, not from the schema (`:102-119`, `:786-789`). **The refusal comes from the application**: `startCanonicalServer` throws `"Canonical identity schema is not ready"` (`canonicalStartup.ts:36-37`), and `/health/ready` 503s because `state.currentChecksum` must equal the attestation's `migrationChecksum` (`music-deployment.ts:310-316`). The floor separately makes the *old image* unusable (`:790-792`). Two mechanisms, neither the one the brief named — and the practical upshot is that a current image will deploy onto a stale restored database and fail at boot, not at the gate.

4. **"A grep count cannot distinguish a gate from a branch."** Applied, and it changed an answer. The deploy engine has no subcommands: it exits 1 if executed directly (`:6-9`) and takes its operation from line 2 of a six-line request file (`:236-265`). The `abort_transaction` error handler is also narrower than the runbook claims (`docs/operations/music-deploy-runbook.md:588-592`): the script sets `set -euo pipefail` but **not `-E`** (`:2`), so the ERR trap is not inherited by functions, and a failure inside `write_route` or `recover_transaction` exits without aborting the transaction. The journal is then recovered one invocation later.

5. **"Media objects actually resolving through the gated media route."** The gate is `isPublicAttachment` (`mediaRepository.ts:80-129`) and it only admits media reachable from an active, onboarding-complete, public-profile account through one of five arms. Everything else is owner-only and needs a cookie. Worse for evidence: **every failure collapses to a 404 `Media unavailable`** (`explorersMediaRoutes.ts:93-99`), so a missing object is indistinguishable from an authorization denial, and the route's ETag is `media_assets.content_sha256` read from the database (`media.ts:175`), never a hash of the bytes served. The route alone cannot prove a media restore. Task 12 hashes every object directly and uses the route only as a second signal on public objects.

6. **Ticket 8.5's own media design is unimplementable.** "Restore uses new object keys beneath the drill prefix and rewrites restored references" (`ticket-8-5.md:43`) cannot work: `assertObjectKey` requires exactly `<env>/<uuid>/<uuid>` (`objectStorage.ts:81-84`) and the database `CHECK` ties the key prefix to `storage_environment` (`0024:40`). A `qa/restore-drills/<run-id>/…` key is rejected everywhere.

7. **S3 versioning is not a safety net, in either direction.** `S3ObjectStorage.delete` lists every version and delete marker for the key and deletes each one (`objectStorage.ts:150-177`). And **the restore itself can destroy bytes**: the lazy sweeper deletes any `ready` asset older than 24 hours with zero references (`mediaRepository.ts:175-184`), and the 60-second lifecycle loop deletes objects for pending deletions (`accountLifecycleMaintenance.ts:91`, `canonicalStartup.ts:52-60`), with no flag to stop either. Task 9 adds one.

8. **"The nine categories."** `categoryKeys` is nine entries *including* `music` (`tunes/shared/explorersContract.ts:12-14`), which decision D2 deletes and P3-5 narrows to eight. The drill imports the contract so it narrows automatically.

9. **Ticket 8.5's QA half is dead.** No hosted QA exists and `verifyRelease` is typed `: never` and unconditionally returns `fail('TRUSTED_AUTHORITY_UNAVAILABLE')` (`platform-release-contract.ts:68-72`). `--environment` takes `prod | local`.

10. **One repository claim is false and worth correcting where it appears.** `docs/superpowers/plans/2026-10-17-media-ci-and-cutover.md:167` says a plain dump "misses the four cluster roles `0056` creates". Migration `0056` creates none of them — lines 3–10 are a `DO` block that *asserts* they exist with exact attributes and raises `42501` otherwise. `prepareAppWorkerCustody` creates them (`app-enrichment-worker-custody.ts:4,33`). The conclusion stands (a plain dump misses them, and `pg_dumpall --globals-only` is needed) but for a different reason, and the difference matters: a restore that runs the migration chain on a fresh cluster gets the roles for free, whereas a restore of a dump does not.

11. **`docs/operations/music-production-preflight.md` is stale** where it says "There are no Drizzle migration files; the current workflow uses schema push". There are 56 SQL migrations with a custom runner (`tunes/server/db/migrate.ts`). Separately, `tunes/scripts/migrate-db.js:5` runs `drizzle-kit push --accept-data-loss` and is referenced by no package script — it would cause `schema drift after <id>` and must never be used. Worth deleting in P5-8's dead-code sweep.

---

## Self-review

**Spec coverage.** Against the brief's six required areas and ticket 8.5's binding requirements:

| Requirement | Task |
|---|---|
| The backup mechanism and where backups live | 3–7 |
| Retention and encryption | 7 (encryption), 8 (retention) |
| The restore procedure | 10–12, written up in 16 |
| A rehearsable drill against a disposable local PostgreSQL, never touching production | 2 (refusals), 10–13, 14 (real round trip) |
| What evidence a drill must produce to count as passed | 13 (receipt schema in Task 1), 16 (the run) |
| Recovery objectives, measured not asserted | Recovery objectives table + Task 16 |
| Backup manifest referencing dump, media inventory, schema identity, checksums, timestamp | Task 1 |
| Restore drill accepts only a new disposable target; never overwrites production | Task 2 |
| Reject an existing populated namespace | Task 2, proven against a real database in Task 14 |
| `pg_dump` custom format plus a separately protected role/grant inventory | Task 4 |
| Restore into empty disposable PG15, apply runtime-role grants, then migration/readiness and application checks | Tasks 10–12 |
| Failing tests for restore-target safety, corrupt checksum, missing media inventory, incompatible schema/artifact pairing | Tasks 2, 7, 6, 11 |
| Failure tests for denied S3 permission, interrupted upload, absent referenced media, backup-prefix access via application APIs, mixed-environment manifest entries | 8, 7, 6, 6 (the `assertObjectKey` segment-count argument), 6 |
| Partial backups marked incomplete and unusable as restore candidates | Tasks 1 and 7 |
| Verify accounts, category counts and ordering, object hashes, private visibility | Task 12 |
| Measure recovery duration and document the observed recovery point | Tasks 13 and 16 |
| Runbook distinguishing app rollback, forward fix and data restore | Task 16 |
| The 8.4 recovery-receipt join as a required, non-assertable step | Task 15 |
| Load harness, capacity budget, accessibility matrix, retirement checklist | **Not covered — deferred with reasons** in "Deviations", to P5-1, the frontend lane and P6 |

**Placeholder scan.** One intentional placeholder remains: the `amazon/aws-cli` digest in Task 3's constant, which is owner decision 10 and cannot be chosen at planning time without going to a registry. Every other value is concrete. No step says "add appropriate error handling" or "write tests for the above"; every code step carries its code.

**Type consistency.** `backupManifestSchema` / `BackupManifest` and `drillReceiptSchema` / `DrillReceipt` are defined in Task 1 and used unchanged in 7, 11, 13, 14, 15. `verifyRecoveryEvidence` keeps one signature across Tasks 1 and 15. `assertDisposableRestoreTarget` takes the same three arguments in Tasks 2 and 14. `RestoredMediaStore` is constructed as `(root, environment)` in Task 12 and used that way in Task 13's `main`. `planRoleBootstrap(globals, manifest, observed)` is identical in Tasks 10 and 14. `runCommand(file, args, options)` is defined once in Task 4 and reused in Tasks 6, 7 and 8. The manifest field `journalChecksum` is the migration file's checksum throughout, and `schemaChecksum` is the catalog fingerprint throughout — the two are never swapped.

**One gap I am leaving open deliberately.** Task 14's third case proves that `--no-owner` produces a wrongly-owned database, but it does not prove that the restricted-role attestation *rejects* it, because running the full attestation requires the runtime login and the production role namespace. If the implementer finds that cheap to add, it is the stronger assertion; if not, the owner-count assertion is sufficient and the attestation is exercised by Task 12's boot.
