# Dashboard phase: build plan (2026-10-23)

Scope: every SETTLED and SETTLED (delegated) dashboard item in `docs/scope/explorers-scope-2026-10.md` (IDs below refer to it), all OWN-* bug fixes (root causes in PR #187) and the UAT leftovers, across all 8 categories. Public pages, private sharing, saving others' lists, the plugin and monetisation are LATER and not in this plan.

Approved mocks: v3 https://claude.ai/artifact/D89UZnowRi1R9veMbYeWtb, v4 Guides https://claude.ai/artifact/EQhDwNgFuhBnYM94xs964Q (with v4.2 day structure), v5 controls https://claude.ai/artifact/UDhwrVqLBNh8xKtZpppf6v.

Paths: SPA = `explorers-earth/src/`, API = `tunes/server/`, contracts = `tunes/shared/`, migrations = `tunes/migrations/`.

## Rules for every package

- Branch from current `main`; one PR per package; **merge commits only**; no model names in commits; repo is public (no secrets, IPs or hostnames).
- Stay inside the package's file list. If a change is needed outside it, stop and coordinate through the owning package rather than editing.
- Migrations: numbers are **reserved below**; only the package that owns a number writes it. Follow the migration-chain checklist (runtime privilege matrix and function inventory for new tables/functions, no TRUNCATE triggers, OCI fixture regeneration, pinned migration-head strings in tests such as `games.integration.test.ts`). Migration PRs merge **one at a time, in number order**; a package whose predecessor is not merged rebases and keeps its reserved number.
- Every package keeps both typechecks and the whole frontend unit lane green (the lane is the only cross-package gate for DTO shape changes):

```bash
cd explorers-earth && npx tsc -p tsconfig.app.json --noEmit
```

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

```bash
cd tunes && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "^(shared|server)/" ; npx vitest run server/test/
```

- Integration tests (any package with a migration or repository change) run against a disposable Postgres matching CI (see the local test recipe: `postgres:15-alpine`, `DATABASE_URL_TEST`, the `MUSIC_C*_POSTGRES_TEST=1` flags):

```bash
cd tunes && npm run test:integration
```

- Each package adds or updates UAT board cases (area per screen) for the flows it changes (DIR-09).

## Reserved migration numbers (head today: 0064)

| No. | Package | Purpose |
|---|---|---|
| 0065 | WP0 | Partial unique index on collections slug `WHERE archived_at IS NULL` (OWN-01) |
| 0066 | WP3B | Slug redirects table (old slug → list) for LP-09 |
| 0067 | WP7 | Curated taxonomy catalogs for movies, books, games, apps, products (DS-07) |
| 0068 | WP8 | Products: single link + offer merge, specs cap; People: drop rating + follower count (DS-02..DS-06, DS-09) |
| 0069 | WP9 | Guide items: ordered list per day + nullable `time_label`; migrate slot data (GD-23, GD-31) |
| 0070 | WP10 | General list ↔ list links (replace Places-only place links) (LNK-01, LNK-09) |
| 0071 | WP11 | `is_sample` on collections + sample seeding receipts (SMP-08) |

## Order and parallelism

```
Wave 0 (serial)   WP0  P0 bugs
Wave 1 (parallel) WP1 Shell+nav+loader | WP2 Publish pill+add button+nudge | WP3A Category page | WP3B List page | WP4 Add-item template | WP5 Performance
Wave 2 (parallel) WP6 Places | WP7 Movies/Books/Games + taxonomies | WP8 Apps/Products/People + prefill
Wave 3            WP9 Guides
Wave 4            WP10 Linking
Wave 5            WP11 First-visit samples
Wave 6 (serial)   WP12 Local proof → deploy → live re-test
```

Wave 1 packages touch disjoint files. WP3A/WP3B consume WP2's components through a stable props interface agreed up front (below), so they can start in parallel and wire in when WP2 merges.

---

## WP0: P0 bugs (OWN-11, OWN-01)

- **Files:** `features/Favorites/hooks/useAddRecommendation.ts`, its tests; `tunes/migrations/0065_*.sql`; `tunes/server/repositories/explorersRecommendationRepository.ts` (only if the archive path needs to stay consistent); migration integration test.
- **Changes:**
  - OWN-11: `creatorSocialUrl: profile(values.recommendationLink) ?? …`; the form refuses values that still don't normalise.
  - OWN-01: migration 0065 drops `UNIQUE(account_id,category,slug)` and creates a partial unique index `WHERE archived_at IS NULL`.
- **Depends on:** nothing.
- **Acceptance:** a place with "recommended by" `@handle` or `instagram.com/x` saves; archiving "paris" then creating a new "paris" list succeeds; a duplicate among non-archived lists still returns 409 `listUrlTaken`.
- **Tests:** unit case for `@handle` on a place; integration test for archived-slug reuse and live-slug conflict.

## WP1: Shell, navigation, loaders, toasts (GL-02, GL-03, GL-05, OWN-05, OWN-18, OWN-06, OWN-08 loader part, SCR-03)

- **Files:** `routes/ProtectedRoutes.tsx`, `routes/PublicRoutes.tsx` (loader only), `routes/validators/TabVisibilityGuard.tsx`, `layouts/PublicColdEntryBoundary.tsx`, `pages/Home.tsx`, `pages/Favorites.tsx` (routing/loading conditions only), `features/Favorites/hooks/usePlacesOwner.ts`, `components/EarthLoader/*`, `components/Loader.tsx`, `components/RouteLoader.tsx`, new `lib/navigation/originBack.ts`, toast modules (`LandingPage/hooks/use-toast.ts`, `hooks/useToast.ts` removed; callers moved to `sonner`).
- **Changes:**
  - Addressable list routes `/recommendations/<category>/<listId>` for every category including Places; Places list selection read from the URL, not a store (OWN-05).
  - `originBack` helper: navigations into list/add/guide pages pass `state.from`; Back uses it, falling back to the category page.
  - Home place click navigates to the list route (OWN-18).
  - Manage/tab switching: `(loading && !cities) || !accountById`, background-refresh indicator, no `refetchCities()` on tab click (OWN-06).
  - One loader owner: globe splash only at boot with "Getting your recommendations ready…"; skeletons elsewhere; `TabVisibilityGuard` renders nothing while the cold-entry boundary is pending (OWN-08 loader part).
  - Single toast system (`sonner`, bottom centre).
- **Depends on:** WP0 merged (shares nothing, but keeps the chain simple).
- **Acceptance:** from Home, a place opens its list; Back from add-item, linked list and add-linked pages returns to the origin list; Manage tab switch shows no full-screen loader; public list cold entry shows one loader; only `sonner` remains (grep).
- **Tests:** router tests for origin back (deep link fallback), Home navigation test, loading-condition test, a grep test that the two old toast modules are gone.

## WP2: Publish pill, phone bottom add button, publish nudge (GL-08, GL-04, OWN-02, CAT-08, PRIV-06, LP-10)

- **Files (new):** `components/controls/PublishPill.tsx`, `components/controls/BottomAddButton.tsx`, `components/controls/PublishNudge.tsx`, `hooks/usePublishNudge.ts`, their tests and stories. Removes the category modal/`history.replaceState` nudge code in `pages/Favorites.tsx` L154-222 equivalent and per-category publish prompts (delete only; callers rewired in WP3A/WP3B).
- **Interface (agreed now so WP3A/3B/9 can code against it):**
  - `<PublishPill kind="category" value="public|hidden" onChange />` and `<PublishPill kind="list|guide" value="draft|public" privateComingSoon onChange />`; menu ticks current, one-line explanation each; "👥 Private — coming soon" disabled.
  - `<BottomAddButton label onClick hidden />`: full width, ~56px, safe-area aware, shrinks on scroll down and restores on scroll up; renders only below the phone breakpoint.
  - `usePublishNudge(listId, itemCount, status)`: offers after the 3rd item or on leaving a draft list with items; never on empty; "Not now" suppresses per list per session; router-state driven.
- **API:** none (uses existing visibility commands).
- **Depends on:** WP0.
- **Acceptance:** pill renders identically in all three kinds; keyboard and screen-reader operable; bottom button behaviour on 375px; nudge never fires on an empty list.
- **Tests:** component tests for each pill kind and menu, scroll behaviour of the bottom button, nudge rule table test.

## WP3A: Category page template + Top Picks + New list popup (CAT-01..09, NL-01..05, OWN-16, GL-06 for list cards)

- **Files:** new `features/shared/category/CategoryPage.tsx`, `features/shared/category/ListCard.tsx`, `features/shared/topPicks/TopPicksHero.tsx`, `features/shared/topPicks/TopPicksManager.tsx`, `features/shared/lists/NewListDialog.tsx`; the eight `*Home.tsx` pages (`MoviesHome`, `BooksHome`, `GamesHome`, `AppsHome`, `ProductsHome`, `PeopleHome`, `GuidesPage` category part, Places category part of `pages/Favorites.tsx`) become thin wrappers; delete `TopPicksManager`, `TopReadsManager`, `TopGamesManager`, `AppTopPicksManager`, `ProductTopPicksManager`, `PersonTopPicksManager` and Places' Featured; per-category create-list modals and `useCreateLocation` UI.
- **API:** collection create accepts Places location as optional data on a normal list (multiple lists per city, NL-04); social link + note move to collection update (NL-05). Changes in `tunes/server/application/recommendations.ts` create path and `explorersPlaceContract.ts` list snapshot only.
- **Depends on:** WP2 interface (stub until merged), WP0 (0065 makes multiple same-city lists safe).
- **Acceptance:** all 8 category pages render from one template; Top Picks always visible with empty and first-visit states; Manage Top Picks never disappears; list cards: no "Open", whole card clickable, names wrap, desktop compact toggle, phone ⋯ publish; drag-and-drop list-card reorder saves; New list popup identical everywhere, Places adds Location, lands on the new list.
- **Tests:** template snapshot per category, Top Picks manager tests (pin/unpin/order), NewListDialog tests incl. Places location and duplicate-city allowed.

## WP3B: List page template, Share/QR, Manage, slug redirects (LP-01..10, OWN-07, OWN-14, GL-06 for items)

- **Files:** new `features/shared/list/ListPage.tsx`, `ListTabs.tsx`, `RecommendationsTab.tsx`, `ShareTab.tsx`, `ManageTab.tsx`; `components/ShareModal.tsx` (QR capture moves into `ShareTab`; modal removed or thinned); the eight `*ListView.tsx` components become wrappers; `components/reorder/*` (drag-and-drop primary, arrows keyboard-only); API `tunes/server/application/recommendations.ts` (archive frees slug, delete), slug-redirect read in `tunes/server/application/ownerContent.ts` + public resolver; `tunes/migrations/0066_*.sql`.
- **Changes:**
  - Three tabs mounted once (no remount on switch); pill top right (WP2).
  - Share: link, Copy, QR card with full-size Download (`toPng` with explicit width/height, no transform override, pixelRatio 2), social share.
  - Manage: name, description, cover, slug (editable; old slug stored in `collection_slug_redirects` and resolved to the list), Places social link + note, Archive (restorable via "Archived" filter) and Delete (in-page confirm). No duplicate Published toggle; no per-item Draft/Publish.
  - Items: drag handle reorder, ☆ pin, ⋯ menu.
- **Depends on:** WP0 (0065), WP2 interface, WP1 routes (merge after WP1).
- **Acceptance:** downloaded QR is complete on 375px and desktop and scans; tab switch has no reload; renaming a slug keeps the old URL working; archive frees the slug; delete is permanent.
- **Tests:** QR export test (image dimensions equal element size × ratio), slug redirect integration test, archive/delete integration tests, tab-mount test.

## WP4: Add/edit item template (ADD-01..05, ADD-10, ADD-13, OWN-03, OWN-04, OWN-09, OWN-12)

- **Files:** new `features/shared/addItem/AddItemPage.tsx`, `StickyActionBar.tsx`, `ItemSearch.tsx` (search + "Can't find it? Add manually" link + empty-state button + Back to search, typed text carried), `PickedItemCard.tsx`, `components/StarRating.tsx` (5 stars, half-steps, value 1-10, tap to clear, arrows), `components/TaxonomyCombobox.tsx` (searchable, two-level for Places).
- **Changes:** template only; categories adopt it in Wave 2. Save spinner inside the button; no full-screen saving overlay; actions Cancel / Save and add another / Save.
- **Depends on:** WP0.
- **Acceptance:** template story renders search, manual, picked and saving states on 375px and desktop; StarRating round-trips 1-10 ↔ half stars; combobox filters 335 terms quickly and never overlaps text.
- **Tests:** StarRating mapping table, ItemSearch carry-over, combobox keyboard tests, sticky bar visibility test.

## WP5: Performance (OWN-17, OWN-19, GL-07)

- **Files:** `tunes/server/application/movieMediaImport.ts`, `tunes/server/application/media.ts` (batching only), `tunes/server/repositories/explorersRecommendationRepository.ts` media INSERT loop (`:59-62`), a background job hook for movie imports (reuse the existing worker pattern used by app enrichment); SPA `features/Favorites/api/placesCommands.ts`, `features/Favorites/api/explorersAdapter.ts`, `features/Favorites/api/placesViewModel.ts`, `features/Movies/api/moviesClient.ts`, the `/me` query hook (single query key).
- **Changes:**
  - Movies: navigate when the create returns; TMDB image import runs async with 3-4 parallel fetches and one progress write per image; drop the discarded GET.
  - Places: `refresh=false` on intermediate commands, invalidate once at the end (or patch the cache); upload photos in parallel (cap 3) before create and send ids on create (removes PATCH + GET).
  - Home: dedupe `/me` (one query key).
  - Server: one `INSERT … SELECT unnest(...) WITH ORDINALITY` for media.
  - OWN-19: provider-photo fallback when no uploaded media; per-list read failure retries then shows an error row instead of dropping the list.
- **Coordination:** WP5 touches `AddMoviePage.tsx` and `useAddRecommendation.ts` only in their save functions; WP6/WP7 rebuild those pages on the WP4 template **after** WP5 merges and keep its save logic.
- **Depends on:** WP0 (shares `useAddRecommendation.ts`; merge after it).
- **Acceptance (measured on a local stack with 185 ms injected latency, then live):** provider movie add perceived save ≤ 1.5 s (was 3-10 s); 3-photo place add issues no owner reload until the end; Home shows content after one `/me`; no list silently missing.
- **Tests:** movie import job tests (parallelism, idempotency, progress), places command invalidation test, media batch insert integration test, view-model fallback tests.

## WP6: Places on the new templates (ADD-06..10, ADD-09/DS-10, NL-03..05 UI, OWN-09, OWN-10, OWN-03)

- **Files:** `features/Favorites/components/AddRecommendation.tsx`, `RecommendForm.tsx`, `AddPlaceOverlay` (deleted), `features/Favorites/hooks/useAddRecommendation.ts` (form parts; WP5 save logic kept), new `features/Favorites/components/PlaceSearchField.tsx` (name or `lat, lng` regex, ◎ my location, map icon), `PickOnMapSheet.tsx`, nearby lookup client with per-rounded-area cache; server nearby-search endpoint (basic fields only) in the existing places provider route; `explorersPlaceContract.ts` (remove `recommendationType: person` from new writes; keep reads of old rows).
- **Changes:** Places add uses the WP4 template; coordinates resolve to a pin plus nearest named places; geolocation only on tap; OSM fallback; Instagram scraper off by default; legacy note left readable (data migration deferred, no new number needed).
- **Depends on:** WP4, WP5, WP3A.
- **Acceptance:** add a place by name, by `15.49, 73.82`, by my-location and by map pin; category/subcategory picker works; no Person type; nearby lookup cached on repeat taps (network log).
- **Tests:** coordinate parser table, nearby cache test, form tests for the four entry paths, contract test that person-type writes are refused.

## WP7: Movies, Books, Games + curated taxonomies (DS-07, DS-15, DS-01 display, UAT-01..04, Games developer)

- **Files:** `features/Movies/components/dashboard/AddMoviePage.tsx` (form; WP5 save kept), `features/Books/**/AddBookPage.tsx`, `features/Games/**/AddGamePage.tsx`, their detail modals; `explorersMovieContract.ts`, `explorersBookContract.ts`, `explorersGameContract.ts`, `explorersGameOwnerContract.ts` (add `developer`), `explorersTaxonomyContract.ts` (allow the five new categories, flat), taxonomy fixtures + apply command inputs; `tunes/server/application/bookCoverImport.ts` (UAT-03); i18n `ar` "Itinerary" (UAT-04); `tunes/migrations/0067_*.sql`.
- **Changes:** curated term lists drafted for Movies (genres mapped from TMDB), Books (~25 from subjects), Games (from IGDB genres), Apps (~20) and Products (~20); applied with the existing reviewed taxonomy-apply flow (receipts); `movieTerms` mapped onto the curated list; surface runtime/seasons; developer from IGDB `involved_companies`; stop fetching unused IGDB fields; provider rating as a source chip; game platform chips all shown (UAT-01); Enter triggers game search (UAT-02); book covers served from our stored copy (UAT-03).
- **Depends on:** WP4, WP5. WP8 depends on 0067.
- **Acceptance:** each category's add flow on the template with search-first; every new item can carry a curated category; provider rating never appears on the owner's star scale.
- **Tests:** taxonomy contract tests for the new categories, apply dry-run fixture tests, migration integration test, game platform/Enter tests, book cover source test.

## WP8: Apps, Products, People + paste-a-link prefill (DS-02..06, DS-08, DS-09, DS-11, DS-12, DS-14, ADD-11, ADD-12, ADD-14, OWN-15, OWN-20)

- **Files:** `features/AppsAndTools/**/AddAppPage.tsx`, `features/Products/**/AddProductPage.tsx`, `ProductDetailModal.tsx`, `features/People/**/AddPersonPage.tsx`, person detail; `explorersAppContract.ts`, `explorersProductContract.ts`, `explorersPersonContract.ts`; `tunes/server/application/appEnrichmentWebsiteAdapter.ts` + `appEnrichmentProviderCore.mjs` generalised into a `linkPreview` service (`{title, description, imageUrl, siteName, product?, person?}`, OG/Twitter/JSON-LD + oEmbed, SSRF guard, timeout, size cap); `appEnrichmentAppleAdapter.ts` gains keyword search; `tunes/migrations/0068_*.sql`.
- **Changes:**
  - Products: "Product photo" (upload or from preview), brand, one "Where to buy" link (migration merges `productUrl` and `offer.buyUrl`, keeping old rows readable), price with inline currency selector defaulting to locale, ≤8 key specs, affiliate-disclosure toggle; brand-logo URL removed.
  - Apps: one link + optional other-platform links (merge `downloadUrl`), iTunes keyword search, preview fills icon/developer/screenshots; price model keeps four values.
  - People: name, photo, headline, required sector, profile link with platform auto-detect, ≤4 extra social links, location; rating and follower count removed (existing values dropped by 0068 after a backup-verified deploy); skills as plain tags.
- **Depends on:** WP4, WP7 (0067).
- **Acceptance:** pasting a product page URL prefills photo/brand/price/currency where published; pasting a profile URL prefills name/photo/headline where public; Apps search returns iOS/macOS apps; the old two-URL rows still read.
- **Tests:** link-preview parser fixtures (Product, Person JSON-LD, OG-only, blocked, oversize, SSRF), iTunes search adapter test, money semantics regression, migration integration test, form tests.

## WP9: Guides (GD-02..11, GD-16..31, CAT-09, LNK-08 UI shell, SMP-10 hook)

- **Files:** `features/Guides/**` (GuidesPage category part via WP3A template, new `GuideEditor/` with `DayStrip.tsx`, `DayList.tsx`, `SmartAddBox.tsx`, `MyListsPanel.tsx`, `TimeLabelChip.tsx`, `PlanChips.tsx`), `NewGuideDialog.tsx` (replaces CreateGuideStep1-3), guide Share/Manage tabs from WP3B; `explorersGuideContract.ts`; `tunes/server/application/guides.ts`; `tunes/migrations/0069_*.sql`.
- **Data/API:**
  - 0069: guide day items as an ordered list (`position`) with nullable `time_label` (enum label or `HH:MM`), item source (`list_item_ref` / `place` / `note`); migrate existing morning/afternoon/evening picks to ordered items with labels (GD-31); `numberOfDays` kept in sync.
  - Commands: `addDay(at?)`, `moveDay(from,to)`, `duplicateDay`, `clearDay`, `deleteDay` (refuses the last day), `addDayItem(day, at?, source)`, `moveDayItem(itemId, toDay, toIndex)` (single command, Undo), `setTimeLabel`, `removeDayItem` (never touches the source list item). Each is one API call the plugin can reuse later (DIR-07).
  - Tags/best months/budget optional; 4-tag minimum removed; free-text categories → core picker.
- **UI flow (GD-24..30):** day strip with "+ Day"; desktop dashed "+ Add to day" row, phone bottom button "+ Add to Day N"; smart box in place (saved items → Google → "Add as a note"), stays open for the next item; drag within/between days and onto day chips; "Move to day…" in the item menu; day grip drag or ⋯ Move earlier/later; time headings only when labels exist; Plan | Share | Manage; Itinerary always, Stay/Transport/Budget/Tips as "+ Add" chips; My lists panel (desktop) / bottom sheet (phone) with Map tab.
- **Depends on:** WP2, WP3A, WP3B, WP4 (search field), WP6 (place search component).
- **Acceptance:** create a Trip in the popup and land in the editor; add from my lists, Google and note; reorder within a day; move across days by drag, chip drop and menu; insert/duplicate/clear/delete days with Undo; existing guides render with their old slot picks as labelled items; publish via pill; 375px works with the bottom button.
- **Tests:** guide contract tests, command integration tests (ordering invariants, last-day refusal, move atomicity), migration test with a pre-0069 fixture guide, editor interaction tests (drag, keyboard move, time-heading grouping).

## WP10: Linking any list ↔ any list (LNK-01..09, OWN-13)

- **Files:** `explorersPlaceLinkContract.ts` → new `explorersListLinkContract.ts`; link application/repository code; `tunes/migrations/0070_*.sql`; SPA `features/shared/list/LinkedListsSection.tsx`, `ManageTab` linked-lists panel (attach picker with "Create a new list" via `NewListDialog`), guide-level roles in Manage; remove `AddLinkedPeoplePage`/`AddLinkedProductsPage` and Places' People/Products tabs.
- **Changes:** links between any two of the owner's own lists, one level deep, with an optional role label (used by guides); migrate existing place links; Detach with Undo; public projection only exposes links to publicly visible lists (public rendering itself is LATER).
- **Depends on:** WP3B, WP9 (guide Manage tab), WP1 (origin back).
- **Acceptance:** link Places ↔ Books/Apps/People/Products and Guide ↔ Products packing list; detach and undo; opening a linked list and Back returns; old Places links still present after migration; a draft linked list never appears in the public projection.
- **Tests:** link contract tests (own lists only, no self-link, one level), migration test from place links, projection visibility test, UI tests.

## WP11: First-visit samples (SMP-01..10)

- **Files:** sample fixtures `tunes/server/fixtures/samples/{india,global}/v1/*.json` (drafted content), seeding in account onboarding completion (`tunes/server/application/accountLifecycle.ts` or the onboarding command), publish paths + public read model refuse `is_sample`, `makeItMine` and sample delete commands; `tunes/migrations/0071_*.sql`; SPA Sample badge on list cards and Top Picks (not on All Recommendations), "Make it mine" and delete actions, pill disabled with "Samples can't be published".
- **Changes:** country from onboarding picks India or Global; places samples resolved to real Google places at fixture-authoring time (stored ids, no runtime cost); deleted samples recorded so they never reseed.
- **Depends on:** WP3A, WP3B, WP9 (sample guide), WP7/WP8 (field shapes).
- **Acceptance:** a fresh account sees 2-3 samples per category localised by country; Make it mine converts in place to a draft; delete is permanent and never returns; samples never appear on the profile or public endpoints.
- **Tests:** seeding idempotency integration test, publish-refusal tests on every publish path, public read-model exclusion test, Make it mine test.

## WP12: Local proof, deploy, live re-test

1. Merge order check: all packages merged with merge commits; migration head is 0071; `main` CI green.
2. **Local proof:** fresh worktree, `npm ci` in root, `tunes`, `explorers-earth`; run both typechecks, the frontend unit lane, the tunes unit and integration lanes and the Playwright dashboard flows; click through every flow in scope §3/§5/§6 at desktop and 375px on the local stack; record results on the UAT board (new and updated cases per DIR-09).
3. **Restore drill at the new head (0071):** run the platform restore drill against the latest backup manifest with the backup identity and drill credentials (owner-held; never printed), commit the refreshed `docs/replatform/evidence/recovery-receipt.json` via PR, merge. A receipt at an older head fails the deploy with `DRILL_MARKER_MISMATCH`.
4. **Re-publish the image** from that exact `main` commit: `tunes.yml` with `publish_image=true`, `deploy_music=false`; take the digest from the publish job. The deploy verifies the attestation against the commit, so any later commit needs a re-publish.
5. **Deploy:** `explorers.yml` with `confirm_cutover=replace-explorers-host` and the digest; the owner approves the `explorers-production` environment. The deploy takes its own pre-deploy backup and runs 0065-0071.
6. **Taxonomy apply** for the five new catalogs (dry run, then apply, receipts recorded) via the owner's server agent.
7. **Live re-test** on https://explorers.earth with the test account: every OWN case, UAT leftovers (UAT-01..04, clean up UAT-07), every new dashboard case; measure OWN-17 timings against the WP5 targets; record on the board; the owner runs the 55 owner-only cases (UAT-08).
8. Hand over to the public-pages phase.

## Package summary

| Package | Wave | Migration | Depends on |
|---|---|---|---|
| WP0 P0 bugs | 0 | 0065 | — |
| WP1 Shell, navigation, loaders, toasts | 1 | — | WP0 |
| WP2 Publish pill, bottom add, nudge | 1 | — | WP0 |
| WP3A Category page + Top Picks + New list | 1 | — | WP0, WP2 iface |
| WP3B List page + Share/QR + Manage | 1 | 0066 | WP0, WP1, WP2 iface |
| WP4 Add-item template | 1 | — | WP0 |
| WP5 Performance | 1 | — | WP0 |
| WP6 Places | 2 | — | WP3A, WP4, WP5 |
| WP7 Movies/Books/Games + taxonomies | 2 | 0067 | WP4, WP5 |
| WP8 Apps/Products/People + prefill | 2 | 0068 | WP4, WP7 |
| WP9 Guides | 3 | 0069 | WP2, WP3A, WP3B, WP4, WP6 |
| WP10 Linking | 4 | 0070 | WP1, WP3B, WP9 |
| WP11 First-visit samples | 5 | 0071 | WP3A, WP3B, WP7, WP8, WP9 |
| WP12 Local proof, drill, publish, deploy, live re-test | 6 | — | all |
