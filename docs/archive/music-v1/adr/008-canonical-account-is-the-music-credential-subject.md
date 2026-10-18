# ADR-008: The canonical account id is the Music credential subject

## Status

Accepted (2026-10-06)

> Decision taken by the repository owner on 2026-10-06: the Music credential's
> subject becomes the canonical account id. This ADR records that decision and the
> implementation shape, because it changes the Music authorization boundary.
> It refines [ADR-007](007-music-venue-profile-owned-by-canonical-account.md) and
> does not alter [ADR-006](006-canonical-music-identity-supersedes-strapi-proof.md).

## Context

ADR-007 made a Music `users` row a venue profile owned by a canonical account, and
relaxed `password`, `strapi_user_document_id` and `strapi_account_document_id` so a
Google-only account can be provisioned. Migration 0039 implements that.

Ticket 6.1 then has to hand the browser a Music credential, and the credential is
Strapi-shaped end to end:

- `musicTokenService.mint()` sets `sub: identity.strapiUserDocumentId` and refuses
  to mint unless that value matches `SUBJECT_PATTERN`.
- `MusicIdentityProjection` requires `strapiUserDocumentId` and
  `strapiAccountDocumentId` as non-optional strings.
- `musicIdentityRepository.resolveCredentialSubject(sub)` resolves the subject with
  `LEFT JOIN users u ON u.strapi_user_document_id = requested.subject`.
- `musicPrincipal` rejects the request unless
  `identity.strapiUserDocumentId === claims.sub`.

A canonically-provisioned venue has NULL in both columns by ADR-007's design, so
that last check can never pass for a canonical owner. This is the gap between
ADR-007, which fixed the table, and ticket 8.1, which retires the legacy columns
and route.

Two facts shaped the implementation below. First, `users.session_version` is
`NOT NULL DEFAULT 1`, so a canonically-provisioned row is already mintable without
extra work. Second, `strapiUserDocumentId` and `strapiAccountDocumentId` are read
in 44 places across 7 server files, six of which are under 100%-per-file coverage
thresholds in `test:music-critical-coverage`. Widening
`MusicIdentityProjection` to nullable would therefore ripple through the entire
retained Music domain, including the deletion saga, and every new branch would have
to be driven to full coverage.

## Decision

1. **The canonical account id is the credential subject.** For an owner provisioned
   through the canonical route, the token carries `sub = creator_accounts.id`.
   `SUBJECT_PATTERN` already admits a UUID, so the token format is unchanged.

2. **The subject's kind is explicit, never inferred from its shape.** The token
   carries a `subjectKind` claim of `"canonical-account"`. A token without the claim
   is a legacy Strapi-subject token. We do not decide what a subject means by
   testing whether it looks like a UUID: a Strapi document id that happened to be
   UUID-shaped would otherwise be resolved against the wrong table.

3. **The canonical path is additive, not a widening of the legacy types.**
   `MusicIdentityProjection` keeps its non-optional Strapi fields and its 44 call
   sites keep their guarantees. The canonical path gets its own small surfaces: a
   mint entry taking the account id, venue id and session version, and a repository
   read that resolves an account id through `account_music_identity`. This keeps the
   new branches independently coverable and leaves the retained Music domain,
   including the deletion saga, untouched.

4. **`musicPrincipal` dispatches on the claim, and each branch proves ownership.**
   A legacy token keeps the existing check. A canonical token is accepted only when
   `account_music_identity` maps that exact account to that exact venue row. Neither
   branch may fall through to the other on failure.

