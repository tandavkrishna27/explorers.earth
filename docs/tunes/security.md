# tunes — Security

## Authentication Flows

### Registration

1. User submits username, password, email, venue name
2. Password is hashed with Node.js `scrypt` (crypto module)
3. Unique `guestUrl` is generated for the venue
4. Email verification token is created and sent via email
5. Account is created but `isEmailVerified` remains `false`
6. User can log in immediately but some features may require verification

### Login

1. User submits username + password
2. Passport.js local strategy validates credentials via `scrypt` comparison
3. On success, express-session creates a session stored in PostgreSQL
4. Session cookie is set with 7-day expiry
5. Client receives user data and stores auth state in Zustand

### Email Verification

1. During registration, a verification token is generated and stored in `emailVerificationToken`
2. Token has an expiry timestamp in `emailVerificationExpiry`
3. Verification email is sent via the email service (AWS SES or SMTP)
4. User clicks the verification link
5. Server validates token and expiry, sets `isEmailVerified = true`

### OTP (One-Time Password)

1. User requests OTP (e.g., for sensitive operations)
2. Server generates OTP, stores in `users.otp` with expiry in `users.otpExpiry`
3. OTP is sent via email
4. User submits OTP for verification
5. Server validates OTP and expiry, then clears the OTP fields

### Cross-App Music Credential (explorers-earth)

tunes separates the embedded Explorer identity boundary from the standalone native-session exception.

The embedded flow:
1. explorers-earth verifies the current Strapi user and one completed Account selection
2. explorers-earth sends a bodyless `POST /api/music/identity/ensure` with the authoritative Strapi bearer
3. tunes validates that proof and the upstream user/Account response shapes, then atomically projects the immutable document IDs
4. tunes returns a ten-minute Music credential bound to the numeric Music user and current session version
5. canonical owner REST and Socket.IO operations verify that credential and derive every SQL owner predicate server-side

Caller-supplied usernames, emails, owner IDs, Account IDs, or resource IDs never establish ownership. See the [Music authentication model](../security/music-auth-model.md) for the normative trust boundaries.

The separately opened native Tunes experience may use its documented session login/logout/check/CSRF endpoints. Native sessions are not an embedded Explorer fallback and do not authorize canonical Music owner routes.

### Account Reactivation (Self-Service)

For accounts that have been deactivated (the `blocked` flag is set to `true` on the Strapi user), a self-service reactivation flow is available to securely restore access.

#### 1. Request Reactivation
- **Trigger**: When a deactivated user attempts to log in, the frontend displays a reactivation banner that redirects them to `/reactivate`.
- **Request Endpoint**: `POST /api/user/request-reactivation`
  - Accepts `{ email: string }`.
  - **Security Best Practice**: The endpoint always returns a generic `200 OK` success message (e.g., *"If this email belongs to a deactivated account, a reactivation link has been sent."*) to prevent username/email enumeration.
- **Token Generation & Storage**:
  - The backend searches for a blocked user with the given email via the Strapi admin REST API.
  - If found, a cryptographically secure 32-byte random hex token is generated.
  - The token is stored in an in-memory `tokenStore` Map mapping the token to `{ strapiUserId, email, expiresAt }` with a **24-hour expiration duration**.
- **Email Delivery**:
  - The backend retrieves or auto-seeds an email template named `account_reactivation` in the tunes database.
  - The verification email containing a magic link (`/reactivate-confirm?token=<token>`) is sent to the user's email via the existing email service (AWS SES or SMTP).
  - In development environments, the reactivation link is also printed to the server console.

#### 2. Confirm Reactivation
- **Trigger**: User clicks the magic link in their email and is taken to the `/reactivate-confirm` route on the explorers-earth frontend.
- **Reactivation Endpoint**: `GET /api/user/reactivate?token=<token>`
- **Validation**:
  - The backend validates that the token is present, exists in the `tokenStore`, and has not expired.
- **Unblocking**:
  - If valid, the backend updates the Strapi user using the admin REST API (`PUT /api/users/:id`), setting `blocked: false`.
  - The token is consumed and immediately deleted from the `tokenStore` to prevent replay attacks.
  - On success, the client is redirected to the login page to sign in.

### Logout

1. Client calls `POST /api/logout`
2. Server destroys the session in PostgreSQL
3. Session cookie is cleared from the browser
4. Client clears auth state in Zustand store

## Session Management

### Configuration

- **Store**: PostgreSQL via `connect-pg-simple` (table: `session`)
- **Cookie settings**:
  - `maxAge`: 7 days (604,800,000 ms)
  - `httpOnly`: true (not accessible to JavaScript)
  - `secure`: true in production (HTTPS only)
  - `sameSite`: configured for cross-origin support
  - `path`: `/`
- **Session secret**: `SESSION_SECRET` environment variable

### Session Data Structure

```typescript
{
  cookie: {
    originalMaxAge: number,
    expires: Date,
    secure: boolean,
    httpOnly: boolean,
    path: string,
    sameSite: string
  },
  passport: {
    user: number  // User ID
  }
}
```

## API Token System

For programmatic API access, tunes supports API tokens (`api_tokens` table).

| Field | Purpose |
|-------|---------|
| `token` | Unique token string for authentication |
| `scopes` | Array of permission strings (e.g., `['read:playlists', 'write:songs']`) |
| `isAppWide` | Whether token has app-wide vs user-scoped access |
| `expiresAt` | Optional expiration timestamp |
| `isActive` | Can be revoked by setting to `false` |
| `lastUsedAt` | Tracks last usage for auditing |

## Rate Limiting

API endpoints are protected with rate limiting middleware to prevent abuse. Rate limits are applied per-IP and configured per-route group.

## CORS Configuration

- CORS is enabled with credential support for cross-origin requests
- Allowed origins are configured based on the deployment environment
- Credentials (cookies) are included in cross-origin requests via `credentials: 'include'` on the client

## Password Security

- Passwords are hashed using Node.js `scrypt` from the `crypto` module
- Scrypt parameters provide resistance against brute-force and GPU attacks
- Raw passwords are never stored or logged

## Protected Routes

### Server-side

The standalone native endpoints use their explicit session middleware and return 401 when the session is absent. Canonical embedded Music routes instead verify the short-lived Music credential with `musicPrincipal` and derive the numeric owner server-side.

Admin routes additionally check `user.isAdmin` for super admin access.

### Client-side

The auth store (`authStore.ts`) tracks authentication state. Protected pages redirect to the login page when no valid session exists.

## Guest Access Security

- Guest URLs are unique, randomly generated strings stored in `users.guestUrl`
- Guest URLs can be regenerated (invalidating the old one)
- Guests have read-only access scoped by the host's feature toggles
- Song requests from guests go through moderation
- Guest interactions are logged in `guest_interactions` table

## Key Files

| File | Purpose |
|------|---------|
| `server/auth.ts` | Passport.js setup, session config, login/register logic |
| `server/routes/authRoutes.ts` | Auth API endpoints |
| `server/storage.ts` | User lookup, password verification queries |
| `client/src/stores/authStore.ts` | Client-side auth state |
| `shared/schema.ts` | User table with auth fields |
