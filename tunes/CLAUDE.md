# tunes

Real-time collaborative music playlist management platform for venues. Venue owners manage playlists, guests request songs and interact with music via shareable URLs/QR codes. Full-stack app with WebSocket synchronization.

## Tech Stack

**Frontend**: React 18 + TypeScript, Vite 5.4, shadcn/ui + Radix UI, TanStack Query v5, Zustand, Socket.IO client, YouTube IFrame Player, Tailwind CSS, Wouter (routing)
 
**Backend**: Express.js 4.21 + TypeScript, Socket.IO 4.8 (WebSocket), Passport.js (auth), express-session + connect-pg-simple (sessions)

**Database**: PostgreSQL + Drizzle ORM 0.39 (@neondatabase/serverless for connection)

**Integrations**: YouTube Data API v3, Spotify API (import), Resend (email)

## Directory Structure

```
client/src/
├── pages/              # Route pages
│   ├── auth-page.tsx           # Login/register
│   ├── dashboard-page.tsx      # Main player dashboard
│   ├── playlist-page.tsx       # Playlist management
│   ├── settings-page.tsx       # Venue settings
│   ├── AdminDashboard.tsx      # Super admin panel
│   └── tabs/                   # Dashboard tab components
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── bottom-navigation.tsx   # Mobile nav
│   └── connection-status.tsx   # WebSocket status indicator
├── hooks/
│   └── use-websocket.tsx       # Socket.IO hook (core real-time logic)
├── stores/
│   └── authStore.ts            # Auth state (Zustand + TanStack Query)
├── lib/                        # Utilities (queryClient, utils)
└── types/                      # TypeScript definitions

server/
├── index.ts            # Express app entry point, Vite middleware, server startup
├── auth.ts             # Passport.js config, session setup, login/register logic
├── middleware/musicPrincipal.ts # Music credential verification and numeric principal derivation
├── routes/musicSurfaceRoutes.ts # Canonical C5 Music owner/guest routes
├── storage.ts          # Database access layer (all DB queries)
├── db.ts               # Drizzle + Neon connection setup
├── routes/musicOpenApiRoutes.ts # Minimal typed OpenAPI spec (served at /api-docs)
├── routes/
│   ├── index.ts                # Route registration
│   ├── authRoutes.ts           # Auth endpoints
│   ├── playlistRoutes.ts       # Playlist CRUD + WebSocket setup
│   ├── adminRoutes.ts          # Admin panel endpoints
│   ├── youtubeRoutes.ts        # YouTube search
│   ├── emailRoutes.ts          # Email templates & sending
│   ├── instagramRoutes.ts      # Instagram webhooks
│   ├── pageRoutes.ts           # CMS page content
│   ├── reactivationRoutes.ts   # Account reactivation endpoints
│   └── legacyRemainingRoutes.ts # Consolidated legacy endpoints
├── controllers/                # Business logic controllers
├── services/
│   ├── email-service.ts        # Resend email delivery (REST API)
│   ├── reactivation-service.ts # Account reactivation logic/service
│   ├── spotify-playlist-import.ts # Spotify playlist import
│   ├── system-settings-service.ts # App-wide config
│   ├── youtube-playlist-import.ts # YouTube playlist import
│   └── user-sync-service.ts    # User data sync
└── utils/

shared/
└── schema.ts           # Drizzle ORM schema (SINGLE SOURCE OF TRUTH for DB)
```

## Database

**Schema**: `shared/schema.ts` — all tables defined with Drizzle ORM + Zod validation schemas.

**Key tables**:
- `users` — Accounts with venue settings, theme, feature toggles, admin flag
- `playlists` — User playlists with guest visibility
- `playlist_songs` — Songs in playlists (youtube ID, title, artist, position)
- `songs` — Active queue songs with play status (queued/playing/played)
- `played_songs` — Play history
- `user_sessions` — Session tracking with geolocation
- `user_profiles` — Extended profile (address, social links, phone)
- `guest_interactions` — Guest activity tracking
- `api_tokens` — API auth tokens with scopes
- `team_members` — Account managers with regional assignments
- `email_templates` / `email_logs` — Email system
- `page_contents` / `seo_settings` — CMS content
- `system_settings` — Key-value app config

**Commands**:
```bash
# Run from the repository root; these commands accept only the guarded fixture target
npm run music:db:migrate -- --mode fixture --target test
npm run music:db:verify -- --mode fixture --target test
```

## Authentication

**Separated Music credential and standalone-session boundaries**:
- **Session auth**: Passport.js local strategy (username/password, scrypt hashing), express-session with PostgreSQL store, 7-day cookie
- **Embedded Music auth**: `POST /api/music/identity/ensure` validates the authoritative Strapi proof and selected Account, then mints a short-lived Music credential; `musicPrincipal.ts` derives the numeric owner for canonical REST and Socket.IO operations
- Email verification with tokens + OTP support
- Self-service account reactivation via magic link email (24-hour expiration token, self-seeding template)
- Role-based: admin (isAdmin flag), venue owner, guest (via URL)
- Protected canonical routes: Music credential plus server-derived owner predicate; standalone native endpoints use their explicit session/CSRF contract
- Origin policy: `ALLOWED_ORIGINS` controls the exact REST and Socket.IO browser allowlist; credentialed mutations fail closed on missing or mismatched origin

## WebSocket (Socket.IO)

- Server setup in `server/routes/playlistRoutes.ts`
- Client hook in `client/src/hooks/use-websocket.tsx`
- Rooms: one per user ID for playlist synchronization
- Key events: playlist updates, song status changes, feature toggle sync, guest activity

## API

- REST endpoints under `/api/` — see Swagger docs at `/api-docs`
- Key route groups: auth, playlists, admin, youtube, email
- Pattern: routes -> (optional controller) -> storage/service layer

## Common Tasks

**Add a new API route:**
1. Create `server/routes/newRoute.ts`
2. Register in `server/routes/index.ts`
3. Add DB queries in `server/storage.ts`
4. Add typed OpenAPI paths in `server/routes/musicOpenApiRoutes.ts`

**Add a new database table:**
1. Define table + insert schema in `shared/schema.ts`
2. Export types at bottom of schema file
3. Add the next append-only SQL file and update `shared/music-migration-contract.ts`
4. Run `npm run music:db:migrate -- --mode fixture --target test` and `npm run music:db:verify -- --mode fixture --target test` from the repository root
5. Add storage methods in `server/storage.ts`

**Add a WebSocket event:**
1. Define event handler in `server/routes/playlistRoutes.ts` (socket.on)
2. Add client handler in `client/src/hooks/use-websocket.tsx`

## Environment Variables for tunes

See `docs/environment-variables.md`. Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `YOUTUBE_API_KEY` — YouTube Data API
- `EMAIL_HOST/USER/PASS` — SMTP for verification emails
- `STRAPI_URL` / `STRAPI_ACCESS_TOKEN` — CMS connection

## Running

```bash
npm run dev      # Start dev server (frontend + backend on port 5000)
npm run build    # Build for production (vite build + esbuild server)
npm run start    # Run production build
npm run check    # TypeScript type check
```

## Superpower Skills

Your personal library of proven techniques, patterns, and tools is at `D:\superpowers\skills\`.
Before executing any tasks, always check for relevant skills under the `D:\superpowers\skills\` directory. For instructions on finding and executing skills, refer to `D:\superpowers\skills\using-superpowers\SKILL.md`. Always run verification commands and apply TDD/plan-writing skills where applicable.
