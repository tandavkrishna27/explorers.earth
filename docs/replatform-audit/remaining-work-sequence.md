# Remaining work, in the order we will do it

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

**2026-10-08. Supersedes `strapi-retirement-path.md`.**

Everything still outstanding, sequenced. This says *what* and *when*, not *how* — the ticket
stays authoritative for scope, acceptance and design.

Read with: [ticket index](ticket-index.md) for per-ticket verdicts, the
[coverage register](strapi-coverage-register.md) for field-level gaps, and the
[execution checklist](execution-checklist.md) for the rules every package follows.

## Where we are

Delivered on `codex/unified-replatform`: epic 1 (bar one obligation), epic 2.1–2.3,
Books/Movies/Games manual slices, and the category migrations
**4.3 Apps · 4.4 Products · 4.5 People · 5.1 Places · 5.2 place-links**. PR #119 is green
and still a draft.

Two numbers set the shape of what is left, both measured at `d97a5733`:

- **Corrected 2026-10-08: Apollo is not the whole frontend surface.** This doc originally
  said the 70 calls below partition it and that reaching zero ends the dependency. That was
  wrong. explorers-earth also reaches Strapi over REST through a *second* base,
  `VITE_REST_API_URL`, used by 19 files. Thirteen point at tunes (payment, subscription,
  AI) and are canonical; **four still hit Strapi-only endpoints** (`/upload`,
  `/upload/files/:id`, `/guides`): `features/Favorites/components/AddRecommendation.tsx`
  (step 7), `pages/ClaimAccount.tsx` (step 3), `pages/Home.tsx` (step 2),
  `pages/Profile.tsx` (step 7). The two that were in Guides are done. Zero Apollo calls
  would not have ended the dependency on its own.

  **Recounted 2026-10-08, and "four" understates it — do not plan step 12 off that number.**
  With Apollo at zero Strapi calls this is now the *whole* remaining frontend surface, so it
  was measured again. `VITE_REST_API_URL` appears in **21 non-test lines across 17 files**,
  and they fall into three kinds that must not be counted together:

  - **Display-time legacy media resolution** — `?.replace("/api", "")` then a stored
    `/uploads/...` path. Eleven lines: `ProfileSetupAccordion.tsx:67,71`,
    `appHelpers.ts:175`, `gameHelpers.ts:152`, `personHelpers.ts:198`,
    `productHelpers.ts:148`, `ProfileRecommendationsTab.tsx:100`, `publicPlaceMedia.ts:24`,
    `Home.tsx:121,132`. These are **not API calls**; they are the same `resolveCoverUrl`
    situation step 2 recorded, and they stop mattering when the media is migrated. Step 12.
  - **Genuine Strapi REST API calls** — `pages/Profile.tsx:1685` (`GET /accounts` filter
    query), `:1751` and `:1849` (two `POST /upload`), `AddRecommendation.tsx:732`
    (`DELETE /upload/files/:id`), `pages/Checkout.tsx:171,362` (two `GET /accounts` filter
    queries), `pages/EmailVerification.tsx:46` (`POST /send-email-confirmation`). All seven
    methods verified at the call site, not inferred from the URL. Of these, **four are live**
    — Profile's three and AddRecommendation's one, all authenticated owner media writes —
    and the other three are already contained: Checkout's two sit behind
    `MUSIC_SUBSCRIPTION_FLOWS_ENABLED = false` (step 9's containment), and
    `pages/EmailVerification.tsx` is **rendered by no route at all** (`AuthRoutes.tsx:30`
    redirects `/email-verification` to `/login`), so that file is dead and is *not* a D10
    surface. Measure-first earned its keep again here: the obvious reading was a live Strapi
    auth dependency needing an owner decision, and it is an unreferenced file.
  - **Canonical tunes traffic** — the three `*Service.ts` files, which fall back to
    `VITE_REST_API_URL` only when `VITE_PAYMENT_API_URL` is unset. A config concern, not a
    Strapi one.

  `pages/ClaimAccount.tsx` is **off the list** — the claim-flow containment removed its
  upload. Nothing here was changed; it is recorded so step 10/12 starts from a measured
  surface instead of this doc's stale four.
- **Frontend: 37 files, 70 live Apollo calls** when written; **26 files, 43 calls** earlier
  on 2026-10-08; **2 files and 0 Strapi calls** at the end of that day. Both survivors
  (`AuthSyncManager`, `useLogout`) hold only `apollo.clearStore()`, so the frontend now
  reads and writes nothing through Apollo and the link itself goes with step 12. There is one Apollo link
  (`src/main.tsx:32`) and it points at Strapi, so one live `useQuery`/`useMutation` is one
  Strapi dependency. Files importing `@apollo/client` only for `gql` are retired
  definitions, not consumers — counting imports instead of calls overstates the surface by
  about half.
- **Server: 55 non-test files mention Strapi.** That 55 overstates real coupling: some of
  those files exist precisely to *prove* Strapi's absence (`musicRetirementPolicy`,
  `strapiIdentityAbsenceProof`). Classifying them is step 10 below, not a guess to make here.
- **Corrected 2026-10-08: the canonical API already boots with no Strapi configuration.**
  This doc said `server/app.ts:179` builds a gateway from a required `strapiOrigin` so
  "the API cannot boot without Strapi configured", and named it the epic-6 exit blocker.
  Wrong API. `server/api.ts` selects a mode: `canonical` starts `canonicalStartup`,
  which has **no** Strapi reference and resolves Music tokens through ADR-008's
  `resolveCanonicalMusicTokenConfiguration` - explicitly "the token configuration and
  nothing else, notably not STRAPI_URL". `app.ts` is on the `legacy-music` path only,
  and that path is what step 12 (8.2/8.3) removes. So epic 6's "zero required Strapi
  config" already holds for the canonical runtime; what remains is deleting the legacy
  server, not loosening a required origin.
- **Not to be loosened casually:** `strapiIdentityAbsenceProof` gates *finalizing account
  deletions*. With no access token it returns `"outage"`, so deletions defer rather than
  finalize - it fails closed, which is correct. Turning that into `"absent"` by declaring
  Strapi retired would finalize deletions without confirming Strapi deleted its copy. That
  is a deliberate grant of lifecycle-delete authority and needs explicit owner
  authorization; it is not a config tidy-up.

The frontend steps partition all 70 calls exactly, so when the last one is done the count
is zero: **28** Guides + **10** Home + **9** auth pages + **6** public detail + **8**
Profile/Settings/Analytics + **4** music glue + **5** billing = 70. Steps with no call count
are structural work with no live Strapi consumer.

```bash
# recheck the frontend number, from explorers-earth/src
grep -rl "useQuery(\|useMutation(\|useApolloClient(\|useLazyQuery(" \
  --include=*.ts --include=*.tsx . | grep -v __tests__
```

If the code and this doc disagree, the code is right and this doc is stale.

---

## Phase A — finish the categories

### 1. Guides — [5.3](tickets/ticket-5-3.md) · 28 calls, 12 files · 27 MISSING fields

**Backend done (2026-10-08).** Migration 0050 plus the contract, repository, service and
seven owner routes are on the branch and verified: 29 contract cases, 18 integration cases
against PostgreSQL 15, role attestation green. Guides is no longer schema-unreachable.

Correction worth carrying: the ticket called for widening 0029's CHECKs on
`recommendations.category` and `collection_items.category` to admit `'guides'`. That is
wrong and was not done. A guide section's places are denormalised provider snapshots inside
the section's blocks, so nothing writes either row for a guide — and those CHECKs are what
make "a guide is never flattened into ordinary item rows" true in storage.

**Owner side done (2026-10-08).** Client, view model, adapter, owner hook, editing context
and every owner consumer are canonical: `GuidesPage`, `GuideDetailsPage`, `GuideSectionForm`,
`GuideSectionFormPage`, `CreateGuidePage` and all six `GuideDetails` editors. The feature has
**one** Strapi call left, and `guideService.ts` — the bearer-token `/upload` path — is deleted.

Still to do:
- The public (non-owner) guide read and `PublicGuideDetailPage`, which go with **step 6**,
  the public-detail package.
- `CreateGuideStep2`'s guide category vocabulary — the one remaining call, blocked on **D9**.

### 2. Dashboard home — `pages/Home.tsx` · 10 calls, 1 file · no ticket — **DONE 2026-10-08**
- Found by measurement, recorded in no epic. Read books, apps, products, people, places and
  guides straight from Strapi though five already had native owner reads.
