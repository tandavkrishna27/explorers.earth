# Replatform reconciliation — 2026-10-15

Current status entry point. Supersedes current-state claims in
`reconciliation-2026-10-09.md`; that document remains historical evidence and its
requirement text still stands where this file does not contradict it.

## Source custody

| Tree | SHA | Custody |
|---|---|---|
| Integration, `codex/unified-replatform` | `88a72cbe` | Clean local worktree. **373 commits ahead of `origin/codex/unified-replatform`, none pushed.** |
| Remote integration head | `622f6893` | PR #119, still a **draft** to `main`. Remote CI reflects nothing in this entry. |

15 commits were added on 2026-10-15. No push, no force-push, no PR state change, no
merge, no deploy, no production or Strapi mutation.

## Gates closed, with receipts

| Gate | Result | Commit | Receipt |
|---|---|---|---|
| Places/pins PG128 | 128/128, zero non-passed, `sourceIntact: true`, cleanup clean | `f1efcd1f` | `receipts/places-p1-pg128-f1efcd1f/` |
| Apps provider/scheduler PG8 | 8/8, `appsLocalProviderQualified: true`, `failureReasons: []` | `f1efcd1f` | `receipts/apps-provider-pg8-f1efcd1f/` |
| Public parity 32 | 32/32 identities, 0 errors, 0 retries, 0 skips, probe-free source | `abcfe666` | `receipts/wave2-public-parity-abcfe666/` |

Both PG gates required an operator-supplied reviewed-source attestation and received
one after independent review of the delta. Receipts are sanitized derived summaries
that hash the original rather than copying it.

`p1Closure` remains `false` by the runner's own design: dedicated PG evidence is not
overall P1 closure.

## Gate open

**Guides 16** — case 4 fails, and it is not a single defect. Five distinct failure
points across roughly fourteen protected runs at effectively identical source, with one
phase observed failing, passing, then failing again. Full evidence, the elimination
list and the recommendation to split the case are in
`guides-case4-instability-2026-10-15.md`.

## Integrated 14-lane / 214-identity run — NOT ATTEMPTED

It has never been run to completion in this project. It is zero-retry, and three
identities are now known-intermittent on identical source: Guides case 4, public parity
case 10 and public parity case 27. A single execution must clear all of them, so
individual lane passes do not predict it.

The shared mechanism behind the two public cases is recorded in the public parity
receipt README: `PublicColdEntryBoundary` gates visibility on a readiness triple, any
single failed read renders `NotFound`, nothing on that path retries, and the browser's
read abort and the Playwright assertion budget are both exactly 15000ms. `abcfe666`
pre-warms case 10 only; the shared bound is unrepaired.

## Ticket mapping against the pending ledger

| Ticket | Pending-ledger obligation | 2026-10-15 position |
|---|---|---|
| 5.1 / 5.2 | Places/link16 inventory awaits independent review and protected execution; provider photo/gallery closure, taxonomy/pins and hosted acceptance pending | **PG128 closed.** Places16 browser lane, provider photo/gallery, taxonomy and hosted acceptance still open |
| 5.3 / 5.4 | Apps manual8 awaits integrated owned fixture and protected native execution; provider enrichment, taxonomy, complete public pagination pending | **PG8 closed** (real outbound, scheduled producer). Apps browser lane and the rest still open |
| 5.5 / 5.6 | Guides complete16 awaits reviewed clean exact-head discovery and protected owned native execution; Public32 and new feature acceptance pending | **Public 32 closed.** Guides 16 open per the instability record |
| 2.4 | Configured deployed Google callback and consent evidence | Untouched |
| 3.4 | Analytics acceptance | Untouched; producer attestation remains an obligation, dashboard deliberately deferred |
| 3.5 | Unified QA deployment, image/schema and trusted producer evidence | Untouched |
| 4/5 | Remaining canonical category producer families | Untouched |
| 6.1–6.3 | Music mapped-owner HTTP/socket and feature parity | Untouched |
| 7.1 / 7.2 | Cross-category consumers and all nine categories | Untouched |
| 8.1–8.4 | Removal, rename, exact QA digest promotion, deployment | Untouched |

## Wave 3 — repair landed locally, NOT CI-verified

