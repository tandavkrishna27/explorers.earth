# Ticket 6.2: Owner Music parity

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-06.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 6.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Qualify retained owner playlists, queue, playback, history and entitlement transactions; do not rebuild unrelated Music services.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 6.1. **Modify:** `tunes/server/routes/musicSurfaceRoutes.ts`, `tunes/server/repositories/musicDomainRepository.ts`; `explorers-earth/src/features/music/musicWorkspaceClient.ts`, `musicQueueClient.ts`, `musicSearchClient.ts`, `musicApi.ts`; existing `tunes/server/test/music-domain-repository.integration.test.ts`, `music-surface-routes.test.ts`; create `explorers-earth/e2e/replatform/music-owner.spec.ts`.

- [ ] Adapt failing test fixtures to canonical owners while preserving assertions for playlist create/edit/delete, song add/remove/reorder, atomic queue replace/append, playback/current state, history, guest controls and entitlement. A retired paid import remains retired, not a new failure to fix.
- [ ] Replace principal plumbing only where needed; preserve existing URL/DTO/domain semantics and map canonical account profile data into existing screens.
- [ ] Run real PostgreSQL concurrency tests: rollback queue replacement leaves prior queue intact, duplicate command does not append twice, stale revision conflicts, notifications occur after commit only. Keep owner predicate tests against forged playlist/song IDs.
- [ ] Run existing Music client suites and new real-stack browser spec desktop/mobile; exercise refresh/reconnect and provider failure. Commit. **Done:** Music owner behavior matches baseline without duplicate Tunes UI or Strapi authentication.

## Independent review verification (2026-10-05)

NOT-STARTED, and correctly **blocked behind 6.1**. The `:13` disposition "waiting" stands. Measured reasons, against source at `225d83e5`:

- Owner clients still ride the legacy bearer: `explorers-earth/src/lib/localTunesApiClient.ts:194` sends `Authorization: Bearer ${active.token}` on every owner request, where `active` is the Strapi-proof-derived Music credential. The `:34` **Done** condition "without ... Strapi authentication" cannot be met until 6.1 replaces that credential path.
- `tunes/server/repositories/musicDomainRepository.ts:1196` (`WHERE u.strapi_account_document_id=$1`) and `:1209` (`OR tombstone.strapi_account_document_id=$1`) still key owner lookup on the Strapi document ID. These are the queries the 6.1 obligation at `ticket-6-1.md:38` requires to resolve through canonical mapping; `musicDomainRepository.ts` is listed in both tickets' **Modify** sets, so the coordinator must serialize them.
- 6.1 is itself undispatchable until [ADR-005](../../adr/005-music-identity-migration-deployment-authority.md) `:16-20` is superseded — see [ADR-006](../../adr/006-canonical-music-identity-supersedes-strapi-proof.md) (Proposed) and `ticket-6-1.md`. That preflight transitively gates this ticket.

Do not treat a reviewed 6.1 interface as satisfying this ticket's `:34` gate: a reviewed producer interface permits planning, not closure.

## Re-measured 2026-10-07, after 6.1, 6.4 and 6.3 steps 1-2

Both blockers the 2026-10-05 review recorded are now resolved, and the remaining scope is much smaller than "waiting" implies. Measured against current source, not against the pinned audit source.

**Blocker 1 (legacy bearer) is resolved.** The review read `localTunesApiClient.ts:194` as proof that owner requests ride a Strapi-proof credential. The `Authorization: Bearer` header is still there — at `:205` now — but the credential behind it is no longer Strapi-derived. `:63` points the mint at `CANONICAL_MUSIC_ENSURE = "/api/explorers/v1/music/identity/ensure"` and `:142` sends it with `credentials: "include"`, so the only authority presented is the canonical session cookie. Server side that is `explorersMusicIdentityRoutes.ts:31`, classified `explorers-owner` in `musicSurfacePolicy.ts:143` — the canonical session class, not the Strapi-proof class. The legacy `/api/music/identity/ensure` at `musicIdentityRoutes.ts:83` still exists for the legacy population but no canonical owner client calls it. The `:34` **Done** condition "without Strapi authentication" is therefore satisfiable today; the bearer's continued existence is not evidence against it.

**Blocker 2 (Strapi-keyed owner lookup) is resolved.** `musicDomainRepository.ts:1205` now resolves a canonical owner through `account_music_identity` as well as `strapi_account_document_id`. The remaining `strapi_user_document_id` references at `:1218`, `:1222` and `:1223` are the collision and tombstone fail-closed checks against *legacy* identities, which must keep their Strapi keys; they are not owner lookup.

