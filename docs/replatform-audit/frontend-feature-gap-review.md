# Frontend feature parity: focused gap review

> **Disposition:** findings are now assigned to existing tickets. The authoritative schema selects strict save-timing compatibility using atomic upsert-order plus explicit Save, rather than the optional staged-membership normalization below. Its pin-table constraints supersede the initial suggested unique/max-rank design in this review.

Read-only review of current routes/components/hooks against the 38-ticket plan. No application changes or executed browser tests. The plan already covers ordinary CRUD, field round-trip, ownership, item/list deletion, public pagination, media delivery, privacy, guides/claims, desktop/mobile and real-API acceptance. The findings below identify **additional behavioral details not yet pinned by those broad checks**; they are not requests for new features.

## 1. P1 — category-wide Top Picks needs a different command from list reorder

**Sources:** `Books/components/dashboard/BooksHome.tsx:363–371` flattens books from all lists and sorts category-wide Top Reads; it passes `allBooks` into `TopReadsManager` at line 600. `TopReadsManager.tsx:32–105` caps pins at 15, immediately saves move-up/down/drag order, but stages pin/unpin changes until Save. Equivalent limit/autosave paths exist in Movies `TopPicksManager.tsx:38–96`, Games `TopGamesManager.tsx:33–94`, Apps `AppTopPicksManager.tsx:39–99`, Products `ProductTopPicksManager.tsx:39–99`, People `PersonTopPicksManager.tsx:39–99`.

**Gap:** The plan names `reorderCollection`, which accepts exactly the items of one collection. That cannot atomically order category-wide picks spanning several lists. Current proposed schema stores pin/order on collection membership; category-wide ordering needs an explicit account/category invariant, including which membership is selected when an entity appears in more than one list. Generic “pin/reorder” E2E can miss both this and the autosave-versus-Save distinction.

**Owner:** 3.1 defines `setCategoryTopPicks(actor,category,{expectedRevision,orderedMembershipIds},context)` using an account/category revision; 3.3 and 4.1–4.5 adapt their managers. Preserve max 15 for these six categories only; do not invent that cap for guides. Keep current save timing: movement autosaves an atomic order update, addition/removal commits when Save is pressed. Concurrent move/save must not submit stale arrays and overwrite a later action.

**Tests:** put pinned items in two separate lists; move the second above the first, close/reload without Save and assert order persisted. Stage unpin then cancel/close and assert pin membership did not change; Save then assert it did. Fifteenth accepted/sixteenth rejected consistently by server and UI; stale revision returns conflict with persisted order unchanged; wrong-owner membership rejected. Distinguish accidental legacy partial-update behavior from intentional UX timing—do not preserve partial writes as a feature.

**Concrete schema correction:** add `category_recommendation_pins(account_id uuid,category text,recommendation_id uuid,collection_id uuid,position smallint)` with all columns NOT NULL/no defaults, PK `(account_id,category,recommendation_id)`, UNIQUE `(account_id,category,position)` DEFERRABLE, CHECK category IN books/movies/games/apps/products/people and position BETWEEN 0 AND 14. Composite FKs `(recommendation_id,account_id,category)`→recommendations, `(collection_id,account_id,category)`→collections, `(collection_id,recommendation_id)`→collection_items enforce owner/category/membership; all delete CASCADE. Add index `(collection_id,recommendation_id)` and the recommendation FK reverse index if not covered by existing PK order. Add `account_category_pin_state(account_id,category,revision bigint NOT NULL DEFAULT 1 CHECK>0)`, PK(account_id,category), account FK CASCADE, same six-category CHECK. Commands lock this state row. Pin count/rank is category-scoped; remove item `is_pinned/pin_order` authority from collection_items and derive those DTO fields from this table. Ordinary item display_order remains collection-local.

Service input should use explicit `orderedPins:{recommendationId,collectionId}[]`, not ambiguous membership IDs where the parent schema exposes only a composite key. `setCategoryTopPicks(actor,category,{expectedRevision,orderedPins},context)` replaces the set atomically, checks max15/exact valid memberships, returns pins plus revision. A separate `reorderCategoryTopPicks` validates an exact permutation of the currently saved set for pure reordering. Parent archive/item removal removes invalid pins transactionally and normalizes positions. Do not cascade a pin change into list publication.

**Timing nuance requiring explicit compatibility handling:** source `syncOrder` upserts all locally selected pins, not just previously persisted pins. Therefore “add a new pin, then drag before Save” currently persists that new pin; a staged unpin remains persisted until Save. The uncomplicated cases above are source-established; do not claim all membership is always deferred. Recommended target is staged membership until Save plus autosave of already-saved ordering, with a regression case for add→drag→close documented as an intentional consistency correction. If strict preservation is required, use an explicit atomic upsert-order command that leaves omitted saved pins intact until Save. This edge should be recorded, not accidentally determined by the first implementation.

