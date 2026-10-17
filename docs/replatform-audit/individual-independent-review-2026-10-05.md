**Verdict: revise the affected execution packages before implementation.** The overall direction is coherent, but several gates and interfaces remain insufficiently precise for dispatch.

I read all 38 tickets, all 10 epics, and the four supporting documents supplied. This is an individual planning review only. No tools, filesystem reads, source validation, CI checks, or deployment assessment occurred. Recorded acceptance is documentary input, not independently verified evidence.

References below are under `docs/replatform-audit/` unless stated otherwise. **PLAN** means `docs/superpowers/plans/2026-10-05-replatform-regroomed-execution.md`; ticket and epic filenames identify their respective `tickets/` and `epics/` directories. All line numbers are supplied line numbers.

The amendments correctly preserve seven completed tickets, distinguish delivered slices from whole-ticket completion, advance 6.1 without waiting for complete lifecycle closure, and permit shared navigation/analytics preparation before full category parity. The explicit ticket dependency graph has no apparent cycle by inspection. That does not resolve the acceptance-level dependencies below.

1. **High — The Places suite can require its own downstream tickets.**
   `epics/epic-01.md:153–157` maps `places` to Places, linked-list, and claim specs. `epics/epic-05.md:126` requires the exact category suite, while `tickets/ticket-5-2.md:27` and `tickets/ticket-5-4.md:27` depend on 5.1. Consequently, qualifying 5.1 through the prescribed suite can demand unfinished 5.2/5.4 behavior. Milestone filtering explicitly solves the platform case, but supplies no equivalent Places package selection.
   **Change:** define bounded selections for Places core, links, and claims; retain all three in full milestone discovery. Missing downstream tests must remain tracked without blocking core qualification or disappearing from final acceptance.

2. **High — Technical prerequisites and closure gates remain conflated in the execution model.**
   `execution-packages.json:13–18,31–33` uses one ticket-level `after` list despite L/M/N/A/Q subpackages. The prose permits preparation now, but complete acceptance retains broader dependencies. `tickets/ticket-3-1.md:57–59` also assigns outstanding obligations across later epics. Treating every dependency as whole-ticket completion would reintroduce blocked chains; treating every dependency as an interface handoff could close tickets prematurely.
   `tickets/ticket-3-5.md:35,57` correctly retains mandatory hosted checks: Q1 preparation cannot become a trusted candidate while those checks fail, even though its selected feature matrix excludes future categories.
   **Change:** distinguish package implementation inputs, package qualification, ticket closure, and release gates. Record the exact interface/checkpoint each edge consumes. Explicitly retain the current candidate blocker.

3. **High — Revision-checked entity replacement remains unassigned.**
   `tickets/ticket-3-1.md:57` explicitly says this original requirement is absent and must be assigned during producer preflight. `epics/epic-03.md:98` retains it in the shared contract. Yet the ready-category cards and PLAN:85–91 do not allocate its implementation, signature, or acceptance owner. “Preserve original requirements” does not establish which writer supplies this shared operation.
   **Change:** assign a shared producer package and consuming category tests before freezing category contracts. Preserve stale-revision, foreign-owner, and unchanged-other-creator assertions.

4. **High — Lifecycle response-loss work needs an explicit observation contract.**
   PLAN:64–66 requires observing successful recovery without replay and surviving reload/another tab. `tickets/ticket-2-4.md:37–41` supplies an ordinary-Actor lifecycle read and a single-use recovery authority; it does not specify the observation interface for uncertain completion when ordinary authority is unavailable. The typed manual-review UI contract is explicitly unresolved at line 59.
   **Change:** define observation authority, response shape, terminal/unknown outcomes, and fresh-session transition before implementing these cases. Clarify that proof secrecy prohibits browser-readable persistence/logging while preserving the specified HttpOnly cookie and server-side hash contract. Keep 18+3 scenario mapping separate from the accepted 12 receipt.

