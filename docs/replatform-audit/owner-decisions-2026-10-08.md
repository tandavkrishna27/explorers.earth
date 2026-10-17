# Owner decisions — 2026-10-08

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

TK took the decisions below in one session. This file is the record; the
[coverage register](strapi-coverage-register.md) §7 and the
[sequence doc](remaining-work-sequence.md) point here rather than restating them.

Three of these were already recorded elsewhere and are repeated only for
completeness: ticket 7.2 (legal copy into the repo), `requireRecoveryObservation`
(keep), and D9 (guide categories from the creator's own history).

**A decision here is authority to act, not a claim that the work is done.** The
"state" column says what has actually landed.

| | Decision | Taken | State |
|---|---|---|---|
| **D1** | No AI features. YouTube/song requests capped at **100 per creator per month**, surface labelled beta. Payments documented and left contained. | drop AI, cap, document | AI removed (`76224913`). Cap **not built** — Wave 2F. |
| **D2** | Unsubscribe must work. Email stays on **Resend**. | build it | Not started — Wave 2E. Adds scope. |
| **D4** | Claim flow **dropped**, not rebuilt. | drop | Done (`7399cfe1`). |
| **D6** | Instagram import **dropped for launch**. | drop | Recorded. See the finding below. |
| **D7** | Per-field i18n on `account` **dropped**. Frontend UI i18n unaffected. Widen `locale` past `["en","hi"]`. | drop + widen | Recorded. Widening is Wave 2G. |
| **D8** | Two of three residual fields resolved. The third is **still open**. | partial | See §D8 below. |
| **D10** | **Google only.** Meta/Instagram later. No email+password. The four password routes stay as redirects for one release, then get deleted. | Google-only | Already shipped; deletion scheduled for Wave 7. |
| **1.2** | Accept the red `platform:test:routes` until the cleanup step reaches the fixture. | accept red | Recorded. Do not "fix" by reverting the invariant. |
| **7.1** | Migrate the media first, **then** close the public-media boundary. | media first | **Done 2026-10-09** — and the migration proved unnecessary: the branches were already unreachable, so the close cost nothing. See the 7.1 state doc §4. |

## D1 — no AI, and the measurement changed the job

The AI features were **already unserved**. `/api/gemini/generate` has no route
handler anywhere in `tunes/server`, `musicRetirementPolicy.ts:35` classifies the
whole `/api/gemini` family as a tombstone, and `tunes/server/services/gemini-service.ts`
had zero importers repo-wide. So this was not a product removal — pressing
"Generate with AI" failed in both runtimes.

What that means for the cap: `useAIGuideQuota` was the **last consumer of the
Strapi `song-limit` table outside the contained subscription flows**, and
`song-limit` is the same table the cap replaces. Removing the AI quota and
building the cap are two halves of one change; the gap between them is not live
because the AI path was dead and `MUSIC_SUBSCRIPTION_FLOWS_ENABLED` is false.

`youtube_api_usage` (`schema.ts:190`) is **not** the counter. It records
`endpointType`/`quotaCost` against the tunes `users.id` — a Google-API cost
ledger, not a per-creator request count — and no per-user limit logic exists in
the canonical server. The cap needs a real counter keyed on the canonical
account, plus enforcement at the request path.

## D2 — unsubscribe, on Resend

**Resend is already the provider.** `tunes/server/services/email-service.ts`
sends through the Resend REST API (`api.resend.com/emails`, `RESEND_API_KEY`,
`RESEND_EMAIL_FROM`). The root `CLAUDE.md` saying AWS SES was stale and is
corrected. There is no provider migration in this decision.

What is missing is the suppression list, and **nothing exists**: a search for
`unsubscribe|suppress` across `tunes/server`, `tunes/shared` and
`tunes/migrations` returns no suppression code at all. The legacy `unsubscribe`
type was the only `unique:true` in the Strapi schema.

Four pieces, all Wave 2E: a suppression table unique on the normalised address
with `unsubscribed_at` and a source; a signed, tokenised, no-login unsubscribe
route (one-click, which is also what bulk-sender rules expect); a suppression
check **before** the Resend call; and Resend's bounce/complaint webhook writing
the same table, so the two lists cannot drift.

"No users to migrate" authorised zero rows, not no table — a new unsubscribe
must be honoured from the first email sent.

## D4 — the claim flow is dropped

18 MISSING fields, no table, no route, no contract, and nothing canonical to
move to. Removed in `7399cfe1`: the page, the route, both entry links, the
uncalled service, the three claimable `gql` documents, the claim and
verification schemas, and `auth.claimAccount` across 47 locales.

`/claimaccount` **stays a reserved first-path segment**. `PublicRoutes.tsx:30`
has a `:username/*` catch-all, so un-reserving it would make the path resolve as
whoever registers that handle, and links to it exist in the wild. It 404s now.

Consequently `account.Is_Claimable` and `account.claimable_place_profile` are
**DROPPED-AUTHORIZED**. Both had zero code references either way.

If a claim flow is ever rebuilt, the retired one's security defect must not come
back with it: it sent `Bearer VITE_PUBLIC_ACCESS_TOKEN` from the browser to
Strapi's `/upload`, a bundled credential authorising writes by any
unauthenticated visitor. An unauthenticated document upload needs a
server-issued, single-use, purpose-bound grant, the way recovery proofs do.

## D6 — Instagram import dropped for launch

Dropped because of its failure mode, not its cost. Without OAuth token storage
the import works **exactly once, at authorisation**, and then silently stops —
worse than absent, because nobody reports it.

It also sequences with D10. Token storage arrives with Meta as an identity
provider, so import becomes a cheap follow-on instead of a standalone project
needing its own token infrastructure plus Meta app review and business
verification. Don't pay for that twice.

**Finding, not covered by this decision and needing its own scope call.**
`/api/instagram` is **already a tombstone** (`musicRetirementPolicy.ts:32`, and
gated at `security-containment.ts:192`), yet the frontend still ships a live
Instagram surface against it: `pages/Instagram.tsx`, `InstagramPostImport.tsx`,
`services/instagramService.ts` and references across seven more files. This is
the same shape as the claim flow — a reachable feature that cannot work — but
removing it is a visible product change and `AddRecommendation.tsx` is entangled
with the media work in step 12, so it was **not** removed here. Decide it as its
own package.

## D7 — per-field account i18n dropped

The decision is narrower than "multi-language", and the three layers must not be
conflated:

| Layer | State | D7? |
|---|---|---|
| UI chrome and labels | frontend i18n bundles, 46 locales, shipped and working | No |
| Legal + FAQ copy | in the repo, 10 locales, per-section English fallback (ticket 7.2) | No |
| A creator's **own** profile fields translated per locale — 19 `account` attributes | one `creator_accounts.locale` column | **Yes** |

Dropped: storing a creator's bio, display name and address as separate
per-locale variants would need a multilingual authoring UI, and
`revised-direction.md:47` authorises not building one.

**But one live inconsistency gets fixed with it (Wave 2G).**
`updateAccountInputSchema.locale` is `z.enum(["en","hi"])` while the frontend
ships 46 locales, so a creator browsing in French cannot store `fr` — the write
fails validation. The enum widens to the locales actually intended, at minimum
the ten the legal copy covers. Without that, a "multi-language application" does
not round-trip the user's own choice.

## D8 — two resolved, one still open

**Corrected on 2026-10-08.** The sequence doc described D8 as
"`profile_place_media_details`, `account.localtunes_public` **and others**", and
the "and others" was carrying a field with live consumers. D8 is three fields,
not two, and it is **not** fully resolved.

| Field | Outcome |
|---|---|
| `account.profile_place_media_details` | **DROPPED-AUTHORIZED.** Zero references in `explorers-earth/src`, `explorers-earth/e2e`, `tunes/server`, `tunes/shared`, `tunes/client`. No code to remove. |
| `account.localtunes_public` | **Mapped, not ported.** Music visibility on a public profile is `account_category_settings` for `music`, which travels as `categories`. The unread typed field at `ProfileRecommendationsTab.tsx:46` is removed. The dead `localTunesvisiblity` hydration in `profileInitialValues.ts:138` stays for step 12's form cleanup, which already owns it. |
| `recommendation_list.List_Name_Details` | **CLOSED — re-measured 2026-10-09, and it was already built on the exact destination this row recommends.** The recommendation was “a typed destination: a `collection_media` thumbnail slot plus a `place_id` on the places collection”. That is what exists: `shared/explorersPlaceContract.ts:146` `legacyListNameDetails` assembles the blob from the three canonical columns its parts now live in — note from the collection's `description`, thumbnail from its `collection_media` cover, and `location`/`place_id`/`name` from `placeLocationSnapshot` (`providerPlaceId`, `address`, coordinates). **All three paths use that one function**: the public projection at `publicPlacesProjection.ts:132`, the owner view model at `placesViewModel.ts:142`, and the write path at `useCreateLocation.ts:148`. The owner view also returns `null` rather than an empty blob when snapshot, description and cover are all absent, so nothing is fabricated. Each of the three named readers is served: thumbnail for `CircularPlacesModal.tsx:276` and `ShareModal.tsx:314`, and `place_id` plus `location.address` for `AddLocationModal.tsx:144-155,179`. Zero-coordinate survival is pinned by `server/test/explorers/places.test.ts`. **No decision is needed.** The only residue is the field name inside dead `gql` documents (`Favorites/api/query.ts:28`, `mutation.ts:8,69`, `PublicHome/api/query.ts:54,130`), which execute nothing and go with step 12's deletion. Original wording: **was STILL OPEN — owner's call.** Three live readers: `CircularPlacesModal.tsx:276` (list thumbnail), `ShareModal.tsx:314` (share-card background, falling back to a hard-coded Unsplash photo), `AddLocationModal.tsx:144-155,179` (extracts `place_id` and an address for duplicate detection). Dropping it degrades the public share card and weakens duplicate detection. The register's recommendation is a typed destination: a `collection_media` thumbnail slot plus a `place_id` on the places collection. |

## D10 — Google only

Already shipped and already agreed: `ENABLE_MANUAL_AUTH: false`, `Login` has no
password field, and `ticket-2-4.md:45` records the redirect as agreed.

What this decision settles is the remaining question — the four routes
(`Register`, `ForgotPassword`, `ResetPassword`, `ResetLinkSent`) **stay as
redirects for one release, then get deleted**, scheduled into Wave 7. Reason:
password-reset links were emailed from Strapi, so those URLs are sitting in real
inboxes. A redirect to Google sign-in is recoverable; a 404 is a support ticket.

Meta/Instagram as an additional provider is future work, and it is what makes
D6's import cheap when it arrives.

## 1.2 — the red route test is accepted

`platform:test:routes` fails in CI by design. The fixture runs
`EXPLORERS_API_MODE: legacy-music` and serves none of the canonical routes, so
the route-graph invariant is unsatisfied at its root. The ticket asks for the
six legacy probes *and* canonical routes from one runtime, which one runtime
cannot do.

Accepted: leave it red until the cleanup step flips the fixture to canonical.
**Reverting the invariant restores a vacuous pass, not correctness** — that is
the thing not to do when the red mark becomes annoying. The options and their
costs stay in [the route-graph invariant](route-graph-invariant.md).

## 7.1 — media first, then close the boundary

`publicPlaceMedia.ts:35-38,59` admits any `*.amazonaws.com` host and the Strapi
origin, so hiding an attachment does not deny its bytes. It was not simply
tightened because `PublicHome.place-image.test.tsx` asserts the current
behaviour positively and closing the hole blanks images that work today.

Accepted order: migrate the media onto the canonical media route first, then
tighten the host allowance and invert those assertions. Breaking working images
for real users to fix it in one step is the wrong order.
