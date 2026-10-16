# Ticket 2.2 implementation report

Base: `e65de223525f5327339eb5c85b89bf7f9e881e06` on `codex/unified-replatform` in the assigned `replatform-audit` worktree.

## Preflight and choices

- Read ticket 2.2, Epic 2's shared Actor and global constraints, the target schema's canonical identity and Music mapping sections, and the 2.1 Better Auth implementation.
- Kept Better Auth as the sole web-session verifier. The new resolver derives the owner from its server-side session row, Google provider association, initial binding and current membership. Browser account IDs cannot select authority.
- Added a database-issued session-generation stamp. This makes later `user_security_state.session_version` increments invalidate already issued sessions at the next request, while preserving Better Auth's session expiry and revocation check.
- Added the transitional `account_music_identity` table with canonical UUID primary key and unique numeric Music owner FK to existing `users`. The target `music_owners` rename remains a coordinated 6.1 migration; existing Music ownership columns stay numeric.
- Updated strict migration, runtime-role, deployment, fixture-restore and route-surface inventories together with the append-only 0023 migration. Historical migrations and retired routes were not changed.

## Behavior and evidence

- Unit matrix covers exact owner versus foreign account, removed membership, suspended and pending-deletion account, stale session generation, OAuth operation scope, and a numeric Music mapping lookup isolated by the actor's canonical account.
- Real HTTP and PostgreSQL integration covers anonymous, duplicate credentials, forged account query ID, foreign account authorization, membership removal, suspension and pending deletion after issuance, and stale generation after issuance.
- `npm test -- server/test/explorers-authorization.test.ts`: 4 passed after a red test for missing Music resolver factory. Earlier authorization tests also failed before implementation because the application authorization module was absent.
- New integration file ran through a temporarily narrowed, attested `music:test:uat-database` harness: 5 passed, zero skipped, disposable database dropped and container removed. The checked-in UAT file manifest was restored unchanged after this targeted run.
- Full existing `npm --prefix tunes run music:test:uat-database -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`: 13 files, 157 passed, zero skipped; disposable database dropped and container removed.
- Focused migration, deployment, runtime-surface, documentation, retirement and authorization unit suites passed. `npm run build:api`, `npm run music:types:scoped`, and `npm run music:types:baseline` passed; the latter reports no new diagnostics against its established TypeScript baseline.
- `git diff --check` passed.
- Two broad `npm test` attempts reached slow deployment executable scenarios and were stopped after focused evidence was complete. The first exposed stale 0021 compatibility-floor expectations; those were updated, and the three changed deployment scenarios passed individually. A complete broad-suite result is not claimed.

## Boundaries

No OAuth transport, socket credential issuance, Music REST route conversion or numeric owner provisioning is included. The Music resolver requires a current account membership and a web session, and only reads an existing map. The 6.1 implementation must create that map transactionally and route all owner Music REST through the same canonical web session before retiring the legacy Music owner path.

The local `platform:local` receipt was stale at preflight. Exact guarded reset succeeded. A subsequent provision started with an old Compose model while files were changing and failed its same-image marker gate; the owned local fixture was reset again. Independent attested disposable PostgreSQL UAT supplied the database evidence above.

## Stable-commit follow-up

At committed HEAD `c91cef4a6a014f3649844e42a342e62a28313525`, with application files stable, `npm run platform:local -- provision` exited 0 and reported `ready: true`, PostgreSQL 15.17, and `migrationCount: 23`. `npm run platform:local -- check` then exited 0 with the same readiness and migration count. The pre-provision `check` failed at `receipt-check` because the prior guarded reset had intentionally removed its receipt. No further reset was needed.

Hosted image discovery uses the Tunes workflow's `npm run test:integration` command (`.github/workflows/tunes.yml`), with `MUSIC_C3_POSTGRES_TEST=1`. That package script runs `vitest run --config vitest.integration.config.ts`; the integration config includes `**/*.integration.test.ts`, which matches `server/test/explorers-authorization.integration.test.ts`. This is separate from the 13-file `MUSIC_UAT_DATABASE_TEST_FILES` manifest and the explicit legacy-file list in `.github/workflows/test.yml`. The 157-pass local UAT result above covers only those 13 files; the new authorization file's separate result is 5 passed. A local `vitest list` attempt without the destructive-suite guard stopped during global setup with its expected `MUSIC_C3_POSTGRES_TEST=1 is required` error, so the workflow/config discovery is established by read-only inspection rather than a new list run.
