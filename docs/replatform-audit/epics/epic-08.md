# Epic 8: Retirement and production readiness

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current commands:** [Command custody correction](../command-custody-2026-10-05.md) supersedes hypothetical runner commands in historical text.

**Individual review:** [All ticket/epic verdicts](../individual-independent-review-2026-10-05.md); ticket-specific corrections and unresolved dispatch gates are recorded in the canonical ticket files and execution manifest.

## Current execution authority

Individual [ticket plans](../ticket-index.md), [execution packages](../execution-packages.json) and [current status](../current-status-2026-10-05.md) supersede historical sequencing/status prose below. Preserve shared contracts and original acceptance requirements. This epic is not a blanket prerequisite for all its consumers: use reviewed producer interfaces for partial packages and all retained requirements for full closure.

| Ticket | Current disposition | Next owned package |
|---|---|---|
| [8.1](../tickets/ticket-8-1.md) | waiting | Retire Strapi only after full retained parity and separate release decision; verify zero active consumers before deleting compatibility files. |
| [8.2](../tickets/ticket-8-2.md) | waiting | Consolidate approved API-only/Music topology after retirement; retain security and role boundaries. |
| [8.3](../tickets/ticket-8-3.md) | waiting | Rename only after topology stabilizes; verify import/build/runtime references and artifact lineage. |
| [8.4](../tickets/ticket-8-4.md) | waiting | Prepare promotion from same immutable artifacts; production deployment requires separate authorization. |
| [8.5](../tickets/ticket-8-5.md) | waiting | Qualify backup, restore and recovery against approved topology with owned resources; do not touch retained qualification database. |

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); remaining checkboxes are requirements, not completion claims. [Master plan](../implementation-plan.md) · [Backlog](../epics-and-tickets.md) · [Shared execution checklist](../execution-checklist.md)

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


## Ticket 8.1 — Remove remaining Strapi coupling

**Prerequisite:** Milestone 2 technical acceptance; Epics 2–7 have replaced retained paths.

**Files:** use `docs/replatform-audit/source-inventory.json` and `inventory.cjs` to enumerate exact removals; expected affected areas include `explorers-earth/src/graphql/`, `src/lib/localTunesApiClient.ts`, auth stores/coordinators, public-profile adapters, `tunes/server/services/{strapiIdentityGateway,strapiIdentityAbsenceProof}.ts`, gateway adapters, reconciliation workers, fixtures, `.github/workflows/music-reconcile.yml`, `.env.example` files, proxy and SEO generation configuration. Actual consumed paths govern removal, not directory-name matching alone. Add `scripts/check-retired-dependencies.mjs` and `explorers-earth/e2e/replatform/no-strapi.spec.ts`.

**Interface produced:** zero retained application flows requiring Strapi; static check has a narrow allowlist for historical docs/migration provenance only. No Strapi credential/proof env is required for canonical startup.

- [ ] Regenerate inventory; map each occurrence to replacement, historical evidence or justified non-Strapi GraphQL use. Do not delete all GraphQL dependencies blindly.
- [ ] Add browser network assertions that fail retained flow scenarios on Strapi origins or legacy proof routes; test shutdown of canonical account does not call absence polling.
- [ ] Remove replaced runtime modules and configuration in small commits, along with source-dependent reconciliation jobs. Preserve tombstone endpoint behavior where needed to avoid accidentally reopening retired routes.
- [ ] Run new scan, canonical full-stack acceptance and relevant lifecycle/authorization suites. Boot without Strapi variables and with outbound Strapi access denied.
- [ ] Commit and refresh replacement coverage map. **Gate:** both static and runtime evidence; an unused text match is not a runtime dependency, and a successful page load is not proof all writes are detached.

## Ticket 8.2 — Remove duplicate Tunes frontend

**Prerequisite:** 8.1; API-only 1.4; Explorers Music acceptance complete.

