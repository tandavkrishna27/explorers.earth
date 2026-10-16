# Fresh independent image checkpoint source review

2026-10-05. Reviewed the verification plan, execute-image-package-review.md, cleanup revision, scoped diff and all five code files in the integration checkout. No tests, install, Docker/PostgreSQL acquisition, source changes, staging, commit, push or workflow dispatch were performed by this reviewer.

## Verdict

PASS for a coherent five-file checkpoint to commit and push through the existing non-deploying PR flow for **first native hosted qualification**. No source blocker detected within this scoped package. This verdict is source readiness, not native execution, image acceptance, release readiness or full QA completion.

Independently computed filesystem SHA256 matches every frozen value:

- .github/workflows/tunes.yml: 968c28dd211459550119d369672c5266d4cf961fc7f3d332756eb2abbcd32374
- tunes/scripts/music-image-ci-tests.ts: 0dc2c2b4abe22d203c68780a6debcf8213a1a82657be30c0c916854095a32fb6
- tunes/server/test/deployment/music-image-ci-tests.test.ts: bb6fbba0e1cce4aefd813b9db6b076080aa9b9f3aab830d0b73f66ab2a890abd
- tunes/server/test/music-runtime-role.integration.test.ts: 40ca0c16680d2fa37ea7191b5b86477e14591a4df60dc1efd80ec3672231fae2
- tunes/server/test/deployment/music-deploy-workflow-security.test.ts: b833357acb9ce9f6d68f97b13202365217c9246fa6e51bf03bc881a3d8a1dd2e

## Spec and quality findings

The runner preserves the six commands and order at music-image-ci-tests.ts:11-15 and executes them without selectors at :67-70. Ambient authority rejects before acquisition; the helper interface and exact ownership start/attest/stop calls remain intact. Child environment enables C5 as well as existing C3/C8/C9 admission. No grants, skip conditions, coverage floors or discovery assertions were weakened.

The prior transfer first cause is addressed at :102-113: acquired immutable authority is held before fallible persistence, exact helper stop and absence run on persistence failure, and ordered AggregateError preserves primary and cleanup failures. The new behavior contracts assert this ordering rather than merely source text.

The prior child-settlement first cause is addressed at :116-139 and :184-233: error retains its first diagnostic; close and bounded detached-group absence must precede cleanup permission. Missing close rejects without proving termination, and :178 refuses DB stop while custody remains unresolved. Receipt becomes command-running before spawn (:188), returns to owned only after termination proof (:227), and fallback (:250 onward) rejects every state except owned/absent before using exact commit/ID/image/context authority. Hard interruption remains fail-closed with protected evidence. Native group signals, descendant absence, escalation and cancellation are still execution obligations. The missing-close regression checks proof denial behavior; its native stop/receipt assertions are textual, and it does not execute native fallback cleanup. Do not label finite contracts as native proof.

The hostile gate correction uses the actual admitted host/port (:628-629), current migration marker (:637) and exact unsafe-capability diagnostic (:651), while retaining no-attestation, unchanged journal and secret non-disclosure assertions. It removes stale-marker/ordinary-port false failure causes without relaxing the authority check.

Workflow installs before invoking the runner, follows it with always cleanup, and leaves downstream build gates dependent on successful tests/cleanup. Fixable HIGH/CRITICAL strict scan remains blocking (:159 onward); full disclosure, disk reserve, immutable image identity and validated report/artifact conditions remain intact (:170-236). Report validation can fail after an earlier integration failure; that downstream cascade must remain separate from the first cause. Production paths still require explicit dispatch, main and release_production plus successful qualification and preflight (:238 onward); a PR checkpoint does not authorize release.

## Receipt limits and remaining qualification

Accept the controller's disclosed Node24.21.0/npm11.19.0 finite receipt as reported: 186 passed across six files and scoped types exit0. This reviewer did not rerun or independently reproduce those commands. Retain prior meaningful RED23/2 and runner27-body attribution separately from the finite aggregate.

The clean facility's raw lockfiles are CRLF and differ from committed LF bytes; normalized text and parsed JSON were reported equal. This is explicitly a line-ending provenance limit, not exact raw committed-lock-byte evidence. Native qualification must freeze actual Git blob/source provenance and record install/runtime versions and physical auth-runtime postinstall topology.

Local Linux remains BLOCKED: only Docker-managed WSL was identified, with no established authorized qualification facility. Existing exact-SHA Ubuntu24.04 image validation is the authorized first native evidence lane. No local native proof is claimed. The source allocator excludes55432 but does not itself reserve retained51642; the plan's explicit local execution guard remains necessary if local execution is ever attempted. Hosted execution must have fresh job-owned RUNNER_TEMP and no reachability to retained local authority.

Publication must preserve the scoped index/unrelated hashes and verify exact remote/PR SHA. Hosted acceptance still requires actual Games13+12 bodies with zero Games skips, hostile capability diagnostic, schema38/data/grants and restore-database removal, all six unfiltered commands with discovered/executed/skipped identities, proven owned child/container cleanup, disk/build/runtime graph/full scan/strict blocker/report and applicable exact artifact transfer gates. Stop at the first substantive failure, classify it and retain downstream cascades; do not blind-retry. Release remains disabled and broader frontend/lifecycle/provider obligations remain outside this review.
