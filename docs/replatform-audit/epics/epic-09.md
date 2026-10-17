# Epic 9: Public ChatGPT discovery

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [9.1](../tickets/ticket-9-1.md) | waiting | Revalidate current MCP/OpenAI protocols when this phase starts; reuse public services and indexed search, no premature infrastructure expansion. |
| [9.2](../tickets/ticket-9-2.md) | waiting | Qualify public discovery/search analytics under anonymous consent policy and canonical services. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

# ChatGPT integration implementation plan — Epics 9 and 10

**Database authority:** [Consolidated target schema](../target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans when implementation is authorized. Execute ticket-by-ticket on the agreed integration branch after web acceptance. This document authorizes no MCP implementation or publishing.

**Goal:** expose public discovery and authorized creator actions through the unified application's existing operations.

**Architecture:** one MCP transport mounted in the renamed API application, with public and delegated principals calling the same services as HTTP. Better Auth supplies OAuth; MCP does not access tables directly or implement a separate permission system.

**Stack:** existing TypeScript/Express/PostgreSQL/Vitest; supported Better Auth OAuth/MCP packages and official MCP TypeScript SDK pinned during compatibility qualification.

**Spec:** [revised direction](../revised-direction.md), [backlog](../epics-and-tickets.md), [official-source research](../mcp-and-identity-research.md).

## Global constraints and file map

Apply the [shared execution checklist](../execution-checklist.md) to changed web, API and test consumers. Actual-client and real-API evidence remains separate from simulated transport/provider tests, with secret-safe diagnostics and prompt/token redaction.

- Milestone 3 is prerequisite. Paths below use `apps/api`, the agreed Epic 8 rename target; before that move the equivalent package is `tunes`.
- No new frontend redesign, billing, paid-guide checkout, advertising, admin tools or arbitrary SQL/fetch executor.
- Actual OpenAI interoperability must be tested; installed package APIs and negotiated protocol versions determine adapter implementation. Do not copy a guide's latest-version-only transport without checking the actual client.
- Retain web tests. Plugin invocation count is not an impression; tool success is not a conversion.
- New `apps/api/server/mcp/`: `server.ts` registration/composition, `publicTools.ts`, `creatorTools.ts`, `oauthPrincipal.ts`, `toolErrors.ts`, `toolContracts.ts`.
- Modify existing renamed `apps/api/server/app.ts` and `server/routes/index.ts` only for composition/middleware order. Keep OAuth callbacks and raw/form request handling compatible with Better Auth, body limits, CORS and route containment.
- Shared wire contracts live in `apps/api/shared/explorersContract.ts`; trusted `Actor` lives in `apps/api/server/application/actor.ts` and is never a browser-exported credential DTO. Feature-specific rich types extend the reviewed wire contract. No tool-defined duplicate ownership DTOs.
- New unit tests in `apps/api/server/test/mcp/`; new database suites end `.integration.test.ts` and use the inherited disposable-database integration harness.
- New review artifacts in `docs/replatform-audit/mcp-release/` only during implementation; package location `plugins/explorers/` is proposed and is created only when submission packaging begins.

## Review focus

1. Anonymous access to private/unpublished resources: public tests explicitly deny both direct IDs and search leakage.
2. Another account's ID supplied to a valid token: tool ignores claimed authority and rejects unauthorized resource access.
3. Repeated writes/timeouts and stale revisions: receipts/revisions prevent duplicate or overwritten work.
4. Revoked membership/grant or wrong token audience: current authority checked, not just decoded token claims.
5. Untrusted entity text or remote destination: returned content cannot authorize writes, arbitrary fetches or private-data disclosure.


## Epic 9: Public discovery

### Ticket 9.1 — MCP adapter and public tools

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

### Ticket 9.2 — Discovery quality and observability

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

**Epic verdict: NOT-STARTED.** Both tickets (9.1, 9.2) are unstarted. Every requirement and gate in this epic and in its ticket files is retained.

### No MCP implementation exists

Verified absent at the review SHA, repository-wide and read-only: no `tunes/server/mcp/` directory (and no `apps/api/`, the rename target this epic's paths assume), no `@modelcontextprotocol` dependency in any `package.json`, no reference to `McpServer` or `StreamableHTTP` in any tracked source file, no `publicTools.ts`, `oauthPrincipal.ts` or `creatorTools.ts`, and no `docs/replatform-audit/mcp-release/` directory — so neither `compatibility.md` nor `discovery-results.md` exists. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`; research output is not an implementation receipt.

Consequently 9.2's default-deny on anonymous analytics holds **vacuously** — there is no code path that could emit an event — and must be treated as an unbuilt requirement, not a delivered control. The per-ticket detail is in `../tickets/ticket-9-2.md`.

### Milestone 3 prerequisite is unmet

This epic's global constraints state at `:37` that "Milestone 3 is prerequisite." **That prerequisite is unmet, because ticket 8.5 has not started.** 8.5 is prose only: `scripts/platform-backup.ts`, `scripts/platform-restore-drill.ts`, `docs/replatform/release-and-recovery.md`, `docs/replatform/evidence/milestone-3.md` and the `platform-recovery` contract test are all absent, and no `platform:backup` or `platform:restore-drill` script exists in any `package.json`. There is therefore no Milestone 3 evidence document of any kind, and no recovery evidence for the platform database or media.

A **proposed** re-point of 9.1's technical prerequisite from 8.5 to 7.3 is recorded in `../tickets/ticket-9-1.md` for the coordinator to accept or reject. It is not applied here, and release sequencing remains a separate gate regardless: re-pointing the technical input would not make this epic releasable ahead of Milestone 3.

### Text duplication across epics 08–10

Ticket bodies 9.1 and 9.2 are triplicated verbatim at `:58-95` — once in the canonical ticket files under `../tickets/`, once here, and once in the grouped implementation document shared with Epic 10. This contradicts the principle each ticket file states, that shared contracts are maintained once in the epic rather than copied into conflicting versions, and it is how one copy drifts after the other is corrected.

**Recommendation (not applied in this pass):** reduce this epic file to the disposition table plus links, keeping only genuinely epic-level content (global constraints, file map, review focus). **No requirement text is deleted in this pass.** Until the coordinator designates which copy is authoritative, the canonical ticket files under `../tickets/` govern where the copies disagree.

## Individual ticket files

- [Ticket 9.1: MCP adapter and public tools](../tickets/ticket-9-1.md)
- [Ticket 9.2: Discovery quality and observability](../tickets/ticket-9-2.md)
