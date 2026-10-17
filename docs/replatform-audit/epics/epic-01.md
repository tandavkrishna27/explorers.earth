# Epic 1: Local development and safe CI

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [1.1](../tickets/ticket-1-1.md) | complete | Preserve accepted scope matrix; update new journey evidence only through its owning ticket. |
| [1.2](../tickets/ticket-1-2.md) | complete; **epic route-graph invariant unmet** | Reuse accepted runtime; new seeds and migrations belong to the consuming feature. **Open obligation (2026-10-05):** extend the route-parity inventory to the landed canonical routes and raise its expected count — shared files, coordinator allocation required. See the correction at the Route-graph invariant below. |
| [1.3](../tickets/ticket-1-3.md) | complete | Preserve required hosted checks and immutable promotion contract. |
| [1.4](../tickets/ticket-1-4.md) | complete | Reuse API-only runtime; preserve build and production dependency gates. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

### Epic exit status — independent review (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6–§7. Epic verdict **INCOMPLETE**. Ticket-level evidence, verified:

- **1.1 ACCEPTED (narrow)** — matrix pinned to `79ef17d0` with every row still `status=planned`; executed evidence is 4 browser results across 2 marketing routes. No hosted run claimed or present.
- **1.2** recorded acceptance re-executed and confirmed, **but the epic's route-graph invariant is unmet** (correction below) and the shared harness was delivered with a different layout than this epic specifies (correction below).
- **1.3 ACCEPTED** — 8/8 hosted runs `success` at `c64a274e`; the branch-protection receipt is a real before/after API readback and still matches live protection as read on 2026-10-05.
- **1.4 ACCEPTED** — 4/4 hosted `success`.

Two epic-level claims are not currently supported and must not be cited as met: **"continuously verifiable"** is false at the review SHA — both protected aggregates (`replatform-required`, `music-required`) were red — and this epic's own **command contract** below references a harness that does not exist. Neither finding reopens an accepted ticket; both are recorded as open obligations at the paragraphs they affect.

# Development, CI and Deployment Implementation Plan

**Database authority:** [Consolidated target schema](../target-database-schema.md). Its table names, ownership, constraints, deletion and indexing contracts supersede the earlier schema investigation; version-specific library generation is an explicit ticket gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the replacement reproducible locally, continuously verifiable, demonstrable on QA and safely releasable on one production host.

**Architecture:** Keep one integration branch and a draft PR, with ticket-sized commits and four tested milestone checkpoints. Build environment-neutral web/API artifacts once, deploy their recorded digests to the former Tunes host for QA, and promote those exact artifacts to the main production host under a separate release decision. The reverse proxy, API and PostgreSQL remain separate services even when colocated.

**Tech Stack:** Existing Node floor >=22.12, TypeScript, npm package lockfiles, Express, PostgreSQL 15, Vitest, Playwright, axe, Docker Compose and GitHub Actions. Retain current test-containment and migration-authority protections.

**Spec:** [Agreed direction](../revised-direction.md), [epics and tickets](../epics-and-tickets.md). This plan owns tickets **1.1–1.4, 3.5 and 8.1–8.5**. Other implementation plans link to 3.5 rather than duplicating its deployment work.

**Status:** This document specifies requirements; the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md) records accepted work and actual test results. Tickets 1.1–1.4 are accepted; 3.5 and Epic 8 are not claimed complete. Host and secret access require their own evidence.

## Global constraints

Apply the [shared execution checklist](../execution-checklist.md) to affected tickets, particularly clean per-package CI, guarded fixtures, atomic migration inventories, runtime image scans and secret-safe phase diagnostics.

