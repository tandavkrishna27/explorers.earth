# explorers-earth

Multi-media recommendation and QR code sharing platform. Users create curated lists of favorite places, movies, books, and games, generate QR codes, and share them socially.

## Tech Stack

- React 18 + TypeScript + Vite 6.4
- Tailwind CSS + Radix UI + Framer Motion
- Apollo Client 3.12 (GraphQL) + React Query + Zustand
- React Router DOM 7.12
- Google Maps API (@react-google-maps/api, @vis.gl/react-google-maps)
- i18n (react-i18next)
- Formik/React Hook Form + Yup/Zod (forms)
- Cloudflare Turnstile (@marsidev/react-turnstile) for bot protection
- qrcode.react (QR generation)

## Backend

External Strapi CMS accessed via GraphQL. No backend code in this project.
- GraphQL endpoint configured via `VITE_API_URL`
- REST endpoint for uploads via `VITE_REST_API_URL`
- Auth: JWT tokens stored in localStorage, Google OAuth

## Directory Structure

```
src/
├── features/           # Feature-based modules (main app logic)
│   ├── Authentication/ # Login, register, password reset, Google OAuth, onboarding
│   ├── Profile/        # User profiles, photos, bio, social links
│   ├── Favorites/      # Location recommendations, ratings, notes
│   ├── Movies/         # Curated lists of favorite movies
│   ├── Books/          # Curated lists of favorite books
│   ├── Games/          # Curated lists of favorite games
│   ├── Guides/         # Curated multi-day guides and itineraries
│   ├── Analytics/      # Usage tracking and dashboards
│   ├── Settings/       # User preferences and account settings
│   ├── LandingPage/    # Marketing/home page
│   └── PublicHome/     # Public-facing recommendation pages
├── components/         # Shared UI components
│   ├── MusicDashboard.tsx      # Canonical Music workspace and sharing controls
│   ├── AuthSyncManager.tsx     # Post-auth Music identity convergence
│   ├── Header.tsx / Navbar.tsx # Navigation
│   ├── InteractiveMap.tsx      # Google Maps component
│   ├── ImageCropper.tsx        # Image crop utility
│   └── ui/             # Radix UI primitive wrappers
├── pages/              # Route-level page components
│   ├── Music.tsx       # Music page (renders MusicDashboard)
│   ├── ReactivateAccount.tsx # Request account reactivation magic link page
│   ├── ReactivateConfirm.tsx # Confirm account reactivation page
│   └── public/         # Public (unauthenticated) pages
├── hooks/              # Custom hooks
│   ├── useTunesDashboard.ts            # Canonical Music workspace data fetching
│   ├── useProfileWalkthrough.ts        # Profile setup guided walkthrough
│   ├── useRecommendationsWalkthrough.ts # Recommendations guided walkthrough
│   ├── useQRActions.tsx                # QR code generation, download, sharing
│   ├── useQRContext.tsx                # QR actions React context provider
│   ├── useDeviceDetection.tsx          # Mobile/tablet/desktop detection
│   ├── useDistanceValidation.ts        # Location distance validation
│   ├── useFileUpload.ts                # Image upload flow (crop → compress → REST)
│   ├── useMediaViewer.ts               # Image/media viewer modal state
│   ├── usePageTracking.ts              # GA4 page-view tracking
│   ├── useResponsiveChart.ts           # Chart dimensions from viewport
│   ├── useToast.ts                     # Toast notifications
│   └── useUsernameValidation.ts        # Async username availability check
├── lib/
│   ├── localTunesApiClient.ts # Bodyless identity ensure and in-memory Music credential
│   └── apolloCache.ts          # Immutable-ID GraphQL normalization policy
├── store/              # Zustand global state
│   ├── store.ts        # Main app store (auth, user data)
│   ├── useCityStore.ts # Selected city state
│   ├── useEmailStore.ts# Email composition state
│   └── useSetupStore.ts# Onboarding setup state
├── services/           # API service functions
│   ├── analyticsService.ts     # Analytics tracking
│   ├── googleBooksService.ts   # Google Books API (book search + metadata)
│   ├── igdbService.ts          # IGDB via Twitch OAuth (game search + metadata)
│   ├── instagramService.ts     # Instagram integration
│   ├── paymentService.ts       # Payment processing
│   ├── subscriptionService.ts  # Subscription management
│   └── tmdbService.ts          # TMDB (movie/show search, metadata, posters)
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
├── routes/             # React Router configuration
├── layouts/            # Page layout wrappers
├── contexts/           # React Context providers
├── config/             # App configuration
├── i18n/               # Internationalization files
└── assets/             # Static assets (icons, images)
```

