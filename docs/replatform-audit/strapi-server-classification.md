# Server-side Strapi classification — ticket 8.1a

**2026-10-08.** Step 10 of [the sequence](remaining-work-sequence.md). Classifies every Strapi
reference under `tunes/server` and `tunes/shared` as live consumer, retirement-policy surface
that stays, legacy-path code that step 12 deletes, or dead text.

Measured at commit `5253fcb2`, with the inventory regenerated at that SHA into
[`source-inventory.json`](source-inventory.json) as the ticket requires. Every count below
is reproducible from the commands in the last section; none is prose arithmetic.

## The headline, and why it is not "we are done"

**No reachable canonical path touches Strapi, and the canonical server requires no
`STRAPI_*` variable to boot.** 8.1a's exit gate — "canonical startup with no `STRAPI_*` variable set and with
outbound Strapi access denied" — holds at source level today, and the work left to close the
ticket is **evidence and configuration, not porting**:

- **the first draft of this document said "constructs no Strapi client", and that is false.**
  The static scan built in the same pass immediately found two —
  `new StrapiAnalyticsPublisher` and `new StrapiAnalyticsTargetValidator`, at
  `services/explorers-analytics-composition.ts:76` and `:79`. Both sit inside the dead
  legacy analytics factory described in section D, and constructing them is inert (neither
  touches the network until a method is called), so the corrected claim is about
  *reachability*, not absence. Worth recording: the flat claim survived manual enumeration
  and was caught by a mechanical check within minutes of existing, which is the argument for
  the check;
- the three compose files still declare `STRAPI_*` with the `${VAR:?… is required}` form, so
  *deployment* still fails closed without them even though the *application* does not need
  them — and loosening that is an owner decision, not a config tidy-up (see the last section);
- one runtime Strapi call survives in the canonical closure, and it is **dead behind a token
  canonical auth never sets**. That deadness is load-bearing for the headline, so it is
  documented in full below rather than asserted.

## Denominator

| | Count |
|---|---|
| Non-test runtime modules under `tunes/server` + `tunes/shared` | **210** |
| …that mention `strapi` in any form | **56** |
| …mentioning it **only in comments** (not a runtime dependency) | **7** |
| …with at least one code reference | **49** |

The inventory's `STRAPI_REFERENCE` tag matches `/Strapi|strapi|…/` anywhere in a file,
comments included, so its 50 + 3 is an upper bound and **not** the acceptance denominator.
The ticket's own gate says it: "an unused text match is not a runtime dependency." Each line
here is split into code or comment with block and line comments blanked first.

The second axis is reachability, which is the one that actually decides disposition: the
static import closure of the canonical entrypoint `server/auth/canonicalStartup.ts` is
**118 modules**, resolved with zero unresolved relative specifiers. Of the 49 files with code
references, **18 are inside that closure and 31 are outside it**.

## Disposition

### A. Comment-only — 7 files, no action

`application/guides.ts`, `publicProfile/publicGuidesProjection.ts`,
`publicProfile/publicPlacesProjection.ts`, `publicProfile/publicProfileContract.ts`,
`repositories/guideRepository.ts`, `routes/explorersMusicIdentityRoutes.ts`,
`shared/explorersGuideContract.ts`.

Each mentions Strapi once or twice in prose, mostly to say the canonical projection replaces
it. These are the files a `grep -l strapi` count inflates by.

### B. Legacy identity-mapping columns — the bulk of the volume, and it is data

The single largest reference count in the tree is
`repositories/musicIdentityRepository.ts` at **221 code references**, and essentially all of
them are the column and field names `strapi_user_id`, `strapi_user_document_id` and
`strapi_account_document_id` (plus their camelCase DTO forms). The same pattern accounts for
most of `shared/schema.ts` (25), `config/music-identity-config.ts` (34),
`repositories/reconciliationRepository.ts` (61) and the remaining in-closure files.

