# ChatGPT integration implementation plan — Epics 9 and 10

## Current authority (2026-10-05)

Historical draft/review below preserves requirements, not current completion or execution order. Use the [current status](current-status-2026-10-05.md), [individual ticket plans](ticket-index.md) and [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Seven original tickets remain complete. Do not regenerate amended tickets from grouped drafts; the organizer now validates custody read-only. Proposed original paths/commands need current-source verification before implementation.


**Database authority:** [Consolidated target schema](target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans when implementation is authorized. Execute ticket-by-ticket on the agreed integration branch after web acceptance. This document authorizes no MCP implementation or publishing.

**Goal:** expose public discovery and authorized creator actions through the unified application's existing operations.

**Architecture:** one MCP transport mounted in the renamed API application, with public and delegated principals calling the same services as HTTP. Better Auth supplies OAuth; MCP does not access tables directly or implement a separate permission system.

**Stack:** existing TypeScript/Express/PostgreSQL/Vitest; supported Better Auth OAuth/MCP packages and official MCP TypeScript SDK pinned during compatibility qualification.

**Spec:** [revised direction](revised-direction.md), [backlog](epics-and-tickets.md), [official-source research](mcp-and-identity-research.md).

## Global constraints and file map

Apply the [shared execution checklist](execution-checklist.md) to changed web, API and test consumers. Actual-client and real-API evidence remains separate from simulated transport/provider tests, with secret-safe diagnostics and prompt/token redaction.

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

## Epic 10: Linked actions and review readiness

### Ticket 10.1 — OAuth linking and delegated principal

**Depends on:** Epic 9 and Epic 2 Better Auth/ownership. Does not require a second Google account system or another auth server deployment.

**Files:** modify the canonical Better Auth config established by Epic 2, `apps/api/server/mcp/server.ts`, `package.json`/lockfile; create `server/mcp/oauthPrincipal.ts`, `server/test/mcp/oauthPrincipal.test.ts`, `oauthFlow.integration.test.ts`; add QA callback/issuer configuration through existing secret mechanism. Add a minimal consent screen under existing Explorers auth feature only if Better Auth flow requires it; this is new account-linking UI, not a web redesign.

**Interfaces:** shared `Actor` carries userId/accountId/role and credential union. OAuth credential is `{kind:'oauth',grantId,scopes:readonly string[]}`; never fabricate a browser session ID. Resolve scope, application consent-binding ID/generation, live native consent and active account membership on the server. Better Auth 1.7.6 has no universal native token grant ID; Actor grantId is our binding UUID. Token issuance/refresh must preserve the original binding generation, and disconnect/re-consent must not revive old tokens. The pinned generated schema and source findings are in [auth qualification](auth-schema-qualification.md). `resolveMcpActor(verifiedClaims, requestedAccountId): Promise<Actor>` translates verified authority; it is not a raw JWT decoder.

- [ ] Test protected-resource discovery, authorization-code/PKCE, supported client registration, correct issuer/audience, denied consent, expired/wrong-audience tokens and insufficient scope.
- [ ] Pin released Better Auth integration and registration mode matching actual OpenAI client support. Test token/grant revocation semantics rather than assuming JWT validation alone performs revocation. Record cache bounds and key rotation behavior.
- [ ] Implement challenges and scope checks using library support; link to canonical user and initial owner account. Distinguish scope remediation from unauthorized membership; another consent screen cannot fix another user's ownership.
- [ ] Test anonymous public tools still work after protected tools are registered, and OAuth credentials cannot reach unrelated admin/legacy routes.
- [ ] Run `npm --prefix apps/api test -- server/test/mcp/oauthPrincipal.test.ts` and attested `npm --prefix apps/api run test:integration -- server/test/mcp/oauthFlow.integration.test.ts`.
- [ ] Complete a real QA ChatGPT connection through Google login, consent, protected read, disconnect/revoke and reconnect. If provider settings/access prevent this, mark interoperability blocked rather than passed with mocks.

- [ ] **Pinned regression assertions:** `revoked_grant_denied_on_next_request`: a previously valid protected read fails after persisted grant revocation; public search still works. `wrong_resource_audience_denied`: token for another resource cannot construct an Actor.

**Done:** actual account linking and revocation evidence exists; no production authorization credentials in test artifacts.

### Ticket 10.2 — Creator tools

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

### Ticket 10.3 — Publication readiness

**Depends on:** 9.2 and 10.2 passing; current official publication rules rechecked.

**Files:** create `docs/replatform-audit/mcp-release/review-cases.md`, `privacy-data-map.md`, `release-checklist.md`, `uat-results.md`; proposed distributable under `plugins/explorers/` using the then-current official package format. No embedded reviewer secrets.

- [ ] Define and execute five positive and three negative review cases against the real QA service, adjusting counts/format if current official rules change. Cover public discovery, account linking, an authorized write, private access denial and ambiguous requests.
- [ ] Document actual data collection/retention, support contact, endpoint ownership, scopes and deletion/revocation behavior. Omit digital checkout/upgrades and advertising; do not assume travel booking qualifies for allowed physical commerce.
- [ ] Validate package schema/tool declarations, accessible walkthrough and reviewer path. Reviewer access must use supported secure delivery, not a secret committed into the repository or package.
- [ ] Run full affected automated suites plus actual-client acceptance and record precise skipped/blocked cases. Redact tokens/session values from screenshots and logs.
- [ ] Produce Milestone 4 report with package validation evidence and publication steps. Do not submit, publish or change production access as an implicit consequence of completing this ticket.

- [ ] **Pinned regression assertions:** Each review case records setup, explicit action, expected state, actual state, artifact/run link and pass/fail/blocked; verify the package contains no credential values and all declared tools match the running QA tool list.

**Done:** review-ready integration and evidence; public availability is not claimed before separate publication succeeds.

## Self-review

All five tickets have prerequisites, exact proposed file scope, named behaviors and checks. Existing test scripts are distinguished from future files. The only unresolved implementation dependency is actual supported package/client behavior, explicitly qualified before adapter code; library APIs are not invented here. Full test-harness authority and secret handling are inherited from the operations plan. No claim of executed tests is made by this document.

**Auth qualification update:** [Pinned Better Auth schema and local probe results](auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.