5. **High — Ownership rules are sound, but current packages are not yet allocated precisely enough.**
   PLAN:49,60,71 gives overlapping lifecycle/repair territory; `tickets/ticket-2-4.md:33,48` and `tickets/ticket-6-1.md:42` both include auth startup surfaces. PLAN:104–106 requires exact exclusions before B/C writers start, but the supplied material does not contain that allocation. Category cards similarly defer shared repository/schema/routes/navigation work to the controller.
   **Change:** produce explicit file allowlists, shared-edit owners, interface handoffs, migration/resource allocations, and a qualification freeze boundary. Include shared runtime dependencies in that freeze so another writer cannot invalidate a source-bound receipt during qualification. This is a condition for parallel implementation, not a reason to stop independent planning.

6. **Medium — Linked-list creation omits the parent revision input.**
   `tickets/ticket-5-2.md:41` adds only `parentLocationCollectionId?:string` while requiring parent revision validation and atomic linking. `epics/epic-05.md:79` defines revision handling for replacing links, but not for creating a child and attaching it.
   **Change:** specify the parent expected revision, revision bump, locking/idempotency behavior, and returned revisions for create-and-link. Test stale-parent failure leaves neither an orphan child nor a changed relation.

7. **Medium — Later MCP acceptance contains undeclared forward dependencies.**
   `tickets/ticket-9-1.md:41` requires an owner OAuth-token case before 10.1 delivers OAuth. `tickets/ticket-10-1.md:38` requires a real protected read before 10.2 owns protected creator tools. `tickets/ticket-9-2.md:31,36` requires linked-user analytics opt-in without assigning the preference’s persistence or user control.
   **Change:** distinguish early service/transport fixtures from later real OAuth evidence. Assign the protected-read probe and analytics-preference owner, or defer product analytics under the stated default-deny policy. Add the later regression obligations without making 9.1 closure depend recursively on 10.1.

8. **High before release work — Recovery completion is not an explicit promotion prerequisite.**
   `tickets/ticket-8-4.md:31–38` gates promotion on QA evidence and separate authorization; 8.5 then supplies recovery, capacity, and final acceptance at `tickets/ticket-8-5.md:27,43–48`. Keeping mechanism implementation before recovery qualification is reasonable. The missing point is an explicit requirement that actual promotion also consumes successful 8.5 evidence.
   **Change:** separate “promotion mechanism ready” from “release eligible”; require the exact candidate’s recovery/final-acceptance evidence before production dispatch. Authorization alone should not substitute for technical readiness.

9. **Medium — Documentary custody checks cannot establish semantic consistency.**
   `organize-plans.cjs:17–28` checks the hardcoded completed set, card strings, headings, and dependency cycles. It does not compare original acceptance, epic table values, package gates, or ownership conflicts. Its PASS output must remain structural only.
   `tickets/ticket-4-2.md:4` supersedes earlier commit-preparation status, but line 54 also contains an unresolved-sounding category-batch hold. PLAN:87,104 anticipates category work.
   **Change:** explicitly disposition that hold and label superseded status passages. Preserve historical receipts rather than rewriting them. Do not use the checker or STATUS’s ledger-check claim as independent verification.

The following are **ticket planning verdicts**, not implementation approvals. “Recorded complete” preserves the supplied status; “conditional” means the specified handoff or amendment is still required.

