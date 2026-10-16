# Games Image CI Repair Verification Plan

**Current amendment (2026-10-05):** Read the [re-groomed execution plan](2026-10-05-replatform-regroomed-execution.md) for verified checkpoint results, remaining prerequisites and current ownership. Earlier pending/base/agent-reuse wording below is historical where superseded: exact1a5c image/C0 succeeded; navigation6/lifecycle12 remain bounded separate proofs; Category B17/26 passed and Music startup remains open. Every new assignment uses a fresh agent. No full parity, operational QA or release claim follows from these slices.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Every new assignment uses a fresh agent.

**Goal:** Qualify the existing scoped image runner repair without weakening database ownership, child cleanup or image security gates.

**Architecture:** Preserve the six existing npm commands. The prepared runner supplies an exact-commit attested disposable PostgreSQL authority to child commands and cleans only owned resources after proven child termination. Review and verify the prepared package; do not rebuild CI infrastructure.

**Tech Stack:** Node24.21.0, npm11.19.0 supported local bundle, TypeScript/Vitest, PostgreSQL15, Linux native child process groups, existing GitHub Ubuntu24.04 workflow.

**Spec:** ../../replatform-audit/migration-gap-audit-2026-10-05/README.md; ../../../.superpowers/sdd/epic-01/task4.2-fresh-image-cleanup-revision.md and fresh-ci-failure-reconciliation.md.

## Global Constraints

- Baseline dc61db1cf895b687fd3d32c3b6e4e6463d0d3663, isolated codex/unified-replatform checkout. Preserve all unrelated dirty files; no broad staging.
- Planning does not execute commands. Below commands run only during implementation/verification in an owned clean checkout.
- Never touch retained port51642/container music-c10-qualification-2f57782-pg15. Reject ordinary55432, ambient database/Docker/production/UAT/C10 authority.
- Linux runner is intentionally Linux-only. A Windows contract pass cannot qualify native process-group behavior. Existing186 contract receipt used24.14; rerun that finite scope on24.21 rather than relabel it.
- No skip/exclusion, lowered coverage, grant/assertion weakening, sharding or production deployment. Preserve existing full-disclosure and fixable HIGH/CRITICAL image gates.
- Evidence includes source hashes, runtime/dependency versions, actual discovered/executed/skipped identities, first failure and owned cleanup. Secrets never enter logs.

## Review Focus

1. Acquired authority survives receipt persistence failure; exact helper cleanup happens before original error rethrows.
2. Child error/abort precedes close; database cannot disappear beneath a live child.
3. Hard interruption leaves unresolved command custody fail-closed, with evidence retained rather than guessed cleanup permission.
4. Games hook admission must lead to25 actual test bodies, not hook-induced skips.
5. Report validation is downstream of integration failure; strict image/scan gates must actually execute before acceptance.

## Ownership and interfaces

Existing five-code-file package only: .github/workflows/tunes.yml; tunes/scripts/music-image-ci-tests.ts; tunes/server/test/deployment/music-image-ci-tests.test.ts; tunes/server/test/music-runtime-role.integration.test.ts; tunes/server/test/deployment/music-deploy-workflow-security.test.ts. No navigation/Settings/e2e source ownership.

Consume existing ImageTestDependencies and runImageCiTests(environment: NodeJS.ProcessEnv, dependencies: ImageTestDependencies): Promise<void>; nativeImageTestDependencies(): ImageTestDependencies; verifyNativeImageCleanup(): Promise<void>. Start/attest/stop types come unchanged from music-qualification-postgres.ts. Produce a scoped reviewed package plus exact-source qualification receipts, not a new helper API.

### Task 1: Independent package review and supported finite verification

