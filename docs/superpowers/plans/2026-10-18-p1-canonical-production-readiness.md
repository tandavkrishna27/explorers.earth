# P1 — Canonical Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the canonical Express app the four surfaces it needs to serve production, which
today exist only in the legacy Music composition that is about to be deleted.

**Architecture:** Four additive mounts in `tunes/server/auth/canonicalApp.ts`, in a fixed order
dictated by Better Auth's raw-stream handlers and by the terminal catch-all. Nothing is
deleted. Each task is independently shippable and leaves the tree green.

**Tech Stack:** Express 5.2.1, TypeScript, Vitest + supertest, PostgreSQL via `pg`.

**Revision 2 (2026-10-18).** Rewritten after two independent reviews against the real code.
Seven factual errors in revision 1 were confirmed and corrected; they are listed in
[Corrections from review](#corrections-from-review) at the end so nobody re-introduces them.

---

## Context an engineer needs before starting

### Where the code is — read this first

**The primary working directory does not contain any of the code this plan edits.**
`C:/Users/TK/OneDrive/Desktop/Claude Data/explorers.earth-main/explorers.earth-main` is checked
out on `codex/profile-settings-tabs` (`4cd5ec5a`), which predates the replatform: no
`tunes/server/auth/`, no `tunes/server/policies/`, no `docs/architecture/`, and one migration
file instead of 56.

**Local `main` (`7333dc41`) is a different lineage and must not be used.** The replatform is on
**`origin/main` = `10a3cd4a`** (merge of PR #122). Task 0 cuts a worktree from it.

`C:/Users/TK/ee-audit-main` is a detached checkout at that same commit. It is a **read-only
reference** — do not implement there.

### The pipeline decision shapes this plan

Deployment will build the image in CI and pull it on the server. The blue/green engine is being
deleted, so `/health/ready` has **no byte-exact contract** — any sensible shape is fine. An
earlier revision required exactly four keys in positional order; that constraint is gone.

### Two error contracts, not one — do not mix them

This codebase has two unrelated error envelopes, and the tasks below use **both**:

| Contract | Where | Shape | Used by |
|---|---|---|---|
| `errorEnvelope` | `tunes/server/containment-error-contract.ts:31` | `{error:{code, message, action, retryable, requestId}}` | **Task 2** |
| `apiErrorSchema` | `tunes/shared/explorersContract.ts:131` | `{error:{code, message, requestId}}`, `.strict()` | **Task 5** |

`ContainmentCode` has `GRAPHQL_PROXY_REMOVED`, `LEGACY_IDENTITY_ROUTE_REMOVED` and
`LEGACY_OWNER_ROUTE_REMOVED` — which Task 2 needs — and does **not** have `NOT_FOUND`,
`INVALID_INPUT`, `RESOURCE_TOO_LARGE` or `PROVIDER_UNAVAILABLE`. Those four are `apiErrorCodes`
members, which Task 5 needs. `apiErrorSchema` is `.strict()` and has **no `retryable` field** —
adding one is a validation failure, not a harmless extra.

### Scope limit: these surfaces only exist in `canonical` mode

`canonicalDelegate.ts:21` pre-filters by path before a request can reach the canonical app:

```ts
const DELEGATED = /^\/(?:health\/live|api\/auth|api\/explorers\/v1)(?:\/|$)/;
const RETAINED_BY_MUSIC = /^\/api\/explorers\/v1\/profiles(?:\/|$)/;
```

`/health/ready`, `/robots.txt`, `/sitemap.xml` and `/api/explorers-sitemap.xml` are all outside
`DELEGATED`. **Under `EXPLORERS_API_MODE=combined` every surface this plan adds is unreachable**
and the Music implementations in `server/deployment/music-health.ts:47` and
`server/seo-routes.ts:178/195/216` answer instead. That is intentional and correct: combined mode
is transitional and Music is deleted in P3. Do **not** widen `DELEGATED` —
`canonical-delegate.test.ts:43` deliberately pins `/health/ready` as Music-owned, and changing
that is a P3 decision, not a P1 one.

Consequence: **every acceptance check for P1 runs with `EXPLORERS_API_MODE=canonical`.**

### Mount order is load-bearing — anchor to text, never to line numbers

The tasks are sequential, so each insertion shifts every line below it. Revision 1 gave numeric
insertion points computed against the unmodified file and they were wrong by Task 3. **Locate
each insertion by the adjacent source text quoted below.** The order, against the pristine file:

| Anchor text | Pristine line | Why it constrains you |
|---|---|---|
| `const app = instrument?.registration ?? actualApp;` | 60 | `actualApp` exists from here |
| `if(admission)app.use(admission.beforeDispatch);` | 61 | first registered layer (index 0) |
| `const authHandler = toNodeHandler(auth);` | 65 | the Better Auth transport |
| `if(admission)app.get('/api/auth/get-session',…)` | 69 | Apps-fixture only. **Task 2 goes directly AFTER this line** |
| `app.use("/api/auth", (request, response, next) => {` | 70 | origin guard; Task 2 must precede it |
| `app.all("/api/auth/*splat", authHandler);` | 78 | terminal, never calls `next` |
| `app.use(cookieParser());` / `app.use(contentBodyParser());` | 79 / 80 | Task 2 must precede these |
| `if(admission)app.use(admission.afterJsonParser);` | 81 | the typed gate |
| `app.get("/health/live", …{ status: "live" })` | 82 | **Tasks 3 and 4 go directly AFTER this line** |
| `instrument?.completeRegistration();` | 168 | closes registration; any later `app.use` throws in custody mode. **Task 5 goes directly BEFORE this line** |

The import block ends at **line 45** (`import {BookCatalog} from '../services/bookCatalog';`),
followed by a blank line. Add new imports there.

`createCanonicalApp` is `(pool: Pool, config: ExplorersAuthConfig, options?)` and returns
`{ app, auth }` (it returns `.composed` from `constructCanonicalApp`). `const { app } =
createCanonicalApp(pool, config)` is correct in the fixtures below.

### Three pre-existing conditions that will confuse you

`npm run check` exits non-zero on a clean tree — roughly 138 errors live in the duplicate
`client/` tree that `tsconfig.json:2` includes. Filter with `grep -E '^(shared|server)/'` and
expect no output.

`npm test` has about 8 failing files on Windows because Git Bash's `whoami` shadows
`whoami.exe`. Compare against a baseline run on `origin/main`, never against zero.

Two generated files are equality-sealed: `docs/architecture/music-runtime-surface-inventory.json`
(`runtime-surface-inventory.test.ts:182`) and `music-authorization-matrix.json`
(`music-authorization-matrix.test.ts:25`). Regenerate them **once, in Task 6**, inventory first
then matrix. Never hand-edit them.

---

## File structure

| File | Responsibility |
|---|---|
| `tunes/server/middleware/canonicalTerminator.ts` | **Create.** Trust-proxy resolution and the terminal JSON 404 + error handler |
| `tunes/server/policies/canonicalRetiredSurfaces.ts` | **Create.** The retired-route rule set with the `/api/auth` prefix rule removed |
| `tunes/server/routes/canonicalRetiredSurfaceRoutes.ts` | **Create.** The 410 boundary |
| `tunes/server/routes/explorersSeoRoutes.ts` | **Create.** robots.txt and the canonical sitemap |
| `tunes/server/auth/canonicalApp.ts` | **Modify.** Five mounts at the anchors above |
| `tunes/server/test/contracts/apps-fixture-composition.test.ts` | **Modify.** Task 2 shifts its positional layer indices |

**Out of scope, deliberately:** `explorers-earth/nginx.conf`. See
[The nginx problem](#the-nginx-problem-not-p1).

---

## Task 0: Get a checkout that has the code

- [ ] **Step 1: Confirm you are about to work on the right commit**

```bash
cd "C:/Users/TK/OneDrive/Desktop/Claude Data/explorers.earth-main/explorers.earth-main"
git fetch origin
git rev-parse --short origin/main
```

Expected: `10a3cd4a` or later. If it prints `7333dc41` you resolved local `main` — re-read the
command.

- [ ] **Step 2: Cut a worktree from `origin/main`**

```bash
git worktree add -b feat/p1-canonical-readiness ../ee-p1 origin/main
```

- [ ] **Step 3: Prove the code is there**

```bash
cd ../ee-p1 && ls tunes/server/auth/canonicalApp.ts && ls tunes/migrations/*.sql | wc -l
```

Expected: the path prints, and the count is `56`. If either fails, stop — do not continue in a
tree without the replatform.

- [ ] **Step 4: Install and record the test baseline**

```bash
cd tunes && npm ci
npx vitest run server/test 2>&1 | tail -20 > ../p1-baseline.txt
```

Keep `p1-baseline.txt`. Every later "nothing regressed" check compares against it, not zero.

**Do not commit.** This task produces no tree change.

---

## Task 1: Trust proxy

First, because it is the only insertion above the Better Auth block and it registers **no
layer** (`app.set` is configuration), so it cannot shift any index.

**This task is necessary but not sufficient, and P2 must finish it.** `resolveTrustedProxy`
returns `false` when neither variable is set, which is the right default but means shipping
P1 alone changes nothing: `req.ip` stays whatever the socket peer is. Behind a published
Docker port that peer is the bridge gateway, identical for every visitor, so
`express-rate-limit` — which keys on `req.ip` with no `keyGenerator`
(`explorersPublicProfileRoutes.ts:45`) — still puts the whole internet in one 120/min bucket
on the public profile routes. P2's Task 9 Step 9 determines the gateway address and sets
`EXPLORERS_TRUSTED_PROXY_IP` to it. Do not record "trust proxy done" as closing that risk.

**Files:**
- Create: `tunes/server/middleware/canonicalTerminator.ts`
- Modify: `tunes/server/auth/canonicalApp.ts`
- Test: `tunes/server/test/contracts/canonical-terminator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tunes/server/test/contracts/canonical-terminator.test.ts
import { describe, expect, it } from "vitest";
import { resolveTrustedProxy } from "../../middleware/canonicalTerminator";

describe("canonical trust proxy", () => {
  it("trusts exactly one configured address, never every upstream", () => {
    // Break caught: `trust proxy: true` ships and X-Forwarded-For becomes
    // attacker-controlled for anything keyed on request.ip.
    const trusted = resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect(typeof trusted).toBe("function");
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("::ffff:172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("[172.31.250.2]")).toBe(true);
    expect((trusted as (peer: string) => boolean)("172.31.250.3")).toBe(false);
  });

  it("still reads the variable the running compose file sets today", () => {
    // Break caught: the rename lands before docker-compose.yml is updated and
    // the deployed app silently stops trusting its only reverse proxy.
    const trusted = resolveTrustedProxy({ MUSIC_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
  });

  it("refuses a non-IP value and trusts nothing when unset", () => {
    expect(() => resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "traefik" })).toThrow();
    expect(resolveTrustedProxy({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-terminator.test.ts
```

Expected: `Error: Failed to resolve import "../../middleware/canonicalTerminator"`.
A different error means you are in the wrong directory.

- [ ] **Step 3: Write the implementation**

```ts
// tunes/server/middleware/canonicalTerminator.ts
import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;

function normalizePeerAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return unwrapped.toLowerCase().startsWith("::ffff:") ? unwrapped.slice(7) : unwrapped;
}

/**
 * Canonical replacement for `musicIdentityConfig.isTrustedProxy`
 * (config/music-identity-config.ts:152). The normalization is identical —
 * trim, unbracket, strip an IPv4-mapped prefix.
 *
 * Two DELIBERATE differences from the Music original: it has no live/fixture
 * mode, and an unset variable yields `false` (trust nobody) instead of throwing.
 * Throwing at construction would make every unit test that builds the canonical
 * app require the variable. Trusting nobody is the safe default — the only cost
 * is that request.ip reports the proxy's address until the variable is set.
 *
 * A set-but-invalid value still throws: that is a misconfiguration, not a default.
 * `trust proxy: true` is never produced, because it would make X-Forwarded-For
 * attacker-controlled.
 *
 * MUSIC_TRUSTED_PROXY_IP stays accepted so the running compose file keeps working
 * through the cutover; drop it when that variable is renamed.
 */
export function resolveTrustedProxy(environment: Environment): ((peer: string) => boolean) | false {
  const configured = normalizePeerAddress(
    environment.EXPLORERS_TRUSTED_PROXY_IP ?? environment.MUSIC_TRUSTED_PROXY_IP,
  );
  if (configured === undefined) return false;
  if (isIP(configured) === 0) throw new Error("EXPLORERS_TRUSTED_PROXY_IP must be one exact IP address");
  return (peer: string) => normalizePeerAddress(peer) === configured;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-terminator.test.ts
```

Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Mount it**

In `tunes/server/auth/canonicalApp.ts`, add to the end of the import block, directly after
`import {BookCatalog} from '../services/bookCatalog';`:

```ts
import { resolveTrustedProxy } from "../middleware/canonicalTerminator";
```

Then insert directly **after** the line `const app = instrument?.registration ?? actualApp;`
and **before** `if(admission)app.use(admission.beforeDispatch);`:

```ts
  // Configuration, not a layer — it registers nothing on the router stack and so
  // shifts no positional index. Set on actualApp: the custody view
  // (canonicalHandlerCustody.ts:63) overrides only route-registration methods,
  // so `app.set` would work too; actualApp makes that independence explicit.
  actualApp.set("trust proxy", resolveTrustedProxy(process.env));
```

- [ ] **Step 6: Prove nothing regressed**

```bash
cd tunes && npx vitest run server/test/contracts
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/'
```

Expected: contracts match `p1-baseline.txt`; the typecheck grep prints nothing.

- [ ] **Step 7: Commit**

```bash
git add tunes/server/middleware/canonicalTerminator.ts tunes/server/auth/canonicalApp.ts tunes/server/test/contracts/canonical-terminator.test.ts
git commit -m "feat(canonical): trust exactly one configured proxy address

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The retired-surface boundary and the `/api/auth` prefix guard

**The most dangerous ticket in P1.** `musicRetirementPolicy.ts:18` retires `/api/auth` as a
*prefix*. Port the matcher verbatim and every Better Auth route returns 410 — all sign-in, all
sessions — and no existing test catches it.

It is also the only task that **adds a router layer**, which breaks a test that drives the stack
by index. Step 6 fixes that; do not skip it.

**Files:**
- Create: `tunes/server/policies/canonicalRetiredSurfaces.ts`
- Create: `tunes/server/routes/canonicalRetiredSurfaceRoutes.ts`
- Modify: `tunes/server/auth/canonicalApp.ts`
- Modify: `tunes/server/test/contracts/apps-fixture-composition.test.ts`
- Test: `tunes/server/test/contracts/canonical-retired-surfaces.test.ts`

- [ ] **Step 1: Write the failing test — the guard first**

```ts
// tunes/server/test/contracts/canonical-retired-surfaces.test.ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import type { ExplorersAuthConfig } from "../../auth/betterAuth";

const FIXTURE_ORIGIN = "http://127.0.0.1:51474";

const config: ExplorersAuthConfig = {
  baseURL: FIXTURE_ORIGIN,
  googleCallbackURL: `${FIXTURE_ORIGIN}/api/auth/callback/google`,
  trustedOrigins: [FIXTURE_ORIGIN],
  secret: "contract-fixture-secret-contract-fixture-secret-0000000000000000",
  googleClientId: "contract-fixture-client-id",
  googleClientSecret: "contract-fixture-client-secret",
};

function stubPool() {
  const queries: string[] = [];
  const answer = async (text: unknown) => { queries.push(String(text)); return { rows: [], rowCount: 0 }; };
  const pool = { query: answer, connect: async () => ({ query: answer, release: () => undefined }) };
  return { pool: pool as never, queries };
}

describe("canonical retired-surface boundary", () => {
  it("leaves the Better Auth route group entirely alone", async () => {
    // Break caught: musicRetirementPolicy's `/api/auth` PREFIX rule is ported
    // verbatim and every Better Auth route answers 410. This is the single most
    // destructive way this ticket can fail and nothing else would catch it.
    // 403 (not 410) is the correct answer here: the origin guard at
    // canonicalApp.ts:70 rejects a POST with no matching Origin header.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const social = await request(app).post("/api/auth/sign-in/social");
    expect(social.status).toBe(403);
    expect(social.body.error.code).toBe("ORIGIN_FORBIDDEN");
  });

  it.each([
    ["post", "/api/auth/sync", "LEGACY_IDENTITY_ROUTE_REMOVED"],
    ["post", "/graphql", "GRAPHQL_PROXY_REMOVED"],
    ["get", "/api/strapi/config", "GRAPHQL_PROXY_REMOVED"],
    ["get", "/api/playlists", "LEGACY_OWNER_ROUTE_REMOVED"],
  ] as const)("tombstones %s %s", async (method, path, code) => {
    // Break caught: a retired path falls through to the JSON 404 and old clients
    // get no signal that the surface was deliberately removed.
    const { pool, queries } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app)[method](path);
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.retryable).toBe(false);
    expect(queries).toEqual([]);
  });

  it("normalizes traversal and case before matching", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    for (const path of ["/GraphQL", "/api/x/../subscriptions/user-plans/hostile"]) {
      expect((await request(app).get(path)).status).toBe(410);
    }
  });

  it("refuses a retired POST without parsing its body", async () => {
    // Break caught: mounted after contentBodyParser(), so a hostile oversized
    // body on a dead path is still read into memory.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).post("/graphql")
      .set("content-type", "application/json").send("{".repeat(40_000));
    expect(response.status).toBe(410);
  });

  it("does not tombstone any surface this plan adds or the app already serves", async () => {
    // Break caught: a rule such as `/api` or `/api/seo` is read as a prefix and
    // silently kills /health/live, the sitemap, or the canonical v1 routes.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    for (const path of ["/health/live", "/health/ready", "/robots.txt",
                        "/sitemap.xml", "/api/explorers-sitemap.xml",
                        "/api/explorers/v1/me", "/api/auth/callback/google"]) {
      expect((await request(app).get(path)).status).not.toBe(410);
    }
  });
});
```

The last case will pass trivially before the boundary exists; it is the regression gate that
makes Tasks 3 and 4 safe. The exhaustive rule-by-rule audit behind it is recorded in
[Retirement rules audited](#retirement-rules-audited).

- [ ] **Step 2: Run it and confirm the failure shape**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-retired-surfaces.test.ts
```

