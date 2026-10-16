# Fresh API full qualification

Bounded qualification at integration HEAD 46eea549d0d2661424a3dd2b8d71cee38cc47f30 on 2026-10-05. Only source repair is tunes/server/test/explorers-manual-overrides.test.ts; integration and executed private bytes both SHA256 43ba90ad600b99a32bcf06d2313f8778c416f2edf1ae8b3a8105067b7b726a83. No product changes, CLI contract changes, resource provisioning, staging, commit, or push performed. This report is the sole owned integration write.

Evidence root: C:/Users/TK/.codex/tmp/games-restore-committed-46eea54-9e801f4f6f304ca08e96b6e6c1ad4024. Executed directory: evidence-root/source-lf/tunes. Prior direct-node failed full-unit JSON/log, reproduction, targeted14 green, source hashes, install logs and historical receipts preserved.

## Invocation diagnosis and actual corrected command

Package script tunes/package.json test is vitest run. Hosted .github/workflows/tunes.yml Test Tunes uses npm test -- --maxWorkers=2. The public-root CLI contract at music-cli-contract.test.ts:67 requires npm_execpath, which actual npm sets for its script process. The direct-node invocation omitted it. No fabricated npm environment or source/gate change is needed.

Runtime directory: C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64. Explicit node --version returned v24.21.0; actual node node_modules/npm/bin/npm-cli.js --version returned 11.19.0. Default machine node24.14/npm11.9 was not used. Runtime directory prepended to process PATH so npm script children resolve the same supported node.

Exact corrected native PowerShell command, executed once:

```powershell
$runtime='C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64'
$env:PATH="$runtime;$env:PATH"
& "$runtime/node.exe" "$runtime/node_modules/npm/bin/npm-cli.js" test -- --maxWorkers=2 --reporter=json --outputFile=C:/Users/TK/.codex/tmp/games-restore-committed-46eea54-9e801f4f6f304ca08e96b6e6c1ad4024/fresh-api-full-unit-npm.json
```

Output persisted to fresh-api-full-unit-npm.log. No PG/browser resources were added.

Existing fresh-dependency-provenance.json and four install logs establish locked installs: root33/backend780/auth24/frontend745; four physical roots, direct dependencies present, no mismatches, controlled LF locks unchanged. Read-only physical ownership/package-count recheck reconfirmed 33/780/24/745 for this execution. No install repeated.

## Finite checks

With the same explicit node/npm runtime and process PATH, actual npm run music:types:scoped exited0; log source-lf/fresh-api-scoped.log. Actual npm run music:types:baseline exited0; source-lf/fresh-api-baseline.log reports baseline clean:142 current,103 resolved, compiler exit2 (expected comparator baseline, not zero global TypeScript diagnostics).

Direct supported node node_modules/typescript/bin/tsc --project <evidence-root>/fresh-api-onefile-strict.json --pretty false exited0. The external config inherits tsconfig.music-c0.json, includes repaired test plus express/geoip ambient declarations, and enforces strict/noEmit/incrementalfalse. External config/log retained. No repository config edit.

Integration git diff --check -- tunes/server/test/explorers-manual-overrides.test.ts exited0 with ordinary LF/CRLF warning. git diff --cached --name-only was empty.

## Platform discovery difference

Hosted Linux result was3354PASS1FAIL19SKIP (3374 total). Prior native direct-node result was3368PASS1FAIL4SKIP (3373 total). Hosted19 skipped counts are reconciliation3, CLI authority1, Docker release authority3, reconciliation config2, native launcher1, local-state8, load-authority1. Source runIf/skipIf guards explicitly select Windows ACL/private-file cases and Linux process/checkpoint cases; native launcher additionally checks installed Windows node compatibility. Windows runs cases that Linux skips; native PostgreSQL pool burst remains skipped without its explicit real-tool facility. These are different platform discoveries, not an assertion that15 historical skips were waived. Repaired fixture adds3 tests; corrected native result must be reported from its own JSON.

## Final corrected result and readiness

Terminal command exit0. Final JSON:3373 total,3369 passed,0 failed,4 pending/skipped,0 todo;399 reporter suites passed,0 failed;success true. The prior CLI envelope assertion now passes through actual npm. Repaired manual-overrides file passes. The four skips retain exactly the previous native identities: group-writable checkpoint directory; real PostgreSQL50-query burst; native child termination signal; stubborn Unix process-group escalation. No skip was added or suppressed. Final log confirms JSON written.
Runtime cached archive SHA256158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541 matches retained node24-alignment/SHASUMS256.txt win-x64.zip entry. Private repair hash rechecked unchanged during final wait. Remaining existing deployment fixture Bash processes have changed IDs/creation timestamps, providing progress evidence while JSON reporter stays quiet.


Finite one-file qualification is green and supports a curated one-file commit after fresh independent review and source/index inventory. This is not authority for wholesale staging, push, or closing hosted browser/parity obligations. Historical canonical82/native12/contracts116 remain historical; no relabeling as newly executed repair evidence.
