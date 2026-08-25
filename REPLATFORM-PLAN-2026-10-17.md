> # SUPERSEDED — DO NOT FOLLOW
>
> Superseded 2026-10-17 by
> `docs/superpowers/plans/2026-10-17-explorers-launch-backbone.md`.
>
> This draft predates the owner's decisions to delete Music and remove subscriptions.
> It is wrong in ways that will cost you real work if you follow it:
> * it targets **`combined`** as the production topology; the decision is pure **`canonical`**
> * it says **33** orphan `gql` documents; the verified number is **45**
> * it omits Music removal and subscription removal entirely
>
> Kept only because it records five items the backbone must carry (provider keys, the
> taxonomy apply step, `deleteMedia` on detach, backup/restore, and the `music-reconcile`
> cron ordering). Those are now in the backbone. Read the backbone.

# Replatform implementation plan — backbone

Companion to `REPLATFORM-STATUS-2026-10-17.md` (the code-verified status). This is the
dependency-ordered sequence. Per-phase packages are written **immediately before execution**
against current code, not up front — the previous plan drifted because it was written once
and consumed months later.

Grounded in seven parallel code investigations at `origin/main` = `10a3cd4a`, each claim
carrying a `path:line`, with load-bearing claims independently re-verified.

---

## The one-sentence finding

**The canonical code is far more complete than the canonical deployment.** Most of what
blocks launch is configuration and composition — environment keys, a taxonomy apply step,
the runtime mode — not missing application logic. There are only four genuine code-level
holes: Games' provider, Places' pins, Music's absence from the canonical app, and a
reachable Instagram surface with no backend.

## Definition of done

**The frontend is the spec.** Every screen, route and action present in `explorers-earth/src`
works against the new backend, with Strapi retired, one frontend, one backend, one server.

## Decisions already settled

