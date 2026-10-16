# Replatform CI and release authority

Ticket 1.3 source configuration on `codex/unified-replatform`. Repository settings and real-run evidence remain separate remote gates. A main branch rule must require the observed `replatform-required` and `music-required` checks at the exact candidate SHA.

## Validation and check names

| Workflow | Trigger | Required evidence |
|---|---|---|
| `ci.yml` (Explorers validation) | Every PR targeting main/develop, including drafts; pushes to main/develop; no path filter | Lint, TypeScript, unit, build, integration and five independent E2E jobs feed `replatform-required`. Category A and B each run part of the 45-test category suite; public shell, publishing and three-project Music/account retain their own jobs. Every dependency must conclude `success`; skipped/cancelled/failed jobs fail the aggregate. |
| `test.yml` (Backend validation) | Every PR; pushes to main/develop; manual and nightly | Docs contracts, static/scoped/baseline types, coverage, domain contracts, real PostgreSQL, security, frontend, browser, image/deployment contracts, and repeatable local platform seed/route fixture start independently and feed `music-required`. `load-chaos` retains its browser dependency. Its skip is accepted only for PR, push and manual `lane=pr`; schedule and manual `lane=nightly` require success. Every other dependency must conclude `success`. |
| `music-c0-contracts.yml` | Relevant PR/push paths | Linux/Windows C0 contract and type baseline plus Linux Compose config remain independent protection. |
| `tunes.yml` (API image validation) | Relevant PR/push paths, excluding the duplicate integration push; deliberate manual release | Builds/scans an immutable Tunes image. Main production release requires successful `ci.yml` and `test.yml` push run IDs for its exact source SHA before publishing. |
| `frontend-e2e-qualification.yml` | Schedule/manual | Deeper browser qualification still discovers both category files and all 45 category titles; it remains independent evidence, not a PR merge check. |

The duplicate backend validation job in `ci.yml` was retired. Its real PostgreSQL integration coverage is retained by the `database` job in `test.yml`; current-domain repeatable seed and mounted-route proof runs in the new `platform-fixture` job. Canonical account/profile/content seeds are later-ticket work. `music:types:baseline` compares against 142 known diagnostics and exits zero despite compiler exit 2; it blocks regressions against that baseline but does not prove a clean full typecheck. Frontend `tsc -b` remains hard.

## Workflow disposition and release authority

| Workflow | Disposition | Authority |
|---|---|---|
| `ci.yml` | Keep; remove duplicate backend job | `replatform-required` is the frontend/general merge gate. |
| `test.yml` | Keep; add local fixture and aggregate | `music-required` is the Music/backend merge gate. |
| `music-c0-contracts.yml` | Keep | Existing independent C0 regression protection. |
| `tunes.yml` → `tunes-deploy.yml` | Keep; require both pinned validation runs, simplify approval | Release dispatch is initiation. Read-only preflight checks both run IDs: main push, expected workflow path, exact `GITHUB_SHA`, successful run and expected aggregate. The built/scanned image is published by digest with source attestation. Protected `tunes-production` environment reviewer is the sole human release decision. Reusable deployment still requires main, provenance, digest, policy preflight and credentials confined to the environment-bearing job. Direct deploy dispatch remains limited to bootstrap/rollback. |
| `explorers.yml` | Keep dormant legacy deployment | No `workflow_run` consumer; no source-revision/digest proof yet. Epic 3.5/8 owns replacement. |
| `tunes-test-direct-deploy.yml` | Retire | Expired 2026-08-28 and is no longer callable. |
| `tunes-host-preflight.yml` | Keep | Read-only host inspection uses a deploy-capable SSH key, so the protected reviewer remains required. |
| `music-reconcile.yml` | Keep | Production report-only schedule; staging apply retains its review checkpoint while the service exists. Epic 6 owns removal. |

Routine validation and future QA do not require human reviewers. The current `tunes-production` environment (read-only metadata observed 2026-09-30) has protected-branch restriction, one independent reviewer and self-review prevention; no dedicated QA environment was found. No secret values or credential validity were read. The release workflow no longer uses repository `GATE_PROD`; the protected reviewer decides whether external rehearsal evidence is sufficient.

## Remaining remote gate

After independent trigger/secret review, push the branch and create a draft PR. Inspect each real run's SHA, conclusions, skipped jobs and deployment jobs; resolve actual failures. Configure a main rule requiring both exact observed aggregate check names and record bypass behavior. Verify a failing or skipped dependency blocks merging. Create a branch-restricted QA environment with scoped credentials before wiring QA deployment. These settings and remote runs are not established by local source.
