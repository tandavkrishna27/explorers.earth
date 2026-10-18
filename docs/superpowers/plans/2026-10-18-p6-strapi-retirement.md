# P6 — Strapi Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing in the product, its tests, its CI or its deploy can reach Strapi. A browser guard proves it and cannot pass vacuously. Then the owner switches off the external Strapi service and `api.localqr.earth`.

**Architecture:** Thirteen tickets in two phases. **Phase A** can ship now. It touches only code that no deployed system runs: nothing deploys `main` today, and the canonical stack P2 will deploy reads no Strapi variable. **Phase B** waits for the cutover (P2) and for P3-7, which deletes the legacy composition. Every ticket merges to `main` and must leave CI green, the canonical stack bootable, and `legacy-music` mode bootable for as long as it exists.

The guard comes **first**, not last. `e2e/replatform/no-strapi.spec.ts` lands as P6-1, so that every later deletion runs against it. It has a poisoned origin, a monitor self-test, a closure-size floor and a route-coverage floor. The last code ticket re-runs it, and that run is the evidence P6 closes on.

**Tech Stack:** TypeScript, Express 5, React 18 + Vite, PostgreSQL 15, Vitest, Playwright, GitHub Actions.

**Revision 1 (2026-10-18), written against `fork/main` = `05a252f6`.** Every load-bearing claim cites `path:line` at that commit, or a command whose output was read. Line numbers drift as P3, P5 and P6 tickets land. Re-locate each one before editing; never edit by line number alone.

---

## Before you start: what this plan decided

**1. The guard opens P6, it does not close it.** The backbone says to "close with" `no-strapi.spec.ts` (backbone P6 section). Built last, the guard protects nothing: every deletion before it is made blind. Built first, it runs against today's tree, where it is expected to pass. Reachable Strapi calls exist only on paths the guard's fixture does not take (see P6-4). So it becomes the regression check for each later ticket. Its self-test and its two floors keep that early pass from being vacuous.

**2. Not every P6 ticket is gated on P2 + P3.** The backbone gates all of P6 on both. The inventory shows Phase A is safe today:
- **Production runs nothing built from `main`.** `EXPLORERS_IMAGE` has no producer in any workflow (`docker-compose.yml:231-232`). `tunes-deploy.yml` has never succeeded. `explorers.yml` runs only on a typed manual dispatch (`explorers.yml:1-42`).
- **The canonical stack has no Strapi in it.** `deploy/production.compose.yml:86` is `canonical` and names no Strapi variable, which `production-compose.test.ts:97-98` enforces.

**3. One P6 ticket must land BEFORE P3-7, and the P3 plan does not know it.** The historical analytics read, `explorersCanonicalAnalyticsRoutes.ts:13`, dynamically imports `services/explorers-analytics-composition.ts`. That module imports `../db` (`:3`), which pulls the following into the **canonical** closure (inventory, closure walker; `node scripts/check-retired-dependencies.mjs` agrees):
- `server/db.ts`
- `shared/schema.ts`
- `config/music-local-profile.ts`
- `config/music-owned-browser-profile.ts`
- `scripts/music-uat-database.ts`

P3-7 lists `shared/schema.ts` as "imported only by legacy code" (P3 plan, P3-7 Step 3). If P3-7 deletes it while the composition still exists, canonical stops type-checking. So P6-2 must precede P3-7. Tell the orchestrator.

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

**The canonical Strapi path is broken, not live.**
- `explorers-analytics-composition.ts:25-27` throws `STRAPI_ANALYTICS_ACCESS_TOKEN is not configured`, and `deploy/production.compose.yml` sets no Strapi variable.
- `legacy ??=` (`explorersCanonicalAnalyticsRoutes.ts:13`) memoises the rejected promise, so every later owner `GET /api/explorers/analytics/events` returns 502 (`explorersAnalyticsRoutes.ts:203-205`).
- Callers: the SPA calls it only with an auth-store `token` (`explorersAnalyticsClient.ts:176`), which canonical sign-in never sets (`AnalyticsDashboard.tsx:70-85`).

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
- The five allowlisted sites are three env reads (`:38-60`) and two client constructions (`:85-100`).
- It **fails on stale entries** (`:250-269`). So every ticket that removes a site must delete its allowlist entry in the same commit.

### Frontend (`explorers-earth/`)

**`gql` documents: exactly 45 non-test documents in 12 files.** This matches the backbone. They were counted by parsing every `` gql` `` occurrence, not with a line-anchored grep. None is executed:
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
- Uploads go to S3 through the `aws-s3` provider (`docs/replatform-audit/grooming-media-auth-review.md:13`).

---

## Ticket order

| # | Ticket | Phase | Gate | Must precede |
|---|---|---|---|---|
| P6-1 | The no-Strapi browser guard | A | none | every other ticket |
| P6-2 | Retire the historical analytics read | A | **P5-1 merged** | **P3-7**, P6-3 |
| P6-3 | Take `security-containment` out of canonical; zero-allowlist ratchet | A | P6-2 | P6-12 |
| P6-4 | Remove the SPA's four Strapi REST calls | A | none | P6-8 |
| P6-5 | CI builds what deploys, and scans the bundle for Strapi | A | none | P6-12 |
| P6-6 | Delete the 45 `gql` documents | B | P3-7 merged | P6-7 |
| P6-7 | Delete Apollo Client | B | P6-6 | P6-12 |
| P6-8 | Retire the legacy SPA build and its Strapi configuration | B | **P2 proven in production**, P6-4 | P6-12 |
| P6-9 | Remove the fixture Strapi and the Strapi tooling | B | P3-7 merged | P6-10 |
| P6-10 | Drop `users`, the `0001` baseline and the analytics receipts — migration `0059` | B | **P3-9 merged** | P6-12 |
| P6-11 | Rewrite the docs that describe Strapi as current | B | P6-9 | P6-12 |
| P6-12 | Close: final guard run and evidence | B | all above | P6-13 |
| P6-13 | **Owner:** retire the Strapi service and `api.localqr.earth` | owner | P6-12 + 7 quiet days | — |

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

The guard runs the real SPA against the real canonical app and an owned, disposable PostgreSQL 15. It visits every route in the route table at two viewports and fails if any request, from any channel, heads for Strapi.

It has four properties, each of which fails loudly if the guard goes blind:

| Property | What makes it real |
|---|---|
| **Poisoned origin** | Every legacy destination the SPA can construct points at `https://strapi.poison.invalid` (`.invalid` is guaranteed never to resolve, RFC 6761). The canonical app process gets `STRAPI_*` variables pointing at the same host. A request there is a violation whatever its path. Same-origin Strapi paths (`/graphql`, `/upload`, `/api/users`, …) and the real hosts (`api.localqr.earth`, `77.42.95.255`, port `1337`) are poisoned too |
| **Monitor self-test** | Before any route runs, the guard fires one deliberate request down each channel: fetch, same-origin fetch, image, WebSocket, Worker fetch and beacon. It fails unless the monitor saw and refused every one. It also checks that an ordinary canonical call was seen and **allowed**, which proves the monitor is not simply blocking everything. The server-side monitor runs its own self-test the same way |
| **Closure-size floor** | Vite dev serves each module as its own request. The run fails unless it observed at least `MODULE_FLOOR` distinct `/src/` modules, so an app that crashed on boot, or a route table that rendered nothing, cannot pass |
| **Route-coverage floor** | The route table must cover **every** `path="…"` literal in the four route files, and stale entries fail too. The run fails unless at least `ROUTE_FLOOR` (route × viewport) cases actually executed |

**Files:**
- Create: `explorers-earth/e2e/replatform/no-strapi.vite.config.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi-monitor.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi-routes.ts`
- Create: `explorers-earth/e2e/replatform/no-strapi.spec.ts`
- Create: `tunes/scripts/no-strapi-outbound-monitor.ts`
- Create: `tunes/server/test/contracts/no-strapi-outbound-monitor.test.ts`
- Modify: `tunes/scripts/lifecycle-browser-guards.ts:21-28` (`parseBrowserSuite`)
- Modify: `tunes/scripts/profile-browser-fixture.ts` (around `:120-198`: monitor, poison env, owner onboarding, vite config choice)
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
      expect(monitor.strapi()).toEqual([]); // self-test traffic is excluded by nonce
      await fetch('https://strapi.poison.invalid/graphql').catch(() => undefined);
      expect(monitor.strapi().map((o) => o.origin)).toContain('https://strapi.poison.invalid');
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
Expected: FAIL, `Cannot find module '../../../scripts/no-strapi-outbound-monitor'`.

- [ ] **Step 3: Implement the server-side monitor**

