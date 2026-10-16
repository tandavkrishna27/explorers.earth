# Ticket 1.3 local implementation report

Base: `9bd0973bba9681520a2cd8183281f76f8c07d946` (`codex/unified-replatform`). This report covers local work only. No push, PR creation, repository setting mutation, deployment, or secret-value inspection was performed.

## Result and ruling

CI now includes an `always()` aggregate named `replatform-required` that fails on any failed, cancelled, or skipped prerequisite. Main PRs, including drafts, and integration pushes run root/frontend/backend validation without a general path filter. The backend job provisions the disposable Ticket 1.2 fixture and runs domain/security, real PG integration and mounted route checks. Existing Music, image-scan, browser qualification and nightly/load lanes remain.

Ruling: The legacy `explorers.yml` static deploy is disabled until a recorded digest and source-revision-matched frontend artifact exists. Its former `workflow_run` authority built mutable output from the default branch and used SSH after any successful main CI completion; giving that job a manual confirmation alone would not meet the ticket's artifact contract. Its SSH calls are still in source but the job condition is constant false. This intentionally pauses that legacy release path; Epic 3.5/8 must replace it.

Ruling: Tunes image validation keeps its existing job name. It has read-only token permissions on PR/push and transfers the exact scanned image archive to a separate write-scoped publish job only for main `workflow_dispatch` with `release_production=true`. A read-only preflight requires a supplied successful main CI push run ID, matching dispatch `GITHUB_SHA` and successful `replatform-required` job. The reusable production job verifies the resulting digest and `GITHUB_SHA` before protected deployment. This transfer can hit GitHub artifact size limits; only a real release run can establish that operational limit. No ordinary push publishes or deploys.

## Trigger and credential audit before push

| Workflow | Trigger/ref/path | Credential and deploy conclusion |
|---|---|---|
| `ci.yml` | Main/develop PRs and main/develop/integration pushes; no path filters. Default checkout of event revision. | Read-only token. No SSH/deployment secrets or deploy calls. Aggregate requires all seven named lanes. |
| `test.yml` | All PRs; main/develop/integration pushes; scheduled and manual qualification. Default event checkout. | Read-only token; fixture PG, security, browser and image/deploy contract checks; no host deploy call. Optional load/chaos is nightly/manual. |
| `music-c0-contracts.yml` | Main PRs and main/develop/integration pushes on root/lock/backend/frontend/fixture/Compose/workflow/docs paths. Default event checkout. | Read-only token; contracts/types only. |
| `tunes.yml` | Main PRs and main/integration pushes on shared paths; manual dispatch. Default event checkout with C1 ancestry proof. | PR/push image build/scan has read-only token. Main explicit release dispatch requires matching successful CI aggregate before package/attestation write and protected production call with image digest and matching SHA. |
| `tunes-deploy.yml` | Reusable caller or direct manual bootstrap/rollback. Main ref and `GATE_PROD=open` preflight; `tunes-production` protected environment. Checkout event SHA. | SSH only in production job. Reusable deploy requires pinned Tunes main caller, exact `GITHUB_SHA` and GitHub/OCI provenance; direct dispatch remains limited to bootstrap/rollback. |
| `explorers.yml` | Manual trigger only; legacy job permanently skipped pending replacement. | Legacy repository `VITE_*`, SSH and SCP references are unreachable. No `workflow_run` trust bridge remains. |
| `music-reconcile.yml` | Main schedule hourly report-only; manual protected staging report/apply. Checkout event SHA. | Report production and staging environments contain named Strapi token references. Scheduled job is not apply or a release of the new stack; Epic 6 must retire this legacy path before canonical identity cutover. |
| `tunes-host-preflight.yml` | Confirmed manual main only. | `tunes-production` protected SSH, read-only inspection. |
| `tunes-test-direct-deploy.yml` | Confirmed manual main only; runtime expiry 2026-08-28. | Protected production SSH; expired and not used for QA. |
| `frontend-e2e-qualification.yml` | Scheduled/manual, event checkout. | Read-only browser evidence, no deploy. |

Read-only GitHub metadata on 2026-09-30: main `required_status_checks=null`, `enforce_admins.enabled=false`, rulesets `[]`. `tunes-production` has a required reviewer, prevents self-review and restricts to protected branches. No dedicated QA environment appeared in the environment list. `GATE_PROD` current effective value and host credential validity remain unverified. No secret values were read.

## Test evidence and limits

