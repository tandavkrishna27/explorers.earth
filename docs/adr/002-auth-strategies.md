# ADR-002: Different Authentication Strategies Per App

## Status
Accepted (superseded in part by [ADR-005](005-music-identity-migration-deployment-authority.md))

> Historical record: the decision text below is preserved as accepted. ADR-005 is the current authority for embedded Music identity and credentials.

## Context
The two apps have fundamentally different backend architectures:
- **explorers-earth** is a frontend SPA backed by an external Strapi CMS
- **tunes** is a full-stack app with its own Express.js backend

Each app needed an authentication approach that matched its architecture and deployment model.

## Decision

**explorers-earth**: JWT-based authentication provided by Strapi CMS, with Google OAuth as an alternative sign-in method. Tokens stored in localStorage.

**tunes**: Session-based authentication via Passport.js with express-session, backed by PostgreSQL session store. Enhanced with email verification and OTP support.

## Consequences

**Easier**:
- Each app uses the auth pattern that naturally fits its architecture
- explorers-earth benefits from Strapi's built-in auth (no custom auth code needed)
- tunes has full control over session management, enabling features like session tracking with geolocation and 7-day persistence

**Harder**:
- No single sign-on across apps (users have separate accounts)
- Different auth patterns mean different mental models for developers
- Security considerations differ (JWT expiry vs session invalidation)

## Alternatives Considered

**Shared auth service**: A centralized auth service (e.g., Auth0, Keycloak) could provide SSO. Not implemented because the apps serve different user bases and adding a third service increases complexity.

**JWT for both**: tunes could use JWT like explorers-earth. Rejected because session-based auth is simpler for a full-stack app, provides server-side session revocation, and integrates naturally with Passport.js.
