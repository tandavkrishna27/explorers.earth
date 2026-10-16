# Ticket 10.3: Publication readiness

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-10.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 9.2, 10.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Complete current review/publication requirements using actual app evidence; submission is a separate authorized external action.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 9.2 and 10.2 passing; current official publication rules rechecked.

**Files:** create `docs/replatform-audit/mcp-release/review-cases.md`, `privacy-data-map.md`, `release-checklist.md`, `uat-results.md`; proposed distributable under `plugins/explorers/` using the then-current official package format. No embedded reviewer secrets.

- [ ] Define and execute five positive and three negative review cases against the real QA service, adjusting counts/format if current official rules change. Cover public discovery, account linking, an authorized write, private access denial and ambiguous requests.
- [ ] Document actual data collection/retention, support contact, endpoint ownership, scopes and deletion/revocation behavior. Omit digital checkout/upgrades and advertising; do not assume travel booking qualifies for allowed physical commerce.
- [ ] Validate package schema/tool declarations, accessible walkthrough and reviewer path. Reviewer access must use supported secure delivery, not a secret committed into the repository or package.
- [ ] Run full affected automated suites plus actual-client acceptance and record precise skipped/blocked cases. Redact tokens/session values from screenshots and logs.
- [ ] Produce Milestone 4 report with package validation evidence and publication steps. Do not submit, publish or change production access as an implicit consequence of completing this ticket.

- [ ] **Pinned regression assertions:** Each review case records setup, explicit action, expected state, actual state, artifact/run link and pass/fail/blocked; verify the package contains no credential values and all declared tools match the running QA tool list.

**Done:** review-ready integration and evidence; public availability is not claimed before separate publication succeeds.


## Independent review correction (2026-10-05)

**Verdict: NOT-STARTED, confirmed by evidence.** Every requirement and gate above is retained. Verified absent at the review SHA: no `tunes/server/mcp/` directory (and no `apps/api/`), no `@modelcontextprotocol` dependency in any `package.json`, no `McpServer`/`StreamableHTTP` reference in any tracked source file, no `creatorTools.ts`, no `oauthPrincipal.ts`/`resolveMcpActor`, no `docs/replatform-audit/mcp-release/` directory — so `review-cases.md`, `privacy-data-map.md`, `release-checklist.md` and `uat-results.md` do not exist — and no `plugins/` directory, so there is no distributable package. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`.

Both of this ticket's prerequisites (9.2 and 10.2) are themselves NOT-STARTED, so there is no running QA tool list to validate declared tools against, and no Milestone 4 report can be produced. Nothing above has been attempted.