**These survive Strapi's retirement untouched.** They are the stored mapping from a canonical
account to the legacy identity it was migrated from — data about a retired system, not a
dependency on it. Renaming them is the mechanical job in **8.3**, strictly after 8.1 and 8.2,
and is optional even then. Counting them as retirement surface is what makes this ticket look
ten times larger than it is.

### C. Inside the canonical closure — 18 files, 0 live Strapi clients

Beyond the category-B column names, the closure contains exactly **three** `STRAPI_*` env
reads and **one** Strapi-named module. All four were run down individually:

| Site | Evidence | Disposition |
|---|---|---|
| `security-containment.ts:37` `verifyStrapiToken` reads `STRAPI_JWT_SECRET` | Read is **inside the function body**, so it cannot fail startup. Callers are `jwt-auth-middleware.ts:20` — **outside** the closure — and `security-containment.ts:241` | Legacy bearer verification, not canonical. Note `rejectLegacyBearerOwner` already refuses to let a verified Strapi identity authorize a Music owner |
| `services/explorers-analytics-composition.ts:72` reads `STRAPI_URL` | Inside `createLegacyExplorersAnalyticsDependencies()`. The canonical factory beside it, `createExplorersAnalyticsDependencies()`, delegates to `createCanonicalAnalyticsDependencies(pool)` and touches no Strapi | Reachable, but only through the dead read below |
| `config/music-local-profile.ts:166` reads `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE` | Optional (`!== undefined` guard), and the file is the local/fixture profile | No action |
| `services/strapiIdentityGateway.ts` is in the closure | The **only** construction of `StrapiIdentityGateway` anywhere is `routes/index.ts:84`, which is **outside** the closure. Inside it, the module is imported for `fingerprintStrapiProof` (a bare sha256) and `cancelResponseBody`/`readBoundedResponseBody` (generic `Response`-body helpers, also used by `youtubeReadService.ts`) | **Filename only.** Pure functions with an unfortunate home; move them to a neutral module during 8.1b/8.3 and the closure's last Strapi-named file disappears |

And the startup requirement itself, at source: `resolveCanonicalMusicTokenConfiguration`
(`config/music-identity-config.ts:108`) requires `MUSIC_MODE` and the token configuration
only. It is `resolveMusicIdentityRuntimeConfig` (`:123`) that calls
`parseOrigin(environment.STRAPI_URL, "STRAPI_URL")` and hard-requires the origin — and that
is the **legacy** resolver. This confirms the sequence doc's earlier correction that
`app.ts:179` was the wrong API to call the epic-6 exit blocker.

### D. The one runtime Strapi call in the canonical closure — dead, and hiding a defect

This is the only place where a canonical request could reach Strapi, so it is traced in full.

`routes/explorersAnalyticsRoutes.ts:328` serves `GET /api/explorers/analytics/events`. At
`:335` it calls `dependencies.authorizeOwner`, and in the canonical dependency set
(`routes/explorersCanonicalAnalyticsRoutes.ts:14`) both `authorizeOwner` and
`readAccountEvents` `await historical()` — a lazy dynamic import of
`createLegacyExplorersAnalyticsDependencies()`. That reads `process.env.STRAPI_URL || ""` and
calls `verifyAnalyticsAccountOwnership` (`services/explorers-analytics-adapters.ts:500`),
which does:

```
fetchImpl(`${stripTrailingSlash(strapiUrl)}/api/users/me?populate=accounts`,
          { headers: { Authorization: authorization } })
```

So a canonical analytics read authorizes the owner **against Strapi**, with the caller's
bearer. With `STRAPI_URL` unset that URL is relative and `fetch` throws, so it fails rather
than degrading.

**It is unreachable.** The route's only client is
`explorers-earth/src/services/explorersAnalyticsClient.ts:169`
`readExplorersAnalyticsEvents`, which throws unless `scope.token` is set; its two callers,
`AnalyticsDashboard.tsx:190` and `Home.tsx:346`, both guard on `!token` first. That token is
`useAuthStore().token`, and in `store/store.ts` the canonical verification path
`acceptVerified` sets **`token: null` explicitly** (`:76`). The only action that ever sets a
token is `login(data)` (`:119`), and **nothing outside tests calls it** — it is the retired
Strapi email/password path. So `token` is permanently null, the guard always short-circuits,
and no request is ever made.

