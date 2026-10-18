# P6 — Strapi Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing in the product, its tests, its CI or its deploy can reach Strapi. A browser guard proves it and cannot pass vacuously. Then the owner switches off the external Strapi service and `api.localqr.earth`.

**Architecture:** Thirteen tickets in two phases. **Phase A** can ship now. It touches only code that no deployed system runs: nothing deploys `main` today, and the canonical stack P2 will deploy reads no Strapi variable. **Phase B** waits for the cutover (P2) and for P3-7, which deletes the legacy composition. Every ticket merges to `main` and must leave CI green, the canonical stack bootable, and `legacy-music` mode bootable for as long as it exists.

The guard comes **first**, not last. `e2e/replatform/no-strapi.spec.ts` lands as P6-1, so that every later deletion runs against it. It has the backbone's four properties: a poisoned origin, a monitor self-test, a closure-size floor and a route-coverage floor. It adds a fifth, a per-route landing-and-API proof, because review showed the closure floor alone proves only that the app booted. The last code ticket re-runs it, and that run is the evidence P6 closes on.

**Tech Stack:** TypeScript, Express 5, React 18 + Vite, PostgreSQL 15, Vitest, Playwright, GitHub Actions.

**Revision 3 (2026-10-19).** Written against `fork/main` = `05a252f6`, then corrected by two independent adversarial reviews and a Codex cross-model review (see [Corrections from review](#corrections-from-review)). P6-1 and P6-2 were rewritten, because revision 1's guard could not go green and its P6-2 would have undone P5-1.

**Evidence standard.** Every load-bearing claim cites `path:line` at that commit (`canonicalStartup.ts` citations are re-checked against `b5b77fa3`, after P5b moved its lines), or a command whose output was read. Line numbers drift as P3, P5 and P6 tickets land. Re-locate each one before editing; never edit by line number alone.

---

## Before you start: what this plan decided

**1. The guard opens P6, it does not close it.** The backbone says to "close with" `no-strapi.spec.ts` (backbone P6 section). Built last, the guard protects nothing: every deletion before it is made blind. Built first, it is the regression check for each later ticket.

It is gated on P5-1, because until P5-1 canonical's owner analytics read still reaches Strapi, and the guard drives that read on purpose (P6-1 Step 6d). Once P5-1 is in, the guard is expected to pass on `main`: the remaining reachable Strapi calls, the four in P6-4, sit on paths its fixture does not take.

Its self-test, its per-case landing proof and its floors keep that early pass from being vacuous.

**2. Not every P6 ticket is gated on P2 + P3.** The backbone gates all of P6 on both. The inventory shows Phase A is safe today:
- **Production runs nothing built from `main`.** `EXPLORERS_IMAGE` has no producer in any workflow (`docker-compose.yml:231-232`). `tunes-deploy.yml` has never succeeded. `explorers.yml` runs only on a typed manual dispatch (`explorers.yml:1-42`).
- **The canonical stack has no Strapi in it.** `deploy/production.compose.yml:86` is `canonical` and names no Strapi variable, which `production-compose.test.ts:97-98` enforces.

**3. One P6 ticket must land BEFORE P3-7, and the P3 plan does not know it.** The historical analytics read dynamically imports `services/explorers-analytics-composition.ts` (`explorersCanonicalAnalyticsRoutes.ts:13`; after P5-1 it is only the `!auth` branch). That module imports `../db` (`:3`). Measured with the scanner's own walker, that edge alone holds five modules in the canonical closure:
- `server/db.ts`
- `config/music-local-profile.ts`
- `config/music-owned-browser-profile.ts`
- the composition itself
- `services/explorers-analytics-receipts.ts`

Removing the edge takes the closure from 155 to 150 modules (review A). `db.ts` also imports `@shared/schema`. The scanner does not follow that alias, but `tsc` does: P3-7 lists `shared/schema.ts` as "imported only by legacy code" (P3 plan, P3-7 Step 3), and if P3-7 deletes it while the composition still exists, canonical stops type-checking. So P6-2 must precede P3-7. Tell the orchestrator.

`scripts/music-uat-database.ts` is **not** one of the five. It stays canonical through `scripts/apps-canonical-admission.ts`.

**4. Start fresh means no data tasks.** No Strapi content is imported anywhere in this plan. The content export in P6-13 is optional, because production Strapi holds only test and team data (D1, backbone "Settled decisions").

**5. Kept on purpose:**
- **The `/graphql` and `/api/strapi/*` 410 tombstones** (`musicRetirementPolicy.ts:13-16`). They are courtesies to stale clients and cost nothing.
- **The `documentId` field name in canonical DTOs.** There are 1,342 lines over 193 files, and it is the SPA's identifier contract, not a Strapi dependency.
- **The `strapiBlocksConverter` rich-text format** (`CreateGuidePage.tsx:16` and two others). It is a data format, not a call.
- **The taxonomy provenance rows** (`taxonomy_source_mappings`, `0053:21`) and `tunes/fixtures/taxonomy/real-strapi-20261013/`. They are the reviewed source of the live People/Places taxonomy.

Renaming any of these is a P8 register entry, not retirement.

**6. Legacy e2e mocks of `/graphql` are left in place.** Twenty-four non-replatform files under `explorers-earth/e2e` mock `**/graphql`. Once Apollo is gone they are dead branches inside test code. They reach nothing, and the no-Strapi guard watches the application, not other specs' mocks. Deleting them is optional hygiene (Open question 4).

---

## What "Strapi" is in this repo, measured

### Server (`tunes/`)

**Strapi network call sites: six runtime modules.** That is the backbone's "six server call sites", counted by module. Re-verified with a closure walker that follows static, `require` and dynamic `import()` edges.

| # | Module (fetch line) | Endpoints | Closure | Dies in |
|---|---|---|---|---|
| 1 | `server/services/strapiIdentityGateway.ts:367` | `/api/accounts` (:289), `/api/users/me` (:337) | legacy only (`routes/index.ts:16,84`) | P3-7 |
| 2 | `server/services/strapiIdentityAbsenceProof.ts:44` | `/graphql` (:33) | legacy only (`app.ts:13,178`) | P3-7 |
| 3 | `server/publicProfile/strapiPublicProfileGateway.ts:118` | `/graphql` | legacy only (`routes/index.ts:44,181`) | P3-7 |
| 4 | `server/seo-routes.ts:121` | `/graphql` (:116-117) | legacy only (`routes/index.ts:5,265`) | P3-7 |
| 5 | `server/services/reactivation-service.ts:228` | GET `/api/users` (:147,:155), **PUT** `/api/users/:id` (:177) | legacy only (`routes/index.ts:8,192`) | P3-7 |
| 6 | `server/services/explorers-analytics-adapters.ts:326,409,512` | `/graphql`, `/api/users/me` | **canonical, via dynamic import** | **P6-2** |

**Two more modules lie outside both closures.** Neither closure-based deletion catches them:
- `server/routes/musicFixtureProbe.ts:27-28` runs in fixture mode only.
- `server/commands/reconcileMusicIdentities.ts:195` is CLI only, reached through `scripts/music-cli.ts:1451,1514`.

In total that is 8 modules and 11 fetch expressions in `server/`. P6-9 sweeps whatever P3-7 leaves.

**At `05a252f6` the canonical Strapi path is broken in production, not live:**
- `explorers-analytics-composition.ts:25-27` throws `STRAPI_ANALYTICS_ACCESS_TOKEN is not configured`, and `deploy/production.compose.yml` sets no Strapi variable.
- `legacy ??=` (`explorersCanonicalAnalyticsRoutes.ts:13`) memoises the rejected promise, so every later owner `GET /api/explorers/analytics/events` returns 502 (`explorersAnalyticsRoutes.ts:203-205`).
- Callers: the SPA calls it only with an auth-store `token` (`explorersAnalyticsClient.ts:176`), which canonical sign-in never sets (`AnalyticsDashboard.tsx:70-85`).

In CI it is live against the **fixture** Strapi, because the platform-fixture `tunes` service sets `STRAPI_URL` and `STRAPI_ANALYTICS_ACCESS_TOKEN` (`docker-compose.replatform.yml:93-97`).

**P5-1 changes this** (commit `9e73fb75` on `claude/p5-user-visible-defects`):
- The canonical runtime serves the GET from `analytics_events`, authorised by the session.
- Only the `!auth` branch (the legacy runtime) still reaches the composition.

P6-2 is written against that post-P5-1 state.

**Non-network Strapi coupling inside canonical:**
- `security-containment.ts`
  - It is in the canonical closure only because `middleware/explorersPrincipal.ts:7` imports `requestIdFor` (`:15`).
  - It carries `verifyStrapiToken` (`:36`), which reads `STRAPI_JWT_SECRET`, and `assertContainmentStartup` (`:288-290`), which is called only from legacy `app.ts:60`.
- **The `users` table**
  - `db/music-runtime-role.ts:117` lists it among the expected runtime tables.
  - `:849` probes `"TRUNCATE TABLE users"`, expecting a privilege denial.
  - `application/accountLifecycleMaintenance.ts:34-37` reads `users.strapi_*`. P3-9 deletes that block (P3 plan, P3-9 Step 5).
- `explorers_analytics_receipts.strapi_document_id` (`0021:5`). Its only reader is the legacy receipts repository.

**The ratchet already exists.**
- `node scripts/check-retired-dependencies.mjs` (CI: `tunes.yml:111-112`) prints `canonical closure: 155 modules` and `OK — … one of the 5 allowlisted legacy sites`.
- The five allowlisted sites are three env reads (`:39-61`) and two client constructions (`:90-104`).
- It **fails on stale entries** (`:250-269`). So every ticket that removes a site must delete its allowlist entry in the same commit.
- **It walks one entry point and relative specifiers only.** Its only root is `canonicalStartup.ts` (`:33`), and it skips the `@shared/*` alias (`tunes/tsconfig.json:21`).
  - The production `migrate` service runs `run-migration-gate.ts` (`deploy/production.compose.yml:51-54`). That reaches `deployment/music-health.ts`, which reads `STRAPI_ACCESS_TOKEN`, `STRAPI_JWT_SECRET` and `STRAPI_URL` (`:57-60`) as legacy readiness inputs.
  - `run-production-graph-smoke.ts`, bundled by `build:api`, reaches `app.ts:178` (`new StrapiIdentityAbsenceProof`).
  - P6-3 widens the scan to every `build:api` entry point.

**The live legacy stack is still configured for Strapi.** The root `docker-compose.yml` that production runs today:
- pins `legacy-music` (`:9`);
- **requires** `STRAPI_URL`, `MUSIC_STRAPI_ALLOWED_ORIGINS`, `STRAPI_ACCESS_TOKEN`, `STRAPI_ANALYTICS_ACCESS_TOKEN` and `STRAPI_JWT_SECRET` (`:19-27`);
- mounts the lifecycle-proof secret (`:26,101`).

Its server-to-server Strapi calls carry no `Origin` or `Referer`. Deleting code from `main` does not stop that container; only P2 plus decommissioning it does. That is why P6-13 is gated on the old tunes host, not on the code.

**Smaller Strapi sites found by review**, all swept by P6-9's recompute:
- `server/config/public-profile-gateway-config.ts:13-15` (`STRAPI_PUBLIC_PROFILE_READ_TOKEN`)
- `server/config/music-environment.ts:4-8`
- `tunes/deployment/verify-publication-authority.mjs:129-150`
- the inert nested `tunes/.github/workflows/main.yml:54-57` (`STRAPI_GRAPHQL_ENDPOINT`, `STRAPI_API_KEY` secrets)
- `explorers-earth/nginx.music-fixture.conf`
- `.env.music.example`
- `explorers-earth/scripts/music-public-*.mjs`

### Frontend (`explorers-earth/`)

**`gql` documents: exactly 45 non-test documents in 13 files.** This matches the backbone. They were counted by parsing every `` gql` `` occurrence, not with a line-anchored grep. None is executed:
- No `useQuery`, `useMutation`, `client.query` or `client.mutate` exists on an Apollo document in non-test source.
- The only Apollo calls are `clearStore()`, at `AccountGenerationCacheReset.tsx:24` and `useLogout.ts:37`.

**They are inert only because nothing calls them.** Nothing guards them:
- `main.tsx:38,51` builds and mounts the client in the platform build too.
- **35 of the 45 ship in the platform bundle**, through the `export *` barrels in each category's `index.ts` (e.g. `Games/index.ts:16-17`).
- The other 10 do not ship: `PublicHome/api/query.ts` (5) and `Settings/api/mutation.ts` (5).

**Strapi REST call sites: six became four.** `Checkout.tsx`, `paymentService.ts` and `subscriptionService.ts` were deleted by P4. What remains:

| Site | Call | When it runs |
|---|---|---|
| `pages/Profile.tsx:1684-1687` | `GET ${VITE_REST_API_URL}/accounts?filters…` | upload fallback, when `accountQuery.data` is falsy |
| `pages/Profile.tsx:1751` | `POST ${VITE_REST_API_URL}/upload` (profile picture) | same fallback (`:1712` is the canonical branch) |
| `pages/Profile.tsx:1849` | `POST …/upload` (background) | same fallback |
| `features/Favorites/components/AddRecommendation.tsx:774-783` | `DELETE …/upload/files/:id` | **every** edit-mode image removal, unguarded |

In a platform build `VITE_REST_API_URL` is `undefined` (`envPrefix: []`). So these go to the relative path `undefined/upload…` and never reach Strapi. They are dead weight that a guard can still catch.

**Seven image-URL builders (8 lines)** wrap `localhost:1337` in `runtimeOrigin()`, which `platformBuildLeaks.test.ts:65-78` requires. That test does **not** catch the four raw calls above, because they contain neither `localhost:1337` nor `api.localqr.earth`.

**Production serves an externally built legacy image.**
- The legacy image is `Dockerfile:73` `legacy-default`, with `nginx.conf:79-96` proxying `/api/` and `/graphql` to `https://api.localqr.earth`.
- A legacy build of *current* `main` has no working data plane: `explorersApiClient.ts:48,753` always calls same-origin `/api/explorers/v1`.
- So the legacy build is dead in practice. CI still compiles it: `ci.yml:168-169` runs `npm run build`, i.e. `vite build` with `vite.config.ts`.

### Infra, CI and docs

**No real Strapi runs in CI.** A **fixture** Strapi, `tunes/scripts/music-fixture-server.ts` on `:1337`, runs in two places:
- `docker-compose.replatform.yml:31-47`, which the required `test.yml` platform-fixture job starts.
- `docker-compose.music-test.yml:29-40`.

`scripts/replatform-local.ts:86,476` refuses to start unless a `strapi` service exists.

**CI's "/graphql suffix" contract** is `ci.yml:226-228` (also `:288`, `:350`, `:423`), pinned by `replatform-workflow-authority.test.ts:55-59`.

**Seals that break if Strapi text is edited** (all run by the required `test.yml:122`):
- `scripts/replatform-e2e.test.mjs:466-469,474,493,529-531,562,567` freeze the printed source of the `monitor()` and `prepareNavigation` helpers in `books.spec.ts:96`, `movies.spec.ts:161` and `profile.spec.ts:641-648`, which name `localhost:1337` and `/graphql`.
- **Do not edit those helpers.** Nothing in this plan needs to.

**Load-bearing docs** are the seven files in `docs/architecture/music-documentation-contract.json`. Also, `music-documentation-contract.test.ts:716-734` requires a linked set to exist, including `docs/explorers-earth/integrations.md`.

**Strapi itself**, the owner's to retire:
- Source repo `MeteoriteLabs/localqr-strapi-v2` (`docs/replatform-audit/revised-direction.md:32`).
- Hosts "LocalQR-Strapi-Prod" and "LocalQR-Strapi-Dev", Hetzner CAX21 (`docs/plans/database-change-feature.md:24-28`).
- Production is `https://api.localqr.earth`; hosted dev is `http://77.42.95.255:1337`; "both share RDS" (`docs/operations/music-local-development.md:97`).
- A third, older host, `http://13.126.235.177:1337` (AWS Mumbai), is commented out in `explorers-earth/vite.config.ts:59,66` and described in `docs/superpowers/plans/2026-07-08-production-e2e-run-notes.md:75`. Whether it still exists or still bills is unknown (Open question 6).
- Uploads go to S3 through the `aws-s3` provider (`docs/replatform-audit/grooming-media-auth-review.md:13`).

---

## Ticket order

| # | Ticket | Phase | Gate | Must precede |
|---|---|---|---|---|
| P6-1 | The no-Strapi browser guard | A | **P5-1 merged** | every other ticket |
| P6-2 | Retire the historical analytics read | A | **P5-1 merged** | **P3-7**, P6-3 |
| P6-3 | Take `security-containment` out of canonical; widen the ratchet to every production entry point, with no allowlist | A | P6-2 | P6-12 |
| P6-4 | Remove the SPA's four Strapi REST calls | A | none | P6-8 |
| P6-5 | CI builds what deploys, and scans the bundle for Strapi | A | **P6-4 merged** (the bundle holds `undefined/upload` until then) | P6-12 |
| P6-6 | Delete the 45 `gql` documents | B | P3-7 merged | P6-7 |
| P6-7 | Delete Apollo Client | B | P6-6 | P6-9, P6-12 |
| P6-8 | Retire the legacy SPA build and its Strapi configuration | B | **P2 proven in production**, P6-4, **P6-7** (its leak test forbids `VITE_API_URL`, which `main.tsx:33` reads until Apollo goes) | P6-12 |
| P6-9 | Remove the fixture Strapi and the Strapi tooling | B | P3-7 merged **and P6-7 merged** | P6-10 |
| P6-10 | Drop `users`, the `0001` baseline and the analytics receipts — next free migration number | B | **P3-9 merged** | P6-12 |
| P6-11 | Rewrite the docs that describe Strapi as current | B | P6-9 | P6-12 |
| P6-12 | Close: final guard run and evidence | B | all above | P6-13 |
| P6-13 | **Owner:** retire the Strapi service and `api.localqr.earth` | owner | P6-12, **the old legacy tunes host running canonical or switched off**, then 7 quiet days | — |

**Why P6-9 waits for P6-7.** It deletes the contained `/graphql` e2e adapter and the CI `VITE_API_URL` env:
- The required `contained-auth-session` lane uses that adapter until P6-6 deletes its two tests.
- Apollo reads `VITE_API_URL` until P6-7 removes it.

**Migration numbers are the orchestrator's.** The P5 branch already adds `0058_explorers_place_photo_backfill.sql` and `0059_explorers_person_suppression_audit.sql`, and P3-9 also wants a number. P6-10's file takes the next free number after all of those land. It is written `00NN_retire_strapi_baseline.sql` below.

**Why P6-8 waits for P2 and not merely P3-7.** `explorers-earth/nginx.conf`, the `Dockerfile` legacy stages and `netlify.toml` are the recipe for the SPA production serves today. Until P2 has replaced it in production, deleting the recipe deletes the only way to rebuild what is live.

**Why P6-10 waits for P3-9.** P3-9 drops the Music tables and the triggers and foreign keys that reach `users` (`0018:5`, `0023:17`, `0051:116`, all `REFERENCES users`). Until those are gone, `users` cannot be dropped without `CASCADE`, and this plan never uses `CASCADE`.

---

## Two checks no review can do for you — run them on every ticket

These are carried from P1 and P3, where both classes of error survived reviews.

**1. Execute every literal before you build a test on it.** Error strings, diagnostics-channel names, route paths, env keys, function signatures, line numbers. This plan names dozens of them, for example:
- `undici:request:create` and `http.client.request.start`
- `serviceWorkers: 'block'`
- `STRAPI_ANALYTICS_ACCESS_TOKEN is not configured`
- `expectedRuntimeTables`

Look each one up in the real code or a real run first.

**2. Confirm each new test runs in a gate.**
- `tunes/vitest.config.ts` excludes `*.integration.test.ts`. Those run only via `--config vitest.integration.config.ts`, and in CI only in `tunes.yml`, on PRs to `main`.
- The `replatform-real-stack` nightly (`frontend-e2e-qualification.yml:108`) is **not** required.

A test nobody runs reads as coverage and is worse than none.

**Regenerate the generated `.dockerignore` files in every ticket that adds, moves or deletes a source file.** Both `.dockerignore` and `explorers-earth/Dockerfile.music-fixture.dockerignore` enumerate exact paths (P3 plan, "Facts an engineer needs"). This applies to P6-1, P6-2, P6-3, P6-6, P6-7, P6-8 and P6-9. A test pins the result (`music-fixture-services.test.ts:875`). Run:

```bash
node scripts/generate-music-fixture-dockerignore.mjs --write   # P3-8 may have renamed it; use the current name
```

**Typecheck commands, because the obvious ones lie:**
- explorers-earth: `npx tsc --noEmit -p tsconfig.app.json`. `-p tsconfig.json` checks nothing and always reports zero errors.
- tunes: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/'`. Read the result as "no new lines", because pre-existing errors live in `tunes/client/` until P3-7 deletes it.

**Unit test commands:**
- explorers-earth: `node ./scripts/run-contained-vitest.cjs run <path> --maxWorkers 1`, run from `explorers-earth/`. A bare `npx vitest run` fails with *"Containment guard is absent or allowed an unowned endpoint"*.
- tunes: `npm test --prefix tunes -- --run <path>` from the repository root.

**Whole frontend lane, serially, on every frontend ticket.** It is the only cross-ticket gate for DTO-shape regressions:

```bash
cd explorers-earth && node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
```

In a fresh worktree, expect 8 environment-only collection failures unless `npm ci` has also run in `tunes/` (`p2-task1-spa-platform-leaks-findings.md`, "Frontend lane baseline"). Compare against a baseline run on the same tree; never against zero.

---

## P6-1: The no-Strapi browser guard

**Gate: P5-1 merged.** Until P5-1 lands, canonical's owner analytics read really does reach Strapi through the composition (see "What Strapi is"). This guard probes that read on purpose (Step 6e), so before P5-1 it is red. That is correct: it is a real canonical Strapi path. Do not land it red, and do not weaken the probe to land it early.

**What it runs.** The real SPA source runs in **Vite dev mode** against the real canonical app (`createCanonicalApp`, in-process in the runner) and an owned, disposable PostgreSQL 15. It visits every route literal at two viewports, and fails if any request, from any channel, heads for Strapi.

**What it does not run, said plainly.** Dev mode is not the platform build:
- `MODE` is `development`, so `isCanonicalRuntime()` is false (`publicRuntimeConfig.ts:4`).
- `runtimeOrigin()` returns its legacy argument, Apollo's `uri` is `VITE_API_URL` (`main.tsx:33`), and `bootstrap.ts` skips `/runtime-config.json`.

So the guard exercises the **legacy-leaning** branches, where Strapi destinations are most reachable, and the poison makes every one of them visible. The **shipped** bundle is covered separately and statically by P6-5's scan. P6-12 Step 0a runs the same spec once against the real platform build, served by `vite preview` with a rendered `/runtime-config.json`, before P6 closes.

Five properties, each of which fails loudly if the guard goes blind:

| Property | What makes it real |
|---|---|
| **Poisoned origin** | Every Strapi-only destination the SPA can build (`VITE_API_URL`, `VITE_REST_API_URL`) points at `https://strapi.poison.invalid`, which never resolves (RFC 6761). The canonical app process gets `STRAPI_*` variables pointing at the same host. The real Strapi hosts (`api.localqr.earth`, `77.42.95.255`, `13.126.235.177`), port `1337` and Strapi's same-origin paths (`/graphql`, `/upload`, `/api/users`, …) are poisoned too. **Destinations shared with canonical are not poisoned**: `VITE_PUBLIC_PROFILE_GATEWAY_URL` is the origin for `/api/explorers/v1/profiles/…` (`publicProfileGatewayClient.ts:57-61,160-166`). Poisoning it would make every public page a false positive (review B measured this) |
| **Monitor self-test** | Before any route runs, the guard fires one deliberate request down each channel: fetch, same-origin fetch, image, WebSocket, Worker fetch and beacon. It fails unless the browser monitor saw and refused every one. It also checks that a canonical call was seen and **allowed**, so the monitor is not simply blocking everything. The server-side monitor is **detection only**: it records Node's outbound requests, and the poison's `.invalid` host is what makes them unreachable. It self-tests both Node channels against an owned loopback server. Only the exact nonces a self-test issued are exempt, on both sides. The runner then drives the one canonical read that historically reached Strapi |
| **Closure-size floor** | The run fails unless at least `MODULE_FLOOR` distinct `/src/` modules were served, so an app that crashed on boot cannot pass. **This proves boot only.** Every route loads the same ~573 modules, because routes are imported statically (`ProtectedRoutes.tsx:6-28`; measured by review B). Per-route proof comes from the next two rows |
| **Per-case landing and render proof** | Each case asserts four things:
- the pathname it **landed** on;
- that it does not end on a same-path broken state (the protected loader, the account-error screen or the hidden-category fallback);
- where given, that a page-specific `marker` is visible;
- for an owner case, that it never landed on `/login` or `/onboarding` and observed a credentialed `GET /api/explorers/v1/me` answering 200.

Without these, a broken sign-in or a broken page silently passes on an unchanged URL. Across the run, an **API-surface floor** requires at least `API_FLOOR` distinct canonical API paths whose responses **succeeded** |
| **Route-coverage floor** | Every **occurrence** of a `path="…"` literal in the route files must be claimed by exactly one case or exclusion, keyed `<file>:<path>#<n>`. Matching by set would hide repeats: `:listSlug` occurs six times in `PublicRoutes.tsx`, once per category. Stale claims fail too. `afterAll` requires at least `ROUTE_FLOOR` executed cases |

**Files:**
- Create: `explorers-earth/e2e/replatform/no-strapi.vite.config.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi-monitor.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi-routes.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi.spec.ts`
- Create: `explorers-earth/e2e/replatform/tsconfig.no-strapi.json`
- Create: `tunes/scripts/no-strapi-outbound-monitor.ts`
- Create: `tunes/server/test/contracts/no-strapi-outbound-monitor.test.ts`
- Modify: `tunes/scripts/lifecycle-browser-guards.ts:21-28` (`parseBrowserSuite`)
- Modify: `tunes/scripts/profile-browser-fixture.ts` (around `:120-198`)
- Modify: `scripts/replatform-e2e.mjs` (`snapshotSource`, `:455-500`: register the new runner dependency)
- Modify: `tunes/package.json` (scripts, next to `:28-49`)
- Modify: `.github/workflows/frontend-e2e-qualification.yml:114-122` (nightly matrix)

- [ ] **Step 1: Write the server-side monitor's failing test**

`tunes/server/test/contracts/no-strapi-outbound-monitor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { installOutboundMonitor, selfTestOutboundMonitor } from '../../../scripts/no-strapi-outbound-monitor';

describe('no-Strapi outbound monitor', () => {
  it('sees a fetch and an http.request to a poisoned host, and reports them as Strapi', async () => {
    const monitor = installOutboundMonitor();
    try {
      await selfTestOutboundMonitor(monitor);
      expect(monitor.strapi()).toEqual([]); // only this run's self-test nonces are exempt
      await fetch('https://strapi.poison.invalid/graphql').catch(() => undefined);
      expect(monitor.strapi().map((o) => o.origin)).toContain('https://strapi.poison.invalid');
      // An app request that merely carries the parameter is still a violation.
      await fetch('https://strapi.poison.invalid/x?nostrapi-selftest=forged').catch(() => undefined);
      expect(monitor.strapi().some((o) => o.path.includes('forged'))).toBe(true);
    } finally {
      monitor.dispose();
    }
  });

  it('is blind after dispose, so a disposed monitor cannot report a clean run', async () => {
    const monitor = installOutboundMonitor();
    monitor.dispose();
    await expect(selfTestOutboundMonitor(monitor)).rejects.toThrow('NO_STRAPI_OUTBOUND_MONITOR_BLIND');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --prefix tunes -- --run server/test/contracts/no-strapi-outbound-monitor.test.ts`
Expected: FAIL, with `Cannot find module '../../../scripts/no-strapi-outbound-monitor'`.

- [ ] **Step 3: Implement the server-side monitor**

`tunes/scripts/no-strapi-outbound-monitor.ts`. Review B confirmed the message shapes on Node 24.14. Confirm them again on `24.21.0` before relying on them:
- **undici:** `message.request.origin` and `.path`.
- **http:** `message.request` is a `ClientRequest`. Its `.host` has **no port**, so the port comes from `getHeader('host')`.

```bash
node -e "const dc=require('node:diagnostics_channel');dc.subscribe('undici:request:create',m=>console.log('undici',m.request.origin,m.request.path));dc.subscribe('http.client.request.start',m=>console.log('http',m.request.protocol,m.request.getHeader('host'),m.request.path));fetch('https://x.invalid/a').catch(()=>{});require('node:http').get('http://127.0.0.1:1337/b').on('error',()=>{})"
```

```ts
import diagnostics_channel from 'node:diagnostics_channel';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export type OutboundObservation = { channel: 'undici' | 'http'; origin: string; path: string };
export type OutboundMonitor = {
  seen: OutboundObservation[];
  strapi(): OutboundObservation[];
  dispose(): void;
};

/** Hosts, ports and paths that can only mean Strapi. Kept in step with no-strapi-monitor.ts. */
const STRAPI = /strapi|localqr|:1337(?:\/|$)|77\.42\.95\.255|13\.126\.235\.177/i;
const SELF_TEST = 'nostrapi-selftest=';
/** Only nonces this process issued are exempt; an app request carrying the parameter is still a violation. */
const issued = new Set<string>();

export function installOutboundMonitor(): OutboundMonitor {
  const seen: OutboundObservation[] = [];
  const onUndici = (message: unknown) => {
    const request = (message as { request: { origin: unknown; path: unknown } }).request;
    seen.push({ channel: 'undici', origin: String(request.origin), path: String(request.path) });
  };
  const onHttp = (message: unknown) => {
    const request = (message as { request: http.ClientRequest }).request;
    // ClientRequest.host carries no port; the Host header does (127.0.0.1:1337).
    seen.push({ channel: 'http', origin: `${request.protocol}//${String(request.getHeader('host') ?? request.host)}`, path: request.path });
  };
  diagnostics_channel.subscribe('undici:request:create', onUndici);
  diagnostics_channel.subscribe('http.client.request.start', onHttp);
  return {
    seen,
    strapi: () => seen.filter((o) => STRAPI.test(`${o.origin}${o.path}`) && ![...issued].some((nonce) => o.path.includes(`${SELF_TEST}${nonce}`))),
    dispose: () => {
      diagnostics_channel.unsubscribe('undici:request:create', onUndici);
      diagnostics_channel.unsubscribe('http.client.request.start', onHttp);
    },
  };
}

