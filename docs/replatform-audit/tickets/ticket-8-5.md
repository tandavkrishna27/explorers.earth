# Ticket 8.5: Recovery drill and final web acceptance

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-08.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 8.4. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Qualify backup, restore and recovery against approved topology with owned resources; do not touch retained qualification database.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 8.4 plus all Milestone 2 scenarios; no unresolved critical defect in owner/private/media/auth behavior.

**Files:** create `scripts/platform-backup.ts`, `scripts/platform-restore-drill.ts`, `docs/replatform/release-and-recovery.md`, `docs/replatform/evidence/milestone-3.md`; tests `apps/api/server/test/contracts/platform-recovery.test.ts`; extend existing `explorers-earth/e2e/` and API load suites for final assertions, not duplicated domain tests.

**Interface produced:** backup manifest references database dump and media snapshot/version manifest, schema/artifact identity, checksums and timestamp; restore drill only accepts a new disposable target and never overwrites QA/production. Runbook distinguishes app rollback, forward fix and data restore.

Create `npm run platform:backup -- --environment qa --output-manifest <file>` and `npm run platform:restore-drill -- --manifest <file> --target <disposable-authority>`. Reject production as a restore target and reject an existing populated namespace. Backup destination, retention, encryption authority and media deletion/versioning policy must be recorded in the nonsecret readiness manifest before this ticket's execution; current secret-name presence does not supply those choices.

**Self-hosted PostgreSQL recovery contract:** backups originate from each host's own database using a backup role with the required read privileges, never browser/runtime credentials. Use `pg_dump` custom format plus a separately protected role/grant inventory; restore into an empty disposable PG15 instance, apply runtime-role grants, then run migration/readiness and application checks. A container-volume copy without a consistent PostgreSQL snapshot is not a valid logical backup. Keep backup credentials and artifacts outside application upload routes.

**One-bucket layout:** reserve `qa/backups/`, `prod/backups/` and `qa/restore-drills/<run-id>/` within the accepted bucket. Application upload APIs cannot address backup/drill prefixes. Inspect existing IAM permissions before assuming backup encryption, version listing or lifecycle changes are possible. Shared AWS credentials may have broad authority, so record this limitation; do not silently create a new AWS principal contrary to the accepted reuse decision. Use existing approved server-side encryption and HTTPS; missing encryption permission is a named gate. Propose a daily backup schedule and 14-day retention as initial engineering defaults in the runbook, confirm compatibility with existing bucket rules and cost before applying, and measure observed recovery duration/data-loss window rather than inventing an SLA.

**Media consistency:** snapshot DB first into a run-scoped manifest, record all referenced object keys and existing version IDs/checksums, and prevent cleanup of that run's referenced objects until backup completion. If versioning is unavailable, copy the referenced bytes to the backup prefix and verify checksums. A list of live mutable URLs is not a restorable media backup. Restore uses new object keys beneath the drill prefix and rewrites restored references; the source QA/prod objects remain untouched.

- [ ] Add failing tests for restore target safety, corrupt checksum, missing media inventory and incompatible schema/artifact pairing. Implement backup/restore orchestration with off-host protected storage and redacted logs.
- [ ] Add failure tests for denied S3 upload/read permission, interrupted dump/upload, absent referenced media, backup-prefix access through application APIs and mixed-environment manifest entries. Partial backups are marked incomplete and cannot become restore candidates; cleanup targets only the run-owned temporary keys after explicit path validation.
- [ ] Restore a QA-seeded backup into a fresh disposable database/storage namespace. Verify accounts/memberships, category counts and ordering, uploaded object hashes, private visibility and Music publication/replay constraints. Measure recovery duration and document observed recovery point; do not invent an SLA.
- [ ] Run complete bounded local/CI regression and agent-driven QA acceptance matrix. Include critical keyboard/focus/error-label checks and axe on existing pages; document pre-existing issues and changed-flow regressions. Never silently replace visual snapshots to hide changes.
- [ ] Extend existing load harness with profile/category paginated reads, recommendation writes and analytics ingestion against realistic deterministic fixtures. Report workload, p50/p95, failures, resource use and baseline delta. Establish a documented capacity budget from measured QA hardware before release; do not claim unrelated Music-only load results cover these routes.
- [ ] Verify recovery, cold restart, invalid config, provider outage and graceful socket reconnect. Check built assets/network for exposed provider secrets and unexpected hosted dependencies.
- [ ] Write final evidence and explicit old-service retirement checklist (DNS/proxy, scheduled jobs, unused secret references, obsolete images/volumes retention). No destructive shutdown or deletion is performed as a planning/documentation action.
- [ ] Commit final report. **Gate:** all required retained flows pass with no unexplained skips; remote CI and QA identify the exact release; recovery works; remaining provider/credential limitations block the affected claim rather than being hidden.


## Independent review correction (2026-10-05)

**Verdict: NOT-STARTED — prose only.** Every requirement and gate above is retained in full. Stated plainly: **this ticket has no mechanism, and there is no restore evidence of any kind for the platform database or for media.**

### Every named artifact is absent

Verified absent at the review SHA:

- `scripts/platform-backup.ts`
- `scripts/platform-restore-drill.ts`
- `docs/replatform/release-and-recovery.md`
- `docs/replatform/evidence/milestone-3.md`
- the `platform-recovery` contract test (`apps/api/server/test/contracts/platform-recovery.test.ts`; `apps/api/` itself does not exist, and no `platform-recovery` test exists under `tunes/server/test/contracts/` either — only `platform-release.test.ts`)

No `platform:backup` or `platform:restore-drill` script is defined in any `package.json` in the repository, so the two commands specified above are not invocable.

### The nearest real code does not satisfy the contract

The closest existing artifact is `tunes/scripts/music-e2e-state-restore.mjs`. It is **fixture state reset**, not a logical database backup: it does not produce a `pg_dump` custom-format dump, a backup manifest, checksums, a schema/artifact identity pairing or a media version inventory, and it does not restore into a fresh disposable target. It therefore does not satisfy the self-hosted PostgreSQL recovery contract above, and must not be cited as partial recovery evidence.

### Consequence for dependent claims

- There is **no measured recovery duration and no observed recovery point** for the platform database. Any such figure appearing elsewhere would be invented.
- There is **no media backup or restore evidence** of any kind.
- Because 8.5 has produced nothing, the 8.4 acceptance join to 8.5 recovery evidence cannot currently be evaluated. See the 8.4 correction.
- Milestone 3 has no evidence document, so Epic 9's Milestone 3 prerequisite is unmet. See the epic-09 correction.