Which means the headline holds — but two things follow that are worth more than the
retirement note:

1. **The analytics events panel is permanently empty, and silently so.** The `!token` branch
   at `AnalyticsDashboard.tsx:190-203` sets `analyticsLoading(false)`, `analyticsError(null)`
   and empties both record arrays. No error, no spinner, no explanation — the creator sees an
   empty panel and nothing to suggest it is broken. The two charts migrated in step 7 read
   canonically and do work, which makes the dead panel easier to miss, not harder.
2. **The canonical replacement already exists and has no caller.**
   `routes/explorersCanonicalAnalyticsRoutes.ts:30` registers
   `GET /api/explorers/analytics/summary` behind `requireActor` — proper canonical actor
   authorization, no Strapi, no bearer token — and a repo-wide search for it in
   `explorers-earth/src` returns **nothing**. The frontend is pointed at the dead legacy route
   while the live canonical one goes unused.

That is a **ticket 3.4 defect**, not an 8.1a one, and fixing it is the thing that makes this
Strapi call deletable rather than merely unreachable. Filed here because this is where the
measurement happened.

**The false statement is fixed; the repoint is scoped below and not done.** Those are two
different jobs and only the first was decision-free:

- Fixed 2026-10-08. The panel no longer renders "No Analytics Data" and
  "No analytics data found for your account" to an owner whose data simply cannot be read,
  and it no longer offers the "share your QR codes to start seeing analytics" advice, which
  addresses a problem they do not have. It reports the detailed read as unavailable, says
  explicitly that this does not mean their pages had no visitors, and reaches no network to
  say it. It is deliberately **not** an `error`: there is no failure to surface and nothing
  to retry. `pages/Home.tsx:346` already modelled exactly this as its own `unavailable`
  state, so this mirrors a pattern already on the branch rather than inventing one.
- **How this hid in a green suite, which is the part worth carrying forward.**
  `AnalyticsDashboard.test.tsx`'s `beforeEach` seeds `token: 'private-user-token'` — a
  credential production never issues. Every existing test therefore exercised the path no
  real owner is on, and the dashboard could tell every signed-in creator it had no data with
  4532 tests passing. The new cases live in a separate file,
  `AnalyticsDashboard.unavailable.test.tsx`, precisely so they cannot inherit that fixture.
  **If another suite on this branch seeds a token or credential, check whether canonical auth
  actually issues it.**

### Scoping the repoint — the canonical summary gives marginals, the charts want cross-tabs

Measured so the package does not start by discovering this. Twelve chart components consume
raw `AnalyticsEvent[]` and each aggregates for itself. What they read, against what
`AnalyticsSummary` offers (`totals`, `daily`, and marginal `dimensions` over `page`,
`category`, `country`, `trafficSource`, `element`, `platform`, `collection`,
`recommendation`):

| Chart | Reads | Canonical source | Fits? |
|---|---|---|---|
| `TopCountriesChart` | `country`, `type` | `dimensions.country` | direct |
| `TrafficSourceChart` | `utmParams`, `timestamp`, `type` | `dimensions.trafficSource` | direct, if no per-day split is wanted |
| `PageViewsTrendChart` | `page`, `timestamp`, `type` | `daily` | only as a total; **per-page trend is a `daily`×`page` cross-tab** |
| `LocationEngagementChart` | `Location_Id`, `Stats`, `timestamp`, `type` | `dimensions.collection` | keyed by id; needs an id→name join |
| `RecommendedPlacesChart` | `Location_Id`, `Recommendation_Id`, `element`, `type` | `dimensions.recommendation` + `collection` | as above |
| `SocialMediaInteractionChart` | `platform`, `element`, `page`, `type` | `dimensions.platform` | **`platform`×`element` cross-tab** |
| `WorldMapChart` | `country`, `page`, `type` | `dimensions.country` | **`country`×`page` cross-tab** |
| `ContentEngagementChart`, `GuidesChart`, `MediaItemChart`, `MediaItemsInListChart`, `MediaListEngagementChart` | `element`, `page`, `type` (+`timestamp`) | `dimensions.element`, `dimensions.page` | **all five need `element`×`page`** |

