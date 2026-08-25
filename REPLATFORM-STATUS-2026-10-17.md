# Replatform status — verified against code, 2026-10-17

Audited at `origin/main` = `10a3cd4a` in a clean worktree. Every claim below comes from
reading source, workflow files and live CI run history — not from the plan documents,
which are stale in both directions (they understate delivered work and overstate
delivered evidence).

Supersedes `docs/replatform-audit/reconciliation-2026-10-09.md` for current status.
That document remains valid as a requirements record.

---

## 1. Is everything in main? Yes.

- PR #119 (the whole replatform integration branch) merged **2026-10-16**.
- PR #121 (wave3 auth/lifecycle) is inside it. PRs #122 and #123 landed after.
- `codex/unified-replatform` still shows 3 commits "ahead" of main, but their
  `git patch-id`s are identical to main's `841d0458`, `ff01fba1`, `da5e5781`.
  Nothing is stranded on a branch.

## 2. The three systemic problems

Implementation is substantially complete. The gaps are not features — they are
**evidence, deployment and reachability**. Three findings dominate everything else.

### 2.1 Production does not run the replatform

`docker-compose.yml:9` pins `EXPLORERS_API_MODE: legacy-music`. The shipped image runs
`dist/server/api.js` (`tunes/Dockerfile:74`), and `tunes/server/api.ts:8-19` only takes
the canonical branch when the mode is `canonical`.

Consequence, measured:

| Closure | Modules | Strapi-named modules |
|---|---|---|
| Canonical (`server/auth/canonicalStartup.ts`) | 163 | **0** |
| Production (`server/api.ts` → `music-startup` → `app.ts`) | 213 | **3** |

The canonical backend is clean and *dormant*. Deploying main today still constructs
`StrapiIdentityGateway` (`tunes/server/routes/index.ts:84`), `StrapiPublicProfileGateway`
(`:181`) and `StrapiIdentityAbsenceProof` (`tunes/server/app.ts:194`), and still requires
six `STRAPI_*` variables.

This also resolves a long-standing contradiction in the audit notes: the claim
"`app.ts` strapiOrigin is a blocker" and the claim "`app.ts` is not in the canonical
closure" are **both true** — they measure different entrypoints, and only the unused one
is clean.

### 2.2 Browser acceptance has no CI home, and the nightly has never passed

`frontend-e2e-qualification.yml` has **no `pull_request` or `push` trigger** — cron and
manual dispatch only. Its run history:

- **Frontend E2E qualification: 0 successful runs, ever.**
- **Backend validation (scheduled): 53 runs, 53 failures. Zero successes, ever.**

Of 14 lanes registered in `explorers-earth/e2e/replatform/suite-manifest.json`,
**7 are run by no workflow at all** — `music`, `places`, `place-links`, `guides`,
`public-parity`, `people`, `apps-enrichment`. `products` has no lane in existence.
That is roughly 92 authored but never-executed e2e identities, including:

- `music.spec.ts:363` — the only test that drives a real Better Auth sign-out against a
  live Socket.IO connection (the 6.3 revocation proof).
- `public-parity.spec.ts` — all 32 identities of ticket 7.1's traversal/ETag/visibility gate.

**Why PRs stay green anyway.** `test.yml:316` gates `load-chaos` on
`github.event_name == 'schedule'`, and the `music-required` aggregator at `test.yml:454`
explicitly forgives `load-chaos=skipped` when the event is not nightly. On a PR,
`music-required` passes in 3 seconds without the lane running. PR #119 merged on a check
set that structurally cannot see the lanes that have been red for weeks.

### 2.3 There is no path to a release artifact

Three independent blockers:

1. `verifyRelease` (`tunes/server/deployment/platform-release-contract.ts:68`) is typed
   `: never` and unconditionally returns `fail('TRUSTED_AUTHORITY_UNAVAILABLE')`. Its own
   tests pin that even a structurally valid manifest fails. No trust adapter exists.
