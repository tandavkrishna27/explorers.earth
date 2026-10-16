# Ticket 4.5: People

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-04.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** ready after shared handoff. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package People: preserve alias/profile/social metadata and explicit ownership; same-name and login-handle negatives. Can pair with Places after capacity opens.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 3. **Produces:** recommended-person records and existing list/public/sector flows; attachment contract consumed in 5.2.

**Existing:** `explorers-earth/src/features/People/types/index.ts`, `api/query.ts`, `api/mutation.ts`, `utils/personHelpers.ts`, `components/dashboard/AddPersonPage.tsx`, `PersonListView.tsx`, `PeopleHome.tsx`, `components/public/PublicPeople.tsx`, `PublicPersonList.tsx`, `PublicPersonSector.tsx`, `PersonDetailModal.tsx`.

**Create:** `tunes/server/explorers/categories/people.ts`; `explorers-earth/src/features/People/api/explorersAdapter.ts`; `tunes/server/test/explorers/people.test.ts`, `people.integration.test.ts`; `explorers-earth/e2e/replatform/people.spec.ts`.

**Behavior contract:** Preserve name/handle, headline, location, avatar/media, social URLs/platform, skills/tags and sector/category. Preserve existing aliases (`full_name`, `profile_url`, `platform`, etc.) at the adapter edge until consuming components no longer need them. External follower-count metadata may remain; no Explorers follower relationships are created. Matching an account handle confers no ownership or login linkage.

- [ ] Test `same_name_people_remain_distinct`, `matching_login_handle_grants_no_authority`, and social/alias round-trip with optional fields absent.
- [ ] Implement mapper and common cycle, retaining keyboard navigation/focus behavior from the existing accessibility test.
- [ ] Run frontend unit tests filtered to `src/features/People`; backend commands with `people`; existing/new `people.spec.ts` with their configs.
- [ ] UAT: create/edit person manually, external profiles, sector browse, custom order/top picks and private/public views; enrichment failure must not erase a manual draft.
- [ ] In `people.integration.test.ts`, create two “Alex Lee” records without authoritative matching identifiers; assert distinct IDs. Set one handle equal to owner B's account handle and assert no membership or account link is created. Explicitly assert A's person data edit cannot change B's recommendation.
- [ ] In `api/__tests__/explorersAdapter.test.ts`, compare canonical and compatibility aliases, including `twitter`/`x` presentation normalization, missing avatar fallback and sector names. In the browser spec enter external social URLs and tags manually, save/reload, open/close detail by keyboard, and confirm the sector route lists only visible records.

**Acceptance gate:** recommended people remain data rather than identities, and external follower-count presentation creates no follower-network persistence or API dependency.

## Independent review correction (2026-10-05)

