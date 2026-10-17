# Replatform recovery and re-groomed execution plan

> **Sequencing superseded 2026-10-09:** Read [the reconciled sequence](2026-10-09-replatform-reconciled-sequence.md) and [the status reconciliation](../../replatform-audit/reconciliation-2026-10-09.md). This plan remains historical; its requirements are not waived.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Every new delegated assignment uses a fresh agent. Checkboxes are requirements, not execution receipts.

**Goal:** Resume the existing migration backlog with verified prerequisites, preserved acceptance requirements and independently deliverable packages.

**Architecture:** Keep the canonical cookie/account backend and existing Explorers UI. Close shared navigation and lifecycle acceptance separately from missing category and Music production consumers. Retain all 38 tickets and their product contracts; sequence work by actual interfaces rather than epic number alone.

**Tech Stack:** Existing React/TypeScript, Better Auth, PostgreSQL 15, Vitest/Playwright, supported Node 24.21.0 and existing hosted checks.

**Spec:** [Agreed direction](../../replatform-audit/revised-direction.md), [migration reconciliation](../../replatform-audit/migration-gap-audit-2026-10-05/README.md), all [ticket contracts](../../replatform-audit/ticket-index.md), and the [durable ledger](../../../.superpowers/sdd/epic-01/progress.md).

## Global constraints

- Work only in the preserved integration worktree on `codex/unified-replatform`; the **application** base is `1a5c6942bcf2ef59196d5d974ef5a2eea1a25a97` and the **branch head is `225d83e5`** (a docs-only child: 117 files, +35,049 / −1). Corrected 2026-10-05: `225d83e5` triggered its own hosted run, so it — not 1a5c — is the SHA whose results bind current state. Dirty navigation/lifecycle overlays have separate hashes and receipts, and are **not** committed scope.
- Preserve the seven protected unrelated artifacts and retained `music-c10-qualification-2f57782-pg15` on port 51642. Assign each new disposable resource exclusively; no shared reset or name-based cleanup.
- Retain security, strict containment, revision/idempotency, session-generation and owned-cleanup gates. No skipped positives, fabricated canonical-to-Strapi authority, relaxed timeouts or until-green full runs.
- No further CI sharding/infrastructure expansion. No merge, QA deployment, production deployment or publication without its separate authorized decision.
- Distinguish implementation, local fixture tests, canonical real-backend qualification, independent review, committed/pushed source and exact-SHA hosted proof. These states are not interchangeable.
- Strapi source remains pinned at `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`. Source/schema access does not supply live legal/reference values or provider/QA permissions.

## Review focus

1. A canonical account UUID must never become a legacy user subject or browser bearer proof. Music Task C owns the startup regression.
2. A late response after logout, A→B or A→B→A must not publish authority or replay a write. Tasks A–C retain genuine new-session tests.
3. Missing category producers must remain explicit failed/blocked positives, not fake zero counts or fixture-only parity. Task D owns per-category closure.
4. A successful deletion/recovery with a lost response must not be replayed blindly. Task B owns persisted-state observation and secrecy.
5. Receipt custody must include actual source, runtime, dependency topology, discovery and cleanup; Task A and every subsequent handoff own this gate.

## Completed tickets remain complete

Tickets **1.1–1.4 and2.1–2.3 are complete** under their recorded acceptance. See the [checked status summary](../../replatform-audit/current-status-2026-10-05.md). Existing Books/Movies/manualGames/analytics delivered slices remain inputs to this recovery plan. New repair gates do not reset prior accepted work.

## Verified checkpoint and limits

Corrected 2026-10-05 against an independent read-only review at `225d83e5`. Three rows previously overstated their evidence: a summed count presented as one run, and two dirty-overlay receipts presented as frozen committed scope.

| Evidence | Actual result | Does not establish |
|---|---|---|
| Exact 1a5c image/C0 hosted — **historical** | Success; native unit 3382 pass/19 skip, integration 463 pass/68 skip; required C8/build/scans pass. **Superseded as a current-state claim**: the head `225d83e5` has its own results (below), and at 1a5c both protected aggregates were red (Backend FAILURE 37301051901, Explorers FAILURE 37301051889) | New dirty navigation source, clean full repository types, provider parity, release readiness. **Image and C0 are not protected required contexts**, so their success never satisfies `replatform-required` or `music-required` |
| Current head `225d83e5` hosted | API image **SUCCESS**; Music C0 contracts **SUCCESS**; Backend validation **FAILURE** (`music-required` FAILURE, `browser` FAILURE); Explorers validation: E2E Category A **FAILURE**, Category B **FAILURE**, Publishing **FAILURE**, Public shell SUCCESS, Music-and-account still running so `replatform-required` had **not concluded** | Any merge, QA-deployment or release decision. Both protected aggregates are red or unconcluded. Note `music-required` is emitted by `test.yml:300` ("Backend validation"), **not** by the green "Music C0 contracts" workflow |
| Canonical profile/navigation — **dirty source** | 6 pass, zero retries/skips, but qualified against the **uncommitted overlay** (`dirty:true`) and with **no independent review** at all. Not a frozen committed receipt | Full 88 cases, committed scope, or hosted repaired source. 88 is the **working-tree** manifest total; the committed manifest is **82** |
| Lifecycle — **dirty source** | 12 pass, zero retries/skips, independent receipt review pass — but run against the **uncommitted overlay** (`dirty:true`). Committed scope is **10** cases (`tunes/scripts/lifecycle-browser-guards.ts:1-12`); cases 11-12 exist only in the working tree | All original 18 lifecycle plus 3 recovery behaviors. It also does not establish 12 as delivered scope — 2 of the 12 are pending overlay. The frozen 18+3 map this plan treats as a prerequisite **does not exist in source** |
| Contained route regressions — **never run as claimed** | The former "18 pass" has **no run behind it**. The only receipts are **8 PASS** (`.superpowers/sdd/epic-01/navigation-fault-reconciliation.md:17`) and **10 PASS** (`.superpowers/sdd/epic-01/category-b-preference-reconciliation.md:7`), recorded at **two different source freezes**; 8 + 10 was summed into "18". The spec `explorers-earth/e2e/setup/category-navigation-route.test.ts` is **untracked** | Any 18-case result, backend persistence, or production Music/category parity. Until that spec is tracked and one run covers all cases at a single freeze, no aggregate route-regression count may be cited |
| Original Category B | One full run: 17 pass, 9 fail, zero retries/skips | All-category acceptance; 19 required unit positives are a separate inventory |
| Original publishing probe | One 1280px case fails before dashboard request | Universal Music failure cause or a write-assertion-only repair |

