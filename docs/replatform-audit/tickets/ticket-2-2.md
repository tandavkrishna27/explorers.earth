# Ticket 2.2: Authorization and Music boundary

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-02.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 2.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse Actor contract; Music implementation belongs to 6.1.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 2.1. **Produces:** Actor resolver and canonical Music adapter specification; consumers include all content services and 6.1.

**Create:** `tunes/server/application/actor.ts`, `tunes/server/middleware/explorersPrincipal.ts`, `tunes/server/application/authorization.ts`, `tunes/server/music/canonicalMusicPrincipal.ts`, `tunes/server/test/explorers-authorization.test.ts`, `tunes/server/test/explorers-authorization.integration.test.ts`. **Modify:** `tunes/server/routes/index.ts`, `tunes/server/types/express.d.ts` if present; otherwise create that declaration file, `tunes/server/security-containment.ts`, and `tunes/server/policies/musicRetirementPolicy.ts` only to admit explicitly new canonical routes without reopening retired ones.

- [ ] Add failing matrix tests for anonymous/owner/other-owner/suspended/pending-deletion; forged account ID, stale membership, stale session version and duplicate credentials. Add an OAuth Actor unit fixture to prove service authorization requires its operation scopes without introducing an OAuth transport.
- [ ] Implement `requireActor`, current-membership authorization and error envelope. Resolve lifecycle status on the server; tests must change state after session issuance and see access denied on the next request.
- [ ] Define `resolveCanonicalMusicPrincipal(actor): Promise<{musicUserId:number;accountId:string;userId:string;sessionVersion:number}>` and `account_music_identity` one-to-one mapping. Preserve numeric music ownership but never overload Strapi columns with canonical UUIDs. Define all owner Music REST to use the same web session; purpose-limited socket credentials are issued from it in 6.1.
- [ ] Run authorization unit/integration tests and existing retirement-policy tests. Commit. **Done:** new owner APIs cannot select their authority from body/query IDs; the Music boundary has a compiling adapter contract and failing isolation fixture ready for 6.1.
