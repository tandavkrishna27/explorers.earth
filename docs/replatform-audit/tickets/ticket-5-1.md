# Ticket 5.1: Places and taxonomy

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-05.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** ready after shared handoff. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package Places: typed coordinates including zero/null, location-list distinction, taxonomy and private contact redaction; publish and persisted real-backend qualification.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 3.1/3.2; implements the taxonomy contract in the shared interface table.

**Existing:** `explorers-earth/src/features/Favorites/api/query.ts`, `api/mutation.ts`, `hooks/useCreateLocation.ts`, `hooks/useAddRecommendation.ts`, `components/ListForm.tsx`, `RecommendForm.tsx`, `Recommendations.tsx`; `explorers-earth/src/features/PublicHome/components/PublicPlaceCard.tsx`.

**Create:** `tunes/server/explorers/categories/places.ts`; `explorers-earth/src/features/Favorites/api/explorersAdapter.ts`; `tunes/server/test/explorers/places.test.ts`, `places.integration.test.ts`; `explorers-earth/e2e/replatform/places.spec.ts`.

**Behavior contract:** A location list remains distinct from its place recommendations. Preserve provider Place ID, location data, category/subcategory, recommendation type, notes, website/social/contact fields, media and user/provider ratings. Make category/subcategory reusable despite legacy one-to-one Strapi declarations. Public contact disclosure follows explicit current policy, never a broad serialization of private owner fields.

- [ ] Add tests for reusable categories across two places, subcategory belonging to the chosen category, repeated provider identity with independent creator notes and omitted private contact fields.
- [ ] Map consumed `Place_Details` JSON fields to typed public/owner DTOs without dropping data used by cards and maps; fixtures include null coordinates and provider photo failure.
- [ ] Seed required category/subcategory rows idempotently; no invented production taxonomy values hidden in tests.
- [ ] Run common persistence/ownership cycle; run frontend units filtered to `src/features/Favorites`; backend commands with `places`.
- [ ] Run existing `locations.spec.ts` with general config and new `replatform/places.spec.ts` with real API config. UAT: create city/location list, add/edit place, taxonomy filters, media, contact visibility and reload persistence.
- [ ] Implement public claim lookup eligibility as the direct canonical query specified above. In `places.integration.test.ts`, publish one place through the recommendation operation and assert lookup finds it without a claim seed; hide its last public recommendation and assert lookup no longer finds it. Two recommendations by A contribute one distinct creator; a public B recommendation contributes a second.
- [ ] Assert lat/lng zero survives rather than becoming missing; absent coordinates remain null rather than fabricated `(0,0)`. Assign an unrelated subcategory and assert 422 with no association written. Run the real browser add/edit route variants (`/:listId/new`, `/:placeId/edit`) as well as category navigation.

**Acceptance gate:** taxonomy reuse, location aggregate distinction, direct public redaction and new-place lookup population are proven against persisted rows; maps fixture success alone is insufficient.


## Independent review correction (2026-10-05)

Qualification package PLACES-CORE selects only Places core owned scenarios. It must not select future place-links (5.2) or claims (5.4) merely because an old suite alias groups them. Add and independently review guarded exact discovery before execution. Full milestone discovery still requires all three packages; no positive is removed or skipped to qualify core.

## Independent review verification (2026-10-05)

**NOT-STARTED, confirmed by negative evidence** against source at `225d83e5`:

- `tunes/server/explorers/categories/places.ts` does not exist. `tunes/server/explorers/categories/` contains only `movies.ts` and `movieGenreSeeds.ts`.
- `explorers-earth/src/features/Favorites/api/explorersAdapter.ts` does not exist. The only `explorersAdapter.ts` files in the repository are under `src/features/Games/api/` and `src/features/Movies/api/`.
- ~~`tunes/server/test/explorers/places.test.ts`~~ **delivered 2026-10-09**; `places.integration.test.ts` was already delivered (15 cases). `explorers-earth/e2e/replatform/places.spec.ts` still does not exist and is coordinator-reserved.

The `:29`–`:45` implementation and acceptance requirements are unchanged by this note; none is satisfied.

### The epic-level gate still pulls 5.2/5.4 artifacts — now fixed in the epic