Seven Category B failures first reach legacy private GraphQL consumers; two first reach unsupported pin eligibility. The Music probe and source identify absent coordinator startup plus the obsolete Strapi-proof dependency. Preserve originals and attribute each failure to its owning production prerequisite. Historical Windows full-unit noncompletion has no established root cause and is not explained by these browser findings.

**Counting rule (corrected 2026-10-05).** The committed suite manifest is **82 identities in six lanes**: auth 6, profile 2, books 20, lifecycle 10, movies 24, games 20. Books 20, Movies 24 and Games 20 are **lanes inside that 82**, never addends to it, and 82 is **not** a Games-lane count. The working tree's manifest totals **88** (profile 6, lifecycle 12); 82 and 88 are two custody states of one file and must never be added. Receipts taken at different source freezes must never be summed into a single result. See the [checked status summary](../../replatform-audit/current-status-2026-10-05.md) for the full count custody and hosted-conclusion tables, including the previously undisclosed `46eea549` state (3 of 4 red, API image FAILURE 37265897012 included).

## Task A: Finish current repair review and source-bound handoff

**Files:** Existing inventories in the canonical-navigation, lifecycle and image checkpoint plans; `e2e/setup/native-navigation-content-fixture.ts`, `category-navigation-route.test.ts`, `books-owner-content.ts`, `category-navigation.ts`, `category-navigation-b.spec.ts`; controller-owned evidence and ledger. No unrelated files.

**Consumes:** Exact dirty file hashes, existing 6/12 receipts, retained behavioral map and existing hosted failures. **Produces:** Reviewed source inventory, preserved assertion mapping, per-scope acceptance disposition and exact-SHA hosted report after authorized push.

**Corrected 2026-10-05.** The 6 and 12 receipts Task A consumes are **dirty-overlay** receipts (`dirty:true`), not committed scope: committed lifecycle is 10 and the navigation 6 has **no independent review**. `category-navigation-route.test.ts` in the Files list above is **untracked**, and the subtree-wide freeze (`scripts/replatform-e2e.mjs:112,117`) fails on any untracked file in a freeze root — so it must be tracked before any lane runs and contributes to no qualified aggregate until it is. Task A must also reconcile the overlay's fixture conversion: `e2e/setup/category-navigation.ts:407` now denies `SettingsAccount|PublicCategoryListCounts|CheckPublishedLists|UpdateTabVisibility`, while unmodified `e2e/category-navigation-a.spec.ts:478` and `e2e/music-publish-controls.spec.ts:85,139,265` still assert exactly those operations — migrate both specs in the same commit or gate the throw per-spec, or Category A and Publishing are simply converted to a new failure mode.

- [ ] Obtain a fresh whole-package review against existing plans, native snapshot allocation negatives, exact inert auth persistence assertion and genuine session-generation tests. Platform dispatch failure is a review blocker, never a substitute pass.
- [ ] Inventory A/B/Publishing assertion changes by actual endpoint. Preserve ordered test identities and required category/Music positives; add no successful mock producer for unavailable production behavior.
- [ ] Re-run only affected meaningful regressions on a new source freeze when edits require it; retain original failure and proven cleanup. Do not re-run unchanged full Category B.
- [ ] Commit only reviewed exact files and evidence. Push the non-deploying branch and record actual required hosted conclusions for that SHA; a required red lane remains red. Do not wait for future parity before making the reviewed delivered slice inspectable, and do not label a red required lane delivery-ready.

## Task B: Close remaining canonical lifecycle acceptance

**Files:** `explorers-earth/e2e/replatform/lifecycle.spec.ts`, existing guarded lifecycle fixtures, `tunes/scripts/lifecycle-browser-support.ts`, their negative contracts and protected manifest/registry as an atomic package. Any Settings edit requires controller handoff after diagnosis.

**Consumes:** [Lifecycle map](../../replatform-audit/migration-gap-audit-2026-10-05/lifecycle-acceptance-map.md), original 18+3 requirements and accepted 12 receipt. **Produces:** An invariant-by-invariant canonical replacement map and non-skipped real-backend evidence; no CI retirement until all retained equivalents are reviewed.