| Ticket / supplied source | Individual verdict |
|---|---|
| 1.1 — `ticket-1-1.md:13–39` | Recorded complete. Preserve scenario ownership and baseline evidence; no restart. |
| 1.2 — `ticket-1-2.md:13–41` | Recorded complete. Reuse authority/runtime; consuming tickets extend seeds and route coverage. |
| 1.3 — `ticket-1-3.md:13–41` | Recorded complete. Preserve required checks and deployment separation; later red checks remain visible. |
| 1.4 — `ticket-1-4.md:13–37` | Recorded complete. Retain API-only/security gates and defer client removal to 8.2. |
| 2.1 — `ticket-2-1.md:13–41` | Recorded complete. Reuse auth/recovery foundation; live Google remains separately owned. |
| 2.2 — `ticket-2-2.md:13–34` | Recorded complete. Actor boundary acceptance does not establish Music implementation. |
| 2.3 — `ticket-2-3.md:27–52` | Recorded complete. Preserve original profile/media acceptance; newer repair has separate custody. |
| 2.4 — `ticket-2-4.md:27–59` | Partial. Preserve 12; resolve observation/manual-review contracts, 18+3 mapping, Google and 6.1 socket closure. |
| 3.1 — `ticket-3-1.md:43–59` | Partial producer handoff. Preserve delivered core; assign identity replacement and explicit closure obligations. |
| 3.2 — `ticket-3-2.md:27–38` | Partial. Extend existing media; retain attachment races, private bytes, cleanup and live provider/storage qualification. |
| 3.3 — `ticket-3-3.md:15,27–34` | Partial. Preserve Books 20; reconcile remaining original flows and combined Google/milestone acceptance. |
| 3.4 — `ticket-3-4.md:15,31–38` | Partial. Preserve event foundation; retain consent, dedupe, retention and consumer obligations; dashboard stays 7.2. |
| 3.5 — `ticket-3-5.md:15,29–57` | Q1 preparation ready; candidate/QA closure blocked. Selected scope cannot waive mandatory hosted failures. |
| 4.1 — `ticket-4-1.md:15,33–45` | Partial. Preserve Movies 24; retain TMDB enrichment, movie/TV identity and provider qualification. |
| 4.2 — `ticket-4-2.md:4,36–54` | Partial. Preserve committed manual slice; IGDB/search/taxonomy remain open; clarify historical batch hold. |
| 4.3 — `ticket-4-3.md:13–42` | Conditional. Freeze shared contracts; preserve exact tiers, screenshots/platforms, manual fallback and modal focus. |
| 4.4 — `ticket-4-4.md:13–42` | Conditional. Preserve decimal/currency/zero/null semantics, independent offers and price-sort behavior. |
| 4.5 — `ticket-4-5.md:13–42` | Conditional. Preserve aliases/social fields, distinct identities, sector visibility and no login linkage. |
| 5.1 — `ticket-5-1.md:13–43` | Conditional. Fix suite gate; retain taxonomy provenance, zero coordinates, contact redaction and claim eligibility. |
| 5.2 — `ticket-5-2.md:27–45` | Waiting for attachment contracts. Amend parent revision input; preserve detach, privacy, QR decoding and Maps evidence. |
| 5.3 — `ticket-5-3.md:27–50` | Field mapping ready; implementation waits for Places contract. Preserve versioned aggregates, micro-editors and media races. |
| 5.4 — `ticket-5-4.md:27–44` | Waiting. Preserve public eligibility, ambiguity handling, private evidence and no ownership grant. |
| 6.1 — `ticket-6-1.md:27–42` | Correct priority prerequisite. Conditional on exact handoff; require token-null startup, session HTTP and socket revocation. |
| 6.2 — `ticket-6-2.md:27–32` | Waiting for 6.1. Preserve queue/playlist transactions, playback/history, entitlement and post-commit notifications. |
| 6.3 — `ticket-6-3.md:27–32` | Waiting for owner behavior. Preserve guest separation, encrypted replay, revocation and reconnect privacy. |
| 7.1 — `ticket-7-1.md:27–55` | Shared slice partial; full parity waiting. Retain nine-category positives, cold entry, cache invalidation and media-byte denial. |
| 7.2 — `ticket-7-2.md:27–49` | Preparation ready. Full totals need producers; real localized content and serialized Settings ownership remain gates. |
| 7.3 — `ticket-7-3.md:27–44` | Correct full-regression gate. Reconcile scenario discovery, desktop/mobile, QA/providers and exact-source evidence. |
| 8.1 — `ticket-8-1.md:27–37` | Waiting for full parity. Require consumer inventory plus static/runtime evidence before removals. |
| 8.2 — `ticket-8-2.md:27–36` | Waiting. Require retained Music assertion mapping and import audit before duplicate-client deletion. |
| 8.3 — `ticket-8-3.md:27–36` | Waiting. Keep rename mechanical; qualify new paths, both supported OS environments and artifact lineage. |
| 8.4 — `ticket-8-4.md:27–38` | Mechanism plan conditional. Add explicit 8.5 release-evidence prerequisite; preserve immutable promotion. |
| 8.5 — `ticket-8-5.md:27–48` | Waiting. Preserve disposable restore, consistent media backup, capacity measurements and exact-release final acceptance. |
| 9.1 — `ticket-9-1.md:27–43` | Waiting for Milestone 3. Resolve future OAuth regression sequencing; retain anonymous public authority. |
| 9.2 — `ticket-9-2.md:27–42` | Waiting. Preserve distinct-creator discovery; assign opt-in dependency and prohibit inferred impressions. |
| 10.1 — `ticket-10-1.md:27–42` | Waiting. Assign protected-read probe; retain consent generation, current membership and immediate revocation checks. |
| 10.2 — `ticket-10-2.md:27–42` | Waiting for delegated authority. Preserve shared commands, explicit scopes, draft default and idempotent writes. |
| 10.3 — `ticket-10-3.md:27–39` | Waiting. Retain actual-client/package evidence and current-rule review; submission remains separate. |

