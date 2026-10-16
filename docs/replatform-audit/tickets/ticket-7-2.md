# Ticket 7.2: Analytics and platform content

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-07.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** split preparation ready. **Technical inputs:** 3.4, 7.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package A-dashboard can prepare session-authority conversion now; A-reference inventories actual legal/localized inputs independently. A-full category totals waits for producers. Preserve consent/dedupe/UTC bounds.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 3.4 analytics event storage, all categories, Epic 2 settings; implements the reference-content contract in the shared interface table.

**Existing:** `explorers-earth/src/services/analyticsService.ts`, `explorersAnalyticsClient.ts`; `src/features/Analytics/api/queries.ts`, `components/AnalyticsDashboard.tsx`, `utils/analyticsDateRange.ts`; `src/features/LandingPage/api/queries.ts`, `hooks/useFaqs.ts`, `hooks/usePlatformTerms.ts`; `src/features/Settings/api/mutation.ts`, `components/ProfileAccountSettings.tsx`; `tunes/server/routes/explorersAnalyticsRoutes.ts`, `services/explorers-analytics-service.ts`, `services/explorers-analytics-adapters.ts`.

**Create:** `tunes/server/test/explorers/analyticsParity.integration.test.ts`, `referenceContent.test.ts`; `explorers-earth/e2e/replatform/analytics-content.spec.ts`. Extend Epic 1 seed mechanism and Epic 3 analytics store, not another event writer.

**Behavior contract:** Consent denial sends no analytics; owner visits and retry dedupe follow established policy. Counts/date ranges/traffic-source and category breakdowns reflect persisted events; failures never display as successful zero totals. FAQ/terms/category values are seed content, not inferable from schemas. Deletion feedback is an authenticated write from 2.4 and must be covered in settings regression. Preserve current language behavior; no new authoring interface. Remaining settings use canonical account ownership; Google-only auth and deferred billing exclusions remain explicit.

- [ ] Fixture events across date boundaries, categories and two accounts; assert dashboard aggregates equal fixture expectations and never include the other account.
- [ ] Test no consent, duplicate event ID with same/different payload, hidden/invalid target, date-range validation and backend outage states.
- [ ] Inventory retained content/settings calls against the source inventory; add reviewed seeds and wire reads/settings to shared services. Missing real reference values remain a named acceptance blocker, never silently replaced by invented legal copy.
- [ ] Run frontend units filtered to `src/features/Analytics src/services/__tests__/analyticsService src/services/__tests__/explorersAnalyticsClient src/features/Settings`; backend integration command with `analyticsParity.integration.test.ts` and unit command with `referenceContent.test.ts`.
- [ ] Run existing `analytics.spec.ts`, `marketing-pages.spec.ts` with the general config and new `replatform/analytics-content.spec.ts`. UAT toggles consent, generates public interactions, checks dashboard ranges/counts, opens legal/help content and changes retained settings.
- [ ] Create `tunes/server/application/referenceContent.ts`, `tunes/server/routes/explorersReferenceRoutes.ts`, and typed reference-content schema/seed entries using the existing seed mechanism. Modify `explorers-earth/src/pages/Terms.tsx`, `Privacy.tsx`, `Cookies.tsx` only if their existing `usePlatformTerms` output mapping cannot stay unchanged. The hook combines distinct terms/privacy/cookies bodies; it must never return terms as all three documents. FAQ uses question/answer/sequence presentation.
- [ ] In `referenceContent.test.ts`, seed distinct sentinels in each legal body and two locales, assert correct kind and requested locale, explicit seed-manifest fallback for missing locale, and FAQ numeric sequence order. Locale change invalidates the previous content request/cache. Missing required legal copy is a blocked acceptance input, not a fabricated default.
- [ ] In `analyticsParity.integration.test.ts`, seed exactly three accepted A events and two B events in range plus one A event outside range; query A and assert count three, then replay one accepted event and assert count remains three. Denied consent and invalid/private targets add zero rows. Backend error must surface error state, never count zero. Browser acceptance advances through deletion feedback to assert the canonical 2.4 write replaces the old Strapi dependency.

**Acceptance gate:** dashboard numbers reconcile to a known event ledger, privacy/cookies/terms remain distinct, settings use canonical operations and every remaining active reference-content call has an assigned replacement.


## Independent subpackage preparation (2026-10-05)

Dashboard canonical cookie authority and reference-content source/locales inventory can be prepared without waiting for unrelated category implementations. Preserve 3.4 event foundation and a single ingestion writer. Full category breakdown/public behavior remains dependent on landed typed producers. Capture a first actual dashboard request failure before product repair; the source bearer/legacy-query gap is not universal runtime causality. Missing real legal/FAQ/taxonomy rows remain an explicit source input, not invented seed text. Settings edits are serialized after current navigation/lifecycle ownership.

## Independent review verification (2026-10-05)

Measured against source at `225d83e5`. **NOT-STARTED.**

### The dashboard is structurally dead, not merely unmigrated

It cannot fire at all under canonical auth, so there is no "migrate the queries" slice that leaves a working dashboard behind:

- `explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx:38` reads `token` from `useAuthStore()`; `:66-68` issues `query GetAccountId($documentId: ID!) { usersPermissionsUser(documentId: $documentId) ... }`; `:85` reads `accountData?.usersPermissionsUser?.accounts`.
- `:211` gates on `!token` and `:232` sends `token`.
- `explorers-earth/src/services/explorersAnalyticsClient.ts:176` throws `'Analytics dashboard authentication is required'` when `!scope.token`, and `:197` sends `Authorization: Bearer ${scope.token}`.
- Canonical auth sets `token: null` on every verification (`explorers-earth/src/store/store.ts:76`).

So the blocker is the **frontend consumer**, not the producer: the 3.4 producer input named at `:29` **is landed and mounted** (`tunes/server/routes/explorersAnalyticsRoutes.ts`, `services/explorers-analytics-service.ts`, `services/explorers-analytics-adapters.ts` all exist and are listed at `:31`).

- [ ] Capture the **first actual dashboard request failure** before converting anything, per the `:19` execution gate and the `:51` note above. The source-level bearer/legacy-query gap is strong evidence but is not a substitute for an observed failure; do not convert first and infer the failure afterwards.

### Reference, legal and FAQ content has no canonical destination at all

- `tunes/server/application/referenceContent.ts` does not exist.
- `tunes/server/routes/explorersReferenceRoutes.ts` does not exist.
- No reference-content seeds exist.

So the `:42` obligation is a from-scratch build, not a rewiring. Additionally, legacy `faq` and `platform-term` (terms, privacy, cookies) are **i18n-localized** in the legacy source, and the canonical schema has one `locale` column plus taxonomy translations — there is no canonical per-field locale equivalent. The `:35` instruction "Preserve current language behavior" is an instruction, not an authorization to drop localization.

- [ ] Treat missing real legal copy, FAQ text and localized bodies as a **blocked acceptance input**. `:39` and `:43` already forbid invented legal copy and fabricated defaults; those negatives stay. Record the blocker rather than seeding placeholder text to turn `referenceContent.test.ts` green.
- [ ] Resolve the per-field-locale gap explicitly before implementing `:43`'s two-locale sentinel assertions — "two locales" is not satisfiable until a canonical locale representation exists for these bodies.

### Shared-file collision

`explorers-earth/src/features/Settings/api/mutation.ts` is listed at `:31` and is **double-listed with 2.4**. This is a file duplication, not a requirement duplication, so the ticket split stands — but per `:17` and the `:51` serialization note, the coordinator must serialize it. Do not dispatch a 7.2 Settings writer while 2.4 holds that file.
