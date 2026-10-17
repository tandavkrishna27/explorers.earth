# Ticket 3.2: Media and catalog providers

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-03.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 2.3, 3.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse media/catalog contracts; qualify remaining live storage/provider cases separately from delivered Books media.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Grooming focus:** extend the 2.3 media race and cleanup evidence to recommendation attachments and public delivery. Check visibility changes through both object delivery and caches, including concurrent attach/delete and retry after storage or database failure.

**Depends on:** 3.1 and the completed media service from 2.3. **Extend:** `tunes/server/application/media.ts`, `tunes/server/repositories/mediaRepository.ts`, `tunes/server/services/objectStorage.ts`, `tunes/server/routes/explorersMediaRoutes.ts`, `tunes/server/test/explorers-media.integration.test.ts`. **Create:** `tunes/server/services/bookCatalog.ts`, `tunes/server/routes/explorersCatalogRoutes.ts`, `tunes/server/test/book-catalog.test.ts`.

**Modify:** `explorers-earth/src/hooks/useFileUpload.ts`, `explorers-earth/src/features/Profile/components/ImageUpload.tsx`, API package/lockfile only for required verified storage/multipart dependencies. Base media tables already exist from 2.3; any new recommendation attachment/derivative schema gets the next append-only migration. Do not recreate media tables or edit an earlier migration after its ticket checkpoint.

**Contract:** authenticated `POST /media` multipart and `DELETE /media/:id`; `GET /catalog/books?query=...&cursor=...` returns bounded provider candidates with provenance, not saved recommendations. Provider response fields map to `BookEntityDetails` (title/subtitle/authors/year/covers/subjects/publisher/pageCount/providerRating/description/isbn13/previewLink/buyLinks).

- [ ] Add failing tests for spoofed MIME, oversized/truncated upload, wrong-owner attach/delete, profile image replacement, storage timeout and retry cleanup; provider timeout/quota/malformed metadata and safe handling of absent covers/ISBN.
- [ ] Implement MIME sniffing, explicit allowed types/limits from existing UI baseline, environment-separated keys, ownership and ready state. Public delivery checks visibility; no private object is exposed merely because its storage URL is known. Disallow arbitrary remote fetch or constrain it to approved provider origins with redirect/address checks.
- [ ] Implement server-side Google Books lookup with timeouts and bounded caching; provider metadata is not trusted HTML. Seed only reviewed taxonomy rows with deterministic IDs; record missing reference values as acceptance blockers.
- [ ] Run media DB and provider unit tests plus profile/Books upload browser cases. Smoke the real QA storage/provider in 3.5. Commit. **Done:** uploaded data survives reload and invalid/private media does not leak or become orphaned after failed save.

## Independent review correction (2026-10-05)

Disposition stays **partial**. The Books provider and recommendation media routes are mounted, but two mandated frontend modifications in the `**Modify:**` list at `:33` were **not made** and remain open:

- [ ] `explorers-earth/src/hooks/useFileUpload.ts` — still selection-validation only. The file is 141 lines and its own header comment at `:31` reads "Custom hook for file upload validation and handling"; a grep for `/api/explorers` in it returns nothing, so it issues **no canonical upload call**. The `POST /media` multipart contract at `:35` therefore has no frontend producer in this hook.
- [ ] `explorers-earth/src/features/Profile/components/ImageUpload.tsx` — no `/api/explorers` reference either, so profile image replacement is not yet routed through the canonical media boundary.

Live storage and live provider smoke remain **deferred to 3.5** as `:40` already states; that deferral is unchanged and is not an acceptance waiver. Nothing in the delivered Books media slice ticks `:37`–`:40`, and the wrong-owner attach/delete, storage-timeout and retry-cleanup negatives at `:37` stay required.
