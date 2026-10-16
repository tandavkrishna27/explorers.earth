# Wave2 combined Music implementation card

Status: preparation only; no qualification, allocation, database operation or source repair performed. Prepared against `7f9495192e3c9bc07ab5e6638063e783a864aa10`, using the October 9 waves and reconciled sequence and tickets 6.2/6.3. Original ticket checkboxes and hosted gates remain binding.

## Ownership and entry conditions

Wave2 Music implementer owns these new files only:

- `tunes/scripts/canonical-music-browser-fixture.ts`
- `explorers-earth/e2e/replatform/music.spec.ts`
- `explorers-earth/e2e/replatform/music.playwright.config.ts`
- `explorers-earth/e2e/replatform/music.vite.config.ts`

Coordinator serially owns `scripts/replatform-e2e.mjs`, its protected contracts, `explorers-earth/e2e/replatform/suite-manifest.json`, `tunes/package.json` and relevant CI registration. Register Music only after integrating the lifecycle twelve-plus-six = eighteen identity inventory. Any demonstrated application repair needs a new explicit file allocation; shared auth, route composition, migrations, Settings and repositories are not implicitly owned by this card. An independent reviewer must review the implementation and receipt contract before protected execution.

## Measured production composition

`server/api.ts` selects canonical or Music startup, not both. Canonical `startCanonicalServer` validates the runtime role and readiness before constructing `createCanonicalApp`; the latter mounts Better Auth, `/api/explorers/v1/me`, canonical Music ensure and canonical public profile routes, but no Socket.IO server. Music `startMusicServer` validates configuration and runtime role, loads production `createApp`, and runs it with `apiOnly: true`. `routes/index.ts` creates the Music repository, publication cipher, token issuer, canonical Music HTTP routes, feature decision service and playlist/socket composition. The socket uses `createMusicSocketCredentialVerifier`, guest/public resolvers and real database listeners. Importing a socket class or calling canonicalApp alone cannot qualify this topology.

The fixture parent must launch two separate child processes: canonical startup via `startCanonicalServer(process.env)` and Music startup via `startMusicServer(process.env, {apiOnly:true})`. A proposed implementation is child modes dispatched internally by the new fixture file; those are private harness interfaces, not public runner flags. Each child has its own pool and shutdown. Do not inject `options.pool`, a replacement `loadRuntime`, a substitute createApp or socket verifier into the acceptance children. Keep owned provider/control seams separate and capability protected. If canonical startup needs a provider seam for callback simulation, allocate and review that seam explicitly rather than silently replacing production composition with the profile fixture.

One owned disposable PostgreSQL 15 resource is migrated once with the existing guarded migration producer. Distinct migrator and restricted runtime roles/password files must be attested; both listeners connect to the same migrated database using runtime credentials. Never use the migrator for HTTP service or bypass role verification. Resolve private file authority with existing validators, including shared `MUSIC_TOKEN_CURRENT_SECRET_FILE` and matching key ID/audience/issuer configuration; any previous-key rotation state must agree. Also provide private public-ID HMAC and publication response encryption authority to Music. Distinct auth, cookie and session secrets remain distinct. No signing material reaches Vite, browser storage, stdout or receipts. Canonical issuance is lazy, so successful canonical boot alone does not prove matching signing configuration: ensure followed by a real Music request is mandatory.

## Browser and transport wiring

New Vite config is required: `profile.vite.config.ts` sets `VITE_LOCAL_TUNES_ENABLED=false` and its Tunes URL to an unreachable fixture domain. The Music config should retain ambient env exclusion and strict allocated ports, define enabled Tunes at a real loopback Music origin, proxy canonical `/api` to canonical HTTP, and configure the actual Music HTTP/socket origin used by retained clients. If one web origin proxies Music instead, route `/api/music` ahead of generic canonical `/api` and proxy `/socket.io` with WebSocket support; prove the resolved client origin/path from source before choosing that alternative. Allocate canonical, Music, web and private control ports independently. Set exact trusted browser origin consistently in Better Auth and Music `ALLOWED_ORIGINS`; never weaken origin checks.

Browser authority begins with a real canonical session and `/me`. An owned simulated Google callback through actual auth HTTP is preferred; it is not hosted Google evidence. Any internal adapter session setup must be labelled a fixture seam and cookies must be installed in the browser, followed by real `/me`. Browser clients issue bodyless cookie-authenticated `POST /api/explorers/v1/music/identity/ensure`. Their returned credential drives real Music HTTP; the fixture must not directly mint/install bearer authority. Every owner socket obtains its ticket through `POST /api/music/socket-ticket` with normal owner credential and exact Origin. General HTTP credentials must fail socket handshake; socket tickets must fail owner HTTP. Node observation sockets also use HTTP-minted tickets.

## Proposed exact case inventory

All titles below are proposed top-level titles in `music.spec.ts`, repeated once in each of `music-desktop` and `music-mobile`, with `repeat:0`: 12 titles × 2 projects = 24 identities. Use one worker, zero retries; desktop Chromium and a real mobile Chromium device project. The complete identity tuple is `{file:'explorers-earth/e2e/replatform/music.spec.ts',titlePath:[title],project,repeat:0}`. Freeze these tuples before registration.

