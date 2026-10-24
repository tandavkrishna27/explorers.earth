# Ticket 1.3 hosted CI and repository settings evidence

Observed 2026-09-30 (UTC) for draft [PR 119](https://github.com/tandavkrishna27/explorers.earth/pull/119), head `c64a274e9b62b35e4444f7e988cee781ddb37911` on `codex/unified-replatform`. All four runs below were `pull_request` runs at that exact head SHA. This is validation evidence, not QA or production deployment evidence; artifact digest: **not deployed**.

| Run | Observed job conclusions |
|---|---|
| [CI Pipeline 36724334669](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334669) | Lint, TypeScript, Build, Unit Tests, Integration Tests, E2E Tests and `replatform-required`: **success**. |
| [Music contract and qualification CI 36724334805](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334805) | `static`, `docs-contracts`, `platform-fixture`, `unit-coverage`, `contracts`, `database`, `security`, `frontend`, `browser`, `image-deploy-contract` and `music-required`: **success**. Optional `load-chaos`: skipped under its non-PR policy. |
| [Music C0 contracts 36724334711](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724334711) | Ubuntu and Windows contracts: **success**. |
| [Tunes immutable image CI 36724335337](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36724335337) | `build-test-scan-push`: **success**. `release-preflight`, `publish-image` and `deploy-production`: **skipped** on this PR event. |

No PR job published an image or invoked production deployment. The passing image-validation job does not establish a production publish or a deployed digest. Earlier failures at other SHAs remain documented in the Ticket 1.3 hosted-fixes report; the records above are the successful exact-head reruns.

## Settings readback

GitHub currently identifies the repository as `tandavkrishna27/explorers.earth`; the configured `MeteoriteLabs/explorers.earth` remote redirects to it. Before mutation, `main` branch protection had `required_status_checks: null`, no required PR reviews, `required_conversation_resolution.enabled: true`, `enforce_admins.enabled: false`, and force pushes and deletions disabled. The focused `PATCH /repos/tandavkrishna27/explorers.earth/branches/main/protection/required_status_checks` returned HTTP 404, `Required status checks not enabled`, without changing protection. The full protection PUT was therefore used to initialize the disabled subresource. A first candidate containing both `contexts` and `checks` was rejected by schema validation (HTTP 422, no change); the accepted request supplied the two exact contexts. [GitHub's branch-protection API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection) associates recently observed GitHub App providers with context names.

The independent GET readback now shows `strict: true`, contexts exactly `replatform-required` and `music-required`, and both `checks[].app_id: 15368` (GitHub Actions, as observed on the successful PR checks). The sanitized [before/request/after JSON](main-protection-settings.json) preserves and compares all other recorded policy fields: no required PR reviews or push restrictions; conversation resolution remains required; force pushes, deletions, branch locking, fork syncing, linear history, block creations and required signatures remain disabled. The administrator bypass remains enabled (`enforce_admins.enabled: false`); this is an existing policy, not an extra approval or a claim that admins cannot bypass checks. Main branch enforcement is now configured for non-admin merges.

The new `explorers-qa` environment was created by the environment API and read back with no required reviewers or wait timer. It uses custom deployment branch policies (`custom_branch_policies: true`, `protected_branches: false`), and its branch-policy readback contains exactly one branch entry: `codex/unified-replatform`. `can_admins_bypass` is true in GitHub's response. No environment secret was copied, populated or read, and no workflow deploys to this environment yet. Ticket 3.5 must provision scoped QA credentials and establish the intended QA hostname before any QA deployment or provider validation. No DNS or deployment action was taken.

## WPCI apt-free Playwright lanes (2026-10-23)

Plan: `docs/superpowers/plans/2026-10-23-dash-wpci.md`. The four PR e2e lanes in `ci.yml` run in `mcr.microsoft.com/playwright:v1.61.1-noble` (`--user 1001`), and `ci.yml`, `test.yml` `static` and `browser` no longer pass `--with-deps`. `scripts/ci-playwright-image.test.cjs` pins the image tag to the locked `playwright` version and was confirmed failing on the unmodified workflows first. **No required check, job key, job name, `needs`, `if`, run command, env or upload step changed. Nothing was path-filtered, sharded or made conditional.**

Before: `main` at `79a85b4a`, runs `ci.yml` 39844049914 and `test.yml` 39844050018, 3 attempts each. After: PR head `ed3c0e69`, runs 39844458356 and 39844458189, 3 attempts each, no push between attempts.

### Wall time per attempt (minutes)

| Workflow (required check) | Before 1 / 2 / 3 | Median | After 1 / 2 / 3 | Median |
|---|---|---|---|---|
| Explorers validation (`replatform-required`) | 13.0\* / 16.6 / 6.6 | 13.0 | 8.0 / 8.3 / 7.1 | 8.0 |
| Backend validation (`music-required`) | 7.1 / 13.4 / 7.2 | 7.2 | 6.3 / 7.5 / 6.2 | 6.3 |

\* Before attempt 1 failed on a pre-existing unit flake on `main` (`ReferenceError: window is not defined` from a `sonner` toast timer firing after jsdom teardown; all 4984 tests passed), so Integration Tests did not run; it is unrelated to this change.

### Slowest jobs (minutes)

| Job | Before 1 / 2 / 3 | After 1 / 2 / 3 |
|---|---|---|
| E2E Category A | 6.6 / 16.2 / 6.1 | 4.9 / 6.1 / 4.7 |
| E2E Category B | 12.6 / 16.1 / 6.2 | 6.3 / 4.7 / 6.7 |
| E2E Public shell | 3.6 / 4.3 / 5.0 | 5.4 / 4.4 / 5.2 |
| E2E Music and account | 8.4 / 16.0 / 1.4 | 2.0 / 1.9 / 1.5 |
| `static` | 1.6 / 12.6 / 2.3 | 2.1 / 1.5 / 2.8 |

`Install Playwright browsers` before: 21-878 s per lane (415, 426, 638, 717, 878 s in the slow attempts; `static` 671 s once). After: 1 s in every lane and attempt; `Initialize containers` (image pull) 25-36 s; `static`/`browser` install 8-12 s.

### Same tests before and after

- Playwright JSON inventories (file, title, project, final status) for `category-navigation-a` (19), `category-navigation-b` (26), `public-shell-continuity` (12) and `music-account` (10) are byte-identical across all 6 attempts; every report has `unexpected: 0, skipped: 0, flaky: 0`.
- Unit lane: `Test Files 436 passed (436)`, `Tests 4984 passed (4984)` in all 6 attempts.
- `static`: 559 tests before, 561 after, `fail 0`. The sorted per-test name diff is exactly the two new guard cases.
- No step in the e2e lanes, `static`, `browser` or either aggregate concluded `skipped` in any after-attempt, except the `if: failure()` "Upload screenshots/videos on failure" steps.

### Red-gate canaries (draft PR #197, closed, branch deleted)

| Canary | Run | Result |
|---|---|---|
| Inverted one assertion in `category-navigation-b.spec.ts` | 39845897392 | E2E Category B failure, `replatform-required` **failure** |
| Category A image set to `playwright:v0.0.0-noble` | 39847143664 / 39847143587 | E2E Category A failure at Initialize containers (not skipped), `replatform-required` **failure**; guard test: `static` failure, `music-required` **failure** |
| Throwing test added to `scripts/ci-docs-only.test.cjs` | 39848626016 | `static` failure, `music-required` **failure** |

The Music C0 Windows workflow is unchanged and unfiltered (not required; it guards the Windows local e2e tooling, plan section 3.1). No Music e2e test was removed.