- [ ] Add meaningful held deletion/deactivation/recovery completion cases with B and genuinely reverified A sessions (L1/L2), separate from passing feedback-only cases.
- [ ] Prove successful recovery response loss is observed without proof replay (L3/L11); precommit failure preserves persisted state and allows explicit safe retry (L7/L9).
- [ ] Prove purpose-only pending recovery survives reload/independent tab without persisting/logging proofs (L8/L10). Resolve the typed manual-review UI contract against current service before implementing L15.
- [ ] Preserve Music 45/accessibility 12 obligations separately. Update exact discovery/registry and artifact-negative contracts before one protected real-backend qualification; review cleanup and secret-free failure diagnostics.

## Task C: Advance 6.1 canonical Music startup ahead of publishing acceptance

**Files:** Ticket 6.1 existing backend principal/identity/socket/mapping/lifecycle files; frontend `src/features/music/musicApi.ts`, `musicIdentityCoordinator.ts`, `musicSessionBoundary.ts`, `src/lib/localTunesApiClient.ts`, `musicCredentialStore.ts`, `src/components/AuthSyncManager.tsx`, `src/hooks/useTunesDashboard.ts` and focused tests. Shared auth/client/route/schema edits are controller serialized.

**Consumes:** `Actor` and current web session from 2.2; 6.1's `ensureMusicAccount(actor)` and purpose-limited 60-second socket handshake contract. **Produces:** Session HTTP owner startup, generation-safe reconciliation and memory-only socket handshake issuance. No general HTTP bearer, legacy token restoration or OAuth session fabrication.

**BLOCKING PREFLIGHT — architecture supersession (added 2026-10-05).** Task C must not be dispatched until this clears. It is a gate, not advice.

- [ ] **Supersede ADR-005 with ADR-006 before any 6.1 writer is dispatched.** `docs/adr/005-music-identity-migration-deployment-authority.md` is still `Status: Accepted` (`:3-4`) and its Decision (`:16-20`) ratifies exactly the design 6.1 exists to delete: Explorer authentication verified "only at the bodyless `POST /api/music/identity/ensure` boundary", returning a short-lived Music credential that canonical owner routes exclusively accept. `docs/adr/` holds 001–005 plus README; **no ADR-006 exists** as of 2026-10-05. A writer following current ADR authority would rebuild the proof exchange. A draft ADR-006 in `Proposed` status does **not** clear this gate — ADR-005 must be explicitly marked superseded and ADR-006 accepted by the architecture authority.
- [ ] Record in the handoff that `ensureMusicAccount` **does not exist in source** (only a ledger note), that `tunes/server/music/canonicalMusicPrincipal.ts:13-16` is SELECT-only and self-documents provisioning as belonging to 6.1, and that every `INSERT INTO account_music_identity` is a test fixture — so a real new owner can never obtain a mapping row. Do **not** mint a fixture proof to close this.
- [ ] Record that the socket handshake is **not** purpose-limited and **not** 60s today: it reuses the general 600s HTTP bearer (`musicTokenService.ts:127-128`, `musicSocketServer.ts:278`), so a leaked socket ticket is a 10-minute HTTP bearer. Separate purpose and audience in this package rather than documenting the 60s contract as already held.

- [ ] Trace actual canonical app composition to existing Music principal and mapping services; list missing route wiring versus absent implementation before choosing changes. Reserve append-only migration IDs centrally if required; existing SQL history stays immutable.
- [ ] Add a failing startup regression: `acceptVerified` with token null must initialize the correct Music owner via session HTTP without Strapi configuration or calls. Wrong/ambiguous/foreign/suspended owner must issue no credential or workspace data.
- [ ] Add delayed startup/logout/A→B/verified ABA, concurrent provisioning, session revocation, expired/wrong-audience handshake and per-event socket authorization regressions. Preserve single-flight and cancellation invariants.
- [ ] Implement the existing 6.1 contract at its source; explicitly connect production AuthSyncManager startup. Do not retain the obsolete proof exchange behind a fixture shortcut.
- [ ] Run focused coordinator/client/startup and backend principal/migration/runtime-role tests, then independently review and qualify real HTTP/socket startup. Publishing transactions still require 6.2/6.3 behavior; 6.1 alone is not Music parity.

## Task D: Prepare independent remaining-category packages

**Files:** Each category owns the exact feature subtree, category-specific backend module/tests and real-backend spec in its ticket. Shared `explorersContract.ts`, schema, routes, navigation content reader, public registry, migrations, seeds and protected manifests belong to the controller.

**Consumes:** Frozen shared recommendation/collection/media contracts from 3.1/3.2 and the current native Books/Movies/Games pattern. **Produces:** One complete category at a time: typed field map, actual owner/public consumers, eligible publication/pins, persistence and real-backend browser proof.

