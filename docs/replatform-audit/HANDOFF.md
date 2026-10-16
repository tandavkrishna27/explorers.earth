# Handoff — replatform, as of 2026-10-09 (wave 1 merged, plus this branch)

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

> **Base is current as of `69e0d47f`** (PR #120, wave 1: D1, D2, D4, D6, D7, D8, D10
> decided and landed). **This file then moved well past that on `claude/wave3-auth-lifecycle`**
> (PR #121), which is where the 2026-10-09 sections below come from. If
> `git log --oneline -1` shows something later than that branch, check this file against it
> before trusting its "remains" sections — they have drifted twice already, and a stale
> remains-list is the most misleading thing a handoff can carry.

Written to end a long session. Start here, then use
[the sequence doc](remaining-work-sequence.md) as the backlog. Branch
`codex/unified-replatform`, draft PR #119, worktree
`C:/Users/TK/.codex/worktrees/replatform-audit/explorers.earth-main`.

**PR #119 is the integration branch for all ten epics. Do not land it incrementally.**

## Read these three first — two are closed, and how they closed is the useful part

Items 1 and 2 were open when this document was written and are now done. They are kept
because each one failed in a way that will recur: a fix that looked like one line and was
three, and a check that passed because the check was broken.

### 1. CI is green again, and the guides E2E fix needed three things, not one

Both `🎭 E2E Category A` and `🎭 E2E Category B` failed on the same cause and share the same
harness, so one fix covered both. It took more than the one-line change I first wrote down
here, which is worth recording because the first two attempts each looked right and changed
nothing:

1. **The allowlist regex** at `e2e/setup/category-navigation.ts:250` matched native content
   reads for `movies|games|apps|products|people|places`. Guides became the seventh, so its
   `content-snapshot` fell through to the catch-all deny. Added `guides`, plus a seventh
   `nativeContentFixtures` entry and its arm in the `nativeReader` chain - the shape of
   change Places already had at `:138-141`.
2. **The guide aggregate read was still denied.** `GET /collections/:id/guide` is addressed by
   collection id with **no category in the path**, so the category regex could never match it
   and my new fixture branch was never reached. The editable-list read has exactly this
   property and its own dispatch, so that predicate now covers `(?:editable|guide)`.
3. **The DTO rejected my fixture.** `guideAggregateDtoSchema.revision` is a number; I passed a
   string. The fixture serves an empty guide - the same default the service returns for a
   collection with no details row - because this lane exercises navigation and pinning, not
   guide content.

Verified locally, not inferred: the guides case passes in 23s, and the whole Category A lane
is **19/19** so the other six categories are undisturbed.

### 2. D9 is done — the uncommitted work is committed

Landed in `f84f96df`. The guide category picker now suggests the categories this creator has
already used and accepts anything typed; it invents no vocabulary, because which category
names exist is product copy.

Two things that came out of it are worth carrying forward:

- The test hang was a **latent render loop**: `initialCategories` and
  `initialBestTimeToVisit` defaulted to inline `[]`, a fresh identity every render, and the
  prop-sync effect lists both in its dependencies. Mounting survived it; the first
  interaction did not. The defaults are module-level constants now. It was never live - the
  single caller passes stable `formData` references - so only a caller omitting those props
  could reach it. **If another component in this codebase syncs props to state with array
  defaults, it has the same bug.**
- My first mutation check reported all 5 tests passing with the free-text affordance removed,
  which would have meant the load-bearing path was uncovered. The check itself was broken:
  the patch script's `replace()` silently no-opped because the pattern had shifted and I had
  omitted the `assert`. **Always assert the mutation applied**, or a no-op reads as coverage.

### 3. The legacy retirement map is written — read it before touching the lifecycle lanes

[`lifecycle-legacy-retirement-map.md`](lifecycle-legacy-retirement-map.md) maps each of the
**11** executing legacy cases to its canonical replacement, which C4 required before
`account-lifecycle.spec.ts` can be retired. Two rows are clean **gaps** and five are
**partial**, each with the specific assertion needed. `:219` — "unresolved lifecycle authority
fails closed before any destructive control", which exists because that regression actually
happened — has no canonical equivalent at all. Do not retire that one.

### 4. Read the frozen map before touching lifecycle work

[`lifecycle-requirement-receipt-map.md`](lifecycle-requirement-receipt-map.md) is the
artifact ticket 2.4 names as a hard prerequisite. Its first section matters: the "original 18
+ 3 lifecycle behaviours" **does not exist anywhere in the repo**, so the map derives its
denominator from the actual contract surface and comes to **19 + 3**. All 22 rows have
receipts; three obligations remain.

## State of steps 1–9

| Step | State |
|---|---|
| 1. Guides (5.3) | Done |
| 2. Dashboard home | Done |
| 3. Claim flow | **Done.** D4 decided against it; the flow is dropped in `7399cfe1`. |
| 4. Auth pages | Done. Was never D10's — see below. |
| 5. Auth UX and lifecycle (2.4) | **6 of 7 obligations closed; exactly one remains.** Re-counted 2026-10-09 against [the frozen map](lifecycle-requirement-receipt-map.md): 1 and 2 done 2026-10-08, **3** (real Google callback) discharged 2026-10-09 executed and observed, **4** (Music socket revocation on logout) discharged 2026-10-09 in `e809d57b`, 6 (the L19 fence) already done, and 7 closed by 1. **Open: only 5, the hosted attestation of the browser receipts**, which needs a hosted environment. The earlier "2 of 6 done; 3 remain" was stale and also miscounted - there are seven entries. |
| 6. Public place/person detail | Done |
| 7. Profile, Settings, Analytics | Done. Ticket 7.2's reference content landed 2026-10-08 |
| 8. Music glue | Done |
| 9. Billing | Done. D1 has since landed too: AI features removed (`76224913`) and the monthly request cap (`6fcf0187`). |

Apollo hook consumers outside tests: **19 → 2**, and the milestone is sharper than the
number. The two left are `AuthSyncManager` and `useLogout`, and both hold nothing but
`apollo.clearStore()` — cache plumbing that goes with Apollo in step 12. So as of 2026-10-08
**the frontend makes no Strapi read or write through Apollo at all.** `CreateGuideStep2` went
with D9, `ClaimAccount` when D4 dropped the flow, and `useFaqs`/`usePlatformTerms`
with ticket 7.2.

What that does **not** mean is that the frontend is off Strapi — see the REST note in the
sequence doc, which the 2026-10-08 recount found to be wider than the four files recorded
there.

Count it honestly:

```bash
cd explorers-earth && grep -rn "useQuery\|useMutation\|useLazyQuery\|useApolloClient" src \
  --include=*.ts --include=*.tsx -l | xargs grep -ln "@apollo/client" \
  | grep -v "__tests__\|/test/" | wc -l
```

## Ticket checkboxes are NOT status — counted 2026-10-09

**331 unchecked `- [ ]` items remain across `docs/replatform-audit/tickets/`, and that
number says almost nothing about remaining work.** Only 69 of them are `Run`/`UAT`-style
verification steps; the rest read like implementation items, and many are simply stale -
nobody ticked a box as the work landed.

Two from `ticket-5-3.md`, which the sequence records as **done**:

- *"Replace Strapi numeric upload IDs and bearer-token media calls in `guideService.ts`"* -
  `guideService.ts` **does not exist**; it was deleted.
- *"In `guides.integration.test.ts`, create sections S1/S2 …"* - that file exists and is
  34 KB.

Every ticket also carries this in its own boilerplate: *"Commands and checkboxes specify
required verification, not completed runs."*

**So do not read an unchecked box as open work, and do not read a count of them as
progress.** The current authorities are, in order: this handoff, then
[the remaining-work sequence](remaining-work-sequence.md), then
[the ticket index](ticket-index.md). Reconciling all 331 against the delivered state is
bookkeeping worth doing, but it is bookkeeping - it would change no code and close no
blocker, and it is not what the table below is waiting on.

## What stands between here and a finished plan — consolidated 2026-10-09

The steps below are not blocked on engineering judgement or on more code being written.
Each needs an input that cannot be produced from inside the repository. Read this before
concluding that something was merely left undone.

| Blocker | Step / ticket | What it needs, exactly |
|---|---|---|
| **`platform-fixture` is red by design** (once, transiently, it failed earlier at `postgres-start` — see 2026-10-09) | 1.2 | **DECIDED 2026-10-09: leave it red, accept at merge.** Do not attempt to green it. **Now costed** — see `route-graph-invariant.md`: a bounded change (mode flip, four presence-checked env vars, healthcheck off a legacy-only route; no real credentials needed) blocked by ONE decision, that `music-deployment-files.test.ts` pins `legacy-music` across all three compose files including production, making this a coordinated cutover. The fixture must run the canonical composition instead of `EXPLORERS_API_MODE: legacy-music`. Until then the red is correct and must not be silenced — see the by-design section below. A merge needs you to accept a known-failing required check. |
| **Browser lanes are coordinator-reserved** | 6.3, 7.1's `public-parity.spec.ts`, 7.3, step 15's place specs | A Docker fixture runner plus `suite-manifest.json` identities. Both are allocated by the coordinator, not writable from a ticket. |
| **Hosted QA environment and live providers** | 7.3, 2.4, 3.3's re-attestation, 4.1's live TMDB smoke | Real credentials and a hosted run at a named commit. A fixture cannot substitute, and each of those tickets says so itself. |
| **`TASK4_FIXTURE_OWNED_DISPOSABLE_PG15` acknowledgement** | 3.4 | Yours to give. Hand-adding the lane would falsify an attestation. |
| **8.1a's three ops items** | 8.1a | The `music-reconcile.yml` cron disablement *recorded before* deletion; an executed boot receipt with outbound Strapi denied; and the compose `${VAR:?}` loosening — which **re-measured 2026-10-09 is `docker-compose.yml` alone, 6 declarations.** The other three locations the ticket names need nothing: the replatform compose's Strapi vars are all `:-default` or literal fixture values, `deploy/platform.compose.yml` has no Strapi reference, and `tunes.yml:103` is a hardcoded CI fixture token. |
| **8.2's deletion gate** | 8.2, step 12 | A packaged-image inspection, a production graph smoke, and the owner/guest/reconnect/publication browser scenarios. Its first step — re-homing the two coverage-gated client files — is **already satisfied**; see the ticket. |
| **`strapiIdentityAbsenceProof` deletion authority** | step 12 | An explicit grant. Not mine to assume. |
| **Legal copy values** | 7.2 | Company name, country/state, app URL, contact email. A one-file edit once you supply them; rewriting a legal document's operative text is not an engineering call. |
| **D3, D5** | Phase D (step 15) | The Places taxonomy vocabulary (an export, or a decision to ship without it) and per-place pinning. |
| **eslint burn-down** | — | 1647 warnings against a 0-error gate, deliberately unsequenced. |

**D8 came off this list on 2026-10-09.** Its last third,
`recommendation_list.List_Name_Details`, turned out to be already built on the exact
destination the register recommended - one shared `legacyListNameDetails` assembling the
blob from three canonical columns, used by the public projection, the owner view model and
the write path alike, with all three named readers served. No decision was needed; see the
owner-decisions record.

**CI state as of run `37872412216` (commit `c3c6c896`), the first fully settled run after
the whole-tree gate:** every job passes except `platform-fixture` and `music-required`,
the aggregator that gates on it. That includes `contracts` now running all 170 tunes test
files instead of the 87 it covered that morning, and `browser`. So the by-design red is
the *only* red, and any new failure is a real one.

**What is not on this list is done or recorded as measured.** The engineering-side items
closed on 2026-10-09 are 8.1a's module move, 7.1's named acceptance suite (21 cases
including the visibility matrix, reserved handles and route pins), 5.1's named unit suite,
4.1's two named cases plus its field-assertion traceability map, 3.3's static half, two
live canonical-media defects across eight files, a CRLF bug that silently disabled comment
stripping in a production gate, and the gating of 30 previously-unrun test files.

## What actually remains, and what it needs

**Nothing here is waiting on a decision any more.** All three that were are taken:

- **Ticket 7.2 — done** in `cc9f3e4b`. The copy lives in the repo at
  `explorers-earth/src/content/reference/<locale>.json` behind `useReferenceContent`;
  `useFaqs` and `usePlatformTerms` delegate to it and `LandingPage/api/queries.ts` is gone.
  Ten locales, which is what Strapi actually had — not the i18n bundles' 47.
- **D9, guide categories — done** in `f84f96df`. Suggestions come from the creator's own
  history and the field accepts anything typed, so no vocabulary was invented.
- **D4 — decided against, and the flow is gone.** `7399cfe1 feat(5.4): drop the claim flow,
  which D4 decided against` removed `pages/ClaimAccount.tsx` outright, along with the
  truthful-refusal change I had made as an interim step and its test. Nothing to carry
  forward except the note for anyone who rebuilds it: an unauthenticated document upload
  needs a server-issued, single-use, purpose-bound grant, the way recovery proofs do — not
  a `VITE_PUBLIC_ACCESS_TOKEN` shipped to the browser, which is what the old flow used.

**Not decisions, just not mine or not here:**

- Step 5's three open obligations: the **real Google callback** (needs live credentials; the
  ticket says a fixture cannot substitute), **Music socket revocation** (owned by 6.1, which
  is step 10+), and **hosted attestation** — `frontend-e2e-qualification.yml` triggers on
  `schedule` and `workflow_dispatch` only, so **none of the 12 canonical lifecycle browser
  cases gates a merge**, and `account-lifecycle.spec.ts` is the only lifecycle coverage that
  does. Wiring the canonical lane into a protected aggregate is merge governance, jointly
  owned with 1.3. The one-to-one retirement map is now written
  ([`lifecycle-legacy-retirement-map.md`](lifecycle-legacy-retirement-map.md)) and found
  2 clean gaps and 5 partials across the 11 legacy cases, so retirement is blocked on
  coverage as well as on gating.
