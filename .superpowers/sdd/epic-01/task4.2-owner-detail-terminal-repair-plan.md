# Adapter detail fanout terminal-failure repair plan (review required)

Source-grounded allocation only; no implementation/tests/UAT/resources executed. Read task4.2-owner-acquisition-fresh-independent-review.md. Movies audited: identical four-worker Promise.all/index loop without sibling terminal latch, so all three adapters need the same finite correction. This defect has NOT been attributed to retained browser failure or raw fetch TypeError.

## Exclusive six-file manifest
- explorers-earth/src/features/Books/api/booksClient.ts
- explorers-earth/src/features/Books/api/__tests__/booksClient.test.ts
- explorers-earth/src/features/Games/api/explorersAdapter.ts
- explorers-earth/src/features/Games/api/__tests__/explorersAdapter.test.ts
- explorers-earth/src/features/Movies/api/moviesClient.ts
- explorers-earth/src/features/Movies/api/__tests__/moviesClient.test.ts

No hooks, Books UI, common client/parser/transport, schema/backend/native quota, generated inventory, fixture/runner or private-account gate edits. Books hook privacy writer remains disjoint. Existing source hashes saved in companion manifest before edits.

## Minimal design
Each read creates one adapter-owned AbortController and forwards caller abort with a disposable listener (already aborted caller handled before starting). Pass its signal into first/detail/final reads. Shared terminal flag plus first-error value must distinguish a thrown undefined from no failure. Every worker checks terminal/caller/current scope before claiming the next index and immediately after awaited detail; checks validation/budget before publishing detail. Wrap entire worker body in catch: synchronously latch first thrown value, request internal abort exactly once, throw the original first error. Later sibling failures/resolutions cannot replace it, append details, claim item5 or start final observation. Preserve existing category/resource/pin comparisons, four-worker maximum,64MiB byte limits/statuses, authentic final observation, lower client authority and existing Games/Movies epoch checks. Books keeps its existing lower-client scope authority; no separate unrelated hook/render repair is folded here.

Caller-visible rejection remains prompt on first terminal failure. Do not await indefinitely pending noncooperative siblings before rejecting. Promise.all attaches rejection handling to every worker; keep worker continuations terminal-guarded until actual promises settle. Requested abort is NOT actual native settlement or memory refund proof. Final adapter cleanup removes forwarding listener on every settled outer path; terminal state already aborted, so a later caller abort cannot restart native work. On normal return remove listener only after all workers/final projection settled. No timers, retries, new shared infrastructure or arbitrary deadlines. Existing native request custody is unchanged; this patch stops future claims and requests cancellation, not force-terminating noncooperative work.

## Meaningful red then green (each category)
1. Five observed distinct records, four deferred detail calls. Reject item0 with sentinel object; assert outer rejects with exact same sentinel. Keep one sibling deliberately noncooperative; resolve item1 matching revision after rejection and flush microtasks. CURRENT source starts item4: red. Repair must retain exactly4 total detail calls, no final complete read, no partial returned result. Settle remaining siblings late, including a second different rejection, assert no fifth/new claims/unhandled rejection and original error identity unchanged.
2. Same deferred topology but item0 resolves wrong resource/category revision: current sibling item1 resumes and claims5th; corrected terminal CONFLICT must prevent. Test both revision comparisons through targeted variants.
3. Same topology item0 crosses real64MiB cumulative byte envelope using existing oversized detail approach, not weakening cap or encoder substitute. Correct original READ_LIMIT status/category preserved; sibling late result cannot claim5th or publish. Run this finite memory-heavy case serially within suite.
4. Assert every initial detail receives same internal signal distinct from caller, terminal failure requests all sibling signals aborted even when one promise ignores it. Caller abort propagates before/during fanout, never starts5th/final; existing scope drift cases remain green. Preaborted caller does no first/detail transport. Remove caller listener on success, failure, preabort; listener instrumentation observes exact registration/removal, no production introspection API.
5. Successful five+record fanout stays max4 and returns complete original projection; all final revision/pin/byte/native mapping tests retained. Last sibling normal settlement can claim5th only while no terminal condition. No early partial projection allowed.

## Qualification after reviewed allocation
Supported process-only Node24.21, physically owned existing frontend dependency closure, no PG/UAT/51642. Execute contained frontend three suites:
node scripts/run-contained-vitest.cjs run src/features/Books/api/__tests__/booksClient.test.ts src/features/Games/api/__tests__/explorersAdapter.test.ts src/features/Movies/api/__tests__/moviesClient.test.ts
(from explorers-earth; exact red/green receipts outside guarded source). Then affected adapter/viewmodel/service/hook consumer selection with hook writer source binding explicitly coordinated, clean frontend tsc -b and relevant full contained frontend selection after both writers freeze; root/backend scoped types/baseline only when actual import changes warrant, not claiming new backend qualification from frontend-only patch. Full existing tests/assertions retained, no import-root dependency trap. Refreeze exact6 hashes, independent review before integration/commit/push. No browser rerun follows automatically; new canonical96 composition and acceptance need controller allocation.

## History separate
Latest ONE Books original20 diagnostic18PASS2FAIL/6.2m: original mobilecover3allPASS, only normal supersededattempt aborts; retained original joint82covercause UNRESOLVED. New desktop/mobile anonymous Loadmore click timeouts with loading pointer interception/disabled-detached target are separate source/spec diagnosis, outside this adapter plan. Earlier protectedGames81/82 and standalonecanonical20 remain independently retained; no common cause/flaky label or fullQA/provider/release completion follows.
