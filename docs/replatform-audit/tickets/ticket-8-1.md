# Ticket 8.1: Remove remaining Strapi coupling

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-08.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 7.3. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Retire Strapi only after full retained parity and separate release decision; verify zero active consumers before deleting compatibility files.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** Milestone 2 technical acceptance; Epics 2–7 have replaced retained paths.

**Files:** use `docs/replatform-audit/source-inventory.json` and `inventory.cjs` to enumerate exact removals; expected affected areas include the Apollo/`gql` and Strapi-REST consumers under `explorers-earth/src/features/`, `src/components/`, `src/services/` and `src/store/` (`explorers-earth/src/graphql/` **does not exist** and was removed from this list on 2026-10-05 — see the correction section below for the measured denominator), `src/lib/localTunesApiClient.ts`, auth stores/coordinators, public-profile adapters, `tunes/server/services/{strapiIdentityGateway,strapiIdentityAbsenceProof}.ts`, gateway adapters, reconciliation workers, fixtures, `.github/workflows/music-reconcile.yml`, `.env.example` files, proxy and SEO generation configuration. Actual consumed paths govern removal, not directory-name matching alone. Add `scripts/check-retired-dependencies.mjs` and `explorers-earth/e2e/replatform/no-strapi.spec.ts`.

**Interface produced:** zero retained application flows requiring Strapi; static check has a narrow allowlist for historical docs/migration provenance only. No Strapi credential/proof env is required for canonical startup.

- [ ] Regenerate inventory; map each occurrence to replacement, historical evidence or justified non-Strapi GraphQL use. Do not delete all GraphQL dependencies blindly.
- [ ] Add browser network assertions that fail retained flow scenarios on Strapi origins or legacy proof routes; test shutdown of canonical account does not call absence polling.
- [ ] Remove replaced runtime modules and configuration in small commits, along with source-dependent reconciliation jobs. Preserve tombstone endpoint behavior where needed to avoid accidentally reopening retired routes.
- [ ] Run new scan, canonical full-stack acceptance and relevant lifecycle/authorization suites. Boot without Strapi variables and with outbound Strapi access denied.
- [ ] Commit and refresh replacement coverage map. **Gate:** both static and runtime evidence; an unused text match is not a runtime dependency, and a successful page load is not proof all writes are detached.


## Independent review correction (2026-10-05)

**Verdict: NOT-STARTED.** Nothing in this ticket's scope has been retired. All requirements and gates above are retained unchanged; this section corrects the ticket's description of its own surface and splits it into two independently reviewable subpackages.

### Strapi is load-bearing, not residual

The ticket as authored reads as a residual-coupling cleanup over roughly ten named areas. Measured against current source, Strapi is still a required runtime dependency of the canonical server, of the deployed compose graph and of the Explorers frontend:

- **Server construction, not a dormant adapter.** `tunes/server/routes/index.ts:84` constructs `StrapiIdentityGateway`; `:178` constructs `StrapiPublicProfileGateway`; `:79` reads `process.env.STRAPI_URL`. `tunes/server/app.ts:13` imports and `:178` constructs `StrapiIdentityAbsenceProof`.
- **Compose makes Strapi credentials hard-required.** `docker-compose.yml:19,21,24,25,27` declare `STRAPI_URL`, `MUSIC_STRAPI_ALLOWED_ORIGINS`, `STRAPI_ACCESS_TOKEN`, `STRAPI_ANALYTICS_ACCESS_TOKEN` and `STRAPI_JWT_SECRET` with the `${VAR:?… is required}` form, so startup fails closed without them. `docker-compose.replatform.yml:31` still defines a live `strapi` service. The "No Strapi credential/proof env is required for canonical startup" interface above is therefore currently false, and is a requirement to deliver rather than a description.
- **The frontend still calls Strapi REST directly, not only through GraphQL.** `explorers-earth/src/components/ProfileSetupAccordion.tsx:67` and `:71`, and `explorers-earth/src/features/AppsAndTools/utils/appHelpers.ts:175`, each default the backend origin to `http://localhost:1337`. `explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts:293` POSTs to `/recommended-places` and `:334` to `/upload`. A GraphQL-only retirement does not reach these.
- **Dependencies are live in both packages.** `tunes/package.json:47` (`@apollo/client`) and `:102` (`graphql`); `explorers-earth/package.json:40` (`@apollo/client`) and `:62` (`graphql`).

