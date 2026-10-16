# Ticket 3.1: Shared entities, recommendations and collections

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-03.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 2.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse reviewed core packages; inventory outstanding scale and downstream obligations. Technical producer readiness does not wait for complete 2.4 socket closure.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 2. **Extend:** `tunes/shared/explorersContract.ts` with recommendation/category DTOs and existing `explorers-earth/src/lib/explorersApiClient.ts`. **Modify (file-list relabelled 2026-10-05; see the correction below):** `tunes/server/application/recommendations.ts`, `tunes/server/application/catalog.ts`, `tunes/server/application/discovery.ts`, `tunes/server/repositories/explorersRecommendationRepository.ts`, `tunes/server/routes/explorersRecommendationRoutes.ts`, the next append-only `explorers_recommendations` migration (`tunes/migrations/0029_explorers_recommendations.sql` already landed; later schema changes take the next free identifier), `tunes/server/test/explorers-recommendations.integration.test.ts`.

> **File-label correction (2026-10-05).** Every path in the list above was labelled **Create** when authored and all seven now exist in current source, verified file-by-file at `225d83e5`. A literal "Create" reading invites a writer to overwrite reviewed, route-mounted code, so the label is **Modify**. This relabels the paths only; every implementation and acceptance requirement in this section is unchanged and none of its checkboxes is satisfied by the files' mere existence.

**Modify:** schema exports, migration manifest/readiness/role grants and `tunes/server/routes/index.ts`.

- [ ] Add failing tests: two accounts share one provider entity but independent notes/media/rating; same title/different provider IDs remain distinct; recommendation FK cannot attach another account's collection/media; stale update returns conflict; reorder rejects omitted/duplicate/foreign members and commits atomically; private parent hides all descendants. Delete a collection and an empty guide-kind collection, retry deletion, check foreign-owner denial and confirm public membership disappears while shared entity/other collection data survives. Rich guide-section cascading is tested in 5.3 once its schema exists, not claimed by the earlier empty-guide test.
- [ ] Implement catalog entities/provider identifiers, account-owned recommendations and collections/items, typed category payloads, revision/idempotency records and media references. Unique provider identity includes provider + entity kind + external ID (movie/TV distinct; book edition IDs distinct); no fuzzy automatic dedupe. Guides use their own ordered section operations in Epic 5; Music remains its existing domain, not forced into generic CRUD.
- [ ] Implement named shared operations above, entity resolution in `application/catalog.ts`, public projection and owner HTTP routes: `/entities/resolve`, `/collections`, `/collections/:id`, `/collections/:id/order`, `/recommendations`, `/recommendations/:id`, `/recommendations/search`. Mutations carry expected revision for existing aggregates and Idempotency-Key for retriable creates; bind replay to account/operation/input hash and reject changed payload. Archive retries with the same key return the original success before re-evaluating the now-archived revision; unrelated stale commands remain 409. Declare static `/recommendations/search` before parameterized `/:id` routes to avoid route capture.
- [ ] Generate or export typed DTO consumption without importing server runtime into Vite. Validate limits and opaque cursor/filter binding at the boundary.
- [ ] Run repository/database/API tests including rollback and public pagination beyond first page. Commit. **Done:** contracts stable for Epics 4/5/7/9/10; isolated accounts and no private nested leakage demonstrated.

**Frontend aggregate closure (3.1):** implement category-wide top-pick tables, revision, GET/PUT/PATCH operations and exact save timing specified by [the schema](../target-database-schema.md). List-only reorder is not a substitute. Add cross-list pins, max15 explicit-save, mixed staged membership/autosave, stale revision and foreign membership tests from [feature review](../frontend-feature-gap-review.md). Preserve source save timing through atomic upsert-order rather than silently normalizing it to a different UX.

- [ ] Owner collection/item clients follow bounded sequential continuation until completion for aggregate managers. Test27 lists and53 children with late-page pins; page2 failure must block complete-set writes and show retry state, not return partial success. Cancel reads on account/session generation change.

## Execution grooming update — 2026-10-01

Status: database/repository slice at local commit 9c908c03 independently reviewed PASS; ticket 3.1 remains in progress. PostgreSQL implementer evidence: 81 tests, zero skips. Independent scoped re-review: 77 tests, zero skips, plus allowed detach/change assertions. See .superpowers/sdd/epic-01/task-3-1-report.md and task-3-1-rereview1.md for exact limits.

