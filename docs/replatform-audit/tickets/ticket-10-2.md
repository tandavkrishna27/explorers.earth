# Ticket 10.2: Creator tools

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-10.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 10.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse reviewed web commands for creator tools; require grant scope and current account membership for each operation.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 10.1 and verified web command services.

**Files:** create `apps/api/server/mcp/creatorTools.ts`, `server/test/mcp/creatorTools.test.ts`, `creatorTools.integration.test.ts`; update registration/contracts/error translation.

**Interfaces:** call shared `createRecommendation`, `updateRecommendation`, `archiveRecommendation`, `createCollection`, `updateCollection`, `getCreatorAnalytics` and `getMyProfile(actor)` from the profile service. `get_my_profile` requires `profile:read` and active account membership; it is not implemented by a public-profile lookup. Pass `Actor` and `RequestContext` defined by the core plan. Validate scope then service ownership; never accept an actor from tool input. Retain application revision/idempotency contracts.

- [ ] Write tests for another account's resource, suspended account, stale revision, repeated same command, reused idempotency key/different payload and a failed provider lookup. Assert stored state as well as returned results.
- [ ] Implement explicit tools `create_recommendation`, `update_recommendation`, `archive_recommendation`, `create_collection`, `update_collection`, `get_creator_analytics`, plus `get_my_profile` for account context. No generic action executor.
- [ ] Ensure ambiguous entity resolution returns choices without writing. Default to draft unless user intent explicitly authorizes publication. Label write/destructive/open-world behavior accurately and include visible account/resource/field context in result/preview.
- [ ] Validate analytics responses are authorized aggregates and exclude other creators' private data. Untrusted recommendation text is data, never authority to invoke a command.
- [ ] Run `npm --prefix apps/api test -- server/test/mcp/creatorTools.test.ts` and attested `npm --prefix apps/api run test:integration -- server/test/mcp/creatorTools.integration.test.ts`.
- [ ] Run actual-client UAT: create a draft book recommendation, resolve ambiguity without a write, edit with explicit intent, simulate retry, archive, and inspect the same result through existing web screens. Test another-account denial independently.

- [ ] **Pinned regression assertions:** `same_key_same_payload_one_write`: repeated creation returns the recorded result and exactly one recommendation exists. `same_key_changed_payload_conflict`: conflicting payload cannot mutate the first result. `stale_revision_preserves_current_row`: stale update fails and the newer row remains unchanged.

**Done:** web and MCP produce the same persisted behavior through the same operations; actual client confirmation behavior is recorded, not assumed from annotation flags.


## Independent review correction (2026-10-05)

**Verdict: NOT-STARTED, confirmed by evidence.** Every requirement and gate above is retained. Verified absent at the review SHA: no `tunes/server/mcp/` directory (and no `apps/api/`), no `@modelcontextprotocol` dependency in any `package.json`, no `McpServer`/`StreamableHTTP` reference in any tracked source file, no `creatorTools.ts`, no `oauthPrincipal.ts`/`resolveMcpActor`, and no `docs/replatform-audit/mcp-release/`. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`.

**`get_my_profile` — 10.2 defers the probe to 10.1.** `get_my_profile` is double-claimed: it appears in 10.2's interface list at `:33` and in 10.2's implementation step at `:36` (and in `epic-10.md:84` and `:87`), while `ticket-10-1.md:49` assigns 10.1 a minimal protected `getMyProfile` read probe. **Ticket 10.1 owns that minimal probe and lands it first; 10.2 does not re-implement it.** 10.2 owns the full creator tool catalog and extends the already-registered `get_my_profile` tool rather than creating a second one. Coordinate the registration freeze with the coordinator before touching it.

Both tickets' `get_my_profile` requirements are retained unchanged: `profile:read` scope, active account membership, and no implementation by a public-profile lookup. This correction assigns ownership; it removes no requirement from either ticket.
