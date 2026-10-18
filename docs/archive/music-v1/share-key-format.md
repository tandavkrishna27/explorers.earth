# `tunes-share-v1` key format

All paths and line numbers are as of tag `music-v1-final` (commit `6a00fd83`).

## What it is (and is not)

A `tunes-share-v1-...` string is the **client-generated idempotency key for one
publication ("sharing") command**, `POST /api/music/publication`. It is sent in
the `Idempotency-Key` request header.

It is **not signed, not MACed and not a credential.** It carries no authority: the
owner is authenticated separately by the Music bearer credential, and the guest
authority for an unlisted share is a separate random **guest capability** (see
[socket-ticket-and-guest-capability.md](socket-ticket-and-guest-capability.md)).
The key's only jobs are to (a) let a retried command replay the original response
byte-for-byte, and (b) carry an issue timestamp so stale keys can be retired.

The name "share" comes from the product UI ("Share" = choose `private` /
`unlisted` / `public`).

## Exact structure

```
tunes-share-v1-<issuedAtMs>-<uuidv4>
```

| Part | Format |
|---|---|
| prefix | literal `tunes-share-v1-` (15 chars). `v1` is the only version; there is no negotiation. |
| `issuedAtMs` | exactly 13 decimal digits: client Unix epoch **milliseconds** at creation. Must be a safe integer > 0. |
| separator | `-` |
| `uuidv4` | RFC 4122 version-4 UUID, 36 chars, hyphenated: `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`. |

Total length is exactly **65** characters. Plain ASCII; no encoding (no base64, no
JSON).

Canonical regex — `tunes/shared/musicPublicationContract.ts:7-8`:

```
/^tunes-share-v1-(\d{13})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
```

Matching is case-insensitive, but the creator lower-cases the UUID
(`createMusicPublicationIdempotencyKey`, `:10-15`). The OpenAPI parameter repeats
the same pattern with explicit `[0-9A-Fa-f]` classes and `minLength`/`maxLength`
65 (`tunes/server/routes/musicOpenApiRoutes.ts:106-115`).

Example shape: `tunes-share-v1-1777000000000-11111111-2222-4333-8444-555555555555`
(this exact value is a test fixture in `explorers-earth/e2e/music-harness-contract.spec.ts`).

### Creation

`createMusicPublicationIdempotencyKey(Date.now(), crypto.randomUUID())` — called by
`explorers-earth/src/features/music/musicPublicationCommandRegistry.ts:39` and
`tunes/client/src/lib/musicPublicationCommandRegistry.ts:31`. The browser keeps a
pending command (scope, mode, key, phase) in memory and in `sessionStorage` under
`explorers-music-publish/v1:[userDocumentId,accountDocumentId]`
(`explorers-earth/src/features/music/musicPublishOperationStore.ts`), so a retry
after reload reuses the same key.

Side note: `PublicMusicRequest.tsx:95` also builds guest song-request idempotency
keys as `tunes-share-v1-${Date.now()}-${uuid}`. That route only checks the opaque
pattern `^[A-Za-z0-9._:-]{8,128}$` (`musicSurfaceRoutes.ts:637`), so the prefix
means nothing there.

## Validation / time window

Constants, `musicPublicationContract.ts:3-5`:

| Constant | Value |
|---|---|
| `MUSIC_PUBLICATION_IDEMPOTENCY_RETENTION_MS` | 30 days |
| `MUSIC_PUBLICATION_REPLAY_WINDOW_MS` | 24 hours |
| `MUSIC_PUBLICATION_IDEMPOTENCY_FUTURE_SKEW_MS` | 5 minutes |

1. **Route gate** (`tunes/server/routes/musicSurfaceRoutes.ts:523-532`). Body must
   be exactly `{ "mode": "private" | "unlisted" | "public" }`, and
   `isMusicPublicationIdempotencyKeyCurrent(key, appNow)` (`contract :24-30`)
   must hold:
   `now - 30d - 24h < issuedAtMs <= now + 5min`, using the application clock.
   Otherwise `400 REQUEST_INVALID`. The extra 24 h lets a key issued just before
   the 30-day cutoff still use its full replay window.