5. **Canonical owner deletion records retirement through the account operation.**
   Corrected2026-10-09 against integrated `3e5113c0`: migration0042 already implements
   `finalize_canonical_music_venue_deletion(integer,text,text)`, authorizing release only
   for the pending account deletion that owns the venue. The retained account deletion
   operation records finalization. Canonical owners have no Strapi-keyed tombstone:
   `music_identity_tombstones` requires external document IDs, and no synthetic IDs or
   widening of the legacy lifecycle tables is authorized by this decision.

   **Numeric retirement has a separate append-only implementation in0052.** The integrated
   baseline0040–0042 did not retain canonical numeric IDs. Migration0052 adds immutable
   canonical numeric retirement linked to the retained account deletion operation, numeric
   advisory locking before finalization, both-identity INSERT nonreuse and immutable numeric
   keys on UPDATE. Runtime cannot update, delete or truncate retirement history. This does
   not manufacture Strapi IDs or backfill unrecorded historical releases. Source/static
   review and exact-head hosted PostgreSQL regressions pass at1f4ce7bf; browser and release
   qualification remain required before claiming ticket6.4 acceptance. See [the B1 implementation record](../replatform-audit/numeric-retirement-implementation-2026-10-09.md) and
   [the integrated lifecycle preflight](../replatform-audit/lifecycle-preflight-3e5113c0.md).

6. **The canonical API app issues Music credentials.** The canonical session and the
   account-to-venue mapping both live there, so it is the natural issuer, and it now
   holds the Music token signing secret in addition to the Music app. The alternative
   - having the Music app validate the canonical session - would have given the Music
   app the Better Auth session secret and a dependency on the auth stack, reintroducing
   the cross-app session trust ADR-006 removed.

   The issuer is resolved on **first use, not at boot**. A missing or invalid Music
   authority fails this one route closed with a 503; it does not stop accounts,
   profiles or recommendations from mounting, and it does not silently serve a 404.
   Eager resolution was written first and rejected: it made the whole canonical API
   app refuse to start without Music configuration, which contradicts the standing
   rule that optional Music configuration must not prevent unrelated routes mounting.

   The route is classified `explorers-owner` in `musicSurfacePolicy`. Without that it
   falls through to the fail-closed `tombstone` default, which would have recorded an
   owner-authenticated route in the generated authorization matrix as having no owner
   source - accurate as a default, wrong as documentation.

## Consequences

**What this unblocks.** Ticket 6.1 can issue a credential for a canonical owner,
which makes `musicIdentityCoordinator.reconcile()` succeed, which makes
`isReadyFor()` true, which finally enables the Music publication controls. Three red
CI lanes depend on exactly that chain.

**What stays.** The legacy Strapi subject path, unchanged, until ticket 8.1 retires
it. The token format, issuer, audience, lifetime and signing. The numeric
`users.id` as the internal Music domain key. Credential revocation, which is keyed
on `musicUserId` and `sessionVersion` and so is already subject-agnostic.

**The risk this carries.** It is an authorization boundary. The failure mode to
guard against is a canonical token resolving to a venue its account does not own, or
a legacy token being accepted through the canonical branch. Decisions 2 and 4 exist
for that reason: the subject kind is explicit, and each branch independently proves
the mapping. A brief mixed fleet of old and new tokens is expected and safe, since
credentials are short-lived and `verify` accepts a token with no `subjectKind` as
legacy.

**What it does not do.** It does not delete the legacy columns, the legacy route or
the Strapi proof exchange — all ticket 8.1. It does not give canonical owners a
tombstone, per decision 5. It does not change what a client may ask for: the subject
still comes from the server-side `Actor`, never from request input.

## Alternatives Considered

**Numeric `users.id` as the subject.** Smallest change, since the lookup already has
that key. Rejected: ADR-007 states the numeric id is an internal domain key and
explicitly not an identity, and a short enumerable integer is a weaker token subject
than a UUID.

**Widen `MusicIdentityProjection` to nullable Strapi fields.** The obvious shape,
and rejected on cost and risk: 44 call sites across 7 files, six under
100%-per-file coverage thresholds, including the deletion saga. It would also make
"this identity has no Strapi id" an everywhere-concern rather than a property of one
new path.

**Synthesise a Strapi-shaped id for canonical owners.** Rejected outright: ADR-006
and ADR-007 forbid writing a Strapi document id during canonical provisioning, and a
fabricated identifier would corrupt the one remaining legacy invariant.

**Defer the whole credential subject to ticket 8.1.** Honest about where the work
belongs, and the reason it was not chosen is that it leaves three CI lanes and
`replatform-required` red until 8.1 lands, blocking PR #119 for far longer.
