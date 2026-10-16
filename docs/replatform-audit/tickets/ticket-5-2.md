# Ticket 5.2: Maps, QR and linked lists

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-05.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 4.4, 4.5, 5.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Freeze attachment DTOs first; then qualify map, QR and location links without inventing provider success.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 5.1, 4.4, 4.5, explicit attachment command/DTO in shared contract.

**Existing:** `explorers-earth/src/features/Favorites/components/AddLinkedProductsPage.tsx`, `AddLinkedPeoplePage.tsx`, `LinksAndQR.tsx`, `QRSticker.tsx`; `explorers-earth/src/features/PublicHome/components/MapView.tsx`, `PlaceMapView.tsx`; `explorers-earth/src/utils/qrCodeService.ts`, `src/hooks/useQRActions.tsx`.

**Create:** `tunes/server/test/explorers/placeLinks.integration.test.ts`; `explorers-earth/e2e/replatform/place-links.spec.ts`; extend 5.1 category module and the shared collection association repository, not a separate authorization service.

**Behavior contract:** Account-owned Product/People lists attach only to account-owned place/location context allowed by current UI. Public traversal rechecks profile, category, list and target visibility. QR output retains its existing canonical web destination and optional UTM behavior; scanned links resolve to the same page. Browser map presentation remains unchanged.

- [ ] Test cross-account attachment denial, private child under public parent, detach without deleting the child list, and account/category unpublish invalidating public linked results.
- [ ] Add link association persistence and adapt existing pages; preserve map loading/failure/retry and directions behavior.
- [ ] Add unit assertions on QR payload URL and encoding; inspect generated QR by decoding it in the test rather than merely asserting that an image exists.
- [ ] Run `npm --prefix explorers-earth run test:unit -- src/utils/__tests__/qrCodeService.replatform.test.ts` for the new QR assertions; a missing decoder dependency is added to dev/test dependencies only after verifying the installed QR library cannot decode.
- [ ] Run `npm --prefix tunes run test:integration -- server/test/explorers/placeLinks.integration.test.ts`; run new `replatform/place-links.spec.ts` with the real API config.
- [ ] UAT: attach/detach both list kinds, public map navigation and directions, QR scan/decode/open on mobile, then hide a linked list and verify direct/public nested access is denied. A real Maps smoke remains separate from fixture map UI evidence.
- [ ] Add the existing `recommendation_list: locationId` create path to Product/People `CreateCollectionInput` as `parentLocationCollectionId?:string`. The application create transaction validates the parent and links the new list atomically. Failed parent ownership or revision validation must leave no orphan child; consume the same core create operation, not another list creator.
- [ ] Preserve one location parent per linked child list. In `placeLinks.integration.test.ts`, attach a child to location A, try attaching it to location B and assert 409 with the original relation unchanged; explicit detach followed by attach is permitted. A bare individual place recommendation ID supplied as parent must fail 404/422, never create an accidental relation.
- [ ] Add `explorers-earth/src/utils/__tests__/qrCodeService.replatform.test.ts`: decode generated profile/location QR bytes, assert exact canonical route and supplied UTM parameters, and verify URL encoding for spaces/non-ASCII handles. Missing location coordinates must show the existing no-map state, not a map pin at zero.

**Acceptance gate:** create-linked-list from the current location route needs no place item, detach preserves list/content, private child is absent from nested public responses, and both QR payload and opened destination are verified.


## Independent review correction (2026-10-05)

Create-and-link input includes parentLocationCollectionId and a required parentExpectedRevision when a parent is supplied; reject incomplete parent/revision pairs. The shared core create transaction locks and validates the parent, atomically creates/links child, increments the parent relation revision and returns child plus resulting parent revision. Freeze exact current revision names/DTO in producer preflight. Stale-parent or foreign-owner failure leaves neither orphan child nor changed link. Same command id replays its receipt without another child/revision bump; changed input conflicts. Ticket 5.2 owns this core extension jointly allocated by the coordinator.

## Independent review verification (2026-10-05)

**NOT-STARTED, confirmed by negative evidence** against source at `225d83e5`:

- `tunes/shared/explorersContract.ts:60-62` declares `createCollectionSchema` as `.strict()` over `category`, `title`, `slug`, `visibility`, `publicationState`, `description`, `heading`, `coverMediaId` — **no parent fields**. A `.strict()` schema rejects unknown keys, so the `:43` obligation to add `parentLocationCollectionId?:string` is a shared-contract change, not an additive client change.
- `parentLocationCollectionId` and `parentExpectedRevision` have **zero** hits across `tunes/` and `explorers-earth/`.
- `tunes/server/test/explorers/placeLinks.integration.test.ts` and `explorers-earth/e2e/replatform/place-links.spec.ts` do not exist.

