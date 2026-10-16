# Ticket 4.3: Apps & Tools

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-04.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** ready after shared handoff. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package Apps: typed price tiers/platforms/screenshots and manual fallback, production adapter, persisted owner/public browser cases. Coordinate shared DTO/routes with root.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 3. **Produces:** app entities and independent account recommendations using existing cards/forms.

**Existing:** `explorers-earth/src/features/AppsAndTools/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `components/dashboard/AddAppPage.tsx`, `AppListView.tsx`, `AppsHome.tsx`, `components/public/PublicApps.tsx`, `PublicAppList.tsx`, `AppDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/apps.ts`; `explorers-earth/src/features/AppsAndTools/api/explorersAdapter.ts`; `tunes/server/test/explorers/apps.test.ts`, `apps.integration.test.ts`; `explorers-earth/e2e/replatform/apps.spec.ts`.

**Behavior contract:** Preserve `app_url`, developer/platforms, screenshots, download URL and the exact price-tier choices `Free`, `Freemium`, `Paid`, `Subscription`, or null. This is descriptive app metadata, not a billing feature. Similar URLs or names do not establish entity identity. Preserve manual entry when enrichment is unavailable; do not revive retired scraper endpoints.

- [ ] Test `price_tier_and_platforms_round_trip`, `similar_urls_are_not_auto_merged`, `unsafe_outbound_scheme_is_rejected`, and retained manual fallback after enrichment failure.
- [ ] Implement adapter and common cycle, including modal keyboard focus/accessibility and returning from add/edit to the correct list.
- [ ] Run frontend unit tests filtered to `src/features/AppsAndTools`; backend commands with `apps`; existing/new `apps.spec.ts` with their configs.
- [ ] UAT: manually add app, edit note, upload/replace media, top picks, publish/unpublish and public modal on both viewport sizes.
- [ ] Parameterize `apps.integration.test.ts` over `Free`, `Freemium`, `Paid`, `Subscription`, null; assert exact saved tier and no payment/subscription record. Create manual apps with similar normalized URLs under separate commands and assert distinct entities; retry a single command and assert one entity.
- [ ] In the adapter test and browser spec, round-trip platforms/screenshots/download URL, restore focus to the originating card after modal close, and preserve draft text when enrichment is unavailable. Test keyboard activation and escape in the actual retained modal. Execute the new adapter test file explicitly.

**Acceptance gate:** manual Apps flow is fully persisted, existing list return navigation works after add/edit, and tier metadata does not require any retired billing endpoint.

## Independent review correction (2026-10-05)

**Verdict confirmed: NOT-STARTED.** All five mandated files at `:33` are missing, verified path-by-path at `225d83e5`:

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/apps.ts` | **MISSING** |
| `explorers-earth/src/features/AppsAndTools/api/explorersAdapter.ts` | **MISSING** |
| `tunes/server/test/explorers/apps.test.ts` | **MISSING** |
| `tunes/server/test/explorers/apps.integration.test.ts` | **MISSING** |
| `explorers-earth/e2e/replatform/apps.spec.ts` | **MISSING** |

**The live consumer is still Apollo/Strapi GraphQL.** `explorers-earth/src/features/AppsAndTools/api/query.ts:1` is `import { gql } from "@apollo/client"` and `:6` declares `APP_LISTS_BY_ACCOUNT` as a `gql` query over `appLists(...)` keyed on `$accountDocumentId`. This ticket's own audit status is honest about Apps being incomplete with a live Apollo consumer, and that honesty is preserved here: nothing below implies otherwise.

### The canonical backend has no typed storage or write path for the Apps legacy fields

This is the correction that changes the ticket's scope. It is not a UI-adapter job.

- Manual entity resolution accepts **`{title}` only**: `resolveManualEntitySchema` at `tunes/shared/explorersContract.ts:87` is `z.object({kind:z.literal('manual'), category:topPickCategorySchema, details:z.object({title:displayTitleWriteSchema}).strict()}).strict()`. The `.strict()` on `details` rejects every other key.
- The public read path **rejects any display-override key other than `title`** for non-books/non-movies categories: `tunes/server/application/publicContent.ts:34` — `else if(row.content_category!=='books' && Object.keys(overrides.data).some(k=>k!=='title')) throw new PublicContentFailure(400)`.

So the legacy required fields are **currently unrepresentable** end to end: `app_url` (`explorers-earth/src/features/AppsAndTools/types/index.ts:22`) and `price_tier` with the exact enum `Free | Freemium | Paid | Subscription | null` (`:28`), plus developer/platforms, screenshots and download URL required by `:35`.