### Acceptance denominator

The retirement surface, counted over runtime modules and excluding tests, is approximately **46 modules under `tunes/server`** and approximately **173 modules under `explorers-earth/src`** — of which about **93** use Apollo hooks or `gql` and about **54** name Strapi — plus `tunes/shared/schema.ts`, `scripts/replatform-local.ts`, `scripts/replatform-route-parity.ts`, the JSON baselines under `scripts/browser-baselines/`, `.github/workflows/music-reconcile.yml`, `.github/workflows/tunes.yml:103` (`STRAPI_ANALYTICS_ACCESS_TOKEN`) and all three compose files (`docker-compose.yml`, `docker-compose.replatform.yml`, `deploy/platform.compose.yml`).

These module counts are the **acceptance denominator**: a retirement claim must state how many of them were retired, replaced or justified as historical, out of a count regenerated at the acceptance SHA. Do not treat the figures above as a frozen target — regenerate the inventory with `docs/replatform-audit/inventory.cjs` into `docs/replatform-audit/source-inventory.json` (both present) and cite the regenerated count. An approximate prose count is not a receipt.

### Named deliverables do not exist yet

Verified absent at the review SHA: `scripts/check-retired-dependencies.mjs` and `explorers-earth/e2e/replatform/no-strapi.spec.ts`. Both are to-create; neither has ever executed, so no static-scan or browser-assertion evidence exists for this ticket.

### Ticket split — 8.1a and 8.1b

This ticket is oversized for a single reviewable package. It is split into two subpackages **under the same ticket number**; no new top-level ticket is created, and ownership of every requirement above is unchanged.

**8.1a — server, compose and workflow retirement.** `tunes/server` Strapi gateways and absence proof, the `STRAPI_*` requirements in all three compose files, `tunes.yml:103`, `.env.example` files, reconciliation workers and `music-reconcile.yml`, plus `scripts/check-retired-dependencies.mjs`. Exit requires canonical startup with no `STRAPI_*` variable set and with outbound Strapi access denied.

**8.1b — frontend Apollo and Strapi-REST retirement.** The approximately 173 runtime modules under `explorers-earth/src`, the four direct REST call sites named above, the `@apollo/client`/`graphql` dependencies in `explorers-earth/package.json`, and `explorers-earth/e2e/replatform/no-strapi.spec.ts`. Exit requires browser network assertions that fail on any Strapi origin or legacy proof route.

- [ ] 8.1a: record the regenerated runtime-module count for `tunes/server` at the acceptance SHA, and the retired/replaced/justified disposition of each.
- [ ] 8.1b: record the same for `explorers-earth/src`, separating Apollo-hook consumers from direct Strapi-REST call sites.
- [ ] Neither subpackage may be accepted on the other's evidence. Both are required for ticket closure; 8.1a passing alone does not close 8.1.

### Scheduled production reach — disable before deleting

`.github/workflows/music-reconcile.yml:4-5` runs an **hourly schedule**, `cron: "17 * * * *"`, which reaches production Strapi read-only with apply disabled. Deleting the workflow file is not the first action: the schedule must be disabled and that disablement recorded **before** the file is removed, so the job cannot fire against a half-retired backend during the removal window. Note separately that `music-reconcile.yml:184-191` carries the `staging-apply` job whose environment gate is addressed in the 8.4 correction; the environment itself is an operations action, not a workflow edit owned here.
