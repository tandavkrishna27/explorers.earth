# Claude independent review prompt

Copy the text below into a fresh Claude session with repository access.

```text
Perform a fresh, independent, read-only review of the Explorers unified replatform implementation and planning package. Do not assume previous reviews or status summaries are correct. Use relevant planning, systematic-debugging and verification skills available to you; use fresh subagents for independent domains if available, with no overlapping writes. Do not modify code, fixtures, workflows, plans, Git settings or branch protection; do not commit, push, merge, deploy, trigger CI, contact others or access secret values. Do not run resource-allocating tests or production/QA probes during this review. You may inspect source and existing reports/logs; propose bounded reproductions for unresolved causes.

Repository: tandavkrishna27/explorers.earth
Branch: codex/unified-replatform; existing draft PR119.
Locate the commit titled "docs: reconcile replatform backlog and CI review plan" and record its full SHA. Its parent is the application baseline 1a5c6942bcf2ef59196d5d974ef5a2eea1a25a97. This commit contains planning/audit material, not the uncommitted application repairs.
Local integration worktree, if available:
C:/Users/TK/.codex/worktrees/replatform-audit/explorers.earth-main
Keep tracked committed source, dirty application/fixture overlays, historical receipts and future proposed work separate. Do not reset, stash, clean or checkout over the dirty worktree.

Legacy source: https://github.com/tandavkrishna27/localqr-strapi-v2
Pinned audited SHA: 50b6c6e180de4a1290b0c0a3c8450ac5947566d5.
Compare behavior and typed fields against that source, not memory or schema names alone. If inspecting newer source, explicitly identify changes from the pinned source.

Read first:
docs/superpowers/plans/2026-10-05-replatform-regroomed-execution.md
docs/replatform-audit/implementation-plan.md
docs/replatform-audit/epics-and-tickets.md
docs/replatform-audit/ticket-index.md
docs/replatform-audit/current-status-2026-10-05.md
docs/replatform-audit/execution-packages.json
docs/replatform-audit/execution-checklist.md
docs/replatform-audit/target-database-schema.md
docs/replatform-audit/migration-gap-audit-2026-10-05/README.md and all domain reports
docs/replatform-audit/ci-audit-2026-10-05.md
docs/replatform-audit/command-custody-2026-10-05.md
docs/replatform-audit/individual-plan-review-2026-10-05.md
docs/replatform-audit/individual-independent-review-2026-10-05.md
docs/replatform-audit/plan-corrections-independent-review-2026-10-05.md
Read every one of the38 ticket documents and all10 epic documents individually, plus the four grouped implementation documents and five2026-10-05 repair/execution plans. Identify historical/superseded prose rather than treating it as live status.
If local evidence is accessible, read .superpowers/sdd/epic-01/progress.md and the referenced receipt/review files. This ledger is ignored by Git and is not promised in a remote-only checkout. Missing evidence must be reported as unavailable, never reconstructed as PASS from a summary.

Review these questions:
1. Which original requirements are accepted, delivered only as bounded slices, incomplete, externally blocked or intentionally excluded with actual authorization? Check the recorded completion of1.1–1.4/2.1–2.3, without automatically reopening them or trusting summary counts. Map each partial ticket's requirements to evidence or outstanding obligations. An assigned downstream owner does not satisfy closure.
2. Does canonical backend producer -> mounted route -> active frontend consumer -> fixture -> real-backend acceptance -> hosted exact-SHA evidence close the behavior? Focus auth/profile/lifecycle/media/analytics, Books/Movies/manualGames and all future categories/Music. Check the real Strapi implementation for missed fields, flows and invariants. Never grant canonical UUIDs legacy bearer authority or fake missing producers.
3. Are dependency edges and package qualification/whole-ticket closure/release gates distinct and acyclic? Inspect L0 lifecycle observation/manual-review, CORE-REPLACE revision-checked identity replacement,6.1 token-null Music startup/session HTTP/socket, Places core versus downstream links/claims,5.2 parent revision,7.2 consent/reference ownership,9/10 OAuth sequencing and8.4/8.5 recovery-to-release joins.
4. For each implementation package, are actual versus proposed paths/commands, input/output DTOs, exact ownership, shared-file exclusions, source freeze, meaningful failing regression, acceptance discovery and owned-resource cleanup sufficiently precise? Identify which packages can safely proceed in parallel and what must be frozen first. Preserve retained database music-c10-qualification-2f57782-pg15 on51642; do not touch it.
5. Audit .github/workflows, actual package scripts, Playwright configs, required checks and available hosted logs. At recorded1a5c: image37301052427 and C037301051739 passed; Backend37301051901 and Explorers37301051889 failed. Live-read current results and protection if authorized read access is available. Distinguish first failures from cascading errors, retries, cancellation, unavailable reports and future missing consumers. Inspect proposed zero-retry alignment, JSON/artifact retention, guarded canonical discovery and QA selection; retain both protected aggregates, security/coverage gates and exact artifact provenance. No new sharding, timeout inflation or gate weakening.
6. Are any tickets missing, duplicated, unnecessarily blocked, too large or safely removable? Prefer independently reviewable subpackages to duplicate top-level tickets. Check all ten epics' exit criteria and milestone boundaries. Retain separate merge/release/deployment authority.

Return:
- Findings first, ranked P0/P1/P2, with exact file:line, evidence, first cause versus hypothesis, consequence, smallest correction and owner.
- A38-row individual ticket verdict table and10-row epic verdict table. Do not give only a blanket approval.
- Requirement/evidence gaps and limits, especially missing local ledger or live/provider/QA proof.
- A CI matrix: preserve / change now / change with feature / defer; distinguish production and fixture fixes from workflow fixes.
- Corrected execution sequence, exact next package preflights, safe parallel batches and stop conditions.
- Recommendation on ticket count and remaining plan corrections.
- Verdict: ready for which specific package, or revise before dispatch. Planning approval is not implementation correctness, all-green CI, full parity or release readiness.

Be skeptical and specific. Do not rerun broad suites unchanged, invent test results, sum counts across source freezes, waive required positives, or claim confidence without evidence. Historical auth-qualification probes are archived discovery material, not current executable test entrypoints.
```