2. `.github/workflows/platform-candidate.yml` and `platform-qa.yml` **do not exist**. No
   QA hostname, redirect config or provider credential appears anywhere in the repo.
3. `API image validation` fails on `public.ecr.aws` **429 Data limit exceeded** pulling the
   pinned Node base image, so `publish-image` and `deploy-production` never run.

Additionally, compose render for production **aborts** until four new `:?`-required host
variables exist, none of which are in `deploy/environments/production.example.json`:
`EXPLORERS_MEDIA_ENVIRONMENT`, `EXPLORERS_DEPLOYMENT_TIER`, `EXPLORERS_MEDIA_S3_BUCKET`,
`EXPLORERS_MEDIA_S3_REGION` (`docker-compose.yml:92-95`).

---

## 3. Ticket status — all 39

Legend: **DONE** · **GAPS** (delivered, residual evidence/wiring) · **PARTIAL** ·
**NOT STARTED** · **DROPPED** (authorized)

| # | Ticket | Status | The residual |
|---|---|---|---|
| 1.1 | Baseline / scope matrix | GAPS | 47 of 51 rows still `planned`; no rows for the 6 categories that have since landed |
| 1.2 | Local harness + route invariant | **DONE** | **Invariant now executes and passes** — see §4 |
| 1.3 | CI / deploy separation | GAPS | Branch-protection receipt records a *fork*, not `MeteoriteLabs`; `ci.yml` and `test.yml` have asymmetric PR triggers |
| 1.4 | API-only build seam | **DONE** | — |
| 2.1 | Identity / ownership schema | GAPS | `account-recovery.test.ts` runs in no lane; Google receipt is first-consent only |
| 2.2 | Authorization boundary | **DONE** | — |
| 2.3 | Profile / onboarding / media | GAPS | 8-case `profile.spec.ts` is nightly-only |
| 2.4 | Account lifecycle | GAPS | 18 real cases incl. held deletion/deactivation/recovery completion — nightly-only; no live socket disconnect on sign-out |
| 3.1 | Shared application contracts | GAPS | No automated guard pinning the no-server-into-Vite boundary |
| 3.2 | Media / catalog boundary | GAPS | No backfill for pre-fix places photos; silent `.slice(0,10)` photo truncation |
| 3.3 | Books end to end | GAPS | 20-case acceptance is nightly-only |
| 3.4 | Analytics | GAPS | Canonical summary route has **zero consumers**; dashboard deadlock (§5) |
| 3.5 | QA deployment / evidence | **PARTIAL** | Hard-blocked — §2.3 |
| 4.1 | Movies & shows | GAPS | TMDB provider is implemented and wired; `TMDB_*` declared in no compose/env — dark on deploy |
| 4.2 | Games | **PARTIAL** | Unconditional 503 at `application/catalog.ts:39,45`. **Not a wiring fix** — no provider migration, repository or contract field exists (`explorersGameOwnerContract.ts:11` hard-codes `z.null()`) |
| 4.3 | Apps & tools | GAPS | Enrichment inert — `EXPLORERS_APPS_PROVIDER_CONFIGURATION` declared nowhere |
| 4.4 | Products | GAPS | **No e2e lane exists at all** |
| 4.5 | People | GAPS | Sector browse data-blocked: reviewed People taxonomy carries **zero terms**, no production path sets catalog `CONFIGURED` |
| 5.1 | Places | GAPS | D5 per-place pins **dark in production** — 466 migration lines + 6 routes + 8 e2e identities that `canonicalStartup.ts:39` never enables. D3 taxonomy deferred |
| 5.2 | Place-links | GAPS | Cleanest ticket in the set; only the browser receipt is missing |
| 5.3 | Guides | GAPS | Case 4 instability not fixed and not split; lane runs nowhere so it is invisible |
| 5.4 | Claim flow | **DROPPED** | Removal clean; reserved-handle protection survives and is PR-gated |
| 6.1 | Music provisioning | GAPS | Music runtime still hard-requires `STRAPI_URL` — the literal `Done:` condition |
| 6.2 | Music owner surface | GAPS | Two-origin real-stack browser acceptance still a recorded deviation |
| 6.3 | Guest / socket admission | GAPS | No *integration* test drives sign-out vs live socket; `musicPrincipal.ts:218` skips the session check for credentials lacking `sid`/`uid` |
| 6.4 | Release / retirement fn | GAPS | **ADR-008 already corrected; numeric non-reuse proof already exists** and is PR-gated |
| 7.1 | Public surface | **PARTIAL** | Server side strong (19-case visibility matrix, PR-gated); 32-identity browser gate runs nowhere |
| 7.2 | Reference / legal content | GAPS | **Four unfilled placeholders are live in shipped content** — `[Your Company Name]`, `[Your Country/State]`, `[Your Contact Email]`, `[your app URL]` |
| 7.3 | All-category milestone | **NOT STARTED** | No `milestone-2.md`; recorded evidence is 122 passes **and 126 skips** against a now-stale 16-file selector (actual: 48) |
| 8.1 | Strapi retirement | **PARTIAL** | §2.1. Scan exists and passes but runs main-only |
| 8.2 | Remove duplicate frontend | **NOT STARTED** | `tunes/client/` = 162 files, **137 of the repo's TS errors**. Not in the shipped image |
| 8.3 | Backend rename | **NOT STARTED** | Blast radius growing — ~20 contract tests now assert literal `tunes/` paths |
| 8.4 | Topology / verifier | **PARTIAL** | 20 contract suites, all PR-gated; but evidence identities are placeholders and the 8.5 join has **zero** code references |
| 8.5 | Backup / restore / recovery | **NOT STARTED** | Nothing exists. Gates 8.4, and via Milestone 3 gates all of Epics 9–10 |
| 9.1 | Public MCP adapter | **NOT STARTED** | No scaffolding. Better Auth config has no `plugins:` key at all |
| 9.2 | Discovery quality | **NOT STARTED** | — |
| 10.1 | OAuth linking | **NOT STARTED** | **First deliverable is migration `0057`**, not code — the 8 OAuth/MCP tables don't exist |
| 10.2 | Creator catalog | **NOT STARTED** | — |
| 10.3 | Publication readiness | **NOT STARTED** | — |