The correction at `:48-50` above is prose-level only; the gate it corrects lived elsewhere. [`epic-05.md:68`](../epics/epic-05.md) defines the `places` suite as including place-links/claims, and `epic-05.md:130` (measured at `225d83e5`) requires "the exact category suite" for desktop and mobile runs — together these required 5.1 to run `place-links.spec.ts` (5.2) and `claims.spec.ts` (5.4). Both epic lines are corrected as of 2026-10-05: the alias line is still `epic-05.md:68` with its correction at `:70`, and the full-stack completion check is now `epic-05.md:132` with its correction at `:134`. `epic-01.md:159` carries the same grouped selection and is owned by another agent; raise it with the coordinator before 5.1 qualification.

All three packages (5.1 core, 5.2 place-links, 5.4 claims) remain mandatory in full milestone discovery. Nothing is removed, skipped or relabelled optional to let core qualify.

## Delivery status (2026-10-07)

Storage half delivered and verified against PostgreSQL 15; the consumer half is blocked on
two owner decisions recorded below.

| Mandated path | State |
|---|---|
| `tunes/shared/explorersPlaceContract.ts` (not in the original list) | delivered |
| `tunes/migrations/0046_explorers_places_catalog.sql` | delivered, chain-registered |
| `tunes/server/repositories/placeCatalogRepository.ts` | delivered |
| `tunes/server/test/explorers/places.integration.test.ts` | delivered (15 cases) |
| `tunes/server/explorers/categories/places.ts` | **not created** — same reasoning as the other categories; Places' seeded taxonomy is the one thing that would justify it, and that is blocked (below) |
| `explorers-earth/src/features/Favorites/api/explorersAdapter.ts` | **not started** — blocked |
| `tunes/server/test/explorers/places.test.ts` | **delivered 2026-10-09 (11 cases)** — migrations 0046-0048 declarations plus the contract schemas; `publicPlaceContact` is covered by the integration suite instead of twice |
| `explorers-earth/e2e/replatform/places.spec.ts` | **not started** — needs a fixture runner and protected-manifest identities |

What the storage proves, each assertion checked by breaking it:

- Zero coordinates survive as zero and absent stay null. Reading them as
  `Number(value)||null` fails the suite, which is exactly the defect the ticket names.
  The paired-null invariant is enforced in the contract and in `0046`, so a half-known
  pair cannot be stored.
- Contact disclosure is private until the creator chooses otherwise, and
  `publicPlaceContact` is the only path those fields reach a reader. Making it always
  disclose fails the suite. One creator's contact details never reach another's
  recommendation of the same place, and a creator's number never populates the shared
  entity's `public_phone`.
- `publicPlaceLookup` is the direct canonical query, counting **distinct** creators.
  Dropping `DISTINCT` fails the suite.
- `recommendation_type = 'person'` inside a Places list is preserved with a deferred
  entity-kind invariant checked from both sides.

## Consumer half (2026-10-07)

Both blocking decisions were answered by the owner on 2026-10-07: place photos and all
other media are stored in S3 as owned assets, and the category/subcategory taxonomy is
deferred to its own ticket. The consumer half proceeded on those answers.

| Mandated path | State |
|---|---|
| `explorers-earth/src/features/Favorites/api/explorersAdapter.ts` | delivered |
| `explorers-earth/src/features/Favorites/api/placesClient.ts` (new) | delivered |
| `explorers-earth/src/features/Favorites/api/placesViewModel.ts` (new) | delivered, 17 cases |
| `explorers-earth/src/features/Favorites/api/placesCommands.ts` (new) | delivered |
| `explorers-earth/src/features/Favorites/hooks/usePlacesOwner.ts` (new) | delivered |
| `hooks/useCreateLocation.ts` | migrated, 7 cases |
| `hooks/useAddRecommendation.ts` | migrated, 13 cases |
| `components/ListForm.tsx` | **no change needed** - presentational, never touched Apollo |
| `components/Recommendations.tsx` | migrated, 3 render cases |
| `components/AddRecommendation.tsx` | migrated |
| `hooks/useMenuItems.ts` (not in the original list) | migrated |
| `hooks/useRecommedationFields.ts` (not in the original list) | migrated |
| `pages/Favorites.tsx` (not in the original list) | migrated |
| `features/PublicHome/components/PublicPlaceCard.tsx` | reads the public projection, which this ticket delivered; no change needed |
| `tunes/server/explorers/categories/places.ts` | not created, as recorded above |
| `tunes/server/test/explorers/places.test.ts` | delivered 2026-10-09 (11 cases) |
| `explorers-earth/e2e/replatform/places.spec.ts` | not started - needs a fixture runner and protected-manifest identities |

