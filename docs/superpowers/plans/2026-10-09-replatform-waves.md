# Replatform wave execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation task cards. This is the program sequence; freeze each wave's detailed cards before code changes.

**Goal:** finish qualification and canonical cutover, establish hosted web acceptance, retire the legacy runtime, then deliver ChatGPT discovery and creator tools.

**Architecture:** retain the delivered Explorers UI and canonical backend. Qualify canonical auth and the actual Music HTTP/socket composition over a shared owned database. Separate technical fixture/runtime cutover from operational retirement.

**Tech stack:** React/TypeScript, Express, PostgreSQL, Better Auth, Socket.IO, existing protected runners and immutable image workflows.

**Spec:** `2026-10-09-replatform-reconciled-sequence.md`, `../../replatform-audit/reconciliation-2026-10-09.md`, existing39 ticket requirements and `../../replatform-audit/ci-followup-2026-10-09.md`.

## Frozen starting point

Pushed source `7f9495192e3c9bc07ab5e6638063e783a864aa10`. PR121 integrated; PR119 remains draft. Database659 pass/7 skip, all28 lifecycle tests pass; all five frontend browser lanes, both Music C0 platforms, frontend required aggregate and image build/scans pass. Known `platform-fixture` ingress mismatch and dependent `music-required` remain red. No deployment or whole milestone closure is implied.

## Global constraints

- Four active slots: root coordinator plus at most three workers. At review time, use an available slot for an independent reviewer; the author cannot approve their own task.
- One owner per file. Fixture composition, suite manifests, runner capabilities, migrations and workflow changes are serialized by the coordinator.
- Each task ends with source diff, named evidence, review disposition and bounded commit. Freeze the next wave against the integrated head.
- Record exact source/environment, case identities, pass/fail/skip counts and cleanup; source review and component tests are not real-stack browser or hosted acceptance.
- Protected runs hold an exclusive source-subtree freeze. Disjoint preparation may continue outside frozen roots; shared fixture/runtime edits and protected executions are sequential even when spec writers are independent.
- Use existing guarded runners. Required fixture acknowledgement, hosted credentials, provider access and operational authority remain prerequisites for dependent runs.
- Preserve deferred analytics UI and historical route disposition, accepted exclusions, security gates and launch scope. No known-red trusted candidate.
- A blocked lane does not stop independent preparation. No automatic main merge, production promotion, cron shutdown or external publication.

## Review focus

- Held mutation responses after replacement B or fresh returning A must not alter current identity/UI or grant stale actions.
- Actual browser sign-out must revoke connected Music activity, not merely delete a session row in a test.
- Hidden media/public projections must deny unauthorized reads and invalidate public caching correctly.
- Runtime cutover must retain real Music reachability and the deferred historical analytics requirement.
- Receipts must preserve missing categories/providers and skipped cases rather than turn aggregate green into milestone closure.

## Wave0 — Freeze and dispatch cards

**Owner:** root with three read-only planners. No application edits.

- [ ] Bind current source, latest CI and delivered B1/B2 fixes to residual requirements.
- [ ] Produce exact file ownership and case/evidence cards for lifecycle, combined Music and QA preparation.
- [ ] Review dependencies and outstanding product/environment inputs. Preserve original requirement checkboxes.

**Exit:** reviewed Wave1 cards with explicit resource prerequisites. Existing reconciliation is reused, not repeated as a broad audit.

## Wave1 — Lifecycle closure and independent preparation

**Worker1, lifecycle:** `explorers-earth/e2e/replatform/lifecycle.spec.ts`, relevant lifecycle fixture contracts and requirement maps. Add deletion/deactivation/recovery completion × verified B/fresh returning A, preserving existing feedback cases. Hold committed responses and establish replacement through real auth/session plus `/me`. Fresh A after deletion/deactivation requires legitimate recovery, not direct unblock or authority fabrication. Assess remaining legacy replacement gaps before retiring protection.

**Worker2, Music preparation:** map actual canonical auth/ensure and Music HTTP/socket entry points, shared database/signing and receipt production. Freeze an implementation card for Wave2; shared fixture code is not edited concurrently with Worker1.

**Worker3, QA readiness:** inspect ticket3.5 artifact/config producers and prepare the hostname, Google redirect, storage/provider and deployment-input inventory. Preparation only; no live deployment.

Also inventory backup destination, retention, encryption and media versioning/deletion policy early. Resolve affected Games, Places, People, legal and email inputs before their acceptance gates.

Lifecycle browser owner also owns `tunes/scripts/lifecycle-browser-guards.ts` and `tunes/server/test/contracts/lifecycle-browser-support.test.ts`. Coordinator owns `suite-manifest.json`, `scripts/replatform-e2e.mjs` and protected inventory contracts: twelve existing cases plus six new cases become eighteen. Run from `tunes`: `npm run explorers:test:lifecycle-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`. This producer uses one worker/zero retries; do not invent subset/grep flags. Preserve legacy gaps/partials independently.

- [ ] Implement lifecycle cases and only source repairs demonstrated by those cases.
- [ ] Run the existing lifecycle browser runner once its owned resource/acknowledgement requirements are met; preserve failure/cleanup evidence.
- [ ] Independent review, coordinator integration and exact-head checks.

**Exit:** lifecycle completion replacement proof or a precise blocking input; reviewed combined Music task card; concrete QA readiness checklist. Relevant tickets2.4/6.4 remain open until all their evidence gates close.

## Wave2 — Combined Music and category/public qualification

