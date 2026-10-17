# Ticket 1.1: Baseline and scope matrix

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-01.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** scope baseline. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve accepted scope matrix; update new journey evidence only through its owning ticket.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** agreed scope; no implementation dependency.

**Files:** create `docs/replatform/acceptance-matrix.md`, `docs/replatform/evidence/README.md`, `docs/replatform/ci-baseline.md`; inspect existing `explorers-earth/src/routes/{AuthRoutes,ProtectedRoutes,PublicRoutes}.tsx`, `explorers-earth/e2e/`, `docs/testing.md`, `tunes/server/routes/index.ts`, `tunes/shared/music-migration-contract.ts`.

**Interface produced:** one stable scenario ID per retained behavior. Matrix columns: scenario ID, route, persona, preconditions/fixture, action, expected UI/network/storage result, viewport, automated test, manual/provider check, owning ticket, status. Evidence fields: source commit, artifact digest if deployed, environment, command or browser steps, actual result, trace/screenshot path, defects and skipped reason.

- [ ] Inventory every retained route and mark explicit removals (password-only auth and deferred features). Distinguish public routes from owner views and retired endpoints from broken retained features.
- [ ] At implementation start, create the local integration branch before changing application files; do not push or create the draft PR until 1.3 has checked triggers. Preserve unrelated checkout changes.
- [ ] Map each category's create/edit/delete/order/pin/visibility and public navigation behavior; maps/QR, profile/settings/lifecycle, uploads, analytics consent and Music playback/guest/reconnect get separate scenarios. Include anonymous, owner, second owner and suspended personas.
- [ ] Capture desktop/mobile baseline screenshots and current failures using disposable fixtures. Record fixtures/mocks as such, not live E2E. Do not treat stale snapshot updates as proof of parity.
- [ ] Run existing bounded baseline suites after safe provisioning in 1.2, then append actual outcomes here. Record pre-existing failures separately; no invented green baseline.
- [ ] Read GitHub branch/ruleset configuration through authenticated read-only tooling when available and record exact required check names; otherwise mark unavailable, not guessed.
- [ ] Commit only baseline documents/evidence references. **Gate:** the provisional route/scenario matrix unblocks 1.2; baseline executions finish after 1.2 provisions the safe environment, so there is no circular dependency. Final baseline completion requires every retained flow to have an owner/scenario and every claimed result to have a run record.

## Independent review record (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 1.1. Verdict **ACCEPTED (narrow)**. Acceptance is not reopened; the following scope facts qualify what the acceptance covers and must not be read as broader parity evidence.

- The 44-row scope matrix is pinned to application baseline `79ef17d0`, and **every row still reads `status=planned`**. The matrix is an accepted inventory, not a record of executed scenarios.
- Executed evidence is **4 real browser results plus screenshots across 2 marketing routes**. It does not evidence owner, second-owner or suspended personas, nor any category, Music, lifecycle or upload scenario enumerated above.
- **No hosted run is claimed or required** for this ticket, and none exists. Do not cite 1.1 as hosted evidence for any downstream gate.
- Consequence for consumers: 1.1 satisfies only the "provisional route/scenario matrix unblocks 1.2" gate at the bottom of the list above. The final-baseline condition — every retained flow has an owner/scenario and every claimed result has a run record — remains an open requirement owned here, and each new journey's evidence is appended only through its owning ticket.