Expected: the first and last cases **pass** (nothing 410s yet); the tombstone cases fail with
`expected 410, received 404`. That asymmetry is the point — the guards must be green before and
after.

- [ ] **Step 3: Write the rule set**

```ts
// tunes/server/policies/canonicalRetiredSurfaces.ts
import { RETIRED_MUSIC_ROUTE_RULES, normalizeMusicRoutePath,
  type RetiredMusicRouteRule } from "./musicRetirementPolicy";

/**
 * The canonical application OWNS `/api/auth/*` — it is Better Auth's route group
 * (canonicalApp.ts:77-78), not a retired surface. musicRetirementPolicy.ts:18
 * retires that whole prefix, which was correct inside the Music composition and
 * is fatal here. The three legacy bridges are re-declared as EXACT paths and the
 * prefix rule is dropped.
 *
 * Verified safe to tombstone: none of the three is a Better Auth route, and the
 * only reference in explorers-earth/src is
 * features/music/__tests__/legacyMusicBoundary.test.ts:28, which asserts the
 * legacy path is NOT used.
 */
const RETIRED_LEGACY_IDENTITY_BRIDGES: readonly RetiredMusicRouteRule[] = [
  { family: "legacy-browser-identity", path: "/api/auth/sync", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/auth/user-data", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/auth/onboarding-status", match: "exact", classification: "tombstone" },
] as const;

