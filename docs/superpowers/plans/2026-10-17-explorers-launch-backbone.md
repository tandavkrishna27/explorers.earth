# Explorers launch — plan backbone and ticket map

> **For agentic workers:** This is the **index**, not an executable plan. Each phase below has
> its own detailed plan written immediately before execution, using
> superpowers:writing-plans, against current code. Execute with
> superpowers:subagent-driven-development.

**Goal:** the whole product working on the canonical Express + PostgreSQL backend, Strapi
retired, Music parked, one frontend, one backend, one server.

**Architecture:** delete rather than port. Music removal is what lets production go straight
to `EXPLORERS_API_MODE: canonical`, deleting the legacy composition instead of bridging it.
Three small ports must land *before* any deletion.

**Tech stack:** React 18 + Vite, Express + TypeScript, PostgreSQL + Drizzle, Better Auth
(Google-only), S3, Traefik blue/green on a single host.

---

## Why this is an index and not one plan

The writing-plans skill says a spec spanning independent subsystems should be separate plans,
each producing working software alone. That is this situation. It is also the failure mode we
diagnosed: the previous plan was written once, consumed weeks later, and drifted so far that a
full code audit was needed to find out what was true.

So: this file holds the ticket map, dependencies and settled decisions. Each phase's detailed
plan — with TDD steps, exact paths and real commands — is written when that phase starts.

**Evidence standard, carried from the audit:** every load-bearing claim cites `path:line` and
is verified by reading code or running a command. A grep count cannot distinguish a gate from
a branch, or a live call from dead code. Skips are not passes. Filtered dispatches are not runs.

---

## Settled decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | **Fresh start** — no data import. **Reconfirmed by the owner 2026-10-18 as a launch decision:** existing users begin from zero at cutover, and old profile links break | No import tooling. **Updated 2026-10-18, later the same day: the owner confirmed there are no real users.** So there is no one to notify and no handle hold (PR #131 was closed unmerged). The QR-hijack reasoning in `docs/superpowers/plans/2026-10-18-launch-user-communication.md` applies only if real users turn up before launch |
| D2 | **Music parked** — delete frontend and backend, preserve for rebuild | Unblocks pure `canonical`; deletes the legacy composition |
| D3 | **Subscriptions removed** — product launches free | ~5,600 lines, no database work |
| D4 | **Pure `canonical`**, not `combined` | Possible only because D2 removes Music |
| D5 | ~~Reuse the existing blue/green pipeline~~ **Superseded 2026-10-18:** build the image in CI, push, `compose pull && up` on the explorers host | See "Pipeline decision" below. The blue/green engine is deleted in P3 |
| D6 | **CDN in front of the gated media route** | Keeps revocation real; zero application code |
| D7 | Games IGDB provider → post-launch | Service exists (159 lines), contract union is the cost |
| D8 | Apps App Store search → post-launch, **first in the queue** | Genuine regression, and cheap: it prefilled manual fields |
| D9 | Instagram → remove the surface | D6-era decision; broken by design without OAuth storage |
| D10 | Per-place pins → delete the dark code | Keep `application/placePinsRead.ts` — live ordering path |
| D11 | Windows-native e2e lanes → developer-machine only | Neither hosted runner OS can execute them |
| D12 | Image name stays `explorers-tunes` | Pinned in a host-side authority gate and 15 other places |
| D13 | Plugins (Epics 9/10) stay last | Adapter sits on an application layer that is about to move |

**Still open:** legal values (company, jurisdiction, contact email, app URL); in-list reorder
(no category except Guides exposes it, though the endpoint works); whether `/people/sector/:slug`
is removed or its taxonomy authored; whether the eight content categories gain `unlisted`;
whether the standalone `localtunes.earth` Netlify site is still wanted (blocks P3-3).

