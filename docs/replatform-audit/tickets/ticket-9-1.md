# Ticket 9.1: MCP adapter and public tools

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-09.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 8.5. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Revalidate current MCP/OpenAI protocols when this phase starts; reuse public services and indexed search, no premature infrastructure expansion.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Milestone 3; shared query operations, public DTOs and visibility policy established by Epics 3–7.

**Interfaces:** expose `search_creators`, `get_creator_profile`, `search_recommendations`, `get_creator_recommendations`, `get_collection`. Use the application query operations specified by the backend/feature plans; tools are transport names, not an additional repository layer. Public principal is anonymous (`null` in shared query services), even if the caller also has an OAuth connection. Public collection access never falls back to admin credentials or an owner-mode query.

**Files:** create `server/mcp/server.ts`, `publicTools.ts`, `toolContracts.ts`, `toolErrors.ts`; modify `server/app.ts`, `server/routes/index.ts`, `package.json` and lockfile; create `server/test/mcp/publicTools.test.ts`, `publicTools.integration.test.ts` and `mcpTransport.test.ts` under `apps/api`.

- [ ] Refresh official OpenAI auth/transport/tool guidance and verify supported released SDK/package APIs. Record tested versions, capabilities and protocol negotiation in `docs/replatform-audit/mcp-release/compatibility.md`; no untested claim of ChatGPT support.
- [ ] Write failing tool contract tests: empty search, pagination, invalid category/cursor, canonical URL, and private/unpublished/unknown resource denial. Assert the shared service is called with a public principal and bounded inputs.
- [ ] Implement registrations with separate explicit schemas and annotations. Limit public page size to 24 to match the existing gateway maximum; reject invalid cursors using the shared error contract. Use reviewed geographic resource references for destination queries rather than collecting precise user location.
- [ ] Mount the adapter without making public tools depend on login. Handle invalid JSON/protocol requests and shutdown; do not bypass API request-size/rate-limit policy. Private tools are not enabled yet.
- [ ] Run `npm --prefix apps/api test -- server/test/mcp/publicTools.test.ts server/test/mcp/mcpTransport.test.ts` (existing Vitest script after rename; files new). Run `npm --prefix apps/api run test:integration -- server/test/mcp/publicTools.integration.test.ts` only with the attested disposable DB harness initialized. A skipped database suite is a failure of qualification.
- [ ] Verify using an actual supported MCP client in QA: tool list, anonymous search, profile and collection; prove neither process logs nor result metadata contain credentials/private contact fields. Record actual client/version and evidence.
- [ ] Commit only after required checks pass; retain compatibility record and test outputs with milestone evidence.

- [ ] **Pinned regression assertions:** `public_query_stays_anonymous_with_linked_token`: a private collection returns the same unavailable result with no token and with its owner OAuth token; public search never includes it. `page_boundary_24`: seeded 25 eligible records produce 24 then 1 unique ID with no duplicate or missing ID.

**Done:** public discovery works against seeded persisted records, under the same visibility rules as web, and actual client evidence exists. No directory submission yet.


## Independent review correction (2026-10-05)

Public MCP closure uses anonymous transport and public authority negatives. Early owner-token tests may use clearly labelled service/transport fixtures only; actual delegated OAuth evidence is owned by 10.1 after grant implementation and then reruns the retained 9.1 authority regression. Do not make 9.1 implementation recursively depend on 10.1 or call fixture OAuth live qualification.

### Second correction pass (2026-10-05, independent review)

**Verdict: NOT-STARTED, confirmed by evidence.** Every requirement and gate above is retained. No MCP code exists in the repository; nothing in this ticket has been started.

Verified absent at the review SHA (read-only, repository-wide):

- no `tunes/server/mcp/` directory (and no `apps/api/`, the post-rename target)
- no `@modelcontextprotocol` dependency in any `package.json`
- no reference to `McpServer` or `StreamableHTTP` in any tracked `.ts`/`.tsx` file
- no `oauthPrincipal.ts`, no `resolveMcpActor`, no `creatorTools.ts`
- no `docs/replatform-audit/mcp-release/` directory, so `compatibility.md` does not exist

The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`. Research output is not an implementation receipt and does not satisfy any checkbox above.

**Prerequisite re-point — PROPOSED, for the coordinator to accept or reject.** This ticket's technical input is recorded as 8.5. 8.5 has not started and has produced no artifact (see the ticket 8.5 correction), so 9.1 is currently blocked behind a recovery drill. A public read-only MCP surface has **no technical need** for the platform recovery drill: it reads already-delivered public query services and writes nothing. The recommendation is to re-point 9.1's technical prerequisite from **8.5 to 7.3**, which is the real producer of the public read surface 9.1 consumes.

- This is a **proposed** re-point recorded for coordinator decision. It is **not** applied: the execution card above still reads 8.5, and no dependency edge has been changed by this correction.
- Release sequencing remains a **separate gate** either way. Re-pointing the technical prerequisite does not make 9.1 releasable ahead of Milestone 3, and does not relax any release-eligibility requirement.
