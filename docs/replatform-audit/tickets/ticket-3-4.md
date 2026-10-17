# Ticket 3.4: Analytics foundation

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-03.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 3.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve event foundation; the "canonical 10" is **authored, unattested** — see the 2026-10-05 correction below before quoting it. Inventory unexecuted consent/privacy/consumer obligations. Dashboard UI belongs to 7.2.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 3.1 public policy. **Create:** `tunes/server/repositories/explorersAnalyticsEventRepository.ts`, `tunes/server/application/analytics.ts`, `tunes/server/test/explorers-analytics-events.integration.test.ts` and an append-only migration for payload events/receipt linkage.

**Modify:** `tunes/server/services/explorers-analytics-service.ts`, `explorers-analytics-composition.ts`, `explorers-analytics-adapters.ts` in the same services directory; `tunes/server/routes/explorersAnalyticsRoutes.ts`, `explorers-earth/src/services/analyticsService.ts` and its existing tests.

**Contract:** retain current ingestion route and validated input shape; `recordAnalyticsEvent(input,requestContext)` validates consent and target; `getCreatorAnalytics(actor,input: AnalyticsQuery): Promise<AnalyticsSummary>` is the sole owner read service for Epic 7/MCP. `AnalyticsQuery` supplies bounded date range, optional category/resource filters; response is aggregate counts/dimensions matching current dashboard requirements, not raw IPs or secrets.

Define `recordAnalyticsEvent(input:ExplorersAnalyticsInput,context:RequestContext):Promise<{eventId:string;status:'accepted'|'duplicate'}>` in `application/analytics.ts`; preserve route-level legacy response mapping where the current client expects different receipt states. AnalyticsQuery uses inclusive `from`, exclusive `to` instants and a maximum 366-day range; invalid/reversed ranges are 422. Owner account is always Actor-derived. OAuth calls require `analytics:read`. Add UTC day-boundary and duplicate-retry tests so dashboard totals are not changed by transport timezone parsing.

- [ ] Add failing cases for denied consent, duplicate same event, same ID/different payload conflict, private or forged target, receipt retry after crash, and owner analytics isolation.
- [ ] Replace Strapi publisher with a PostgreSQL event/receipt transaction. Existing receipt storage does not hold full event payload; add explicit event rows, minimal permitted attribution fields and retention/deletion behavior. Preserve metadata allowlist, rate limits and public target validation.
- [ ] Wire profile/Books instrumentation and assert consent controls both browser submission and server acceptance. Count observed events only; no inferred ChatGPT impressions.
- [ ] Run analytics service/client tests and new integration tests. Commit. **Done:** repeatable fixture counts stored independently of Strapi and readable only by owning account; Epic 7 completes dashboard/category coverage.

## Independent review correction (2026-10-05)

Disposition stays **INCOMPLETE**, and the browser evidence must be restated.

**The producer chain is real and mounted.** Verified at `225d83e5`:

- Migration `tunes/migrations/0036_explorers_analytics_events.sql` exists in the gap-free `0001`–`0038` chain.
- `tunes/server/repositories/explorersAnalyticsEventRepository.ts:121` implements the bounded owner aggregate (`aggregate(db, accountId, input: AnalyticsQuery): Promise<AnalyticsAggregateRow[]>`).
- `tunes/server/application/analytics.ts` authorizes owner reads with `authorizeOperation(db, actor, 'analytics:read', actor.accountId)` at `:73`, `:78` and `:80`, satisfying the OAuth `analytics:read` requirement stated at `:35` of this ticket.
- `tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts:31` serves `getCreatorAnalytics(actor, request.query)`, and that router **is mounted** — `setupCanonicalAnalyticsRoutes(app,pool,auth)` at `tunes/server/auth/canonicalApp.ts:60` (imported at `:5`).

**The claimed "10 browser cases" are authored with no supported runner, and 0 are attested.** The arithmetic is real but the run is not:

- `explorers-earth/e2e/replatform/analytics.spec.ts` declares **5** `test(` cases (`:22`, `:26`, `:33`, `:37`, `:41`) and `analytics.playwright.config.ts` declares 2 projects, so 5 × 2 = 10 **identities authored**.
- There is **no analytics lane** in `explorers-earth/e2e/replatform/suite-manifest.json`. Its lanes are exactly `auth`, `profile`, `books`, `lifecycle`, `movies`, `games`.
- There is **no analytics lane** in the protected runner either: `scripts/replatform-e2e.mjs:11` defines exactly those same six lanes. The runner validates the manifest and will not discover a lane that is not declared, so the authored spec cannot be executed through the supported path at all.
- **No npm script in any `package.json` invokes `tunes/scripts/analytics-browser-fixture.ts`**, and no workflow references it.
- The only receipt is **prose**: `task3.4-analytics-browser-report.md:9,23`. The run JSON was deleted on exit, and the independent reviewer performed **no execution** of any kind. There is therefore no artifact, no identity list and no pass/fail/skip count behind the "10 cases".

**Restated status: analytics browser acceptance is AUTHORED, UNATTESTED (0 of 10 identities attested).** Any document, ledger row or dispatch card that reads "canonical 10" as delivered evidence is overstating it.

- [ ] **Register an analytics lane** in `explorers-earth/e2e/replatform/suite-manifest.json` **and** in the `lanes` map at `scripts/replatform-e2e.mjs:11`, with its exact identity list, projects and fixture runner, **and** add the npm script that invokes `tunes/scripts/analytics-browser-fixture.ts`. No analytics acceptance claim may be made before that registration exists and the lane has produced a retained receipt.
- [ ] Until then, the consent-denied, duplicate, same-ID/different-payload, forged-target, receipt-retry and owner-isolation cases at `:37` stay open, and the server-side obligations at `:38`–`:39` are unaffected by the authored browser spec.

The 7.2 analytics **dashboard** stays in 7.2. This correction does not move it here, and it does not relieve 7.2 of the dashboard's own defect record.