### Ownership is currently unallocated

This ticket owns `parentExpectedRevision`, the atomic create-and-link transaction and idempotent receipts (per `:50-52` above and `:43-44`). But the shared **core create extension** it needs is coordinator-reserved: `ticket-5-2.md:17` reserves shared schema and `:52` states the extension is "jointly allocated by the coordinator", and the shared contract file `tunes/shared/explorersContract.ts` is not in any single ticket's writer allowlist. **This ticket therefore has no allocated owner for the change it cannot proceed without.** Allocation is a coordinator preflight, not something a 5.2 writer may self-grant by editing the shared contract.

The `:43` constraint "consume the same core create operation, not another list creator" is the reason this cannot be worked around: forking a second create path to avoid the shared file would violate the ticket's own gate.

## Delivery status (2026-10-08)

Delivered and verified against PostgreSQL 15. `place-links.spec.ts` is the one mandated
path not created: it needs a Docker fixture runner and identities in
`e2e/replatform/suite-manifest.json`, which the preflights reserve to the coordinator.

| Mandated path | State |
|---|---|
| `tunes/shared/explorersPlaceLinkContract.ts` (not in the original list) | delivered |
| `tunes/migrations/0049_explorers_collection_location_links.sql` | delivered, chain-registered |
| `tunes/server/repositories/placeLinkRepository.ts` (not in the original list) | delivered |
| `tunes/server/test/explorers/placeLinks.integration.test.ts` | delivered, 18 cases |
| `explorers-earth/src/utils/__tests__/qrCodeService.replatform.test.ts` | delivered, 5 cases |
| `components/AddLinkedProductsPage.tsx`, `AddLinkedPeoplePage.tsx` | migrated, with attach and detach |
| `components/LinksAndQR.tsx`, `QRSticker.tsx` | no change needed - they render the QR from the URL builders, which are unchanged |
| `features/PublicHome/components/MapView.tsx`, `PlaceMapView.tsx` | no change needed - map presentation is unchanged, and `Geometry` keeps the flat shape 5.1 corrected |
| `src/utils/qrCodeService.ts`, `src/hooks/useQRActions.tsx` | no change needed - the canonical destination and UTM behaviour are preserved, now proven by decoding |
| `explorers-earth/e2e/replatform/place-links.spec.ts` | **not started** - needs the reserved fixture runner |

### The three rules are storage, not application checks

`collection_location_links` is keyed by the child, so a second parent cannot be written at
all; both foreign keys carry `account_id`, so a cross-account attachment is impossible
rather than refused after the fact; and the parent key includes the places category, so a
bare place recommendation id has nothing to reference. Each is asserted by trying to break
it, and the repository's only job is translating the resulting refusal into a status a
caller can act on.

Re-pointing is an explicit detach then attach. Attaching a list that already has a parent
is 409 with the original relation untouched - the ticket's own case - because a silent move
loses where the list was without anyone asking. There is no `UPDATE` grant on the table for
the same reason: a link's identity is the pair it names.

### Public traversal re-gates every hop

`publicLinkedPeopleLists` and `publicLinkedProductsLists` apply their own projections'
gates again rather than copying them: the account must be publicly eligible, the child's
category must be public, and the child list itself must be public and published. So a
private child under a public location is absent rather than redacted, and unpublishing the
People or Products category removes every linked child from every location page without
touching a single link row. Each of those is a case in the suite.

### Create-from-a-location is one command

`parentLocationCollectionId` on `CreateCollectionInput` links the new list in the same
transaction as the create, through the same core create operation rather than a second list
creator. A bad parent rolls the whole create back, which the suite asserts by counting the
owner's lists before and after.

### The QR is decoded, not merely rendered

`qrcode.react@4.2.0` exports only `QRCodeCanvas` and `QRCodeSVG` and cannot decode, so
`jsqr` is a dev dependency, as this ticket permits once that is verified. The test renders
the component the app renders, recovers the module matrix from the SVG and decodes it, then
asserts the exact canonical route and the supplied UTM parameters. Decoding goes through the
matrix rather than a canvas, so jsdom needs no rasteriser.

One finding recorded rather than asserted as encoding: the URL builders concatenate without
percent-encoding, which is safe **only** because `0022` constrains a handle to
`[a-z][a-z0-9-]*` and `0029` a slug to the same alphabet. A handle with a space would reach
the QR as a broken URL; what prevents it is that such a handle cannot be stored. The test
asserts that rule directly, so relaxing it fails this case and forces the builder to encode.

### Narrowed

The nested linked lists on the location page come from each category's own owner read,
intersected with the ids the location reports. Copying the children's contents into the
location's read would make two sources for one list, and the lists are already loaded by
the category hooks the page mounts.