**Totals:** 4 DONE · 25 GAPS · 5 PARTIAL · 11 NOT STARTED · 1 DROPPED
(Epics 1–7 are delivered-with-residuals; Epic 8 is half-done; Epics 9–10 are greenfield.)

---

## 4. Documentation claims this audit refuted

These matter because dispatching work from them would duplicate finished code.

1. **Ticket 1.2's "deliberately accepted red" is closed.** `platform:test:routes` calls
   `verifyPlatformIngress` against a live `http://127.0.0.1:51474`; this morning's run on
   main printed `{"ingressHandlersChecked":11}` and passed — all five canonical probes
   included. The reconciliation, the ticket, and commit `88a72cbe`'s own message all still
   say otherwise.
2. **2.4 proves far more than "deletion-feedback fencing."** 18 cases, not 10 —
   `lifecycle-browser-guards.ts:1`, with the completion fences at `lifecycle.spec.ts:271`.
3. **ADR-008 decision 5 is already corrected**, and 6.4's numeric retired-ID non-reuse
   already has a 30+ assertion real-PostgreSQL proof in a PR-blocking lane.
4. **`publicPeopleProjection.ts` no longer emits `person_category: null`** — it emits
   `taxonomy.root`. The conclusion still holds but for a different reason (no data).
5. **Media gate is self-consistent.** All three known defects are fixed; `COVER_CATEGORIES`
   covers all 8 categories and every admitted category has a verified public reader.
6. **`scripts/check-retired-dependencies.mjs` exists and passes** — ticket 8.1 lists it as
   "Verified absent".