- The last four were three reads of **the same account, read three different ways** -
  `GetDashboardStatus` by user document id, `accountsDetailQuery` filtered by username, and
  `GET_USER_ACCOUNT_QUERY` to recover the account id - plus one write. All three collapsed
  into the `useCanonicalAccount` call the file was already making.
- `GetDashboardStatus` was **inert**: it selected `usersPermissionsUser` and its only
  consumer read `dashboardStatusData?.me?.accounts`, a field the document never returned, so
  the completion check always fell through to the canonical Places read beside it. It
  fetched a large payload on every dashboard load and decided nothing.
- The write was a stale duplicate: Home had its own copy of the Places list create, on the
  Strapi mutation with the thumbnail posted to Strapi `/upload` and `display_order`
  computed from whatever lists this component happened to have loaded.
  `useCreateLocation` already does it canonically, and the server assigns
  `display_order` - which is also the only correct answer, since another tab may have
  created a list since this one loaded. Home now delegates to it.
- **Still there, deliberately:** `resolveCoverUrl` prepends the Strapi host to a stored
  `/uploads/...` media path. That is not a Strapi API call, it is display-time resolution
  of legacy media, and it stops mattering when the media is migrated - step 12, not here.

### 1b. Guide categories — decision **D9** — **DONE 2026-10-08**
The picker read a Strapi `guideCategories` collection. The canonical contract already decided
the storage - `guide_collection_details.categories` is an array of free strings - so that
collection was a suggestion list, never data integrity, and there is no canonical taxonomy
table to point it at.

What made it urgent rather than cosmetic: the field is **required with "select at least 4"**
and had no free-text entry, and an empty list rendered "No categories available" with no way
forward. At retirement guide creation would have become **impossible**, not merely worse.

Suggestions now come from the categories this creator has already used, and the field accepts
anything typed. That invents no vocabulary - naming the categories is product copy, not an
engineering choice - keeps the required field satisfiable on a first guide, matches the
storage exactly, and forecloses nothing: a curated list can be layered on top later without
changing what is stored.

Writing the test found a **latent** render loop in the same component:
`initialCategories`/`initialBestTimeToVisit` defaulted to inline `[]`, a fresh identity every
render, and the prop-sync effect lists them in its dependencies - so any re-render re-ran the
effect, set state and rendered again. Not live: the single caller passes stable `formData`
references, so only a caller omitting those props could reach it, which is what the test did.
The defaults are now module-level constants.

### 3. Claim flow — [5.4](tickets/ticket-5-4.md) · 18 MISSING fields — **measured 2026-10-08; genuinely D4's**
Unlike steps 8 and 9, nothing here turns out to be dead, so there is no honest way to
advance it without the decision. What D4 is actually deciding, precisely:

