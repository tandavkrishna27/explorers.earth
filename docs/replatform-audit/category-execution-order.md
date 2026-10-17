# Category execution order

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

Written 2026-10-07. This fixes the ordering that had been agreed in conversation but never
recorded, so "finish through order N" has a definition anyone can check against the repo.

The order is not invented here. It is the staging that
[Task D of the re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md)
already states:

> Prepare 4.3 Apps and 4.4 Products first as independent packages; prepare 4.5 People and
> 5.1 Places in the next capacity window.

> 5.2 waits for Products/People/Places attachment contracts; 5.3 waits for Places and its
> own typed parent/section aggregate; 5.4 waits for reviewed Places claim
> eligibility/media.

Plus the dependency ticket 4.3 records: the shared `e2e/replatform/fixtures.ts` is folded
into 4.3 as the first category package, and 4.4, 4.5 and later lanes consume it rather
than re-deriving sign-in. That is what makes 4.3 a gate rather than a peer.

## The orders

| Order | Tickets | Why it is one order |
|---|---|---|
| **1** | 4.3 Apps | Carries the shared lane fixture every later category consumes. Nothing else may start until its contract and fixture land. |
| **2** | 4.4 Products ‖ 4.5 People | Independent of each other. Implementation may overlap; the migration identifier and the protected qualification window serialise. |
| **3** | 5.1 Places | Task D's "next capacity window" alongside 4.5. Separated to its own order here because it is the largest category and 5.2 depends on it. |
| **4** | 5.2 Guides attachment | The first Epic 5 consumer. Task D: "5.2 waits for Products/People/Places attachment contracts", so it cannot precede orders 2 and 3. |

Orders 5 and beyond (5.3, 5.4, then Epic 7's parity work and Epic 8's retirement) are
outside this document; Task E owns their sequencing and several are gated on deployment
authority that is not ours to grant.

## What "finished" means for a category order

Per order, each ticket in it reaches all of:

1. Shared contract under `tunes/shared/`, registered in the four places a new contract
   file must be declared (see the checklist in ticket 4.3).
2. An append-only migration, registered across the identifier chain, the Drizzle schema,
   the runtime table manifest and the runtime role attestation.
3. A storage repository and a public projection wired into the public profile gateway.
4. The owner write path: typed entity resolution, any per-recommendation context, the
   display-override vocabulary, and the owner editable read.
5. The frontend adapter trio (client, view model, adapter) with mapping assertions.
6. The dashboard consumer off Apollo, with the category's own tests.
7. Verification against real PostgreSQL 15 and the contained navigation lanes.

Explicitly **not** included, because the plan reserves them elsewhere: the per-category
protected browser lane (each needs a Docker fixture runner and identities in
`e2e/replatform/suite-manifest.json`, which the preflights reserve to the coordinator),
and anything behind the 2.4/3.5 deployment-authority gates.

## Status

| Order | State |
|---|---|
| 1 — 4.3 Apps | **complete** (`11987c69`, `e90ebb6b`, `487cae51`) |
| 2 — 4.4 Products | **complete** (`4190600c`, `b832bb4f`, `88b2297c`, `2901093d`) |
| 2 — 4.5 People | **complete** (`a1b5cd61`, `233b1bd1`, `8d9fc37a`, `5386bfac`) |
| 3 - 5.1 Places | **complete** (`8ba664e4`, `6afe0c4f`, `c5eba1f8`, `2ecb315c`, `6b466f94`, `26fe7608`, `7ac28fc4`, `ced36a10`, `36e8f98e`); both owner decisions answered 2026-10-07, taxonomy deferred to its own ticket |
| 4 - 5.2 Guides/place-links attachment | **complete**; migration `0049`, the link commands, public nested traversal, both linked-list pages and the decoded-QR assertions. `place-links.spec.ts` needs the reserved fixture runner |

One input is outstanding and it belongs to order 3: the Places category/subcategory
vocabulary lives in Strapi content (`recommendationCategories`, fetched at runtime) rather
than in this repository, and ticket 5.1 forbids inventing production taxonomy values. Every
other part of Places proceeds without it; the seeded taxonomy and the sector browse route
that groups by it are recorded as owed.

## Order 3 closing note (2026-10-08)

The Places owner surface is entirely native: the lists, the list detail, the add and edit
flows, the list menu and the dashboard page. What is left on Apollo under
`features/Favorites` belongs to 5.2 (the linked person and product lists), 5.4 (the
claimable-place service, no longer called) and Epic 8 (removing the retired documents).

Still owed on this order, each recorded in [ticket 5.1](tickets/ticket-5-1.md):

- the seeded category/subcategory taxonomy and the sector browse that groups by it, which
  is its own ticket by the owner's decision of 2026-10-07;
- `tunes/server/test/explorers/places.test.ts`, the unit-level suite the ticket names;
- `explorers-earth/e2e/replatform/places.spec.ts`, which needs a Docker fixture runner and
  identities in `e2e/replatform/suite-manifest.json` - reserved to the coordinator.

## Order 4 closing note (2026-10-08)

Ticket 5.2 is delivered: `collection_location_links` (migration `0049`), attach/detach and
create-linked commands, the public nested traversal that re-gates every hop, both
linked-list pages on the owner API with a detach control they never had, and the QR
destination proven by decoding rather than by asserting an element exists.

With this, every category in orders 1 to 4 is off Strapi. What remains under
`features/Favorites` is `services/claimablePlaceProfileService.ts`, which belongs to 5.4
and is no longer called, and `api/query.ts` / `api/mutation.ts`, which Epic 8 removes after
checking callers.

Still owed across orders 3 and 4, each recorded in its ticket: the seeded Places taxonomy
and its sector browse, `places.test.ts`, and the two protected browser lanes
(`places.spec.ts`, `place-links.spec.ts`), which need a Docker fixture runner and
`suite-manifest.json` identities reserved to the coordinator.