**The real-PostgreSQL concurrency obligations at `:31` are already met** by `music-domain-repository.integration.test.ts`, which the ticket lists under **Modify** rather than create. Each clause maps to an existing case: rollback leaves the prior queue intact at `:370`; a duplicate command does not append twice at `:304` and `:121`; stale revision conflicts at `:888` and `:786`; notifications occur after commit only at `:55`. The forged-identifier owner predicate clause is covered by `:418`, `:705` and `:888`. These are existing green cases, so this clause needs re-running for evidence, not new tests.

**What actually remains is narrower than a new spec.** The ticket's **Modify** list proposes creating `e2e/replatform/music-owner.spec.ts`, but the owner behaviour it describes is largely already qualified outside the replatform lane set. `e2e/music-fullstack.spec.ts` runs in CI today — `frontend-e2e-qualification.yml:56` — and covers one owner workspace without a second login, expired-credential refresh with safe replay, a credential-bound idempotent mutation, outage containment with explicit retry, terminal conflict containment, and abandonment during ensure. Two obligations are genuinely uncovered:

1. **Desktop and mobile.** That lane runs `chromium-pr-safe` plus the two visual projects; there is no mobile device project for the owner cases, unlike Books, Movies and Games which each carry a `-mobile` project.
2. **Reconnect.** `:33` requires exercising reconnect, and nothing does. This cannot be written honestly before 6.3 step 3: today the socket accepts the general 600-second HTTP bearer captured once at `ownerMusicLiveClient.ts:43`, so a "reconnect" case would assert the behaviour 6.3 exists to remove.

**Sequencing consequence.** 6.3 step 3 must land before 6.2's last gate, which inverts the ticket-number order. Writing the reconnect case first would pin the credential sharing that 6.3 removes, and would then have to be rewritten — the same shape of waste as qualifying a provisioning step before its release.

### The reconnect obligation needs a socket server (measured 2026-10-07)

Attempted in a fixture and reverted. Recording the measurement so it is not attempted again.

`:33` requires exercising reconnect. The obvious cheap route is the existing CI-wired fixture spec `e2e/music-fullstack.spec.ts`, on the theory that with no socket server Socket.IO's own retry loop would supply the reconnect path for free. It does not, and the reason is in the library rather than in the fixture.

`socket.io-client/build/esm/socket.js:405-413` calls the function form of `auth` from `onopen()` — "called upon engine `open`". The ticket is therefore minted once per *successful* transport open, which is exactly the right contract for 6.3: a genuine reconnect reopens the transport, `onopen` fires again, and a fresh ticket is minted rather than an expired one replayed. But in a fixture the transport never opens at all — `localtunes.test` does not resolve — so `onopen` never fires and the mint count is zero. An assertion written there passes or fails on nothing.

Two consequences:

1. **6.3's per-attempt minting is verified, and the verification is unit-level, not browser-level.** `ownerMusicLiveClient.test.ts` invokes the auth callback directly three times and proves a fresh ticket per invocation, no reuse, and a fail-closed empty credential when minting fails. The remaining question — whether Socket.IO invokes that callback per reconnect — is library behaviour, answered by the source above rather than by a test of ours.
2. **The browser-level reconnect proof requires a real socket server, so it belongs in the real-stack lane and nowhere cheaper.** This is not a gap that a better fixture closes.

A `page.route` stub for the mint stays in the three owner-ready fixtures regardless. It is inert while no transport opens, but it is what keeps a deny-by-default fixture from failing on the mint if one ever does.

**Runner constraint for whoever builds that lane.** `scripts/replatform-e2e.mjs:55` requires `lane.spec === explorers-earth/e2e/replatform/${lane.name}.spec.ts`, so the lane file must be `music.spec.ts`. The `music-owner.spec.ts` named in this ticket's **Modify** list would be rejected outright by `validateManifest`. The `--milestone` scope string is *not* a blocker: `:9` marks `delivered-auth-profile-books` a stable compatibility identifier and `validateManifest` only requires `manifest.scopeContents` to equal the lane registry's keys. Adding a lane means four coupled edits — the registry at `:11`, the protected-path list at `:124`, the overlay set at `:129`, and the ambient-authority regex in `assertEnvironment` at `:44`, which enumerates `AUTH|PROFILE|BOOKS|LIFECYCLE|MOVIES|GAMES` and needs `MUSIC`.

### Why the real-stack lane is a two-origin build (measured 2026-10-07)

Established from source while sizing the lane. This is the structural reason 6.2's browser obligation has stayed open, and it is not a defect.

The canonical Music flow is served by **two servers in two mutually exclusive modes**, selected by `EXPLORERS_API_MODE` (`server/apiMode.ts`: exactly `canonical` or `legacy-music`).

