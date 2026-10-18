# ADR-006: Canonical Music identity supersedes the Strapi proof boundary

## Status

Accepted (2026-10-05)

> Accepted by the repository owner on 2026-10-05. This ADR supersedes ADR-005's
> identity-issuance decision only — specifically its bodyless proof boundary and
> its three distinct credential scopes. ADR-005 remains the current authority for
> the schema model, append-only migrations, deployment authority and image-digest
> promotion, and is unamended in those respects.
>
> Ticket 6.1 is unblocked by this acceptance. A writer implementing it follows the
> Decision below, not ADR-005's proof exchange.

## Context

[ADR-005](005-music-identity-migration-deployment-authority.md) `:16-20` ratifies a
bodyless `POST /api/music/identity/ensure` boundary at which "Explorer authentication
and selected Account context are verified", returning a short-lived Music credential,
with "Session, Explorer bearer, and Music credential scopes" kept distinct
(`005:30`). That is the design ticket 6.1 exists to remove, and ADR-005 is still
Accepted: `docs/adr/` holds 001–005 plus `README.md`, and nothing supersedes it.

Three facts, measured in source at `225d83e5` on 2026-10-05, make that boundary
unavailable rather than merely undesirable:

1. **The canonical backend is the cookie/account authority.** Epic 2 delivered a
   server-only `Actor` (`tunes/server/application/actor.ts`) carrying
   user/account/role and a web-session or OAuth credential union, with `requireActor`
   as the request-level gate. Canonical verification deliberately holds no browser
   bearer: `explorers-earth/src/store/store.ts:76` sets `token: null` on every
   accepted verification.
2. **Ticket 6.1 specifies a different contract.** `ticket-6-1.md:33` requires
   `ensureMusicAccount(actor: Actor): Promise<{musicUserId:number;accountId:string}>`
   as a transactional one-to-one mapping, with owner HTTP consuming the canonical
   session directly and no Strapi-origin values required.
3. **Startup currently requires a Strapi-issued proof, so Music is non-functional
   under canonical auth.** `explorers-earth/src/features/music/musicApi.ts:19` wires
   `getStrapiBearer: async () => useAuthStore.getState().token ?? undefined`, which
   therefore always yields `undefined`;
   `explorers-earth/src/lib/localTunesApiClient.ts:127-128` is the only credential
   path and throws `"proof unavailable"` unless a Strapi-shaped proof exists,
   surfacing as `MusicClientError("AUTH_UNAVAILABLE", 503)`. The backend still
   exchanges that proof upstream
   (`tunes/server/routes/musicIdentityRoutes.ts:83` →
   `tunes/server/services/strapiIdentityGateway.ts:346`), and
   `tunes/server/routes/index.ts:84-85` eagerly constructs `StrapiIdentityGateway`
   from a **required** `musicConfig.strapiOrigin`.

ADR-005's deployment and migration authority is unaffected by any of this and is
independently sound: the append-only SQL chain, manifest, checksums and expected
chain remain deployment authority, and application startup still never creates or
synchronizes schema.

## Decision

For embedded Music identity issuance only, the following replaces ADR-005 `:16-20`
and `:30`:

1. **Canonical session HTTP ensure.** Music owner provisioning and owner HTTP are
   reached through a canonical route that consumes `requireActor` and the canonical
   session cookie. The route takes its subject from the server-side `Actor`, never
   from a request body, header or browser-supplied account identifier. Its service
   is `ensureMusicAccount(actor)`: a single transaction that is the one-to-one
   mapping writer, idempotent under concurrency, and the only production path by
   which an account acquires a Music mapping row.
2. **No general HTTP bearer.** No Explorer-scoped bearer, no Strapi-issued proof and
   no Music-scoped HTTP token is accepted on, or issued by, the owner HTTP surface.
   ADR-005's three distinct scopes collapse to one: the canonical session.
3. **No legacy token restoration.** `token: null` on canonical verification is the
   contract, not a defect to repair. Nothing may repopulate
   `explorers-earth/src/store/store.ts` `token` to satisfy Music, and no fixture,
   test route or development shim may mint a Strapi-shaped proof to turn the
   publishing case green.
4. **No OAuth session fabrication.** An OAuth-credential `Actor` cannot obtain
   web-session authority by supplying or synthesizing a session ID. Web-session
   authority is established only by a real current web session.
