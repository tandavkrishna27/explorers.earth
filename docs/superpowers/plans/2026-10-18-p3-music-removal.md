# P3 — Music Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Music product — frontend, legacy server composition, canonical seam,
deployment machinery and database schema — leaving a canonical application with no Music code
path and an archived record of what Music was.

**Architecture:** Nine tickets, ordered **consumers before providers**: the SPA stops using
Music and learns to tolerate an account without it, then the canonical server stops offering it,
then the shared category is retired, then the legacy composition and its deployment are deleted,
and only then are the Music tables dropped. Every ticket merges to `main` and deploys, so every
ticket must leave production working on its own.

**Tech Stack:** TypeScript, Express 5, React 18, PostgreSQL 15, Vitest, Playwright.

**Gated on P2 proven in production.** P3 deletes the only fallback.

**Revision 3 (2026-10-18).** Two independent reviews against the code, then a Codex cross-model
review. Revision 1 had four defects that would have failed in production — two migrations
PostgreSQL rejects, a migration gate that crashes *after* its migration commits, and a provider
change shipped ahead of its consumer. Codex then found that `0058` would orphan venue rows behind a
completed account deletion, and that category saves still broke in the `0057` deploy window. All
are listed in [Corrections from review](#corrections-from-review).

---

## Before you start: what this plan decided

**1. Canonical Music provisioning goes too.** The canonical app registers a Music identity route
(`tunes/server/auth/canonicalApp.ts:84-103`, under ADR-006 and ADR-008). The owner's settled
direction was to remove Music's front end **and** back end, so P3-5 removes it. If the owner wants
canonical Music provisioning kept, P3-5 and P3-9 are redesigned — say so before P3-5.

**2. `users` and the `0001` baseline tables survive P3.** Dropping `users` means dropping roughly
twenty baseline tables that reference it (`0001_runtime_baseline.sql:34-257`) and their sequences,
and after P3-7 it is still read by `music-runtime-role.ts` and by
`services/explorers-analytics-composition.ts`, which the canonical analytics route loads by
dynamic import. P3-9 drops only the ten Music tables and the Music triggers on `users`. Cleaning up
`users` and the baseline belongs with Strapi retirement (P6), which removes the analytics
composition that still reaches it.

**3. Two migrations, `0057` and `0058`, assigned at merge.** Retiring the `music` category and
dropping the Music schema have separate blast radii. The backbone reserved `0057` for "10.1's
OAuth tables"; **no such reservation exists in the repo**, and the chain must be contiguous
(`music-migration-contract.test.ts:39`). P4 (subscription removal) is independent and may land a
migration first — renumber if so.

**4. `musicRetirementPolicy.ts` is kept and renamed.** After P1, the canonical module
`tunes/server/policies/canonicalRetiredSurfaces.ts` imports it, and its job — answering retired
routes with 410 — outlives Music. P3-5 extends it; P3-8 renames it.

**5. No image rollback after `0057`.** `readiness.ts:13` requires an exact migration-id match, so
an image older than the database refuses to boot. Recovery from P3-6 onward is forward-only.

---

## What "Music" is, measured

The import closure, from the three legacy roots (`server/index.ts`, `server/app.ts`,
`server/routes/index.ts`) against `server/auth/canonicalStartup.ts`, at `origin/main`:

| Closure | Files | Lines |
|---|---|---|
| Canonical | 164 | 26,140 |
| Legacy | 206 | 38,924 |
| **Shared by both** | **155** | **25,502** |
| **Deletable legacy server source** | **51** | **13,422** |

| Production surface removed | Lines |
|---|---|
| Legacy server source | 13,422 |
| `tunes/client/` — the legacy Music SPA | 33,053 |
| `explorers-earth/src/features/music/` | 5,140 |
| Frontend Music outside `features/music/` | ~2,100 |
| Canonical Music tail (deleted in P3-7, once unreferenced) | ~3,300 |
| **Total** | **~57,000** |

Plus about 51,000 lines of `music`-named tests in `tunes/server/test`, 16,800 in
`explorers-earth/e2e` and 14,200 in `tunes/scripts`.

**"storage" means `tunes/server/storage.ts` (2,513 lines, legacy) — never
`tunes/server/services/objectStorage.ts` (191 lines), which the canonical app uses at
`canonicalStartup.ts:50`.**

---

## Ticket order

| # | Ticket | Must precede |
|---|---|---|
| P3-1 | Preserve: tag and archive | every deletion |
| P3-2 | Retire `combined` mode | P3-7 |
| P3-3 | Move shared frontend modules out of `features/music/` | P3-4 |
| P3-4 | Remove the frontend Music surface; make the SPA tolerate an eight-category account | **P3-6** |
| P3-5 | Cut the canonical Music route and analytics routes | P3-6, P3-9 |
| P3-6 | Retire the `music` category — migration `0057` | P3-9 |
| P3-7 | Delete the legacy composition, its deployment and the Music tail | P3-9 |
| P3-8 | Rename the retained `music-*` modules | P3-9 |
| P3-9 | Drop the Music tables — migration `0058` | — |

**Why P3-4 must make the SPA tolerant, not just remove Music.** P2's deploy switches the API at
`compose up` and swaps the SPA only after the readiness checks, and any tab already open keeps its
old bundle until it reloads. If the server narrows to eight categories while a live bundle still
insists on nine, `canonicalNavigationMapping.ts:10` returns `invalid()` for every user and the
navigation editor shows *"Category settings are incomplete"*. So the tolerant SPA must be the live
bundle **before** P3-6 deploys.

---

## Two checks no review can do for you — run them on every ticket

Executing P1 surfaced five errors that survived two adversarial reviews and a cross-model pass. They
fell into two classes, and this plan is exposed to both.

**1. Execute every literal before you build a test on it.** Error codes, handler and function names,
environment keys, constraint names, function signatures, line numbers. P1's plan asserted
`error.code === "ORIGIN_FORBIDDEN"` when the guard sends `"FORBIDDEN"`; located a parser by a
`.name` that the anonymous arrow does not have; and set an env var that could not trigger the failure
it claimed to test. Each read plausibly and each was refuted by one command. This plan names dozens
of such literals — `users_lifecycle_operation_id_fk`, twenty-two function signatures, generated CHECK
names, `account_category_display_order_uq`, `LANDING_TAB_SET`. Look each one up in the real code or a
migrated database first. Where the plan says "find the real name", it means it; where it gives a name,
treat it as a lead to confirm, not a fact.

**2. Confirm each new test actually runs in a gate.** `tunes/vitest.config.ts` **excludes**
`*.integration.test.ts` from the default run. Integration tests run only through
`--config vitest.integration.config.ts`, and in CI only in `tunes.yml`, which runs on PRs to `main`.
P3-6 and P3-9 put their migration and gate tests in integration files — necessarily, since they need a
real migrated database. So: run them explicitly (the commands are in each ticket), and confirm the
`tunes.yml` lane picks them up on the PR. A test that never executes is worse than none, because it
reads as coverage. For a unit test that needs one database-dependent precondition, P1's answer was a
separate unit file that `vi.mock`s only that precondition and exercises the rest for real.

**Typecheck: "no new errors", not "prints nothing".** On a pristine tree,
`tsc --noEmit -p tsconfig.json | grep -E '^(shared|server)/'` already prints one error, in
`server/services/youtube-playlist-import.ts:307`. That file is legacy; once P3-7 deletes it the output
should become genuinely empty, and from then on any line is real.

---

## Facts an engineer needs before starting

**Where the code is.** Start every ticket from current `origin/main`, which by then contains P1
and P2. Check with `ls tunes/server/auth/canonicalApp.ts` before anything else.

**The verification harness after P3-2.** Thirteen of the fourteen e2e lanes run the canonical app
in-process and need no compose file:

```bash
npm run platform:test:e2e -- --milestone delivered-auth-profile-books \
  --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt "<a directory that does not exist>"
```

Add `--lane public-parity` (or `apps`, `guides`, `people`, `apps-enrichment`) for the inner loop.
Preconditions: Node exactly `24.21.0`; `node_modules` in root, `tunes`, `explorers-earth` and
`tunes/auth-runtime`; Playwright Chromium; a **clean tree** over
`tunes/server|shared|auth-runtime|migrations` and `explorers-earth/src|public|e2e/replatform|e2e/setup`;
a receipt directory that does not exist; and none of `DOCKER_HOST`, `DOCKER_CONTEXT`,
`DATABASE_URL`, `GATE_PROD`, `PLAYWRIGHT_EXTERNAL_BASE_URL` set.

The container-free route contract runs anywhere in seconds:

```bash
npm test --prefix tunes -- --run server/test/contracts/platform-route-signatures.test.ts
```

**Every lane migrates the Music schema** through `tunes/scripts/music-uat-database.ts`. That is
Music *tooling*, retained and renamed in P3-8. Delete it and all fourteen lanes die.

**Integration tests cannot see a boot failure.** `canonicalStartup.ts:31-35` runs the role
attestation only inside `if (!pool)`, and every integration test injects a pool. A green
integration suite proves nothing about whether the canonical app boots. P3-6 and P3-9 boot the
real server.

**The PostgreSQL trap behind P3-9.** PostgreSQL does not record plpgsql function bodies as
dependencies. `DROP TABLE account_music_identity` succeeds while a function still names it, and
the failure surfaces later — at COMMIT, inside a *deferred* trigger on `users`, attributed to the
function. Drop triggers and functions explicitly, in order. **Never use `CASCADE`.**

**Generated `.dockerignore` files enumerate exact paths.** Both `.dockerignore` and
`explorers-earth/Dockerfile.music-fixture.dockerignore` list individual files, including
`features/music/*`. Every ticket that moves, deletes or renames a file must regenerate them with
`node scripts/generate-music-fixture-dockerignore.mjs`; `music-fixture-services.test.ts:875` pins
the result.

---

## Growing the migration chain

Both `0057` (P3-6) and `0058` (P3-9) change every file below **in the same commit** as the
migration. `.github/workflows/test.yml:38` runs the manifest, inventory, documentation and
environment contract tests on every PR — they catch an incomplete bump.

| File | Change |
|---|---|
| `tunes/migrations/00NN_<name>.sql` | the migration |
| `tunes/shared/music-migration-contract.ts:1` | `EXPECTED_MUSIC_MIGRATION_ID` |
| `tunes/shared/music-migration-contract.ts` `EXPECTED_MUSIC_MIGRATION_CHAIN` | append the new id |
| `tunes/shared/music-migration-contract.ts` `DEPLOYABLE_MUSIC_MIGRATION_MARKERS` | append; its index is the rank `musicMigrationMarkerRank` uses |
| `deploy/production.compose.yml` (from P2) | `MUSIC_MIGRATION_MARKER` on `migrate` |
| `deploy/platform.compose.yml:56` | `MUSIC_MIGRATION_MARKER` |
| `docker-compose.replatform.yml:66,157` | marker and expected id — edit those two lines only, **never print the file** |
| `.github/workflows/tunes.yml:157` | the in-image file-existence list |
| `fixtures/db/music-runtime-table-manifest.json` | `migrationChain.expectedId`, `migrationChain.files[]`; `tables[]` / `controlTables` when tables are dropped |
| `docs/architecture/music-documentation-contract.json:88` | the chain array |
| `scripts/platform-runtime-smoke-contract.mjs:14` | hardcoded `schema.currentId` |
| `tunes/scripts/platform-proxy-browser-fixture.ts:21` | hardcoded `currentId` guard |
| `tunes/server/test/migrations/music-migration-contract.test.ts` | asserted id, ordered chain, manifest consistency |
| `tunes/server/test/contracts/music-e2e-state-restore.test.ts:184` | chain list |
| `tunes/server/test/contracts/music-local-database.test.ts:24,47` | fixture `currentId` |
| `tunes/server/test/contracts/platform-runtime-smoke.test.ts:5` | fixture `currentId` |
| `tunes/server/db/migrate.ts:260,262` | only if the migration needs a pre/post hook like `0056` |
| **Only while they still exist (deleted by P3-7):** `docker-compose.yml:170,176,185,191,209`, `docker-compose.music-test.yml:63,146`, `.env.music.example:57`, `.env.music.test.example:54`, `tunes/deployment/music-deploy-engine.sh:20`, `tunes/scripts/music-docker-release-rehearsal.ts:84`, `music-environment-contract.test.ts:36,46`, `music-deploy-executable.test.ts` | |

`0057` lands before P3-7 and touches the last row; `0058` lands after and does not. Catch anything
this table missed:

```bash
grep -rn "0056_explorers_app_enrichment_jobs" --include=*.ts --include=*.mjs --include=*.json --include=*.yml --include=*.sh --include=*.example . | grep -v node_modules | grep -v "^./tunes/migrations/"
```

---

## P3-1: Preserve

- [ ] **Step 1: Tag the last commit with Music intact**

```bash
git fetch origin
git tag -a music-v1-final origin/main -m "Last commit before Music removal (P3)"
git push origin music-v1-final
```

- [ ] **Step 2: Archive what the code cannot tell a later reader**

Create `docs/archive/music-v1/` with: the flat DDL of every Music object at `0056` (final function
bodies only — use the inventory in P3-9 Step 1 as the checklist), the `tunes-share-v1` key format,
the socket-ticket and guest-capability models, and ADRs 005–008.

- [ ] **Step 3: Verify and commit**

```bash
git show music-v1-final --stat | head -3 && ls docs/archive/music-v1/
git add docs/archive/music-v1/
git commit -m "docs(music): archive the Music v1 design before removal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-2: Retire `combined` mode

`combined` exists for exactly one container — the `tunes` service in `docker-compose.replatform.yml`.
No e2e lane, CI workflow or Playwright config uses it. It runs the Music server with the canonical
app delegated into it (`tunes/server/app.ts:95-99`). Retiring it means the local fixture proves
**canonical only** from here on.

**Do not print `docker-compose.replatform.yml`** — it holds the owner's real Google OAuth
credentials. Edit only the lines named below.

- [ ] **Step 1: Read the current probe set**

P2 Task 6 added a separate `verifyCanonicalIngress` and left `verifyPlatformIngress`'s eleven
probes untouched. Confirm that by reading `scripts/replatform-route-parity.ts:39-76` before editing.

- [ ] **Step 2: Redefine the ingress invariant — atomic group A**

The invariant is eleven probes (`platform-route-parity.test.ts:65`): five Music (`/api/check`,
`/api/csrf-token`, `/api/user/reactivate`, `/api/explorers/analytics/events`,
`/api/music-fixture/readiness`), five canonical, and the Strapi boundary (`/api/users/me`). Under
`canonical` only five can pass. The file's governance (`:20-23`) forbids lowering the count to
accommodate an absent route — so this is a **deliberate redefinition of what the fixture proves**,
and the commit message must say so. These four land together:

1. `scripts/replatform-route-parity.ts` — remove the Music entries from `CURRENT_TUNES_ROUTES`
   (`:39-50`) and the Strapi block (`:162-165`); rewrite `INVARIANT_NOTE` (`:106-111`); delete the
   stale history at `:94-105`. If `verifyCanonicalIngress` from P2 now duplicates
   `verifyPlatformIngress`, fold them into one.
2. `tunes/server/test/contracts/platform-route-parity.test.ts` — `:65` to `toBe(5)`; the
   `responses` map (`:19-30`), the ordered `seen` list (`:47-59`), the `:114` assertion and the
   Strapi case at `:90-93`. Rewrite the governance comment to record the redefinition and its date.
3. `explorers-earth/nginx.replatform.conf` — remove `= /api/music-fixture/readiness` (`:8`), the
   `~ ^/ws/?$` block (`:90`) and the legacy regex block (`:103`); **move
   `^~ /api/explorers/v1/profiles/` (`:78`) to the `tunes` upstream**, since `canonicalApp.ts:116`
   mounts it and the delegate's carve-out is going.
4. `docker-compose.replatform.yml` — `EXPLORERS_API_MODE: canonical`; add
   `EXPLORERS_PUBLIC_ORIGIN=http://127.0.0.1:51474`, an `EXPLORERS_AUTH_SECRET` of at least 32
   characters, and placeholder `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` if absent (presence and
   length are all `resolveExplorersAuthConfig` checks); move the `tunes` healthcheck to
   `/health/ready`. **Check the current healthcheck value first** — nothing pins it.

- [ ] **Step 3: Update the mode pin — atomic group B, same commit**

`tunes/server/test/deployment/music-deployment-files.test.ts:48` — `"combined"` becomes
`"canonical"`; update the doc comment at `:39-42`.

- [ ] **Step 4: Rewrite the acceptance seed — atomic group C, same commit**

`scripts/replatform-local.ts:606-618` posts to `/api/music/identity/ensure` (legacy only) and asserts
a `users` row with `strapi_user_document_id='e2e-public-music-fixture-user'`. Replace it with a
canonical seed — a public profile with recommendations — via direct SQL or a canonical owner flow.

- [ ] **Step 5: Prove the redefined fixture**

```bash
npm run platform:local -- provision
npm run platform:seed -- --dataset acceptance
npm run platform:test:routes
```

Expected: `{"ingressHandlersChecked":5}`. A hang at `compose up --wait` means the healthcheck still
points at a Music-only path.

- [ ] **Step 6: Delete `combined`**

- `tunes/server/apiMode.ts` — drop `"combined"` from the union, parser, error text and doc block.
- `tunes/server/api.ts:8-19` — collapse the ternary.
- `tunes/server/app.ts` — drop the parameter (`:36,52`) and the delegate block (`:84-99`).
- `tunes/server/config/music-startup.ts:24,40,140` — drop the option.
- Delete `tunes/server/auth/canonicalDelegate.ts`.
- `tunes/server/test/contracts/canonical-delegate.test.ts` — delete, **except the nginx assertions
  at `:81-110`**, the only thing pinning that canonical paths reach `tunes` and that `/api/auth`
  gets no synthesised `Origin`. Move them into `platform-route-parity.test.ts`.

This resolves owner decision #2 in `docs/replatform-audit/reconciliation-2026-10-15.md` (the
combined-mode 64 KiB body-limit divergence) by deletion; say so in the commit.