Preserve actual 0027 command receipts (request_hash, completed/retired, response); do not rename the shared lifecycle contract to match older schema prose. Migration 0030 extends reverse media-purpose validation; future typed attachments must update reverse references, cleanup selection, terminal purge, runtime privileges and restore inventories together. Terminal deletion removes account-owned content while retaining shared catalog facts and account tombstones.

Subsequent reviewed/pushed checkpoints now include owner Actor writes, public core pages, bounded owner v2 pages and memberships, maintained category revision (A), jointly fenced immutable complete observation/client (B/C), and six-category top-pick PUT/PATCH at `a7a63539891c1a5bb32aa99b660fd8866fb35709`. The prior fingerprint/unbounded membership limitations at `db334608` were replaced by A/B/C; they are no longer current-source limitations. Consult the exact checkpoint reviews for executed checks and physical-query qualifications. PUT replaces at most15 selected memberships; PATCH upserts at most15 supplied memberships while preserving omitted saved rows, equal ranks and stored unions above15. No UI adoption or full-ticket acceptance follows from these backend checkpoints.

The accepted read-bounds design now uses account/category prelocks and a maintained revision, shared encrypted snapshot with absolute expiry, separately paged memberships and final server validation. Client bounds are4MiB actual bytes/body,64MiB total,1000 requests and100000 rows/stream; these reject whole reads and are transport safeguards rather than domain caps. Commands compare both expected category and nullable pin revisions under their transaction locks; final read validation is not a write lock. Internal account IDs and frontend completion markers never grant server authority.

## Closure audit update — 2026-10-02 at reviewed/pushed22456f78

Finite shared-contract handoff is ready. Dedicated top-pick GET/observed client (255e0ae5), versioned Quill notes and shared mutation clients (45030f80 with reviewed runtime3db07669), manual title/sparse independent override (eb0810b3/0033), and bounded basic owner/public search/discovery (22456f78) are delivered and independently reviewed. See [closure checklist](../../../.superpowers/sdd/epic-01/task3.1-closure-checklist.md) and [final closure audit](../../../.superpowers/sdd/epic-01/task3.1-final-closure-audit.md).

The completed clean bare backend aggregate reports146files/2573pass/4skip/exit0; production overlays match22456 but later search-page tests were absent and final integration assertions ran separately. Three fixed Windows skips reproduced; fourth identity is not recoverable from the quiet aggregate log yet. Full contained frontend4023 and clean builds passed. This supersedes the earlier stalled/no-aggregate status for local application-source qualification only.

Original rich typed provider/category detail and cover/metadata/context contracts remain delegated3.2/4.x/5.x. ~~Explicit revision-checked identity replacement is absent from updateRecommendationSchema and must be assigned/frozen in that producer preflight; it is not accepted as delivered.~~ **(Historical as of 2026-10-05 — superseded by the independent review correction below. Identity replacement is delivered as its own command, not as a field of the PATCH schema. `updateRecommendationSchema` at `tunes/shared/explorersContract.ts:70-71` does carry `expectedRevision`; what it does not carry is `entityId`, which is correct, because replacement is a separate frozen command at `tunes/shared/explorersBookContract.ts:20`. The 2026-10-02 wording is retained for provenance only and must not be read as a current blocker.)** No provider caller facts/arbitrary JSON/implicit replacement is allowed. Full original contract acceptance remains conditional on these named dependencies.

Manager adoption/retry/save/account sequencing stays3.3/4.x; Places/Guides pins/sections5.x, Music6.x, public/cache/media parity7.1, hosted/browser/milestone3.5/7.3 and advanced creator/overlap/MCP9.x. Existing hosted red/cancelled auth/lifecycle/Music/category gates are retained. Local finite shared handoff does not claim full UI/provider/browser CI or production acceptance.


## Independent review correction (2026-10-05)

**Withdrawn as a producer gap: revision-checked entity replacement IS delivered and route-mounted.** The paragraph previously printed here — "Package CORE-REPLACE explicitly owns the missing revision-checked recommendation entity replacement producer … This operation is not delivered" — was factually false and was introduced by the head commit `225d83e5` (a docs-only commit) itself. It is withdrawn, not softened. A writer dispatched against it would have re-implemented reviewed, route-registered production code, which is the highest-risk class of duplicate work in this plan.