export const CANONICAL_RETIRED_ROUTE_RULES: readonly RetiredMusicRouteRule[] = [
  ...RETIRED_MUSIC_ROUTE_RULES.filter((rule) => !(rule.path === "/api/auth" && rule.match === "prefix")),
  ...RETIRED_LEGACY_IDENTITY_BRIDGES,
] as const;

/** Verbatim copy of matchRetiredMusicSurface (musicRetirementPolicy.ts:74-77). */
export function matchCanonicalRetiredSurface(rawPath: string): RetiredMusicRouteRule | undefined {
  const path = normalizeMusicRoutePath(rawPath);
  if (!path) return undefined;
  return CANONICAL_RETIRED_ROUTE_RULES.find((rule) => {
    if (rule.exclusions?.includes(path)) return false;
    return rule.match === "exact" ? path === rule.path : path === rule.path || path.startsWith(`${rule.path}/`);
  });
}
```

- [ ] **Step 4: Write the boundary**

```ts
// tunes/server/routes/canonicalRetiredSurfaceRoutes.ts
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { errorEnvelope, type ContainmentCode } from "../containment-error-contract";
import { matchCanonicalRetiredSurface } from "../policies/canonicalRetiredSurfaces";

function requestIdFor(supplied: string | undefined): string {
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied) ? supplied : randomUUID();
}