1. Red: `npm test --prefix tunes -- --run server/test/contracts/replatform-workflow-authority.test.ts` exited 1, five expected failures: integration push absent, aggregate absent, frontend `workflow_run` present, explicit release input absent, PR image job write permissions present.
2. Green: same targeted command exited 0, five tests passed.
3. A follow-up red test for release without a successful exact-SHA aggregate exited 1 as expected; release preflight was then added. A read-only existing GitHub CI run showed the API's `.path` is `.github/workflows/ci.yml`; a red test caught the initial incorrect `@` suffix check before it was fixed.
4. `npm test --prefix tunes -- --run server/test/contracts server/test/deployment/music-deploy-workflow-security.test.ts server/test/deployment/music-deployment-files.test.ts`: first run had 2 failures in assertions that expected old automatic push/publish placement; 702 passed, 3 skipped. Updated those assertions to the explicit release and scan-before-transfer contract. Final focused run exited 0, 40 passed. Final full `server/test/contracts` run exited 0, **671 passed, 3 skipped**.
5. `npm run music:types:scoped` exited 0. `npm run music:types:baseline` exited 0 while reporting **142 current TypeScript diagnostics and compiler exit 2**. `npm run check --prefix tunes` exited 1 with the known full type errors; no full-type green claim.
6. All 10 workflow YAML files parsed with `js-yaml`; `git diff --check` exited 0. `actionlint` was unavailable and was not installed solely for this ticket. YAML parse is not GitHub Actions semantic validation.

The broad Tunes `npm test --prefix tunes -- --maxWorkers=2` run began while final preflight changes were still being made. It reported one failure from an intermediate test assertion, then made no further progress for several minutes and was interrupted. It is **not a passing full-suite run**. The final contract directory and focused deployment contracts passed afterward. Remote CI, hosted Docker provision, E2E execution, image transfer, and environment gates are not verified by local static tests.

## Exact remote gates for controller

1. Independently review all source triggers, path filters, checkout revisions, job conditions, secrets, SSH calls, scheduled production work and workflow-call trust before pushing.
2. Push `codex/unified-replatform`, create a draft PR to main, and inspect real workflow run head SHA, conclusions, skipped jobs, artifacts and deploy job list. A feature branch PR must run validation and invoke no deployment. Resolve baseline failures openly; preserve existing checks.
3. After the exact `replatform-required` check appears in a real PR run, configure main protection to require that name, verify failed/skipped dependencies block merge, and record administrator bypass policy. Current source does not enforce this setting.
4. Create a QA environment limited to the integration branch with environment-scoped credentials before any later QA deploy is wired. This ticket does not define a QA deploy workflow or infer a QA hostname.
5. Keep production promotion separate. `tunes-production` protection is present, but the current `GATE_PROD` value and environment/host readiness need direct authorized review before release. The legacy frontend deploy remains paused until immutable artifact authority is implemented.


## 2026-09-30 continuation after CI/approval review

The prior result above described commit `1770cebc`; the following local change supersedes its backend-job, release-gate, and expired-workflow descriptions. User approved this simplification before any remote action. No push, GitHub setting change, secret-value read, or deployment was performed.

- Repaired the rolling-window Analytics fixture by pinning only the test Date clock to 2026-09-01 and restoring timers after each test. Red evidence was the Sep 30 main run 36684200704 (1/3,909 unit tests failed) and a local targeted failure (1 failed, 6 passed). Targeted green: 7/7.
- Repaired both PostgreSQL lock-order race tests by attaching `Promise.allSettled` immediately after starting the second query, before releasing the blocking advisory lock. The Sep 15 Music run 34922657088 had seven passing database files but failed on an unhandled rejection. The corrected test preserves rejection and lock-order assertions. Disposable real PG suite passed twice after the final patch: 13/13 files and 157/157 tests on each pass, zero skipped.
- Removed the duplicate `backend-validation` job from `ci.yml`, keeping its six frontend/root jobs in strict `replatform-required`. The existing `test.yml` database job retains real PG integration. A new `platform-fixture` job provisions the attested current-domain local platform, seeds twice, checks mounted routes, and always stops services. It and nine retained Music checks feed strict `music-required`; any failed, cancelled, or unexpectedly skipped dependency fails it. Optional load/chaos remains separate. Full Tunes image-build validation remains in `tunes.yml` because existing image qualification contracts depend on its exact pre-scan suite; removing it would require separate authority review.
- `tunes.yml` release preflight now requires two successful main push run IDs, one each for `ci.yml`/`replatform-required` and `test.yml`/`music-required`, both at the exact release `GITHUB_SHA`. The preflight retains read-only token scope; publication still uses the scanned image digest and provenance.
- Removed the redundant `GATE_PROD` job conditions from `tunes-deploy.yml`. Manual dispatch initiates a production operation; the independent protected `tunes-production` reviewer is the sole human release decision. Main/ref, external protected-environment policy, digest, source attestation, and credential boundaries remain. Read-only host preflight continues to use the protected reviewer because it has a deploy-capable SSH identity. Reconciliation staging apply retains its explicit reviewed checkpoint while the legacy service exists.
- Retired the expired `tunes-test-direct-deploy.yml`; dependent workflow security/deployment contracts now assert its absence. Updated production and incident/reconciliation runbooks, plus `docs/replatform/ci-check-map.md`, to reflect the current authority.