5. **Purpose-limited socket handshake, separate from the HTTP credential.** The
   socket handshake value is a distinct, purpose-limited, short-lived, memory-only
   credential bound to user, account, session ID and session version, with its own
   audience. It is not accepted on any HTTP route, and no HTTP credential is accepted
   at the socket handshake. Its expiry does not end an otherwise valid live session;
   reconnect requests a fresh credential. An established connection is re-authorized
   per owner event against current membership, session and account state and is
   disconnected on logout or suspension.

ADR-005's remaining decisions stay in force unchanged: `tunes/shared/schema.ts` as
the type-safe schema model; reviewed append-only SQL migrations, manifest, checksums
and expected chain as deployment authority; no schema creation or synchronization at
startup; and build/promotion/rollback bound to immutable image digests through the
authenticated deployment runbook and security/schema floors.

## Consequences

**What must change.**

- `tunes/server/routes/index.ts:84-85` must stop requiring `musicConfig.strapiOrigin`
  to construct a runtime gateway, so Music can start with zero required Strapi
  configuration — the Epic 6 exit criterion
  (`docs/replatform-audit/epics/epic-06.md:156`).
- `musicIdentityRoutes.ts:83` → `strapiIdentityGateway.ts:346` leaves the runtime
  identity path; legacy path files are removed only in Epic 8.
- `ensureMusicAccount` must be written. It does not exist anywhere in source today:
  `tunes/server/music/canonicalMusicPrincipal.ts:13-16` is `SELECT`-only and
  self-documents at `:8` that provisioning "belongs to 6.1", and every
  `INSERT INTO account_music_identity` in the repository is a test fixture
  (`tunes/server/test/explorers-lifecycle.integration.test.ts:338,374`;
  `tunes/server/test/explorers-analytics-events.integration.test.ts:149,174`). Without
  this writer a real new owner can never obtain a mapping row.
- The socket credential must be separated from the HTTP bearer. Today the owner socket
  consumes the same general HTTP bearer
  (`explorers-earth/src/hooks/useTunesDashboard.ts:107-109` →
  `tunes/server/socket/musicSocketServer.ts:272,278`) whose lifetime is hard-pinned
  to 600 seconds by `tunes/server/services/musicTokenService.ts:127-128`, so a leaked
  handshake value is a full ten-minute HTTP bearer.
- `explorers-earth/src/features/music/musicApi.ts:19` must stop asking for a Strapi
  bearer, and `localTunesApiClient.ts:127-128` must stop being the only credential
  path.

**What stays.**

- ADR-005's migration and deployment authority, unamended.
- The numeric Music principal internally. `account_music_identity.music_user_id` is
  an `integer` FK to the serial `users(id)`
  (`tunes/migrations/0023_explorers_authorization.sql:17`), documented as transitional
  at `0023:14` and hardened by the immutability trigger at `0023:24-25`.
- The delivered socket protections, which this ADR does not relax:
  memory-only credential storage
  (`explorers-earth/src/lib/musicCredentialStore.ts:8`), verified
  audience/expiry/session-version (`musicTokenService.ts:81,86-87,160-169`), and
  per-event re-authorization with revocation
  (`musicSocketServer.ts:194,231,378-379`).
- The negative obligations in `ticket-6-1.md:44`: reproduce the failure before
  repairing it, and never issue a fake fixture credential to turn the original
  publishing case green.

**What evidence closes it.**

- A canonical identity integration test in which `acceptVerified` with a null token
  initializes the correct Music owner over session HTTP with no Strapi configuration
  and no upstream Strapi request, and in which wrong, ambiguous, foreign and
  suspended owners are issued nothing.
- A provisioning-concurrency test for `ensureMusicAccount(actor)` in the same package
  as the writer, proving one row under concurrent first-visit requests.
- A test proving the socket handshake value is rejected on HTTP routes and that no
  HTTP credential is accepted at the handshake.
- A test proving an OAuth-credential `Actor` cannot acquire a web socket credential
  through a supplied or synthesized session ID.
- Startup with `strapiOrigin` unset: Music serves owner HTTP and socket traffic.
- Canonical account deletion and suspension revoking both transports.

Until this ADR is accepted, 6.1 has no ratified target design and remains
undispatchable.

## Supersedes

This decision supersedes [ADR-005](005-music-identity-migration-deployment-authority.md)
only for embedded Music identity issuance and credential authority — its `:16-20`
`POST /api/music/identity/ensure` proof boundary and its `:30` distinct-scopes
consequence. ADR-005's schema, migration and deployment authority
(`005:21`, `005:23-26`, `005:31-32`) remains accepted and is not amended here; that
text is current guidance, not historical record. ADR-005's own partial supersession
of ADR-002 and ADR-004 is unaffected.