- [ ] **Step 7: Verify and commit**

```bash
npm test --prefix tunes -- --run server/test/contracts server/test/deployment
npm run platform:test:routes
git commit -m "refactor(platform): retire combined mode; the fixture now proves canonical only

The eleven-probe ingress invariant is redefined to five, deliberately: the Music probes and the
Strapi boundary cannot pass under canonical, and that behaviour leaves with Music.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-3: Move shared frontend modules out of `features/music/`

Eleven non-Music production files import from `features/music/`. Delete the directory first and
the public profile, dashboard layout, settings, navigation and logout break.

- [ ] **Step 1: Write the boundary test**

```ts
// explorers-earth/src/features/__tests__/musicImportBoundary.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(__dirname, "..", "..");

// Music-only imports still inside general files. P3-4 removes each, then empties this list.
const REMOVED_IN_P3_4: readonly string[] = [];

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "music") sourceFiles(path, found);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

describe("Music import boundary", () => {
  it("has no production module outside features/music importing from it", () => {
    // Break caught: P3-4 deletes features/music/ and takes the public profile,
    // the dashboard layout, navigation and logout down with it.
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => /from\s+["'][^"']*features\/music\/|from\s+["']\.\.\/music\//.test(readFileSync(path, "utf8")))
      .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"))
      .filter((path) => !REMOVED_IN_P3_4.includes(path));
    expect(offenders).toEqual([]);
  });
});
```

The pattern includes `../music/` because `features/navigation/categoryNavigationApi.ts:5` imports
`'../music/musicIdentityCoordinator'` by a relative path a `features/music/` pattern would miss.

- [ ] **Step 2: Run it; take the offender list from the output**

```bash
cd explorers-earth && npx vitest run src/features/__tests__/musicImportBoundary.test.ts
```

For reference, the audit found:

| Module | Non-Music importers |
|---|---|
| `PublicMusicAvailabilityProvider.tsx` (incl. `usePublicAccountIdentity`) | `layouts/PublicLayout.tsx`, `routes/PublicRoutes.tsx`, `routes/validators/TabVisibilityGuard.tsx`, `routes/validators/UsernameValidator.tsx`, `components/PublicNav.tsx`, `PublicHome/components/PublicProfile.tsx`, `PublicHome/components/PublicProfileThemeProvider.tsx`, `Settings/Settings.tsx` |
| `MusicPublishProvider.tsx`, `musicPublicationReadiness.ts` | `layouts/DashboardLayout.tsx`, `layouts/MobileLayout.tsx`, `Settings/Settings.tsx` |
| `musicIdentityCoordinator.ts` | `features/navigation/categoryNavigationApi.ts`, `Settings/components/ProfileAccountSettings.tsx`, `pages/Profile.tsx` |
| `musicApi.ts` | `Profile/hooks/useUpdateProfile.ts` |
| `musicSessionBoundary.ts` | `hooks/useLogout.ts` |
| `musicShareUrl.ts` | `pages/Home.tsx` |
| `publicMusicClient.ts` | `pages/RecommendationsHub.tsx` |
| `publicMusicPresentation.ts`, `components/PublicMusicProfileHeader.tsx`, `PublicMusicPresentation.css` | `PublicCategoryThemeContext.tsx`, `PublicProfileThemeProvider.tsx` |
| `musicDevelopmentTransport.ts` | `services/accountLifecycleService.ts`, `services/explorersAnalyticsClient.ts`, **`explorers-earth/vite.config.ts:5`** |

- [ ] **Step 3: Split each module into what survives and what does not**

- **General, misfiled — move it.** `usePublicAccountIdentity` (`PublicMusicAvailabilityProvider.tsx:198`)
  is the public profile shell's username and loading state. Move it and the `AccountIdentityContext`
  provider to `features/PublicHome/api/`, beside `usePublicProfileShell.ts`, its only data source.
  `routes/PublicRoutes.tsx:33-37` wraps the whole public tree in `<PublicMusicAvailabilityProvider>`;
  re-mount the identity provider there under its new name. Move `musicDevelopmentTransport.ts` to
  `src/lib/`.
- **Music-only, used by a general file — do not move it.** Add the importing file to
  `REMOVED_IN_P3_4` with a comment; P3-4 removes the usage.

Five non-Music test files `vi.mock` the `PublicMusicAvailabilityProvider` path — repoint them.

- [ ] **Step 4: Regenerate the `.dockerignore` files, verify, commit**

```bash
node scripts/generate-music-fixture-dockerignore.mjs
cd explorers-earth && npx vitest run src/features/__tests__/musicImportBoundary.test.ts
node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
git commit -m "refactor(spa): move general public-profile modules out of features/music

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-4: Remove the frontend Music surface, and tolerate an eight-category account