/**
 * Fires one request down each channel and refuses to continue unless both were seen.
 * Detection only: this monitor records, it does not block. Blocking comes from the poison itself:
 * `.invalid` never resolves, so nothing reaches a poisoned host. The http probe goes to an owned
 * loopback server, never to 1337, so the self-test cannot reach a real Strapi.
 */
export async function selfTestOutboundMonitor(monitor: OutboundMonitor): Promise<void> {
  const nonce = randomUUID();
  issued.add(nonce);
  await fetch(`https://strapi.poison.invalid/graphql?${SELF_TEST}${nonce}`, { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  const owned = http.createServer((_request, response) => response.end('ok'));
  await new Promise<void>((done) => owned.listen(0, '127.0.0.1', () => done()));
  const port = (owned.address() as { port: number }).port;
  try {
    await new Promise<void>((done) => {
      http.get(`http://127.0.0.1:${port}/strapi?${SELF_TEST}${nonce}`, { timeout: 5000 })
        .on('response', (response) => { response.resume(); done(); })
        .on('error', () => done()).on('timeout', () => done());
    });
  } finally {
    owned.close();
  }
  const hits = monitor.seen.filter((o) => o.path.includes(nonce));
  if (!hits.some((o) => o.channel === 'undici' && o.origin.includes('strapi.poison.invalid'))
      || !hits.some((o) => o.channel === 'http' && o.origin.endsWith(`:${port}`)))
    throw new Error('NO_STRAPI_OUTBOUND_MONITOR_BLIND');
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test --prefix tunes -- --run server/test/contracts/no-strapi-outbound-monitor.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the suite**

In `tunes/scripts/lifecycle-browser-guards.ts:21`, add `'no-strapi'` to both the return type union and the loop list at `:25`:

```ts
export function parseBrowserSuite(args: string[]): 'profile' | 'auth' | 'lifecycle' | 'places' | 'place-links' | 'apps' | 'guides' | 'public-parity' | 'people' | 'apps-enrichment' | 'no-strapi' {
    const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
    if (JSON.stringify(args) === JSON.stringify(['--ack', ack]))
        return 'profile';
    for (const suite of ['auth', 'lifecycle', 'places', 'place-links', 'apps', 'guides', 'public-parity', 'people', 'apps-enrichment', 'no-strapi'] as const)
```

Then add this to the `scripts` in `tunes/package.json`, next to `explorers:test:people-browser`:

```json
"explorers:test:no-strapi-browser": "tsx scripts/profile-browser-fixture.ts --suite no-strapi",
```

Run: `npm test --prefix tunes -- --run server/test/contracts/lifecycle-browser-support.test.ts`
Expected: PASS. It asserts a subset of suites (`:56-61`). If it pins the exact list, extend it.

- [ ] **Step 6: Wire the runner**

Work in `tunes/scripts/profile-browser-fixture.ts`, and read the whole file first. The `no-strapi` suite takes the default branch, the same one `profile` and `auth` use. In that branch the runner composes the app at `:142`, creates personas at `:147-157`, and then has `db`, `apiPort` and `origin` in scope.

(a) **Before the canonical app is composed** (before the `createCanonicalApp` call at `:142`), install the monitor, self-test it, and poison the environment. Any Strapi reader that survives then calls the poisoned host, and the monitor records it:

```ts
import { installOutboundMonitor, selfTestOutboundMonitor, type OutboundMonitor } from './no-strapi-outbound-monitor';
// …
let outbound: OutboundMonitor | undefined;
if (suite === 'no-strapi') {
  outbound = installOutboundMonitor();
  await selfTestOutboundMonitor(outbound);
  Object.assign(process.env, {
    STRAPI_URL: 'https://strapi.poison.invalid',
    STRAPI_FIXTURE_URL: 'https://strapi.poison.invalid',
    STRAPI_ACCESS_TOKEN: 'no-strapi-poison',
    STRAPI_ANALYTICS_ACCESS_TOKEN: 'no-strapi-poison',
    STRAPI_JWT_SECRET: 'no-strapi-poison',
  });
}
```

`assertBrowserEnvironment` (`lifecycle-browser-guards.ts:30-33`) forbids none of these keys; confirm that.

(b) **After the personas loop**, onboard `ownerA`, so that owner and public routes have a complete account with a handle. `ownerB` stays un-onboarded; the `/onboarding` case uses it. This follows the `auth` branch's pattern (`:161-170`).

`ensureInitialAccount` inserts `creator_accounts DEFAULT VALUES` (`initialAccount.ts:20`). The `creator_accounts_complete_valid` CHECK (`0022_explorers_identity.sql:94-95`) requires `display_name` and `account_type` once onboarding is complete. So the PATCH must set both, as `profile.spec.ts:627-628` does, or the server answers 422:

```ts
let ownerAccountId: string | undefined;
if (suite === 'no-strapi') {
  const owner = personas.ownerA;
  const selected = await ensureInitialAccount(db, owner.userId);
  ownerAccountId = selected.accountId;
  const account = await db.query<{ revision: string }>('SELECT revision::text FROM creator_accounts WHERE id=$1', [selected.accountId]);
  const onboarded = await fetch(`http://127.0.0.1:${apiPort}/api/explorers/v1/account`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: Number(account.rows[0].revision), handle: owner.handle,
      displayName: 'No-Strapi Fixture', accountType: 'Personal', onboardingStatus: 'complete', publicProfile: true }),
  });
  if (onboarded.status !== 200) throw new Error(`No-Strapi owner onboarding failed: HTTP ${onboarded.status}`);
  // Public category pages sit behind TabVisibilityGuard defaultVisible={false} (PublicRoutes.tsx:46,73,86,…),
  // and ensureInitialAccount writes category settings without an explicit visibility (initialAccount.ts:25-28).
  // Make every category public, or the public cases render a hidden-category state instead of the page under test.
  const me = await (await fetch(`http://127.0.0.1:${apiPort}/api/explorers/v1/me`, { headers: { Cookie: owner.cookie } })).json() as
    { account: { revision: number; categories: { category: string; isPublic: boolean; displayOrder: number; pinnedOrder: number | null }[] } };
  const visible = await fetch(`http://127.0.0.1:${apiPort}/api/explorers/v1/account`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: me.account.revision, categories: me.account.categories.map((c) => ({ ...c, isPublic: true })) }),
  });
  if (visible.status !== 200) throw new Error(`No-Strapi category visibility failed: HTTP ${visible.status}`);
}
```

The `auth` branch already imports `ensureInitialAccount`; reuse that import.

Before relying on them, confirm against `tunes/shared/explorersContract.ts` that the account DTO's `categories` entries are `{category, isPublic, displayOrder, pinnedOrder}` (`:231`) and that `updateAccountInputSchema` accepts that array (`:258`). The guard does **not** seed published lists, so `/:listSlug` cases render a not-found state. That is intended: the loader still runs. Each category **index** page must render the category itself; Step 11's per-case marker asserts it.

(c) **Choose the Vite config by suite** at `:183`:

```ts
'--config', suite === 'no-strapi' ? 'e2e/replatform/no-strapi.vite.config.ts' : 'e2e/replatform/profile.vite.config.ts'], {
```

(d) **Drive the historical Strapi read directly, before the browser starts.** No browser case can reach it: the SPA sends it only with an auth-store token, and canonical never issues one. Without this probe, the server monitor would watch a run in which nothing could ever call Strapi.

```ts
if (suite === 'no-strapi') {
  const today = new Date().toISOString().slice(0, 10);
  const read = await fetch(`http://127.0.0.1:${apiPort}/api/explorers/analytics/events?` + new URLSearchParams({
    accountId: ownerAccountId!, fromDate: today, toDate: today, timeZone: 'UTC' }), { headers: { Cookie: personas.ownerA.cookie, Origin: origin } });
  // After P5-1 the canonical read is served from analytics_events: 200. Anything else means the probe did not run the read.
  if (read.status !== 200) throw new Error(`No-Strapi analytics probe: HTTP ${read.status}`);
}
```

Confirm the query keys against `readScopeSchema` (`explorersAnalyticsRoutes.ts:75-80`: `accountId`, `fromDate`, `toDate` and `timeZone`) and against P5-1's version of the route.

(e) **Report the server monitor on every exit path.** A probe failure in (d), a browser failure or a thrown error must not skip the report. Otherwise the most useful diagnostic, *which* Strapi request was made, is lost exactly when it matters. Wrap everything from (a) to the browser's exit in `try`, and report in `finally`, before cleanup:

```ts
function reportOutbound(): string | undefined {
  if (!outbound) return undefined;
  const strapi = outbound.strapi();
  outbound.dispose();
  console.log(JSON.stringify({ noStrapiServer: { observed: outbound.seen.length, strapi: strapi.length, requests: strapi } }));
  return strapi.length ? `NO_STRAPI_SERVER_VIOLATION ${JSON.stringify(strapi)}` : undefined;
}
// try { …(a)…(d)…browser… } finally { const violation = reportOutbound(); if (violation) failures.push(violation); }
```

Fit `failures` to the runner's existing failure accumulation; read how `assertOwnedCleanup` (`lifecycle-browser-guards.ts`) collects failures. A probe error and a server violation must both survive into the final error message, and `main()` must return non-zero for either one.

(f) **Register the new dependency with the replatform source inventory — same commit.** `scripts/replatform-e2e.mjs` `snapshotSource()` (`:455-500`) follows every relative import out of `profile-browser-fixture.ts`, which is in its `overlay` set. It fails with `Unreviewed relative executed dependency` on any file that is neither `reviewed` nor `overlay`. `replatform-e2e.test.mjs:891-896` runs it on the real repo in the required `test.yml:121` lane. Add the new file the way `appsHelper` is added:

```js
 const noStrapiMonitor='tunes/scripts/no-strapi-outbound-monitor.ts';
 git(['ls-files','--error-unmatch',noStrapiMonitor]);
```

Then add `noStrapiMonitor` to the `reviewed` set and to `dependencies`. `snapshotSource` also fails on **untracked** files under `explorers-earth/e2e/replatform` (`Untracked runtime dependency`). So `git add` every new file before running `node --test scripts/replatform-e2e.test.mjs`.

- [ ] **Step 7: Write the Vite config**

`explorers-earth/e2e/replatform/no-strapi.vite.config.ts`. Destinations shared with canonical stay at `origin`, exactly as in `profile.vite.config.ts`. Only Strapi-only destinations are poisoned:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const webPort = Number(process.env.PROFILE_E2E_WEB_PORT);
const apiPort = Number(process.env.PROFILE_E2E_API_PORT);
if (!Number.isInteger(webPort) || !Number.isInteger(apiPort) ||
    webPort < 1024 || apiPort < 1024 || webPort === apiPort ||
    process.env.PROFILE_E2E_LOCAL_AUTHORITY !== 'owned-disposable-pg15') {
  throw new Error('No-Strapi browser fixture requires exact local authority');
}
const origin = `http://127.0.0.1:${webPort}`;
/** Must equal POISON_ORIGIN in no-strapi-monitor.ts. `.invalid` never resolves (RFC 6761). */
const poison = 'https://strapi.poison.invalid';
export default defineConfig({
  envDir: false,
  envPrefix: 'NO_STRAPI_E2E_NEVER_EXPOSE_AMBIENT_',
  define: {
    // Strapi-only destinations: poisoned.
    'import.meta.env.VITE_API_URL': JSON.stringify(`${poison}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${poison}/api`),
    // Shared with canonical (publicProfileGatewayClient.ts:57-61): the real origin, as in profile.vite.config.ts.
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    // Instagram falls back to localhost:5000 (ImageCropper.tsx:117); same-origin reaches canonical's 410 tombstone.
    'import.meta.env.VITE_INSTAGRAM_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('fixture-google-maps-key'),
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [react()],
  resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('../setup/maps-fixture.tsx', import.meta.url)) } },
  server: {
    host: '127.0.0.1', port: webPort, strictPort: true, hmr: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
```

List every `VITE_*` read in `src` and classify each one: Strapi-only (poison it), shared with canonical (use `origin`), or neither (a harmless fixture value):

```bash
grep -rhoE "import\.meta\.env\.VITE_[A-Z_]+" explorers-earth/src | sort | uniq -c
```

- [ ] **Step 8: Write the request monitor**

`explorers-earth/e2e/replatform/no-strapi-monitor.ts`:

```ts
import type { Browser, BrowserContext } from '@playwright/test';
import { isOptionalFontRequest, isOptionalLoaderImage } from './proxy-fixture-authority.mjs';

export const POISON_ORIGIN = 'https://strapi.poison.invalid';
const POISONED_HOSTS = new Set(['strapi.poison.invalid', 'api.localqr.earth', '77.42.95.255', '13.126.235.177']);
/** Strapi's REST, upload and GraphQL surfaces. Verify canonical mounts none of them (Step 9). */
const POISONED_SAME_ORIGIN = [/^\/graphql\/?$/, /^\/api\/strapi(?:\/|$)/, /^\/api\/upload(?:\/|$)/,
  /^\/upload(?:\/|$)/, /^\/uploads\//, /^\/api\/users(?:\/|$)/, /^\/api\/accounts(?:\/|$)/,
  /^\/api\/auth\/local(?:\/|$)/, /^\/api\/connect(?:\/|$)/];
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** Named third-party destinations the app legitimately touches. Every entry says why. */
const STUBS: { name: string; test: (url: URL, resource: string) => boolean }[] = [
  { name: 'google-fonts', test: (url, resource) => isOptionalFontRequest(url.href, resource) },
  { name: 'loader-gif', test: (url, resource) => isOptionalLoaderImage(url.href, resource) },
  // Landing hero country flags (features/LandingPage/components/Hero.tsx:192-193).
  { name: 'flagcdn', test: (url, resource) => url.hostname === 'flagcdn.com' && resource === 'image' },
];

export type Verdict = 'poisoned' | 'local' | 'stub' | 'unknown';
export type Observation = { verdict: Verdict; method: string; url: string; resource: string };

export function classify(raw: string, origin: string, resource = ''): Verdict {
  const url = new URL(raw);
  if (POISONED_HOSTS.has(url.hostname) || url.port === '1337' || /strapi|localqr/i.test(url.hostname)) return 'poisoned';
  if (url.origin === new URL(origin).origin)
    return POISONED_SAME_ORIGIN.some((path) => path.test(url.pathname)) ? 'poisoned' : 'local';
  if (STUBS.some((stub) => stub.test(url, resource))) return 'stub';
  return 'unknown';
}

/** Vite 8's client opens ws://<origin>/?token=… on every page, even with hmr:false (review B, measured). */
function isViteClientSocket(raw: string, origin: string): boolean {
  const url = new URL(raw);
  return url.host === new URL(origin).host && url.pathname === '/' && url.searchParams.has('token');
}

export class Monitor {
  readonly observations: Observation[] = [];
  readonly modules = new Set<string>();
  /** Canonical API paths, with ids and handles normalised, for the API-surface floor. */
  readonly apiPaths = new Set<string>();
  /** Only the nonce this monitor's own self-test issued is exempt. */
  private readonly nonces = new Set<string>();
  issueNonce(nonce: string) { this.nonces.add(nonce); }
  violations(): Observation[] {
    return this.observations.filter((o) => (o.verdict === 'poisoned' || o.verdict === 'unknown')
      && ![...this.nonces].some((nonce) => o.url.includes(`nostrapi-selftest=${nonce}`)));
  }
  selfTest(nonce: string): Observation[] {
    return this.observations.filter((o) => o.url.includes(`nostrapi-selftest=${nonce}`));
  }
}

/** The one factory every context in the spec comes from, so the self-test exercises the real monitor. */
export async function guardedContext(browser: Browser, monitor: Monitor, origin: string,
    viewport: { width: number; height: number }): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: origin, viewport, serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const verdict = classify(request.url(), origin, request.resourceType());
    monitor.observations.push({ verdict, method: request.method(), url: request.url(), resource: request.resourceType() });
    if (verdict === 'local') {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/src/')) monitor.modules.add(path);
      if (!path.startsWith('/api/explorers/')) return route.continue();
      // Count a canonical API path only once it has succeeded, not when it was merely attempted.
      const response = await route.fetch();
      if (response.status() < 400) monitor.apiPaths.add(path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id'));
      return route.fulfill({ response });
    }
    if (verdict === 'stub')
      return request.resourceType() === 'image'
        ? route.fulfill({ status: 200, contentType: 'image/gif', body: GIF })
        : route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (socket) => {
    const url = socket.url();
    const verdict: Verdict = isViteClientSocket(url, origin) ? 'stub'
      : classify(url.replace(/^ws/, 'http'), origin) === 'poisoned' ? 'poisoned' : 'unknown';
    monitor.observations.push({ verdict, method: 'WEBSOCKET', url, resource: 'websocket' });
    socket.close();
  });
  return context;
}
```

**`unknown` is a violation on purpose.** Every third-party origin the app touches must be named in `STUBS`, so a new external call cannot hide among the passes. If the first run reports another one, add a named stub with a comment saying why. Never widen `local`. The API-path normaliser above handles UUIDs only. If handles inflate the count, normalise them as well, and record how.

- [ ] **Step 9: Confirm the poisoned same-origin paths are not canonical routes**

```bash
grep -rnE "['\"\`]/(graphql|upload|uploads|api/upload|api/users|api/accounts|api/auth/local|api/connect|api/strapi)" tunes/server/auth tunes/server/routes tunes/server/application | grep -v __tests__
```

Expected: only tombstone rules in `policies/*` and legacy-only routes (`routes/index.ts`, `seo-routes.ts`), and nothing mounted by `canonicalApp.ts`. If a canonical route matches a pattern, narrow the pattern rather than delete it, and record why.

- [ ] **Step 10: Write the route table — keyed by occurrence**

`explorers-earth/e2e/replatform/no-strapi-routes.ts`. Every occurrence of a `path="…"` literal in a route file is keyed `<file>:<path>#<n>`, where `n` counts that literal's occurrences in that file in source order. Measured at `05a252f6`:
- `ProtectedRoutes.tsx` holds every literal **twice**, once in the desktop tree (`:42-`) and once in the mobile tree (`:100-`). The one exception is `/onboarding`, which appears once (`:159`). So a desktop case claims `#1` and its mobile case claims `#2`.
- `PublicRoutes.tsx` holds `:listSlug` six times, in this order: movies, books, games, apps, products, people. It holds `genre/:genreSlug` twice: movies, then games.

Each parameterised case takes a well-formed id that does not exist, so the page runs its loader and renders its not-found state. That catches Strapi calls made **on load**. It does not catch calls made in **event handlers**, such as the upload fallback in `Profile.tsx:1703-1759,1803-1857` and the edit-mode delete in `AddRecommendation.tsx:770-782`. Those are covered by P6-4's static leak test, and by the one interaction case P6-4 adds to this spec.

```ts
export type Viewport = 'desktop' | 'mobile';
export type RouteCase = {
  /** Occurrence keys this case claims. */
  source: string[];
  url: (handle: string) => string;
  /** 'owner' = onboarded ownerA, 'fresh' = un-onboarded ownerB, 'anon' = signed out. */
  as: 'anon' | 'owner' | 'fresh';
  /** Only this viewport. Owner cases claim the tree the viewport renders. */
  viewport?: Viewport;
  /** Where the page must end up. Defaults to the visited path. */
  lands?: RegExp;
  /** A selector the intended page renders: a heading, landmark or test id. Required for category index and owner editor pages. */
  marker?: string;
};
const ID = '00000000-0000-4000-8000-000000000000';

