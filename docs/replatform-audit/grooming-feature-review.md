# Independent feature grooming review

**Reviewed:** 38 individual ticket documents and their shared epic contracts against the retained frontend routes, category forms, Settings lifecycle, guide commands and saved Strapi schema inventory. Planning review only: no app edits or tests executed. This is an additional review of the generated tickets, not a restatement of the earlier mocked-E2E/IGDB/media-replacement findings already addressed.

**Assessment:** The sequence is workable, but the tickets are not yet fully executable. Five concrete contract/scope errors below should be corrected before starting their owning tickets; one additional claim-discovery gap should be resolved before accepting Places. None requires adding new product scope or asking the owner to redesign the app.

## F1 — P1: linked lists attach to the wrong aggregate

**Tickets:** 5.2; shared schema in 3.1; dependent 4.4/4.5 and 7.1.

**Evidence:** The shared Epic 5 table proposes `setPlaceLinkedCollections(actor, placeRecommendationId, ...)` and `/recommendations/:id/linked-collections`. Actual `AddLinkedProductsPage.tsx:21` and `AddLinkedPeoplePage.tsx:21` query `recommendationList(documentId: locationId)`. Their create calls at lines 149 and 151 set `recommendation_list: locationId`. Both saved Strapi list schemas have a many-to-one relation to `api::recommendation-list.recommendation-list`, not recommended-place. The protected routes also name the parameter `locationId`.

**Impact:** Following the proposed contract would require a place-item ID that these screens do not possess, and would change city/location-level grouping into per-place grouping. The fixture test could conceal this by supplying the invented ID.

**Resolution:** Replace the shared signature with:

```ts
setLocationLinkedCollections(
  actor: Actor,
  locationCollectionId: string,
  input: RevisionInput & {productCollectionIds: string[]; peopleCollectionIds: string[]},
  context: RequestContext
): Promise<CollectionDto>
```

Mount `PUT /collections/:id/linked-collections`; require parent category `places`, child category `products`/`people`, same account, and parent revision. Preserve the existing single location-parent relation for each child list; reject an attempt to attach it to another location unless an explicit move is implemented. Keep detach separate from child archive. Add an integration test that passes an actual location collection ID (no recommended-place row required), and a browser scenario starting from the current location route. Add transactional create-and-link support by allowing `parentLocationCollectionId?: string` in Product/People `CreateCollectionInput`, rather than a visible two-step partial create.

## F2 — P1: account deletion's required reason write was mistaken for seed content

**Tickets:** 2.4 and 7.2; shared reference-content contract.

**Evidence:** `Settings.tsx:590` refuses a blank freeform reason. At line 595 it awaits `addReasonForLeaving` and only then advances to final deletion. `Settings/api/mutation.ts:134` creates `ReasonForLeaving` with `Reasons` and `User_Details` JSON. The saved source schema has only those two JSON fields; it is not a taxonomy of selectable reasons. Current 7.2 says reasons-for-leaving are seeded read content and defines a GET reference-content variant. Ticket 2.4 does not list the main `Settings.tsx` component or the reason mutation for replacement.

**Impact:** Google-only deletion still reaches Strapi before it can progress, or a developer removes the reason step to obtain green tests. A seeded GET does not replace this write. Deferring it to 7.2 also prevents 2.4 lifecycle acceptance from being complete.

**Resolution:** In 2.4, add `Settings.tsx` and `Settings/api/mutation.ts` to the wiring scope and implement:

```ts
recordAccountExitReason(
  actor: Actor,
  input: {reason: string},
  context: RequestContext
): Promise<{id: string}>
```

Use `POST /account/exit-reasons`; derive account/user references from Actor and do not accept client identity/address snapshots. Nonblank reason remains required to preserve current flow; bound size and store in private lifecycle/audit data with an explicit retention/deletion rule. Bind retries to the context idempotency key. Remove reasons-for-leaving from `getReferenceContent` and seed requirements. Add E2E: blank reason cannot advance, valid reason persists and advances, retry does not duplicate, storage failure retains the current step, another account cannot read the reason, and complete Google-user deletion performs no Strapi call. The reason does not itself authorize deletion.

## F3 — P1: list and whole-guide deletion lack a shared operation

**Tickets:** 3.1, 3.3, 4.1–4.5, 5.1, 5.3; 7.3 regression.

