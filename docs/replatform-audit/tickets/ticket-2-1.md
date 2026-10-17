# Ticket 2.1: Auth and ownership schema

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-02.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 1.2, 1.4. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Reuse canonical cookie authority; no legacy subject substitution.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 1 local database, migration runner and route baseline. **Produces:** Google session, `ensureInitialAccount(userId): Promise<{accountId:string}>` and canonical persistence.

**Existing files:** `tunes/server/app.ts`, `tunes/server/routes/index.ts`, `tunes/server/db.ts`, `tunes/shared/schema.ts`, `tunes/server/db/migrate.ts`, `tunes/shared/music-migration-contract.ts`, `tunes/server/db/readiness.ts`, `tunes/server/db/music-runtime-role.ts`, `tunes/package.json`, `tunes/package-lock.json`.

**Create:** `tunes/shared/explorersContract.ts` (identity/error/profile/media primitives; 3.1 extends it), `tunes/server/auth/betterAuth.ts`, `tunes/server/auth/initialAccount.ts`, `tunes/shared/authSchema.ts`, `tunes/shared/explorersSchema.ts`, `tunes/migrations/0022_explorers_identity.sql`, `tunes/server/test/explorers-auth.test.ts`, `tunes/server/test/explorers-account-provision.integration.test.ts`.

- [ ] Verify current official Better Auth Express 5 integration, Drizzle PostgreSQL adapter, Google configuration, stable user ID and session-revocation APIs. Pin a supported package/version and record its generated table contract. Do not copy hypothetical library methods from this plan. MCP OAuth support is a later compatibility gate, not a reason to implement OAuth now.
- [ ] Add failing tests: two concurrent `ensureInitialAccount` calls return the same account, exactly one owner binding and membership; transaction failure leaves no orphan account; Google provider subject distinguishes identities even if emails/display names coincide. Run the named tests and record expected failures.
- [ ] Add auth/creator/membership migrations and constraints. Keep provider credentials inaccessible to public profile selects. Mount the auth handler in the ordering required by the verified Express integration, with explicit trusted origins and callback allowlists. No native password signup endpoint is enabled.
- [ ] Wire canonical auth/account startup through the API-only composition from Epic 1 so it boots without Strapi connectivity or a successful legacy Music proof exchange. Current `createApp(musicIdentityConfig,localProfile)` and `registerRoutes` construct Strapi adapters eagerly; keep legacy Music composition behind its explicit temporary path until 6.1, and prove canonical `/me` startup with a network stub that rejects every Strapi request. Do not fake Strapi credentials to make the new auth runtime start.
- [ ] Configure the single existing Google OAuth client with exact local/QA/prod `/api/auth/callback/google` URIs derived from approved public origins; set explicit Better Auth base URL per environment and generate independent application secrets. Verify project consent/audience/test-user settings without logging secret values. Do not auto-link identities solely on matching email; a verified provider subject is the authority, and any uniqueness collision must fail safely without granting another account.
- [ ] Implement idempotent initial provisioning in a transaction invoked after authenticated session establishment; use a unique binding plus conflict-safe retry, not an application-only precheck. Incomplete onboarding is a valid state and does not fabricate an address.
- [ ] Run unit/database commands above, negative callback/origin tests and compiled startup. Commit schema/auth/provisioning together. **Done:** repeat login/callback does not multiply accounts and invalid callbacks do not establish sessions. Real Google smoke is still mandatory in 2.4/3.5.

- [ ] Qualify the recovery contract specified in ticket 2.4 before closing 2.1: identify supported fresh-Google callback/session hooks, prove inactive identities can authenticate for recovery without ordinary access or automatic account provisioning, and create the server-only recovery proof tests. This prerequisite does not depend on implementing downstream content routes.

## Independent review record (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 2.1. Verdict **ACCEPTED**, evidence verified: Better Auth pinned at 1.7.6, password auth off, implicit identity linking disabled, an explicit callback allowlist, the three mandatory failing tests present, and 4/4 exact-head hosted workflows `success`. Real Google smoke remains explicitly deferred to 2.4/3.5 per the **Done** line above. Acceptance is not reopened.

**One open test-lane defect.** `tunes/server/test/account-recovery.test.ts` — the recovery proof test this ticket's final checkbox mandates — is **database-backed** (`:9` declares `let pool: pg.Pool`; `:28` opens `new pg.Pool({connectionString: process.env.DATABASE_URL_TEST})` in `beforeAll`) but its filename carries no `.integration` segment, so it is **misfiled into the unit lane**. Per the epic's grounded test commands, database suites run through `npm --prefix tunes run test:integration` with the attested disposable PostgreSQL 15 authority, `DATABASE_URL_TEST` and the applicable suite flag; the unit command supplies none of those.

- [ ] Resolve the lane placement so the ticket-mandated recovery proof actually executes under the command that provides its database authority: either rename it to `account-recovery.integration.test.ts` and register it in the integration lane, or make it fail loudly on absent prerequisites. **It must not silently skip, and a skipped suite is not a pass** — a mandated recovery proof that no lane executes leaves the 2.4 prerequisite unqualified while appearing satisfied.