- Preserve Explorers screens and behavior; Google-only auth is the explicit visible exception. No followers/community, admin product or monetization.
- Start with an empty application database plus repeatable seeds; no historical import or password migration.
- All implementation epics share one integration branch. Do not change the unrelated working checkout or push before validating deployment triggers.
- Former Tunes server is QA; existing main server is production. PostgreSQL is self-hosted separately on each server; no RDS or other managed database is introduced. Old Tunes availability need not be preserved. QA and production have separate databases, database credentials, persistent volumes and application/session secrets.
- Use one existing S3 bucket, with enforced `qa/` and `prod/` prefixes, and reuse existing AWS credentials subject to permission checks. Shared credentials do not constitute IAM isolation: application policy must derive the prefix from trusted environment configuration, never request input, and real IAM capabilities must be reported honestly.
- Use one Google OAuth client with explicit local, QA and production callback addresses. This does not imply shared web sessions: session secrets, cookies, trusted origins and data remain environment-specific. QA hostname is the sole pending hostname input; do not invent a public domain or provision DNS while waiting.
- Local automated tests and agent-run browser acceptance precede remote validation. Owner UAT is optional; never label agent acceptance as owner sign-off.
- No automatic production deployment from ordinary development pushes. Actual production promotion and old-service shutdown remain separate release actions.
- Keep existing useful tests; replace tests of intentionally removed contracts with tests of the same underlying safety behavior. Never disable a check solely to make CI green.
- Seed/schema ownership is defined by identity/domain tickets. Operations orchestrates their seed and migration commands, and does not invent another data model.

## Review focus

1. A workflow completion or manual dispatch unexpectedly deploys an unfinished branch: 1.3 tests event/ref/environment combinations and 8.4 tests promotion provenance.
2. Fixture tests accidentally reach production or reset a real database: 1.2 rejects unsafe database targets and hosted egress; QA real-provider checks are separately configured.
3. API-only or rename changes silently drop client-side Music safety tests: 1.4 and 8.2 require a behavior-to-replacement coverage map.
4. QA passes but a production rebuild changes embedded frontend configuration: 3.5 builds environment-neutral assets; 8.4 promotes immutable digests.
5. App rollback is mistaken for database rollback: 8.5 restores a disposable backup and validates schema compatibility with the previous application artifact.

## Source anchors and implications

All references are relative to the repository root at the audited source revision. Recheck changed source before execution.

| Evidence | Established behavior | Planning consequence |
|---|---|---|
| `.github/workflows/ci.yml:3`, `:156` | PRs targeting main/develop; pushes to main/develop; E2E is an explicit allowlist | Draft PR targeting main can validate the integration branch. Default Playwright command is not the required CI selection. |
| `.github/workflows/explorers.yml:3` | Successful main `CI Pipeline` completion or manual dispatch builds and deploys frontend | Do not assume all workflows are validation-only. Explicitly guard dispatch and eventual merge. |
| `.github/workflows/tunes.yml:171`, `tunes-deploy.yml:49` | Main push calls production authority; deployment additionally checks main and `GATE_PROD` and uses `tunes-production` | Preserve gates, separate validation from release, inspect actual environment protections before claiming they work. |
| `.github/workflows/tunes-test-direct-deploy.yml:16` | Temporary direct deploy expires 2026-08-28; main only, ARM64, environment named `tunes-production` | This is already expired at audit date. Do not extend or repurpose it as a QA shortcut; replace with explicit QA authority. |
| `.github/workflows/music-reconcile.yml` | Scheduled/manual identity reconciliation has report and apply environments | Never point legacy absence/reconciliation jobs at fresh canonical users. Retire Strapi-dependent job paths with Epic 6 replacement. |
| `tunes/package.json`, `tunes/server/vite.ts`, `tunes/Dockerfile` | Build combines Vite and server; Vite imports duplicate client config; Docker contains Vite build args | Separate API build before deleting the client. |
| `tunes/server/test/integration-global-setup.ts` | Destructive tests require attested loopback DB, migrator role, explicit flag and PostgreSQL 15 | Merely setting DATABASE_URL_TEST is insufficient. Use authority harness, not a permissive ad hoc test URL. |
| `explorers-earth/playwright.config.ts` | Default Chromium project matches every spec, fixture/live/visual projects overlap; one worker and retries in CI | Use named bounded suites; report retry/flakiness and avoid blindly running all projects. |
| `explorers-earth/e2e/music-accessibility.spec.ts`, package manifest | axe already installed and Music accessibility coverage exists | Extend existing harness to profile/Books and category pages; do not claim full accessibility from axe alone. |
| `tunes/server/test/load/` and `test.yml` | Music load/chaos and real PostgreSQL load suites exist, some nightly/manual only | Retain them; add scoped non-Music performance scenarios explicitly rather than claiming existing tests cover all APIs. |
| `docker-compose.yml` | Traefik, PG15, immutable blue/green API slots, candidate gates, Explorers image already described | Reuse useful mechanisms but source configuration is not proof that either current host runs this topology. |
| `explorers-earth/package.json`, `scripts/generate-static-files.js` | Web build runs static generation before TypeScript/Vite | Audit build-time network dependencies and canonical URL output; no hidden production fetch in hermetic CI. |

