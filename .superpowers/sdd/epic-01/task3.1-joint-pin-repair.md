# Ticket 3.1 checkpoint C — equal pin rank repair

2026-10-02. Narrow repair of the independent review P1, on local HEAD c8de8c21 (collector checkpoint 21c64990 plus independently handled CI disk fix). Read task3.1-joint-collector-review.md, checkpoint C report, target-database-schema.md:267–273 and migration 0029. Applied systematic-debugging, TDD and verification-before-completion. No CI files changed.

Removed only the collector's global pin-position uniqueness set/check. Nonnegative integer position validation remains in the DTO schema. Unique recommendation identities and membership tuples, owned/category-compatible parents/children, selected membership, archive compatibility and pin revision checks remain. Equal ranks are legal under staged autosave and are preserved exactly; this introduces no rerank or domain constraint. Collector arrays retain the existing deterministic recommendation page order by stable ID, rather than inventing pin-order sorting. The guarded fixture's database assertion explicitly orders tied ranks by recommendation ID, consistent with the documented source ordering rule.

Test-first: replaced the incorrect equal-position corruption rejection with successful complete immutable snapshot/staging coverage. Observed the new test fail at explorersApiClient.ts:150 with INVALID_OWNER_CONTENT before removing the guard. Added negative rank and foreign target rejection cases. Existing duplicate recommendation identity, duplicate membership and missing selected membership rejections remain exercised. The equal-rank test proves both recommendations/rank-zero pins survive completion and copying, frozen original pins remain unchanged when a draft pin changes, and staging has no complete marker.

The actual guarded owner HTTP integration's successful real frontend collector case now inserts two valid pin rows with equal rank zero on list26, checks both IDs/ranks and immutability/staging, and confirms persisted ranks remain [0,0]. Existing between-stream and final-validation races remain intact.

Fresh verification (all exit zero):

- Focused equal-rank red test: 1 expected failure / 45 skipped before production repair, specifically at the old uniqueness guard.
- Contained joint+compatibility client selection: 2 files / 53 passed, zero skips.
- Contained joint+compatibility+ownerSharedBundle selection: 3 files / 54 passed, zero skips.
- Full contained frontend `npm test -- run`: 278 files / 3,985 passed, zero skips, 32.82 seconds.
- Prescribed frontend music critical coverage: 16 files / 436 passed, zero skips; 100% lines/branches/functions/statements per file.
- Real guarded PostgreSQL owner suite: 1 file / 25 passed, zero skips, 33.02 seconds; real collector tied-rank success and both conflict races executed.
- Frontend `npx tsc -b`, API `npm run music:types:scoped` and root `git diff --check` passed.

Real API run used a newly owned disposable attested PostgreSQL15 sidecar at loopback 51539 bound to c8de8c21, through existing C10 lifecycle helpers. Unique scratch directory/authority and a protected random password were used; pre-existing harnesses were only read. Awaited the exact focused Vitest process exit zero before stopping the exact owned sidecar successfully; no premature teardown failures or broad skipped-suite results are used as qualification. Temporary harness/password/authority files were then removed by exact paths. No live/QA database was used.

Scoped repair only: collector, its tests, existing owner integration fixture and this report. Other dirty docs/generated files remain outside staging. No push, merge or deployment. Independent scoped re-review is required; this does not grant full Ticket 3.1, UI/writer, browser or hosted acceptance.