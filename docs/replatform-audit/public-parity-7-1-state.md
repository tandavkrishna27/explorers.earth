# Public parity — ticket 7.1, measured state

**2026-10-08.** Step 11's second package. Re-measures the four findings the 2026-10-05
independent review raised against [ticket 7.1](tickets/ticket-7-1.md), because three of them
have moved since and one has not.

Measured at `b4975654`. The headline: **three of the four are resolved, one is live and is not
decision-free.** Full 7.1 parity remains gated by the ticket's own terms — it depends on every
category producer plus Music, and 6.3 has not landed.

| Review finding | State 2026-10-08 |
|---|---|
| The overlay converts a shared fixture out from under two unmigrated importers | **Resolved** |
| P0 seam: a canonical account UUID passed as a legacy Strapi *user* subject | **Resolved** |
| The public gateway covers 3 of 9 categories and returns empty success for the rest | **Moved, then closed and locked** |
| The media boundary still admits arbitrary Strapi and S3 hosts | **Closed 2026-10-09.** Option 1, at no product cost — see §4 |

## 1. The uncommitted overlay — resolved

The review recorded the shared canonical navigation slice as existing "only in the uncommitted
working-tree overlay", requiring the fixture throw and both spec migrations in the same commit.

That is done. `e2e/setup/category-navigation.ts:435` carries the
`legacy navigation GraphQL denied` throw, and both importers it would have broken —
`category-navigation-a.spec.ts` and `music-publish-controls.spec.ts` — now open by recording
that the navigation client no longer issues the legacy `UpdateTabVisibility` mutation. The
fixture conversion did not land alone.

## 2. The P0 identifier seam — resolved

The review's stop condition was a canonical account UUID reaching
`usersPermissionsUser(documentId:)` as a legacy Strapi *user* subject, via
`features/navigation/categoryNavigationApi.ts`.

`CategoryNavigationProvider.tsx:56` now builds that API with
`createCategoryNavigationApi({ profile: explorersApiClient, isCurrent })` — the **canonical**
client. The file retains a `CategoryNavigationAccount` `gql` document and a type-only
`ApolloClient` import, and **nothing executes either**: there is no `client.query` or
`client.mutate` anywhere in it. It is retired residue, and it goes with Apollo in step 12.

**A correction to my own earlier claim, worth recording because the method was wrong even
though the conclusion held.** On 2026-10-08 I reported Apollo hook consumers at 2 and said the
frontend reads and writes nothing to Strapi through Apollo. The count came from the handoff's
command, which greps for `useQuery|useMutation|useLazyQuery|useApolloClient`. This file would
have been **invisible to it**, because it takes an `ApolloClient` as a parameter rather than
calling a hook. The conclusion survives — verified here by reading the file, not by re-running
the grep — but a non-hook executor is a blind spot in that command. Twenty-eight files still
import `@apollo/client`; all but this one hold only `gql` documents.

## 3. Category coverage — moved, then closed and locked

The review found `postgresPublicProfileGateway.ts:58` dispatching only `games`, `movies` and
`books`, with every other category falling through to `{ items: [], nextCursor: null }`, so an
all-category pass would read "category empty" rather than "unimplemented". It asked for an
explicit typed unsupported-category error, asserted by a test.

Both halves of that have moved:

- **The gateway now dispatches eight categories**, not three: `games`, `movies`, `books`,
  `apps`, `products`, `people`, `places`, `guides`. The category migrations landed.
- **There is no ninth public category to error on.**
  `publicProfilePolicy.ts:1-3` declares exactly those eight, and
  `publicProfileContract.ts:6` validates with `z.enum(PUBLIC_RECOMMENDATION_CATEGORIES)`. So
  `music` — whose producer is 6.3 — is rejected by the parser, and the route answers
  **400 BAD_REQUEST** (`explorersPublicProfileRoutes.ts:70`), never an empty success. The
  gateway's empty fall-through is unreachable through the route.

So the masking the review guarded against is gone, and **the risk has inverted**: it is no
longer "a category with no producer answers empty", it is "a category is added to the enum
before its producer lands", which would route straight into that same fall-through and
reintroduce the identical failure.

`tunes/server/test/contracts/public-category-coverage.test.ts` is written against the inverted
risk. It is **driven by the enum rather than a hand-written list**, so the guard cannot go
stale:

