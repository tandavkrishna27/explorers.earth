# Analytics frontend 3.4 bounded implementation report

Implemented against backend68144055 and frozen task3.4 delta. Frontend source only; no push, PG provisioning/browser execution, workflow/package/shard/root-wrapper, backend/deployment changes. Parent handed off original backend writer's dirty service/client red tests; no concurrent frontend writer.

Generic POST defaults same-origin `/api/explorers/analytics/events`; historical GET endpoint/date/bearer/development transport stays unchanged until7.2. Each attempt/pending poll checks current consent. Acknowledgement requires200/201 committed status and boolean duplicate; optional retired requires true duplicate; optional documentId must be string. Empty/HTML/204 success is not committed. Complete generic payload/ID survives ambiguous hook retry with original timestamp/metadata/attribution; scope includes account/resources/path/event. Existing session/in-flight dedupe and owner exclusion remain with normalized username comparison.

Books main waits for usable public category data, including successful empty, and rejects stale private data. List/subject add views and route-owned card clicks with issued creator/collection/recommendation IDs; subject never becomes collection authority. Cards remain stateless. Optional modal callbacks report share/outbound action with issued targets and no outgoing URL/query. Books fallback descriptor suppresses telemetry; main publishes readiness and list/subject register only usable data. Sharing remains functional. Existing shared Books page mapping/theme/observer architecture stays intact. PublicProfile already uses issued ID from usable current shell: no redundant page edit or unused placeholder change; profile regression tests remain.

Minimal Music freezes full existing event/UTM/authority input by authority/route/occurrence across ambiguous retry. Attempts/polls recheck consent and validate committed receipt. No browser timestamp, identity provisioning/recommendation target or Music6.1 transport expansion.

## Evidence

Observed red failures before fixes: generic invalid success/cross-origin/withdrawal, hook changed timestamp and premature view; Music changed event/UTM, withdrawal/empty success; Books early/private main and absent list/subject views/cards; loading header telemetry and missing detail action callback. Two initial Music tests used an invalid base URL, corrected and rerun to observe intended failures before source edit. No relevant tests removed. Books loading-header expectation now requires zero telemetry; other category assertions retained.

Focused client/producer/header run128 tests10 files passed; added real-hook Books negative cases passed7/7. Earlier nearest run483/486 passed with three expected fallback exact-DTO assertions needing analyticsReady:false; corrected and included in complete lane. TypeScript installed `node node_modules/typescript/bin/tsc -b` from frontend passed; initial root invocation could not find tsconfig and was rerun correctly. All commands used portable Node24.21 and actual npm. Final complete unit result appended below. Existing optional npm config, Browserslist age and i18next warnings recorded; no warning-free claim.

Tests use real hook/client with controlled projection/fetch, not actual backend/PG. Existing20 Books/38 root browser identities unchanged. Diff whitespace checked before commit; no build/image/deploy/provider QA claim.

## Remaining

Independent frontend source review before push. Ticket3.4 incomplete: backend P2 review/fixes and focused owned PG15/canonical API/Chromium acceptance remain. Coordinate database ownership and explicit small suite/adapter separately per frontend plan; no silent protected-manifest extension or milestone claim. Source-level lost-response tests prove request semantics, not database event counts.

Final normal lane: 291 files / 4073 tests passed, exit0, 28.76s. Final installed TypeScript build check exit0. No PG/API/browser execution performed.