`88a72cbe` adds a `combined` API mode plus the canonical delegate and the nginx
locations. It corrects the recorded cause, which covered only the startup half: at
nginx, `/health/live` fell through to the SPA shell and the four `/api` probe paths were
proxied to Strapi, which 404s that prefix in the fixture, so all five probes would have
failed even with a perfect container composition.

Not verified and not claimed: that `platform-fixture` passes. There is no Docker or
nginx binary in this environment, so no container was built or probed, the nginx config
was never parsed, combined startup never booted against a real database, and the five
probe bodies were never observed through the real stack. **Only CI on a pushed head can
establish this.**

## Branch-only product defects, pre-merge

`media_assets` does not exist in `main`'s schema, and `mediaRepository`,
`postgresPublicProfileGateway` and `objectStorage` are branch-only, so none of these
affect production today. They ship broken if merged as-is. See
`open-gaps-media-attachment-2026-10-14.md`.

1. Places owner uploads route to generic `recommendation_media`, which the public gate
   resolves only for books/movies/games — owner sees the photo, public does not, bytes
   404.
2. `updateRecommendation` accepts `mediaIds` for apps/places/products/people; products
   and people have no typed media table at all.
3. Pinned nav tab ids — **fixed** at `29659358`.

Storage note: `objectStorage` has S3 for qa/prod and local disk otherwise, but the
bucket is private and the server is the only byte-delivery authority, so S3 never
bypasses the visibility gate.

## Outstanding owner decisions

1. **Push authorisation.** Nothing in these 15 commits is CI-verified and cannot be locally.
2. **Combined-mode body limit.** `app.ts` rejects declared bodies over 64KiB with the
   Music envelope before the canonical delegate runs, while canonical allows 1MiB on
   `/api/explorers/v1/(recommendations|collections)`. A canonical write between those
   bounds succeeds in production canonical and is refused in combined mode.
3. **Intermittency policy.** Split Guides case 4, or formally exclude known-unstable
   identities from the integrated run and record the exclusion.
4. **Places photo cap** (typed 10 vs generic 20) and whether products/people should ever
   carry item-level media.

## CI green-up pass — 2026-10-15, after the first real CI run

The first CI run on this chain (head `5f98ed0c`) produced **16 distinct failing checks**.
Four parallel investigations, then two adversarial reviews of the resulting plan, then
execution. 13 commits.

**Attribution, established rather than assumed.** None of the 16 came from the 15 commits
made on 2026-10-15. Three investigations re-ran the failing tooling at `d0194a7e` — the
commit immediately before them — and got identical results; the fourth showed the two
genuinely new failures (`platform-fixture`, `build-test-scan-push`) trace to other commits
inside the same 374-commit push. The honest summary is that 358 unverified commits met CI
for the first time.

### Measured before and after, in a clean worktree at `5f98ed0c`

| Suite | Baseline at `5f98ed0c` | After this pass |
|---|---|---|
| `explorers-earth` ESLint | 251 errors / 1858 warnings | **0 errors** / 1858 warnings |
| tunes `server/test` (286 files) | 24 failed files / 96 tests | **7 failed files / 84 tests** |
| root `scripts/` seal tests | 29 failing | **2 failing** |
| `explorers-earth` unit lane | 390 files / 5322 tests | unchanged, all pass |
| Playwright lanes (5) | 2 failing, 3 green | **all 5 green** |

The 7 remaining tunes files and the 2 remaining seals are all present in the baseline's
failures; `comm` against the baseline list shows **no file failing here that was not already
failing there**. The 7 are local shell artifacts, not code: Git Bash shadows `whoami.exe`
with POSIX `whoami`, `npm_execpath` is unset outside `npm test`, and a Windows SID lookup is
unavailable. CI is the arbiter for those.

### Three regressions of my own, found and removed

Diffing against the baseline rather than trusting "everything red is pre-existing" caught
three self-inflicted failures: explanatory comments placed inside a `run: |` block are script
content, not comments, so `music-migration-contract`, `music-image-ci-tests` and
`music-reconciliation-workflow` saw six commands where they pin exactly two. Fixed by moving
the install into its own step, leaving those three deliberate pins untouched.

Two earlier lint fixes also edited protected source and broke frozen-source seals
(`({}, info)` → `(_, info)`, and removing a `no-useless-catch` clause that is part of a frozen
printed callback body). Both reverted; where a seal and a cosmetic lint fix conflict, the
seal wins.

### The one genuine product bug

