# Architecture

## Repository Layout

```
explorers.earth-main/
├── package.json                 # Monorepo root — concurrently runs both apps
├── CLAUDE.md                    # AI agent context (root)
├── docs/                        # This documentation
├── explorers-earth/             # Frontend SPA — location sharing platform
│   ├── CLAUDE.md                # AI context for this app
│   ├── src/
│   │   ├── features/            # Feature-based modules
│   │   ├── components/          # Shared UI components
│   │   ├── store/               # Zustand stores
│   │   ├── services/            # API service layer
│   │   ├── hooks/               # Custom React hooks
│   │   ├── routes/              # React Router config
│   │   └── i18n/                # Internationalization
│   ├── netlify.toml             # Deployment config
│   └── package.json
├── tunes/                       # Full-stack — music playlist platform
│   ├── CLAUDE.md                # AI context for this app
│   ├── client/src/              # React frontend
│   │   ├── pages/               # Route pages
│   │   ├── components/ui/       # shadcn/ui components
│   │   ├── hooks/               # Custom hooks (WebSocket, etc.)
│   │   └── stores/              # Zustand + TanStack Query
│   ├── server/                  # Express.js backend
│   │   ├── routes/              # API route handlers
│   │   ├── services/            # Business logic services
│   │   ├── auth.ts              # Passport.js authentication
│   │   ├── routes/musicIdentityRoutes.ts # Explorer proof boundary and credential issuance
│   │   ├── middleware/musicPrincipal.ts  # Music credential verification and principal derivation
│   │   ├── storage.ts           # Database access layer
│   │   └── swagger.ts           # OpenAPI spec
│   ├── shared/
│   │   └── schema.ts            # Drizzle ORM schema (DB source of truth)
│   └── package.json
├── explorers environment/       # Legacy environment config (not actively used)
└── tunes environment/           # Legacy environment config (not actively used)
```

## App Relationships

The two apps are **independent** — they have separate codebases, separate tech stacks, and deploy independently. They share:

- A monorepo root with `concurrently` to run both dev servers
- Similar frontend technology choices (React 18, TypeScript, Zustand, Tailwind CSS, Vite)
- A **deep cross-app Music identity integration**: explorers-earth verifies the Strapi user and completed Account selection, performs a bodyless identity ensure, and keeps the returned short-lived Music credential in memory. tunes derives the numeric owner from that verified credential for every canonical owner operation. Key files: `explorers-earth/src/lib/localTunesApiClient.ts`, `explorers-earth/src/features/music/musicApi.ts`, `tunes/server/routes/musicIdentityRoutes.ts`, `tunes/server/middleware/musicPrincipal.ts`

## explorers-earth Architecture

```
Browser
  └── React SPA (Vite)
        ├── Apollo Client ──── GraphQL ────→ Strapi CMS (external)
        ├── REST (Axios) ──────────────────→ Strapi CMS (uploads)
        ├── Google Maps API ───────────────→ Google Cloud
        └── localTunesService ─────────────→ tunes API
```

**Frontend-only SPA** with no backend code. All data lives in an external Strapi CMS accessed via GraphQL. Authentication uses JWT tokens from Strapi, with Google OAuth as an alternative.

**Feature module pattern**: Each major feature (Authentication, Profile, Favorites, Guides, etc.) is a self-contained module under `src/features/` with its own components, hooks, and logic.

**State management**: Three layers — Zustand for client state (auth, UI), Apollo Client for server state (GraphQL cache), and React Query for additional async operations.

## tunes Architecture

```
Browser
  └── React SPA (Vite)
        ├── REST API (fetch) ──┐
        └── Socket.IO ────────┤
                               ▼
                         Express.js Server
                           ├── Passport.js (auth)
                           ├── Socket.IO (real-time)
                           ├── Route handlers
                           ├── Service layer
                           └── Drizzle ORM
                                 │
                                 ▼
                            PostgreSQL

External APIs:
  ├── YouTube Data API v3 (song search)
  ├── Spotify API (playlist import)
  ├── Razorpay (payments)
  ├── AWS SES (email)
  └── Google Gemini (AI)
```

**Full-stack monolith**: Express.js serves both the API and the Vite-built frontend from a single port (5000). In development, Vite middleware handles HMR.

**Backend layering**:
- **Routes** (`server/routes/`) — HTTP endpoint definitions, input validation
- **Controllers** (`server/controllers/`) — Optional business logic orchestration
- **Services** (`server/services/`) — External API integrations (email, Gemini, Spotify)
- **Storage** (`server/storage.ts`) — All database queries via Drizzle ORM

**Real-time**: Socket.IO manages WebSocket connections. Each authenticated user joins a "room" keyed by their user ID. Playlist changes, song status updates, and guest activity are broadcast to all connected clients in the room.

**Authentication boundaries**: Embedded Explorer Music sends the Strapi bearer only to `POST /api/music/identity/ensure` at the identity/lifecycle boundary, then uses the ten-minute Music credential for canonical owner REST and Socket.IO operations. A separately opened native Tunes experience uses Passport.js with a PostgreSQL-backed session only for its explicit login/logout/check/CSRF endpoints.

## Authentication Comparison

| Aspect | explorers-earth | tunes |
|--------|----------------|-------|
| Strategy | Verified Strapi identity | Short-lived Music credential for canonical embedded routes; session only for standalone native endpoints |
| Storage | Explorer bearer follows the Strapi client policy | Music credential in Explorer module memory; standalone session in PostgreSQL + secure cookie |
| Provider | Strapi CMS | Verified Explorer identity projection; Passport.js local is the standalone exception |
| Social login | Google OAuth | Inherited only through verified Explorer identity; no embedded native login |
| Session duration | Strapi token policy | Music credential 10 minutes; standalone native cookie 7 days |
| Protected routes | `ProtectedRoute` component | `musicPrincipal` for canonical routes; session middleware for explicit native endpoints |

## Shared Patterns

Both apps follow these conventions:

- **React 18** with functional components and hooks
- **TypeScript** with strict mode
- **Zustand** for client-side global state
- **Tailwind CSS** for utility-first styling
- **Vite** as the build tool with HMR in development
- **Radix UI** primitives for accessible UI components
- **Framer Motion** for animations
- **Zod** for runtime schema validation