- **The flow is live and linked.** `/claimaccount` is routed at
  `routes/AuthRoutes.tsx:29` and linked from `pages/Login.tsx:46` and
  `pages/Register.tsx:252,276`. A signed-out visitor can reach it today. (One of those two
  entrances, Register, is itself D10's.)
- **It has three Strapi dependencies and no canonical target.** Two `useLazyQuery` lookups
  for a claimable place profile by phone and by address, a `POST` to Strapi `/upload` for
  the verification document, and `createVerifyClaim`. A search of `tunes/server`,
  `tunes/shared` and `tunes/migrations` for claim or verify-claim support returns **one
  comment and no code** - no table, no route, no contract. That is what the 18 MISSING
  fields are.
- **The failure mode at retirement is the part worth deciding against.** This is not a flow
  that stops working at the door: a claimant fills the form, uploads a document, and only
  then hits a dead backend. Breaking mid-flow after a document upload is materially worse
  than a closed door, so "decide later" is not neutral here.
- **Security finding, independent of D4.** The upload sends `Bearer
  VITE_PUBLIC_ACCESS_TOKEN` when no session token is present
  (`pages/ClaimAccount.tsx:131-139`). That is a bundled client-side credential authorising
  writes to the Strapi upload endpoint by any unauthenticated visitor. It is retired along
  with Strapi, but if the claim flow is rebuilt canonically it must not acquire an
  equivalent: an unauthenticated document upload needs a server-issued, single-use,
  purpose-bound grant, the way recovery proofs work.

**Corrected 2026-10-08, and the correction changed what could be done.** I wrote above that
this "breaks mid-flow after a document upload" and that touching it would be making D4's
decision. The first half was wrong, and it was load-bearing for the second.

The verification step - the one that uploads a document - is reachable only after a
**successful search**, and the search is a Strapi read. So the flow never reaches an upload
once Strapi is gone. What it does instead is fail at the door with a **misleading message**:
"No account found with the provided details." A business owner whose place genuinely is
claimable is told it is not, and has no reason to ask anyone.

That makes the honest change small and decision-free, so it is **done**: the search says the
feature is temporarily unavailable and explicitly that this does not mean the place is
unclaimable, it reaches no network to say so, and the three Strapi operations are gone with
the `Bearer VITE_PUBLIC_ACCESS_TOKEN` upload. The route, both entry points and the page all
stay.

**D4 is still open and still owns the real question** - whether a canonical claim flow is
rebuilt and in what shape (18 MISSING fields, no table, no route, no contract). Nothing here
forecloses it; if it is rebuilt, the note above about the upload grant applies.
- Claim service, repository, routes and migration — none of it exists.
- Eligibility is the direct canonical query 5.1 already specifies; no second stale directory.
- Retires `features/Favorites/services/claimablePlaceProfileService.ts`, still in the tree and no longer called.
- Needs decision **D4** first.

## Phase B — close the gaps behind "complete"

### 4. Auth pages — epic 2 · 4 calls, 4 files — **DONE 2026-10-08**

**Corrected twice, and the second correction is the one that matters.** First I called these
small mechanical screens. Then I corrected that to "cannot be converted - retiring them is a
product change needing **D10**". That was also wrong, and I should have checked before
writing it: **the product change is already shipped, and the decision is already recorded.**

- `config/featureFlags.ts` has `ENABLE_MANUAL_AUTH: false`.
- All four pages already act on it: `ForgotPassword`, `ResetPassword` and `ResetLinkSent`
  redirect to `/login` with a "sign in with Google" message, and `Register` renders
  Google-only at `:227`.
- `Login` has **no password field at all** — only `authClient.startGoogleSignIn()`.
- And [ticket 2.4 line 45](tickets/ticket-2-4.md) states the obligation as already settled:
  "Existing password-only routes redirect to Google sign-in without exposing broken forms;
  **record this agreed visible change**."

So there was no decision outstanding. What remained was the same shape step 9 found: each
page still carried an Apollo mutation in a path the redirect makes unreachable. Those are
gone, and each submit path now refuses by construction rather than being merely unreached —
the redirect runs in an effect, so it fires a frame after the first render.

Also removed: the Strapi error-message classification below each call (`ApolloError`
branches matching on "email not found", "rate limit" and so on), which mapped responses a
retired backend will never send.

What is genuinely still D10's is narrower than this step: whether the four routes keep
existing as redirects or stop being routed at all, and whether `Register`'s Google-only
screen is the long-term sign-up page. Neither blocks Strapi retirement.

- `ClaimAccount` (3 calls plus a Strapi REST `/upload`) is the claim flow and belongs to
  **step 3** under **D4**, not here.
- **I had this wrong too.** `hooks/useUsernameValidation` held a **live** Strapi query, not
  a retired definition: all three username inputs - onboarding, profile edit, and the
  signed-out landing claim - checked availability while typing through
  `CHECK_USERNAME_AVAILABILITY` against Strapi's accounts collection. There was no canonical
  equivalent, because the server enforces handle uniqueness at write time with a 409 on
  `creator_accounts_handle_key_uq` and offers no pre-submit read.

  So one was built: `GET /api/explorers/v1/public/handles/:handle/available`, in the
  existing public-content router beside the other public reads. **Public by parity**, not by
  expansion - the query it replaces was already reachable unauthenticated from the landing
  page, and a handle is public by construction since it is the profile URL. Rate-limited to
  30/min against the content reads' 120, because a per-keystroke check is also an
  enumeration oracle and a debounced client needs far fewer. Declared in
  `musicSurfacePolicy` as `public` (the allowlist is fail-closed), and the regenerated
  inventory classifies it exactly like `/public/recommendations/search`: `GET` public, its
  `USE` middleware and `ALL` 405 fallback tombstoned.

  The read is explicitly **not** authoritative - it is a hint, and the write-time conflict
  still decides - and a failed check reports *unavailable*, because offering a handle as
  free during an outage sends a creator into a form they cannot submit.

- `hooks/useLogout` holds `apollo.clearStore()` only: cache plumbing, which goes with Apollo
  in step 12.

### 5. Auth UX and lifecycle — [2.4](tickets/ticket-2-4.md) — **prerequisite discharged 2026-10-08**
- The blocking prerequisite is done: [the frozen requirement-to-receipt map](lifecycle-requirement-receipt-map.md). Writer dispatch is no longer gated on it.
- Three findings from writing it. The stated "18+3" enumeration **does not exist in the repo** - only the figure does - so the map's denominator is derived from the actual contract surface and says so. It comes to **19 + 3**; my first draft came to 18 + 3 only because I had omitted the held-completion fence the ticket names. And the ticket's own C1 and C4 are partly stale: the two held-feedback case names are committed but **unexecuted** (10 of 12 declared), and the legacy spec's retired `auth-storage`/`mock-jwt-token-xyz` assertions are already gone with the canonical lane registered in `frontend-e2e-qualification.yml:122`.
- 21 of 22 behaviour rows have receipts. Two of the map's obligations are now **done**: the typed terminal/pending/unknown observation union and the manual-review DTO, both on the existing `/recovery/status` route. Doing them showed C3 is wrong on one point that mattered - a client which lost its response **could not** re-observe, because `requireRecoveryPrincipal` requires an unconsumed proof and a suspended-or-pending account, so the re-read returned 403 and a terminal deletion was unreportable. That needed a **security boundary change** (a separate read-only observation authority), called out in the map for the owner to veto.
- All 22 behaviour rows now have receipts, the held-completion fence included - it was already covered at `e2e/replatform/lifecycle.spec.ts:202`, where a `for` loop generates both cases, which is why a line-anchored `test(` grep missed it. **One obligation remains and it is not a behaviour gap: hosted attestation** of the browser receipts. **Music socket revocation closed 2026-10-09** (`e809d57b`): logout revoked only HTTP because the socket recheck read the venue, which logout does not touch; a canonical credential is now bound to its session and rechecked against it, so both transports revoke together. The third — the **real Google callback**, which the ticket says a fixture cannot satisfy — was executed and observed on 2026-10-09 against the canonical Better Auth callback at schema floor 0051, with the before state captured empty; the receipt and what it deliberately does not cover are in [the frozen map](lifecycle-requirement-receipt-map.md), obligation 3.
- Four subpackages L0→L3; migrate the unmigrated legacy spec; add the absent held-completion, response-loss and reload cases.
- Close the "no browser authority from account IDs" violation on *subjects* — it holds for bearers already.

### 6. Public place and person detail — [5.1](tickets/ticket-5-1.md)/[7.1](tickets/ticket-7-1.md) · 6 calls, 4 files


**Verified complete 2026-10-09, by measuring the premise rather than the call list.** There
is no live Strapi API consumer left in the frontend outside D1's. Every non-test module
reading `VITE_REST_API_URL` was classified:

- **Asset-origin builders, not API calls** — `Home.tsx` (x2), `ProfileSetupAccordion.tsx`,
  `ProfileRecommendationsTab.tsx` and the four category `*Helpers.ts`. Each is
  `.replace("/api", "")` building an image origin. `Register.tsx`'s only occurrence is a
  comment.
- **Kept by D1** — `Checkout.tsx`, `paymentService.ts`, `subscriptionService.ts`.
- **Canonical-first fallbacks** — `Profile.tsx`, `AddRecommendation.tsx`, unreachable on the
  canonical runtime.

And the asset-origin class, which is the half that once concealed a live defect in both
runtimes, is **fully guarded**: all seven origin-builders import
`isCanonicalMediaPath`. Sweeping for the defect's actual shape - a leading-slash test -
finds three further modules without the guard, and none rewrites a media URL:
`StaticPageLayout.tsx` and `localTunesApiClient.ts` are open-redirect and path-injection
guards (both correctly reject `//`), and `getCurrentDomain.ts` builds share URLs.

**Re-measured 2026-10-09: the second fetch is already gone, and the "6 calls" framing is
wrong for what remains.** Original text kept below.

`PlaceOverview` and `PersonOverview` make no request at all - they take the entity from the
caller, which already found it in the list it is rendering, and `PersonOverview` says so at
its own `person?` prop. `PlaceDetails/` holds no fetching code, and `PublicHome.tsx` issues
no query. So "two sources for one page" is closed for these components.

**The frontend executes no Apollo operation anywhere.** Measured across all non-test source:
zero `useQuery`/`useMutation`/`useLazyQuery` call sites (the only two `useQuery(` matches are
TanStack, in `useCanonicalAccount` and `useTunesDashboard`), and zero `.query(`/`.mutate(`.
The `gql` documents in the twelve `api/query.ts` and `api/mutation.ts` files are **dead
documents** with no executor, and `categoryNavigationApi.ts` takes an `ApolloClient` whose
own type comment says "Temporary callsite compatibility only; never queried or mutated".

**What is actually left is REST, not GraphQL**, in 14 non-test files via
`VITE_REST_API_URL` (which defaults to `http://localhost:1337`). Two different things wear
that name:

- **Real Strapi REST calls:** `/accounts?filters…` (`Checkout.tsx:171,362`,
  `Profile.tsx:1685`), `/upload` (`Profile.tsx:1751,1849`), `/upload/files/:id`
  (`AddRecommendation.tsx:732`), `/send-email-confirmation`
  (`EmailVerification.tsx:46`), and `paymentService`/`subscriptionService` falling back to
  it.
- **Asset-origin concatenation**, which is a different problem with a different fix, and one
  instance of it was a live defect - see `2861d88d`: canonical cover images were being
  requested from the Strapi origin, and from TMDB's host on the movie shelf. The rule now
  lives once, in `explorers-earth/src/lib/canonicalMedia.ts`.

So this step's remaining work is the REST list above plus the public guide read, and it
belongs with step 12's retirement rather than being an Apollo-repointing package. **Do not
plan it from a count of `gql` documents** - that count is almost entirely dead code and will
overstate the work by an order of magnitude.

Original text:

- `PlaceDetails`, `PlaceOverview`, `PersonOverview` and the remaining PublicHome readers still fetch detail through Strapi while the list read next to them is native.
- Two sources for one page is how "right on the grid, wrong in the modal" happens, and 7.1 cannot prove parity across the split.

### 7. Profile, Settings, Analytics — [3.1](tickets/ticket-3-1.md), [3.2](tickets/ticket-3-2.md), [3.4](tickets/ticket-3-4.md), [7.2](tickets/ticket-7-2.md) · 8 calls, 6 files
**Partly done 2026-10-08.** The three Analytics components and `useUpdateProfile` are off
Strapi. What that took was not a rewiring job either, and it is worth saying why:

- The two Analytics charts read `recommendationListQuery`, which is the Places category
  that `usePlacesOwner` already served under exactly that key. `AnalyticsDashboard` looked
  an account up with an inline `gql` document; `useCanonicalAccount` already existed to do
  it, and the selection logic around it (`selectCompletedAccount` over a list of accounts)
  has no canonical meaning — one owner has one account, and the read is owner-scoped.
- `useUpdateProfile` held four paths. Both of its callers already feed it from
  `useCanonicalAccount`, so the id reaching it is always a canonical UUID and **the three
  Strapi paths were already unreachable**: a `createAccount` for an owner with no account,
  an `updateAccount` for a non-UUID id, and a write mirroring the username onto
  `usersPermissionsUser`. No canonical `createAccount` is needed to replace the first -
  `ensureInitialAccount` provisions the account during authentication, so the client cannot
  and need not create one. A missing id now refuses the save instead of creating anything.

Two defects fell out of that, both live on this branch today:

1. **A rename did not reach the dashboard's own links.** Every public link and QR code is
   built from the auth store's `user.username`, and the only code that wrote that field was
   in the unreachable Strapi branch. So on the canonical path a rename updated the account
   and left every generated link pointing at the old handle until a full reload. Fixed, and
   mutation-checked: removing the write-back fails a test.
2. **The Music venue name never followed a rename — FIXED 2026-10-08.** `users.venue_name`
   was written once, at provision, from `display_name || handle`, and nothing updated it
   afterwards, so a creator who renamed their profile kept the old name on the Music surface
   indefinitely. `musicApi.refreshIdentity()` looked like the mechanism and carried nothing:
   the credential it re-mints is `{token, expiresAt}` with no display data, and the ensure
   endpoint returned early for an already-mapped account.
   `ensureMusicAccount` now converges the name on reuse, which is the one place that
   already holds the mapping and is reached on every identity refresh - so the Explorers
   account write does not have to reach into a Music table. That makes the client call
   meaningful, so it is **restored** in `useUpdateProfile`, best-effort: a Music name one
   save stale must not fail an Explorers profile save. The name derivation is now one
   function used by both paths, because two copies of a fallback chain is how they come to
   disagree about what an unnamed venue is called.

Also found, not fixed: `localTunesvisiblity` is hydrated into the profile form from
`social_media.localTunes.visibility` in two places and **no component renders it and no
code writes it back**. It is Strapi-era; Music visibility on a public profile is
`account_category_settings` for `music`, which travels as `categories`. The dead hydration
goes with the form cleanup in step 12.

**Settings is done too, and it was not D10's either.** `Settings.tsx:127` is
`const data = { usersPermissionsUser: { provider: "google" } }` - a **hardcoded constant,
not a read**. So every `provider !== "google"` branch in the file, including the Change
Password row and its modal, is statically unreachable, and the `updatePasswordMutation`
behind them was dead code pointed at Strapi. Removed; the handler now refuses by
construction, so restoring a real provider read without porting the flow fails loudly
instead of appearing to change a password canonical auth does not have.

Deleting the unreachable password UI itself - four guarded branches and a modal - is left to
step 12's form cleanup rather than done here, and is recorded in the file so it is not read
as live.

- Remaining: `Settings`, and the ticket obligations below.
- **3.4**: 10 analytics identities are authored and **0 attested**. **Corrected 2026-10-08: \"add
  the lane to the runner and the suite manifest\" is the wrong remedy, and doing it by hand
  would be falsifying an attestation record.**

  The lane is not missing. `tunes/scripts/analytics-browser-fixture.ts` exists, is contained
  and self-hosting (it sets `PLAYWRIGHT_EXTERNAL_BASE_URL` from its own origin), has its own
  contract module, runs 5 cases over 2 projects = the 10 identities, and is **already
  registered** at `.github/workflows/frontend-e2e-qualification.yml:126`.

  What is missing is the **attestation**, and `suite-manifest.json` records that on purpose:
  its `pending` ledger carries `{ticket: \"3.4\", obligation: \"Analytics acceptance\", status:
  \"pending\"}`. The validator at `scripts/replatform-e2e.mjs:54-55` requires the manifest's
  lane names to **equal** a hardcoded six, requires `pending.length >= 7` with every entry
  still `pending`, and - the part that matters - `runLane` **executes** each listed lane and
  validates its protected receipt on every invocation. A lane appears in `lanes` because its
  receipt was produced, not because someone typed it in.

  So promoting analytics means running the fixture to produce that receipt. That run creates
  a disposable PostgreSQL container and is gated behind the explicit
  `TASK4_FIXTURE_OWNED_DISPOSABLE_PG15` acknowledgement, which exists so the run is a
  deliberate act. **That acknowledgement is the owner's to give**; the engineering is done.

      cd tunes && npx tsx scripts/analytics-browser-fixture.ts Its consent and privacy obligations are also open, and are not a rewiring job.
- **3.2**: the mandated upload-hook changes were never made.
- **7.2**: the dashboard gates on a token canonical auth never sets, so it is structurally
  dead; plus the reference-content module and the canonical email suppression table.

  **The reference content is the last Strapi read in steps 1-9 that I am not deciding, and
  the reason is not that it is hard.** Measured 2026-10-08:

  - Four live, routed surfaces read it: the landing page's `<FAQ />` (`pages/Landing.tsx:131`)
    and `/terms`, `/privacy`, `/cookies` (`routes/AuthRoutes.tsx:35-37`), through
    `useFaqs` and `usePlatformTerms`.
  - **At retirement those three legal pages go blank.** A product with no reachable Terms,
    Privacy or Cookie policy is a different kind of breakage from a missing feature, which
    is why this one is worth a decision rather than a default.
  - There is no content in the repo to fall back on. The i18n bundles carry UI labels
    (`auth.termsAndConditions`, `cookieConsent.*`) and **no body copy and no FAQ entries**.
  - `page_contents` already exists in `tunes/shared/schema.ts:535` with
    `slug`/`title`/`content`/`is_published` and the comment "'terms', 'privacy', etc." - but
    it is the **tunes** app's own CMS table (serial id, `created_by` referencing
    `users.id`), and it has **no locale column**. Both hooks are locale-keyed off
    `i18n.language`.
  - And the locale dimension is bigger than the canonical contract: `i18n/resources` ships
    **46 locales** while `updateAccountInputSchema.locale` is `z.enum(["en","hi"])`. Any
    table design has to say which of those it serves, and any static-content design has to
    say what a visitor on one of the other 44 sees.

  So the decision was: reuse and extend `page_contents` (cross-app coupling, needs a locale
  column), create a canonical explorers reference-content table with locale (a new
  owner-editable surface and an admin to edit it), or move the copy into the repo as
  deploy-time content (removes a runtime dependency from legally-required pages, and takes
  away editing without a deploy).

  **Decided 2026-10-08: the copy goes in the repo. DONE.** TK took the third option. The
  copy is at `explorers-earth/src/content/reference/<locale>.json`, exported **verbatim**
  from the live Strapi `platformTerm` and `faq` collections over the public `/graphql`
  endpoint, and `useFaqs`/`usePlatformTerms` now read it through a shared
  `useReferenceContent`. The retired `features/LandingPage/api/queries.ts` is deleted —
  it held nothing but the two documents. The four surfaces and their loading/error branches
  are untouched, and `RichTextContent` is unchanged: the export contains only `paragraph`
  and `heading` blocks with `bold`/`italic` marks, all of which it already renders, so the
  pages render identically.

  Three things measurement settled, each of which shaped the design:

  - **The locale dimension is ten, not 46.** Strapi had ten locales configured against the
    i18n bundles' 47, so there was never content for the other 37. Resolution normalises
    `en-GB` to `en` and sends anything uncovered to `en`.
  - **Privacy and Cookie policy exist in English only** — nine of ten locales returned empty
    arrays, and `bn`/`id` have no `platformTerm` row at all, so their Terms were blank too.
    Fallback is therefore **per section**, not per locale: a Hindi visitor gets Hindi terms
    and Hindi FAQ with the English privacy and cookie policy. That is strictly better than
    the Strapi behaviour it replaces, which served a blank page.
  - **English is statically imported and the other nine are lazy chunks.** A chunk is still a
    network fetch, and a chunk error must not blank a Terms page, so a failed load resolves
    to the bundled English copy rather than rejecting. That one property is what the whole
    decision was bought for, so it has its own isolated test.

  23 tests across three files; three mutations (per-section fallback, unknown-locale
  fallback, chunk-failure fallback) each verified to fail the suite before being reverted.

  **One thing for TK, not for engineering:** the copy that was migrated is placeholder-ridden
  and says so on the live site today — "Terms and Conditions for **LocalQR**", with
  `[your app URL]`, `[Your Company Name]` and `[Your Country/State]` unfilled, a
  `hello@localqr.earth` contact and an effective date of 10th Sept 2025. It was carried over
  verbatim and deliberately not rewritten; the operative text of a legal document is not an
  engineering call. It is now a one-file edit.
