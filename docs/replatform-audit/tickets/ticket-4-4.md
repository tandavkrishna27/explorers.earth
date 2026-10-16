# Ticket 4.4: Products

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-04.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** ready after shared handoff. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package Products: exact decimal/currency/null contracts and independent recommendation ownership; production adapter and persisted browser cases. Can pair with Apps.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 3. **Produces:** product detail/offer representation and existing recommendation UX; attachment contract consumed in 5.2.

**Existing:** `explorers-earth/src/features/Products/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `utils/productHelpers.ts`, `components/dashboard/AddProductPage.tsx`, `ProductListView.tsx`, `ProductsHome.tsx`, `components/public/PublicProducts.tsx`, `PublicProductList.tsx`, `ProductDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/products.ts`; `explorers-earth/src/features/Products/api/explorersAdapter.ts`; `tunes/server/test/explorers/products.test.ts`, `products.integration.test.ts`; `explorers-earth/e2e/replatform/products.spec.ts`.

**Behavior contract:** Product/merchant URL, brand, image/specification data, price and currency round-trip. Persist money using the Epic 3 exact-decimal contract; zero is a valid amount, null is unknown, and unknown currency stays unknown. UI formatting and supported price sorts remain stable. This ticket does not implement purchase, affiliate attribution or subscriptions.

- [ ] Test zero versus null, decimal round-trip, missing currency and foreign-owner list assignment; assert similar merchant products are not silently merged.
- [ ] Connect existing price guard/manual form behavior to shared operations and execute the common cycle.
- [ ] Run frontend unit tests filtered to `src/features/Products`; backend commands with `products`; existing/new `products.spec.ts` with their configs.
- [ ] UAT: save zero-price and unknown-price products, edit currency, sort, open external link, upload imagery and publish/unpublish. Keep working manual entry when retired enrichment returns unavailable.
- [ ] In `products.integration.test.ts`, persist prices `"0.00"`, `"19.90"` and null with explicit currency/null; assert wire and stored exact decimal values, never floating sums or invented currency. A's changed recorded offer/title must not change B's recommendation of the same entity. Invalid negative amount and unsupported precision fail validation without a partial write.
- [ ] In `api/__tests__/explorersAdapter.test.ts`, assert conversions used by the current numeric UI preserve zero/null distinctions; in the browser spec assert sort by supported price modes matches the baseline comparator, no unrequested exchange-rate conversion, and unsafe external URL schemes cannot render executable links. Empty currency remains unknown after reload even if the current select offers a default on a new form.

**Acceptance gate:** numeric presentation retains current behavior while the API preserves exact values. Zero-price visibility bugs found in the existing UI are recorded as baseline defects; do not redesign formatting silently to satisfy a new snapshot.

## Independent review correction (2026-10-05)

**Verdict confirmed: NOT-STARTED.** All five mandated files at `:33` are missing, verified path-by-path at `225d83e5`:

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/products.ts` | **MISSING** |
| `explorers-earth/src/features/Products/api/explorersAdapter.ts` | **MISSING** |
| `tunes/server/test/explorers/products.test.ts` | **MISSING** |
| `tunes/server/test/explorers/products.integration.test.ts` | **MISSING** |
| `explorers-earth/e2e/replatform/products.spec.ts` | **MISSING** |

**The live consumer is still Apollo/Strapi GraphQL.** `explorers-earth/src/features/Products/api/query.ts:1` is `import { gql } from "@apollo/client"` and `:6` declares `PRODUCT_LISTS_BY_ACCOUNT` as a `gql` query over `productLists(...)` keyed on `$accountDocumentId`. The audit's record of Products as incomplete with a live Apollo consumer is correct and is preserved here.

### The canonical backend has no typed storage or write path for the Products legacy fields

- Manual entity resolution accepts **`{title}` only**: `resolveManualEntitySchema` at `tunes/shared/explorersContract.ts:87` — `details:z.object({title:displayTitleWriteSchema}).strict()`, so every other key is rejected.
- The public read path **rejects any display-override key other than `title`** for non-books/non-movies categories: `tunes/server/application/publicContent.ts:34`.