- [ ] **This ticket owes a contract + migration + storage, not just an adapter.** Add the typed Apps details to the shared contract, author the next append-only migration for its storage, implement the repository/storage write path, and extend the public display-override allowlist for `apps` — then build the adapter. `price_tier_and_platforms_round_trip` at `:37` cannot pass until that chain exists, and parameterizing `apps.integration.test.ts` over the five tier values (`:41`) has nowhere to persist to today.

### Dependency prose correction

- [ ] `:29` reads "**Depends on:** Epic 3", which is a blanket epic edge. The real edges are **3.1 and 3.2**, as this ticket's own execution card already records ("Technical inputs: 3.1, 3.2"). Read the prose as 3.1/3.2. Epic 3 is explicitly not a blanket prerequisite for its consumers; a reviewed producer interface from 3.1/3.2 is what this ticket consumes, and no part of Epic 3's unrelated closure gates it.

### The epic-mandated shared fixtures module does not exist — 4.3 creates it

`docs/replatform-audit/epics/epic-04.md:71` mandates that `explorers-earth/e2e/replatform/fixtures.ts` export `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context, with the Authentication owner defining the fixture rather than category tickets.

**`explorers-earth/e2e/replatform/fixtures.ts` DOES NOT EXIST.** All six existing lanes (`auth`, `profile`, `books`, `lifecycle`, `movies`, `games`) roll **bespoke setup** instead, which is why no two lanes share an identity model.

- [ ] **Creating the shared `fixtures.ts` is folded into this package, as the first category package of Epic 4.** It must export the exact surface epic-04 names — `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context — create real in-process sessions via its identity test factory, and mount **no** public test-login endpoint. 4.4, 4.5 and later category lanes consume it rather than each re-deriving sign-in. Folding the file into this package does not transfer authority over the identity model away from the Authentication owner, and it does not permit weakening the contained-test network restrictions to make a new suite pass.

## Delivery status (2026-10-07)