- Decisions **D2**, **D6**, **D7**, **D8** all land in this step.

### 8. Music glue — epic 6 tail · **1 call**, not 4 — mostly already done
**Corrected 2026-10-08.** Three of the four files are not Strapi consumers:

- `hooks/useTunesDashboard` uses **TanStack** Query, not Apollo. My `useQuery(` grep
  matched it; it never imported `@apollo/client`. The repo-wide call counts in this doc
  are inflated for the same reason — the honest figure is files that genuinely
  call an Apollo hook outside tests, which was 19 when this was written and is **4** now.
- `MusicPublishProvider` held an Apollo client only to pass it to
  `createMusicPublishAdapter`, which **never used it** — zero references in 76 lines. Both
  the parameter and the provider's `useApolloClient` are now gone.
- `AuthSyncManager` calls `apollo.clearStore()` on logout. That is Apollo cache plumbing,
  not a Strapi read, and it disappears with Apollo in step 12.

That one read is **done 2026-10-08**, and it was five Strapi fields standing in for one
column. `musicPageEligibilityQuery` inferred "does this Explorer have a usable account"
from Account_Name, Account_Type and mobile_number all being non-empty, plus `provider` and
`confirmed`. Canonically that is `onboarding_status`, which `useCanonicalAccount` already
returns. The provider and confirmation checks are gone for a different reason: the canonical
profile read refuses a non-Google identity outright (403 unless an `auth_account` row with
`provider_id='google'` exists), so one never reaches the page to be judged.