`tunes/scripts/no-strapi-outbound-monitor.ts`. Before relying on either channel, confirm that both names, and their message shapes (`message.request.origin`/`.path` for undici; `message.request` as a `ClientRequest` with `.protocol`, `.host`, `.path` for http), exist in Node `24.21.0`:

```bash
node -e "const dc=require('node:diagnostics_channel');for(const n of ['undici:request:create','http.client.request.start'])dc.subscribe(n,m=>console.log(n,Object.keys(m.request)));fetch('https://x.invalid').catch(()=>{});require('node:http').get('http://127.0.0.1:9').on('error',()=>{})"
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

export function installOutboundMonitor(): OutboundMonitor {
  const seen: OutboundObservation[] = [];
  const onUndici = (message: unknown) => {
    const request = (message as { request: { origin: unknown; path: unknown } }).request;
    seen.push({ channel: 'undici', origin: String(request.origin), path: String(request.path) });
  };
  const onHttp = (message: unknown) => {
    const request = (message as { request: http.ClientRequest }).request;
    seen.push({ channel: 'http', origin: `${request.protocol}//${request.host}`, path: request.path });
  };
  diagnostics_channel.subscribe('undici:request:create', onUndici);
  diagnostics_channel.subscribe('http.client.request.start', onHttp);
  return {
    seen,
    strapi: () => seen.filter((o) => STRAPI.test(`${o.origin}${o.path}`) && !o.path.includes(SELF_TEST)),
    dispose: () => {
      diagnostics_channel.unsubscribe('undici:request:create', onUndici);
      diagnostics_channel.unsubscribe('http.client.request.start', onHttp);
    },
  };
}