So the legacy required fields are **currently unrepresentable** end to end: `product_url` (`explorers-earth/src/features/Products/types/index.ts:22`), `price` as `number | null` (`:25`) and `currency` as `string | null` (`:26`), plus brand, image and specification data required by `:35`.

- [ ] **This ticket owes a contract + migration + storage, not just an adapter.** The Epic 3 exact-decimal money contract demanded at `:35` has no Products storage to land in: there is no typed product details table and no write path. Add the typed contract, author the next append-only migration, implement the storage, and extend the public display-override allowlist for `products` — then build the adapter. Until that chain exists, `:41` cannot be executed at all: persisting `"0.00"`, `"19.90"` and null with explicit currency/null, and asserting **exact decimal** wire and stored values, has no destination. The zero-versus-null and unknown-currency distinctions at `:37` and `:42` remain mandatory and must not be approximated by a float column.

### Dependency prose correction

- [ ] `:29` reads "**Depends on:** Epic 3", which is a blanket epic edge. The real edges are **3.1 and 3.2**, as this ticket's execution card already records ("Technical inputs: 3.1, 3.2"). Read the prose as 3.1/3.2; Epic 3 is explicitly not a blanket prerequisite for its consumers.

### Shared fixtures module

The epic-mandated `explorers-earth/e2e/replatform/fixtures.ts` (specified at `docs/replatform-audit/epics/epic-04.md:71`, exporting `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context) **DOES NOT EXIST**; all six existing lanes roll bespoke setup. Creating it is folded into **4.3** as the first category package of Epic 4. This ticket's `products.spec.ts` consumes that fixture rather than deriving its own sign-in, and must not add a publicly mounted test-login endpoint or relax the contained-test network restrictions.

## Delivery status (2026-10-07)

The 2026-10-05 review verified NOT-STARTED at `225d83e5`. This records what now exists.
The ledger remains authoritative.

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/products.ts` | **not created, deliberately** — see below |
| `explorers-earth/src/features/Products/api/explorersAdapter.ts` | delivered |
| `tunes/server/test/explorers/products.test.ts` | **still missing** — see below |
| `tunes/server/test/explorers/products.integration.test.ts` | delivered (21 cases) |
| `explorers-earth/e2e/replatform/products.spec.ts` | **still missing** — see below |

Also delivered, from the review's correction that this ticket owes a contract, migration
and storage rather than only an adapter:

- `tunes/shared/explorersProductContract.ts`. Money is an exact decimal string end to end.
  The supported currencies are pinned with their ISO 4217 minor units rather than read
  from `Intl`, whose currency data varies with the host's ICU build; the set is
  AddProductPage's own `ALLOWED_CURRENCIES`. `canonicalAmount` resolves the one real
  ambiguity: `numeric(20,6)` returns `"19.90"` as `"19.900000"`, so the rule is to drop
  trailing zeros and, when the currency is known, pad back to its minor units.
- `tunes/migrations/0044_explorers_products_offer_context.sql`. `product_entity_details`
  holds the shared catalog facts; the creator's offer lives in
  `product_recommendation_context`, keyed on the recommendation, which is what makes "A's
  offer must not change B's recommendation of the same entity" true by construction.
- `productCatalogRepository`, `publicProductsProjection` wired into the gateway, and the
  Products vocabulary admitted to the public override allowlist. Before that, a published
  Products tab answered HTTP 200 with an empty list.
- The live consumer is native: `useProductsOwner`, `useProductsCommands` and all four
  dashboard components. The public pages were already native.

### Three gaps this work exposed in 4.3 as well

The command contract accepted typed Apps and Products payloads, the storage existed, and
the two were not connected. Fixed here and pinned by
`tunes/server/test/explorers/category-write-path.integration.test.ts`:

1. `resolveEntity` fell through to `resolveManualEntity` for both categories, so the
   entities row was written and the typed details discarded. The client then rejected the
   untyped response, which means **the Apps package shipped with working reads and a
   create that could not complete**.
2. `createRecommendation` and `updateRecommendation` accepted `appScreenshots` and
   `productOffer` and wrote neither.
3. `updateRecommendation` rejected every display override but `title` outside Books and
   Movies, so editing an App's or a Product's presentational fields was impossible.

`ownerContent` had no app or product branch either, so an owner read returned the untyped
core entity.

### Strapi-era behaviour removed rather than ported

- `AddProductPage` posted to `/api/products/scrape-link`. `explorers-earth/vite.config.ts`
  still proxies that path to the Tunes server, but the server has no such route, so the
  step called a dead endpoint and discarded the draft when it failed. With no enrichment
  there is nothing to auto-fill and nothing to flag as unverified, which is the whole
  purpose of the scraped-price guard; `scrapePriceGuard.test.tsx` and
  `scrape-flow.integration.test.tsx` are replaced by `manualProductFlow.test.tsx`, which
  asserts what that guard protected against the native path: an owner's amount is never
  silently altered, an unsupported currency cannot be chosen, and an impossible precision
  is reported before any command is dispatched.
- The price input was `type="number"`. A float cannot represent `"19.90"`, so it is now
  decimal text and the exact string reaches `numeric(20,6)`.
- The category selector read a Strapi taxonomy with no canonical replacement.

`ProductListView` gained a per-recommendation publication control, as Games and Apps have:
the public projection serves only published rows, so without it a published list would
serve nothing. `ProductTopPicksManager` now writes the whole pin set in one command.

### Why there is no `tunes/server/explorers/categories/products.ts`

`tunes/server/explorers/categories/` contains only `movies.ts` and `movieGenreSeeds.ts`.
That module exists for Movies because Movies has provider genre seeds to own. Products has
no provider, no taxonomy and no seeds, so the equivalent logic is the repository and the
projection. The same reasoning was recorded for Apps in ticket 4.3.

### Remaining obligations

- [ ] **`tunes/server/test/explorers/products.test.ts`** — the SQL-shape assertions over
  `0044` that `apps.test.ts` makes over `0043`. The storage is covered by the integration
  suite against real PostgreSQL; this file is the cheaper static proof and is not written.
- [ ] **`explorers-earth/e2e/replatform/products.spec.ts` and its lane.** As with Apps,
  this is a separate package: `scripts/replatform-e2e.mjs` holds a closed lane registry at
  `:11` and `validateManifest` at `:54` requires `scopeContents` to equal it exactly, so a
  Products lane needs a `tunes/scripts/products-browser-fixture.ts`, a playwright config,
  and manifest identities matching its spec titles. It should consume `fixtures.ts`.
- [ ] **`explorers-earth/e2e/products.spec.ts` and `e2e/apps.spec.ts`** drive the pages
  these two tickets rewrote and still expect the scraper steps. They run in
  `frontend-e2e-qualification.yml`, which is nightly and manual-dispatch only - not PR
  CI - and its scheduled run on `main` was already failing before this work. They are
  owed by 4.3 and 4.4 regardless.
- [ ] **UAT** at `:40` (zero-price and unknown-price products, edit currency, sort,
  external link, imagery, publish/unpublish) is unrun.
- [ ] The acceptance gate's note that **zero-price visibility bugs in the existing UI are
  baseline defects** has not been checked against the rewritten page; `formatPrice`
  formats 0 as a currency amount and was deliberately left alone.

### Currency metadata, the open owner decision

The ticket required validating precision "against versioned ISO metadata" without naming a
source. Recorded decision: pin the eight currencies the existing form already offers, with
their minor units, under `CURRENCY_METADATA_VERSION`, and reject any other three-letter
code at the API boundary. `Intl` was rejected as the source because its currency data
varies with the host's ICU build, so the same price would validate differently on
different machines. Adding a currency is therefore a visible, dated change to one table -
not a silent widening.