- Step 10's **classification is done** (2026-10-08) —
  [the server-side Strapi classification](strapi-server-classification.md), plus the named
  static scan `scripts/check-retired-dependencies.mjs`, wired into `tunes.yml`. Headline: no
  reachable canonical path touches Strapi and canonical startup needs no `STRAPI_*`; the
  "55 files" was never the denominator, and most of the volume is `strapi_*` **columns**
  (data about a retired system, not calls into one). `strapiOrigin` needs no loosening — it is
  legacy-path only. What is left of 8.1a is three owner items (compose `${VAR:?}` loosening,
  the `music-reconcile.yml` cron disablement, an executed boot receipt) and one small move.
- **New live defect found there, owned by 3.4, not by retirement** — the analytics events
  panel is empty for every signed-in owner, because its read is gated on an auth-store token
  canonical auth never sets. **The false message is fixed** (it said "No Analytics Data" and
  advised sharing QR codes; it now reports the read as unavailable, says that does not mean
  no visitors, and reaches no network). **The repoint is scoped, not done:** seven of the
  twelve charts want a cross-tabulation `AnalyticsSummary` does not carry, and
  `analyticsQuerySchema` has no `page` or `element` filter, so it needs a contract decision
  about which breakdowns are worth keeping. Table in the classification doc, section D.
