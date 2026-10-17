# Acceptance recovery implementation plan

> **For agentic workers:** Use subagent-driven-development for independently owned tasks. Track the checks below; execution is already authorized by the user.

**Goal:** Diagnose the first unresolved UI failure, repair only a demonstrated defect, and qualify the delivered slice.

**Architecture:** Separate read-only source audit from diagnostic review. One original fixture writer owns the single reviewed Books run; the controller reconciles evidence before any product edit.

**Tech Stack:** Supported Node24.21/npm11.19, React, Playwright, real PostgreSQL15.

**Spec:** task4.2-games-a3m-books-first-failure-diagnosis.md; task4.2-games-a3m-books-diagnostic-preparation-plan.md; current ticket4.2 plan.

## Global constraints

Preserve codex/unified-replatform and source469's96-file inventory. No merge/deploy, new category batch, quota increase, guard weakening, assertion/deadline change, automatic retry or concurrent fixture access. Retained51642 is untouched. Diagnostic success is not canonical acceptance. Historical81/82 and latest27PASS1FAIL54notexecuted remain distinct.

## Review focus

Iteration attribution under unordered init scripts; unknown error-code privacy; instrumentation preserving original exceptions; current versus superseded acquisitions; failed detail/revision checks preventing rendering. Existing diagnostic runtime checks cover the first three; the fresh audit identifies meaningful regression gaps for the latter two without claiming causality.

### Task1: Independent diagnostic review

Owner proxy_acceptance_review; read-only prepared plugin/spec/config plus smoke receipts. Output Books rereview with full hashes and PASS or specific defects.

- [ ] Verify all three corrections and unchanged original20 assertions/order/deadlines/retries.
- [ ] Verify finite metadata and firstfailure preservation; reject unsafe instrumentation before execution.

### Task2: Fresh shared acquisition audit (parallel with Task1)

Owner owner_acquisition_fresh_audit; read-only production source/tests. Own only task4.2-owner-acquisition-fresh-audit.md.

- [ ] Trace completeCategory and Books/Games reader/hook/render authority and revision boundaries.
- [ ] Report source-proven defects separately from hypotheses, with exact lines and smallest deterministic regression.

### Task3: One reviewed original-order Books diagnostic

Owner qa_candidate_preflight; depends on Task1 PASS. Only private overlay/fixture resources, no production edits.

- [ ] Match full frozen hashes; bind provenance; execute original20 order once against owned real backend.
- [ ] Preserve firstfailure/per-iteration command, acquisition and DOM evidence, without probes/retries.
- [ ] Restore canonical96 and prove exact owned cleanup; report counts and skipped obligations.

### Task4: Evidence decision and demonstrated repair

Controller reconciles Tasks2/3. If a defect is demonstrated, original writer gets an exact scoped plan, meaningful failing regression, minimal fix and independent review. If the run passes without a cause, record nonreproduction and the precise remaining evidence gap; do not schedule another equivalent successful run or invent a repair.

- [ ] Separate confirmed cause, ruled-out boundary and unknowns.
- [ ] For a demonstrated defect: regression fails before repair and passes after; relevant local checks and real UI qualification pass.

### Task5: Delivered-slice acceptance and handoff

- [ ] Uninstrumented canonical combined82 with unchanged gates after diagnosed obligations close.
- [ ] Independent receipt/source/artifact review, scoped commit and exact-SHA hosted verification.
- [ ] Consolidate learnings and regroom next category work for user discussion; no batch launch before that discussion.

## Stop conditions

2026-10-04 checkpoint: Books diagnostic18PASS2FAIL; original cover failure did not reproduce, new anonymous Load more failures remain under read-only diagnosis. Independent review confirmed two separate P2 source defects, not attributed to those UAT failures. Parallel repair-plan ownership: proxy_acceptance_resume owns Books hook/account-render regression; qa_candidate_preflight owns Books/Games/Movies adapter fail-stop regressions. Plans require independent review before implementation. No fixture run or shared source changes while planning.

An invalid overlay is rejected as instrumentation failure. Any product firstfailure ends blind reruns and returns to evidence diagnosis. A passing diagnostic cannot erase historical failures. Full parity, operational QA and release readiness remain separate obligations.