- [ ] Fresh reviewer compares all five SHA256 against cleanup-revision report, verifies six-command discovery/security/grant gates and custody transitions, and records findings with source lines. Rejected findings require a fresh scoped writer and meaningful reproduction; no speculative edits.
- [ ] Prepare exact git archive plus reviewed five-file overlay and physical dependency tree in an owned temporary directory. Verify supported node/npm provenance, all package lock hashes and main/auth-runtime postinstall topology. From its tunes directory run the supported npm CLI `ci --legacy-peer-deps`; do not use ignore-scripts or share node_modules.
- [ ] Run supported node against `node_modules/vitest/vitest.mjs run server/test/deployment/music-image-ci-tests.test.ts server/test/deployment/music-deployment-files.test.ts server/test/deployment/music-deploy-workflow-security.test.ts server/test/deployment/music-release-native-launcher.test.ts server/test/contracts/music-documentation-contract.test.ts server/test/contracts/music-qualification-lanes.test.ts --maxWorkers=2`. Expected current186 passed, zero failed; inventory any legitimate reviewed delta.
- [ ] Run supported node `node_modules/typescript/bin/tsc --project tsconfig.music-c0.json --pretty false --incremental false`. Expected exit0. Verify scoped diff-check and five hashes after execution.
- [ ] Review original meaningful RED23pass/2fail custody receipt and27-body runner coverage. Tests must explicitly assert transfer failure→stop→absence, no DB stop before late close, first error retained, missing-close rejection without cleanup permission and command-running fallback refusal.

### Task 2: Owned Linux admission/cleanup qualification

- [ ] Confirm an existing authorized Linux execution facility with24.21 and owned RUNNER_TEMP is actually available. Record native executables/dependency and Git/source provenance. Do not assume the browser Linux preflight script automatically qualifies this npm-only runner. If unavailable, mark local native qualification BLOCKED and use exact-SHA hosted Ubuntu validation as the native evidence lane after Task1 review; do not create new infrastructure or claim local native success.
- [ ] For local admission probe, call runImageCiTests with native dependencies except an owned ephemeral command adapter executing only first callback: `npm run test:integration -- server/test/games-public-gateway.integration.test.ts server/test/explorers/games.integration.test.ts server/test/music-runtime-role.integration.test.ts`; other callbacks perform no suite. Wrap port() to select a free loopback port excluding55432/51642 before acquisition; preserve all native ownership/cleanup methods. This private adapter is diagnostic evidence, not production code.
- [ ] Require13 public Games and12 owner Games actual bodies, zero Games skips, exact hostile capability diagnostic `runtime capability role has unsafe attributes or membership`, restore current schema38/data/grants, temporary restore database removal and exact container/process absence. Stop at first substantive error; no automatic second run. Classify it before a fresh fix assignment.
- [ ] After probe acceptance, run unmodified CLI with fresh owned authority: `node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts`. Preserve all six commands: unit maxWorkers2, full integration, both C8 coverage commands, scoped types, baseline comparator. No filters. Record every discovered file/body and conditional skip reason; pre-repair43files/531bodies is historical, not a forced expected total.
- [ ] Always invoke `node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts --cleanup` in the same owned RUNNER_TEMP context. If custody remains command-running, report cleanup blocked and retain protected receipt; do not force deletion by name. Local full CLI may only run in a facility where51642 is unavailable/reserved and the execution guard proves that condition; otherwise defer it to fresh hosted runner, where local retained authority is unreachable.

### Task 3: Scoped publication and exact hosted verification

- [ ] Fresh independent reviewer assesses supported finite/native receipts and explicit blocked limits. The controller stages only five reviewed code paths plus scoped evidence, checks unrelated hashes/index, and commits a reviewable checkpoint. No merge/amend/force push.
- [ ] Push exact SHA to refs/heads/codex/unified-replatform through existing authorized non-deploying PR119 flow; verify remote and PR head. If local Linux was unavailable, label hosted run as first native qualification, not repeat confirmation.
- [ ] Inspect exact-SHA API image validation: all six tests, owned cleanup, disk reserve/build/immutable runtime graph/full scan/fixable HIGH-CRITICAL gate/report and artifact transfer must complete. Release production remains disabled. Preserve failure cascades separately and diagnose first cause before any repair/retry.
- [ ] Record exact run/job URLs, counts, skipped obligations and receipts in ledger. Other browser gates remain governed by navigation/lifecycle plans; a green image alone does not close full QA.

## Completion and self-review

Done only when scoped source review, supported finite tests/types, actual Linux full command sequence/cleanup and exact hosted image/security gates are accepted. Missing local Linux may be satisfied by actual hosted native evidence with the local obligation explicitly blocked; no invented local proof. This plan does not grant release readiness, provider Games parity, unrelated CI optimization or category expansion.

Spec review: authority/cleanup/security/source provenance and below-floor receipt correction covered; no shared file conflict with navigation/lifecycle packages; real Linux availability is a named execution precondition with a concrete existing hosted fallback. No commands or resources were executed while writing this plan.