Branch protection required-check names, GitHub environments, host architectures, available capacity, credentials and provider redirect allowlists remain **unverified external settings**. Source workflow job names are not proof of required-check configuration.


## Ticket 1.1 — Baseline and scope matrix

**Prerequisite:** agreed scope; no implementation dependency.

**Files:** create `docs/replatform/acceptance-matrix.md`, `docs/replatform/evidence/README.md`, `docs/replatform/ci-baseline.md`; inspect existing `explorers-earth/src/routes/{AuthRoutes,ProtectedRoutes,PublicRoutes}.tsx`, `explorers-earth/e2e/`, `docs/testing.md`, `tunes/server/routes/index.ts`, `tunes/shared/music-migration-contract.ts`.

**Interface produced:** one stable scenario ID per retained behavior. Matrix columns: scenario ID, route, persona, preconditions/fixture, action, expected UI/network/storage result, viewport, automated test, manual/provider check, owning ticket, status. Evidence fields: source commit, artifact digest if deployed, environment, command or browser steps, actual result, trace/screenshot path, defects and skipped reason.

- [ ] Inventory every retained route and mark explicit removals (password-only auth and deferred features). Distinguish public routes from owner views and retired endpoints from broken retained features.
- [ ] At implementation start, create the local integration branch before changing application files; do not push or create the draft PR until 1.3 has checked triggers. Preserve unrelated checkout changes.
- [ ] Map each category's create/edit/delete/order/pin/visibility and public navigation behavior; maps/QR, profile/settings/lifecycle, uploads, analytics consent and Music playback/guest/reconnect get separate scenarios. Include anonymous, owner, second owner and suspended personas.
- [ ] Capture desktop/mobile baseline screenshots and current failures using disposable fixtures. Record fixtures/mocks as such, not live E2E. Do not treat stale snapshot updates as proof of parity.
- [ ] Run existing bounded baseline suites after safe provisioning in 1.2, then append actual outcomes here. Record pre-existing failures separately; no invented green baseline.
- [ ] Read GitHub branch/ruleset configuration through authenticated read-only tooling when available and record exact required check names; otherwise mark unavailable, not guessed.
- [ ] Commit only baseline documents/evidence references. **Gate:** the provisional route/scenario matrix unblocks 1.2; baseline executions finish after 1.2 provisions the safe environment, so there is no circular dependency. Final baseline completion requires every retained flow to have an owner/scenario and every claimed result to have a run record.

## Ticket 1.2 — Reproducible local environment

**Prerequisite:** 1.1 fixture personas and scope; final canonical seeds are extended in Epics 2–3.

**Files:** modify root `package.json`/lockfile, `docker-compose.music-test.yml` only where reusable; create `docker-compose.replatform.yml`, `scripts/replatform-local.ts`, `docs/replatform/local-development.md`, `tunes/server/test/contracts/replatform-local-authority.test.ts`; reuse `tunes/scripts/music-uat-database.ts`, `music-compose-safety.ts`, `server/test/integration-global-setup.ts`. Add domain fixture wiring to the seed owner files defined by Epics 2–3.

