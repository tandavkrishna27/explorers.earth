# tunes — Collaborative Playlist Management Platform

tunes is a songs recommendation platform that transforms music sharing across diverse social and venue settings, creating immersive and interactive music experiences. The platform features responsive design, persistent user sessions, advanced music control capabilities with YouTube integration, and comprehensive administrative tools.
 
## Tech Stack

- **Frontend**: React 18 + TypeScript, TanStack Query v5, shadcn/ui, Socket.IO, Tailwind CSS
- **Backend**: Express 5.2 runtime + TypeScript, Socket.IO, Passport.js (`@types/express` 4.17 is tracked type debt)
- **Database**: PostgreSQL + Drizzle ORM
- **Integrations**: YouTube Data API, Spotify, Razorpay, AWS SES, Google Gemini
 
## Safe Music quick start

Run from the repository root with Node 22.12 or newer. This creates only the disposable fixture stack; it does not request production credentials or run schema push against an arbitrary database.

```text
npm ci
npm ci --prefix tunes --legacy-peer-deps
npm ci --prefix explorers-earth
npm run music:bootstrap -- --mode fixture
npm run music:doctor -- --mode fixture
npm run music:up -- --mode fixture --detach --wait
npm run music:test:smoke -- --mode fixture
npm run music:down -- --mode fixture
```

The generated fixture target is exactly `127.0.0.1:55432/music_fixture`. Use `music:db:status`, `music:db:migrate`, and `music:db:verify`; schema-synchronization shortcuts are not Music setup or production migration authority. The live machine-readable API is served at `/api-docs`.

## Key Features

- Real-time playlist management with WebSocket sync
- YouTube-powered song search and playback
- Drag-and-drop queue reordering
- Guest song request system with moderation
- Customizable venue profiles and branding
- Admin dashboard with analytics
- Email verification and OTP authentication
- Spotify playlist import
- Multiple playlist support

## Documentation

Full documentation is in the [`docs/`](../docs/) folder:

- [Architecture](../docs/architecture.md) — How the codebase is structured
- [Getting Started](../docs/getting-started.md) — Setup and installation
- [Environment Variables](../docs/environment-variables.md) — All env vars
- [Database](../docs/tunes/database.md) — Schema, migrations, Drizzle patterns
- [WebSocket Protocol](../docs/tunes/websockets.md) — Socket.IO events
- [Security](../docs/tunes/security.md) — Auth flows, sessions, API tokens
- [Music identity architecture](../docs/architecture/music-identity.md) — Identity, Account context, entitlement, publication, content, lifecycle
- [Music API contract](../docs/api/music-identity-contract.md) — Canonical endpoints, events, stable errors, token/capability lifecycle
- [Music auth model](../docs/security/music-auth-model.md) — Principal derivation, owner predicates, rotation, redaction
- [Music testing](../docs/testing/music-identity-testing.md) — Fixture golden path and CI lanes
- [Music incident runbook](../docs/operations/music-incident-runbook.md) — Containment, recovery, and escalation
- [Integrations](../docs/tunes/integrations.md) — YouTube, Spotify, Razorpay, etc.
- [State Management](../docs/tunes/state-management.md) — TanStack Query, Zustand, Socket.IO
- [Deployment](../docs/tunes/deployment.md) — Docker, AWS, CI/CD
- [Contributing](../docs/contributing.md) — Code style, PR process

For AI agents, see [`CLAUDE.md`](CLAUDE.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.