| Decision | Resolution |
|---|---|
| Existing user data | **Fresh start.** Only test accounts exist; no import tooling. Documented exclusion stands. |
| Production topology | **`combined`**, as a bridge — not an endpoint. See Phase 4. |
| End state | One frontend, one backend, one server: pure `canonical` with Music ported in. |
| Owner analytics | **Restore.** It worked before and it unblocks Strapi retirement. |
| Per-place pins (D5) | **Defer and delete the dark code.** |
| Windows-native lanes | **Developer-machine only**, documented procedure in status §6e. |
| Apps lane on Linux | Custody + umask fixed; remaining work out of scope (PR #124). |

## Decisions still open — these change scope

1. **Apps App Store search.** A genuine regression nobody recorded: the old product had
   inline iTunes search via a first-party route with an affiliate token. Restore it, or
   accept the background enrichment subsystem as the replacement?
2. **Games provider.** Confirmed regression — `igdb_id` was *required*, so provider search
   was the only way to create a game. Build it (one migration + wiring; the service is
   written and tested), or ship Games manual-only and remove the search box?
3. **Instagram.** `pages/Instagram.tsx` ships a reachable UI against a tombstoned endpoint.
   Remove, or restore?
4. **The standalone `localtunes.earth` Netlify site.** `tunes/netlify.toml` builds
   `tunes/client` as its own site. Deleting that tree kills it. Still wanted?
5. **Legal values** — company name, jurisdiction, contact email, app URL.
6. **In-list reorder.** No category except Guides exposes it, though the endpoint works.
   In scope, or accept?

---

## Why `combined`, and why it is temporary

`canonical` mounts **no Music at all** — no `/api/music/*`, no Socket.IO, no background
workers. Flipping production to it would delete the venue playlist product. It would also
never land: `/health/ready` is the blue/green promotion gate
(`tunes/deployment/music-deploy-engine.sh:939`, re-verified publicly at `:1030`) and the
canonical composition does not mount it, so the candidate fails readiness and the
transaction aborts.

`combined` runs the Music server with the canonical app in front, forwarding three URL
prefixes. **That delegate is a strangler-fig proxy.** Each time a Music surface is ported
onto canonical, its prefix is added to the list and traffic moves across with no deploy
drama. When the last route is ported, the legacy half serves nothing — then flip to pure
`canonical` and delete it. That is the route to one backend without a big-bang migration.

---

## Phases and dependencies

```
P1 Config ─┬─> P4 Cutover ──> P5 Strapi retirement ──> P8 Music port ──> P9 Pure canonical
P2 Defects ┤                                                                    │
P3 Deletions ┘                                                                  │
P6 CI ──────────────────────(parallel throughout)───────────────────────────────┘
P7 Games ───(parallel, gated on decision 2)
```

P1–P3 are independent of each other and can run in parallel. P4 needs all three.
P6 runs throughout. P7 is independent. P8 is the long tail.

---

### Phase 1 — Configuration and composition

Mostly not code. This is the largest single category of blockers.

| # | Item | Evidence |
|---|---|---|
| 1.1 | Forward `/api/explorers/analytics/summary` and `/api/explorers/v1/profiles` in the delegate | `canonicalDelegate.ts:21-22`; pinned by `canonical-delegate.test.ts:38`, so amend together |
| 1.2 | Supply `TMDB_ACCESS_TOKEN`, `GOOGLE_BOOKS_API_KEY` in the host api env | Read at `canonicalApp.ts:105-106`; declared in **no** compose file. Books and Movies search/resolve/cover-import all 503 without them |
| 1.3 | Supply `mapsBrowserKey` in the host `public.json` | Absent from `deploy/environments/production.example.json:37-41`. Without it Places lookup, geocoding, **every map**, and in-guide photo enrichment are dead |
| 1.4 | Supply the four Better Auth vars | `EXPLORERS_PUBLIC_ORIGIN`, `EXPLORERS_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — absent from `docker-compose.yml`; `betterAuth.ts:19-35` throws at startup, so the container crash-loops |
| 1.5 | Supply the four media/tier vars | `EXPLORERS_MEDIA_ENVIRONMENT=prod`, `EXPLORERS_DEPLOYMENT_TIER=production`, `_S3_BUCKET`, `_S3_REGION`. Already `${VAR:?}`-required, so they block *any* deploy of main |
| 1.6 | Build a production taxonomy-apply step and run it for Places | `applyTaxonomyCatalogImport` is imported only by a test fixture. 335 reviewed Places terms exist (`fixtures/taxonomy/real-strapi-20261013/places-import.json`) and are never applied. Catalog defaults `UNCONFIGURED` (`0053:14,20`) |
| 1.7 | Amend `music-deployment-files.test.ts:44-57` to `combined` | It pins production to `legacy-music`. `route-graph-invariant.md:165-173` warns against amending casually — do it deliberately, in the cutover commit |

**People sectors are *not* in this phase.** Unlike Places, the reviewed People import carries
**zero terms** — a live read of production Strapi on 2026-10-13 found 0 people terms and 0 of
25 recommendations categorised. Sector browse never worked. It needs content authored first,
which is a product task, not configuration.

### Phase 2 — User-visible defects

| # | Item | Evidence |
|---|---|---|
| 2.1 | **Restore owner analytics.** Repoint dashboard + Home from the events read to `/analytics/summary`; delete the dead `scope.token` path | `store.ts:76` sets `token: null` on canonical sign-in and `login()` has no production caller, so the dashboard is dead for **every** user. Of 13 charts: 5 port unchanged, 5 remap onto existing dimensions, **3 need contract changes** — two need city-level geography (contract carries country only), one needs a guide subtype |
| 2.2 | Gate the Settings billing tab behind the containment flag | `BillingTab.tsx:89-124` fires four live Strapi/payment requests on accordion open, keyed on `hasOpenedUsageDashboard` etc. — **not** the flag that properly gates `/checkout`. One line |
| 2.3 | Make `handleAvailable` apply the server's reserved set and shape regex | Three-way divergence: server rejects 15 (`profiles.ts:9-11`), the availability endpoint applies **none** (`publicContent.ts:67-76`), the frontend list misses 14. A user can pick `music`, pass five steps, upload images, then fail with a 422 |
| 2.4 | Onboarding postal lookup → `mapsBrowserKey()` | `OnBoarding.tsx:503-505` reads the build-time env var directly while every Profile equivalent uses the runtime config. Silently unset under `MODE=platform` |
| 2.5 | Fill legal placeholders + add a `[bracket]` lint | Not just `/terms` — also `/privacy` and `/cookies`, across 8 locales. Shipping to users today |
| 2.6 | Persist `locale`; widen the enum | `AccountDto.locale` is never read or written by the frontend; the enum is `["en","hi"]` against 46 shipped locales |
| 2.7 | Call `deleteMedia` on category detach | It has three callers (onboarding rollback, avatar/cover replace) but **no category remove-image flow calls it**, so every detach orphans an S3 object |
| 2.8 | Places photos: visible refusal at 10, and a backfill migration | `useAddRecommendation.ts:527` `.slice(0,10)` silently discards an uploaded photo. Separately, creator photos written before `67b14c4d` sit in `recommendation_media` and are permanently unreachable — the gate correctly excludes `places` there |

### Phase 3 — Delete what should not ship

| # | Item | Scope |
|---|---|---|
| 3.1 | Per-place pins | ~1,071 server lines (incl. the 466-line `0054` migration with 7 tables, 8 functions, 15 triggers) + ~270 frontend. **Keep `application/placePinsRead.ts`** — it is the live ordering path. Currently advertised in the live UI and always fails |
| 3.2 | Instagram surface | Pending decision 3 |
| 3.3 | Games genre route + `GenreBrowse` | `genres` is hard-coded `null` in both mappers, so the route is permanently empty. Delete, or build genres with decision 2 |
| 3.4 | Dead frontend | `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `ResetLinkSent.tsx`, `EmailConfirmed.tsx` (no importers), `useEmailStore.ts`, Apollo client + 33 orphan `gql` documents |
| 3.5 | `tunes/client/` (8.2) | **Zero cross-tree importers** — a deletion, not a migration. One atomic commit. **The trap:** `music-forbidden-authority-search.test.ts:63` reads `tunes/client/src` at *collection time*; deleting the tree without editing that line silently removes five unrelated server-side **security** cases |

Note 3.5 should precede the frontend Strapi work — it deletes `client/src/lib/strapi-{queries,mutations}.ts` outright rather than porting them, reversing the epic's stated order.

### Phase 4 — Cutover to `combined`

Preconditions: all of P1, plus 1.7. Then flip `docker-compose.yml:9`, verify `/health/ready`
answers with the right digest/commit/marker, run the 11 route probes, and confirm Music HTTP
and Socket.IO still serve. Disable and record the hourly `music-reconcile` cron first — it is
the one scheduled job that reaches production Strapi, and against a fresh database it would
reconcile a Strapi population against an empty table hourly.

**Rollback is config-only** — the mode is read at boot and blue/green keeps the old slot
running. **Irreversible:** the 35 migrations (no down-files), the signed compatibility floor,
and any Better Auth rows written during the canonical window.

### Phase 5 — Strapi retirement

Six server call sites remain: the identity gateway, the public-profile gateway (already
*off* in production), the absence proof, the analytics events route, the sitemap fetch, and
reactivation. The analytics events route is **the last live Strapi dependency inside the
canonical runtime** — Phase 2.1 is its prerequisite.

Frontend work is smaller than the ticket implies: **no Apollo operation executes anywhere**.
45 `gql` documents are inert; the only two Apollo runtime calls are local `clearStore()`.
Three of the five remaining REST calls are dead fallbacks below an early return.

Close with `e2e/replatform/no-strapi.spec.ts`, which does not exist. It must use a poisoned
origin, a runtime network monitor with a **self-test**, a closure-size floor, and a route
coverage floor — otherwise it passes vacuously, since the existing specs abort all
non-fixture origins at the router.

### Phase 6 — CI (parallel throughout)

**Retire:** `explorers.yml` (hard-disabled at `:15`); `music-reconcile.yml` (0 successes in
100 runs, hourly cron, six production Strapi secrets) — but delete the 8 contract cases that
`read()` the file in the same commit, or `music-required` goes red.

**Build what is missing:** no workflow produces `explorers-api` or `explorers-web`, the two
images `deploy/platform.compose.yml` names, and `tunes.yml` builds `explorers-tunes` — the
names do not even match. The entire canonical release toolchain
(`platform-release.ts`, `platform-candidate-smoke.ts`, `platform-runtime-smoke.mjs`,
`platform-web-image-smoke.mjs`) is referenced by no YAML. *Note:* the canonical frontend
build **does** exist (`explorers-earth/Dockerfile:54`, `--mode platform`, and
`vite.platform.config.ts` bakes no `VITE_*` at all) — it is simply never built in CI.

**Optimize:** ~15 of ~100 raw job-minutes per PR are pure duplication —
`test.yml:browser` is byte-identical to `ci.yml:e2e-music-account`, `test.yml:frontend`
re-runs `ci.yml:unit-tests`, `ci.yml:integration-tests` is a subset of its own unit job, and
`docs-contracts`/`security`/the c0 Linux lane are subsets of `contracts`. Caching is already
healthy — every `npm ci` is 6–19s — so do not "fix" installs.

**Fix hollow green:** compute the lane matrix in a setup job instead of filtering steps. Run
`39027911180` concluded **success** with 19 of 20 jobs' real steps skipped.

**Required checks:** only `replatform-required` and `music-required` block merges today, and
neither builds or scans an image. Promote `tunes.yml`'s image job; move the mocked frontend
E2E off the PR path onto `push: main`.

### Phase 7 — Games provider (gated on decision 2)

One migration (`game_entity_details` — every other category has one), a repository, widening
`explorersGameOwnerContract.ts:11` off `z.null()`, and the `CatalogService` wiring. The IGDB
service is already written and tested; its only importer today is its own test file.

### Phase 8 — Port Music onto canonical

34 HTTP routes, the Socket.IO server with owner/public/guest registries, and four background
workers. Mostly a move, not a rewrite. The auth seam is already designed — canonical mints
Music credentials and `canonicalMusicPrincipal` exists. Port surface by surface, extending
the delegate prefix list each time, so traffic migrates incrementally.

### Phase 9 — Pure canonical, then the rename

Flip to `canonical`, delete the legacy composition. Then 8.3, which is far larger than
scoped: **273 files** carry `tunes/`, including **117 `explorers-earth` files with 207
relative imports** into `tunes/shared` that the epic never mentions. **Do not rename
`tunes-share-v1`** — it is a persisted idempotency-key format validated by OpenAPI and stored
in two migrations.

---

## How work is verified

1. **Acceptance is a command, not a checkbox.** Each package states the command and the
   output that proves it.
2. **Every load-bearing claim gets a second source** — a file read directly or a run. Three
   times in this investigation an inference looked like evidence and was wrong.
3. **A grep count is not evidence.** It cannot distinguish a gate from a branch, or a live
   call from dead code. Follow the predicate and the reachability.
4. **Skips are not passes, and filtered dispatches are not runs.**
5. **Local qualification only** for now. Hosted QA (ticket 3.5) stays blocked:
   `verifyRelease` is typed `: never` and always throws, and no QA workflow exists.
