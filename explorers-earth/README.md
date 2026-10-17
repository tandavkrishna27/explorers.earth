# explorers-earth — Location Sharing Platform

[![CI Pipeline](https://github.com/explorers-earth/explorers-earth/actions/workflows/ci.yml/badge.svg)](https://github.com/explorers-earth/explorers-earth/actions/workflows/ci.yml)
[![Deploy](https://github.com/explorers-earth/explorers-earth/actions/workflows/deploy.yml/badge.svg)](https://github.com/explorers-earth/explorers-earth/actions/workflows/deploy.yml)
![Coverage](https://img.shields.io/badge/coverage-unit%20%2B%20integration-blue)

explorers-earth is a React-based web application that enables users to create personalized QR codes and shareable links for their favorite places and recommendations. Users can build curated lists of locations, organize them by cities or themes, and share them with others through QR codes and social media integration.

## Tech Stack

- **Frontend**: React 18 + TypeScript, Vite 6.4, Tailwind CSS, Framer Motion
- **Data**: Apollo Client (GraphQL), React Query, Zustand
- **UI**: Radix UI, React Router DOM, qrcode.react
- **Maps**: Google Maps API (Places, Geocoding, Maps)
- **Backend**: External Strapi CMS (GraphQL)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values (see docs/environment-variables.md)

# Start development server
npm run dev
# App available at http://localhost:5173
```

## Key Features

- User authentication with Google OAuth
- Location recommendations with photos, ratings, and notes
- QR code generation and social sharing
- Interactive Google Maps integration
- Curated lists organized by city or theme
- Public shareable profiles
- Image management with cropping and compression
- Internationalization (i18n)

## Documentation

Full documentation is in the [`docs/`](../docs/) folder:

- [Architecture](../docs/architecture.md) — How the codebase is structured
- [Getting Started](../docs/getting-started.md) — Setup and installation
- [Environment Variables](../docs/environment-variables.md) — All env vars
- [Overview](../docs/explorers-earth/overview.md) — Features and architecture
- [Integrations](../docs/explorers-earth/integrations.md) — Google Maps, Strapi, OAuth
- [State Management](../docs/explorers-earth/state-management.md) — Zustand, Apollo, React Query
- [Deployment](../docs/explorers-earth/deployment.md) — Netlify config
- [Music identity architecture](../docs/architecture/music-identity.md) — Automatic post-onboarding projection and lifecycle
- [Music API contract](../docs/api/music-identity-contract.md) — Bodyless ensure, in-memory Music credential, publication, and guest access
- [Music testing](../docs/testing/music-identity-testing.md) — Supported clean-checkout fixture flow
- [Contributing](../docs/contributing.md) — Code style, PR process

For AI agents, see [`CLAUDE.md`](CLAUDE.md).
