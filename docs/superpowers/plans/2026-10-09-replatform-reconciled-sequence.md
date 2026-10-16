# Replatform reconciled sequence implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development when delegation is explicitly chosen. Execute one bounded package at a time; each ends with evidence and review.

**Goal:** finish unified web qualification and retirement from the actual integrated and pending state, then deliver ChatGPT discovery and creator tools.

**Architecture:** retain Explorers UI and evolve Tunes into the unified backend. Canonical identity and Music presently span two runtime compositions; acceptance must exercise both real entry points over one database. Final topology is decided through the existing production and recovery tickets, not inferred from a fixture.

**Tech stack:** React/TypeScript, Express, PostgreSQL, Better Auth Google identity, Socket.IO, existing guarded migration/fixture runners.

**Spec:** `docs/replatform-audit/revised-direction.md`, existing 39 ticket requirements, and `docs/replatform-audit/reconciliation-2026-10-09.md`.

## Global constraints

- PR #119 remains the integration branch for all ten epics; no incremental main merge or production deployment follows from this plan.
- Preserve implemented UI and accepted exclusions. No new AI, claim flow, password auth, or detailed analytics port.
- Use append-only registered migrations and actual runtime role attestation. Shared frontend contracts use `zod/v3` and require Docker import-closure registration.
- A receipt records exact SHA, source cleanliness, environment, identities, attempts, cleanup and conclusion. Never sum runs at different freezes or claim fixtures as live-provider acceptance.
- Accepted route-fixture red stays visible until coordinated cutover; no probe deletion or green-by-skip remedy.
- This planning task does not dispatch paid/live browser lanes, mutate databases, merge PRs, push, or deploy. Execution checks belong to the packages below.

## Review focus

- Auth reset while a Music socket is connected: prove socket revocation and denial of subsequent activity.
- Hidden/unpublished attachments: deny bytes to anonymous and other-owner requests, while the owner remains authorized.
- Canonical Music owner deletion: release venue/content, retain retirement fences, and complete deletion without granting ordinary code arbitrary deletion authority.
- Truncated analytics buckets and incompatible legacy authority: preserve intentional unavailable UI; never interpret unavailable as zero traffic.
- Real runtime wiring and workflow base filters: tests must reach production entry points, and pending branch results cannot replace integration/hosted qualification.

## Task 1: Consolidate the existing pending package

**Files:** review PR #121 changes to `docs/replatform-audit/`, `tunes/server/test/`, `.github/workflows/test.yml`, shared media helpers, auth/logout and retired modules. Consume the reconciliation's two SHAs; produce one integration SHA plus exact checks/evidence inventory.

- [ ] Freeze PR #121 head and compare all 102 commits/diff to integration; inspect review feedback, required checks and the recorded known-red decision. Do not cherry-pick a subset of interdependent fixture/migration gates.
- [ ] Verify named receipts in the package (Google callback, canonical identity/deletion, media visibility), their source hashes and environment. Record any receipt whose evidence is unavailable as pending, not passed.
- [ ] Prepare the package for integration with the reconciliation documents. Rebase/merge only under the user's integration authorization; no force-push/shared index staging.
- [ ] After integration, inspect full frontend/image/Music checks on the exact integration SHA. Expected: no unexpected failures; `platform-fixture`/`music-required` may retain the explicitly accepted route mismatch. A different failure needs diagnosis.

This is the first package. Do not reimplement its media, logout, Google receipt, Movies/Places tests or retirement cleanup.

## Governing execution order after independent audit

The task sections define work scopes, not an instruction to execute their original numeric order. This dependency order supersedes it:

| Order | Package | Exit / handoff |
|---|---|---|
| A | Review/integrate existing PR #121 | Frozen integrated source and exact checks; accepted red disclosed. |
| B | Residual requirement/receipt and ADR reconciliation | L19 and legacy gaps assigned; 6.4 record/nonreuse resolved or named blocker; no duplicate feature work. |
| C | Local canonical lifecycle + combined Music + category/public qualification | Production compositions over shared database, exact local receipts; no hosted milestone claim. |
| Parallel Q1 | QA workflow/config/artifact preparation | Prepared producers and actual external inputs; cannot produce a trusted candidate yet. |
| D | Coordinated runtime/fixture cutover preparation and authorized execution | Real Music remains reachable; canonical ingress/probes and exact required CI succeed. Not operational Strapi shutdown. |
| E | Trusted candidate → hosted QA/provider runs → 7.3 hosted closure | Ticket 3.5 producer requirements unchanged; no candidate from known-red source. |
| F | Operational retirement + duplicate frontend removal + backend rename | Cron/config/absence-proof/historical-route authorities satisfied; packaged graph qualified. |
| G | Recovery-qualified final candidate + final QA/web acceptance | 8.4 promotion joined to exact 8.5 restore evidence, then separately authorized main merge/promotion. |
| H | Public discovery → quality → delegated linking → creator catalog → publication readiness | Existing 9/10 release gates retained; minimal profile probe already assigned to 10.1. |

