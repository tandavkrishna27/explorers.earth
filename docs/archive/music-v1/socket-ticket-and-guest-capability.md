# Music credential, socket ticket and guest capability

All paths and line numbers are as of tag `music-v1-final` (commit `6a00fd83`).

Music had three kinds of authority:

| Authority | Who | Shape | Lifetime |
|---|---|---|---|
| Music credential | venue owner, HTTP | HS256 JWT-shaped token | exactly 600 s |
| Socket ticket | venue owner, Socket.IO handshake only | same token format, `purpose:"music-socket"` | exactly 60 s |
| Guest capability | anyone holding an unlisted share link | 43-char base64url random string | until rotated/revoked |

## 1. Music credential (owner bearer)

Source: `tunes/server/services/musicTokenService.ts`.

### Format

`base64url(header) . base64url(claims) . base64url(HMAC-SHA256(secret, "<h>.<c>"))`.
No padding. The HMAC key is the base64url-**decoded** secret (`:375-377`).

- Header, exactly: `{"alg":"HS256","kid":<kid>}`. `kid` matches
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`.
- Required claims (`:85-86`): `iss` = `"explorers-tunes"`, `aud` = `"music-api"`,
  `sub`, `jti` (16 random bytes as 32 lowercase hex), `iat`, `exp` (Unix seconds),
  `sessionVersion` (integer >= 1).
- Optional claims (`:87`): `subjectKind` (only `"canonical-account"`),
  `purpose` (only `"music-socket"`), `sid` + `uid` (both or neither,
  `^[A-Za-z0-9_-]{8,128}$`, canonical subjects only).
- Any other key, a duplicate key, a backslash in the JSON, or non-canonical
  base64url is rejected (`decodeStrictObject`, `:352-369`).

### Subject (ADR-008)

- `subjectKind` absent: `sub` is a legacy Strapi user document ID, resolved via
  `MusicIdentityRepository`.
- `subjectKind: "canonical-account"`: `sub` is the canonical account UUIDv4. It
  is resolved **only** through `account_music_identity` to a venue `users` row,
  never through the legacy path (`tunes/server/middleware/musicPrincipal.ts:184-234`).
  The kind is explicit so that a UUID-shaped Strapi ID is never resolved against
  the wrong table.
- Minted by `POST /api/explorers/v1/music/identity/ensure`
  (`tunes/server/routes/explorersMusicIdentityRoutes.ts:31-80`), which requires an
  exact-origin canonical web session. It calls `mintCanonical` with the venue's
  `users.session_version` and binds `sid`/`uid` to the Better Auth session. The
  legacy `POST /api/music/identity/ensure` used `mint()` with a Strapi subject.

### Verification (`decode`, `:251-273`; `validateClaims`, `:311-350`)

1. Length 64..4096 and three non-empty segments. Header `alg` must be `HS256`.
2. Pick the key by `kid`: current, or previous while `now < acceptUntil`.
3. Constant-time comparison of the base64url signature strings.
4. Claim checks. `exp - iat` must **equal** 600 (credential) or 60 (ticket).
   `iat <= now + skew`. Expired when `now >= exp + skew` -> `TOKEN_EXPIRED`.
   Everything else -> `TOKEN_INVALID`.
5. `verify` / `verifyContext` refuse any token with a `purpose`, so HTTP never
   accepts a socket ticket.

After the signature checks, `MusicPrincipalService.resolveSubject`
(`musicPrincipal.ts:144-174`) checks database state on **every request**: the
signing key is still accepted, the identity exists and is not tombstoned (else
`TOKEN_REVOKED`), it is not `suspended` (403) or `pending_deletion` (409), the
claimed `sessionVersion` equals the stored one (else `TOKEN_REVOKED`), and, for a
canonical credential with `sid`/`uid`, the Better Auth session row still exists
(so logout revokes). The `jti` is never stored or checked, so it gives no replay
protection. Revocation works by bumping `users.session_version`, deleting the
session, or rotating keys.

HTTP transport: exactly one `Authorization: Bearer <a.b.c>` header
(`musicPrincipal.ts:237-268`). Mutations also need an exact `Origin` allowlist
match (`musicSurfaceRoutes.ts:165-166`).

### Configuration (`tunes/server/config/music-identity-config.ts:503-565`)

| Variable | Rule |
|---|---|
| `MUSIC_TOKEN_CURRENT_KID` | required, kid pattern above |
| `MUSIC_TOKEN_CURRENT_SECRET_FILE` | live mode: must be a secure file; inline `MUSIC_TOKEN_CURRENT_SECRET` is fixture-only. Value: canonical base64url, >= 32 decoded bytes |
| `MUSIC_TOKEN_PREVIOUS_KID`, `..._PREVIOUS_SECRET[_FILE]`, `..._PREVIOUS_ACCEPT_UNTIL` | all or none. `ACCEPT_UNTIL` is an exact `YYYY-MM-DDTHH:MM:SS.mmmZ` instant, no later than now + (600 + skew) s. Previous kid must differ from current |
| `MUSIC_TOKEN_LIFETIME_SECONDS` | must be exactly `600` |
| `MUSIC_TOKEN_CLOCK_SKEW_SECONDS` | integer 0..30 |

Rotation is verifier-first: add the next key as verifiable, start minting with
it, wait the maximum TTL plus skew, then remove the old key.

## 2. Socket ticket

Purpose (ticket 6.3): the socket used to accept the same 600 s owner bearer, so a
leaked handshake value meant 10 minutes of full owner HTTP access. The fix was a
separate, short-lived, non-interchangeable ticket.

### Minting

`POST /api/music/socket-ticket` (`tunes/server/routes/musicSurfaceRoutes.ts:341-359`).
It requires a valid owner credential and an exact Origin (the `mutation` chain)
and takes no body. It calls `MusicTokenService.mintSocketTicket`
(`musicTokenService.ts:160-177`) with the principal's `subject`,
`sessionVersion`, `subjectKind`, and `sid`/`uid` when present. These are
**inherited** from the credential, so the same logout revokes both.

Response:

```json
{ "version": "music-socket-ticket/v1",
  "ticket": { "token": "<h.c.s>", "expiresAt": <epoch ms> } }