**Category scope verified:** all six manager files named above have explicit max15 and cross-list aggregate inputs in their category Home components. Places `pages/Favorites.tsx:261–263,507–537,644–683` pins **location collections**, auto-unpins on hide and swaps collection pin order; it does not use recommendation max15. Guides similarly pin whole guide collections with publish-before-pin and no observed max15. These two continue through collection pin/order operations, separately from this table. Music retains its domain-specific behavior. `TopPlacesByCategory.tsx:473` has a provider suggestion fetch cap15, which is not a saved-pin limit and must not become one.

## 2. P1 — owner aggregation can silently truncate to the new API default page

**Sources:** Books `api/query.ts:11,24` reads 100 lists and 200 children per list; People `api/query.ts:11,24` does likewise. Category dashboards flatten those loaded children for top picks/filter/count logic. BooksHome lines 363–371 are a concrete consumer. The new API defaults to page size 24; existing public continuation tests do not prove the owner dashboard has accumulated all pages.

**Gap:** A mapper that replaces a GraphQL array with `Page.items` renders successfully but loses lists/items beyond page one. It can then wrongly unpin omitted items or submit an incomplete “exact set” reorder. An empty-vs-error state after a later page fails is also unspecified.

**Owner:** 3.1 supplies owner list/item continuation contracts; 3.3 and 4.1–4.5/5.1/5.3 consume an owner paging hook. Pick one strategy explicitly: retrieve the full set needed by the current aggregate managers via bounded sequential continuation, or fetch a server-computed category summary/pin set independently. Do not add new pagination controls merely to hide the adapter mismatch.

**Tests:** at least 27 lists and one list with 53 children, with pinned items on later pages; assert counts/top picks/filter choices include them. Fail the second fetch and assert a retry/error state rather than a “complete empty” result or a reorder write against a partial set. Changing account/logout while paging cancels the stale generation. Test owner continuation separately from 7.1 public continuation.

## 3. P1 — old frontend deduplication can undo the new distinct-entity policy

**Sources:** `Products/utils/productHelpers.ts:79–115` groups by `product_url`; `AppsAndTools/utils/appHelpers.ts:105–141` groups by `app_url`; `People/utils/personHelpers.ts:111–147` groups by social primary/Instagram/LinkedIn URL. Helpers choose a preferred pinned/rated row and merge presentation metadata. These helpers remain called by owner and public components.

**Gap:** The new domain deliberately retains ambiguous/manual entities as distinct and supports independent recommendation contexts. Two persisted recommendations with the same URL may still collapse into a single card; editing/deleting that synthetic card targets one source record while displaying merged notes from another. Tests that assert only database row count will pass.

**Owner:** 3.1 pins the read/view-model identity contract, 4.3–4.5 update helpers and callsites. Separate compatibility alias mapping from deduplication. Only duplicate rows representing the same canonical recommendation/membership may be collapsed automatically. If the product intentionally wants a consolidated account-level entity card, define that projection explicitly with contributing recommendation IDs and an unambiguous edit target; do not preserve URL heuristics as canonical identity. The agreed “ambiguous entities stay separate” decision already supports the safer ID-based option, but document the resulting formerly-merged card behavior as a corrected legacy inconsistency rather than claiming zero visible difference on that edge case.

**Tests:** same URL, distinct manual entity IDs, different notes => two independently editable/removable cards in the relevant list. Same recommendation repeated through pagination/cache => one card. Owner A edits one row, other row's note/rating remains untouched after fresh reload. People alias mapping (`twitter`→`x`, avatar/bio/follower metadata) still works after removing heuristic merging.

## 4. P1 — guide detail micro-editors still own direct Apollo writes

**Sources:** `Guides/components/GuideDetails/EditStayModal.tsx:55`, `EditTipModal.tsx:58`, `BudgetTable.tsx:38`, `GuideHeader.tsx:26`, `EditJourneyRouteModal.tsx:52`, `TransportationTimeline.tsx:134` each create their own mutations. `EditGeneralTipsModal.tsx` and `TipsTagsTab.tsx` accept an injected mutation function. The main guide form and parent payload can be correctly migrated while these controls continue calling Strapi.

**Gap:** Ticket 5.3 names the main form/pages and general budget/tips UAT but does not enumerate these mutation owners or reconcile their partial-field updates with the proposed full-section PUT contract. Sending a partial micro-edit as a full replacement can erase untouched blocks; stale parent revisions can likewise overwrite a concurrent section edit.