Task 5 must be split: its coordinated technical cutover subpackage is D; irreversible operational retirement is F. Task 4 preparation runs early, but trusted publication/deployment is E. Ticket 8.1's original post-7.3 retirement gate remains binding for F. Do not weaken it to manufacture an acyclic graph. If technical D cannot preserve deferred historical analytics and the separately needed Music runtime without operational retirement, D is genuinely blocked pending that bounded scope/authority decision. Accepted red does not authorize changing protection or candidate eligibility.

## Task 2: Close requirement and evidence maps before new code

**Files:** `docs/replatform-audit/tickets/`, `lifecycle-requirement-receipt-map.md`, `lifecycle-legacy-retirement-map.md`, `ticket-index.md`, `execution-packages.json`, `explorers-earth/e2e/replatform/suite-manifest.json`, `scripts/replatform-e2e.mjs`.

**Interfaces:** consume integrated SHA from Task 1. Produce a requirement-to-code/test/receipt/disposition map for residual tickets, with frozen source references and named acceptance owners. A map records requirements without rewriting acceptance checkboxes.

- [ ] Reconcile every remaining requirement in 2.4, 3.1/3.2, 6.2/6.3/6.4 and 7.1 against current tests and receipts. Preserve combined real-stack browser deviations until accepted or closed.
- [ ] Validate 6.4's ADR/retirement record and actual terminal-maintenance test, including numeric identity reuse denial. If missing, make that one bounded repair the next task.
- [ ] Correct L19 to feedback-only A→B/A proof; assign held deletion, deactivation and recovery completion cases. Reconcile legacy gaps independently of the map's authored-assertion terminology.
- [ ] Record 6.4's existing account-operation retirement design in ADR-008 and retain the separate numeric-ID reuse obligation. Reuse the delivered finalization proof; do not add Strapi tombstones just to satisfy stale ADR prose.
- [ ] Re-measure the legacy lifecycle map's two gaps/five partials; preserve the unresolved-authority fail-closed case before any suite removal.
- [ ] Enumerate actual manifest identities/runner modes and existing named commands. Plan missing category lanes using existing guards; do not invent generic milestone flags or simply edit pending to passed.
- [ ] Distinguish planned protected/coordinator lanes from nightly discovery and from provider smokes. Confirm branch-filter coverage and decide the minimum hosted run allocation before changing workflow triggers.

No full-ticket acceptance is granted simply because a test file exists. This task determines the exact residual changes in Task 3.

## Task 3: Finish combined web qualification

**Files:** category fixtures/specs under `explorers-earth/e2e/replatform/`, `suite-manifest.json`, `scripts/replatform-e2e.mjs`, relevant fixture composition, Music owner/public specs and existing lifecycle/visibility integration tests.

**Interfaces:** consume Task 2 identity map. Produce protected receipt-producing lanes and a complete web milestone evidence set at one named committed SHA.

- [ ] Build the missing combined canonical Music browser fixture with canonical auth/ensure and the real Music HTTP/socket server, over one owned disposable database and shared token configuration. Use production entry points rather than injecting the socket minter.
- [ ] Qualify owner desktop/mobile, guest/owner isolation, reconnect, refresh, provider failure and publication. During a connected session, logout/suspension/deletion must revoke authority. Preserve existing browser/real-stack proofs as inputs, not aggregate substitutes.
- [ ] Exercise actual Better Auth sign-out with a live socket; the pending test's direct session deletion/recheck is only an input. Pin the deliberate preexisting credential compatibility until expiry and clarify whether its launch disposition is accepted.
- [ ] Register and execute missing Places/place-links and retained category obligations from Task 2. Reconcile scraper-era expectations to retained behavior without dropping required positives.
- [ ] Qualify full public traversal: 53-item duplicate-order pagination, visibility matrix, unpublish ETag invalidation, same slug under different owners, reserved handles, pin routes, and Music visibility. Reuse PR #121 tests where they already prove a requirement.
- [ ] Promote lifecycle/analytics/category evidence through supported receipt-producing runners. Analytics **producer attestation** remains in scope; deferred dashboard port does not. Acquire explicit fixture acknowledgement and hosted run authority where the runner/ticket requires it.
- [ ] Attach exact hosted evidence for tickets 2.4/3.3/7.3 and retain required legacy protection until replacements gate merges. If hosted infrastructure is absent, proceed to Task 4 preparation; record the run as blocked, not completed.

## Task 4: Prepare and qualify QA infrastructure

**Files:** ticket 3.5's named deployment/evidence workflows; existing `deploy/` topology, immutable image contracts, QA routing and environment validation.

**Interfaces:** consume Task 3 candidates and immutable image metadata. Produce hosted QA at a named SHA with evidence-producing workflows, plus real-provider qualification.

- [ ] Establish actual QA hostname/access, Google redirect configuration, storage and provider credentials, image identities and deployment authority. Secret names alone do not close this gate.
- [ ] Implement/verify the ticket's artifact producers and exact image/schema binding; use existing immutable build/promotion controls.
- [ ] Deploy to authorized QA, run retained web flows and required live-provider smokes, and save receipts. Books static proof does not replace hosted proof; Movies fixture does not replace TMDB smoke.