- [ ] Prepare 4.3 Apps and 4.4 Products first as independent packages; prepare 4.5 People and 5.1 Places in the next capacity window. Validate source fields and commands before dispatch; generic title-only entity details are insufficient.
- [ ] Each package reproduces its original Category B consumer boundary, then closes manual create/edit/reload, metadata/null handling, list order/pins, publication/privacy, media bytes, pagination, foreign ownership and generation fencing. Existing ticket-specific field tests remain required.
- [ ] Hand off reviewed category query/DTO/eligibility contracts to the controller, who extends canonicalNavigationContent and public registration without simultaneous writers. Run that category's original positive case, related navigation invariants and its real-backend spec.
- [ ] 5.2 waits for Products/People/Places attachment contracts; 5.3 waits for Places and its own typed parent/section aggregate; 5.4 waits for reviewed Places claim eligibility/media. Do not flatten Guides to ordinary rows or fake map/provider success.
- [ ] Complete remaining Games provider 4.2 separately; manual Games acceptance does not cover IGDB/search/taxonomy. Provider access blockers remain explicit.

## Task E: Resume analytics, QA and full parity in dependency order

**Files:** Existing 3.4/3.5/7.1/7.2/7.3 ticket inventories and evidence; no second deployment pipeline.

- [ ] Preserve 3.4 event foundation evidence. Prepare 7.2 dashboard cookie-authority conversion and reference-content inventory independently where shared files do not collide; full category breakdown requires landed category contracts. Missing actual legal/localized content is an input blocker.
- [ ] 3.5 can prepare nonsecret readiness and verify immutable artifacts now; actual QA deployment awaits its separate decision and qualified prerequisites. Milestone-1 selected feature acceptance does not require absent future categories, but existing mandatory hosted jobs remain unchanged and failures remain visible.
- [ ] Advance 6.2 then 6.3 using reviewed 6.1, and 7.1/7.2 full parity using all category producers. Run retained Music/public/analytics/privacy behaviors with real backend rather than globally converting GraphQL tests to mocks.
- [ ] 7.3 consumes complete per-ticket evidence and all required hosted gates. Only then consider 8.x retirement/rename/recovery and later 9.x/10.x ChatGPT work. No released, milestone-complete or full-parity claim from a delivered slice.

## Blocking preflights

Added 2026-10-05. **No package is dispatch-ready until its preflights clear.** These are requirements, not receipts; none is satisfied as written.

- [x] **Supersede ADR-005 with an accepted ADR-006.** Blocks 6.1 / Task C. **CLEARED 2026-10-05** — ADR-006 is `Accepted` and says 6.1 is unblocked by it; 007 and 008 followed on 2026-10-06. The rest of this item describes the pre-acceptance state and is kept only as the reason the preflight existed. ADR-005 is `Status: Accepted` (`docs/adr/005-music-identity-migration-deployment-authority.md:3-4`) and its Decision (`:16-20`) mandates the bodyless `POST /api/music/identity/ensure` proof exchange that 6.1 must delete. `docs/adr/` holds 001–005 + README; no ADR-006 exists. A `Proposed` draft does not clear this.
- [ ] **Withdraw the CORE-REPLACE producer package** and correct the 11 dependency edges and `ticket-3-1.md:66` that carry its false absence. Replace with a verification item, the foreign-owner and unchanged-other-creator negatives, and UI adoption. *(Those two files are separately owned; this plan's own text is corrected.)*
- [ ] **Reserve the shared runner, manifest and fixture files to the coordinator** — `scripts/replatform-e2e.mjs`, `explorers-earth/e2e/replatform/suite-manifest.json`, `tunes/scripts/*-browser-fixture.ts` — and delete the conflicting manifest-ownership clauses so exactly one document owns the manifest.
- [ ] **State and enforce the freeze as repo-subtree-wide:** implementation may overlap, protected qualification takes an exclusive window, and every new file must be tracked before any lane runs.
- [ ] **Produce the 18+3 lifecycle map** before any 2.4 writer dispatch. It does not exist in source today, so "bounded slice" currently has no denominator and no residual-work estimate is auditable. Name `GET /api/explorers/v1/recovery/status` as the existing observation authority and scope L0 to the typed union plus the manual-review DTO.
- [ ] **Restate the three fabricated or overlay counts** (the never-run route-regression 18, "Games canonical 82", lifecycle 12) and **disclose `46eea549`'s hosted conclusions** including the API image failure. *(Done in this plan's "Verified checkpoint and limits" and in the [status summary](../../replatform-audit/current-status-2026-10-05.md); keep it corrected wherever else those counts are cited.)*

## Parallel ownership and stop rules

Restated 2026-10-05. The previous wording let batches read as "parallel work", which the protected runner cannot support. **Implementation may overlap; protected qualification may not.**

**The source freeze is repo-subtree-wide, not per-file.** `scripts/replatform-e2e.mjs:112,117` snapshots whole subtrees — `tunes/server`, `tunes/shared`, `tunes/auth-runtime`, `tunes/migrations`, `explorers-earth/src`, `explorers-earth/public`, `explorers-earth/e2e/replatform`, `explorers-earth/e2e/setup` — and **fails on any untracked file anywhere in them** ("Untracked runtime dependency is outside reviewed source inventory"). It then re-verifies provenance both **before** (`:168`) and **during/after** (`:178`) every lane, failing with "Source changed before/during lane execution". Three consequences are binding:

1. **Any two lanes that touch any of those subtrees share one freeze domain.** Task B and Task C share a freeze domain. So do all category lanes.
2. **Protected qualification takes an exclusive repo-subtree window.** One writer at a time holds it. No other writer may have uncommitted edits anywhere in the freeze roots while a qualification run is open, and no qualification may start while another writer does.
3. **Every new file must be tracked before any lane runs.** An untracked spec, fixture or script in a freeze root fails the run outright — which is why the untracked `explorers-earth/e2e/setup/category-navigation-route.test.ts` cannot contribute to any qualified aggregate.

