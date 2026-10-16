# Ticket 8.3: Mechanical backend rename

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-08.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 8.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Rename only after topology stabilizes; verify import/build/runtime references and artifact lineage.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 8.2 green checkpoint.

**Files:** move `tunes/` to `apps/api/`; update root runner and npm local package references, Docker build contexts/COPY paths, compose, scripts, workflows, test aliases, scoped TypeScript configs, fixture orchestration, release manifest producer, docs and cache keys. Update `.dockerignore` and generated dockerignore tooling. Frontend directory remains `explorers-earth/`.

**Interface produced:** backend commands use `npm --prefix apps/api`; stable root `platform:*` commands do not change. New image name is `explorers-api`; retain old image digests as rollback references rather than assuming a registry rename copies them.

- [ ] Search tracked files for `tunes/`, `../tunes`, package names and image references; classify historical documentation versus executable paths before move.
- [ ] Perform mechanical move and exact reference changes, update lockfiles/package local dependency paths. No auth/schema/domain changes in this ticket.
- [ ] Run root platform commands, full applicable CI, image build/graph smoke and QA deployment using new paths. Verify both Linux CI and Windows local invocation where the current tools claim support.
- [ ] Commit isolated rename. **Gate:** QA release and required checks resolve new paths; a text replacement alone is not enough.
