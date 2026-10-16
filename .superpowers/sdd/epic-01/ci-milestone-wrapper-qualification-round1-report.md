# Wrapper qualification review corrections, round 1

This supersedes the pre-review wrapper source/artifact claims in the original report. Both P2 findings in ci-milestone-wrapper-qualification-review.md are addressed without application, spec, workflow, gate or pure browser-module changes.

## Executed source and installation boundary

Snapshots now include the tracked migration SQL inventory and compare it with the actual migration-loader directory; missing or untracked SQL rejects. They hash the owned database, secret, evidence, redaction and qualification helpers and follow their relative transitive source imports, rejecting missing or unreviewed imported dependencies. The conservative first-party union includes server/shared/auth-runtime, frontend source/public assets, frontend entry/configuration files and runner/Vite/spec setup configuration. Relevant untracked runtime files, including ignored additions, reject; the exact auth-runtime/node_modules boundary is excluded from that source-addition guard because its locked installation is separately validated and its installed inventory is hashed. All four installed .package-lock.json inventories are source-bound, and auth-runtime now joins root/Tunes/frontend locked-install validation.

TDD: an owned temporary Git fixture was already dirty before mutation. Before the repair, changing 0001_runtime_baseline.sql left sourceHash unchanged and the regression failed. After repair, migration and each of the five authority/helper mutations change the hash with dirty still true. Missing dependencies and normal/ignored untracked runtime/import additions reject. No actual migration or authority helper was edited for reproduction.

## Protected artifact boundary

Protected mode only generates a private Playwright configuration from the reviewed base config. It disables trace, video and automatic screenshots on both default use and every project, and confines all output to the owned disposable fixture directory. Discovery and execution use that same configuration. Actual reporter metadata, selected project output paths and generated config path are checked; Windows slash normalization is resolved without permitting output escape. Normal standalone runner behavior is preserved.

No screenshots are retained. Books' existing explicit screenshot calls write inside the private owned output and are deleted with that directory. Each successful lane receipt requires artifact-policy off/off/off and confirmed removal of generated configuration/output before publication. Only qualification.json and four lane receipt.json files remain after a successful run. A failed child may preserve an allowlisted failure.json containing source-bound exact identities/statuses/attempts and cleanup policy; it carries no raw errors, cookies, tokens, reporter/config files or image/video/trace artifacts, and cannot qualify as a passing lane.

The controlled local browser test intentionally fails an Expected/Received assertion after installing a dummy cookie. It verifies actual failed status, actual generated reporter metadata/output, no ZIP/video/image outputs, private reporter/config/output removal and only a sanitized failed-result JSON remaining before test teardown. Its failure is not counted as a passing browser lane or real-PG interruption experiment. Separate negative contracts reject trace/video/screenshot enablement, output escape, failure-record credentials, retries and cleanup failure.

## Final actual evidence

Clean export: C:/Users/TK/AppData/Local/Temp/milestone-wrapper-clean-ba079652fa4540b59aa356398fb8668a

Fresh actual root npm alias command: platform:test:e2e -- --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt C:/Users/TK/AppData/Local/Temp/replatform-e2e-3339fcffe1ef4152aae8ff41b5006c48

Exit 0. Exact Auth 6 + Profile 2 + Books 20 + Lifecycle 10 = 38 passed, one passed attempt each, retry 0, no skips, empty reporter errors. All four owned cleanup/artifact receipts passed. Each recorded attested container was independently inspected and absent. Foreign concurrent resources were preserved. Retained file inventory is exactly five JSON receipts.

Source basis remains honestly recorded as 106960f2a6a9eafd5240ec7a506f3b212e2db280 plus the scoped dirty overlay; no clean-release provenance claim. SourceHash: 160343963cdac435d82826c90f5a3a70e08b9e3dbfddedad8d35ef7b9cd10daa. Independently recomputed all 1,610 recorded file hashes from the executed export: zero mismatches. Tools: Node24.21.0, npm11.19.0, Playwright1.61.1, Chromium149.0.7827.55. Four locked install inventories validated.

Final node --test scripts/replatform-e2e.test.mjs: 47 passed, zero failed/cancelled/skipped. Focused runner/helper TypeScript compilation passed; scoped git diff --check passed. Logs: wrapper-round1-final-contracts.log, wrapper-round1-final-types.log and wrapper-round1-final-real.log in the clean export.

Preparatory failures remain failures: first protected Auth discovery rejected Playwright's Windows output-path normalization before correction; a subsequent full attempt passed Auth/Profile but Books exited1 and the aggregate stayed failed with owned cleanup. That older helper deleted raw JSON before retaining exact failed identities, so the precise cases from that attempt are unavailable and no cause is invented. The additional normalized failed-result record repairs that observability limitation. Isolated unchanged protected Books then passed20, and the final source-bound four-lane run above passed38. No automatic retries, spec changes, threshold changes or assertion disabling were introduced.

OverallMilestone=incomplete, fullParity=incomplete, releaseEligible=false remain explicit. Pending deployed Google2.4, Analytics3.4, unified QA/image/schema/trusted producer3.5, other category families4/5, Music6.1-6.3, consumers7.1/7.2 and removal/rename/promotion/deployment8.1-8.4 remain pending. Independent rereview is required before push.