```

### Contents

Same token format and the same current signing key as the credential. It has the
required claims plus `purpose: "music-socket"`, and `exp = iat + 60`
(`SOCKET_TICKET_LIFETIME_SECONDS`, a constant, `:95`). It has no `musicUserId`
claim.

### Single-use?

**No.** Nothing records a ticket's `jti`, so a ticket can open any number of
handshakes until it expires (60 s plus up to 30 s skew). It is protected by being
short-lived and by working only for the handshake, not by being single-use. The
client mints a fresh ticket for every connection attempt
(`explorers-earth/src/hooks/useTunesDashboard.ts:108-120`).

### Verification and connection lifetime

- Handshake: `socket.handshake.auth.token`. The server calls
  `MusicPrincipalService.resolveSocketTicket`, which accepts only
  `purpose === "music-socket"` (`musicTokenService.ts:236-240`) and then runs the
  full identity resolution.
- The connection keeps **only** `{sub, sessionVersion, subjectKind?, sid?, uid?, signingKeyId}`.
  It does not keep the token, expiry, audience or purpose
  (`musicPrincipal.ts:100-119`).
- Re-checks (`recheck` -> `resolveSubject`) run without checking the token's
  expiry, so a 60 s ticket can open a long-lived connection. They run on
  `connection` (before and after joining the room), on every owner
  `player_state`, before every delivery to an owner room, and on public-change
  fan-out. A re-check fails if the signing key has rotated out, the identity is
  revoked/suspended/pending deletion, `sessionVersion` has been bumped, or the
  canonical session has been deleted (logout).
- `MusicOwnerSocketRegistry` (`tunes/server/socket/musicSocketServer.ts:15-58`)
  can also force-disconnect one owner (lifecycle `disconnectOwner` bumps a
  per-owner epoch) or everyone (admission epoch).

## 3. Guest capability

### What it is

A bearer secret that grants guest access to one venue's **unlisted** publication.
Each venue `users` row has at most one live capability.

### Issue

- `createGuestCapability()` = `randomBytes(32).toString("base64url")`. That is 256
  bits, exactly 43 chars, matching `^[A-Za-z0-9_-]{43}$`
  (`tunes/server/policies/musicSurfacePolicy.ts:32-34`).
- It is generated only when the owner sets publication mode `unlisted` via
  `POST /api/music/publication`
  (`musicPublicationOperationRepository.ts:197-216`). Each new unlisted command
  creates a **new** capability, which replaces (rotates) the stored hash.
  Replaying the same idempotency key returns the original capability from the
  encrypted response and does not rotate it (see
  [share-key-format.md](share-key-format.md)).
- The plaintext is returned once, in the `capability` field of the response. The
  owner UI builds the share link
  `https://<origin>/music/share/<publicSlug>#access=<capability>`
  (`explorers-earth/src/components/MusicDashboard.tsx:278-280`). It sits in the
  URL **fragment**, so it is never sent to a server in a URL.
- The guest page (`explorers-earth/src/pages/public/PublicMusic.tsx:15-38,175-189`)
  reads `#access=`, stores it in `sessionStorage` under
  `explorers.music.unlisted-capability.v1:<publicSlug>`, and strips the fragment
  with `history.replaceState`.