- every declared category reaches a real projection, on both the category and detail reads,
  proved by recording statements through `query` *and* `connect` (some projections check out a
  client for a `REPEATABLE READ READ ONLY` transaction, so watching only `query` would make a
  dispatched category look undispatched);
- a category with no landed producer is rejected by the contract rather than served an empty
  page;
- the enum itself is pinned, so widening it is a deliberate act.

Two mutations confirm it fails for its own reasons: adding `music` to the enum without a
producer fails **all four** cases, and removing the `apps` dispatch fails the coverage case.

One assertion was wrong in my first draft and is worth recording: I asserted the detail read
returns something non-`undefined`. `undefined` is the *correct* answer for a detail read that
finds nothing, and against an empty stub database every category legitimately finds nothing —
so the return value cannot distinguish a dispatched projection from the fall-through. The
statement record can, and that is what the case asserts now.

## 4. The media boundary — CLOSED 2026-10-09

**Resolved as option 1, and the cost the three options were weighing turned out not to
exist.** TK chose "migrate the media, then close". Measuring what had to be migrated showed
there was nothing: the two legacy branches were already unreachable, so the close is
behaviour-preserving and the migration was unnecessary.

What was measured, before changing anything:

- `publicPlacesProjection` emits `mediaUrl(id)` — `/api/explorers/v1/media/{id}/content` —
  and nothing else for **all four** inputs `resolvePublicPlaceImage` reads: `Photos` (:62),
  `media_details.imageDetails` (:67), `Media` (:68) and `List_Name_Details.thumbnailUrl`
  (:132). Its own comment at :61 states "Owned media, never a provider URL", and :21-24
  record the 2026-10-07 owner decision that media is stored in S3 but served through the
  media route.
- The one `external_url` on the public path, `postgresPublicProfileGateway:51`, is inside
  `Feed_Data`, which never reaches this function.
- The public-profile routes are mounted in **both** runtimes, so this is not a
  canonical-only argument.
- And `remaining-work-sequence.md:708` records TK's 2026-10-05 confirmation that the legacy
  Strapi instance holds nothing worth carrying over — so there is no legacy media to move.

So "tightening blanks images that work today" was false: nothing renders by those shapes.
The allowance was a bypass with no beneficiary.

`publicStrapiOrigin` went with it, which also clears one of the eleven display-time
`VITE_REST_API_URL` legacy-media reads step 12 has to remove (19 non-test lines, was 20).

**The assertions were translated, not deleted**, per this ticket's own rule. Source
precedence, the fallback chain, the default image and the rejection of untrusted
third-party hosts are all still asserted — with the canonical media route standing in for
"saved media" where an S3 URL used to. Three new negatives cover what is now refused: the
S3 shapes, a bare `/uploads/...` path, a Strapi-origin upload URL, a bypass in *every*
source slot rather than only the first, and that a refused source still falls through to a
canonical one later in the chain rather than abandoning it.

`PlaceOverview.public-theme.test.tsx` needed the same translation for two cases — the hero
fallback to `Place_Details.Photos`, and skipping an untrusted `imageDetails` entry for SEO.

Verified: frontend 321 files / 4506 tests passing, against a 4503 baseline — the delta is
exactly the three new negatives. Mutation-checked: restoring the S3 host allowance fails
precisely those three.

## 4a. The original three options, for the record

`explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts` still resolves a saved
media URL by admitting, beyond the canonical same-origin media route:

- `/uploads/...` paths, prefixed with `publicStrapiOrigin()` (`:50`);
- any URL whose origin equals `publicStrapiOrigin()` (`:59`);
- **any `*.amazonaws.com` S3 host**, via `isAmazonS3Host` (`:35-38`).

The ticket requires the opposite: "admit only the controlled same-origin media-content route
alongside explicitly retained approved provider imagery; do not introduce a generic URL proxy",
and "upload URL bytes fetched after hiding the only public attachment must be denied
independently of the page cache".

**The S3 allowance is precisely the bypass the review named,** and the canonical side confirms
why it matters rather than contradicting it. `publicPlacesProjection.ts:43` emits media as
`/api/explorers/v1/media/${id}/content` and nothing else, and its own note records the owner
decision of 2026-10-07: media is **stored** in S3 but **served through the media route**. The
route is the gate that applies visibility; a direct `*.amazonaws.com` URL skips it. So hiding
an attachment does not deny its bytes.

