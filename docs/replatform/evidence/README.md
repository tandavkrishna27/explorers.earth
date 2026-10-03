# Acceptance evidence ledger

This directory holds **references and sanitized run records**, not provider credentials, private profiles or database dumps. The [matrix](../acceptance-matrix.md) separates current-source baseline observations from replacement acceptance. Ticket 1.2 supplies an attested Music fixture; deterministic canonical owner, second-owner, anonymous and suspended account/content fixtures remain later-ticket work. A mocked browser check must say `mocked`; a real API fixture run must say `local-fixture`; a Google/Maps/S3 QA check must say `qa-provider`. None is owner sign-off.

For each run create a dated Markdown or JSON record with these fields:

| Field | Required content |
|---|---|
| `scenarioIds` | Exact stable IDs from matrix, including expanded category IDs |
| `sourceCommit` | Full Git SHA and dirty-tree state |
| `artifactDigest` | Immutable image/web digest if deployed; `not deployed` locally |
| `environment` | `mocked`, `local-fixture`, `qa-provider`, or `production-read-only` plus browser, viewport and OS |
| `fixture` | Seed version, account roles and non-secret authority identifier; explicitly distinguish mocks |
| `commandOrSteps` | Exact bounded command or reproducible browser steps, project/spec and flags |
| `actualResult` | Pass, fail or skip with observed UI, HTTP/network and storage effects; never infer from exit status alone |
| `traceOrScreenshot` | Relative artifact paths and SHA-256 digests; include desktop/mobile baseline images where applicable |
| `defects` | Issue or local defect IDs, impact, and whether pre-existing at source commit |
| `skippedReason` | Required when not run; state missing fixture/provider or authority gate, not “N/A” |
| `operatorAndTime` | Agent or owner identity and UTC start/end; mark owner UAT only when owner performed it |

Recommended directory: `evidence/YYYY-MM-DD/<run-id>/record.md` with `desktop/`, `mobile/`, and `traces/` children. Keep generated browser artifacts out of git when large or sensitive; commit a stable manifest with hashes and an accessible artifact reference. Scrub tokens, cookies, email addresses, raw profile contents, private URLs and connection strings before retention. Snapshot refresh alone is not parity evidence: attach observed run result and review the changed image.

Current records: [local static-gateway browser and fixture run](2026-09-30/local-fixture-efd3b819/record.md) with four new desktop/mobile screenshots, and [exact-head hosted CI](2026-09-30/hosted-efd3b819.md) with five frontend browser jobs plus the separate backend real-PostgreSQL and platform-fixture lanes. The existing PNG snapshots in `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/` remain historical fixtures, not these new screenshots. Replacement account/category acceptance and provider checks remain pending their owning tickets.
