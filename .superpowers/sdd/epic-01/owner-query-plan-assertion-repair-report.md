# Owner query-plan assertion repair

2026-10-03. Finite repair of checkpoint79984 image-job first cause diagnosed in checkpoint-79984-image-ci-diagnosis.md. No production SQL, authorization, migrations, planner settings, fixture population, image/security gates or workflow was changed. Scope: owner-content integration assertion/evidence placement, a narrowly scoped test-only structural helper, its contracts and this report. No push.

## First cause and change

Hosted integration selected the existing unique collection/order index, `collection_items_collection_id_display_order_key`, rather than the explicitly named owner collection/order index. The observed plan was Limit25 → Incremental Sort → inner-unique Nested Loop → collection index seek and recommendations_pkey lookups. It retained actual owner/category predicates with26 outer rows/inner loops and zero filtered work. Rejecting this exact bounded alternative based solely on index name stopped integration and therefore prevented image build/scan stages; the always-run vulnerability report reserve guard failed as a cascade. This repair is not an image-build, security-scan or release qualification.

The integration test preserves every existing original-index assertion and the unselected-recommendations fallback. Only when the selected owner index is absent does it invoke the new structural assertion. It allows the reviewed collection index names rather than any index, requires actual selected collection UUID index equality and owner/category equality on both relations, and rejects OR/NOT predicate bypasses. It requires exact Limit25, ordered incremental sort keys i.display_order/r.id and presorted i.display_order, one quicksort group with positive average/peak memory≤64KiB, no additional presorted-group work or temp spill, inner-unique nested loop, matching forward scan relations/aliases and exact PK membership lookup. Outer/join work must be25–26 rows in one loop; inner work exactly one row per outer-row loop. Filter/recheck/join-filter work must bezero; a present filter requires its actual zero-removal measurement. Unknown children/operators, sequential/full-sort/materialization paths, unrelated indexes or missing row/loop stats fail.

The bound26 is one extra incremental-sort lookahead over Limit25 for unique(collection_id,display_order) groups. The64KiB sort ceiling conservatively bounds the observed28KiB single page group; this is a fixture structural-work contract, not a production latency SLA. Existing original owner-index plans remain accepted by their unchanged assertion, including the native local Index Only Scan/Memoize form. No planner is forced to select the new alternative.

Evidence now records fixture size, query label and EXPLAIN before each assertion and emits a safe fixture/query label to the test output. Future failure retains whether1k or10k failed instead of losing all iteration evidence at the final file write. The existing evidence file contains generated fixture UUID bindings/SQL/plans, not session or database credentials.

## TDD and verification

Portable Node24.21.0 with its directory prepended to PATH; existing locked Tunes tooling. Initial no-op assertion produced21 red negative cases, then23/23 passed. Adding missing-filter-measurement coverage produced one red failure; final25/25 pass. Negatives cover wrong index/collection/owner/category, absent protections, OR bypass, excess outer rows/inner loops/filter/join-filter/recheck work, sequential/full sort, incorrect order/presort, sort groups/memory/spill, output limit, materialization, wrong join and missing actual statistics. Positive cases reproduce the reviewed unique-index plan and a structurally matching original owner-index form.

Normal existing shared-notes harness created an owned attested PG15 on51538 at commitd3b955be4fb9b85f3bdee53a89068051d6fab40c, with these three test/helper files as the explicit working-tree overlay. A stale stored authority stop first failed its read-only attestation (no resource was removed); normal fresh start succeeded. Source/ownership guards stayed active and no labels/journal/authority bypass was introduced.

| Verification | Result |
| --- | --- |
| Focused actual 1k/10k owner query case |1 passed,28 excluded by -t;16.26s, zero skip/retry inside the selected case |
| Helper and nearby nested-profile contract invocation |3 files,29 passed;371ms; includes25 structural plan contracts |
| Full integration, image-equivalent C3/C8/C9 flags |27 files passed/10 existing files skipped;318 tests passed/105 existing skips;126.81s; no failures |
| Final entire owner-content integration file after last guard strengthening |29 passed, zero skips;25.04s; reruns actual1k/10k plus owner/cursor/category/revision contracts |
| Scoped TypeScript helper/test compile |tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler:exit0 |
| Normal owned PG15 stop |exit0; attested cleanup; foreign resources untouched |

The full integration run began before the last missing-filter-measurement strengthening; its broader318/105 evidence retains that timing. The final25 helper contracts and entire29-case owner file qualify the final assertion state. No duplicate full run was used to erase earlier results. The first actual focused attempt was red because the new strict alternative helper was initially applied to the existing original-index branch too; saved1k evidence showed Limit→Nested Loop→Index Only Scan→Memoize→PK. Restricting the new check to the diagnosed fallback preserved the prior valid original path, then the focused and final owner runs passed. This was an assertion scope correction, not a query/planner change.

All local selected queries chose the original owner index; the exact hosted unique-index alternative is exercised by the structural positive contract. Actual page queries were not forced to select it. Final evidence contains all eight1k/10k query plans, each with25 rows. The existing fixture-writer SET LOCAL plan_cache_mode statement is unchanged and applies only to the existing guarded insertion transaction, not the service EXPLAIN queries.

Commands used Node --import ./node_modules/tsx/dist/loader.mjs scripts/.shared-notes-harness.ts start/test/stop; full test used existing C3 (harness), C8=1 and C9_PUBLICATION=1 flags. Deliberate gated105 skips remain explicit, not recategorized as passes. Focused -t omissions are selection exclusions, not weakened gates.

Local logs in tunes/.superpowers: owner-plan-focused.log (initial red), owner-plan-focused-final.log, owner-plan-integration-full.log and owner-plan-owner-final.log. Plans: tunes/.superpowers/task3.1-owner-explain.json. These are local qualification evidence, not hosted image artifacts.

## Remaining obligation

Independent review precedes push. A later authorized exact-source hosted image run must still execute integration, coverage/types, image build, entrypoint/production graph and complete vulnerability scan/report gates. Nothing here supplies those unexecuted receipts. Existing unrelated dirty/scratch files were preserved; no additional sharding/platform expansion was performed.