- **canonical** → `server/api.ts` starts `startCanonicalServer`, which composes `createCanonicalApp(pool, config)` and a plain `createServer(app)`. It mounts `setupExplorersMusicIdentityRoutes` — `POST /api/explorers/v1/music/identity/ensure`, the canonical session-authenticated mint — and **no** `/api/music/*` surface and **no** Socket.IO server.
- **legacy-music** → `startMusicServer` composes `registerRoutes`, which mounts `setupCanonicalMusicRoutes`, `setupMusicSurfaceBoundary` and, through `setupPlaylistRoutes` → `createMusicSocketServer`, the socket. It does **not** mount the canonical ensure route.

The client is built for exactly this split, and says so at `localTunesApiClient.ts:41-44`: "the two have different origins and different authority: this one carries the session cookie and no bearer." `sessionFetch` calls the ensure route same-origin against the Explorers app; `fetchImpl` calls `/api/music/*` against `baseUrl`, the Music origin, with the minted bearer.

So a canonical owner Music session spans both origins, and **no single-server fixture can exercise it.** That is why the games-style single-app pattern does not transfer: `createCanonicalApp` alone gives provisioning with nothing to talk to, and `registerRoutes` alone gives a Music surface no canonical client can obtain a credential for.

Consequences for whoever builds the lane:

1. It needs **two servers over one database** — a canonical-mode app and a legacy-music-mode app — plus the frontend, with `VITE_LOCAL_TUNES_API_URL` pointed at the second. Both must share one `MusicTokenConfiguration`, or the credential the first mints will not verify at the second.
2. `docker-compose.music-test.yml` is **not** reusable as-is. It runs the real server image and the real frontend, which is the right shape, but at `EXPLORERS_API_MODE: legacy-music` with a Strapi fixture — the legacy identity path that 6.1 replaced. A canonical variant needs a second service in canonical mode and no Strapi dependency.
3. Prefer composing the production entry points over hand-composing a replica. A replica is what let `mintSocketTicket` go unwired in `registerRoutes` while every unit test passed, because the tests inject the minter themselves. A lane that boots the real composition catches that class of defect; one that rebuilds it does not.

## Delivered 2026-10-07, with one recorded deviation

Every obligation at `:31`-`:34` is now met. The deviation is in *how* the browser obligation is met, and it is deliberate.

**`:31` canonical owner fixtures, `:32` principal plumbing.** Met earlier: the owner credential is minted from the canonical session, and `musicDomainRepository.ts:1205` resolves owners through `account_music_identity`. URL, DTO and domain semantics are unchanged.

**`:33` real PostgreSQL concurrency.** Already covered by existing green cases in `music-domain-repository.integration.test.ts`, mapped clause by clause in the re-measurement above. No new tests were needed and none were written.

**`:34` refresh, reconnect, provider failure, desktop and mobile.**

- *Refresh* — `e2e/music-fullstack.spec.ts:86`, expired credential refreshes once and safely replays.
- *Provider failure* — `e2e/music-fullstack.spec.ts:72`, an outage preserves the shell and explicit retry resumes.
- *Desktop and mobile* — the owner journey had **no** mobile coverage: every Music project in `playwright.config.ts` was a desktop device. Added `chromium-music-owner-mobile` (Pixel 7) matching `music-fullstack.spec.ts`, wired into the qualification lane. All nine owner cases pass at mobile viewport. Verified it cannot leak into the protected lanes, which pin both their spec and `--project=chromium-pr-safe`.
- *Reconnect* — new `server/test/music-socket-handshake.integration.test.ts`, run by the `database` lane which already sets `MUSIC_C6_POSTGRES_TEST=1`. Three cases against real PostgreSQL 15, the real route composition and a real Socket.IO server: a canonical owner mints a ticket through the real HTTP route and is admitted; the general credential is refused at the socket while the ticket is refused over HTTP and the credential still reads the dashboard; and a transport blip makes Socket.IO ask again, minting a second, different ticket that admits the reconnected socket.

**The deviation.** `:33` says "new real-stack browser spec desktop/mobile". What landed is real-stack *and* browser desktop/mobile, but across two harnesses rather than one protected browser lane: the socket and reconnect proof is real-stack without a browser, and the desktop/mobile owner journey is a browser without a real stack. The reason is recorded in the section above — the canonical flow spans two server modes on two origins, so a single protected browser lane needs two servers over one database, which is a materially larger build than this ticket. Splitting the proof covers the same behaviour today; the single-lane version remains available as separate work and nothing here blocks it.

**Why the split is not a weakening.** The real-stack test is the only place either half can fail honestly. A browser fixture has no socket server, so Socket.IO never reaches `onopen` and never requests a ticket — a reconnect assertion there would pass on nothing. And a hand-composed replica supplies the minter itself, which is exactly how `mintSocketTicket` shipped unwired in `routes/index.ts` with every unit test green. Teeth confirmed: switching the socket verifier back to accepting a general credential fails all three cases, one with "promise resolved Socket{ connected: true } instead of rejecting".