**Evidence:** Epic 3 declares `archiveRecommendation` but no collection archive/delete operation. Ticket 3.3 requires deletion but cannot consume a named list command. Actual `Books/components/dashboard/BookListView.tsx:201–204` deletes a list; the guide dashboard calls `deleteGuide` at `GuidesPage.tsx:464`, with `DELETE_GUIDE_MUTATION` in `Guides/api/mutations.ts:37`. Other category lists expose the same class of operation. Guide section archive is defined, but does not delete the whole guide.

**Impact:** Implementers must invent independent deletion semantics/endpoints or leave visible list delete controls broken. Children, linked lists and media cleanup may differ by category.

**Resolution:** Add in 3.1:

```ts
archiveCollection(actor: Actor, id: string, input: RevisionInput,
  context: RequestContext): Promise<void>
```

Mount `DELETE /collections/:id`. Soft-archive the aggregate transactionally; exclude it and its children from owner normal lists and public discovery. Preserve shared catalog entities. Preserve independently owned recommendation records if they remain in another active collection; archive/remove only the collection membership rather than deleting shared entity data. Guides archive their sections through the same aggregate boundary. Location deletion detaches associated Product/People lists instead of deleting those independent lists. Media orphan cleanup follows the media owner's retention policy after reference checks. Specify retry and stale-revision behavior. Every category E2E must separately test item removal and list removal; Guide E2E must test section deletion and guide deletion, direct URL denial and another-owner denial.

## F4 — P1: shared entity creation and manual metadata editing are not pinned

**Tickets:** 3.1/3.2; Books and all category write tickets; 10.2.

**Evidence:** `CreateRecommendationInput` requires `entityId`. Feature shared context says to reuse `resolveEntity`, but the backend contract does not define its signature or HTTP route. The only catalog route pinned in 3.2 returns lookup candidates rather than saved entities. Manual Apps/Products/People create flows have no provider-backed ID. Product form edits title, brand, URL, price and currency (`AddProductPage.tsx:434–436`, `:521–539`). The proposed shared-entity model does not say whether changing these fields edits global facts for every creator or only this recommendation.

**Impact:** The first Books candidate cannot reliably become the required canonical ID through a defined operation. Manual categories either invent their own resolver or mutate shared details and unexpectedly change another creator's card. Current tests protect notes/rating but not editable descriptive metadata.

**Resolution:** Add an explicit `resolveEntity` operation in 3.1 and route `POST /entities/resolve`, with a discriminated `ResolveEntityInput`: verified provider identity (`category`, approved provider, external kind/id), or manual typed details (`category`, category-specific detail DTO). Server re-fetches or validates provider candidates through the catalog boundary, never trusts a caller to overwrite global provider facts. Manual details create a distinct entity by default; repeat command idempotency deduplicates retries, not similar names/URLs.

For existing form edits, `UpdateRecommendationInput` needs a typed `displayOverrides` field for the editable descriptive fields, with effective presentation = creator override over canonical source value. Global canonical provider identity is immutable through recommendation editing; changing which thing is recommended is an explicit `entityId` replacement with owner revision checks. Keep provider provenance distinct from local display overrides. Product price/currency belongs to the creator's recorded offer context, not a universal product price. Add tests proving creator A's title/cover/price edit does not change B's recommendation, absent override uses catalog values, and manual retry creates one entity/recommendation. Pin exact decimal wire representation rather than referring to an undefined “Epic 3 exact-decimal contract.”

## F5 — P2: guide parent metadata has no writable typed contract

**Tickets:** 5.3 and shared `CreateCollectionInput`/`UpdateCollectionInput` from 3.1.

**Evidence:** Guide section commands are concrete, but generic collection input lists only category/title/description/slug/visibility. Current guide creation/update sends type, estimated budget/type, multi-city, days, tags, tips, locations, best time, media, transportation and guide-level section details. See `Guides/types/index.ts`, `Guides/api/mutations.ts:3–35` and `CreateGuidePage.tsx`. The ticket promises preservation without identifying a typed parent DTO or where these fields are persisted.

**Impact:** A section round-trip can pass while saving or editing the parent silently loses the richer metadata. Implementers may put all remaining fields in unvalidated generic JSON or create incompatible endpoints.

