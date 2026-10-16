# tunes — Third-Party Integrations

## YouTube Data API v3

**Purpose**: Song search and playback.

**Usage**:
- `server/routes/youtubeRoutes.ts` — Search endpoint (`GET /api/search/youtube`)
- Client uses YouTube IFrame Player API for playback (loaded directly in browser)
- `youtube_api_usage` table tracks API call frequency

**Configuration**:
- `YOUTUBE_API_KEY` env var
- API quota limits apply (YouTube enforces daily quotas)

**How it works**:
1. User types a search query in the UI
2. Client calls `/api/search/youtube?q=<query>`
3. Server queries YouTube Data API v3 (`search.list` endpoint)
4. Results returned with video ID, title, channel name, thumbnail
5. When a song is played, the client loads the YouTube IFrame Player with the video ID

## Spotify API

**Purpose**: Import existing playlists from Spotify.

**Service**: `server/services/spotify-playlist-import.ts`

**How it works**:
1. User provides a Spotify playlist URL or ID
2. Server authenticates with Spotify API (client credentials flow)
3. Fetches playlist tracks from Spotify
4. For each track, searches YouTube for a matching video
5. Adds matched songs to a tunes playlist

## Razorpay

**Purpose**: Payment processing and subscription management.

**Files**:
- `server/routes/paymentRoutes.ts` — Payment endpoints and webhook handlers
- `server/controllers/paymentController.ts` — Payment business logic
- `server/controllers/subscriptionController.ts` — Subscription management
- `server/routes/subscriptionRoutes.ts` — Subscription endpoints

**Configuration**:
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars

**How it works**:
1. Client initiates payment via Razorpay checkout
2. Razorpay processes the payment
3. Webhook notifies the server of payment status
4. Server updates subscription status accordingly

## AWS SES (Simple Email Service)

**Purpose**: Transactional email delivery (verification, OTP, notifications).

**Service**: `server/services/email-service.ts`

**Configuration**:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` env vars
- Fallback: SMTP via Nodemailer (`EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`)

**Features**:
- Handlebars templating for email content
- Email templates stored in `email_templates` table
- Delivery tracking in `email_logs` table
- Support for both SES and SMTP transport

## Google Gemini AI

**Purpose**: AI-powered music recommendations and suggestions.

**Files**:
- `server/services/gemini-service.ts` — Gemini API integration
- `server/routes/geminiRoutes.ts` — AI recommendation endpoints
- `server/controllers/geminiController.ts` — Request handling

**How it works**:
1. User requests AI recommendations (based on current playlist, mood, genre)
2. Server sends context to Google Gemini API
3. Gemini returns music suggestions
4. Suggestions are presented to the user for adding to playlists

## Strapi CMS

**Purpose**: Content management and song limit tracking.

**Service**: removed 2026-10-09 (ticket 8.1b). `server/services/strapi-service.ts`, `server/routes/strapiRoutes.ts` and `server/jwt-auth-middleware.ts` were unreachable from every entrypoint - canonical startup, legacy music startup, `server/index.ts`, `server/api.ts` and all three deployment entries - and had no importer anywhere in the repository.

**Configuration**:
- `STRAPI_URL` / `STRAPI_ACCESS_TOKEN` env vars

**Usage**: Syncs user data and manages content that lives in the CMS (e.g., subscription plans, feature limits).

## Instagram

**Purpose**: Webhook integration for social sharing.

**Route**: `server/routes/instagramRoutes.ts`

**How it works**:
- Receives webhook events from Instagram
- Can be used for automated social media interactions and venue promotion

## Microsoft Clarity

**Purpose**: User behavior analytics and session recording.

**Configuration**: `CLARITY_PROJECT_ID` env var (client-side only)

**Usage**: Loaded in the frontend for heatmaps, session replays, and UX insights. No server-side integration needed.

## Integration Architecture

```
tunes Server
  ├── YouTube API ──────── Song search (REST)
  ├── Spotify API ─────── Playlist import (REST)
  ├── Razorpay ────────── Payments (REST + Webhooks)
  ├── AWS SES ─────────── Email delivery (SDK)
  ├── Google Gemini ───── AI recommendations (REST)
  ├── Strapi CMS ──────── Content sync (REST)
  └── Instagram ───────── Social webhooks (Webhook)

tunes Client
  ├── YouTube IFrame ──── Video playback (Browser API)
  └── Microsoft Clarity ── Analytics (Script tag)
```
