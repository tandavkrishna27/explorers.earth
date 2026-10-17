# ADR-004: PostgreSQL with Drizzle ORM

## Status
Accepted (superseded in part by [ADR-005](005-music-identity-migration-deployment-authority.md))

> Historical record: the decision text below is preserved as accepted. ADR-005 is the current authority for Music migrations and immutable deployment.

## Context
tunes needs a relational database for structured data (users, playlists, songs, sessions) with support for complex queries (analytics, aggregations, regional statistics). The ORM choice affects developer experience, type safety, and query performance.

## Decision
Use **PostgreSQL** as the database with **Drizzle ORM** for type-safe database operations.

- PostgreSQL via `@neondatabase/serverless` (supports both Neon cloud and standard PostgreSQL)
- Drizzle ORM 0.39 for query building and schema definition
- Drizzle Kit for schema synchronization (push-based, no migration files)
- `drizzle-zod` for automatic Zod validation schema generation from table definitions

## Consequences

**Easier**:
- Full TypeScript type safety from schema definition through to query results
- Schema defined in code (`shared/schema.ts`) serves as single source of truth
- Drizzle's SQL-like API is intuitive for developers familiar with SQL
- `drizzle-zod` eliminates manual validation schema maintenance
- `db:push` workflow is fast for development (no migration file management)
- PostgreSQL's JSONB support handles flexible data (themes, device info, geo data)

**Harder**:
- Push-based migrations (`db:push`) don't generate reversible migration files — harder to roll back in production
- Drizzle is newer than Prisma/TypeORM — smaller ecosystem and community
- Schema changes require manual coordination for production deployments
- Neon serverless driver has connection pooling considerations

## Alternatives Considered

**Prisma**: More mature ecosystem, better migration tooling with Prisma Migrate. Rejected because Drizzle's SQL-like API was preferred, and Drizzle generates lighter runtime overhead (no Prisma engine binary).

**TypeORM**: Well-established, decorator-based approach. Rejected because it's heavier, less type-safe, and the decorator pattern doesn't align with the project's functional style.

**MongoDB**: NoSQL flexibility. Rejected because the data model is inherently relational (users → playlists → songs, with many-to-many relationships and aggregation queries).
