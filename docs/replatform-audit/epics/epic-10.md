# Epic 10: Linked creator tools and review readiness

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [10.1](../tickets/ticket-10-1.md) | waiting | Implement delegated grant authority with scopes, consent and revocation after public discovery; recheck current external protocol first. |
| [10.2](../tickets/ticket-10-2.md) | waiting | Reuse reviewed web commands for creator tools; require grant scope and current account membership for each operation. |
| [10.3](../tickets/ticket-10-3.md) | waiting | Complete current review/publication requirements using actual app evidence; submission is a separate authorized external action. |

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


## Epic 10: Linked actions and review readiness

### Ticket 10.1 — OAuth linking and delegated principal

**Depends on:** Epic 9 and Epic 2 Better Auth/ownership. Does not require a second Google account system or another auth server deployment.

**Files:** modify the canonical Better Auth config established by Epic 2, `apps/api/server/mcp/server.ts`, `package.json`/lockfile; create `server/mcp/oauthPrincipal.ts`, `server/test/mcp/oauthPrincipal.test.ts`, `oauthFlow.integration.test.ts`; add QA callback/issuer configuration through existing secret mechanism. Add a minimal consent screen under existing Explorers auth feature only if Better Auth flow requires it; this is new account-linking UI, not a web redesign.

**Interfaces:** shared `Actor` carries userId/accountId/role and credential union. OAuth credential is `{kind:'oauth',grantId,scopes:readonly string[]}`; never fabricate a browser session ID. Resolve scope, application consent-binding ID/generation, live native consent and active account membership on the server. Better Auth 1.7.6 has no universal native token grant ID; Actor grantId is our binding UUID. Token issuance/refresh must preserve the original binding generation, and disconnect/re-consent must not revive old tokens. The pinned generated schema and source findings are in [auth qualification](../auth-schema-qualification.md). `resolveMcpActor(verifiedClaims, requestedAccountId): Promise<Actor>` translates verified authority; it is not a raw JWT decoder.

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

**Auth qualification update:** [Pinned Better Auth schema and local probe results](../auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.

## Independent review correction (2026-10-05)

**Epic verdict: NOT-STARTED.** All three tickets (10.1, 10.2, 10.3) are unstarted. Every requirement and gate in this epic and in its ticket files is retained.

### No MCP implementation exists

Verified absent at the review SHA, repository-wide and read-only: no `tunes/server/mcp/` directory (and no `apps/api/`, the rename target this epic's paths assume), no `@modelcontextprotocol` dependency in any `package.json`, no reference to `McpServer` or `StreamableHTTP` in any tracked source file, no `oauthPrincipal.ts`, no `resolveMcpActor`, no `creatorTools.ts`, no `docs/replatform-audit/mcp-release/` directory, and no `plugins/` directory — so the proposed `plugins/explorers/` distributable does not exist. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`; research output is not an implementation receipt. This epic's prerequisites are also unmet: Epic 9 is NOT-STARTED and Milestone 3 has no evidence document, because ticket 8.5 has not started.

### `get_my_profile` ownership overlap — resolved

`get_my_profile` is claimed twice. `epic-10.md:84` lists `getMyProfile(actor)` among 10.2's interfaces and `:87` lists `get_my_profile` among the tools 10.2 implements, while `../tickets/ticket-10-1.md:49` assigns 10.1 a minimal protected `getMyProfile` read probe to qualify grant scope, current membership and revocation. The same overlap appears in `../tickets/ticket-10-2.md:33` and `:36`.

**Disposition: 10.1 owns the minimal protected probe and lands it first. 10.2 owns the full creator tool catalog and extends the already-registered `get_my_profile` tool rather than creating a second one.** A deferring sentence has been added to `../tickets/ticket-10-2.md` so a writer who reads only that file cannot re-implement the probe; the registration freeze is coordinated with the coordinator before either ticket touches it.

Both tickets' requirements for this tool are retained unchanged: `profile:read` scope, active account membership, and no implementation by a public-profile lookup. The lines above are retained as historical text; the ownership split is the correction, and it removes no requirement.

### Text duplication across epics 08–10

Ticket bodies 10.1–10.3 are triplicated verbatim at `:59-111` — once in the canonical ticket files under `../tickets/`, once here, and once in the grouped implementation document shared with Epic 9. This contradicts the principle each ticket file states, that shared contracts are maintained once in the epic rather than copied into conflicting versions, and the `get_my_profile` overlap above is an instance of the resulting drift: the correction was recorded in `ticket-10-1.md` while two other copies kept the superseded assignment.

**Recommendation (not applied in this pass):** reduce this epic file to the disposition table plus links, keeping only genuinely epic-level content (global constraints, file map, review focus). **No requirement text is deleted in this pass.** Until the coordinator designates which copy is authoritative, the canonical ticket files under `../tickets/` govern where the copies disagree.

## Individual ticket files

- [Ticket 10.1: OAuth linking and delegated principal](../tickets/ticket-10-1.md)
- [Ticket 10.2: Creator tools](../tickets/ticket-10-2.md)
- [Ticket 10.3: Publication readiness](../tickets/ticket-10-3.md)
