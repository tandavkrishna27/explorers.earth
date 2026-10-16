# Ticket 6.1: Replace the identity bridge

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-06.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** priority prerequisite. **Technical inputs:** 2.2, 3.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package M1: canonical mapping/principal and session HTTP. M2: token-null production startup and generation fencing. M3: purpose-limited socket credential/revocation. Backend/frontend split only after exact interface handoff.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 2.2 authority contract and 3.1 shared runtime; may run before unrelated category tickets after these prerequisites. **Create:** `tunes/server/music/accountMusicRepository.ts`, `tunes/server/music/musicSocketCredential.ts`, `tunes/server/test/canonical-music-identity.integration.test.ts` and the next append-only canonical Music migration.

**Modify:** `tunes/server/music/canonicalMusicPrincipal.ts`, `tunes/server/routes/index.ts`, `tunes/server/middleware/musicPrincipal.ts`, `tunes/server/routes/musicIdentityRoutes.ts`, `tunes/server/repositories/musicIdentityRepository.ts`, `tunes/server/repositories/musicDomainRepository.ts`, `tunes/server/services/musicLifecycleService.ts`, `tunes/server/socket/musicSocketServer.ts`, `tunes/shared/schema.ts`, Music SQL manifest/readiness/role grants; `explorers-earth/src/lib/localTunesApiClient.ts`, `musicCredentialStore.ts`, `explorers-earth/src/features/music/musicIdentityCoordinator.ts` and `musicSessionBoundary.ts`.

**Contract:** `ensureMusicAccount(actor:Actor): Promise<{musicUserId:number;accountId:string}>` transactional one-to-one mapping. Owner HTTP consumes canonical session directly. `POST /api/explorers/v1/music/socket-credential` accepts only a current web-session Actor and issues a memory-only purpose-limited 60-second **handshake** credential bound to user/account/session ID and session version; it is not a general HTTP bearer or OAuth token. OAuth Actors cannot acquire web socket credentials through a fabricated session ID. Verify expiry/audience and current state at connect; an established connection subsequently checks current membership/session/account state per owner event and is disconnected on logout/suspension. The handshake's 60-second expiry does not itself end an otherwise valid live session; reconnect always requests a fresh credential. Existing MusicPrincipal compatibility names may exist only at an adapter boundary; no Strapi-origin values are required.

- [ ] Add failing tests for concurrent provision, two-owner isolation, revoked session replay, expired socket credential, changed account state after connection and no upstream request when Strapi is unreachable.
- [ ] Append explicit canonical mapping/provisioning SQL and adjust triggers/functions that currently require Strapi fields or frozen numeric identity. Retain numeric IDs, guest/publication state and transactional guarantees. Do not make every SQL constraint nullable as a shortcut; map each modified invariant to a canonical replacement and migration test.
- [ ] Recompose Music routes/lifecycle on canonical authority and remove upstream absence/reconciliation from the new runtime path. Keep lifecycle deletion/revocation/idempotency, replacing only Strapi proof assumptions. Remove legacy path files only in Epic 8.
- [ ] Change browser client to session HTTP and socket-ticket acquisition; retain single-flight coordination, generation cancellation and cross-tab invalidation. Audit lifecycle, entitlement, analytics and public descriptor queries that currently read `strapi_account_document_id`—all must resolve canonical mapping.
- [ ] Run canonical identity integration, updated principal/socket/lifecycle unit suites and runtime-role/migration tests. Commit. **Done:** Music starts and operates with zero required Strapi configuration; canonical account deletion/suspension revokes both transports.


## Current startup dependency (2026-10-05)

The original publishing outage case fails before /api/music/dashboard. Canonical auth intentionally keeps token null; musicApi still requests a Strapi proof, and production AuthSyncManager has no Music reconcile startup. Extend frontend ownership to `src/features/music/musicApi.ts`, `src/components/AuthSyncManager.tsx`, `src/hooks/useTunesDashboard.ts` and their focused startup tests. Implement session HTTP under the existing Actor contract, not another HTTP bearer. Keep the 60-second socket credential purpose-limited and memory-only. Reproduce verified-cookie/token-null startup, wrong owner, logout and verified ABA before repair; real HTTP/socket qualification is required. 6.2/6.3 own the remaining publication/workspace transaction parity. Do not issue a fake fixture credential to turn the original publishing case green.

## Independent review verification (2026-10-05)

Measured against source at `225d83e5`. Nothing below is a completion claim; every item is an obligation or a correction to an obligation stated above.

### Blocking preflight: ADR authority contradicts this ticket

[ADR-005](../../adr/005-music-identity-migration-deployment-authority.md) `:16-20` is still **Accepted** and ratifies exactly the design this ticket exists to delete: the bodyless `POST /api/music/identity/ensure` proof boundary, with `005:30` keeping session, Explorer bearer and Music credential as distinct scopes. Nothing supersedes it — `docs/adr/` holds 001–005 plus `README.md`. [ADR-006](../../adr/006-canonical-music-identity-supersedes-strapi-proof.md) is drafted but **Proposed**, not Accepted; accepting it is the repository owner's decision.

**Do not dispatch a 6.1 writer until ADR-005's identity-issuance decision is superseded.** A writer following current ADR authority would rebuild the proof exchange this ticket removes — the highest-cost possible misread of the contract at `:33`.

### Measured startup reality (reproduces the publishing outage exactly)

Record this chain as the failure to reproduce before any production change, per the `:19` execution gate:

- `explorers-earth/src/store/store.ts:76` forces `token: null` on every canonical verification (`acceptVerified`). This is the contract, not a defect.
- `explorers-earth/src/features/music/musicApi.ts:19` wires `getStrapiBearer: async () => useAuthStore.getState().token ?? undefined`, so it always yields `undefined`. (The parent epic text and earlier notes cite this as `:20`; measured line is `:19`.)
- `explorers-earth/src/lib/localTunesApiClient.ts:127-128` is the only credential path. It throws `"proof unavailable"` unless a Strapi-shaped proof matching `STRAPI_PROOF_PATTERN` exists, surfacing as `MusicClientError("AUTH_UNAVAILABLE", 503)`.
- The backend still exchanges that proof upstream: `tunes/server/routes/musicIdentityRoutes.ts:83` → `tunes/server/services/strapiIdentityGateway.ts:346` (`/api/users/me`).
- `tunes/server/routes/index.ts:84-85` eagerly constructs `StrapiIdentityGateway` from a **required** `musicConfig.strapiOrigin`.

Consequence: Music returns 503 before any dashboard request is made. The `:39` **Done** condition — "zero required Strapi configuration" — is contradicted by `routes/index.ts:84-85` today.

### Missing production writer — explicit obligation

`ensureMusicAccount` **does not exist anywhere in source.** The contract at `:33` names it; nothing implements it.

- `tunes/server/music/canonicalMusicPrincipal.ts:13-16` is `SELECT`-only and self-documents at `:8` that owner provisioning and socket credentials "belong to 6.1".
- Every `INSERT INTO account_music_identity` in the repository is a test fixture: `tunes/server/test/explorers-lifecycle.integration.test.ts:338,374` and `tunes/server/test/explorers-analytics-events.integration.test.ts:149,174`.

So a real new owner can never obtain a mapping row, and any 6.1 slice would pass only on seeded rows. A seeded-row pass is not evidence.

- [ ] Implement `ensureMusicAccount(actor)` as a single transaction that is the sole production mapping writer, idempotent under concurrent first-visit requests.
- [ ] Add a provisioning-concurrency test **in the same package as the writer**: concurrent first-visit ensures for one account produce exactly one `account_music_identity` row.
- [ ] Prove the new-owner path without any seeded mapping row. A test that pre-inserts the row does not qualify.

### Socket contract corrections

The `:33` contract describes a route and a lifetime that do not exist:

- There is **no** `POST /api/explorers/v1/music/socket-credential` route and **no** `tunes/server/music/musicSocketCredential.ts`. The `:29` **Create** list is correct that these are to be created; the `:33` contract must not be read as describing current behavior.
- The owner socket consumes the **same general HTTP bearer**: `explorers-earth/src/hooks/useTunesDashboard.ts:107-109` passes `credential.token` into `subscribeToOwnerMusic`, consumed at `tunes/server/socket/musicSocketServer.ts:272,278`.
- That credential's lifetime is hard-pinned to **600 seconds**, not 60: `tunes/server/services/musicTokenService.ts:127-128` throws unless `tokenLifetimeSeconds === 600`. The `60_000` at `explorers-earth/src/lib/localTunesApiClient.ts:84` is `MUSIC_IDENTITY_RELIABILITY_CONTRACT.refreshWindowMs` — a pre-expiry refresh window, not a TTL.
- Therefore a leaked socket handshake value **is** a full ten-minute HTTP bearer, violating the `:33` clause "it is not a general HTTP bearer or OAuth token" by construction.

Already true, and not to be weakened while separating the transports:

- memory-only credential storage — `explorers-earth/src/lib/musicCredentialStore.ts:8`;
- verified audience, expiry and session version — `musicTokenService.ts:81,86-87,160-169`;
- per-event re-authorization and revocation — `musicSocketServer.ts:194,231,378-379`.

Missing, and owed by this ticket: purpose limitation (a handshake value rejected on HTTP routes and no HTTP credential accepted at the handshake), the 60-second bound, session-ID binding, and OAuth-Actor exclusion from web socket credentials.

### Coordinator path has no production caller

- `musicIdentityCoordinator.reconcile(...)` has no production caller. The only call outside the coordinator itself (`explorers-earth/src/features/music/musicIdentityCoordinator.ts:98,208`) and its own unit tests is `explorers-earth/src/features/music/__tests__/musicPublishHarness.tsx:12`.
- `musicApi.setAuthority(...)` likewise has no production caller: `explorers-earth/src/features/music/musicApi.ts:27` exports it and `:21` sets authority on the internal client, but the only external callers are tests.
- `explorers-earth/src/components/AuthSyncManager.tsx:15` only calls `authClient.refresh()`, and `:20-21` only `musicApi.logout()` / `musicIdentityCoordinator.reset()`. Nothing reconciles.
- So the coordinator stays `idle`, and `explorers-earth/src/hooks/useTunesDashboard.ts:97` (`enabled: identityStatus === "ready" && scope !== undefined`) never fires.

### Path and ownership corrections

- `explorers-earth/src/lib/musicCredentialStore.ts` is the actual location. The `:31` **Modify** list spells it as a bare `musicCredentialStore.ts` following `localTunesApiClient.ts`; it is **not** under `src/features/music/`.
- `explorers-earth/src/components/AuthSyncManager.tsx` is **shared with 2.4**. It must not be edited by a 6.1 writer and a 2.4 writer concurrently; the coordinator serializes it.
- `tunes/server/routes/index.ts` and `tunes/shared/schema.ts` remain coordinator-allocated shared files per `:17`.
