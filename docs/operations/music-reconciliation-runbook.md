# Music identity reconciliation runbook

This command compares Strapi's immutable user/Account bindings with Tunes. It is a repair report, not a provisioning or deletion path. It never recreates, reactivates, deletes, or finalizes deletion. C4 remains the only projection authority and C7 remains the lifecycle/tombstone authority.

## Current release gate

The C0 pagination and service-token proof remains BLOCKING in `music-production-preflight.md`. Do not set `MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED=true` until the identity owner records the live schema, exact stable ordering, pagination totals, snapshot/checksum behavior, health contract, rate limits, and dedicated read-only token permissions. Fixture evidence is not production proof.

Every environment defaults to dry-run and apply disabled. Production apply is structurally ineligible in both the service and workflow. The scheduled production report runs hourly at minute 17. The first production run is report-only, even after the C0 proof is accepted. Review one complete scheduled cycle before deciding whether a later release should change any policy.

## Safety model

- A PostgreSQL advisory lock permits one host, workflow, or manual run at a time.
- The source is read in explicit `documentId:asc` pages. Every page must agree on schema version, snapshot, checksum, total, and page count.
- Duplicate, reordered, truncated, malformed, unhealthy, timed-out, count-shifted, checksum-shifted, immutable-ID-collision, tombstone, threshold, or plan-drift results cause zero suspension writes. Dry-run also writes no snapshots or absence counters.
- An absence advances only after a fully validated apply scan. Each fresh dry-run creates a cryptographically random scan nonce and stores it in the owner-only reviewed checkpoint; its apply must reuse that exact nonce, while a replay/resume cannot create a second observation. There is no wall-clock minimum because application clocks are not trusted: independence comes from two independent complete scans, distinct durable scan evidence, the serialized database lock, and a fresh database-plan check. A crash before the reviewed checkpoint is complete cannot authorize apply. An unchanged content snapshot can therefore count on two genuinely separate scans, while replaying either scan cannot count twice.
- A suspension records a completed lifecycle operation, increments `session_version`, revokes guest capability and discovery, and notifies running Tunes servers with the exact `music_user_id:session_version` fence. Every listener rechecks that committed lifecycle/session version before disconnecting owner sockets, so stale or fabricated events are no-ops.
- Present suspended or pending-deletion identities remain in that state. A tombstone is quarantined as an anomaly; it is never recreated.

## Report-only operation

Prerequisites are Node 24.21.0, the exact checked-out commit in a clean non-ignored worktree, the runtime-role database credential file, the dedicated Strapi reconciliation token file, an HTTPS allowlisted/pinned Strapi origin, and the C0 proof above. Live review and apply refuse any tracked modification or non-ignored untracked file, so same-SHA code drift cannot bypass resume. The database path must be a verified direct, session-affine PostgreSQL connection with capacity for the dedicated long-lived `LISTEN` client plus normal traffic; transaction-pooled PgBouncer and stateless/serverless HTTP transports are ineligible. Startup must prove the listener can hold its shared readiness lock, and apply independently proves that lock before mutation. Do not use the migrator, generic Strapi, or lifecycle-proof credential.

Protected self-hosted reconciliation runners export the following live command authority through the named GitHub Environment. Secret contents are never GitHub variables: the database and reconciliation token files are pre-mounted owner-only files, and variables contain only their absolute paths. The production-report, staging-report, and staging-apply environments must define the same names; the two staging environments must resolve to the same target and authority or resume will refuse the apply.

