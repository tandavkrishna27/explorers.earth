# Books CI source repairs

2026-10-02; base 6be79b2269cba44bfaeecc53e1ffec554cb12291, branch codex/unified-replatform. Sole source writer. No push, merge, production publication, workflow/threshold/environment gate relaxation or baseline replacement.

## Changes

Regenerated both exact fixture Docker allowlists with the normal generator: six tracked Books API modules plus two explicitly required shared Books contracts. The actual Docker build exposed a further source defect beyond the initial four-file diagnosis: its explicit COPY list omitted explorersBookContract and explorersBookCoverContract. Added only those two fixed generator entries and explicit Dockerfile copies. Search/Owner/Public/Contract relative dependencies were inspected; all are now included. Existing drift contract already covers tracked new-module additions; extended the existing contract to require every allowlisted shared contract has an explicit COPY and every relative shared import is included, preventing the observed missing-dependency failure without a second redundant test.

Changed failed-import cleanup to Array.from(new Set(...)), preserving one delete per copied media ID with the default compiler target. HTTPS options now use RequestOptions & Pick<TcpNetConnectOpts, 'autoSelectFamily'>. Pinned IP/family, custom lookup, disabled family selection, no agent, TLS hostname/certificate verification and abort semantics remain identical.

## Executed verification

PowerShell PATH prepended C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64; commands use portable Node 24.21.0 and its npm.cmd.

- node scripts/generate-music-fixture-dockerignore.mjs --write; node scripts/generate-music-fixture-dockerignore.mjs --check: exit 0. Generated differences limited to six API paths and two shared contract paths per allowlist.
- npm.cmd run music:types:baseline: exit 0; comparator reports 142 current, 103 resolved, compiler exit 2. Zero new normalized diagnostics; this is retained baseline qualification, not a claim the broad compiler is diagnostic-free. TS2802/TS2353 additions are removed without target changes or baseline update.
- npm.cmd run music:types:scoped: exit 0.
- npm.cmd run build:api: exit 0; 22 bundled outputs.
- node tunes/dist/server/deployment/run-production-graph-smoke.js: exit 0.
- npm.cmd test --prefix tunes -- --config .books-ci-vitest.config.ts: 6 files/120 tests passed. Temporary config merges the normal config and sets exact include paths: server/test/book-cover-fetch.test.ts, server/test/book-cover-production-transport.test.ts, server/test/contracts/music-compose-safety.test.ts, server/test/contracts/music-cli-contract.test.ts, server/test/contracts/music-cli-contract-isolation.test.ts, server/test/contracts/music-cli-contract-authority.test.ts. Existing meaningful regressions exercise reserved/mixed DNS rejection, pinning, TLS hostname, disabled address selection, redirect/MIME/overflow/deadline behavior and native CLI context isolation. Repeated after the two shared-copy fixes: 6 files/120 tests passed. After strengthening dependency closure assertion, npm.cmd test --prefix tunes -- --config .books-ci-vitest.config.ts server/test/contracts/music-compose-safety.test.ts: 1 file/7 tests passed. Temporary config removed afterward.
- Initial docker build --no-cache -f explorers-earth/Dockerfile.music-fixture -t explorers-books-ci-fixture:local . reached real frontend tsc and failed TS2307 for the two absent shared contracts. No registry failure was hidden.
- Clean context created with git archive HEAD -o <temporary-directory>/source.tar and tar -xf into that directory, then only scoped source repairs copied over. No dirty checkout docs, generated public files, dependencies, scratch or secrets supplied. docker build --no-cache -f <temporary-directory>/explorers-earth/Dockerfile.music-fixture -t explorers-books-ci-clean-fixture:local <temporary-directory>: exit 0 after shared-copy repair, including npm ci --engine-strict, landing checks, tsc, Vite and HTTPS-only production transport contract. Docker image inspect ID: sha256:9c6f7668b21d7ca684949fb79266149b0443e36e93d89bcddb0cc701ab7bc8cf. No push performed.

## Limits and contamination accounted for

First broad Vitest positional-selector invocation also collected a pre-existing untracked nested tunes/.music-cli-contract-isolated-lD7DRB/repository copy. It produced 3 failed/7 passed files, 2 failed/150 passed/55 skipped tests, including stale-copy context and nested missing .env.music.test.example plus duplicate temporary-path collision. This is not reported as passing; exact include configuration reran all intended actual source suites without those copied suites and passed. Existing scratch was preserved. All unrelated dirty docs/public/scratch excluded from commit.

Hosted platform service-build registry-rate-limit remains an independently recorded external failure from the original diagnosis. Local fixture registry acquisition succeeded, but this does not qualify the hosted platform lane, full native suite, image vulnerability scan or retained category/browser authority failures. Docker npm ci reported 17 dependency vulnerabilities; no dependency changes or vulnerability-gate claims made. No cover import PostgreSQL integration suite rerun: this bounded cleanup edit is validated for compatibility and existing boundary units; earlier DB evidence remains separately scoped.
