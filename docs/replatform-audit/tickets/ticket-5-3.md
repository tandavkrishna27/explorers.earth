# Ticket 5.3: Guides and sections

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-05.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 3.1, 3.2, 5.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Prepare section field map now; implement versioned Guide aggregate and atomic order/archive/media race behavior after Places contract.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 3.1/3.2 and 5.1; implements the guide section contract in the shared interface table.

**Existing:** `explorers-earth/src/features/Guides/api/queries.ts`, `api/mutations.ts`, `guideService.ts`, `types/index.ts`, `types/guideSectionTypes.ts`, `components/CreateGuidePage.tsx`, `GuideSectionForm.tsx`, `pages/GuideDetailsPage.tsx`, `GuideSectionFormPage.tsx`; `explorers-earth/src/features/PublicHome/components/PublicGuideDetailPage.tsx`.

**Create:** `tunes/server/explorers/categories/guides.ts`; `explorers-earth/src/features/Guides/api/explorersAdapter.ts`; `tunes/server/test/explorers/guides.test.ts`, `guides.integration.test.ts`; `explorers-earth/e2e/replatform/guides.spec.ts`.

**Behavior contract:** Guides are account-owned collections with ordered sections, not flattened ordinary item rows. Preserve guide type, multi-city flag, days, tags/tips, best time, media, budget/type and location/transport data. Sections preserve title/description/order, activities, map data, packing/pre-tasks, tags, timeline, transport, stay and budget. Version the block schema. Preserve morning/afternoon/evening places, travel modes and photo metadata from current TypeScript types.

- [ ] Add a deep round-trip fixture containing every consumed guide/section field and non-ASCII rich text; assert editing one section leaves all other blocks unchanged.
- [ ] Test atomic reorder, stale revision conflict, wrong-guide section ID, rejected invalid block version, and public pagination beyond initial section previews.
- [ ] Replace Strapi numeric upload IDs and bearer-token media calls in `guideService.ts` with Epic 3 media contracts. Upload replacement must succeed and link before retiring the old asset; simulate upload failure and assert the original remains visible.
- [ ] Implement adapters and retain the existing wizard/details/itinerary components. Do not turn unavailable AI services into an unplanned integration rebuild; distinguish any baseline broken assistive action from required manual guide creation.
- [ ] Run frontend units filtered to `src/features/Guides src/features/PublicHome`; backend commands with `guides`; run existing/new `guides.spec.ts` under their respective configs.
- [ ] UAT: create multi-day and multi-city guides, add/edit/reorder sections, exercise timeline/stay/transport/budget/tips, replace media, reload and compare, then publish/unpublish on desktop/mobile.
- [ ] Modify `explorers-earth/src/features/Guides/GuidesPage.tsx` for parent data/order/pin/archive wiring. Create parent fixture values for every `GuideCollectionDetails` field, save/reload and assert deep equality; after adding a section update only parent title and assert section count/content unchanged. Keep parent metadata through generic collection discriminated inputs.
- [ ] In `guides.integration.test.ts`, create sections S1/S2 at parent revision N, reorder at N and assert one transaction produces [S2,S1] and revision N+1; attempt an old-revision edit and assert 409 with both sections unchanged. Delete S2 and assert it cannot be fetched through owner/public normal views; archive the whole guide and assert all public children disappear while shared place entities remain.
- [ ] Add `api/__tests__/explorersAdapter.test.ts` for current string/object compatibility of `Place_Details`, categories and `Guide_Section_Details`. Do not stringify twice or coerce an invalid existing block to empty success. Replace an image with forced storage failure and assert the prior asset ID and served bytes still match; then retry successfully and verify new bytes after reload.

**Acceptance gate:** both parent and section payloads survive unchanged, each deletion scope is covered, and rich content cannot smuggle executable HTML through the public renderer. Add a malicious link/HTML fixture to the existing safe-rich-text test rather than introducing a different editor.