**Mostly settled by "no real users" (2026-10-18), but still worth one check before P3-7.** D1 says only test accounts exist. But the
Music venue release only handles *canonical* venues — `strapi_user_document_id IS NULL AND
strapi_account_document_id IS NULL` (`accountLifecycleMaintenance.ts:37`) — so any account with
a legacy Strapi-backed venue is parked today at `MUSIC_BOUNDARY_PENDING` with its deletion
accepted, never completed, and its S3 media never removed. Either no such accounts exist (and
D1 holds, and this is theoretical), or some do (and there is a live, unmet data-deletion
obligation). **One query settles it. Run it before P3-7.**

---

## The two findings that shape everything

**1. Music removal alone does not unblock canonical.** Three surfaces live only in the legacy
composition and must be ported *first*: `/health/ready` (the blue/green promotion gate), the SEO
routes, and `setupOwnerContainment` (the contracted 410s). All three are small. All three are
additive and safe. They are Phase 1 for that reason.

**2. The deployment pipeline has never succeeded.** `tunes-deploy.yml`: 11 runs, 10 failed and
1 cancelled, all 17–18 March, nothing since. So the first production run would otherwise be
simultaneously the bootstrap, 35 migrations and the backend swap. **Bootstrap on the current
`legacy-music` image first** to prove the pipeline and earn a rollback target.

---

## Phase map

```
P1 Ports ──────────────> P2 Cutover ──> P3 Music delete ──> P6 Strapi retire ──> P7 CI
   (additive, safe)         (gate)         (the big one)
P4 Subscriptions ──(independent, ship anytime)
P5 Defects ────────(independent, ship anytime)
P8 Deferred register ──(post-launch queue)
```

P4 and P5 are independent of everything and can ship immediately.
P3 is the largest and is gated on P2 being proven in production.

### Pipeline decision (2026-10-18): simple, build-in-CI

**Owner decision: Option A.** Build the image in CI, push it, then SSH to the explorers host
and `compose pull && up`. Modelled on `explorers.yml`'s working shape — build on the runner,
ship the artifact, never build on the server.

Nothing is broken by this because **nothing currently deploys**: `tunes/.github/workflows/main.yml`
is inert (nested `.github` paths are not executed), `explorers.yml` is disabled at `:15`, and
`tunes-deploy.yml` has 11 runs and zero successes.

**What this removes from scope entirely:**
- The byte-exact `/health/ready` contract. Its only consumer is `music-deploy-engine.sh`.
- The bootstrap probe set (three 410s and a refused Socket.IO connect).
- The signed ledger, compatibility floor and atomic route swap.
- `tunes/deployment/music-deploy-engine.sh` (1,086 lines), `tunes-deploy.yml` and
  `tunes-host-preflight.yml` — all deleted with Music in P3.

**What we keep from the better design:** build in CI and pull on the server, so a failed build
can never take production down. The old Tunes workflow ran `compose down` *before*
`up --build`; that flaw is not inherited.

**Accepted trade-off:** a few seconds of downtime per deploy, and rollback is redeploying the
previous image tag.

### P1 — Canonical production readiness *(simplified by the pipeline decision)*

Corrected after adversarial review. P1-1 changes a secret set that P2-2 also changes, and
P1-5's only existing implementation lives in a Music-named module, so P1 is coupled to P2 and
P3-8 rather than standing alone.