**Files:** remove `tunes/client/`, frontend-only `tunes/vite.config.ts` and Vite-serving code after import audit; modify `tunes/package.json`/lockfile, Dockerfile, TypeScript/Vitest configuration, root commands, fixture build scripts and CI scripts referencing client tests. Keep any UI library still imported by server tooling until dependency resolution proves unnecessary.

**Interface produced:** backend has no duplicate frontend build or runtime dependency. Explorers owns corresponding client behavior tests.

- [ ] Map every deleted test, particularly `client/src/lib/musicCredential.test.ts` and `musicPublicationClient.test.ts`, to retained Explorers equivalents. Preserve retry, credential expiry, public capability and idempotency assertions; document genuinely retired behaviors.
- [ ] Remove client/config/imports and regenerate lockfile reproducibly. Do not make unrelated dependency upgrades.
- [ ] Run API build, production graph smoke, contract/unit/database suites, critical coverage using updated source paths, and Explorers owner/guest/reconnect/publication browser scenarios.
- [ ] Inspect packaged image for removed UI assets and verify health/API errors still correct. Commit separately from rename. **Gate:** removal loses no retained behavioral coverage and no runtime imports resolve into client.

## Ticket 8.3 — Mechanical backend rename

**Prerequisite:** 8.2 green checkpoint.

**Files:** move `tunes/` to `apps/api/`; update root runner and npm local package references, Docker build contexts/COPY paths, compose, scripts, workflows, test aliases, scoped TypeScript configs, fixture orchestration, release manifest producer, docs and cache keys. Update `.dockerignore` and generated dockerignore tooling. Frontend directory remains `explorers-earth/`.

**Interface produced:** backend commands use `npm --prefix apps/api`; stable root `platform:*` commands do not change. New image name is `explorers-api`; retain old image digests as rollback references rather than assuming a registry rename copies them.

- [ ] Search tracked files for `tunes/`, `../tunes`, package names and image references; classify historical documentation versus executable paths before move.
- [ ] Perform mechanical move and exact reference changes, update lockfiles/package local dependency paths. No auth/schema/domain changes in this ticket.
- [ ] Run root platform commands, full applicable CI, image build/graph smoke and QA deployment using new paths. Verify both Linux CI and Windows local invocation where the current tools claim support.
- [ ] Commit isolated rename. **Gate:** QA release and required checks resolve new paths; a text replacement alone is not enough.

## Ticket 8.4 — Final production topology and promotion authority

**Prerequisite:** 8.3; extend 3.5 artifacts and QA authority rather than creating competing deployment paths.

**Files:** extend `deploy/platform.compose.yml`, `deploy/platform-routing.yml`, `scripts/platform-release.ts`, `apps/api/server/test/contracts/platform-release.test.ts`; add `.github/workflows/platform-production.yml`; retire/supersede old deployment workflows explicitly and update source tests that describe their authority.

**Interface produced:** production accepts the exact QA-tested release manifest/digests plus production runtime configuration, validates successful evidence for that release and performs serialized migration/readiness/route switch. QA cannot reference the production database or S3 prefix, although both use the accepted shared bucket/AWS credential arrangement. Reverse proxy is the only public ingress; API, self-hosted PostgreSQL and migration job use least-privilege network/roles. Production promotion is an explicit manual release action; successful QA deployment never triggers it automatically.

- [ ] Add tests refusing untested/mutable artifact, mismatched commit, absent QA evidence, missing environment authority and migration failure; failed readiness keeps previous release selected.
- [ ] Test that QA completion cannot dispatch production and that production rejects QA runtime configuration, wrong S3 prefix, reused QA session secret and unknown callback origin. Recheck environment approval rules before dispatch; retain real GitHub protection, not a documented promise of a gate.
- [ ] Configure web fallback only for frontend routes; API errors and socket upgrade must not receive index HTML. Include TLS, forwarded-proxy trust, secure session cookies, graceful shutdown and socket reconnect during restart.
- [ ] Rehearse QA candidate migration, health and readiness, switch, failed-candidate non-switch and previous compatible image rollback. Preserve useful existing advisory lock/checksum/catalog and runtime/migrator-role guarantees.
- [ ] Verify architecture equality or resolve same multi-platform manifest's platform digest on each host. No rebuild after QA; report both index and platform digests if relevant.
- [ ] Run contract, real-tool compose/image and deployment E2E checks. Commit. **Gate:** production mechanism is ready but has not executed merely because tests passed. Explicit release authorization remains necessary.

