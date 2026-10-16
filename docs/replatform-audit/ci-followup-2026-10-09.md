# CI follow-up after lifecycle implementation — 2026-10-09

Checks on pushed `55eba604b39b14016b89674f513b1cdee5f8de52` exposed two implementation-package regressions. They do not establish ticket closure.

## OCI fixture schema

[Linux C0 run37942291418](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37942291418), [backend contracts run37942291407](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37942291407), and [image run37942292296](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37942292296) fail at stale independently generated OCI fixtures. Releases claim51 while the current schema floor is52, so release parsing rejects them before case-specific OCI validation. Direct Windows invocation reproduces53 failed/44 passed; this is not an OS-specific behavior defect.

The existing independent generator now emits52, and its cases/receipt are regenerated. Historical51 rejection is added. Four focused contract files pass284 tests. Independent review compared all71 cases: names, intended errors, API/web OCI bytes and layers unchanged; decoded release differences are limited to schemaVersion and manifestDigest. A second generation produces identical bytes. Production validation is unchanged.

The image job stopped before building/scanning; its later report-validation failure reflects absent image evidence. No new Handlebars scanner pass follows from this run.

## Lifecycle regression isolation

Hosted database job113859472515 reports42 files passed/1 failed/5 skipped,653 tests passed/6 failed/7 skipped, plus a cleanup-hook timeout. The new numeric cases pass, but leave pending deletion operations. Later global worker tests with batchSize1 claim those older operations, and the final default batch claims3 instead of1. An assertion in the paused-upload case occurs before releasing its held put, causing the cleanup timeout.

The correction completes each new case's own deletion through the actual worker and checks its terminal operation, after returning checked-out clients. The paused upload is released and joined in finally even on assertion failure. Worker assertions and production behavior remain unchanged. Fresh-head database execution is required to verify the repair.

The known platform-fixture failure remains `phase=ingress-check; cause=ingress-malformed-body`; no candidate waiver is introduced. Backend browser, frontend, static/security/docs/image-deploy contracts and unit coverage pass on55eba604. Frontend TypeScript, build, lint, full unit and integration checks pass; its Music/account browser lane passes. Remaining browser-lane outcomes must be read from the exact run, not inferred.

## Hosted database confirmation at1f4ce7bf

The repairs were pushed as `1f4ce7bfa7666679f7a8b901178317f410076095`. [Backend run37943365187](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365187), database job113863180047:43 files passed/5 skipped;659 tests passed/7 skipped,0 failed. The lifecycle file passes all28 tests without the previous shutdown timeout. This qualifies the authored0052 numeric retirement regressions and resolves the six downstream failures for this exact source head. It does not establish canonical lifecycle browser replacement or hosted milestone acceptance.

Linux C0 and backend contracts pass on this head, confirming the OCI fixture repair. An existing Settings hash-scroll unit case fails in the backend frontend job113863179834:4574 passed/1 failed. Its frontend source is byte-identical to55eba604, where4575/4575 passed. Read-only triage finds an unguarded100ms public-visibility callback can survive unmount and use the next test's rectangle mock. Focused22 tests and repeated local15 cases pass; deterministic held-callback reproduction is required before fixing. This additional issue remains under investigation rather than being dismissed as a green rerun.

## Settings delayed-scroll repair

Deterministic regression holds the actual100ms Language/Public Visibility callbacks, gives them offscreen geometry, unmounts their panels and invokes the callbacks. Both scroll before the fix:2 failed/22 skipped. Two source guards now return before measuring disconnected panels, matching the existing pinned-navigation guard. Connected-panel scrolling is unchanged. The focused file passes24/24 and frontend TypeScript passes. Independent source review approves without introduced P0/P1/P2 findings. Full fresh-head frontend checks remain required; no timing-only rerun or expectation weakening is used as the repair.

## Final outcomes for1f4ce7bf

- [Frontend run37943365334](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365334): all five browser lanes, full unit suite, TypeScript/build/lint/integration and `replatform-required` pass.
- [Music C0 run37943365251](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365251): Linux and Windows pass.
- [Backend run37943365187](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365187): database/browser/contracts and other applicable jobs pass except the Settings unit case and known ingress fixture; `music-required` fails accordingly. Load-chaos is skipped.
- [Image run37943365741](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365741): full Tunes tests, image build/server/migration proof, fixable high/critical scan, complete report validation and retained artifact all pass. Publish/deploy/release jobs skip; no deployment happened.

This head is not a trusted green candidate. The subsequent Settings repair needs new exact-head checks. The retained known fixture failure remains a separate coordinated-cutover requirement.