**Interface produced (new commands, not existing):** `npm run platform:local -- provision|start|check|stop|reset`; `npm run platform:test:integration`; `npm run platform:seed -- --dataset acceptance`. The wrapper records a disposable compose project/database authority and supplies attested environment to existing test processes without printing secrets. Reset accepts only that exact local authority. `start` launches API and existing Explorers Vite app; identity is fixture-only until Epic 2.

**Route-graph invariant:** reuse the Music harness's database authority protections, not its restricted local route composition. The current Music local profile omits optional native auth/analytics/reactivation integrations. The new platform fixture runtime must mount the same canonical application route graph as the replacement production runtime, with external providers injected as fixtures. Add `tunes/server/test/contracts/platform-route-parity.test.ts` and run it before real-API E2E; assert auth, profiles, content, analytics, lifecycle and Music routes are present as their owning epics land. Production must reject fixture session authority even though the route graph is equivalent.

> **Independent review correction (2026-10-05) — this invariant is UNMET.** Verified at `codex/unified-replatform` @ `225d83e5`: `scripts/replatform-route-parity.ts:4-8,23` inventories only six legacy/Strapi/analytics paths — `/api/check`, `/api/csrf-token`, `/api/user/reactivate`, `/api/explorers/analytics/events`, `/api/music-fixture/readiness` (`:4-8`) and `/api/users/me` (`:23`) — and **zero canonical paths**, while `tunes/server/test/contracts/platform-route-parity.test.ts:22` asserts `toBe(6)`, pinning the count to exactly those six. Epics 2–3 have since landed canonical routes, so the "as their owning epics land" clause above is not being honored and the invariant currently passes vacuously for every canonical surface.
>
> **Open 1.2 obligation:** extend the inventory with the landed canonical routes — the Better Auth route group under `/api/auth`, `/api/explorers/v1/me`, `/account/lifecycle` and `/collections` — and raise the expected count at `platform-route-parity.test.ts:22` to match. Do not weaken or delete the existing six probes and do not lower the expected count to accommodate an absent route; a canonical route promised by a landed epic and missing from the fixture graph is a failure, not a skip. Both files are **shared** — every epic landing a canonical route must extend the same inventory — so this change **requires coordinator allocation and an exclusive window** before any writer starts, and no second parity script may be forked. Recorded as an open obligation in [ticket 1.2](../tickets/ticket-1-2.md); 1.2's recorded acceptance is **not** reopened. The production half of the invariant is unchanged.

