# Ticket 3.5: QA deployment and Milestone 1 evidence

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-03.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** open. **Technical inputs:** 1.3, 1.4, 2.4, 3.3, 3.4. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package Q1: artifact and readiness preparation now. Q2: selected milestone acceptance and required hosted gates. Q3: actual QA only after separate deployment decision; retain provider limitations.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Grooming focus:** keep migration manifest, generated inventory, readiness, privileges and deploy schema floor in the same reviewed change. Prove a clean `npm ci`/build/test in each CI package and inspect the actual runtime image scan. Guard real-API fixtures and synthetic identities before browser acceptance; classify build, registry, fixture and provider failures with secret-safe phase diagnostics.

**Prerequisite:** 1.3/1.4 and 2.1–3.4 technically complete; Books/profile acceptance fixtures exist. This is the sole detailed owner of ticket 3.5.

**Files:** create `.github/workflows/platform-candidate.yml`, `.github/workflows/platform-qa.yml`, `deploy/platform.compose.yml`, `deploy/platform-routing.yml`, `scripts/platform-release.ts`, `docs/replatform/qa-runbook.md`; modify `explorers-earth/Dockerfile`, frontend environment adapter/Vite proxy, `scripts/generate-static-files.js` as needed for environment-neutral build; create `tunes/server/test/contracts/platform-release.test.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/deployment.spec.ts`.

**Interface produced:** `ReleaseManifest { sourceCommit, apiImageDigest, webImageDigest, schemaVersion, testEvidenceRef }`; a single multi-platform manifest is allowed when host architectures differ. New `npm run platform:release -- verify --manifest <file> --environment qa|production` validates identity/architecture/schema compatibility without deploy. QA workflow accepts a verified manifest and deploys only to QA environment. Same-origin `/api` and `/socket.io` are environment-neutral; public runtime configuration contains no secrets and is explicitly allowlisted.

**Artifact producer:** `platform-candidate.yml` is manual dispatch on the integration branch, verifies the chosen source revision's required CI result, then builds/scans/publishes both images once. Extend the manifest with `producerRunId`, `producerWorkflow`, `manifestDigest` and provenance. QA consumes the artifact from that verified run, not a caller-authored manifest or arbitrary tag. Candidate publishing has registry permissions but no SSH deployment credentials; QA holds QA-only authority. Production checks the same source/digests and QA evidence independently.

**Manifest integrity:** `manifestDigest` is a detached SHA-256 over canonical UTF-8 JSON excluding that field, avoiding a self-referential hash. Verify the producer workflow's trusted repository/run/source identity and artifact attestation, not merely an attacker-supplied digest. For different architectures, use one immutable multi-platform index plus recorded per-platform digests, run each platform's image smoke, and deploy the recorded platform image. Same source alone is not proof that two independently rebuilt binaries are the same tested artifact.

**Nonsecret readiness manifest:** create `deploy/environments/qa.example.json` and `production.example.json` as validated templates. Pin host alias, SSH user/port, pinned-host-key source, architecture, Docker/Compose version, public origin, internal ports, PostgreSQL volume/database identifiers, S3 bucket name and exact environment prefix, Google client configuration reference/callback, and secret-store references (names only). Real secrets are runtime-injected. QA hostname remains pending; local work and workflow unit tests continue, but DNS/TLS/real callback acceptance cannot be marked complete until it is supplied.

**Runtime configuration:** allowlist only public origin, same-origin API/socket paths, restricted browser Maps key and explicitly enabled public analytics identifiers. Inject auth/provider/AWS secrets only into the API process. Render environment-dependent canonical metadata and robots rules at runtime/configuration mount without rebuilding images. QA is noindex and must not publish production sitemaps as QA URLs. Build once does not mean copying QA runtime secrets/configuration into production.

