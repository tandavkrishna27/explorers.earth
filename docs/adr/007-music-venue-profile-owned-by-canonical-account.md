# ADR-007: The Music venue profile is owned by the canonical account; Music `users` is not an identity

## Status

Accepted (2026-10-06)

> Accepted by the repository owner on 2026-10-06, drafted 2026-10-05. This ADR
> refines how [ADR-006](006-canonical-music-identity-supersedes-strapi-proof.md) is
> implemented and does not change ADR-006's decision. It supersedes nothing in
> [ADR-005](005-music-identity-migration-deployment-authority.md): the schema
> model, append-only migrations and deployment authority there remain in force.
>
> Ticket 6.1 implements the Decision below. A writer must not populate a password
> to satisfy a constraint, must not write a Strapi document id during canonical
> provisioning, and must not drop the ownership constraint in decision 5.

## Context

ADR-006 established that Music owner provisioning is reached through a canonical
route that takes its subject from the server-side `Actor`. Implementing ticket 6.1
against that decision ran into the Music schema rather than into wiring, and the
obstruction is informative.

**The Music `users` table is not an identity table. It is a venue record.** It
carries `venue_name NOT NULL`, `guest_url NOT NULL UNIQUE`, `theme`,
`allow_song_requests` and `allow_guest_play_on_device` alongside `username` and
`password` (`tunes/shared/schema.ts:16-29`). Two of its columns make canonical
provisioning impossible as the table stands:

- `password text NOT NULL` (`:18`) — a canonical account is Google-only. Password
  authentication is disabled outright in Better Auth, so there is no password to
  store and nothing that would ever verify one.
- `strapi_user_document_id text NOT NULL UNIQUE` (`:39`) — a canonical account has
  no Strapi identity. The existing provisioning in
  `tunes/server/repositories/musicIdentityRepository.ts` keys on exactly this
  column (`EnsureMusicIdentityInput`, and the match at `:540`), which is why 6.1
  cannot simply re-point it.

**The mapping needed for the alternative already exists.**
`account_music_identity` (`tunes/migrations/0023_explorers_authorization.sql:15-19`)
is `account_id uuid PRIMARY KEY REFERENCES creator_accounts(id)` with
`music_user_id integer NOT NULL UNIQUE REFERENCES users(id)`, and an immutability
trigger rejects every update (`:20-25`). An account-keyed primary key is precisely
the idempotency key a provisioning operation needs, and immutability is exactly the
right rule for a permanent one-account-one-venue relationship.

**The numeric key is load-bearing and should stay.** 16 of the 25 Music tables
reference `users.id`. Re-pointing them at `creator_accounts` would be a large
migration with no product benefit, since the numeric id is an adequate internal
domain key.

**Music is not a content category.** `contentCategorySchema` admits eight
categories and `recommendationCategorySchema` seven; neither includes music
(`tunes/shared/explorersContract.ts:24-25`). Music is a ninth navigation and
visibility surface backed by a separate retained domain — playlists, a queue,
guests, playback and sockets — not an entity-and-recommendation category. The
navigation code reflects this by appending music alongside the eight categories
rather than within them.

## Decision

1. **The canonical account is the sole identity.** `creator_accounts.id`, resolved
   into a server-side `Actor`, is the only principal for Music owner surfaces. A
   row in Music `users` is never an authentication subject, and nothing
   authenticates against it.

2. **A Music `users` row is a venue profile owned by exactly one account.** Its
   meaning is "this account's player configuration": display name, guest URL,
   theme and request rules. `account_music_identity` is the ownership edge, and it
   stays immutable.

3. **Provisioning is keyed on the account, not on any Strapi identifier.**
   `ensureMusicAccount(actor)` is one transaction that creates the venue row and
   the mapping together, made idempotent by the mapping's primary key on
   `account_id`; a concurrent caller loses the insert and reads the winner's row.
   Venue fields are derived deterministically from the Actor and the account
   profile — never supplied by the client, and never guessed from request input.

4. **`users.password` stops being required.** It becomes nullable, and the absence
   of a password is the normal state for a canonically-owned venue. No code path
   may treat a null password as a credential, and none may populate it to satisfy a
   constraint.

5. **`users.strapi_user_document_id` becomes nullable and legacy-only.** It is
   retained for rows that predate the replatform and is never written by canonical
   provisioning. To avoid trading one invariant for no invariant, the dropped
   `NOT NULL` is replaced by a constraint that every venue row is owned by
   something: it must have either a legacy Strapi document id or a row in
   `account_music_identity`. An unowned venue row remains impossible.

6. **The numeric `users.id` remains the internal Music domain key.** The 16
   referencing tables are unchanged. This ADR authorises no foreign-key migration
   of the Music domain.

7. **Music is not modelled as a content category.** It remains a navigation and
   visibility surface with its own domain. Playlists are not recommendations and
   must not be forced into the entity model to achieve uniformity.

## Consequences

**What must change.** One append-only migration, the next id after the current
chain head, relaxing the two `NOT NULL` constraints in decision 4 and 5 and adding
the ownership constraint; a transactional `ensureMusicAccount(actor)` keyed on
`account_id`; and a canonical route consuming `requireActor` that calls it. Nothing
in the Music domain beyond the venue row and the mapping is touched.

**What stays.** ADR-005's migration and deployment authority, unamended. ADR-006's
decision, unchanged — this ADR only removes an obstacle to implementing it. The
retained Music domain, its numeric keys, its guest and socket behaviour, and the
existing immutability trigger.

**Why this is cheaper than the alternatives.** It dissolves the open question that
blocked 6.1 — how a canonical account keys into Music identity — rather than
answering it, because once provisioning is account-keyed there is no Strapi key to
decide about. It also shrinks ticket 8.1, since the Music identity path stops
referencing Strapi at all.

**What this does not do.** It does not migrate historical data; there is none to
migrate. It does not delete the legacy columns or the legacy route, which belong to
ticket 8.1. It does not grant any client the ability to name its own venue
identifiers.

**Evidence that closes it.** The three canonical startup cases already written as a
failing regression; a provisioning test proving two concurrent callers produce one
venue row and one mapping; a proof that a new owner is provisioned with no seeded
row present, since every current mapping insert in the repository is a test fixture;
and a startup proof with no Strapi origin configured at all.

**Residual risk.** Relaxing a `NOT NULL` is a one-way door in a shared schema, so
the ownership constraint in decision 5 is not optional — without it, a failed
provisioning could leave an unowned venue row that no account can reach and no
cleanup path removes.