- [ ] Add failing authority tests: reject production-style hostname, unrecognized database, mismatched compose project, missing attestation and simultaneous test authorities; accept only provisioned local target. Assert reset refuses all other targets before connection or deletion.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/replatform-local-authority.test.ts`; verify specific authority assertions fail before implementing wrapper.
- [ ] Implement wrapper using process argument arrays and hidden Windows child processes. Preserve existing PG15 test authority and isolated DB-per-test semantics; do not weaken integration-global-setup guards. Never recycle protected PowerShell variables.
- [ ] Provision loopback-only database and nonproduction storage adapter. Add deterministic seeds with stable identifiers and idempotent upserts supplied by domain tickets. Keep provider fixture responses out of production paths; real-provider runs use a separately selected nonproduction configuration.
- [ ] Run `npm run platform:local -- provision`, `npm run platform:local -- check`, `npm run platform:seed -- --dataset acceptance` twice. Compare row counts and stable relationships. Run `npm run platform:test:integration`; prove wrong-target rejection with the authority tests, not by attempting to connect to a real production URL.
- [ ] Extend `explorers-earth/e2e/setup/deny-hosted-egress.ts` to the new fixture host allowlist and retain the unit-test containment runner. Confirm fixture provider attempts fail closed.
- [ ] Document prerequisites, ports, stop/reset behavior and OS differences; commit. **Gate:** clean local startup and deterministic seeds work with no production credential/data requirement. Seed evolution is included in every following functional ticket.

## Ticket 1.3 — CI and deployment separation

**Prerequisite:** 1.1 baseline; 1.2 safe test orchestration. Must complete before first implementation push.

**Files:** modify `.github/workflows/{ci,test,music-c0-contracts,tunes,explorers,tunes-deploy,frontend-e2e-qualification}.yml` where triggered scopes change; inspect `music-reconcile.yml`, `tunes-host-preflight.yml`, `tunes-test-direct-deploy.yml`; create `tunes/server/test/contracts/replatform-workflow-authority.test.ts` and `docs/replatform/ci-check-map.md`. Preserve required job names until settings are deliberately reconciled.

**Interface produced:** validation runs for PRs targeting main, including draft PRs, with root/backend/frontend/workflow/fixture/shared paths included. Deploy authority is explicit environment plus digest plus matching recorded source revision. No PR receives SSH/deployment privileges. Suggested branch is `codex/unified-replatform`; branch creation is implementation work, not this planning step.

**Verified configuration gap:** read-only GitHub metadata found no required main status checks and no dedicated QA environment. After observing a real PR run, define an aggregate `replatform-required` check that rejects failed/missing/unexpectedly skipped required jobs; configure the repository rule to require that exact check through authorized repository settings. Record administrator bypass policy. Do not claim CI enforcement from workflow files alone. Create a QA environment restricted to the integration branch with environment-scoped credentials as part of implementation, not this review.

- [ ] Record all relevant workflow triggers, path filters, checkout ref choices, secrets scopes, job dependencies and deploy calls. Check `workflow_run` trust and head revision handling, dispatch main guards, scheduled production jobs and production environment protections.
- [ ] Add a workflow contract test matrix: feature push and PR cannot invoke deployment; main CI completion cannot deploy the new stack without release authority; dispatch on non-main cannot deploy production; failed/skipped validation cannot satisfy release; path changes in shared contracts or workflows run relevant checks.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/replatform-workflow-authority.test.ts` and observe expected failures. Implement explicit conditions and minimum permissions; do not remove unrelated production protection. The expired temporary deploy is not used for QA.
- [ ] Wire bounded local-equivalent checks: lint/type/build, unit/domain, real PG integration/security, named E2E smoke suites. Retain deeper browser/load/chaos lanes as milestone/manual or nightly checks with explicit triggers and evidence.
- [ ] Run changed workflow contract tests and existing `server/test/contracts` suite. Validate workflow syntax with available GitHub/actionlint tooling; do not install tools solely to claim validation when unavailable.
- [ ] Push the integration branch created in 1.1 and create its draft PR only after static trigger review. Inspect real run conclusions and exact source revision. Resolve baseline failures openly; no green-by-skip claim. Record required-check settings separately from source.
- [ ] Commit workflow/check-map changes. **Gate:** feature branch has executed validation, no deployment job was invoked, and required checks resolve. CI syntax tests alone do not establish remote CI success.

## Ticket 1.4 — API-only build seam

**Prerequisite:** 1.2/1.3. No client deletion yet.

**Files:** modify `tunes/package.json`, `tunes/server/index.ts`, `tunes/server/vite.ts`, `tunes/Dockerfile`, relevant startup/runtime modules reached from index; add `tunes/server/test/contracts/api-only-build.test.ts`. Update root runner and affected image/deployment contract tests. Inspect `tunes/server/app.ts` static root serving so API-only mode cannot expose project files.

**Interface produced:** new `npm run build:api --prefix tunes` builds server entry plus migration gate/registration compatibility/production graph smoke entrypoints; `npm run start:api --prefix tunes` starts that artifact cross-platform. Existing combined build remains until 8.2. API-only startup never imports Vite/client config and never serves repository-root files.