The backend is untouched and still accepts `music`. After this ticket users see no Music, nothing
in the SPA calls a Music endpoint, **and the SPA accepts an account with eight categories** — which
is what lets P3-6 narrow the server safely.

**How saves keep working in the meantime.** The profile save (`profileClient.ts:39`,
`toAccountUpdate`) never sends `categories`. Only two paths do, and both echo the rows they
received: `canonicalNavigationMapping.ts:24` and `features/Books/api/useBooksNavigation.ts:24`.
So the `music` row the server still returns is echoed back untouched, and the server's nine-category
check (`explorersAccountRepository.ts:67-68`) keeps passing.

- [ ] **Step 1: Write the tolerance test first**

```ts
  it("accepts an account whose server returns eight categories", () => {
    // Break caught: P3-6 narrows the server to eight. A bundle that still demands
    // exactly nine rejects every account at canonicalNavigationMapping.ts:10 and
    // the navigation editor shows "Category settings are incomplete" for everyone.
    // This ticket must be the live bundle before P3-6 deploys.
  });

  it("still accepts nine, while the server returns nine", () => {
    // The same bundle runs against the pre-P3-6 server.
  });
```

Put them beside the existing `canonicalNavigationMapping` tests and fill them in against that file's
fixtures.

- [ ] **Step 2: Make navigation derive its category set from the server**

`features/navigation/canonicalNavigationMapping.ts`:

- `:10` hardcodes `rows.length!==9` and two other `!==9` checks. Replace with checks that the rows
  are unique by category and by display order, and that every row's category is one the SPA knows.
  Do not hardcode either eight or nine.
- `:12` loops over `CATEGORY_IDS` and returns `invalid()` if any id has no row. Make a missing
  `public_music` row acceptable — skip it — while every other category stays required.

- [ ] **Step 3: Delete `features/music/`** — everything left after P3-3.
- [ ] **Step 4: Delete the Music pages and routes** — `pages/Music.tsx`,
  `pages/public/ProfileMusic.tsx`, `pages/public/PublicMusic.tsx` and their route registrations.
- [ ] **Step 5: Remove Music from the general files** — every entry in `REMOVED_IN_P3_4`, plus:

| File | Music dependency |
|---|---|
| `components/AuthSyncManager.tsx` (and `App.tsx:4`) | background SSO sync with tunes |
| `components/MusicSubscriptionContainment.tsx` | `Checkout.tsx`, `SubscriptionPlans.tsx`, `BillingTab.tsx` — coordinate with P4 |
| `components/MusicNavLimitNotice.tsx` | `pages/RecommendationsHub.tsx` |
| `hooks/useTunesDashboard.ts` | `pages/Home.tsx`, `hooks/useLogout.ts` |
| `lib/musicCredentialStore.ts` | `store/store.ts`, four call sites |
| `assets/icons/MusicNote.tsx` | `components/Navbar.tsx`, `PublicProfile.tsx` |
| `components/MusicDashboard.tsx` | the embedded tunes dashboard |
| `services/accountLifecycleService.ts:99` | a dead Music lifecycle client |
| **`ThemeAppearanceSection.tsx:301` and `themeTypes.ts:31`** | **the "Music" first-view option** — remove it, or users keep choosing `landingTab:"music"` after Music is gone. Also remove `"music"` from `LANDING_TAB_SET` (`features/Profile/constants/recommendationsPresentation.ts`), so a stored `landingTab:"music"` falls back to the default at `:158-162` instead of routing to a page that no longer exists, until `0057` rewrites it |

Keep `assets/icons/AppleMusic.tsx` and `YoutubeMusic.tsx` — **social-link** icons. Delete for free:
`components/ui/music-loader.tsx` and `utils/youtubeUtils.ts` have no importers.

- [ ] **Step 6: Hide the Music nav tab** without narrowing anything else yet.
- [ ] **Step 7: Remove the `music` e2e lane — atomic, digest-sealed**

