# Master Context — explorers.earth & localtunes.earth

> **Master Reference Document**  
> *Last Updated: August 2026*  
> This document serves as the comprehensive master context for the entire `explorers.earth` monorepo platform. It details the product vision, architecture, technical stack, subsystem breakdowns, cross-app integration mechanisms, active development goals, and key reference paths for human developers and AI assistants.

---

## 1. Executive Summary & Platform Vision

The `explorers.earth` monorepo unifies two distinct yet interconnected platforms:

1. **`explorers-earth`** — A multi-media location recommendation and curation platform. It empowers travelers, content creators, and local enthusiasts to curate, visualize, and share lists of physical places, movies, books, and video games via interactive maps, customized landing pages, and shareable QR codes.
2. **`tunes`** (also operating as **`localtunes.earth`**) — A full-stack, real-time collaborative music playlist platform built for venues, cafes, and social gatherings. Venue owners manage playback, while patrons/guests interact in real time by requesting songs, voting, and interacting via venue QR codes.

### The Unified Experience
While each application can run independently, they are tightly linked: `explorers-earth` embeds `tunes` as an integrated **Music Dashboard** (`src/components/MusicDashboard.tsx`), backed by a cross-app Single Sign-On (SSO) and identity synchronization bridge. A single user account allows seamless recommendation curation and live venue music management.

---

## 2. Monorepo Architecture & Directory Structure

The repository is structured as a two-tier monorepo with independent application directories sharing root configuration scripts.

```
explorers.earth-main/
├── package.json                        # Root package manifest (concurrent dev scripts)
├── run-all.ps1                         # PowerShell runner for Windows environments
├── docker-compose.yml                  # Local container orchestrator (PostgreSQL, tunes server)
├── CLAUDE.md                           # AI assistant entry point & command reference
├── MASTER_CONTEXT.md                   # This master context document
├── docs/                               # Comprehensive project documentation
│   ├── README.md                       # Documentation index
│   ├── architecture.md                 # System architecture overview
│   ├── environment-variables.md        # Environment variables guide
│   ├── adr/                            # Architecture Decision Records (ADRs 001-004)
│   ├── design-system/                  # Design tokens, UI component specs, mockups
│   ├── explorers-earth/                # Frontend app specific docs
│   └── tunes/                          # Full-stack app specific docs
├── plans/                              # Active project plans & PRDs (e.g., SEO optimization)
├── memory/                             # Diagnostic logs, audits, and architectural post-mortems
├── explorers-earth/                    # Frontend SPA Application
│   ├── package.json
│   ├── vite.config.ts
│   ├── netlify.toml                    # Netlify deployment configuration
│   └── src/
│       ├── features/                   # Self-contained domain modules
│       ├── components/                 # Shared UI components & embedded Music Dashboard
│       ├── lib/                        # API clients & tunes integration SDK
│       ├── services/                   # Strapi & SSO API services
│       ├── store/                      # Zustand state management
│       └── i18n/                       # Multilingual support (react-i18next)
└── tunes/                              # Full-Stack Application
    ├── package.json
    ├── drizzle.config.ts               # Drizzle ORM configuration
    ├── client/                         # React frontend (Vite)
    │   └── src/
    │       ├── pages/                  # Route views (Dashboard, Admin, Settings)
    │       ├── components/ui/          # shadcn/ui component library
    │       └── stores/                 # State management & Socket.IO hooks
    ├── server/                         # Express.js backend
    │   ├── routes/                     # REST API controllers & auth endpoints
    │   ├── services/                   # Email, Gemini AI, Spotify, YouTube integrations
    │   ├── auth.ts                     # Passport.js session auth
    │   ├── jwt-auth-middleware.ts        # Strapi JWT cross-app SSO validator
    │   ├── storage.ts                  # Drizzle database persistence layer
    │   └── swagger.ts                  # OpenAPI / Swagger spec generator (/api-docs)
    └── shared/
        └── schema.ts                   # Unified Drizzle database schema definition
```

---

## 3. Technology Stack Matrix

| Dimension | `explorers-earth` | `tunes` (`localtunes.earth`) |
| :--- | :--- | :--- |
| **Application Type** | Client-side SPA | Monolithic Full-stack |
| **Frontend Framework** | React 18 + TypeScript | React 18 + TypeScript |
| **Build Tooling** | Vite 6.4 | Vite 5.4 |
| **Styling & UI** | Tailwind CSS 3.4, Radix UI, Framer Motion | Tailwind CSS, shadcn/ui, Framer Motion |
| **Global State** | Zustand | Zustand + TanStack Query v5 |
| **Backend Framework** | N/A (External Strapi CMS) | Express.js (TypeScript) |
| **Database & ORM** | Strapi PostgreSQL (GraphQL/REST) | PostgreSQL + Drizzle ORM |
| **Real-time Engine** | N/A | Socket.IO (WebSocket rooms) |
| **Primary Authentication**| Strapi JWT / Google OAuth | Passport.js Session + Dual JWT Validation |
| **External APIs** | Google Maps, TMDB, Google Books, IGDB | YouTube Data API v3, Spotify, Razorpay, AWS SES, Google Gemini |
| **Hosting & Infra** | Netlify | AWS / Docker Compose / Neon DB |

---

## 4. Subsystem Deep-Dive

### 4.1 `explorers-earth` (Location & Recommendation Platform)

- **Feature-Driven Architecture**: Code is grouped under `src/features/` by domain:
  - `Authentication/`: Login, registration, password recovery, profile onboarding.
  - `Profile/`: Customizable public profiles, bio, social links, and avatar management.
  - `Favorites/`: Core place management — maps, geocoding, custom tags, photo uploads.
  - `Guides/`: AI-assisted location guide creation with user quota limits (`useAIGuideQuota`).
  - `Analytics/`: QR scan tracking and recommendation engagement metrics via GA4.
  - `Movies/`, `Books/`, `Games/`: Multi-media curation modules connecting to TMDB, Google Books API, and IGDB (via Twitch OAuth).
