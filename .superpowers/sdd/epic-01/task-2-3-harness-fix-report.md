# Ticket 2.3 migration harness repair (round 4)

Base: `44e62698`, branch `codex/unified-replatform`. This repair follows the round-3 Settings harness fix and scoped independent review. It changes tests and a shared typed fixture only; no application, backend, migration, dependency, or deployment code changed.

## Cause and repair

- Reproduced the 22 failures across the four reported suites: Sidenav and category navigation lacked a QueryClient provider for the newly canonical account consumers; Home's partial TanStack mock omitted the real account query hook. Each now uses a fresh real QueryClient. Home and category surfaces mock only `explorersApiClient.getMyProfile` with a complete typed `AccountDto` fixture. Sidenav's existing signed-out navigation case needs the provider even though its account query is disabled.
- Home still uses the existing Apollo query for analytics/category account scope. Its loading/error/retained-account/account-transition scenarios and all analytics assertions remain intact. Three card assertions now await rendering after the separate canonical profile request completes. The real canonical hook and account setup binding execute.
- Category navigation retains its real Apollo link, verified navigation provider, publication writes, fresh content checks, account transition guards, and all 108 assertions. The provider is local to this suite so unrelated shared surface harness consumers are unchanged.
- The retired-Music source guard now requires canonical update with completed onboarding, then canonical refetch, then navigation home. The existing prohibitions against direct `musicIdentityCoordinator` and `ensureIdentity` triggers remain. All other legacy identity/header/cookie/file/username authority checks remain untouched. The obsolete Apollo `MusicIdentityEligibility` refetch string is no longer required from canonical onboarding.
- Added `src/test/canonicalAccountFixture.ts`, typed against the shared `AccountDto`, with complete schema-shaped account data. No tests were removed, skipped, or weakened to ignore errors; the assertion total remains 3,919.

## Commands and results

Commands below ran from the repository root unless a different directory is specified. Logs are local ignored `harness-*.log` files.

1. Before repair: `npm --prefix explorers-earth run test:unit -- src/__tests__/Sidenav.test.tsx src/pages/__tests__/Home.analytics.test.tsx src/features/navigation/__tests__/categoryNavigationSurfaces.test.tsx src/features/music/__tests__/legacyMusicBoundary.test.ts` — exit 1, 4 failed files, 22 failed / 102 passed assertions. Log: `harness-before.log`.
2. First repair run, same command — exit 1, 3 failed / 121 passed assertions. All three were immediate Home card lookups while the real canonical query was pending; adding async rendering waits preserved their behavioral assertions. Log: `harness-after.log`.
3. Final focused run, same command — exit 0, 4/4 files, 124/124 assertions. Log: `harness-focused.log`.
4. `npm --prefix explorers-earth run test:coverage` — exit 0, 270/270 files, 3,919/3,919 assertions. Overall coverage: statements 43.86%, branches 38.52%, functions 38.88%, lines 43.26%; configured thresholds passed. This is the frontend coverage command in `.github/workflows/ci.yml`. Log: `harness-coverage.log`.
5. `npm --prefix explorers-earth run test:unit` — exit 0, 270/270 files, 3,919/3,919 assertions. Log: `harness-unit.log`.
6. `npm --prefix explorers-earth run test:music-critical-coverage` — exit 0, 16/16 files, 430/430 assertions; all configured critical files achieve 100% statements/branches/functions/lines. This is the frontend critical coverage gate in `.github/workflows/test.yml`. Log: `harness-music-coverage.log`.
7. From `explorers-earth`: `npx tsc -b` — exit 0. Log: root `harness-types.log`.
8. `git diff --check` — exit 0.

No additional failures remained in these full frontend runs. This frontend-only repair does not rerun or claim backend/database/browser/provider/S3 checks, or resolve the previously recorded Windows shell deployment suite limitation. No installs, database actions, remote operations, push, or subagents were used. Unrelated generated static files, the ticket-2.2 report, and pre-existing untracked documents were preserved. Independent review remains the parent's next step.
