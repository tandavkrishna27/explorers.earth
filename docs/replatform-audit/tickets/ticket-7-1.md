# Ticket 7.1: Public navigation and profile parity

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-07.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial / full parity waiting. **Technical inputs:** 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.3. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package N-shared review proceeds now using existing producer contracts; N-full requires all nine categories, privacy/public media, pins and cold-entry positives. Full-ticket dependencies do not block the shared slice.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epics 4–6; all nine categories have real persisted fixtures.

**Existing:** `explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts`, `usePublicProfileShell.ts`, `usePublicRecommendationCategory.ts`, `usePublicProfileDetail.ts`, `usePublicPagedResource.ts`, `publicProfilePagination.ts`, `publicProfileInvalidation.ts`; `explorers-earth/src/routes/PublicRoutes.tsx`; `tunes/server/publicProfile/publicProfileService.ts`, `publicProfileContract.ts`, `publicProfilePolicy.ts`; `tunes/server/routes/explorersPublicProfileRoutes.ts`.

**Create:** `tunes/server/test/explorers/publicVisibility.integration.test.ts`; `explorers-earth/e2e/replatform/public-parity.spec.ts`. Modify existing gateway backend implementation to use shared operations while retaining public route/response compatibility.

**Behavior contract:** Default profile visibility stays public; category flags stay off until enabled. Keep pinned navigation, auto-pinning, top picks, category themes, canonical handles/slugs, deep links and desktop/mobile shells. Every page and nested result applies visibility; unpublished data must not survive in cached responses after a revision change.

- [ ] Seed more than 24 nested items and more than one category/list page; assert complete traversal without duplicates or omissions, including guide sections.
- [ ] Add a table-driven public matrix for profile/category/list/item visibility, owner/other-owner/anonymous modes and Music public/unlisted/revoked semantics from Epic 6.
- [ ] Test ETag invalidation, client cache reuse after logout/account change, same slug under two accounts, reserved handle protection and canonical URL resolution.
- [ ] Run `npm --prefix explorers-earth run test:unit -- src/features/PublicHome`; `npm --prefix tunes run test -- server/test/publicProfile`; `npm --prefix tunes run test:integration -- server/test/explorers/publicVisibility.integration.test.ts`.
- [ ] Run existing public-shell/category-navigation suites using their existing dedicated configs and new `replatform/public-parity.spec.ts`. UAT navigates every category on desktop/mobile, including keyboard/focus and long-name overflow cases; compare to Epic 1 baseline screenshots without blanket snapshot replacement.
- [ ] Include `explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts` in modified files: admit only the controlled same-origin media-content route alongside explicitly retained approved provider imagery; do not introduce a generic URL proxy. Test allowed uploaded image/video rendering, arbitrary remote URL rejection and retained video Range delivery through the media owner's contract.
- [ ] In `publicVisibility.integration.test.ts`, create 53 items with duplicate order values and assert cursor traversal returns exactly 53 unique IDs in deterministic order; change account/category visibility between pages and assert the continuation cannot disclose now-hidden rows. Revalidate a cached ETag after unpublish and assert response is denial/new safe state, never 304 carrying old private data.
- [ ] Pin route checks: `/:username`, all nine category routes, list slugs, genre/subject/sector routes, guide detail and Music shared capability route. Same list slug on two accounts resolves to its own owner; missing/private/archived detail has the same public unavailable response. Upload URL bytes fetched after hiding the only public attachment must be denied independently of the page cache.

**Acceptance gate:** complete traversal, nested policies, cached fetches and actual media bytes obey the same publication boundary. Owner preview visibility is not evidence of anonymous publication.

**Public-shell compatibility additions (source review):** include `routes/validators/TabVisibilityGuard.tsx`, `UsernameRootRedirect.tsx`, `layouts/PublicColdEntryBoundary.tsx`, `layouts/publicShellReadiness.ts`, `features/music/PublicMusicAvailabilityProvider.tsx`, and `features/PublicHome/api/publicProfileInvalidation.ts` in 7.1 scope.

- [ ] Map canonical boolean category settings into the existing compatibility `Yes`/`No` flags where retained guards consume them; test every flag including `public_movie` alias. Do not pass booleans into a guard that treats unknown values as hidden. Keep the profile-root fallback separate to prevent redirect loops.
- [ ] Test public cold entry on nested routes, invalid username, terminal API failure, rapid username A→B navigation and back/forward. A late A response must not reveal A content in B's shell; every terminal state releases the loading overlay.
- [ ] Preserve the existing account-scoped publish/unpublish/content invalidation transport across tabs. After confirmed unpublish, direct-category access remains hidden while refresh fails or returns stale data. Deduplicate repeated events; wrong-account events do not invalidate another profile. Preserve supported attribution query parameters through fallback redirects.


## Shared slice versus all-category parity (2026-10-05)

The shared canonical navigation/settings repair was advanced as an explicit prerequisite slice. All-nine stored preference mapping and safe hide/unpin are separate from publication/pin eligibility: only complete native Books/Movies/Games content is currently supported, Music uses its own reviewed transactional contract, and the five remaining category positives stay required. Category writers hand off complete typed query contracts to the controller before extending shared eligibility/public registration. Full7.1 remains dependent on all category/Music producer and active-consumer closure; exact schema enums or contained fixtures do not satisfy that gate.

## Independent review verification (2026-10-05)

Measured against source at `225d83e5`. **BOUNDED-SLICE (uncommitted)** — the shared canonical navigation slice exists **only in the uncommitted working-tree overlay**, and that overlay was reviewed **REVISE**. It is not delivered scope and must not be recorded as one.

