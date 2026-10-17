# explorers.earth Documentation

Comprehensive documentation for the explorers.earth monorepo containing two applications: **explorers-earth** (location sharing platform) and **tunes** (collaborative music playlist platform).

## Quick Reference

| Question | Document |
|----------|----------|
| How do I set up the project? | [Getting Started](getting-started.md) |
| What env vars do I need? | [Environment Variables](environment-variables.md) |
| How is the codebase structured? | [Architecture](architecture.md) |
| How do I contribute? | [Contributing](contributing.md) |
| How do I run tests? | [Testing](testing.md) |
| Something isn't working | [Troubleshooting](troubleshooting.md) |

## Documentation Index

### Core

- [Architecture](architecture.md) — Monorepo structure, app relationships, shared patterns, data flow
- [Getting Started](getting-started.md) — Prerequisites, installation, running both apps
- [Environment Variables](environment-variables.md) — All env vars for both apps in one place
- [Contributing](contributing.md) — Branch strategy, code style, PR process
- [Testing](testing.md) — Testing strategy, how to run tests
- [Troubleshooting](troubleshooting.md) — Common issues and solutions

### explorers-earth (Location Sharing Platform)

- [Overview](explorers-earth/overview.md) — Features, frontend architecture, routing
- [Media Features](explorers-earth/media-features.md) — Movies, Books, Games — APIs, slug prefixing strategy, architecture
- [Strapi API Reference](explorers-earth/strapi-api.md) — CMS API endpoints (REST docs + GraphQL playground)
- [Deployment](explorers-earth/deployment.md) — Netlify configuration and production builds
- [Integrations](explorers-earth/integrations.md) — Google Maps, Strapi CMS, OAuth, Analytics, TMDB, IGDB, Google Books
- [State Management](explorers-earth/state-management.md) — Zustand, Apollo Client, React Query, custom hooks

### tunes (Music Playlist Platform)

- [Overview](tunes/overview.md) — Full-stack architecture, features, admin system
- [Database](tunes/database.md) — Schema reference, migrations, Drizzle ORM patterns
- [WebSockets](tunes/websockets.md) — Socket.IO event protocol and real-time sync
- [Deployment](tunes/deployment.md) — Docker, AWS infrastructure, CI/CD
- [Security](tunes/security.md) — Auth flows, sessions, API tokens, rate limiting
- [Integrations](tunes/integrations.md) — YouTube, Spotify, Razorpay, AWS SES, Gemini
- [State Management](tunes/state-management.md) — TanStack Query, Zustand, Socket.IO patterns

### Architecture Decision Records (ADRs)

- [ADR Index](adr/README.md) — What ADRs are, template, and index
- [ADR-001: Monorepo Structure](adr/001-monorepo-structure.md)
- [ADR-002: Authentication Strategies](adr/002-auth-strategies.md)
- [ADR-003: Real-time with WebSockets](adr/003-realtime-websockets.md)
- [ADR-004: Database & ORM Choice](adr/004-database-orm-choice.md)

### Music identity and operations

- [Identity architecture](architecture/music-identity.md) — Identity, Account context, entitlement, publication, content, and lifecycle axes
- [Executable API contract](api/music-identity-contract.md) — Route/event authority, stable errors, credential and guest-capability lifecycle
- [Authentication model](security/music-auth-model.md) — Trust boundaries, owner predicates, keys, sessions, and redaction
- [Testing guide](testing/music-identity-testing.md) — Clean-checkout fixture flow and CI lanes
- [Public Music browser lanes](testing.md#public-music-browser-lanes) — PR-safe, disposable fixture, visual, evidence, and cleanup commands
- [Immutable deployment runbook](operations/music-deploy-runbook.md) — Preflight, migration, readiness, digest, rollback floors, kill switch
- [Reconciliation runbook](operations/music-reconciliation-runbook.md) — Report-only-first scan, approval, repair, and recovery
- [Incident runbook](operations/music-incident-runbook.md) — Containment, lifecycle repair, rollback, and escalation

## AI Agent Context

For AI agents (Claude Code, Cursor, etc.), start with:
- Root: [`/CLAUDE.md`](../CLAUDE.md) — Monorepo overview, key file locations, commands
- Per-project: [`/explorers-earth/CLAUDE.md`](../explorers-earth/CLAUDE.md) and [`/tunes/CLAUDE.md`](../tunes/CLAUDE.md)
- Superpower Skills: Battle-tested instructions at `D:\superpowers\skills\` (referenced in root and per-project CLAUDE.md files) to guide planning, TDD, debugging, and verification.

## API Documentation

The tunes REST API is documented via Swagger/OpenAPI and served live at `/api-docs` when the tunes dev server is running. This is the authoritative API reference — not duplicated in these docs.