- [ ] Add tests for production and development API-only startup with no client build directory: health route succeeds, API miss returns structured error rather than HTML, shutdown closes owned listeners/pools, source/config files are not served.
- [ ] Run targeted test and observe failures. Split build commands and conditional/dynamic development serving dependency; preserve production migration/readiness gate entrypoints.
- [ ] Build API only, run existing server graph/runtime contract tests and smoke local API through the wrapper. Verify a container built without duplicate-client output boots and shuts down cleanly.
- [ ] Run `npm run build:api --prefix tunes`, `npm test --prefix tunes -- --run server/test/contracts/api-only-build.test.ts`, existing `music:types:scoped` and `music:types:baseline`. Full `check` status must be reported separately from scoped baseline status.
- [ ] Commit. **Gate:** API build/runtime is independently valid; deleting the client is still prohibited until equivalent coverage and Milestone 2.


## Test lanes and honest reporting

### Shared real-API browser harness contract (owned by 1.2, completed with identity in 2.1)

These are proposed interfaces to implement, not existing exports. All feature plans consume this one harness rather than inventing separate login shortcuts or test databases.

> **Independent review correction (2026-10-05) — the delivered runner differs from the contract below. Read this before running or citing any command in this subsection.**
>
> Verified at `codex/unified-replatform` @ `225d83e5`. The paragraphs that follow are retained as the **originally proposed** harness contract and remain the statement of the behavioral obligations; they are **not** a description of delivered interfaces.
>
> **What does not exist.** `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/fixtures.ts` and `explorers-earth/e2e/replatform/global-setup.ts` **do not exist**, and the runner is `scripts/replatform-e2e.mjs`, not `scripts/replatform-e2e.ts`. There is no single shared Playwright config and no shared `fixtures.ts` exporting `signInAs(...)`; the delivered runner drives **per-category configs** through the inner fixture runners. A writer must not create those three files on the assumption they were lost, and must not cite them as a delivered interface. Epic 04 is separately affected: six lanes roll bespoke setup because the mandated shared `fixtures.ts` with `signInAs(...)` was never delivered.
>
> **The real command and its only accepted flags.** The platform runner is `scripts/replatform-e2e.mjs`. It accepts **exactly three flags, exactly six arguments** (`scripts/replatform-e2e.mjs:47-49`), and rejects anything else before startup:
>
> ```
> --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt <fresh owned temp dir>
> ```
>
> `--milestone` accepts only the single literal scope token `delivered-auth-profile-books` (`:9`, `:48`); `--ack` accepts only `TASK4_FIXTURE_OWNED_DISPOSABLE_PG15` (`:7`, `:48`); `--receipt` must be an **absolute, not-yet-existing** directory placed directly in the system temp directory and named `replatform-e2e-<8-64 safe chars>` (`:49`). Unknown, duplicated or missing flags fail before any work.
>
> **Proposed, not implemented — on the platform CLI.** The generic spellings `--suite`, `--project`, `--environment` and `--milestone 1|2` (and the `3|4` variants), and the project names `desktop-chromium` and `mobile-chromium`, are **proposed interfaces that the platform CLI does not implement**. Every command in the paragraphs below and in the per-ticket test matrices of the feature epics that uses those spellings is proposed, not executable. Do not report a run as performed on their basis.
>
> **Scope of that caveat: the platform CLI only.** `--suite` **is live on the inner fixture runner** — `scripts/replatform-e2e.mjs:172` passes `['--suite', lane.name]` to `scripts/profile-browser-fixture.ts` for the `auth` and `lifecycle` lanes, and `:166` pins the `explorers:test:{auth,profile,lifecycle}-browser` package targets to those invocations. So `--suite` is non-executable **as a platform-CLI flag**, and executable **as an inner fixture-runner flag**. This narrows the corresponding sentence in the [command custody correction](../command-custody-2026-10-05.md), which overcorrected by describing `--suite` as non-executable without qualification.
>
> The behavioral obligations stated in the proposed contract below — bounded named selection, zero retries for local acceptance, retained failure traces, a missing spec promised by the selected milestone being a failure rather than a silent skip, no flag relabelling a completed milestone to bypass required tests, and production never being an accepted E2E environment — all remain **required** regardless of the flag spellings used to reach them.