### Storage (hash only)

`hashGuestCapability(c)` = `SHA-256(c as UTF-8)` as 64 lowercase hex. There is
**no key and no salt** (`musicSurfacePolicy.ts:36-38`). Unkeyed hashing is
acceptable because the input is 256 random bits. Columns on `users`
(`tunes/shared/schema.ts:67-71`):

- `guest_capability_hash text NOT NULL UNIQUE`
- `guest_capability_issued_at`, `guest_capability_rotated_at`,
  `guest_capability_revoked_at`
- `guest_discoverable boolean`: `true` means public, so no capability is needed.

The column is NOT NULL, so canonical provisioning seeds it with the hash of a
random 32-byte secret that is immediately discarded
(`tunes/server/music/accountMusicRepository.ts:72,88`). That capability exists
but nobody can present it.

### Verification

`verifyGuestCapability(c, expectedHash)` (`musicSurfacePolicy.ts:40-45`) checks
both formats, recomputes the hash, and compares the 32-byte digests with
`timingSafeEqual`. Every caller first looks up the row by
`guest_capability_hash = hash(c) AND guest_capability_revoked_at IS NULL` (plus
`identity_status='active'` and public availability), then calls `verify...` on
the row. Examples: `resolveGuestSocketAuthority`
(`tunes/server/repositories/musicDomainRepository.ts:1544-1555`) and
`resolveGuestRequestAuthority` (`:1557-1572`).

Transport:

- HTTP: header `X-Music-Guest-Capability` on `GET /api/playlist/:guestUrl`,
  `GET /api/music/public-resource/v1/:publicSlug`,
  `POST /api/playlist/:guestUrl/requests` and the guest YouTube lookups
  (`musicSurfaceRoutes.ts:197-219,583-661,1005-1015`). A capability never
  authorizes through a URL path or query. Unlisted responses set
  `X-Robots-Tag: noindex, nofollow`. A failed check returns
  `GUEST_CAPABILITY_INVALID` (403 on HTTP) or the same safe 404 that an unknown
  resource gets.
- Socket: `handshake.auth.guestCapability`, either alone (`guest` role) or with
  `auth.publicSlug` (`public` role). See below.

The rate-limit keys use the capability hash, never the plaintext.

### Revocation

- Setting mode `private` or `public` sets `guest_capability_revoked_at = now`.
- `revokeGuestCapability` sets the revoke time and `guest_discoverable=false`.
  `rotateGuestCapability(hash)` swaps in a new hash
  (`musicDomainRepository.ts:1165-1222`).
- Every change advances the public snapshot revision (`publication_changed`). The
  socket fan-out then re-checks each public/guest socket and disconnects any
  whose authority is gone (`musicSocketServer.ts:176-188,227-263`).

## 4. Socket.IO server summary (`tunes/server/socket/musicSocketServer.ts`)

- Path `/ws`, transports websocket+polling, `maxHttpBufferSize` 64 KiB.
  `Origin` must exactly match `ALLOWED_ORIGINS` (checked in `allowRequest` and
  again in the middleware).
- Handshake `auth` must contain **exactly one** of these modes (`:271-275`):
  `{token}` (owner ticket), `{publicSlug, guestCapability?}` (public/unlisted
  viewer), or `{guestCapability}` (guest).
- Rooms: `music-owner:<id>`, `music-guest:<id>`, `music-public:<id>`.
- Client events: only `player_state` (owner only, payload
  `{playing, position?, externalId?}`, relayed to the guest room) and
  `guest_request` (guest only, needs `allowSongRequests`, payload
  `{type:"song", externalId}`, relayed to the owner room). Anything else returns
  `SOCKET_EVENT_FORBIDDEN`. Each payload is at most 2048 bytes. Rate limit:
  10 events per 60 s per (authority rate key + address), with at most 1024
  tracked keys.
- Server events: `connection_status`, `music_error` (a `music-error/v1`
  envelope), `music_owner_change` / `music_public_change`
  (`{version, kind, revision}`), `guest_request_status`.
- Every delivery re-checks the recipient's authority (`emitToAuthorizedRecipients`).

Narrative sources: `docs/architecture/music-identity.md`;
`docs/api/music-identity-contract.md` ("Token and capability lifecycle"); ADR-008
(in `adr/`).

### Doc/code discrepancy noted at the tag

`docs/architecture/music-identity.md` ("Credential boundary") says the credential
carries `nbf` and a numeric `musicUserId` claim. The code at the tag has neither:
`CLAIM_KEYS`/`OPTIONAL_CLAIM_KEYS` reject both. Trust the code.