| Ticket | Scope | Notes |
|---|---|---|
| P1-1 | A plain readiness endpoint: database ping plus migration-marker check, **any response shape**. Required-secret set becomes the canonical three (`EXPLORERS_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — the source demands `STRAPI_*` which no longer exist | Simplified by the pipeline decision. The byte-exact four-key contract is gone with the blue/green engine. Still worth having so the pipeline can refuse to finish a deploy whose migrations did not run |
| P1-2 | Port SEO routes (`robots.txt`, `sitemap.xml`, `/api/explorers-sitemap.xml`), dropping the Music playlist source and the Strapi GraphQL fetch; replace with a canonical query over `creator_accounts` using exactly the public read model's predicates | Legacy-only (`routes/index.ts:265`). **nginx was moved out of this ticket** — see the note below the table |
| P1-3 | **The `/api/auth` prefix guard — now the most important ticket in P1.** `musicRetirementPolicy.ts:18` retires `/api/auth` as a *prefix*. Porting the retirement matcher verbatim would return 410 for **every Better Auth route** — all sign-in, all sessions — and nothing would catch it. Re-declare the three legacy identity bridges as exact paths and drop the prefix rule. The 410s themselves are now a courtesy to old clients, not a deploy gate | Priority is the guard, not the tombstones |
| ~~P1-4~~ | Deleted — `/api/register` is served by a separate container behind a priority-1000 router | — |
| P1-5 | JSON 404 terminator and `trust proxy`. **Correction:** `app.ts:208` is the *error* terminator only; there is no 404 terminator anywhere — the Music app's JSON 404 came from the retired-surface catch-all. Canonical currently returns Express's **HTML** page, with a stack trace outside production, whenever `contentBodyParser` calls `next(error)` | `trust proxy` must trust exactly one configured IP, never `true`, or `X-Forwarded-For` becomes attacker-controlled for anything keyed on `request.ip` |

**nginx is not a P1 line edit (corrected 2026-10-18).** An earlier revision put "fix
`explorers-earth/nginx.conf:26`" inside P1-2. Review against the file found `tunes-app:5000`
five times, not once — lines 26, 48, 56, 64 and 72 — and the four beyond line 26 are the
scraper endpoints `/api/apps/scrape-url`, `/api/products/scrape-link`,
`/api/people/scrape-profile` and `/api/proxy-image`, every one of them a `prefix` tombstone in
`musicRetirementPolicy.ts:38-41`. Repointing those at the canonical API while P1-3's boundary is
mounted turns four live endpoints into 410s. Worse, `location /api/` and `/graphql` still proxy
to `https://api.localqr.earth` — Strapi — so the SPA's entire production API surface still goes
to the system this replatform replaces. That is the cutover itself, and it belongs to P2.

**New in P2 as a consequence:** write the pipeline itself — a CI job that builds and pushes the
API image, and a deploy step that SSHes to the explorers host and pulls it. Plus the nginx work
above, whose **first step is reading the config actually running on the explorers host** — no
compose file defines a service named `tunes-app` (they are `tunes-blue`, `tunes-green`,
`tunes-gate`), and nginx refuses to start on an unresolvable literal upstream, so the deployed
config and the committed one cannot both be what we think they are.

**Where the code is (confirmed 2026-10-18).** The primary working directory is on
`codex/profile-settings-tabs` and contains none of the replatform — no `tunes/server/auth/`, one
migration instead of 56. Local `main` (`7333dc41`) is a different lineage. All P-phase work
starts from **`origin/main` = `10a3cd4a`**.

### P2 — Cutover to canonical *(gated on P1)*

**Planned in full at `docs/superpowers/plans/2026-10-18-p2-cutover-to-canonical.md`. That
document supersedes this table**, which was written before the pipeline decision and before
verification. Four of its tickets dissolved and one would have taken production down.

| Ticket | Outcome after verification |
|---|---|
| ~~P2-0~~ | **Dissolved.** `verifyRelease` is dead code — reached only from `npm run platform:release`, which no workflow, compose file or script invokes. The ECR 429 is a transient pull limit on `FROM` lines, already cached with `type=gha` |
| ~~P2-1~~ | **Dissolved** with the blue/green engine |
| P2-2 | Kept, corrected. The real auth variable is `EXPLORERS_PUBLIC_ORIGIN` (not previously named); **`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` were missing entirely** — `resolveObjectStorage` validates only bucket and region shape, then uses the SDK's default chain, so media fails at request time with no boot signal. The Strapi variables are **not** dropped in P2 (see P2-4) |
| ~~P2-3~~ | **Dissolved** with the engine. The frontend build and render pipeline survive as their own tasks |
| ~~P2-4~~ | **Deleted — this one was dangerous.** Flipping `docker-compose.yml:9` to `canonical` makes the **live Music stack unbootable** on its next restart: line 9 is in the anchor merged into both slots, and `canonicalStartup` then crashes on four Better Auth and three media variables the anchor lacks, against an unmigrated database. P2 adds a *new* compose file on the explorers host and touches root compose not at all |
| P2-5 | Kept, downgraded. `music-reconcile` **cannot write** — four independent gates. Delete it as housekeeping, not as a cutover gate |
| P2-6 | Kept, sharpened into concrete probes |
| P2-7 | Kept, and larger than it looked: there is no production apply path **and** neither the script nor its fixture is in the image |

**Also moved to P3, because `auditDeploymentAuthority` pins them.** Dropping Traefik, the
`explorers` container or `tunes/deployment/music-deploy-engine.sh` requires changing
`music-deployment.ts:359-366`, which demands `tunes-blue:`, `tunes-green:`, `tunes-gate:` and
`--providers.file.directory=/deployment-routing` in root compose and `music-router.yml`,
`/health/ready` and `transaction_current` in the engine — asserted by
`music-deployment-files.test.ts:123`. P2 adds; P3 subtracts.

**Irreversible:** 56 migrations with no down-files (35 of them explorers-era), and Better Auth
rows written during the canonical window. An older image does not get refused once the engine
is gone — it pulls, starts and crash-loops. Rollback restores the *image*, never the *schema*.

**The product consequence nobody has stated out loud:** nothing in the repo imports existing
Strapi users, handles, profiles or recommendations into the canonical schema. Better Auth
creates a new account on first Google sign-in, so at cutover every existing user loses their
content and every existing public profile URL 404s. That follows from the settled fresh-start
decision, but it is a launch decision, not a technical detail. **Since there are no real users
(confirmed 2026-10-18), nobody loses anything.**

### P3 — Music removal *(gated on P2 proven)*

**Planned in full at `docs/superpowers/plans/2026-10-18-p3-music-removal.md` (revision 3). That
document supersedes the table below**, which is kept for history. The ticket numbering changed —
nine tickets, ordered consumers before providers. Corrections that matter most:

- **Narrowing `categoryKeys` breaks every account, not just Music-landing-tab ones.**
  `initialAccount.ts` seeds every account with a `music` category row, and the owner read is a
  strict `.parse`, so narrowing without a data migration 503s every profile. Migration `0057`
  cleans the data and ships with the narrowing.
- **The migration gate would crash after `0058` committed.** It migrates first and only then
  re-provisions the runtime role, which GRANTs on ten Music tables — leaving the old API serving
  against missing tables, and no image able to roll back. Role provisioning is rewritten in the
  same commit and tested against an upgraded database.
- **`0058` would have orphaned venue rows** in `users` behind a completed account deletion. They
  are now disposed of inside the migration.
- **`0057` is not reserved** for "10.1 OAuth" — nothing in the repo supports that. The two P3
  migrations are `0057` and `0058`, assigned at merge.
- **`users` and the `0001` baseline survive P3**; they go with Strapi retirement (P6).
- **~57,000 production lines**, not ~22,000, once `tunes/client` and the canonical seam are
  counted. The canonical app itself registers a Music route.

~153,000 lines, ~507 files — but only ~22,000 are production source. Full scope recorded
separately. Ticket order is non-negotiable where marked.

| Ticket | Scope | Atomicity |
|---|---|---|
| P3-0 | **Retire `combined` and move the fixture/e2e topology to `canonical`.** Added after review — **this was the plan's largest omission.** `docker-compose.replatform.yml` is pinned to `combined` (`music-deployment-files.test.ts:48`) and is the only local platform stack (`scripts/replatform-local.ts:216`). Deleting the legacy composition without this first destroys `platform:test:routes` — the 11-handler ingress invariant — and every `--lane` in `scripts/replatform-e2e.mjs`. Covers `apiMode.ts:8,12`, `api.ts:17`, `canonicalDelegate.ts`, `suite-manifest.json` | **Must precede P3-4.** Without it P3 cannot be verified at all |
| P3-1 | **Preservation**: tag `music-v1-final`; archive to `docs/archive/music-v1/` — flat schema DDL (final `0052` bodies only), the `tunes-share-v1` key format, the socket-ticket and guest-capability models, ADRs 005–008. *Acceptance: the archive directory exists and `git show music-v1-final` resolves* | — |
| P3-2 | Move `usePublicAccountIdentity` out of `features/music/` | Two route validators import it |
| P3-3 | Split `music-forbidden-authority-search.test.ts`; also amend `tunes/package.json:36` and decide `tunes/netlify.toml` | **Must precede** `tunes/client` deletion |
| P3-4 | Delete the legacy composition. **"storage" means `tunes/server/storage.ts` — NOT `services/objectStorage.ts`, which canonical uses at `canonicalStartup.ts:50`** | With its coverage lanes and the CI edges in P7 (`ci.yml:426,478`, `test.yml:225,300`) |
| P3-5 | Delete the frontend Music surface **plus the server gateway mapping** (`postgresPublicProfileGateway.ts:13`), the shared contract (`explorersContract.ts:12-14,173,177`), and `public_music` fixture state in 12+ non-Music e2e specs | One commit. **Narrowing `categoryKeys`/`landingTab` rejects stored values on read** — any account with `landingTab:"music"` 500s on its DTO. Needs a migration or default |
| P3-6 | Cut the canonical seam: `music/identity/ensure`, the two analytics resolvers, **and `explorersAnalyticsEventRepository.ts:20,34,37,48,51`** (a `music` category and two joins on the table) | Drops ~3,300 lines from the canonical graph |
| P3-7 | **Migration `0058_retire_music`** + the `accountLifecycleMaintenance` rewrite + `music-runtime-role.ts` | **One commit. Rewritten after review — see below** |
| P3-8 | Rename the eight retained `music-*` files to `platform-*` | **Moved before P3-7**, which must touch `music-runtime-role.ts` |

**P3-7 — corrected mechanics.** My earlier description was wrong in a way that would have
caused damage, and the review caught it:

- **The `ON DELETE RESTRICT` claim was false.** The saga **soft-deletes**:
  `accountLifecycleMaintenance.ts:135-139` is `UPDATE creator_accounts SET … status='deleted'`.
  No `DELETE FROM creator_accounts` exists, so that FK can never fire.
- **The real failure is worse.** Five queries name the table (`:33, :51, :60, :73, :106`), and
  **`:47-54` is a bare `await pool.query(...)` outside any try/catch**. Drop the table and
  `runAccountLifecycleMaintenance` throws wholesale — the entire 60-second tick dies, taking
  recovery-proof purge, receipt retirement, deletion-feedback purge and **every** account's
  deletion with it, not just Music owners'.
- **Canonical will not boot.** `music-runtime-role.ts:12,244,765,977` enumerates
  `account_music_identity` and `reject_account_music_identity_mutation()` in the restricted-role
  attestation that `canonicalStartup.ts:33` runs **before the pool is created**.
- **A cross-table trigger is missed.** `users_music_venue_owned` is a deferred constraint
  trigger on `public.users` whose function reads `account_music_identity`
  (`0039_music_venue_account_ownership.sql:28-35,54-57`).
- **Undeclared dependency:** P3-7 needs P5-1/P6 first, because the analytics events repository
  joins the table.
- **Migration number:** `0057` is reserved for 10.1's OAuth tables. Use `0058`.

**Do not delete `music-*` files by name. The eight, named:** `music-fixture-secret.ts` (2358),
`music-runtime-role.ts` (1122), `music-uat-database.ts` (1072), `music-identity-config.ts` (767),
`music-vitest-evidence.ts` (280), `music-migration-contract.ts` (126), `music-output-redaction.ts`
(64), `music-database-config.ts` (62) — **5,851 lines**, not the 2,373 I first wrote. Note
`checkMusicDatabaseReadiness` comes from `db/readiness.ts`, which is *not* a `music-*` file.

**Pre-existing bug to fix here, not merely avoid:** the release only handles canonical venues
(`strapi_user_document_id IS NULL AND strapi_account_document_id IS NULL`). Legacy Strapi-backed
venues are never released, so those accounts are parked today — and their S3 media is never
deleted. There may be live accounts whose deletion request was accepted and silently never
completed. Size this against production data before P3-7.

### P4 — Subscription removal *(independent, ship now)*

**Planned in full at `docs/superpowers/plans/2026-10-18-subscription-removal.md`. That document
supersedes the table below**, which is kept for history. T1–T6 are implemented in PR #136; T7
(revoking the Razorpay keys) waits for dashboard access.

| Ticket | Scope |
|---|---|
| P4-1 | Delete `BillingTab.tsx` + its mocks, one commit. **Correction:** an earlier revision called this "urgent — stops live Strapi traffic". Wrong on both counts. It calls the *tunes* REST API, already tombstoned (`musicRetirementPolicy.ts:34`); the Strapi read was already deleted (`BillingTab.tsx:83-86` says so). All four queries are `enabled`-gated on accordion state, so nothing fires on render. Still the right first ticket — it is self-contained — but it is not an incident |
| P4-2 | Delete the two gated pages, routes, `PaymentModeToggle` |
| P4-3 | Delete the services, types, containment component |
| P4-4 | Onboarding **rename** — `handleSubscriptionSubmitWithFreePlan` → `finalizeOnboarding`. It registers nothing; no subscription module is imported |
| P4-5 | Fix `en.json`: it advertises a "₹300/month subscription" on a free product. No test catches this |
| P4-6 | Server dead code, Razorpay dep, compose vars, docs |
| P4-7 | *(deferrable)* Tombstone removal — turns a deliberate 410 into a 404; drags six tests, two generated artifacts and two coverage gates |

No database work: not one subscription table, column or enum value exists.
Trap: `contained-unit-env.cjs` and its two test copies must move in the same commit.

### P5 — User-visible defects *(independent, ship now)*

| Ticket | Scope |
|---|---|
| P5-1 | Restore owner analytics. 5 charts port unchanged, 5 remap, **3 need contract changes** (two need city-level geography, one a guide subtype) |
| P5-2 | Reserved-handle divergence — a user can pick `music`, pass five steps, upload images, then fail with a 422 |
| P5-3 | Onboarding postal lookup → `mapsBrowserKey()` |
| P5-4 | Legal placeholders in Terms, Privacy and Cookies + a `[bracket]` lint |
| P5-5 | Persist `locale`; widen the enum from `["en","hi"]` to the 46 shipped locales |
| P5-6 | Schedule `retryPendingDeletes` on the existing 60s tick — the predicate is already correct, nothing runs it |
| P5-7 | Places: visible refusal at 10 photos; migration to move historic rows into `recommendation_place_photos` **before** any sweep |
| P5-8 | Delete dark code: per-place pins (keep `placePinsRead.ts`), Instagram surface, Games genre route, dead auth pages |
| P5-9 | Suppression write path — an audited CLI command. Takedowns currently need hand-written SQL |
| P5-10 | **`deleteMedia` is never called on category detach** — every detach orphans an S3 object. Dropped from the earlier draft; restored here |

### P5b — Backup, restore and recovery *(restored after review; previously dropped)*

I flagged this as the biggest unaddressed risk and then omitted it from the backbone. It is
back, as its own phase, because its failure mode is unrecoverable rather than embarrassing:
there is **no backup tooling, no restore drill and no measured recovery time**, while the 35
migrations are forward-only with no down-files and the compatibility floor refuses older
images once advanced. Ticket 8.5 gates 8.4 and, through Milestone 3, all of Epics 9–10.
**Start it in parallel with P1 — it depends on nothing else.**

**Planned in full at `docs/superpowers/plans/2026-10-18-backup-restore-recovery.md`.** Not yet
implemented.

### P6 — Strapi retirement *(gated on P2 + P3)*

**Planned in full at `docs/superpowers/plans/2026-10-18-p6-strapi-retirement.md`; it supersedes this paragraph.** It opens with the guard, splits Phase A (safe now; P6-2 must precede P3-7) from Phase B (after cutover), and ends with the owner retiring Strapi.

Six server call sites; the analytics events route is the last live dependency inside canonical,
so P5-1 is its prerequisite. Frontend is mostly deletion — **no Apollo operation executes**;
45 `gql` documents are inert. Close with `e2e/replatform/no-strapi.spec.ts`, which must have a
poisoned origin, a monitor **self-test**, a closure-size floor and a route-coverage floor, or it
passes vacuously.

### P7 — CI *(parallel throughout)*

Retire `explorers.yml` and `music-reconcile.yml` (0 successes in 100 runs) — the latter with the
8 contract cases that `read()` it. Fix hollow green by computing the lane matrix instead of
filtering steps. Remove ~15 of ~100 raw job-minutes per PR of pure duplication. Promote the image
job into the required set.

### P8 — Deferred register *(post-launch)*

Each entry records: parity or new, what exists, what is missing, the trigger. **Apps App Store
search first** (parity, cheap). Then Games IGDB (parity, 1–2 weeks). Then app enrichment (new,
never shipped). Then plugins.

**Risk to manage:** dormant code rots. The IGDB service and enrichment subsystem will sit
unexercised. Keep the queue short.

---

## Deployment target — corrected 2026-10-18

**Owner decision: the whole application runs on the server currently used for the explorers
frontend.** One host: nginx in front, SPA static files, the canonical Node API, `/api` proxied
locally. This also removes the two-origin problem, since Better Auth and
`parsePublicRuntimeConfig` both require same-origin.

Three deployment artifacts exist in the repo and **none of them currently deploys anything**:

| Artifact | What it is | State |
|---|---|---|
| `tunes/.github/workflows/main.yml` | "Deploy tunes to Hetzner" — scp whole tree to `/root/tunes` as **root** with `rm: true`, write `.env` from ~30 secrets, `docker compose down && up -d --build` | **Inert.** Nested `.github` is not executed by GitHub Actions; only the repo root is. Last touched by the `Local-Tune/ → tunes/` rename |
| `.github/workflows/explorers.yml` | "Deploy Explorers Frontend" — builds in CI, scps `dist/` to `/home/deployuser/explorers-frontend` as `deployuser`, validates and reloads nginx | **Hard-disabled** at `:15` (`if: ${{ false }}`). This is the shape to revive |
| `.github/workflows/tunes-deploy.yml` | Blue/green with immutable images, signed attestation, rollback ledger | **Never succeeded** — 11 runs, 10 failed and 1 cancelled, all 17–18 March |

**Why `explorers.yml` is the right base:** it builds in CI and ships only the artifact, so a
failed build cannot take production down — unlike the Tunes workflow, which runs
`docker compose down` *before* `up --build`. It also uses a non-root user.

**What it needs to become the whole-application deploy:** build with
`vite build --config vite.platform.config.ts --mode platform` instead of baking `VITE_*`
secrets; render `/runtime-config.json` on the host; add the API container or process; add the
nginx `/api` proxy; and supply the canonical environment.

**Not blocked — host specifics are confirmed at execution, not at planning.** An earlier
revision marked this BLOCKED, which was wrong: every other phase is local work, and the
deploy connection already exists (`EXPLORERS_DEPLOY_HOST`, `_USER`, `_KEY`, `DEPLOY_PORT` are
configured secrets).

**The database question is already answered by D1.** Fresh start means no data to migrate —
a new empty PostgreSQL on the new host, with the 35 migrations run against it. That was the
only genuinely hard host question.

**Owner decision: package with Docker.** Install it if absent.

Open at execution time, all small: the current nginx config (we add an `/api` proxy without
disturbing the working SPA serving), and headroom for API + PostgreSQL alongside the SPA.

**Secrets that already exist** — `VITE_TMDB_ACCESS_TOKEN`, `VITE_GOOGLE_BOOKS_API_KEY`,
`VITE_GOOGLE_MAPS_API_KEY`. A previous revision said these were "declared nowhere"; the values
exist as GitHub secrets, they were simply wired into the frontend bundle instead of the server
environment. That is plumbing, not procurement.

**Secrets to create at P2** (owner supplies when the phase starts): `EXPLORERS_AUTH_SECRET`,
server-side `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the new database credentials, and the
S3 bucket and region.

---

## Parallel execution and orchestration

Constrained by **file ownership**, not by phase independence. Two sessions editing the same
file is the failure mode to design against.

**Three concurrent tracks is the realistic ceiling.**

| Track | Scope | Isolation | Why it is safe to run alone |
|---|---|---|---|
| **A** | P4 subscriptions | Own worktree | Touches `pages/{SubscriptionPlans,Checkout}`, `services/{subscription,payment}Service`, `BillingTab` — no overlap with any other track **except** `MusicSubscriptionContainment`, which P4-3 owns outright |
| **B** | P5b backup/restore | Own worktree | Greenfield. New scripts only. Zero shared files. **The long pole — start first** |
| **C** | P1 ports, then P5 defects | Own worktree | Additive server routes, then independent frontend fixes |

**Must stay single-threaded:**
- **P2** — one production sequence, one operator.
- **P3** — strict internal ordering (P3-0 → P3-3 → P3-4 → P3-5/6 → P3-8 → P3-7).
- **P6** — gated on P2 and P3.

**Known cross-track conflicts — serialise these:**

| File / concern | Wanted by | Resolution |
|---|---|---|
| `MusicSubscriptionContainment.tsx` | P3-5, P4-1/2/3 | P4-3 owns and deletes it, after P4-1 and P4-2 |
| Analytics (`explorersAnalyticsRoutes`, `analytics.ts`, event repository) | P5-1, P3-6, P3-7, P6 | Strict order: P5-1 → P3-6 → P6. P3-7 gated on P5-1 |
| Reserved-handle set (includes `music`) | P5-2, P3-5 | P5-2 after P3-5 |
| `tunes/package.json:36` coverage lanes | P3-3, P3-4 | P3-3 owns; P3-4 assumes it |
| `music-deployment-files.test.ts` | P2-4 (`:46`), P3-0 (`:48`) | Different lines; still review both diffs together |
| Whole `explorers-earth` unit lane | every frontend ticket | Run serially, whole lane — focused configs miss DTO-shape regressions |

**Orchestration model.** This session is the orchestrator: it holds the dependency map,
assigns tracks, reviews diffs between tickets and serialises conflicts. Each track runs in its
own session and worktree so branches never collide. Sub-agents are used *within* a track for
investigation and adversarial review, never for concurrent edits to the same files.

**Rule:** a track never merges to `main` without the orchestrator confirming no conflicting
track is mid-ticket on a shared file.

---

## Contingency — the surprises worth pre-deciding

| Surprise | Likelihood | Prepared response |
|---|---|---|
| The server cannot host API + DB + SPA together | Medium | Keep PostgreSQL where it is; co-locate only the API and SPA. Decide *before* P2-3 |
| Legacy Strapi-backed Music venues exist in production | Unknown — **one query settles it** | If any exist, their deletions are parked and media undeleted. Add a release path to P3-7 before dropping anything |
| The nightly's 9 `load-chaos` failures are product defects, not harness | Medium | They are unexamined. Triage before P2, since they may be the only signal on canonical behaviour |
| `0058` collides again as other migrations land | High, if tracks run in parallel | Orchestrator assigns migration numbers centrally. No track picks its own |
| A deleted `gql` document breaks an e2e lane with no unit-lane warning | High | Four documents are e2e-referenced but unpinned by the guard test. Extend the guard **before** any deletion |
| Hosted QA never materialises | High — `verifyRelease` always throws | Local qualification is the accepted bar. Do not let P2 wait on it |
| The frontend regresses in a way no lane catches | Medium | The whole-lane serial run is the only gate. Budget ~47s per frontend ticket and never skip it |
| Windows-native lanes drift while unrun | Medium | They run on a developer machine per status §6e. Run them at phase boundaries, not never |

## Verification

1. Acceptance is a command whose output is the proof, never a checkbox.
2. Every load-bearing claim gets a second source — a file read or a run.
3. Run the **whole** `explorers-earth` unit lane serially for frontend changes; focused configs
   miss DTO-shape regressions.
4. Local qualification only. Hosted QA stays blocked: `verifyRelease` is typed `: never`.
5. The Windows-native lanes run per the documented procedure in the status doc, §6e.
