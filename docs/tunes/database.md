# tunes — Database

## ORM & Tooling

- **ORM**: Drizzle ORM 0.39 with type-safe query building
- **Driver**: `@neondatabase/serverless` for PostgreSQL connections
- **Validation**: `drizzle-zod` generates Zod schemas from table definitions
- **Migrations**: reviewed, ordered SQL in `tunes/migrations/`, enforced by the Music migration contract
- **Config**: `tunes/drizzle.config.ts`
- **Schema**: `tunes/shared/schema.ts` is the schema model; the append-only migration manifest/chain is deployment authority

## Commands

```bash
# From the repository root: apply and verify the reviewed chain on the guarded fixture only
npm run music:db:migrate -- --mode fixture --target test
npm run music:db:verify -- --mode fixture --target test

# Type check the schema
npm run check
```

## Table Reference

### `users`
Core user/venue account table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Auto-increment ID |
| `username` | text, unique | Login username |
| `password` | text | Scrypt-hashed password |
| `email` | text, unique | Email (optional) |
| `otp` / `otpExpiry` | text / timestamp | One-time password for MFA |
| `emailVerificationToken` / `Expiry` | text / timestamp | Email verification |
| `isEmailVerified` | boolean | Email verification status |
| `guestUrl` | text, unique | Shareable guest access URL |
| `venueName` | text | Display name for the venue |
| `theme` | jsonb | UI theme settings (`{ primary: '#6E56CF' }`) |
| `allowSongRequests` | boolean | Feature toggle |
| `allowGuestPlayOnDevice` | boolean | Feature toggle |
| `allowPlaylistSharing` | boolean | Feature toggle |
| `allowRecentlyPlayedVisibility` | boolean | Feature toggle |
| `accountManagerId` | integer FK → team_members | Assigned account manager |
| `isAdmin` | boolean | Super admin flag |
| `createdAt` / `updatedAt` | timestamp | Timestamps |

### `playlists`
User-created playlists.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users | Owner |
| `name` | text | Playlist name |
| `description` | text | Optional description |
| `isVisibleToGuests` | boolean | Guest visibility toggle |
| `createdAt` / `updatedAt` | timestamp | |

### `playlist_songs`
Songs within playlists (junction table with denormalized song data).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `playlistId` | integer FK → playlists | Parent playlist |
| `youtubeId` | text | YouTube video ID |
| `title` | text | Song title |
| `artist` | text | Artist name |
| `thumbnailUrl` | text | YouTube thumbnail |
| `position` | integer | Order in playlist |
| `addedAt` | timestamp | When added |

### `songs`
Active queue songs with play status tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users | Owner |
| `youtubeId` | text | YouTube video ID |
| `title` / `artist` | text | Song metadata |
| `thumbnailUrl` | text | Thumbnail |
| `position` | integer | Queue order |
| `status` | text | `'queued'` / `'playing'` / `'played'` |
| `playedAt` | timestamp | When played |

### `played_songs`
Historical play records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users | |
| `songId` | integer FK → songs | |
| `playedAt` | timestamp | |

### `user_sessions`
Session tracking with geolocation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users | |
| `startTime` / `endTime` | timestamp | Session duration |
| `lastActiveAt` | timestamp | Last activity |
| `deviceInfo` | jsonb | Device metadata |
| `ipAddress` | text | Client IP |
| `countryCode` / `region` | text | Geolocation |
| `geoData` | jsonb | Full geo data |

### `user_profiles`
Extended user profile data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users, unique | One-to-one with users |
| `firstName` / `lastName` | text | Name |
| `profilePicture` | text | Base64 encoded image |
| `countryCode` / `phoneNumber` | text | Phone |
| `streetName` / `state` / `city` / `country` / `postalCode` | text | Address |
| `instagramUrl` / `facebookUrl` / `youtubeUrl` / `twitterUrl` / `whatsappUrl` | text | Social links |

### `guest_interactions`
Tracks guest visits and actions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `userId` | integer FK → users | Host user |
| `guestId` | text | Unique guest identifier |
| `pageView` / `songRequest` | boolean | Interaction flags |
| `interactionType` | text | Type of interaction |
| `sessionDuration` | integer | Duration in seconds |

### `api_tokens`
API authentication tokens with scoped access.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `token` | text, unique | Token value |
| `name` | text | Token name |
| `userId` | integer FK → users | Owner |
| `scopes` | text[] | Permission scopes |
| `isAppWide` | boolean | App-wide vs user-scoped |
| `expiresAt` | timestamp | Expiration |
| `isActive` | boolean | Active/revoked |

### `team_members`
Account managers assigned to venue owners.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `name` | text | Manager name |
| `role` | text | Role title |
| `regions` | text[] | Assigned regions |

### `email_templates` / `email_logs`
Email system tables for templated email delivery and delivery tracking.

### `page_contents` / `seo_settings`
CMS content tables for terms, privacy pages, and SEO metadata.

### `system_settings`
Key-value store for app-wide configuration (URLs, integration settings, etc.).

### `session`
Express-session storage table (managed by connect-pg-simple).

### `youtube_api_usage` / `user_activity`
Tracking tables for API usage and user activity logging.

## Key Relationships

```
users ──┬── playlists ── playlist_songs
        ├── songs ── played_songs
        ├── user_profiles (1:1)
        ├── user_sessions
        ├── guest_interactions
        ├── api_tokens
        ├── activity_logs
        ├── analytics_snapshots
        └── team_members (via accountManagerId)
```

## Storage Layer

`tunes/server/storage.ts` contains all database query methods. It acts as a data access layer between routes/services and the database. All Drizzle queries are centralized here rather than scattered across route handlers.

## Migration Workflow

1. Modify table definitions in `shared/schema.ts`
2. Add/update Zod insert schemas and export types
3. Add the next reviewed, append-only SQL file under `tunes/migrations/` and update `tunes/shared/music-migration-contract.ts`
4. Update `server/storage.ts` with new query methods if needed
5. From the repository root, run `npm run music:db:migrate -- --mode fixture --target test` and `npm run music:db:verify -- --mode fixture --target test`
6. Commit the migration and contract together; application startup and production deployment never infer or push a schema diff
