# ADR-005: Canonical Music identity, migrations, and deployment authority

## Status
Accepted (superseded in part by [ADR-006](006-canonical-music-identity-supersedes-strapi-proof.md))

> Scope of the supersession (2026-10-05): ADR-006 replaces the identity-issuance
> decision below — the bodyless proof boundary and the three distinct credential
> scopes. Music owner provisioning and owner HTTP now go through a canonical
> session route. Everything else in this ADR remains the current authority and is
> unamended: the schema model, reviewed append-only SQL migrations with their
> manifest and checksums, no schema creation at startup, and build, promotion and
> rollback bound to immutable image digests.

## Context

ADR-002 selected independent authentication patterns for the original standalone
applications. ADR-004 selected PostgreSQL and Drizzle with implicit schema
synchronization. Embedded Music now spans Explorer identity, a Tunes-owned
principal, an append-only production schema, and immutable image promotion.

## Decision

Explorer authentication and selected Account context are verified only at the
bodyless `POST /api/music/identity/ensure` boundary. Tunes projects that identity
to one numeric principal and returns a short-lived Music credential. Canonical
owner routes accept only that credential; native Tunes sessions remain confined
to their standalone endpoints.

`tunes/shared/schema.ts` is the type-safe schema model. The reviewed append-only SQL migrations, migration manifest, checksums, and expected chain are deployment authority. Application startup never creates or synchronizes schema.

Images are built once by the protected workflow, identified by immutable image digest and full commit, migrated and readied from the same image, and promoted or
rolled back only through the authenticated deployment runbook and security/schema
floors.

## Consequences

- Embedded ownership is deterministic across mutable profile fields.
- Session, Explorer bearer, and Music credential scopes stay distinct.
- Every production schema change has a reviewable, checksummed history.
- Builds and rollbacks are bound to exact retained image digests.
- The original ADR-002 and ADR-004 text remains historical context, not active
  embedded-Music or deployment guidance.

## Supersedes

This decision supersedes ADR-002 only for embedded Music identity/credential
authority and ADR-004 only for Music migration/deployment authority. Their
standalone authentication and PostgreSQL/Drizzle choices remain accepted.