**Files:** create root `scripts/replatform-e2e.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/fixtures.ts`, `explorers-earth/e2e/replatform/global-setup.ts`; add `platform:test:e2e` to root package scripts. Specs live under `explorers-earth/e2e/replatform/<feature>.spec.ts`. Projects are `desktop-chromium` and `mobile-chromium` (390×844 viewport); Firefox/WebKit qualification projects may be added without making every PR run every permutation.

**Command:** `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local`. Accepted suites are `auth`, `profile`, `books`, `movies`, `games`, `apps`, `products`, `people`, `places`, `guides`, `music`, `music-owner`, `music-public`, `platform`, `all`; environment is `local` or `qa`. `--suite all` is milestone qualification, not a default quick ticket check. The wrapper uses process argument arrays and supplies environment directly to children, so the command is the same on Windows and Linux; never require shell-specific inline environment assignments. Unknown suite/project/environment fails before startup. Production is not an accepted E2E environment.

Suite mapping includes `places` → `places.spec.ts`, `place-links.spec.ts`, `claims.spec.ts`; `platform` → `public-parity.spec.ts`, `analytics-content.spec.ts`, `deployment.spec.ts`, `no-strapi.spec.ts`; other named suites target their corresponding file.

> **Independent review correction (2026-10-05) — Places suite selection.** The `places` → three-spec mapping above was never changed to match the separated PLACES-CORE gate recorded at `../tickets/ticket-5-1.md:50`, so the prose was corrected there while this gate still pulled downstream specs. Corrected here: **PLACES-CORE qualification must not require `place-links.spec.ts` or `claims.spec.ts`.** Ticket 5.1 qualifies on `places.spec.ts` alone; `place-links.spec.ts` belongs to 5.2 and `claims.spec.ts` to 5.4, and 5.1 is independent of both in the dependency graph, so requiring their specs blocks an unblocked ticket on producers that do not exist.
>
> **No gate is weakened by this.** All three tickets remain **mandatory in full** — 5.1, 5.2 and 5.4 each keep every requirement and negative-test obligation they carry — and the complete `places` → `places.spec.ts` + `place-links.spec.ts` + `claims.spec.ts` selection above remains required for **full milestone discovery** and for `--suite all` / `platform` milestone qualification. A missing spec promised by the selected milestone stays a failure, not a silent skip. Only the narrower PLACES-CORE qualification step is scoped to `places.spec.ts`. The same unchanged pull exists in `epic-05.md:68,130`, which is not owned by this file and must be corrected by its owner. Direct invocation through `npm --prefix explorers-earth run test:e2e -- --config=playwright.replatform.config.ts replatform/movies.spec.ts` is allowed only after the wrapper has provisioned the verified environment. Prefer the root wrapper for normal local/CI execution so no ticket skips authority setup.

Maintain `explorers-earth/e2e/replatform/suite-manifest.json` with required spec paths per suite and delivered milestone. Add `--milestone 1|2|3|4` to the root wrapper, required for `platform` and `all`: milestone1 platform selection includes deployment only, milestone2 adds public-parity/analytics-content, milestone3 adds no-strapi. A missing spec promised by the selected milestone is a failure, not a silent skip. No flag may relabel a completed milestone to bypass its required tests. Later ticket gates use their own suite or the full delivered-milestone manifest. This resolves early QA versus not-yet-implemented retirement scenarios without masking omissions.

**Config behavior:** use testDir `e2e/replatform`, zero retries for local acceptance, retain failure trace/screenshot, HTML/JUnit outputs under `artifacts/replatform-e2e/`. Wrapper provisions/attests disposable DB and starts API plus web for local. QA mode reads only approved QA configuration, verifies its environment marker and exact release manifest, and targets an isolated acceptance dataset. It never sources `.env.production` or derives production access from a default URL. A successful mocked Google callback is separately labelled fixture auth; a real Google smoke is a separate recorded case.