`prepareAppWorkerCustody` queried `pg_shdepend` — a cluster-shared catalog — without its
`dbid` column, so once migration `0056` had created its GRANTs and function ownerships in one
database, every later database in the same cluster refused with `Unsafe Apps worker existing
object authority`. The `database` lane creates a fresh database per test, hence 15 files and
26 tests aborting at `migrate.ts:260`. Proven against a disposable `postgres:15-alpine`
matching the CI service: **26/26 pass with the predicate, 26/26 fail with it reverted**.
`dbid = 0` stays admitted so shared-object authority still fails closed.

Fixing it unmasked a second cause in the same lane that the guard had been hiding by aborting
every case first: the 0035-to-analytics case compared `SELECT *` captured below migration 0036
against the table after the chain reached 0056, where `0054` adds `places_last_mutation_xid`.

Correction to this document: **Docker IS available in this environment.** The Wave 3 section
above says otherwise, which is why the PG proof had been considered impossible.

### Still not claimed

`platform-fixture`'s five canonical probes have **never executed on this branch**. At
`622f6893` the job reached `phase=ingress-check`; at `5f98ed0c` it died earlier at
`phase=service-build`, because `tunes/shared/explorersPublicPeopleSectorContract.ts` was
missing from the generator's entry points, from both generated `.dockerignore` allow-lists
(`tunes/shared/*` is default-deny) and from the Dockerfile COPY list. That is repaired and
guarded by a new root-`scripts/` test, but **restoring the build says nothing about whether
the probes pass**. If they fail, that is Wave 3's first real result. A build that merely gets
further is not a passing fixture.

Also unchanged: the specs under `e2e/replatform/` are executed by no PR or push job — only by
`frontend-e2e-qualification.yml`, on a schedule — so that work remains CI-unverified by
design, which is equally why it cannot have broken CI.

### Follow-ups recorded, not silently absorbed

1. `PublicGuideDetailPage.tsx:61` drops an **entire guide section** when a single place fails
   validation. Per-place rejection is deliberate and unit-tested; the whole-section
   amplification probably is not. Test fixture fixed; production behaviour untouched.
2. Two `no-unsafe-finally` sites in `apps.spec.ts` are genuinely unguarded — a cleanup failure
   can replace an in-flight failure. Annotated; changing that control flow needs the Apps
   protected lane, which no CI job runs.
3. The fixture-guard bootstrap budget was raised 1000ms → 5000ms **and its companion
   assertion and title updated to match**, on an explicit owner decision. It is a latency
   bound, not one of the five protected probes.

## 2026-10-16 — guides seal, and the media-gate finding that reframes "task 4"

### guides-native-diagnostic has two independent causes; one was mine

Mine: commit 5f6c72eb put explanatory comments inside the empty catch blocks of
`explorers-earth/e2e/replatform/guides.spec.ts` to clear `no-empty`. The seal matches that
instrumentation with regexes requiring a literally empty catch
(`guides-native-diagnostic.test.ts:92`), so the census collapsed and both fingerprint assertions
returned `undefined`. Fixed in 91062b0d by restoring the file to its 5f98ed0c bytes and
suppressing the three rules at file scope.

CORRECTION (2026-10-16). An earlier revision of this section carried two mutually inconsistent
sets of census figures: a "collapsed from" set (20 / 14 / 14 / 16) and a "re-measured at base" set
(18 / 19 / 6 / 2 / 13). The first set was unsourced and is withdrawn — no recorded measurement
produces it. The method also mattered and was not stated: the seal counts AST NODES
(`producerStageWiringNodes(ast).size`, `passive.size`, `primaries.size`, `guards.size`), not
substring occurrences, so a `grep -c` over the spec yields a third set again (at 5f98ed0c:
markProducerStage 9, markTraversalOperation 11, markSectionOperation 7, markOwnerListOperation 7,
markTipOperation 9) and must not be compared against either. The load-bearing fact, which is
independently verifiable, is that the seal's census and shape gates PASS at the restored bytes;
the two failures come from the per-function hash gate alone.

Pre-existing: at those restored baseline bytes the seal still fails the same two assertions.
`trackGuideReads` and `assertOwnerCategoryReads` mismatch their pinned per-function hashes on the
base commit as well; re-recording just those two makes the fingerprints compute but disagree
(`60303d9d...` vs pinned `628f2d2d...`, `48797682...` vs pinned `f47a0fc3...`). The pin stores an
opaque hash and no expected source, so there is nothing to diff against and a re-record cannot be
made auditable. **Owner decision needed:** rewrite the seal to pin reviewable source, or retire it.