### Validation after continuation

The new workflow authority test was red on the expected missing aggregates, release preflight and expired workflow, then green. Focused workflow/deployment suite: 3 files, 41 tests passed. Frontend Analytics: 7/7 passed; full frontend `test:coverage` exited 0. Disposable real PostgreSQL UAT: 13 files, 157 tests passed twice after the final lock-order fix. A full `server/test/contracts` run initially reported 618 passed but one suite failed before tests because its isolation helper copies `git ls-files` paths and the retired workflow was still an *unstaged deletion*; this was a local index-state failure, not a test assertion. After staging exact ticket files, the full contract suite passed: 40 files, 673 passed, 3 existing skipped. `music:types:scoped` exited 0; `music:types:baseline` exited 0 while reporting 142 current diagnostics and compiler exit 2. All nine remaining workflow YAML files parsed, `git diff --check` passed, and the disposable local platform was stopped. No required CI job was treated as green by skipping it.

### Remote gates and known limits

Controller must independently review all triggers, ref/path filters, secrets and deploy calls before push. Then inspect real draft-PR runs at their exact SHA and require the observed `replatform-required` and `music-required` names in main protection. A failed or skipped prerequisite must block merge. Real hosted `platform-fixture` runtime, artifact transfer limit, and image build/scan remain unverified locally. GitHub billing/spending-limit runner denial affected prior nightly jobs; if it recurs, resolve runner eligibility rather than weakening tests. `music:types:baseline` still compares 142 diagnostics; full Tunes typecheck is not green. QA environment/release remains future work and should have no routine human reviewer, with branch restriction and scoped credentials before use. Production environment reviewer/policy must remain configured for any production dispatch. The legacy frontend deploy remains dormant pending digest-based replacement.


## Round 1 review correction: aggregate runner directory

Independent review found that `replatform-required` has no checkout but inherited the workflow-level `defaults.run.working-directory: explorers-earth`, which does not exist on its fresh runner. Added a contract resolving step → job → workflow defaults and asserting a checkout-free aggregate runs from `${{ github.workspace }}`; before the YAML fix it failed with received `explorers-earth`. The aggregate run step now explicitly uses `working-directory: ${{ github.workspace }}`, allowing its Node predicate to evaluate `needs` without checkout. It remains fail-closed on any failed, cancelled, or skipped dependency.

Red: `npm test -- --run server/test/contracts/replatform-workflow-authority.test.ts` exited 1, 1 expected failure (effective directory). Green: `npm test -- --run server/test/contracts/replatform-workflow-authority.test.ts server/test/deployment/music-deploy-workflow-security.test.ts server/test/deployment/music-deployment-files.test.ts` exited 0, 3 files and 42 tests passed. No remote action or credential inspection.

## 2026-09-30 exact-head hosted validation and settings

At PR 119 head `c64a274e9b62b35e4444f7e988cee781ddb37911`, hosted [CI 36724334669](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334669) and [Music 36724334805](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334805) both succeeded, including exact `replatform-required` and `music-required` jobs. [C0 36724334711](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334711) passed on Linux and Windows; [image CI 36724335337](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724335337) passed build/test/scan, with publish and deploy skipped. The complete job inventory and settings evidence is in `docs/replatform/evidence/ci-hosted-validation.md`.

The repository's canonical API path is `tandavkrishna27/explorers.earth`; `MeteoriteLabs/explorers.earth` redirects. `main` already had branch protection, but its required status-check subresource was disabled (`required_status_checks: null`). The narrowly scoped PATCH returned HTTP 404 `Required status checks not enabled`, with no change. A full protection PUT then initialized the two checks while preserving all supported existing fields. A candidate mixing `contexts` and `checks` failed schema validation with HTTP 422, again with no change; the accepted request supplied the two exact contexts. Independent GET readback confirms `strict: true`, both contexts, and GitHub Actions app ID 15368 on each check. The sanitized policy [before/request/after record](../../../docs/replatform/evidence/main-protection-settings.json) verifies every other recorded field unchanged, including `enforce_admins.enabled: false`; administrators retain the pre-existing bypass.

Created and read back `explorers-qa` with no reviewer or wait-timer rule and exactly one custom branch policy, `codex/unified-replatform`. No secrets were copied/read and no deploy or DNS operation occurred. Ticket 3.5 still owns QA credential population and hostname setup before QA deploy.
