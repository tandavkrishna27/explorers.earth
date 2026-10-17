# Games A3M executable-plan independent review

2026-10-04. Reviewed task4.2-games-a3m-implementation-plan.md and task4.2-games-a3m-manifest.json against exact HEAD2f57782f2b3144688bad9ec00bd9884cb20cc90e and actual imported/shared/native/public/producer source. Docs-only: no tests, resources, secrets or application changes.

## Verdict: PASS for staged allocation and implementation

No blocking concrete scope/signature/import error found. Authorize controller allocation of backendShared25 + clientWire18 first. This is plan readiness, not implementation acceptance. Full IGDB Ticket4.2 parity, provider metadata/taxonomy/media/filter/recovery and genuine QA smoke remain open explicitly. An unavailable provider response cannot fulfill those duties.

Independent manifest check:89 unique paths,21 new;68 existing raw SHA256 hashes matched current source,21 proposed new paths absent, zero duplicates or ownership overlap. Counts match25 backendShared,18 clientWire,24 uiConsumer,16 credentialAndPackaging,6 browserFixtureRunner. No migrations or schema file reserved. Current floor0038 is preserved.

## Concrete source/signature validation

- Existing completeCategory(input,signal,includeTopPicks) is exposed as getCompleteMyCategoryContent; requesting games/active with third argumenttrue is valid. It issues authentic completed objects. Games narrowed type must retain that same object/brand as planned.
- Existing getMyEditableCollection/getMyEditableRecommendation return authentic CollectionObservation/RecommendationObservation. Wrapper observeCollection/observeRecommendation can delegate to those actual names. createMyRecommendation(parent,input,key,signal) supplies collectionId/category/expectedCollectionRevision and creates initial membership atomically. The plan correctly removed an extra initial attach. Wrapper update/reorder/pins preserve existing observed revision/completion fences.
- Core manual resolve supports Games and returns game kind; new strict IGDB selector may import A1a gameExternalIdSchema without importing the owner contract back into root. Provider Games must dispatch to authorized503 before the existing generic provider→Book branch. Accepted A1a/A2 production registration is not enabled.
- Current owner/public application and wire files are explicitly allocated, so additive gamePresentation has actual producers/consumers rather than unused schema. New manual repository reads actual entity origin and existing uploaded media relation; generic persistence/media/lifecycle stay read-only.
- Actual public gateway/service currently dispatch only Books/Movies into fresh paths; both are allocated. Public routes currently stringify for ETag and then res.json (second serialization). The plan explicitly allocates route custody and limits possible copies rather than leaving a retained charged result behind an unowned serialization boundary.
- Signed Games keyset can use actual creator_accounts.revision, account_category_content_state.revision, collections.display_order and collection_items.display_order. Existing public parser specially admits Movies signed cursors and otherwise expects legacy offsets; its explicit allocation allows exact Games extension while preserving other categories. Independent domain, username/account/category/list/limit/revision/expiry binding and Movies rejection are implementable.
- Producer generator uses a fixed shared input allowlist. Both A1a GameContract and new GameOwnerContract are explicitly named transitive additions; Docker/shared bundle/ignore tests and actual API build/image qualification are included. No current schema-floor proof change is necessary for a package with no SQL.

## Finite implementation handoff requirements already covered by the plan

Backend/client writer must freeze the43 owned paths and actual public/client/import wire hashes after meaningful native/PG/finite review. UI24 allocation follows that handoff, with no shared type/helper/client changes by the UI writer. Packaging16 waits credential/display-helper consumer freeze; runner6 waits composed production/import/spec freeze. Controller owns exclusive resource scheduling. A3P shared persistence/registration edits must wait A3M source freeze and separate allocation.

Three concrete implementation checkpoints should be recorded in the handoff, not expanded into a new prerequisite project:

1. Fresh Games requests must bypass BOTH public service account and category/in-flight caches. Reusing the current generic cached account() path would violate privacy despite a fresh projection. Source-scoped freshness checks and response discard must retain result leases through pending authority calls.
2. Existing routes serialize once for ETag and again inside res.json. Games must charge all actual SQL rows/objects, UTF16 strings and UTF8/response copies;4MiB output alone does not prove24MiB residency. The explicit8/8/4/4 reservations must account for temporary conversion overlap and parsed object overhead or reject before allocation. Finish/close hooks must exist before asynchronous admission, and release only on actual settlement/discard. No modification of these limits is implied by this plan verdict.
3. Category preview pagination has a fixed12-recommendation page while category limit may24 lists. Per-list continuation must bind limit12, independent of the category cursor's list count; subsequent list requests use that same bound. The exact intended behavior follows the plan's two-purpose cursor and preview limits, and needs its specified crossover/limit negative tests.

These are concrete consequences of the existing code and approved contracts, not blocking errors in the executable plan. Original writer should implement/test them inside its existing43-path allocation. A demonstrated defect in generic observation/media/privacy source requires a separate finite owner repair rather than an unlisted edit.

## Acceptance attribution

Ten named manual browser cases×desktop/mobile=20 plus existing62=82 is coherent; existing identities remain unchanged, no skip/retry manufacture. Actual guarded core Games writes/uploads/privacy/lifecycle/restore obligations remain required despite no new schema. Provider503 is actual route behavior, not API mock parity. Built credential sentinel scan and removed workflow/browser inputs remain separate real build duties. Clean source/hash/dependency qualification and exact committed82/hosted evidence are later required; this report claims none executed.

Completed read-only review. No material human product decision or live credential input is needed for this staged manual implementation allocation.