**Inline guide editor closure (5.3):** include `Guides/components/GuideDetails/EditStayModal.tsx`, `EditTipModal.tsx`, `BudgetTable.tsx`, `GuideHeader.tsx`, `EditJourneyRouteModal.tsx`, `TransportationTimeline.tsx`, `EditGeneralTipsModal.tsx`, and `TipsTagsTab.tsx` plus parent mutation callbacks. Read exact cases in the feature gap review.

- [ ] Map each micro-editor to the current-revision aggregate operation. For full-section replacement, assemble validated complete state; missing partial fields never become null. Test each editor save against the real API and verify untouched blocks remain deep-equal. A stale conflict preserves entered form data and keeps the modal open.
- [ ] Enforce publish-before-pin and atomic unpublish+unpin for Guides and Places collection pins. No inferred15 limit. Test guide type/category/days/month/budget/location/multicity filter combinations and stable pinned-first results after reload.

## Independent review verification (2026-10-05)

**NOT-STARTED, confirmed by negative evidence** against source at `225d83e5`:

- `tunes/server/explorers/categories/guides.ts` does not exist (`tunes/server/explorers/categories/` holds only `movies.ts`, `movieGenreSeeds.ts`). **True as written, and misleading as a work item — re-measured 2026-10-09:** the Guides module exists at `tunes/server/application/guides.ts` (197 lines). The capability landed in the application layer rather than at the path this ticket named, which is why the sequence records Guides' backend as done while this line reads as an absence. Only the path differs.
- `explorers-earth/src/features/Guides/api/explorersAdapter.ts` does not exist.
- ~~`tunes/server/test/explorers/guides.test.ts`, `guides.integration.test.ts` and `explorers-earth/e2e/replatform/guides.spec.ts` do not exist.~~ **Stale — re-measured 2026-10-09: two of the three exist.** `guides.test.ts` is 254 lines and **29 cases**; `guides.integration.test.ts` is 553 lines and **33 cases**. Only the `e2e/replatform/guides.spec.ts` lane is genuinely absent, and `explorers-earth/e2e/guides.spec.ts` exists outside the replatform manifest — the same distinction 6.3 needed: browser coverage exists, milestone-manifest evidence does not, and the manifest is coordinator-allocated.

  Worth separating from "exists": **`guides.integration.test.ts` was in no workflow at all**, so its 33 cases had never run in CI. `guides.test.ts` is covered from 2026-10-09 by the `contracts` job's `server/test` tree argument, but an integration file is excluded from that config by `vitest.config.ts:24` and must be named on the `database` job instead.
- No Guide or guide-section aggregate exists anywhere in `tunes/shared`.

### Guides is schema-unreachable, not merely unimplemented

This is a structural correction, and it adds an obligation this ticket did not previously carry.

`tunes/migrations/0029_explorers_recommendations.sql:25` admits `'guides'` in the `collections.category` CHECK constraint. But `0029:40` (`recommendations.category`) and `0029:51` (`collection_items.category`) **omit** `'guides'`:

- `:25` — `CHECK(category IN ('places','guides','movies','books','games','apps','products','people'))`
- `:40` — `CHECK(category IN ('places','movies','books','games','apps','products','people'))`
- `:51` — `CHECK(category IN ('places','movies','books','games','apps','products','people'))`

A guides recommendation row, and any guides `collection_items` row, is therefore **rejected by the database**. Code alone cannot deliver this ticket.

Any reasoning of the form "the `guides` enum is present, therefore the category is covered" was **wrong**: it read `0029:25` and not `0029:40`/`0029:51`. Note that `0022:123`, `0031:12`, `0036:8` and `0037:19,35` do admit `'guides'`, which makes the `0029` omission easy to miss by grep.

- [ ] Author a **new** append-only migration — next available id is `0039`, the chain head being `tunes/migrations/0038_explorers_movie_media.sql` — adding `'guides'` to the `recommendations.category` and `collection_items.category` CHECK constraints. Do not edit `0029`; the chain is append-only and checksummed.
- [ ] Update the expected chain, manifest, checksum and catalog/role tests in the same change, per the Epic 6 migration rule.
- [ ] Add a migration test asserting a guides recommendation and a guides `collection_items` row now persist, and that the other category constraints are unchanged. Do not widen either CHECK to accept arbitrary text as a shortcut.
