# Shared execution checklist

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

**Corrected amendment (2026-10-05).** This block replaces the two earlier inline "current finite status" amendments, which were stale and partly contradicted by the receipts they cited. Read the [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md) for ownership and remaining prerequisites, and the [corrected execution order](implementation-plan.md#corrected-execution-order-2026-10-05) for dispatch order. Every new assignment uses a fresh agent. **No full parity, operational QA or release claim follows from any slice below.**

**Corrected identity counts.** Three separate aggregates were previously conflated; keep them distinct:

| Aggregate | Correct figure | Composition |
|---|---|---|
| **Committed manifest, whole suite** | **82 identities** | auth 6 · profile 2 · books 20 · lifecycle 10 · movies 24 · games 20 |
| **Working tree, whole suite** | **88 identities** | same lanes, but profile **6** (not 2) and lifecycle **12** (not 10) — the deltas exist **only in the uncommitted overlay** |
| **Games lane** | **20 identities** | the Games lane alone |

Consequences for anything written earlier or in a brief:

- **"Games canonical 82" overstates the Games lane roughly fourfold.** 82 is the whole committed suite, and it already contains the Books 20 and Movies 24 that other rows count separately. The Games lane is **20**. Never present a suite total as a lane total.
- **"12 accepted lifecycle cases" is overlay scope, not committed delivery.** The committed lifecycle guard set defines **10**; cases 11 and 12 exist only in the dirty tree. Likewise the navigation count of 6 is an overlay figure.
- **"Contained route regressions 18 pass" was never run.** The only receipts record **8 PASS** and **10 PASS** at two *different* source freezes, and the spec file was **untracked** at both. 8+10 is arithmetic across incompatible freezes, not a result. No 18-case run exists anywhere. Withdraw the claim rather than re-deriving it.
- **The `1a5c6942` checkpoint must be stated in full.** API image and Music C0 succeeded there, but **both protected aggregates were red at `1a5c6942`** (Backend validation / `music-required` FAILURE and Explorers validation / `replatform-required` FAILURE). Quoting only the two green non-protected workflows reads as a green checkpoint and is not one. The same applies to `46eea549`, where **three of four lanes were red** including the API image, and to the review head `225d83e5`, where `music-required` FAILED, Category A, Category B and Publishing FAILED, and `replatform-required` had not concluded.
- **The manual Games slice stands as a bounded, locally qualified, independently reviewed slice only.** Hosted exact-commit qualification, full provider parity, operational QA and release remain open. Earlier pending/failed sections further down are preserved as **historical** evidence, not the current execution state.
- **`music-required` is emitted by the "Backend validation" workflow, not by the green "Music C0 contracts" workflow.** Do not read a green Music C0 run as the protected Music context.

**Historical (superseded).** The prose previously in this position read, in substance: *"exact 1a5c image/C0 succeeded; navigation 6 / lifecycle 12 remain bounded separate proofs; Category B 17/26 passed and Music startup remains open"* and *"A3M manual Games locally qualified and independently reviewed: source 104, frontend 4231 and canonical protected 82 PASS."* Retained for traceability of what briefs issued before 2026-10-05 were told. Superseded on the identity counts, on the `1a5c6942` characterisation and on the attribution of 82 to Games; the "Music startup remains open" and "release remains open" parts still hold.

Apply this checklist to each ticket where its surface is affected. Record the applicable checks, executed counts, environment, commit and evidence in the ticket report. A check with an unmet prerequisite is pending, not passed. The [durable implementation ledger](../../.superpowers/sdd/epic-01/progress.md) is the status authority; planning checkboxes are requirements, not completion records.

## Contract and consumer closure

- [ ] Before implementation, classify affected tests as current canonical behavior, obsolete implementation assumptions requiring replacement, or future-ticket parity obligations. Record the replacement coverage and dependency owner. Never label failures legacy merely from their filenames or counts.
- [ ] For each changed contract, inventory strict response expectations, fixture DTOs, generated files, imported runtime schemas, package installations and public/owner consumers. Regenerate relevant inventories and qualify test discovery in the exact clean install topology used by CI.
- [ ] Before calling a failure intermittent or preexisting, preserve its exact source, environment, identity and sanitized assertion evidence. Diagnose the first failure before rerunning; report later passes alongside earlier failures. Artifact directory names and incomplete timeout logs are not test outcomes.

- [ ] Map every changed producer to its consumers: owner UI, public profile/list/detail, Settings, onboarding, shared navigation, test fixtures and external adapters. Check actual typed payloads emitted by the current components and accepted by the API; include omitted and blank optional values and nullable enum fields. Verify save, reload and public projection with those payloads.
- [ ] Exercise repeat save, stale revision, two-tab edits, account switch and stale-session responses. A failed write must leave persisted state and UI authority unchanged; a late response from an old account cannot populate the new account's view.
- [ ] For private/public data and media, check authorization at storage, delivery and cache boundaries. Invalidate or partition caches across visibility and account changes. Test concurrent attach/delete, replacement failure and durable cleanup retries so committed references never point at deleted objects and orphaned objects are recoverable.

## Schema, runtime and deployment

- [ ] Keep each migration atomic with its manifest, generated inventory, readiness rules, runtime/migrator privileges and deployment schema floor. Run the migration against the attested disposable database and prove startup/rollback behavior. Synthetic fixture identities must be explicitly test-only and cannot authorize production requests.
- [ ] Validate each CI package from a clean isolated `npm ci`, then build and run that package's required tests with its own lockfile and dependency graph. Record local versus hosted evidence separately. Run the full affected frontend regression selection before review, including shared consumers and legacy harnesses; targeted tests alone do not close cross-feature changes. Call a failure “preexisting” only after reproducing it at the base commit under the same environment.
- [ ] Define guarded real-API session and data fixtures before dependent browser acceptance. Require a real application API and disposable database for persistence claims; label mocked UI and provider simulations separately. Respect the containment boundary and report skipped/blocked scenarios with their cause.
- [ ] Keep phase diagnostics useful without printing secrets, session cookies, tokens, database URLs or registry credentials. Inspect the built runtime image and its dependency scan, not only source and unit tests. Preserve required security gates and capture the exact failing phase and artifact on failure.
- [ ] **Track every new runtime and test file in Git before any protected lane runs.** The browser runner snapshots **whole subtrees**, not an explicit file list, and **fails on any untracked file inside its freeze roots** — so a lane started with a new file still untracked produces a guard rejection before any fixture or case executes. That is a zero-execution scheduling failure, not a product failure: preserve it, correct only the exact reviewed inventory, and never weaken or bypass the guard to get past it. Because the freeze is subtree-wide, two writers inside one freeze root cannot qualify in parallel: implementation may overlap, but **protected qualification takes an exclusive window**. Stage explicit paths; never `git add -A` into a tree carrying scratch receipts, edit scripts, run logs or nested repository copies.

## Handoff

- [ ] Agent briefs must name the exact source/worktree, plan and review paths, owned files, dependency closure, test commands, red reproduction, cleanup/artifact policy and acceptance limits. Completion reports must distinguish implemented, locally verified, independently reviewed, pushed and hosted-qualified states.

- [ ] Bind qualification receipts to the complete executed source and configuration closure, including migrations, fixture authority helpers, entry points, assets and transitive dependencies. Record commit and actual checkout hashes separately where line endings differ. Test that a relevant change is detected even when the checkout was already dirty; do not use the dirty boolean as a source fence.
- [ ] **Every receipt must record which tree it ran against: a named committed SHA, or a dirty overlay on top of a named SHA.** State the SHA, state whether the working tree was clean, and for an overlay enumerate the modified and untracked paths that were in scope. **An overlay receipt may not be cited as committed delivery** — not in a ticket report, not in the ledger, not in a status doc, and not as an identity count. Overlay and committed figures are different aggregates and must be reported as such (see the corrected identity counts above, where the committed suite is 82 and the working tree is 88). A receipt whose frozen source hashes no longer match current source no longer binds and must be re-run, not re-cited. Counts from two different freezes are never summed.
- [ ] For browser tests carrying real signed sessions or recovery proofs, use protected artifact settings and owned output directories. Prevent credential-bearing traces, videos, raw reporter data and secret files from surviving outside the reviewed artifact allowlist. Exercise a controlled failure and verify cleanup while retaining its failed result.
- [ ] Separate delivered-slice evidence, whole-milestone obligations and full parity. Missing prerequisites, skipped tests and simulated providers remain explicit. CI optimization must preserve exact structured test identities, browser projects and fail-closed results; shorter runs do not establish feature completion.
- [ ] Give each agent bounded file ownership, prerequisites and completion criteria. Require diagnosis and a failing regression before scoped fixes, independent review before promotion, and immediate completion/blocker messages with evidence. The coordinator records the next ready action and acts on it rather than only polling.

- [ ] At agent completion or a blocking discovery, immediately report the exact commit, files, executed checks/counts, blocked checks, evidence location and next action to the coordinating task. The ledger is updated from that evidence; do not wait for polling or infer completion from a file appearing.

## Category delivery learning supplement

Apply [Books and Movies delivery learnings](category-delivery-learnings.md) when grooming each remaining category and writing agent briefs. Verify consumer closure, asynchronous scope fences, truthful busy/retry recovery, real pagination/publication interactions and atomic schema/fixture closure. Parallelize only independent file/resource ownership; focus runs never replace full protected acceptance.

- [ ] Before category allocation, verify actual command routes/service/repository/client signatures, category media allowlists and shared signed-cursor consumers; do not infer mutation support from read contracts. Apply the Games integration findings in the category learning supplement. Privacy negatives must establish the same resource was readable beforehand; aggregate limits must apply before driver materialization and initial authority awaits.

## Evidence and inventory learnings from Games manual delivery

Before source-bound qualification, register every reviewed new runtime/test file in the private Git inventory. A guard rejection before any fixture/case is a zero-execution scheduling failure, not a product failure. Preserve it and correct only the exact reviewed inventory without weakening the guard. Bind actual checkout byte format and dependency topology; private transformer preflight must exercise raw executed bytes plus LF/CRLF variants and an actual source-bound transform/build.

Owner detail fanout must latch the first error (including undefined), stop future claims after transport/revision/byte failure, retain caller-cancellation guards and bounded sibling settlement. Requested abort is not proof of native settlement. Private owner hooks synchronously exclude settled content from a previous account/generation before passive cleanup. Test intermediate render samples, not only final hook state.

Observer/manual paging tests must require current-scope final content and settled terminal state. A redundant manual control may disappear after automatic completion; detachment alone proves nothing. Preserve original action errors unless exact current-route required row and absence of busy/loading/error/continuation are established, and retain final native modal/privacy/later-page assertions. Proactive synchronization tests are not evidence of a historical timeout root cause.

**Corrected (2026-10-05).** The manual Games slice is an independently reviewed **local** slice bound to an exact source freeze. The "canonical 82 PASS" figure attached to it is the **whole committed suite** (auth 6 · profile 2 · books 20 · lifecycle 10 · movies 24 · games 20), not a Games result; the **Games lane is 20**. Hosted proposed-commit qualification, real-provider parity and operational QA/release remain open — and the Games provider chain itself is currently dead code behind an unconditional failure, so provider parity is further away than the manual slice suggests. Do not mark shared checklist requirements universally complete, and do not restate a suite total as a lane total.

*Historical:* the sentence previously here read "Latest finite local manual Games slice is independently reviewed canonical82 PASS, source104 exact."

- **Every migration moves `SCHEMA_FLOOR`.** It is derived from `EXPECTED_MUSIC_MIGRATION_ID`
  (`tunes/server/deployment/platform-release-contract.ts`), so adding a migration invalidates
  all 71 independent OCI release claims. Rebase them with the real `canonicalDigest`, regenerate
  `cases.json`'s byte receipt, and add the superseded floor to the historical-rejection set in
  `platform-oci-evidence.test.ts`. Five migrations in a row have needed this.