### Owner media uploads are publicly unserveable for products and people

`tunes/server/application/profiles.ts:10` treats `products` and `people` as public profile
categories. The media visibility gate at `tunes/server/repositories/mediaRepository.ts:101` admits
only `r.category IN('books','movies','games','apps','places')`, and its inner clause
(`:102`) serves generic `recommendation_media` rows only for `books`, `movies`, `games`.

`replaceMedia` (`explorersRecommendationRepository.ts:57-59`) writes generic rows without
`required_category` for every category, and the live owner UI routes user uploads there for all of
them — `AddProductPage.tsx:124`, `AddPersonPage.tsx:137`,
`useAddRecommendation.ts:325` (non-provider place photos), `appsClient.ts:62`.

So owner-uploaded photos are stored and shown back to the owner
(`placesViewModel.ts:91-92`) but cannot be served publicly.

The original plan proposed refusing `mediaIds` for the categories the gate cannot serve. That is
wrong in both forms considered: refusing the complement of `{books,movies,games}` deletes the
working Places and Apps upload flow, and refusing `{products,people}` deletes the working Product
and Person upload flow. No category can be refused, because every category uses this path.

The correct fix widens the gate. **Not done here, by design** — this is a public visibility
boundary and widening it is an owner decision, not a cleanup. Decide: (a) add `products`/`people`
to the category list and generic rows to the inner clause, (b) route owner uploads into the
per-category tables that already carry `required_category`, or (c) accept that owner uploads are
owner-only for these categories and stop collecting them in the public projection.


## 2026-10-16 — corrections to this session's own claims

Three claims made in commit messages on this branch today were wrong. Commit messages on a pushed
branch cannot be amended, so they are corrected here.

1. "root scripts/ seals 570/570, which covers the browser baselines that list this spec"
   (commit 3de9ddfe). FALSE. `scripts/browser-source-inventory.test.mjs:19-20` reads
   `browser-baselines/*.json` and checks them for INTERNAL consistency
   (`digest(snapshot.portable) === current.provenance.sourceHash`); nothing in that lane hashes the
   working tree. Proof: `source-v3.json` pins `public-shell-continuity.spec.ts` at byteHash
   `0a089bed…` while the file already hashed `532eb5c9…` at `ad20c4c1`, before this session began.
   The seals are green and that is worth having; they simply do not attest those bytes.

2. "under 69 specs of parallel load" as the mechanism for the e2e flake (commit 3de9ddfe). FALSE.
   `playwright.category-navigation.config.ts:6` sets `workers: 1, retries: 0`, so that lane is
   SERIAL and 69 is its serial test count. The same comment also cited a 90s test budget from
   `playwright.config.ts:17`; in CI the spec runs only under
   `playwright.music-publishing.config.ts`, whose budget is 60s. Both errors are corrected in the
   spec's own comment. The measured cause remains unknown: at 741068bd the failing run took 19.65s
   for that test (12.0s of it the expect timeout, so a ~7.6s prologue) while the passing twin took
   7.94s end to end. The 30s window is a mitigation, not a fix.

3. "its bytes are hash-sealed into the replatform e2e provenance", said of
   `tunes/scripts/music-local-private-files.ps1` while deferring the Windows owner-check decision.
   OVERSTATED. `scripts/replatform-e2e.test.mjs:1130` asserts only that
   `snapshot.hashes['tunes/scripts/music-local-private-files.ps1']` is TRUTHY, and the hash is
   computed from the working tree at `scripts/replatform-e2e.mjs:538`. This session changed that
   file's bytes twice with the 570 seals still green. The owner-decision reason for deferring a
   `ValidateRoot` change stands on its own; the hash-seal reason does not and is withdrawn.

Also recorded: the stderr diagnostic added in db181e9a documented a 4 KiB cap it did not hold.
Measured, one 64 KiB pipe chunk arriving at 4095 bytes retained 69,631 bytes. The cap now
truncates and is byte-counted. The first fix attempted for it — rejecting any chunk that would
exceed the cap — was itself wrong: it retained NOTHING when a child writes its whole stderr in a
single large write, which is the exact blindness the capture exists to cure.