`unknown` is kept and still distinct from `incomplete` - it is the answer while the read is
pending or failed, and collapsing them would tell a creator with a finished account to go
and finish it whenever the network blinked. The retired document moved to
`legacy-profile-fixture-documents.txt`, following the precedent already in that file, so the
pre-migration Music identity snapshot still restores.

The server half is also already done — see the corrected note above: the canonical API
boots with no Strapi configuration, and `app.ts` is on the `legacy-music` path that step
12 removes.

### 9. Billing and subscription · 5 calls, 3 files — **DONE 2026-10-08, without pre-empting D1**
Measured rather than assumed, and the "5 live Strapi consumers" was wrong in both directions:

- **3 of the 5 were already unreachable.** `MUSIC_SUBSCRIPTION_FLOWS_ENABLED = false` makes
  `Checkout` and `SubscriptionPlans` return `MusicSubscriptionUnavailable` before their
  active subtrees render, so their two mutations and one mutation respectively could not
  fire. They still imported `@apollo/client`, which is what blocks step 12, so the documents
  are gone and the call sites now refuse loudly - if that flag is ever flipped without
  porting the flow, it throws instead of writing to a retired backend.
- **1 was a dead read.** `BillingTab` fetched username, email and `razorpay_customer_id`
  from Strapi on every render into `_userData` and **never read it**. The underscore was the
  only hint. Deleted; there is nothing to port a read to when nothing consumes it.
- **1 was a live write, and it was the inconsistency worth fixing.** `BillingTab`'s
  free-plan upgrade set `is_subscribed` through `usersPermissionsUser`. The paid branch
  beside it navigates into the contained `Checkout`, and the other two entrances are closed
  - only this one escaped. It now refuses like its siblings.

**This applies the containment already in force; it does not decide D1.** There is no
canonical subscription state to port to - `updateAccountInputSchema` has no `is_subscribed`
- so what a subscription means canonically is still the owner's call, and it was never going
to be answered by continuing to write to Strapi. The `song-limit` quotas (3 MISSING fields)
remain D1's, and the chat-assistant work has its own central `ai_usage` meter planned.

## Phase C — prove it, then retire

### 10. Classify the server-side Strapi references — [8.1a](tickets/ticket-8-1.md) — **classification DONE 2026-10-08**

Full result: [the server-side Strapi classification](strapi-server-classification.md). Headline:
**no reachable canonical path touches Strapi, and canonical startup requires no `STRAPI_*`
variable** — confirmed at source, with the inventory regenerated at the acceptance SHA as the
ticket requires.

The "55 files" is not the acceptance denominator and counting it as one is what makes this
ticket look ten times its size. Measured: **210** non-test modules under `tunes/server` +
`tunes/shared`, **56** mention Strapi, **7** only in comments, **49** have a code reference.
Crossed against the canonical import closure (**118** modules from
`server/auth/canonicalStartup.ts`, zero unresolved specifiers), **18** of those 49 are inside
it and **31** outside.

And most of the volume is not a dependency at all. The largest single file,
`repositories/musicIdentityRepository.ts` at **221** references, is almost entirely the
columns `strapi_user_id` / `strapi_user_document_id` / `strapi_account_document_id` — the
stored mapping from a canonical account to the legacy identity it came from. That is **data
about a retired system, not a call into one**; it survives retirement untouched and renaming
it is 8.3's optional mechanical job.

- `strapiOrigin` **needs no loosening**: its only uses are `app.ts:179` and
  `routes/index.ts:85,182`, all on the legacy-music path. `resolveCanonicalMusicTokenConfiguration`
  (`config/music-identity-config.ts:108`) requires `MUSIC_MODE` and the token config only; it
  is `resolveMusicIdentityRuntimeConfig` at `:123` that calls
  `parseOrigin(environment.STRAPI_URL, "STRAPI_URL")`, and that is the legacy resolver. This
  closes out the earlier `app.ts:179` correction: there is nothing to make optional, only a
  legacy server to delete in step 12.
- **Delivered:** `scripts/check-retired-dependencies.mjs`, the named 8.1a static scan, wired
  into `tunes.yml`'s `build-test-scan-push`. A ratchet over the canonical closure with five
  reasoned allowlist entries, which also fails on a *stale* entry. Three mutations confirm it
  fails for each reason it tests.
- **The scan earned its keep immediately:** this doc's first draft claimed the canonical
  server "constructs no Strapi client". It constructs two, in the dead legacy analytics
  factory. Manual enumeration missed them; the mechanical check found them within minutes of
  existing.

**Found while measuring, and bigger than the retirement note — a live ticket 3.4 defect.**
The one runtime Strapi call reachable in the canonical closure is the historical analytics
owner read (`GET /api/explorers/analytics/events` → `authorizeOwner` → `historical()` →
`fetch(${strapiUrl}/api/users/me)`). It is **dead**: its client requires an auth-store token,
and the canonical `acceptVerified` path sets `token: null` explicitly (`store/store.ts:76`)
while the only action that sets one, `login(data)` at `:119`, has **no caller outside tests**.
Two consequences:

1. The analytics events panel is **permanently empty and silent** — the `!token` branch at
   `AnalyticsDashboard.tsx:190-203` clears loading, clears error and empties both arrays, so a
   creator sees an empty panel with nothing to suggest it is broken. The charts migrated in
   step 7 do work, which makes it easier to miss.
2. **The canonical replacement already exists and is unused.**
   `GET /api/explorers/analytics/summary` is registered behind `requireActor`
   (`routes/explorersCanonicalAnalyticsRoutes.ts:30`) — no Strapi, no bearer — and a search of
   `explorers-earth/src` for it returns nothing.

Not fixed here: repointing the dashboard changes what numbers a creator sees, so it wants its
own package and acceptance. It is what makes this Strapi call *deletable* rather than merely
unreachable.

**Remaining for 8.1a is three owner items; the fourth is DONE 2026-10-09 (`550a5924`).**
The engineering work on this step is complete — the compose, cron and boot-receipt items below
are ops authorisation and runner allocation, not code. Original wording follows.

— the compose
`${VAR:?… is required}` declarations across all three compose files plus `tunes.yml:103`
(the application does not need them; the *deployment* still refuses to start without them, and
one of them is what makes the deletion absence-proof fail closed), disabling
`music-reconcile.yml`'s hourly cron **and recording that** before the file is deleted, and an
executed boot receipt with outbound Strapi denied. ~~The fourth is small: move
`fingerprintStrapiProof` and the two `Response`-body helpers out of
`services/strapiIdentityGateway.ts` and the closure's last Strapi-named file is gone.~~

**The fourth was not quite that small.** Moving the three helpers left two `import type` edges
into the gateway, so the `ResolvedStrapiIdentity` DTO and a named `IdentityResolverPort` moved
out too; both consumers already depended on a shape rather than the class. The module allowlist
in `scripts/check-retired-dependencies.mjs` is now **empty**, which is the proof — that scan
fails on a stale entry as well as on a new violation. Closure: 121 -> 120 modules. Details:
[the server classification](strapi-server-classification.md).

### 11. Parity and milestone evidence — [7.1](tickets/ticket-7-1.md), [7.3](tickets/ticket-7-3.md), [1.2](tickets/ticket-1-2.md)

**1.2's inventory extension is DONE 2026-10-08; the obligation it serves is not closed, and the
reason turned out to be structural.** Full writeup: [the route-graph
invariant](route-graph-invariant.md).

The 2026-10-05 review said the invariant passed vacuously because the inventory probed six
legacy paths and the test pinned the count to exactly six. That was right and one level too
shallow. **The inventory listed no canonical routes because the fixture serves none:**
`docker-compose.replatform.yml:56,106` set `EXPLORERS_API_MODE: legacy-music`, and the legacy
composition mounts only analytics and public-profile routes from the Explorers set. The fixture
is the legacy runtime, not a canonical one with a thin inventory.

What landed:

