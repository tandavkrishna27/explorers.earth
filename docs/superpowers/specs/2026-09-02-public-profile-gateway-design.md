# Public Profile Gateway Design

## Purpose

Move every anonymous public recommendation read behind a single, server-owned
boundary. The public profile must reliably show only content that the creator
has made public, without exposing a Strapi credential or granting unrestricted
anonymous Strapi collection access.

## Scope

This design covers every recommendation category: Places, Movies, Books,
Games, Guides, Apps, Products, and People. Music remains on its existing
public Local Tunes contract. Dashboard editing remains on authenticated
Strapi GraphQL and is out of scope.

The change preserves the existing public URLs and presentation layouts. It is
not a redesign of the dashboard, profile shell, music, analytics, or cookies.

## Current Problem

Strapi's Public role currently permits anonymous reads of `Account` and
`Recommendation-list` but denies `App-list`, `Product-list`, `Person-list`,
and `Guide`. The browser performs a separate Strapi GraphQL query for each
category. Consequently a profile may partially render and show the misleading
page-level "Some categories are unavailable" error, even though the account
has public lists.

Broadly enabling these collection permissions would restore rendering but is
not acceptable for production: an anonymous client controls GraphQL filters
and can directly enumerate data outside the product's intended public-profile
policy.

## Decision

Use the existing Local Tunes Express service as an Explorers public-profile
backend-for-frontend (BFF). The browser calls only the BFF for anonymous
recommendation data. The BFF calls Strapi using a server-only, least-privilege
read token and applies the public visibility policy itself.

This does not add a third backend and does not require a Strapi code change.

## API Contract

All endpoints are versioned JSON endpoints under `/api/explorers/v1`.

### Public profile shell

`GET /api/explorers/v1/profiles/:username`

Returns only the profile fields required by the public shell, the normalized
navigation/visibility metadata, and recommendations presentation settings.
It returns `404` for an absent or non-public profile; it must not reveal which
condition caused the result.

### Category projection

`GET /api/explorers/v1/profiles/:username/recommendations/:category`

`category` is a fixed allowlist: `places`, `movies`, `books`, `games`,
`guides`, `apps`, `products`, `people`. The response contains public list-card
data for that category, a bounded cursor/page, and an ETag. The route rejects
unknown category values before contacting Strapi.

The root recommendation tab requests its enabled categories progressively
with bounded browser concurrency. A direct category route requests only its
own category. The BFF never accepts raw GraphQL, arbitrary Strapi filters,
field selections, account document IDs, or unbounded limits from a client.

### Details

Existing public detail URLs retain their current URL shape. Their data is
served through category-specific BFF detail resolvers that verify the same
profile/category/list policy before resolving a slug. Detail responses contain
only the existing public view-model fields. An unavailable or private resource
returns `404`, not a distinguishable authorization error.

## Public Data Policy

For every request, the BFF:

1. Normalizes and bounds the username.
2. Resolves exactly one account.
3. Requires `public_profile = Yes`.
4. Requires the corresponding category visibility flag to be `Yes`.
5. Requires the relevant list/item to be published and publicly visible.
6. Maps the Strapi result to a category-specific public DTO with an explicit
   field allowlist.

The policy must be shared rather than independently reimplemented in route
handlers. The response must never include emails, phone numbers, creator
credentials, raw user relations, private list metadata, unpublished content,
or arbitrary Strapi fields.

## Credential and Deployment Model

Create a Strapi **Custom**, read-only API token named
`Explorers Public Profile Reader - Production`. Store it only in the Local
Tunes production runtime as `STRAPI_PUBLIC_PROFILE_READ_TOKEN` (or as a
root-owned secret file referenced by the runtime environment). It is never a
`VITE_*` variable, never included in the Explorers frontend build, and never
sent to a browser.

The custom permission set is derived from the exact BFF queries. It grants
only read access to Account, the eight list types, their necessary public
recommended-content types, and public media relationships. It grants no
create, update, delete, user-management, subscription, analytics-write, or
admin access. Tests must prove the minimum permission matrix before production
rollout.

The Local Tunes production deployment already reads a protected
`production.env` for Docker Compose. The deployment procedure must add the
runtime secret there (or its secret-file equivalent) and ensure
`ALLOWED_ORIGINS` includes `https://explorers.earth`. The frontend deployment
needs only the already-public Local Tunes base URL; it receives no new secret.

## Reliability and Scale

Each BFF read has a deadline, bounded retries only for safe upstream failures,
bounded concurrency, input-size limits, and request IDs. Public routes apply
an IP/resource rate limit appropriate for cacheable GET traffic.

Responses support ETags and short public cache headers. The service keeps a
small bounded in-process cache initially; this is an optimization, not a
correctness dependency. A future CDN or shared cache can use the same headers
without changing clients. No Redis is required for the first release.

After a successful dashboard save, the creator's public-profile view performs
a revalidation/bypass request so the creator sees the saved state immediately.
Other visitors may receive content up to the documented short cache TTL old.

Category requests are paginated and preview-limited; no route may mirror the
current unbounded "all categories, 100 lists each" pattern. The all-category
page performs progressive loading while preserving the public shell and
navigation.

## Failure Behaviour

The profile shell and navigation remain mounted while category data is loaded
or refreshed. A failed category shows only an inline, retryable category state
with a generic safe message. Successful categories remain visible. The old
page-level "Some categories are unavailable" banner is removed.

`404` is used for absent/private resources. Upstream failures are represented
by a stable, non-sensitive 5xx error envelope including a request ID. The
frontend may retry only retryable failures; it must not spin or replace the
whole page with a loader.

## Frontend Migration

Anonymous public-profile components use a typed client for the BFF contract.
Dashboard/owner paths retain their authenticated Apollo queries. The
recommendation layout components receive the same public card view models they
use today so visual design and URLs are preserved. Loading state follows the
existing shell-continuity model: the shell stays visible and only new route
content uses a skeleton/inline state.

## Observability

Log structured events without personal data or credentials: route, category,
outcome, upstream status class, cache outcome, bounded latency, and request
ID. Add counters/health evidence for BFF availability, upstream Strapi errors,
cache outcomes, and policy-denied/not-found results. Do not include raw
username or data payloads in high-cardinality metrics.

## Verification Requirements

- Unit tests for username/category validation, visibility rules, DTO mapping,
  cache/ETag behaviour, and safe error mapping.
- Route integration tests using a Strapi fixture that prove each category,
  public/private profiles, enabled/disabled category flags, published/draft
  lists, private details, bad slugs, timeouts, and rate limits.
- Contract tests proving no browser-facing source contains the new credential,
  raw Strapi GraphQL, or caller-controlled Strapi filters for anonymous
  recommendation reads.
- Frontend tests for shell persistence, progressive category loading, inline
  category failure/retry, all layouts, and preserved direct URLs.
- Browser E2E across Chromium, Firefox, and WebKit with every category and
  dashboard visibility/pinning permutations relevant to a public page.
- Manual UAT in Chrome against a real public profile after deployment,
  including a dashboard save followed by immediate creator revalidation.
- Production readiness checks for CORS, token permissions, health, cache
  headers, no credential leakage, and real anonymous public routes.

## Non-goals

- Changing Strapi source code or broadly enabling Strapi Public collection
  permissions.
- Introducing Redis, a CDN configuration, a third backend, or a database
  migration in the initial release.
- Changing Music's public API, dashboard editing architecture, analytics
  semantics, public route naming, or visual design beyond failure/loading
  containment required by this feature.