**Owner:** 5.3 explicitly includes these eight components and their parent callback wiring. Adapt each to the shared guide operation with current aggregate revision and complete section state (or a typed field-patch service if the core contract deliberately changes). The backend must validate and atomically merge only allowed fields; do not translate missing fields to null. Preserve current modal save/error/close timing.

**Tests:** edit a stay, timeline tip, transportation mode and one budget amount independently; after each fresh read, assert all untouched timeline/stay/transport/budget fields remain deep-equal. Edit journey start/intermediate/end city/date order and verify existing itinerary views update. Reject a stale revision without closing the modal or discarding input. Run each micro-editor at least once against real API; no Strapi calls during any save. Distinguish rich-text safe rendering from data-loss protection.

## 5. P2 — one-shot publish prompts and linked-flow return state need explicit checks

**Sources:** `Books/components/dashboard/BookListView.tsx:414–433` uses `justAddedRecommendation`/`justCreatedList`, waits for a nonempty list, prompts once, then clears router state using replace navigation. Movies `MovieListView.tsx:583–603` confirms list publication; its draft QR is disabled/blurred at lines 465–468. Products `AddProductPage.tsx:455–472` and People `AddPersonPage.tsx:475–500` support `redirectBack` for location-linked creation. Apps `AddAppPage.tsx:448–464` passes refetch/publication state. GuidesPage lines 74–88 also reacts to `justCreatedGuide` through the category navigation coordinator.

**Gap:** Ordinary “create then public view” tests do not exercise asynchronous loading, prompt re-render loops, browser back/refresh or publication level separation. Publishing a list must not silently publish the entire category/profile; a return-path rewrite can drop the location workflow.

**Owner:** 3.3, 4.1/4.3/4.4/4.5, 5.2/5.3 and 7.1. Preserve current router state hints and the category navigation coordinator rather than reconstructing publication from local booleans. Keep route authority/current-account generation checks on asynchronous responses.

**Tests:** create empty list => no prompt; add first item => one prompt after data arrives; dismiss and rerender/back/refresh => no reopen loop; confirm publishes only the intended list and QR becomes available according to existing parent policy. Add Product/Person through location route and verify Save/Back return to the correct location context; direct deep-link add route without state returns to ordinary category list. A failed publish keeps current state and a retryable error, not an optimistic false-public result.

## 6. P2 — guide pin eligibility and multi-dimensional filters are underspecified

**Sources:** `Guides/GuidesPage.tsx:480–487` automatically unpins a guide when unpublished; lines 510–517 reject pinning an unpublished guide. The same invariant appears in modal pin handler. Lines 149–200 derive start/intermediate/end locations from `Place_Details`; lines 208–281 derive filter values, and lines 285–378 combine guide type, category, days, month, budget type, location, multicity and pinned-first ordering.

**Gap:** General guide pin/order and rich-payload round-trip tests may still accept a hidden guide that stays in top picks or lose filter options after normalizing source arrays/string/object forms. Current plan names no filter cross-product assertions.

**Owner:** 5.3 owns guide mutation invariants and filter mapper; 7.1 tests public top-pick removal. Server enforces publish-before-pin and atomic unpublish+unpin; client preserves current feedback and fallback sort. No guide limit15 is inferred from the catalog managers.

**Tests:** publish/pin/unpublish => visibility false, pin false, pin order null in one transaction and absent public hero. Pin unpublished => rejected with no write. Seed single-city/multicity guides with distinct budgets/months/days; combine two filters, clear them, reload, and assert counts and pinned-first stable ordering. Normalize array/string compatibility once in adapter; malformed source fixture must not silently erase another field.

## Covered versus unassigned

Already assigned: owner/anonymous isolation; ordinary CRUD; archiveCollection and archiveRecommendation; privacy checks; 53-item public pagination; same-origin uploaded-media delivery; Places person variant; guide amount/currency and parent/section storage; pending claim creation without automatic ownership; claim input/evidence limits; duplicate retry; locale-specific FAQ/legal content; analytics counts. Do not reopen these as new product questions.

The six findings above add missing **front-end interaction and data-flow assertions** to the same existing tickets. No separate feature epic is needed. The biggest contract gap is category-wide top-pick authority, followed by owner-page aggregation and URL-based deduplication. These should be resolved before calling the frontend parity plan fully groomed.

`PublicGuideModal.tsx` still contains a GraphQL query, but the source search in this pass found its declaration/export only, not a live import. Do not label it a retained runtime blocker without a caller; classify it during 8.1 cleanup. This illustrates why text matches alone are insufficient.

All findings are source-derived, not observed production failures. Required next verification is implementation-time real-API browser execution with the added assertions; this review did not run those scenarios.