/** One owner path visited at both viewports: desktop claims tree #1, mobile claims tree #2. */
function owner(path: string, literal: string, lands?: RegExp): RouteCase[] {
  return (['desktop', 'mobile'] as const).map((viewport, index) => ({
    source: [`ProtectedRoutes.tsx:${literal}#${index + 1}`], url: () => path, as: 'owner', viewport, lands }));
}
const pub = (path: string, key: string): RouteCase => ({ source: [`PublicRoutes.tsx:${key}`], url: (h) => `/${h}${path}`, as: 'anon' });
const auth = (path: string): RouteCase => ({ source: [`AuthRoutes.tsx:${path}#1`], url: () => path, as: 'anon' });
const ITEM = { movies: 'movieId', books: 'bookId', games: 'gameId', apps: 'appId', products: 'productId', people: 'personId' } as const;

export const ROUTES: RouteCase[] = [
  ...owner('/profile', 'profile'),
  ...owner('/recommendations', 'recommendations'),
  ...owner('/recommendations/places', 'recommendations/places'),
  ...owner(`/recommendations/places/${ID}/add-people`, 'recommendations/places/:locationId/add-people'),
  ...owner(`/recommendations/places/${ID}/add-products`, 'recommendations/places/:locationId/add-products'),
  ...owner(`/${ID}/new`, ':listId/new'),
  ...owner(`/${ID}/edit`, ':placeId/edit'),
  ...owner('/recommendations/guides', 'recommendations/guides'),
  ...owner('/recommendations/guides/new', 'recommendations/guides/new'),
  ...owner(`/recommendations/guides/${ID}`, 'recommendations/guides/:guideId'),
  ...owner(`/recommendations/guides/${ID}/edit`, 'recommendations/guides/:guideId/edit'),
  ...owner(`/recommendations/guides/${ID}/sections/new`, 'recommendations/guides/:guideId/sections/new'),
  ...owner(`/recommendations/guides/${ID}/sections/${ID}/edit`, 'recommendations/guides/:guideId/sections/:sectionId/edit'),
  ...owner('/guides/new', 'guides/new'),
  ...owner(`/guides/${ID}`, 'guides/:guideId'),
  ...owner(`/guides/${ID}/edit`, 'guides/:guideId/edit'),
  ...owner(`/guides/${ID}/sections/new`, 'guides/:guideId/sections/new'),
  ...owner(`/guides/${ID}/sections/${ID}/edit`, 'guides/:guideId/sections/:sectionId/edit'),
  ...owner('/recommendations/music', 'recommendations/music', /^\/recommendations$/),
  ...owner('/analytics', 'analytics'),
  ...owner('/settings', 'settings'),
  ...owner('/home', 'home'),
  ...owner('/instagram', 'instagram'),
  ...(['movies', 'books', 'games', 'apps', 'products', 'people'] as const).flatMap((c) => [
    ...owner(`/recommendations/${c}`, `recommendations/${c}`),
    ...owner(`/recommendations/${c}/${ID}`, `recommendations/${c}/:listId`),
    ...owner(`/recommendations/${c}/${ID}/add`, `recommendations/${c}/:listId/add`),
    ...owner(`/recommendations/${c}/${ID}/edit/${ID}`, `recommendations/${c}/:listId/edit/:${ITEM[c]}`),
  ]),
  { source: ['ProtectedRoutes.tsx:/onboarding#1'], url: () => '/onboarding', as: 'fresh' },
  { source: ['PublicRoutes.tsx::username/*#1'], url: (h) => `/${h}`, as: 'anon' },
  pub('/places', 'places#1'), pub('/places/no-such-place', ':placeSlug#1'), pub('/places/map', 'map#1'),
  pub('/places/no-such-place/map', ':placeSlug/map#1'), pub('/places/no-such-place/placesmap', ':place/placesmap#1'),
  pub('/guides', 'guides#1'), pub('/guides/no-such-guide', ':guideSlug#1'),
  pub('/movies', 'movies#1'), pub('/movies/genre/drama', 'genre/:genreSlug#1'), pub('/movies/no-such-list', ':listSlug#1'),
  pub('/books', 'books#1'), pub('/books/subject/fiction', 'subject/:subjectSlug#1'), pub('/books/no-such-list', ':listSlug#2'),
  pub('/games', 'games#1'), pub('/games/genre/action', 'genre/:genreSlug#2'), pub('/games/no-such-list', ':listSlug#3'),
  pub('/apps', 'apps#1'), pub('/apps/no-such-list', ':listSlug#4'),
  pub('/products', 'products#1'), pub('/products/no-such-list', ':listSlug#5'),
  pub('/people', 'people#1'), pub('/people/sector/technology', 'sector/:sectorSlug#1'), pub('/people/no-such-list', ':listSlug#6'),
  ...['/', '/login', '/contact', '/about', '/use-cases', '/privacy', '/cookies', '/terms', '/reactivate',
    '/reactivate-confirm', '/google-auth/callback'].map(auth),
  // Three different elements, three cases: NotFound at /404 and at an unmatched top-level path
  // (AppRoutes.tsx:43-46), and UsernameRootRedirect for an unknown tab under a profile (PublicRoutes.tsx:186).
  { source: ['AppRoutes.tsx:/404#1'], url: () => '/404', as: 'anon' },
  { source: ['AppRoutes.tsx:*#1'], url: () => '/no/such/route/at/all', as: 'anon' },
  { source: ['PublicRoutes.tsx:*#1'], url: (h) => `/${h}/no-such-tab`, as: 'anon', lands: /^\/[^/]+\/?$/ },
  // Top-level redirects (AppRoutes.tsx:25-27) visited directly, with the target asserted.
  { source: ['AppRoutes.tsx:/guides#1'], url: () => '/guides', as: 'owner', lands: /^\/recommendations\/guides$/ },
  { source: ['AppRoutes.tsx:/music/*#1'], url: () => '/music', as: 'owner', lands: /^\/recommendations$/ },
  { source: ['AppRoutes.tsx:/hub#1'], url: () => '/hub', as: 'owner', lands: /^\/recommendations$/ },
];

/** Occurrences deliberately not visited, each with the reason. A new occurrence must be claimed here or in ROUTES. */
export const EXCLUDED: Record<string, string> = {
  'ProtectedRoutes.tsx:/*#1': 'desktop layout route; every child is visited',
  'ProtectedRoutes.tsx:/*#2': 'mobile layout route; every child is visited',
  // The same URLs are registered at top level (AppRoutes.tsx:25-27) and inside both protected trees.
  // The top-level cases above visit each URL and assert its target; these occurrences are not separately reachable.
  'ProtectedRoutes.tsx:guides#1': 'shadowed by AppRoutes.tsx:/guides (visited); same target',
  'ProtectedRoutes.tsx:guides#2': 'shadowed by AppRoutes.tsx:/guides (visited); same target',
  'ProtectedRoutes.tsx:hub#1': 'shadowed by AppRoutes.tsx:/hub (visited); same target',
  'ProtectedRoutes.tsx:hub#2': 'shadowed by AppRoutes.tsx:/hub (visited); same target',
  'ProtectedRoutes.tsx:music#1': 'shadowed by AppRoutes.tsx:/music/* (visited); same target',
  'ProtectedRoutes.tsx:music#2': 'shadowed by AppRoutes.tsx:/music/* (visited); same target',
  'AuthRoutes.tsx:/email-verification#1': 'Navigate to /login (AuthRoutes.tsx:27), which is visited',
  'AuthRoutes.tsx:/register#1': 'Navigate to /login (AuthRoutes.tsx:20-28), which is visited',
  'AuthRoutes.tsx:/forgot-password#1': 'Navigate to /login',
  'AuthRoutes.tsx:/reset-password#1': 'Navigate to /login',
  'AuthRoutes.tsx:/reset-link-sent#1': 'Navigate to /login',
  'AuthRoutes.tsx:/email-confirmed#1': 'Navigate to /login',
};
```

`/guides`, `/hub` and `/music` are registered both at top level (`AppRoutes.tsx:25-27`) and in both protected trees (`ProtectedRoutes.tsx:55,61-62` and `:113,119-120`). Each URL is visited once, through its `AppRoutes` occurrence, and its `lands` asserts the redirect target. The protected-tree occurrences are excluded as shadowed: listing a key is not proof that its element ran, so a key is claimed only by the case that reaches it. `recommendations/music` exists only in the protected trees (`:52,110`), so it is visited there.

**Index routes** (`<Route index …>`, nine of them in `PublicRoutes.tsx:39-170`) carry no `path` literal, so the occurrence scan cannot see them. They are reached through the category index URLs (`/<handle>/movies` and the rest), which the table visits. If a `path={…}` expression or a new route file appears, the scan's vacuity floor will not catch it. Extend the scan in that case. `/instagram` renders `<Instagram />` (`:67,125`), so it is visited too. When P5-8 deletes the Instagram surface, the literal goes, and the inventory test forces this case out with it.

Re-derive the occurrence keys before running, and diff them against the table:

```bash
cd explorers-earth && node -e "const fs=require('fs');for(const f of fs.readdirSync('src/routes').filter(n=>n.endsWith('.tsx'))){const n={};for(const m of fs.readFileSync('src/routes/'+f,'utf8').matchAll(/path=\"([^\"]*)\"/g)){n[m[1]]=(n[m[1]]||0)+1;console.log(f+':'+m[1]+'#'+n[m[1]])}}" | sort
```

Do not take the redirect claims in `EXCLUDED` on trust. Open each element and check what it renders. Move anything that renders data into `ROUTES`.

- [ ] **Step 11: Write the spec**

`explorers-earth/e2e/replatform/no-strapi.spec.ts`. It reads the fixture **lazily**, so `--list` works without the runner:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { assertFixtureOrigin } from './proxy-fixture-authority.mjs';
import { Monitor, POISON_ORIGIN, guardedContext } from './no-strapi-monitor';
import { ROUTES, EXCLUDED, type RouteCase } from './no-strapi-routes';

type Persona = { userId: string; cookie: string; handle: string };
type Fixture = { origin: string; personas: Record<'ownerA' | 'ownerB' | 'ownerC', Persona> };
let cached: Fixture | undefined;
/** Read on first use, not at import, so `playwright test --list` can enumerate cases without the runner. */
function fixture(): Fixture {
  if (cached) return cached;
  const path = process.env.PROFILE_E2E_FIXTURE_PATH;
  if (!path) throw new Error('No-Strapi E2E requires the owned loopback fixture runner');
  const loaded = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
  assertFixtureOrigin(loaded);
  return (cached = loaded);
}

/** Measured on first green run, then fixed here. Lower them only with a written reason. */
const MODULE_FLOOR = 500; // review B measured 573 distinct /src/ modules per page at 05a252f6
const API_FLOOR = 15;     // set to 90% of the first green run's RUN.apiPaths.size
const VIEWPORT = { desktop: { width: 1365, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const CASES = ROUTES.flatMap((route) => (route.viewport ? [route.viewport] : (['desktop', 'mobile'] as const))
  .map((viewport) => ({ route, viewport })));
/** A fixed number, not CASES.length: moving a case into EXCLUDED must trip this, not silently lower it. Set from the first green run. */
const ROUTE_FLOOR = 150;

const RUN = new Monitor();
const executed = new Set<string>();
/**
 * The two states a broken owner page ends on without changing its URL (ProtectedRoute.tsx:18-24):
 * EarthLoader renders role="status" aria-label="Earth loading" (EarthLoader.tsx:103-104), and
 * OnboardingCheckError renders the heading "Couldn't load your account" (OnboardingCheckError.tsx:24-26).
 * A hidden category does not need one: TabVisibilityGuard redirects to the username root
 * (TabVisibilityGuard.tsx:60,81), which the landing assertion catches.
 */
const BROKEN_STATE = `[role="status"][aria-label="Earth loading"], h1:has-text("Couldn't load your account")`;

async function signIn(context: BrowserContext, persona: Persona) {
  // The session cookie is the whole sign-in. The persisted auth store discards anything put in
  // localStorage (store.ts:143-146: partialize to {}, merge keeps current), so no init script is needed.
  const separator = persona.cookie.indexOf('=');
  await context.addCookies([{ name: persona.cookie.slice(0, separator), value: persona.cookie.slice(separator + 1),
    url: fixture().origin, sameSite: 'Lax' }]);
}

function routeOccurrences(): Set<string> {
  const directory = resolve(process.cwd(), 'src/routes');
  const found = new Set<string>();
  for (const file of readdirSync(directory).filter((name) => /\.tsx$/.test(name))) {
    const counts = new Map<string, number>();
    for (const match of readFileSync(resolve(directory, file), 'utf8').matchAll(/path="([^"]*)"/g)) {
      const n = (counts.get(match[1]) ?? 0) + 1;
      counts.set(match[1], n);
      found.add(`${file}:${match[1]}#${n}`);
    }
  }
  return found;
}

function landedOk(page: Page, route: RouteCase, visited: string): string | null {
  const landed = new URL(page.url()).pathname;
  if (route.as === 'owner' && /^\/(login|onboarding)(\/|$)/.test(landed)) return `owner case bounced to ${landed}`;
  const expected = route.lands ?? new RegExp(`^${visited.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return expected.test(landed) ? null : `landed on ${landed}, expected ${expected}`;
}

test('route table claims every route-literal occurrence exactly once, and nothing stale', () => {
  const occurrences = routeOccurrences();
  // VACUITY GUARD: an empty scan (wrong cwd, moved directory) must fail, not pass.
  expect(occurrences.size, 'route literal scan found nothing').toBeGreaterThan(80);
  const claims = [...ROUTES.flatMap((route) => route.source), ...Object.keys(EXCLUDED)];
  expect(claims.filter((claim, index) => claims.indexOf(claim) !== index), 'occurrence claimed twice').toEqual([]);
  expect([...occurrences].filter((key) => !claims.includes(key)), 'route occurrence with no case').toEqual([]);
  expect(claims.filter((claim) => !occurrences.has(claim)), 'stale claim').toEqual([]);
});

test('monitor self-test: every channel to Strapi is seen and refused, and canonical is allowed', async ({ browser }) => {
  const monitor = new Monitor();
  const context = await guardedContext(browser, monitor, fixture().origin, VIEWPORT.desktop);
  try {
    const page = await context.newPage();
    await page.goto('/about');
    const nonce = randomUUID();
    monitor.issueNonce(nonce);
    const outcome = await page.evaluate(async ({ nonce, poison }) => {
      const q = `nostrapi-selftest=${nonce}`;
      const settle = (promise: Promise<unknown>) => promise.then(() => 'reached', () => 'refused');
      const timeout = <T,>(promise: Promise<T>, label: T) => Promise.race([promise, new Promise<T>((done) => setTimeout(() => done(label), 5000))]);
      const image = new Promise<string>((done) => { const i = new Image(); i.onload = () => done('reached'); i.onerror = () => done('refused'); i.src = `http://localhost:1337/uploads/self-test.png?${q}`; });
      // A socket closed by routeWebSocket without connecting fires only onclose (review B, measured).
      const socket = new Promise<string>((done) => { let opened = false; const s = new WebSocket(`ws://localhost:1337/self-test?${q}`);
        s.onopen = () => { opened = true; }; s.onerror = () => done('refused'); s.onclose = () => done(opened ? 'reached' : 'refused'); });
      const worker = new Promise<string>((done) => {
        const source = `fetch(${JSON.stringify(`${poison}/worker?${q}`)}).then(()=>postMessage('reached'),()=>postMessage('refused'))`;
        new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))).onmessage = (event) => done(String(event.data));
      });
      navigator.sendBeacon(`${poison}/beacon?${q}`, 'x');
      return {
        poisonGraphql: await settle(fetch(`${poison}/graphql?${q}`, { method: 'POST', body: '{}' })),
        sameOriginGraphql: await settle(fetch(`/graphql?${q}`, { method: 'POST', body: '{}' })),
        productionStrapi: await settle(fetch(`https://api.localqr.earth/api/users/me?${q}`)),
        image: await timeout(image, 'timeout'), socket: await timeout(socket, 'timeout'), worker: await timeout(worker, 'timeout'),
        canonical: (await fetch('/api/explorers/v1/me')).status,
      };
    }, { nonce, poison: POISON_ORIGIN });
    expect(outcome).toMatchObject({ poisonGraphql: 'refused', sameOriginGraphql: 'refused', productionStrapi: 'refused',
      image: 'refused', socket: 'refused', worker: 'refused' });
    // Negative control: an unauthenticated canonical call answers through the monitor (401, canonicalApp.ts:141).
    expect(outcome.canonical).toBe(401);
    expect(monitor.observations.some((o) => o.verdict === 'local' && o.url.endsWith('/api/explorers/v1/me'))).toBe(true);
    const expected = [`${POISON_ORIGIN}/graphql`, `${fixture().origin}/graphql`, 'https://api.localqr.earth/api/users/me',
      'http://localhost:1337/uploads/self-test.png', 'ws://localhost:1337/self-test', `${POISON_ORIGIN}/worker`, `${POISON_ORIGIN}/beacon`];
    await expect.poll(() => expected.filter((target) => !monitor.selfTest(nonce)
      .some((o) => o.verdict === 'poisoned' && o.url.startsWith(target)))).toEqual([]);
    expect(monitor.violations(), 'loading /about itself reached Strapi or an unclassified origin').toEqual([]);
  } finally {
    await context.close();
  }
});

for (const { route, viewport } of CASES) {
  const title = `${viewport} ${route.source.join(' + ')} makes no Strapi request`;
  test(title, async ({ browser }) => {
    const { origin, personas } = fixture();
    const context = await guardedContext(browser, RUN, origin, VIEWPORT[viewport]);
    try {
      if (route.as === 'owner') await signIn(context, personas.ownerA);
      if (route.as === 'fresh') await signIn(context, personas.ownerB);
      const page = await context.newPage();
      const me = route.as === 'anon' ? undefined
        : page.waitForResponse((r) => new URL(r.url()).pathname === '/api/explorers/v1/me' && r.status() === 200, { timeout: 20_000 });
      const before = RUN.violations().length;
      const visited = route.url(personas.ownerA.handle);
      await page.goto(visited);
      if (me) await me; // the owner was really admitted, not bounced before any read
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(RUN.violations().slice(before)).toEqual([]);
      expect(landedOk(page, route, visited)).toBeNull();
      // Same-path failure states: ProtectedRoute renders a loader or an error without navigating (ProtectedRoute.tsx:18-24),
      // A hidden category redirects instead, and landedOk catches that. None may be what the case ends on.
      await expect(page.locator(BROKEN_STATE)).toHaveCount(0);
      if (route.marker) await expect(page.locator(route.marker).first()).toBeVisible();
      executed.add(title);
    } finally {
      await context.close();
    }
  });
}