**Verdict confirmed: NOT-STARTED.** All five mandated files at `:33` are missing, verified path-by-path at `225d83e5`:

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/people.ts` | **MISSING** |
| `explorers-earth/src/features/People/api/explorersAdapter.ts` | **MISSING** |
| `tunes/server/test/explorers/people.test.ts` | **MISSING** |
| `tunes/server/test/explorers/people.integration.test.ts` | **MISSING** |
| `explorers-earth/e2e/replatform/people.spec.ts` | **MISSING** |

**The live consumer is still Apollo/Strapi GraphQL.** `explorers-earth/src/features/People/api/query.ts:1` is `import { gql } from "@apollo/client"` and `:6` declares `PERSON_LISTS_BY_ACCOUNT` as a `gql` query over `personLists(...)` keyed on `$accountDocumentId`. The audit's record of People as incomplete with a live Apollo consumer is correct and is preserved here.

### The canonical backend has no typed storage or write path for the People legacy fields

- Manual entity resolution accepts **`{title}` only**: `resolveManualEntitySchema` at `tunes/shared/explorersContract.ts:87` — `details:z.object({title:displayTitleWriteSchema}).strict()`.
- The public read path **rejects any display-override key other than `title`** for non-books/non-movies categories: `tunes/server/application/publicContent.ts:34`.

So the legacy required fields are **currently unrepresentable** end to end: person `name` (`explorers-earth/src/features/People/types/index.ts:23`), `primary_platform` with the exact enum `instagram | linkedin | twitter | github | youtube | website | other | null` (`:32`), and `social_urls` as a JSON object (`:33`), plus headline, location, avatar/media, skills/tags and sector required by `:35`. Note that a person entity is reachable as a catalog **kind** — `places:['place','person']` and `people:['person']` appear in the replacement category matrix at `tunes/server/repositories/explorersRecommendationRepository.ts:301` — but kind reachability is not typed field storage.

- [ ] **This ticket owes a contract + migration + storage, not just an adapter.** Add the typed People details contract (including the `primary_platform` enum and `social_urls`), author the next append-only migration, implement the storage, and extend the public display-override allowlist for `people` — then build the adapter and the alias edge at `:35`. Until that chain exists, the social/alias round-trip at `:37` and the canonical-versus-compatibility alias comparison at `:42` have no persistence to round-trip through.
- The two negatives at `:37` remain mandatory and are **not** satisfied by the absence of storage: `same_name_people_remain_distinct` and `matching_login_handle_grants_no_authority`. The second is a safety obligation — matching an account handle must confer no ownership or login linkage (`:35`, `:41`) — and must be asserted server-side once storage exists, never inferred from the UI.

### Dependency prose correction

- [ ] `:29` reads "**Depends on:** Epic 3", which is a blanket epic edge. The real edges are **3.1 and 3.2**, as this ticket's execution card already records ("Technical inputs: 3.1, 3.2"). Read the prose as 3.1/3.2; Epic 3 is explicitly not a blanket prerequisite for its consumers.

### Shared fixtures module

The epic-mandated `explorers-earth/e2e/replatform/fixtures.ts` (specified at `docs/replatform-audit/epics/epic-04.md:71`, exporting `test`, `expect`, acceptance account IDs, `signInAs('ownerA'|'ownerB'|'suspended')` and an API request context) **DOES NOT EXIST**; all six existing lanes roll bespoke setup. Creating it is folded into **4.3** as the first category package of Epic 4. This ticket's `people.spec.ts` consumes that fixture — in particular its `ownerA`/`ownerB`/`suspended` identities, which the foreign-owner and handle-collision negatives need — rather than deriving its own sign-in, and must not add a publicly mounted test-login endpoint or relax the contained-test network restrictions.

## Delivery status (2026-10-07)

| Mandated path | State |
|---|---|
| `tunes/server/explorers/categories/people.ts` | **not created, deliberately** — same reasoning as Apps and Products: that directory exists for Movies because Movies owns provider genre seeds. People has no provider, no taxonomy and no seeds, so the equivalent logic is the repository and the projection. |
| `explorers-earth/src/features/People/api/explorersAdapter.ts` | delivered |
| `tunes/server/test/explorers/people.test.ts` | **still missing** — the static SQL-shape proof over `0045`; the storage is covered by the integration suite against real PostgreSQL. |
| `tunes/server/test/explorers/people.integration.test.ts` | delivered (12 cases) |
| `explorers-earth/e2e/replatform/people.spec.ts` | **still missing** — needs a Docker fixture runner and protected-manifest identities, which the plan reserves to the coordinator. |

Delivered beyond the adapter, from the same scope correction the other category tickets carried:

- `tunes/shared/explorersPersonContract.ts` and
  `tunes/migrations/0045_explorers_people_catalog.sql`.
- `personCatalogRepository`, `publicPeopleProjection` wired into the gateway, the People
  vocabulary admitted to the public override allowlist, typed entity resolution in the
  write path, and the owner read. Before this the public People read answered HTTP 200
  with an empty list.
- The live consumer is native: `usePeopleOwner`, `usePeopleCommands` and all four
  dashboard components. The public pages were already native.

### The suppression column

`suppressed_at` is the one addition to the target schema's table, taken as an owner
decision on 2026-10-07. A recommended person has no account and so no route to ask for
their own removal. When it is set the public projection and search omit them and their
recommendations stop publishing, while the owner's own list keeps working.

It is enforced **in the page query**, not as a filter applied afterwards, so a suppressed
person occupies no page count, cursor position or byte budget. Removing that one SQL
clause fails the suite.

`person_entity_details` is insert-only for the runtime, so `suppressed_at` has no
application write path at all: it is an operator action through the migrator role, and
neither an owner's edit nor a compromised runtime can set or clear it.

### Privacy properties worth knowing

- Public **search** indexes only `to_tsvector('simple', title)` — the person's name. The
  descriptive fields are not in the search projection and surface only on a profile the
  owner has published.
- There is no unique handle or name, so people are never auto-merged: two "Alex Lee"
  records are two entities, asserted directly.
- A handle equal to a real account's handle creates no membership, binding or link.
  Asserted directly.
- `usernameHandle` is excluded from the override vocabulary, so one owner cannot re-point
  a shared person at someone else's handle. The entity details being insert-only is what
  makes "A's person data edit cannot change B's recommendation" true by construction.

### One field was narrowed, deliberately

The Strapi form had separate **"Headline / Role"** and **"Bio / Description"** inputs and
sent both. The target schema's `person_entity_details` has only `headline`, and
`RecommendedPerson` already declares `bio` as a compatibility alias of it. The native page
therefore keeps one headline input and `bio` reads from it.

That is a real narrowing of what an owner can record, not a mapping detail. If the product
wants a long description separate from a one-line role, it needs a column and belongs in
its own ticket.

### Strapi-era behaviour removed rather than ported

- `AddPersonPage` posted to `/api/people/scrape-profile`. The server has no such route and
  `music-security-containment.test.ts` asserts the path stays absent, so the step called a
  dead endpoint and discarded the draft when it failed. With no enrichment left there is
  nothing to fail, which is the strongest reading of "enrichment failure must not erase a
  manual draft". `profile-scrape.integration.test.tsx` is replaced by
  `manualPersonFlow.test.tsx`.
- Scraped screenshots of a third party's profile: imagery is owner media now.
- The category selector read a Strapi taxonomy with no canonical replacement.

`PersonListView` gained a per-recommendation publication control, as the other categories
have, and its Top Picks heading edit is mapped onto the canonical collection heading.
`PersonTopPicksManager` writes the whole pin set in one command.

### Remaining obligations

- [ ] `people.test.ts` and the replatform `people.spec.ts` lane, as above.
- [ ] `explorers-earth/e2e/people.spec.ts` still expects the scraper steps. It runs only
  in the nightly `frontend-e2e-qualification` workflow, which was already failing on
  `main` before this work. Owed by 4.5 regardless.
- [ ] **UAT** at the ticket's own list (create/edit manually, external profiles, sector
  browse, custom order and top picks, private/public views) is unrun.
- [ ] The **sector browse** route (`PublicPersonSector`) reads a taxonomy that has no
  canonical source; the projection serves `person_category` as null, so sector browse has
  nothing to group by. That is taxonomy work, not People storage, and it is the one
  behaviour contract item this package does not satisfy.
- [ ] Nothing exposes suppression yet: there is no operator surface for setting
  `suppressed_at`. Today it is a column an operator sets with SQL. If that should be a
  route or an admin action, it needs its own ticket.