7. **Games' 503 is not a wiring residual.** Closing it is a build.

---

## 5. The analytics deadlock (decide this before Epic 8)

- The canonical summary route `/api/explorers/analytics/summary` works and has
  **zero frontend consumers**.
- The dashboard still reads the Strapi-backed `/api/explorers/analytics/events`, which
  canonical sign-in can never authenticate (`AnalyticsDashboard.tsx:85` keys on a `token`
  canonical auth never issues).
- So owner analytics is **currently non-functional for every canonically signed-in user**.

Retiring Strapi either deletes a live route or forces the deferred dashboard port first.
There is no third option and no migration written for it.

---

## 6. Running it locally

| Mode | State |
|---|---|
| Frontend only (`npm run dev`, :5173) | **Partly works.** Landing page renders. But `vite.config.ts:60,67` proxies `/api` + `/graphql` to a hardcoded `http://77.42.95.255:1337` which is **dead** (curl times out). `/explore` returns an empty body, console shows 502. |
| Root `npm run dev` / `run-all.ps1` | **Broken.** `tunes` throws `MUSIC_MODE must be live or fixture`; `tunes/.env.example` contains no `MUSIC_MODE` or `MUSIC_DATABASE_*`. The script is stale. |
| Replatform stack (`npm run platform:local -- provision`) | **Blocked on this machine** — see below. Credential-free by design once it runs. |
| Music fixture stack (`npm run music:up`) | Blocked on Node floor; `MUSIC_STRAPI_HOST_PORT` is overridable so its port clash is fixable. |

**Blockers found empirically:**

1. **Node is v24.14.0; repo requires `^24.21.0`.** No `engine-strict`, so installs only warn,
   but `music:doctor` hard-fails at `tunes/scripts/music-cli.ts:1413`.
2. **Windows reserves both stack ports.** 51434 and 51474 both sit inside the excluded range
   51398–51497; a bind test returns "forbidden by its access permissions" for both. They are
   hardcoded and attestation-pinned (`scripts/replatform-local.ts:13`, `:468`), so there is
   no env override. Fix is host-side:
   ```
   net stop winnat
   netsh int ipv4 add excludedportrange protocol=tcp startport=51434 numberofports=1 store=persistent
   netsh int ipv4 add excludedportrange protocol=tcp startport=51474 numberofports=1 store=persistent
   net start winnat
   ```
3. `explorers-earth/.env.example` still documents `VITE_API_URL=http://your-strapi-host:1337/graphql`
   as **Required**. A developer following the repo's own instructions wires the frontend to Strapi.