The 2026-10-05 review above verified NOT-STARTED at `225d83e5`. This records what now
exists, so the next reader does not re-derive it. The ledger remains authoritative.

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/apps.ts` | **not created, deliberately** — see below |
| `explorers-earth/src/features/AppsAndTools/api/explorersAdapter.ts` | delivered |
| `tunes/server/test/explorers/apps.test.ts` | delivered |
| `tunes/server/test/explorers/apps.integration.test.ts` | delivered (8 cases) |
| `explorers-earth/e2e/replatform/apps.spec.ts` | **still missing** — see below |
| `explorers-earth/e2e/replatform/fixtures.ts` | delivered |

Also delivered, from the review's scope correction that this ticket owes a contract,
migration and storage rather than only an adapter:

- `tunes/shared/explorersAppContract.ts` — typed details with the exact four price tiers
  and null, bounded free-text platforms, and an override vocabulary that **excludes
  `appUrl`** because an override re-presents a shared entity.
- `tunes/migrations/0043_explorers_apps_provider_context.sql` — `app_entity_details`
  (`app_url` NOT NULL with a scheme CHECK) and `recommendation_app_screenshots` (ten
  ordered slots, composite FKs), with the three revision functions and
  `purge_explorers_account_content` re-emitted to reach the new tables.
- `tunes/server/repositories/appCatalogRepository.ts`, and
  `tunes/server/publicProfile/publicAppsProjection.ts` wired into
  `postgresPublicProfileGateway`. Before that, a published Apps tab answered HTTP 200
  with an empty list — the worse failure, because it looked legitimately empty.
- The public display-override allowlist in `tunes/server/application/publicContent.ts`
  now admits the Apps vocabulary instead of rejecting every key but `title`.

### The live consumer is now native

The review recorded the live consumer as Apollo/Strapi. It is not any more:

- `hooks/useAppsOwner.ts` plus `useAppsCommands`/`useAppsCallerCustody` in `api/query.ts`.
- `AppsHome`, `AppListView`, `AppTopPicksManager` and `AddAppPage` read and write through
  them. The `gql` documents stay in `api/query.ts` and `api/mutation.ts` for Epic 8 to
  remove after it checks callers.
- The public pages were **already** native (`usePublicRecommendationCategory`), which is
  why the missing server projection was a live defect rather than dormant work.

Three Strapi-era behaviours were removed rather than ported, each with a reason:

- `AddAppPage` posted to `/api/apps/scrape-url`. That route does not exist;
  `music-security-containment.test.ts` asserts the path stays absent. Apps has no
  provider, so the URL is an owner-entered field and the form says details are not
  fetched. This satisfies "preserve manual entry when enrichment is unavailable" without
  reviving the endpoint.
- Screenshot uploads went to the Strapi `/upload` with a bearer token. They are owner
  media now, uploaded through the native media route and held in the ordered slots.
- The app-category selector read a Strapi taxonomy with no canonical replacement.
  Taxonomy is out of scope here and the projection serves `app_category` as null, so a
  picker would have written a value nothing reads.

`AppListView` gained a per-recommendation publication control, as Games has. This is not
cosmetic: the public projection serves only `publication_state='published'` rows, so
without it a published list would serve nothing.

`AppTopPicksManager` now writes the whole pin set in one command. The Strapi path issued
one mutation per row and could leave the set half-applied, and reordering auto-saved per
move; order is local until Save.

### Why there is no `tunes/server/explorers/categories/apps.ts`

`tunes/server/explorers/categories/` contains only `movies.ts` and `movieGenreSeeds.ts`.
Ticket 4.2 shipped Games with no `categories/games.ts`: that module exists for Movies
because Movies has provider genre seeds to own. Apps has no provider, no taxonomy and no
seeds, so the equivalent logic is the repository and the projection. Creating an empty
module to satisfy the path list would add a file with nothing in it.

### Remaining obligations

- [ ] **`explorers-earth/e2e/replatform/apps.spec.ts` and its lane.** This is a separate
  package, not a loose end of the adapter work: `scripts/replatform-e2e.mjs` holds a
  closed six-lane registry at `:11`, and `validateManifest` at `:54` requires
  `scopeContents` to equal the registry exactly and every lane to declare its runner,
  config, spec path, projects and an exact identity list matching
  `e2e/replatform/suite-manifest.json`. An Apps lane therefore needs a new
  `tunes/scripts/apps-browser-fixture.ts` (Docker Postgres, migrate, seed, serve, receipt
  with an owned `music_uat_*` database and image id), a playwright config, the registry
  and manifest entries, and spec titles pinned to the manifest identities. It should be
  the first consumer of `fixtures.ts`.
- [ ] **`apps.integration.test.ts` needs the fixture Postgres.** It is gated on
  `MUSIC_C6_POSTGRES_TEST=1` against `127.0.0.1:55432`. Its 8 cases last ran green in the
  session that wrote them; a bare `vitest run` of the two backend files silently runs only
  `apps.test.ts`, so a run that reports one file is a skip, not a pass.
- [ ] **UAT** at `:40` (add, edit note, upload/replace media, top picks, publish/unpublish,
  public modal on both viewports) is unrun. The modal keyboard/escape and focus-restore
  obligations at `:42` live in `AppDetailModal`, which this package did not touch; only one
  accessibility test covers it today.

### Note on `fixtures.ts`

It exports exactly the surface `epic-04.md:95` names, but `signInAs('suspended')` is
**ownerA plus the lane's own `suspend-ownerA` control action**, not a third seeded
persona. The delivered runners model suspension that way (`games-browser-fixture.ts:201`),
and seeding a third account here would describe an identity model they do not have. The
module mounts no test-login endpoint and keeps the origin-only route filter. It has no
browser consumer until the first lane adopts it.

## Registering a new shared contract file (learned 2026-10-07)

Adding `tunes/shared/explorersAppContract.ts` cost three separate CI round-trips because a new file under `tunes/shared/` must be declared in several hardcoded allowlists, none of which is discoverable from the others. 4.4 and 4.5 each add one, so the full list is recorded here.

A new `tunes/shared/explorers*Contract.ts` that `explorersContract.ts` imports must be added to **all** of:

1. `scripts/generate-music-fixture-dockerignore.mjs` — the shared-contract allowlist, then run the generator with `--write`; `--check` must exit 0. Correction (2026-10-07): only `tunes/shared/*` contracts are hand-listed there. Everything under `explorers-earth/src` comes from `git ls-files` at `:69`, so a **new frontend file must be staged before `--write`** or it is silently left out of both generated files and the next `--check` fails on a later commit. Test files are excluded by `deniedSegments`.
2. `explorers-earth/Dockerfile.music-fixture` — an explicit `COPY` line. **This one is a real build break, not a test failure:** the fixture image copies contracts individually, so without it the image ships without a module `explorersContract.ts` imports.
3. `explorers-earth/src/lib/__tests__/ownerSharedBundle.test.ts` — the copy list at `:14`. That test bundles the shared contracts in a temp directory to prove they carry no sibling dependencies, so an unlisted import fails with `UNRESOLVED_IMPORT` rather than anything that names the real cause.
4. `fixtures/db/music-runtime-table-manifest.json` and `tunes/shared/explorersSchema.ts` — only when the contract comes with new tables. The manifest's `managedBy: "drizzle"` entries are validated against the generated Drizzle references, so a table in the manifest with no Drizzle declaration fails as "in the manifest but absent from a fresh migrated database".

Two generated artefacts go stale whenever **any** file is added or deleted anywhere in the tracked tree, not only a contract: the fixture Docker context (`--write`) and, if a route moved, `docs/architecture/music-runtime-surface-inventory.json` plus the authorization matrix. Regenerate them in the same commit as the file change. Discovering them from CI afterwards cost two of the three round-trips here.
