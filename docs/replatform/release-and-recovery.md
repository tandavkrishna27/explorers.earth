# Release and recovery runbook

**There is no image rollback below the migration floor, and migrations are forward-only.** Once production's database has applied a migration, an image that bundles an older chain is refused (`deploy/host/explorers-deploy.sh` stage: "refusing an older image"), and there are no down-migrations. Recovery is therefore always forward: restore a backup, let the migration gate apply the chain forward, then ship a fix. The pre-deploy backup the deploy takes before anything migrates is what makes a bad migration survivable.

Mechanism: [`tunes/deployment/platform-backup.mjs`](../../tunes/deployment/platform-backup.mjs) (host), [`scripts/platform-restore-drill.ts`](../../scripts/platform-restore-drill.ts) (owner's machine), [`scripts/platform-recovery-gate.ts`](../../scripts/platform-recovery-gate.ts) (deploy gate), contract [`tunes/shared/platformRecoveryContract.ts`](../../tunes/shared/platformRecoveryContract.ts). Design and findings: [the plan](../superpowers/plans/2026-10-18-backup-restore-recovery.md). Evidence: [milestone 3](evidence/milestone-3.md).

## Which operation

| Incident | Do this | Not this |
|---|---|---|
| Bad application code, schema unchanged | **Redeploy the previous commit** through `explorers.yml` with its digest. Allowed only if its bundled migration head is not older than the database's | Restoring data |
| Bad migration | **Forward fix**: a new migration that repairs the schema. Restore only if the migration corrupted data | An older image (refused) or a down-migration (none exist) |
| Data loss or corruption | **Data restore** (below), then forward-fix whatever caused it | Editing rows by hand on production |
| Host loss | **Rebuild** (below) | Re-running a first deploy over an empty database - that is "start fresh", and it discards everything |

## What a backup holds

One run writes, under `s3://<media bucket>/prod/backups/<UTC start>-<reason>-<run8>/`:

- `archive.tar.age` - encrypted to the owner's public age key. Members: `database/dump.pgc` (custom-format `pg_dump` **with owners and ACLs**), `database/globals.sql` (roles, no password hashes), `host/configuration.tar` (`/opt/explorers/production.env`, `production.compose.yml`, the two database secret files, with mode and numeric owner), `media/inventory.jsonl` (every `ready` media object: key, size, SHA-256).
- `media/<account>/<id>` - a server-side copy of every inventoried object's bytes.
- `manifest.json` - unencrypted; no secrets. Row counts for every table and the media inventory were read inside the same snapshot `pg_dump` used, so they describe exactly the dump.
- `prod/backups/LATEST.json` points at the newest manifest. On the host, `/opt/explorers/backup-last-success.json` records the last success and `/opt/explorers/backup-failures/` records failed runs (`complete: false`, never a restore candidate).

The application cannot read, write or delete any of it: `assertObjectKey` admits only `<env>/<uuid>/<uuid>`, and backup keys have more segments.

Schedule: daily at 02:17 UTC (`tunes/deployment/platform-backup.cron`, `--prune`), and before every deploy. Retention: scheduled 14 days, pre-deploy 30 days, one per month for 12 months, the newest always kept. A prune the credential is not allowed to perform is reported as the named gate `BACKUP_DELETE_PERMISSION_UNAVAILABLE` and never fails the backup.

## The monthly drill (owner's machine)

The deploy gate refuses a drill receipt older than **30 days** (`DRILL_FRESHNESS_MS`), or one proven at a different migration head than the database being deployed over. Put a monthly reminder in your calendar; when the gate says `DRILL_STALE` or `DRILL_MARKER_MISMATCH`, this is the fix.

1. Have Docker Desktop running and `docker pull postgres:15-alpine` done.
2. Download the newest production `manifest.json` (from `prod/backups/LATEST.json`) to a folder of your choice.
3. Run, with your own AWS credentials in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) and `EXPLORERS_BACKUP_S3_BUCKET` set to the media bucket:

   ```bash
   npm run platform:restore-drill -- --manifest <manifest.json> --identity <your age identity file> --receipt <TEMP>/platform-restore-drill-<8+ letters> --keep-archive
   ```

   The receipt directory must not exist yet and must sit directly in the system temp directory. `--keep-archive` leaves an off-provider copy of the encrypted backup next to the receipt.
