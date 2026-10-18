# P2 — Cutover to Canonical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the whole of explorers.earth — SPA, API and database — on the explorers host
running the canonical backend, with Strapi no longer in the request path.

**Architecture:** A **new, parallel** stack. Host nginx terminates TLS, serves the SPA from
disk, and proxies `/api`, `/graphql` and `/socket.io` to a canonical API container with
PostgreSQL beside it. CI builds the API image and renders the SPA plus its runtime files.
**Nothing in the existing Music production stack is touched** — see
[What P2 does not touch](#what-p2-does-not-touch).

**Tech Stack:** GitHub Actions, Docker Compose, nginx, PostgreSQL 15, Vite, Express 5.

**Gated on P1** from Task 4 onward. Tasks 1–3 need nothing from it.

**Revision 2 (2026-10-18).** Rewritten after two independent reviews against the real code.
Eleven defects were confirmed, one of which would have taken live production down. They are
listed in [Corrections from review](#corrections-from-review) so nobody re-introduces them.

---

## What P2 does not touch

Revision 1 had a task that flipped `EXPLORERS_API_MODE` to `canonical` in the root
`docker-compose.yml` and deleted its Strapi variables, presented as a safe standalone commit.
**It would have broken live production.** That file is the running Music stack's compose
authority; line 9 lives in the `x-tunes-environment` anchor merged into both `tunes-blue` and
`tunes-green`. Flipping it routes both slots through `canonicalStartup`, which then crashes on
four Better Auth variables and three media variables the anchor does not contain, against a
database no one migrated — on the next `compose up`, slot restart or host reboot.

So, explicitly, **P2 leaves all of the following alone**:

| Artifact | Why it stays until P3 |
|---|---|
| root `docker-compose.yml` | The Music stack's compose file, on the Music host. The new deployment uses a different file on a different host |
| `EXPLORERS_API_MODE: legacy-music` at `:9` | Correct for that file. `music-deployment-files.test.ts:46` rightly asserts it |
| The nine Strapi variables | Still required by the stack that still runs |
| Traefik, the `explorers` container, `tunes-blue`/`green`/`gate` | `auditDeploymentAuthority` (`music-deployment.ts:366`) requires `tunes-blue:`, `tunes-green:`, `tunes-gate:` and `--providers.file.directory=/deployment-routing` to be present in root compose, and `music-deployment-files.test.ts:123` asserts it returns no issues |
| `tunes/deployment/music-deploy-engine.sh` | The same audit (`:359-362`) requires `music-router.yml`, the migration marker, `/health/ready` and `transaction_current` to be present in it |

Deleting any of those means changing `auditDeploymentAuthority` in the same commit. That is a
coherent piece of work — and it is **P3's**, together with the rest of Music removal. P2 adds;
P3 subtracts.

---

## The architectural decision this plan makes

The owner's decision — *"the whole application on the server we use for the explorers frontend,
nginx in front, SPA static files, `/api` proxied locally"* — still leaves one real choice, and
the repo contains both answers half-built.

| | A — host nginx serves files *(chosen)* | B — host nginx proxies two containers |
|---|---|---|
| SPA | `dist/` on disk, scp'd | `web` container running `nginx.platform.conf` |
| Runtime files | rendered **in CI** | rendered by a `render` container into a volume |
| Images to build | one (API) | two (API + web) |

**Why A.** The revived workflow already scps `dist/` and reloads host nginx, so A is the shape
that exists. B needs a web image that **nothing in the repo builds** — `EXPLORERS_IMAGE` has no
producer, and `explorers-earth/Dockerfile`'s `platform-runner` stage is referenced by no
workflow and needs both `--target platform-runner` and a named build context
`platform-shared=./tunes/shared` (`explorers-earth/Dockerfile:53`) to build at all.

**What A costs, and this is the part revision 1 got wrong.** `nginx.platform.conf` is not just
a file server — it `include`s `/runtime-web/headers.conf` at `server{}` scope **and again
inside five `location` blocks**, because nginx `add_header` replaces rather than merges. That
file carries the entire Content-Security-Policy. Choosing A means **Task 4 must reproduce every
one of those includes**, or the application ships with no CSP at all. It also sets
`Cache-Control: no-store` on `/index.html` and `/runtime-config.json`; dropping the first turns
Task 7's atomic symlink swap into a cached-shell-against-new-assets failure.

The full set A must reproduce, from `nginx.platform.conf`:

```nginx
include /runtime-web/headers.conf;                      # server scope
location = /runtime-config.json { … include …; add_header Cache-Control "no-store" always; }
location = /index.html         { … include …; add_header Cache-Control "no-store" always; }
location = /robots.txt         { … include …; add_header Cache-Control "no-store" always; }
location = /sitemap.xml        { … include …; add_header Cache-Control "no-store" always; }
location ^~ /api       { return 503; }      # becomes a proxy under A
location ^~ /socket.io { return 503; }      # becomes a proxy under A
location = /graphql    { return 503; }      # becomes a proxy under A
location /assets/ { try_files $uri =404; include …; add_header Cache-Control "public,max-age=31536000,immutable" always; }
location / { try_files $uri /index.html; }
```

---

## What changed since the backbone was written

Three backbone tickets dissolved under verification. Do not restore them.

| Backbone said | Verified |
|---|---|
| **P2-0:** `verifyRelease` always throws — a blocking precondition | **Dead code.** `platform-release-contract.ts:68` is reached only from `scripts/platform-release.ts:32`, run only by `npm run platform:release`, invoked by **no** workflow, compose file or script |
| **P2-0:** ECR 429 blocks the build | Reached only through `FROM` lines; `tunes.yml:144` already uses `type=gha` cache. A retry concern |
| **P2-1 / P2-3:** bootstrap on the legacy image; re-host the deploy engine | Both belong to the blue/green engine, which P3 deletes |
| **P2-5:** disable `music-reconcile` before cutover or it reconciles against an empty table | **It cannot write.** Four independent gates (Task 8). Housekeeping, not a cutover risk |

Three things the backbone did not know, all real work:

- **The SPA silently loses its Google Maps key in a platform build.** Nineteen direct reads of
  `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` across eleven files; `vite.platform.config.ts` sets
  `envPrefix: []`, so every one becomes `undefined`. Task 1.
- **`src/pages/Register.tsx:85` hardcodes `https://api.localqr.earth/api`** and redirects to
  Strapi's `/connect/google`, outside any mode switch. Task 1.
- **Seven image-URL builders fall back to `http://localhost:1337`** in a platform build, so every
  profile and recommendation image becomes a blocked mixed-content URL. Task 1.

---

## Facts an engineer needs before starting

**Where the code is.** `origin/main` = `10a3cd4a`. The primary working directory is on
`codex/profile-settings-tabs` and has none of it. `C:/Users/TK/ee-audit-main` is a read-only
checkout at that commit. Cut a worktree from `origin/main` as in P1's Task 0.

**The SPA will not render at all without a valid `/runtime-config.json`.**
`src/bootstrap.ts:11-15` fetches it before importing `main`, and on any failure replaces `#root`
with *"The application configuration is unavailable."* The contract
(`src/lib/publicRuntimeContract.ts:10-29`) is unforgiving: `version` exactly `1`; `environment`
exactly `'qa'` or `'production'`; `apiPath` exactly `'/api'`; `socketPath` exactly
`'/socket.io'`; `origin` an `https:` origin with no path, query, fragment or credentials and
**byte-identical to `window.location.origin`**; `mapsBrowserKey` optional matching
`/^[A-Za-z0-9_-]{16,200}$/`; unknown keys rejected; no partial defaults.

**Five independent couplings force one origin.** The runtime-config origin check; Better Auth's
`trustedOrigins` typed `[string]`, a one-element tuple that *cannot* hold a second origin
(`betterAuth.ts:12`); explicit `request.get("origin") !== config.baseURL` 403s on every mutating
canonical route with **no CORS middleware anywhere**; `SameSite=Lax` cookies that must survive
the Google OAuth redirect; and every SPA fetch being root-relative with no base-URL injection
point.

**The API serves no static files.** `canonicalStartup.ts` never calls `serveStatic`.

**`/socket.io` has no listener in canonical mode.** The contract hardcodes the path, Music's
socket server mounts at `/ws`, and `canonicalStartup` starts none. Proxy it to the API so it
answers P1's JSON 404 rather than the SPA shell.

**Migrations are a one-shot container.** The new file uses a `migrate` service with
`api: depends_on: migrate: service_completed_successfully`, which `compose up -d` honours.

**The database needs three distinct principals.** A migrator/owner that is superuser or owns the
database; `music_runtime`, a NOLOGIN capability role **created by migration
`0010_least_privilege_runtime_role.sql:9`** — do not create it by hand; and a runtime login that
inherits it. At boot the API asserts the runtime login has schema `USAGE` and **does not** have
database `CREATE`, database `TEMP` or schema `CREATE` (`music-runtime-role.ts:328-331`).
Passwords come from files, base64url, ≥32 decoded bytes. **`DATABASE_URL` being set at all is a
hard error** (`music-database-config.ts:29`).

**Secret files must be `0600` and root-owned, with no symlink in the ancestor chain.**
`secure-music-secret-file.ts:300-311` requires `mode & 0o077 === 0`, `nlink === 1`, and
`uid === 0 || uid === geteuid()`. Docker-native `secrets:` mount at `0444` and **fail** this —
use bind mounts. This works only because `tunes/Dockerfile` declares no `USER`, so the container
runs as root. That is load-bearing.

**The target database must be genuinely empty.** `migrate.ts:176-196` aborts with
`unversioned application tables conflict` if any application table exists without the journal.

**No extensions are required.** Zero `CREATE EXTENSION` across all 56 migrations.

**`account_category_settings` needs no seeding.** `initialAccount.ts:25-27` inserts the category
rows and `account_presentation` per account at sign-up.

---

## Rollback is not real

- **56 migrations, zero down-files.** The migrator cannot load one — its filename pattern is
  `/^(\d{4})_([a-z0-9_]+)\.sql$/` (`migrate.ts:10`) — and *down*, *rollback* and *revert* appear
  nowhere in it.
- **An older image crashes rather than running.** `verifyMusicDatabase` throws when the database
  is ahead of the image's bundled chain; `canonicalStartup.ts:38` turns that into a startup
  crash. This lives **inside the image**.
- **Better Auth rows accumulate from the first sign-in** and nothing reverses them.

**The recovery plan is forward-only: fix and redeploy.** The genuine safety net is a database
backup taken before the first deploy, which nothing in the repo automates.

---

## Task 1: Stop the SPA calling Strapi and losing its Maps key

Pure frontend. No host, no P1. **Ship this first** — it is the only task whose bugs are
invisible until production.

**Files:**
- Modify: `src/pages/Register.tsx`, eleven map call sites, seven image-URL builders
- Test: `explorers-earth/src/lib/__tests__/platformBuildLeaks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// explorers-earth/src/lib/__tests__/platformBuildLeaks.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(__dirname, "..", "..");

/**
 * vite.platform.config.ts sets `envDir: false` and `envPrefix: []`, so a platform
 * build inlines NO environment variable of any prefix. Every direct
 * `import.meta.env.VITE_*` read evaluates to `undefined` in production and falls
 * through to its `||` default. The build succeeds, the bundle check passes, and
 * the failure only appears in a browser.
 */
function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") sourceFiles(path, found);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

function offenders(pattern: RegExp, allowed: readonly string[] = []): string[] {
  return sourceFiles(SOURCE_ROOT)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"))
    .filter((path) => !allowed.includes(path));
}

describe("platform build leaks", () => {
  it("routes the Google Maps browser key through exactly one module", () => {
    // Break caught: a platform build ships with every map, Places autocomplete and
    // Street View call missing its key. They fail per-request, so the page renders
    // and only the maps are blank.
    expect(offenders(/import\.meta\.env\.VITE_GOOGLE_MAPS_API_KEY/,
      ["lib/publicRuntimeConfig.ts"])).toEqual([]);
  });

  it("never reaches Strapi from a hardcoded origin", () => {
    // Break caught: Register.tsx sends the user to Strapi's OAuth endpoint
    // regardless of build mode, so sign-up depends on the system being retired.
    expect(offenders(/api\.localqr\.earth/)).toEqual([]);
  });

  it("never reaches a localhost origin outside the runtimeOrigin() guard", () => {
    // Break caught: eight image-URL builders default to http://localhost:1337 when
    // VITE_REST_API_URL is undefined, which it always is in a platform build. Every
    // profile and recommendation image becomes a blocked mixed-content request with
    // no error anywhere — the single most visible cutover defect.
    //
    // NOT "the string is absent": Step 5 keeps the legacy expression as the
    // argument to runtimeOrigin(legacy), so the legacy build is unchanged, and that
    // argument contains localhost:1337. Assert that every occurrence sits inside a
    // runtimeOrigin(...) call, and confirm the test still fails when one is unwrapped.
  });
});
```

- [ ] **Step 2: Run it and take the offender list from the output, not from this plan**

```bash
cd explorers-earth && npx vitest run src/lib/__tests__/platformBuildLeaks.test.ts
```

Expected: three failures printing real paths. For reference, the audited counts are **eleven
files / nineteen occurrences** for the maps key — `AddPlaceOverlay.tsx` (1),
`AddRecommendation.tsx` (**4**), `RecommendForm.tsx` (1), `TopPlacesByCategory.tsx` (**5**),
`useAddRecommendation.ts` (1), `useCreateLocation.ts` (**2**), `locationImageService.ts` (1),
`googlePhotosService.ts` (1), `googlePlaceService.ts` (1), `OnBoarding.tsx` (1),
`placeDetailsFetcher.ts` (1) — and exactly one `api.localqr.earth`. **The test is
authoritative.**

- [ ] **Step 3: Use the accessor that already exists — do not write a new one**

`mapsBrowserKey()` at `src/lib/publicRuntimeConfig.ts:14` is already exactly right:

```ts
export function mapsBrowserKey(): string { return isCanonicalRuntime() ? getPublicRuntimeConfig().mapsBrowserKey ?? '' : import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''; }
```

Eight call sites already use it. Replace the nineteen direct reads with `mapsBrowserKey()`,
converting all occurrences in a file together.

- [ ] **Step 4: Fix `Register.tsx`**

Lines 79-87 are a synchronous fire-and-forget handler:

```ts
const backendBase = "https://api.localqr.earth/api";
window.location.href = `${backendBase}/connect/google?prompt=select_account`;
```

The canonical path is **`authClient.startGoogleSignIn(recovery = false)`** at
`src/lib/authClient.ts:41` — a method on the exported `authClient` object, **not** a free
`signInWithGoogle`. It is `async`, it **throws** on every failure path, and it calls
`useAuthStore.getState().verificationFailed(generation, "error")` before rethrowing. So the
handler must become `async` with a `catch` that surfaces the error. Read the method first and
match how `Login.tsx` calls it rather than inventing error handling.

- [ ] **Step 5: Fix the `localhost:1337` fallbacks**

Seven builders do `import.meta.env.VITE_REST_API_URL?.replace("/api","") || "http://localhost:1337"`:
`ProfileSetupAccordion.tsx:77`, `appHelpers.ts:180`, `gameHelpers.ts:160`, `personHelpers.ts:203`,
`productHelpers.ts:153`, `ProfileRecommendationsTab.tsx:117`, `Home.tsx:128,139`.

Route them through `runtimeOrigin(legacy)` (`publicRuntimeConfig.ts:9`), which returns the
runtime config's origin under `isCanonicalRuntime()` and the argument otherwise. That preserves
the legacy build exactly and fixes the platform build.

- [ ] **Step 6: Raise the six Strapi `/upload` calls — do not silently fix them**

`Checkout.tsx:171,362`, `Profile.tsx:1685,1751,1849`, `AddRecommendation.tsx:774` build
`${VITE_REST_API_URL}/upload…`. In a platform build that resolves to the *relative* path
`undefined/upload`, so they hit `https://explorers.earth/undefined/upload` and get P1's JSON
404 — they never reach Strapi. Three are avatar and feed uploads with **no canonical
equivalent** in this task; media moves to `/api/explorers/v1/media`, which is a product change.

List each with its current behaviour in the commit message and raise them with the owner.
This is open question 3.

- [ ] **Step 7: Run the whole frontend lane, serially**

```bash
cd explorers-earth && node ./scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Note the path — the runner is under `scripts/`, and `run` is required. It is the only thing that
catches DTO-shape regressions across features.

- [ ] **Step 8: Commit**

```bash
git add explorers-earth/src
git commit -m "fix(spa): route the maps key and image origins through runtime config

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: A production apply path for the 335 Places taxonomy terms

Without this the category picker renders an empty `<option>`, owner cards show raw UUIDs, and
every public place label is blank — silently.

The apply logic is **already complete and correct**: validation, planning, conflict detection,
idempotency and an immutable receipt. What is missing is an invocation surface, and — the part
revision 1 missed — a way to get both the script and its data into the production image.

**Files:**
- Create: `tunes/scripts/apply-reviewed-taxonomy.ts`
- Modify: `tunes/package.json` (esbuild entry), `tunes/Dockerfile`, `tunes/scripts/taxonomy-owned-import.ts`
- Test: `tunes/server/test/scripts/apply-reviewed-taxonomy.test.ts`

- [ ] **Step 1: Confirm the packaging problem before writing code**

```bash
cd /c/Users/TK/ee-audit-main && sed -n '55,66p' tunes/Dockerfile && grep -n '"build:api"' tunes/package.json && sed -n '8,12p' tunes/scripts/taxonomy-owned-import.ts
```

Three facts you must design around:

- The `runner` stage copies **only** `node_modules`, `auth-runtime`, `dist`, `package.json`,
  `drizzle.config.ts`, `shared`, `migrations`. No `scripts/`, no `fixtures/`.
- `build:api` esbuilds exactly four entrypoints, all under `server/`, with `--outbase=server`.
  Nothing under `scripts/` can reach `dist/`.
- `npm`, `npx` and `tsx` are **deleted** from the runtime image (`tunes/Dockerfile:34,47-48`),
  and the output is ESM — so `npm run`, `tsx` and `require()` are all unavailable inside it.
- The fixture lives at **repo-root** `fixtures/taxonomy/real-strapi-20261013/`, which
  `taxonomy-owned-import.ts:10` resolves as `../../fixtures/…` and then validates with
  `z.literal` plus `realpathSync` equality. The image build context is `./tunes`, so it is
  outside the context entirely and cannot be redirected by a flag.

- [ ] **Step 2: Write the failing test**

Split the synchronous fixture check from the async principal check — `resolveMusicDatabaseConnection`
is `async`, so `expect(() => …).toThrow()` cannot observe it.

```ts
// tunes/server/test/scripts/apply-reviewed-taxonomy.test.ts
import { describe, expect, it } from "vitest";
import { resolveTaxonomyApplyPlan, assertMigratorPrincipal } from "../../../scripts/apply-reviewed-taxonomy";

describe("reviewed taxonomy apply surface", () => {
  it("loads exactly the reviewed Places vocabulary", () => {
    // Break caught: the loader is pointed at a different directory or an edited
    // fixture and a partial vocabulary reaches production.
    const plan = resolveTaxonomyApplyPlan();
    expect(plan.places.terms).toHaveLength(335);
    expect(plan.places.terms.filter((term) => term.parentId === null)).toHaveLength(25);
    expect(plan.places.sourceMappings).toHaveLength(335);
  });

  it("does not apply the empty People vocabulary", () => {
    // Break caught: people-import.json has ZERO terms. Flipping that catalog to
    // CONFIGURED is worse than UNCONFIGURED — the UI stops saying "not configured"
    // and just shows nothing — and 0053:16-17's CHECK forbids version>0 with no
    // default_locale, so it would fail mid-transaction anyway.
    const plan = resolveTaxonomyApplyPlan();
    expect(plan.people.terms).toHaveLength(0);
    expect(plan.appliesPeople).toBe(false);
  });

  it("refuses to run as the runtime role", async () => {
    // Break caught: wired with MUSIC_DATABASE_USER, the apply fails on a permission
    // mid-transaction. The import writes taxonomy_catalogs, which the runtime role
    // cannot do — assertMusicMigratorAuthority requires superuser or datdba.
    await expect(assertMigratorPrincipal({ MUSIC_DATABASE_USER: "music_app",
      MUSIC_DATABASE_MIGRATOR_USER: "music_app" } as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it**

```bash
cd tunes && npx vitest run server/test/scripts/apply-reviewed-taxonomy.test.ts
```

Expected: `Failed to resolve import "../../../scripts/apply-reviewed-taxonomy"`.

- [ ] **Step 4: Move the fixture inside the build context**

Move `fixtures/taxonomy/real-strapi-20261013/` to `tunes/fixtures/taxonomy/real-strapi-20261013/`
and update the `reviewedTaxonomyInputDirectory` constant at `taxonomy-owned-import.ts:10`. The
loader validates the directory with `z.literal` against that same constant, so both follow
together; `public-parity-owned-composition.ts` reads the constant rather than a literal path, so
the Windows e2e fixture follows automatically. Verify that:

```bash
cd tunes && grep -rn "real-strapi-20261013" --include=*.ts --include=*.mjs --include=*.json . | grep -v node_modules
```

Every hit must be the constant or the moved files — a hardcoded path elsewhere means another
edit.

- [ ] **Step 5: Write the script**

Create `tunes/scripts/apply-reviewed-taxonomy.ts` exporting `resolveTaxonomyApplyPlan()`
(synchronous, over the fixture), `assertMigratorPrincipal(environment)` (async) and a main
guard. It must:

- call `loadReviewedTaxonomyInputs({ fixedDirectory, expectedManifestHash })` with the hash
  already pinned at `public-parity-owned-composition.ts:106`
  (`0087cf143b6f8ae68f60087539083bd0f7992c50c846b4c98a02dc1e9155ccff`)
- build a **migrator** pool via `resolveMusicDatabaseConnection(process.env, "migrator")` and
  refuse when migrator and runtime users match
- support `--dry-run` → `dryRunTaxonomyCatalogImport(pool, raw)` and `--apply` →
  `applyTaxonomyCatalogImport(pool, raw, reviewedBy)`. Note `reviewedBy` is validated: a
  non-blank string, 1–200 chars, no control characters, else *"Reviewed operator identity
  required"*. Take it from an argument, not a placeholder.
- apply **Places only**
- print the receipt id on success

`applyTaxonomyCatalogImport` takes `raw: unknown` and **re-validates** it through
`snapshot()` + Zod. `loadReviewedTaxonomyInputs` returns a `deepFreeze`d object, so passing
`plan.places` straight through is exactly the case that can throw late — Step 7 is where you
find out.

- [ ] **Step 6: Make it reachable inside the image**

Add `scripts/apply-reviewed-taxonomy.ts` to the `build:api` esbuild entry list, and give it
`--outbase=.` or a second esbuild invocation so it lands at a predictable path — `--outbase=server`
cannot emit anything outside `server/`. Then add `COPY fixtures ./fixtures` to the `runner`
stage. Invoke it as `node dist/scripts/apply-reviewed-taxonomy.js` (ESM, no `require`).

**The `COPY` source is `fixtures`, not `tunes/fixtures`.** The build context is `./tunes`
(`.github/workflows/tunes.yml:136`), so every path in that Dockerfile is already relative to it —
which is why the existing line reads `COPY migrations ./migrations` and not `COPY tunes/migrations`.
Writing `COPY tunes/fixtures` fails the build outright.

Confirm both:

```bash
cd tunes && npm run build:api && ls dist/scripts/apply-reviewed-taxonomy.js
docker build -t ee-taxonomy-check ./ --file ./Dockerfile 2>&1 | tail -3
docker run --rm --entrypoint sh ee-taxonomy-check -c "ls dist/scripts/ fixtures/taxonomy/"
```

- [ ] **Step 7: Prove it against a real database, both ways**

```bash
cd tunes && npm run platform:local -- provision
npx tsx scripts/apply-reviewed-taxonomy.ts --dry-run
npx tsx scripts/apply-reviewed-taxonomy.ts --apply --reviewed-by "<your name>"
npx tsx scripts/apply-reviewed-taxonomy.ts --apply --reviewed-by "<your name>"
```

Expected: the dry run plans 335 `term:add:` operations; the first apply commits and prints a
receipt; **the second is an idempotent no-op at the same catalog version**. The import enforces
`catalogVersion === observed + 1`, so a second apply that *increments* means idempotence is
broken — that is the failure to watch for.

```bash
docker exec explorers-replatform-local-postgres-1 psql -U postgres -d music_fixture -c "SELECT category,state,version,default_locale FROM taxonomy_catalogs"
```

Expected: `places | CONFIGURED | 1 | en` and `people | UNCONFIGURED | 0 |`.

- [ ] **Step 8: Commit**

```bash
git add tunes/scripts tunes/fixtures tunes/Dockerfile tunes/package.json tunes/server/test/scripts
git commit -m "feat(taxonomy): add a production apply surface for the reviewed Places vocabulary

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The production canonical compose graph

A **new** file. It does not replace root compose and does not run on the Music host.

**Files:**
- Create: `deploy/production.compose.yml`, `deploy/production.env.example`
- Test: `tunes/server/test/deployment/production-compose.test.ts`

- [ ] **Step 1: Enumerate what the migration gate needs — this is where revision 1 failed**

```bash
cd /c/Users/TK/ee-audit-main && sed -n '1,30p' tunes/server/deployment/run-migration-gate.ts
```

The gate reads a **different and larger** set than the API, and a compose file that satisfies
the API alone dies on line 13 before touching PostgreSQL:

| Variable | Where | Effect if missing |
|---|---|---|
| `MUSIC_IMAGE_DIGEST`, `MUSIC_IMAGE_COMMIT`, `MUSIC_MIGRATION_MARKER` | `:10` via `deploymentImageFromEnvironment` | marker must equal `0056_explorers_app_enrichment_jobs`, else throws on the first statement |
| `MUSIC_GATE_ATTESTATION_PATH` | `:13` | hard throw, before any database work |
| `MUSIC_GATE_ATTESTATION_KEY` | `:12` | throws if under 32 chars |
| `MUSIC_DATABASE_USER` / `MUSIC_DATABASE_PASSWORD_FILE` | `:16` | **on the gate these are the MIGRATOR**, resolved from the same names the API uses for the runtime role |
| `MUSIC_RUNTIME_DATABASE_USER` / `MUSIC_RUNTIME_DATABASE_PASSWORD_FILE` | `:19-20` | the runtime principal the gate provisions and verifies |

**Do not share one YAML anchor between `migrate` and `api`.** `MUSIC_DATABASE_USER` must be the
migrator on `migrate` and the runtime login on `api` — root compose does this correctly at
`:203` and `:13`. One anchor gives you `assertMusicMigratorAuthority` failing against the
runtime login.

- [ ] **Step 2: Write the failing contract test**

```ts
// tunes/server/test/deployment/production-compose.test.ts
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectApiMode } from "../../apiMode";

// `yaml` is not a declared dependency; js-yaml resolves transitively. This is the
// form music-deployment-files.test.ts:11-12 already uses.
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };

const repositoryRoot = resolve(__dirname, "..", "..", "..", "..");
const raw = readFileSync(resolve(repositoryRoot, "deploy/production.compose.yml"), "utf8");
const compose = parseYaml(raw);

describe("production canonical compose", () => {
  it("starts the canonical API, never the Music composition", () => {
    expect(selectApiMode(compose.services.api.environment)).toBe("canonical");
  });

  it("runs migrations before the API accepts traffic", () => {
    // Break caught: migrate is present but nothing depends on it, so the API
    // starts first, fails readiness and crash-loops while the deploy reports
    // success.
    expect(compose.services.migrate.restart).toBe("no");
    expect(compose.services.migrate.depends_on.postgres.condition).toBe("service_healthy");
    expect(compose.services.api.depends_on.migrate.condition).toBe("service_completed_successfully");
  });

  it("gives the migration gate every variable it reads before touching the database", () => {
    // Break caught: the gate throws on MUSIC_GATE_ATTESTATION_PATH at line 13,
    // before PostgreSQL is dialled, so the failure looks nothing like a
    // migration problem.
    for (const required of ["MUSIC_IMAGE_DIGEST", "MUSIC_IMAGE_COMMIT", "MUSIC_MIGRATION_MARKER",
      "MUSIC_GATE_ATTESTATION_PATH", "MUSIC_GATE_ATTESTATION_KEY",
      "MUSIC_RUNTIME_DATABASE_USER", "MUSIC_RUNTIME_DATABASE_PASSWORD_FILE"]) {
      expect(Object.keys(compose.services.migrate.environment)).toContain(required);
    }
  });

  it("gives the gate the migrator identity and the API the runtime identity", () => {
    // Break caught: one shared YAML anchor. assertMusicMigratorAuthority then
    // fails against the runtime login with an error that reads like a password
    // problem.
    expect(compose.services.migrate.environment.MUSIC_DATABASE_USER)
      .toBe(compose.services.api.environment.MUSIC_DATABASE_MIGRATOR_USER);
    expect(compose.services.migrate.environment.MUSIC_DATABASE_USER)
      .not.toBe(compose.services.api.environment.MUSIC_DATABASE_USER);
  });

  it("declares every variable the canonical API crashes without", () => {
    for (const required of ["EXPLORERS_PUBLIC_ORIGIN", "EXPLORERS_AUTH_SECRET",
      "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "EXPLORERS_MEDIA_ENVIRONMENT",
      "EXPLORERS_DEPLOYMENT_TIER", "EXPLORERS_MEDIA_S3_BUCKET", "EXPLORERS_MEDIA_S3_REGION",
      "MUSIC_DATABASE_HOST", "MUSIC_DATABASE_NAME", "MUSIC_DATABASE_USER",
      "MUSIC_DATABASE_MIGRATOR_USER", "MUSIC_DATABASE_PASSWORD_FILE", "MUSIC_MODE"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
    expect(compose.services.api.environment.DATABASE_URL).toBeUndefined();
  });

  it("configures the trusted proxy, without which P1's trust-proxy change is inert", () => {
    // Break caught: P1 adds trust-proxy support that defaults to trusting NOBODY
    // when the variable is unset. Nothing in the deploy sets it, so req.ip stays
    // the Docker bridge gateway for every request and express-rate-limit
    // (explorersPublicProfileRoutes.ts:45, no keyGenerator, so it keys on req.ip)
    // puts the entire internet in one 120/min bucket. Shipping P1 does not fix
    // this on its own.
    expect(Object.keys(compose.services.api.environment)).toContain("EXPLORERS_TRUSTED_PROXY_IP");
  });

  it("supplies S3 credentials, which the release contract omits", () => {
    // Break caught: resolveObjectStorage validates only bucket and region shape and
    // then builds an S3Client with the SDK's default credential chain. On a host
    // with no instance role that means every media read and write fails at request
    // time, with no boot-time signal at all.
    for (const required of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
  });

  it("supplies the provider keys the release contract omits", () => {
    // Break caught: runtimeMapping lists neither TMDB nor Google Books, so a file
    // built strictly from it boots fine and then 503s every Books and Movies search.
    for (const required of ["GOOGLE_BOOKS_API_KEY", "TMDB_ACCESS_TOKEN"]) {
      expect(Object.keys(compose.services.api.environment)).toContain(required);
    }
  });

  it("names no Strapi variable", () => {
    expect(raw).not.toMatch(/STRAPI/i);
  });

  it("publishes the API only on loopback", () => {
    // Break caught: `5000:5000` exposes the API publicly, bypassing nginx and every
    // Origin check that assumes one front door.
    for (const port of compose.services.api.ports ?? []) {
      expect(String(port)).toMatch(/^127\.0\.0\.1:/);
    }
    expect(compose.services.postgres.ports).toBeUndefined();
  });

  it("bounds its own logs", () => {
    // Break caught: compose's default json-file driver is unbounded, and this is now
    // one host carrying the SPA, the API and PostgreSQL. The first symptom is a full
    // disk, which takes all three down at once.
    for (const name of ["api", "migrate", "postgres"]) {
      expect(compose.services[name].logging?.options?.["max-size"]).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run it**

```bash
cd tunes && npx vitest run server/test/deployment/production-compose.test.ts
```

Expected: `ENOENT … deploy/production.compose.yml`.

- [ ] **Step 4: Write the compose file**

Three services. `postgres` — `postgres:15-alpine`, named volume, `pg_isready` healthcheck, **no
published port**. `migrate` — the API image, `restart: "no"`,
`command: ["node","dist/server/deployment/run-migration-gate.js"]`, the gate's full variable set,
both password files bind-mounted `0600`, and a shared volume for
`MUSIC_GATE_ATTESTATION_PATH`. `api` — the API image, `EXPLORERS_API_MODE: canonical`,
`ports: ["127.0.0.1:5000:5000"]`, `depends_on: migrate: service_completed_successfully`,
healthcheck on **`/health/ready`** (P1's endpoint — `/health/live` is a blind 200).

Pin the image by digest. Use `${VAR:?...}` for everything that must not silently default. Set
`logging` limits on all three. Bind-mount the secret files; do **not** use Docker `secrets:`,
which mount `0444` and fail the permission check.

Leave `EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED` unset — setting it `true` requires
`STRAPI_PUBLIC_PROFILE_READ_TOKEN`, which the code reads and throws on and which is declared
nowhere.

- [ ] **Step 5: Run the test, then render for real**

```bash
cd tunes && npx vitest run server/test/deployment/production-compose.test.ts
docker compose -f ../deploy/production.compose.yml --env-file ../deploy/production.env.example config >/dev/null && echo renders
```

`production.env.example` holds a complete dummy set with no real values; it is also what the
owner fills in on the host.

- [ ] **Step 6: Commit**

```bash
git add deploy/production.compose.yml deploy/production.env.example tunes/server/test/deployment/production-compose.test.ts
git commit -m "feat(deploy): add the production canonical compose graph

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The host nginx site, in git

**Depends on P1** — see the trust-proxy note in Step 4.

The production nginx config is **host-managed and in no repository**. `explorers-earth/nginx.conf`
is *not* it: that file is baked into an image at `explorers-earth/Dockerfile:35`, and nothing
builds that image. Use it as evidence of intent, never as the source.

- [ ] **Step 1: Capture what is actually running — before writing anything**

```bash
mkdir -p deploy/nginx/captured
ssh <deploy-user>@<explorers-host> 'sudo nginx -T' > deploy/nginx/captured/nginx-T-$(date +%F).txt
```

`nginx -T` dumps the full resolved config including every include. **Commit it unchanged.**
Everything below is a diff against reality. If the host is not reachable from this session,
stop and hand Step 1 to the owner — do not write a replacement against the Docker file's
contents and hope.

**Save it as `.txt` under `captured/`, never as a `.conf` beside the site file.** The dump
contains the whole `http { … }` block plus `# configuration file …` banners. Step 5 mounts
`deploy/nginx/` as `conf.d`, where every `*.conf` is included *inside* `http`, so a captured
dump sitting there would nest `http` within `http` and fail validation for a reason that has
nothing to do with your edits.

- [ ] **Step 2: Reproduce the headers the container config provided**

This is the cost of choosing design A, and revision 1 omitted it entirely.

`render-platform-runtime.mjs` emits `headers.conf` containing `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Robots-Tag: noindex,nofollow` in qa only,
and a full CSP — `default-src 'self'`, `frame-src 'none'`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, with `script-src`/`connect-src`
widened to `maps.googleapis.com maps.gstatic.com places.googleapis.com` **only when
`mapsBrowserKey` is set**.

So the site config must:

- `include /srv/explorers/current/headers.conf;` at **`server{}` scope**
- **repeat that include inside every `location` that declares its own `add_header`**, because
  nginx `add_header` replaces rather than merges. Without this, the static-asset block silently
  strips every security header from each `.js` and `.css`.
- `add_header Cache-Control "no-store" always;` on `= /index.html` and `= /runtime-config.json`.
  The first is what makes Task 7's symlink swap safe — a cached shell referencing the previous
  build's hashed assets is exactly the post-deploy failure caching causes.
- **not serve `headers.conf` itself.** Place it outside the served root, or add
  `location = /headers.conf { return 404; }`.

- [ ] **Step 3: Add the API proxy**

- `location ^~ /api { proxy_pass http://127.0.0.1:5000; }` with `Host $host`, `X-Real-IP`,
  `X-Forwarded-For`, `X-Forwarded-Proto $scheme`. `^~` so it beats the regex asset block.
- `location = /graphql` and `location ^~ /socket.io` to the same upstream, so both answer P1's
  JSON 404/410 instead of the SPA shell.
- `location = /health/live` and `location = /health/ready` to the same upstream. Without these
  they match `location /` and return **200 with `index.html`** — a health check that passes
  while the API is dead. `nginx.replatform.conf:13-19` documents this failure by name.
- `client_max_body_size 20m;` — the API accepts `limit: "10mb"` raw bodies
  (`explorersMediaRoutes.ts:26`) and the Docker config used `20M`. Too low and uploads fail at
  the proxy with a 413 the application never sees.

- [ ] **Step 4: Resolve — do not defer — every container-name upstream**

Revision 1 said to carry the captured config forward unchanged while also warning that an
unresolvable literal upstream stops nginx entirely. Those contradict. A literal name in
`proxy_pass` is resolved **once at config parse time**; an unresolvable one makes nginx refuse
to start, SPA included, with `[emerg] host not found in upstream`. Host nginx is on no Docker
network.

So: any location whose captured upstream is a container name must be resolved **now** — pointed
at `127.0.0.1:5000` or deleted. That is `/sitemap.xml` and the four scrapers
(`/api/apps/scrape-url`, `/api/products/scrape-link`, `/api/people/scrape-profile`,
`/api/proxy-image`), all of which are `prefix` tombstones in `musicRetirementPolicy.ts:38-41`
and so become 410s. That is open question 2. "Carry forward unchanged" is safe only for
`/twitch-api/` and `/igdb-api/`, whose upstreams are public DNS.

Also remove `location /api/` and `/graphql` → `https://api.localqr.earth` if the captured config
has them.

**Why this task depends on P1:** adding `X-Forwarded-For` while the canonical app still sets no
`trust proxy` makes `express-rate-limit` key every visitor on the proxy's single IP, so one
shared 120/min bucket covers the whole world on `/api/explorers/v1/profiles`
(`explorersPublicProfileRoutes.ts:45-50`). P1's trust-proxy change must land first.

- [ ] **Step 5: Validate offline before it reaches the host**

The site config `include`s `/srv/explorers/current/headers.conf`, which Task 5 generates and
which does not exist on this machine. `include` is resolved at parse time, so validation needs
a stand-in at that exact path or it fails on a missing file rather than on your syntax:

```bash
mkdir -p /tmp/ee-nginx-stub
printf 'add_header X-Content-Type-Options "nosniff" always;\n' > /tmp/ee-nginx-stub/headers.conf
docker run --rm \
  -v "$PWD/deploy/nginx/explorers.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "/tmp/ee-nginx-stub:/srv/explorers/current:ro" \
  nginx:1.27-alpine nginx -t
```

Mount the **file**, not the directory — the directory also holds the captured `nginx -T` dump
and any TLS paths the captured config references.

Expected: `syntax is ok` / `test is successful`. A `host not found in upstream` means a
container name survived Step 4. A missing `ssl_certificate` means the captured config
terminates TLS here; either strip those lines for the offline test or mount dummy certs — do
not delete them from the committed file.

- [ ] **Step 6: Commit**

```bash
git add deploy/nginx/
git commit -m "feat(deploy): bring the production nginx site into version control

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Render the SPA runtime files in CI

- [ ] **Step 1: Understand why the obvious invocation fails**

`render-platform-runtime.mjs` requires exactly three arguments and writes all five outputs with
`{flag:'wx', mode:0o644}`:

```js
if(process.argv.length!==5)throw new Error('PUBLIC_RUNTIME_ARGUMENTS_INVALID');
const [input,template,output]=process.argv.slice(2);
…
for(const [name,contents] of Object.entries(files))writeFileSync(join(output,name),contents,{flag:'wx',mode:0o644});
```

Rendering **into `dist/`** fails: vite has already written `index.html` there, and
`explorers-earth/public/` supplies `robots.txt` and `sitemap.xml`, which vite copies in on every
build. The failure is near-undiagnosable — the CLI catches everything and prints only
`Public runtime generation failed` — and it leaves a **partial** output: `runtime-config.json`
written, `index.html` un-rewritten, `headers.conf` never created. Since `nginx.platform.conf`
and Task 4 both `include` `headers.conf`, a CI step that ignores the exit code ships a tree that
stops nginx from starting.

Every working example in the repo renders to a **separate** directory —
`explorers-earth/Dockerfile:58` passes template `/app/dist/index.html` and output `/runtime-web`.

- [ ] **Step 2: Write the production `public.json` as a repository variable**

```json
{"version":1,"environment":"production","origin":"https://explorers.earth","apiPath":"/api","socketPath":"/socket.io","mapsBrowserKey":"<the browser key>","analytics":{"enabled":false}}
```

`mapsBrowserKey` is a **browser** key — it ships to every visitor and is restricted by HTTP
referrer, not secrecy. Store it as a repository *variable* so the rendered file can be diffed in
CI logs.

`origin` must equal the browser's origin byte for byte. `https://www.explorers.earth` and
`https://explorers.earth` are different origins; whichever the site serves is the one that goes
here, and the other must 301 to it first. That is open question 4.

- [ ] **Step 3: Render correctly, then merge**

```bash
cd explorers-earth
npx tsc -b && npx vite build --config vite.platform.config.ts --mode platform
rm -rf ./runtime-web
node scripts/render-platform-runtime.mjs ./public-config.json ./dist/index.html ./runtime-web
cp -f runtime-web/index.html runtime-web/robots.txt runtime-web/sitemap.xml runtime-web/runtime-config.json ./dist/
```

The rendered `index.html` is the one that must ship — it carries the canonical link and the
robots meta. It **overwrites** vite's, and the rendered `robots.txt` and `sitemap.xml` overwrite
the ones copied from `public/`. Keep `headers.conf` in `runtime-web/` and ship it to a path
nginx includes but does not serve.

```bash
cat dist/runtime-config.json && head -5 runtime-web/headers.conf
```

Expected: the config echoes the input, and `headers.conf` contains `maps.googleapis.com`
**only because `mapsBrowserKey` is set**. Absent the key, the CSP omits those origins and every
map is blocked by policy even when a key is later supplied another way.

The platform build deliberately does not run `generate-static` — the renderer produces
`robots.txt` and `sitemap.xml` instead. Do not add it back.

- [ ] **Step 4: Decide how the rendered sitemap and P1's sitemap coexist**

P1 added `/sitemap.xml` and `/robots.txt` to the canonical API; nginx serves files before
proxying. **Recommended: proxy both to the API**, because the API's sitemap enumerates public
profiles and the static one cannot. Whichever you pick, write it in the nginx config.

---

## Task 6: Make the ingress probe host-pointable

`scripts/replatform-route-parity.ts:122` already exports
`verifyPlatformIngress(origin: string, fetchImpl: typeof fetch = fetch): Promise<number>` — plain
HTTP, no browser, no fixture. It detects the SPA-shell masking failure at `:150-152`. Three
things block it.

- [ ] **Step 1: Write the failing test**

Assert the probe set contains no legacy Music or Strapi path, and that a stub `fetch` returning
the SPA shell for a JSON path is rejected.

- [ ] **Step 2: Add a canonical-only function — do not edit the existing probe set**

`CURRENT_TUNES_ROUTES` (`:39-50`) probes five legacy paths — `/api/check`, `/api/csrf-token`,
`/api/user/reactivate`, `/api/explorers/analytics/events`, `/api/music-fixture/readiness` — and
`:162-165` is an **unconditional** block asserting `GET /api/users/me` → 403 *"fixture identity
authority denied"*. Neither exists on the production host.

**Do not remove them from `verifyPlatformIngress`.** That function is the local fixture's
eleven-probe invariant, pinned by `platform-route-parity.test.ts:65`
(`expect(EXPECTED_PLATFORM_PROBE_COUNT).toBe(11)`), and the local fixture still runs `combined`
mode with Music until P3 retires it. The file's own governance (`:20-23`) forbids lowering the
count to accommodate an absent route. Editing the shared probe set here would fail that test and
quietly weaken the fixture's evidence a phase early.

Instead export a second function, `verifyCanonicalIngress(origin, fetchImpl)`, that runs only
`CANONICAL_ROUTES` plus the probes in Step 3, reusing the existing SPA-shell detection at
`:150-152`. `verifyPlatformIngress` and its eleven probes are untouched; P3-2 redefines them when
`combined` goes.

- [ ] **Step 3: Add the probes that distinguish working from plausible-looking**

- `GET /api/auth/get-session` anonymous → **200**, `Cache-Control: no-store`, body parsing to
  literally `null`. `401` means Better Auth is not answering; `{"session":null}` is the fixture
  stub; `text/html` with 200 is the nginx SPA fallback.
- `GET /api/explorers/v1/profiles/<handle>/recommendations/<a-hidden-category>` → **404**. A
  genuinely empty but *public* category correctly returns `200 {items:[]}`, so only a hidden one
  proves the privacy gate is live.
- `GET /api/explorers/v1/me` anonymous → **401**, not 503. This is the probe that actually
  touches the database.

- [ ] **Step 4: Commit**

```bash
git add scripts/replatform-route-parity.ts tunes/server/test
git commit -m "test(deploy): make the ingress probe runnable against a deployed host

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The deploy workflow

**Depends on P1** — the readiness gate polls an endpoint P1 adds.

- [ ] **Step 1: Consume the image CI already publishes — do not build a second one**

`.github/workflows/tunes.yml:134-146` builds with `load: true, push: false`; the real push is
the `publish-image` job at `:310-352`, which logs in to ghcr, pushes `:${GITHUB_SHA}`, derives
the digest and runs `actions/attest-build-provenance`. Crucially,
`auditDeploymentAuthority:349-351` pins that workflow as the **single** build authority and
requires it to run `anchore/scan-action@` before push.

So adding a second `build-push-action` to `explorers.yml` creates an unscanned producer of
`explorers-tunes` digests outside the contract. Instead consume the digest `tunes.yml` already
publishes — `workflow_call` or an artifact handoff. If that proves impractical, replicate the
scan step **and** update `auditDeploymentAuthority` in the same commit.

- [ ] **Step 2: Build and render the SPA**

Replace the 19 `VITE_*` echo lines and `npm run build` with the platform build and Task 5's
render. **Delete every `VITE_*` secret reference** — a platform build inlines none of them, and
leaving them is how `VITE_REST_API_URL` sneaks back in.

- [ ] **Step 3: Ship both, in this order**

1. scp the rendered tree to a **new timestamped directory**, not over the live one.
2. ssh: place `deploy/production.compose.yml` and `deploy/nginx/explorers.conf`;
   `docker compose pull`; `docker compose up -d --wait`.
3. **Gate on readiness before switching the SPA.** Poll `http://127.0.0.1:5000/health/ready`
   until 200, with a bounded timeout. `--wait` only waits for the container healthcheck.
4. **Run the acceptance checks that do not need the new SPA, while the old one is still
   served.** The ingress probe (Task 6) and a media round-trip both exercise the API alone. A
   readiness 200 means the database answered; it says nothing about whether auth, storage or
   the taxonomy work. Fail the deploy here rather than discovering it in Task 10.
5. Atomically swap the SPA directory (`ln -sfn`, then reload nginx), so a failed API deploy
   never leaves a half-updated frontend.
6. `sudo nginx -t` then reload, keeping the diagnostics block from `:82-106`.

**Be honest about what this ordering does and does not buy.** The SPA swap is gated, but the
**API** switches at step 2's `compose up`, before any of it. On the first deploy that is
harmless — nothing was serving. On every deploy after, there is a window between `up` and the
step-4 checks where a broken API is live. Closing that window properly means running two API
containers and switching a proxy target, which is the blue/green design the pipeline decision
deliberately dropped. The accepted trade is: seconds of exposure, and roll forward by
redeploying the previous tag.

Replacing the old `rm -rf /home/deployuser/explorers-frontend/*` with a timestamped directory
plus a symlink swap is the single most valuable change: the current form deletes the live site
*before* uploading its replacement.

- [ ] **Step 4: Keep one thing the deploy engine did**

Before `compose up`, assert the image's `com.explorers.music.minimum-containment-commit` label
and bundled migration marker are not older than the database's. Without
`music-deploy-engine.sh:764`, an older image no longer gets refused — it pulls, starts and
crash-loops.

- [ ] **Step 5: Remove the disabling condition last**

Delete `if: ${{ false }}` at `:15` only once every step above is written, and keep the trigger
`workflow_dispatch`-only for the first real run.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/explorers.yml
git commit -m "feat(ci): deploy the whole application from one workflow

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Retire the hourly Strapi reconciler

Lower risk than the backbone assumed — it **cannot write**. Four independent gates: the schedule
reaches only the `report-only` job (`music-reconcile.yml:38-41`); that job sets
`MUSIC_RECONCILIATION_APPLY_ENABLED: "false"` and passes `--dry-run`; production apply is
refused in code regardless of environment (`music-reconciliation-config.ts:83`); and the
repository `ROLLBACK`s whenever `!input.apply` (`reconciliationRepository.ts:228`).

Still worth deleting: once Strapi is gone it fails hourly on `main` for no information.

- [ ] **Step 1: Delete the workflow**

```bash
git rm .github/workflows/music-reconcile.yml
```

The schedule exists nowhere else and `cron` fires only from the default branch, so this is the
complete kill. Do **not** merely remove the self-hosted runner — jobs would queue indefinitely.

- [ ] **Step 2: Record the other scheduled Strapi reach, and leave it**

`tunes/server/routes/index.ts:266` starts an in-process lifecycle worker on a 30-second interval
whose absence proof POSTs to Strapi's `/graphql`. It fires only when there are claimed lifecycle
deletions, so on a fresh database it never does. It lives in the Music composition and dies in
P3.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(ci): retire the hourly Music identity reconciliation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Host bootstrap

Owner actions, once, with the engineer present. Nothing in the repo does any of it.

> **Found during rehearsal (2026-10-18).** Tasks 9 and 10 were run end to end against a local
> stand-in host (`deploy/rehearsal/rehearse.sh`). The executable version is
> [`docs/operations/explorers-cutover-runbook.md`](../../operations/explorers-cutover-runbook.md);
> follow that, not the steps below. What changed for this task:
>
> - **Steps 2–4 and the checks for 6–9 are now a script:** `deploy/host/explorers-bootstrap.sh
>   init|check <host>`. It generates the password files, installs and validates `production.env`,
>   and names the nginx file that serves the hostname today, which answers open question 1 and
>   gives `EXPLORERS_NGINX_SITE_PATH`.
> - **Step 1 (backup) has nothing to back up** on a start-fresh cutover; the first backup is after
>   the first deploy, with #141's tooling. **Step 1a is void** (no real users; #131 held out).
> - **Step 4 needs no action.** The postgres image creates the migrator from `DB_MIGRATOR_USER`,
>   migration 0010 creates `music_runtime`, and the gate creates the runtime login.
> - **Step 9's command is wrong.** The API is on two networks, so
>   `{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}` prints `172.20.0.1invalid IP`.
>   Compose also needs a value before the network exists. `explorers-deploy.sh stage` now
>   compares the configured value with the egress gateway: it warns on the first deploy and
>   refuses on later ones. The example's `172.18.0.1` was wrong in the rehearsal (`172.20.0.1`).
> - **Step 9's proof is wrong.** Through nginx, two client-supplied `X-Forwarded-For` values
>   correctly share one bucket: only the gateway hop is trusted, and nginx appends the real
>   peer. The proof is two XFF values sent straight to `127.0.0.1:5000` getting separate buckets.
> - **Not covered by any step:** Better Auth's own rate limiter cannot see client IPs (it logs a
>   warning at the first request), so `/api/auth/*` shares one bucket regardless of Step 9.

- [ ] **Step 1: Take a database backup and verify you can restore it.** Rollback is
  forward-only; an unverified backup is not a safety net.
- [ ] **Step 1a: Export the Strapi user list and load the handle holds — before sign-ups open.**
  The start-fresh decision means production Strapi is the only place the list of existing users
  and their handles lives, and P6 retires it. Follow the launch user communication plan: export
  the minimal list, load the handle holds into the new database, and confirm a hold refuses a
  different Google account. **Do not open the new stack to sign-ups until this step is done.**
- [ ] **Step 2: Confirm Docker and headroom** for PostgreSQL and the API alongside the SPA.
- [ ] **Step 3: Create the directory tree and secret files.** `/opt/explorers/` via
  `install -d -m 700`, holding `production.env`, the compose file, and the two database password
  files — base64url, ≥32 decoded bytes, **mode `0600`, root-owned, no symlink in the ancestor
  chain**. Bind-mount them; Docker `secrets:` mount `0444` and fail the check.
- [ ] **Step 4: Create the database with three distinct principals.** An owner/migrator that is
  superuser or owns the database, and a separate runtime login. `music_runtime` is created **by
  migration 0010** — not by hand. The database must be genuinely empty.
- [ ] **Step 5: Create the private S3 bucket and a scoped IAM user.** Nothing in the repo
  creates the bucket, its CORS or its policy. Scope the user to
  `s3:GetObject/PutObject/DeleteObject` on that prefix only, and put
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in `production.env` — `resolveObjectStorage`
  validates only bucket and region *shape* and then uses the SDK's default credential chain, so
  missing credentials fail at request time with no boot-time signal.
- [ ] **Step 6: Obtain TLS for the production hostname** with certbot, before pointing anything
  at it. The runtime config demands `https:` and an exactly matching origin.
- [ ] **Step 7: Supply the secrets.** New: `EXPLORERS_AUTH_SECRET` (≥32 chars), server-side
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, database credentials, S3 bucket and region, the
  gate's `MUSIC_GATE_ATTESTATION_KEY` (≥32). Already GitHub secrets, needing rewiring from the
  frontend bundle to the server environment: `TMDB_ACCESS_TOKEN`, `GOOGLE_BOOKS_API_KEY`. And
  the Maps **browser** key into `public.json`.
- [ ] **Step 8: Add the Google OAuth redirect URI** `https://<origin>/api/auth/callback/google`
  to the Google Cloud console client. Better Auth derives it from `EXPLORERS_PUBLIC_ORIGIN`
  (`betterAuth.ts:37`) and it must match exactly.
- [ ] **Step 9: Determine and set `EXPLORERS_TRUSTED_PROXY_IP`.** P1 adds trust-proxy support
  that defaults to trusting **nobody**; unset, it is inert. Because the API is reached through
  a published port (`127.0.0.1:5000:5000`), the peer address it sees is not the visitor's and
  not `127.0.0.1` — it is the Docker bridge gateway, the same value for every request. Find it
  after the stack is up:

  ```bash
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' <api-container>
  ```

  Set the variable to exactly that address, restart the API, then prove it took effect:

  ```bash
  curl -s -H 'X-Forwarded-For: 203.0.113.9' https://<origin>/api/explorers/v1/me -o /dev/null -w '%{http_code}\n'
  ```

  401 is correct. What you are checking is that two different `X-Forwarded-For` values get
  **separate** rate-limit budgets — `express-rate-limit` keys on `req.ip`
  (`explorersPublicProfileRoutes.ts:45`, no `keyGenerator`), so until this is right the whole
  internet shares one 120/min bucket on the public profile routes.

---

## Task 10: Cut over and verify

> **Found during rehearsal (2026-10-18).** See the
> [runbook](../../operations/explorers-cutover-runbook.md), sections 5–7 and 10.
>
> - **Step 1 could never pass on an empty database.** `explorers-deploy.sh stage` read the journal
>   in one `CASE` statement; PostgreSQL resolves `music_schema_migrations` before running it, so
>   the statement failed with `relation does not exist`. Fixed.
> - **`activate` exited 7 with no message on the first deploy.** It probed :443 straight after
>   `nginx -s reload`, before the new workers listened. Fixed: a bounded poll, restoring the
>   previous site on failure.
> - **A refused older-image deploy left the wrong compose file** on the host, which broke the next
>   `compose up`. Fixed: every refusal before the new image starts restores it.
> - **Step 2's commands fail.** Without `--env-file`, compose cannot render the file, and the
>   bundle is `dist/apply-reviewed-taxonomy.js`. `stage` now records the running image in
>   `/opt/explorers/image.env`. The working form is
>   `docker compose -f … --env-file production.env --env-file image.env run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js`.
> - **Step 3 before any sign-in** can only use a handle that does not exist. The hidden-category
>   proof needs the owner's own account with a category hidden (runbook 6.2).
> - **Getting the digest Step 1 needs also deploys to the Music host.** `tunes.yml`'s
>   `release_production` input gates both `publish-image` and `deploy-production` (→
>   `tunes-deploy.yml`). This blocks cutover until the input is split or P3-7 lands.
> - **Rollback was rehearsed.** Redeploying the previous image at the same schema took 20s, with
>   at most 3s of API 503s. Rolling back past a migration was refused with nothing changed, and
>   forcing it fails in the old image's gate with `unknown future migration in journal`.

- [ ] **Step 1: Deploy.** The workflow builds, ships, migrates, gates on readiness and swaps the
  SPA.
- [ ] **Step 2: Apply the Places taxonomy.**

```bash
docker compose -f /opt/explorers/production.compose.yml run --rm migrate node dist/scripts/apply-reviewed-taxonomy.js --dry-run
docker compose -f /opt/explorers/production.compose.yml run --rm migrate node dist/scripts/apply-reviewed-taxonomy.js --apply --reviewed-by "<owner>"
```

Run it on the `migrate` service, which already holds migrator credentials. This only works
because Task 2 Step 6 added the esbuild entry and the `COPY`.

- [ ] **Step 3: Run the ingress probe** against the live origin — `verifyCanonicalIngress` from
  Task 6, not `verifyPlatformIngress`, which still expects the local fixture's Music routes.
- [ ] **Step 4: Verify by hand what the probe cannot.** Sign in with Google end to end; confirm
  the cookie is `__Secure-better-auth.session_token` with `Secure`, `HttpOnly`, `SameSite=Lax`.
  Load a public profile and confirm place category labels render — that is Task 2 working. Load
  a map and confirm tiles appear — that is Task 1 working. Create a recommendation in each
  category.
- [ ] **Step 5: Check the CSP as served, not as written.**

```bash
curl -sI https://explorers.earth/ | grep -i content-security-policy
curl -sI https://explorers.earth/assets/<a-hashed-file>.js | grep -i x-content-type-options
curl -s -o /dev/null -w "%{http_code}\n" https://explorers.earth/headers.conf
```

Expected: a CSP containing `maps.googleapis.com`; the security header present on the asset too
(this is the `add_header` inheritance trap); and `404` for `headers.conf` itself. Checking the
file on disk proves nothing about what nginx emits.

- [ ] **Step 6: Watch for the four failures that look like success**

- **`/health/live` returns `200 {"status":"live"}` while startup has failed.**
  `canonicalStartup.ts:50` calls `resolveObjectStorage` **after** `listen()`, and its catch at
  `:71-73` rethrows without closing the server; `api.ts:29` only sets `process.exitCode`. The
  listener stays open, the container never restarts, and media is broken. Probe
  `/health/ready` and an actual media URL.
- **A public profile returning `200 {}` for an unknown handle** — the privacy gate bypassed and
  account existence leaking. It must be `404`.
- **Maps rendering for you because the key is cached**, while a fresh session gets a blocked CSP.
- **A stale `index.html`** referencing the previous build's hashed assets, if `no-store` is
  missing from `= /index.html`.

---

## Open questions for the owner

Five. Question 0 is the largest product consequence of this cutover, and none of the others
blocks starting Tasks 1–3.

0. ~~**Every existing user loses their content, and every existing public profile URL 404s.**~~
   **SETTLED 2026-10-18 — start fresh.** The owner confirmed it as a launch decision. Two pieces of
   work follow from it and are **launch-blocking**, planned in
   `docs/superpowers/plans/2026-10-18-launch-user-communication.md`: export the Strapi user list
   before cutover, and **hold old handles for their original owners from the moment the new stack
   accepts sign-ups**. Printed QR codes encode `/<handle>/…` (`LinksAndQR.tsx:67`), so without the
   hold, the first stranger to claim an old handle takes over every QR code that user ever printed.
   The original analysis follows.

   **Every existing user loses their content, and every existing public profile URL 404s.**
   Nothing in the repo imports Strapi users, handles, profiles, collections or recommendations
   into the canonical schema — I searched `tunes/scripts/` and found only `migrate-db.js` and the
   taxonomy loader. Better Auth creates a brand-new account on first Google sign-in. The fresh
   empty database was a settled *technical* decision; this is its product meaning, and it should
   be stated out loud before launch, not discovered. (Note
   `taxonomy_source_mappings(source_host, entity_kind, document_id, term_id)` exists to tie
   Strapi document ids to canonical terms — evidence that carrying content over was once
   intended.)
1. **What is actually in the host's nginx config?** Task 4 Step 1 answers it. Everything about
   the front door is provisional until then.
2. **The four scraper endpoints** and `/sitemap.xml` currently proxy to a container name that
   exists in no compose file. Point them at the canonical API (where all four become 410s and
   paste-a-URL enrichment stops working), or keep a legacy upstream?
3. **The six Strapi `/upload` call sites.** Media moves to `/api/explorers/v1/media`, which is a
   product change. Convert in P2, or accept broken avatar and feed uploads until a later phase?
4. **`www` or apex?** The runtime config's `origin` must equal the browser's origin exactly; one
   must 301 to the other.
5. **People taxonomy has zero reviewed terms.** The catalog stays `UNCONFIGURED` and the picker
   shows *"Sector catalog is not configured."* Accept for launch, or produce a vocabulary first?

---

## Self-review

**Coverage.** P2-0 dissolved. P2-1 and P2-3 dissolved with the deploy engine. P2-2 → Tasks 3, 5
and 9. **P2-4 deliberately not done** — see [What P2 does not touch](#what-p2-does-not-touch).
P2-5 → Task 8. P2-6 → Tasks 6 and 10. P2-7 → Task 2. Three findings the backbone did not have →
Task 1.

**Sequencing.** Tasks 1–3 are local, test-driven and shippable before P1. Tasks 4 and 7 both
depend on P1 — Task 4 because adding `X-Forwarded-For` without trust proxy collapses rate
limiting onto one bucket. Task 4 is additionally blocked on one ssh command, and that is stated
rather than guessed around.

**What is honestly unknown.** The host's nginx config. Task 4 Step 1 resolves it before any
config is written, and no earlier task depends on the answer.

**What this plan deliberately does not do.** Touch root compose, drop Traefik, delete the deploy
engine, convert the Strapi `/upload` call sites, or build a People vocabulary. The first three
are P3's and are pinned by `auditDeploymentAuthority`; the last two are product decisions, listed
as open questions rather than folded quietly into a cutover.

---

## Corrections from review

Revision 1 claimed these; all were confirmed wrong against the code.

| # | Revision 1 said | The code says |
|---|---|---|
| 1 | Flipping `EXPLORERS_API_MODE` in root compose is a safe standalone commit | It makes the **live production stack** unbootable on the next restart — missing auth and media variables, no migration run |
| 2 | Traefik is dropped and the deploy engine goes in P2 | `auditDeploymentAuthority:359-366` pins both into root compose and the engine script; `music-deployment-files.test.ts:123` asserts no issues. P3 work |
| 3 | Rendering in a fresh CI workspace sidesteps the `wx` flag | The output dir is populated by vite in the same run. The command **always fails**, silently, leaving no `headers.conf` — which stops nginx |
| 4 | Task 4 only needs the three security headers repeated in the asset block | It must also `include headers.conf` at server scope **and in every location with its own `add_header`**, or the app ships with no CSP |
| 5 | `mapsBrowserKey()` needs changing | It is already exactly right at `publicRuntimeConfig.ts:14`; the call sites are the only work |
| 6 | "About fourteen" maps call sites; nine already use the accessor | Nineteen reads across eleven files; eight use the accessor |
| 7 | Use `signInWithGoogle` from `authClient.ts:52` | It is `authClient.startGoogleSignIn(recovery = false)` at `:41`, async and throwing — the call site must become async |
| 8 | Leaving `VITE_REST_API_URL` unset makes the axios calls fail visibly | They were already unset, and they resolve to `https://<origin>/undefined/upload` — a JSON 404, never Strapi. The real defect is seven `localhost:1337` image fallbacks |
| 9 | Task 11 runs the taxonomy script inside the container | `scripts/` is in neither the image nor `dist/`; `npm`, `npx` and `tsx` are deleted; the fixture is outside the build context |
| 10 | The compose contract test covers what the deploy needs | It never inspected `services.migrate`. The gate throws on `MUSIC_GATE_ATTESTATION_PATH` before touching PostgreSQL |
| 11 | `import { parse } from "yaml"` | `yaml` is not a dependency; use `createRequire("js-yaml")` as `music-deployment-files.test.ts:11-12` does |

Also corrected: `run-contained-vitest.cjs` is under `scripts/`; Task 7 must consume the digest
`tunes.yml` publishes rather than adding a second unscanned build; AWS credentials and bucket
creation were missing entirely; and container logging was unbounded.

### Revision 3 — from the Codex cross-model review (2026-10-18)

Codex reviewed P1 and P2 together. Its sandbox blocked repository reads, so it worked from the
plan text alone and said so rather than inventing citations. Four of its six findings were
verified against the code and applied; they are the ones that come from reading the two plans
*as a pair*, which neither earlier review did.

| Finding | Verified | Applied |
|---|---|---|
| **P1's trust-proxy change is inert without a P2 variable.** `resolveTrustedProxy` returns `false` when unset, and nothing in P2 set it — so P2 Task 4's claimed dependency on P1 did not actually fix the shared rate-limit bucket | Yes. `explorersPublicProfileRoutes.ts:45` uses `rateLimit` with no `keyGenerator`, so it keys on `req.ip` | Task 3 test now requires `EXPLORERS_TRUSTED_PROXY_IP`; Task 9 Step 9 finds the Docker bridge gateway and verifies it |
| **`COPY tunes/fixtures` contradicts the `./tunes` build context** | Yes. The adjacent line is `COPY migrations ./migrations` | Task 2 Step 6 corrected to `COPY fixtures ./fixtures` |
| **The nginx validation command cannot validate what Task 4 describes** — it mounts only `deploy/nginx` as `conf.d` while the config `include`s an absolute path Task 5 has not produced, and the captured `nginx -T` dump sits in the mounted directory | Yes. `nginx -T` emits the whole `http {}` block, which cannot be included inside `http` | Capture now lands in `captured/` as `.txt`; validation mounts the site file alone plus a stub `headers.conf` |
| **Acceptance checks all happen after the switch** | Yes | Task 7 Step 4 moves the API-only checks ahead of the SPA swap, and states plainly which window the simple pipeline cannot close |

Not applied: Codex's reading that readiness returns 200 during a post-listen startup failure.
It returns 503 today, but only by accident — the same catch calls `pool.end()`, which makes the
ping fail. The underlying defect it pointed at is real and worse, and is fixed in **P1 Task 4
Step 6**.