/** Fires one request down each channel and refuses to continue unless both were seen. */
export async function selfTestOutboundMonitor(monitor: OutboundMonitor): Promise<void> {
  const nonce = randomUUID();
  await fetch(`https://strapi.poison.invalid/graphql?${SELF_TEST}${nonce}`).catch(() => undefined);
  await new Promise<void>((done) => {
    http.get(`http://127.0.0.1:1337/?${SELF_TEST}${nonce}`)
      .on('response', (response) => { response.resume(); done(); })
      .on('error', () => done());
  });
  const hits = monitor.seen.filter((o) => o.path.includes(nonce));
  if (!hits.some((o) => o.channel === 'undici' && o.origin.includes('strapi.poison.invalid'))
      || !hits.some((o) => o.channel === 'http' && o.origin.endsWith(':1337')))
    throw new Error('NO_STRAPI_OUTBOUND_MONITOR_BLIND');
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test --prefix tunes -- --run server/test/contracts/no-strapi-outbound-monitor.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the suite**

In `tunes/scripts/lifecycle-browser-guards.ts:21`, add `'no-strapi'` both to the return type union and to the loop list at `:25`:

```ts
export function parseBrowserSuite(args: string[]): 'profile' | 'auth' | 'lifecycle' | 'places' | 'place-links' | 'apps' | 'guides' | 'public-parity' | 'people' | 'apps-enrichment' | 'no-strapi' {
    const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
    if (JSON.stringify(args) === JSON.stringify(['--ack', ack]))
        return 'profile';
    for (const suite of ['auth', 'lifecycle', 'places', 'place-links', 'apps', 'guides', 'public-parity', 'people', 'apps-enrichment', 'no-strapi'] as const)
```

Then add to `tunes/package.json` `scripts`, next to `explorers:test:people-browser`:

```json
"explorers:test:no-strapi-browser": "tsx scripts/profile-browser-fixture.ts --suite no-strapi",
```

Run: `npm test --prefix tunes -- --run server/test/contracts/lifecycle-browser-support.test.ts`
Expected: PASS. It asserts a subset of suites (`:56-61`), so it should be unaffected. If it pins the exact list, extend it.

- [ ] **Step 6: Wire the runner**

`tunes/scripts/profile-browser-fixture.ts`. The `no-strapi` suite takes the default branch, the same one `profile` and `auth` use. Read the file whole first. Then:

(a) **Before the canonical app is composed** (before the `createCanonicalApp` call at `:142`), install the monitor, run its self-test, and poison the environment. Any Strapi reader that survives then calls the poisoned host and is recorded:

```ts
import { installOutboundMonitor, selfTestOutboundMonitor, type OutboundMonitor } from './no-strapi-outbound-monitor';
// …
let outbound: OutboundMonitor | undefined;
if (suite === 'no-strapi') {
  outbound = installOutboundMonitor();
  await selfTestOutboundMonitor(outbound);
  Object.assign(process.env, {
    STRAPI_URL: 'https://strapi.poison.invalid',
    STRAPI_ACCESS_TOKEN: 'no-strapi-poison',
    STRAPI_ANALYTICS_ACCESS_TOKEN: 'no-strapi-poison',
    STRAPI_JWT_SECRET: 'no-strapi-poison',
    STRAPI_PUBLIC_PROFILE_READ_TOKEN: 'no-strapi-poison',
  });
}
```

`assertBrowserEnvironment` (`lifecycle-browser-guards.ts:30-33`) forbids none of these keys. Check that before relying on it.

(b) **After the personas loop** (`:147-157`), onboard `ownerA` so that owner and public routes have a real account and handle. This copies the `auth` branch's pattern (`:161-170`):

```ts
if (suite === 'no-strapi') {
  const owner = personas.ownerA;
  const selected = await ensureInitialAccount(db, owner.userId);
  const account = await db.query<{ revision: string }>('SELECT revision::text FROM creator_accounts WHERE id=$1', [selected.accountId]);
  const onboarded = await fetch(`http://127.0.0.1:${apiPort}/api/explorers/v1/account`, {
    method: 'PATCH',
    headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: Number(account.rows[0].revision), handle: owner.handle,
      onboardingStatus: 'complete', publicProfile: true }),
  });
  if (onboarded.status !== 200) throw new Error(`No-Strapi owner onboarding failed: HTTP ${onboarded.status}`);
}
```

Before relying on these literals, confirm each of the following:
- `PATCH /api/explorers/v1/account` is the path (`explorersApiClient.ts:756-759`).
- The body keys are `handle`, `onboardingStatus: "complete"`, `publicProfile` and `expectedRevision` (`tunes/shared/explorersContract.ts:243-247` and the `RevisionInput` type).
- No `Idempotency-Key` header is required.

(c) **Choose the Vite config by suite** at `:183`:

```ts
'--config', suite === 'no-strapi' ? 'e2e/replatform/no-strapi.vite.config.ts' : 'e2e/replatform/profile.vite.config.ts'], {
```

(d) **After the browser child exits** and before cleanup, fail the run on any server-side Strapi request:

```ts
if (outbound) {
  const strapi = outbound.strapi();
  outbound.dispose();
  if (strapi.length) throw new Error(`NO_STRAPI_SERVER_VIOLATION ${JSON.stringify(strapi)}`);
  console.log(JSON.stringify({ noStrapiServer: { observed: outbound.seen.length, strapi: 0 } }));
}
```

Put it where the browser exit code is already checked, so that a browser failure and a server violation both make `main()` return non-zero.

- [ ] **Step 7: Write the Vite config**

`explorers-earth/e2e/replatform/no-strapi.vite.config.ts`. It is `profile.vite.config.ts`, except that every legacy destination is poisoned:

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
    'import.meta.env.VITE_API_URL': JSON.stringify(`${poison}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${poison}/api`),
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(poison),
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

`hmr: false` matters: it means no WebSocket is legitimate, so the monitor can treat every WebSocket as a violation. List the `VITE_*` reads in `src`, and add any that name a Strapi-shaped destination to the poison set:

```bash
grep -rhoE "import\.meta\.env\.VITE_[A-Z_]+" explorers-earth/src | sort -u
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

export type Verdict = 'poisoned' | 'local' | 'stub' | 'unknown';
export type Observation = { verdict: Verdict; method: string; url: string; resource: string };

export function classify(raw: string, origin: string, resource = ''): Verdict {
  const url = new URL(raw);
  if (POISONED_HOSTS.has(url.hostname) || url.port === '1337' || /strapi|localqr/i.test(url.hostname)) return 'poisoned';
  if (url.origin === new URL(origin).origin)
    return POISONED_SAME_ORIGIN.some((path) => path.test(url.pathname)) ? 'poisoned' : 'local';
  if (isOptionalFontRequest(raw, resource) || isOptionalLoaderImage(raw, resource)) return 'stub';
  return 'unknown';
}

export class Monitor {
  readonly observations: Observation[] = [];
  readonly modules = new Set<string>();
  violations(): Observation[] {
    return this.observations.filter((o) => (o.verdict === 'poisoned' || o.verdict === 'unknown') && !o.url.includes('nostrapi-selftest='));
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
      return route.continue();
    }
    if (verdict === 'stub')
      return request.resourceType() === 'image'
        ? route.fulfill({ status: 200, contentType: 'image/gif', body: GIF })
        : route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (socket) => {
    const url = socket.url();
    monitor.observations.push({ verdict: classify(url.replace(/^ws/, 'http'), origin) === 'poisoned' ? 'poisoned' : 'unknown',
      method: 'WEBSOCKET', url, resource: 'websocket' });
    socket.close();
  });
  return context;
}
```

**`unknown` is a violation on purpose.** Every third-party origin the app touches must be named in `classify`, so a new external call cannot hide among the passes. If the first run reports, for example, a `googletagmanager.com` script from `usePageTracking`, add it to a named stub predicate with a comment saying why. Never widen `local`.

- [ ] **Step 9: Confirm the poisoned same-origin paths are not canonical routes**

```bash
grep -rnE "['\"\`]/(graphql|upload|uploads|api/upload|api/users|api/accounts|api/auth/local|api/connect|api/strapi)" tunes/server/auth tunes/server/routes tunes/server/application | grep -v __tests__
```

Expected: only tombstone rules in `policies/*` and legacy-only routes (`routes/index.ts`, `seo-routes.ts`) — nothing mounted by `canonicalApp.ts`. If a canonical route matches a pattern, narrow the pattern rather than delete it, and record why.

- [ ] **Step 10: Write the route table**

`explorers-earth/e2e/replatform/no-strapi-routes.ts`. Each entry names the source literal it covers (`<file>:<path>`) and a concrete URL. `:listId`-style parameters take a well-formed id that does not exist, so the page runs its data-loading code and renders its not-found state. Strapi calls happen on load, so that is enough to catch them.

```ts
export type RouteCase = { source: string[]; url: (handle: string) => string; as: 'anon' | 'owner' };
const ID = '00000000-0000-4000-8000-000000000000';
const owner = (path: string, ...source: string[]): RouteCase => ({ source: source.map((s) => `ProtectedRoutes.tsx:${s}`), url: () => path, as: 'owner' });
const pub = (path: string, ...source: string[]): RouteCase => ({ source: source.map((s) => `PublicRoutes.tsx:${s}`), url: (h) => `/${h}${path}`, as: 'anon' });
const auth = (path: string): RouteCase => ({ source: [`AuthRoutes.tsx:${path}`], url: () => path, as: 'anon' });

export const ROUTES: RouteCase[] = [
  owner('/profile', 'profile'),
  owner('/recommendations', 'recommendations'),
  owner('/recommendations/places', 'recommendations/places'),
  owner(`/recommendations/places/${ID}/add-people`, 'recommendations/places/:locationId/add-people'),
  owner(`/recommendations/places/${ID}/add-products`, 'recommendations/places/:locationId/add-products'),
  owner(`/${ID}/new`, ':listId/new'),
  owner(`/${ID}/edit`, ':placeId/edit'),
  owner('/recommendations/guides', 'recommendations/guides'),
  owner('/recommendations/guides/new', 'recommendations/guides/new'),
  owner(`/recommendations/guides/${ID}`, 'recommendations/guides/:guideId'),
  owner(`/recommendations/guides/${ID}/edit`, 'recommendations/guides/:guideId/edit'),
  owner(`/recommendations/guides/${ID}/sections/new`, 'recommendations/guides/:guideId/sections/new'),
  owner(`/recommendations/guides/${ID}/sections/${ID}/edit`, 'recommendations/guides/:guideId/sections/:sectionId/edit'),
  owner('/guides/new', 'guides/new'),
  owner(`/guides/${ID}`, 'guides/:guideId'),
  owner(`/guides/${ID}/edit`, 'guides/:guideId/edit'),
  owner(`/guides/${ID}/sections/new`, 'guides/:guideId/sections/new'),
  owner(`/guides/${ID}/sections/${ID}/edit`, 'guides/:guideId/sections/:sectionId/edit'),
  owner('/analytics', 'analytics'),
  owner('/settings', 'settings'),
  owner('/home', 'home'),
  ...(['movies', 'books', 'games', 'apps', 'products', 'people'] as const).flatMap((c) => {
    const item = { movies: 'movieId', books: 'bookId', games: 'gameId', apps: 'appId', products: 'productId', people: 'personId' }[c];
    return [
      owner(`/recommendations/${c}`, `recommendations/${c}`),
      owner(`/recommendations/${c}/${ID}`, `recommendations/${c}/:listId`),
      owner(`/recommendations/${c}/${ID}/add`, `recommendations/${c}/:listId/add`),
      owner(`/recommendations/${c}/${ID}/edit/${ID}`, `recommendations/${c}/:listId/edit/:${item}`),
    ];
  }),
  { source: ['PublicRoutes.tsx::username/*'], url: (h) => `/${h}`, as: 'anon' },
  pub('/places', 'places'), pub('/places/no-such-place', ':placeSlug'), pub('/places/map', 'map'),
  pub('/places/no-such-place/map', ':placeSlug/map'), pub('/places/no-such-place/placesmap', ':place/placesmap'),
  pub('/guides', 'guides'), pub('/guides/no-such-guide', ':guideSlug'),
  pub('/movies', 'movies'), pub('/movies/genre/drama', 'genre/:genreSlug'), pub('/movies/no-such-list', ':listSlug'),
  pub('/books', 'books'), pub('/books/subject/fiction', 'subject/:subjectSlug'),
  pub('/games', 'games'), pub('/apps', 'apps'), pub('/products', 'products'),
  pub('/people', 'people'), pub('/people/sector/technology', 'sector/:sectorSlug'),
  ...['/', '/login', '/contact', '/about', '/use-cases', '/privacy', '/cookies', '/terms', '/reactivate',
    '/reactivate-confirm', '/google-auth/callback', '/email-verification'].map(auth),
  { source: ['AppRoutes.tsx:/404', 'AppRoutes.tsx:*', 'PublicRoutes.tsx:*'], url: () => '/no/such/route/at/all', as: 'anon' },
];

/** Literals deliberately not visited, each with the reason. A new literal must be added to ROUTES or here. */
export const EXCLUDED: Record<string, string> = {
  'ProtectedRoutes.tsx:/*': 'layout route; every child is visited',
  'ProtectedRoutes.tsx:recommendations/music': 'retired Music redirect; P3 removes it',
  'ProtectedRoutes.tsx:music': 'retired Music redirect; P3 removes it',
  'ProtectedRoutes.tsx:hub': 'redirect to /recommendations, which is visited',
  'ProtectedRoutes.tsx:guides': 'redirect to /recommendations/guides, which is visited',
  'ProtectedRoutes.tsx:instagram': 'P5-8 deletes the Instagram surface; remove this line when it does',
  'AppRoutes.tsx:/guides': 'StatePreservingRedirect, no data',
  'AppRoutes.tsx:/music/*': 'StatePreservingRedirect, no data',
  'AppRoutes.tsx:/hub': 'StatePreservingRedirect, no data',
  'AuthRoutes.tsx:/register': 'redirects to /login (AuthRoutes.tsx:20-28)',
  'AuthRoutes.tsx:/forgot-password': 'redirects to /login',
  'AuthRoutes.tsx:/reset-password': 'redirects to /login',
  'AuthRoutes.tsx:/reset-link-sent': 'redirects to /login',
  'AuthRoutes.tsx:/email-confirmed': 'redirects to /login',
};
```

This table was derived from `src/routes/*.tsx` at `05a252f6`. Before running it, re-derive the table and diff it:

```bash
cd explorers-earth && for f in src/routes/*.tsx; do grep -o 'path="[^"]*"' "$f" | sed "s|path=\"\(.*\)\"|$(basename "$f"):\1|"; done | sort -u
```

Do not take the redirect claims in `EXCLUDED` on trust. Open each element and check what it renders. Where a literal turns out to render data, move it to `ROUTES`. The inventory test in Step 11 enforces set equality both ways.

- [ ] **Step 11: Write the spec**

`explorers-earth/e2e/replatform/no-strapi.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext } from '@playwright/test';
import { assertFixtureOrigin } from './proxy-fixture-authority.mjs';
import { Monitor, POISON_ORIGIN, guardedContext } from './no-strapi-monitor';
import { ROUTES, EXCLUDED } from './no-strapi-routes';

type Persona = { userId: string; cookie: string; handle: string };
type Fixture = { origin: string; personas: Record<'ownerA' | 'ownerB' | 'ownerC', Persona> };
const fixturePath = process.env.PROFILE_E2E_FIXTURE_PATH;
if (!fixturePath) throw new Error('No-Strapi E2E requires the owned loopback fixture runner');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
assertFixtureOrigin(fixture);

/** Measured on first green run, then fixed here. Lower them only with a written reason. */
const MODULE_FLOOR = 450;
const VIEWPORTS = [['desktop', { width: 1365, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const;
const ROUTE_FLOOR = ROUTES.length * VIEWPORTS.length;

const RUN = new Monitor();
const executed = new Set<string>();

async function signIn(context: BrowserContext, persona: Persona) {
  const separator = persona.cookie.indexOf('=');
  await context.addCookies([{ name: persona.cookie.slice(0, separator), value: persona.cookie.slice(separator + 1),
    url: fixture.origin, sameSite: 'Lax' }]);
  // token: null mirrors production. Canonical sign-in never issues a token (store.ts:68-85), and a
  // placeholder token would re-enable a client path production cannot take.
  await context.addInitScript(({ userId, handle }) => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { isAuthenticated: true, token: null,
      user: { id: userId, documentId: userId, username: handle, email: `${userId}@example.invalid`, blocked: false } }, version: 0 }));
  }, persona);
}

