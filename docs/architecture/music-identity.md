# Music identity architecture

## Authority and scope

Strapi is the authority for the authenticated Explorer and the selected Account. Music stores an immutable projection so domain rows can keep a stable numeric owner when a username, email, or profile changes. The browser never chooses that owner.

The machine-readable authorities are the generated [runtime surface inventory](music-runtime-surface-inventory.json), the [authorization matrix](music-authorization-matrix.json), the runtime-table manifest in `fixtures/db/music-runtime-table-manifest.json`, and the OpenAPI document served by Tunes at `GET /api-docs`. This document explains the model; it does not override those artifacts.

Canonical Explorer authentication and recovery-start rows in the matrix carry `flowAccess` with `grantsApplicationAuthority: false`. Suspended and pending-deletion identities may enter those provider/recovery flows; that access does not authorize `/api/explorers/v1/me`, Music owner/content routes, or retired legacy auth paths. The recovery intent is signed and short-lived; OAuth state and the consumed recovery proof provide the one-use boundaries.

## Five independent axes

| Axis | Meaning | Authority | What it must not imply |
|---|---|---|---|
| Identity | One immutable Explorer person projected to a numeric Music user | verified Strapi user document ID | Account ordering, display name, email, or entitlement |
| Account context | The immutable selected Account document ID retained for a future workspace seam | authoritative completed Account selection | current workspace ownership or permission to switch silently |
| Entitlement | Server-derived premium policy freshness | authoritative policy source plus recorded source timestamp | identity existence, lifecycle state, or denial of included core Music |
| Publication | `private`, `unlisted`, or explicitly `public` discovery | owner-authorized publication command | ownership, entitlement, or lifecycle health |
| Content | Playlists, queue, history, and settings | numeric Music owner predicates | identity authority or publication by mere existence |

Lifecycle is a sixth operational axis. `active`, `suspended`, `pending_deletion`, and `tombstoned` are evaluated independently of entitlement and publication. A tombstone is durable and prevents automatic recreation.

## Provisioning and ownership

After authoritative verification and completed onboarding, Explorers sends a bodyless `POST /api/music/identity/ensure` with the Strapi bearer. Tunes validates the bearer at the identity boundary, validates the user and Account response shapes, selects the one approved completed Account, and atomically projects both immutable document IDs. Provisioning failure never rolls back completed Explorer onboarding.

Person ownership is fixed for this release. The selected Account ID is context only. Moving to workspace ownership requires a new ADR and data migration; it cannot reinterpret existing rows.

Every owner SQL operation derives `musicUserId` from the verified local Music principal and includes it in the predicate. Route parameters such as playlist and song IDs narrow a resource; they never establish ownership. Browser username, email, user ID, Account ID, document ID, query parameters, request bodies, and public slugs are not owner authority.

## Credential boundary

Successful ensure returns an HS256 Music credential with `iss`, `aud`, immutable subject/account context, numeric `musicUserId`, `sessionVersion`, `iat`, `nbf`, `exp`, and `jti`. Its fixed lifetime is ten minutes. Explorers retains it in module memory only: reload loses it and logout clears it. Ordinary REST and Socket.IO owner operations verify it locally, then re-check lifecycle and session version from PostgreSQL; they do not call Strapi.

Current and previous signing keys support verifier-first rotation. Add the next verification key before minting with it, retain the previous key through the last possible live credential plus clock skew, then remove it. Incrementing `sessionVersion` revokes existing credentials immediately without waiting for expiry.

## Lifecycle

Deletion is a durable saga:

1. `prepare` records `pending_deletion`, revokes credentials, and returns an operation ID.
2. `boundary` records that the upstream destructive boundary was crossed.
3. the worker deletes or anonymizes dependent data according to the table manifest;
4. finalization writes a durable tombstone;
5. `cancel` is permitted only before the irreversible boundary.

Block/suspend revokes local credentials and hides public resources. Reactivation requires authoritative proof and never revives a tombstone. Unknown, private, suspended, pending-deletion, and revoked public resources share the same safe 404 response.

## Publication and guest authority

Publication is explicit. `private` is undiscoverable; `unlisted` requires a 256-bit per-slug capability in the `X-Music-Guest-Capability` header and is `noindex, nofollow`; `public` is discoverable and sitemap-eligible. A capability is returned only once, after an owner-authorized unlisted publication command, and is never placed in a URL, log, metric, sitemap, or stored plaintext. Rotation and revocation occur through the same idempotent publication command.

Guest Socket.IO and REST operations have an exact allowlist. Guests may read allowed public state and submit bounded requests when policy permits; they never emit owner `player_state` authority.

## Runtime facts and debt

The supported runtime is Node 24.21.0 (24.x). Both clients run React 18.3. Tunes runs Express 5.2 while still carrying `@types/express` 4.17 definitions; that type-definition mismatch is known debt, not evidence that the runtime is Express 4. New Music modules must remain clean under the scoped type gate and the normalized repository diagnostic baseline.

The standalone native-session login/logout/check/CSRF endpoints are an explicit exception for a separately opened Tunes experience. Secure cookies, origin and CSRF validation, rotation on login, and logout invalidation apply. Native session state is never an embedded Explorer fallback and never substitutes for the Music credential on canonical owner routes.