**Shared exports in `fixtures.ts`:** `test` and `expect` extend Playwright; fixtures expose `acceptance: { accountA: { userId: string; accountId: string; handle: string }; accountB: { userId: string; accountId: string; handle: string }; suspended: { userId: string; accountId: string; handle: string } }`, `signInAs(persona: 'ownerA' | 'ownerB' | 'suspended'): Promise<void>`, and `api: APIRequestContext`. Sign-in fixture consumes real session cookies minted through an in-process test factory supplied by identity tests; never ship a public test-login endpoint. QA can receive ephemeral acceptance sessions from a host-side test command restricted to QA, not a production-enabled browser bypass.

**Tests required for harness itself:** reject production/unknown authority before I/O; missing seed manifest fails; database-backed create followed by fresh browser context read preserves the record; other-owner read fails; fixture network interception may replace only external providers and must not fulfill application `/api` calls. `signInAs` creates separate real sessions and cannot turn a suspended user into an active account. Auth assertions belong to Epic 2; this wrapper must not bypass their enforcement. Persisted fixture IDs are read from the seed manifest, never inferred by email.

Feature tickets add their spec and use these fixture exports. Existing rendering/mocked Playwright suites continue separately. Milestone evidence includes browser results plus repository/integration evidence; persistence is not claimed solely from an optimistic UI update.

| Lane | Existing foundation | Required additions / execution rule |
|---|---|---|
| Unit/component | Vitest both packages; contained frontend runner | Run relevant changed domain/components each ticket. Ownership/lifecycle/concurrency tests are mandatory for those changes. |
| Database integration | PG15 attestation, migration suites, role and repository suites | Canonical tables/seeds/constraints added by domain tickets; destructive suite only through disposable authority. |
| Deterministic browser | Playwright category shell/navigation/Music fixtures | New dedicated replatform config targets actual local API for application E2E; mock-only rendering suites remain separately labelled. |
| Real integrations | Existing live Music qualification mechanisms | Google callback, Maps/provider lookup, upload/email as applicable get nonproduction smoke; secrets never in artifacts. |
| Accessibility/visual | axe, Music specs and snapshots | Books/profile/all-category key flows, keyboard/focus/error states, desktop/mobile; deeper cross-browser milestone lane. |
| Security | Music authorization/security contracts | Canonical account ownership, CSRF/session, private nested resources, upload validation and no secret bundle checks. |
| Load/recovery | Music load/chaos and image/compose real-tool tests | Non-Music representative workloads, restart/restore and exact-artifact QA promotion. |

Do not run bare `npm run test:e2e` as a claim of a bounded CI gate: default project matches all specs and overlaps qualification projects. Existing fixture scripts can still depend on the sibling package after client removal; update those dependencies, not the assertions away. Tests run against API mocks do not verify PostgreSQL or real Google. `npm run music:types:baseline` checks a pre-existing type baseline and is not equivalent to full repository type correctness.

## Grooming review result

The backlog covers all operations commitments. Critical dependency corrections are explicit: local authority before destructive tests; safe triggers before push; environment-neutral build before immutable QA promotion; replacement Music client coverage before deletion; rename after removal; QA restore before production readiness. Workflow/secret/host configuration outside source remains an execution-time verification, not an assumed capability. Ticket 3.5 is intentionally here to prevent a second competing QA deployment implementation.

Music suite mapping: `music-owner` selects `e2e/replatform/music-owner.spec.ts`; `music-public` selects `e2e/replatform/music-public.spec.ts`; `music` selects both. All are owned by Epic 6 and run through the same real-stack wrapper.

**Auth qualification update:** [Pinned Better Auth schema and local probe results](../auth-schema-qualification.md) now resolve the generated-schema uncertainty. Application integration, live Google callbacks, recovery negative tests and later delegated issuance/revocation remain named acceptance work.

## Individual ticket files

- [Ticket 1.1: Baseline and scope matrix](../tickets/ticket-1-1.md)
- [Ticket 1.2: Reproducible local environment](../tickets/ticket-1-2.md)
- [Ticket 1.3: CI and deployment separation](../tickets/ticket-1-3.md)
- [Ticket 1.4: API-only build seam](../tickets/ticket-1-4.md)
