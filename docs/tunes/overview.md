# tunes — Overview

## Purpose

tunes is a collaborative playlist management platform that transforms music sharing across venues and social settings. Venue owners create and manage playlists while guests can request songs and interact with music in real-time via shareable URLs and QR codes.

## Full-Stack Architecture

tunes is a monolithic full-stack application. Express.js serves both the REST API and the Vite-built React frontend from a single port (5000).

```
┌─────────────────────────────────┐
│          Browser Client         │
│  React + shadcn/ui + TanStack   │
│  Query + Zustand + Socket.IO    │
└──────────┬──────────┬───────────┘
           │ REST     │ WebSocket
           ▼          ▼
┌─────────────────────────────────┐
│        Express.js Server        │
│  ├── Routes (API endpoints)     │
│  ├── Passport.js (auth)         │
│  ├── Socket.IO (real-time)      │
│  ├── Services (business logic)  │
│  └── Storage (DB access)        │
└──────────────┬──────────────────┘
               │ Drizzle ORM
               ▼
┌─────────────────────────────────┐
│         PostgreSQL              │
└─────────────────────────────────┘
```

In development, Vite middleware provides HMR. In production, pre-built static files are served directly by Express.

## Features

### Playlist & Music Management
- Create and manage multiple playlists
- YouTube-powered song search and playback via IFrame Player
- Drag-and-drop queue reordering
- Real-time play status tracking (queued → playing → played)
- Play history with timestamps and filtering
- Cross-device synchronization via WebSocket

### Guest Interaction
- Shareable guest URLs and QR codes for venue access
- Song request system with venue owner moderation
- Play-on-guest-device with synced controls
- Guest activity analytics and tracking
- Configurable guest permissions via feature toggles

### Venue Management
- Customizable venue profiles and branding (theme colors, appearance)
- Feature toggles: song requests, guest play, playlist sharing, recently played visibility
- Session analytics dashboard
- Account manager assignment for support

### Admin System
- Super admin panel (`AdminDashboard.tsx`)
- User management console (view all users, user details, activity)
- Platform statistics (total users, playlists, songs, guests, peak hours)
- Regional performance analytics with geographic distribution
- Account manager assignment and tracking
- System health monitoring
- SEO settings and page content management
- Email template management

## Frontend Pages

| Page | File | Purpose |
|------|------|---------|
| Auth | `auth-page.tsx` | Login/register with email verification |
| Dashboard | `dashboard-page.tsx` | Main player with queue, now playing, controls |
| Playlists | `playlist-page.tsx` | Playlist CRUD, song management |
| Settings | `settings-page.tsx` | Venue settings, feature toggles, theme |
| Admin | `AdminDashboard.tsx` | Admin-only management panel |
| Guest View | via guest URL | Read-only playlist view + song requests |

## Backend Route Structure

| Route File | Base Path | Responsibility |
|------------|-----------|----------------|
| `authRoutes.ts` | `/api/login`, `/api/register`, `/api/logout`, `/api/check`, `/api/csrf-token` | Explicit standalone native-session endpoints |
| `playlistRoutes.ts` | `/api/playlists/*` | Playlist CRUD, songs, WebSocket setup |
| `adminRoutes.ts` | `/api/admin/*` | User management, statistics, team |
| `youtubeRoutes.ts` | `/api/search/*` | YouTube song search |
| `paymentRoutes.ts` | `/api/payments/*` | Razorpay webhooks, subscription |
| `emailRoutes.ts` | `/api/email/*` | Email templates, sending |
| `geminiRoutes.ts` | `/api/gemini/*` | AI music recommendations |
| `instagramRoutes.ts` | `/api/instagram/*` | Instagram webhook |
| `subscriptionRoutes.ts` | `/api/subscription/*` | Subscription management |
| `pageRoutes.ts` | `/api/pages/*` | CMS page content |
| `reactivationRoutes.ts` | `/api/user/*` | Account reactivation (request magic link, unblock) |
| `legacyRemainingRoutes.ts` | Various | Consolidated legacy endpoints |

## Service Layer

| Service | Purpose |
|---------|---------|
| `email-service.ts` | AWS SES email delivery with templating |
| `gemini-service.ts` | Google Gemini AI for music recommendations |
| `reactivation-service.ts` | Handles self-service account reactivation logic (token store, email template seeding, Strapi integration) |
| `spotify-playlist-import.ts` | Import playlists from Spotify |
| `youtube-playlist-import.ts` | Import playlists from YouTube |
| `system-settings-service.ts` | App-wide key-value configuration |
| `user-sync-service.ts` | User data synchronization |

## Related Documentation

- [Database Schema](database.md)
- [WebSocket Protocol](websockets.md)
- [Security & Auth](security.md)
- [Integrations](integrations.md)
- [State Management](state-management.md)
- [Deployment](deployment.md)
