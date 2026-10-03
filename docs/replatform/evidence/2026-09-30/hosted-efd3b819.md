# Hosted current-source validation — exact head `efd3b819`

| Field | Observed value |
|---|---|
| `scenarioIds` | No matrix scenario is marked passed solely by these CI runs. Current-spec coverage seeds for navigation/categories, publishing, Music, account lifecycle and public shell ran, but many intercept or mock backends; replacement real-API scenarios remain planned |
| `sourceCommit` | `efd3b819510976f5dcd275b5147ed998020dea76`, clean GitHub Actions checkout for PR 119 |
| `artifactDigest` | Not deployed; image validation success is not a production/QA publish digest |
| `environment` | GitHub Actions `pull_request`, hosted Linux jobs. Browser lanes use local Vite and fixture/mocked paths as configured per job; backend `database` uses disposable PostgreSQL, and `platform-fixture` provisions the current Music fixture |
| `fixture` | CI lane-specific mocks/contained local servers for frontend E2E; real disposable PostgreSQL for backend database lane; `platform-fixture` is current Music identity/schema/routes only, not canonical replacement account/category data |
| `commandOrSteps` | Read-only `gh run view 36752219704 --json databaseId,headSha,conclusion,jobs` and same for `36752219837`; source commands in `.github/workflows/ci.yml` and `test.yml` (category A/B, public shell, publishing, Music/account, database, platform fixture) |
| `actualResult` | [Frontend run 36752219704](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36752219704) succeeded: lint, TypeScript, build, unit, integration, five E2E jobs and `replatform-required` all success. [Backend/Music run 36752219837](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36752219837) succeeded: static, docs, unit coverage, contracts, real-PG database, security, frontend, browser, image-deploy-contract, platform-fixture and `music-required` all success. `load-chaos` skipped under ordinary PR policy. Frontend E2E success is current mocked/contained browser coverage, not full canonical replacement parity. Real-PG database pass is current Music/backend integration, not a new account/category database acceptance run |
| `traceOrScreenshot` | Hosted job pages/artifacts linked above; no hosted screenshot is copied into this repository. The separate [local record](local-fixture-efd3b819/record.md) contains four new screenshots |
| `defects` | No failure at this exact SHA in the two required aggregates. Earlier red SHAs and transient hosted issues are recorded in the Epic 1 progress ledger and Ticket 1.3 hosted-fix report, not reclassified as passes |
| `skippedReason` | `load-chaos`: intended PR skip. Provider QA, replacement real-API category journeys, second-owner/suspended persona checks and owner UAT were not run because their owning tickets have not delivered those fixtures/contracts |
| `operatorAndTime` | Codex agent observed read-only GitHub API on 2026-09-30 UTC; frontend run completed 17:48:51 UTC, backend run completed 17:40:35 UTC. Agent observation, not owner sign-off |

GitHub main required-check readback on 2026-09-30 returned strict contexts `replatform-required` and `music-required`, each bound to GitHub Actions app ID 15368. This is configuration evidence only; the two exact-head run conclusions above establish this PR's observed validation status.