Staging discipline: roughly 70 untracked scratch paths in the worktree are **not** gitignored (`.superpowers/*` receipts, `.py`/`.sql` edit scripts, ~45 run logs under `tunes/.superpowers/`, and a nested repository copy under `tunes/.music-cli-contract-isolated-*/`). A `git add -A` would publish all of it. Stage explicit paths only, and gitignore the scratch prefixes as a separate change.

**Coordinator-reserved shared files.** Add to the reserved set and allow no writer to take them: `scripts/replatform-e2e.mjs`, `explorers-earth/e2e/replatform/suite-manifest.json` and `tunes/scripts/*-browser-fixture.ts`. The browser runner is a shared file every category and lifecycle package must edit, and three documents currently claim ownership of the manifest; the conflicting manifest-ownership clauses must be reduced to this one.

At most two implementation writers plus coordinator and one fresh reviewer. Start with lifecycle B and Music C only after exact shared-file exclusions; category field/consumer planning can proceed read-only independently. Subsequently Apps and Products can **implement** in parallel once shared typed contracts settle, but their **qualification is serialized**. People and Places form a later independent implementation pair under the same rule; Guides follows Places. Analytics/reference planning and nonsecret QA readiness may fill independent slots.

Corrected safe batches — the parallelism is in implementation, the serialization is in qualification:

- **Batch 1** — Task A overlay review (read-only) in parallel with category field maps (read-only) in parallel with Task B lifecycle **implementation**. *Stop* the moment Task B needs the manifest or a new identity count: that requires the exclusive window.
- **Batch 2** — Task C Music (6.1/M2) alone plus coordinator. *Stop* if any protected lane qualification is open; Task C writes inside the freeze roots.
- **Batch 3** — Apps 4.3 in parallel with Products 4.4, **implementation only**, qualification serialized. *Stop* at the first shared-client edit, route registration, manifest change or runner change.
- **Batch 4** — People 4.5 in parallel with Places 5.1, same rules. *Additional stop:* 5.1 cannot qualify until the Places suite selection is fixed in `epic-01.md:159` and `epic-05.md:68,130`, which still require `place-links.spec.ts` + `claims.spec.ts` even though `ticket-5-1.md:50` separates PLACES-CORE. That gate was never actually changed — only the prose around it.
- **Never parallel:** `AuthSyncManager.tsx`, `Settings*`, migrations, the browser runner.

No two writers edit Settings/AuthSyncManager/shared clients/contracts/schema/route registration/navigation eligibility/seed or manifest files. The controller allocates shared edits, migration numbers and resource ports. A handoff must name exact files, input/output signatures, meaningful RED, finite commands, actual counts/skips, source hashes, cleanup and limits.

### Next package

**6.1 / M2 (token-null Music startup)** — dispatch only after the blocking preflights (ADR-005 supersession, CORE-REPLACE package withdrawal, coordinator-reserved shared files, and the freeze restated as subtree-wide). Corrected 2026-10-05: **zero execution packages are dispatch-ready as written**, and 6.1/M2 is the nearest — the only package with a frozen input signature, a genuine falsifiable failing regression and no contested file. Its RED: `acceptVerified` with a **null token** must initialize the correct Music owner over session HTTP with **no Strapi configuration and no Strapi calls**; wrong, ambiguous, foreign and suspended owners must issue nothing. Add transactional `ensureMusicAccount` with a provisioning-concurrency test in the same package.

### Stop conditions

Any one of these halts the dependent work immediately. They are gates, not heuristics.

- A required red lane is relabelled optional.
- An assertion is removed rather than translated to the canonical equivalent.
- A fixture mock stands in for an absent production feature.
- A qualification run is started while another writer holds uncommitted files anywhere in the freeze roots.
- A canonical UUID appears as a legacy subject **or** as a browser bearer proof.
- A receipt's frozen source hashes no longer match current source. (Already true of the `movies-ui` freeze: 2 of 28 hashes have drifted, so its review log no longer binds to current source.)

If fresh-agent dispatch remains unavailable, do safe planning or inline independent work under executing-plans; do not reuse old agents or call root's checks independent review. Hold promotion of unreviewed code. Stop only dependent work at missing authority/contract/provider inputs; continue ready independent tasks.

## All-ticket disposition

