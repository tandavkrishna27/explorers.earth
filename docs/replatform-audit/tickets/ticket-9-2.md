# Ticket 9.2: Discovery quality and observability

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-09.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 9.1, 3.4. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Qualify public discovery/search analytics under anonymous consent policy and canonical services.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 9.1; shared search and analytics.

**Files:** create `server/test/mcp/discoveryCases.ts`, `discoveryQuality.integration.test.ts`, `toolAnalytics.test.ts`, and `docs/replatform-audit/mcp-release/discovery-results.md`; modify `server/mcp/publicTools.ts` and existing application analytics adapter only for transport attribution.

**Contract:** tool results preserve creator attribution, entity identity, commentary and canonical URL; only purpose-relevant dates/disclosures. Analytics records `tool_result_returned` separately from any observable component render. MCP has no access to the browser consent cookie: anonymous calls default to no per-user/product analytics event. Allow only minimized aggregate operational counters without query text, identity or resource-level behavioral trails. For linked users, a separate explicit MCP analytics preference stored server-side must authorize any product event; otherwise omit it. Use the shared event intake with source-specific consent evidence, never infer consent from account linking or token scopes. No raw prompt logging.

- [ ] Define deterministic seeded cases: exact creator handle, missing creator, book keyword, supported destination/category, two-creators-one-entity overlap, repeated recommendations from one creator, private result exclusion, second page continuity and empty results.
- [ ] Write assertions for expected IDs, distinct creator counts, provenance and no private snippets; ambiguous same-name entities remain separate. Use membership/count assertions rather than unstable natural-language wording.
- [ ] Implement only needed shared-query fixes; keep ranking in the application layer. Start with PostgreSQL filters/FTS, no separate vector service.
- [ ] Add analytics tests for consent denied, opt-in permitted event, no raw chat/transcript/token storage, retry dedupe, and no impression/conversion inferred from a tool call.
- [ ] Run `npm --prefix apps/api test -- server/test/mcp/toolAnalytics.test.ts` and attested `npm --prefix apps/api run test:integration -- server/test/mcp/discoveryQuality.integration.test.ts`.
- [ ] Exercise representative natural-language discovery in the actual client and record cases where tool selection, disambiguation or results fail. Fix descriptions/schema within scope; report unresolved cases honestly.

- [ ] **Pinned regression assertions:** `anonymous_tool_has_no_behavioral_event`: an anonymous discovery call writes no per-user analytics row and no query text in logs. `shared_entity_distinct_creators`: two recommendations by one account plus one by another count two creators, not three.

**Done:** the seeded quality cases pass and actual-client behavior is documented. Future following-based discovery remains excluded.


## Independent review correction (2026-10-05)

Linked-user analytics preference is a named 7.2/9.2 contract handoff: persistence, explicit user control, current consent and revoke behavior must exist before linked-user analytics activation. Until reviewed, keep those product events disabled by default. Public discovery remains usable without consent; no inferred impressions. Real delegated opt-in qualification joins 10.1 rather than blocking anonymous discovery.

### Second correction pass (2026-10-05, independent review)

**Verdict: NOT-STARTED, confirmed by evidence.** Every requirement and gate above is retained. Verified absent at the review SHA: no `tunes/server/mcp/` directory, no `@modelcontextprotocol` dependency in any `package.json`, no `McpServer`/`StreamableHTTP` reference in any tracked source file, no `creatorTools.ts`, and no `docs/replatform-audit/mcp-release/` directory — so `discovery-results.md` does not exist. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`.

**The default-deny currently holds VACUOUSLY.** Because no MCP analytics code exists, there is no code path that could emit a per-user or product event, so the contract above ("anonymous calls default to no per-user/product analytics event") is satisfied only by absence. **It is not an implemented control.** Treat it as an unbuilt requirement, not a delivered safety property:

- The pinned assertion `anonymous_tool_has_no_behavioral_event` has no subject to assert against and has never run.
- No future review may cite today's default-deny as prior evidence that the control works. The control must be implemented and its negative tests must execute and pass before any such claim.
- A test that passes because the emitting code does not exist is a vacuous pass and does not qualify this gate.

**The 7.2 consent-persistence handoff has no producer in tree.** The linked-user MCP analytics preference requires server-side persistence, explicit user control, current-consent resolution and revoke behavior from 7.2. 7.2 is NOT-STARTED: no reference-content module, routes or seeds exist, and its analytics dashboard is structurally dead (it gates on a `token` that canonical auth never sets). So the handoff above names a producer that currently produces nothing.

- [ ] Linked-user product analytics stay disabled by default until the 7.2 persistence, control, current-consent and revoke behaviors exist and have been reviewed. Absence of a consumer is not authorization to enable them, and a 9.2 fixture must not stand in for the missing 7.2 producer.
