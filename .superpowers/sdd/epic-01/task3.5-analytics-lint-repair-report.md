# Analytics browser lint repair

2026-10-03. Scoped repair on `codex/unified-replatform` after reading the durable ledger and `checkpoint-ad4f657a-hosted-triage.md`. Original proxy modifier owned this diagnostic addition in `54ec3ef4`; prior analytics browser implementation was `c8fb27bf`.

Actual frontend ESLint reproduced the sole error at `e2e/replatform/analytics.spec.ts:35:617`: `no-empty`. The empty catch surrounds optional browser-storage parsing used only for sanitized test annotations. The delivery assertions below already require exactly two identical attempts, one persisted event and one receipt. Removing the catch or throwing would change diagnostics into a new failure condition; changing consent defaults could alter partial parse results.

Smallest correction documents the deliberate malformed-storage tolerance inside the catch. This adds no executable statement, rule suppression, gate change, retry, or assertion change. Removing the added comment reproduces the exact original executable source (normalized line endings).

Verification:

- Frontend working directory: Node24.21.0 `node_modules/eslint/bin/eslint.js e2e/replatform/analytics.spec.ts --quiet` red exit1 before correction, green exit0 after.
- Applicable guards: `server/test/contracts/platform-proxy-browser.test.ts` (46) and `server/test/contracts/analytics-inventory-regression.test.ts` (1): **47 tests passed**, zero skips. Explicit selectors avoid the retained historical scratch duplicate suite.
- `git diff --check` passed. Exact executable-source comparison passed.

A first lint invocation from repository root refused because ESLint could not find the frontend configuration; it is not counted as lint qualification. The corrected frontend-directory invocation above passed. No new browser execution was necessary for a comment-only repair; existing local browser qualification is not rerun or reasserted at this new commit. Mandatory broader hosted parity gates remain open. No push, hosted rerun, image/workflow edit, cloud or production operation.
