# Ticket 1.4: API-only build seam

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-01.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 1.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse API-only runtime; preserve build and production dependency gates.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 1.2/1.3. No client deletion yet.

**Files:** modify `tunes/package.json`, `tunes/server/index.ts`, `tunes/server/vite.ts`, `tunes/Dockerfile`, relevant startup/runtime modules reached from index; add `tunes/server/test/contracts/api-only-build.test.ts`. Update root runner and affected image/deployment contract tests. Inspect `tunes/server/app.ts` static root serving so API-only mode cannot expose project files.

**Interface produced:** new `npm run build:api --prefix tunes` builds server entry plus migration gate/registration compatibility/production graph smoke entrypoints; `npm run start:api --prefix tunes` starts that artifact cross-platform. Existing combined build remains until 8.2. API-only startup never imports Vite/client config and never serves repository-root files.

- [ ] Add tests for production and development API-only startup with no client build directory: health route succeeds, API miss returns structured error rather than HTML, shutdown closes owned listeners/pools, source/config files are not served.
- [ ] Run targeted test and observe failures. Split build commands and conditional/dynamic development serving dependency; preserve production migration/readiness gate entrypoints.
- [ ] Build API only, run existing server graph/runtime contract tests and smoke local API through the wrapper. Verify a container built without duplicate-client output boots and shuts down cleanly.
- [ ] Run `npm run build:api --prefix tunes`, `npm test --prefix tunes -- --run server/test/contracts/api-only-build.test.ts`, existing `music:types:scoped` and `music:types:baseline`. Full `check` status must be reported separately from scoped baseline status.
- [ ] Commit. **Gate:** API build/runtime is independently valid; deleting the client is still prohibited until equivalent coverage and Milestone 2.

## Independent review record (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 1.4. Verdict **ACCEPTED**, evidence independently verified: **4/4 hosted workflow runs concluded `success`** at the recorded acceptance head, and the required behaviors above — API-only startup, structured JSON 404s instead of HTML, clean shutdown of owned listeners/pools, and metafile-asserted exclusion of client output — are all covered.

One scope caveat, recorded so no consumer over-reads the receipt: the recorded acceptance SHA is a **one-line documentation commit**, so the hosted 4/4 proves the gate held at that head, not that the same commit implemented the seam. Acceptance is not reopened. The final gate above stands unchanged: client deletion remains prohibited until 8.2 has equivalent replacement coverage and Milestone 2.