| ID | Exact title | Required proof |
|---|---|---|
| M01 | canonical cookie ensure opens one owner workspace and survives reload | Actual ensure, mapping reuse, owner venue and entitlement; no second Tunes login. |
| M02 | owner playlists songs queue playback and history preserve transactions | Create/edit/delete, add/remove/reorder, atomic replace/append, current playback and history; reload persisted state. Reuse database concurrency cases as separate evidence. |
| M03 | foreign playlist song and venue identifiers deny owner access | Owner B cannot read/write A; forged IDs and account replacement cannot leak prior data. |
| M04 | expired owner credential refresh safely replays one mutation | Actual expiry/refresh boundary, stable command ID, no duplicate queue append; HTTP ensure is observed. |
| M05 | transport reconnect mints a new HTTP socket ticket | Drop successful real transport, reopen, observe another ticket request and distinct ticket without saving token bytes; restore state. Failed transport that never opens is not reconnect proof. |
| M06 | browser sign out revokes same session activity and preserves another session | Detailed revocation procedure below. |
| M07 | owner publication replay and stale revisions preserve public state | Repeated publication key returns durable result; changed replay body denied; stale revision conflict leaves draft/current state; notifications after commit only. |
| M08 | guest request owner acceptance and player updates use separate authority | Independent guest context, real capability and socket, request accepted by owner and player update delivered; guest cannot invoke owner controls. |
| M09 | public unlisted and revoked sharing deny hidden data | Public projection, unlisted capability, anonymous denial, revoked sharing and suspension while connected; direct endpoint fetches plus socket payload inspection. |
| M10 | newer public revisions survive delayed and out of order notifications | Monotonic revision, delayed old notification cannot overwrite newer state; refresh and public cache invalidation. |
| M11 | provider outage and retry preserve owner draft and bounded controls | Deterministic unavailable/timeout/rate-limit provider seam, explicit retry, draft preserved, no browser credentials; provider response stubs do not count as live provider success. |
| M12 | origin expiry and guest request limits fail closed | Denied origin, expired authority, guest HTTP/socket limits and bounded invalid event/payload handling; fresh independent context prevents limit state leaking between cases. |

### M06 server revocation procedure

Establish A session S1 in owner browser and a separate valid A session S2 in another browser; validate each with `/me`. Open UI owner socket and a second independent Node socket using a ticket HTTP-minted from S1; keep Node socket outside UI cleanup. Open a third socket from S2 and a guest observer. Perform actual UI Sign out and wait for the auth response and anonymous `/me`; never delete auth_session directly as the acceptance action. Send a valid `player_state` through the still-open S1 observation socket to trigger server recheck. Assert revocation error/disconnect, no player-state delivery to guest during a bounded observation window, and denial of an owner HTTP mutation using the formerly issued S1 credential. Trigger guest_request fanout if needed to exercise recipient recheck and prove S1 receives no event. Assert S2 still executes authorized HTTP and emits a valid update received by the guest, so failure is session scoped. An idle socket is not guaranteed to disconnect instantly: receipt must name event/recipient recheck trigger. Existing direct-session-deletion integration test is a split input, not this proof.

## Registration, commands and receipts

Current supported lifecycle command from `tunes`: `npm run explorers:test:lifecycle-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`.

Current protected aggregate command from repository root: `node scripts/replatform-e2e.mjs --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt <new-owned-absolute-receipt-directory>`. The scope name is a stable compatibility identifier, not a Music-specific flag. It currently has no Music lane; do not run it now expecting combined qualification.

Proposed package script to create and review: `explorers:test:music-browser` -> `tsx scripts/canonical-music-browser-fixture.ts`; after registration its invocation from `tunes` will be `npm run explorers:test:music-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`. This is a proposed command, not currently supported. Implement only existing runner-style acknowledgement and protected receipt arguments (`--receipt-directory`, `--receipt-capability`) with strict parsing. No subset, grep, external-base, worker or retry flags are proposed.

Coordinator registers the 24 tuples, two projects, runner/config/spec and scope contents together; extends Music ambient-authority rejection, protected file inventory, overlays/import closure, package script validation and receipt production. Bind all runtime/auth/music frontend/shared dependencies and migrations, not just these four new files. CI scope and any `music-required` semantics require coordinator decision; the known platform fixture ingress mismatch remains Wave3 work and may not be erased by this local lane.

Each receipt must include integrated SHA and clean/dirty status, exact source and dependency hashes, tool/browser versions, role/schema/environment attestation, case tuples, first failure, attempts and pass/fail/skip counts. Record separate children, starts/stops and cleanup status without cookies/tokens/provider secrets. Existing repository concurrency, publication and socket suites are named supporting inputs; no aggregate across different freezes closes the combined requirement.

## Freeze, cleanup and unresolved inputs

Protected execution acquires exclusive freeze over its complete registered source subtree and dependency inventory. Only disjoint documentation preparation may proceed. No manifest/runtime/config edits during the run; compare provenance before and after each child and lane. Coordinator serializes shared fixture edits and protected execution after lifecycle integration. Required disposable-resource acknowledgement must be obtained before allocation/execution.

Finally close browser contexts and every UI/observation/guest socket, stop Vite, request graceful shutdown of both children, wait with bounded escalation, close listeners/pools/control servers, and destroy only the resource carrying this run's owned marker. Remove private files/capabilities and retain sanitized cleanup failure evidence even if startup or a case failed. Never delete ambient databases or arbitrary paths; validate resolved owned paths before recursive cleanup.

Open decisions: exact child provider-control seam through startCanonicalServer; whether direct Music origin or reviewed route-specific proxy best fits current client resolution; exact fixture feature admission configuration and old unbound credential launch disposition. Source currently accepts preexisting canonical credentials without session binding until their expiry; this compatibility must be documented separately and cannot be represented as session logout revocation. Do not mint such authority in ordinary browser cases. Any compatibility test requires explicit reviewed legacy fixture authority.

Live Google, YouTube/provider success and hosted browser acceptance require configured external environment and authority; deterministic provider faults qualify local containment only. Ticket 6.2/6.3 completion additionally needs their retained repository/security/public qualification and exact-head hosted gates; this card supplies planned local combined proof only. No source code edits, run allocation, commit, push or deployment are authorized by this preparation card.