| Variable | Live contract |
| --- | --- |
| `MUSIC_MODE` | `live` |
| `MUSIC_RECONCILIATION_ENVIRONMENT` | `production` for scheduled reports; `staging` for staging review/apply |
| `MUSIC_RECONCILIATION_APPLY_ENABLED` | `false` in production; `true` for both staging review and staging apply (the review still passes `--dry-run`) |
| `MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED` | `true` only after the C0 owner attestation |
| `STRAPI_URL`, `MUSIC_STRAPI_ALLOWED_ORIGINS` | Exact credential-free HTTPS origin and exact origin allowlist |
| `STRAPI_RECONCILIATION_TOKEN_FILE` | Absolute owner-only dedicated token path; never the lifecycle or generic token path |
| `MUSIC_DATABASE_HOST`, `MUSIC_DATABASE_PORT`, `MUSIC_DATABASE_NAME`, `MUSIC_DATABASE_USER` | Runtime database target and least-privilege login |
| `MUSIC_DATABASE_MIGRATOR_USER`, `MUSIC_DATABASE_PASSWORD_FILE` | Distinct migrator role name and owner-only runtime password path; `DATABASE_URL` stays unset |
| `MUSIC_IDENTITY_MAX_CONCURRENCY` | Pinned HTTPS transport socket bound |
| `MUSIC_RECONCILIATION_PAGE_SIZE`, `MUSIC_RECONCILIATION_SCAN_MAX_ROWS`, `MUSIC_RECONCILIATION_MAX_PAGES` | Reviewed page, row, and page-count bounds |
| `MUSIC_RECONCILIATION_BATCH_SIZE` | Reviewed database batch bound |
| `MUSIC_RECONCILIATION_MAX_CHANGE_ABSOLUTE`, `MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT` | Reviewed aggregate snapshot/absence change thresholds |
| `MUSIC_RECONCILIATION_TIMEOUT_MS`, `MUSIC_RECONCILIATION_SCAN_TIMEOUT_MS`, `MUSIC_RECONCILIATION_MAX_RESPONSE_BYTES`, `MUSIC_RECONCILIATION_MAX_CANONICAL_BYTES` | Per-request, overall scan, per-response, and total canonical scan bounds |
| `MUSIC_RECONCILIATION_DB_LOCK_TIMEOUT_MS`, `MUSIC_RECONCILIATION_DB_STATEMENT_TIMEOUT_MS`, `MUSIC_RECONCILIATION_DB_IDLE_TRANSACTION_TIMEOUT_MS` | Bounded PostgreSQL lock, statement, and idle-transaction waits |

The public command is:

```text
npm run --silent music:reconcile -- --mode live --dry-run --format json --checkpoint .artifacts/music-runs/<run>/reconciliation-checkpoint.json
```

The checkpoint is atomically committed through a canonical non-link ancestor chain and contains only source metadata, thresholds, aggregate counts, the scan nonce, local plan fingerprint, and review token. Its first write uses no-overwrite semantics; later state transitions replace only that run's already-created artifact. Resume evidence is descriptor-read, single-link, owner-only where the platform exposes ownership/modes, and cannot alias the separate apply output. It contains no usernames, emails, identity rows, database credential, or service token. Human and JSON output use the same aggregate report.

Review:

1. Confirm status is `success`, mode is `dry-run`, and `changes.applied` is false.
2. Confirm schema/snapshot/checksum/total/page count and the absolute and percentage thresholds.
3. Investigate every anomaly. Never edit a checkpoint to bypass an anomaly.
4. Preserve the reviewed checkpoint and commit SHA as evidence. The approval token is an operator confirmation value, not a database or Strapi credential.

## Staging apply approval

Only the manually dispatched `staging-apply` workflow job may apply. First dispatch `staging-report` at the exact protected `main` commit and preserve its successful workflow run ID, run attempt, checkpoint artifact, and approval token. The `music-reconciliation-staging-apply` environment must require an independent reviewer and allow protected `main` only. The reviewer supplies that exact run ID/attempt and approval token; the workflow verifies the prior workflow path, event, success conclusion, commit, attempt, and artifact name before download.

```text
npm run --silent music:reconcile -- --mode live --apply --resume .artifacts/music-runs/<review>/reconciliation-checkpoint.json --approval-token <exact-token> --format json --checkpoint .artifacts/music-runs/<apply>/reconciliation-checkpoint.json
```

Resume refuses commit, fixture version, fixture schema, gate, environment fingerprint, reconciliation environment, threshold, source schema/snapshot/checksum/total, and local plan drift. Apply rescans the entire source and rechecks the database plan while holding the lock. A reviewed checkpoint cannot authorize production.

## Stop, interruption, and recovery

SIGINT or SIGTERM stops owned child work, marks the latest atomic reconciliation checkpoint `interrupted`, and exits 130. A scan resume starts again at page one while pinning the recorded source snapshot; it never trusts a serialized identity list. A source that cannot reproduce that snapshot is blocked.

For any anomaly or unexpected change:

1. Stop further reconciliation dispatches. Do not retry with wider thresholds.
2. Preserve the redacted report and checkpoint; never copy secret files into artifacts.
3. Confirm no suspension writes were made and inspect C7 lifecycle history for any previously completed action.
4. Repair the source contract or local identity conflict under its owning runbook, then create a new dry-run review.
5. If an apply committed an individually valid but unwanted suspension, stop the reconciler. Do not issue a bulk reactivation. Use the explicit C7 reactivation authority per reviewed identity.

Database rollback, schema migration, production deployment, registry changes, and production release approval are outside this workflow. This command has no migration authority.