- [ ] Verify host architecture, disk/memory, Docker support, DNS/TLS ownership and environment secret **names/presence**, without revealing values. Existing secrets are an input to verify, not an established fact of tool access. Missing permissions/callbacks are reported as concrete blockers.
- [ ] Validate the two readiness manifests: different hosts, database credentials/volumes and app secrets; one S3 bucket with exactly `qa/` versus `prod/`; one Google client with the exact allowed callback set. Test missing QA hostname fails deployment validation with a named configuration error. Configure the real redirect addresses through the existing Google project; never ask for a secret pasted into chat.
- [ ] Test S3 key construction with traversal, encoded separators, absolute keys and requested `prod/` keys from QA. The server must reject caller-supplied object keys outside its environment and account scope. Check actual permissions using a disposable QA object only; do not probe production writes to prove isolation. Record whether the reused AWS principal can access both prefixes, and do not claim IAM isolation when it can.
- [ ] Add failing release tests rejecting mutable tags, unknown source, wrong environment, mismatched manifest digest, incompatible architecture/schema and public configuration containing server credentials.
- [ ] Build API and frontend once from the same commit. Eliminate environment-specific Vite endpoint compilation: same-origin endpoints by default; browser-exposed map keys if required come through public runtime configuration with domain restrictions. Do not move secret catalog keys into runtime browser config. Ensure static SEO build does not fetch production data or hardcode QA canonicals into promoted assets.
- [ ] Implement same-host proxy paths including sockets and Google callback. Run PostgreSQL 15 in a persistent container on each host with no public port, distinct migrator/runtime roles and environment-specific credentials/volumes. Deploy QA to former Tunes host only. No request to preserve old Tunes uptime is required.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/platform-release.test.ts`; compose validation in a context that redacts secret interpolation; image graph/health smoke. Configure deployment concurrency to serialize QA releases.
- [ ] Deploy the verified release to QA after implementation deployment authorization. Run `npm run platform:test:e2e -- --suite platform --milestone 1 --project desktop-chromium --environment qa`, then the auth/profile/books suites through the same wrapper with named QA authority and disposable QA acceptance users. The milestone-1 selection must not require unimplemented later categories. Test public/private, other-owner denial, uploads, reload/deep link, cookie flags, socket handshake and real Google callback separately.
- [ ] Repeat auth/profile/books acceptance using `--project mobile-chromium`; inspect keyboard focus, validation, loading/error states, upload replacement and anonymous reload through browser control. Capture actual before/after persisted results, screenshots/traces and request failures. Google popup/consent interactions requiring a human are reported explicitly; test-session fixtures do not substitute for this provider check.
- [ ] Publish `docs/replatform/evidence/milestone-1.md`: local suite results, GitHub runs, QA digest, real-provider results, skipped cases and owner demo steps. **Gate:** no required failing/skipped acceptance case is called passing; owner review is at milestone, not each ticket.


## Acceptance sequencing (2026-10-05)

Prepare nonsecret readiness/artifact verification independently. A selected Milestone-1 feature matrix must not require unimplemented future categories, but this does not waive or reroute existing mandatory hosted jobs. Category B currently17 PASS/9 FAIL and publishing startup remains red; map those requirements to 4.3–4.5/5.1/5.3/6.1–6.3/7.1 rather than repeatedly repairing mocks. Dirty-source navigation6 and lifecycle12 receipts are not exact-commit hosted or deployed QA proof. Deploy QA only after its separate authorization; do not claim whole3.5 or release acceptance from the successful1a5c API image.


## Independent review correction (2026-10-05)

Q1 preparation requires no green deployment claim. Q2 trusted-candidate creation explicitly remains blocked by required hosted Backend/Explorers failures at the current committed checkpoint. Q3 requires Q2 plus exact artifact provenance, selected QA fixture coverage, real configuration/permissions and separate deployment decision. Do not weaken required checks to unblock candidate production.

### No artifact producer exists (verified 2026-10-05)

**Both workflows mandated by the `**Files:**` line at `:33` and by the `**Artifact producer:**` section at `:37` are absent from the repository.** Checked path-by-path at `225d83e5`; `.github/workflows/` contains exactly `ci.yml`, `explorers.yml`, `frontend-e2e-qualification.yml`, `music-c0-contracts.yml`, `music-reconcile.yml`, `test.yml`, `tunes-deploy.yml`, `tunes-host-preflight.yml`, `tunes.yml`.

| Mandated path | State |
|---|---|
| `.github/workflows/platform-candidate.yml` | **DOES NOT EXIST** |
| `.github/workflows/platform-qa.yml` | **DOES NOT EXIST** |
| `explorers-earth/playwright.replatform.config.ts` | **DOES NOT EXIST** |
| `explorers-earth/e2e/replatform/deployment.spec.ts` | **DOES NOT EXIST** |
| `scripts/platform-release.ts` | exists |

Consequences, stated plainly:

- **Q2 trusted-candidate creation cannot be attempted at all.** It is not merely blocked by red gates; the producer that would build, scan, publish and attest the images does not exist.
- **`scripts/platform-release.ts` has no trusted producer to verify.** The `producerRunId` / `producerWorkflow` / `manifestDigest` provenance contract at `:37`–`:39` has no workflow emitting it, so any manifest it verified today would be caller-authored — exactly what `:37` forbids. This is why the verifier's own evidence self-labels synthetic with placeholder digests.
- [ ] **Q1 is hereby scoped to authoring the two missing workflows** (`platform-candidate.yml` and `platform-qa.yml`) plus `explorers-earth/playwright.replatform.config.ts` and `explorers-earth/e2e/replatform/deployment.spec.ts`, with the dispatch-only / integration-branch / required-CI-result preconditions and the permission split at `:37` (candidate holds registry permissions and no SSH deployment credentials; QA holds QA-only authority). Authoring them is not a deployment claim and not a green claim.
- [ ] **Q2 remains blocked by the red required aggregates.** At the current head `225d83e5`, Backend validation is a **FAILURE** with `music-required` failing. `music-required` (emitted by `test.yml:300`, not by the green "Music C0 contracts" workflow) and `replatform-required` (`ci.yml:462`) are the two required contexts. Q2 must not be attempted, and must not be declared attemptable, while either is red at the candidate SHA.

### The only category e2e in CI today is a mock lane — never read it as category parity

`.github/workflows/frontend-e2e-qualification.yml:40` is the `general-pages` lane, and it is the **only** place in CI where per-category specs run. It executes the **legacy MOCK** specs — `e2e/analytics.spec.ts e2e/apps.spec.ts e2e/books.spec.ts e2e/categories.spec.ts e2e/games.spec.ts e2e/guides.spec.ts e2e/locations.spec.ts e2e/marketing-pages.spec.ts e2e/movies.spec.ts e2e/people.spec.ts e2e/products.spec.ts` — under `playwright.general-e2e.config.ts`, whose Vite config points the app at a **fake GraphQL origin** (`explorers-earth/e2e/general.vite.config.ts:15` defines `VITE_API_URL` as `` `${origin}/graphql` ``) and supplies **fixture tokens** (`:27` `VITE_PUBLIC_ACCESS_TOKEN='fixture-public-token'`, `:28` `VITE_FULL_ACCESS_TOKEN='fixture-full-token'`) alongside fixture provider keys at `:22`–`:26`. It is one case per category.

- **This lane must never be read as category parity, canonical-backend coverage, or evidence for any Epic 4 / Epic 5 category.** It proves the mock app renders; it exercises no canonical route and no PostgreSQL.
- [ ] **All real-backend replatform evidence is local-only and has never been re-attested at an exact SHA.** `platform:test:e2e` and the six canonical lanes (`auth`, `profile`, `books`, `lifecycle`, `movies`, `games`) appear in **no workflow**, so every canonical browser receipt in this plan is an owned-fixture local run. Register the canonical lanes in CI — with a one-to-one behavioral map **before** any legacy spec is retired — and only then treat canonical browser results as attested. Do not retire a legacy mock spec in exchange for an unregistered canonical one.
