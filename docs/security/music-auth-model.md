# Music authentication and authorization model

## Trust boundaries

Explorer identity and Account selection are verified at `POST /api/music/identity/ensure`. Tunes then mints a short-lived Music credential and derives a numeric principal locally.

Canonical owner routes authenticate only with the short-lived Music credential; neither a Tunes session cookie nor an Explorer/Strapi JWT or bearer is accepted.

Canonical owner REST and Socket.IO routes accept that credential only.

The guest boundary accepts a per-slug capability only for the explicit guest allowlist. A separately opened native Tunes session is confined to its documented login/logout/check/CSRF endpoints.

The retired caller-supplied username header is absent from canonical Music routes.

No authorization decision may use browser username or email, user/owner/Account/document IDs in a request, Account array order, a public slug, an unverified decoded JWT, a fallback signing secret, or an arbitrary GraphQL service-token proxy. Ambiguous credential combinations fail closed.

## Owner predicate

The Music bearer is verified for algorithm, issuer, audience, key ID, time claims, immutable subject/account context, numeric `musicUserId`, and `sessionVersion`. PostgreSQL then confirms current lifecycle and version. Every owner repository query includes that numeric owner in the SQL predicate; a route resource ID alone is never sufficient. Cross-owner resources return the contract-safe forbidden/not-found response without leaking existence.

## Keys and revocation

Music credentials use a fixed ten-minute lifetime and current/previous verifier set. Rotation is verifier-first and overlap lasts through the last old token plus clock skew. The current key is never silently synthesized or replaced by a fallback. Logout-all, account security action, and lifecycle changes increment `sessionVersion`, which invalidates live credentials immediately.

Publication-response encryption keys rotate verifier/decryptor-first for the fixed 24-hour idempotent replay window. Images eligible for rollback must contain every key needed by still-live credential and publication records. Key material is file-backed in production and excluded from the application image, logs, status, evidence, and source control.

## Guest capability

An unlisted capability is random 256-bit authority stored only as a hash server-side. It is bound to one public slug and sent only in `X-Music-Guest-Capability`. It never appears in a URL, query, referrer, log, metric label, sitemap, analytics event, or owner dashboard response. Owner-authorized publication commands atomically rotate/revoke it. Public resources do not require it; private and unsafe lifecycle states are indistinguishable from unknown resources.

## Origin, session, and payload rules

Browser mutations require an exact configured Origin; wildcard, suffix, missing, opaque, and credential-bearing origins fail. Socket handshakes use the same exact allowlist. Payloads are schema-validated and size/rate bounded before domain work.

Native-session cookies are secure and httpOnly in production, follow the configured SameSite policy, rotate on login, and invalidate on logout. Mutations enforce origin and CSRF. This exception is standalone only and cannot authorize embedded Explorer Music routes.

## Redaction and observability

Return and log stable error codes plus a bounded request ID. Never log tokens, cookies, passwords, OTP/verification fields, emails, raw identity bodies, Strapi payloads or upstream errors, response headers, SQL containing user data, guest capability URLs, or room/capability values. Metrics use bounded outcome/cache/circuit/retry/latency dimensions only; no identity or credential cardinality.

## Fixture and release authority

Fixture commands accept only `DATABASE_URL_TEST` resolving exactly to `postgresql://music_migrator@127.0.0.1:55432/music_fixture`. No disposable migration or destructive test falls back to `DATABASE_URL`. Production database access is private and file-credentialed.

Release qualification is supported only through the checked-in native launcher. It rejects ambient `NODE_*` startup authority and rebuilds a minimal environment before Node. The trust boundary begins at that native launcher and the local OS user/Docker authority; unsupported direct Node execution by the same user is not claimed to be cryptographically sandboxed and already has equivalent direct Docker authority. Preventing that would require a privileged external broker outside this release.
