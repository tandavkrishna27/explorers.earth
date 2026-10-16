# Finite frontend CI regressions repaired

2026-10-02; base b645aa722051000e8893e5bb987146f4f514060f, branch codex/unified-replatform. Scope: discovery dependency ownership/diagnostics, exact canonical auth fixture expectation and bounded image/native workflow applicability. No broad category/Music parity conversion, gate removal, retries, production operation or push.

## Proved root cause before changes

Clean archive b645aa72 at `%TEMP%/frontend-ci-finite-123da5dab9db4b628899d87e226ddbec` had frontend dependencies available and NO Tunes dependencies. Portable Node24.21.0 invoked actual Playwright CLI with --list --reporter=json for category-navigation and music-publishing. Both exited1; stdout JSON errors explicitly said `Cannot find package 'zod' imported from .../tunes/shared/explorersBookContract.ts`; stderr was empty. The JSON stdout/error files remain in that export. This converts the earlier strongly inferred install-topology cause into an observed exact loader failure. No browser execution was needed for the red dependency proof.

## Changes

- ci.yml unit job now installs `npm ci --prefix ../tunes --legacy-peer-deps` before test:coverage, exactly the existing browser-lane install pattern. Tunes owns the shared runtime schemas loaded by Playwright; no copied schema, NODE_PATH or permissive import fallback.
- Discovery process decoder surfaces JSON stdout loader errors, stderr, status, signal and spawn errors; rejects malformed JSON, reported errors and missing suites. Existing discovery tests still enforce45 category identities across A/B and nightly plus69 isolated publishing identities. Four new cases validate the actual previously hidden zod-error shape, killed/spawn-failed processes, malformed/reported errors and preserved successful suites. Initial test execution failed resolving the absent decoder; final cases pass.
- Exported existing schema-valid canonicalCategoryAccount fixture builder; contained-auth expected account uses it and explicitly asserts the nine category names/order, Books public/pinned state and private Music state. Cookie inclusion, account/session distinction, lifecycle revision, omitted-credential/foreign-origin/wrong-owner denials and empty legacy storage assertions remain. Removed the now-unused generic account fixture import.
- API image paths now include root .dockerignore, fixture generator, image disk/report scripts and disk contract test, generated architecture inventory. Native C0 paths include root .dockerignore and fixture generator, while existing docs/** already covers inventory. Both PR and push lists updated. Two existing documentation-contract cases enforce prerequisite install ordering and root dependency applicability for both events. Required aggregates, triggers, thresholds, schedules, release mechanisms and reconciliation remain unchanged.

## Clean qualification topology

Final archive `%TEMP%/frontend-ci-final-475a37842aaa47e5b619da1c895c8cfd` overlays only the nine scoped source/test/workflow files. It excludes unrelated dirty reports/public assets and concurrent public test writer changes. Its dependencies are actual fresh installs, not worktree junctions: portable Node24.21.0/npm.cmd executed frontend npm ci and Tunes npm ci --legacy-peer-deps, both exit0. Existing npm lifecycle-script warnings retained in install logs; no dependency approvals or lockfile changes.

Accepted checks on this final source:

- Contained frontend runner, category-discovery plus decoder tests:2files7/7,19.98s, exit0. Existing3 discovery cases preserve45/69 identities; decoder4 cases pass. focused-discovery.log.
- Actual `node node_modules/typescript/bin/tsc -b`:exit0. types.log.
- Actual Playwright contained-auth-session config, owned port55199:6/6,3.1s, exit0. auth-browser.log and normal retained artifacts in export. Every positive/negative canonical authority case executed.
- Tunes normal documentation contract command with1worker/fileParallelismfalse:1file34/34,4.34s, exit0. workflow-contracts.log. Main worktree first run also collected an old isolated scratch copy (66tests); that receipt is not promoted. Clean exact34 is accepted.
- Normal unchanged frontend coverage command with bounded2workers: `npm.cmd run test:coverage --prefix explorers-earth -- --maxWorkers=2`:289files4051/4051,189.36s, exit0. frontend-unit-coverage.log. Existing broad coverage configuration and thresholds retained; overall coverage remains45.19% statements/39.70% branches/39.71% functions/44.17% lines. This is normal broad frontend coverage acceptance, not a100%coverage claim.

## Commit and limits

Only the nine scoped workflow/fixture/diagnostic/test files plus this report are committed. Concurrent public test writer commit35b707ab is preserved; final clean qualification derives from b645aa72 plus this writer's exact overlay and does not promote the concurrent writer's changes as independently tested here. Original unrelated dirty files/scratch preserved. No category/Music parity gate is disabled, no complete broader browser success or milestone closure claimed. Required broad retained category/Music failures remain independently owned by Epics6/7. Independent review follows; no push.
