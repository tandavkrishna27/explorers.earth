# Local current-source baseline — 2026-09-30

| Field | Observed value |
|---|---|
| `scenarioIds` | `NAV-04` only, limited to `/about` and `/use-cases` rendering; legal/contact/landing actions in that scenario remain unverified here |
| `sourceCommit` | `efd3b819510976f5dcd275b5147ed998020dea76`; working tree had pre-existing untracked planning/report files and this newly created evidence, so it was **dirty** |
| `artifactDigest` | Not deployed. The browser used the local static gateway built by `platform:local provision` from this source; no published image digest was recorded |
| `environment` | `local-fixture`, Windows Docker Desktop, loopback `127.0.0.1:51474`, headless Playwright Chromium; desktop 1440×900 and mobile 390×844 |
| `fixture` | `explorers-replatform-local` attested disposable project, PostgreSQL 15.17 (`server_version_num=150017`), 21 Music migrations; acceptance seed run twice with one stable existing Music identity (`id=1`). Canonical account/profile/content persona seeds remain pending Epics 2–3. No live provider or hosted service authority |
| `commandOrSteps` | `npm run platform:local -- reset` (stale prior receipt), `provision`, `check`, `npm run platform:seed -- --dataset acceptance` twice, `npm run platform:test:routes`; then a read-only Playwright Chromium script launched from `explorers-earth`, blocked every non-loopback HTTP request, visited `/about` and `/use-cases` at both viewports, checked response/heading/scroll width/page errors, and captured full-page PNGs |
| `actualResult` | All wrapper commands exited 0; provision/check reported ready, 21 migrations; both seeds reported one stable identity; route probe reported 6 ingress handlers. Four browser navigations returned HTTP 200, visible expected H1, no page errors and equal client/scroll width. This proves only current static marketing rendering and fixture infrastructure; it does not prove replacement account/category journeys |
| `traceOrScreenshot` | [Machine-readable observations](browser-results.json); [desktop About](desktop/about.png), [desktop Use Cases](desktop/use-cases.png), [mobile About](mobile/about.png), [mobile Use Cases](mobile/use-cases.png). No trace or video was produced by this direct browser script |
| `defects` | No defect observed in the four checked views. Initial `platform:local check` refused with `phase=receipt-check` because the local fixture receipt was stale for the new source; guarded reset/provision recovered it. Windows excludes port 55178, blocking the existing category-navigation fixture config; this run used the fixed loopback gateway 51474 instead and did not change application/test config |
| `skippedReason` | All other matrix scenarios require future canonical seeds/routes or separate provider authority; no claim of pass. The fixed-port category-navigation suite was not run locally. Hosted CI records current mocked/browser and real-PG lanes separately in [the hosted record](../hosted-efd3b819.md) |
| `operatorAndTime` | Codex agent, 2026-09-30 UTC; wrapper/browser work completed before 17:57 UTC. This is agent evidence, not owner UAT |

## Artifact SHA-256

| File | Bytes | SHA-256 |
|---|---:|---|
| `browser-results.json` | 1055 | `636f01bfe1f5898c57afe97c0923f7464846876379f8e672208efb4568f7524e` |
| `desktop/about.png` | 1356084 | `a56d3a4c2a99e3b0e4294c6fb3a7596442d836c5636fedaa7de8f2110abfdb2f` |
| `desktop/use-cases.png` | 1240962 | `e87c677621df72276d179be554418072bb4b4d76df0a841ce266efd487fc2acc` |
| `mobile/about.png` | 592038 | `a8fab24abf38525d3e9b42e642428172b3eea1b80bbf343db82cbb3ade7da2b0` |
| `mobile/use-cases.png` | 635610 | `046398b2e60788cb537a0b06970f6ba45867860594adf32a9c0a9c144c7954fe` |

The captured pages were visually inspected at desktop and mobile sizes. They are baseline images for the current marketing view, not approved replacement snapshots.