function routeLiterals(): Set<string> {
  const directory = resolve(process.cwd(), 'src/routes');
  const found = new Set<string>();
  for (const file of readdirSync(directory).filter((name) => /\.tsx$/.test(name)))
    for (const match of readFileSync(resolve(directory, file), 'utf8').matchAll(/path="([^"]*)"/g)) found.add(`${file}:${match[1]}`);
  return found;
}

test.describe.configure({ mode: 'default' });

test('route table covers every route literal, and nothing stale', () => {
  const literals = routeLiterals();
  // VACUITY GUARD: an empty scan (wrong cwd, moved directory) must fail, not pass.
  expect(literals.size, 'route literal scan found nothing').toBeGreaterThan(60);
  const covered = new Set([...ROUTES.flatMap((route) => route.source), ...Object.keys(EXCLUDED)]);
  expect([...literals].filter((literal) => !covered.has(literal)), 'route literal with no case').toEqual([]);
  expect([...covered].filter((entry) => !literals.has(entry)), 'stale route case').toEqual([]);
});

test('monitor self-test: every channel to Strapi is seen and refused, and canonical is allowed', async ({ browser }) => {
  const monitor = new Monitor();
  const context = await guardedContext(browser, monitor, fixture.origin, VIEWPORTS[0][1]);
  try {
    const page = await context.newPage();
    await page.goto('/about');
    const nonce = randomUUID();
    const outcome = await page.evaluate(async ({ nonce, poison }) => {
      const q = `nostrapi-selftest=${nonce}`;
      const settle = (promise: Promise<unknown>) => promise.then(() => 'reached', () => 'refused');
      const image = new Promise<string>((done) => { const i = new Image(); i.onload = () => done('reached'); i.onerror = () => done('refused'); i.src = `http://localhost:1337/uploads/self-test.png?${q}`; });
      const socket = new Promise<string>((done) => { const s = new WebSocket(`ws://localhost:1337/self-test?${q}`); s.onopen = () => done('reached'); s.onerror = () => done('refused'); });
      const worker = new Promise<string>((done) => {
        const source = `fetch(${JSON.stringify(`${poison}/worker?${q}`)}).then(()=>postMessage('reached'),()=>postMessage('refused'))`;
        new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))).onmessage = (event) => done(String(event.data));
      });
      navigator.sendBeacon(`${poison}/beacon?${q}`, 'x');
      return {
        poisonGraphql: await settle(fetch(`${poison}/graphql?${q}`, { method: 'POST', body: '{}' })),
        sameOriginGraphql: await settle(fetch(`/graphql?${q}`, { method: 'POST', body: '{}' })),
        productionStrapi: await settle(fetch(`https://api.localqr.earth/api/users/me?${q}`)),
        image: await image, socket: await socket, worker: await worker,
        canonical: (await fetch('/api/explorers/v1/me')).status,
      };
    }, { nonce, poison: POISON_ORIGIN });
    expect(outcome).toMatchObject({ poisonGraphql: 'refused', sameOriginGraphql: 'refused', productionStrapi: 'refused',
      image: 'refused', socket: 'refused', worker: 'refused' });
    // Negative control: the canonical API answers through the monitor, so the monitor is not blocking everything.
    expect([200, 401]).toContain(outcome.canonical);
    expect(monitor.observations.some((o) => o.verdict === 'local' && o.url.endsWith('/api/explorers/v1/me'))).toBe(true);
    const expected = [`${POISON_ORIGIN}/graphql`, `${fixture.origin}/graphql`, 'https://api.localqr.earth/api/users/me',
      'http://localhost:1337/uploads/self-test.png', 'ws://localhost:1337/self-test', `${POISON_ORIGIN}/worker`, `${POISON_ORIGIN}/beacon`];
    await expect.poll(() => expected.filter((target) => !monitor.selfTest(nonce)
      .some((o) => o.verdict === 'poisoned' && o.url.startsWith(target)))).toEqual([]);
    expect(monitor.violations(), 'loading /about itself reached Strapi').toEqual([]);
  } finally {
    await context.close();
  }
});

for (const [viewportName, viewport] of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${viewportName} ${route.source.join(' + ')} makes no Strapi request`, async ({ browser }) => {
      const context = await guardedContext(browser, RUN, fixture.origin, viewport);
      try {
        if (route.as === 'owner') await signIn(context, fixture.personas.ownerA);
        const page = await context.newPage();
        const before = RUN.violations().length;
        await page.goto(route.url(fixture.personas.ownerA.handle));
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        expect(RUN.violations().slice(before)).toEqual([]);
        executed.add(`${viewportName} ${route.source.join(' + ')}`);
      } finally {
        await context.close();
      }
    });
  }
}

test.afterAll(() => {
  expect(RUN.violations(), 'Strapi or unclassified requests').toEqual([]);
  expect(executed.size, 'route-coverage floor').toBeGreaterThanOrEqual(ROUTE_FLOOR);
  expect(RUN.modules.size, 'closure-size floor').toBeGreaterThanOrEqual(MODULE_FLOOR);
});
```

Notes for the engineer:
- **Tests built in a loop are invisible to a line-anchored grep for `test(`.** Count discovered tests with `npx playwright test e2e/replatform/no-strapi.spec.ts --list`. Expect `2 + 2 × ROUTES.length`.
- **Why `serviceWorkers: 'block'`:** without it, a service worker's own fetches bypass `context.route`. The Worker case in the self-test proves dedicated workers are covered. If it fails, the monitor is blind to workers: stop and fix the monitor; do not drop the case.
- **`MODULE_FLOOR = 450` is a starting value.** The platform bundle ships 612 `src` modules, measured from the sourcemaps of a platform build at `05a252f6`. Take the first green run's `RUN.modules.size`, set the floor to 90% of it rounded down, and write the measured number in a comment.

- [ ] **Step 12: Run it**

From the repository root, with Docker running:

```bash
docker pull postgres:15-alpine
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

The environment must not contain `DATABASE_URL*`, `DOCKER_HOST`, `DOCKER_CONTEXT`, `NODE_ENV=production`, or any `REPLATFORM_E2E_*` or `PROFILE_E2E_SUITE` variable (`lifecycle-browser-guards.ts:30-33`).

Expected: every test passes, and the runner prints `{"noStrapiServer":{"observed":…,"strapi":0}}`.

**If a route test fails with a real Strapi request, that is a finding, not a flake.**
- Record the URL and the route.
- Do not widen the monitor.
- If the call is one of the four in P6-4, take P6-4 next.

- [ ] **Step 13: Prove it has teeth — three deliberate breaks, each reverted**

Each must turn the run red and name the cause. Make the change, run Step 12, see red, revert. Commit none of them.

1. Add `void fetch('/graphql', { method: 'POST', body: '{}' });` as the first line of `src/main.tsx`. Every route test should fail on a poisoned `/graphql`.
2. In `no-strapi-monitor.ts`, make the route handler `return route.continue()` for every verdict. The self-test should fail with `'reached'` outcomes or missing observations.
3. Change `MODULE_FLOOR` to `100000`. `afterAll` should fail on the closure-size floor.

- [ ] **Step 14: Add the nightly lane**

`.github/workflows/frontend-e2e-qualification.yml`, in the `replatform-real-stack` matrix after `:118`:

```yaml
          - { lane: no-strapi, command: "npm run explorers:test:no-strapi-browser --" }
```

The job appends `--ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`. Confirm that by reading the job's `run:` step.

This lane is nightly and **not required**. Making it required is P7's call, because it costs a PostgreSQL container and roughly 75 × 2 browser contexts per run. Until then, every P6 ticket's verification step runs it locally (Step 12).

- [ ] **Step 15: Typecheck and commit**

```bash
cd explorers-earth && npx tsc --noEmit -p tsconfig.app.json && cd ..
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server|scripts)/' ; cd ..
git add explorers-earth/e2e/replatform/no-strapi*.ts tunes/scripts/no-strapi-outbound-monitor.ts \
  tunes/server/test/contracts/no-strapi-outbound-monitor.test.ts tunes/scripts/lifecycle-browser-guards.ts \
  tunes/scripts/profile-browser-fixture.ts tunes/package.json .github/workflows/frontend-e2e-qualification.yml