So **seven of twelve want a cross-tabulation the summary does not carry**, and
`analyticsQuerySchema` filters on `from`, `to`, `category`, `collectionId` and
`recommendationId` only — there is **no `page` or `element` filter**, so they cannot be
obtained by issuing several narrowed queries either. The package therefore needs one of:
widen `AnalyticsSummary` with the two or three cross-tabs actually displayed; add `page`
and `element` filters to the query and fan out; or change what these charts show. **That is a
product decision about which breakdowns are worth keeping, not a rewiring job** — which is
why it is scoped here and not guessed at.

### E. Outside the canonical closure — 31 files, step 12's territory

The legacy server and everything only it reaches: `app.ts`, `routes/index.ts` (both Strapi
gateway constructions), `services/strapi-service.ts`, `routes/strapiRoutes.ts`,
`publicProfile/strapiPublicProfileGateway.ts`, `services/reactivation-service.ts`,
`repositories/reconciliationRepository.ts`, `services/musicReconciler.ts` and
`commands/reconcileMusicIdentities.ts`, `config/music-environment.ts`, `seo-routes.ts`,
`jwt-auth-middleware.ts`, `routes/musicFixtureProbe.ts`, `deployment/music-health.ts` and the
rest.

These are deleted by **8.1b/8.2/8.3** along with the `legacy-music` mode, not ported. Two
carry a standing warning and must **not** be swept up as dead code:

- **`services/strapiIdentityAbsenceProof.ts`** — `strapiIdentityAbsenceProof` gates
  *finalizing account deletions*. With no access token it returns `"outage"`, so deletions
  defer rather than finalize. It **fails closed, which is correct.** Making it return
  `"absent"` by declaring Strapi retired would finalize deletions without confirming Strapi
  deleted its copy. That is a deliberate grant of lifecycle-delete authority and needs
  explicit owner authorization.
- **`policies/musicRetirementPolicy.ts`** and the tombstoned routes — retirement-policy
  surface. The ticket is explicit: "preserve tombstone endpoint behavior where needed to avoid
  accidentally reopening retired routes."

## What 8.1a still needs

| | Item | Blocked on |
|---|---|---|
| 1 | ~~`scripts/check-retired-dependencies.mjs`~~ — **DONE 2026-10-08.** See below | — |
| 2 | Compose: the `${VAR:?… is required}` declarations. **Re-measured 2026-10-09: the real scope is `docker-compose.yml` alone — 6 declarations, not four files.** `STRAPI_URL:19`, `MUSIC_STRAPI_ALLOWED_ORIGINS:21`, `STRAPI_ACCESS_TOKEN:24`, `STRAPI_ANALYTICS_ACCESS_TOKEN:25`, `STRAPI_JWT_SECRET:27` and the `STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST:107` secret mount. The other three named locations need **nothing**: `docker-compose.replatform.yml` has 12 Strapi mentions but **zero** required ones — every one is `${VAR:-default}` or a literal fixture value, so none blocks startup; `deploy/platform.compose.yml` contains no Strapi reference at all; and `tunes.yml:103` is `STRAPI_ANALYTICS_ACCESS_TOKEN: fixture-analytics-token`, a hardcoded CI fixture value rather than a deployment gate. So the decision is about one production compose file, and chiefly about `STRAPI_ACCESS_TOKEN`, which is what makes the deletion absence-proof fail closed | **owner.** The application does not need these; the deployment currently refuses to start without them. Loosening them changes what a half-configured production deploy does, and one of them (`STRAPI_ACCESS_TOKEN`) is what makes the deletion absence-proof fail closed |
| 3 | `.github/workflows/music-reconcile.yml` — **disable the hourly `cron: "17 * * * *"` and record the disablement before deleting the file**, so it cannot fire against a half-retired backend during the removal window | owner (it reaches production) |
| 4 | A runtime receipt: canonical boot with no `STRAPI_*` set and outbound Strapi denied. Source-level evidence is in section C; the ticket wants it executed | fixture/runner allocation |
| 5 | ~~Move `fingerprintStrapiProof` and the two body helpers out of `strapiIdentityGateway.ts`~~ — **DONE 2026-10-09** (`550a5924`) | — |