**Why this was not simply tightened.** `src/features/PublicHome/components/__tests__/PublicHome.place-image.test.tsx`
**asserts the current behaviour positively** — it builds `https://saved-media.s3.amazonaws.com/...`
URLs and expects `resolvePublicPlaceImage` to return them, across legacy Strapi-shaped fields
(`List_Name_Details`, `Media`, `thumbnail`). Tightening the boundary inverts those assertions,
which means deciding that legacy S3-shaped media stops rendering on public pages. That is a
visible product change, and the review's own rule for this ticket applies: translate the
assertions, do not delete a negative one to make a new boundary pass.

The decision, with its cost:

1. **Tighten to canonical-only now.** Closes the bypass immediately. Any public item whose
   media is still only reachable as a legacy S3 or Strapi URL renders the default placeholder
   instead of its image, until the media migration (step 12) moves it behind the media route.
   Needs the existing place-image assertions rewritten to expect rejection.
2. **Tighten with an explicit retained-provider allowlist** — same-origin media route plus the
   named approved provider imagery the ticket mentions, and nothing else. More faithful to the
   ticket, more work, and it needs the list of approved providers stated.
3. **Defer to step 12**, when the media migration removes the legacy URL shapes and the
   allowance becomes dead rather than load-bearing. Leaves the bypass open until then.

I did not pick: option 1 blanks images that work today, and option 3 leaves a visibility bypass
open. That trade is the owner's.

## What full 7.1 still needs, by the ticket's own terms

**Updated 2026-10-09: `publicVisibility.integration.test.ts` now exists** (`d800a791`,
plus the media case) with seven cases against a real PostgreSQL 15 fixture, wired into
CI's `database` job in the same commit. It discharges: the 53-item multi-page traversal,
ETag invalidation after unpublish, the same slug under two accounts, the
missing/private/archived equivalence, the mid-traversal continuation refusal, and the
media-bytes denial after the only public attachment is hidden.

**One requirement could not be met as written, and that is a finding, not a gap.** The
ticket asks for "53 items with duplicate order values". `collection_items` carries
`UNIQUE(collection_id,display_order) DEFERRABLE INITIALLY DEFERRED`
(`0029_explorers_recommendations.sql:56`), so duplicates are rejected at COMMIT. The
requirement was written against Strapi, where order was a plain integer and a duplicate
was an ordinary state a reader had to survive; the canonical schema makes it unreachable.
The suite asserts the constraint instead, including that it is deferred — a reorder must
be able to pass through a duplicate mid-transaction, which an immediate constraint would
forbid.

Worth carrying from the mutation testing: **the continuation refusal is defended three
times** (the projection's `s.is_public` gate, and both halves of `freshBooksRead`'s
before/after check), so no single mutation fails that case. It is a test that the cursor
carries no authority of its own, not a test of any one check.

**Also now covered** (`0ecb7eea`, `+ the matrix commit`): reserved handle protection —
which nothing asserted anywhere before, a search for `Handle is unavailable` across
`server/test` returning zero files — and the table-driven visibility matrix across
owner / other-owner / anonymous, over private, unpublished and archived collections.

Two things the matrix work established that are easy to get wrong:

- **Archiving hides a collection from its owner too.** `statusPredicate` filters on
  `archived_at IS NULL` unless the request asks for `archived` or `all`
  (`ownerContent.ts:37`), so "visible to its owner" holds for private and unpublished
  collections but for an archived one only with an explicit status filter. The first
  draft of that row asserted the default read and failed, correctly.
- **The refusal to a second signed-in creator must be indistinguishable from "no such
  id".** A separate case asserts same status and same message for a stranger's private
  collection and a random UUID, because a distinguishable refusal tells a logged-in
  stranger that a private list exists.

Still not addressed: the nine-route pin checks — category dispatch is already pinned
enum-driven in `contracts/public-category-coverage.test.ts`, so what remains is HTTP
route pinning rather than producer coverage — and `public-parity.spec.ts`, which does not
exist and which the ticket makes dependent on 6.3. The ticket also states full
parity depends on every category producer and Music; **6.3 has not landed**, so the Music
public/unlisted/revoked semantics it requires cannot be exercised yet.

## Reproducing

```powershell
# category coverage (PowerShell: Git Bash fails two music-local-state cases environmentally)
cd tunes; npx vitest run server/test/contracts/public-category-coverage.test.ts

# the current media-boundary behaviour, which option 1 would invert
cd explorers-earth; node scripts/run-contained-vitest.cjs run src/features/PublicHome/components/__tests__/PublicHome.place-image.test.tsx
```
