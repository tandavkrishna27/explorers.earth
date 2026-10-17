# explorers-earth — Overview

## Purpose

explorers-earth is a multi-media recommendation and QR code sharing platform. Users create curated lists of favorite places, movies, books, and games; add photos and details; generate QR codes; and share their recommendations socially. It's designed for travelers, content creators, local businesses, and anyone wanting to share their cultural world.

## Architecture

Frontend-only React SPA with no backend code. All data lives in an external Strapi CMS accessed via GraphQL (Apollo Client). Authentication uses JWT tokens from Strapi.

```
Browser
  └── React SPA (Vite 6.4)
        ├── Apollo Client ─── GraphQL ─── Strapi CMS
        ├── Axios ─────────── REST ────── Strapi (uploads)
        ├── Google Maps API ─────────── Google Cloud
        └── localTunesService ────────── tunes API
```

## Feature Modules

The app is organized into self-contained feature modules under `src/features/`:

### Authentication (`features/Authentication/`)
Login, registration, password reset, and Google OAuth integration. Includes an onboarding flow for new users to set up their profile. JWT tokens stored in localStorage.

### Profile (`features/Profile/`)
User profile management with customizable photos, bio, contact info, and social media links. Profiles can be public-facing for sharing recommendations.

### Favorites (`features/Favorites/`)
Core feature — add, edit, and organize favorite places. Each place includes location data, photos, ratings, notes, and categories. Places are organized into themed lists (by city, category, etc.).

### Guides (`features/Guides/`)
AI-powered guide generation. Uses AI services to create curated location guides based on user preferences, place data, and themes.

### Analytics (`features/Analytics/`)
Usage tracking dashboards showing recommendation views, QR scans, and user engagement metrics. Built with React GA4 integration.

### Settings (`features/Settings/`)
User account settings, preferences, notification configuration, and account management.

### LandingPage (`features/LandingPage/`)
Marketing/home page for unauthenticated visitors. Showcases the platform's features and value proposition.

### PublicHome (`features/PublicHome/`)
Public-facing pages that display a user's shared recommendations. Accessible via QR codes and shareable links without authentication.

### Movies (`features/Movies/`)
Curated movie and TV show lists. Users search titles via TMDB, create named lists, and share them publicly. Each title includes poster, rating, and notes. List slugs use a `movies-` prefix at the persistence layer to ensure global uniqueness.

### Books (`features/Books/`)
Curated book lists powered by Google Books API. Users search by title, author, or ISBN; organize into lists; and annotate with personal notes and ratings. List slugs use a `books-` prefix.

### Games (`features/Games/`)
Curated game lists powered by IGDB (via Twitch). Users search the game database, create themed lists, and share them publicly. List slugs use a `games-` prefix.

### Music Dashboard (Embedded tunes Integration)
A major embedded component (`src/components/MusicDashboard.tsx`) that brings the tunes music platform into explorers-earth:
- Multi-tab interface: Queue, Guest Controls, Recently Played, Playlists
- Embedded YouTube mini-player with drag-and-drop queue reordering
- Playlist management (create, edit, delete, import from YouTube/Spotify)
- Song search via YouTube
- Guest control features for venue scenarios
- Account-scoped data fetching via `useTunesDashboard`; canonical owner requests use the in-memory Music credential
- Authoritative identity/Account selection via `AuthSyncManager`, followed by bodyless single-flight Music ensure

## Frontend Architecture

### Routing
React Router DOM 7.12 with:
- Protected routes via `ProtectedRoute` component (checks JWT validity)
- Public routes for shared content (no auth required)
- Layout wrappers in `src/layouts/`

### Components
- `src/components/` — Shared components (Header, Navbar, InteractiveMap, ImageCropper, MusicDashboard, AuthSyncManager)
- `src/components/ui/` — Radix UI primitive wrappers
- Feature-specific components live within their feature module

### Styling
- Tailwind CSS 3.4 for utility-first styling
- Framer Motion for animations and page transitions
- Responsive mobile-first design

### Internationalization
- react-i18next for multi-language support
- Translation files in `src/i18n/`

## Key Patterns

- **Feature modules** are self-contained — components, hooks, and logic live together
- **Image handling**: Multi-source system (user uploads, Google Places photos, custom search) with cropping via react-easy-crop and compression
- **QR codes**: Dynamic generation with qrcode.react, exportable as PNG via html2canvas
- **Maps**: Google Maps with custom markers, clustering, place search, and geocoding
- **Forms**: Formik + Yup, or React Hook Form + Zod depending on feature
- **Slug prefixing**: List slugs are prefixed by content type (`movies-`, `books-`, `games-`) at the persistence layer to ensure global uniqueness across content types. Public URLs expose the prefixed slug transparently.
- **Third-party media APIs**: TMDB (movies/shows), Google Books API (books), and IGDB via Twitch OAuth (games) power content search and metadata for media features.

## Related Documentation

- [Integrations](integrations.md) — Google Maps, Strapi, OAuth, Analytics
- [State Management](state-management.md) — Zustand, Apollo Client, React Query
- [Deployment](deployment.md) — Netlify configuration