2. **Repository** (`tunes/server/repositories/musicPublicationOperationRepository.ts:57-257`),
   in one transaction, using **PostgreSQL's** `clock_timestamp()` as the time
   authority:
   - global advisory lock `0x4d5047`, then per-owner lock `(0x4d50, musicUserId)`;
   - look up the live row in `music_publication_operations` by
     `(music_user_id, idempotency_key_hash)`. Different mode/fingerprint ->
     `conflict` (409 `IDEMPOTENCY_CONFLICT`). Expired -> shred and `expired`
     (409 `PUBLICATION_REPLAY_EXPIRED`). Otherwise decrypt and replay the stored
     response;
   - otherwise check the archive (`music_lookup_publication_operation_archive`).
     Same request -> `expired`, different request -> `conflict`;
   - with no history: `issuedAtMs > dbNow + 5min` -> `invalid` (400);
     `issuedAtMs <= dbNow - 30d` -> `expired`. So a key older than 30 days can
     never start a new operation, even after its archive row is purged;
   - quotas: at most 100 live completed operations per owner and 10 000
     globally, otherwise 429 with `Retry-After`.

## What is hashed, and with what

Raw keys are never stored. Both hashes are plain SHA-256 with domain separation
and **no secret key** (`tunes/server/services/musicPublicationResponseCrypto.ts:52-63`):

| Value | Computation | Output |
|---|---|---|
| `idempotency_key_hash` | `SHA-256("explorers.music.publication.idempotency-key/v1\0" ‖ key)` (UTF-8) | 64 lowercase hex |
| `request_fingerprint` | `SHA-256("explorers.music.publication.request/v1\0mode=" ‖ mode)` | 64 lowercase hex |

## Encrypted replay response (the only keyed crypto)

The command's response is stored encrypted so a replay can return it, including
the one-time unlisted guest capability, without keeping that capability in
plaintext.

- Response plaintext: JSON of
  `{"version":"music-publication/v1","publication":{"mode":M,"publicSlug":S}}`,
  plus `"capability": <43-char base64url>` **only** for `unlisted`
  (`musicPublicationOperationRepository.ts:230-234`). The client parser requires
  exactly those keys (`musicPublicationContract.ts:50-86`). `publicSlug` matches
  `^[A-Za-z0-9_-]{8,128}$`.
- Cipher: **AES-256-GCM**, 12-byte random nonce, 16-byte tag; ciphertext 1..4096
  bytes (`musicPublicationResponseCrypto.ts:78-125`).
- AAD: UTF-8, newline-joined (`:142-151`):
  ```
  explorers.music.publication.response-aead/v1
  schema=music-publication/v1
  owner=<musicUserId>
  operation=<idempotency_key_hash>
  request=<request_fingerprint>
  kid=<key id>
  ```
- Stored columns: `response_key_id`, `response_nonce`, `response_ciphertext`,
  `response_tag`; `expires_at = transaction_timestamp() + 24h`.
- Keyring: `MUSIC_PUBLICATION_RESPONSE_CURRENT_KID` plus
  `MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE`. The file holds canonical
  base64url 256-bit key material (43 chars -> 32 bytes). There is an optional
  previous KID/key-file/`..._PREVIOUS_ACCEPT_UNTIL` (exact UTC ISO instant), with
  overlap > 0 and <= 24 h. Inline keys are forbidden in live mode. Key IDs and
  material must differ from every other Music authority, including the token keys
  (`tunes/server/config/music-identity-config.ts:256-336`). Fixture mode accepts
  only one hard-coded fixture KID/key pair defined in source; those values are
  for testing only and are not repeated here.
- At startup `verifyReplayReadiness()` decrypts one live row per key ID and
  refuses to boot if any live row cannot be decrypted with the configured keys
  (`musicPublicationOperationRepository.ts:259-310`; called from
  `tunes/server/routes/index.ts:142`).

## Lifecycle of an operation row

`completed` (encrypted response present, 24 h) -> `replay_expired` (encrypted
fields NULLed and `shredded_at` set, by `shredExpiredResponses` or lazily on
access) -> compacted into an immutable archive by
`music_compact_publication_operations(limit)` -> archive rows purged after
30 days. Migrations: `tunes/migrations/0011_durable_publication_idempotency.sql`,
`0012_publication_replay_expiry_guard.sql`,
`0013_publication_operation_database_clock.sql`,
`0015_publication_operation_archive.sql`,
`0016_publication_operation_retention.sql`,
`0017_publication_idempotency_key_retirement.sql`.

## Versioning

- `tunes-share-v1` is the key-format version. Any other prefix or shape fails the
  regex and returns 400. There was no v2.
- `music-publication/v1` is the response schema version, also bound into the
  AAD.
- `.../idempotency-key/v1`, `.../request/v1` and `.../response-aead/v1` are the
  hash and AEAD domain-separation versions. Changing any of them makes all
  existing rows unmatchable or undecryptable.

Narrative source: `docs/architecture/music-identity-decisions.md`, section
"Publication command idempotency", and `docs/api/music-identity-contract.md`
(lines 23-31).
