# Milestone 3 evidence: backup and restore drill (local fixture)

The first executed restore of this schema. Everything below was observed, not inferred
from exit status. The committed receipt is [`recovery-receipt.json`](recovery-receipt.json);
it is the drill receipt `.github/workflows/explorers.yml` reads at its recovery-evidence gate.

| Field | Value |
|---|---|
| `scenarioIds` | ticket 8.5 backup/restore drill; ticket 8.4 recovery-receipt join |
| `sourceCommit` | `5f21884b23eee5ded201abdaa63edd64235c3462`, clean tree (`git status --short` empty) |
| `artifactDigest` | `not deployed`. The manifest's `imageDigest` is a stand-in the fixture derives as `sha256(local-recovery-fixture:<commit>)`, because a local rehearsal has no image |
| `environment` | `local-fixture`: Windows 11, Docker Desktop 29.8.2 (server), Node 24.14.0, `postgres:15-alpine` |
| `fixture` | `scripts/platform-recovery-fixture.ts up`: PG15 container labelled as compose project `explorers-recovery-source`, service `postgres`; migrated to `0056_explorers_app_enrichment_jobs` by the real runner as superuser `explorers_migrator`; runtime login `explorers_runtime` provisioned by the real provisioner; 2 accounts signed in through `/me` with real Better Auth sessions; 7 entity categories with one published public recommendation each (movies, apps and products through the repository write path); guides public but empty; 2 media objects (1 public attachment, 1 private upload). Throwaway age identity generated with the pinned image's `age-keygen` |
| `commandOrSteps` | `npm run platform:recovery-fixture -- up`; `EXPLORERS_BACKUP_ROOT=<fixture root> npm run platform:backup -- --environment local --reason manual --candidate-digest <stand-in> --candidate-commit 5f21884b…`; then three times: `npm run platform:restore-drill -- --manifest <dest>/local/backups/20261018T174345Z-manual-6d07127a/manifest.json --identity <fixture>/keys/identity.age --receipt %TEMP%/platform-restore-drill-evidence-<n>-<hex> --keep-archive` |
| `actualResult` | **Pass, 3 of 3.** See below |
| `traceOrScreenshot` | Receipt (run 1) SHA-256 `9dc5ce12a56e28bcd06249dfab566d85e30bed607dfbdb723d01a8a6c4385da8`; encrypted archive SHA-256 `b64fe85c55e060aa96251adfb7bd50361af94f84ac7f88061d45b75942875d38` (783,224 bytes, not committed: it holds the fixture's secrets and dump, encrypted) |
| `defects` | Three found and fixed in this PR, all invisible without a real restore: (1) **deparse drift** - three varchar `CHECK` constraints from migrations 0011 and 0015 deparse differently after dump/restore, so `inspectMusicDatabase` throws `schema drift after 0056_…` and the application refuses to boot on any restored database; (2) `provision_music_runtime_login` is `SECURITY DEFINER`, so the restore's migrator stand-in needs the production migrator's attributes; (3) the runtime attestation requires the database to be owned by the migrator. All three were pre-existing at the source commit's base (`19eefc63`) |
| `skippedReason` | Not run: a production backup from real S3 (the drill's download path for `environment: prod` is unexercised - there is no host or production S3 access yet); the host-loss rebuild (needs a scratch host). See the PR's "Needs host access" list |
| `operatorAndTime` | Claude Code session (agent), 2026-10-18 17:43-17:46 UTC |

## Observed result

Backup: 1,935 ms wall-clock (the script itself logged `seconds: 2`), 118 tables, 2 media objects, archive 783,224 bytes, `age-encryption.org/v1` header present.

Drill, three consecutive runs against the same backup:

| Run | Recovery ms (sum of phases) | Wall-clock ms (incl. `tsx` start and teardown) |
|---|---|---|
| 1 (committed) | 6,218 | 8,285 |
| 2 | 6,168 | 8,185 |
| 3 | 6,210 | 8,193 |

Run 1 phases (ms): download 1, decrypt 576, acquire-target 2,040, bootstrap-roles 7, pg-restore 921, repair-known-drift 9, attest-schema 243, attest-runtime-role 312, boot 1,746, probe 320, media 43.

Proofs in every run:

- Journal: 56 rows, head `0056_explorers_app_enrichment_jobs`; the migration checksum and the live schema fingerprint equal the manifest's, after the deparse repair.
- Every one of the 118 tables' row counts equals the count read inside the dump's own snapshot.
- The restricted-role attestation (`verifyMusicRuntimeDatabaseConnection`) passed against the restored database as the runtime login.
- The canonical app booted as the runtime login with the restored `production.env`'s auth configuration; `/health/live` 200, `/health/ready` 200, anonymous `/me` 401.
- **A restored session authenticated**: the newest unexpired `auth_session` token, signed with the restored `EXPLORERS_AUTH_SECRET`, got `/me` 200.
- Every public category answered 200 for the restored public profile; published recommendation counts places 1, movies 1, books 1, games 1, guides 0, apps 1, products 1, people 1.
- Media: 2 of 2 objects hash to their recorded `content_sha256`; the public attachment resolved through the gated route with identical bytes; the private upload answered 404 there.
- Cleanup: the drill database dropped and the owned container removed and verified gone (`docker ps -a` shows no leftover); the decrypted plaintext work directory deleted.

## What the number means, and does not

6.2 s is the recovery time **of this fixture** (two accounts, a 783 KB archive). It is dominated by fixed costs - starting a PostgreSQL container (2.0 s) and booting the application (1.7 s) - not by data. A production restore adds download time and a `pg_restore` that grows with the database. The number to carry is the method: rerun the drill against the newest production backup and read its receipt.

## First production drill (2026-10-21)

The first drill of a real production backup, which closes the "production backup from real S3" gap listed above.

- Backup: the first manual production backup, taken on the host with `platform-backup.mjs --environment prod --reason manual` (run `808c707e`, 120 tables, 0 media objects, archive 787,336 bytes, 6 s). The nightly cron is installed.
- Drill: `npm run platform:restore-drill -- --manifest <manifest.json> --identity <owner's age identity> --receipt %TEMP%/platform-restore-drill-<letters>`, on the owner's machine, from a clean checkout of `main` at `fbd13009`, with the owner's own read credentials for `prod/backups/`.
- Result: **passed**, `recoveryMilliseconds` 7263 (download 1.3 s, decrypt 0.6 s, PostgreSQL start 2.0 s, `pg_restore` 1.0 s, boot 1.6 s).
- Proofs: journal 62 rows, head `0062_explorers_handle_holds`; every table's row count matched; restricted-role attestation passed; the app booted on the restored database; cleanup dropped the database and removed the container. The database had no accounts yet, so the identity and media proofs were vacuous (0 users, 0 objects).
- Receipt: `recovery-receipt.json`, SHA-256 `c6ff966caa51b7a0249d7af94296b6693bd038b0db21bcb867aa2b2409d23a7a`.
- Windows note: two earlier attempts failed before any restore, at starting the temporary PostgreSQL container. The likely cause is the drill's random host port landing in one of this machine's many Windows-reserved TCP port ranges (`netsh interface ipv4 show excludedportrange protocol=tcp`). That is a harness issue on Windows, not a backup issue; the clean-tree run above passed.

## Production drill at 0063 (2026-10-22)

- Backup: the deploy's own pre-deploy backup (run `2a6a56cb`, reason `pre-deploy`), migration head `0063_explorers_open_library_books`.
- Drill: `npm run platform:restore-drill` on the owner's machine from a clean checkout of `main` at `e14ac5fc`.
- Result: **passed**, `recoveryMilliseconds` 9902. Journal 63 rows, head 0063; every row count matched; restricted-role attestation passed; the app booted on the restored database. This time the proofs carry real data: 1 account with an authenticated restored session, and 23 media objects whose hashes all matched, with the gated route resolving.
- Receipt: `recovery-receipt.json`, SHA-256 `7faae0189d16f4f3653bacae0d383cc18bf7f71bdc28a10a3550dd17ede2a9bc`.
- Why it was needed: the deploy of `e14ac5fc` was refused with `DRILL_MARKER_MISMATCH` because the database had moved to 0063 (from #176) while the committed receipt was at 0062. Any deploy that follows a migration needs a fresh drill at the new head.

## Production drill at 0064 (2026-10-23)

- Backup: the nightly scheduled backup (run `ee261650`, reason `scheduled`, completed 2026-10-23T02:22Z), migration head `0064_explorers_game_details`, source commit `8063651c`.
- Drill: `npm run platform:restore-drill` on the owner's machine from a clean checkout of `8063651c`, the commit that produced the backup.
- Result: **passed**, `recoveryMilliseconds` 12830. Journal 64 rows, head 0064; every row count matched; restricted-role attestation passed; the app booted on the restored database. 1 account with an authenticated restored session; 107 media objects whose hashes all matched, 33 through the gated route.
- Receipt: `recovery-receipt.json`, SHA-256 `e412ae2f257f12dbb40526a84da4f4b99055b157119db902a6418ee22861f62f`.
- Why it was needed: dashboard-phase deploy checkpoint A (Wave 0, migrations 0065-0066). The gate compares the receipt's marker with the pre-deploy backup's marker, so the drill must be at the live head (0064), not the new one.
- Known issue: the same drill run from `main` at `0eebdd4c` fails four times at runtime-role attestation, because Wave 0 (PR #198) changed the expected runtime privileges and the drill attests a 0064 restore against the 0066 expectations. Drilling from the backup's own commit avoids it; the drill tool needs a fix to attest against the restored marker's expectations.
