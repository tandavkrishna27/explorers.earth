# Environment Variables

All environment variables for both applications. Each app has its own `.env` file in its respective directory.

## explorers-earth (`explorers-earth/.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | Yes | GraphQL API endpoint (Strapi CMS) | `https://api.explorers.earth/graphql` |
| `VITE_REST_API_URL` | Yes | REST API endpoint (Strapi uploads) | `https://api.explorers.earth` |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes | Google Maps JavaScript API key | `AIza...` |
| `VITE_BASE_URL` | No | Base URL of the app (used for canonical links/SEO) | `https://explorers.earth` |
| `VITE_GA_MEASUREMENT_ID` | No | Google Analytics 4 Measurement ID | `G-XXXXXXXXXX` |
| `VITE_GOOGLE_CUSTOM_SEARCH_API_KEY` | No | Google Custom Search API key (image search) | `AIza...` |
| `VITE_GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | No | Custom Search Engine ID | `abc123...` |
| `VITE_GOOGLE_SEARCH_API_KEY` | No | Google Custom Search API key (alias used in some modules) | `AIza...` |
| `VITE_GOOGLE_SEARCH_ENGINE_ID` | No | Custom Search Engine ID (alias) | `abc123...` |
| `VITE_GOOGLE_BOOKS_API_KEY` | No | Google Books API key (book search for Books feature) | `AIza...` |
| `VITE_TMDB_API_KEY` | No | TMDB API key v3 (movie/show search) | `abc123...` |
| `VITE_TMDB_ACCESS_TOKEN` | No | TMDB v4 Bearer access token (preferred for new endpoints) | `eyJ...` |
| `VITE_IGDB_CLIENT_ID` | No | IGDB/Twitch Client ID for game search | `abc123...` |
| `VITE_IGDB_CLIENT_SECRET` | No | IGDB/Twitch Client Secret for game search | `secret...` |
| `VITE_INSTAGRAM_API_URL` | No | Instagram Graph API base URL | `https://graph.instagram.com` |
| `VITE_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile site key (bot protection on auth forms) | `0x4AAAAA...` |
| `VITE_PAYMENT_API_URL` | No | Payment backend API URL | `https://pay.explorers.earth` |
| `VITE_RAZORPAY_KEY_ID_DEV` | No | Razorpay key for dev/test environment | `rzp_test_...` |
| `VITE_RAZORPAY_KEY_ID_PROD` | No | Razorpay key for production | `rzp_live_...` |
| `VITE_PUBLIC_ACCESS_TOKEN` | No | Public access token for Strapi (unauthenticated reads) | `token...` |
| `VITE_LOCAL_TUNES_API_URL` | No | tunes API URL for cross-app integration | `https://localtunes.earth` |
| `VITE_LOCAL_TUNES_WS_URL` | No | tunes WebSocket URL | `wss://localtunes.earth` |
| `VITE_LOCAL_TUNES_ENABLED` | No | Enable/disable tunes integration | `true` |
| `VITE_LOCAL_TUNES_TIMEOUT` | No | Tunes API timeout in ms | `10000` |
| `VITE_LOCAL_TUNES_RETRY_ATTEMPTS` | No | Retry attempts for tunes API | `3` |

> **Note on IGDB**: IGDB uses Twitch OAuth for authentication. `VITE_IGDB_CLIENT_ID` and `VITE_IGDB_CLIENT_SECRET` are your Twitch app credentials. The token exchange is handled in `src/services/igdbService.ts`.

> **Note on TMDB**: Both `VITE_TMDB_API_KEY` (v3 legacy) and `VITE_TMDB_ACCESS_TOKEN` (v4 Bearer) are used. The Bearer token is preferred for newer endpoints.

> **Note on Razorpay**: Two separate keys are used — `VITE_RAZORPAY_KEY_ID_DEV` for test/staging and `VITE_RAZORPAY_KEY_ID_PROD` for production. The app selects based on environment.

> Note: All explorers-earth env vars are prefixed with `VITE_` because Vite exposes these to the client bundle. Do not put secrets here.

## tunes (`tunes/.env`)

### Core

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/tunes` |
| `SESSION_SECRET` | Yes | Express session encryption secret | `a-long-random-string` |
| `COOKIE_SECRET` | No | Cookie signing secret | `another-random-string` |
| `NODE_ENV` | No | Environment mode | `development` / `production` |
| `PORT` | No | Server port (code defaults to 5000 if unset; .env.example sets 3000) | `5000` |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) | `http://localhost:5173,https://explorers.earth` |
| `DEBUG` | No | Enable debug logging | `false` |
| `RATE_LIMIT` | No | Requests per minute rate limit | `60` |

### YouTube

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key | `AIza...` |

### Email (for verification)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `EMAIL_HOST` | No* | SMTP server hostname | `smtp.gmail.com` |
| `EMAIL_PORT` | No* | SMTP port | `587` |
| `EMAIL_USER` | No* | SMTP username | `noreply@example.com` |
| `EMAIL_PASS` | No* | SMTP password | `app-password` |
| `EMAIL_FROM` | No* | Sender email address | `no-reply@yourdomain.com` |

> *Required if email verification is enabled

### AWS SES (production email)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | No | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | No | AWS secret key | `secret...` |
| `AWS_REGION` | No | AWS region for SES | `us-east-1` |

### Spotify

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SPOTIFY_CLIENT_ID` | No | Spotify app client ID (playlist import) | `abc123...` |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify app client secret | `secret...` |

### Strapi CMS (Music identity boundary)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `STRAPI_URL` | No | Strapi CMS URL (server-side) | `http://localhost:1337` |
| `STRAPI_ACCESS_TOKEN` | No | Strapi API token (server-side) | `token...` |
| `STRAPI_ANALYTICS_ACCESS_TOKEN` | Yes | Dedicated server-side token for public-profile analytics validation and event reads/writes | `token...` |
| `EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED` | No | Enables the server-owned public profile gateway; set to `true` only after the dedicated reader credential and CORS origin are installed | `true` |
| `STRAPI_PUBLIC_PROFILE_READ_TOKEN` | Required when gateway is enabled | Dedicated Custom read-only Strapi credential for Local Tunes only. Store it in the protected Tunes runtime secret configuration; never use a `VITE_` variable, browser header, or Explorers build secret. | `token...` |
| `VITE_API_URL` | No | Strapi GraphQL endpoint (client-side, for embedded auth) | `http://localhost:1337/graphql` |
| `VITE_REST_API_URL` | No | Strapi REST endpoint (client-side) | `http://localhost:1337` |
| `VITE_PUBLIC_ACCESS_TOKEN` | No | Public access token for unauthenticated requests | `token...` |

### AI

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GEMINI_API_KEY` | No | Google Gemini API key | `AIza...` |

### Analytics

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CLARITY_PROJECT_ID` | No | Microsoft Clarity project ID | `abc123` |

### Payments

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RAZORPAY_KEY_ID` | No | Razorpay API key | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | No | Razorpay secret | `secret...` |

## Security Notes

- Never commit `.env` files to version control
- Use `.env.example` files as templates (without real values)
- In production, use environment variable management from your hosting provider
- `VITE_` prefixed variables in explorers-earth are exposed to the browser — never put secrets in them
- Server-side variables in tunes are secure and not exposed to the client