**Typecheck (run with the correct configs):**
- `explorers-earth` via `tsconfig.app.json`: **0 errors**.
  (Note: `tsc -p tsconfig.json` checks nothing here and always reports clean — don't use it.)
- `tunes`: **1 real error** — `server/services/youtube-playlist-import.ts:307`, missing
  `position`. The other **137 are all in `tunes/client/`**, the duplicate frontend 8.2 deletes.

---

## 6b. Verified by actually running the stack (2026-10-17)

The full replatform stack was brought up locally after freeing the two Windows-reserved
ports. `provision` → `{"ready":true,...,"postgresVersion":150019,"migrationCount":56}`,
all four services healthy, seed idempotent across two runs, and
`platform:test:routes` → `{"ingressHandlersChecked":11}`. **This independently reproduces
CI and confirms ticket 1.2's route invariant genuinely passes.**

Live probes against `http://127.0.0.1:51474` (combined mode):

| Route | Result |
|---|---|
| `/health/live` | 200 `{"status":"live"}` — canonical app is answering |
| `/api/explorers/v1/me` | 401 `UNAUTHENTICATED` with requestId |
| `/api/explorers/v1/account/lifecycle` | 401 `UNAUTHENTICATED` |
| `/api/explorers/v1/collections` | 401 `UNAUTHENTICATED` |
| **`/api/explorers/analytics/summary`** | **404 `Route not found`** |
| `/api/explorers/analytics/events` | 400 `Invalid analytics scope` (legacy route works) |

**New bug — the canonical analytics route is unreachable in every running configuration.**
`canonicalDelegate.ts:21` delegates only
`/^\/(?:health\/live|api\/auth|api\/explorers\/v1)(?:\/|$)/`. The summary route is
registered at `/api/explorers/analytics/summary` (`canonicalApp.ts:104` →
`explorersCanonicalAnalyticsRoutes.ts:29`) — **no `/v1` segment** — so in `combined` mode it
is never forwarded and 404s. In `legacy-music` (what production runs) it is not mounted at
all. Only pure `canonical` mode would serve it, and no compose file uses that mode.

This sharpens §5 considerably: the canonical analytics read does not merely lack a frontend
consumer, it is **not reachable anywhere**, while the Strapi-backed route it was meant to
replace is live and answering. Fix is one of: add `api/explorers/analytics` to the delegate
regex, or move the route under `/api/explorers/v1/`.
(Minor doc drift: `ticket-3-4.md:53` cites `canonicalApp.ts:60`; the real line is `:104`.)

**Two developer-experience defects in the replatform tooling itself:**
- `platform:local` is **not idempotent and cannot recover from its own partial failure**.
  A run that dies after creating resources but before writing the receipt
  (`replatform-local.ts:595`) leaves orphans that make `resource-inventory` (`:580`) refuse,
  while `stop` and `reset` both call `readReceipt()` first (`:703`) and fail because there is
  no receipt. Every CLI path is blocked; manual `docker rm` is the only way out.
- Redacted diagnostics (`replatform-local.ts:347`) reported a port conflict as
  `phase=resource-inventory`, a phase unrelated to the cause. Same pattern as the
  `load-chaos` catch block. Defensible for a secret-handling tool, but it needs a
  cause code that distinguishes "orphaned prior run" from everything else.

**Also:** 67 CSP violations on the landing page. 10+ shipped components hardcode
`images.unsplash.com` URLs; the replatform CSP (`nginx.replatform.conf`,
`vite.replatform.config.ts`) allows only `'self' data: blob:` + localhost, so those images
are blocked locally. Production's CSP is `img-src 'self' data: blob: https:` so they load
there — meaning the local/fixture runtime does not faithfully render production, and
production depends on hardcoded third-party image URLs. Two e2e configs already allowlist
Unsplash explicitly, so this is known and handled inconsistently.

## 6d. public-parity executed for the first time — and PASSES

Ticket 7.1's entire public browser gate was run locally on 2026-10-17, at `10a3cd4a`, clean
tree. **This is the first execution of these identities anywhere.**

```
Selected public-parity lane passed: 32 identities.
discovery identities: 32   results: 32   status: {expected: 32}
errors: []   child: {status: 0}   cleanup: passed
11:01:05Z → 12:04:00Z (63 min)   Playwright 1.61.1
```

All 32 pass — both projects (`public-parity-desktop`, `public-parity-mobile`), covering the
eight canonical category cold entries, ordered-ID continuations, same-slug-two-owners,
hidden/anonymous/foreign read refusal, and the shared unavailable response for
missing/private/archived.

**What this changes:** 7.1's browser obligation is not unmet work — it is *unrun* work that
passes on demand. The gap is CI reachability, not correctness. The runner still prints
"delivered slice incomplete" and exits 1, because one lane is not the full milestone; that is
the scope token, not a failure.

**What it does not change:** this lane cannot run in the current CI. It is Windows-gated
(§6c) and every runner is `ubuntu-24.04`.

## 6e. Running the native-only lanes — the documented procedure

**Decision (2026-10-17): `apps`, `guides` and `public-parity` are developer-machine lanes.**
Neither hosted runner OS can execute them:

- **Hosted Linux** — the fixtures' privacy model relies on Windows ACL *inheritance*, which
  POSIX does not have. Three successive layers were fixed (custody predicate, umask,
  diagnosability) before hitting a fourth inside `captureBrowserArtifacts`.
- **Hosted Windows** — `docker pull postgres:15-alpine` fails with
  `no matching manifest for windows(10.0.26100)/amd64`. Hosted Windows runners run Docker in
  Windows-container mode; Docker Desktop and WSL2 are absent, so a Linux image is
  unobtainable and the fixture's database authority is Docker-only by construction.

A Windows developer machine with Docker Desktop has both properties. The lane names already
said so — "protected Apps **manual** qualification", obligation "protected **native**
execution".

This is not "untested": **public-parity ran 32/32 here** (§6d). The lanes work where they
were designed to; they simply have no hosted home.

### Prerequisites — all six, none previously written down

1. **Windows + Docker Desktop in Linux-container mode.**
2. **Node exactly `24.21.0`** — a string compare on `process.versions.node`, not a range.
   Install side-by-side rather than replacing a system Node:
   `C:/Users/TK/node-24.21.0/node-v24.21.0-win-x64` (verified against nodejs.org SHASUMS256).
3. **PowerShell 7+ Core** — `public-parity-windows-job.ps1:3` requires `PSEdition 'Core'`,
   major ≥ 7 and `$IsWindows`. Windows PowerShell 5.1 is refused. Portable install at
   `C:/Users/TK/pwsh-7.6.7/pwsh.exe` (verified against the release `hashes.sha256`, which is
   **UTF-16LE** — grep it with an encoding-aware reader or the hash line will not match).
4. **Clean git worktree** — `snapshot.provenance.dirty` → refuse. Note this conflicts with
   putting real Google credentials in `docker-compose.replatform.yml`; stash them first.
5. **`PUBLIC_PARITY_POWERSHELL_EXECUTABLE`** (and the Guides equivalent) as an absolute
   **backslash** path satisfying `path.resolve(x) === x`, a real file, realpath-identical.
6. **`.artifacts/music-token-secrets` must already exist and be private.** The fixture
   asserts it and nothing in the repo creates it. Create it through the repo's own helper
   (`createLocalPrivateDirectory` in `tunes/scripts/music-local-state.ts`), not `mkdir`.

Also: `docker pull postgres:15-alpine` beforehand (the fixture attests, never pulls), no
`DATABASE_URL` / `DATABASE_URL_TEST` / `DOCKER_HOST` / `DOCKER_CONTEXT` / `GATE_PROD` in the
environment, and a receipt directory that is a **fresh** direct child of `os.tmpdir()` named
`replatform-e2e-[A-Za-z0-9-]{8,64}`.

### The command

```bash
export PATH="/c/Users/TK/node-24.21.0/node-v24.21.0-win-x64:$PATH"
export PUBLIC_PARITY_POWERSHELL_EXECUTABLE='C:\Users\TK\pwsh-7.6.7\pwsh.exe'
R="C:/Users/TK/AppData/Local/Temp/replatform-e2e-pp-$(date +%H%M%S)"
npm run platform:test:e2e -- --milestone delivered-auth-profile-books \
  --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --receipt "$R" --lane public-parity
```

Exit code 1 with "delivered slice incomplete" is expected for a single lane — that is the
scope token, not a failure. Read `"$R"/<lane>/receipt.json` for the real counts. Budget ~60
minutes per lane; each epoch rebuilds a worker, a browser and database state.

`--lane` currently accepts only `apps | guides | public-parity | people | apps-enrichment`
(`scripts/replatform-e2e.mjs:88`), so the other orphan lanes need the runner widened first.

## 6c. Windows-only fixtures — corrected

**Two** of the orphan-lane fixtures are hard-gated on Windows; a third is not.

| Fixture | Platform handling |
|---|---|
| `public-parity-browser-fixture.ts` | **Hard gate** — `process.platform!=='win32' \|\| process.versions.node!=='24.21.0'` → refuse. One implementation, no POSIX branch. |
| `guides-browser-fixture.ts:33` | **Hard gate** — `platform!=='win32'` → refuse. |
| `apps-browser-fixture.ts:299` | **NOT gated.** Explicitly accepts `['win32','linux','darwin']`; `:304` selects `path.win32` vs `path.posix`; `:981` is an explicit non-Windows branch. |

*Correction:* an earlier pass of this audit reported the Apps fixture as win32-gated. That was
wrong. It came from counting occurrences of the pattern `platform !== 'win32'` and reading a
count of 1 as "a gate" — the single hit was line 981, which is a **POSIX branch**, not a gate.
A grep count cannot distinguish a gate from a branch; follow the predicate.

**The real Apps blocker is one predicate.** `tunes/scripts/music-uat-database.ts` →
`stagedCustody()` validates the secret password-file path as Windows-only, unconditionally
and with no POSIX branch: `win32.isAbsolute(path)`, `/^[A-Za-z]:\\/`, backslash-split
segments, `win32.dirname`/`win32.parse` for ancestors, and a forbidden-character class that
includes `/`. On Linux the Apps fixture takes its own POSIX branch and hands `stagedCustody`
a POSIX path, which is therefore always refused with `secret custody is invalid`.

Confirmed empirically by a control dispatch of `apps-native` on unmodified main
(run `39026371885`): it reaches `stage=prepare-database`, five stages past preflight
(validation → preflight → receipt → create-directory → check-directory → prepare-secret →
prepare-database). A root platform refusal would surface at `stage=validation`.

**The `stage=preflight; category=refusal` in the 2026-10-17 03:33Z nightly is stale** — that
run used main at `8469a063`, before #122 and #123 merged later the same morning. It is
already gone on current main.

So the Apps options are: (a) move `apps-native` to a Windows runner, (b) give `stagedCustody`
a POSIX branch — a targeted, security-relevant change to one predicate, **not** a port of the
fixture, which already has a POSIX path, or (c) record the lane as Windows-native and
out of scope. All three are owner decisions; none should be taken to make CI green.

What the earlier pass got right and still stands: `guides` and `public-parity` are genuinely
Windows-gated, and on Windows they additionally require Node exactly 24.21.0, a clean
worktree, a backslash `*_POWERSHELL_EXECUTABLE` satisfying `path.resolve(x) === x`, that
executable being **PowerShell 7+ Core** (`public-parity-windows-job.ps1:3` demands
`PSEdition 'Core'`, major ≥ 7 and `$IsWindows`, so Windows PowerShell 5.1 is refused), and a
pre-existing private `.artifacts/music-token-secrets` directory that nothing in the repo creates.

## 7. What to do, in order

Ordered by dependency and by what unblocks the most. Steps 1–3 are small and should
happen first because they restore the ability to *see* regressions.

**1. Make the nightly green — it has never passed once.**
   *(Partly addressed 2026-10-17 by PR #124, `claude/priceless-wozniak-f826a5` — 11 commits,
   13 files, +276/−41, CI/harness/tests only, no product code. Outcome below. **Neither
   nightly workflow is fully green yet**, and note that #124's own green is a PR run, which
   by design excludes `load-chaos`.)*
   - **load-chaos** — blocker fixed; the lane went from dying at 156ms to running 735s,
     27 tasks with 15 passing. **9 tasks still fail**, now named with two root causes.
     Those nine are real defects that were invisible for 53 nights.
   - **WebKit** — fixed and verified. 0 failures. The 7 new skips are pre-existing
     chromium-only guards that were unreachable while the browser could not launch, not
     removed coverage. Worth knowing: **WebKit only ever runs 4 of 11 tests by design.**
   - **books** — fixed and verified by dispatch.
   - **Apps** — dispositioned native-only (§6e), not fixed.
   Also landed: `describeDockerFailure`, which stops Docker failures collapsing into one
   sentence. That dead-signal pattern appeared three separate times today and is arguably
   the more valuable fix.
   - Add `docker pull postgres:15-alpine` to `load-chaos` in `test.yml`. The fixture attests
     an already-present image and deliberately never pulls; on a fresh runner
     `docker image inspect` exits non-zero and
     `music-qualification-postgres.ts:109` swallows the real error into the generic
     `read-only Docker attestation failed`. **This exact diagnosis already exists in
     `frontend-e2e-qualification.yml:143-150`, with the fix — it was never applied here.**
     One line ends 53 consecutive failures.
   - While there: stop that catch block discarding the underlying error.
   - Then fix the three nightly E2E reds: `protected Apps` (see §6c — the `stage=preflight`
     refusal in the 03:33Z nightly came from a **stale** main; on current main the lane
     reaches `stage=prepare-database` and fails on a Windows-only custody predicate),
     `public-shell-cross-browser` (10 failures, **WebKit-only**, `browserType.launch … closed`),
     `real-stack books` (2 × 120s timeout on the anonymous later-list test).

**2. Fix the image build.** `public.ecr.aws` 429s on the pinned Node base image. Mirror it
   into GHCR or authenticate to ECR. Nothing can be released until this passes.

**3. Give browser acceptance a CI home.** Add a `pull_request` trigger (or a required
   nightly gate) and register the 7 orphan lanes — `music`, `places`, `place-links`,
   `guides`, `public-parity`, `people`, `apps-enrichment` — plus build a `products` lane.
   Note `scripts/replatform-e2e.mjs:88` currently accepts only
   `apps|guides|public-parity|people|apps-enrichment`, so `--lane` needs widening too.
   Split Guides case 4 before enabling that lane.

**4. Decide the analytics deadlock (§5).** This gates all of Epic 8.

**5. Flip `EXPLORERS_API_MODE` to `canonical`** in `docker-compose.yml:9`, with the four
   new `EXPLORERS_MEDIA_*`/tier variables supplied. This is the single change that makes
   the replatform actually ship. Everything in Epic 8's retirement list is downstream of it.
   Disable and record the `music-reconcile.yml` hourly cron first — it is the one scheduled
   job that reaches production Strapi.

**6. Mirror the 8.1a scan into `test.yml`.** It runs only at `tunes.yml:98` behind
   `branches: [main]` + a path filter, so the ratchet is silent on exactly the branches
   where coupling creeps back.

**7. Start 8.5 (backup/restore/recovery) now, in parallel.** It depends on nothing in the
   Strapi cutover, it has produced nothing, and it gates 8.4 and — through Milestone 3 —
   all of Epics 9 and 10. This is the critical path to ChatGPT discovery.

**8. Then, in order:** 8.2 duplicate-frontend removal as one atomic commit (also clears 137
   TS errors) → 8.3 rename (before more contract tests hard-code `tunes/`) → 3.5/QA
   infrastructure and a real `verifyRelease` trust adapter → 7.3 milestone evidence → 8.4/8.5
   joined promotion.

**9. Product decisions that are blocking code, not waiting on it:**
   - D5 per-place pins: enable or delete. Shipping 466 unreachable migration lines is the
     worst of both.
   - D3 / People taxonomy: build a production catalog-apply path and supply reviewed People
     terms, or `/people/sectors/:slug` is permanently a 404.
   - Supply `TMDB_ACCESS_TOKEN` and `EXPLORERS_APPS_PROVIDER_CONFIGURATION` in deploy env.
   - Fill the four legal placeholders in `explorers-earth/src/content/reference/en.json`,
     and add a lint that fails on `[bracket]` placeholders.
   - Games: decide whether the provider ships at launch. It is a build, not a wire.

**10. Epics 9–10 are greenfield.** One correction to the plan: 10.1 cannot begin with code —
   its first deliverable is migration `0057` creating the OAuth/MCP tables.