## State Management

- **Zustand**: Global app state (auth, cities, email, setup wizard)
- **Apollo Client**: Server state via GraphQL. Handles caching, optimistic updates
- **React Query**: Additional async operations
- **React Context**: QR actions, media viewer

## Key Patterns

- Feature modules are self-contained with their own components, hooks, and logic
- Protected routes via `ProtectedRoute` component checking JWT validity
- Image handling: multi-source (uploads, Google Places, custom search) with cropping/compression
- QR codes generated dynamically with qrcode.react, exportable as PNG
- Maps: Google Maps with custom markers, clustering, geocoding

## Music identity and workspace

- `AuthSyncManager.tsx` is the sole automatic identity trigger. It runs only after verified authentication and completed onboarding and selects the unique complete Account by immutable `documentId`.
- `localTunesApiClient.ts` sends a bodyless identity ensure request and holds the short-lived Music credential in memory only, with single-flight refresh.
- `musicIdentityCoordinator.ts` coalesces concurrent identity work for Google and email authentication paths.
- `musicWorkspaceClient.ts` uses canonical owner routes. `publicMusicClient.ts` uses immutable public slugs and an optional fragment-carried guest capability.
- `Music.tsx` delegates lifecycle, entitlement, identity, loading, and ready precedence to `musicState.ts`; `MusicDashboard.tsx` owns private/unlisted/public controls.
- Profile username changes never change Music ownership or identity. Retired username headers, native credentials, browser persistence, and cross-app login routes must not be reintroduced.
- **Account Reactivation Flow**: `ReactivateAccount.tsx` and `ReactivateConfirm.tsx` handle the separate Explorer account lifecycle endpoints.

## Common Tasks

**Add a new feature module:**
1. Create folder under `src/features/NewFeature/`
2. Add components, hooks, and logic inside
3. Add route in `src/routes/`
4. Add navigation link in `src/components/Navbar.tsx`

**Add a new Zustand store:**
1. Create `src/store/useNewStore.ts`
2. Export typed hooks using `create()` from zustand

**Add a GraphQL query/mutation:**
1. Define in the component using `gql` tag
2. Use `useQuery` or `useMutation` from Apollo Client

## Environment Variables

See `docs/environment-variables.md` for the complete list. Key variables:
- `VITE_API_URL` — GraphQL API endpoint (Strapi)
- `VITE_REST_API_URL` — REST API endpoint
- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps
- `VITE_LOCAL_TUNES_API_URL` — Local Tunes integration endpoint

## Deployment strategy

Netlify. Config in `netlify.toml`. Build: `npm run build` (runs generate-static + tsc + vite build)

## Testing

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Interactive Vitest UI
npm run test:ui

# Type check
npx tsc -b

# Lint
npm run lint

# Tunes integration test
npm run test:local-tunes
```

Test files live in `__tests__/` subdirectories throughout `src/`. Global setup is in `src/test/setup.ts`. Vitest is configured in `vite.config.ts` under the `test` key.

## Superpower Skills

Your personal library of proven techniques, patterns, and tools is at `D:\superpowers\skills\`.
Before executing any tasks, always check for relevant skills under the `D:\superpowers\skills\` directory. For instructions on finding and executing skills, refer to `D:\superpowers\skills\using-superpowers\SKILL.md`. Always run verification commands and apply TDD/plan-writing skills where applicable.