| Tickets | Re-groomed disposition |
|---|---|
| 1.1–1.4, 2.1–2.2 | Preserve recorded accepted foundation; current image/C0 checkpoint closes only its stated scope. No reimplementation. |
| 2.3 | COMPLETE original ticket: reviewed8ce52776/all-four-hosted acceptance on2026-10-01. Task A qualifies a newer shared navigation overlay; it does not reopen2.3. |
| 2.4 | Lifecycle Task B plus shared navigation repair; Music revocation dependency stays 6.1. Real Google remains separate. **Corrected 2026-10-05:** committed lifecycle scope is **10** cases, not 12 (`lifecycle-browser-guards.ts:1-12`); cases 11-12 are uncommitted overlay and the 12-pass receipt is `dirty:true`. The frozen 18+3 map this plan treats as a hard prerequisite **does not exist in source** — produce it before any 2.4 writer dispatch, naming the existing observation authority `GET /api/explorers/v1/recovery/status` (`explorersLifecycleRoutes.ts:46-53`, under `requireRecoveryPrincipal`) and scoping L0 to what is genuinely absent: the typed terminal/pending/unknown union and the manual-review DTO. |
| 3.1–3.3 | Preserve core/media/Books receipts; retain outstanding external/media/provider/QA limits from ledger. **Corrected 2026-10-05:** 3.1's CORE-REPLACE is **delivered and route-mounted** (`explorersRecommendationRepository.ts:301`, `explorersRecommendationRoutes.ts:89`, commit `4aa1f67e`) — it is **not** a blocker for 3.2–3.4, 4.1–4.5, 5.1, 5.3 or 6.1. Its edge becomes a **verification** step; only the UI consumer plus the foreign-owner and unchanged-other-creator negatives remain. Books 20 is a lane inside the single committed 82, not a separate total, and its `46eea549` checkpoint was 3 of 4 red hosted. 3.3's "no Books flow requires Strapi" is unproven at an exact SHA. |
| 3.4 | Preserve event foundation; dashboard remains 7.2 rather than claiming complete analytics UI. |
| 3.5 | Open operational QA/milestone gate; prepare readiness independently, deploy only on separate authorization. |
| 4.1 | Preserve Movies finite acceptance; no broadened provider/full-ticket claim. |
| 4.2 | Preserve manual Games/image success; IGDB/provider obligations remain explicit. |
| 4.3–4.5 | Category Task D; independent typed consumers before navigation/public acceptance. |
| 5.1 | Places core can proceed after shared core/media; it need not wait for unrelated catalog work. |
| 5.2 | Wait for 5.1 + 4.4 + 4.5 attachments. |
| 5.3 | Wait for 5.1 and typed Guide aggregate; prepare section-field mapping independently. |
| 5.4 | Wait for 5.1 + canonical identity/private media; current claim flow only. |
| 6.1 | Bring startup/principal work forward; Task C before Music publishing acceptance. **Blocking preflight CLEARED 2026-10-05: ADR-005 was superseded by accepted ADR-006** (and refined by 007/008 on 2026-10-06), so this no longer blocks dispatch. Original wording retained for context: — ADR-005 is still `Accepted` and still mandates the proof exchange 6.1 must delete. 6.1 is otherwise the corrected next package. It is **not** blocked by CORE-REPLACE. |
| 6.2–6.3 | Follow 6.1; preserve owner/public/guest/socket transactions and required existing cases. |
| 7.1 | Shared navigation slice advanced under Task A; full all-nine/public/media parity still follows category/Music producers. |
| 7.2 | Dashboard/reference subpackages may start independently; full totals/categories follow their producers. |
| 7.3 | Full regression gate after all functional dependencies; no reclassification of required red tests as optional. |
| 8.1–8.5 | Remain behind full retained web/Music parity and separate release authority. |
| 9.1–9.2 | Remain behind Milestone 3; no new MCP/infrastructure distraction. |
| 10.1–10.3 | Remain behind discovery, delegated authority and publication prerequisites. |

## Self-review and handoff

### Individual independent review and corrected gates

A fresh ephemeral reviewer read all 38 ticket plans and ten epics from supplied line-numbered documents, with no filesystem tools or implementation-source access. See [individual verdicts](../../replatform-audit/individual-independent-review-2026-10-05.md). It returned **revise affected packages**, not blanket approval. The coordinator applied its ticket-specific corrections; a separate fresh correction review remains a distinct gate.

Use [execution-package gate semantics](../../replatform-audit/execution-packages.json) and [actual command custody](../../replatform-audit/command-custody-2026-10-05.md). Historical generic `--project/--environment/--milestone` browser commands are proposed, not supported by the current protected runner, and neither are the project names `desktop-chromium`/`mobile-chromium` or the path `scripts/replatform-e2e.ts` (the real file is `.mjs`). **Scope correction 2026-10-05:** `--suite` is **live on the inner fixture runner** (`scripts/replatform-e2e.mjs:172` passes `--suite <lane>` for the auth and lifecycle lanes, and the pinned `tunes` package scripts use it), so the "not supported" statement applies to the outer `platform:test:e2e` CLI only, not to `--suite` as such. Preserve all original behavior obligations and do not weaken guards.

