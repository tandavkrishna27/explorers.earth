# Ticket 1.2: Reproducible local environment

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-01.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 1.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse accepted runtime; new seeds and migrations belong to the consuming feature. **Open obligation (2026-10-05):** the route-graph invariant is unmet — the parity inventory still probes only six legacy/analytics paths and asserts exactly 6. Extending it to the landed canonical routes is a shared-file change requiring coordinator allocation. See [Independent review correction (2026-10-05)](#independent-review-correction-2026-10-05) below. The recorded acceptance is not reopened.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 1.1 fixture personas and scope; final canonical seeds are extended in Epics 2–3.

**Files:** modify root `package.json`/lockfile, `docker-compose.music-test.yml` only where reusable; create `docker-compose.replatform.yml`, `scripts/replatform-local.ts`, `docs/replatform/local-development.md`, `tunes/server/test/contracts/replatform-local-authority.test.ts`; reuse `tunes/scripts/music-uat-database.ts`, `music-compose-safety.ts`, `server/test/integration-global-setup.ts`. Add domain fixture wiring to the seed owner files defined by Epics 2–3.

**Interface produced (new commands, not existing):** `npm run platform:local -- provision|start|check|stop|reset`; `npm run platform:test:integration`; `npm run platform:seed -- --dataset acceptance`. The wrapper records a disposable compose project/database authority and supplies attested environment to existing test processes without printing secrets. Reset accepts only that exact local authority. `start` launches API and existing Explorers Vite app; identity is fixture-only until Epic 2.

**Route-graph invariant:** reuse the Music harness's database authority protections, not its restricted local route composition. The current Music local profile omits optional native auth/analytics/reactivation integrations. The new platform fixture runtime must mount the same canonical application route graph as the replacement production runtime, with external providers injected as fixtures. Add `tunes/server/test/contracts/platform-route-parity.test.ts` and run it before real-API E2E; assert auth, profiles, content, analytics, lifecycle and Music routes are present as their owning epics land. Production must reject fixture session authority even though the route graph is equivalent.

- [ ] Add failing authority tests: reject production-style hostname, unrecognized database, mismatched compose project, missing attestation and simultaneous test authorities; accept only provisioned local target. Assert reset refuses all other targets before connection or deletion.
- [ ] Run `npm test --prefix tunes -- --run server/test/contracts/replatform-local-authority.test.ts`; verify specific authority assertions fail before implementing wrapper.
- [ ] Implement wrapper using process argument arrays and hidden Windows child processes. Preserve existing PG15 test authority and isolated DB-per-test semantics; do not weaken integration-global-setup guards. Never recycle protected PowerShell variables.
- [ ] Provision loopback-only database and nonproduction storage adapter. Add deterministic seeds with stable identifiers and idempotent upserts supplied by domain tickets. Keep provider fixture responses out of production paths; real-provider runs use a separately selected nonproduction configuration.
- [ ] Run `npm run platform:local -- provision`, `npm run platform:local -- check`, `npm run platform:seed -- --dataset acceptance` twice. Compare row counts and stable relationships. Run `npm run platform:test:integration`; prove wrong-target rejection with the authority tests, not by attempting to connect to a real production URL.
- [ ] Extend `explorers-earth/e2e/setup/deny-hosted-egress.ts` to the new fixture host allowlist and retain the unit-test containment runner. Confirm fixture provider attempts fail closed.
- [ ] Document prerequisites, ports, stop/reset behavior and OS differences; commit. **Gate:** clean local startup and deterministic seeds work with no production credential/data requirement. Seed evolution is included in every following functional ticket.

## Independent review correction (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 1.2 and §7 Epic 01. The review re-executed this ticket's recorded acceptance locally and confirmed it. **That acceptance is not reopened.** What follows is an additional open obligation and a factual correction to the harness contract, both of which the recorded acceptance did not close.

### Open obligation: the route-graph invariant is unmet

The **Route-graph invariant** above (restated at `docs/replatform-audit/epics/epic-01.md:106`) requires the platform fixture runtime to mount the same canonical application route graph as the replacement production runtime, asserting "auth, profiles, content, analytics, lifecycle and Music routes are present **as their owning epics land**." Epics 2–3 have since landed canonical routes, and the inventory was not extended with them. Verified at the review SHA:

- `scripts/replatform-route-parity.ts:4-8,23` inventories only six legacy/Strapi/analytics paths: `/api/check`, `/api/csrf-token`, `/api/user/reactivate`, `/api/explorers/analytics/events`, `/api/music-fixture/readiness` (`:4-8`) and `/api/users/me` (`:23`). Zero canonical paths are probed.
- `tunes/server/test/contracts/platform-route-parity.test.ts:22` asserts `expect(await verifyPlatformIngress(...)).toBe(6)` — the count is pinned to exactly those six, so the invariant can never fail for a missing canonical route.

The invariant therefore currently passes vacuously with respect to every canonical surface. This is an **open 1.2 obligation**, not a defect in the recorded acceptance.

- [x] **Done 2026-10-08.** Extended the parity inventory in `scripts/replatform-route-parity.ts` with five canonical probes — `POST /api/auth/sign-in/social` (the Better Auth group's origin guard), `GET /api/explorers/v1/me`, `GET /api/explorers/v1/account/lifecycle` (the real path is prefixed, not `/account/lifecycle`), `GET /api/explorers/v1/collections`, and `GET /health/live`. The expected count is now **derived from the inventory** rather than the literal `6`, so a probe added without a response fails loudly instead of quietly raising a number nobody re-checked. The original six are untouched. Every expectation was **measured against the real `createCanonicalApp`**, not read off a handler, and that measurement is held as a standing contract by the new `tunes/server/test/contracts/platform-route-signatures.test.ts` — which is what stops the inventory being internally consistent while describing nothing, the actual earlier failure. It needs no container because none of the five paths reaches the database, which the test asserts rather than assumes.
- [ ] **The obligation is not closed, and the reason is not the inventory.** Measured 2026-10-08: `docker-compose.replatform.yml:56,106` set `EXPLORERS_API_MODE: legacy-music`, and the legacy composition (`server/routes/index.ts`) mounts only analytics (`:191`) and public-profile (`:186`) routes from the Explorers set — no Better Auth group, no `/health/live`, none of `/api/explorers/v1`. **The fixture is the legacy runtime, so the invariant is unsatisfied at its root and an inventory extension can only make it tell the truth.** `platform:test:routes` (run in CI at `.github/workflows/test.yml:302-310`) therefore now fails, which is this ticket's own mandated behaviour and the first time the invariant has been able to fail at all; the failure message carries its own diagnosis. **Closing it needs an owner decision on sequencing**, because this ticket asks for two things one runtime cannot both provide — keep the six legacy probes (`/api/check`, `/api/csrf-token`, `/api/user/reactivate` and the `/api/users/me` Strapi boundary are legacy-only) *and* require canonical routes the legacy runtime does not serve. Options and costs: [the route-graph invariant](../route-graph-invariant.md).
- [ ] **Coordinator allocation is required before any writer starts.** Both `scripts/replatform-route-parity.ts` and `tunes/server/test/contracts/platform-route-parity.test.ts` are shared files that every epic landing a canonical route must extend. Allocate an exclusive window; do not dispatch overlapping writers. Each later epic appends its own routes to the same inventory under the same allocation rule rather than forking a second parity script.
- [ ] Preserve the production half of the invariant unchanged: production must still reject fixture session authority even though the route graph is equivalent.

### Correction: the shared harness was delivered with a different layout

`epic-01.md:155` specifies the shared real-API browser harness as `scripts/replatform-e2e.ts`, `explorers-earth/playwright.replatform.config.ts`, `explorers-earth/e2e/replatform/fixtures.ts` and `explorers-earth/e2e/replatform/global-setup.ts`. Verified at the review SHA: **`playwright.replatform.config.ts`, `e2e/replatform/fixtures.ts` and `e2e/replatform/global-setup.ts` do not exist**, and the runner is `scripts/replatform-e2e.mjs` (not `.ts`), which drives per-category configs through the inner fixture runners rather than one shared Playwright config and one shared fixtures module. The historical specification above is retained as the **originally proposed** layout; the delivered layout is authoritative for execution. See the corrected command contract in `epic-01.md` and the [command custody correction](../command-custody-2026-10-05.md). A writer must not create the three absent files on the assumption they were lost, and must not cite the proposed layout as a delivered interface.