**Worker1:** combined canonical browser auth + actual Music HTTP/socket composition, owner desktop/mobile, guest isolation, publication, reconnect/refresh, provider failure and live sign-out/disconnect. Reuse split proofs as inputs; do not substitute them for the combined run.

Own additions: `tunes/scripts/canonical-music-browser-fixture.ts`, `explorers-earth/e2e/replatform/music.spec.ts`, `music.playwright.config.ts` and `music.vite.config.ts` in that directory. Start canonical and Music production entry points in separate child processes over one owned migrated database with consistent private signing configuration. Existing profile Vite configuration disables Music and cannot qualify this topology unchanged. Use actual cookie-authenticated ensure, HTTP-minted socket tickets and UI sign-out; do not inject bearer authority. Keep a second same-session socket connected to prove server revocation rather than client cleanup, and test another authorized session. Disconnect is enforced on event/recheck, not promised instantly for idle sockets. Record old unbound credential expiry compatibility explicitly.

**Worker2:** retained category/public requirement map and disjoint specs. Cover Places/place-links/Guides, media visibility, owner isolation, traversal, reserved handles and cache invalidation using existing tests where available. Resolve impossible duplicate-position requirements against actual uniqueness constraints without dropping pagination proof.

**Worker3:** QA artifact producer implementation/readiness in disjoint deployment files, plus explicit product/provider dispositions.

- [ ] Root serializes all fixture/runner/manifest registration and protected receipt scopes.
- [ ] Execute supported owned local qualification, review gaps and bind evidence to one integrated source.

**Exit:** combined runtime and retained category/public qualification ready for technical cutover. Outstanding provider/product inputs are named, not silently excluded. Tickets6.2/6.3/7.1/7.3 gain only the proofs actually executed.

## Wave3 — Coordinated technical runtime/fixture cutover

**Single implementation owner:** runtime startup/healthchecks, Compose topology, fixture ingress and matching deployment contracts. **Second slot:** independent review. **Third:** disjoint QA readiness.

- [ ] Preserve canonical auth and real Music HTTP/socket reachability and deferred historical analytics disposition.
- [ ] Align probes and actual compositions; retain production rejection of fixture authority.
- [ ] Run required route/runtime checks and exact-head CI.

**Exit:** canonical topology qualified and both required aggregates green. This is technical cutover, not operational Strapi shutdown. If it cannot preserve retained behavior, stop that package for the specific scope decision.

## Wave4 — Trusted candidate and hosted acceptance

- [ ] Bind exact green source, image/schema and evidence producers to the candidate.
- [ ] Deploy only to the authorized QA environment with actual configured inputs.
- [ ] Run hosted Google/storage, Books and required provider smokes, retained category/Music/lifecycle flows and analytics producer attestation.
- [ ] Independent evidence review closes applicable3.5/7.3 gates or records specific failures.

**Parallelism:** disjoint scenario authors may prepare in parallel; deployment and shared evidence environment have one operator.

**Exit:** actual hosted milestone acceptance, with launch dispositions for IGDB, Places taxonomy/pinning, People sectors, legal values and email delivery where required. Detailed analytics dashboard remains deferred.

## Wave5 — Operational retirement, removal and rename

- [ ] Satisfy lifecycle absence-proof authority and historical analytics route disposition; record reconciliation cron disablement before workflow removal.
- [ ] Prove no retained operational Strapi dependency with denied outbound boot and real identity/media/Music checks.
- [ ] Inspect packaged graph, then remove duplicate frontend atomically (8.2).
- [ ] Rename backend paths/scripts/images/contracts together (8.3), after retirement/removal.

**Parallelism:** read-only audits can overlap. Retirement, frontend removal and rename mutations are sequential, each independently reviewed.

**Exit:** qualified retired/renamed production graph; no fabricated absence or automatic production operation. Tickets8.1–8.3 closed only with their complete evidence.

## Wave6 — Recovery and final web acceptance

- [ ] Replace synthetic release identities with actual immutable image/evidence bindings (8.4).
- [ ] Build a new post-rename candidate with required CI and QA against its exact artifacts; Wave4 evidence cannot qualify the changed tree.
- [ ] Execute authorized backup/restore and failed-promotion recovery; verify identity/media/Music at that candidate (8.5).
- [ ] Final web QA and independent release review; main merge/promotion is a separate concrete decision.

**Exit:** web release and recovery acceptance. No adapters launch before their retained release prerequisites.

## Wave7 — ChatGPT discovery and creator tools

- [ ] Deliver9.1 public adapter after Wave6.
- [ ] Prepare9.2 discovery/quality and10.1 delegated linking independently; serialize shared registrations. Ticket10.1 owns the minimal profile probe.
- [ ] Deliver10.2 creator catalog extending10.1.
- [ ] Deliver10.3 actual-client/publication qualification after9.2 and10.2. External submission remains separate authorization.

**Exit:** epics9/10 accepted against their actual client/protocol requirements, verified against current official specifications at implementation time.

## Reporting and wave exit

After each wave, report delivered tasks, exact evidence, residual requirements, inputs and the next frozen wave. Do not convert source completion into ticket acceptance. A failed lane returns to its author for a bounded diagnosed repair, then a fresh reviewer; root alone integrates shared state and watches exact-head CI.

## Planning review

Three read-only subagents reviewed lifecycle scope, combined Music composition and wave dependencies. Their corrections are incorporated above. They performed no runtime execution. Wave0 planning is prepared; detailed implementation cards/source freeze and runtime prerequisites remain the first execution step.
