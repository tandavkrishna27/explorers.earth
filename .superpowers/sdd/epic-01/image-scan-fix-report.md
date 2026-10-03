# Hosted Tunes image scan and Music coverage repair

Base: `be32f8e2e397a51692021a3f01172302f8fdfc82` on PR 119. Hosted Tunes run [36835587088](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36835587088) passed tests, immutable image build, image entrypoint proof, and production graph smoke. Its required Grype `--only-fixed --fail-on high` step failed. The PR event built merge SHA `f348ce3c20ec89c30aa34acdab5d43e2b59df000`, which explains the image tag in the run's SARIF artifact `11149706347`.

## Root cause

The complete SARIF contains 477 findings. Exactly seven are high/critical with a nonempty fix version. All seven are GitHub advisories on production `axios@1.18.0`, each fixed in `1.20.0`. The high Chromium and FFmpeg findings have no Grype fix version and are disclosed by the complete report but do not trigger `only-fixed`. The installed Axios version was already pinned by the existing lockfile; this failure followed the scanner database advancing from the previously documented 2026-09-30 build to the hosted run's 2026-10-01T06:33:48Z database (Grype 0.110.0, schema v6.1.9). This is a newly reported vulnerability against an existing runtime dependency, not a new browser package in this PR.

The separate backend required coverage failure was one unvisited false branch in `decisionForRoute` for a lifecycle source path outside both registered recovery routes. The new route table exercises the real account deletion, GET recovery status, and POST recovery completion methods, checks that a foreign source stays closed, and checks that an unknown recovery path stays closed.

## Change and verification

- Raised the direct Tunes Axios range to `^1.20.0`, updated only its lock entry and package metadata, and left the Grype gate and image composition unchanged.
- Plain `npm ci --ignore-scripts` succeeded. Production dependency listing resolves `axios@1.20.0` and `form-data@4.0.6`, including the Razorpay Axios edge. `npm audit --omit=dev` reports zero high/critical and four moderate findings.
- Built the actual Docker production image with the existing Dockerfile; the image's Axios package is `1.20.0`, and its production graph smoke exited 0.
- Grype `v0.110.0` against that image with `--only-fixed --fail-on high` exited 0. It listed six medium and one low fixable findings, with zero high/critical. Hosted exact-SHA validation is still required after push.
- Focused Music surface coverage after the test addition reached 100% statements, branches, functions, and lines (92/92, 170/170, 14/14, 64/64). The full `test:music-critical-coverage` suite passed 1,127 tests, two skipped, and 100% on every aggregate coverage category (1,925 statements, 1,776 branches, 274 functions, 1,676 lines).

The full local coverage command added a command-line exclusion for an unrelated untracked `.music-cli-contract-isolated-*` tree left in the shared worktree. Without that exclusion, Vitest discovers and instruments duplicate source under that tree; it is not present in the hosted checkout and was not edited or removed. The first local coverage run demonstrated the original 99.41% branch failure on `musicSurfacePolicy.ts` line 133 before the new test. No coverage threshold or checked-in exclusion changed.

This commit does not address separate frontend E2E failures. No publish, deploy, or merge was performed.
