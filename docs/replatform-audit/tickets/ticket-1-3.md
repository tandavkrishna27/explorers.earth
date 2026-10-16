# Ticket 1.3: CI and deployment separation

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-01.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 1.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve required hosted checks and immutable promotion contract.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 1.1 baseline; 1.2 safe test orchestration. Must complete before first implementation push.

**Files:** modify `.github/workflows/{ci,test,music-c0-contracts,tunes,explorers,tunes-deploy,frontend-e2e-qualification}.yml` where triggered scopes change; inspect `music-reconcile.yml`, `tunes-host-preflight.yml`, `tunes-test-direct-deploy.yml`; create `tunes/server/test/contracts/replatform-workflow-authority.test.ts` and `docs/replatform/ci-check-map.md`. Preserve required job names until settings are deliberately reconciled.

**Interface produced:** validation runs for PRs targeting main, including draft PRs, with root/backend/frontend/workflow/fixture/shared paths included. Deploy authority is explicit environment plus digest plus matching recorded source revision. No PR receives SSH/deployment privileges. Suggested branch is `codex/unified-replatform`; branch creation is implementation work, not this planning step.

**Verified configuration gap:** read-only GitHub metadata found no required main status checks and no dedicated QA environment. After observing a real PR run, define an aggregate `replatform-required` check that rejects failed/missing/unexpectedly skipped required jobs; configure the repository rule to require that exact check through authorized repository settings. Record administrator bypass policy. Do not claim CI enforcement from workflow files alone. Create a QA environment restricted to the integration branch with environment-scoped credentials as part of implementation, not this review.

- [ ] Record all relevant workflow triggers, path filters, checkout ref choices, secrets scopes, job dependencies and deploy calls. Check `workflow_run` trust and head revision handling, dispatch main guards, scheduled production jobs and production environment protections.
- [ ] Add a workflow contract test matrix: feature push and PR cannot invoke deployment; main CI completion cannot deploy the new stack without release authority; dispatch on non-main cannot deploy production; failed/skipped validation cannot satisfy release; path changes in shared contracts or workflows run relevant checks.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/replatform-workflow-authority.test.ts` and observe expected failures. Implement explicit conditions and minimum permissions; do not remove unrelated production protection. The expired temporary deploy is not used for QA.
- [ ] Wire bounded local-equivalent checks: lint/type/build, unit/domain, real PG integration/security, named E2E smoke suites. Retain deeper browser/load/chaos lanes as milestone/manual or nightly checks with explicit triggers and evidence.
- [ ] Run changed workflow contract tests and existing `server/test/contracts` suite. Validate workflow syntax with available GitHub/actionlint tooling; do not install tools solely to claim validation when unavailable.
- [ ] Push the integration branch created in 1.1 and create its draft PR only after static trigger review. Inspect real run conclusions and exact source revision. Resolve baseline failures openly; no green-by-skip claim. Record required-check settings separately from source.
- [ ] Commit workflow/check-map changes. **Gate:** feature branch has executed validation, no deployment job was invoked, and required checks resolve. CI syntax tests alone do not establish remote CI success.

## Independent review record (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 1.3. Verdict **ACCEPTED**, evidence independently verified:

- **8/8 hosted workflow runs concluded `success` at `c64a274e`**, the recorded acceptance head.
- The branch-protection receipt is a real before/after read-only API readback, not a workflow-file inference, and **it still matches live protection as read on 2026-10-05**: `strict=true` with required contexts exactly `replatform-required` (`.github/workflows/ci.yml:462`) and `music-required` (`.github/workflows/test.yml:300`). The "Verified configuration gap" paragraph above is therefore closed by executed evidence, satisfying its own rule that CI enforcement is never claimed from workflow files alone.

Two protection facts the receipt does not cover, recorded here so no consumer reads 1.3 as evidence for them: `enforce_admins=false` and `required_pull_request_reviews=null`. The review classes both as a protection-policy decision for the repository owner, not a workflow change and not a 1.3 defect. Acceptance is not reopened. Note separately that image build and "Music C0 contracts" are **not** protected contexts, and that `music-required` is emitted by `test.yml` ("Backend validation"), not by the "Music C0 contracts" workflow — do not substitute one for the other when reading a required-check result.