function codeFor(family: string): ContainmentCode {
  if (family === "graphql-service-proxy") return "GRAPHQL_PROXY_REMOVED";
  if (family === "legacy-browser-identity") return "LEGACY_IDENTITY_ROUTE_REMOVED";
  return "LEGACY_OWNER_ROUTE_REMOVED";
}

/**
 * Fail-closed 410 boundary for every surface the Music composition retired.
 * Mounted ahead of contentBodyParser() so a retired path never has its body read.
 *
 * The `"/{*name}"` wildcard is the idiom already used by
 * routes/musicSurfaceRoutes.ts:735 and is pinned by the route inventory.
 */
export function setupCanonicalRetiredSurfaces(app: Express): void {
  app.all("/{*canonicalRetiredPath}", (request, response, next) => {
    const retirement = matchCanonicalRetiredSurface(request.originalUrl);
    if (!retirement) return next();
    const requestId = requestIdFor(request.get("x-request-id"));
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Cache-Control", "no-store");
    return response.status(410).json(errorEnvelope(codeFor(retirement.family), requestId));
  });
}
```

- [ ] **Step 5: Mount it**

Add to the end of the import block:

```ts
import { setupCanonicalRetiredSurfaces } from "../routes/canonicalRetiredSurfaceRoutes";
```

Insert directly **after** the line beginning
`if(admission)app.get('/api/auth/get-session'` and directly **before**
`app.use("/api/auth", (request, response, next) => {`:

```ts
  setupCanonicalRetiredSurfaces(app);
```

- [ ] **Step 6: Fix the positional layer indices this insertion shifts**

`tunes/server/test/contracts/apps-fixture-composition.test.ts` has a case named
`'actual JSON parser precedes typed gate; source body is not consumed by first gate'` that
drives the stack by index:

```ts
layers[6].handle(req,res,(error?:unknown)=>{if(error)return reject(error);typed=layers[7].handle(req,res,…
```

In the Apps-fixture composition those are `contentBodyParser()` (index 6) and
`admission.afterJsonParser` (index 7). Your new `app.all` sits at index 2, pushing both to 7 and
8 — the test would then drive `cookieParser` and `contentBodyParser`, and its
`expect(req.body).toEqual({…})` fails.

Replace the two index lookups with identity lookups so this can never rot again:

```ts
const parserIndex=layers.findIndex((v:any)=>v.name==='jsonParser'||v.handle?.name==='jsonParser');
const parser=layers[parserIndex],gate=layers[parserIndex+1];
```

then drive `parser.handle` and `gate.handle` in place of `layers[6]`/`layers[7]`.

Confirm the real handler name first — `node -e` against the composed stack, or read
`contentBodyParser`'s definition — and use whatever it actually is. Do **not** guess the name
and leave a `findIndex` that returns `-1`: that silently makes `layers[-1]` undefined and the
test throws a confusing `Cannot read properties of undefined`.

`layers[0]` is asserted independently in two other cases and does **not** move (Task 1 adds no
layer, and your insertion is at index 2). Leave those alone.

- [ ] **Step 7: Run the tests**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-retired-surfaces.test.ts server/test/contracts/apps-fixture-composition.test.ts
```

Expected: all pass, **including the Better Auth guard and the "does not tombstone" case**. If the
guard now returns 410, the prefix rule leaked through — check the `filter` in step 3.

- [ ] **Step 8: Prove Better Auth still works end to end**

```bash
cd tunes && npx vitest run server/test/contracts/platform-route-signatures.test.ts server/test/explorers-auth.test.ts server/test/contracts/canonical-delegate.test.ts
```

Expected: all pass. This is the regression gate for the destructive failure mode.

- [ ] **Step 9: Commit**

```bash
git add tunes/server/policies/canonicalRetiredSurfaces.ts tunes/server/routes/canonicalRetiredSurfaceRoutes.ts tunes/server/auth/canonicalApp.ts tunes/server/test/contracts/canonical-retired-surfaces.test.ts tunes/server/test/contracts/apps-fixture-composition.test.ts
git commit -m "feat(canonical): tombstone retired surfaces without retiring Better Auth

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: SEO routes

**Files:**
- Create: `tunes/server/routes/explorersSeoRoutes.ts`
- Modify: `tunes/server/auth/canonicalApp.ts`
- Test: `tunes/server/test/contracts/canonical-seo-routes.test.ts`

- [ ] **Step 1: Read the implementation you are replacing**

```bash
cd tunes && sed -n '170,240p' server/seo-routes.ts
```

`server/seo-routes.ts` already registers `/robots.txt` (:178), `/sitemap.xml` (:195) and
`/api/explorers-sitemap.xml` (:216), with tests at `server/routes/__tests__/seoRoutes.test.ts`.
Read it for behavioural parity — robots directives, cache headers, XML shape — and keep the
public contract identical except for the data source. Do not invent a new XML shape.

- [ ] **Step 2: Write the failing test**

```ts
// tunes/server/test/contracts/canonical-seo-routes.test.ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { PUBLIC_PROFILE_SITEMAP_SQL } from "../../routes/explorersSeoRoutes";
import type { ExplorersAuthConfig } from "../../auth/betterAuth";

const FIXTURE_ORIGIN = "http://127.0.0.1:51474";
const config: ExplorersAuthConfig = {
  baseURL: FIXTURE_ORIGIN,
  googleCallbackURL: `${FIXTURE_ORIGIN}/api/auth/callback/google`,
  trustedOrigins: [FIXTURE_ORIGIN],
  secret: "contract-fixture-secret-contract-fixture-secret-0000000000000000",
  googleClientId: "contract-fixture-client-id",
  googleClientSecret: "contract-fixture-client-secret",
};

function sitemapPool(rows: unknown[], fail = false) {
  const queries: string[] = [];
  const answer = async (text: unknown) => {
    queries.push(String(text));
    if (fail) throw new Error("database unavailable");
    return { rows, rowCount: rows.length };
  };
  const pool = { query: answer, connect: async () => ({ query: answer, release: () => undefined }) };
  return { pool: pool as never, queries };
}

describe("canonical SEO routes", () => {
  it("registers without querying at construction time", () => {
    // Break caught: a warm-on-mount cache fires a query during composition and
    // platform-route-signatures.test.ts, which asserts zero queries across its
    // probes, fails for a reason that looks unrelated.
    const { pool, queries } = sitemapPool([]);
    createCanonicalApp(pool, config);
    expect(queries).toEqual([]);
  });

  it("serves robots.txt with no database read", async () => {
    const { pool, queries } = sitemapPool([]);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).toContain("Sitemap: https://explorers.earth/sitemap.xml");
    expect(queries).toEqual([]);
  });

  it("builds the sitemap from creator_accounts, never from Strapi", async () => {
    const { pool, queries } = sitemapPool([
      { handle: "ada", updated_at: new Date("2026-08-14T00:00:00Z"), public_categories: ["places", "books"] },
    ]);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers-sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.text).toContain("<loc>https://explorers.earth/ada</loc>");
    expect(response.text).toContain("<loc>https://explorers.earth/ada/places</loc>");
    expect(response.text).toContain("<lastmod>2026-08-14</lastmod>");
    expect(response.text).not.toContain("localqr.earth");
    expect(response.text).not.toContain("/playlist/");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("FROM creator_accounts");
  });

  it("applies every predicate the public profile reader applies", () => {
    // Break caught: the sitemap advertises profiles the reader 404s for.
    // Derived from PostgresPublicProfileGateway.resolveAccount
    // (publicProfile/postgresPublicProfileGateway.ts:26-32) — if that query
    // changes, this test is the thing that notices.
    for (const predicate of [
      "a.status = 'active'", "a.onboarding_status = 'complete'",
      "a.public_profile = true", "JOIN account_presentation",
    ]) expect(PUBLIC_PROFILE_SITEMAP_SQL).toContain(predicate);
  });

  it("never reads a column account_category_settings does not have", () => {
    // Break caught: `s.updated_at` is written from habit. That table has only
    // account_id, category, is_public, display_order, pinned_order
    // (migrations/0022_explorers_identity.sql:121-130) and the query errors at
    // runtime — invisibly, because the fallback below answers 200.
    expect(PUBLIC_PROFILE_SITEMAP_SQL).not.toContain("s.updated_at");
  });

  it("answers 200 with static pages when the database is unavailable, and says so", async () => {
    // Break caught: a transient fault turns the sitemap into a 5xx and teaches
    // crawlers the document is broken. The header is what distinguishes a
    // degraded answer from a healthy one — without it a permanently broken
    // query looks exactly like an empty site.
    const { pool } = sitemapPool([], true);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers-sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-sitemap-degraded"]).toBe("true");
    expect(response.text).toContain("<loc>https://explorers.earth/</loc>");
  });
});
```

- [ ] **Step 3: Run it**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-seo-routes.test.ts
```

Expected: `Failed to resolve import "../../routes/explorersSeoRoutes"`.

- [ ] **Step 4: Write the implementation**

Create `tunes/server/routes/explorersSeoRoutes.ts` exporting `EXPLORERS_STATIC_SITEMAP_URLS`,
`CANONICAL_ROBOTS_TXT`, `escapeXml`, `buildSitemapXml`, `PUBLIC_PROFILE_SITEMAP_SQL`,
`publicProfileSitemapUrls` and `setupExplorersSeoRoutes(app, pool)`. The query — matched to the
public reader, and using **`a.updated_at` alone** because `account_category_settings` has no
`updated_at` column:

```sql
  SELECT a.handle,
         a.updated_at,
         COALESCE(ARRAY_AGG(s.category ORDER BY s.category)
                  FILTER (WHERE s.is_public), '{}') AS public_categories
    FROM creator_accounts a
    JOIN account_presentation p ON p.account_id = a.id
    LEFT JOIN account_category_settings s ON s.account_id = a.id
   WHERE a.status = 'active'
     AND a.onboarding_status = 'complete'
     AND a.public_profile = true
   GROUP BY a.id, a.handle, a.updated_at
   ORDER BY a.handle
   LIMIT $1
```

`a.handle IS NOT NULL` is deliberately absent: the reader does not apply it, and
`creator_accounts_complete_valid` (`migrations/0022_explorers_identity.sql:93`) already forces
`handle IS NOT NULL` whenever `onboarding_status='complete'`.

Register `/robots.txt`, `/api/explorers-sitemap.xml` and `/sitemap.xml` (the last two serve the
same document). Cache the rendered XML for one hour **lazily, on first request** — never at
mount. On a query failure, serve the static pages with `Cache-Control: no-store` **and
`X-Sitemap-Degraded: true`**, and log at warn level; a silent degrade is indistinguishable from
an empty site.

- [ ] **Step 5: Mount it**

Add the import, then insert directly **after** the `/health/live` line:

```ts
  setupExplorersSeoRoutes(app, pool);
```

- [ ] **Step 6: Run the test**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-seo-routes.test.ts
```

Expected: `Tests  6 passed (6)`.

- [ ] **Step 7: Prove the query actually runs against Postgres**

Every test above uses a stub pool that never executes SQL, so a column error would not surface.
Run the statement for real:

```bash
cd tunes && npm run platform:local -- provision
```

```bash
docker exec explorers-replatform-local-postgres-1 psql -U postgres -d music_fixture -c "EXPLAIN SELECT a.handle, a.updated_at, COALESCE(ARRAY_AGG(s.category ORDER BY s.category) FILTER (WHERE s.is_public), '{}') AS public_categories FROM creator_accounts a JOIN account_presentation p ON p.account_id = a.id LEFT JOIN account_category_settings s ON s.account_id = a.id WHERE a.status = 'active' AND a.onboarding_status = 'complete' AND a.public_profile = true GROUP BY a.id, a.handle, a.updated_at ORDER BY a.handle LIMIT 1000"
```

Expected: a query plan. `ERROR: column … does not exist` means the SQL is wrong — fix it before
committing. **This step is not optional**; it is the only thing standing between a typo and a
sitemap that silently serves three static URLs forever.

- [ ] **Step 8: Commit**

```bash
git add tunes/server/routes/explorersSeoRoutes.ts tunes/server/auth/canonicalApp.ts tunes/server/test/contracts/canonical-seo-routes.test.ts
git commit -m "feat(canonical): serve robots.txt and the sitemap from canonical data

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Readiness endpoint

Simplified by the pipeline decision: no byte-exact contract.

**Why it exists even though `canonicalStartup.ts:37` already calls `checkMusicDatabaseReadiness`
and throws at boot:** the boot check runs once, before the listener accepts traffic. The new
pipeline needs an **HTTP** signal it can poll after `compose up` to know the container is
serving, and a liveness probe that only proves the event loop is turning is not that. It also
catches a database that goes away after boot, which the startup check cannot.

**And there is a startup failure it must not miss.** `canonicalStartup.ts` calls
`httpServer.listen()` at `:43-49` and only then `resolveObjectStorage(environment)` at `:50`.
If that throws — a missing bucket, region or AWS credential — the catch at `:71-73` ends the
pool and rethrows **without closing the listener**, and `api.ts:29` responds by setting
`process.exitCode = 1`. An open listener holds the event loop, so the process does not exit,
Docker never restarts it, and `/health/live` keeps answering `200 {"status":"live"}` — which
is exactly what `tunes/Dockerfile:71` uses as the container healthcheck.

A DB-ping-plus-migration readiness check does not cover this on its own. It happens to return
503 today only because the same catch calls `pool.end()`, which makes the ping fail — an
accident, and one that disappears the moment a pool is passed in rather than owned. Step 6
closes it properly.

**Files:**
- Modify: `tunes/server/auth/canonicalApp.ts`
- Test: `tunes/server/test/deployment/canonical-readiness-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tunes/server/test/deployment/canonical-readiness-route.test.ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import type { ExplorersAuthConfig } from "../../auth/betterAuth";

const FIXTURE_ORIGIN = "http://127.0.0.1:51474";
const config: ExplorersAuthConfig = {
  baseURL: FIXTURE_ORIGIN,
  googleCallbackURL: `${FIXTURE_ORIGIN}/api/auth/callback/google`,
  trustedOrigins: [FIXTURE_ORIGIN],
  secret: "contract-fixture-secret-contract-fixture-secret-0000000000000000",
  googleClientId: "contract-fixture-client-id",
  googleClientSecret: "contract-fixture-client-secret",
};

function pool(fail = false) {
  const answer = async () => { if (fail) throw new Error("db down"); return { rows: [], rowCount: 0 }; };
  return { query: answer, connect: async () => ({ query: answer, release: () => undefined }) } as never;
}

describe("canonical readiness", () => {
  it("refuses when the database is unreachable", async () => {
    // Break caught: the pipeline declares a deploy successful against a container
    // that cannot reach PostgreSQL.
    const { app } = createCanonicalApp(pool(true), config);
    const response = await request(app).get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.reason).toBe("database-unreachable");
  });

  it("refuses when migrations have not reached the expected marker", async () => {
    // checkMusicDatabaseReadiness returns {ready:false,reason:"migration-state-invalid"}
    // against the stub pool, which has no schema_migrations rows.
    const { app } = createCanonicalApp(pool(), config);
    const response = await request(app).get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.reason).toBe("migration-state-invalid");
  });

  it("keeps liveness on its canonical shape", async () => {
    const { app } = createCanonicalApp(pool(), config);
    const liveness = await request(app).get("/health/live");
    expect(liveness.body).toEqual({ status: "live" });
  });
});
```

There is deliberately **no** happy-path unit case: a stub pool cannot satisfy
`checkMusicDatabaseReadiness`, and faking it would assert the mock rather than the endpoint. The
200 is proven in step 5 against real Postgres.

- [ ] **Step 2: Run it**

```bash
cd tunes && npx vitest run server/test/deployment/canonical-readiness-route.test.ts
```

Expected: the first two cases fail with `expected 503, received 404`.

- [ ] **Step 3: Mount the handler**

Add `import { checkMusicDatabaseReadiness } from "../db/readiness";` to the import block if it
is not already there, then insert directly **after** the `setupExplorersSeoRoutes` line:

```ts
  app.get("/health/ready", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
    } catch {
      response.status(503).json({ ready: false, reason: "database-unreachable" });
      return;
    }
    const readiness = await checkMusicDatabaseReadiness(pool)
      .catch(() => ({ ready: false as const, reason: "migration-state-invalid" as const }));
    if (!readiness.ready) {
      response.status(503).json({ ready: false, reason: "migration-state-invalid" });
      return;
    }
    response.status(200).json({ ready: true });
  });
```

`checkMusicDatabaseReadiness` takes `Pick<Pool,"connect">`, which the real pool and the stub both
satisfy.

- [ ] **Step 4: Run the test**

```bash
cd tunes && npx vitest run server/test/deployment/canonical-readiness-route.test.ts
```

Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Prove the 200 against real Postgres**

```bash
cd tunes && npm run platform:local -- provision
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:51474/health/ready
```

Expected: `200`. A `503` with `migration-state-invalid` against a provisioned stack means the
marker check disagrees with the 56 applied migrations — investigate before committing.

- [ ] **Step 6: Make a post-listen startup failure actually stop the process**

Add a test first, in the same file:

```ts
  it("closes the listener when startup fails after listen()", async () => {
    // Break caught: resolveObjectStorage throws at canonicalStartup.ts:50, after
    // listen() has already resolved. The catch rethrows without closing the
    // server, the open handle keeps the event loop alive, process.exitCode=1
    // never terminates anything, and the container sits there answering
    // /health/live with 200 forever.
    await expect(startCanonicalServer({
      ...canonicalStartupEnvironment(),
      EXPLORERS_MEDIA_S3_BUCKET: undefined,
    } as never)).rejects.toThrow();
    // The assertion that matters: no listening handle survives the rejection.
    const handles = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles();
    expect(handles.filter((h) => (h as { listening?: boolean }).listening)).toEqual([]);
  });
```

Build `canonicalStartupEnvironment()` from whatever fixture the existing startup tests use —
find it with `grep -rn "startCanonicalServer" tunes/server/test`. If none exists, this step
needs a minimal env fixture before the test will run at all.

Then change the catch in `tunes/server/auth/canonicalStartup.ts:70-73` so it closes the
server it opened:

```ts
  } catch (error) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve())).catch(() => undefined);
    if (ownsPool) await pool.end().catch(() => undefined);
    throw error;
  }
```

`httpServer` is declared inside the `try`, so hoist its declaration above the `try` (or keep a
`let listening: Server | undefined` the `try` assigns) — otherwise it is out of scope in the
catch and this will not compile.

This is the one place P1 changes existing behaviour rather than adding to it. It is in scope
because the readiness endpoint is the thing meant to catch this class of failure, and without
it the endpoint's guarantee is accidental.

- [ ] **Step 7: Commit**

```bash
git add tunes/server/auth/canonicalApp.ts tunes/server/auth/canonicalStartup.ts tunes/server/test/deployment/canonical-readiness-route.test.ts
git commit -m "feat(canonical): add a readiness endpoint the deploy can gate on

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The terminator

**Must be last**, and must sit directly **before** `instrument?.completeRegistration();`, which
closes registration and makes any later `app.use` throw in custody mode.

**This task uses `apiErrorSchema`, not `errorEnvelope`** — see
[Two error contracts](#two-error-contracts-not-one--do-not-mix-them). `NOT_FOUND`,
`INVALID_INPUT`, `RESOURCE_TOO_LARGE` and `PROVIDER_UNAVAILABLE` are `apiErrorCodes` members and
are **not** `ContainmentCode`s. The schema is `.strict()` with exactly
`{code, message, requestId}` — **do not add `retryable`**, which Task 2's envelope has and this
one does not.

**Files:**
- Modify: `tunes/server/middleware/canonicalTerminator.ts`, `tunes/server/auth/canonicalApp.ts`
- Test: `tunes/server/test/contracts/canonical-terminator.test.ts` (extend Task 1's file)

- [ ] **Step 1: Add the failing tests**

Add `request`, `createCanonicalApp`, `stubPool` and `config` to Task 1's file — copy them from
Task 2's test rather than importing across test files — then append:

```ts
  it("answers an unmatched path with JSON, never Express HTML", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers/v1/no-such-route");
    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.text).not.toContain("<html");
  });

  it("emits an envelope apiErrorSchema accepts, with no extra fields", async () => {
    // Break caught: `retryable` is copied over from the containment envelope.
    // apiErrorSchema is .strict(), so the extra key is a contract violation that
    // a loose toMatchObject assertion would never notice.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers/v1/no-such-route");
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(Object.keys(response.body.error).sort()).toEqual(["code", "message", "requestId"]);
  });

  it("turns a body-parser failure into a canonical 400, not an HTML 500", async () => {
    // Break caught: contentBodyParser calls next(error) and nothing handles it,
    // so Express renders HTML and, outside production, a stack trace.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).post("/api/explorers/v1/recovery/start")
      .set("origin", FIXTURE_ORIGIN).set("content-type", "application/json").send("{ not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.text).not.toContain("SyntaxError");
  });

  it("is registered as a real error handler, not demoted middleware", () => {
    // Break caught: a rest parameter or a default value makes fn.length !== 4.
    // Express and canonicalHandlerCustody.ts:61 both identify error handlers by
    // arity, so the handler silently never runs and only the 404 path still works.
    expect(canonicalErrorHandler).toHaveLength(4);
  });

  it("does not shadow any mounted route", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    expect((await request(app).get("/health/live")).status).toBe(200);
    expect((await request(app).get("/robots.txt")).status).toBe(200);
    expect((await request(app).get("/api/explorers/v1/me")).status).toBe(401);
  });
```

Import `apiErrorSchema` from `../../../shared/explorersContract` and `canonicalErrorHandler`
from the middleware module.

- [ ] **Step 2: Run and confirm failure**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-terminator.test.ts
```

Expected: the 404 case returns `text/html`; the parser case returns 500 with a stack trace.

- [ ] **Step 3: Add the terminator to the middleware file**

Append to `canonicalTerminator.ts`: a 404 middleware emitting the `apiErrorSchema` envelope, and
a **named, exported** `canonicalErrorHandler` mapping `entity.too.large` to 413
`RESOURCE_TOO_LARGE`, `entity.parse.failed` to 400 `INVALID_INPUT`, and everything else to 500
`PROVIDER_UNAVAILABLE`, each with a fresh `requestId`, `X-Request-Id` and
`Cache-Control: no-store`, guarded by `if (response.headersSent) return next(error);`. Export
`setupCanonicalTerminator(app)` that registers both.

Export the handler by name so step 1's arity test can reach it. Declare exactly four parameters
— `(error, request, response, next)` — with no rest parameter and no defaults.

- [ ] **Step 4: Mount it**

Insert directly **before** `instrument?.completeRegistration();`:

```ts
  setupCanonicalTerminator(app);
```

- [ ] **Step 5: Run the test**

```bash
cd tunes && npx vitest run server/test/contracts/canonical-terminator.test.ts
```

Expected: `Tests  8 passed (8)`.

- [ ] **Step 6: Prove the delegate still falls through**

The terminator is terminal *inside* the canonical app. `canonicalDelegate.ts:56` pre-filters by
path, so in `combined` mode a non-delegated request never enters it — but prove that rather than
assume it:

```bash
cd tunes && npx vitest run server/test/contracts/canonical-delegate.test.ts
```

Expected: passes unchanged. If it does not, the terminator is being reached by paths the
delegate is supposed to pass to Music, and `combined` mode is broken.

- [ ] **Step 7: Commit**

```bash
git add tunes/server/middleware/canonicalTerminator.ts tunes/server/auth/canonicalApp.ts tunes/server/test/contracts/canonical-terminator.test.ts
git commit -m "feat(canonical): terminate unmatched paths and errors as JSON

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Regenerate the sealed inventories

Once, after all five tasks.

- [ ] **Step 1: Regenerate, inventory first**

```bash
cd tunes
npx tsx scripts/inventory-runtime-surfaces.ts --write
npx tsx scripts/generate-music-authorization-matrix.ts
```

`--write` is required (`inventory-runtime-surfaces.ts:215` guards on it). The matrix generator
reads the **committed** inventory JSON, so the order is load-bearing. There are no npm script
wrappers; `npx tsx` is the only path.

- [ ] **Step 2: Update the pinned counts**

`runtime-surface-inventory.test.ts:21` pins `expect(inventory.routes).toHaveLength(199)` and
`:70-71` pins 21 `ALL` routes. Both move: Task 2 adds one `ALL` route, Tasks 3 and 4 add four
`GET` routes, so expect 204 and 22. Set them to the regenerated values and extend the comment
above each in the existing style.

- [ ] **Step 3: Review the diff by hand**

```bash
git diff docs/architecture/music-runtime-surface-inventory.json | head -80
```

Every route below an insertion point shifts its recorded `line`, so the diff looks far larger
than five added rows. Confirm no route you did not add appears, and none you expected is missing.

Expect one cosmetic difference: `scripts/inventory-runtime-surfaces.ts:150` hardcodes
`path === "/{*musicRetiredPath}"` for the `normalized-executable-retirement-matcher` policy
label, so `/{*canonicalRetiredPath}` is recorded as `fail-closed-tombstone` instead. Nothing
asserts it; leave it and note it in the commit body.

Expect `/robots.txt`, `/sitemap.xml` and `/api/explorers-sitemap.xml` to appear **twice** — once
from `server/seo-routes.ts` and once from the new file. That is correct until Music is deleted
in P3. No classification work is needed: `musicSurfacePolicy.ts:75-84` already lists all four new
paths in `PUBLIC_PATHS`.

- [ ] **Step 4: Full verification**

```bash
cd tunes
npx vitest run server/test 2>&1 | tail -20
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '^(shared|server)/'
```

Expected: identical to `p1-baseline.txt` except the new files; the typecheck grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/music-runtime-surface-inventory.json docs/architecture/music-authorization-matrix.json tunes/server/test/contracts/runtime-surface-inventory.test.ts
git commit -m "chore(canonical): regenerate route inventory and authorization matrix

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## The nginx problem (not P1)

Revision 1 folded "fix `explorers-earth/nginx.conf:26`" into P1-2 as a one-line change. That was
wrong in three ways, and nginx is now **out of P1 scope entirely**.

1. **`tunes-app:5000` appears five times** — lines 26, 48, 56, 64 and 72 — not once.
2. **No compose file defines a service named `tunes-app`.** The services are `tunes-blue`,
   `tunes-green`, `tunes-gate` (root `docker-compose.yml`) and `tunes` (the fixture files). With
   a literal upstream name and no resolver, nginx fails to start when the name does not resolve
   — so either the deployed config differs from the repo's, or this block has never run. **That
   must be established by looking at the running server, not by reading the file.**
3. **Four of the five are the scraper endpoints** `/api/apps/scrape-url`,
   `/api/products/scrape-link`, `/api/people/scrape-profile` and `/api/proxy-image` — all matched
   as `prefix` tombstones by `musicRetirementPolicy.ts:38-41`. Repointing them at the canonical
   API while Task 2's boundary is mounted converts four live endpoints into 410s.

Two further findings from the same file that P1 does not touch and P2 must:

- **`location /api/` and `/graphql` still proxy to `https://api.localqr.earth`** — Strapi. The
  frontend's entire API surface, in production, still goes to the system this replatform
  replaces. That is the actual cutover, and it is P2's central problem, not a line edit.
- **There is no `location = /robots.txt`.** The SPA fallback serves the committed static
  `explorers-earth/public/robots.txt`. Task 3's robots.txt route is therefore reachable in
  canonical mode and dead behind this nginx. Keeping both is fine for P1; P2 decides which wins.

**Action:** carry these into the P2 plan as its first investigation ticket, whose first step is
reading the nginx config actually running on the explorers host.

---

## Retirement rules audited

Every rule in `RETIRED_MUSIC_ROUTE_RULES` (`musicRetirementPolicy.ts:12-53`) was checked against
every path the canonical app serves:

- **COLLIDES — exactly one:** `{path:"/api/auth", match:"prefix"}` (:18). Task 2 filters it.
- **SAFE — all 32 others.** `/api` is `exact`, not a prefix. `/api/seo` does not reach
  `/api/explorers-sitemap.xml`. The root-level `/apps`, `/products`, `/people`, `/proxy-image`
  and `/itunes-api` prefixes match nothing the canonical app mounts. `/health/*`, `/robots.txt`,
  `/sitemap.xml` and `/api/auth/callback/google` are matched by no rule.

Task 2's last test case is the executable form of this audit — it is what will catch a new rule
added later that collides with a canonical route.

---

## Self-review

**Spec coverage.** P1-1 → Task 4. P1-2 → Task 3 (nginx split out, see above). P1-3 → Task 2.
P1-4 deleted. P1-5 → Tasks 1 and 5. The sealed-inventory consequence → Task 6. The checkout
blocker → Task 0.

**Ordering is enforced by anchor text, not convention.** `trust proxy` registers no layer and so
cannot shift an index; Task 2 is the only layer insertion and must precede both the Better Auth
origin guard and `contentBodyParser()` — the real reason being that a retired path's body must
never be read. (Revision 1 also claimed Origin-less deploy probes would 403, which is false: the
origin guard only rejects non-`GET`/`HEAD`/`OPTIONS`.) Tasks 3 and 4 follow `/health/live`.
Task 5 must follow every route or it shadows them, and must precede `completeRegistration()`.

**Verified against real Postgres, not just stubs.** Tasks 3 and 4 each have a step that executes
against the provisioned stack, because both have a failure mode — a missing column, a
disagreeing migration marker — that a stub pool cannot reveal and that degrades silently.

**Remaining unknown, stated not hidden.** Whether the nginx config in the repo is the one running
on the explorers host. Nothing in P1 depends on the answer; P2's first ticket establishes it.

---

## Corrections from review

Revision 1 claimed these; all seven were confirmed wrong against the code.

| # | Revision 1 said | The code says |
|---|---|---|
| 1 | Work in the primary directory | That tree has none of this code; it is on `origin/main` (`10a3cd4a`) |
| 2 | `toNodeHandler` is mounted at `:70-78` | It is at `:65`; `:70-76` is the origin guard, `:77-78` the mounts |
| 3 | Imports end at line 41 | Line 45 |
| 4 | Task 5 uses `errorEnvelope` codes | Those four codes are `apiErrorCodes`; `apiErrorSchema` is strict and has no `retryable` |
| 5 | `resolveTrustedProxy` has the same semantics as the Music original | It differs deliberately — no mode, and `false` instead of a throw when unset |
| 6 | The matrix equality seal is at `:22` | `:25` |
| 7 | `account_category_settings.updated_at` may exist; grep to check | It does not exist, and the prescribed grep returns a false positive |

Two breaks revision 1 missed entirely: `apps-fixture-composition.test.ts` drives the router stack
by index and shifts under Task 2, and all four new surfaces are outside the delegate's
`DELEGATED` regex so they exist only under `EXPLORERS_API_MODE=canonical`.

### Revision 3 — from the Codex cross-model review (2026-10-18)

Codex reviewed P1 and P2 together and found two things that only show up when the plans are
read as a pair. Both were verified against the code and applied.

1. **A startup failure after `listen()` leaves the process alive and healthy-looking.**
   `canonicalStartup.ts:50` resolves object storage *after* `:43-49` has already opened the
   listener; the catch at `:71-73` rethrows without closing it, and `api.ts:29` only sets
   `process.exitCode`. The open handle keeps the event loop alive, so nothing exits or
   restarts while `/health/live` answers 200. Readiness appears to catch this, but only
   because the same catch ends the pool — an accident that disappears if a pool is passed in.
   **Task 4 Step 6** now closes the listener, with a test.

2. **This task's trust-proxy change does nothing until P2 configures it.** Noted at the top
   of Task 1 — the variable is unset by default, so `req.ip` behind a published Docker port
   stays the bridge gateway and the public profile rate limiter still shares one bucket across
   all visitors. P2 Task 9 Step 9 completes it.

Codex also noted that P1 and P2 are the same kind of document reviewed in isolation twice, and
that most remaining risk now sits in the ordering between them rather than inside either one.

### Found during execution (2026-10-18) — implemented on `claude/elastic-kapitsa-4712f9`

P1 was implemented as seven commits. The implementing session found five more errors, every one of
which had survived both reviews and the cross-model pass. Corrected in the code, recorded here:

| # | Plan said | Reality |
|---|---|---|
| 1 | Task 2's Better Auth guard test asserts `error.code === "ORIGIN_FORBIDDEN"` | The guard sends `"FORBIDDEN"` through the `apiErrorSchema` envelope; `ORIGIN_FORBIDDEN` is a `ContainmentCode` |
| 2 | Task 2 Step 6 finds the parser with `findIndex(v => v.name === 'jsonParser')` | `contentBodyParser()` returns an anonymous arrow, and custody wraps the admission handler, so neither name nor identity matches. Anchored on the `/health/live` route layer instead, with a guard against `-1` |
| 3 | The typecheck grep must print nothing | It prints one pre-existing error on a pristine tree (`server/services/youtube-playlist-import.ts:307`). The real criterion is "no new errors" |
| 4 | Task 4 Step 6's test omits the S3 bucket to force a failure | `resolveObjectStorage` returns local storage and never throws unless `EXPLORERS_MEDIA_ENVIRONMENT` is `qa`/`prod`. The test needed that set |
| 5 | That test goes in the DB-free unit file | Reaching the failure requires passing readiness, which needs a migrated database, and `*.integration.test.ts` is excluded from the default run. Moved to its own unit file that mocks only the readiness precondition |

Also: the implementing session was started from local `main` (`7333dc41`, the wrong lineage) rather
than `p1-base`, because a proposed-session card drops its `source_branch`. It caught this at Task 0's
verification commands and reset to `p1-base` (`10a3cd4a`).

**The lesson, carried into P3:** errors 1, 2 and 4 are literals a plausibility review accepts because
they read correctly; 3 and 5 are claims about the test harness rather than the product code, which no
amount of reading application source reveals. Both need execution, not review.