**Items 1 and 5 are discharged; 2, 3 and 4 are not engineering items.** 2 and 3 are the
owner's (they change what a half-configured or in-flight production deploy does) and 4 needs a
fixture/runner allocation. So 8.1a's engineering work is complete and the ticket is held open
by ops authorisation and one executed receipt, not by code.

Item 5 closed in three neutral modules — `upstreamResponseBody.ts`, `proofFingerprint.ts` and
`resolvedIdentity.ts`. The third was not in the original item and is what actually finished it:
after the helpers moved, two `import type` edges still reached the gateway, from
`musicProjectionService` (via `Pick<StrapiIdentityGateway, "resolve">`) and
`musicLifecycleService` (via a local port). Both already depended on a *shape*, so the DTO and
a named `IdentityResolverPort` moved out and the consumers now state what they need.

Those edges are erased by TypeScript, so exempting type-only imports from the scan would have
been the cheaper route. It was rejected: a type edge is still a reason the file cannot be
**deleted**, and deletability — not runtime reachability — is what the Strapi retirement is
tracking. Removing the edge beat loosening the gate.

The proof is the allowlist being **empty**, not the scan being green: that scan fails on a
stale allowlist entry as well as on a new violation, so it cannot pass while an entry names a
coupling that is gone. The closure went 121 -> 120 modules.

8.1a cannot be accepted on 8.1b's evidence or vice versa, and both are required to close 8.1.

## The static scan — `scripts/check-retired-dependencies.mjs`

Built in this pass and wired into `.github/workflows/tunes.yml` as a step of
`build-test-scan-push`, directly after `setup-node`: it needs no dependencies, so it fails
fast and costs nothing.

It is a **ratchet, not a retirement claim**, and it says so on success. Over the canonical
import closure it asserts three invariants:

1. no Strapi client is constructed, except allowlisted sites;
2. no module reads a `STRAPI_*` variable, except allowlisted sites;
3. no Strapi-named module enters the closure, except allowlisted ones.

Five allowlist entries, each carrying a `reason` and a `disposition` in the source — the two
client constructions above, the three env reads from section C, and the one module from the
same table. An entry is a decision someone had to write down, not a waiver.

It also fails on a **stale** allowlist entry. An exemption that outlives the coupling it
describes is worse than no exemption: it tells the next reader that a dependency exists when
it has already gone.

**It can fail for each reason it tests** — verified, not assumed, by three mutations against
a tracked module in the closure, each reverted afterwards:

| Mutation | Result |
|---|---|
| Added `process.env.STRAPI_INJECTED_PROBE` to `services/musicTokenService.ts` | `no-unallowlisted-strapi-env-in-canonical-closure`, exit 1 |
| Added `new StrapiProbeGateway()` to the same file | `no-strapi-client-in-canonical-closure`, exit 1 |
| Removed the real `STRAPI_JWT_SECRET` read from `security-containment.ts` | `no-stale-allowlist`, exit 1 |

What it deliberately does **not** do: assert anything about the legacy-music server, the
compose files or the frontend. Those are 8.1b and the owner items below.

## Reproducing the counts

```bash
# regenerate the inventory at the current SHA (writes source-inventory.{json,md})
node docs/replatform-audit/inventory.cjs "$PWD/explorers-earth/node_modules/graphql"

# the canonical closure, its STRAPI_* env reads and its Strapi HTTP sites
node docs/replatform-audit/canonical-closure.cjs "$PWD/tunes"

# every Strapi reference split into code vs comment, per file
node docs/replatform-audit/classify-strapi-references.cjs "$PWD"
```

Both new scripts are read-only and write only their JSON next to themselves.
