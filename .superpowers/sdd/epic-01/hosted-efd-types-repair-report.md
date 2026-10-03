# Exact efd176c3 hosted first-failure diagnosis and repair

Runs 37083635183 (Windows/Linux C0) and 37083635369 (image) both stop at `music:types:scoped`, TS7016 at platform-runtime-smoke.test.ts importing scripts/platform-runtime-smoke-contract.mjs. C0 contract execution passed 801 tests with ten existing skips; image contract execution progressed to the same strict compilation defect. No separate dependency resolution defect was found in these first-failure logs. Image scan qualification skipped after this failure is consequential, not an independent cause.

Root cause: new JavaScript smoke assertions acquired a TypeScript backend contract consumer but shipped without adjacent module declaration. The strict compiler correctly refuses implicit-any imports. Local 49 runtime tests were insufficient evidence of the complete C0 type closure. Runtime-plan imports local environment validation and Node builtins; it does not import an externally installed root package.

Finite plan: reproduce on exact archived efd source, preserve strict gate, add adjacent .d.mts interfaces matching actual inputs and exports, reject malformed typed consumers, run existing twenty smoke assertion contracts plus full scoped compilation. No runtime/SQL/auth/fixture/CI gate change.

Verification:
- Exact archived efd scoped compilation reproduced TS7016. Initial probe additionally lacked the separately installed auth-runtime dependencies and produced three contextual-any diagnostics; those disappeared after the required auth-runtime dependency tree was attached. This probe setup issue is distinct from hosted failure.
- Overlay only adjacent declaration: full exact efd scoped compilation exit 0 using existing locked backend and separately installed auth-runtime dependencies. No unrelated working source or proxy files entered this archive.
- Twenty existing smoke assertion tests passed, zero skips.
- Strict independent typed consumer probe passed with three @ts-expect-error obligations: string HTTP status, incomplete restart/session/schema evidence, numeric compiled source. Correct export return accepted as string; no any declarations or compiler exclusions added.
- Current shared-worktree full scoped compile correctly detects uncommitted proxy module/type errors; those belong to the concurrent writer, were reported, and are not labeled preexisting or hidden.

Clean source probe: %TEMP%/efd-types-c55a1875a95e4d2ba97997ea42aaa6ac; retained for independent verification. No Docker/database resource provisioned, no deployment, no push. Commit scope is declaration plus this report. Independent review required before explicit-SHA push.