## Ticket 8.5 — Recovery drill and final web acceptance

**Prerequisite:** 8.4 plus all Milestone 2 scenarios; no unresolved critical defect in owner/private/media/auth behavior.

**Files:** create `scripts/platform-backup.ts`, `scripts/platform-restore-drill.ts`, `docs/replatform/release-and-recovery.md`, `docs/replatform/evidence/milestone-3.md`; tests `apps/api/server/test/contracts/platform-recovery.test.ts`; extend existing `explorers-earth/e2e/` and API load suites for final assertions, not duplicated domain tests.

**Interface produced:** backup manifest references database dump and media snapshot/version manifest, schema/artifact identity, checksums and timestamp; restore drill only accepts a new disposable target and never overwrites QA/production. Runbook distinguishes app rollback, forward fix and data restore.

Create `npm run platform:backup -- --environment qa --output-manifest <file>` and `npm run platform:restore-drill -- --manifest <file> --target <disposable-authority>`. Reject production as a restore target and reject an existing populated namespace. Backup destination, retention, encryption authority and media deletion/versioning policy must be recorded in the nonsecret readiness manifest before this ticket's execution; current secret-name presence does not supply those choices.

**Self-hosted PostgreSQL recovery contract:** backups originate from each host's own database using a backup role with the required read privileges, never browser/runtime credentials. Use `pg_dump` custom format plus a separately protected role/grant inventory; restore into an empty disposable PG15 instance, apply runtime-role grants, then run migration/readiness and application checks. A container-volume copy without a consistent PostgreSQL snapshot is not a valid logical backup. Keep backup credentials and artifacts outside application upload routes.

**One-bucket layout:** reserve `qa/backups/`, `prod/backups/` and `qa/restore-drills/<run-id>/` within the accepted bucket. Application upload APIs cannot address backup/drill prefixes. Inspect existing IAM permissions before assuming backup encryption, version listing or lifecycle changes are possible. Shared AWS credentials may have broad authority, so record this limitation; do not silently create a new AWS principal contrary to the accepted reuse decision. Use existing approved server-side encryption and HTTPS; missing encryption permission is a named gate. Propose a daily backup schedule and 14-day retention as initial engineering defaults in the runbook, confirm compatibility with existing bucket rules and cost before applying, and measure observed recovery duration/data-loss window rather than inventing an SLA.

**Media consistency:** snapshot DB first into a run-scoped manifest, record all referenced object keys and existing version IDs/checksums, and prevent cleanup of that run's referenced objects until backup completion. If versioning is unavailable, copy the referenced bytes to the backup prefix and verify checksums. A list of live mutable URLs is not a restorable media backup. Restore uses new object keys beneath the drill prefix and rewrites restored references; the source QA/prod objects remain untouched.

