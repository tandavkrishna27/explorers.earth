# Ticket 3.3: Books end to end

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-03.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve canonical Books 20; reconcile outstanding original requirements and external obligations without rebuilding owner/public slice.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 3.1/3.2/2.4. **Create:** `explorers-earth/src/features/Books/api/booksClient.ts`, `explorers-earth/src/features/Books/api/booksViewModel.ts`, `explorers-earth/src/features/Books/api/__tests__/booksClient.test.ts`, `explorers-earth/e2e/replatform/books.spec.ts`.

**Modify:** `explorers-earth/src/features/Books/components/dashboard/AddBookPage.tsx`, `BooksHome.tsx`, `BookListView.tsx`, `TopReadsManager.tsx` in that same dashboard directory; `explorers-earth/src/features/Books/components/public/PublicBooks.tsx`, `PublicBookList.tsx`, `PublicBookSubject.tsx`; current Books `api/query.ts`, `api/mutation.ts`, `types/index.ts`; `tunes/server/publicProfile/publicProfileService.ts` and its repository adapter.

- [ ] Add failing client/view-model tests proving every field in current `BookList`/`RecommendedBook` types survives round-trip, including lower-case list visibility, rich note, 1–10 rating, buy links, media, top reads heading and pin/order.
- [ ] Adapt existing components behind typed API calls; retain current forms, routes, empty/error states and sort behavior. Migrate public category reads through the existing public gateway seam, not direct privileged owner endpoints.
- [ ] Add E2E fixtures for owner A/B and anonymous sessions: create list, lookup/add book, edit note/rating/media, reorder/pin, hide/reveal, delete, reload, subject navigation and public detail. Assert another owner cannot mutate by changing request IDs and anonymous cannot fetch hidden items directly.
- [ ] Run client tests, existing Books helper/list-navigation/toggle/publish tests and real local browser spec desktop/mobile. Commit. **Done:** no Books flow requires Strapi; seed + Google + profile + Books demo is reproducible.

## Independent review correction (2026-10-05)

**The Books slice is a genuine bounded slice — the identity count verifies exactly, with no overlay inflation.** Recounted from source at `225d83e5`:

- `explorers-earth/e2e/replatform/books.spec.ts` declares **10** `test(` cases (`:47`, `:73`, `:84`, `:95`, `:123`, `:144`, `:151`, `:159`, `:167`, `:173`).
- `explorers-earth/e2e/replatform/books.playwright.config.ts:3` declares **2** projects, `books-desktop` and `books-mobile`, with `retries:0`.
- 10 × 2 = **20 identities**, which matches the `books` lane in the **committed** `explorers-earth/e2e/replatform/suite-manifest.json` (20 identities) and the `books:{count:20}` entry in `scripts/replatform-e2e.mjs:11`.
- Both the spec and its config are **committed and clean** (`git status --porcelain` returns nothing for either), so this count is `dirty:false` — unlike the lifecycle and navigation receipts, it is not overlay scope.
- Neither file contains `test.skip`, `describe.skip`, `.todo` or `test.fixme`; the 20 are real executed identities, not placeholders.

**Still unproven, and therefore still required:** the `**Done:**` clause at `:36` — "no Books flow requires Strapi" — is **not attested at an exact SHA**. The real-backend Books spec runs against a **local owned fixture only**: `books.playwright.config.ts:2` hard-requires `BOOKS_E2E_FIXTURE_PATH` and a `http://127.0.0.1:` base URL, and the lane appears in no workflow, so it has never been re-attested hosted at a named commit. `books.spec.ts:21` does install a request monitor that treats `localhost:1337`, `https://legacy-rest.invalid` and the named legacy GraphQL operations as forbidden — that is real evidence of a *fixture-local* Strapi-free run, and it is not evidence of an exact-SHA hosted one.

- [ ] Re-attest the Books lane at an exact committed SHA before any claim that no Books flow requires Strapi. A local fixture pass is not that attestation.

  **The static half is discharged 2026-10-09** by
  `explorers-earth/src/features/Books/__tests__/booksStrapiBoundary.test.ts`, which walks
  the import graph from `features/Books/index.ts` and asserts the closure executes no
  GraphQL operation, holds no `gql` document, imports no Apollo, reads neither
  `VITE_REST_API_URL` nor `VITE_API_URL`, and contains no Strapi REST shape. It runs on
  every commit, so it is exact-SHA by construction, and it cannot go stale as the feature
  grows the way a hand-listed file set does.

  **This does not satisfy the obligation above**, and the test says so in its own header.
  A closure walk proves no source path *can* reach Strapi; it proves nothing about a
  hosted runtime, which is what a re-attestation is. What remains is narrower than it
  was: the runtime half only.

  One residue recorded rather than hidden: the closure still contains the erased
  TypeScript interface `StrapiMedia` in two type files. A type cannot reach a server, so
  it is 8.3's rename, and the test pins it to those two files by name.
