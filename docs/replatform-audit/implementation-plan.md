# Unified Explorers implementation plan

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

**Corrected current status (2026-10-05, after independent review).** Authority for this paragraph: the independent read-only review of `codex/unified-replatform` @ `225d83e5`. Supporting status surfaces: the [re-groomed recovery plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), the [durable ledger](../../.superpowers/sdd/epic-01/progress.md) and the [status summary](current-status-2026-10-05.md).

- **Seven tickets are complete as recorded, and every recorded piece of evidence verified.** All seven acceptance SHAs resolve on the branch and all 18 hosted run IDs the ledger cites resolve to the correct head SHA with conclusion `success`. **1.1, 1.3, 1.4, 2.1, 2.2 and 2.3 hold. 1.2 is accepted-with-an-open-invariant, not plainly complete:** its recorded acceptance was independently re-executed, but it does **not** close the epic-01 route-graph invariant — the parity inventory still lists six legacy/analytics paths and zero canonical entries for the Better Auth route group under `/api/auth`, `/api/explorers/v1/me`, `/account/lifecycle` or `/collections` entries, and the shared harness was delivered with a different layout than the epic specifies. Treat 1.2 as ACCEPTED-acceptance / INCOMPLETE-invariant wherever it is summarised.
- **2.3's cited acceptance SHA is mislabelled.** `8ce52776…` is an acceptance-time hosted head containing no 2.3 source; the delivering commit is `79edeea8`. The acceptance itself stands.
- **Hosted state at the review head `225d83e5`:** API image SUCCESS, Music C0 SUCCESS, Backend validation FAILURE (`music-required` FAILURE, `browser` FAILURE), Explorers validation FAILURE with Category A, Category B and Publishing all failed, Public shell SUCCESS, Music-and-account still running — so `replatform-required` had not concluded. Both protected aggregates (`replatform-required`, `music-required`) were also red at the application baseline `1a5c6942`, and three of four lanes were red at `46eea549`. **No merge, release or QA-deployment decision is supportable from this branch today.** Note that `music-required` is emitted by "Backend validation", not by the green "Music C0 contracts" workflow.
- **Corrected verdict spread across the 38 tickets:** 6 ACCEPTED, 5 INCOMPLETE, 6 BOUNDED-SLICE, 1 BLOCKED-EXTERNAL, 20 NOT-STARTED. Epics 01–04 and 06–07 are INCOMPLETE; epics 05 and 08–10 are NOT-STARTED. Per-ticket verdicts are carried in the [individual ticket index](ticket-index.md).
- **Corrected execution order and next package:** see [Corrected execution order](#corrected-execution-order-2026-10-05) below. Zero packages are dispatch-ready as written; the nearest is **6.1 / M2 (token-null Music startup)**, and it may be dispatched only after the listed preflights.
- **Structural gap in the ticket documents themselves:** all 38 ticket docs exist (38 ticket files, 10 epic files) and **every checkbox in all 38 is unticked — 262 of 262 — including in the seven claimed-complete tickets.** No per-requirement disposition is therefore recordable from the tickets themselves; ticket-level status lives only in the ledger and the status docs. `[ ]` is a requirement, never a receipt, so the fix is not to tick them but to keep per-requirement disposition in the ledger and say so here.
- Preserve the accepted foundations and the bounded Books / Movies / manual-Games / analytics results as *bounded* results. New navigation/lifecycle overlays still need their stated review and exact-commit gates; see the overlay-vs-committed rules in the [shared execution checklist](execution-checklist.md). Required all-category QA remains open until its actual producers land.

**Goal:** evolve Tunes into the unified backend while preserving the existing Explorers experience, then add ChatGPT through the same application services.

**Architecture:** existing React frontend; TypeScript modular backend, fresh PostgreSQL database and reviewed migrations; Better Auth with Google-only login; separate login identity and account-owned content. Shared entities plus account-owned recommendations; retained Music domain behavior. One integration branch, local-first testing, QA on the former Tunes host and production on the main host.

**Sources:** Explorers main at `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`; Strapi main at `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`. [Agreed direction](revised-direction.md), [backlog](epics-and-tickets.md), [Strapi schemas](strapi-schema-inventory.md), [original runtime inventory](source-inventory.md).

**Review:** all 38 tickets are covered across ten individual plans. See [review findings and resolved dependencies](plan-review.md). Read the [shared execution checklist](execution-checklist.md) for current handoff and verification requirements; the ledger records actual implementation evidence.

**Final grooming gate:** read [readiness, S3 delivery and external inputs](readiness-and-inputs.md) before authorizing implementation. The second independent review corrected six feature-contract gaps and deployment/media details. Google OAuth, AWS delivery policy, QA routing/access and repository configuration still require closure; secret-name presence is not proof of readiness.

## Database source of truth

Read the [consolidated target database schema](target-database-schema.md) before schema work. It includes application columns, keys, constraints, indexes, lifecycle rules, existing Music transformations, field mappings and scale/restore qualification. Better Auth physical generation remains an explicit version-qualification gate; no migration has been applied.

## Read and execute order

Each epic and each of the 38 tickets has its own document. Use the [individual ticket index](ticket-index.md) to open any ticket. Ticket files include their implementation steps and acceptance criteria, and link to the parent epic for shared contracts and harness prerequisites. `[ ]` indicates planned work, never completed work.

| Milestone | Epic plan | Depends on |
|---|---|---|
| 1 | [1. Local development and safe CI](epics/epic-01.md) | Agreed scope |
| 1 | [2. Google identity and accounts](epics/epic-02.md) | 1 |
| 1 | [3. Core recommendations and Books](epics/epic-03.md) | 2; QA ticket uses 1's deployment boundary |
| 2 | [4. Catalog categories](epics/epic-04.md) | 3 |
| 2 | [5. Places and Guides](epics/epic-05.md) | 3 and linked Products/People from 4 |
| 2 | [6. Music identity and parity](epics/epic-06.md) | 2's principal contract, 3's backend foundation |
| 2 | [7. Cross-category completion](epics/epic-07.md) | 4–6 |
| 3 | [8. Retirement and deployment](epics/epic-08.md) | Milestone 2 evidence |
| 4 | [9. Public ChatGPT discovery](epics/epic-09.md) | Milestone 3 |
| 4 | [10. Linked creator tools](epics/epic-10.md) | 9 and shared web commands |

Execute ready prerequisites using the corrected dependency order below: shared repair review, lifecycle acceptance and Music principal startup, independent category packages, then full public/analytics parity. Category work can be parallelized only after shared contracts are fixed and file ownership is clear. Parallel planning does not require parallel implementation. Avoid simultaneous edits to auth, shared schema or deployment authority without coordination.

### Corrected execution order (2026-10-05)

This supersedes any earlier ordering prose in this file and in the historical backlog. The graph was rebuilt and independently verified against `execution-packages.json` by topological sort: **38 nodes, acyclic (all 38 ordered), no dangling prerequisite, no duplicate id, single root at 1.1, and a longest path of 21 tickets / 20 edges.** Stated both ways because "longest chain 20" was ambiguous between nodes and edges.

```
1.1 → 1.2 → {1.3 ‖ 1.4} → 2.1 → 2.2 → {2.3, 3.1-verify}
    → {3.2, 3.4, 6.1(M1→M2→M3), 2.4(L0→L1…)} → 3.3
    → {4.1, 4.2-provider, 4.3, 4.4, 4.5, 5.1} → {5.2, 5.3, 5.4, 6.2} → 6.3
    → 3.5(Q1→Q2) → 7.1(shared→full) → 7.2 → 7.3 → 3.5(Q3)
    → 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 9.1 → {9.2, 10.1} → 10.2 → 10.3
```

Two corrections are already folded into that order: 3.1's revision-checked replacement edge becomes a **verification** step rather than a producer, so no category waits on it; and 3.5-Q2 precedes 7.1-full, because the trusted-candidate blocker is what gates 7.3's hosted evidence.

**Ticket count stays at 38.** Every mandatory requirement traced has exactly one owner, and the duplications found are **file** duplications (`AuthSyncManager.tsx`, `Settings/api/mutation.ts`), not requirement duplications — so adding tickets would create the duplicate-owner problem this plan currently avoids. The under-specified layer is the **package** layer: formalise 2.4 into four subpackages and 3.1 into two, giving roughly **44 dispatchable packages under 38 tickets**. The one genuinely oversized ticket is **8.1**, which should split into **8.1a** (server, compose and workflow retirement) and **8.1b** (frontend Apollo / Strapi-REST retirement) as subpackages under the same ticket number. Nothing is safely removable.

**Next package to dispatch: 6.1 / M2 (token-null Music startup).** It is the only package with a frozen input signature, a genuine falsifiable failing regression and no contested file. It is **not** dispatchable until these blocking preflights are closed by their owners:

1. **Supersede ADR-005 with ADR-006** (currently being drafted as Proposed). Until then the accepted ADR still mandates the proof boundary that 6.1 exists to delete, and a writer following ADR authority would rebuild it.
2. **Withdraw the false "not delivered" claim** about the revision-checked replacement package, and correct the dependency-edge checkpoints that carry it. The code is implemented and route-mounted; only the UI consumer is absent.
3. **Reserve `scripts/replatform-e2e.mjs`, `explorers-earth/e2e/replatform/suite-manifest.json` and `tunes/scripts/*-browser-fixture.ts` to the coordinator**, and delete the conflicting manifest-ownership clause.
4. **Restate the source freeze as repo-subtree-wide** — the runner snapshots whole subtrees, so implementation may overlap but protected qualification takes an exclusive window, and every new file must be tracked before any lane runs.

## Invariants across every ticket

1. Existing Explorers visual design, navigation and working behavior remain; Google-only login is the explicit exception. Backend wiring may change.
2. One user initially owns one account. Accounts own profile/recommendations/guides/Music, with membership designed for future expansion but no switching UI now.
3. A fresh database removes historical migration, not transactional, authorization, lifecycle or recovery requirements.
4. No followers/community, new admin UI, monetization or revived retired integrations. Public profiles remain.
5. Separate databases, volumes and application secrets; one shared Google OAuth client and one S3 bucket with environment prefixes. Existing AWS credentials may be reused after permission checks; do not equate shared-principal prefix naming with IAM isolation. No test writes against production. Existing secrets are configuration inputs, not evidence of verified access.
6. Update CI with code. Before pushing, prove validation does not deploy unfinished code. Manual workflow dispatch is not automatically safe merely because it is manual.
7. Keep package paths under `tunes` until Epic 8; rename to `apps/api` there. Later plans use the renamed path. No unnecessary frontend folder move.
8. Unexecuted, skipped or mocked checks are not full-stack/live-provider success. Report them distinctly.
9. No user approval is required per ticket once implementation is authorized; milestone reports include optional owner UAT. Production promotion/publication remain explicit release decisions.

## Testing and evidence contract

| Layer | Required evidence and scope |
|---|---|
| Static/build | Relevant TypeScript, lint, contract/schema checks and production build; record existing baseline failures rather than silently suppressing them |
| Unit/domain | Validation, ownership policy, visibility, entity resolution, revisions/idempotency, event/privacy logic |
| Database integration | Disposable authorized PostgreSQL; real constraints/transactions/rollback and cross-account reads; test selection must execute, not skip |
| HTTP integration | Cookie/session/CSRF, authenticated/anonymous DTOs, pagination, uploads, rate limits and provider failure translation |
| Automated E2E | Real web + API + disposable DB, fixture users through a test-only authority; create/edit/publish/reload and anonymous/other-owner results |
| Browser acceptance | Agent-controlled actual screens, desktop/mobile navigation/forms/errors; screenshots/traces when useful; optional owner testing |
| Real integrations | Google callback and representative catalog/media/Music provider checks using QA configuration; fixture simulations recorded separately |
| Accessibility | Keyboard flow, focus, labels and critical contrast/semantic regressions on touched screens; automated accessibility checks where available, plus browser inspection |
| Performance | Baseline and repeat representative public list/detail, category search and Music/socket behavior with the same dataset; set justified limits before acceptance, no invented universal target |
| Security boundary | Other-owner and private-resource denial, unsafe upload/URL handling, no frontend provider secrets, revoked/suspended access and redacted artifacts |
| Operational | CI trigger behavior, immutable QA artifact, cookies/socket proxying, health/readiness, backup/restore and release gating |

The existing category Playwright tests often stub GraphQL and authentication. Retain them as UI regression checks while adding an explicitly real-API suite. The existing Music database harness requires authority/flags and can otherwise skip; execution counts and non-skipped required suites are part of the pass criteria.

**Measured evidence gap (2026-10-05) — the contract above is not yet enforced by CI.** The canonical browser suite and its runner entry point appear in **no workflow at all**: `platform:test:e2e` is declared only at `package.json:50` (`node scripts/replatform-e2e.mjs`) and matches nothing under `.github/workflows/`, and no workflow references `e2e/replatform` — so none of the 22 files under `explorers-earth/e2e/replatform/` (including `lifecycle.spec.ts` and `analytics.spec.ts`) is ever executed by a hosted run. Consequences, all of which the rows above assume away:

- Every real-backend browser receipt in this programme is **local-only and never re-attested at an exact SHA**. The canonical lifecycle receipt in particular has no hosted counterpart.
- The two protected aggregates are fed instead by the *legacy* specs, so a canonical replacement can be authored, reviewed and merged without any required lane ever running it.
- Registering the canonical suite is therefore a prerequisite for retiring any legacy spec, and the registration must carry a **one-to-one behavioural map** from the retired cases to the canonical ones. Register the canonical suite **before** retiring the legacy spec, never the other way round.
- Authored-but-unregistered identities must be reported as **authored, 0 attested** and never as a pass. A count of authored test identities is not an execution count.

This is an evidence-contract gap, not a licence to weaken any row above. Do not relax a required lane, shorten a timeout or delete an assertion to close it.

### Milestone report format

- Scope delivered and tested commit/artifact.
- Local automated checks: passed/failed/blocked with executed test counts.
- Real-API E2E and browser acceptance: scenario results and evidence links.
- Remote CI: actual run status; do not substitute local status.
- QA deployment/integrations: tested environment and provider coverage.
- Defects, skipped checks and limitations, each with owner/next action.
- Optional owner demo steps; no assumption of owner sign-off.

## Grooming rules

For each ticket, confirm the file scope and shared interfaces against the pinned source before implementation. If actual main changes, refresh the baseline and explain meaningful drift. Proposed files are explicitly new; current files must resolve. Proposed commands must be implemented by their owning prerequisite before later tickets use them.

The detailed plans identify package-compatibility or external-config qualification steps where source alone cannot establish behavior. Those are executable prerequisites, not permission to invent supported library APIs. A ticket blocked on provider access remains blocked and cannot be counted complete through mocks.

Implementation plans are review artifacts. They may contain proposed schema and test file names, but no migrations, new runtime modules, or production configuration have been created by this planning task.

## Latest hosting agreement

Self-hosted PostgreSQL runs alongside the app on each existing host; no Amazon RDS or additional database service. Promote the same QA-tested artifact to production only at the release step, using runtime configuration and production migrations, never QA content. See the [owner setup checklist](owner-setup-checklist.md) for remaining input ownership.

**Auth qualification update:** [Pinned Better Auth schema and local probe results](auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.