**Resolution:** Define `GuideCollectionDetails` in shared `guideContract.ts` and add it to the `category:'guides'` discriminant of collection create/update/DTO. Include `guideType`, nullable exact-decimal `estimatedBudget`, `budgetType`, `isMulticity`, nullable `numberOfDays`, `tags`, validated `tips`, `placeDetails`, `transportation`, `bestTimeToVisit`, `guideCategories`, `mediaIds`, and versioned `sectionDetails` while existing wizard payloads still consume that field. Keep positions/pins outside freeform JSON. Let `createCollection`/`updateCollection` persist this variant; do not create a second guide-owner authority. Add a parent-only save/reload test asserting every field, section-add-then-parent-edit preserves children, and parent metadata edits reject stale revisions. Include `GuidesPage.tsx` in the exact modified paths for parent ordering/pins/archive.

## F6 — P2: claimable-place discovery has no population path in the empty database

**Tickets:** 5.1 and 5.4.

**Evidence:** `Favorites/hooks/useAddRecommendation.ts:413–445` calls `syncClaimablePlaceProfile` and `updateOrCreateClaimablePlaceProfile`; the service creates/updates a place-derived public record and distinct recommender information. Ticket 5.4 tests a seeded claimable fixture and submission, but does not say how a newly recommended place becomes claimable. The new database begins empty.

**Impact:** Seeded UAT passes while the actual claim lookup always returns no new places after launch. Copying the old client-side side effect is also undesirable because it exposes write authority and is not atomic.

**Resolution:** In 5.1 derive claim lookup records from canonical place entities with approved public place contact/address data, or maintain the lookup projection in the place recommendation transaction/outbox. Do not copy private creator contact notes into searchable public metadata. Pin whether only public recommendations contribute; recommended default is public eligibility for anonymous lookup, with distinct public recommending accounts counted. Ticket 5.4 should test “create and publish place through the real UI → lookup without seed-specific record → submit pending claim,” plus private-only place exclusion and duplicate recommendations from one account not multiplying count. No admin interface or automatic verified ownership is introduced.

## Coverage ledger for all 38 tickets

The table records whether this feature review found an additional issue, not a claim that a ticket's implementation or tests have passed. Operational/security reviewers own independent findings in their areas.

| Tickets | Result of this review |
|---|---|
| 1.1, 1.2, 1.3, 1.4 | No additional feature-contract finding; baseline and local/CI harness ownership is explicit. |
| 2.1, 2.2, 2.3 | No additional feature finding; media visibility decisions are being reviewed by backend owner. |
| 2.4 | F2 required exit-reason write; include main Settings component. |
| 3.1 | F1 relationship shape, F3 archiveCollection, F4 entity resolution/overrides, F5 guide collection discriminant. |
| 3.2 | F4 provider candidate→entity contract and exact decimal representation. |
| 3.3 | F3 list-delete E2E and F4 lookup→entity create; otherwise existing Books scope retained. |
| 3.4, 3.5 | No additional feature finding; QA Google/provider evidence remains separate from fixture acceptance. |
| 4.1, 4.2 | F3 list-delete coverage and F4 entity candidate contract. |
| 4.3, 4.4, 4.5 | F3 list-delete coverage; F4 manual create/display overrides; 4.4/4.5 consume corrected F1 relation. |
| 5.1 | F1 list relationship, F3 aggregate deletion, F6 lookup population. |
| 5.2 | F1 wrong aggregate corrected before implementation. |
| 5.3 | F3 whole-guide deletion and F5 parent DTO; existing section contract remains useful. |
| 5.4 | F6 non-seeded lookup path; preserve pending-only ownership behavior. |
| 6.1, 6.2, 6.3 | No additional feature finding; canonical lifecycle/socket coverage remains owned by backend plan. |
| 7.1 | Add F1 location-level nested visibility and F3 archived collection direct-URL denial to matrix. |
| 7.2 | F2 remove fabricated reasons taxonomy; exit-reason write belongs in 2.4. |
| 7.3 | Must exercise corrected F1–F6 through actual persisted flows, not seed-only shortcuts. |
| 8.1, 8.2, 8.3, 8.4, 8.5 | No additional feature finding; do not use cleanup to silently drop unresolved F1–F6 behavior. |
| 9.1, 9.2, 10.1 | No additional feature finding in this pass. |
| 10.2 | F4 applies to ambiguous/manual entity resolution and creator metadata edits through shared commands. |
| 10.3 | No additional feature finding; execution evidence still required. |

## Required closure

Correct grouped contract sources, regenerate epic and ticket copies, and run a documentation consistency check for stale names (`setPlaceLinkedCollections`, reasons-for-leaving reference GET, undefined resolver, missing collection archive). Add these six findings to the review log with the exact resolving ticket and test. The parent may then describe the backlog as groomed for implementation, while clearly distinguishing future provider/runtime verification from completed documentation review.