test.afterAll(() => {
  // A failure restarts the Playwright worker, so after one this can also report partial floors. Fix the first failure first.
  expect(RUN.violations(), 'Strapi or unclassified requests').toEqual([]);
  expect(executed.size, 'route-coverage floor').toBeGreaterThanOrEqual(ROUTE_FLOOR);
  expect(RUN.modules.size, 'closure-size floor (boot)').toBeGreaterThanOrEqual(MODULE_FLOOR);
  expect(RUN.apiPaths.size, 'API-surface floor').toBeGreaterThanOrEqual(API_FLOOR);
});
```

Notes for the engineer:
- **Tests built in a loop are invisible to a line-anchored grep for `test(`.** Count them instead: `npx playwright test e2e/replatform/no-strapi.spec.ts --list` (no fixture needed, because the fixture is read lazily). Expect `2 + CASES.length`.
- **The first run sets two floors.** Some `:id` pages may redirect when the id does not exist. Record where each lands, then give it an explicit `lands` with a comment. Never use a catch-all `lands: /.*/`. Set `API_FLOOR` to 90% of `RUN.apiPaths.size` from the first green run, rounded down, and write the measured number next to it. Set `ROUTE_FLOOR` to the first green run's executed count, and give each category index case and each owner editor case a `marker`.
- **`serviceWorkers: 'block'` exists, and it is needed.** Without it, a service worker's own fetches bypass `context.route`. Review B confirmed that Worker fetches, `sendBeacon` (resource type `ping`), `<img>` and `abort('blockedbyclient')` are all intercepted in Playwright 1.61.1.

- [ ] **Step 12: Type-check the e2e files**

`tsconfig.app.json` includes only `src` (`:27`), and Playwright strips types without checking them. Create `explorers-earth/e2e/replatform/tsconfig.no-strapi.json`:

```json
{
  "extends": "../../tsconfig.app.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["no-strapi*.ts", "proxy-fixture-authority.d.mts"]
}
```

Run: `cd explorers-earth && npx tsc -p e2e/replatform/tsconfig.no-strapi.json`
Expected: no output. If `tsconfig.app.json`'s `include` or `paths` fight with this one, set what is needed explicitly instead of extending.

- [ ] **Step 13: Run it**

From the repository root, with Docker running:

```bash
docker pull postgres:15-alpine
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

The environment must not contain any of the following (`lifecycle-browser-guards.ts:30-33`):
- `DATABASE_URL*`;
- `DOCKER_HOST` or `DOCKER_CONTEXT`;
- `NODE_ENV=production`;
- any `REPLATFORM_E2E_*` or `PROFILE_E2E_SUITE` variable.

Expected: every test passes, and the runner prints `{"noStrapiServer":{"observed":…,"strapi":0}}`.

**If a case fails with a real Strapi request, that is a finding, not a flake.**
- Record the URL and the route.
- Do not widen the monitor.
- If the call is one of the four in P6-4, take P6-4 next.

- [ ] **Step 14: Prove it has teeth — four deliberate breaks, each reverted**

Each break must turn the run red and name its cause. Make the change, run Step 13, see red, then revert. Commit none of them.

1. **Browser monitor.** Add `void fetch('/graphql', { method: 'POST', body: '{}' });` as the first line of `src/main.tsx`. Every case should fail on a poisoned `/graphql`.
2. **Self-test.** In `no-strapi-monitor.ts`, make the route handler `return route.continue()` for every verdict. The self-test should fail.
3. **Owner proof.** In `signIn`, use `personas.ownerC.cookie.replace(/.$/, 'x')`, a corrupted session. Every owner case should fail on the `/me` 200 wait or on the bounce check, not pass on a `/login` page.
4. **Server monitor.** At the top of the canonical `readAccountEvents` in `explorersCanonicalAnalyticsRoutes.ts`, add `await fetch(`${process.env.STRAPI_URL}/graphql`, { method: 'POST' }).catch(() => undefined);`, a reintroduced Strapi call. Step 6d's probe should then make the runner exit non-zero, with `NO_STRAPI_SERVER_VIOLATION` naming `strapi.poison.invalid` in the report. Do **not** use the pre-P5-1 `historical()` path for this check. Its ownership check returns `false` without a `Bearer` header (`explorers-analytics-adapters.ts:511`), so a cookie-only probe gets a 403 and makes no Strapi request at all.

- [ ] **Step 15: Add the nightly lane**

In `.github/workflows/frontend-e2e-qualification.yml`, add this to the `replatform-real-stack` matrix after `:118`:

```yaml
          - { lane: no-strapi, command: "npm run explorers:test:no-strapi-browser --" }
```

The job appends `--ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`, and review B confirmed the arguments parse.

This lane is nightly and **not required**. Making it required is P7's call (Open question 5). Until then, every P6 ticket's verification runs it locally (Step 13).

- [ ] **Step 16: Run the source-inventory test, typecheck, commit**

```bash
git add explorers-earth/e2e/replatform/no-strapi*.ts explorers-earth/e2e/replatform/tsconfig.no-strapi.json \
  tunes/scripts/no-strapi-outbound-monitor.ts tunes/server/test/contracts/no-strapi-outbound-monitor.test.ts \
  tunes/scripts/lifecycle-browser-guards.ts tunes/scripts/profile-browser-fixture.ts tunes/package.json \
  scripts/replatform-e2e.mjs .github/workflows/frontend-e2e-qualification.yml
node --test scripts/replatform-e2e.test.mjs
cd explorers-earth && npx tsc -p e2e/replatform/tsconfig.no-strapi.json && cd ..
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server|scripts)/' ; cd ..
git commit -m "test(e2e): add the no-Strapi browser guard with a poisoned origin and a monitor self-test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`replatform-e2e.test.mjs` holds frozen-source seals. This ticket edits none of the sealed helpers. If a seal fails anyway, an edit strayed: revert that edit. Never regenerate the frozen constant.

---

## P6-2: Retire the historical analytics read

This is the last path in canonical that can reach Strapi. **Gate: P5-1 merged.** **Must precede P3-7.**

**What P5-1 does, and what is left.** P5-1 does **not** move the dashboard off `GET /api/explorers/analytics/events`. It is commit `9e73fb75` on `claude/p5-user-visible-defects`, read for this revision. It keeps the route and serves it from canonical storage:
- `createCanonicalAnalyticsDependencies(pool, auth?)` authorises with `requireActor` plus `analytics:read`, and reads with `AnalyticsService.readOwnerEvents`.
- The SPA still issues the GET (`explorersAnalyticsClient.ts`), now riding the session cookie.

Only the **`!auth` branch** still loads the Strapi composition, through `historical()` and its dynamic `import()`. That branch serves the legacy runtime, which has no Better Auth instance. So this ticket:
- **keeps** the GET route, `readAccountEvents`, `authorizeOwner` and `readScopeSchema`;
- makes `auth` **required**;
- deletes the `!auth` branch and everything only it reaches;
- gives legacy an ingest-only dependency set whose owner read is refused.

- [ ] **Step 1: Check the gate, and read the file you are about to change**

```bash
git log --oneline -1 --grep "P5-1" fork/main
grep -n "auth?: ExplorersAuth\|historical\|import(" tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts
grep -rn "createCanonicalAnalyticsDependencies\|createExplorersAnalyticsDependencies\|createLegacyExplorersAnalyticsDependencies" tunes --include=*.ts | grep -v node_modules
```

What the output tells you:
- **The first command prints nothing:** P5-1 is not on `main`. Stop.
- **The second shows `auth?: ExplorersAuth` and `historical`:** this ticket applies as written.
- **The second shows neither:** someone already removed the branch. Skip to Step 5 and delete only what is orphaned.
- **The third:** its callers are the canonical setup (`setupCanonicalAnalyticsRoutes`), the composition (`composition.ts:60-61`) and the legacy `routes/index.ts:46,191`. Any other caller must be handled in this ticket.

- [ ] **Step 2: Write the failing test**

`tunes/server/test/contracts/canonical-analytics-no-strapi.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIngestOnlyAnalyticsDependencies } from '../../routes/explorersCanonicalAnalyticsRoutes';

const server = resolve(__dirname, '../..');