### Places has no category-wide top picks (found by the contained navigation lane, 2026-10-08)

`topPickCategorySchema` is `books, movies, games, apps, products, people` - Places and
Guides are deliberately outside it. `PlacesClient.readCompleteOwner` was asking for top
picks anyway, and `completeCategory` refuses that combination with a 422 **before any
request goes out**, so the entire Places owner read failed and the dashboard rendered its
empty state. Every unit test mocked `readCompleteOwner`, so none of them could see it; the
contained `places:` navigation lane did, which is what that lane is for.

The read no longer asks, and the pin and top-picks commands are gone from the Places
surface rather than left to throw. `is_pinned` and `pin_order` stay on the view because
the cards read them, and they are honestly always false.

**Consequence to raise.** Strapi's `recommendedPlace.is_pinned` / `pin_order` had no
equivalent reachable through the owner API. A place's position is its order inside its
list, which is preserved. `publicPlacesProjection` still reads
`category_recommendation_pins`, so the storage is accurate and the column is simply always
empty for places - but if pinning individual places is wanted back, it needs either Places
added to the top-pick category set or a per-list pin of its own. Not invented here.

### What is left on Apollo in this surface, and why

Nothing in the Places owner surface reads or writes Strapi any more. What remains in
`features/Favorites` belongs to other tickets:

- `AddLinkedPeoplePage.tsx`, `AddLinkedProductsPage.tsx` and the one remaining
  `useQuery(recommendedListByIdQuery)` in `Recommendations.tsx` read the linked person and
  product lists. That is [5.2](ticket-5-2.md)'s attachment contract and is not this
  ticket's to migrate.
- `services/claimablePlaceProfileService.ts` is [5.4](ticket-5-4.md)'s. It is no longer
  called from the add flow, because 5.1 specifies the direct canonical claim query and
  forbids a second asynchronously stale directory.
- `api/query.ts` and `api/mutation.ts` are the retired documents; Epic 8 removes them
  after checking callers.

### Two more gaps, and a defect the types were hiding

4. **A list's pin and its order had storage and no command.** `collections.pin_order` has
   existed since the list schema and nothing wrote it; `display_order` was readable and
   not writable. So pinning or reordering a list was impossible through any command, for
   every category. Both are now on `updateCollection` as separate decisions, and
   `pinOrder` travels on the editable list read - not on the category page, because that
   page DTO is the shape every category's client and fixture already produces, and a
   list's pin is only read where a list is edited.
5. **`Geometry` was the wrong shape.** The view model and the public projection emitted
   `{location:{lat,lng}}`, and every map and card in the app reads `Geometry.lat` and
   `Geometry.lng` directly - `PlaceOverview`, `GooglePlaceModal`, the guide route modals,
   `PublicGuideDetailPage`, `useRecommedationFields`, and the map-preview test's own
   fixture. It typechecked, and every map would have rendered nothing. Both edges now emit
   the flat shape, and the view-model test pins it.

The typechecker surfaced what Strapi had hidden once the DTOs became honest:
`CardDataItem`, `FetchedPlace`, `TopPlacesByCategory` and `AddPlaceOverlay` all declared
`Place_Id`, `Rating` and `media_details` as always present. A manual place has no provider
id or rating and a recommendation may carry no media, so those types now say so, and a
render case covers exactly that place.

### Three gaps the storage half had left

1. **The location aggregate was unreachable.** `0048` created
   `place_collection_details` and `writePlaceCollectionDetails`, and no command wrote it
   and no read returned it. The collection commands now carry `placeLocation`, a Places
   list is given its location row at creation, and the editable list read returns it.
   Every other category refuses the field.
