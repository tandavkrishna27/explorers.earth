# Architecture Decision Records (ADRs)

## What Are ADRs?

Architecture Decision Records capture important architectural decisions made during the project, along with their context and consequences. They help future developers (and AI agents) understand **why** things are built the way they are.

## Index

| ADR | Decision | Status |
|-----|----------|--------|
| [001](001-monorepo-structure.md) | Monorepo structure for explorers-earth and tunes | Accepted |
| [002](002-auth-strategies.md) | Different auth strategies per app (JWT vs sessions) | Superseded in part |
| [003](003-realtime-websockets.md) | Socket.IO for real-time communication | Accepted |
| [004](004-database-orm-choice.md) | PostgreSQL with Drizzle ORM | Superseded in part |
| [005](005-music-identity-migration-deployment-authority.md) | Canonical Music identity, migrations, and deployment authority | Superseded in part |
| [006](006-canonical-music-identity-supersedes-strapi-proof.md) | Canonical session ensure for Music identity, superseding ADR-005's Strapi proof boundary | Accepted |
| [007](007-music-venue-profile-owned-by-canonical-account.md) | Music venue profile owned by the canonical account; Music `users` is not an identity | Accepted |
| [008](008-canonical-account-is-the-music-credential-subject.md) | Canonical account id is the Music credential subject | Accepted |

> **Decision recorded (2026-10-05).** ADR-006 is **Accepted**. It supersedes ADR-005's identity-issuance decision only — the bodyless proof boundary and its three distinct credential scopes — and ADR-005 stays the current authority for the schema model, append-only migrations, deployment authority and image-digest promotion. ADR-005's status row above reads "Superseded in part" accordingly, following the precedent of [002](002-auth-strategies.md) and [004](004-database-orm-choice.md). Ticket 6.1 is unblocked: a writer implementing it follows ADR-006, and must not reinstate the Strapi proof exchange or mint a fixture proof to work around it.

> **Decision recorded (2026-10-06).** ADR-007 is **Accepted**. It does not change ADR-006's decision; it removes the
> schema obstacle to implementing it, after ticket 6.1's source trace found that Music `users` requires a password and a
> unique Strapi document id that a Google-only canonical account cannot supply. The canonical account is the sole
> identity; a Music `users` row is a venue profile owned by exactly one account. Ticket 6.1 is now a bounded package:
> one append-only migration plus a transactional `ensureMusicAccount` keyed on `account_id`. The 16 of 25 Music tables
> that reference `users.id` are deliberately untouched — no foreign-key migration is authorised.

## Template

When creating a new ADR, use this template:

```markdown
# ADR-NNN: Title

## Status
Accepted | Superseded | Deprecated

## Context
What is the issue or situation that motivates this decision?

## Decision
What is the change that we're making?

## Consequences
What becomes easier or harder as a result?

## Alternatives Considered
What other options were evaluated and why were they rejected?
```

## Guidelines

- Number ADRs sequentially (001, 002, ...)
- ADRs are immutable once accepted — if a decision changes, create a new ADR that supersedes the old one
- Keep ADRs concise — focus on the "why" not the "how"
- Add new ADRs when making significant architectural decisions