git commit -m "test(e2e): add the no-Strapi browser guard with a poisoned origin and a monitor self-test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`tsconfig.app.json` may not include `e2e/`. If it does not, type-check the spec through Playwright's own compile with `npx playwright test e2e/replatform/no-strapi.spec.ts --list`.

---

## P6-2: Retire the historical analytics read

The last path in canonical that can reach Strapi. **Gate: P5-1 merged.** **Must precede P3-7.**

- [ ] **Step 1: Check the gate**

```bash
grep -rn "readExplorersAnalyticsEvents\|analytics/events" explorers-earth/src --include=*.ts --include=*.tsx | grep -v __tests__
grep -n "import(" tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts
```

There are three possible outcomes:
- **The first command finds a GET caller in the SPA, or `explorersAnalyticsClient.ts:169-196` still exists.** P5-1 has not repointed the dashboard. Stop. This ticket would take away a read the SPA still issues.
- **The second command prints nothing.** P5-1 already removed the dynamic import. Skip to Step 5 and delete only the now-orphaned modules.
- **Otherwise,** continue.

- [ ] **Step 2: Write the failing test**

`tunes/server/test/contracts/canonical-analytics-no-strapi.test.ts`:

```ts
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCanonicalAnalyticsDependencies } from '../../routes/explorersCanonicalAnalyticsRoutes';
import { setupExplorersAnalyticsRoutes } from '../../routes/explorersAnalyticsRoutes';
import { createLoopbackSupertestScope } from '../helpers/loopback-supertest';

const server = resolve(__dirname, '../..');

describe('canonical analytics has no Strapi path', () => {
  it('no longer loads the legacy analytics composition', () => {
    expect(readFileSync(resolve(server, 'routes/explorersCanonicalAnalyticsRoutes.ts'), 'utf8')).not.toMatch(/import\s*\(/);
    expect(existsSync(resolve(server, 'services/explorers-analytics-composition.ts'))).toBe(false);
  });

  it('answers the retired owner events read with a 404, not a 502 from a failed Strapi factory', async () => {
    const app = express();
    app.use(express.json());
    setupExplorersAnalyticsRoutes(app, createCanonicalAnalyticsDependencies({} as never));
    app.use((_request, response) => { response.status(404).json({ code: 'NOT_FOUND' }); });
    const scope = createLoopbackSupertestScope(app);
    try {
      const response = await scope.request().get('/api/explorers/analytics/events?accountId=a&from=2026-01-01&to=2026-01-02');
      expect(response.status).toBe(404);
    } finally {
      await scope.close();
    }
  });
});
```