The epic verdicts account for both their current authority sections and retained shared contracts.

| Epic / supplied source | Individual verdict |
|---|---|
| 1 — `epic-01.md:10–13,147–177` | Recorded foundation complete. Amend downstream suite selection; preserve harness authority and evidence distinctions. |
| 2 — `epic-02.md:10–13,198–225` | Partial overall. Three completed tickets stay complete; lifecycle/Google/socket acceptance remains open. |
| 3 — `epic-03.md:10–14,98–106,204–227` | Partial. Usable producers do not establish milestone closure; clarify residual ownership and Q gates. |
| 4 — `epic-04.md:10–14,101–127` | Partial/conditional. Preserve Movies/Games slices; remaining typed categories need shared handoffs and full common assertions. |
| 5 — `epic-05.md:10–13,78–98,159–227` | Pending. Correct producer order; fix Places qualification and linked-create revision contract. |
| 6 — `epic-06.md:10–12,142–170` | Pending priority work. Identity → owner → guest/public sequence is appropriate; shared auth ownership must settle. |
| 7 — `epic-07.md:10–12,140–205` | Partial/preparation only. Shared work can advance; all-category privacy, content and regression gates remain intact. |
| 8 — `epic-08.md:10–14,119–157` | Waiting. Retirement/rename sequence is coherent; make recovery/final acceptance explicit prerequisites to promotion. |
| 9 — `epic-09.md:33–41,54–91` | Waiting. Public-service reuse is appropriate; amend OAuth-dependent tests and analytics preference ownership. |
| 10 — `epic-10.md:55–107` | Waiting. Delegated authority and publication boundaries are sound; resolve protected-read acceptance ownership. |

Before new implementation writes, the plan needs concrete package dependency/closure records, the lifecycle observation contract, ownership of entity replacement, corrected Places suite selection, and exact writer/handoff allocations. Each partial ticket also needs a requirement-to-disposition map: accepted receipt, remaining local work, external blocker, or named downstream owner. Counts alone cannot supply that map.

Before their respective later phases, resolve linked-create revisions, MCP forward-dependent acceptance, and the production recovery gate. Continue Task A inventory, category field mapping, reference-input inventory and nonsecret QA preparation independently. Preserve all recorded acceptance and original required positives; this review establishes no new code, CI, milestone, or deployment acceptance.