- Ticket 2.4 owns L0 observation/manual-review contract and the original18+3 map before uncertain-recovery implementation. This source preflight is unresolved and must not be replaced with an invented endpoint.
- Ticket 3.1's CORE-REPLACE revision-checked identity replacement is **DELIVERED, not absent** — corrected 2026-10-05. `replaceRecommendationEntity` is implemented at `tunes/server/repositories/explorersRecommendationRepository.ts:301` (expected-revision lock, idempotency key, 422 unchanged, 404 missing, revision bump) and **mounted** at `tunes/server/routes/explorersRecommendationRoutes.ts:89` (`POST /api/explorers/v1/recommendations/:id/entity`), landed in commit `4aa1f67e`, and present in the frozen runtime-surface inventory. The "currently absent" wording was a **false blocker**: the same claim was introduced into `ticket-3-1.md:66` by the head commit `225d83e5` itself, and 11 edges in `execution-packages.json` carry it, which would delay 3.2–3.4, 4.1–4.5, 5.1, 5.3 and 6.1 behind code that already exists. **No category waits on a new CORE-REPLACE producer.** Withdraw the CORE-REPLACE *producer* package and replace it with: (a) a verification item against the mounted route, (b) the two genuinely missing negatives — foreign-owner and unchanged-other-creator — and (c) **UI adoption, which is the only genuinely absent part**. There is no interface to freeze before dispatch; the interface is already in the frozen surface inventory. *(`ticket-3-1.md` and `execution-packages.json` are separately owned and corrected there; this plan no longer asserts the absence.)*
- Relabel the two ticket requirement lists that say "Create" for files that **already exist** (`ticket-2-4.md:33`, `ticket-3-1.md:29`). A literal reading invites overwriting reviewed code. *(Separately owned; recorded here so no writer dispatched from this plan reads those lists as green-field.)*
- Ticket 5.1 qualifies PLACES-CORE separately from dependent5.2links/5.4claims. All three remain mandatory in full milestone discovery.
- Ticket 5.2 owns parent expected revision and atomic create/link/idempotent receipt semantics; allocate its shared core extension centrally.
- Task B/C/category writer dispatch requires exact file allowlists and backend/frontend input/output handoff, migration/resource reservation and a freeze covering shared runtime dependencies. No shared writer may invalidate an ongoing receipt.
- Q2 trusted candidate remains blocked by mandatory red hosted jobs. Q1 readiness preparation continues independently.
- Ticket 8.4 mechanism can precede8.5; actual production eligibility consumes exact-candidate8.5recovery/final acceptance plus hosted/QA evidence and separate authorization.
- Ticket 9.1 public MCP acceptance does not depend recursively on later OAuth. Ticket10.1owns a minimal protected getMyProfile probe;9.2linked analytics activation waits for explicit persisted/user-controlled consent handoff and remains default-deny meanwhile.

Retain38tickets rather than add duplicate tickets for these corrections. They are packages or acceptance joins under existing owners. Each partial ticket's original requirements must be dispositioned against actual receipts during its source preflight; an aggregate count or generic amendment does not establish whole-ticket closure.

All 38 ticket prerequisites and acceptance owners were checked; current repair plans and source-backed Music/lifecycle findings were reconciled. This document amends execution order, not product scope or passing status. All five review-focus risks have owning tasks. Existing concrete category contracts are reused rather than duplicated; before implementation each proposed path/command must resolve in current source, or be explicitly created by its owning prerequisite.

