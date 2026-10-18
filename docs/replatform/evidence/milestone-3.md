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