Verified against current source at `225d83e5`:

- **Producer:** `replaceRecommendationEntity` at `tunes/server/repositories/explorersRecommendationRepository.ts:301` — expected-revision lock via `lockRecommendation(db,accountId,id,expectedRevision)`; idempotency through `this.command(accountId,'replaceRecommendationEntity',{id,expectedRevision,entityId},key,…)`; `422` when the entity is unchanged; `404` when the entity or the owning aggregate is unavailable; the category/kind matrix (`places:['place','person']`, `books:['book']`, `movies:['movie']`, `games:['game']`, `apps:['app']`, `products:['product']`, `people:['person']`) with `422` on mismatch; detached-media cleanup for movies; and a `revision=revision+1` bump.
- **Application seam:** `tunes/server/application/recommendations.ts:75-78`.
- **Route, mounted:** `POST /api/explorers/v1/recommendations/:id/entity` at `tunes/server/routes/explorersRecommendationRoutes.ts:89`.
- **Frozen command contract:** `replaceRecommendationEntitySchema` at `tunes/shared/explorersBookContract.ts:20` (`{expectedRevision, entityId}`, `.strict()`).
- **Client:** `explorers-earth/src/lib/explorersApiClient.ts:377-378`, which derives `expectedRevision` from the observed resource revision rather than accepting a caller-authored one.
- **Stale/replay negatives:** `explorers-earth/src/lib/__tests__/bookCatalogClient.test.ts:13-15` (409 on stale observation, exact request body, 409 on replay with a changed payload under a repeated key).
- **Frozen surface inventory:** `tunes/server/test/contracts/runtime-surface-inventory.test.ts:78` (owner-command matrix) and `:96` (method-boundary list).
- **Landed in:** commit `4aa1f67e` ("Implement bounded Books provider and recommendation media producer"), i.e. before the head commit that declared it missing.

**What is actually outstanding on replacement** — these remain open requirements and are not waived by the delivery above:

- [ ] Server negative: a **foreign owner** attempting replacement on another account's recommendation is denied, with the denial asserted at the repository/route level rather than inferred from the client.
- [ ] Server negative: replacement by one creator leaves **another creator's** recommendation of the same entity, and the shared catalog entity itself, **unchanged** (no caller-authored provider facts, no cross-creator mutation).
- [ ] **UI adoption.** `explorersApiClient.replaceRecommendationEntity` has **no non-test caller anywhere in `explorers-earth/src`** — the only references are its own definition at `explorersApiClient.ts:377` plus the contract import at `:19`, and the test file above. The producer is delivered; the consumer is absent. Category preflight must still identify whether a category consumes replacement, because adoption is what is missing, not the operation.

Ordinary manual creation does not wait on any of this. Another agent owns correcting the 11 dependency edges in `execution-packages.json` that still carry the withdrawn blocker; until those are corrected, the edge states for 3.2–3.4, 4.1–4.5, 5.1, 5.3 and 6.1 should be read as stale, never as a reason to re-author the producer.

## Still-open 3.1 obligations (recorded 2026-10-05)

Delivery of the backend core and of entity replacement closes none of the following. Each remains a requirement.

- [ ] **Frontend aggregate closure** (restates `:39`–`:41` above, which are unmet): category-wide top-pick tables with cross-list pins; max-15 **explicit** save; mixed staged membership/autosave; stale-revision and foreign-membership rejection; and bounded sequential continuation in which a **page-2 failure blocks complete-set writes** and surfaces retry state rather than returning partial success. List-only reorder remains not a substitute.
- [ ] **`private_parent_hides_all_descendants`** negative (required by `:33`): a repo-wide search for this behavior by name finds no test in `tunes/server/test` or `explorers-earth/e2e`.
- [ ] **Reorder atomicity** negative (required by `:33`): rejection of omitted/duplicate/foreign members with an atomic commit. `tunes/server/test/explorers-recommendations.integration.test.ts:123` covers atomic swaps versus duplicate final positions; the omitted-member and foreign-member arms are not traceable to a named assertion.

No status in this section is a pass claim. The single correction here is that one specific producer exists; every gate, negative obligation and acceptance requirement in this ticket stands unchanged.