- **Slug Prefixing Strategy**: To prevent route collisions across media types, content slugs are prefixed at the persistence layer (e.g., `movies-*`, `books-*`, `games-*`).
- **Dynamic Content Generation**: QR codes generated dynamically via `qrcode.react` and exportable as high-res PNG images using `html2canvas`.

### 4.2 `tunes` (Real-Time Collaborative Music Platform)

- **Collaborative Queue Engine**: Supports song search via YouTube Data API v3, drag-and-drop reordering, and real-time playback state transitions (`queued` → `playing` → `played`).
- **Venue & Guest Mode**: Venues display QR codes for guest interactions. Guests can request songs, vote, and follow live playback without requiring administrative rights.
- **WebSocket Protocol**: Socket.IO maintains state synchronization across venue hosts and connected guests within isolated room channels.
- **Admin System**: Comprehensive Super Admin dashboard (`AdminDashboard.tsx`) featuring platform metrics, regional analytics, user management, SEO controls, and email template customization.

### 4.3 Embedded Music Dashboard & Cross-App SSO

- **Embedded Player**: `MusicDashboard.tsx` in `explorers-earth` renders the full `tunes` player within the location app interface.
- **Authentication Bridge**:
  - `explorers-earth` authenticates users against Strapi CMS and receives a Strapi JWT.
  - `AuthSyncManager.tsx` triggers `ssoService.ts` to call `POST /api/auth/sync` on `tunes`.
  - `tunes` validates the JWT signature via `jwt-auth-middleware.ts` and maps the user via their canonical Strapi identity.

---

## 5. Active Initiatives & Roadmap ("What We Are Trying To Do")

### Initiative 1: Identity Synchronization & Cross-App Auth Hardening
- **Objective**: Fix schema drift, eliminate unauthenticated identity trust, and establish bulletproof identity lifecycle sync between Strapi CMS and `tunes` PostgreSQL database.
- **Key Tasks**:
  1. Enforce JWT signature verification on all `tunes` cross-app routes.
  2. Implement an immutable `strapi_id` column in `tunes.users` table for atomic, idempotent upserts.
  3. Synchronize lifecycle events: profile renames, email updates, account deactivation/reactivation, and permanent deletion.
  4. Secure database migrations via CI pipeline (`drizzle-kit migrate`).

### Initiative 2: Comprehensive SEO & GEO (Generative Engine Optimization) Upgrade
- **Objective**: Ensure both `explorers.earth` and `localtunes.earth` are fully discoverable by search engines and AI answer engines.
- **Key Tasks**:
  1. Correct domain misconfigurations (eliminating legacy `localtunes.com` references).
  2. Replace static index meta tags with dynamic, page-specific SEO tags using `react-helmet-async`.
  3. Deploy dynamic backend sitemap generators (`/sitemap.xml`) for public explorer profiles and venue playlist pages.
  4. Inject structured JSON-LD schemas (`BreadcrumbList`, `FAQPage`, `Organization`, `Place`).

### Initiative 3: Quality Assurance, Testing & CI Hardening
- **Objective**: Build a robust, multi-layered testing pipeline preventing regressions across both applications.
- **Key Tasks**:
  1. Maintain and expand unit/integration test baselines (Vitest / Jest / Supertest).
  2. Implement reliable E2E test suites for critical user flows (login, place curation, song requesting).
  3. Automate database integration tests with isolated test containers (`DATABASE_URL_TEST`).

### Initiative 4: Design System Unification
- **Objective**: Align UI design language across `explorers-earth` and `tunes` using consistent design tokens, accessible Radix/shadcn primitives, and unified tailwind themes.

---

## 6. Developer Workflows & Commands

### 6.1 Environment Setup & Running Locally

```bash
# 1. Install dependencies for root and both applications
npm run install:all

# 2. Start PostgreSQL & dependencies via Docker (Optional/Local DB)
docker compose up -d

# 3. Push schema updates to tunes PostgreSQL database
npm run db:push

# 4. Run both apps concurrently
npm run dev
# -> tunes running at http://localhost:5000
# -> explorers-earth running at http://localhost:5173
```

### 6.2 Running Individual Applications

```bash
# Run explorers-earth only
npm run dev:explorers-earth

# Run tunes only
npm run dev:tunes
```

### 6.3 Verification & Build Commands

```bash
# Run full workspace build
npm run build:all

# Swagger API docs (when tunes dev server is active)
# Available at: http://localhost:5000/api-docs
```

---

## 7. Key Reference Locations

- **Monorepo Guide & Script Config**: [`CLAUDE.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/CLAUDE.md)
- **Monorepo Architecture Specification**: [`docs/architecture.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/docs/architecture.md)
- **Environment Variables Reference**: [`docs/environment-variables.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/docs/environment-variables.md)
- **`explorers-earth` Overview**: [`docs/explorers-earth/overview.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/docs/explorers-earth/overview.md)
- **`tunes` Overview**: [`docs/tunes/overview.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/docs/tunes/overview.md)
- **`tunes` Database Schema**: [`tunes/shared/schema.ts`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/tunes/shared/schema.ts)
- **Identity & SSO Audit Findings**: [`memory/2026-08-13-local-tunes-sync-investigation.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/memory/2026-08-13-local-tunes-sync-investigation.md)
- **SEO Optimization PRD**: [`plans/seo-optimization/seo-optimization_prd.md`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/plans/seo-optimization/seo-optimization_prd.md)
