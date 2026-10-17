# explorers.earth Monorepo

## Overview

Monorepo containing two independent web applications sharing a root workspace.

| App | Type | Purpose |
|-----|------|---------|
| `explorers-earth/` | Frontend SPA | Location recommendation & QR code sharing platform |
| `tunes/` | Full-stack | Real-time collaborative music playlist platform for venues |

## Tech Stack Summary

**explorers-earth**: React 18 + TypeScript + Vite 6.4, Tailwind CSS, Apollo Client (GraphQL), Zustand, React Router DOM, Radix UI, Framer Motion, Google Maps API, i18n. Backend is external Strapi CMS.

**tunes**: React 18 + TypeScript + Vite 5.4 (frontend), Express.js + TypeScript (backend), PostgreSQL + Drizzle ORM, Socket.IO (real-time), Passport.js (auth), shadcn/ui, TanStack Query v5, Zustand. Integrations: YouTube API, Spotify, Razorpay, Resend (email).

## How to Run

```bash
# Install all dependencies
npm run install:all

# Run both apps concurrently
npm run dev

# Run individually
npm run dev:tunes           # tunes at http://localhost:5000
npm run dev:explorers-earth # explorers-earth at http://localhost:5173

# Database (tunes only)
# Apply the reviewed chain to the guarded fixture
npm run music:db:migrate -- --mode fixture --target test
# Verify journal, checksums, and catalog
npm run music:db:verify -- --mode fixture --target test

# Build
npm run build:all
```

## Key File Locations

### explorers-earth
- `explorers-earth/src/features/` — Feature modules (Authentication, Profile, Favorites, Guides, Analytics, Settings, LandingPage, PublicHome)
- `explorers-earth/src/components/MusicDashboard.tsx` — Embedded tunes music player dashboard
- `explorers-earth/src/components/AuthSyncManager.tsx` — Authoritative Explorer identity and Account selection boundary
- `explorers-earth/src/lib/localTunesApiClient.ts` — Short-lived Music credential client and single-flight ensure
- `explorers-earth/src/features/music/musicApi.ts` — Canonical embedded Music API and identity coordinator
- `explorers-earth/src/hooks/useTunesDashboard.ts` — Account-scoped Music data fetching
- `explorers-earth/src/store/` — Zustand stores (store.ts, useCityStore.ts, useEmailStore.ts, useSetupStore.ts)
- `explorers-earth/src/services/` — API service layer
- `explorers-earth/src/hooks/` — Custom hooks (useProfileWalkthrough, useQRActions, useAIGuideQuota)
- `explorers-earth/src/routes/` — Routing configuration
- `explorers-earth/src/i18n/` — Internationalization
- `explorers-earth/netlify.toml` — Deployment config

### tunes
- `tunes/shared/schema.ts` — Drizzle ORM schema model; the append-only migration manifest/chain is deployment authority
- `tunes/server/routes/` — Express API routes (auth, playlist, admin, youtube, payment, email, instagram, strapi, subscription, page)
- `tunes/server/services/` — Business logic (email, spotify-import, strapi, system-settings, youtube-import, user-sync)
- `tunes/server/auth.ts` — Passport.js authentication setup
- `tunes/server/routes/musicIdentityRoutes.ts` — Explorer proof boundary and Music credential issuance
- `tunes/server/middleware/musicPrincipal.ts` — Local Music credential verification and numeric principal derivation
- `tunes/server/storage.ts` — Database access layer
- `tunes/server/swagger.ts` — OpenAPI/Swagger spec (live at /api-docs)
- `tunes/client/src/pages/` — Frontend pages (dashboard, admin, auth, playlist, settings)
- `tunes/client/src/hooks/use-websocket.tsx` — Socket.IO client hook
- `tunes/client/src/stores/authStore.ts` — Auth state (TanStack Query + Zustand)
- `tunes/drizzle.config.ts` — Drizzle ORM config

## Architecture Patterns

- **explorers-earth**: Feature-based module structure. Each feature (Authentication/, Profile/, Favorites/) contains its own components, hooks, and logic. Data flows via GraphQL (Apollo Client) to external Strapi CMS.
- **tunes**: Layered backend (routes -> controllers -> services -> storage). Express serves the Vite-built frontend. Real-time updates via Socket.IO rooms per user. Session-based auth with PostgreSQL session store.

## Conventions

- TypeScript strict mode in both apps
- Functional React components only
- Zustand for client-side global state
- Tailwind CSS for styling (both apps)
- Zod for runtime validation (tunes)
- Formik + Yup for forms (explorers-earth), React Hook Form + Zod (tunes)
- Feature branches from `develop`, PRs to `main`

## Database (tunes)

Key tables: `users`, `playlists`, `playlist_songs`, `songs`, `played_songs`, `user_sessions`, `user_profiles`, `guest_interactions`, `activity_logs`, `analytics_snapshots`, `api_tokens`, `team_members`, `email_templates`, `email_logs`, `page_contents`, `seo_settings`, `system_settings`, `youtube_api_usage`, `user_activity`, `session`

See `tunes/shared/schema.ts` for the schema model and `tunes/shared/music-migration-contract.ts` for the append-only deployed chain. See `docs/tunes/database.md` for documentation.

## API

- **explorers-earth**: GraphQL via Apollo Client to Strapi CMS
- **tunes**: REST API with Swagger docs at `/api-docs`, WebSocket events via Socket.IO

## Documentation

Full documentation is in `docs/`. See `docs/README.md` for the index.
Per-project AI context is in `explorers-earth/CLAUDE.md` and `tunes/CLAUDE.md`.