- **A fixture hid that defect behind a green suite, and the lesson generalises.**
  `AnalyticsDashboard.test.tsx` seeds `token: 'private-user-token'`, which production never
  issues, so every existing test ran the path no real owner is on. If another suite seeds a
  token or credential, check whether canonical auth actually issues it.
- **Step 11 started 2026-10-08. 1.2's route-parity inventory is extended and bound to the real
  app** — [the route-graph invariant](route-graph-invariant.md). The review's "passes
  vacuously" was one level too shallow: the fixture runs `EXPLORERS_API_MODE: legacy-music`
  and serves none of the canonical routes, so the invariant is unsatisfied at its root.
  **`platform:test:routes` now fails in CI as a result, by design** — that is the ticket's
  mandated "failure, not a skip", and reverting is one commit that restores the vacuous pass
  rather than correctness. **An owner decision is needed** because 1.2 asks for the six legacy
  probes *and* canonical routes from one runtime, which is impossible; the three options and
  their costs are in that doc.
- **7.1 re-measured 2026-10-08** — [public parity state](public-parity-7-1-state.md). Three of
  the 2026-10-05 review's four findings are resolved (the overlay is committed with its specs
  migrated; the P0 UUID-as-legacy-subject seam is closed; category coverage is 8 of 9 with no
  ninth to error on, now locked by an enum-driven test). **One is live and is the owner's
  call:** `publicPlaceMedia.ts` still admits any `*.amazonaws.com` host and the Strapi origin,
  so hiding an attachment does not deny its bytes — but tightening it inverts assertions
  `PublicHome.place-image.test.tsx` makes positively, and blanks images that work today. Three
  options in the doc. Full 7.1 parity stays gated on 6.3 by the ticket's own terms.
- 7.3 (the rest of step 11) and steps 12–13 have not started.

## Owner decisions taken on 2026-10-08

**Ticket 7.2 — the legal copy lives in the repo.** TK chose the repo option. Done: the FAQ
and the Terms/Privacy/Cookie bodies are at `explorers-earth/src/content/reference/`,
locale-keyed, and `useFaqs`/`usePlatformTerms` read them instead of Strapi. See the section
below for what the export showed, including one thing that needs TK's eyes.

**`requireRecoveryObservation` stays.** TK chose keep, so the read-only observation
authority in `tunes/server/auth/accountRecovery.ts` is settled and no code changed. The
lost-response and terminal-deletion cases keep working. Ticket 2.4's C3 is corrected in
place: it claimed a client that lost its response could already re-observe through
`/recovery/status`, and before this authority existed that returned 403.

## Three things that need your acknowledgement, not engineering

Each of these looked like unfinished work and is not. They are recorded so nobody spends a
session rediscovering it.

1. **Ticket 3.4, analytics attestation.** The lane exists, is contained, and is already in the
   nightly workflow; `suite-manifest.json` records \"Analytics acceptance\" as pending by
   design, and `scripts/replatform-e2e.mjs` *runs and receipts* every listed lane on each
   invocation. Promoting it means producing that receipt, which needs the explicit
   `TASK4_FIXTURE_OWNED_DISPOSABLE_PG15` acknowledgement: `cd tunes && npx tsx
   scripts/analytics-browser-fixture.ts`. Hand-adding the lane would falsify an attestation.
2. **Ticket 2.4, the real Google callback.** Needs live provider credentials. The ticket is
   explicit that a fixture cannot substitute.
3. **Ticket 7.2 is decided and built — but read what the copy actually says.** Decided for
   the repo, migrated verbatim from the live Strapi collections, 23 tests, three mutations
   killed. Two things the export surfaced that are **yours, not engineering's**:

   - **The live legal copy is placeholder-ridden.** It is titled "Terms and Conditions for
     **LocalQR**" and contains unfilled template slots: `[your app URL]`,
     `[Your Company Name]`, `[Your Country/State]`, a contact address of
     `hello@localqr.earth`, a website of `www.localqr.earth`, and an effective date of
     10th Sept 2025. This is what explorers.earth serves **today** — the migration did not
     introduce it and deliberately did not fix it, because rewriting the operative text of a
     legal document is not an engineering call. Replacing the copy is now a one-file edit.
   - **Privacy and Cookie policies exist in English only.** Measured across all ten locales
     Strapi had configured: `Terms_and_Condition` is translated in eight (`bn` and `id` have
     no row at all), `Privacy_and_Policy` and `Cookie_Policy` came back as empty arrays in
     nine of ten, and the FAQ is genuinely translated in all ten. So a non-English visitor
     already saw a blank privacy page before this change. The new module falls back to
     English **per section**, which is strictly better than the Strapi behaviour it replaces,
     but it does not translate anything.

## One security boundary change the owner may want to veto

`requireRecoveryObservation` in `tunes/server/auth/accountRecovery.ts`. `requireRecoveryPrincipal`
gates on `consumed_at IS NULL` **and** `status IN ('suspended','pending_deletion')`, which made
two lifecycle outcomes unreachable: a recovery that succeeded (so `ReactivateConfirm` told the
owner "This account cannot be recovered") and a terminal deletion (shown identically to a
transient failure, offering retry forever). The new authority is branded, read-only, not
assignable to `RecoveryPrincipal` or `Actor`, and drops exactly those two conditions while
keeping the proof's five-minute expiry and revocation checks. `/recovery/complete` is untouched.
The security inventory label changed from `single-use-google-bound-recovery-proof` to
`google-bound-recovery-proof-within-expiry-read-only`.

**Reverting it re-breaks the lost-response and terminal cases.** That is the trade.

This also means **ticket 2.4's C3 is wrong** where it says a client that lost its response can
already re-observe through `/recovery/status`: it returned 403.

## A history discrepancy on this branch — read before trusting `git log`

**Commit `2846157e`'s message does not describe its contents.** Its message is only about a
CI registry rate-limit flake and states "there is no code fix". It actually carries:

- the whole ticket-3.4 analytics honesty fix (`AnalyticsDashboard.tsx`, 48 lines),
- its new test file `AnalyticsDashboard.unavailable.test.tsx` (148 lines),
- the two new `emptyState.unavailable*` i18n keys in `en.json` and `hi.json`,
- and `public/sitemap.xml`, which is **build output** — `npm run build` rewrites it with the
  current date, and it had been deliberately kept out of the preceding commits.

What happened: **two sessions were working this branch at the same time**, and one ran a
stage-everything commit while the other had that work uncommitted in the shared worktree. The
code is correct and was verified — tsc, build, eslint 0 errors, the full suite at 4538/326,
and three mutations confirming the fix fails when reverted — but none of that reasoning is in
the commit that carries it, and the message actively denies a code change.

**Not rewritten, deliberately.** `2846157e` is already on `origin` and another session was
live on the same branch; a rebase or force-push there risks destroying someone else's work.
The rationale lives in the classification doc's section D and in the entry above instead.

**If you run more than one session against
`C:/Users/TK/.codex/worktrees/replatform-audit/explorers.earth-main`, serialize them.** They
share one index and one working tree, so `git add -A` in either one commits whatever the other
is holding, under the wrong message.

## 79 of 176 tunes unit test files were in no CI job — counted 2026-10-09

Every tunes job in `.github/workflows/test.yml` runs an **explicit file list**, except the
`contracts` job, which passes a directory. So coverage grows only when someone edits a
list, and the tree has outgrown the lists:

| Directory | Ungated unit files |
|---|---|
| `server/test` (root) | 55 |
| `server/test/publicProfile` | 11 |
| `server/test/explorers` | 5 |
| `server/test/deployment` | 3 |
| `server/test/migrations`, `music`, `integration`, `helpers` | 5 |

**Closed.** The `contracts` job now runs `server/test` — the whole tree, as a single
argument, so it cannot go stale again. Naming directories or files only moves the
staleness somewhere else.

Measured before landing, because "just gate everything" deserves evidence: **168 of 170
files pass** locally, and both exceptions are environment rather than code.

- `music-cli-contract` needs a gitignored `.env.music.test` this worktree was never
  provisioned with; CI's checkout has no reason to lack it, and that file is already in
  the job today and green.
- `music-docker-release-authority` reads the git index, so it fails if the tree changes
  while it runs — which is what happened: I committed during the run. On a static tree it
  is **46/46**, and a CI checkout is static.

The 55 previously-ungated root files were separately confirmed first: **53 run and all
pass**; the other two (`account-recovery.test.ts`, `*.real-tool.test.ts`) are excluded by
`vitest.config.ts:24` and cannot run in the default config at all.

The tree argument does re-run the deployment files that `image-deploy-contract` also runs.
That duplication is deliberate — a few seconds against an exclusion list that would need
maintaining.

## A gate that pins CI's shape was not itself gated — now resolved

**Resolved 2026-10-09.** The `contracts` job's argument is now `server/test`, the whole
tree, which includes `server/test/deployment/`. The history below is kept because the
failure mode is general and will recur in another directory.

`server/test/deployment/` was in **no** gated selector, so nothing in CI ran it.
`music-image-ci-tests.test.ts` lives there and pins the exact list of integration files
`.github/workflows/test.yml` runs. On 2026-10-08 that list grew from nine to fourteen
(`111466e6`, `4c86ab6b`) and the assertion was not updated; CI stayed green through both
commits and a full local 169-file unit run is what caught it (fixed in `6c6b5634`).

Two consequences worth keeping in mind:

- **Changing `.github/workflows/test.yml`'s selector list means updating that assertion in
  the same commit.** Nothing will remind you.
- Adding a gated selector for `server/test/deployment/` is the real fix. It is a CI-surface
  change of its own and is not done - and note it would newly gate 46 release-authority
  cases, some of which read the git index and would need checking against a CI checkout
  before being made required.

## You can run the integration suites locally, and they need a FRESH database each time

Nothing in the repo says how, and the suites are the only way to verify server work
without pushing. The recipe, which is exactly what `.github/workflows/test.yml:91-105`
does:

```bash
docker run -d --name explorers-pg15-fixture-local   -e POSTGRES_DB=music_fixture -e POSTGRES_USER=music_migrator -e POSTGRES_PASSWORD=music   -p 55432:5432 postgres:15-alpine
```

```powershell
# from tunes/, PowerShell (Git Bash breaks the deploy-executable suites)
$env:DATABASE_URL_TEST="postgresql://music_migrator:music@127.0.0.1:55432/music_fixture"
$env:MUSIC_C3_POSTGRES_TEST="1"   # the workflow sets this too; it is the disposable-DB ack
npx vitest run --config vitest.integration.config.ts <files> --maxWorkers=1 --fileParallelism=false
```

**`MUSIC_C3_POSTGRES_TEST=1` is not an owner decision** — `test.yml:105` and
`tunes.yml:102` both set it. It asserts the target is disposable, which a container you
just created is.

**These suites are not idempotent against a reused database.** Re-running the list
against the same container fails
`explorers-lifecycle.integration.test.ts > keeps a Music-mapped deletion pending …` with
`The Explorer identity conflicts with an existing Music identity`, from
`ensureIdentity`. That is leftover state, not a defect: CI never sees it because it gets
a fresh `postgres:15-alpine` service per run. **Recreate the container before trusting a
result**, and do not debug a failure of this shape until you have.

About 8 of the 15 files skip locally — they gate on environment the local container does
not provide — so a local pass is a weaker signal than CI's, not an equal one. On a fresh
database the list is 7 passed / 8 skipped / 0 failed.

## A CRLF trap that silently disables comment stripping

This repository is CRLF throughout. Splitting a file on a newline therefore leaves a
trailing carriage return on every line, and **a carriage return is a line terminator in a
JavaScript regex**. So in `line.replace(/\/\/.*$/, "")`:

- `.` will not match the carriage return, and
- `$` without the `m` flag anchors only at the very end of the whole string,

which means the pattern matches **nothing**. Any "strip line comments" step written this
way is a no-op here.

`scripts/check-retired-dependencies.mjs`'s `codeOnly` had exactly this, under a comment
promising "blank out comments so a mention in prose is never read as code" - so a
`STRAPI_*` mention inside a `//` comment in the canonical closure failed the scan as
though it were a real read. Fixed `d6209e77` by normalising `

` first, and proved by
probe: the same comment passes with the normalisation and fails without it.

The direction was over-strict rather than unsafe, so nothing was ever missed. But **this
is the real cause of the "banned-word assertion trips on my own comment" problem** that
this plan's notes record twice as a quirk to work around by rewording. It was not a quirk.
If you write a scanner here, normalise line endings before anything else.

## Lessons that will cost you time if you skip them

- **`tsc -p tsconfig.json` in explorers-earth checks nothing** and always reports 0 errors
  (`"files": []` plus project references). Use `tsconfig.app.json` while iterating — and
  before pushing, run what CI runs: **`npx tsc -b`** and **`npm run build`**. That gap is
  exactly what made `f818e1a9` necessary. In tunes, filter to `^(shared|server)/`; the one
  `youtube-playlist-import.ts:307` error is pre-existing.
- **New shared contracts the frontend imports must use `zod/v3`, not `zod`.**
- **A new shared contract file needs three edits, not one**: the file, the `fixedFiles` list
  in `scripts/generate-music-fixture-dockerignore.mjs`, and a `COPY` in
  `explorers-earth/Dockerfile.music-fixture`. The generator's own `--check` passes without
  them; it caught nothing on four occasions this session. Always run both:
  `node scripts/generate-music-fixture-dockerignore.mjs --check` **and** the import-closure
  walk in the scratchpad (`check_fixture_context.py`).
- **Never count test cases with a line-anchored grep.** `grep -nE "^\s*test\("` on
  `e2e/replatform/lifecycle.spec.ts` reports 10; there are 12, because two are generated by a
  `for` loop at `:202`. I published that undercount as a "correction" to a claim that had been
  right. Use `grep -c "test("`.
- **On this branch, "blocked on an owner decision" is usually wrong — measure first.** Five
  items I had filed as blocked were not: the password pages (already redirecting, and ticket
  2.4 line 45 records it as *agreed*), Settings' password mutation (dead behind a literal at
  `Settings.tsx:127`), billing (3 of 5 calls already unreachable, 1 a read nothing consumed),
  the venue name (intent already in the provision code), and Home's `GetDashboardStatus`
  (inert — its only consumer read `data?.me?.accounts`, a field the document never returned).
- Run tunes suites **from PowerShell**; in Git Bash `whoami.exe` resolves to MSYS `whoami` and
  81 deploy-executable tests fail environmentally.
- `explorers-lifecycle.integration.test.ts` is **not self-cleaning** against the shared
  `music_fixture` database and collides once identities accumulate. Reset:
  `docker exec explorers-music-fixture-postgres-1 psql -U music_migrator -d postgres -c "DROP DATABASE IF EXISTS music_fixture;" -c "CREATE DATABASE music_fixture OWNER music_migrator;"`
  then re-run `server/test/migrations/music-migration.integration.test.ts` to re-apply migrations.
