# Fresh C8 workflow consumer contract repair

2026-10-05; integration HEAD2724ddb7879595fb6411b08608f5cf9ab3fbfa83. Owned source change: tunes/server/test/contracts/music-reconciliation-workflow.test.ts only. No workflow, runner, grant, security, skip or coverage-floor change; no installation, resource acquisition, browser, stage, commit or push.

## First cause and adjacent review miss

Read hosted2724-c0-first-failure.log, fresh-image-checkpoint-review.md and docs/superpowers/plans/2026-10-05-games-image-ci-verification.md. Hosted C0 Ubuntu reported1169 passed/1 failed/10 skipped; Windows48 passed/1 failed. Both first failures are the consumer assertion at line151 expecting literal inline `npm run test:music-c8:coverage` in Test Tunes. The producer workflow now invokes `node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts`, whose six-command export retains both C8 vectors. This is an adjacent producer/consumer contract miss: the five-file source review and finite six-file selection covered the new producer and its runner tests but omitted this existing workflow consumer. It is not evidence of lost C8 execution or a general CI failure. Native image acceptance and downstream hosted failures remain separate obligations.

## Repair and rejection strength

Kept all seven original cases. The affected case still asserts MUSIC_C8_POSTGRES_TEST=1, fixture analytics token, C0 public root command authority and watch paths. It now checks exact executable workflow lines (install then delegate) and imports the actual IMAGE_TEST_COMMANDS export, asserting all six exact ordered argument vectors, including coverage and repository coverage. Removing/replacing the delegate or either C8 vector fails these equalities; inline comments cannot satisfy them. No new negative case is necessary for these direct equalities. The existing27 runner behavior cases separately prove command execution/custody; this consumer test is wiring evidence, not native PostgreSQL execution proof.

## Supported RED and finite GREEN

Used existing controller-owned facility C:/Users/TK/AppData/Local/Temp/music-image-ci-cleanup-abff3e1fbf364e0f8494bab021814cba with existing physical main/auth-runtime dependency trees, both LinkType null. Verified all five overlay hashes against integration before execution. No reinstall or dependency sharing/junction creation. Node C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64/node.exe reports24.21.0; its node_modules/npm/bin/npm-cli.js reports11.19.0. Process-local PATH prepends that bundle; Vitest4.1.9.

An initial integration path-substring run discovered an additional retained hidden `.music-cli-contract-isolated-lD7DRB/repository/tunes/...` test copy: target6 passed/1 failed, aggregate13 passed/1 failed across2 files. This was disclosed and is not the canonical RED receipt. Switched to the already-owned clean facility without exclusions or deletions. Exact RED command: supported node `node_modules/vitest/vitest.mjs run server/test/contracts/music-reconciliation-workflow.test.ts --maxWorkers=2`. Exit1;1 file,6 passed/1 failed,0 skipped; same line151 inline-C8 diagnostic; duration269ms, start15:56:23 local.

Copied only the repaired consumer into that facility. Once ran supported node `node_modules/vitest/vitest.mjs run server/test/contracts/music-reconciliation-workflow.test.ts server/test/deployment/music-image-ci-tests.test.ts server/test/deployment/music-deployment-files.test.ts server/test/deployment/music-deploy-workflow-security.test.ts server/test/deployment/music-release-native-launcher.test.ts server/test/contracts/music-documentation-contract.test.ts server/test/contracts/music-qualification-lanes.test.ts --maxWorkers=2`. Exit0;193 passed across7 files,0 failed/0 skipped; duration5.03s, start15:56:52 local. This is original186 finite bodies plus preserved7 consumer bodies. `git diff --check -- tunes/server/test/contracts/music-reconciliation-workflow.test.ts` exit0.

Repaired integration and executed facility consumer SHA256 both a9d5f31f5bed7a3778842f47d3bfd88f9bb9796c372da49bc46995d420f46375.

Unchanged five overlays verified before run:

- .github/workflows/tunes.yml:968c28dd211459550119d369672c5266d4cf961fc7f3d332756eb2abbcd32374
- tunes/scripts/music-image-ci-tests.ts:0dc2c2b4abe22d203c68780a6debcf8213a1a82657be30c0c916854095a32fb6
- tunes/server/test/deployment/music-image-ci-tests.test.ts:bb6fbba0e1cce4aefd813b9db6b076080aa9b9f3aab830d0b73f66ab2a890abd
- tunes/server/test/music-runtime-role.integration.test.ts:40ca0c16680d2fa37ea7191b5b86477e14591a4df60dc1efd80ec3672231fae2
- tunes/server/test/deployment/music-deploy-workflow-security.test.ts:b833357acb9ce9f6d68f97b13202365217c9246fa6e51bf03bc881a3d8a1dd2e

Fresh independent review requested from controller; no self-review acceptance claimed. Finite Windows contracts do not close hosted/native image, security/report or release readiness obligations.