describe('analytics has no Strapi path', () => {
  afterEach(() => vi.restoreAllMocks());

  it('canonical no longer loads the legacy analytics composition', () => {
    expect(readFileSync(resolve(server, 'routes/explorersCanonicalAnalyticsRoutes.ts'), 'utf8')).not.toMatch(/import\s*\(/);
    expect(existsSync(resolve(server, 'services/explorers-analytics-composition.ts'))).toBe(false);
  });

  it('the legacy runtime refuses the owner read without calling anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const dependencies = createIngestOnlyAnalyticsDependencies({} as never);
    await expect(dependencies.authorizeOwner({ headers: { authorization: 'Bearer anything' } } as never, 'account-1')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

The canonical owner read itself stays covered by P5-1's integration test, `server/test/explorers-analytics-owner-read.integration.test.ts`. Find its real path with `git show --stat 9e73fb75`. That test reads an owner's events through the canonical app with a session cookie, and gets 403 for a foreign or anonymous caller. Step 8 runs it.

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test --prefix tunes -- --run server/test/contracts/canonical-analytics-no-strapi.test.ts`
Expected: FAIL. `createIngestOnlyAnalyticsDependencies` is not exported, and the source still contains `import(`.

- [ ] **Step 4: Make `auth` required and remove the historical branch**

In `tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts` (the post-P5-1 version):
- Factor the existing `ingest` lambda into a helper. Copy it verbatim from the file; do not retype it.
- Make `auth` required, and delete `legacy`, `historical` and both `if (!auth) …` lines.
- Update the doc comment.
- Add the ingest-only set for legacy.

The shape:

```ts
function canonicalIngest(service: AnalyticsService): ExplorersAnalyticsRouteDependencies['service']['ingest'] {
    return /* the existing ingest lambda, verbatim from createCanonicalAnalyticsDependencies */;
}
/** The canonical runtime: owner reads are authorised by the canonical session and served from analytics_events (P5-1). */
export function createCanonicalAnalyticsDependencies(pool: Pool, auth: ExplorersAuth): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    const owners = new WeakMap<object, Actor>();
    return {
        service: { ingest: canonicalIngest(service), readAccountEvents: async (scope, request) => {
                const actor = request ? owners.get(request) : undefined;
                if (!actor) throw new AuthorizationError(403, 'FORBIDDEN', 'Analytics owner was not authorised');
                return service.readOwnerEvents(actor, scope);
            } },
        authorizeOwner: /* the existing canonical authorizeOwner body, minus its `if (!auth)` line */,
        validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key),
    };
}
/**
 * The legacy composition only, which P3-7 deletes. It has no Better Auth instance, so it cannot
 * authorise an owner, and the owner read is refused (403) rather than delegated to Strapi.
 */
export function createIngestOnlyAnalyticsDependencies(pool: Pool): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    return { service: { ingest: canonicalIngest(service), readAccountEvents: async () => [] }, authorizeOwner: async () => false,
        validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key) };
}
```

In `tunes/server/routes/index.ts`:
- Replace the composition import (`:46`) with `import { createIngestOnlyAnalyticsDependencies } from "./explorersCanonicalAnalyticsRoutes";`.
- Change its use (`:191`) to `setupExplorersAnalyticsRoutes(app, createIngestOnlyAnalyticsDependencies(pool))`.
- If the file does not already import `pool`, import it from `../db`.

The behaviour change is confined to `legacy-music` mode, which nothing deploys from `main` (decision 2). There, the owner GET goes from "a Strapi read" to 403. P3-7 then deletes the mode.

In `tunes/server/routes/explorersAnalyticsRoutes.ts:7`, remove the unused `type ExplorersAnalyticsService` import.

- [ ] **Step 5: Delete the composition and the Strapi analytics code — same commit**

```bash
git rm tunes/server/services/explorers-analytics-composition.ts \
  tunes/server/services/explorers-analytics-receipts.ts \
  tunes/server/services/__tests__/explorers-analytics-composition.test.ts \
  tunes/server/services/__tests__/explorers-analytics-receipts.test.ts
```

Make two further edits in the same commit:

- **`explorers-analytics-adapters.ts`.** Keep lines `1-45` only: the `geoip` import, `isPrivateOrLocalIp` and `resolveCountryFromIp`. Delete the type and value imports from `./explorers-analytics-service` that become unused. Delete `CREATE_EVENT`, `READ_EVENTS`, `FIND_EVENT_BY_ID`, the target descriptors, `StrapiAnalyticsTargetValidator` (`:289`), `StrapiAnalyticsPublisher` (`:387`) and `verifyAnalyticsAccountOwnership` (`:500`). In `__tests__/explorers-analytics-adapters.test.ts`, keep the imports and the first `resolveCountryFromIp` case (`:2-11`) and the `describe("resolveCountryFromIp")` block (`:520-`); delete the rest.

- **`explorers-analytics-service.ts`.** Delete the publisher-era code nothing imports any more. Check each candidate, excluding the files this ticket deletes:

  ```bash
  for s in ExplorersAnalyticsService AnalyticsPublisher AnalyticsReceipt AnalyticsReceiptRepository AnalyticsPublishDispatchError NormalizedExplorersAnalyticsEvent; do echo "== $s"; grep -rnw "$s" tunes --include=*.ts | grep -v node_modules | grep -v -E "services/explorers-analytics-(service|composition|receipts|adapters)\.ts|__tests__/explorers-analytics-(service|composition|receipts|adapters)\.test\.ts"; done
  ```

  Keep `explorersAnalyticsInputSchema`, `ExplorersAnalyticsInput` and `IdempotencyConflictError`; canonical imports them (`application/analytics.ts:4`, `repositories/explorersAnalyticsEventRepository.ts:6`, `scripts/apps-canonical-admission.ts:10`). **`services/__tests__/explorers-analytics-service.test.ts` tests `ExplorersAnalyticsService` and the publisher.** Trim it to the schema and `IdempotencyConflictError` cases, or delete it if nothing else is left.

**Leave the receipts table alone.** Legacy `config/music-startup.ts:125` verifies its schema through `startup/explorers-analytics-migration.ts`, a separate module, so deleting `explorers-analytics-receipts.ts` does not break legacy boot. The table goes in P6-10.

- [ ] **Step 6: Trim the ratchet's allowlists — same commit**

`scripts/check-retired-dependencies.mjs` fails on stale entries (`:250-269`). Measured against `05a252f6` with the composition edge removed (review A), the closure drops from 155 to 150 modules: `db.ts`, `config/music-local-profile.ts`, `config/music-owned-browser-profile.ts`, the composition and the receipts module. Exactly four entries go stale:
- `ENV_READ_ALLOWLIST`: the `explorers-analytics-composition.ts` / `STRAPI_URL` entry;
- `ENV_READ_ALLOWLIST`: the `config/music-local-profile.ts` / `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE` entry (`:39-61` holds the env list);
- `CLIENT_ALLOWLIST`: both entries (`:90-104`).

Delete those four, and leave `security-containment.ts` / `STRAPI_JWT_SECRET` for P6-3. Then:

Run: `node scripts/check-retired-dependencies.mjs`
Expected: `OK`, with the closure count lower than before. Write both numbers in the commit message. If the count rises, a dynamic edge was missed.

`shared/schema.ts` is **not** in the scanner's closure at all. It is reached only through `db.ts`'s `@shared/schema` alias import, and the scanner follows relative specifiers only. Its membership of the canonical type graph is a `tsc` fact, and that is what decision 3 relies on.

- [ ] **Step 7: Update the tests that pinned the old shape**

Run first, then fix only what fails:

```bash
npm test --prefix tunes -- --run server/routes/__tests__/explorersAnalyticsRoutes.test.ts \
  server/services/__tests__ server/test/contracts/api-only-early-cleanup.test.ts \
  server/test/music-surface-policy.test.ts server/test/music-startup-bootstrap.test.ts \
  server/test/contracts/music-openapi-contract.test.ts server/test/contracts/music-authorization-matrix.test.ts \
  server/test/contracts/runtime-surface-inventory.test.ts server/test/contracts/platform-route-signatures.test.ts
```

The route, its OpenAPI entry, the authorization matrix, the inventory and the route-parity probe (a GET at `scripts/replatform-route-parity.ts:52-55`) all stay valid, **because the route stays**. Expect failures only where a test constructs `createCanonicalAnalyticsDependencies(pool)` without `auth`, or imports a deleted module. Fix each by passing a test `auth`, or by switching to `createIngestOnlyAnalyticsDependencies`. If a generated artifact the tests compare against mentions the composition, regenerate it with the generator its failure message names. Never hand-edit it.

- [ ] **Step 8: Verify, including a real canonical boot**

Integration tests inject a pool and skip startup attestation, so on their own they cannot see a boot failure (`canonicalStartup.ts:52-56`). Neither can the no-Strapi run: its runner hands `createCanonicalApp` a migrator-owned pool (`profile-browser-fixture.ts:124-142`). The boot evidence is `startCanonicalServer` called **without** an injected pool. Two existing tests call it: `server/test/deployment/canonical-startup-listener.test.ts` and `server/test/explorers-auth.integration.test.ts`. Read both:
- If one boots with no injected pool and provisioned runtime credentials, run it here.
- If neither does, add that case to `canonical-startup-listener.test.ts`, and reuse it in P6-10 Step 7.

Run all of these:

```bash
npm test --prefix tunes -- --run server/test/contracts/canonical-analytics-no-strapi.test.ts
npm test --prefix tunes -- --run
npm test --prefix tunes -- --run --config vitest.integration.config.ts <P5-1's owner-read integration test path>
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/' ; cd ..
node scripts/check-retired-dependencies.mjs
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

Integration tests need the exact CI PostgreSQL URL and the `MUSIC_C3`–`MUSIC_C9` flags (`tunes.yml:120-126`). The no-Strapi run covers `/analytics` as an owner, so it exercises the canonical owner read end to end with the poisoned `STRAPI_*` env set.

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(analytics): remove the historical Strapi owner read; auth is required in canonical

Canonical closure: <before> -> <after> modules (check-retired-dependencies.mjs).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then tell the orchestrator that **P3-7 is unblocked on the `shared/schema.ts` point** (decision 3).

---

## P6-3: Take `security-containment` out of canonical; make the ratchet absolute and widen it

After P6-2, the ratchet still allows one site: `security-containment.ts` / `STRAPI_JWT_SECRET`. That module is in canonical only because `middleware/explorersPrincipal.ts:7` imports `requestIdFor`.

The ratchet also watches the wrong amount of code, in two ways:
- **It walks only `canonicalStartup.ts`** (`check-retired-dependencies.mjs:33`). The production `migrate` service runs `deployment/run-migration-gate.ts`, which imports `deploymentImageFromEnvironment` from `deployment/music-health.ts` (`run-migration-gate.ts:7`). That module also reads `STRAPI_ACCESS_TOKEN`, `STRAPI_JWT_SECRET` and `STRAPI_URL` (`:57-60`) inside `setupMusicHealthRoutes`, the legacy readiness route.
- **It resolves relative specifiers only** (`resolveImport`, `:108-121`), so every `@shared/*` alias import is silently dropped.

**Files:**
- Create: `tunes/server/http/requestId.ts`
- Create: `tunes/server/deployment/deploymentImage.ts`
- Modify: `tunes/server/security-containment.ts:15-22`
- Modify: `tunes/server/middleware/explorersPrincipal.ts:7`
- Modify: `tunes/server/deployment/music-health.ts:15-33`
- Modify: `tunes/server/deployment/run-migration-gate.ts:7`
- Modify: `scripts/check-retired-dependencies.mjs`
- Test: `scripts/check-retired-dependencies.test.mjs` (create if absent). Root `scripts/*.test.mjs` run in the required `test.yml:122`.

- [ ] **Step 1: Write the failing ratchet test**

The report shape is real: `--json` exists (`:24`, `:283`), and the report fields are listed at `:273-281`. They are `canonicalModuleCount`, `allowlistedEnvReads`, `allowlistedModules`, `allowlistedClientConstructions` (each an allowlist **length**), `violations` and `ok`. This step adds `entries` and `minimumModules`.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function scan() {
  // spawnSync, not execFileSync: a failing scan exits 1, and the report is what we want to read.
  const run = spawnSync(process.execPath, ['scripts/check-retired-dependencies.mjs', '--json'], { encoding: 'utf8' });
  assert.ok(run.stdout, `scanner printed nothing (exit ${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout);
}

test('every production entry point is Strapi-free, with no allowlist', () => {
  const report = scan();
  assert.deepEqual(report.violations, []);
  assert.equal(report.allowlistedEnvReads + report.allowlistedModules + report.allowlistedClientConstructions, 0,
    'an allowlisted Strapi site remains');
  assert.ok(report.entries.includes('tunes/server/deployment/run-migration-gate.ts'), 'the migrate service is not scanned');
});

test('the closure is big enough to mean something', () => {
  const report = scan();
  // VACUITY GUARD: a mis-resolved entry point yields a tiny closure that trivially contains no Strapi.
  assert.ok(report.canonicalModuleCount >= report.minimumModules, `closure shrank to ${report.canonicalModuleCount}`);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test scripts/check-retired-dependencies.test.mjs`
Expected: FAIL. `allowlistedEnvReads` is 1, and `report.entries` is undefined.

- [ ] **Step 3: Move `requestIdFor` — keeping a local binding**

Read `security-containment.ts:15-22` and move the function **verbatim** to `tunes/server/http/requestId.ts`, along with the imports and the type it uses (`containmentRequestId`).

`security-containment.ts` itself still calls `requestIdFor`, at `:148`, `:204` and `:353`. A bare `export { requestIdFor } from "./http/requestId";` creates **no local binding**: review A ran it and got TS2552 three times, and legacy would throw a `ReferenceError` per request. Use an import plus a re-export:

```ts
import { requestIdFor } from "./http/requestId";
export { requestIdFor };
```

Then point `middleware/explorersPrincipal.ts:7` at `../http/requestId`. `explorersPrincipal.ts` is the only canonical importer; the others (`app.ts`, `auth.ts`, `routes/index.ts`, `routes/musicSurfaceRoutes.ts`) are legacy and keep working through the re-export.

Review A measured the effect at `05a252f6`: `security-containment.ts`, `shared/musicError.ts` and `registration-route-contract.ts` leave the closure, and `http/requestId.ts` joins it.

**`shared/musicError.ts` leaving is a fact P3 relies on the other way round.** The P3 plan's "never delete" table cites `security-containment.ts:6` as `musicError`'s canonical path. Tell the orchestrator before P3-7 recomputes its deletable set.

- [ ] **Step 4: Take `music-health.ts` out of the migration gate's closure**

Move `deploymentImageFromEnvironment` (`music-health.ts:15-33`, with `ImageCandidate` and whatever it imports) **verbatim** to `tunes/server/deployment/deploymentImage.ts`. In `music-health.ts`, add `import { deploymentImageFromEnvironment } from "./deploymentImage"; export { deploymentImageFromEnvironment };`, then check whether `music-health.ts` itself calls it. Point `run-migration-gate.ts:7` at `./deploymentImage`. The legacy health route keeps its Strapi readiness inputs; P3-7 deletes it.

- [ ] **Step 5: Widen the scanner and make it absolute**

In `scripts/check-retired-dependencies.mjs`:

1. **Scan every production entry point.** Replace `canonicalEntry` with a list, and walk the union of their closures:

   ```js
   /** Every entry point a production container runs (tunes/package.json build:api, deploy/production.compose.yml). */
   const PRODUCTION_ENTRIES = [
     "server/auth/canonicalStartup.ts",
     "server/deployment/run-migration-gate.ts",
     "scripts/apply-reviewed-taxonomy.ts",
   ].map((path) => join(tunesRoot, path));
   ```

   **`build:api`** (`tunes/package.json:19`) also bundles three more entry points. **Leave them out until P3-7 has dealt with them:**
   - `server/api.ts` reaches the whole legacy composition until P3-7 collapses `apiMode`.
   - `run-registration-compat.ts` is Music-only, and P3-7 deletes it.
   - `run-production-graph-smoke.ts` imports `server/app.ts`.

   P6-12 adds whichever of them survive. Report the list as `entries` (repo-relative) in the JSON report.

2. **Resolve the `@shared/*` alias, in both places.**
   - **The walk.** `walkClosure` drops every non-relative specifier with `if (!specifier.startsWith(".")) continue;` (`:167`) **before** it reaches `resolveImport` (`:108-121`), so changing the resolver alone changes nothing. Let `@shared/` specifiers through.
   - **The resolver.** Map `@shared/x` to `tunes/shared/x`, using the same candidate list as relative specifiers. An `@shared/` specifier that resolves to nothing becomes a `closure-incomplete` violation rather than `null`.
   - **Other edges.** Add `require("…")` edges to the specifier extraction (`:161-165`). Check `#auth-runtime` (`canonicalApp.ts:14`, `explorersPrincipal.ts:1`): it is a `package.json` `imports` alias for a local package. Either walk it, or record in the script why it is out of scope.
   - **Other packages.** Ordinary package imports stay ignored.

3. **Empty the last allowlist entry.** All three allowlists become `[]`. Keep the arrays and the stale-entry logic, so a re-added entry is still checked.

4. **Add a floor.** Add `const MINIMUM_MODULES = <90% of the measured union count, rounded down>;`. Fail with invariant `closure-floor` when the union is smaller. Report it as `minimumModules`.

5. **Widen the env detector, and stop it deleting code.**
   - **The detector.** `ENV_READ` (`:106`) matches only reads through an identifier named `env`, so `environment.STRAPI_ANALYTICS_ACCESS_TOKEN` (`explorers-analytics-composition.ts:25`) is invisible to it. Replace it with: any `STRAPI_[A-Z0-9_]+` identifier or string in code is a violation. That is stricter, and correct once the allowlist is empty.
   - **Comment stripping.** `codeOnly()` (`:143-149`) removes `//` to end of line without respecting strings, so a URL string hides the rest of its line. Replace it with a comment stripper built on TypeScript's scanner (`ts.createScanner` from the `typescript` package tunes already depends on). It must skip only comment tokens.
6. **Add negative fixtures for the walker.** Under `scripts/__fixtures__/retired-deps/`, add small source trees. Run the scanner against each, through an entry-point override used only by the test, and expect a named violation:
   - an `@shared/*` import of a module that reads `STRAPI_URL`;
   - an unresolvable `@shared/missing`;
   - an `environment.STRAPI_X` read;
   - a `"https://x" + env.STRAPI_X` on one line;
   - a `require("./strapi-reader")`.
7. **Change the success line** to `OK — no production entry point reaches a Strapi construction, a STRAPI_* identifier or a Strapi-named module.` Keep the existing "This does NOT mean Strapi is retired…" sentence until P6-12.

Run it before writing the floor, and read every violation it reports. **Resolving `@shared/*` will add modules**, and any of them may read `STRAPI_*`. Each new violation is a real coupling: either cut it in this ticket, the way Step 4 cut `music-health.ts`, or stop and report it. Never re-add an allowlist entry to get green.

- [ ] **Step 6: Run it and watch it pass, then commit**

```bash
node --test scripts/check-retired-dependencies.test.mjs
node scripts/check-retired-dependencies.mjs
npm test --prefix tunes -- --run
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/' ; cd ..
docker build -t ee-p6-3-check ./tunes
git add tunes/server/http/requestId.ts tunes/server/deployment/deploymentImage.ts tunes/server/security-containment.ts \
  tunes/server/middleware/explorersPrincipal.ts tunes/server/deployment/music-health.ts tunes/server/deployment/run-migration-gate.ts \
  scripts/check-retired-dependencies.mjs scripts/check-retired-dependencies.test.mjs
git commit -m "refactor(server): no production entry point reaches Strapi; the ratchet scans all of them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The `docker build` matters because `build:api`'s esbuild entries now import a new module. A contract test that pins the gate's import list (search `run-migration-gate` under `tunes/server/test`) must change in the same commit.

---

## P6-4: Remove the SPA's four Strapi REST calls

Safe now: they run only in builds that nothing deploys, or fail on `undefined/…` in the platform build.

**Files:**
- Modify: `explorers-earth/src/pages/Profile.tsx` (`:1679-1697`, and the fallback in `handleImageUpload` from `:1731` and in `handleBackgroundUpload` around `:1828-1860`)
- Modify: `explorers-earth/src/features/Favorites/components/AddRecommendation.tsx:770-797`
- Modify: `explorers-earth/src/lib/__tests__/platformBuildLeaks.test.ts`

- [ ] **Step 1: Write the failing leak test**

Add to `platformBuildLeaks.test.ts`, inside the `describe`:

```ts
  it("never calls Strapi's REST API, guarded or not", () => {
    // Break caught: Profile.tsx fell back to Strapi /upload and /accounts when the canonical
    // account was absent, and AddRecommendation.tsx DELETEd Strapi /upload/files on every
    // edit-mode image removal. A platform build sent them to `undefined/upload`. None
    // contains localhost:1337 or api.localqr.earth, so the two tests above could not see them.
    // runtimeOrigin(VITE_REST_API_URL…) image builders are a separate, guarded case.
    const rawRestCalls = sourceFiles(SOURCE_ROOT).filter((path) => readFileSync(path, "utf8")
      .replace(/\s+/g, " ").split(";")
      .some((statement) => statement.includes("VITE_REST_API_URL") && !statement.includes("runtimeOrigin(")))
      .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"));
    expect(rawRestCalls).toEqual([]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd explorers-earth && node ./scripts/run-contained-vitest.cjs run src/lib/__tests__/platformBuildLeaks.test.ts --maxWorkers 1`
Expected: FAIL, listing exactly `features/Favorites/components/AddRecommendation.tsx` and `pages/Profile.tsx`. If any other file appears, it is a call site this plan missed. Read it and add it to this ticket.

- [ ] **Step 3: Delete the Strapi fallback in `Profile.tsx`**

In `handleImageUpload` (`:1703`), the canonical branch (`:1712-1729`) already returns. Replace everything from `const accountId = await resolveSelectedAccountUploadId();` (`:1730`) down to just before the `} catch (error: any) {` at `:1790`:

```ts
      throw new Error(t("dashboard.profile.common.errors.failedToGetAccountId"));
```

Make the same change in `handleBackgroundUpload` (`:1803`): keep its canonical branch (`:1810-1825`) and replace its Strapi fallback with the same `throw`.

Then delete `resolveSelectedAccountUploadId` (`:1679-1697`). Remove whichever imports became unused, checking each one first:

```bash
for s in selectExplorerAccountUploadTarget generateProfileUploadPath generateRandomFileName sanitizeUsername axios token; do echo "== $s"; grep -n "\b$s\b" explorers-earth/src/pages/Profile.tsx; done
grep -rn "selectExplorerAccountUploadTarget" explorers-earth/src | grep -v "pages/Profile.tsx"
```

Two things to watch here:
- **`token`.** It comes from `useAuthStore()` at `Profile.tsx:254` and becomes unused here. `noUnusedLocals` is on (`tsconfig.app.json:22`), so `tsc` fails until you remove it from that destructure.
- **`selectExplorerAccountUploadTarget`.** If it has no other caller, delete **only that function** and its cases. Its module, `explorerAccountSelection.ts`, exports four other functions that are in use (`categoryNavigationApi.ts:5`, `ProfileAccountSettings.tsx:27`). Its test file is pinned by the `test:music-critical-coverage` script, which `contained-unit.launcher.test.ts:310` asserts, so keep the file.

Leave `generateProfileUploadPath` and friends alone if other modules use them.

The behaviour changes only when `accountQuery.data` is absent. In that case the user now sees the same "failed to get account id" toast that `resolveSelectedAccountUploadId` already threw on its own failure path (`:1682`), instead of a request to Strapi.

- [ ] **Step 4: Delete the Strapi DELETE in `AddRecommendation.tsx`**

`handleRemoveImage` (`:770`) becomes:

```ts
  // Removing an image only changes the draft. On save, the canonical update detaches it, and the
  // media cleanup sweep removes the stored object (P5-6/P5-10).
  const handleRemoveImage = (image: GoogleMedia) => {
    setFetchedGoogleMedia((prevMedia) => prevMedia.filter((img) => img !== image));
    setFetchedImageDeleteModal(false);
  };
```

The old code already ran these two statements unconditionally after the `try` (`:792-795`), so this is the old behaviour minus a request that could never succeed. Check whether `axios`, `token` or `type` are now unused in the file, and remove only the unused ones.

- [ ] **Step 4a: Add one interaction case to the guard**

The guard's navigation cases cannot see calls made in event handlers. Add one owner case to `no-strapi.spec.ts` that **uploads a profile picture**. It covers the handler this ticket edits, and it would catch a reintroduced fallback:

```ts
/** A lead, not a fact: the walkthrough target (useProfileWalkthrough.ts:64) wraps the picture control. Confirm the real input. */
const PROFILE_PICTURE_INPUT = '[data-walkthrough="profile-picture"] input[type="file"]';
test('desktop owner profile-picture upload uses only canonical media', async ({ browser }) => {
  const { origin, personas } = fixture();
  const context = await guardedContext(browser, RUN, origin, VIEWPORT.desktop);
  try {
    await signIn(context, personas.ownerA);
    const page = await context.newPage();
    await page.goto('/profile');
    const before = RUN.violations().length;
    const media = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/explorers/v1/media' && r.request().method() === 'POST');
    // A 1x1 PNG. Use the profile-picture file input the page really renders; read Profile.tsx for its selector.
    await page.locator(PROFILE_PICTURE_INPUT).setInputFiles({ name: 'p.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
    expect((await media).status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect(RUN.violations().slice(before)).toEqual([]);
  } finally {
    await context.close();
  }
});
```

Confirm `PROFILE_PICTURE_INPUT` against the rendered page: the input may sit behind a cropper (`ImageCropper.tsx`), and the case must drive the same path a user does. This case needs media storage in the runner. `profile-browser-fixture.ts:142` passes `{mediaStorage: storage}` only when `storage` exists, so read how the `places` suites create it, and give `no-strapi` the same.

The edit-mode image removal in `AddRecommendation.tsx` would need a seeded recommendation with media. It stays covered by Step 1's static leak test only, which is an accepted residual (Open question 8). **Teeth check:** temporarily restore one deleted `axios.post(... /upload ...)` fallback **without** its `accountQuery.data` guard. This case should go red on a poisoned `/api/upload`.

- [ ] **Step 5: Run the test, the lane and the typecheck; commit**

```bash
cd explorers-earth
node ./scripts/run-contained-vitest.cjs run src/lib/__tests__/platformBuildLeaks.test.ts --maxWorkers 1
npx tsc --noEmit -p tsconfig.app.json
node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
cd .. && npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
git add explorers-earth/src/pages/Profile.tsx explorers-earth/src/features/Favorites/components/AddRecommendation.tsx explorers-earth/src/lib/__tests__/platformBuildLeaks.test.ts
git commit -m "fix(spa): remove the last Strapi REST calls (profile upload fallback, edit-mode media delete)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Compare the whole-lane result against a baseline run on the parent commit, not against zero.

---

## P6-5: CI builds what deploys, and scans the bundle for Strapi

`ci.yml:168-169`'s "Production Build (parity with deploy)" runs `npm run build`, which is the **legacy** `vite build`. The deploy runs the platform build (`explorers.yml:171-178`). So the job named for parity builds the one artifact nobody deploys.

**Files:**
- Create: `explorers-earth/scripts/check-platform-bundle-strapi.mjs`
- Create: `explorers-earth/scripts/check-platform-bundle-strapi.test.mjs`
- Modify: `.github/workflows/ci.yml:146-169` (build job)

- [ ] **Step 1: Write the failing scanner test**

`explorers-earth/scripts/check-platform-bundle-strapi.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanBundle, MIN_JS_BYTES } from './check-platform-bundle-strapi.mjs';

function bundle(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), body);
  return dir;
}
// Above the production floor, so a size finding can never stand in for a signature finding.
const big = 'x'.repeat(MIN_JS_BYTES + 1);

test('an above-floor bundle with no signature is clean (control)', () => {
  assert.deepEqual(scanBundle(bundle({ 'a.js': big }), { phase: 'B' }).findings, []);
});
test('flags each Strapi signature by name', () => {
  for (const marker of ['api.localqr.earth', 'undefined/upload', 'users_permissions_users', '/upload/files/',
    'localhost:1337', '77.42.95.255', '13.126.235.177']) {
    const findings = scanBundle(bundle({ 'a.js': big + marker }), { phase: 'A' }).findings;
    assert.equal(findings.length, 1, marker);
    assert.ok(findings[0].endsWith(`: ${marker}`), findings[0]);
  }
});
test('a near-empty bundle fails the size floor instead of passing clean', () => {
  assert.deepEqual(scanBundle(bundle({ 'a.js': 'ok' }), { phase: 'A' }).findings.map((f) => /floor/.test(f)), [true]);
});
test('phase B also forbids /graphql in any form and the Apollo client; phase A does not', () => {
  for (const marker of ['uri:"/graphql"', 'fetch(`${o}/graphql`)', 'ApolloClient']) {
    assert.equal(scanBundle(bundle({ 'a.js': big + marker }), { phase: 'B' }).findings.length, 1, marker);
    assert.deepEqual(scanBundle(bundle({ 'a.js': big + marker }), { phase: 'A' }).findings, [], marker);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd explorers-earth && node --test scripts/check-platform-bundle-strapi.test.mjs`
Expected: FAIL, `Cannot find module './check-platform-bundle-strapi.mjs'`.

- [ ] **Step 3: Implement the scanner**

`explorers-earth/scripts/check-platform-bundle-strapi.mjs`:

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Phase A holds after P6-4; phase B is switched on by P6-7, once Apollo is gone. */
const ALWAYS = ['api.localqr.earth', 'localqr-strapi', 'undefined/upload', '/upload/files/', 'users_permissions_users',
  'localhost:1337', '77.42.95.255', '13.126.235.177'];
// Phase B: any occurrence of /graphql, not only a whole quoted literal. A template such as `${origin}/graphql` must fail too.
const PHASE_B = ['/graphql', 'ApolloClient', '__APOLLO_CLIENT__'];
/** The platform bundle is ~12 MB of JS; anything under half that is a broken build, not a clean one. */
export const MIN_JS_BYTES = 6_000_000; // measured 12.36 MB of JS at 05a252f6 (review A); re-measure

function files(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files(path, found); else if (path.endsWith('.js')) found.push(path);
  }
  return found;
}

export function scanBundle(dist, { phase }) {
  const findings = [];
  let bytes = 0;
  for (const path of files(dist)) {
    const text = readFileSync(path, 'utf8');
    bytes += text.length;
    for (const marker of [...ALWAYS, ...(phase === 'B' ? PHASE_B : [])])
      if (text.includes(marker)) findings.push(`${path}: ${marker}`);
  }
  if (bytes < MIN_JS_BYTES) findings.push(`bundle size floor: ${bytes} < ${MIN_JS_BYTES} bytes of JS`);
  return { bytes, findings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.env.PLATFORM_BUNDLE_STRAPI_PHASE === 'B' ? 'B' : 'A';
  const { bytes, findings } = scanBundle(process.argv[2] ?? 'dist', { phase });
  if (findings.length) { console.error(findings.join('\n')); process.exit(1); }
  console.log(`platform bundle: ${bytes} bytes of JS, no Strapi signature (phase ${phase})`);
}
```

- [ ] **Step 4: Run it against a real platform build**

```bash
cd explorers-earth
node --test scripts/check-platform-bundle-strapi.test.mjs
npx vite build --config vite.platform.config.ts --mode platform
node scripts/check-platform-bundle-strapi.mjs dist
```

Expected: the tests pass, and the scan prints the byte count with no findings, **provided P6-4 has landed**. Before P6-4 it must fail on `undefined/upload` and `users_permissions_users`, which shows the scanner bites. Review A measured 12.36 MB of JS at `05a252f6`, which is why the floor is 6 MB. Re-measure and adjust it the same way.

**This is why P6-5 is gated on P6-4.** Before P6-4 the bundle really does contain `undefined/upload` (twice), `undefined/upload/files/` and `users_permissions_users` (review A, from `assets/main-*.js`). Switching the required `build` job to this scan before P6-4 lands would turn CI red. Landing both in one PR is also fine.

- [ ] **Step 5: Point the CI build job at the platform build**

`.github/workflows/ci.yml`, build job (`:168-169`). Replace the `Build` step:

```yaml
      - name: Build the platform SPA (what explorers.yml deploys)
        run: |
          npm run landing:check
          npx tsc -b
          npx vite build --config vite.platform.config.ts --mode platform
          node scripts/check-music-production-bundle.mjs
          node scripts/check-platform-bundle-strapi.mjs dist
```

Before doing this, read the job's `working-directory` / `defaults` and copy whatever `explorers.yml:171-178` actually runs, including how it handles `check-music-production-bundle.mjs`. P3-8 may have renamed that script.

The legacy `npm run build` stops being compiled in CI here. That is intended: nothing deploys it, and P6-8 deletes it. **Check first** that no workflow, contract test or required-check list names the step "Build" or the command `npm run build`:

```bash
grep -rn "npm run build\b\|name: Build$" .github/workflows tunes/server/test scripts | grep -v node_modules
```

If `replatform-workflow-authority.test.ts` or another contract pins `ci.yml`'s build step, update it in the same commit.

- [ ] **Step 6: Commit**

```bash
git add explorers-earth/scripts/check-platform-bundle-strapi.mjs explorers-earth/scripts/check-platform-bundle-strapi.test.mjs .github/workflows/ci.yml
git commit -m "ci: build the platform SPA that deploys, and fail it on any Strapi signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The scanner's own `node --test` must also run in CI, and today **nothing runs `explorers-earth/scripts/*.test.mjs`**:
- The only `node --test` lines in CI are `test.yml:122` (root `scripts/`) and `tunes.yml:135`.
- explorers-earth's vitest includes only `src/**` (`vitest.config.ts:46`).

So add this as the first line of the build job's run block in Step 5:

```yaml
          node --test scripts/check-platform-bundle-strapi.test.mjs
```

---

## P6-6: Delete the 45 `gql` documents

**Gate: P3-7 merged.** That gate is about test tooling, not production. Four operations are pinned by source scanners, and three of the five scanners are Music fixture tooling that P3-7 is expected to delete:
- `tunes/scripts/music-fixture-profile.ts:19-25`
- `tunes/server/test/contracts/music-fixture-services.test.ts`
- `explorers-earth/scripts/music-public-prebrowser-qualification.mjs:189-191`

The other two:
- **`e2e/contained-auth-session.spec.ts:100,129`.** It sits in the required `ci.yml` e2e-category-a lane.
- **`e2e/music-harness-contract.spec.ts`.** It no longer exists, so the guard test's comment at `retiredApolloDocumentSurface.test.ts:65-67` is stale.

If P3-7 slips and this ticket must run earlier, it must also delete the scanning code in the three tooling files.

- [ ] **Step 1: Recount, and list every consumer**

```bash
cd explorers-earth
node -e "const fs=require('fs'),p=require('path');let n=0;const w=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory()){if(e.name!=='__tests__')w(f)}else if(/\.tsx?$/.test(e.name)&&!/\.test\./.test(e.name)){const c=(fs.readFileSync(f,'utf8').match(/gql\s*\x60/g)||[]).length;if(c){n+=c;console.log(c,f)}}}};w('src');console.log('total',n)"
cd .. && grep -rln "CategoryNavigationAccount\|UpdateAccount\|UsersPermissionsUser\|PublicCategoryListCounts\|PUBLIC_APP_DATA\|_LISTS_BY_ACCOUNT\|_BY_LIST\b" explorers-earth tunes scripts --include=*.ts --include=*.tsx --include=*.mjs --include=*.cjs | grep -v node_modules
```

Expected: `total 45`, or fewer if P5-8 or P3 removed some. Any consumer outside `explorers-earth/src` that still exists goes into this ticket's list.

- [ ] **Step 2: Turn the guard test into a "none left" test — the failing test**

Replace `src/features/__tests__/retiredApolloDocumentSurface.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..", "..");
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "__tests__") sources(path, found); }
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) found.push(path);
  }
  return found;
}

describe("retired Apollo document surface", () => {
  it("scans real files, so the assertion below cannot pass vacuously", () => {
    // VACUITY GUARD: a mis-rooted scan finds nothing and would "prove" there are no documents.
    expect(sources(SRC).length).toBeGreaterThan(400);
  });
  it("no GraphQL document remains in application source", () => {
    const offenders = sources(SRC).filter((path) => /\bgql\s*`/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
```

Run: `cd explorers-earth && node ./scripts/run-contained-vitest.cjs run src/features/__tests__/retiredApolloDocumentSurface.test.ts --maxWorkers 1`
Expected: FAIL, listing 13 files.

- [ ] **Step 3: Delete the documents, keeping the hooks**

The five category `api/query.ts` files also hold the live `useXCommands` hooks, so **delete the `gql` exports, not the files**. Repeat this for each file the Step 2 test lists:
- Remove each `export const X = gql\`…\`` block.
- Then remove `gql` from the `@apollo/client` import. Remove the whole import if it becomes empty.

Delete two whole files: `features/PublicHome/api/query.ts` and `features/Settings/api/mutation.ts`. Neither is in the platform bundle (inventory). `features/Profile/api/query.ts` holds **no** document; it is a one-line `export { getProfile }` with no importers found. Delete it as dead code, not as part of the document count.

A path grep cannot prove these files have no importers, because relative imports such as `../../api/query` do not contain the feature name. The real check is `npx tsc --noEmit -p tsconfig.app.json` plus the whole lane after deleting them.

Delete `categoryNavigationAccountQuery` from `features/navigation/categoryNavigationApi.ts:9`. Also delete the `client?: ApolloClient<object>` compatibility parameter (`:46-47`, "never queried or mutated") together with its callers' argument.

- [ ] **Step 4: Fix the consumers — same commit**

| Consumer | Change |
|---|---|
| `e2e/public-shell-continuity.spec.ts:562-575` | Delete the `page.evaluate` that imports `PUBLIC_APP_DATA` and calls `window.__APOLLO_CLIENT__.cache.writeQuery`. Nothing reads the Apollo cache, so the seed is dead (no app code references `__APOLLO_CLIENT__`; Apollo exposes it in dev mode on its own). The canonical warm read the test checks next (`warmState.faults.set('PublicAppData', …)`) is unaffected. Run the spec to confirm |
| `e2e/contained-auth-session.spec.ts:96-139` | Both tests extract `CategoryNavigationAccount` from source and POST it to the contained `/graphql` adapter to check that it denies a wrong owner. That adapter guards a surface the app no longer uses. **But the first test also asserts that a foreign session cannot reach the canonical session, identity and lifecycle surfaces** (`:103-105`, `:115-117`). Keep those canonical assertions, and delete only the document extraction, the GraphQL requests and their assertions. Delete the second test only if nothing canonical is left in it |
| `src/features/Profile/components/__tests__/Profile.live-order-contract.test.tsx:64-67` | It reads `Settings/api/mutation.ts` and expects exactly one `mutation UpdateAccount` document, so it fails with ENOENT once the file goes. Seed its fixture directly, as its own comment suggests |
| `src/features/__tests__/recommendationMutationsPublish.test.ts:18-87` | Delete the 25 mutation-document cases. Keep the Books/Favorites/Guides describe (`:123-145`) |
| `features/Books/api/__tests__/detailQueryFields.test.ts`, `Games/api/__tests__/listVars.test.ts`, `Movies/api/__tests__/listVars.test.ts` | They test document shapes. Delete the files, or the document cases if anything else is in them |
| `PublicHome/api/__tests__/publicPlacesQuery.contract.test.ts`, `PublicProfile.gallery-contract.test.tsx`, `routes/__tests__/UsernameValidator.test.tsx` | They import `accountsDetailQuery` / `getPublicAccountBasicQuery`. Delete those imports and the assertions built on them; keep what tests canonical behaviour |
| `tunes/scripts/music-fixture-profile.ts`, `music-fixture-services.test.ts`, `scripts/music-public-prebrowser-qualification.mjs` | Only if they survived P3-7: delete the document scans |
| `e2e/setup/category-navigation.ts:95-106` | Its registered-document set becomes empty. That is harmless, because the app sends no `/graphql`. Leave it; P6-9 decides the adapter's fate |

- [ ] **Step 4a: Prune the served-source path lists — same commit as the deletions**

`scripts/replatform-e2e.mjs:626` (`publicServedSourcePaths`) and `e2e/replatform/people-served-module-diagnostic.ts:2` list `PublicHome/api/query.ts`, `Settings/api/mutation.ts` and `Profile/api/query.ts`, which this ticket deletes. Find every consumer of those lists, then prune the deleted paths:

```bash
grep -rn "publicServedSourcePaths\|people-served-module-diagnostic" scripts explorers-earth tunes --include=*.mjs --include=*.ts | grep -v node_modules
node --test scripts/replatform-e2e.test.mjs
```

P6-7 prunes `lib/apolloCache.ts` and its test from the same lists.

- [ ] **Step 5: Regenerate the `.dockerignore` files if they list deleted files**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --write
git diff --stat -- .dockerignore explorers-earth/Dockerfile.music-fixture.dockerignore
```

The generator may have been renamed by P3-8. Use its current name.

- [ ] **Step 6: Verify and commit**

```bash
cd explorers-earth
node ./scripts/run-contained-vitest.cjs run src/features/__tests__/retiredApolloDocumentSurface.test.ts --maxWorkers 1
npx tsc --noEmit -p tsconfig.app.json
node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
npx playwright test --config=playwright.public-shell-continuity.config.ts --project=chromium
npx playwright test --config=playwright.contained-auth-session.config.ts
cd .. && npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
git commit -am "refactor(spa): delete the 45 inert GraphQL documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Confirm the two Playwright config names against `ci.yml:200-262` and `:326-356` before running them. `git commit -am` does not stage deletions made with plain `rm`, so use `git rm` for deleted files and check `git status` first.

---

## P6-7: Delete Apollo Client

- [ ] **Step 1: List every remaining Apollo import**

```bash
grep -rln "@apollo/client" explorers-earth/src explorers-earth/e2e explorers-earth/scripts | grep -v node_modules
```

Expected after P6-6:
- **Source:** `main.tsx`, `lib/apolloCache.ts`, `components/AccountGenerationCacheReset.tsx` and `hooks/useLogout.ts`.
- **Tests:** 32 files import `@apollo/client`. Only 13 use `MockedProvider` or `new ApolloClient`, e.g. `features/navigation/__tests__/surfaceHarness.tsx` and `layouts/__tests__/PublicationLayout.test.tsx`. Others only `vi.mock` an api module (e.g. `appEditorInitialization.test.tsx:13`).

- [ ] **Step 2: Write the failing test**

Add to `src/features/__tests__/retiredApolloDocumentSurface.test.ts`:

```ts
  it("no application module imports Apollo Client", () => {
    const offenders = sources(SRC).filter((path) => /from\s+["']@apollo\/client/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
```

Run it. Expected: FAIL, listing the four source modules.

- [ ] **Step 3: Remove the client**

- **`src/main.tsx`.** Delete the Apollo imports (`:6-12`), `authLink` and `httpLink` (`:23-35`), `client` (`:38-44`) and the `<ApolloProvider client={client}>` wrapper (`:51`). Keep every other provider in the same order. The `isCanonicalRuntime` import (`:1`) was used only by the deleted `uri` expression (`:33`), so remove it too, or `noUnusedLocals` fails.
- **`AccountGenerationCacheReset.tsx:24` and `hooks/useLogout.ts:37`.** Delete the `client.clearStore()` calls and their `useApolloClient` hooks. The React Query clear next to them stays: it is the cache that holds account data now.
- **`src/lib/apolloCache.ts` and `lib/__tests__/apolloCache.test.ts`.** Delete both.
- **`src/__tests__/main.auth.test.tsx`.** It tests the Apollo auth link (`:77`, `:86`, `:97`). Delete those cases. Keep `:63` ("no eager Google Maps") if it is still meaningful.
- **Stale path lists.** P6-6 Step 4a pruned the document files. Here, prune `lib/apolloCache.ts` and its test from `scripts/replatform-e2e.mjs:626` and `e2e/replatform/people-served-module-diagnostic.ts:2`. Then run `node --test scripts/replatform-e2e.test.mjs`, because `replatform-e2e.mjs` is source-inventoried. Never regenerate a frozen constant to make that test pass.
- **The 32 importing test files.** For each one, remove the `MockedProvider` wrapper, or the hand-built client, and its import. A test that asserted Apollo behaviour is deleted, not rewritten.

- [ ] **Step 4: Remove the dependency**

```bash
cd explorers-earth && npm uninstall @apollo/client
grep -rln "from ['\"]graphql['\"]" src e2e scripts | grep -v node_modules
```

`graphql` is still imported by `e2e/setup/category-navigation.ts:4`, `e2e/setup/category-theme-publish.ts:2` and `vitest.config.ts:20-21`. Keep it until P6-9 removes those, then `npm uninstall graphql` in that ticket. Commit `package.json` **and** `package-lock.json`.

- [ ] **Step 5: Switch the bundle scan to phase B, verify, commit**

In `.github/workflows/ci.yml`, set `PLATFORM_BUNDLE_STRAPI_PHASE: B` on the P6-5 scan step. In Step 4 of P6-5's scanner, phase B forbids `/graphql` literals and `ApolloClient`.

```bash
cd explorers-earth
npx vite build --config vite.platform.config.ts --mode platform && PLATFORM_BUNDLE_STRAPI_PHASE=B node scripts/check-platform-bundle-strapi.mjs dist
npx tsc --noEmit -p tsconfig.app.json
node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
cd .. && npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
git add -A explorers-earth .github/workflows/ci.yml && git status --short
git commit -m "refactor(spa): remove Apollo Client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Read `git status --short` before committing. `git add -A` scoped to `explorers-earth` must not pick up a stray `dist/`. Check `explorers-earth/.gitignore` covers it.

---

## P6-8: Retire the legacy SPA build and its Strapi configuration

**Gate: P2 proven in production.** That means the platform SPA is what `explorers.earth` serves, and the owner has confirmed the old legacy image is no longer the rollback target. Before starting, ask the owner or orchestrator for the P2 completion record.

- [ ] **Step 1: Confirm production no longer serves the legacy image**

The owner, on the explorers host:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://explorers.earth/runtime-config.json
sudo grep -rn "localqr\|1337" /etc/nginx/ 2>/dev/null | head
```

Expected:
- **`/runtime-config.json` answers `200`**, and its body parses with `parsePublicRuntimeConfig` (`src/lib/publicRuntimeContract.ts`), with `origin` equal to `https://explorers.earth`. A 200 alone is not enough: an SPA fallback returns 200 for any path.
- **The grep finds no `localqr` or `1337` proxy.**
- **The served release is identified.** The owner records the deployed image digest or release directory from the P2 record, and it matches a `main` commit that contains the platform build.

Anything else means P2 is not done, and this ticket waits.

- [ ] **Step 2: Write the failing test**

Add to `platformBuildLeaks.test.ts`:

```ts
  it("names no Strapi destination at all, guarded or not", () => {
    // After P6-8 the legacy build is gone, so runtimeOrigin()'s legacy argument has nothing to protect.
    expect(offenders(/VITE_REST_API_URL|VITE_API_URL|localhost:1337|VITE_PUBLIC_ACCESS_TOKEN/)).toEqual([]);
  });
```

Run it. Expected: FAIL. It lists the seven image builders, `ProfileSetupAccordion.tsx`, `Home.tsx` and `main.tsx` (if P6-7 has not landed), plus anything else.

- [ ] **Step 3: Remove the Strapi branch from the seven image builders**

Every builder first returns canonical media paths (`isCanonicalMediaPath`, e.g. `gameHelpers.ts:157`), then prefixes relative Strapi paths with a Strapi origin. Strapi media no longer exists, and start-fresh means no row holds such a path. So delete the Strapi branch and return the path unchanged.

`Games/utils/gameHelpers.ts:158-163` is typical. Delete:

```ts
  // If it's a Strapi relative path, prefix with the REST API URL
  if (coverUrl.startsWith("/")) {
    const base =
      runtimeOrigin(import.meta.env.VITE_REST_API_URL?.replace("/api", "") || "http://localhost:1337");
    return `${base}${coverUrl}`;
  }
```

`pages/Home.tsx:120-124` and `:131-135` are two such branches. **Keep** the TMDB branch between them (`:127-129`): it is not Strapi.

The other builders are:
- `components/ProfileSetupAccordion.tsx:78`
- `AppsAndTools/utils/appHelpers.ts:181`
- `People/utils/personHelpers.ts:204`
- `Products/utils/productHelpers.ts:154`
- `PublicHome/components/ProfileRecommendationsTab.tsx:118`

Read each one. Some may have a non-Strapi branch after the Strapi one.

Run each builder's unit tests. A test that expected `http://localhost:1337/uploads/…` or an origin-prefixed path is pinning the removed behaviour: change it to expect the path unchanged.

- [ ] **Step 4: Delete the legacy build**

| What | Where |
|---|---|
| Legacy nginx with the `api.localqr.earth` proxy | `explorers-earth/nginx.conf` (`:79-96`) |
| Netlify redirects to Strapi | `explorers-earth/netlify.toml` (`:1-34`). **Ask the owner first** whether a Netlify site still builds from this repo; if so, have them disable it, then delete the file |
| Legacy Dockerfile stages | `explorers-earth/Dockerfile`: `builder` (`:7-17`, the `VITE_API_URL`/`VITE_REST_API_URL`/`VITE_PUBLIC_ACCESS_TOKEN` args), `runner`, and `legacy-default` (`:73`). Make the platform runner the last stage, so a target-less build produces it |
| Legacy env | `explorers-earth/.env.example:5-9,26` — the three Strapi variables |
| Legacy dev proxy | `explorers-earth/vite.config.ts:58-71`. Point `/api` at the local canonical API (`http://127.0.0.1:5000`) and delete `/graphql`. Also remove the `musicDevelopmentTransport` import (`:5,13`) if P3 left it |
| `build` script | `explorers-earth/package.json:11`. Make `build` the platform build: `npm run landing:check && tsc -b && vite build --config vite.platform.config.ts --mode platform && node scripts/check-music-production-bundle.mjs && node scripts/check-platform-bundle-strapi.mjs dist` |
| Dead legacy modules | `store/store.ts:100-116` `login()` (no caller). Delete the `login` member from the `AuthState` interface (`:25-32`) too, because `create<AuthState>()` (`:53`) requires every member. `pages/public/PublicProfilePage.tsx` (imported nowhere). Check each with `grep -rn "<name>" explorers-earth/src` |

Before deleting the Dockerfile stages and `nginx.conf`, find who references them:

```bash
grep -rn "legacy-default\|nginx\.conf\b\|--target\|netlify" .github explorers-earth/Dockerfile* docker-compose*.yml scripts tunes/server/test deploy | grep -v node_modules
```

`scripts/generate-music-fixture-dockerignore.mjs:78` lists `explorers-earth/nginx.conf` among its fixed files. Remove it there and regenerate both `.dockerignore` files. Any contract test that pins the Dockerfile's stage list must change in the same commit.

- [ ] **Step 5: Verify and commit**

```bash
cd explorers-earth
node ./scripts/run-contained-vitest.cjs run src/lib/__tests__/platformBuildLeaks.test.ts --maxWorkers 1
npm run build
docker build --build-context platform-shared=../tunes/shared -t ee-p6-8-check .   # platform-builder COPYs --from=platform-shared (Dockerfile:53)
npx tsc --noEmit -p tsconfig.app.json
node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
cd .. && npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
git commit -m "chore(spa): retire the legacy Strapi build, its nginx proxy and its env

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Check the no-Strapi run after this ticket.** The guard's Vite config still defines the poisoned `VITE_API_URL` and `VITE_REST_API_URL`. Once nothing reads them they are inert, which is correct, and the guard stays meaningful through the same-origin and real-host poison. Leave them defined: if a reader returns, it reaches the poison.

---

## P6-9: Remove the fixture Strapi and the Strapi tooling

**Gate: P3-7 merged.** P3-7 deletes the legacy composition, `docker-compose.music-test.yml`, the Music deploy, and probably much of what is below. **Recompute** what is left; do not trust this list.

- [ ] **Step 1: Recompute every remaining Strapi reference outside docs**

```bash
git grep -n -i -E "strapi|localqr|:1337\b|77\.42\.95\.255|STRAPI_" -- ':!docs' ':!**/node_modules/**' ':!**/*.md' \
  | grep -v -E "strapiBlocksConverter|real-strapi-20261013|taxonomy_source_mappings|musicRetirementPolicy|canonicalRetiredSurfaces|no-strapi" \
  > /tmp/p6-9-remaining.txt; wc -l /tmp/p6-9-remaining.txt
```

Classify every line as a call, config, test, fixture or comment, the same way the inventory did. The exclusions are the deliberate keeps (decision 5) and the guard itself.

- [ ] **Step 2: Remove the fixture Strapi from the replatform stack — one commit**

This is the one compose stack P3 keeps (`scripts/replatform-local.ts:216`). Make all of these changes together:
- **`docker-compose.replatform.yml`.** Delete the `strapi` service (`:31-47`), the `STRAPI_*`, `MUSIC_FIXTURE_STRAPI_ORIGIN`, `MUSIC_E2E_STRAPI_TOKEN` and `MUSIC_STRAPI_HOST_PORT` entries on the tunes services (`:54`, `:93-104`), and `depends_on: strapi` (`:189`). Fix the stale "combined" comment at `:167`. **Edit by grep-located lines; never print the whole file** (backbone, "Growing the migration chain").
- **`explorers-earth/nginx.replatform.conf:35-69`.** Re-point the `strapi:1337` locations; do not just delete them. `location /api/ { proxy_pass http://strapi:1337; }` (`:62-64`) is the catch-all. Without it, every unmatched `/api/*` falls through to `location /`, i.e. a 200 HTML SPA shell instead of canonical's JSON 404, which is exactly what `assertNotApplicationShell` in `scripts/replatform-route-parity.ts` exists to catch. Point `/api/` at the tunes upstream. Point `= /graphql` and `= /api/users/me` at tunes too, which answers them with its tombstone or 404.
- **`scripts/replatform-local.ts`.** Remove `strapi` from the exact service list (`:86`, `:163`, `:468-476`, `:511`, `:536`, `:662`). If the fixture SPA no longer needs `VITE_API_URL` (`:408`), remove that too.
- **`tunes/server/test/contracts/replatform-local-authority.test.ts`.** Update `:61`, `:117`, `:266`, `:318` and `:457`.
- **Delete** `tunes/scripts/music-fixture-server.ts`, `fixtures/strapi/` and their tests (`music-fixture-services.test.ts:9,13,325-339,385-388,618,687-695`, `music-e2e-initial-capture.integration.test.ts:25`), unless P3-7 already did.

Then run the required platform-fixture sequence locally:

```bash
npm run platform:local -- provision
npm run platform:seed && npm run platform:seed
npm run platform:test:routes
```

It refuses while any `explorers-replatform-local_*` volume exists (`p3-music-removal-findings.md`, "Traps hit"). List the volumes with `docker volume ls`, and ask before removing any you did not create.

- [ ] **Step 3: Retire the CI "/graphql suffix" contract**

Once Apollo is gone (P6-7) the env does nothing:
- **`ci.yml:226-232`, `:288-294`, `:350-356` and `:423-429`.** Delete `VITE_API_URL` and `VITE_PUBLIC_ACCESS_TOKEN`.
- **`frontend-e2e-qualification.yml:73-81`.** The same.
- **`test.yml:323-342`.** The same.
- **`replatform-workflow-authority.test.ts:55-59`.** Change it to assert that the variables are **absent**.

The legacy e2e specs still mock `**/graphql` (decision 6). They keep working with the variable gone, because the app sends nothing there.

`e2e/setup/category-navigation.ts:95-106,450-460` is the contained `/graphql` adapter. With no documents left, it rejects everything and is reached by nothing. Delete the adapter and its document registry, and then `npm uninstall graphql` if `e2e/setup/category-theme-publish.ts:2` and `vitest.config.ts:20-21` can drop it too. Otherwise leave both and record why.

- [ ] **Step 4: Remove the server's Strapi tooling outside both closures**

**Closure-based deletion cannot see these**, so P3-7's madge recompute will not have caught them:

| File | Why it is Strapi |
|---|---|
| `server/commands/reconcileMusicIdentities.ts` (`:183,:195`) | calls Strapi `/api/music-identities` |
| `server/config/music-reconciliation-config.ts`, `server/repositories/reconciliationRepository.ts`, `server/services/musicReconciler.ts` | the reconciler it drives |
| `scripts/music-cli.ts` (`:599-601`, `:1242`, `:1417`, `:1430`, `:1451`, `:1483`, `:1514`) | Strapi subcommands and env |
| `scripts/public-profile-local.ts`, `server/config/local-public-profile-gateway.ts` (`:4`) | local Strapi profile gateway |
| `scripts/music-e2e-state-smoke.mjs:44` | reads the fixture Strapi |
| `scripts/music-fixture-secret.ts:1410` | lists `STRAPI_*` secrets |
| `tunes/.env.example:14,46-56` | Strapi env |
| `server/deployment/music-health.ts:54-60` | legacy readiness `requiredSecrets` and `upstreamUrls.STRAPI_URL`. After P6-3 the gate no longer imports this file; delete `setupMusicHealthRoutes` if P3-7 kept it |
| `server/config/public-profile-gateway-config.ts:13-15`, `server/config/music-environment.ts:4-8` | Strapi profile-gateway token and fixture env |
| `tunes/deployment/verify-publication-authority.mjs:129-150` | legacy deploy authority requiring `STRAPI_*` host env |
| `tunes/.github/workflows/main.yml:54-57` | inert nested workflow with Strapi secrets (P3-7 is meant to delete it) |
| `.github/workflows/tunes.yml:126` | `STRAPI_ANALYTICS_ACCESS_TOKEN: fixture-analytics-token`, pinned by `tunes/scripts/music-image-ci-tests.ts`, `music-image-ci-tests.test.ts` and `music-reconciliation-workflow.test.ts`. Remove all four together |

For each file: `grep -rn "<basename without extension>" tunes scripts .github` first. Delete it if only deleted code uses it; otherwise cut the Strapi part only. A `music-cli.ts` subcommand used by a lane that still exists keeps its non-Strapi parts.

If a `music-documentation-contract.test.ts:790` pin on `.env.music.example` survived P3-7, remove it together with the example file.

- [ ] **Step 5: Verify and commit**

```bash
npm test --prefix tunes -- --run
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server|scripts)/' ; cd ..
node --test "scripts/*.test.mjs" "scripts/*.test.cjs"
node scripts/check-retired-dependencies.mjs
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
git commit -m "chore: remove the fixture Strapi, its CI env contract and the Strapi tooling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`node --test "scripts/*.test.mjs"` is the required `test.yml:122` lane, and it holds the frozen-source seals. **None of this ticket's edits touch the sealed helpers** in `books.spec.ts:96`, `movies.spec.ts:161` or `profile.spec.ts:641-648`. If a seal fails, an edit strayed into one of them: revert that edit. Never regenerate a frozen constant to make the failure go away.

---

## P6-10: Drop `users`, the `0001` baseline and the analytics receipts — migration `00NN`

**Gate: P3-9 merged.** The orchestrator assigns `00NN` at merge: the next free number after P3-9 and P5's two migrations (`0058_explorers_place_photo_backfill`, `0059_explorers_person_suppression_audit` on `claude/p5-user-visible-defects`), so at least `0061`. Below, `<PREV>` is the migration head immediately before yours.

P5 also changes the runtime-role lists (it adds `person_suppression_actions` and `refuse_person_suppression_audit_change()`). **Derive every expected list from the tree you are on**, not from this plan's numbers.

P3 deliberately kept `users` and the `0001` baseline for P6 (P3 plan, "Before you start" item 2; the P3-9 migration's trailer). After P3-7 and P3-9, no canonical code reads them. The one survivor is the runtime-role attestation, and **that survivor is the trap.**

**The failure that matters most.** `db/music-runtime-role.ts` is renamed by P3-8; use its current name. It enumerates the schema at boot:
- `expectedRuntimeTables` (`:6-125`) lists `users` and the baseline tables.
- `expectedRuntimeSequences` (`:126-153`) lists their sequences.
- `assertMusicRuntimeDirectPrivilegeBoundary` probes `"TRUNCATE TABLE users"` (`:849`) and expects a privilege denial.

Drop the table without changing the probe, and the probe gets `42P01 undefined_table`, which `requirePrivilegeDenial` (`:1107`) rethrows. **Canonical then refuses to boot, with `00NN` already committed.** This is the same class of failure as P3's correction #1. Migration, attestation and manifest therefore go in **one commit**, and Step 7 boots the real gate sequence against an upgraded database.

- [ ] **Step 1: Prove nothing reads these tables**

```bash
cd tunes
grep -o "CREATE TABLE[^(]*" migrations/0001_runtime_baseline.sql | sed 's/CREATE TABLE \(IF NOT EXISTS \)\?//; s/public\.//; s/"//g; s/[[:space:]]*$//' > /tmp/baseline.txt
wc -l < /tmp/baseline.txt   # expect 27; the trailing-space strip matters, without it every -w grep below matches nothing
tr '\n' ' ' < /tmp/baseline.txt
for t in $(cat /tmp/baseline.txt) explorers_analytics_receipts; do hits=$(grep -rlE "(FROM|JOIN|INTO|UPDATE|TABLE)\s+(public\.)?\"?$t\"?\b" server shared scripts --include=*.ts | grep -v __tests__ | grep -v "/test/" | tr '\n' ' '); [ -n "$hits" ] && echo "$t: $hits"; done
```

At `05a252f6` the table list is the 27 tables `team_members`, `users`, `playlists`, `songs`, `played_songs`, `playlist_songs`, `guest_interactions`, `youtube_api_usage`, `user_sessions`, `activity_logs`, `analytics_snapshots`, `user_activity`, `session`, `api_tokens`, `user_profiles`, `email_templates`, `email_logs`, `page_contents`, `seo_settings`, `system_settings`, `youtube_music_playlists`, `youtube_music`, `youtube_tokens`, `youtube_playlists`, `widgets`, `youtube_api_calls` and `playback_states`.

**Expected hits after P3-7 and P3-9:** only the runtime-role module. Any other hit is a live reader, and this ticket stops until it is gone.

Better Auth uses `auth_user`, `auth_session`, `auth_account` and `auth_verification` (`auth/betterAuth.ts:68-79`), not `users` or `session`. Confirm that too.

- [ ] **Step 2: Prove nothing in the database depends on them**

Against a scratch database migrated to `<PREV>` (Step 7 shows how), run:

```sql
-- Foreign keys INTO these tables from tables that are not themselves being dropped.
SELECT c.conname, c.conrelid::regclass AS from_table, c.confrelid::regclass AS to_table
FROM pg_constraint c WHERE c.contype = 'f'
  AND c.confrelid::regclass::text = ANY($1)
  AND NOT (c.conrelid::regclass::text = ANY($1));
-- Functions whose body names any of them (PostgreSQL does not track plpgsql dependencies).
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~* ('\m(' || array_to_string($1, '|') || ')\M');
-- Views, triggers and sequences that would be left dangling.
-- A view's dependencies are recorded against its pg_rewrite rule, not the view itself.
SELECT 'view' AS kind, r.ev_class::regclass::text FROM pg_rewrite r JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass WHERE d.refobjid::regclass::text = ANY($1) AND r.ev_class::regclass::text <> ALL($1)
UNION ALL SELECT 'trigger', tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY($1);
```

Pass the 27 names plus `explorers_analytics_receipts` as `$1`. Expected: no foreign keys, no views. The only functions should be:
- `provision_music_runtime_login(name,text)` (kept by P3-9), if its body names a baseline table;
- any baseline-owned trigger functions, which this migration drops explicitly.

Record every row. `00NN` must drop or rewrite each one by name. **Never use `CASCADE`.**

- [ ] **Step 3: Check production holds no rows in them**

**Whoever has production database access** runs this, through the host's `docker compose exec postgres psql`. The owner has no server SSH (P6-13); this waits on that access the same way P6-13 does:

```sql
SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'explorers_analytics_receipts', count(*) FROM explorers_analytics_receipts;
```

Extend this to every baseline table. Expected: zero everywhere, because the production database was created fresh at P2 and canonical never writes to these tables. **Any non-zero count stops the ticket** and goes to the owner. Start fresh means the rows are not wanted, but someone must look before they are destroyed.

- [ ] **Step 4: Write `tunes/migrations/00NN_retire_strapi_baseline.sql`**

Write it from Step 2's output, in dependency order:
1. triggers on the doomed tables;
2. then their trigger functions;
3. then the tables, children before parents, **in the order the FK graph gives**. That is not "`users` last": `users.account_manager_id` references `team_members` (`0001_runtime_baseline.sql:26`), so `users` is itself a child, and `team_members` drops after it;
4. then any sequence not owned by a dropped column.

Shape:

```sql
-- 00NN: retire the Strapi-era baseline (0001) and the Strapi analytics receipts.
-- Nothing reads these since P3-7 and P3-9 (P6 plan, P6-10 Step 1). Never CASCADE:
-- PostgreSQL does not record plpgsql bodies as dependencies, so CASCADE would hide
-- exactly the breakage this migration must surface.

-- (1) Triggers and trigger functions found in Step 2, each by exact name and signature.
-- (2) Child tables before parents. Every baseline table that REFERENCES users first.
DROP TABLE public.explorers_analytics_receipts;
DROP TABLE public.playback_states;
DROP TABLE public.youtube_api_calls;
-- … every remaining baseline table that references users, in the order Step 2's FK graph requires …
DROP TABLE public.users;          -- users.account_manager_id -> team_members (0001:26), so users goes before…
DROP TABLE public.team_members;   -- …its parent
-- (3) Sequences that outlive their tables (not OWNED BY a dropped column).
```

Get the order from the FK graph, not from this sketch:

```sql
SELECT c.conrelid::regclass AS child, c.confrelid::regclass AS parent FROM pg_constraint c
WHERE c.contype = 'f' AND c.conrelid::regclass::text = ANY($1) ORDER BY 2, 1;
```

**`music_schema_migrations` stays.** It is the migration journal, whatever it is called.

- [ ] **Step 5: Rewrite the attestation — same commit**

In the runtime-role module:
- Remove every dropped table from `expectedRuntimeTables`, and every dropped sequence from `expectedRuntimeSequences`.
- Remove any dropped function from `expectedRuntimeFunctions` (`:154-`).
- The lists are compared in order (`sameRuntimeInventory`, `:1088`), so keep the survivors in the order the live `pg_class`/`pg_proc` queries return.
- **Delete the `TRUNCATE TABLE users` probe** (`:849`).
  - The same statement list already proves a `TRUNCATE` denial on a surviving table: `"TRUNCATE TABLE account_category_content_state"` (`:857`). So removing the probe loses no coverage.
  - Confirm `:857` is still there after P3-9 and P5 before deleting `:849`. If it is not, retarget `:849` to a surviving table whose denial you have confirmed on a provisioned database. Never leave a probe naming a dropped table.
- `provisionMusicRuntimeLogin` (`:635-792`) names no baseline table explicitly. It grants on `ALL TABLES IN SCHEMA` (review A). Re-check that after P3-9 and P5, because a `GRANT` on a missing table is an error.
- The `0019`/`0020` column grants on `users` vanish with the table, and the column-ACL check (`:1075-1084`) then still sees zero.

```bash
grep -n -w -E "$(tr '\n' '|' < /tmp/baseline.txt)explorers_analytics_receipts" server/db/*runtime-role*.ts
```

Also delete `startup/explorers-analytics-migration.ts` if P3-7 left it, together with `deployment/music-deployment.ts`'s receipts references. Grep for `explorers_analytics_receipts` across `server/` and `scripts/`, and expect nothing outside the migration.

- [ ] **Step 6: Grow the migration chain — same commit**

Do every row of the P3 plan's "Growing the migration chain" table except its "only while they still exist" row. Use the names the files have after P3-8. **Rows marked * are only potentially there: check whether each still exists first.**

| File | Change |
|---|---|
| `tunes/shared/*migration-contract.ts` | the expected id, chain and deployable marker |
| `deploy/production.compose.yml` | the `MUSIC_MIGRATION_MARKER` on `migrate` (the env name is kept by P3-8) |
| `deploy/platform.compose.yml` | the marker |
| `docker-compose.replatform.yml` | the marker and the expected id (grep-located lines only) |
| `.github/workflows/tunes.yml` | the in-image file-existence list |
| `fixtures/db/*runtime-table-manifest.json` | `migrationChain.expectedId`, `migrationChain.files[]` and `tables[]` / `controlTables` |
| `docs/architecture/*documentation-contract.json` | the chain array |
| `scripts/platform-runtime-smoke-contract.mjs` | `schema.currentId` |
| `tunes/scripts/platform-proxy-browser-fixture.ts` | `currentId` |
| `tunes/server/test/contracts/platform-oci/` fixtures | bump `SCHEMA_VERSION` in `generate.py` and run it, then **restore `layer.tar.gz` from git**, because Windows Python writes gzip OS byte `0xff` (`p3-music-removal-findings.md`). Extend the historical list in `platform-oci-evidence.test.ts` |
| the deploy engine's `known_markers` * | append the old head, only if P3-7 kept the engine |
| migration contract and state-restore tests | assert the new id and chain |

Catch whatever this table missed:

```bash
grep -rn "<PREV>" --include=*.ts --include=*.mjs --include=*.json --include=*.yml --include=*.sh --include=*.py . | grep -v node_modules | grep -v "^./tunes/migrations/"
```

That grep finds the migration **head**, not table names. Tests and tooling also pin the dropped **table names** directly. Review A found these at `05a252f6`:
- `runtime-table-manifest.test.ts:47-56` (its `rawSqlTables` must contain `playback_states`, `youtube_*` and `widgets`);
- `music-e2e-state-restore.test.ts:37,115,126,145,191` (`COPY public.users` and a table list);
- `music-e2e-state-capture.test.ts:65`;
- `music-runtime.integration.test.ts:17-20,166` (`rawTables`, plus a trigger on `playback_states`);
- `fixtures/db/music-runtime-table-manifest.json:74`.

Some die with P3-7; find what is left, and classify every hit:

```bash
git grep -n -w -E "$(paste -sd'|' /tmp/baseline.txt)|explorers_analytics_receipts" -- ':!docs' ':!tunes/migrations' ':!**/node_modules/**'
git grep -n "explorers-analytics-receipts-v1" -- ':!docs'
```

- [ ] **Step 7: Run the gate's whole sequence against a fresh database AND an upgraded one**

The integration suite injects a pool and skips the attestation, so it cannot see the crash described above. Reproduce the gate's sequence, in order, as P3-9 Step 7 does:
1. the two pre-migration checks;
2. migrate to `00NN`;
3. provision and verify the runtime login;
4. `verifyMusicRuntimeDatabaseConnection` (or its renamed form) with the runtime role's connection, which is what `canonicalStartup.ts` runs at boot.

Run it twice: on a fresh database, and on one first provisioned at `<PREV>` and then upgraded. Put it in `tunes/server/test/migrations/strapi-baseline-retirement.integration.test.ts`:

```bash
npm test --prefix tunes -- --run --config vitest.integration.config.ts server/test/migrations/strapi-baseline-retirement.integration.test.ts
```

Use the exact CI PostgreSQL URL and the `MUSIC_C3`–`MUSIC_C9` flags, as in `tunes.yml:120-126`.

**This integration test is the evidence, so it must run the attestation itself.**
- Its upgraded-database case ends by calling `startCanonicalServer` (`canonicalStartup.ts:42`) **without** an injected pool, configured with the runtime role's credentials, so the real `if (!pool)` attestation path runs (`:52-56`).
- It then asserts that `/health/ready` answers 200.

The no-Strapi browser run is **not** evidence for this step. `profile-browser-fixture.ts` migrates as `music_migrator`, provisions a runtime login only for `lifecycle`, and hands `createCanonicalApp` the pool directly (`:124-142`), so it never attests. Run it anyway, as a regression check:

```bash
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(db): 00NN retires the Strapi-era baseline and analytics receipts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**No image rollback after this.** `readiness.ts:13` requires an exact migration-id match, so an image older than `00NN` refuses to boot. Deploy it like P3-9: back up first (P5b), and keep the owner informed.

---

## P6-11: Rewrite the docs that describe Strapi as current

Docs only. **The load-bearing set is pinned by tests, so run them.**

- [ ] **Step 1: Rewrite, delete or relink**

| File | Change |
|---|---|
| `CLAUDE.md:14,57-58,71,92` | explorers-earth talks to the canonical REST API in `tunes/server`, not to Strapi over GraphQL |
| `explorers-earth/CLAUDE.md:9,19-20,63,88,118,125` | the "Backend: External Strapi CMS" section, the Apollo bullets and "Add a GraphQL query" all go; describe `explorersApiClient` and `/runtime-config.json` |
| `tunes/CLAUDE.md:100,146` | remove `STRAPI_URL`/`STRAPI_ACCESS_TOKEN` and the Strapi-proof Music auth text (P3 may already have removed the Music text) |
| `docs/README.md:31,33` | remove the "Strapi API Reference" link |
| `docs/explorers-earth/strapi-api.md` | delete — it documents hosted dev at `77.42.95.255:1337` (`:11,:21`) |
| `docs/explorers-earth/integrations.md:30-45,129` | rewrite; **keep the file**, `music-documentation-contract.test.ts:716-734` requires it to exist |
| `docs/architecture.md:50,57-63,104,110-111`, `docs/environment-variables.md:9-25,86-94`, `docs/getting-started.md:6-8,33`, `docs/explorers-earth/deployment.md:32-33,43,58,79`, `docs/operations/music-local-development.md:47,95-97` | rewrite to the canonical stack |
| `docs/replatform-audit/**`, `docs/archive/**`, `docs/plans/**`, `docs/superpowers/**`, `docs/adr/**` | **leave** — historical record |

- [ ] **Step 2: Run the documentation contracts and commit**

```bash
npm test --prefix tunes -- --run server/test/contracts/music-documentation-contract.test.ts
node --test scripts/ci-docs-only.test.cjs
git commit -m "docs: describe the canonical backend; remove Strapi as current architecture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

P3-8 may have renamed the contract test; find it with `ls tunes/server/test/contracts | grep documentation`. `obsoleteAuthFindings` (`:310-333`) fails a paragraph that pairs "session cookie" with "Strapi JWT/bearer". Rewrite such a paragraph; do not reword it to dodge the pattern.

---

## P6-12: Close — final guard run and evidence

- [ ] **Step 0a: Run the guard against the platform build once**

The dev-mode guard exercises the legacy-leaning branches (P6-1, "What it does not run"), and P6-5's scan only reads the bundle statically. Before P6 closes, run the same spec once against the **shipped** artifact.

1. **Build it:** `npx vite build --config vite.platform.config.ts --mode platform --outDir <temp>`.
2. **Render the runtime files** into it with `node scripts/render-platform-runtime.mjs <config.json> <temp>/index.html <temp>`. Read its argument check (`process.argv.length!==5`) and `parsePublicRuntimeConfig` for the exact inputs. Use a QA config whose `origin` is the fixture web origin.
3. **Serve it:** `vite preview` with a config whose `preview.proxy` sends `/api` to the in-process canonical API, on the fixture's web port.

Wire it as a `no-strapi-platform` suite in `parseBrowserSuite`, with the runner choosing preview instead of dev. In that mode the spec's closure floor counts `/assets/*.js` chunks instead of `/src/` modules. Set its floor from the measured chunk count (the platform build emits about 119 assets).

**Teeth check:** add a `fetch('http://13.126.235.177:1337/x')` behind `if (isCanonicalRuntime())` in `main.tsx`. It must fail this run and must not fail the dev-mode run.

- [ ] **Step 0: Widen the ratchet to the rest of `build:api`**

P3-7 has now dealt with the three entry points P6-3 left out. Add each that still exists to `PRODUCTION_ENTRIES` in `scripts/check-retired-dependencies.mjs`:
- `server/api.ts`, collapsed to canonical by P3-7 Step 7;
- `server/deployment/run-production-graph-smoke.ts`, if P3-7 rewrote it rather than deleting it;
- `server/deployment/run-registration-compat.ts`, if it somehow survived.

Re-measure `MINIMUM_MODULES`, then:

```bash
grep -o "esbuild [^&]*" tunes/package.json   # the entry points build:api really bundles
node --test scripts/check-retired-dependencies.test.mjs
```

Every entry `build:api` bundles must be in `PRODUCTION_ENTRIES`. Commit this on its own.

- [ ] **Step 1: Run every Strapi gate on `main` after P6-11**

```bash
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
node scripts/check-retired-dependencies.mjs
node --test scripts/check-retired-dependencies.test.mjs
cd explorers-earth && npx vite build --config vite.platform.config.ts --mode platform && PLATFORM_BUNDLE_STRAPI_PHASE=B node scripts/check-platform-bundle-strapi.mjs dist && cd ..
git grep -n -i -E "strapi|localqr|:1337\b" -- ':!docs' ':!**/*.md' | grep -v -E "strapiBlocksConverter|real-strapi-20261013|taxonomy_source_mappings|musicRetirementPolicy|canonicalRetiredSurfaces|no-strapi|check-retired-dependencies|check-platform-bundle-strapi" | wc -l
```

What each should show:
- **The guard:** green, with `strapi: 0` from the server monitor.
- **The ratchet:** zero allowlists, the closure above its floor.
- **The bundle scan:** phase B, clean.
- **The final grep:** only lines you can name.

Every remaining line must be one of three things:
- a test that **asserts absence**, such as `production-compose.test.ts:97-98`, `canonical-seo-routes.test.ts:48` or `platformBuildLeaks`;
- a frozen seal that P6 deliberately does not touch;
- a historical comment.

List them in the PR body.

- [ ] **Step 2: Re-measure the floors and record them**

Write the final `MODULE_FLOOR`, `ROUTE_FLOOR`, `MINIMUM_MODULES` and `MIN_JS_BYTES`, with their measured values, into the PR body. If a floor fell since P6-1, say why. Deleting Apollo removes modules, so a lower module count is expected. A floor that **rose** is fine.

- [ ] **Step 3: Remove the "does NOT mean Strapi is retired" line** from `check-retired-dependencies.mjs`. Then commit and push.

- [ ] **Step 4: Tell the orchestrator** that P6 is code-complete and P6-13 can start its quiet period.

---

## P6-13: Owner — retire the Strapi service and `api.localqr.earth`

**Owner actions.** Nothing in the repo does any of this. The engineer prepares the commands and reads the results back. The owner has Strapi admin access through `api.localqr.earth` in their own Chrome, plus GitHub, but **no server SSH** (owner access record, 2026-10-18). Every step needing SSH, AWS or Hetzner console access waits on the owner.

- [ ] **Step 1: Quiet period — seven days with no traffic to Strapi from the product**

**First, the gate this step depends on.** The old production tunes stack runs root `docker-compose.yml`:
- It is in `legacy-music` mode (`:9`).
- The Strapi variables are **required** (`:19-27`).
- It calls Strapi server to server: identity gateway, reconciler, reactivation `PUT /api/users/:id`, sitemap.

Deleting code from `main` does not stop that container. Before the quiet period starts, the owner confirms from the P2 completion record that this stack is **switched off, or running canonical**. If it still runs `legacy-music`, switching Strapi off breaks it. Stop here until it is retired.

Then, after P6-12, Strapi should receive no request from the product. The owner checks the last seven days in **two** ways:
- **By source IP.** Look for requests from the explorers host and the old tunes host. This catches server-to-server calls, which carry no `Origin` or `Referer`.
- **By `Origin`/`Referer`.** Look for requests with an `Origin` or `Referer` of `explorers.earth`. This catches browsers.

Use whichever of these exists:
- Strapi's access log on LocalQR-Strapi-Prod;
- the reverse proxy in front of it;
- the Hetzner/CDN metrics.

What a match means:
- **A browser request** means a client this plan missed: most likely a stale tab or an old cached legacy bundle. Wait out a cached bundle.
- **Server-to-server traffic** means a stack is still running legacy.

Either way, anything you cannot explain goes back to the engineer.

- [ ] **Step 2 (optional): Export the content**

Production Strapi holds only test and team data, and start fresh means none of it is imported. Only if the owner wants a keepsake:
- **(a)** Take an RDS snapshot through the AWS console. It is the cheapest and most complete option. **The production and dev Strapi share one RDS** (`music-local-development.md:97`), so one snapshot covers both.
- **(b)** Or export the content types through the Strapi admin UI.

Media lives in the Strapi S3 bucket (`grooming-media-auth-review.md:13`). Copy it only if wanted. **No task in this plan reads the export.**

- [ ] **Step 3: Confirm the Strapi S3 bucket is not the canonical media bucket**

Compare the bucket in the production `.env` on the explorers host (`EXPLORERS_MEDIA_S3_BUCKET`, as named in `deploy/production.compose.yml`) with the Strapi `aws-s3` provider's bucket (Strapi admin → Settings, or the Strapi server env).

**If they are the same bucket, stop.** Deleting it destroys canonical media. The Strapi objects must then be removed by prefix instead, and this step becomes an engineer task.

- [ ] **Step 4: Revoke credentials before switching anything off**

- **Strapi API tokens.** In Strapi admin → Settings → API Tokens, revoke the tokens behind `STRAPI_ACCESS_TOKEN`, `STRAPI_ANALYTICS_ACCESS_TOKEN`, `STRAPI_PUBLIC_PROFILE_READ_TOKEN`, the reconciliation and lifecycle-proof tokens, and the public token behind `VITE_PUBLIC_ACCESS_TOKEN`.
- **Google Cloud console.** On the OAuth client, remove the Strapi redirect URI (`…/api/connect/google/callback`). Keep the canonical Better Auth callback.
- **GitHub repository secrets.** Delete any whose name contains `STRAPI`, plus `VITE_API_URL`, `VITE_REST_API_URL` and `VITE_PUBLIC_ACCESS_TOKEN`, if present.

List secret **names** only:

```bash
gh secret list --repo tandavkrishna27/explorers.earth | grep -i -E "strapi|VITE_API_URL|VITE_REST_API_URL|PUBLIC_ACCESS_TOKEN"
```

The engineer may run that command. The owner deletes in the GitHub UI, or with `gh secret delete <NAME>` after confirming each name.

- [ ] **Step 5: Switch off, in an order that can be undone until the last step**

1. **Stop** the Strapi process on LocalQR-Strapi-Prod and LocalQR-Strapi-Dev. Do not delete anything yet. `api.localqr.earth` now fails. Wait 48 hours, then look for breakage, such as the support inbox and any monitor.
2. **DNS.** Remove the `api.localqr.earth` record, or point it at a static host answering `410 Gone`. Removing it is simpler; a 410 is kinder to anything that still calls it. The owner chooses.
3. **Delete** the two Hetzner CAX21 servers, LocalQR-Strapi-Prod and LocalQR-Strapi-Dev (`database-change-feature.md:24-28`). Also check the older AWS Mumbai host `13.126.235.177` (`vite.config.ts:59,66`). If it or its database still exists, it is part of this step.
4. **Delete** the RDS instance, **only after** Step 2's snapshot decision, and **only after** listing its databases and connections. The owner runs `SELECT datname FROM pg_database` and checks `pg_stat_activity` over a day, to confirm that nothing but the two Strapi instances uses it. This is irreversible.
5. **Delete** the Strapi S3 bucket, **only if** Step 3 confirmed it is separate. This is irreversible.
6. **Archive** the `MeteoriteLabs/localqr-strapi-v2` repository on GitHub. Archive it rather than delete it: it is history.

- [ ] **Step 6: Record it**

Add a dated line to the backbone's P6 section: what was switched off, when, and where the snapshot is (if one was taken).

---

## Open questions for the owner

1. **Netlify.** CLAUDE.md says the SPA deployed via Netlify, and `explorers-earth/netlify.toml` proxies to `api.localqr.earth`. Is a Netlify site still connected to this repository? P6-8 deletes the file and needs the site disabled first.
2. **The content export** (P6-13 Step 2): an RDS snapshot, an admin export, or nothing?
3. **`api.localqr.earth` after switch-off:** remove the DNS record, or serve a static 410?
4. **The legacy e2e `/graphql` mocks** (decision 6): leave them as harmless residue, or schedule a cleanup PR?
5. **Making the no-Strapi lane required** (P6-1 Step 15). It is nightly here. P7 owns the cost trade-off.
6. **The AWS Mumbai host `13.126.235.177`** (`vite.config.ts:59,66`, `2026-07-08-production-e2e-run-notes.md:75`). Does it, or an RDS or EC2 behind it, still exist and bill? If so, P6-13 Step 5 retires it too.
7. **Who runs the production row-count check in P6-10 Step 3?** It needs database access on the host, which the owner does not have yet.
8. **Is the static leak test enough for `AddRecommendation.tsx`'s edit-mode image removal?** P6-4 adds an interaction case for the profile upload only. Covering removal needs a seeded recommendation with media. That is accepted as residual here; say if it should be built.

---

## Self-review

**Coverage against the backbone's P6 line:**
- "Six server call sites." Re-verified at module granularity, and two more found outside both closures. Five die in P3-7, the sixth in P6-2, and the two outliers in P6-9.
- "Analytics events route is the last live dependency inside canonical, so P5-1 is its prerequisite." Confirmed for network calls, and found to be broken rather than live. P6-2 is gated on P5-1.
- "Frontend is mostly deletion — no Apollo operation executes; 45 `gql` documents are inert." Confirmed at 45. Inert by absence of callers, not by a guard, with 35 shipping in the bundle. P6-6 and P6-7 delete them.
- **`no-strapi.spec.ts` with its four properties, plus a fifth.** Covered by P6-1:
  - **Poisoned origin:** Step 7 and Step 6a.
  - **Monitor self-test:** Step 11 and `selfTestOutboundMonitor`. Step 6d drives the one historical canonical Strapi read.
  - **Closure-size floor:** `MODULE_FLOOR`, which proves boot.
  - **Route-coverage floor:** `ROUTE_FLOOR`, plus the occurrence-indexed inventory test.
  - **Fifth, per-case landing and API proof:** `landedOk`, the `/me` 200 wait and `API_FLOOR`.

  Step 14 proves each property can fail.

**Coverage against the brief:**
- **Server call sites:** P6-2 and P6-9.
- **`STRAPI_*` env and config:** P6-2, P6-3, P6-9 and P6-13.
- **Apollo and `gql`:** P6-6 and P6-7.
- **Legacy routes and `legacy-music` mode:** deleted by P3-7. P6 verifies the result (P6-9 Step 1, P6-12).
- **Compose services:** P6-9.
- **CI lanes and fixtures:** P6-5 and P6-9.
- **Docs:** P6-11.
- **Seals:** untouched by design, and checked in P6-9 Step 5.
- **Retiring the external service:** P6-13.
- **Data imports:** none, deliberately.

**Ordering.** Every deletion follows the removal of its consumer:
- **SPA before server.** P5-1 repoints the dashboard before P6-2 removes the read.
- **Analytics before P3-7's `shared/schema.ts` deletion.**
- **P3-9's foreign keys before P6-10's tables.**
- **P2 in production before P6-8 deletes the live recipe.**

Each Phase A ticket leaves the following unchanged: `legacy-music` boot (P6-2 keeps `routes/index.ts` wired), the canonical stack, and the required CI lanes.

**Remaining unknowns, stated where they are resolved:**
- The diagnostics-channel message shapes (P6-1 Step 3).
- Whether workers are intercepted (the self-test decides).
- The real floors (measured at first green).
- The post-P3 state of every file P3-7 may already have deleted (each "recompute" step).
- The baseline dependency graph and the surviving `TRUNCATE` probe target (P6-10 Steps 2 and 5).
- Whether the S3 buckets are shared (P6-13 Step 3).

---

## Corrections from review

Revision 1 was reviewed by two independent adversarial reviews, each run against the code:
- **Review A:** server, database, CI and ordering.
- **Review B:** the frontend and the guard.

Both executed the plan's literals instead of reading them:
- the real scanner, with its edges and entry points swapped;
- the whole tunes server suite before and after applying P6-2's edits;
- `tsc` on P6-3's re-export;
- a real platform build, grepped for P6-5's markers;
- Playwright 1.61.1 channel experiments;
- the guard's exact Vite config, served over the real SPA (Vite 8.0.16);
- a diff of the route table against the real literals.

Revision 2 applies every finding.

### Revision 2 — from reviews A and B (2026-10-19)

| # | Revision 1 said | The code says | Applied |
|---|---|---|---|
| 1 | P6-2 deletes the owner `GET /api/explorers/analytics/events`, gated on P5-1 having "repointed the dashboard" | **P5-1 keeps that route** and serves it from canonical `analytics_events` with session auth (`9e73fb75`). The SPA still calls it. Revision 1's gate would always say "stop", and its literal code would have undone P5-1, removing the dashboard's only data source in production | P6-2 rewritten against the post-P5-1 file. It keeps the route, makes `auth` required, and deletes only the `!auth` branch and its dynamic import. Legacy gets an ingest-only set whose owner read is refused |
| 2 | Step 2's test used `createLoopbackSupertestScope(app)` and `from`/`to` | The helper takes no argument and returns `open`/`closeAll`. The scope keys are `fromDate`/`toDate`/`timeZone` (`explorersAnalyticsRoutes.ts:75-80`) | The new test needs no HTTP. The owner read is covered by P5-1's integration test |
| 3 | Removing the GET breaks `analytics-inventory-regression` | That test passes, because it uses a synthetic row. Removing the GET would break `music-openapi-contract`, `music-authorization-matrix`, `runtime-surface-inventory` and the route-parity probe | Moot: the route stays (row 1) |
| 4 | P6-3: `export { requestIdFor } from "./http/requestId"` | `security-containment.ts` calls it at `:148`, `:204` and `:353`. An `export … from` creates no local binding: TS2552 three times, and a `ReferenceError` on every legacy request | `import` plus `export { requestIdFor }` |
| 5 | P6-3 makes "the canonical closure Strapi-free", so the deploy cannot reach Strapi | The scanner walks only `canonicalStartup.ts` and skips `@shared/*`. The `migrate` service's `run-migration-gate.ts` reaches `music-health.ts:57-60`, which reads three `STRAPI_*` variables | P6-3 splits `deploymentImageFromEnvironment` out, scans every production entry point and resolves `@shared/*`. P6-12 Step 0 adds the rest of `build:api` after P3-7 |
| 6 | The composition edge holds `shared/schema.ts` and `music-uat-database.ts` in canonical, "and the scanner agrees" | The edge holds exactly five modules: `db.ts`, the two music profile configs, the composition and the receipts module (155 → 150). `music-uat-database.ts` stays canonical via `apps-canonical-admission.ts`. `shared/schema.ts` is a `tsc` fact the scanner cannot see | Decision 3 and P6-2 Step 6 corrected. The stale-entry list is now definite: four entries |
| 7 | P6-5 gate: none | Until P6-4, the bundle contains `undefined/upload` twice, `undefined/upload/files/` and `users_permissions_users`, so P6-5 would turn the required `build` job red | Gated on P6-4. The size floor is set from the measured 12.36 MB: 6 MB, not 0.5 MB. Nothing ran `explorers-earth/scripts/*.test.mjs` in CI, so the scanner's own test is added there |
| 8 | P6-9 gated only on P3-7 | P6-9 deletes the contained `/graphql` adapter, which the required contained-auth-session lane uses until P6-6. It also deletes CI's `VITE_API_URL`, Apollo's URI until P6-7 | Gated on P6-7 as well |
| 9 | P6-10: "a green guard run means the attestation accepted the migration" | The runner migrates as `music_migrator`, never attests, and hands `createCanonicalApp` a pool (`profile-browser-fixture.ts:124-142`) | The integration test boots `startCanonicalServer` with no injected pool. The guard run is only a regression check |
| 10 | P6-10's `sed`, then `grep -w` over the baseline table names | The `sed` left a trailing space on every name, so the grep found 1 hit instead of about 55 | The `sed` strips whitespace and prints a count to check against 27 |
| 11 | P6-10's catch-all is a grep for the previous migration head | Tests and fixtures pin **table names** directly: `runtime-table-manifest.test.ts:47-56`, `music-e2e-state-restore.test.ts`, `music-e2e-state-capture.test.ts:65`, `music-runtime.integration.test.ts:17-20,166`, the manifest JSON, and the hyphenated marker `explorers-analytics-receipts-v1` | A name grep and a marker grep added |
| 12 | P3-9 = `0058`, P6-10 = `0059` | The P5 branch already adds `0058` and `0059`, and changes the runtime-role lists | Written as `00NN`, assigned by the orchestrator. Every expected list is derived from the tree |
| 13 | P6-13's quiet period checks requests by `Origin`/`Referer` | The live root `docker-compose.yml` runs `legacy-music` with the Strapi variables **required** (`:9,19-27`). Its Strapi calls are server-to-server, with no `Origin` | P6-13 is gated on that stack being retired or running canonical. Logs are checked by source IP as well |
| 14 | P6-10 replaces the `TRUNCATE TABLE users` probe with one on `creator_accounts` | `:857` already proves a `TRUNCATE` denial on `account_category_content_state` | Delete the probe, once `:857` is confirmed still there |
| 15 | P6-10's view query joined `pg_depend.objid` to the view | View dependencies hang off the view's `pg_rewrite` rule, so that query could never return a row | Joins through `pg_rewrite` |
| 16 | Guard: the server monitor records `${request.protocol}//${request.host}` | `ClientRequest.host` has no port, so the `:1337` self-test could never match and the monitor always reported itself blind | Uses `getHeader('host')` |
| 17 | Guard: with `hmr: false`, every WebSocket is a violation | Vite 8 opens `ws://<origin>/?token=…` on every page regardless | That one socket is a named `vite-client` stub. Every other socket is still a violation |
| 18 | Guard: poison `VITE_PUBLIC_PROFILE_GATEWAY_URL` | It is the origin of canonical `/api/explorers/v1/profiles/…` (`publicProfileGatewayClient.ts:57-61`), so every public page became a false positive | Set to `origin`. `VITE_INSTAGRAM_API_URL` (fallback `localhost:5000`) is set to `origin` too |
| 19 | Guard: the WebSocket self-test settles on `onopen`/`onerror` | A socket closed by `routeWebSocket` fires only `onclose`, so the evaluate hung until the 90s timeout | Settles on `onclose`, with a 5s timeout on every channel |
| 20 | Guard: onboard `ownerA` with `{expectedRevision, handle, onboardingStatus, publicProfile}` | `creator_accounts_complete_valid` (`0022:94-95`) requires `display_name` and `account_type`, so this PATCH returns 422 | Adds `displayName` and `accountType: 'Personal'`, as `profile.spec.ts:627-628` does |
| 21 | Guard: the closure-size floor means "an app that crashed or a route table that rendered nothing cannot pass" | Every route loads the same 573 modules, because routes are imported statically. A broken sign-in bounces every owner case to `/login`, and all of them pass | Each case asserts where it landed. Owner cases must see `/me` return 200 and must never land on `/login` or `/onboarding`. An API-surface floor is added, and the closure floor is relabelled "boot" |
| 22 | Guard: the route table is set-equal to the route literals | It missed `/onboarding`. Matching by set also hid six unvisited public routes (`:listSlug` occurs six times, `genre/:genreSlug` twice) | Keys are occurrence-indexed: `<file>:<path>#<n>`. The six routes and an un-onboarded `/onboarding` case are added. The redirect literals are visited with a `lands` assertion instead of being excluded |
| 23 | Guard: the server monitor guards canonical | No browser case can trigger the one historical canonical Strapi read, because it needs an auth-store token. So the monitor watched nothing | The runner drives that read directly. P6-1 is gated on P5-1, so the probe is green for the right reason, and teeth check 4 proves it goes red without P5-1 |
| 24 | Guard: the runner imports a new module | `snapshotSource()` (`replatform-e2e.mjs:455-500`) fails on any unreviewed relative dependency of `profile-browser-fixture.ts`. It runs in the required `test.yml` lane | The new file is registered in the same commit. New e2e files are committed before the test runs |
| 25 | Guard: "runs the real SPA"; type-checks via `--list` | It runs Vite **dev** mode, where `isCanonicalRuntime()` is false. `--list` threw without the fixture, and never type-checks anyway | The scope is stated plainly, with P6-5 covering the shipped bundle. The fixture is read lazily, and an e2e tsconfig does the type-check |
| 26 | Guard: sign in through a `localStorage` init script, because "token: null mirrors production" | The persisted store discards that script (`store.ts:143-146`). Admission is the cookie alone | Init script removed |
| 27 | P6-4: the fallback starts at `:1731`; delete `selectExplorerAccountUploadTarget` "and its tests" | It starts at `:1730`. `token` (`:254`) becomes unused and fails `noUnusedLocals`. The module exports four live functions, and a coverage script pins its test file | Lines fixed. `token` is added to the unused-symbol check. Only that function and its test cases are deleted |
| 28 | P6-6: 45 documents in 12 files; `Profile/api/query.ts` is a document file | 13 files. That file holds no document. `Profile.live-order-contract.test.tsx:64-67` reads `Settings/api/mutation.ts` | Counts fixed and the consumer added. The path grep is replaced by `tsc` plus the whole lane |
| 29 | P6-8: `docker build .` | The platform stages need `--build-context platform-shared=../tunes/shared` (`Dockerfile:53`) | Fixed |

Also applied from the same reviews:
- **Inventory additions:** `music-health.ts`, `public-profile-gateway-config.ts`, `music-environment.ts`, `verify-publication-authority.mjs`, the nested `tunes/.github/workflows/main.yml`, and a third host, `13.126.235.177` (Open question 6).
- **Fixture nginx:** P6-9 re-points the catch-all `/api/` instead of deleting it. Deleting it would have served the SPA shell where a JSON 404 belongs.
- **P6-3's test:** uses `spawnSync` instead of `execFileSync`.
- **Bucket variable:** the name is `EXPLORERS_MEDIA_S3_BUCKET`.
- **CI note:** the fixture Strapi makes the historical read live in CI.
- **P6-7:** counts corrected, and the stale served-source path lists are pruned.

**Confirmed correct by the reviews, and kept:**
- the 27 baseline tables;
- no foreign key into `users` survives P3-9, which drops `0018:5`, `0023:17` and `0051:116` and all six triggers;
- no surviving function body names a baseline table;
- Better Auth uses only `auth_*` tables;
- `provisionMusicRuntimeLogin` grants by schema, not by table name;
- the canonical JSON 404 terminator exists, and a POST-only path falls through to it;
- the P6-4 leak predicate flags exactly the two files;
- the `__APOLLO_CLIENT__` dev-mode claim;
- the `graphql` consumer list;
- the Playwright config names;
- the nightly lane's argument parsing.


### Revision 3 — from the Codex cross-model review (2026-10-19)

Codex's Windows sandbox refuses every shell call, so it ran without live repository access. It was given revision 2, the P3 plan's P3-7 to P3-9 sections, the backbone's P6 section, and the verbatim source of 40 load-bearing files and excerpts, including P5-1's version of the analytics route. It found sixteen things both Claude reviews missed. Each was checked against the code before it was applied.

| # | Revision 2 said | The code says | Applied |
|---|---|---|---|
| 1 | P6-5's scanner tests use a 600 KB fixture | The floor is 6 MB, so the "clean" phase-A case always fails, and every positive case passes on the size finding alone | Fixtures above the floor, one named finding per marker, and an above-floor clean control |
| 2 | `/email-verification` is an ordinary auth page | `AuthRoutes.tsx:27` is `<Navigate to="/login">`, so both its cases failed the landing assertion, and P6-1 could never go green | Moved to `EXCLUDED` with the reason |
| 3 | Drop the baseline tables "with `users` last" | `users.account_manager_id` references `team_members` (`0001:26`), so `users` is a child. Dropping `team_members` before it fails without `CASCADE` | FK-graph order, with `users` before `team_members` |
| 4 | Onboarding plus `publicProfile: true` makes public category pages reachable | They sit behind `TabVisibilityGuard defaultVisible={false}`, which redirects to the username root | The runner PATCHes every category public. A hidden category is caught by the landing assertion |
| 5 | Per-case proof = pathname, `/me` 200 and no violations | `ProtectedRoute.tsx:18-24` renders a loader or an error **on the same path**. The API floor counted requests, not successes | Each case asserts no broken state (selectors read from `EarthLoader.tsx:103-104` and `OnboardingCheckError.tsx:24-26`), plus optional page `marker`s. The API floor counts only successful responses |
| 6 | One navigation claims `/404`, the app wildcard and the public wildcard. The protected `/guides`, `/hub` and `/music` are visited. `ROUTE_FLOOR = CASES.length` | Three different elements; the protected redirects are shadowed by `AppRoutes.tsx:25-27`; a floor derived from the table shrinks when cases are excluded | Three separate wildcard cases. The top-level redirects are visited, and the protected occurrences are excluded as shadowed. `ROUTE_FLOOR` is a fixed number. Index routes are documented as covered by their category URLs |
| 7 | "Strapi calls happen on load" | The four remaining calls run in event handlers (upload, edit-mode removal) | P6-4 adds a profile-upload interaction case, with a teeth check. Edit-mode removal stays static-only (Open question 8) |
| 8 | The server monitor "refuses", and self-test traffic is "excluded by nonce" | It only records. Its exemption matched **any** `nostrapi-selftest=` value, and its self-test contacted `127.0.0.1:1337` | Described as detection only. The self-test uses an owned loopback server with timeouts. Only issued nonces are exempt, on both monitors, and a test proves a forged value is still a violation |
| 9 | Teeth check 4: force the `historical()` path, and expect `NO_STRAPI_SERVER_VIOLATION` | With a cookie and no `Bearer`, legacy ownership returns `false` before any fetch (`explorers-analytics-adapters.ts:511`). The probe's 502/403 also threw before the report ran | Teeth check 4 reintroduces an explicit Strapi fetch. The server report runs in `finally`, on every exit path |
| 10 | Resolve `@shared/*` in `resolveImport` | `walkClosure` drops non-relative specifiers at `:167` before the resolver sees them, and never extracts `require()` | Both places fixed; `require()` and `#auth-runtime` addressed; negative fixtures added |
| 11 | "No production entry point reaches a STRAPI_* read" | `ENV_READ` misses `environment.STRAPI_*` (`composition.ts:25`), and `codeOnly()` deletes code after a `//` inside a string | Any `STRAPI_*` identifier or string is a violation; comments are stripped with TypeScript's scanner |
| 12 | The static bundle scan covers the shipped build | It missed `localhost:1337` and `13.126.235.177`, and matched `/graphql` only as a whole quoted literal. A platform-only request would evade both checks | More markers, and any `/graphql` occurrence. P6-12 Step 0a runs the guard once against the real platform build, with a platform-only teeth check |
| 13 | P6-8 gated on P2 and P6-4 | Its new leak test forbids `VITE_API_URL`, which `main.tsx:33` reads until P6-7 | Gated on P6-7 |
| 14 | P6-2 verifies "including a real canonical boot" | Its runner injects a pool, so it never attests | Evidence comes from `startCanonicalServer` with no injected pool. The two existing tests that call it are named |
| 15 | P6-7 deletes the Apollo setup; P6-8 deletes `login()` | The `isCanonicalRuntime` import (`main.tsx:1`) and the `AuthState.login` member (`store.ts:25-32`) are left behind, and break `tsc` | Both removed in the same tickets |
| 16 | P6-6 deletes both contained-auth `/graphql` tests | The first also asserts canonical foreign-session denials (`:103-105,115-117`) | Those assertions are kept |

**Also from Codex, previously unresolved:**
- **Served-source lists.** They are pruned in P6-6, the ticket that deletes their files, and not left until P6-7.
- **`.dockerignore` regeneration.** It is now a stated rule for every ticket that adds or deletes files, as P3 requires.
- **Proof that production serves the platform build (P6-8 Step 1).** This now needs the parsed `runtime-config.json` contract and the release identity, not just a 200 status.
- **RDS deletion.** It requires listing the instance's databases and connections first.

**The P5-1 signature Codex could not confirm** is confirmed. `9e73fb75` widens `readAccountEvents(scope, request?)` in `explorersAnalyticsRoutes.ts:131`, and passes `req` at `:201`.

---

## Found during execution

Phase A (P6-1 to P6-5) was executed against `fork/main` = `5abc33cb` on 2026-10-19. Each row below is something the plan said that the code or a real run contradicted, and what was done instead. Line numbers in the plan above were not rewritten; re-locate them as the evidence standard says.

### P6-1

| # | The plan said | The code or a run said | Done |
|---|---|---|---|
| 1 | `...owner('/instagram', 'instagram')` | The `instagram` route literal no longer exists in `ProtectedRoutes.tsx` (P5-8 removed the surface), so the inventory test fails on a stale claim | Case removed. The table has 176 cases (178 tests with the inventory and self-test) |
| 2 | `/google-auth/callback` is an ordinary auth page | `GoogleAuthRedirect` bootstraps the session and sends a signed-out visitor to `/login?error=oauth_failed` | The case asserts `lands: /^\/login$/`, with a comment |
| 3 | `STUBS` names Google Fonts, the loader GIF and `flagcdn` | `RecommendationsHub.tsx` loads two CSS background textures from `www.transparenttextures.com/patterns/` | A named `transparenttextures` stub (image, `/patterns/` only). `local` was not widened |
| 4 | Public cases pass once landing, broken-state and violation checks hold | **Canonical rate-limits public profile reads to 120 a minute** (`explorersPublicProfileRoutes.ts`, draft-7 `RateLimit` header). Back to back, the public cases exhausted it, and most public category pages rendered **"404 Page Not Found" on an unchanged URL**. The first green run passed all of them | Three changes, all in the spec: (a) before each public case the spec reads the budget and waits for the window when fewer than 40 reads remain; (b) any canonical `429` during a case fails it (`Monitor.throttled`); (c) every public category index, genre, subject and sector case carries the marker `[data-category-page]`, which every public category component renders and `NotFound` does not. Owner editor pages, the hub, home, profile and the profile root carry heading markers read from a green run |
| 5 | Register the new runner dependency in `snapshotSource()` | `replatform-e2e.test.mjs` also runs `snapshotSource` against a synthetic Git whose tracked list is enumerated in the test; the new `--error-unmatch` call fails there with `not tracked` | `tunes/scripts/no-strapi-outbound-monitor.ts` added to that synthetic tracked list. No seal was touched |
| 6 | Floors are set from the first green run | Measured: 176 executed cases, 572 distinct `/src/` modules, 45 distinct successful canonical API paths (46 on a later run). The handle is fixed for a run, so `/profiles/<handle>/…` paths do not inflate the count | `ROUTE_FLOOR = 176`, `MODULE_FLOOR = 500`, `API_FLOOR = 40` |
| 7 | Confirm the diagnostics-channel shapes on Node `24.21.0` | This host runs Node `24.14.0`; the shapes were confirmed there (CI uses `24.21.0`) | Recorded; the monitor's own unit test re-proves them on every run |
| 8 | `lifecycle-browser-support.test.ts` may pin the suite list | It asserts a subset | `no-strapi` added to the subset it checks |