- [ ] Add failing tests for restore target safety, corrupt checksum, missing media inventory and incompatible schema/artifact pairing. Implement backup/restore orchestration with off-host protected storage and redacted logs.
- [ ] Add failure tests for denied S3 upload/read permission, interrupted dump/upload, absent referenced media, backup-prefix access through application APIs and mixed-environment manifest entries. Partial backups are marked incomplete and cannot become restore candidates; cleanup targets only the run-owned temporary keys after explicit path validation.
- [ ] Restore a QA-seeded backup into a fresh disposable database/storage namespace. Verify accounts/memberships, category counts and ordering, uploaded object hashes, private visibility and Music publication/replay constraints. Measure recovery duration and document observed recovery point; do not invent an SLA.
- [ ] Run complete bounded local/CI regression and agent-driven QA acceptance matrix. Include critical keyboard/focus/error-label checks and axe on existing pages; document pre-existing issues and changed-flow regressions. Never silently replace visual snapshots to hide changes.
- [ ] Extend existing load harness with profile/category paginated reads, recommendation writes and analytics ingestion against realistic deterministic fixtures. Report workload, p50/p95, failures, resource use and baseline delta. Establish a documented capacity budget from measured QA hardware before release; do not claim unrelated Music-only load results cover these routes.
- [ ] Verify recovery, cold restart, invalid config, provider outage and graceful socket reconnect. Check built assets/network for exposed provider secrets and unexpected hosted dependencies.
- [ ] Write final evidence and explicit old-service retirement checklist (DNS/proxy, scheduled jobs, unused secret references, obsolete images/volumes retention). No destructive shutdown or deletion is performed as a planning/documentation action.
- [ ] Commit final report. **Gate:** all required retained flows pass with no unexplained skips; remote CI and QA identify the exact release; recovery works; remaining provider/credential limitations block the affected claim rather than being hidden.


## Test lanes and honest reporting

### Shared real-API browser harness contract (owned by 1.2, completed with identity in 2.1)

These are proposed interfaces to implement, not existing exports. All feature plans consume this one harness rather than inventing separate login shortcuts or test databases.

**Files:** create root `scripts/replatform-e2e.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/fixtures.ts`, `explorers-earth/e2e/replatform/global-setup.ts`; add `platform:test:e2e` to root package scripts. Specs live under `explorers-earth/e2e/replatform/<feature>.spec.ts`. Projects are `desktop-chromium` and `mobile-chromium` (390×844 viewport); Firefox/WebKit qualification projects may be added without making every PR run every permutation.

**Command:** `npm run platform:test:e2e -- --suite books --project desktop-chromium --environment local`. Accepted suites are `auth`, `profile`, `books`, `movies`, `games`, `apps`, `products`, `people`, `places`, `guides`, `music`, `music-owner`, `music-public`, `platform`, `all`; environment is `local` or `qa`. `--suite all` is milestone qualification, not a default quick ticket check. The wrapper uses process argument arrays and supplies environment directly to children, so the command is the same on Windows and Linux; never require shell-specific inline environment assignments. Unknown suite/project/environment fails before startup. Production is not an accepted E2E environment.

Suite mapping includes `places` → `places.spec.ts`, `place-links.spec.ts`, `claims.spec.ts`; `platform` → `public-parity.spec.ts`, `analytics-content.spec.ts`, `deployment.spec.ts`, `no-strapi.spec.ts`; other named suites target their corresponding file. Direct invocation through `npm --prefix explorers-earth run test:e2e -- --config=playwright.replatform.config.ts replatform/movies.spec.ts` is allowed only after the wrapper has provisioned the verified environment. Prefer the root wrapper for normal local/CI execution so no ticket skips authority setup.

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

## Independent review correction (2026-10-05)

**Epic verdict: NOT-STARTED.** All five tickets (8.1–8.5) are unstarted. Every requirement and gate in this epic and in its ticket files is retained. The per-ticket evidence lives in the canonical ticket files; this section records only the epic-level corrections.

### Epic-level exit criteria (previously missing)

Until now this epic defined closure only as the union of its five tickets' gates. That is insufficient: several of the obligations below are cross-ticket and would otherwise have no owner at closure. These are epic-level exit criteria, additional to — never in place of — every ticket gate:

- [ ] **No Strapi requirement anywhere in the startup path.** The canonical application boots with no `STRAPI_*` variable set and with outbound Strapi access denied, in all three compose files (`docker-compose.yml`, `docker-compose.replatform.yml`, `deploy/platform.compose.yml`), and both 8.1 subpackages (8.1a server/compose/workflow, 8.1b frontend) are accepted on their own evidence.
- [ ] **Exactly one promotion authority exists.** The retirement/supersession decision owed for `.github/workflows/explorers.yml` (dead at `:15`, `if: ${{ false }}`) and `.github/workflows/tunes-deploy.yml` is recorded and executed, and no two live production promotion paths remain.
- [ ] **Production promotion still requires a second human after the migration.** The `required_reviewers` and `prevent_self_review` protection currently carried by the `tunes-production` environment is reproduced on whichever environment the replacement workflow binds. Protection must be verified against the live API, not asserted from workflow source.
- [ ] **The 8.5 recovery receipt is a required workflow step, not prose.** The promotion authority fails closed on a missing, stale or failed recovery receipt for the exact candidate. 8.4 is not mechanism-complete until that step exists.
- [ ] **No milestone is relabelled to close this epic.** Every browser/CI receipt cited at closure is re-attested at the exact closure SHA; a count carried over from an earlier freeze is not a receipt.
- [ ] **No destructive retirement is performed as a documentation action.** Old-service shutdown, DNS/proxy changes, secret deletion and volume/image deletion remain separate authorized operational actions with their own records.

### Harness milestone contract — proposed, not implemented

The command contract above at `epic-08.md:176` specifies `--milestone 1|2|3|4` on the root wrapper with a `platform` lane mapping to `public-parity.spec.ts`, `analytics-content.spec.ts`, `deployment.spec.ts` and `no-strapi.spec.ts`, and `:172` lists fifteen accepted suites. **The implemented runner does not support any of that.** Measured:

- `explorers-earth/e2e/replatform/suite-manifest.json:3` declares `"scope": "delivered-auth-profile-books"`.
- `scripts/replatform-e2e.mjs:9` defines that single literal as `SCOPE`, and `:47-48` require exactly three flags (`--milestone`, `--ack`, `--receipt`) with `--milestone` **equal to that one token**. Any numeric milestone value fails before startup.
- `scripts/replatform-e2e.mjs:11` fixes the lane set to `auth`, `profile`, `books`, `lifecycle`, `movies`, `games`. There is **no `platform` lane**, and `explorers-earth/e2e/replatform/no-strapi.spec.ts` does not exist.

The numbered-milestone spelling and the `platform` lane are therefore **proposed interfaces, not implemented runner behavior**, and the text at `:170-176` is retained as historical proposal. The *obligations* it carries — a maintained per-lane manifest, a missing promised spec being a failure rather than a silent skip, and no flag relabelling a completed milestone — remain required and are unchanged. A dispatched writer must read `scripts/replatform-e2e.mjs` for the current invocation, per the [command custody correction](../command-custody-2026-10-05.md).

Separately, the 8.1 Files paragraph duplicated at `epic-08.md:87` names `explorers-earth/src/graphql/`, which **does not exist**. The corrected list and the measured retirement denominator are in `../tickets/ticket-8-1.md`; the duplicate above is retained as historical text and is not the authority.

### Text duplication across epics 08–10

The ticket bodies in this epic (`:83-161`) are triplicated verbatim: once in the canonical ticket files under `../tickets/`, once here, and once in the grouped implementation documents. This directly contradicts the principle each ticket file states — that shared contracts are "maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions" — and it is how divergence such as the stale `src/graphql/` path survives in one copy after being corrected in another.

**Recommendation (not applied in this pass):** reduce this epic file to the disposition table plus links to the canonical ticket files, keeping only genuinely epic-level content (global constraints, review focus, source anchors, harness contract, the exit criteria above). **No requirement text is deleted in this pass** — doing so needs the coordinator's agreement on which copy becomes authoritative, and a check that nothing cites the epic's line numbers. Until then, the canonical ticket files under `../tickets/` are the authority where the two copies disagree.

## Individual ticket files

- [Ticket 8.1: Remove remaining Strapi coupling](../tickets/ticket-8-1.md)
- [Ticket 8.2: Remove duplicate Tunes frontend](../tickets/ticket-8-2.md)
- [Ticket 8.3: Mechanical backend rename](../tickets/ticket-8-3.md)
- [Ticket 8.4: Final production topology and promotion authority](../tickets/ticket-8-4.md)
- [Ticket 8.5: Recovery drill and final web acceptance](../tickets/ticket-8-5.md)