`suite-manifest.json` and `scripts/replatform-e2e.mjs` validate each other (`:96`), and the whole
`e2e/replatform` tree is hashed by `snapshotSource`. Change together: the manifest's `music` lane,
`scopeContents`, the `pending` entry for tickets 6.1–6.3 and Music `limits` prose;
`replatform-e2e.mjs:21`, `:50`, `:162`, `:165-177`, `:178-179`, `:566`, `:814`, `:825`, `:834`,
`:839`; `replatform-e2e.test.mjs:114`, `:1109`, `:1119` (the ordered lane list and identity counts —
134 includes Music's 24); and delete `tunes/scripts/canonical-music-browser-fixture.ts`,
`e2e/replatform/music.spec.ts` and `music.playwright.config.ts`.

- [ ] **Step 8: Remove the remaining Music coverage** — the Music specs under `explorers-earth/e2e/`,
  and `src/test/__tests__/contained-unit.launcher.test.ts:151,307`, which hard-codes Music test paths.
  Two non-Music specs carry no `music` literal but import Music helpers and will break:
  `e2e/public-theme-alignment.spec.ts` (`e2e/setup/music-presentation.ts`) and
  `e2e/profile-theme.spec.ts` (`withRestoredMusicFixture` from `e2e/setup/music.ts`).
- [ ] **Step 9: Regenerate `.dockerignore`, verify, commit**

```bash
node scripts/generate-music-fixture-dockerignore.mjs
cd explorers-earth && node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
grep -rln "features/music\|MusicDashboard\|useTunesDashboard\|\.\./music/" src | grep -v __tests__
```

Expected: the last command prints nothing.

```bash
git commit -m "feat(spa): remove the Music product surface and accept eight-category accounts

Navigation now derives its category set from the server, so this bundle works both before and
after the server retires the music category in P3-6.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-5: Cut the canonical Music route and analytics routes

With no SPA caller left, remove Music from the canonical app's route graph. **This ticket removes
routes; it does not delete the Music tail** — most of those modules are still imported by the legacy
composition and become deletable only in P3-7.

- [ ] **Step 1: Remove the Music identity route**

`tunes/server/auth/canonicalApp.ts:84-103` constructs a `MusicIdentityRepository`, a lazily built
`MusicTokenService`, and calls `setupExplorersMusicIdentityRoutes`. Delete the block, the
`musicToken?: MusicTokenConfiguration` option at `:53-54`, and the imports at `:26-30` it alone uses.
This removes `POST /api/explorers/v1/music/identity/ensure`.

- [ ] **Step 2: Remove the Music analytics routes**

- `tunes/server/routes/explorersAnalyticsRoutes.ts:191` and `:228` mount
  `POST /api/explorers/analytics/music-account/:id/events` and `/music/:publicSlug/events`. Remove
  both, and the two resolver fields from `ExplorersAnalyticsRouteDependencies` (`:178-185`) that they
  require.
- `tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts:19,23` — remove
  `resolvePublicMusicAnalyticsTarget` and `resolveFriendlyMusicAnalyticsTarget`, which query
  `account_music_identity`. The `musicSurfacePolicy` import at `:9` goes if nothing else uses it.
- `tunes/server/application/analytics.ts:12-14,62` — the Music hash mode.

- [ ] **Step 3: Remove the Music branches from the analytics repository**

`tunes/server/repositories/explorersAnalyticsEventRepository.ts`:

- `:7` — the `hashGuestCapability`/`verifyGuestCapability` import from `musicSurfacePolicy`.
- `:12-17` — the `music?:` field of `AnalyticsRequestContext`.
- `:20` — `'public-music': 'music'` in `categoryByPage`.
- `:33-43` — the `context.music` branch, with its join on `account_music_identity` at `:37`.
- `:48-54` — the `category === 'music'` branch, with its join at `:51`.
- `:100` — `context.music ? now : …`.

**Why now and not in P3-9:** if the table is dropped first, analytics for Music pages throw
`relation "account_music_identity" does not exist` outside the `unavailable()` 404 path — a 500.

- [ ] **Step 4: Make the account write path tolerate both category sets — before P3-6**

This is the server-side half of consumers-before-providers, and the step revision 2 missed. During
P3-6's deploy window the database already holds eight categories while the **old** API is still
serving. A client that refetches gets eight rows, echoes eight on save, and an old API that demands
nine (`explorersAccountRepository.ts:66-71`) throws `"Invalid category set"` — a 503. After the swap
the reverse happens: a tab holding a nine-row snapshot from before `0057` echoes `music`, which a
strictly narrowed input schema would reject.

So in **this** ticket, which deploys before P3-6, make the write path accept either set:

- `explorersAccountRepository.ts:67-68` — accept a category set equal to `categoryKeys` **or** to
  `categoryKeys` without `"music"`; strip a `music` entry before writing.
- `updateAccountRequestSchema` (`explorersContract.ts:246`) — let `categories` carry `music` and drop
  it, rather than reject.

Test both directions: a save carrying eight categories succeeds, and a save carrying nine with
`music` succeeds and writes no `music` row. P3-6 keeps this input tolerance; a later cleanup removes
it once no client can hold a pre-`0057` snapshot.

- [ ] **Step 5: Stop advertising Music pages in the sitemap**

P1's sitemap query (`explorersSeoRoutes.ts`) aggregates every public `account_category_settings`
row, so until `0057` deletes them it emits `/<handle>/music` — pages P3-4 removed. Add
`AND s.category <> 'music'` to the `FILTER` clause. Remove it again in P3-6, where the rows are gone.

- [ ] **Step 6: Answer the removed paths with 410, not 404**

Add rules to the retired-surface policy that P1's `canonicalRetiredSurfaces.ts` consumes, so old
clients get a deliberate 410: `/api/explorers/v1/music/identity/ensure` (exact),
`/api/explorers/analytics/music-account` and `/api/explorers/analytics/music` (prefix). Extend P1's
`canonical-retired-surfaces.test.ts` with one case per rule, and re-run its "does not tombstone any
surface the app serves" case — `/api/explorers/analytics/summary` must still answer.

- [ ] **Step 7: Verify**

```bash
cd tunes && grep -rln "account_music_identity" server --include=*.ts | grep -v "/test/"
```

Expected hits, and only these: `application/accountLifecycleMaintenance.ts` and
`db/music-runtime-role.ts` (both rewritten in P3-9), plus legacy modules P3-7 deletes —
`repositories/musicIdentityRepository.ts`, `repositories/musicDomainRepository.ts`,
`middleware/musicPrincipal.ts`, `music/accountMusicRepository.ts`. Anything else is a canonical
consumer this ticket missed.

```bash
npm test --prefix tunes -- --run server/test/contracts
npm run platform:test:e2e -- --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt "<new dir>" --lane public-parity
```

- [ ] **Step 8: Regenerate the sealed route inventory and commit**

Inventory first (`npx tsx scripts/inventory-runtime-surfaces.ts --write`), then the matrix; update
the pinned counts in `runtime-surface-inventory.test.ts`.

```bash
git commit -m "feat(canonical): remove the canonical Music route and Music analytics routes

Removed paths answer 410 through the retired-surface boundary. The account write path now accepts
both the nine- and eight-category sets, so P3-6 can narrow the data without breaking saves in the
deploy window. The Music modules behind the removed routes are still imported by the legacy
composition and are deleted with it in P3-7.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-6: Retire the `music` category — migration `0057`

**The largest user-facing hazard in P3.** `tunes/server/auth/initialAccount.ts:3-5` seeds **every**
account with all nine categories, `music` included (`:25-28`). The owner profile read is
`accountDtoSchema.parse(...)` (`application/profiles.ts:19`) over raw repository values, so narrowing
`categoryKeys` without cleaning the data throws a `ZodError` for **every user**, which
`sendActorError` (`explorersPrincipal.ts:37`) turns into **503 "Account service is unavailable"** on
`GET /api/explorers/v1/me`. The public read path is unaffected — it passes theme settings through
unparsed.

| Value | Storage | Constraint |
|---|---|---|
| category rows | `account_category_settings.category` | inline `CHECK (category IN (… 'music' …))` — `0022:123` |
| analytics category | `analytics_events.category` | nine-value CHECK — `0036:8` |
| analytics page | `analytics_events.page` | admits `'public-music'` — `0036:7` |
| `landingTab` | `account_presentation.theme_settings` JSONB | none beyond `jsonb_typeof = 'object'` |
| `categoryOrder` | same JSONB, under `recommendations` (`explorersContract.ts:176-177`) | none |

`0037:64,94,124` also contain `'music'` — those are **movie genre** taxonomy rows. Do not touch them.

**What the old API container does during the deploy.** P2's `migrate` service runs before the new
API starts, so new code never sees old data. The *old* container keeps serving until `compose up`
replaces it, and against the cleaned database:

- **Reads succeed** — its `accountDtoSchema` puts no length limit on `categories`, and `landingTab`
  is already rewritten.
- **Category saves succeed — because of P3-5 Step 4, and only because of it.** Without that step,
  a client that refetched would echo eight rows into an old API demanding nine and get a 503. With
  it, the old container accepts eight, and accepts a stale nine-row save by stripping `music`.
- **First sign-in fails.** `GET /me` calls `ensureInitialAccount`, which inserts a `music` row; the
  narrowed CHECK rejects it and the user sees a 503. This lasts only until the new container serves.
- **Its `/health/ready` returns 503** — the journal holds a migration its image does not know.

Accepted: a seconds-long window in which a brand-new user's first sign-in fails and retries.

- [ ] **Step 1: Write the failing migration test, against real PostgreSQL**

```ts
// tunes/server/test/migrations/retire-music-category.integration.test.ts
import { describe, expect, it } from "vitest";
// Find the real helper: grep -rln "migrateMusicDatabase" tunes/server/test/helpers
import { withMigratedDatabase } from "../helpers/<the migrated-database helper>";

describe("0057 retire music category", () => {
  // Seed BEFORE 0057 runs: an account with a music category row (pinned), a
  // landingTab of "music", a categoryOrder containing "music", and one music
  // analytics event that HAS a receipt. Without the seed every case passes vacuously.

  it("removes every music category row and keeps display order contiguous", async () => {
    await withMigratedDatabase(async (pool) => {
      expect((await pool.query("SELECT count(*)::int n FROM account_category_settings WHERE category='music'")).rows[0].n).toBe(0);
      const gaps = await pool.query(`SELECT account_id FROM account_category_settings
        GROUP BY account_id HAVING max(display_order) <> count(*) - 1`);
      expect(gaps.rows).toEqual([]);
    });
  });

  it("refuses a new music category row", async () => {
    // Break caught: rows deleted but the CHECK still admits music, so the old
    // container re-inserts one and the next owner read 503s.
    await withMigratedDatabase(async (pool) => {
      const account = (await pool.query("SELECT account_id FROM account_category_settings LIMIT 1")).rows[0];
      await expect(pool.query(
        "INSERT INTO account_category_settings(account_id,category,display_order) VALUES ($1,'music',99)",
        [account.account_id])).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("removes music analytics events even when they have receipts", async () => {
    // Break caught: analytics_event_receipts.event_id references analytics_events
    // ON DELETE RESTRICT (0036:31). A bare DELETE raises 23503 and the whole
    // migration rolls back.
    await withMigratedDatabase(async (pool) => {
      expect((await pool.query("SELECT count(*)::int n FROM analytics_events WHERE category='music'")).rows[0].n).toBe(0);
    });
  });

  it("normalises a category order with duplicates and no music", async () => {
    // Break caught: nine non-music entries with duplicates (e.g. nine "books")
    // are valid under today's .max(9), contain no "music", and would survive a
    // music-only rewrite — then fail .max(8) and 503 that owner's profile read.
    // Seed one before 0057 runs.
    await withMigratedDatabase(async (pool) => {
      const bad = await pool.query(`SELECT count(*)::int n FROM account_presentation
        WHERE jsonb_array_length(theme_settings->'recommendations'->'categoryOrder') > 8`);
      expect(bad.rows[0].n).toBe(0);
    });
  });

  it("rewrites a stored music landing tab and strips music from category order", async () => {
    await withMigratedDatabase(async (pool) => {
      const bad = await pool.query(`SELECT count(*)::int n FROM account_presentation
        WHERE theme_settings->>'landingTab'='music'
           OR theme_settings->'recommendations'->'categoryOrder' ? 'music'`);
      expect(bad.rows[0].n).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Write the migration**

```sql
-- tunes/migrations/0057_retire_music_category.sql
-- Retire the 'music' content category. Data first, then constraints, so the
-- narrowed CHECKs validate against rows that are already clean.

UPDATE account_presentation
   SET theme_settings = jsonb_set(theme_settings, '{landingTab}', '"all-recommendations"')
 WHERE theme_settings->>'landingTab' = 'music';

-- Normalise EVERY stored categoryOrder, not just those containing "music": keep
-- only surviving categories, first occurrence wins. The current schema bounds
-- length (.max(9)) but not uniqueness, so nine non-music entries with duplicates
-- are valid today and would fail .max(8) after narrowing if left alone.
-- The jsonb_typeof guard matters: the table only constrains the OUTER value to
-- be an object, and jsonb_array_elements on a non-array aborts the whole
-- migration.
UPDATE account_presentation p
   SET theme_settings = jsonb_set(p.theme_settings, '{recommendations,categoryOrder}',
         COALESCE((SELECT jsonb_agg(to_jsonb(cat) ORDER BY first_pos)
                     FROM (SELECT e.value #>> '{}' AS cat, min(e.ordinality) AS first_pos
                             FROM jsonb_array_elements(p.theme_settings->'recommendations'->'categoryOrder')
                                  WITH ORDINALITY AS e(value, ordinality)
                            WHERE e.value #>> '{}' IN ('places','guides','movies','books','games','apps','products','people')
                            GROUP BY e.value #>> '{}') kept), '[]'::jsonb))
 WHERE jsonb_typeof(p.theme_settings->'recommendations'->'categoryOrder') = 'array';

-- A categoryOrder that exists but is NOT an array is invalid under the contract
-- already. Remove it rather than abort; the SPA falls back to its default order.
UPDATE account_presentation
   SET theme_settings = theme_settings #- '{recommendations,categoryOrder}'
 WHERE theme_settings->'recommendations' ? 'categoryOrder'
   AND jsonb_typeof(theme_settings->'recommendations'->'categoryOrder') <> 'array';

DELETE FROM account_category_settings WHERE category = 'music';

-- Compact display_order to 0..n-1 per account, and pinned_order to 0..k-1 over
-- the pinned rows. Both unique constraints are DEFERRABLE INITIALLY DEFERRED
-- (0022:128-129), so transient collisions inside these statements are allowed.
UPDATE account_category_settings s
   SET display_order = r.rn - 1
  FROM (SELECT account_id, category,
               row_number() OVER (PARTITION BY account_id ORDER BY display_order) AS rn
          FROM account_category_settings) r
 WHERE s.account_id = r.account_id AND s.category = r.category;

UPDATE account_category_settings s
   SET pinned_order = r.rn - 1
  FROM (SELECT account_id, category,
               row_number() OVER (PARTITION BY account_id ORDER BY pinned_order) AS rn
          FROM account_category_settings WHERE pinned_order IS NOT NULL) r
 WHERE s.account_id = r.account_id AND s.category = r.category;

-- The compaction queued deferred unique checks. ALTER TABLE on a table with
-- pending trigger events fails with 55006, so fire them now. This also surfaces
-- any real collision here, as a clear error, instead of at COMMIT.
SET CONSTRAINTS account_category_display_order_uq, account_category_pinned_order_uq IMMEDIATE;

-- analytics_event_receipts.event_id references analytics_events ON DELETE
-- RESTRICT (0036:31). Detach receipts first, the same way
-- purge_expired_analytics_events does (0036:49-50).
UPDATE analytics_event_receipts
   SET retired_at = coalesce(retired_at, clock_timestamp()), event_id = NULL
 WHERE event_id IN (SELECT id FROM analytics_events WHERE category = 'music' OR page = 'public-music');

DELETE FROM analytics_events WHERE category = 'music' OR page = 'public-music';

ALTER TABLE account_category_settings DROP CONSTRAINT <the existing category CHECK name>;
ALTER TABLE account_category_settings ADD CONSTRAINT account_category_settings_category_check
  CHECK (category IN ('places','guides','movies','books','games','apps','products','people'));

ALTER TABLE analytics_events DROP CONSTRAINT <the existing category CHECK name>;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_category_check
  CHECK (category IN ('places','guides','movies','books','games','apps','products','people'));

ALTER TABLE analytics_events DROP CONSTRAINT <the existing page CHECK name>;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_page_check
  CHECK (page IN (<the existing list, minus 'public-music'>));
```

Inline CHECK constraints get generated names, and the page list must be copied, not guessed. Read
both from a migrated database first — this also reveals any other `music` CHECK the audit missed:

```bash
docker exec explorers-replatform-local-postgres-1 psql -U postgres -d music_fixture -c "SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c' AND pg_get_constraintdef(oid) ~ 'music'"
```

**Deleting Music analytics loses that history.** The rows describe a product that no longer
exists, so deletion is recommended — but it is a data decision; state it in the commit.

- [ ] **Step 3: Narrow the contract and every consumer**

- `tunes/shared/explorersContract.ts:12-14` — remove `"music"` from `categoryKeys`.
- `:173` — remove `"music"` from `landingTab`.
- `:177` — `.max(9)` becomes `.max(8)`.
- `tunes/server/auth/initialAccount.ts:3-5` — remove `"music"`, or every new sign-up inserts a row
  the CHECK refuses.
- `tunes/server/repositories/explorersAccountRepository.ts:67-68` — **keep P3-5 Step 4's tolerance.**
  The narrowed `categoryKeys` makes the eight-set the canonical one, but a tab still holding a
  pre-`0057` snapshot will echo `music` after this deploys; the write path must go on stripping it.
  The input schema must likewise drop `music`, not reject it.
- `tunes/server/routes/explorersSeoRoutes.ts` — remove the `AND s.category <> 'music'` P3-5 added;
  the rows no longer exist.
- `tunes/server/publicProfile/postgresPublicProfileGateway.ts:13` — remove `music: "public_music"`.
- SPA: drop `public_music` from `CATEGORY_IDS` and the `keys` map in
  `features/navigation/canonicalNavigationMapping.ts`, and from `utils/navPinning.ts`. P3-4 already
  made `:10` tolerant, so this is a narrowing, not a fix.
- Regenerate `tunes/server/services/appEnrichmentDecoderFields.generated.mjs`, which mirrors the
  `landingTab` enum at `:4592`.

- [ ] **Step 4: Add the defensive read**

A row the migration missed must degrade, not take an account down. In `explorersAccountRepository.ts`
`get()`, filter category rows to `categoryKeys` and drop unknown entries from
`themeSettings.recommendations.categoryOrder` before returning. On the `landingTab` enum use
**`.optional().catch(undefined)`** — the reverse order, `.catch(undefined).optional()`, does not
type-check under `zod/v3` 3.25. Note `themeSettingsSchema` is shared with writes (`:247`), so the
`.catch` silently drops an invalid `landingTab` on write too; that is acceptable here, but say so in
a comment.

Test it: an account carrying a retired category row reads without throwing.

- [ ] **Step 5: Update the `public_music` fixtures**

For e2e, **17 non-Music files** (15 specs, 2 setup helpers). Only `category-navigation-b.spec.ts`
asserts the value (`:92,285,290,291`); the rest set it in fixture literals. Traps: four sites re-add
`['music','public_music']` by hand (`category-navigation-a.spec.ts:13`,
`category-navigation-b.spec.ts:7`, `setup/category-navigation.ts:205`,
`setup/public-shell-continuity.ts:15`); `setup/category-navigation.ts:92` synthesises the music row
into the nine-row snapshot; `:480` lists `public_music` in the mutation allowlist;
`e2e/profile-editor-polish.spec.ts:227` and four unit tests under `src/features/Profile/` and
`src/features/PublicHome/` carry `landingTab:"music"`.

- [ ] **Step 6: Grow the migration chain** — every row of
  [Growing the migration chain](#growing-the-migration-chain), **including** the "only while they
  still exist" row.
- [ ] **Step 7: Verify against real PostgreSQL, then boot the real server**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/migrations/retire-music-category.integration.test.ts
npm run platform:local -- provision
npm run platform:local -- check
npm test --prefix tunes -- --run server/test/contracts server/test/migrations
cd ../explorers-earth && node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Then by hand: sign in as a **new** user (exercises `initialAccount`), open your profile, save it,
and open the navigation editor. Those three prove the SPA and the server agree on eight categories.

- [ ] **Step 8: Commit — one commit**

```bash
git commit -m "feat(platform): retire the music category (migration 0057)

Every account was seeded with a music category row, so the data cleanup and the contract
narrowing ship together: narrowing alone would 503 every owner profile read. Music analytics
events are deleted, with their receipts detached first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-7: Delete the legacy composition, its deployment and the Music tail

Production has run canonical since P2, so none of this serves traffic. The risk is in what must not
be deleted, and in CI wiring that P2's deploy depends on.

- [ ] **Step 1: Do the three prerequisites the backbone recorded** — verify each first; they were
  not re-audited for this plan.
  - Split `music-forbidden-authority-search.test.ts` so the parts guarding canonical code survive.
  - Amend `tunes/package.json:36`.
  - Decide `tunes/netlify.toml` — almost certainly delete; nothing deploys to Netlify.

- [ ] **Step 2: Rewire CI before deleting the deploy workflow — P2 depends on this**

`.github/workflows/tunes.yml:362` calls `./.github/workflows/tunes-deploy.yml` as a reusable
workflow, and lists it as a path trigger at `:28` and `:54`. Delete `tunes-deploy.yml` first and
`tunes.yml` becomes invalid — **which stops the `publish-image` job that P2's deploy consumes.**
Remove the `:362` job and both path entries in the same commit, and confirm `publish-image` still
runs.

Also in `tunes.yml:157`, the in-image file-existence list checks for `run-registration-compat.js`.
`build:api` (`tunes/package.json:19`) bundles `run-registration-compat.ts` and
`run-production-graph-smoke.ts`. Decide both: the registration-compat shim is Music-only and goes,
with its `build:api` entry and its `:157` line; the production-graph smoke imports `server/app.ts`
and `server/runtime.ts`, so either rewrite it against the canonical app or delete it with its CI step.

- [ ] **Step 3: Recompute the deletable set now, not from this plan**

P3-5 removed canonical references, so modules that were in the canonical closure at planning time
may now be legacy-only. Recompute against current `main`:

```bash
cd tunes && npx madge --json --ts-config tsconfig.json server/auth/canonicalStartup.ts > /tmp/canonical.json
npx madge --json --ts-config tsconfig.json server/index.ts server/app.ts server/routes/index.ts > /tmp/legacy.json
```

The deletable set is legacy minus canonical. If `madge` is not available, walk imports with any
equivalent tool — but do not delete from the list below without this check, because it was computed
before P3-5.

Expected to be deletable by now: the 51 legacy files (13,422 lines, headlined by `server/storage.ts`,
`repositories/musicDomainRepository.ts`, `routes/musicSurfaceRoutes.ts`, `routes/musicOpenApiRoutes.ts`,
`server/auth.ts`, `services/strapiIdentityGateway.ts`, `socket/musicSocketServer.ts`,
`server/routes/index.ts`, `server/app.ts`, `server/index.ts`, `server/seo-routes.ts`,
`config/music-startup.ts`, `server/vite.ts`, `tunes/vite.config.ts`), **plus the Music tail P3-5
unhooked**: `routes/explorersMusicIdentityRoutes.ts`, `repositories/musicIdentityRepository.ts`,
`services/musicTokenService.ts`, `middleware/musicPrincipal.ts`, `services/musicLifecycleService.ts`,
`services/musicPublicationResponseCrypto.ts`, `music/accountMusicRepository.ts`,
`workers/musicLifecycleWorker.ts`, `repositories/publicMusicRevision.ts`, and
`config/music-identity-config.ts` (its only canonical use was inside the block P3-5 removed; it also
imports `musicTokenService`, so the two go together). Also `shared/schema.ts` — the Drizzle schema,
imported only by legacy code.

Already dead, delete for free: `services/email-service.ts`, `utils/geolocation.ts`,
`services/system-settings-service.ts`, and `routes/legacyRemainingRoutes.ts` with its four orphan
importers (`adminRoutes`, `emailRoutes`, `pageRoutes`, `youtubeRoutes`).

**Never delete, even if they look legacy:**

| File | Why |
|---|---|
| `services/objectStorage.ts` | canonical, `canonicalStartup.ts:50` |
| `shared/musicError.ts` | canonical — `explorersPrincipal.ts:7` imports `security-containment.ts`, which imports it (`:6`) |
| `policies/musicRetirementPolicy.ts` | imported by P1's `canonicalRetiredSurfaces.ts`; renamed in P3-8 |
| `deployment/music-deployment.ts` | `CURRENT_MIGRATION_MARKER` for `run-migration-gate.ts`, and `auditDeploymentAuthority` (Step 6) |
| `deployment/music-health.ts` | `deploymentImageFromEnvironment` for `run-migration-gate.ts` |
| `deployment/run-migration-gate.ts` | P2's `migrate` service runs it |
| `drizzle.config.ts` | `tunes/Dockerfile:63` copies it — remove the `COPY` line in the same commit if you delete the file |
| the retained `music-*` modules | canonical; renamed in P3-8 |

- [ ] **Step 4: Delete `tunes/client/`** — 162 files, 34,029 lines.
- [ ] **Step 5: Delete the Music deployment** — root `docker-compose.yml` (Traefik, `tunes-blue`,
  `tunes-green`, `tunes-gate`, `tunes-register-compat`, the `explorers` container),
  `docker-compose.music-test.yml`, `tunes/deployment/music-deploy-engine.sh`, `music-deploy.sh`,
  `.github/workflows/tunes-deploy.yml` (after Step 2), `.github/workflows/tunes-host-preflight.yml`,
  the inert `tunes/.github/workflows/main.yml`, `.env.music.example` and `.env.music.test.example`.

  Check consumers first:

  ```bash
  grep -rn "docker-compose.music-test.yml\|docker-compose\.yml\|tunes-deploy.yml\|tunes-host-preflight" --include=*.ts --include=*.mjs --include=*.yml --include=*.json . | grep -v node_modules | grep -v "^./docs/"
  ```

- [ ] **Step 6: Rewrite `auditDeploymentAuthority` — do not delete it**

`music-deployment.ts:325` checks seven inputs; five die with Step 5. Keep what is not about Music:
the `ciWorkflow` checks (`explorers-tunes` published, one `docker/build-push-action@`,
`anchore/scan-action@` before push, `digest:` propagated, no mutable tag) and `workflow_call:` on the
deploy workflow. Narrow the function to `{ ciWorkflow, deployWorkflow }`, plus whatever P2's deploy
workflow needs asserted. Rewrite `music-deployment-files.test.ts:118-128` to it; delete the
`known_markers` test (`:537-540`) and the eight `read("docker-compose.yml")` and ten
`read("tunes/deployment/music-deploy-engine.sh")` assertions; rename the file off `music-`.

- [ ] **Step 7: Collapse `apiMode`** — keep `selectApiMode` as a guard that refuses anything but
  `canonical`, so a stale environment fails loudly; collapse `api.ts` to the canonical branch.
- [ ] **Step 8: Update CI** — workflow steps naming deleted files, including the edges the backbone
  recorded (`ci.yml:426,478`, `test.yml:225,300`). Verify those line numbers first.
- [ ] **Step 9: Regenerate `.dockerignore` and the sealed inventories, verify, commit**

```bash
node scripts/generate-music-fixture-dockerignore.mjs
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/'
npm test --prefix tunes -- --run
npm run platform:test:e2e -- --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt "<new dir>"
```

The ~138 pre-existing typecheck errors live in `tunes/client/`, which this ticket deletes — expect
the count to **drop**, and treat any `server/` or `shared/` line as a real failure. Then confirm the
image still builds and `publish-image` would run:

```bash
docker build -t ee-p3-7-check ./tunes
```

```bash
git commit -m "refactor: delete the legacy Music composition, tunes/client and the Music deployment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-8: Rename the retained `music-*` modules

- [ ] **Step 1: List what survives**

```bash
cd tunes && git ls-files server shared scripts | grep -i music | grep -v "/test/"
```

Expected: the eight the backbone named — `scripts/music-fixture-secret.ts`,
`server/db/music-runtime-role.ts`, `scripts/music-uat-database.ts`, `scripts/music-vitest-evidence.ts`,
`shared/music-migration-contract.ts`, `scripts/music-output-redaction.ts`,
`server/config/music-database-config.ts` (and `music-identity-config.ts` only if P3-7 kept it) —
plus `config/secure-music-secret-file.ts`, `config/music-local-profile.ts`,
`config/music-owned-browser-profile.ts`, `policies/musicSurfacePolicy.ts`,
`policies/musicRetirementPolicy.ts`, `shared/musicError.ts`.

- [ ] **Step 2: Decide each one's fate** — rename to `platform-*`, split, or delete. Two need
  thought: `musicSurfacePolicy.ts` (after P3-5 and P3-7, its remaining importers are the inventory
  and matrix scripts and `services/explorers-analytics-composition.ts`; `PUBLIC_PATHS` feeds the
  inventory), and `music-local-profile.ts` / `music-owned-browser-profile.ts`, which reach the
  canonical closure through `server/db.ts`.
- [ ] **Step 3: Rename with `git mv`**, update every import, and **keep environment variable names**
  — `MUSIC_DATABASE_*`, `MUSIC_MODE` and the rest are set in P2's production compose file. P2's
  compose refers to `dist/server/deployment/run-migration-gate.js`, which is not renamed.
- [ ] **Step 4: Regenerate `.dockerignore`, verify, commit**

```bash
node scripts/generate-music-fixture-dockerignore.mjs
git commit -m "refactor: rename retained music modules to platform

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P3-9: Drop the Music tables — migration `0058`

The riskiest ticket. Migration, role provisioning, attestation and lifecycle rewrite are **one
commit**.

### The failure that matters most: the gate crashes after its migration commits

`run-migration-gate.ts` migrates **first** (`:31`), and only then calls `provisionMusicRuntimeLogin`
(`:35`) and `verifyMusicRuntimeLogin` (`:37`) from the new image. `provisionMusicRuntimeLogin` issues
GRANT and REVOKE statements naming Music tables — `canonical_music_numeric_retirements`,
`music_credential_revocation_operations`, `music_request_quota`, `account_music_identity`,
`music_publication_operations`, `music_owner_operations`, `music_publication_operation_archive`,
`music_identity_tombstones`, `music_reactivation_tokens` (`music-runtime-role.ts`, around `:697-776`).
The privilege probes at `:912-936` go through `requirePrivilegeDenial` (`:1107-1121`), which rethrows
anything other than `42501` — so a `42P01 relation does not exist` fails them too.

If any of these still names a dropped table, **0058 has already committed when the gate crashes.**
The `migrate` container exits 1, compose never starts the new API, the old API keeps serving against
a database whose tables are gone, and the old image cannot boot because `readiness.ts:13` demands an
exact migration-id match. There is no rollback.

So Step 4 rewrites **all** of them, and Step 7 runs them against a migrated database before anything
ships.

### What else breaks if the migration lands without the code

1. **The canonical app will not boot.** `canonicalStartup.ts:33` runs
   `verifyMusicRuntimeDatabaseConnection` before the pool exists, comparing the live catalog to
   `expectedRuntimeTables` and `expectedRuntimeFunctions` by **exact, ordered equality**
   (`sameRuntimeInventory`, `:1088-1090`). The catch at `:339-340` erases the cause and throws
   *"runtime database authentication or role attestation failed"*. No port is bound.
2. **The maintenance tick stalls silently.** Not the whole tick: recovery-proof purge, receipt
   retirement and deletion-feedback purge run at `:7-14`, before any Music reference, and keep
   working. It fails at the `releasable` SELECT (`:30-38`), and `canonicalStartup.ts:55` catches it.
   But the claim query (`:56-64`) is downstream, so **no account deletion of any kind completes**,
   and the log line is a fixed string with no cause.
3. **Deferred trigger landmines on `users`** fire at COMMIT if the triggers outlive the table.

### What the old container does in the `0058` window — accepted, and why

Even shipped correctly, `0058` commits while the old API container is still serving, and that
container's lifecycle loop still reads `account_music_identity`. Its next tick runs the cleanup at
`:7-14`, then fails at the mapping SELECT; `canonicalStartup.ts:55` catches it and schedules a retry.
An operation already mid-run can also fail at a mapping re-check (`:73-74`, `:106-107`) and is left
`running`.

This is accepted rather than restructured, because it heals itself: the new container's rewritten
loop takes over within seconds, and the claim query reclaims any operation stuck in `running` after
ten minutes (`o.state='running' AND o.updated_at<clock_timestamp()-interval '10 minutes'`, inside
`:56-64`). No deletion is lost; at worst one is delayed ten minutes. The alternative — shipping the
lifecycle rewrite separately, before the drop — would remove the Music deletion boundary while
mappings still exist, which is only safe once Step 3a's venue disposal has already run. If the owner
prefers zero overlap, split it that way: venue disposal and the lifecycle rewrite in one deploy, the
table drops in the next.

- [ ] **Step 1: The Music object inventory**

No custom enum types exist; every enumeration is a `CHECK`. **None of the ten Music tables owns a
sequence**, so because `users` and the baseline survive, the attestation's sequence list does not
change.

**Tables:** `music_identity_tombstones` (`0002:58`), `music_identity_lifecycle_operations` (`0003:1`),
`music_credential_revocation_operations` (`0008:4`), `music_publication_operations` (`0011:1`),
`music_reactivation_tokens` (`0014:1`), `music_publication_operation_archive` (`0015:1`),
`music_owner_operations` (`0018:4`), `account_music_identity` (`0023:15`), `music_request_quota`
(`0051:115`), `canonical_music_numeric_retirements` (`0052:4`).

**Survives:** `music_schema_migrations` (the chain ledger) and `provision_music_runtime_login(name,text)`
(`0010:42`), which the gate calls.

- [ ] **Step 2: Size what is in flight in production — read-only, before writing anything**

After P2 the database is fresh, so no legacy Strapi-backed venue can exist in it. What can exist is
any canonical venue created between P2 launch and P3-5. **P2 sets no `MUSIC_TOKEN_*` variables, yet
`ensureMusicAccount` writes the venue row (`explorersMusicIdentityRoutes.ts:41`) before the token mint
fails (`:64`)** — so venue rows can accumulate even though Music cannot work.

```sql
SELECT count(*) AS mapped_accounts,
       count(*) FILTER (WHERE a.status = 'pending_deletion') AS parked_deletions
  FROM account_music_identity mi
  JOIN creator_accounts a ON a.id = mi.account_id;
```

**Venue rows do not "go with the drop" — they would be orphaned.** A venue is a row in `users`,
which survives P3. `account_music_identity.music_user_id` references `users` with `ON DELETE
CASCADE` (`0023:17`), but that cascade runs when a *user* is deleted, not when the *mapping table*
is dropped. And Step 5 removes the only code that deleted venues
(`finalize_canonical_music_venue_deletion`, `accountLifecycleMaintenance.ts:39-43`). The remaining
deletion pipeline never touches `users`. So without Step 3a, an account deletion would report
success while its venue row survived with no owner and no path to removal — retained personal data
behind a completed erasure.

Non-zero `mapped_accounts` therefore means Step 3a must run. Non-zero `parked_deletions` means
deletions the Music boundary has held back; once Step 3a removes their venues and Step 5 removes the
boundary, they become claimable on the next tick and complete. Correct, but tell the owner first.

- [ ] **Step 3a: Dispose of mapped venue rows inside `0058`, before the mapping table goes**

Find every foreign key into `users` first — the baseline tables reference it, and an
`ON DELETE RESTRICT` there would abort the delete:

```bash
docker exec explorers-replatform-local-postgres-1 psql -U postgres -d music_fixture -c "SELECT conrelid::regclass AS child, conname, confdeltype FROM pg_constraint WHERE confrelid='public.users'::regclass AND contype='f' ORDER BY 1"
```

`confdeltype` is `c` (cascade), `n` (set null), `r`/`a` (restrict / no action). For every
`r`/`a` child, delete the dependent rows for venue users first. Then, in `0058`, **after** the
trigger drops (the `users` delete triggers and `account_music_identity_owner_retained` would
otherwise refuse) and **before** any `DROP TABLE`:

```sql
-- Delete venue rows owned through the canonical mapping. music_request_quota and
-- music_owner_operations cascade from users; account_music_identity cascades too.
DELETE FROM public.users
 WHERE id IN (SELECT music_user_id FROM public.account_music_identity);
```

**Media.** Venue media in object storage is not removed by SQL. On the fresh P2 database Music could
not run (no `MUSIC_TOKEN_*`), so venue media should not exist — confirm it with Step 2 and the
legacy storage layout before relying on that. If any exists, purge it from the bucket before the
migration, from a script that reads the keys while the rows still exist.

Make Step 9's deletion test assert that **no `users` row survives** for a deleted account that had
a venue.

- [ ] **Step 3: Write the migration — explicit drops, in order, no `CASCADE`**

```sql
-- tunes/migrations/0058_retire_music_schema.sql
-- PostgreSQL does not track plpgsql bodies as dependencies, so every trigger and
-- function is dropped explicitly. Triggers on users first: users outlives the
-- Music tables, and a dangling trigger on it is the dangerous end state.

DROP TRIGGER users_music_venue_owned ON public.users;
DROP TRIGGER users_music_numeric_id_immutable ON public.users;
DROP TRIGGER users_reject_unauthorized_music_identity_delete ON public.users;
DROP TRIGGER users_retain_music_identity_tombstone ON public.users;
DROP TRIGGER users_music_identity_insert ON public.users;
DROP TRIGGER users_music_identity_immutability ON public.users;

DROP TRIGGER account_music_identity_immutable ON public.account_music_identity;
DROP TRIGGER account_music_identity_owner_retained ON public.account_music_identity;
DROP TRIGGER music_identity_tombstone_insert ON public.music_identity_tombstones;
DROP TRIGGER music_identity_tombstone_immutability ON public.music_identity_tombstones;
DROP TRIGGER music_lifecycle_operation_state ON public.music_identity_lifecycle_operations;
DROP TRIGGER music_credential_revocation_history_immutability ON public.music_credential_revocation_operations;
DROP TRIGGER music_publication_operation_immutability ON public.music_publication_operations;
DROP TRIGGER music_publication_operation_archive_immutability ON public.music_publication_operation_archive;
DROP TRIGGER music_reactivation_token_identity_immutability ON public.music_reactivation_tokens;
DROP TRIGGER canonical_music_numeric_retirement_insert ON public.canonical_music_numeric_retirements;
DROP TRIGGER canonical_music_numeric_retirement_immutable ON public.canonical_music_numeric_retirements;

DROP FUNCTION public.finalize_canonical_music_venue_deletion(integer, text, text);
DROP FUNCTION public.finalize_music_identity_deletion(integer, text, text);
DROP FUNCTION public.music_compact_publication_operations(integer);
DROP FUNCTION public.music_lookup_publication_operation_archive(integer, text);
DROP FUNCTION public.lock_music_identity_pair(text, text);
DROP FUNCTION public.lock_music_numeric_user_id(integer);

DROP FUNCTION public.assert_music_venue_owned();
DROP FUNCTION public.assert_music_venue_owner_retained();
DROP FUNCTION public.enforce_music_identity_immutability();
DROP FUNCTION public.enforce_music_identity_insert();
DROP FUNCTION public.enforce_music_lifecycle_operation_state();
DROP FUNCTION public.enforce_music_tombstone_insert();
DROP FUNCTION public.enforce_music_tombstone_immutability();
DROP FUNCTION public.enforce_music_reactivation_token_identity();
DROP FUNCTION public.retain_music_identity_tombstone_on_delete();
DROP FUNCTION public.reject_unauthorized_music_identity_delete();
DROP FUNCTION public.reject_account_music_identity_mutation();
DROP FUNCTION public.reject_music_credential_revocation_history_mutation();
DROP FUNCTION public.reject_music_numeric_user_id_update();
DROP FUNCTION public.reject_music_publication_archive_mutation();
DROP FUNCTION public.enforce_music_publication_operation_immutability();
DROP FUNCTION public.guard_canonical_music_numeric_retirement();

-- users.lifecycle_operation_id references music_identity_lifecycle_operations
-- (0003:41-46). The column stays; its foreign key goes.
ALTER TABLE public.users DROP CONSTRAINT users_lifecycle_operation_id_fk;

DROP TABLE public.canonical_music_numeric_retirements;
DROP TABLE public.music_request_quota;
DROP TABLE public.account_music_identity;
DROP TABLE public.music_owner_operations;
DROP TABLE public.music_publication_operation_archive;
DROP TABLE public.music_publication_operations;
DROP TABLE public.music_reactivation_tokens;
DROP TABLE public.music_credential_revocation_operations;
DROP TABLE public.music_identity_tombstones;
DROP TABLE public.music_identity_lifecycle_operations;

-- Kept deliberately: users, the 0001 baseline tables, music_schema_migrations,
-- and provision_music_runtime_login(name,text). The 0039/0040 NOT NULL
-- relaxations on users are not reversed; canonical rows hold NULLs there.
```

Confirm every function signature against a migrated database before running — `DROP FUNCTION` with
the wrong argument list fails:

```bash
docker exec explorers-replatform-local-postgres-1 psql -U postgres -d music_fixture -c "SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname ~ 'music'"
```

After the migration that query must return **exactly one row**: `provision_music_runtime_login(name,text)`.
Zero means it was dropped and the gate will fail; more than one means something was missed.

- [ ] **Step 4: Rewrite role provisioning and the attestation — same commit**

In `tunes/server/db/music-runtime-role.ts` (renamed in P3-8 — use the new name), remove every
reference to a dropped object:

- **`provisionMusicRuntimeLogin`** — every GRANT and REVOKE naming a dropped table, around
  `:697-776`. **Keep** the `music_schema_migrations` grants and the
  `REVOKE … ON FUNCTION provision_music_runtime_login(name,text)` line.
- **The privilege-denial probes** at `:912-937` that target dropped tables. `:937` names
  `reject_music_credential_revocation_history_mutation()` inside a `CREATE OR REPLACE FUNCTION`
  probe; against an absent function that does not fail with "does not exist" — it attempts creation,
  which the denied privilege rejects with the expected `42501` — but rename it to a neutral probe so
  it stops naming a dropped object.
- **`expectedRuntimeTables`** (`:6-125`) — remove the ten dropped tables. Keep the baseline entries
  (`playlists`, `songs`, `youtube_music` and the rest) and their sequences; `0058` does not drop them.
- **`expectedRuntimeFunctions`** (`:154-254`) — remove **exactly the twenty-two functions `0058`
  drops**, and **keep `provision_music_runtime_login(name,text)`**. It is the twenty-third Music
  function and it survives; removing it from the list leaves the database with one function the list
  does not expect, and exact equality fails at boot.
- **The privilege-tuple branches** at `:977-998`.

**These line ranges interleave non-Music checks that must stay** — the taxonomy, email-suppression
and migration-journal probes and branches (around `:917-934` and `:979-993`). Remove the named Music
objects only; do not delete the ranges wholesale. Both lists are compared in order, so keep the
survivors in the name order the live `pg_class` / `pg_proc` queries return.

Update `fixtures/db/music-runtime-table-manifest.json` `tables[]` and `controlTables` to match.

- [ ] **Step 5: Rewrite the lifecycle loop — same commit**

`tunes/server/application/accountLifecycleMaintenance.ts`, read whole first:

- Delete the venue release block **`:16-43`** — its comment (`:16-29`), the `releasable` SELECT
  (`:30-38`) and the `finalize_canonical_music_venue_deletion` loop with its silent
  `.catch(() => undefined)` (`:39-43`).
- Delete the `MUSIC_BOUNDARY_PENDING` stamping UPDATE (`:47-54`).
- In the claim query (`:56-64`), remove the line
  `AND NOT EXISTS (SELECT 1 FROM account_music_identity mi WHERE mi.account_id=o.account_id)`.
- Remove the per-operation re-checks at `:73-74` (`if (mapping.rowCount) throw new Error("MUSIC_BOUNDARY_PENDING")`)
  and `:106-107` (`|| mappingNow.rowCount`) together with the queries that feed them.

Test first: an account with a pending deletion is claimed and soft-deleted in one tick, and the
function issues no SQL naming a Music table — record the SQL text through the stub pool.

**Leave alone, but tell the owner:** `canonicalStartup.ts:55-57` logs a fixed string with no error
detail when maintenance fails. A deletion pipeline that silently stops is the failure a 30-day
erasure obligation cares about. One-line fix, out of scope here.

- [ ] **Step 6: Grow the chain** — every row of [Growing the migration chain](#growing-the-migration-chain)
  **except** the "only while they still exist" row.
- [ ] **Step 7: Run the gate's own sequence against a database migrated to `0058`**

This is the test that would have caught the crash, and no existing test runs it: the integration
suite injects a pool and skips the attestation. Reproduce the gate's **whole** sequence, in order,
against a fresh database:

1. `assertMusicMigratorAuthority` and `assertMusicRuntimeCapabilityPreflight` — the two
   **pre-migration** checks at `run-migration-gate.ts:29-30`;
2. `migrateMusicDatabase` through `0058`;
3. `provisionMusicRuntimeLogin` and `verifyMusicRuntimeLogin` with a runtime role (`:35-37`);
4. `verifyMusicRuntimeDatabaseConnection` with that role's connection — what `canonicalStartup.ts:33`
   runs at boot.

Run it twice: once from an empty database, and once **upgrading** a database already migrated to
`0057` with its runtime role already provisioned. Production takes the second path, and a re-run of
`provisionMusicRuntimeLogin` against an existing role is exactly where a stale GRANT would surface.

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/migrations/<the new file>
```

- [ ] **Step 8: Boot the real stack**

```bash
npm run platform:local -- provision
npm run platform:local -- check
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:51474/health/ready
```

Expected: `check` healthy, readiness `200`. If the container restarts with *"runtime database
authentication or role attestation failed"*, an attestation list still names a dropped object or is
out of order — the message will not say which, so diff the lists against the `psql` query in Step 3.

- [ ] **Step 9: Prove deletion end to end** — create an account, request deletion, advance past
  `deletion_requested_at`, run one tick, and confirm the account is soft-deleted and its media
  objects are marked deleted.
- [ ] **Step 10: Full verification, then commit — one commit**

```bash
npm test --prefix tunes -- --run
npm run platform:test:e2e -- --milestone delivered-auth-profile-books --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt "<new dir>"
git commit -m "feat(platform): drop the Music tables (migration 0058)

The migration, runtime-role provisioning, the attestation and the lifecycle rewrite ship
together. The gate migrates before it provisions, so a GRANT left naming a dropped table would
crash it after the migration had committed, with no image able to roll back.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Open questions for the owner

1. **Should Music be hidden at P2's launch?** P2 sets no `MUSIC_TOKEN_*`, so Music cannot work in the
   new stack — but `ensureMusicAccount` still writes venue rows before the token mint fails. Every
   such row is data P3-9 drops. Hiding Music at launch (pulling P3-4 forward) costs little and avoids
   it.
2. **Is canonical Music provisioning (ADR-006/008) retired with the product?** This plan assumes yes.
3. **Music analytics history** — deleted in P3-6 (recommended), or kept somehow?
4. **Is a "10.1 OAuth" migration planned?** The backbone reserved `0057` for it; nothing supports that.
5. **When do `users` and the `0001` baseline go?** Kept by P3; proposed for P6.

---

## Self-review

**Coverage against the backbone.** P3-0 → P3-2. P3-1 → P3-1. P3-2 → P3-3, widened to eleven
modules. P3-3's prerequisites → P3-7 Step 1. P3-4 → P3-7. P3-5 → split across P3-4 and P3-6. P3-6 →
P3-5 (routes) and P3-7 (deleting the tail). P3-7 → P3-9. P3-8 → P3-8.

**Ordering.** Every provider change has its consumer removed in an earlier, separately deployed
ticket: the SPA tolerates eight categories (P3-4) before the server narrows (P3-6); no caller remains
(P3-4) before the route goes (P3-5); no canonical code reads the Music tables (P3-5, P3-7) before
they drop (P3-9).

**Remaining unknowns, stated.** Generated constraint names and the analytics page list (looked up
from a live database in P3-6 Step 2). The deletable set after P3-5 (recomputed in P3-7 Step 3). The
three P3-7 prerequisites and the CI line numbers, carried from the backbone without re-audit.

---

## Corrections from review

Revision 1 said these; all were confirmed wrong against the code.

| # | Revision 1 said | The code says |
|---|---|---|
| 1 | P3-9 must remove the `REVOKE … ON account_music_identity` at `:765` | `provisionMusicRuntimeLogin` names **ten** Music tables in GRANT/REVOKE statements, and the privilege probes rethrow non-`42501` errors. The gate runs them **after** migrating, so it would crash with `0058` already committed and no image able to roll back |
| 2 | `DELETE FROM analytics_events WHERE category='music'` | `analytics_event_receipts` references it `ON DELETE RESTRICT` (`0036:31`); the DELETE aborts the migration. Receipts must be detached first |
| 3 | The compaction UPDATE then `ALTER TABLE` | The UPDATE queues deferred unique checks; `ALTER TABLE` with pending trigger events fails `55006`. `SET CONSTRAINTS … IMMEDIATE` in between |
| 4 | P3-4 echoing the `music` row makes P3-6 safe | Echoing is fine, but `canonicalNavigationMapping.ts:10` demands exactly nine rows. Open tabs on the old bundle would break the moment the server narrows. P3-4 now makes navigation tolerant |
| 5 | 0058 drops "the sixteen" trigger functions | It listed fifteen; `enforce_music_reactivation_token_identity()` (`0014:23`) was missing |
| 6 | After 0058, `proname ~ 'music'` must return nothing | `provision_music_runtime_login(name,text)` must survive — the gate calls it. Exactly one row is correct |
| 7 | P3-5 deletes the Music tail | Most of it is still imported by legacy modules; it goes in P3-7, after a recomputed closure |
| 8 | P3-5 removes the analytics resolvers | Two Music analytics **routes** stay mounted (`explorersAnalyticsRoutes.ts:191,228`), and the resolvers are required dependency fields |
| 9 | `shared/musicError.ts` is part of the tail | Canonical, via `explorersPrincipal.ts` → `security-containment.ts` |
| 10 | Delete `tunes-deploy.yml` in P3-7 | `tunes.yml:362` calls it as a reusable workflow; deleting it breaks `tunes.yml` and the `publish-image` job P2's deploy consumes |
| 11 | `users` may be dropped in P3-9 | Still read after P3-7; dropping it takes ~20 baseline tables and their sequences. Kept, deferred to P6 |
| 12 | The old container's writes fail during the 0057 deploy | Category saves silently succeed; **first sign-in** fails |
| 13 | `music-identity-config.ts` is used by `canonicalApp.ts` beyond the route; `priceParsing.ts` imports a Music policy | Both false |
| 14 | `.catch(undefined)` on `landingTab` | Must be `.optional().catch(undefined)` under `zod/v3`; the reverse does not type-check |

Also added: narrowing the `analytics_events.page` CHECK, compacting `pinned_order`, the
`users_lifecycle_operation_id_fk` name, the "Music" first-view option that P3-4 must remove, 410
tombstones for the newly retired paths, `.dockerignore` regeneration, and the
`docker-compose.replatform.yml` chain-bump lines.

### Revision 3 — from the Codex cross-model review (2026-10-18)

Codex's Windows sandbox refuses every shell call in this build, so it was given the three plans plus
the verbatim source of 22 high-risk files rather than live repository access. It found five things
both earlier reviews missed. Each was checked against code already read in this session and applied.

| Finding | Applied |
|---|---|
| **`0058` orphans venue rows rather than deleting them.** Venues are rows in `users`, which survives; the `ON DELETE CASCADE` on the mapping runs when a user is deleted, not when the mapping table is dropped; and Step 5 removes the only code that deleted venues. An erasure would report success with the venue still present | P3-9 Step 3a disposes of mapped venue rows inside `0058`, after the trigger drops and before the table drops, with a foreign-key preflight; Step 9's test asserts no `users` row survives |
| **Category saves break in the P3-6 window.** A client that refetches after `0057` echoes eight rows into an old API that demands nine; after the swap, a stale nine-row snapshot echoes `music` into a narrowed schema | P3-5 Step 4 makes the write path accept both sets and strip `music`, deployed before P3-6; P3-6 keeps that input tolerance |
| **`categoryOrder` with duplicates survives the migration and fails `.max(8)`.** Today's schema bounds length, not uniqueness, so nine non-music entries are valid | `0057` normalises every stored order to unique surviving categories, with a test |
| **`jsonb_array_elements` on a non-array aborts `0057`.** Only the outer `theme_settings` is constrained | `jsonb_typeof = 'array'` guard, and non-array orders are removed |
| **"Twenty-three functions" contradicts the twenty-two `0058` drops.** Removing `provision_music_runtime_login` from the expected list breaks exact equality at boot | Step 4 now says exactly twenty-two, keeps the twenty-third, and warns that the cited ranges interleave non-Music checks |

Also applied from the same review: Step 7 reproduces the gate's pre-migration preflights and adds an
**upgrade** run from a provisioned `0057` database; the sitemap stops advertising `/<handle>/music`
between P3-4 and P3-6; P3-4 removes `music` from `LANDING_TAB_SET` so stored values fall back; the
`:937` probe is renamed; and the old container's lifecycle behaviour in the `0058` window is
documented as self-healing, with the zero-overlap alternative stated for the owner.

**Not settled, and Codex said so:** complete `0058` dependency coverage needs the full DDL for every
dropped object and the body of `purge_explorers_account_content`; venue-media disposition needs the
legacy storage layout. Both are verified against a live database inside the tickets that need them
(P3-9 Steps 1, 3 and 3a) rather than asserted here.