- Two frontend tests are **load-sensitive flakes**, not regressions:
  `contained-unit.launcher`'s VITE-identifier case (5s budget, scans the whole tree) and
  `ProfileMusic.gateway-recovery`. Both pass in isolation; confirm with a second full run
  before chasing them.
- Write Python patch scripts with the Write tool and run them by path — heredocs mangle CRLF
  on Windows. Always `assert '\r\r' not in text` before writing.
- **`git checkout -- <path>` cannot undo a mutation to an untracked file.** It fails with
  "did not match any file(s) known to git", and if you are looping over mutations the failure
  is one line of stderr between two passing-looking runs — so the mutations **stack** and the
  file is left corrupt. It cost me two confusing re-runs this session. When mutation-testing a
  file that is new in your working tree, either `git add -N` it first or restore from a copy,
  and always re-run the suite afterwards to confirm you are back to green.
- **`npm run build` in explorers-earth rewrites `public/sitemap.xml`** with the current date.
  It will show up in `git status` as a change you did not make; drop it rather than committing
  it.

## `platform-fixture` is red BY DESIGN — with one transient exception, 2026-10-09

> **The steady state is what this section describes:** `phase=ingress-check;
> cause=ingress-malformed-body`, confirmed again on run `37879996276`.
>
> **Once, on run `37878456429`, it failed earlier instead** — at `phase=postgres-start`,
> 1.3 seconds into provision, meaning PostgreSQL did not start and the route-graph
> invariant was never reached. The next run was back to the ingress cause with no fix in
> between, so that was **transient and its cause is unknown**. Recorded because a single
> observation is a single observation: I first wrote this box claiming the by-design red
> had been replaced, which was reading one run as a new state.
>
> That occurrence reported **no cause at all**, because `run` classified only
> `failurePhase === "service-build"`. `postgres-start` is now classified with the same
> closed set, plus `port-unavailable` and `compose-config-invalid`, so **a recurrence will
> name itself** (`07b0d14d`, `7fff1041`, `5db136a9`). Four cheap explanations were
> eliminated while it was thought to be persistent, and they need not be re-checked: the
> three `:?` interpolations are set unconditionally by `childEnvironment`;
> `compose config --services` resolves and lists `postgres`; the pinned `public.ecr.aws`
> postgres digest pulls; and a probe run of the service's own compose definition brought up
> the network, volume, container and secret bind mount successfully.
>
> Not reproducible on the Windows host: 51434 and 51474 are WinNAT-reserved, so `provision`
> cannot bind. The output that would name a cause is redacted on purpose ("never print
> it"), which is why the category is the only thing that can speak.

**The rest of this section is correct about the invariant itself. It is not flaky,
not a regression, and not caused by
any branch. It is ticket 1.2's route-graph invariant doing exactly what it was built to
do**, and the repository already said so at
[route-graph-invariant.md:61](route-graph-invariant.md) under the heading *"The cost:
`platform:test:routes` will fail in CI, by design"*:

> Against a `legacy-music` fixture, the five canonical probes are absent, so **that job now
> fails.** That is the ticket's mandated behaviour [...] and it is the first time the
> invariant has been able to fail at all.

Measured confirmation, run by run on the **"Music contract and qualification CI"**
workflow:

| Commit | `platform-fixture` |
|---|---|
| `91b6c99b` (2026-10-08 13:56) | success — the last one |
| `b4975654` (14:44) — *"bind the route-parity invariant to the real canonical app"* | **failure** |
| every run since, up to today | failure |

So it has failed continuously since the commit that added `CANONICAL_ROUTES`.

**What the evidence supports, and no more.** The last passing run printed
`{"ingressHandlersChecked":6}` — the five legacy probes plus the `/api/users/me` Strapi
boundary — so those six still pass and the failure is in the canonical five.

The cause is `ingress-malformed-body`, which narrows it precisely: **the failing probe
matched its expected status and then returned a body that is neither HTML nor JSON.**

- Not a status mismatch, or the cause would be `canonical-route-absent` or
  `fixture-route-mismatch`.
- Not a transport failure, or it would be `ingress-unreachable`.
- **Not the SPA shell.** `replatform-route-parity.ts:137-139` checks `content-type` for
  `text/html` *before* parsing and throws a distinct message that maps to
  `ingress-html-shell`. That classifier was present in the run (`5e4fd449` is an ancestor
  of it) and did **not** fire. An empty body is the most likely remaining shape.

**I previously asserted here that the probe is `/health/live`, answered the SPA at 200 by
`try_files`. That is withdrawn — the cause code refutes it**, and it was inference from
reading the Nginx config rather than measurement. The honest state: six probes pass, one
of the canonical five returns a status-matching non-JSON non-HTML body, and **which one
cannot be determined from CI output alone** because the script prints only the category.

Settling it needs either the fixture running — impossible on this Windows host, see below —
or the owner's decision to let the probe path into the output, which is the redaction change
described further down.

*(Two corrections to earlier drafts of this section, both of mine, both from reading the
Nginx config instead of measuring. First: it said the config proxies "only one of the ten
probe paths" — wrong, six probes demonstrably pass. Second: it then named `/health/live`
and the SPA shell as the cause — withdrawn above, because the `ingress-html-shell`
classifier was live and did not fire. What survives is only that the config has no location
for `/health/live`, `/api/explorers/v1/*` or `/api/auth/*`, which is consistent with those
routes being absent but does not identify the failing probe.)*

The underlying cause is that `docker-compose.replatform.yml:56,106` starts
`EXPLORERS_API_MODE: legacy-music`, whose composition mounts neither Better Auth, nor
`/health/live`, nor the `/api/explorers/v1` owner routes. So fixing the ingress alone would
not help: the routes are not there to proxy to.

**How to clear it — and `route-graph-invariant.md` is explicit that the choice is the
owner's, not an engineer's.** One runtime cannot answer both probe sets: `/api/check`,
`/api/csrf-token`, `/api/user/reactivate` and the Strapi boundary are legacy-only, and the
canonical app serves none of them. The three options it lists are (1) flip the fixture to
`EXPLORERS_API_MODE: canonical` and retire the legacy six with the legacy server in step
12, which is the end state and a real package — canonical startup needs its own
environment and the existing fixture E2E lanes are built on legacy endpoints, so they move
with it; (2) run both graphs behind the one ingress during the transition, so both sets
pass honestly; (3) accept the red until step 12 reaches the fixture. Until one is chosen
the red is correct, and
[route-graph-invariant.md:72](route-graph-invariant.md) is explicit that reverting the probes
"restores the vacuous pass; it does not restore correctness" — so **do not** delete a probe,
lower `EXPECTED_PLATFORM_PROBE_COUNT`, or revert `b4975654`.

**Consequence for any PR:** this required check cannot go green on a branch, so a merge
needs the owner to accept a known-failing gate or to land the fixture change first. That is
a decision, not a bug to chase.

### My own wrong turn, recorded so it is not repeated

I spent a long stretch treating this as a flake. The error was comparing **different
workflows**: `gh run list --commit <sha>` returns several runs per commit, and the one I
read as a pass on `69e0d47f` was *"Music C0 contracts"*, a different workflow that does not
contain this job. The same commit's *"Music contract and qualification CI"* run failed.
**Always pass `--workflow` when judging whether a job's state changed.**

The diagnostic work that came out of it is still worth having, and is why the failure now
names itself instead of hiding behind one label: `phase=ingress-check` separates ingress
verification from the authority receipt (`44b00775`), and the cause set — including
`ingress-malformed-body` and `ingress-html-shell` — distinguishes "a route is not mounted
and the SPA answered instead" from "a body was truncated" and from "nothing was listening"
(`042a1f43`, `5e4fd449`). On a `legacy-music` fixture the expected cause is
`ingress-html-shell`.

### This cannot be reproduced on the Windows host

`provision` reaches `phase=postgres-start` and Docker refuses the bind:

    listen tcp4 127.0.0.1:51434: bind: An attempt was made to access a socket in a way
    forbidden by its access permissions

`netsh int ipv4 show excludedportrange protocol=tcp` lists **51342-51441** and
**51442-51541** as WinNAT/Hyper-V reserved. The fixture needs **51434** (its postgres) and
**51474** (the ingress the probes hit); both are inside excluded ranges, so retrying cannot
help. Remedies, all the owner's: reserve the two ports, move `PLATFORM_PORT` and the
published ingress port out of the ranges, or treat the fixture as CI-only here.

Two prerequisites if you do try it elsewhere: **`npm ci` at the repository root first** — a
fresh worktree has no root `node_modules`, so `npm run platform:local` resolves a *global*
`tsx`, loads `tunes/scripts/music-output-redaction.ts` as CommonJS, and dies on
`import.meta.dirname` being undefined before any Docker work; CI avoids it via
`test.yml:305`. And a refused `provision` leaves a created-but-never-started container that
`platform:local -- stop` will not remove (no valid receipt) — delete it by
`label=com.docker.compose.project=explorers-replatform-local`.

## `platform-fixture` had an EARLIER, different red: an external registry rate limit

**Dating matters here, so read the by-design section above first.** These failures are from
**before `b4975654`** (2026-10-08 14:44), the commit after which the job fails for the
route-invariant reason instead. The last success of that workflow was `91b6c99b` at 13:56,
so this section describes the window before it. A `cause=registry-rate-limit` seen *today*
would be a second, separate problem sitting on top of the intended red - and the phase
distinguishes them: `service-build` here, `ingress-check` there.

One caveat on this section's evidence, which I would not have spotted before making the
same mistake myself: "the same job passed on `5253fcb2` and failed on `c23614db`" was
established by comparing runs per commit, and `gh run list --commit` returns runs from
**several different workflows**. The conclusion is plausible for its window - the timestamps
precede the invariant commit, and `cause=registry-rate-limit` is a genuine distinct
classification - but if it ever needs re-checking, pass `--workflow`.

`platform-fixture` (and `music-required`, the aggregate gating on it) failed three times on
2026-10-08 with:

    Replatform local command refused or failed; phase=service-build; cause=registry-rate-limit

That is not a code defect and there is nothing to commit for it. Evidence rather than
inference: the same job **passed** on `5253fcb2` at 12:38 and failed on `c23614db` at 12:53,
and `c23614db` is documentation plus one standalone check script - nothing that pulls an
image. `scripts/replatform-local.ts:246` classifies the cause from
`toomanyrequests|rate.limit|429`, and the script reports and refuses by design rather than
retrying, which is why there is no retry to add.

Remedies, both the owner's: re-run the job once the limit resets, or authenticate the build
to the registry so pulls are not anonymous. If it becomes persistent rather than
intermittent, registry auth is the real fix and needs a secret.

## Verification commands

```bash
# frontend
cd explorers-earth && npx tsc -b && npm run build && node scripts/run-contained-vitest.cjs
# tunes (PowerShell)
cd tunes; npx tsc --noEmit; npx vitest run server/test/contracts
# tunes integration (PowerShell, needs the fixture container on 55432)
$env:MUSIC_C3_POSTGRES_TEST='1'; $env:MUSIC_C6_POSTGRES_TEST='1'
$env:DATABASE_URL_TEST='postgresql://music_migrator:music@127.0.0.1:55432/music_fixture'
npx vitest run --config vitest.integration.config.ts server/test/explorers-lifecycle.integration.test.ts
```

Last known good, measured 2026-10-09 on this branch after merging the base: frontend
**4549 tests / 324 files**, all passing; tunes `server/test/contracts` +
`server/test/explorers` + `server/test/publicProfile` **1469 passing / 86 files** with the
one known local-fixture load failure (`music-cli-contract`, missing `.env.music.test`); the
sixteen-file `database` list **122 passing / 8 skipped** on a **fresh** container.

**Do not read the frontend file count as a regression.** It was **325 / 4532** on
2026-10-08, and three test files were *added* on this branch - so the fall to 324 is the
base's wave-1 deletions: `7399cfe1`, `76224913` and `dfb16b35` removed 28 test files
between them when the claim flow and the AI features went. Tests rose because the
remaining files gained cases.

The previous figures, for anyone reconciling an older note: **4532 / 325** (2026-10-08),
**4502 / 320** before that, tunes contracts **1190**, lifecycle + recovery integration
**42/42** on a reset fixture database.
## "Named in no workflow" is not the same as "never ran" — 2026-10-09

A sweep found **34 of 52** tunes integration files named in no workflow, roughly 429
cases. The obvious conclusion — that they never ran — is **wrong**, and the correction is
the useful part of this section.

`tunes.yml`'s `build-test-scan-push` runs `npm run test:integration` with **no file
arguments**, and that script is `vitest run --config vitest.integration.config.ts`: every
integration file, inside its owned C10 container. A grep for file names across workflows
cannot see a no-argument run. **Before concluding a test is ungated, check for
argument-less runs, not just selector lists.**

The real gap is narrower and was worth closing:

| Workflow | Trigger | Integration reach |
|---|---|---|
| `tunes.yml` | `pull_request: branches: [main]` + path filter | all of them |
| `test.yml` | `pull_request: {}` — every PR, every base | only what the `database` job names |

So on a pull request to any base other than `main` — **the entire replatform branch
included** — or one touching none of those paths, `test.yml`'s `database` job was the only
lane executing integration files, and it named 16 of 52. It now names **48**.

Naming is the fix rather than a directory argument, because `tunes/vitest.config.ts:24`
excludes `*.integration.test.ts` from the default config.

### The two exclusions, and why they are not a backlog item

`explorers/games.integration.test.ts` and `games-public-gateway.integration.test.ts`
cannot run on this service **by construction**: `captureGamesOwnedPostgres` demands an
attested owned C10 container whose port equals `DATABASE_URL_TEST`'s, and
`scripts/music-qualification-postgres.ts:67` rejects 55432 as "the five-service fixture
port is reserved". A GitHub service container cannot attest a commit, container id and
image id. They run on the owned-container lane, which is the only lane that can.

### Measure the combination, not the files

`user-leak.integration.test.ts` was excluded as a third, on one failure with `immutable
external identity is tombstoned` from `enforce_music_identity_insert()`. It passes in
company with the other 47. The pollution was the two Games files throwing in `beforeAll`
alongside it. **A failure observed in a set is evidence about the set**, so the combination
that CI will actually run is the thing to measure: 48 files on a fresh
`postgres:15-alpine` gave 42 passed, 5 skipped (environment-gated), 630 tests, and one
failure that is `music-runtime-role` reading `whoami.exe /user` — a `process.platform ===
"win32"` branch that does not execute on `ubuntu-24.04`, where it is already gated and
already green.

## The root cause is base-branch targeting, not selector lists — 2026-10-09

Having found the integration gap twice, I measured every test category the same way. The
pattern is not about selector lists at all. **Every lane with broad reach is restricted to
`main` or `develop`, and this replatform branch targets neither.**

| Workflow | Trigger | What it runs broadly |
|---|---|---|
| `test.yml` | `pull_request: {}` — **every PR, every base** | only what each job names |
| `ci.yml` | `pull_request: branches: [main, develop]` | `npm run test:coverage`, the whole frontend unit suite, argument-less; plus 5 config-scoped e2e jobs |
| `tunes.yml` | `pull_request: branches: [main]` + path filter | `npm run test:integration`, every integration file, argument-less |
| `frontend-e2e-qualification.yml` | `schedule` + `workflow_dispatch` **only** | 13 e2e lanes; never runs on a pull request |

So on a pull request to `codex/unified-replatform`, the only lane that runs is `test.yml`,
and it runs exactly what it names. Measured reach on this branch:

| Category | On disk | Reached on this branch | Reached on a PR to `main` |
|---|---|---|---|
| tunes unit (`server/test`) | 176 | all (tree argument, fixed earlier) | all |
| tunes integration | 52 | **48** (fixed 2026-10-09; 2 Games by construction) | all |
| frontend unit | ~325 files / ~4554 tests | the `frontend` job's selectors + the 16-file critical-coverage gate | all, via `ci.yml` |
| frontend e2e | 36 specs | **3** | 3 + `ci.yml`'s 5 config-scoped jobs |
| repository script tests | 8 files / 232 cases | **all** (fixed 2026-10-09; was 0) | all |

That last row was the worst of them and the easiest to miss. Two of the eight files were
named in `tunes.yml` and the other six in nothing at all, so on this branch **none of the
232 cases ran**. Running them found an assertion in `scripts/replatform-e2e.test.mjs` that
could not pass *at any commit*: it truncated the manifest's prior lanes to 64 identities and
compared them against HEAD, which carries 68. The splices dated from when the working
manifest held identities the committed one did not; once both were committed the assertion
became unsatisfiable. Fixed in `cc7a3f30`, gated in `f8346611`.

**That one is gated by a glob, not a list** — `node --test "scripts/*.test.mjs"
"scripts/*.test.cjs"` — because a named list is precisely what went stale in the `database`
job's pinned selector. Prefer a pattern or a tree argument wherever the runner accepts one.

### What was done about it, and what was not

- **Frontend unit: broadened.** `test.yml`'s `frontend` job now runs the suite
  argument-less, consistent with what `contracts` and `database` already do. It needs no
  new service and `test:unit` takes no coverage gate, so the change is contained.
- **E2E: surfaced, not changed — and my first reason for that was wrong.** I wrote that
  several specs "need a PostgreSQL container and a built frontend". **They do not.**
  `ci.yml` has no `services:` block at all, and none of its five e2e jobs uses a database.
  Checked 2026-10-09; correcting it because it made the gap look technically blocked when it
  is not.

  What `e2e-category-a` actually needs is four steps - `npm ci`,
  `npm ci --prefix ../tunes --legacy-peer-deps`,
  `npx playwright install --with-deps chromium`, then `npx playwright test --config=...` -
  plus `CI`, `PLAYWRIGHT_PR_SAFE` and five `VITE_*` values. The configs carry no
  `globalSetup`; two of the five declare their own `webServer`. The root
  `playwright.config.ts` is no help for widening, incidentally: its `chromium-pr-safe`
  project matches `/\.spec\.ts$/` - every spec - so the real curation is the job's file
  arguments, not the project name.

  So the remaining blocker is **cost plus an existing deliberate choice**, not plumbing:
  `ci.yml` is scoped to `pull_request: branches: [main, develop]`, and five browser lanes on
  the universal lane means five more runners on every pull request to any base. Duplicating
  them into `test.yml` is the same decision as adding `codex/unified-replatform` to
  `ci.yml`'s branch list, just wearing a different hat - so it is recorded here rather than
  taken. **Owner decision, and a cheap one to execute either way.**

  Separately, `scripts/replatform-e2e.mjs` pins `scopeContents` to a hardcoded lane set, so
  the *milestone* lanes remain coordinator-allocated regardless of the above.
- **The base-branch lists themselves: surfaced, not changed.** Adding
  `codex/unified-replatform` to `ci.yml` and `tunes.yml` would restore full coverage for
  this branch in two lines, and it is the cleanest fix. It also changes two workflows this
  replatform does not own and multiplies CI cost for every PR to the branch. **Owner
  decision**, and the better one of the two if the branch is going to be long-lived.

## Ticket 3.4's analytics attestation is structurally owner-gated — verified 2026-10-09

`remaining-work-sequence.md` records 3.4 as "10 analytics identities authored, 0 attested",
and warns that adding the lane by hand would be falsifying an attestation record. Reading
`scripts/replatform-e2e.mjs` confirms it is stronger than a warning — **the validator
requires the obligation to stay pending:**

- `validateManifest` fails unless `pending.length >= 7` **and every entry's status is still
  `pending`**. Moving 3.4 out of the pending ledger fails validation rather than satisfying
  it.
- It also fails unless `manifest.scopeContents` **equals** `Object.keys(lanes)`, a hardcoded
  set that does not include analytics. A lane cannot be added to the manifest without
  changing the runner's own lane table.
- `assertEnvironment` fails if `PLAYWRIGHT_EXTERNAL_BASE_URL` is set, and
  `analytics-browser-fixture.ts` sets it from its own origin — so the analytics fixture is
  deliberately a *different* mechanism from this milestone runner, not a missing entry in it.

So the attestation can only come from the lane actually running, and it is registered at
`frontend-e2e-qualification.yml:126` — a **`schedule` + `workflow_dispatch`** workflow.
Scheduled runs execute against the default branch, so this branch's lane never runs.

**The one available action is an owner's `workflow_dispatch` of that workflow on this
branch** (or merging to `main`). Not taken here: it spends a 13-lane browser qualification
run, and this repository has already hit Actions billing limits once. It is not a code gap,
and no amount of local work closes it.

## Strapi is not a startup dependency of the canonical runtime — measured 2026-10-09

This correction matters because the opposite was being carried as fact, including by me:
that `app.ts:179`'s required `strapiOrigin` blocks epic 6's exit. **It does not.**
`server/app.ts` and `server/routes/index.ts` are **not in the canonical closure** —
`canonicalStartup.ts` builds the app through `canonicalApp.ts` and never imports either. So
that requirement belongs to the legacy runtime, which the cutover retires anyway.

Nothing on the canonical startup path requires a `STRAPI_*` variable. The scan's three
allowlisted env reads are the complete set inside the closure, and none can fail startup:

| Read | Why it cannot fail startup |
|---|---|
| `security-containment.ts` → `STRAPI_JWT_SECRET` | Inside `verifyStrapiToken`'s body. Its only caller is now `security-containment.ts:241`, its own legacy bearer path (the legacy `jwt-auth-middleware` was deleted 2026-10-09). |
| `explorers-analytics-composition.ts` → `STRAPI_URL` | `process.env.STRAPI_URL \|\| ""` — defaults, never throws — inside `createLegacyExplorersAnalyticsDependencies`, reached only through a **lazy dynamic import** at `explorersCanonicalAnalyticsRoutes.ts:14` (`legacy ??= import(...)`, named `historical`). |
| `music-local-profile.ts` → `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE` | A local fixture profile constant. |

### So what Strapi retirement actually still depends on, in full

Three things, not one vague blocker:

1. **The legacy runtime** — `app.ts`, `routes/index.ts` and everything only they reach.
   Retired by the `EXPLORERS_API_MODE` cutover. This is the bulk of it, and the cutover is
   the owner decision recorded in `route-graph-invariant.md`.
2. **The lazily-imported historical analytics path** in `explorersCanonicalAnalyticsRoutes.ts`.
   This one is *inside* the canonical runtime, so the cutover does not remove it. Whether
   historical analytics must keep reading from Strapi, or can be served from
   `analytics_receipts` alone, is a **product question** — small, concrete, and nobody has
   asked it.
3. **`security-containment.ts`'s own legacy bearer path**, which is the sole remaining
   caller of `verifyStrapiToken`. Dead once (1) lands.

Which means Strapi retirement is **not** blocked on anything unknown. It is blocked on the
cutover plus one bounded product question about historical analytics.

## Ticket 3.4 has TWO halves, and only one is owner-gated — mapped 2026-10-09

I had been recording 3.4 as "the attestation needs a `workflow_dispatch`", which is true and
incomplete. Tracing the last Strapi dependency inside the canonical runtime led straight
back to it, so here is the whole shape.

### Half one: the attestation (owner-gated, proven)

`scripts/replatform-e2e.mjs`'s `validateManifest` fails unless `pending.length >= 7` with
**every entry still `pending`**, so editing the manifest cannot satisfy this - it breaks it.
The lane is registered at `frontend-e2e-qualification.yml:126`, a schedule-plus-dispatch
workflow whose scheduled runs target the default branch. Only an owner `workflow_dispatch`
on this branch produces the receipt.

### Half two: repoint the dashboard (open engineering, NOT owner-gated, NOT mechanical)

`GET /api/explorers/analytics/events` is the **last live Strapi dependency inside the
canonical runtime**. It is the only route guarded by `authorizeOwner`, which resolves
through a lazy `import()` to `verifyAnalyticsAccountOwnership` - a **Strapi JWT check on the
`Authorization` header**. The frontend calls it from `readExplorersAnalyticsEvents`, used by
`AnalyticsDashboard.tsx` and `pages/Home.tsx`.

A canonical user has no Strapi JWT, and the dashboard already handles that honestly:
`detailedAnalyticsUnavailable = isAuthenticated && !token` renders an `unavailable` state
rather than claiming "no analytics yet". **So this is a known degradation, not a defect -
but it does mean canonical users currently see no detailed analytics.**

The remedy named in the code is to repoint at the canonical
`GET /api/explorers/analytics/summary`, which exists and works
(`AnalyticsService.getCreatorAnalytics` behind `requireActor`). It is not a URL swap,
because the shapes are different in kind:

| | legacy | canonical |
|---|---|---|
| payload | `events[]`, raw, aggregated client-side | `AnalyticsSummary` - `totals`, `daily[]`, `dimensions` |
| granularity | every event | `views`/`clicks`/`interactions` per bucket |
| dimensions | whatever the events carry | exactly `page`, `category`, `country`, `trafficSource`, `element`, `platform`, `collection`, `recommendation` |
| completeness | all rows | buckets are **truncated**, with an `other` catch-all |

Nine frontend modules consume `AnalyticsEvent` directly, including `ContentEngagementChart`,
`GuidesChart`, `LocationEngagementChart`, `MediaItemChart`, `MediaItemsInListChart`,
`MediaListEngagementChart` and `PageViewsTrendChart`.

**The design question, which is the actual blocker and is small enough to answer in a
sitting:** can every existing chart be rebuilt from eight truncated dimensions plus
`totals`/`daily`, or do some charts change shape? `MediaItemsInListChart` is the one to
check first - per-item-within-list granularity has no obvious canonical dimension, and
bucket truncation plus `other` means a long tail cannot be reproduced exactly.

Answer that and half two is ordinary engineering. It needs no acknowledgement, no
credentials and no CI spend - unlike half one.

### Half two's design question, answered 2026-10-09

I left this as "can every chart be rebuilt from eight truncated dimensions?" It is
answerable by reading the charts, so here is the answer. Thirteen consumers, three groups.

**Group A — repoint with no contract change (5).** They read only fields the summary already
carries (`type` → counts, `timestamp` → `daily`, `page`, `country`, `utmParams` →
`trafficSource`):
`PageViewsTrendChart`, `TopCountriesChart`, `TrafficSourceChart`, `WorldMapChart`, and
`AnalyticsDashboard` itself.

**Group B — map onto existing dimensions (5).** Each reads `metadata` keys that correspond
to a dimension the contract already has:

| Chart | `metadata` keys | Canonical dimension |
|---|---|---|
| `SocialMediaInteractionChart` | `platform` | `platform` |
| `ContentEngagementChart` | `id`, `title`, `originalElement` | `recommendation` + `element` |
| `MediaItemChart` | `id`, `title`, `originalElement` | `recommendation` + `element` |
| `MediaItemsInListChart` | `id`, `listName`, `title`, `originalElement` | `recommendation` + `collection` |
| `MediaListEngagementChart` | `listName`, `originalElement` | `collection` + `element` |

**Group C — need data the contract deliberately does not carry (3).** This is the whole of
the remaining decision:

| Chart | Needs | Canonical gap |
|---|---|---|
| `LocationEngagementChart` | `cityname`, `url` | **city-level geography**; the contract has `country` only |
| `RecommendedPlacesChart` | `cityname`, `placeName`, `category`, `url` | same city gap (`category` is covered) |
| `GuidesChart` | `guideType` | guide **subtype**; `category` carries only `guides` |

Two useful negatives, both measured rather than assumed:

- **No chart needs sub-daily granularity.** Every one of the thirteen aggregates by day or
  coarser, so `daily[]` is sufficient on the time axis.
- `metadata` is the only blocker, and it is deliberate: `shared/explorersContract.ts` says
  the boundary "intentionally has no arbitrary JSON field". Group C is not an oversight,
  it is that decision meeting three charts.

**So the decision is narrow: add a `city` dimension (and a guide-subtype) to
`AnalyticsDimensionKey`, or accept that those three charts change shape.** Everything else
is ordinary porting. Note also that buckets are truncated with an `other` catch-all, so the
per-item charts in Group B will show a long tail differently even once ported - worth
deciding deliberately rather than discovering in review.

## OWNER DECISIONS TAKEN, 2026-10-09

Two of the open decisions in this handoff were put to the owner and answered. They are
decisions now, not questions — treat them as settled unless the owner reopens them.

### 1.2 / `platform-fixture`: leave it red, accept it at merge

Full record in `route-graph-invariant.md`. `platform-fixture` and `music-required` stay
failing deliberately; merging #121 means accepting one known-failing required check. **Do
not attempt to green it** — every route to green either deletes a probe or lets fixture and
production startup diverge, and both were priced and declined.

### 3.4 half two (dashboard repoint): leave the port for later

The owner chose to keep the current behaviour over both porting options. So:

- Canonical users continue to see the honest `unavailable` state in the Analytics dashboard
  (`detailedAnalyticsUnavailable = isAuthenticated && !token`). **That state is now
  intentional and supported — do not "fix" it as a bug.**
- `AnalyticsDimensionKey` is **not** gaining a `city` dimension or a guide subtype.
- `GET /api/explorers/analytics/events` and its Strapi JWT `authorizeOwner` check therefore
  remain the last live Strapi dependency inside the canonical runtime, and they stay.
- The 13-consumer mapping above stays as the plan for whenever this is picked up: 10 port
  within the existing contract, 3 need the contract extended or must change shape.

### Still open, and still owner-gated

CI spend for the e2e lanes and the 3.4 attestation dispatch; the
`TASK4_FIXTURE_OWNED_DISPOSABLE_PG15` acknowledgement; the `strapiIdentityAbsenceProof`
grant; D3/D5; legal copy; hosted QA credentials.

