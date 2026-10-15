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