### The overlay converts a shared fixture out from under two unmigrated importers

`explorers-earth/e2e/setup/category-navigation.ts:407` (modified, uncommitted) now throws `legacy navigation GraphQL denied` for `SettingsAccount`, `PublicCategoryListCounts`, `CheckPublishedLists` and `UpdateTabVisibility`. Two importers of that shared fixture are **unmodified** and still assert exactly those operations:

- `explorers-earth/e2e/category-navigation-a.spec.ts:478` — `expect(state.writes.at(-1)?.variables.data).toEqual(...)`
- `explorers-earth/e2e/music-publish-controls.spec.ts:85,139,149,265,320,427` — asserts and faults on `UpdateTabVisibility`

Category A and Publishing are two of the three lanes this slice targets, so the overlay converts them to a *new* failure mode without migration.

- [ ] Migrate both specs in the **same commit** as the fixture throw, or gate the throw per-spec. Do not land the fixture conversion alone.
- [ ] Translate every assertion the specs carry; do not delete a negative assertion to make the new fixture pass.

### P0 seam: a canonical account UUID is passed as a legacy Strapi *user* subject

This is the first failure of all three red Explorers lanes, and it is a committed defect, not an overlay one:

- `explorers-earth/src/store/store.ts:76-77` sets `accountId: account.id` and `user: { id: account.userId, documentId: account.id, ... }` — the canonical account UUID lands in `user.documentId`.
- `explorers-earth/src/features/navigation/categoryNavigationApi.ts:7-9` (committed) feeds that `documentId` into `usersPermissionsUser(documentId: $documentId)`.
- `categoryNavigationApi.ts:86` (committed) feeds `origin.accountDocumentId` into `updateTabVisibilityMutation` as `documentId:`, i.e. `updateAccount(documentId:)`.

Two identifier spaces are conflated — a canonical account UUID used as a legacy Strapi user/account subject — against a backend that mounts no GraphQL. Category navigation and Settings publishing fail closed for every user, and fail permanently after Strapi retirement. Note this is the **subject** conflation, distinct from (and not refuted by) the separately verified finding that no canonical UUID is used as a *bearer*; both statements are true.

- [ ] Convert to canonical transport and rename `documentId`→`accountId` in the store shape so the type system rejects the conflation. The overlay has begun this but still retains the legacy query document.
- [ ] A canonical UUID appearing as a legacy subject or bearer is a stop condition for dependent work.

### The public gateway covers 3 of 9 categories and returns empty success for the rest

`tunes/server/publicProfile/postgresPublicProfileGateway.ts:58` dispatches only `games`, `movies` and `books`; every other category falls through to `{ items: [], nextCursor: null }` — places, guides, music, apps, products and people. `:61` (`resolveDetail`) likewise returns `undefined` for them.

So an all-category pass of `:44`'s nine category routes would read "category empty", not "unimplemented", masking the gate. This is the exact failure mode `:46` and the Epic 5 review focus ("an empty dataset hides missing seeds or truncation") exist to prevent.

- [x] **Re-measured and closed 2026-10-08, with the remedy adapted because the finding moved.** The gateway now dispatches **eight** categories, not three (`games`, `movies`, `books`, `apps`, `products`, `people`, `places`, `guides`), and **there is no ninth public category to error on**: `publicProfilePolicy.ts:1-3` declares exactly those eight and `publicProfileContract.ts:6` validates with `z.enum(PUBLIC_RECOMMENDATION_CATEGORIES)`, so `music` is rejected by the parser and the route answers **400 BAD_REQUEST**, never an empty success. The gateway's empty fall-through is unreachable through the route, so an explicit per-category error would be unreachable code.
- [x] **Asserted, against the inverted risk.** The danger is no longer "a category with no producer answers empty" but "a category is added to the enum before its producer lands", which would route into that same fall-through and reintroduce the identical masking. `tunes/server/test/contracts/public-category-coverage.test.ts` is **driven by the enum** rather than a hand-written list, so it cannot go stale: every declared category must reach a real projection on both the category and detail reads (statements recorded through `query` *and* `connect`, since some projections check out a client for a `REPEATABLE READ READ ONLY` transaction), a category with no producer must be rejected by the contract, and the enum itself is pinned. Two mutations confirm it: adding `music` without a producer fails all four cases; removing the `apps` dispatch fails the coverage case. Placed in `contracts/` rather than the absent `publicVisibility.integration.test.ts` because it needs no database. See [public parity state](../public-parity-7-1-state.md).

### The media boundary still admits arbitrary Strapi and S3 hosts

`explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts:35-38` defines `isAmazonS3Host` matching any `*.amazonaws.com` S3 pattern, and `:59` returns the URL when `parsed.origin === publicStrapiOrigin() || isAmazonS3Host(parsed.hostname)`. The `:42` obligation above — "admit only the controlled same-origin media-content route alongside explicitly retained approved provider imagery; do not introduce a generic URL proxy" — is therefore unmet. **Hiding an attachment does not deny its bytes**, which is exactly what `:44` requires ("Upload URL bytes fetched after hiding the only public attachment must be denied independently of the page cache").

### Dependency correction

`:13` lists 6.3 among this ticket's technical inputs. For the **shared slice** that is a phantom dependency: the navigation slice runs with no Music producer. Full 7.1 parity does consume Music public/unlisted/revoked semantics per `:38`, so the 6.3 edge stays for N-full and is dropped only for N-shared.