4. A passing drill exits 0 and writes `receipt.json` with `result: "passed"`. Copy it to `docs/replatform/evidence/recovery-receipt.json`, update `docs/replatform/evidence/milestone-3.md` with the run, and merge it.

To rehearse without production, `npm run platform:recovery-fixture -- up` builds a production-shaped local source and prints the exact backup and drill commands; `-- down` removes it.

A drill that fails still writes a receipt (`result: "failed"`, with the phases it completed and the reason). Treat a failed drill as an incident: the backups are not proven restorable.

## Data restore on production

Use the newest backup taken **before** the damage. Every step runs on the host as root unless stated.

1. **Stop writes.** `docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env stop api`.
2. **Take a backup of the damaged state first** (`node /opt/explorers/platform-backup.mjs --environment prod --reason manual`). It is evidence, and the only undo.
3. **Decrypt on the owner's machine, never on the host** - the host does not hold the private key. Download the archive, verify its SHA-256 against `manifest.json`, then decrypt with the pinned image the backup used:
   `docker run --rm --network none -v <dir>:/work -v <identity>:/identity/key.age:ro explorers-backup-age:1.2.1-r0-alpine3.20 --decrypt --identity /identity/key.age --output /work/archive.tar /work/archive.tar.age`
   (the drill builds that image the first time it runs). Copy only `database/dump.pgc` to the host, over SSH, into a root-only directory.
4. **Restore into a new database, not over the live one.** In the postgres container, as the migrator: `CREATE DATABASE explorers_restored OWNER <DB_MIGRATOR_USER>`, then `pg_restore --exit-on-error --single-transaction --dbname explorers_restored <dump>`. Roles already exist on the production cluster; on a fresh cluster see host loss.
5. **Repair the known deparse drift** before anything inspects the schema: re-declare the three constraints listed in `RESTORE_DEPARSE_REPAIRS` (`scripts/platform-restore-drill.ts`) exactly as written there. Without this the application refuses to boot with `schema drift after <id>`.
6. **Swap databases** while the api is stopped: rename the damaged database aside and the restored one to `DB_NAME` (`ALTER DATABASE … RENAME TO …`, no connections open).
7. **Start with maintenance paused.** Add `EXPLORERS_MAINTENANCE_PAUSED=RESTORE_IN_PROGRESS` to the api environment and start it. While it is set, **account deletions and media sweeps do not run** - both delete object-storage bytes, and against a database older than the bucket they would destroy media the restore needs. Account deletion is a legal obligation: keep the window short.
8. **Verify**: `/health/ready` 200, sign in, open a profile with media. Then if media objects are missing from the live prefix, copy them back from the backup's `media/` prefix to their original `prod/<account>/<id>` keys (the inventory lists them).
9. **Unpause**: remove `EXPLORERS_MAINTENANCE_PAUSED` and restart the api. Any other value of that variable is a startup failure by design.
10. If the restored database is older than the deployed image, the next deploy's migration gate migrates it forward. Then ship the forward fix.

## Host loss

Gated on GitHub access only for the deploy credentials (`EXPLORERS_DEPLOY_*` secrets); the backup itself needs nothing from GitHub.

1. A new host with Docker, Docker Compose v2, nginx, curl and Node 24.
2. Restore `host/configuration.tar` from the newest backup to `/` on the new host (it holds `/opt/explorers/production.env`, `production.compose.yml` and the secret files with their modes and numeric owners). Check `root:root 0600` on each.
3. `docker compose … up -d postgres`, wait healthy, then restore the dump as in steps 3-5 above **into `DB_NAME` directly** (the database is new and empty). The four `app_enrichment_*` roles and `music_runtime` must exist first: create them exactly as `planRoleBootstrap` does from `database/globals.sql`.
4. Run the normal deploy (`explorers.yml`): its pre-deploy backup and gate run against the restored database, and its migration gate re-provisions the runtime login password from the secret file.
5. Install the cron fragment and verify the next scheduled backup.

## Named gates and known limits

- Real S3 semantics (versioning, IAM denials) are not rehearsed locally; the local drill proves restore fidelity against a filesystem store. The production drill in step 3 above is the S3 rehearsal.
- `BACKUP_DELETE_PERMISSION_UNAVAILABLE`: the credential cannot prune; backups accumulate until it can.
- No point-in-time recovery: the recovery point is the newest backup (daily, plus one before each deploy).
- The recovery-time number in the evidence is for a tiny fixture; the drill against a real backup is the number that counts.