- Five canonical probes beside the original six — the Better Auth group's origin guard,
  `/api/explorers/v1/me`, `/api/explorers/v1/account/lifecycle`, `/api/explorers/v1/collections`
  and `/health/live` — with the expected count now **derived from the inventory** instead of the
  literal `6`. The probe mechanism gained a request `method` and dotted field paths, because
  canonical errors are nested `{error:{code,...}}` where every legacy probe asserted a flat field.
- `tunes/server/test/contracts/platform-route-signatures.test.ts`, which drives the same probe
  list against the **real** `createCanonicalApp` and asserts each recorded status and body field
  is what the app actually answers. This is the piece that matters: an inventory can be
  internally consistent and describe nothing, which is what went wrong before. It needs no
  container, and that is measured too — none of the five paths touches the database, and the
  test asserts the stub pool recorded zero queries.
- 13 cases across the two files; three mutations confirm each fails for its own reason,
  including an expectation drifting away from the real app.

**The cost, stated plainly: `platform:test:routes` now fails in CI** (`test.yml:302-310`),
because against a `legacy-music` fixture those five routes are genuinely absent. That is the
ticket's mandated behaviour — "a failure, not a skip" — and the first time the invariant could
fail at all. The message diagnoses itself rather than reporting a bare mismatch. **Reverting is
one commit and restores the vacuous pass, not correctness.**

**Owner decision, because the ticket asks for two incompatible things:** keep the six legacy
probes (four of which are legacy-only surfaces) *and* require canonical routes the legacy
runtime does not serve. One runtime cannot answer both. Flip the fixture to canonical now (a
real package: canonical env, and the fixture E2E lanes move with it), run both graphs during
the transition, or accept the red until step 12 reaches the fixture. The invariant doc has the
costs.

**7.1 re-measured 2026-10-08. Three of the review's four findings are resolved; one is live and
is not decision-free.** Full writeup: [public parity state](public-parity-7-1-state.md).

- **The uncommitted overlay is committed**, with both importer specs migrated in step, so the
  fixture conversion did not land alone.
- **The P0 identifier seam is closed.** `CategoryNavigationProvider.tsx:56` builds the
  navigation API on the canonical `explorersApiClient`; the legacy `gql` document and the
  type-only `ApolloClient` import in `categoryNavigationApi.ts` are residue that nothing
  executes. *Correction to my own 2026-10-08 Apollo count: the handoff's grep looks for
  `useQuery|useMutation|useLazyQuery|useApolloClient`, so a module taking an `ApolloClient` as a
  **parameter** is invisible to it. The conclusion held, verified by reading the file, but the
  command has that blind spot.*
- **Category coverage is no longer 3 of 9 — it is 8 of 9, and there is no ninth to error on.**
  `publicProfilePolicy.ts` declares exactly eight public categories and
  `publicProfileContract.ts:6` validates with `z.enum(...)`, so `music` is rejected by the
  parser and the route answers 400, never the empty success the review warned masks the gate.
  The gateway's empty fall-through is unreachable through the route. **The risk has inverted**
  to "a category is added to the enum before its producer lands", and
  `public-category-coverage.test.ts` is written against that — enum-driven, so it cannot go
  stale; 4 cases, 2 mutations (adding `music` without a producer fails all four).
- **Live, and the owner's call: the media boundary.** `publicPlaceMedia.ts:35-38,59` still
  admits any `*.amazonaws.com` host and the Strapi origin, so hiding an attachment does not
  deny its bytes — the canonical projection emits only
  `/api/explorers/v1/media/{id}/content`, and the 2026-10-07 owner note records that media is
  *stored* in S3 but *served through the media route*, which is the gate a direct S3 URL skips.
  It was not simply tightened because `PublicHome.place-image.test.tsx` **asserts the current
  behaviour positively** across legacy Strapi-shaped fields, so closing it inverts asserted
  behaviour and blanks images that work today. Three options and their costs are in the doc.

Still open in this step:
- 7.1 full parity, by the ticket's own terms: the 53-item duplicate-order traversal, the
  table-driven visibility matrix, ETag invalidation after unpublish, same slug under two
  accounts, reserved handles, the nine-route pin checks, and the two absent files
  (`public-parity.spec.ts`, `publicVisibility.integration.test.ts`). The ticket makes full
  parity depend on every category producer plus Music, and **6.3 has not landed**.
- 7.3: milestone-2 evidence — the command flags it mandates do not exist in the runner yet.
- Note `execution-packages.json:21` still describes 1.2's inventory as unextended; it is now stale on that point.

### 12. Retire Strapi — [8.1b](tickets/ticket-8-1.md), [8.2](tickets/ticket-8-2.md), [8.3](tickets/ticket-8-3.md)

**"Verify zero active consumers" was done on 2026-10-09, frontend side. Four of the five
remaining Strapi REST call sites are already not live consumers**, which makes 8.1b a
deletion exercise rather than a porting one. Traced individually:

| Call site | Reachability |
|---|---|
| `EmailVerification.tsx:46` → `/send-email-confirmation` | **Dead code.** The file is imported by nothing, and `AuthRoutes.tsx:28` routes `/email-verification` to `<Navigate to="/login">`. The page cannot render. |
| `Profile.tsx:1751,1849` → `/upload`, and `:1685` → `/accounts?filters…` | **Fallback only.** Both sit after `if (accountQuery.data) { …canonical…; return; }`, and the canonical path is fully built: `createMedia(file,'profile'\|'background')` then `updateAccount({profileImageId\|backgroundImageId})`. On the canonical runtime the Strapi branch is unreachable. |
| `AddRecommendation.tsx:732` → `/upload/files/:id` | Same pattern; needs the same per-branch check before deletion. |
| `Checkout.tsx:171,362` → `/accounts?filters…` | **Live and unconditional**, reached from `BillingTab.tsx:233` and `SubscriptionPlans.tsx:242`. Kept by **D1** ("payments and all we will document and keep"), so this is the one that stays and is documented. |
| `paymentService.ts:16`, `subscriptionService.ts:3` | Live fallbacks of `VITE_PAYMENT_API_URL` → `VITE_REST_API_URL`. Same D1 bucket. |

So after the payment flows are set aside by D1, the frontend's Strapi REST surface is one
dead file plus three canonical-first fallbacks.

**Do not confuse that variable's two jobs.** `VITE_REST_API_URL` is also used to build
*asset origins* in eight more files, which is a different problem with a different fix -
and it was concealing a live defect in both runtimes, fixed in `2861d88d` and `1b18157e`
via `explorers-earth/src/lib/canonicalMedia.ts`. Anything that rewrites a relative URL
must recognise `/api/explorers/v1/media/<uuid>/content` first.

- Verify zero active consumers, then delete the compatibility files and the retired `gql` documents across all nine category features. **The `gql` documents are dead already — the frontend executes no Apollo operation at all (see step 6), so this part is deletion with no replacement work.**
- 8.2: remove the duplicate Tunes frontend — still built and served. **"A CI-gating risk,
  not a product change" is too strong; measured 2026-10-09.** `tunes/vite.config.ts:31`
  sets `root: tunes/client` and `:33` `outDir: tunes/dist/public`; `npm run build` runs
  `vite build`; `tunes/server/runtime.ts:24` serves that directory. So it is the Tunes
  service's *actual* served frontend, and deleting it stops serving the standalone Tunes
  UI and leaves the vite build without a root. Whether that UI is still wanted once Music
  is embedded in explorers-earth is a deployment and product call, so this is **not** a
  deletion an agent should take unprompted.

**8.1b progress, 2026-10-09 — 843 lines of provably dead code deleted.** Done by resolving
every relative import to its target file, because `./api/query` exists nine times and a
basename grep collides across features:

| Deleted | Why it was safe |
|---|---|
| `pages/EmailVerification.tsx` (105) | Posts to `/send-email-confirmation`; nothing imports it and `AuthRoutes.tsx:28` redirects `/email-verification` to `/login`, so it cannot mount |
| `Authentication/api/mutation.ts`, `Authentication/api/userQueries.ts`, `Books/api/query.ts`, `Guides/api/queries.ts`, `Profile/api/UserStatus.ts` (527) | No importer at all, test or otherwise, and no barrel re-export |
| `Favorites/api/query.ts` + its own `__tests__/query.test.ts` (211) | The test's only assertion is an Apollo cache-normalization property of a document nothing executes, so module and test are one orphan |

Verified each time with `tsc -p tsconfig.app.json` (**not** `tsconfig.json`, which checks
nothing here) and the full suite: 325/4554 unchanged for the first two, then 324/4553,
which is exactly the one deleted case.

