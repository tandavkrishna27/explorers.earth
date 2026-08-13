# Local Tunes Production Sync Investigation

**Date:** 2026-08-13
**Scope:** Read-only production reproduction, deployment/schema audit, identity lifecycle audit, and existing-test baseline.
**Status:** DONE_WITH_CONCERNS — root causes are confirmed; remediation was intentionally not implemented because the requested deliverable is an approved design and test plan first.

## Symptom

After a Google-authenticated Explorers user opens Music, `POST /api/auth/sync` returns HTTP 500 with `Failed to sync user with database`. The same shared sync path is used by manual-email users after authentication, so the failure is not provider-specific.

## Confirmed root causes

1. **Production schema was never applied.** Read-only production probes of `GET /api/auth/user-data` and `GET /api/auth/onboarding-status` consistently return HTTP 500 when selecting from `users`. A prior read-only database inspection found zero application tables in the production database.
2. **Deployment has no migration step.** `.github/workflows/tunes.yml` recreates the environment and runs `docker compose down` followed by `docker compose up -d --build`, but never runs `drizzle-kit migrate` or an equivalent schema operation.
3. **The repository has no migrations on `origin/main`.** Migration files exist only on the divergent `database-change` branch. That branch cannot be merged wholesale because it removes or rewrites substantial newer application and test code.

## Architectural defects that remain after creating the tables

- `/api/auth/sync` is unauthenticated and trusts `req.body.strapiUser`.
- JWT code uses `jwt.decode` without signature verification, and the middleware is not actually registered on the Music routes.
- Owner identity is accepted from `X-Username`, query parameters, or request bodies throughout legacy routes.
- Tunes correlates users by mutable username; the `users` table has no immutable Strapi identifier.
- Sync uses a non-atomic find-then-insert sequence, so concurrent calls can race.
- Email changes are detected but not persisted.
- Username changes commit in Strapi first and then attempt a best-effort Tunes patch with no rollback or durable retry.
- Account name, deactivation, reactivation, and permanent deletion are not synchronized to Tunes.
- `AuthSyncManager`, onboarding, `useTunesDashboard`, Home, and Music create overlapping provisioning attempts.
- Request logging includes POST-body previews, and API errors expose raw SQL query text.
- PostgreSQL is published on a host port and the compose file contains default database credentials. Credentials must be rotated and the port removed from public exposure.

## Failure pattern classification

- Primary: configuration drift and integration failure.
- Secondary: state corruption risk from partial cross-database updates.
- Secondary: race condition in concurrent provisioning.
- Security: broken authentication/authorization boundary caused by client-supplied identity.

## Evidence

- Production read-only probes returned HTTP 500 on the first `users` query for a synthetic nonexistent username.
- `tunes/shared/schema.ts` defines the expected application tables.
- `.github/workflows/tunes.yml` contains no schema-migration command.
- `tunes/server/services/user-sync-service.ts` looks up by username and does not update changed email.
- `tunes/server/auth-bridge-routes.ts` accepts an unauthenticated client-supplied user object.
- `tunes/server/jwt-auth-middleware.ts` decodes rather than verifies JWTs and has no route registrations.
- `explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts` updates Strapi before the independent Tunes rename request.

## Existing test baseline

- Tunes unit suite: **72 tests passed across 6 files**.
- Targeted Explorers Music/API client tests: **9 tests passed across 2 files**.
- Tunes `npm run check`: **fails with a large pre-existing TypeScript baseline** across unrelated client and server code. The implementation plan must add a scoped type-safety gate for the new identity modules rather than claiming the existing full check is green.
- Tunes integration tests already use `DATABASE_URL_TEST` and deliberately refuse to inherit ambient `DATABASE_URL`, which is a good safety property. They currently require a manually supplied disposable PostgreSQL database and are not run by the root CI workflow.

## Required remediation boundaries

1. Secure and automate database migrations before application rollout.
2. Add an immutable Strapi-to-Tunes identity mapping while preserving Tunes' numeric primary key for music foreign keys.
3. Make the Tunes server derive identity from a validated Strapi token, never from client username fields.
4. Make provisioning an idempotent atomic upsert using server-fetched canonical Strapi data.
5. Cut all embedded Music owner endpoints over to the server-resolved Tunes user ID.
6. Synchronize rename, email, account name, suspension/reactivation, and permanent deletion.
7. Remove duplicate client sync triggers and retain one post-onboarding ensure plus login/Music fallback.
8. Add unit, contract, real-Postgres integration, concurrency, security, frontend, E2E, migration, deployment, failure-injection, and production-canary tests.

## Related

- `docs/plans/database-change-*` and commit `dbc8d61` contain useful migration research, but their implementation branch is obsolete relative to current `origin/main` and must be re-applied selectively.
- Existing `user-leak.integration.test.ts` explicitly documents missing authentication/identity assertions as follow-up work.