Preparation may overlap Task 3; its final acceptance cannot precede the actual hosted run. Credentials/environment are external inputs, not new application designs.

## Task 5: Complete Strapi retirement and runtime cutover

**Files:** `docker-compose.yml`, `docker-compose.replatform.yml`, runtime mode/startup and healthchecks, `music-deployment-files.test.ts`, historical analytics route, `strapiIdentityAbsenceProof`, `music-reconcile.yml`, remaining Apollo cache plumbing and compatibility documents.

**Interfaces:** consume qualified feature evidence and explicit retirement authority. Produce canonical production/fixture graph, zero retained operational Strapi dependency and denied-outbound boot receipt.

- [ ] Resolve the historical events endpoint's disposition while keeping the deferred analytics UI unchanged. The owner chose to defer its port and retain the route; deleting/tombstoning it needs a specific new decision. Until then mark zero-Strapi retirement blocked.
- [ ] Obtain lifecycle absence-proof retirement authority and preserve fail-closed deletion semantics. No token/config absence may be treated as evidence that an external identity is absent.
- [ ] Disable and record reconciliation cron before deleting the workflow; revise actual required compose declarations only. Confirm classification at the current SHA.
- [ ] Execute coordinated runtime/fixture/topology cutover, update pinned deployment contracts and healthchecks, and retain valid canonical probes plus production rejection of fixture authority. Account for how Music HTTP/socket composition remains reachable.
- [ ] Delete only compatibility code unreachable in every shipped entry point. PR #121 already removes dead documents/modules; inspect surviving scanner/fixture contracts before more deletion. Remove Apollo cache plumbing with appropriate session reset behavior preserved.
- [ ] Boot with outbound Strapi denied and no Strapi credentials, then run route/identity/media/Music checks. This receipt, not an import count, closes retirement.

## Task 6: Remove duplicate frontend, rename and qualify recovery

**Files:** Tunes frontend build/serve wiring, package/workflow/Docker paths, `deploy/`, ticket 8.4 verifier and ticket 8.5 recovery artifacts.

**Interfaces:** consume Task 5 canonical graph; produce final immutable topology and recovery-qualified release candidate.

- [ ] Inspect packaged image and production graph, then remove duplicate frontend build/serve wiring atomically (8.2). Existing coverage rehoming is an input, not work to repeat.
- [ ] Perform mechanical backend rename (8.3) after retirement/removal; update imports, scripts, Docker contexts, workflow and deployment references together.
- [ ] Replace synthetic/placeholder evidence in 8.4 with real immutable identities. Join promotion authority to the exact 8.5 evidence.
- [ ] Execute authorized backup/restore and recovery drill; verify identity, media and Music state plus failed-promotion recovery at the same release candidate. Preserve receipts and source/image/schema bindings.
- [ ] Run final web acceptance and review PR #119 for main merge/promotion. Known-red acceptance is not a release claim and must be reconciled with actual branch protection authority.

## Task 7: Product residuals and ChatGPT follow-up

Product residuals can be prepared while Tasks 3–6 wait on external inputs, but their launch dispositions must be explicit: Games IGDB/provider scope, Places taxonomy/sector browse (D3), per-place pinning (D5), remaining legal values, Resend unsubscribe/webhook live delivery and beta request cap verification. Instagram launch exclusion is settled; deleting any remaining reachable broken surface needs its own bounded package. Password redirects remain for one release; record a release marker before their eventual removal.

Also retain People sector/category browse (`person_category` currently null) and its separately scoped suppression administration. Games provider code exists: plan activation/wiring/qualification, not a rebuild. The minimal `get_my_profile` probe ownership is already settled in ticket 10.1; 10.2 extends it, not a second registration. Ticket 9.1's proposed technical prerequisite change from 8.5 to 7.3 remains a proposal; no release gate is changed here. Ticket 9.2 consumes analytics producer evidence, not the deferred detailed dashboard port.

After ticket 8.5 acceptance:9.1 public MCP adapter/tools, then9.2 discovery quality and10.1 OAuth linking may prepare independently with serialized shared edits;10.2 follows10.1, and10.3 joins9.2 plus10.2. Ownership is settled:10.1 provides the minimal protected profile probe,10.2 extends it. Revalidate official protocols at implementation time. External directory submission remains separately authorized.

## Dispatch and stopping rules

Immediately actionable: review PR #121 and prepare Task 2 exact residual maps; QA configuration/artifact preparation can proceed without live deployment. Do not start a broad media/analytics/Music rebuild. If evidence is absent, investigate that specific receipt or requirement; do not invent absence from a filename mismatch.

Stop dependent execution for missing hosted/provider credentials, required fixture acknowledgement, retirement authority, or unresolved product disposition. Continue independent documentation/QA preparation. No code changes or operational runs were performed by this planning reconciliation.
