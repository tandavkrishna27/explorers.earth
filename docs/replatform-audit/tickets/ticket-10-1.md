# Ticket 10.1: OAuth linking and delegated principal

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-10.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 9.1, 2.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Implement delegated grant authority with scopes, consent and revocation after public discovery; recheck current external protocol first.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

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


## Independent review correction (2026-10-05)

Ticket 10.1 owns a minimal protected read probe through the existing canonical getMyProfile service to qualify grant scope, current membership and revocation. It does not wait for the broader creator tool catalog in 10.2. Freeze route/tool registration with coordinator and reuse the shared service; 10.2 expands the catalog afterward.

### Second correction pass (2026-10-05, independent review)

**Verdict: NOT-STARTED, confirmed by evidence.** Every requirement and gate above is retained. Verified absent at the review SHA: no `tunes/server/mcp/` directory (and no `apps/api/`), no `@modelcontextprotocol` dependency in any `package.json`, no `McpServer`/`StreamableHTTP` reference in any tracked source file, no `oauthPrincipal.ts`, no `resolveMcpActor`, and no `docs/replatform-audit/mcp-release/`. The only MCP-adjacent material in the tree is research output under `docs/replatform-audit/auth-qualification/`.

**`get_my_profile` ownership is resolved in 10.1's favour, for the probe only.** The paragraph above (`ticket-10-1.md:49`) gives 10.1 the minimal protected `getMyProfile` read probe, while `ticket-10-2.md:33` and `:36` — and `epic-10.md:84` and `:87` — still list `get_my_profile` among 10.2's tools. The disposition is: **10.1 owns the minimal probe; 10.2 owns the full catalog tool and the broader creator surface.** A deferring sentence has been added to `ticket-10-2.md` so ownership is unambiguous for a dispatched writer who reads only one file. Neither ticket's `get_my_profile` requirements — `profile:read` scope, active account membership, and no public-profile-lookup implementation — are relaxed by this split.