Confirm the `createLoopbackSupertestScope` API (`tunes/server/test/helpers/loopback-supertest.ts`) and the read-scope query keys (`readScopeSchema` in `explorersAnalyticsRoutes.ts`) before relying on them.

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test --prefix tunes -- --run server/test/contracts/canonical-analytics-no-strapi.test.ts`
Expected: FAIL. The first test fails on `import(`. The second gets 502 or 403, because the composition throws `STRAPI_ANALYTICS_ACCESS_TOKEN is not configured`.

- [ ] **Step 4: Remove the historical read from canonical**

`tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts:9-19` becomes:

```ts
export function createCanonicalAnalyticsDependencies(pool: Pool): ExplorersAnalyticsRouteDependencies {
    const service = new AnalyticsService(pool), limiter = new InMemoryAnalyticsRateLimiter();
    return {
        service: { ingest: async (input, context) => { const result = await service.recordAnalyticsEvent(input, { requestId: 'analytics-ingest', resolveCountry: () => resolveCountryFromIp(context.getIp()) }); if (result.status === 'consent-denied')
                return result; return { status: 'committed', duplicate: result.status === 'duplicate', ...('eventId' in result ? { documentId: result.eventId } : {}), ...('retired' in result ? { retired: true as const } : {}) }; } },
        validatePublicTarget: async () => true, allowWrite: (request, key) => limiter.allow(request, key),
    };
}
```

In `tunes/server/routes/explorersAnalyticsRoutes.ts`:
- Delete the GET handler (`:191-206`).
- Remove `readAccountEvents` from the `service` type, and `authorizeOwner` from `ExplorersAnalyticsRouteDependencies` (`:130-133`).
- Delete `readScopeSchema` if nothing else uses it.

Leave the POST at `:143` alone. `GET` on the same path now falls through to P1's JSON 404 terminator.

- [ ] **Step 5: Delete the composition and the Strapi analytics code — same commit**

```bash
git rm tunes/server/services/explorers-analytics-composition.ts \
  tunes/server/services/explorers-analytics-receipts.ts \
  tunes/server/services/__tests__/explorers-analytics-composition.test.ts \
  tunes/server/services/__tests__/explorers-analytics-receipts.test.ts
```

Make three further edits in the same commit:

- **`explorers-analytics-adapters.ts`.** Keep only lines `1-45`: `isPrivateOrLocalIp` and `resolveCountryFromIp`, with the `geoip` import. Delete `CREATE_EVENT`, `READ_EVENTS`, `FIND_EVENT_BY_ID`, the target descriptors, `StrapiAnalyticsTargetValidator` (`:289`), `StrapiAnalyticsPublisher` (`:387`) and `verifyAnalyticsAccountOwnership` (`:500`). In `__tests__/explorers-analytics-adapters.test.ts`, keep only the `resolveCountryFromIp` describes (`:3-10` and `:520-`).

- **`explorers-analytics-service.ts`.** Delete the publisher-era exports that nothing imports any more. Check each candidate:

  ```bash
  for s in ExplorersAnalyticsService AnalyticsPublisher AnalyticsReceipt AnalyticsReceiptRepository AnalyticsPublishDispatchError NormalizedExplorersAnalyticsEvent; do echo "== $s"; grep -rn "\b$s\b" tunes --include=*.ts | grep -v node_modules | grep -v "services/explorers-analytics-service.ts"; done
  ```

  Keep `explorersAnalyticsInputSchema`, `ExplorersAnalyticsInput` and `IdempotencyConflictError`. Canonical imports them (`application/analytics.ts:4`, `repositories/explorersAnalyticsEventRepository.ts:6`, `scripts/apps-canonical-admission.ts:10`).

- **Legacy wiring.** `tunes/server/routes/index.ts:46` imports `createExplorersAnalyticsDependencies` from the deleted composition. Replace the import and its use at `:191`, so that legacy mounts the same canonical dependencies it already used (`composition.ts:60-61` returned exactly this):

  ```ts
  import { createCanonicalAnalyticsDependencies } from "./explorersCanonicalAnalyticsRoutes";
  import { pool } from "../db";
  // …
      analyticsPublishing: () => {setupExplorersAnalyticsRoutes(app, createCanonicalAnalyticsDependencies(pool));canonicalAnalyticsEnabled=true;},
  ```

  If `routes/index.ts` already imports `pool`, reuse that import. `legacy-music` must still boot, because the required platform-fixture job runs `tunes-migrate` in that mode (`docker-compose.replatform.yml:56`).

**Leave the receipts table alone.** `config/music-startup.ts:125` verifies its schema through `startup/explorers-analytics-migration.ts`, so it stays until P3-7 deletes legacy startup. The table goes in P6-10.

- [ ] **Step 6: Trim the ratchet's allowlists — same commit**

`scripts/check-retired-dependencies.mjs` fails on stale entries (`:250-269`). Run it first and read what it reports:

```bash
node scripts/check-retired-dependencies.mjs
```

Expected after Steps 4-5, as `no-stale-allowlist` violations:
- the `explorers-analytics-composition.ts` / `STRAPI_URL` env entry (`:47-54`);
- both `CLIENT_ALLOWLIST` entries (`:85-100`);
- **probably** the `config/music-local-profile.ts` / `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE` entry (`:55-60`), because that module reached canonical only through `db.ts` inside the dynamic edge.

Delete exactly the entries it reports stale. Leave `security-containment.ts` / `STRAPI_JWT_SECRET`; P6-3 removes it. Then:

Run: `node scripts/check-retired-dependencies.mjs`
Expected: `OK`, with a smaller module count. Write the new count in the commit message. If it rises, a dynamic edge was missed.

- [ ] **Step 7: Update the tests that pinned the old shape**

Run them first, then fix what fails. Do not pre-edit:

```bash
npm test --prefix tunes -- --run server/routes/__tests__/explorersAnalyticsRoutes.test.ts \
  server/test/contracts/analytics-inventory-regression.test.ts \
  server/test/contracts/api-only-early-cleanup.test.ts server/test/music-surface-policy.test.ts \
  server/test/music-startup-bootstrap.test.ts server/services/__tests__
```

Expected failures:
- `explorersAnalyticsRoutes.test.ts`: the GET cases, plus `readAccountEvents` and `authorizeOwner` in `buildApp` (`:18-36`). Delete the GET cases and the two fields.
- `analytics-inventory-regression.test.ts:5`: it asserts `decisionForRoute(GET /api/explorers/analytics/events) === 'strapi-identity'`.
  - Policy (`musicSurfacePolicy.ts:134`) still describes a route that no longer exists. Delete that policy row and the test's GET assertion.
  - Delete the matching `scripts/inventory-runtime-surfaces.ts:80` label.
  - Regenerate any generated inventory the test reads; the test's error names it.

- [ ] **Step 8: Verify, including a real canonical boot**

Integration tests inject a pool and skip startup attestation, so they cannot see a boot failure (`canonicalStartup.ts:31-35`). Run all of these:

```bash
npm test --prefix tunes -- --run server/test/contracts/canonical-analytics-no-strapi.test.ts
npm test --prefix tunes -- --run
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/' ; cd ..
node scripts/check-retired-dependencies.mjs
npm test --prefix tunes -- --run server/test/contracts/platform-route-signatures.test.ts
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

`platform-route-parity.test.ts:66` pins `EXPECTED_PLATFORM_PROBE_COUNT = 6`, and one of the probes is the analytics events route (`scripts/replatform-route-parity.ts:52-55`). Read that probe:
- If it probes **GET** `/api/explorers/analytics/events`, it now gets 404. Change the probe to the POST, which is still mounted, and keep the count at 6. The rule there is append-only (`:17-23`), so editing a probe needs a comment saying why.

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(analytics): retire the historical Strapi owner read from canonical

Canonical closure: <before> -> <after> modules (check-retired-dependencies.mjs).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then tell the orchestrator that **P3-7 is unblocked on the `shared/schema.ts` point** (decision 3 above).

---

## P6-3: Take `security-containment` out of canonical; make the ratchet absolute

After P6-2 the ratchet still allows one site: `security-containment.ts` / `STRAPI_JWT_SECRET`. That module is in canonical only for `requestIdFor` (`middleware/explorersPrincipal.ts:7`).

**Files:**
- Create: `tunes/server/http/requestId.ts`
- Modify: `tunes/server/security-containment.ts:15-22` (re-export)
- Modify: `tunes/server/middleware/explorersPrincipal.ts:7`
- Modify: `scripts/check-retired-dependencies.mjs`
- Test: `scripts/check-retired-dependencies.test.mjs` (create if absent; root `scripts/*.test.mjs` run in required `test.yml:122`)

- [ ] **Step 1: Write the failing ratchet test**

First check whether a test for the script already exists:

```bash
ls scripts | grep -i retired
```

Then create or extend `scripts/check-retired-dependencies.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('canonical closure has no Strapi site and no allowlist', () => {
  const out = execFileSync(process.execPath, ['scripts/check-retired-dependencies.mjs', '--json'], { encoding: 'utf8' });
  const report = JSON.parse(out);
  assert.deepEqual(report.allowlisted, [], 'an allowlisted Strapi site remains in the canonical closure');
  assert.deepEqual(report.violations, []);
  // VACUITY GUARD: a mis-resolved entry point yields a tiny closure that trivially contains no Strapi.
  assert.ok(report.canonicalModuleCount >= report.minimumCanonicalModules, `closure shrank to ${report.canonicalModuleCount}`);
});
```

Read the script's real report shape around `:271` (`const report = { entry, canonicalModuleCount, … }`) and its CLI handling. Use its actual field names, and add `--json`, `allowlisted` and `minimumCanonicalModules` only if they are absent.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test scripts/check-retired-dependencies.test.mjs`
Expected: FAIL. `allowlisted` holds the `security-containment.ts` entry, or the `--json` flag is missing.

- [ ] **Step 3: Move `requestIdFor`**

Read `security-containment.ts:15-22` and move the function **verbatim** to `tunes/server/http/requestId.ts`, along with any imports it uses. Then:
- In `security-containment.ts`, replace the body with `export { requestIdFor } from "./http/requestId";`, so that the legacy importers (`app.ts`, `auth.ts`, `routes/index.ts`, `routes/musicSurfaceRoutes.ts`) keep working.
- In `middleware/explorersPrincipal.ts:7`, import from `../http/requestId`.

Check that no other canonical module imports `security-containment`. Its importers outside tests are `app.ts`, `auth.ts`, `middleware/explorersPrincipal.ts`, `routes/index.ts` and `routes/musicSurfaceRoutes.ts`; only `explorersPrincipal.ts` is canonical.

- [ ] **Step 4: Make the ratchet absolute**

In `scripts/check-retired-dependencies.mjs`:
- Delete the remaining `ENV_READ_ALLOWLIST` entry. All three allowlists become `[]`; keep the arrays and the stale-entry logic, so that a re-added entry is still checked.
- Add `const MINIMUM_CANONICAL_MODULES = <90% of the measured count after this step>;`, and fail with invariant `canonical-closure-floor` when `modules.length` falls below it.
- Change the success line from "one of the 5 allowlisted legacy sites" to `OK — the canonical closure contains no Strapi construction, no STRAPI_* read and no Strapi-named module.`
- Remove the sentence "This does NOT mean Strapi is retired…" only once P6-12 passes. Until then, keep it.

- [ ] **Step 5: Run it and watch it pass, then commit**

```bash
node --test scripts/check-retired-dependencies.test.mjs
node scripts/check-retired-dependencies.mjs
npm test --prefix tunes -- --run
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/' ; cd ..
git add tunes/server/http/requestId.ts tunes/server/security-containment.ts tunes/server/middleware/explorersPrincipal.ts \
  scripts/check-retired-dependencies.mjs scripts/check-retired-dependencies.test.mjs
git commit -m "refactor(server): move requestIdFor out of security-containment; canonical closure is Strapi-free

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Two earlier claims change once this lands:
- `shared/musicError.ts` may leave canonical as well, if `security-containment.ts` was its only canonical importer. P3's "never delete" table cites `security-containment.ts:6` as its canonical path.
- The closure count moves.

Tell the orchestrator, so that P3-7's recomputed closure is read against the new reality.

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

In `handleImageUpload` (`:1703`), the canonical branch (`:1712-1729`) already returns. Replace everything from `const accountId = await resolveSelectedAccountUploadId();` (`:1731`) down to just before the `} catch (error: any) {` at `:1790`:

```ts
      throw new Error(t("dashboard.profile.common.errors.failedToGetAccountId"));
```

Make the same change in `handleBackgroundUpload` (`:1803`): keep its canonical branch (`:1810-1825`) and replace its Strapi fallback with the same `throw`.

Then delete `resolveSelectedAccountUploadId` (`:1679-1697`). Remove whichever imports became unused, checking each one first:

```bash
for s in selectExplorerAccountUploadTarget generateProfileUploadPath generateRandomFileName sanitizeUsername axios; do echo "== $s"; grep -n "\b$s\b" explorers-earth/src/pages/Profile.tsx; done
grep -rn "selectExplorerAccountUploadTarget" explorers-earth/src | grep -v "pages/Profile.tsx"
```

If `selectExplorerAccountUploadTarget` has no other caller, delete it and its tests too. Leave `generateProfileUploadPath` and friends alone if other modules use them.

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
import { scanBundle } from './check-platform-bundle-strapi.mjs';

function bundle(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), body);
  return dir;
}
const big = 'x'.repeat(600_000);

test('flags each Strapi signature', () => {
  for (const marker of ['api.localqr.earth', 'undefined/upload', 'users_permissions_users', '/upload/files/'])
    assert.ok(scanBundle(bundle({ 'a.js': big + marker }), { phase: 'A' }).findings.length > 0, marker);
});
test('a near-empty bundle fails the size floor instead of passing clean', () => {
  assert.match(scanBundle(bundle({ 'a.js': 'ok' }), { phase: 'A' }).findings.join(), /floor/);
});
test('phase B also forbids /graphql and the Apollo client', () => {
  assert.ok(scanBundle(bundle({ 'a.js': big + 'uri:"/graphql"' }), { phase: 'B' }).findings.length > 0);
  assert.equal(scanBundle(bundle({ 'a.js': big + 'uri:"/graphql"' }), { phase: 'A' }).findings.length, 0);
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
const ALWAYS = ['api.localqr.earth', 'localqr-strapi', 'undefined/upload', '/upload/files/', 'users_permissions_users', '77.42.95.255'];
const PHASE_B = ['"/graphql"', "'/graphql'", '`/graphql`', 'ApolloClient', '__APOLLO_CLIENT__'];
/** The platform bundle is ~ several MB of JS; anything under this is a broken build, not a clean one. */
const MIN_JS_BYTES = 500_000;

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

Expected: the tests pass, and the scan prints the byte count with no findings, **provided P6-4 has landed**. Before P6-4 it must fail on `undefined/upload` and `users_permissions_users`, which shows the scanner bites. Measure the real JS byte count, set `MIN_JS_BYTES` to about half of it, and record both numbers in a comment.

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

The scanner's own `node --test` must also run in CI. Find where `explorers-earth/scripts/*.test.mjs` are run today:

```bash
grep -rn "scripts/\*.test" .github/workflows
```

If nothing runs them, add `node --test scripts/check-platform-bundle-strapi.test.mjs` to the same build job.

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
Expected: FAIL, listing 12 files.

- [ ] **Step 3: Delete the documents, keeping the hooks**

The five category `api/query.ts` files also hold the live `useXCommands` hooks, so **delete the `gql` exports, not the files**. Repeat this for each file the Step 2 test lists:
- Remove each `export const X = gql\`…\`` block.
- Then remove `gql` from the `@apollo/client` import. Remove the whole import if it becomes empty.

Delete these whole files: `features/PublicHome/api/query.ts`, `features/Settings/api/mutation.ts` and `features/Profile/api/query.ts`. None of them is in the platform bundle (inventory). Before deleting each one, check it holds nothing else that is still imported:

```bash
for f in features/PublicHome/api/query.ts features/Settings/api/mutation.ts features/Profile/api/query.ts; do echo "== $f"; grep -rn "$(basename $(dirname $(dirname $f)))/api/$(basename $f .ts)" explorers-earth/src | grep -v __tests__; done
```

Delete `categoryNavigationAccountQuery` from `features/navigation/categoryNavigationApi.ts:9`. Also delete the `client?: ApolloClient<object>` compatibility parameter (`:46-47`, "never queried or mutated") together with its callers' argument.

- [ ] **Step 4: Fix the consumers — same commit**

| Consumer | Change |
|---|---|
| `e2e/public-shell-continuity.spec.ts:562-575` | Delete the `page.evaluate` that imports `PUBLIC_APP_DATA` and calls `window.__APOLLO_CLIENT__.cache.writeQuery`. Nothing reads the Apollo cache, so the seed is dead (no app code references `__APOLLO_CLIENT__`; Apollo exposes it in dev mode on its own). The canonical warm read the test checks next (`warmState.faults.set('PublicAppData', …)`) is unaffected. Run the spec to confirm |
| `e2e/contained-auth-session.spec.ts:96-139` | Both tests extract `CategoryNavigationAccount` from source and POST it to the contained `/graphql` adapter to check that it denies a wrong owner. That adapter guards a surface the app no longer uses. Delete the two tests; keep the file's other tests |
| `src/features/__tests__/recommendationMutationsPublish.test.ts:18-87` | Delete the 25 mutation-document cases. Keep the Books/Favorites/Guides describe (`:123-145`) |
| `features/Books/api/__tests__/detailQueryFields.test.ts`, `Games/api/__tests__/listVars.test.ts`, `Movies/api/__tests__/listVars.test.ts` | They test document shapes. Delete the files, or the document cases if anything else is in them |
| `PublicHome/api/__tests__/publicPlacesQuery.contract.test.ts`, `PublicProfile.gallery-contract.test.tsx`, `routes/__tests__/UsernameValidator.test.tsx` | They import `accountsDetailQuery` / `getPublicAccountBasicQuery`. Delete those imports and the assertions built on them; keep what tests canonical behaviour |
| `tunes/scripts/music-fixture-profile.ts`, `music-fixture-services.test.ts`, `scripts/music-public-prebrowser-qualification.mjs` | Only if they survived P3-7: delete the document scans |
| `e2e/setup/category-navigation.ts:95-106` | Its registered-document set becomes empty. That is harmless, because the app sends no `/graphql`. Leave it; P6-9 decides the adapter's fate |

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
- **Tests:** about 32 files using `MockedProvider` or a hand-built `ApolloClient`, e.g. `features/navigation/__tests__/surfaceHarness.tsx` and `layouts/__tests__/PublicationLayout.test.tsx`.

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

- **`src/main.tsx`.** Delete the Apollo imports (`:6-12`), `authLink` and `httpLink` (`:23-35`), `client` (`:38-44`) and the `<ApolloProvider client={client}>` wrapper (`:51`). Keep every other provider in the same order.
- **`AccountGenerationCacheReset.tsx:24` and `hooks/useLogout.ts:37`.** Delete the `client.clearStore()` calls and their `useApolloClient` hooks. The React Query clear next to them stays: it is the cache that holds account data now.
- **`src/lib/apolloCache.ts` and `lib/__tests__/apolloCache.test.ts`.** Delete both.
- **`src/__tests__/main.auth.test.tsx`.** It tests the Apollo auth link (`:77`, `:86`, `:97`). Delete those cases. Keep `:63` ("no eager Google Maps") if it is still meaningful.
- **The ~32 test files.** For each one, remove the `MockedProvider` wrapper, or the hand-built client, and its import. A test that asserted Apollo behaviour is deleted, not rewritten.

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

Expected: `200` from `/runtime-config.json`. Only the platform build serves it (`bootstrap.ts:11-12`). And the grep finds no `localqr` or `1337` proxy. Anything else means P2 is not done, and this ticket waits.

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
| Dead legacy modules | `store/store.ts:100-116` `login()` (no caller), `pages/public/PublicProfilePage.tsx` (imported nowhere). Check each with `grep -rn "<name>" explorers-earth/src` |

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
docker build -t ee-p6-8-check .
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
- **`explorers-earth/nginx.replatform.conf:35-69`.** Delete the `strapi:1337` locations.
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

## P6-10: Drop `users`, the `0001` baseline and the analytics receipts — migration `0059`

**Gate: P3-9 merged** (migration `0058`). The migration number is assigned by the orchestrator at merge; `0059` assumes nothing else lands first.

P3 deliberately kept `users` and the `0001` baseline for P6 (P3 plan, "Before you start" item 2; `0058` trailer). After P3-7 and P3-9, no canonical code reads them. The one survivor is the runtime-role attestation, and **that survivor is the trap.**

**The failure that matters most.** `db/music-runtime-role.ts` is renamed by P3-8; use its current name. It enumerates the schema at boot:
- `expectedRuntimeTables` (`:6-125`) lists `users` and the baseline tables.
- `expectedRuntimeSequences` (`:126-153`) lists their sequences.
- `assertMusicRuntimeDirectPrivilegeBoundary` probes `"TRUNCATE TABLE users"` (`:849`) and expects a privilege denial.

Drop the table without changing the probe, and the probe gets `42P01 undefined_table`, which `requirePrivilegeDenial` (`:1107`) rethrows. **Canonical then refuses to boot, with `0059` already committed.** This is the same class of failure as P3's correction #1. Migration, attestation and manifest therefore go in **one commit**, and Step 7 boots the real gate sequence against an upgraded database.

- [ ] **Step 1: Prove nothing reads these tables**

```bash
cd tunes
grep -o "CREATE TABLE[^(]*" migrations/0001_runtime_baseline.sql | sed 's/CREATE TABLE \(IF NOT EXISTS \)\?//; s/public\.//; s/"//g' > /tmp/baseline.txt; cat /tmp/baseline.txt | tr '\n' ' '
for t in $(cat /tmp/baseline.txt) explorers_analytics_receipts; do hits=$(grep -rlE "(FROM|JOIN|INTO|UPDATE|TABLE)\s+(public\.)?\"?$t\"?\b" server shared scripts --include=*.ts | grep -v __tests__ | grep -v "/test/" | tr '\n' ' '); [ -n "$hits" ] && echo "$t: $hits"; done
```

At `05a252f6` the table list is the 27 tables `team_members`, `users`, `playlists`, `songs`, `played_songs`, `playlist_songs`, `guest_interactions`, `youtube_api_usage`, `user_sessions`, `activity_logs`, `analytics_snapshots`, `user_activity`, `session`, `api_tokens`, `user_profiles`, `email_templates`, `email_logs`, `page_contents`, `seo_settings`, `system_settings`, `youtube_music_playlists`, `youtube_music`, `youtube_tokens`, `youtube_playlists`, `widgets`, `youtube_api_calls` and `playback_states`.

**Expected hits after P3-7 and P3-9:** only the runtime-role module. Any other hit is a live reader, and this ticket stops until it is gone.

Better Auth uses `auth_user`, `auth_session`, `auth_account` and `auth_verification` (`auth/betterAuth.ts:68-79`), not `users` or `session`. Confirm that too.

- [ ] **Step 2: Prove nothing in the database depends on them**

Against a scratch database migrated to `0058` (Step 7 shows how), run:

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
SELECT 'view' AS kind, v.oid::regclass::text FROM pg_class v JOIN pg_depend d ON d.objid = v.oid WHERE v.relkind = 'v' AND d.refobjid::regclass::text = ANY($1)
UNION ALL SELECT 'trigger', tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY($1);
```

Pass the 27 names plus `explorers_analytics_receipts` as `$1`. Expected: no foreign keys, no views. The only functions should be:
- `provision_music_runtime_login(name,text)` (kept by P3-9), if its body names a baseline table;
- any baseline-owned trigger functions, which this migration drops explicitly.

Record every row. `0059` must drop or rewrite each one by name. **Never use `CASCADE`.**

- [ ] **Step 3: Check production holds no rows in them**

The owner, on the host, against the production database:

```sql
SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'explorers_analytics_receipts', count(*) FROM explorers_analytics_receipts;
```

Extend this to every baseline table. Expected: zero everywhere, because the production database was created fresh at P2 and canonical never writes to these tables. **Any non-zero count stops the ticket** and goes to the owner. Start fresh means the rows are not wanted, but someone must look before they are destroyed.

- [ ] **Step 4: Write `tunes/migrations/0059_retire_strapi_baseline.sql`**

Write it from Step 2's output, in dependency order:
1. triggers on the doomed tables;
2. then their trigger functions;
3. then the tables, children before parents, with `users` last;
4. then any sequence not owned by a dropped column.

Shape:

```sql
-- 0059: retire the Strapi-era baseline (0001) and the Strapi analytics receipts.
-- Nothing reads these since P3-7 and P3-9 (P6 plan, P6-10 Step 1). Never CASCADE:
-- PostgreSQL does not record plpgsql bodies as dependencies, so CASCADE would hide
-- exactly the breakage this migration must surface.

-- (1) Triggers and trigger functions found in Step 2, each by exact name and signature.
-- (2) Child tables before parents. Every baseline table that REFERENCES users first.
DROP TABLE public.explorers_analytics_receipts;
DROP TABLE public.playback_states;
DROP TABLE public.youtube_api_calls;
-- … every remaining baseline table, in the order Step 2's FK graph requires …
DROP TABLE public.users;
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
- **Replace the `TRUNCATE TABLE users` probe** (`:849`) with a table that survives and that the runtime role must not truncate, e.g. `"TRUNCATE TABLE creator_accounts"`. Confirm against a provisioned database that the role really is denied `TRUNCATE` there; the probe exists to prove a denial.
- Remove any `GRANT`/`REVOKE` in `provisionMusicRuntimeLogin` (`:635-792`) that names a dropped table. A `GRANT` on a missing table is an error.

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
grep -rn "0058_" --include=*.ts --include=*.mjs --include=*.json --include=*.yml --include=*.sh --include=*.py . | grep -v node_modules | grep -v "^./tunes/migrations/"
```

- [ ] **Step 7: Run the gate's whole sequence against a fresh database AND an upgraded one**

The integration suite injects a pool and skips the attestation, so it cannot see the crash described above. Reproduce the gate's sequence, in order, as P3-9 Step 7 does:
1. the two pre-migration checks;
2. migrate to `0059`;
3. provision and verify the runtime login;
4. `verifyMusicRuntimeDatabaseConnection` (or its renamed form) with the runtime role's connection, which is what `canonicalStartup.ts` runs at boot.

Run it twice: on a fresh database, and on one first provisioned at `0058` and then upgraded. Put it in `tunes/server/test/migrations/strapi-baseline-retirement.integration.test.ts`:

```bash
npm test --prefix tunes -- --run --config vitest.integration.config.ts server/test/migrations/strapi-baseline-retirement.integration.test.ts
```

Use the exact CI PostgreSQL URL and the `MUSIC_C3`–`MUSIC_C9` flags, as in `tunes.yml:120-126`. Then boot the real server against the upgraded database:

```bash
npm --prefix tunes run explorers:test:no-strapi-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

The runner migrates its own database through the whole chain and boots `createCanonicalApp`. A green run means the attestation accepted `0059`.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(db): 0059 retires the Strapi-era baseline and analytics receipts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**No image rollback after this.** `readiness.ts:13` requires an exact migration-id match, so an image older than `0059` refuses to boot. Deploy it like P3-9: back up first (P5b), and keep the owner informed.

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

Write the final `MODULE_FLOOR`, `ROUTE_FLOOR`, `MINIMUM_CANONICAL_MODULES` and `MIN_JS_BYTES`, with their measured values, into the PR body. If a floor fell since P6-1, say why. Deleting Apollo removes modules, so a lower module count is expected. A floor that **rose** is fine.

- [ ] **Step 3: Remove the "does NOT mean Strapi is retired" line** from `check-retired-dependencies.mjs`. Then commit and push.

- [ ] **Step 4: Tell the orchestrator** that P6 is code-complete and P6-13 can start its quiet period.

---

## P6-13: Owner — retire the Strapi service and `api.localqr.earth`

**Owner actions.** Nothing in the repo does any of this. The engineer prepares the commands and reads the results back. The owner has Strapi admin access through `api.localqr.earth` in their own Chrome, plus GitHub, but **no server SSH** (owner access record, 2026-10-18). Every step needing SSH, AWS or Hetzner console access waits on the owner.

- [ ] **Step 1: Quiet period — seven days with no traffic to Strapi from the product**

After P6-12, Strapi should receive no request from `explorers.earth`. The owner checks for **requests during the last seven days with an `Origin` or `Referer` of `explorers.earth`**, using whichever of these exists:
- Strapi's access log on LocalQR-Strapi-Prod;
- the reverse proxy in front of it;
- the Hetzner/CDN metrics.

Any such request means a client this plan missed, very likely a stale tab or an old cached legacy bundle. Wait out a cached bundle; anything else goes back to the engineer.

- [ ] **Step 2 (optional): Export the content**

Production Strapi holds only test and team data, and start fresh means none of it is imported. Only if the owner wants a keepsake:
- **(a)** Take an RDS snapshot through the AWS console. It is the cheapest and most complete option. **The production and dev Strapi share one RDS** (`music-local-development.md:97`), so one snapshot covers both.
- **(b)** Or export the content types through the Strapi admin UI.

Media lives in the Strapi S3 bucket (`grooming-media-auth-review.md:13`). Copy it only if wanted. **No task in this plan reads the export.**

- [ ] **Step 3: Confirm the Strapi S3 bucket is not the canonical media bucket**

Compare the bucket in the production `.env` on the explorers host (`EXPLORERS_MEDIA_BUCKET`, or whatever P2's `deploy/production.env.example` calls it) with the Strapi `aws-s3` provider's bucket (Strapi admin → Settings, or the Strapi server env).

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
3. **Delete** the two Hetzner CAX21 servers, LocalQR-Strapi-Prod and LocalQR-Strapi-Dev (`database-change-feature.md:24-28`).
4. **Delete** the RDS instance, **only after** Step 2's snapshot decision. This is irreversible.
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
5. **Making the no-Strapi lane required** (P6-1 Step 14). It is nightly here. P7 owns the cost trade-off.

---

## Self-review

**Coverage against the backbone's P6 line:**
- "Six server call sites." Re-verified at module granularity, and two more found outside both closures. Five die in P3-7, the sixth in P6-2, and the two outliers in P6-9.
- "Analytics events route is the last live dependency inside canonical, so P5-1 is its prerequisite." Confirmed for network calls, and found to be broken rather than live. P6-2 is gated on P5-1.
- "Frontend is mostly deletion — no Apollo operation executes; 45 `gql` documents are inert." Confirmed at 45. Inert by absence of callers, not by a guard, with 35 shipping in the bundle. P6-6 and P6-7 delete them.
- **`no-strapi.spec.ts` with its four properties.** Covered by P6-1: poisoned origin (Step 7 and Step 6a), monitor self-test (Step 11, plus `selfTestOutboundMonitor`), closure-size floor (`MODULE_FLOOR`), route-coverage floor (`ROUTE_FLOOR` and the literal-inventory test). Step 13 proves each one can fail.

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

*To be filled in by the review pass below; each row states what this revision said and what the code says.*