In-chat dispatch remains unavailable (`agent thread limit reached`); fresh independent document review was obtained through a new ephemeral standalone session with supplied documents. That review does not validate current application source or close Task A package review. The immediate ready action is Task A source/review inventory plus the [Blocking preflights](#blocking-preflights), with category field maps and nonsecret readiness prepared independently. No new category implementation or release action is claimed by saving this plan.

**Corrected 2026-10-05:** the former wording named an "L0/CORE-REPLACE/Music handoff preflight". The CORE-REPLACE item is now a **withdrawal and verification** preflight, not a producer handoff, because the code is delivered and mounted. The L0 and Music items stand and have been strengthened: L0 needs the 18+3 map that does not exist, and Music needs ADR-005 superseded first.

### Corrections applied 2026-10-05

Audit log for this plan, applying an independent read-only review of `codex/unified-replatform` @ `225d83e5` (nine reviewers plus lead verification against source, git history and the live GitHub API; nothing executed). Every entry records the prior claim and why it changed. **No requirement was weakened, no gate removed, no checkbox ticked, and no status inflated** — every change here either lowers a claim or adds a gate.

| # | Prior claim in this plan | Correction | Why |
|---|---|---|---|
| P1 | "Contained route regressions — **18 pass**" | Restated as **never run**; the two real receipts (8 PASS, 10 PASS) named individually with their freezes, and the spec marked untracked | No 18-case run exists anywhere. 8 PASS is at `navigation-fault-reconciliation.md:17` and 10 PASS at `category-b-preference-reconciliation.md:7`, recorded at **two different source freezes**; 8 + 10 was summed into "18". `explorers-earth/e2e/setup/category-navigation-route.test.ts` is **untracked**, so it cannot contribute to a qualified aggregate at all |
| P2 | "Frozen canonical profile/navigation — 6 pass" and "Frozen lifecycle — 12 pass" presented as frozen receipts | Both relabelled **dirty source**; lifecycle committed scope restated as **10**; navigation noted as having **no independent review** | Both ran against the uncommitted overlay (`dirty:true`). Committed `tunes/scripts/lifecycle-browser-guards.ts:1-12` defines 10 cases and the committed manifest's lifecycle lane is 10; cases 11-12 exist only in the working tree (whose manifest totals 88 vs the committed 82) |
| P3 | "Exact 1a5c image/C0 hosted" framed as the current checkpoint, and the global-constraints base given as 1a5c | 1a5c labelled **historical application baseline**; a new row records the **`225d83e5`** hosted state; global constraints now name the head | The docs-only head commit triggered its own run. At `225d83e5`: API image SUCCESS, Music C0 SUCCESS, Backend validation FAILURE (`music-required` FAILURE, `browser` FAILURE), Explorers Category A/B/Publishing FAILURE, Public shell SUCCESS, Music-and-account still running so `replatform-required` had not concluded. Also disclosed: `46eea549` was 3 of 4 red including API image FAILURE 37265897012 |
| P4 | "Ticket 3.1 owns CORE-REPLACE revision-checked identity replacement, **currently absent**" | Restated as **delivered and route-mounted**; package withdrawn in favour of verification + two negatives + UI adoption; 3.1–3.3 disposition and the 6.1 row updated to say 6.1 is not blocked by it | `replaceRecommendationEntity` exists at `explorersRecommendationRepository.ts:301` and is mounted at `explorersRecommendationRoutes.ts:89`, landed in `4aa1f67e` and present in the frozen runtime-surface inventory. The false absence was introduced by the head commit `225d83e5` itself and would have had a writer re-implement reviewed, route-registered code while delaying 3.2–3.4, 4.1–4.5, 5.1, 5.3 and 6.1 behind it. Only the UI consumer is genuinely absent |
| P5 | Task C had no architecture gate; ADR-005 unmentioned | Added an explicit **blocking preflight** to Task C, to the 6.1 disposition row and to a new Blocking preflights section | ADR-005 is still `Status: Accepted` (`docs/adr/005-...md:3-4`) and its Decision (`:16-20`) mandates the bodyless `POST /api/music/identity/ensure` proof exchange that 6.1 must delete. `docs/adr/` holds 001–005 + README — no ADR-006 exists. Without supersession a writer following ADR authority rebuilds exactly what 6.1 removes |
| P6 | Parallel-ownership section implied batches could run in parallel | Restated: **implementation may overlap, protected qualification takes an exclusive repo-subtree window, every new file must be tracked before any lane runs**; coordinator-reserved shared files named; four corrected batches with explicit stops | The freeze is **subtree-wide, not per-file**: `scripts/replatform-e2e.mjs:112,117` snapshots eight whole subtrees and fails on any untracked file in them, then re-verifies provenance at `:168` and `:178`. Task B and Task C therefore share a freeze domain, so they cannot qualify in parallel. ~70 untracked scratch paths are also un-ignored, so `git add -A` would publish them |
| P7 | No next-package decision and no stop conditions | Added **Next package: 6.1 / M2 after preflights** and six explicit **stop conditions** | Zero packages are dispatch-ready as written; 6.1/M2 is the nearest — frozen input signature, genuine falsifiable RED, no contested file. The stop conditions make the failure modes this review found (relabelled red lanes, removed assertions, mock-for-production, concurrent qualification, canonical-UUID-as-legacy-subject, drifted freeze hashes) halting rather than advisory |
| P8 | 2.4 disposition cited the 18+3 map as if available | Noted the map **does not exist in source** and must be produced before any 2.4 dispatch, with `/recovery/status` named as the existing observation authority | Repo-wide grep finds only references to the map. Conversely, L0's observation authority partly exists: `explorersLifecycleRoutes.ts:46-53` already serves `GET /api/explorers/v1/recovery/status` under `requireRecoveryPrincipal`, clearing the proof cookie only on delivered success. Genuinely absent: the typed terminal/pending/unknown union and manual review |
| P9 | Command custody read as "`--suite/--project/--environment` all unsupported" | Scoped to the outer `platform:test:e2e` CLI; `--suite` noted as **live** on the inner fixture runner; added the other genuinely unresolvable references | `scripts/replatform-e2e.mjs:172` passes `--suite <lane>` for the auth and lifecycle lanes and the pinned `tunes` scripts use it. Overstating a working flag as unsupported is as misleading as the reverse |
| P10 | Task A consumed the 6/12 receipts without qualification; overlay fixture conversion unmentioned | Added the dirty-source qualification, the untracked-spec constraint, and the unmigrated-importer conflict Task A must resolve | `e2e/setup/category-navigation.ts:407` now denies `SettingsAccount|PublicCategoryListCounts|CheckPublishedLists|UpdateTabVisibility`, while unmodified `category-navigation-a.spec.ts:478` and `music-publish-controls.spec.ts:85,139,265` still assert them — converting Category A and Publishing to a new failure mode rather than fixing them |

Not corrected here because the files are separately owned: `ticket-3-1.md:66` (the false CORE-REPLACE absence), the 11 affected edges and `state` strings in `execution-packages.json`, the drafting of ADR-006, `ci-audit-2026-10-05.md`'s 1a5c-bound "exact-head" table, the Places qualification gate still pulling `place-links.spec.ts` + `claims.spec.ts` at `epic-01.md:159` and `epic-05.md:68,130`, and the "Create" labels on existing files at `ticket-2-4.md:33` and `ticket-3-1.md:29`. Each is recorded above so no writer dispatched from this plan acts on the uncorrected version.

## Live CI audit linkage
Read [CI audit and bounded corrections](../../replatform-audit/ci-audit-2026-10-05.md) before Task A publication. It records exact1a5c required gate failures, first hosted errors versus later local gaps, zero-retry alignment and browser JSON/artifact retention, guarded canonical registration and separate QA authority. These workflow amendments require focused contracts and independent review; no infrastructure expansion or gate weakening. Historical image/C0 successes are preserved.

**Corrected 2026-10-05:** that audit binds its "exact-head" table to `1a5c6942`, which is **no longer PR 119's head**. The docs push created `225d83e5`, which has its own hosted results — recorded in this plan's "Verified checkpoint and limits" table and in the [status summary](../../replatform-audit/current-status-2026-10-05.md). Read the 1a5c table as the application baseline, not as current head state. *(The CI audit document is separately owned; this is a pointer, not an edit to it.)*