The claim licensing all of this was checked first rather than taken on trust: of seven
non-test modules using `useQuery`/`useMutation`, five import `@tanstack/react-query` and
two match only in prose comments, so **no component executes an Apollo operation**.

**Completed 2026-10-09 — the frontend half of 8.1b is done, 1272 lines.** The last three
modules (`Books/api/mutation.ts`, `Favorites/api/mutation.ts`, `Guides/api/mutations.ts`,
429 lines) were held alive only by `features/__tests__/recommendationMutationsPublish.test.ts`.
Rather than trim those categories out of that guard and quietly shrink its reach, the guard
is **inverted** for them: three cases per retired category assert the modules stay absent,
that the feature imports no Apollo in shipped code, and that the canonical write methods are
still called. A reintroduced Strapi document now fails instead of passing unnoticed. Both
halves are mutation-verified — a stub module fails 2 cases, a vanished canonical write
fails 1 with a named message.

The replacement was checked per category before deleting: Books and Favorites use
`createMyRecommendation`/`updateMyRecommendation`/`createMyCollection`/`updateMyCollection`
(plus `reorderMyCollection`); **Guides uses `addMyGuideSection` and `writeMyGuideSection`**
— worth knowing, because a `create|update` search finds neither and it briefly looked as
though guide section writes had no canonical path at all.

The only Strapi REST call sites left in the frontend are `Checkout.tsx` and the two payment
services, kept on purpose by **D1**.

**Superseded note on why it looked non-mechanical.** `Books/api/mutation.ts`,
`Favorites/api/mutation.ts` and `Guides/api/mutations.ts` have no non-test consumer, but
their only importer is `features/__tests__/recommendationMutationsPublish.test.ts` — the
cross-category guard that every `Recommended*` write carries `status: PUBLISHED`, which is
a regression that actually shipped once. Five of the eight modules it covers (Games,
AppsAndTools, People, Products, Movies) are still live, so the guard stays; removing the
three dead ones means trimming a test whose comment says it covers "all categories", which
asserts per category that those writes are now canonical. That is migration verification
and belongs to whoever closes those categories. The other 15 Apollo modules have live
consumers, and `main.tsx`/`lib/apolloCache.ts` keep Apollo wired up.
- 8.3: the mechanical backend rename, strictly after 8.1 and 8.2.

### 13. Topology, deployment, recovery — [3.5](tickets/ticket-3-5.md), [8.4](tickets/ticket-8-4.md), [8.5](tickets/ticket-8-5.md)
- **All of this needs separate deployment authority**, so it sits outside the engineering sequence by design.
- 3.5: both mandated workflows are absent, so Q2 has no artifact producer; the QA hostname is still pending.
- 8.4: verifier, compose and routing exist but self-label synthetic, with placeholder digests.
- 8.5: prose only — every named artifact absent, no restore evidence.

## Phase D — not blocking retirement, ship on product priority

Measured: these have **zero live Strapi calls**. What is outstanding is new capability
against third-party APIs, so they can ship before or after retirement, in any order.

### 14. Provider search
- **[4.2](tickets/ticket-4-2.md) Games** — the IGDB provider chain is dead code behind an unconditional 503; four named provider cases absent; 7 MISSING provider-fact fields.
- **[4.1](tickets/ticket-4-1.md) Movies** — ~~two named cases absent by name~~ **both written 2026-10-09**
  (`e951e5b8`), and the file they live in was itself ungated until `1b966866`. The three field
  assertions at `:45` now have a traceability map: two were already covered under a
  differently-named case and "no fabricated year" was genuinely missing and was added. **The
  live TMDB provider qualification stays open** - it needs a real-provider smoke, not a fixture.
- **[3.3](tickets/ticket-3-3.md) Books** — "no Books flow requires Strapi" is unproven at an exact SHA; otherwise 20/20 verified.

### 15. Owed from the delivered category tickets
- ~~`tunes/server/test/explorers/places.test.ts` — the unit suite 5.1 names.~~ **DONE 2026-10-09**, 11 cases, three of them mutation-checked. The directories holding it were ungated, so the `contracts` job now takes `server/test/explorers` and `server/test/publicProfile` as directory arguments; see the handoff for the 79-of-176 count behind that.
- `e2e/replatform/places.spec.ts` and `place-links.spec.ts` — need the Docker fixture runner plus `suite-manifest.json` identities; **reserved to the coordinator**.
- Places seeded taxonomy and the sector browse — blocked on **D3**.
- Per-place pinning — blocked on **D5**.
- `e2e/{apps,products,people}.spec.ts` still expect the retired scraper steps. Nightly discovery only, and already failing on `main`.

### 16. Epic 9 — public discovery
- [9.1](tickets/ticket-9-1.md) MCP adapter and public tools: no module and no dependency yet. Revalidate the current MCP and OpenAI protocols when the phase starts.
- [9.2](tickets/ticket-9-2.md) discovery quality and observability: default-deny currently holds only *vacuously*.
- Prerequisite is 8.5, in step 13.

### 17. Epic 10 — linked creator tools
- [10.1](tickets/ticket-10-1.md) OAuth linking and delegated principal, [10.2](tickets/ticket-10-2.md) creator tools, [10.3](tickets/ticket-10-3.md) publication readiness.
- Resolve the one tool double-claimed between 10.1 and 10.2.
- Submission to any external directory is a separate authorized action.

---

## Decisions only the owner can make

**Nine of these were taken on 2026-10-08. The record is
[owner decisions](owner-decisions-2026-10-08.md), which is authoritative over the
table below** — D1, D2, D4, D6, D7, D10 and the 1.2 and 7.1 trade-offs are decided,
D8 is two-thirds decided with `recommendation_list.List_Name_Details` still open, and
D9 closed earlier. **D3 and D5 remain open**, and both block only Phase D.

A decision is authority to act, not delivered work: see that record's state column.

Each blocks a step above, and none is an engineering question. Source: coverage register §7.

| | Decision | Blocks | Why it cannot be assumed |
|---|---|---|---|
| **D1** | `song-limit` AI-guide and song request quotas | 9 | Live in `BillingTab`, `Checkout` and `useAIGuideQuota`; no canonical table and no authorization to drop. `revised-direction.md` defers *monetization*, which does not cover an abuse and cost control — dropping it means uncapped AI and YouTube usage at launch. Port the quota without the billing, port both, or accept uncapped and cap elsewhere. |
| **D2** | `unsubscribe` email suppression list | 7 | The only `unique:true` in the legacy schema. "No users to migrate" authorizes zero rows, not no table — new unsubscribes must be honoured from the first email sent. |
| **D3** | Places category and subcategory taxonomy values | 15 | The vocabulary is Strapi content and 5.1 forbids inventing production values. Needs an export, or an explicit decision to ship without it. Deferred to its own ticket on 2026-10-07. |
| **D4** | Claim flow scope | 3 | 18 MISSING fields across `claimable-place-profile`, `verify-claim` and `account.Is_Claimable`. Either in scope, or recorded as dropped. |
| **D5** | Per-place pinning | 15 | Strapi's `recommendedPlace.is_pinned` has no equivalent reachable through the owner API, because Places sits outside `topPickCategorySchema` by design. Needs Places added to that set, or a per-list pin of its own. |
| **D6** | Instagram import scope | 7 | Without OAuth token storage, feed import works exactly once — at authorization. In scope with token storage, or dropped. |
| **D7** | Per-field i18n (19 `account` fields, `faq`, `platform-term`, `recommendation-category`) | 7 | `revised-direction.md:47` instructs preserving language behaviour. That is an instruction to preserve, not authority to drop. Likely out of launch scope, but it needs saying. |
| **D8** | Residual unaccounted fields (register §7.5) | 7 | `account.profile_place_media_details`, `account.localtunes_public` and others have neither a canonical equivalent nor a drop record. |
| **D10** | Email/password registration and password reset | 4 | Found 2026-10-08. Canonical auth is Google-only with password auth off, by epic 2's own scope boundary, so `Register`, `ForgotPassword`, `ResetPassword` and `ResetLinkSent` have nothing canonical to move to. They work today against Strapi. Retiring them makes sign-up Google-only and removes password reset entirely — a user-visible change to how people get into the product, and the last Strapi consumer in that area either way. Either retire them, or add email/password to canonical auth and widen epic 2's boundary. |
| **D9** | Guide category vocabulary | 1 | Found 2026-10-08 while migrating Guides. `CreateGuideStep2` reads `guideCategories { Category_Name }` from Strapi, so the vocabulary is Strapi content exactly as the Places taxonomy is in **D3** — and 5.1's rule against inventing production values applies the same way. Needs an export of the existing values, or a decision to ship a fixed list. The rest of Guides does not wait on it. |