2. **A list cover could not be uploaded at all.** `0024` has always allowed the stored
   media purpose `collection`, `0030` requires a cover's asset to carry exactly it, and
   `collection_media` is the slot - but the upload allowlist in
   `tunes/server/application/media.ts` omitted it, so `coverMediaId` was unreachable from
   any client, for every category. Added, with the same 5 MB cap as the other image
   purposes.
3. **`providerPlaceId` was not exposed.** Consumers deduplicate and look places up by the
   provider's identifier, and the DTO carried only the internal entity id. It is now
   entity identity on `placeEntityDtoSchema`, read from `entity_identifiers`.

### `List_Name_Details` is assembled, not stored

Consumers read `note`, `thumbnail`, `location.{latitude,longitude,address}` and `place_id`
from one blob. Those are not one thing, so they are not stored as one: the note is the
collection's `description`, the thumbnail is its cover media, and the rest is the location
snapshot. `legacyListNameDetails` assembles them once in the shared contract, so the owner
view and the public projection cannot drift into two shapes for the same consumed blob.

### Narrowings, each deliberate

- **No category or subcategory is written.** The vocabulary is Strapi content and this
  ticket forbids inventing production values, so the add form no longer blocks a save on a
  subcategory it cannot store. The seeded taxonomy, the reusable-category assertions and
  sector browse remain owed to the taxonomy ticket.
- **The claimable-place directory write is gone.** `publicPlaceLookup` is the direct
  canonical query this ticket specifies, and it forbids a second asynchronously stale
  directory, so `syncClaimablePlaceProfile` is no longer called from the add flow.
  `services/claimablePlaceProfileService.ts` still exists for 5.4 to decide on.
- **Correcting a place's own facts repoints the recommendation.** Provider facts live on
  the shared entity and are outside the override vocabulary by design, so an owner editing
  an address resolves their own corrected place and the recommendation is repointed to it
  through `replaceRecommendationEntity`. Nobody else's recommendation of the original is
  touched. This is a behavioural difference from Strapi, where every recommendation held
  its own copy of `Place_Details`, and it is the only way to honour both the edit and the
  shared-entity rule.

## Two decisions block the rest

### 1. The category/subcategory vocabulary is not in this repository

`recommendationCategories` is fetched from Strapi at runtime
(`explorers-earth/src/features/Favorites/api/query.ts:38`), so the production taxonomy
values are external content. Ticket 5.1 requires seeding them idempotently and forbids
inventing them: *"no invented production taxonomy values hidden in tests."*

Everything else in Places proceeds without it. What cannot proceed is the seeded taxonomy,
the reusable-category assertions that depend on real terms, and `PublicPersonSector`-style
sector browse, which has nothing to group by. The taxonomy tables themselves already exist
and Movies uses them, so this is an input, not missing schema.

**Needed:** an export of the `recommendationCategories` and
`recommendation_sub_categories` rows, or a decision to defer taxonomy to its own ticket.

### 2. `Place_Details.Photos` has no column in the target schema

The behaviour contract says to map the consumed `Place_Details` JSON "without dropping data
used by cards and maps". The consumed keys are `Place_Id`, `Place_Name`/`Title`,
`Place_Address`, `Geometry`, `Rating`, `Rating_Count` and `Photos`. Every one has a home in
`place_entity_details` or core **except `Photos`**, and
`features/PublicHome/components/PlaceDetails/PlaceOverview.tsx:37` concatenates them with
the owner's own uploads into one gallery, so they are displayed today.

The target schema's Places table has no photo column, and the ticket's own fixture list
mentions "provider photo failure", which reads as though photos are expected to come from
the provider at request time rather than from storage.

The two options are not equivalent:

- **Re-fetch from the provider using the Place ID.** No new column, matches the
  "provider photo failure" fixture, and keeps provider imagery fresh. But it adds a
  per-render Google Places cost on exactly the surface already identified as the largest
  cost risk, and a provider outage empties the gallery.
- **Store the provider photo references.** Preserves today's behaviour and cost profile,
  but needs a column or a slotted table, which is a departure from the target schema and
  a decision about retaining provider-derived content.

**Needed:** which of those, before the projection is written. Writing the projection
either way without the decision would bake in a cost profile or drop imagery users
currently see.
