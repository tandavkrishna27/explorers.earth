# Task3.4 analytics backend round1 marker-history repair

Original writer response to task3.4-analytics-backend-review.md P2, base6814405510fcc4277c0451af2770627a39f19b63. Scope: shell deployment engine, two nearest deployment test files, this report. Backend DB/application contracts and frontend files are unchanged; no push/provider/production action.

The0036 current marker replaced the only previous0035 occurrence in the shell known_markers array, leaving valid signed0035 ledgers unknown. The same array omitted0034. Added literal historical0034 and0035 entries in order before current0036. Complete shell history now equals the shared TypeScript deployable chain. HMAC validation, unknown-marker rejection, schema-floor rules, deployment policy authority and all gates remain intact.

TDD before production change: a signed0035 ledger with matching signed schema epoch/floor and active state failed executable deploy with “secure ledger contains unknown migration marker”. Shell/shared-chain equality failed with precisely0034/0035 absent. Targeted red run:2failed,101unselected; no retry or weakened check.

After fix:
- Focused executable authority/security regression and chain check:2files,9passed,94unselected, zero failed. Selects signed0035 upgrade/new0036 floor/incompatible rollback, correctly signed unknown ledger, existing unknown/downgraded authority, existing0030 floor refusal and four state/floor/schema-floor/schema-epoch tamper cases. The94unselected identities are not claimed as executed.
- Fresh locked source export through actual Node24.21.0-owned npm11.19.0 entrypoint: full deployment-files/controller files,33passed, zero failed/skipped.
- Changed two deployment test files and imported production dependency type closure: exit0 using a temporary include-only config extending existing tsconfig.music-c0.json; no tracked config/gate change.
- Scoped git whitespace check passed. Existing owned local fixture sandbox teardown runs after each executable test. No DB/container authority acquired for this shell-only change; earlier backend PG resources already released.

Exact command arguments, using the portable Node24.21.0 executable:

```text
node tunes/node_modules/vitest/vitest.mjs run --root tunes server/test/deployment/music-deploy-executable.test.ts server/test/deployment/music-deployment-files.test.ts --testNamePattern "signed 0035|complete shared chain|correctly signed unknown|rejects authenticated unknown|denies rollback to a 0030|rejects .* authority tamper" --exclude "**/.music-cli-contract-isolated-*/**"
node <node-owned-npm-cli> --prefix <existing-clean-export>/tunes test -- server/test/deployment/music-deployment-files.test.ts server/test/deployment/music-deployment.test.ts
node <existing-clean-export>/tunes/node_modules/typescript/bin/tsc -p tsconfig.deployment-marker-round1.json --pretty false
```

The scratch exclusion preserves unrelated retained worktree CLI clone artifacts; full nearest file qualification uses the isolated source export and locked dependencies. Signed fixtures use existing private local test authority, executable policy wrappers and deterministic test keys; no provider credentials or raw production state. Earlier39PG/27runtime/3restore independent backend evidence and identical174-line broad type debt remain historical qualification. No unnecessary DB repeat. Frontend acceptance and full ticket3.4 remain pending.

Scoped Git-filtered source blobs:
tunes/deployment/music-deploy-engine.sh 48ee6ada6ddd333fd6f4524c9cffbdb73b64d3cf
tunes/server/test/deployment/music-deploy-executable.test.ts 3b7ca3b0d087686eb88636291d9b7102df108e32
tunes/server/test/deployment/music-deployment-files.test.ts 269bc212c114db4473e48248b03da8829f4fa32d