## Standing facts worth not rediscovering

- **122 of 401 legacy attributes are MISSING** — missing *structure for future content*, not unmigrated rows. TK confirmed on 2026-10-05 that the legacy Strapi instance holds nothing worth carrying over, so there is no import ticket. That does **not** reduce the structural scope.
- The shared E2E fixture module epic 4 mandated now exists, at `explorers-earth/e2e/replatform/fixtures.ts`.
- Protected browser lanes are coordinator-allocated throughout: each needs a Docker fixture runner plus `suite-manifest.json` identities.
- The Games integration suite needs its own disposable Postgres container on a port other than 55432, which is reserved.
- eslint carries 1647 warnings against a 0-error gate. The burn-down is ongoing and deliberately not sequenced here.

### 45 of the 60 documents inside live modules are now deleted — the criterion, and the five scanners

**Resolved 2026-10-09, on the second attempt.** 1,435 lines removed in `db153810`. The
first attempt removed all 60 and was reverted; the history below is kept because the wrong
criterion is the instructive part.

**The criterion is: nothing names it anywhere in the repository, AND no source scanner
requires its operation.** Both halves were necessary.

**The five source scanners**, found by sweeping the whole repo for path references to the 13
candidate files — not by any import graph, since none of these import the modules:

| Scanner | Requires |
|---|---|
| `tunes/scripts/music-fixture-profile.ts:19-21` | Settings `UsersPermissionsUser`+`UpdateAccount`; PublicHome `PublicCategoryListCounts`+`PublicAccountBasic`+`PublicProfileData` — each **exactly once** |
| `tunes/server/test/contracts/music-fixture-services.test.ts` | the same, via `checkedInGraphqlOperation` |
| `explorers-earth/e2e/music-harness-contract.spec.ts:6002` | Profile `UsersPermissionsUser`, Settings `UpdateAccount`, PublicHome `PublicProfileData` |
| `explorers-earth/e2e/contained-auth-session.spec.ts:101,130` | navigation `CategoryNavigationAccount`, asserted `toBeTruthy()` |
| `explorers-earth/scripts/music-public-prebrowser-qualification.mjs:190` | Settings `UsersPermissionsUser`+`UpdateAccount` |

**And the corpus matters as much as the rule.** The first pass scanned `src/` only, which
would have deleted `PUBLIC_APP_DATA` (dynamically imported by
`e2e/public-shell-continuity.spec.ts`) and `GAME_LISTS_BY_ACCOUNT` (named in
`e2e/games.spec.ts`). Widening to all 2,564 repository files caught both. **Scan the
repository, not the app** — and note that a runtime GraphQL interceptor keyed by operation
name (`e2e/analytics.spec.ts`) is *not* a constraint: it simply never fires once the
operation is no longer sent.

**Nine documents remain, and every one has a concrete reason: four required by a source
scanner above, five named in an e2e spec** (`PUBLIC_APP_DATA`, `GAME_LISTS_BY_ACCOUNT`,
`APP_LISTS_BY_ACCOUNT`, `MOVIE_LISTS_BY_ACCOUNT`, `PRODUCT_LISTS_BY_ACCOUNT`). Six more were
deleted in `edff0514` once re-checked.

**A warning about the analysis, because it nearly caused a bad delete.** The deadness script
reported the *first* file that named a symbol and stopped, and markdown sorted ahead of
`e2e/`. So `APP_LISTS_BY_ACCOUNT`, `MOVIE_LISTS_BY_ACCOUNT` and `PRODUCT_LISTS_BY_ACCOUNT`
were labelled "named in a ticket" while *also* being named in `e2e/apps.spec.ts`,
`e2e/movies.spec.ts` and `e2e/products.spec.ts`. Keeping all fifteen was the right call for
a reason that was wrong in three cases. **Report every match, not the first**, and confirm
each candidate with an unrestricted `grep -r` over the repository before deleting it.

#### Superseded: why the first attempt failed

Attempted and reverted 2026-10-09. Worth recording so the next attempt starts from the
right criterion rather than repeating it.

Thirteen Apollo modules survive because they export the canonical hooks
(`useGamesCommands`, `usePeopleCallerCustody`, …) *alongside* retired `gql` documents.
Inside them, **60 exported documents have no symbol reference anywhere in `src/`, not even
from a test** — e.g. `Games/api/query.ts` has 8 documents of which 7 are unreferenced,
`PublicHome/api/query.ts` 11 of 15, `Settings/api/mutation.ts` 7 of 10. Removing all 60 is
1,955 lines and **passes `tsc -p tsconfig.app.json` cleanly**.

It is still wrong, because **some consumers match these documents by content, not by name**:

- `PublicHome/components/__tests__/PublicProfile.gallery-contract.test.tsx` builds a fixture
  GraphQL registry by scanning source for a `UsersPermissionsUser` document and throws
  unless it finds **exactly one**.
- `e2e/music-public-contract.spec.ts:476` — "Music live fixture requires one checked-in
  Settings UpdateAccount document", which is `Settings/api/mutation.ts`'s
  `updateAccountMutation`.

Two were found by running the suite; **there is no reason to believe they are the only
two**, and the places that would reveal more are the ones this branch does not run — 33 of
36 e2e specs, plus the `scripts/browser-baselines/*.json` source inventories.

Note also that `tsconfig.app.json` excludes tests, so a typecheck cannot see even the
name-based breakage; the suite is the floor, and the e2e lanes are above it.

**So the criterion for deleting a document is not "nothing imports it" — it is "nothing
imports it AND no fixture scans for its shape".** Doing this properly means first
enumerating the content-scanning fixtures (grep for `requires one checked-in`, registry
builders over source text, and the browser baselines), then deleting per document with the
e2e lanes actually running. That is a reasonable next task and it needs the e2e lane
decision above to be useful, since otherwise nothing would catch a mistake.

### The server half of 8.1b is NOT entirely cutover-gated — 378 lines deleted 2026-10-09

`check-retired-dependencies.mjs` ends with "This does NOT mean Strapi is retired: the
legacy-music server still depends on it until step 12", and that line was read here (by me,
repeatedly) as *all* server-side Strapi work being gated behind the `EXPLORERS_API_MODE`
cutover. It is not. The line is true of modules the legacy runtime imports, and says
nothing about modules **neither** runtime imports.

**Method.** Walk the import closure from every real entrypoint — `server/auth/canonicalStartup.ts`,
`server/config/music-startup.ts`, `server/index.ts`, `server/api.ts` — reusing that script's
own `resolveImport` rules so the closure semantics match the gate rather than approximating
it. The union covers **172 of 189** server modules. Eight Strapi-touching files sit outside
it; three were dead.

| Outside the closure | Verdict |
|---|---|
| `reconcileMusicIdentities.ts`, `musicReconciler.ts`, `reconciliationRepository.ts`, `music-reconciliation-config.ts` | **Live.** The reconciliation command *is* its own entrypoint, with `music-reconcile.yml` and gated integration tests. "Outside the closure" meant the entrypoint list was short. |
| `config/local-public-profile-gateway.ts` | **Live.** Four importers. |
| `jwt-auth-middleware.ts`, `routes/strapiRoutes.ts`, `services/strapi-service.ts` | **Dead.** No importer anywhere in the repository; every other mention is documentation or an audit inventory. Deleted, 378 lines. |

**The trap to avoid repeating: a closure walk proves nothing until the entrypoint list is
complete.** Four live files looked dead because a CLI command and the three deployment
entries were missing from the first sweep. Enumerate entrypoints from `package.json`'s
`build`/`build:api`/`start` scripts, the Dockerfile `CMD`, and the workflows, before
believing any "unreachable" verdict.

**And run the verification from PowerShell.** The same `server/test` tree reports 168/170
files and 3,237 tests passing from PowerShell, and **84 failures** from Git Bash — 81 of
them `music-deploy-executable` hitting MSYS `whoami`. Both remaining exceptions are
environmental: `music-cli-contract` needs the gitignored `.env.music.test`, and
`music-docker-release-authority` reads the git index, so it fails if you stage anything
mid-run and passes on a static tree.
