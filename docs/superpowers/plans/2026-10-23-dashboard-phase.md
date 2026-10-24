# Dashboard phase: build plan (2026-10-23)

Scope: every SETTLED and SETTLED (delegated) dashboard item in `docs/scope/explorers-scope-2026-10.md` (IDs below refer to it), all OWN-* bug fixes (root causes in PR #187) and the UAT leftovers, across all 8 categories. Public pages, private sharing, saving others' lists, the plugin and monetisation are LATER and not in this plan.

Approved mocks: v3 https://claude.ai/artifact/D89UZnowRi1R9veMbYeWtb, v4 Guides https://claude.ai/artifact/EQhDwNgFuhBnYM94xs964Q (with v4.2 day structure), v5 controls https://claude.ai/artifact/UDhwrVqLBNh8xKtZpppf6v.

Paths: SPA = `explorers-earth/src/`, API = `tunes/server/`, contracts = `tunes/shared/`, migrations = `tunes/migrations/`.

## Rules for every package

- Branch from current `main`; one PR per package; **merge commits only**; no model names in commits; repo is public (no secrets, IPs or hostnames).
- Stay inside the package's file list. If a change is needed outside it, stop and coordinate through the owning package rather than editing.
- Migrations: numbers are **reserved below** and written only by the schema PRs S1-S3. Follow the migration-chain checklist (runtime privilege matrix and function inventory for new tables/functions, no TRUNCATE triggers, OCI fixture regeneration, pinned migration-head strings in tests such as `games.integration.test.ts`). Migration PRs merge **one at a time, in number order**; a package whose predecessor is not merged rebases and keeps its reserved number.
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
- **New integration test files** must be registered in the explicit selector list in `.github/workflows/test.yml` (append at the **end** of the ordinary selector list) and the matching expectation in `tunes/server/test/deployment/music-image-ci-tests.test.ts` (precedent: 8bdc6a34). `tunes.yml` runs all integration files only on PRs to `main`; `test.yml` runs only what it names.
- **New files under `tunes/shared/`** that the server imports: regenerate the root `.dockerignore` (it is GENERATED and default-deny) with `node scripts/generate-music-fixture-dockerignore.mjs --write`, and keep `scripts/dockerfile-shared-contract-closure.test.mjs` green. Otherwise the image build cannot see the file.
- **Frozen-source seals** in root `scripts/` (e.g. `scripts/fixtures/place-links-atomic-diagnostic-frozen.json`) assert exact spec text and runner hashes. A package that edits a sealed spec or runner updates the seal in the same PR and says so in the PR body.

### Migration marker bump checklist (applies to every schema PR)

Adding 0064 touched about 50 files (commit 6253d6d2). Every new head must update the same marker set, in one PR:
- migration-head pins: `.env.music.example`, `.env.music.test.example`, `.github/workflows/test.yml`, `.github/workflows/tunes.yml` (image file list), `deploy/platform.compose.yml`, `deploy/production.compose.yml` (`x-migration-marker`), `docker-compose.yml`, `docker-compose.music-test.yml`, `docker-compose.replatform.yml`, `docs/architecture/music-documentation-contract.json`, `fixtures/db/music-runtime-table-manifest.json`, `scripts/platform-runtime-smoke-contract.mjs`, `tunes/deployment/music-deploy-engine.sh` (marker ranks), `tunes/scripts/music-docker-release-rehearsal.ts`, `tunes/scripts/platform-proxy-browser-fixture.ts`, `tunes/shared/music-migration-contract.ts`;
- OCI fixtures: `tunes/server/test/contracts/fixtures/platform-oci/{README.md,cases.json,generate.py,receipt.json}` (regenerate; gzip OS byte trap);
- head-pinned tests: `music-e2e-state-restore`, `music-environment-contract`, `music-local-database`, `platform-runtime-smoke`, `public-parity-seed-contract`, `music-deploy-executable`, `music-deployment-files`, `music-readiness`, `explorers-manual-overrides.integration`, `games.integration`, `games`, `music-migration-contract`, `music-migration.integration`;
- new tables/functions: `tunes/server/db/music-runtime-role.ts` privilege matrix, function inventory, runtime table manifest.

Find the full current set with `git grep -l 0064_explorers_game_details` before starting. Because every schema PR rewrites these shared files, **schema changes are batched into three schema PRs** (S1-S3 below) owned by one lane; feature packages never add migrations themselves.

## Reserved migration numbers (head today: 0064)

| No. | Schema PR | Purpose |
|---|---|---|
| 0065 | S1 (inside WP0) | Partial unique index on collections slug `WHERE archived_at IS NULL` (OWN-01) |
| 0066 | S1 (inside WP0) | Slug redirects table (old slug → list) for LP-09 |
| 0067 | S2 | Curated taxonomy catalogs for movies, books, games, apps, products (DS-07) |
| 0068 | S2 | Products single link + offer merge, specs cap; People stop using rating + follower count (columns kept, not dropped) (DS-02..DS-06, DS-09) |
| 0069 | S3 | Guide items: ordered list per day + nullable `time_label`; migrate slot data (GD-23, GD-31) |
| 0070 | S3 | General list ↔ list links with optional role (replace Places-only place links) (LNK-01, LNK-09) |
| 0071 | S3 | `is_sample` on collections + sample seeding receipts (SMP-08) |

Each schema PR ships the migrations, the contract/repository changes they need, their integration tests and the marker bump, and nothing else. Feature packages code against the merged contracts.

## Order and parallelism

```
Wave 0 (serial)   WP0  P0 bugs + S1 (0065, 0066)
                  WP0B Places navigation hotfix (OWN-05, OWN-18, OWN-06) — owns pages/Favorites.tsx
  Deploy checkpoint A (drill at the LIVE head 0064, republish, deploy → DB at 0066; re-test OWN-01/05/06/11/18)
Wave 1 (parallel) WPCI CI cycle time | WP1 Shell+origin back+loader | WP2 Publish pill+add button+nudge | WP3A Category page (owns Favorites.tsx in this wave) | WP3B List page (7 non-Places categories) | WP4 Add-item template | WP5 Performance
  Deploy checkpoint B (drill at the live head 0066, republish, deploy; re-test OWN-07/08/17/19)
Wave 2            S2 (0067, 0068) → then parallel: WP6 Places | WP7 Movies/Books/Games | WP8 Apps/Products/People + prefill
Wave 3            S3 (0069-0071) → WP9 Guides
Wave 4            WP10 Linking
Wave 5            WP11 First-visit samples
Wave 6 (serial)   WP12 Local proof → drill at the live head (0066) → republish → deploy (runs 0067-0071) → live re-test
```

Verified file ownership (origin/main 8063651c): `pages/Favorites.tsx` (1921 lines) holds the Places category page, list page, Manage tab and publish prompt, so only one package owns it per wave (WP0B, then WP3A, then WP6). `useAddRecommendation.ts` is owned by WP0, then WP5 (save logic only), then WP6. WP3A/WP3B consume WP2's components through the props interface below and wire in once WP2 merges.

Two intermediate deploys (A, B) split the risk: the owner sees the bug fixes and the speed work early, and the final deploy carries only the new-feature migrations.

---

## WP0: P0 bugs + schema S1 (OWN-11, OWN-01, LP-09 schema)

- **Files:** `features/Favorites/hooks/useAddRecommendation.ts` (line 205), its tests; `tunes/migrations/0065_*.sql`, `0066_*.sql`; slug-redirect read/write in `tunes/server/repositories/explorersRecommendationRepository.ts` and the public slug resolver; the migration marker bump set (checklist above); migration integration tests (registered in `test.yml`).
- **Changes:**
  - OWN-11: line 205 today is `creatorSocialUrl: text(values.recommendationLink) ?? (person ? profile(values.recommendation) : …)`; wrap the first operand with `profile()`; the form refuses values that still don't normalise.
  - OWN-01: 0065 drops `UNIQUE(account_id,category,slug)` (0029 line 33) and creates a partial unique index `WHERE archived_at IS NULL`. Before creating it, the migration checks for live duplicates and fails loudly with the offending ids rather than guessing.
  - 0066: `collection_slug_redirects(account_id, category, old_slug → collection_id)`; renaming a slug records the old one; **all 8 public slug lookups follow redirects** (R9; WP3B removes the two rename refusals and adds the rename UI); a new list may not claim a slug that is still a redirect of another live list. (UI in WP3B.)
  - **`analytics_events` foreign key** (moved here from S2, R10): change RESTRICT to SET NULL or CASCADE and add the runtime-role privilege, so permanent list delete can ship in WP3B.
  - Restore command for archived lists, if WP0 ships it (otherwise WP3B, R8).
- **Depends on:** nothing.
- **Acceptance:** a place with "recommended by" `@handle` or `instagram.com/x` saves; archiving "paris" then creating a new "paris" list succeeds; a duplicate among non-archived lists still returns 409 `listUrlTaken`; restoring an archived list whose slug was reused returns a clear conflict asking for a new slug.
- **Tests:** unit case for `@handle` on a place; integration tests for archived-slug reuse, live-slug conflict, restore-after-reuse conflict, and redirect resolution.

## WP0B: Places navigation hotfix (OWN-05, OWN-18, OWN-06)

Small, early, and the single owner of `pages/Favorites.tsx` before Wave 1, so the owner sees the worst navigation bugs fixed at checkpoint A.

- **Files:** `pages/Favorites.tsx`, `pages/Home.tsx` (line 1000), `features/Favorites/components/AddRecommendation.tsx` (line 577), `AddLinkedPeoplePage.tsx`, `AddLinkedProductsPage.tsx` (redirectBack), `features/Favorites/hooks/usePlacesOwner.ts`.
- **Changes:** `?list=<id>` on `/recommendations/places`, read on mount (falls back to the first list only when absent); every return path carries it (OWN-05); Home navigates to `/recommendations/places?list=<id>` (OWN-18); line 1061 condition becomes `(loading && !cities) || !accountById` and the Manage click no longer calls `refetchCities()` (OWN-06).
- **Depends on:** WP0.
- **Acceptance / tests:** router tests for each return path; Home click test; tab-switch test asserting no `EarthLoader`.

## WP1: Shell, origin back, loaders, toasts (GL-02, GL-03, GL-05, OWN-08 loader part, SCR-03 for 7 categories)

- **Files:** `routes/ProtectedRoutes.tsx`, `routes/PublicRoutes.tsx` (loader only), `routes/validators/TabVisibilityGuard.tsx` (line 51), `layouts/PublicColdEntryBoundary.tsx` (line 130), `components/EarthLoader/*`, `components/Loader.tsx`, `components/RouteLoader.tsx`, new `lib/navigation/originBack.ts`; delete `features/LandingPage/hooks/use-toast.ts` and `hooks/useToast.ts` (verified: zero non-test importers on main, so this is dead-code removal with no caller edits). Not `pages/Favorites.tsx` (owned by WP3A this wave).
- **Changes:**
  - Addressable list routes `/recommendations/<category>/<listId>` for the seven non-Places categories (Places moves onto the shared route in WP6).
  - `originBack` helper: navigations into list/add/guide pages pass `state.from`; Back uses it, falling back to the category page on deep links.
  - One loader owner: globe splash only at boot with "Getting your recommendations ready…"; skeletons elsewhere; `TabVisibilityGuard` renders nothing while the cold-entry boundary is pending (OWN-08 loader part; badge and top nav stay in the public-pages phase).
- **Depends on:** WP0B.
- **Acceptance:** Back from add-item and linked pages returns to the origin list in all seven categories; public list cold entry shows one loader; only `sonner` remains.
- **Tests:** router tests for origin back (incl. deep-link fallback and a browser-refresh case), loader single-owner test, grep test that the two toast modules are gone.

## WP2: Publish pill, phone bottom add button, publish nudge (GL-08, GL-04, OWN-02, CAT-08, PRIV-06, LP-10)

- **Files (new):** `components/controls/PublishPill.tsx`, `components/controls/BottomAddButton.tsx`, `components/controls/PublishNudge.tsx`, `hooks/usePublishNudge.ts`, their state tests (no Storybook, R13). New files only: the old prompts (Places' `history.replaceState` nudge in `pages/Favorites.tsx`, per-category prompts and category modals) are removed by the package that adopts the new component on that screen (WP3A, WP3B, WP6), never by WP2.
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
- **Depends on:** WP0B (hands over `pages/Favorites.tsx`), WP2 interface (stub until merged), WP0 (0065 makes multiple same-city lists safe).
- **Acceptance:** all 8 category pages render from one template; Top Picks always visible with empty and first-visit states; Manage Top Picks never disappears; list cards: no "Open", whole card clickable, names wrap, desktop compact toggle, phone ⋯ publish; drag-and-drop list-card reorder saves; New list popup identical everywhere, Places adds Location, lands on the new list.
- **Tests:** template snapshot per category, Top Picks manager tests (pin/unpin/order), NewListDialog tests incl. Places location and duplicate-city allowed.

## WP3B: List page template, Share/QR, Manage, slug redirects (LP-01..10, OWN-07, OWN-14, GL-06 for items)

- **Files:** new `features/shared/list/ListPage.tsx`, `ListTabs.tsx`, `RecommendationsTab.tsx`, `ShareTab.tsx`, `ManageTab.tsx`; `components/ShareModal.tsx` (QR capture moves into `ShareTab`; modal removed or thinned); the six `*ListView.tsx` components (Guides has none, R14) become wrappers (Places adopts the template in WP6); `components/reorder/*` (drag-and-drop primary, arrows keyboard-only); API `tunes/server/application/recommendations.ts` (archive frees slug, delete), slug rename UI on top of the WP0/S1 redirect table (no migration here).
- **Changes:**
  - Three tabs mounted once (no remount on switch); pill top right (WP2).
  - Share: link, Copy, QR card with full-size Download (`toPng` with explicit width/height, no transform override, pixelRatio 2), social share.
  - Manage: name, description, cover, slug (editable; old slug stored in `collection_slug_redirects` and resolved to the list), Places social link + note, Archive (restorable via "Archived" filter) and Delete (in-page confirm). No duplicate Published toggle; no per-item Draft/Publish.
  - Items: drag handle reorder, ☆ pin, ⋯ menu.
- **Depends on:** WP0 (S1), WP2 interface, WP1 routes (merge after WP1).
- **Acceptance:** downloaded QR is complete on 375px and desktop and scans; tab switch has no reload; renaming a slug keeps the old URL working; archive frees the slug; delete is permanent.
- **Tests:** QR export test (image dimensions equal element size × ratio), slug redirect integration test, archive/delete integration tests, tab-mount test.

## WP4: Add/edit item template (ADD-01..05, ADD-10, ADD-13, OWN-03, OWN-04, OWN-09, OWN-12)

- **Files:** new `features/shared/addItem/AddItemPage.tsx`, `StickyActionBar.tsx`, `ItemSearch.tsx` (search + "Can't find it? Add manually" link + empty-state button + Back to search, typed text carried), `PickedItemCard.tsx`, `components/StarRating.tsx` (5 stars, half-steps, value 1-10, tap to clear, arrows), `components/TaxonomyCombobox.tsx` (searchable, two-level for Places).
- **Changes:** template only; categories adopt it in Wave 2. Save spinner inside the button; no full-screen saving overlay; actions Cancel / Save and add another / Save.
- **Depends on:** WP0.
- **Acceptance:** state tests cover search, manual, picked and saving states (no Storybook, R13) on 375px and desktop; StarRating round-trips 1-10 ↔ half stars; combobox filters 335 terms quickly and never overlaps text.
- **Tests:** StarRating mapping table, ItemSearch carry-over, combobox keyboard tests, sticky bar visibility test.

## WP5: Performance (OWN-17, OWN-19, GL-07)

- **Files:** `tunes/server/application/movieMediaImport.ts`, `tunes/server/application/media.ts` (batching only), the media INSERT batching in a **new module** called from `explorersRecommendationRepository.ts` with a minimal call-site change after WP3B merges (R1), a background job hook for movie imports (reuse the existing worker pattern used by app enrichment); SPA `features/Favorites/api/placesCommands.ts`, `features/Favorites/api/explorersAdapter.ts`, `features/Favorites/api/placesViewModel.ts`, `features/Movies/api/moviesClient.ts`, the `/me` query hook (single query key, R12). The background image import needs no job table (approved, R12).
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

- **Files:** `pages/Favorites.tsx` (Places list view moves onto the WP3B list template and the shared route; old Places nudge removed), `features/Favorites/components/AddRecommendation.tsx`, `RecommendForm.tsx`, `AddPlaceOverlay` (deleted), `features/Favorites/hooks/useAddRecommendation.ts` (form parts; WP5 save logic kept), the SPA Places location, coordinate and map parts (`PlaceSearchField`, `PickOnMapSheet`, nearby client cache) are built in **WP4** (R11), WP6 wires them in; WP6 keeps the server nearby-search endpoint and provider clients (basic fields only) in the existing places provider route; `explorersPlaceContract.ts` (remove `recommendationType: person` from new writes; keep reads of old rows).
- **Changes:** Places add uses the WP4 template; coordinates resolve to a pin plus nearest named places; geolocation only on tap; OSM fallback; Instagram scraper off by default; legacy note left readable (data migration deferred, no new number needed).
- **Depends on:** WP3A, WP3B, WP4, WP5, S2.
- **Acceptance:** add a place by name, by `15.49, 73.82`, by my-location and by map pin; category/subcategory picker works; no Person type; nearby lookup cached on repeat taps (network log).
- **Tests:** coordinate parser table, nearby cache test, form tests for the four entry paths, contract test that person-type writes are refused.

## WP7: Movies, Books, Games + curated taxonomies (DS-07, DS-15, DS-01 display, UAT-01..04, Games developer)

- **Files:** `features/Movies/components/dashboard/AddMoviePage.tsx` (form; WP5 save kept), `features/Books/**/AddBookPage.tsx`, `features/Games/**/AddGamePage.tsx`, their detail modals; `explorersMovieContract.ts`, `explorersBookContract.ts`, `explorersGameContract.ts`, `explorersGameOwnerContract.ts` (add `developer`), `explorersTaxonomyContract.ts` (allow the five new categories, flat), taxonomy fixtures + apply command inputs; `tunes/server/application/bookCoverImport.ts` (UAT-03); i18n `ar` "Itinerary" (UAT-04). Schema 0067 comes from S2.
- **Changes:** curated term lists drafted for Movies (genres mapped from TMDB), Books (~25 from subjects), Games (from IGDB genres), Apps (~20) and Products (~20); applied with the existing reviewed taxonomy-apply flow (receipts); `movieTerms` mapped onto the curated list; surface runtime/seasons; developer from IGDB `involved_companies`; stop fetching unused IGDB fields; provider rating as a source chip; game platform chips all shown (UAT-01); Enter triggers game search (UAT-02); book covers served from our stored copy (UAT-03).
- **Depends on:** WP4, WP5, S2.
- **Acceptance:** each category's add flow on the template with search-first; every new item can carry a curated category; provider rating never appears on the owner's star scale.
- **Tests:** taxonomy contract tests for the new categories, apply dry-run fixture tests, migration integration test, game platform/Enter tests, book cover source test.

## WP8: Apps, Products, People + paste-a-link prefill (DS-02..06, DS-08, DS-09, DS-11, DS-12, DS-14, ADD-11, ADD-12, ADD-14, OWN-15, OWN-20)

- **Files:** `features/AppsAndTools/**/AddAppPage.tsx`, `features/Products/**/AddProductPage.tsx`, `ProductDetailModal.tsx`, `features/People/**/AddPersonPage.tsx`, person detail; `explorersAppContract.ts`, `explorersProductContract.ts`, `explorersPersonContract.ts`; `tunes/server/application/appEnrichmentWebsiteAdapter.ts` + `appEnrichmentProviderCore.mjs` generalised into a `linkPreview` service (`{title, description, imageUrl, siteName, product?, person?}`, OG/Twitter/JSON-LD + oEmbed, SSRF guard, timeout, size cap); `appEnrichmentAppleAdapter.ts` gains keyword search. Schema 0068 comes from S2; each new `tunes/shared` file triggers the `.dockerignore` regeneration.
- **Changes:**
  - Products: "Product photo" (upload or from preview), brand, one "Where to buy" link (migration merges `productUrl` and `offer.buyUrl`, keeping old rows readable), price with inline currency selector defaulting to locale, ≤8 key specs, affiliate-disclosure toggle; brand-logo URL removed.
  - Apps: one link + optional other-platform links (merge `downloadUrl`), iTunes keyword search, preview fills icon/developer/screenshots; price model keeps four values.
  - People: name, photo, headline, required sector, profile link with platform auto-detect, ≤4 extra social links, location; rating and follower count no longer shown or written (0068 keeps the columns; dropping them is a later cleanup after the owner confirms); skills as plain tags.
- **Depends on:** WP4, S2.
- **Acceptance:** pasting a product page URL prefills photo/brand/price/currency where published; pasting a profile URL prefills name/photo/headline where public; Apps search returns iOS/macOS apps; the old two-URL rows still read.
- **Tests:** link-preview parser fixtures (Product, Person JSON-LD, OG-only, blocked, oversize, SSRF), iTunes search adapter test, money semantics regression, migration integration test, form tests.

## WP9: Guides (GD-02..11, GD-16..31, CAT-09, LNK-08 UI shell, SMP-10 hook)

- **Files:** `features/Guides/**` (GuidesPage category part via WP3A template, new `GuideEditor/` with `DayStrip.tsx`, `DayList.tsx`, `SmartAddBox.tsx`, `MyListsPanel.tsx`, `TimeLabelChip.tsx`, `PlanChips.tsx`), `NewGuideDialog.tsx` (replaces CreateGuideStep1-3), guide Share/Manage tabs from WP3B; `explorersGuideContract.ts`; `tunes/server/application/guides.ts`. Schema 0069 comes from S3.
- **Data/API:**
  - 0069 (in S3): guide day items as an ordered list (`position`) with nullable `time_label` (enum label or `HH:MM`), item source (`list_item_ref` / `place` / `note`); migrate existing morning/afternoon/evening picks to ordered items with labels (GD-31); `numberOfDays` kept in sync.
  - Commands: `addDay(at?)`, `moveDay(from,to)`, `duplicateDay`, `clearDay`, `deleteDay` (refuses the last day), `addDayItem(day, at?, source)`, `moveDayItem(itemId, toDay, toIndex)` (single command, Undo), `setTimeLabel`, `removeDayItem` (never touches the source list item). Each is one API call the plugin can reuse later (DIR-07).
  - Tags/best months/budget optional; 4-tag minimum removed; free-text categories → core picker.
- **UI flow (GD-24..30):** day strip with "+ Day"; desktop dashed "+ Add to day" row, phone bottom button "+ Add to Day N"; smart box in place (saved items → Google → "Add as a note"), stays open for the next item; drag within/between days and onto day chips; "Move to day…" in the item menu; day grip drag or ⋯ Move earlier/later; time headings only when labels exist; Plan | Share | Manage; Itinerary always, Stay/Transport/Budget/Tips as "+ Add" chips; My lists panel (desktop) / bottom sheet (phone) with Map tab.
- **Depends on:** WP2, WP3A, WP3B, WP4 (search field), WP6 (place search component).
- **Acceptance:** create a Trip in the popup and land in the editor; add from my lists, Google and note; reorder within a day; move across days by drag, chip drop and menu; insert/duplicate/clear/delete days with Undo; existing guides render with their old slot picks as labelled items; publish via pill; 375px works with the bottom button.
- **Tests:** guide contract tests, command integration tests (ordering invariants, last-day refusal, move atomicity), migration test with a pre-0069 fixture guide, editor interaction tests (drag, keyboard move, time-heading grouping).

## WP10: Linking any list ↔ any list (LNK-01..09, OWN-13)

- **Files:** `explorersPlaceLinkContract.ts` → new `explorersListLinkContract.ts`; link application/repository code (schema 0070 from S3); the place-links frozen seal `scripts/fixtures/place-links-atomic-diagnostic-frozen.json` and `scripts/place-links-atomic-diagnostic.test.mjs` are updated in the same PR; SPA `features/shared/list/LinkedListsSection.tsx`, `ManageTab` linked-lists panel (attach picker with "Create a new list" via `NewListDialog`), guide-level roles in Manage; remove `AddLinkedPeoplePage`/`AddLinkedProductsPage` and Places' People/Products tabs.
- **Changes:** links between any two of the owner's own lists, one level deep, with an optional role label (used by guides); migrate existing place links; Detach with Undo; public projection only exposes links to publicly visible lists (public rendering itself is LATER).
- **Depends on:** WP3B, WP9 (guide Manage tab), WP1 (origin back).
- **Acceptance:** link Places ↔ Books/Apps/People/Products and Guide ↔ Products packing list; detach and undo; opening a linked list and Back returns; old Places links still present after migration; a draft linked list never appears in the public projection.
- **Tests:** link contract tests (own lists only, no self-link, one level), migration test from place links, projection visibility test, UI tests.

## WP11: First-visit samples (SMP-01..10)

- **Files:** sample fixtures `tunes/server/fixtures/samples/{india,global}/v1/*.json` (drafted content), seeding in account onboarding completion (`tunes/server/application/accountLifecycle.ts` or the onboarding command), publish paths + public read model refuse `is_sample`, `makeItMine` and sample delete commands (schema 0071 from S3); new `tunes/server/fixtures/` directory (does not exist today; add it to the `.dockerignore` allow-list via the generator); SPA Sample badge on list cards and Top Picks (not on All Recommendations), "Make it mine" and delete actions, pill disabled with "Samples can't be published".
- **Changes:** country from onboarding picks India or Global; places samples resolved to real Google places at fixture-authoring time (stored ids, no runtime cost); deleted samples recorded so they never reseed.
- **Depends on:** WP3A, WP3B, WP9 (sample guide), WP7/WP8 (field shapes).
- **Acceptance:** a fresh account sees 2-3 samples per category localised by country; Make it mine converts in place to a draft; delete is permanent and never returns; samples never appear on the profile or public endpoints.
- **Tests:** seeding idempotency integration test, publish-refusal tests on every publish path, public read-model exclusion test, Make it mine test.

## WP12: Final full-test wave, deploy, live re-test

1. **Merge check:** all packages merged with merge commits; migration head is 0071; `main` CI green with no skipped required steps.
2. **Final full-test wave on the final `main` commit** (one test session, results attached to the release PR):
   - explorers-earth typecheck (`npx tsc -p tsconfig.app.json --noEmit`) and the **whole unit lane run serially**: `cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1`;
   - tunes typecheck (filtered to `shared|server`), unit lane `npx vitest run server/test/`, and the **full integration suite** `npm run test:integration` against the CI-identical Postgres;
   - **all e2e lanes**: the four `ci.yml` lanes (Category A, Category B, Public shell, Music and account) locally or via a PR run, plus a **full nightly qualification dispatch** of `frontend-e2e-qualification.yml` with `lane=all` on the final `main` (check every lane ran its steps; a skipped step is a failure);
   - root workflow/seal tests (`scripts/*.test.mjs`);
   - local click-through of every flow in scope §3/§5/§6 at 1280px and 375px, recorded on the UAT board.
3. **Restore drill at the database's CURRENT head, not the new one.** The gate (`tunes/shared/platformRecoveryContract.ts:135`) compares the receipt's marker with the pre-deploy backup manifest's marker, which is the live head before migrating (0066 after checkpoint B). Run `npm run platform:restore-drill -- --manifest <latest prod manifest.json> --identity <owner age identity> --receipt <TEMP>/platform-restore-drill-<8+ letters>` on the latest `prod/backups/` manifest (owner-held credentials; never printed), commit the refreshed `docs/replatform/evidence/recovery-receipt.json` via PR, merge. The receipt must also be fresh (`DRILL_STALE`) and the backup fresh (`BACKUP_STALE`), so drill close to deploy day. A receipt at any other marker fails with `DRILL_MARKER_MISMATCH`.
4. **Re-publish the image** from that exact `main` commit (the receipt commit changes `main`, so publish after it): `tunes.yml` with `publish_image=true`, `deploy_music=false`; take the digest from the publish job. The deploy verifies the attestation against the commit, so any later commit needs a re-publish.
5. **Deploy:** `explorers.yml` with `confirm_cutover=replace-explorers-host` and the digest; the owner approves the `explorers-production` environment. The deploy takes its own pre-deploy backup and runs 0067-0071 (0065-0066 shipped at checkpoint A).
6. **Taxonomy apply** for the five new catalogs (dry run, then apply, receipts recorded) via the owner's server agent.
7. **Live UAT re-run on the UAT board** after deploy, on https://explorers.earth with the test account: every OWN case, UAT leftovers (UAT-01..04, clean up UAT-07), every new dashboard case; measure OWN-17 timings against the WP5 targets; record on the board; the owner runs the 55 owner-only cases (UAT-08).
8. Hand over to the public-pages phase.

## WPCI: CI cycle-time package (Wave 1, runs alongside the feature packages)

**Baseline measured 2026-10-23** (`gh run list` / `gh run view --json jobs`, successful runs on PR `claude/igdb-prefill-cover` and on `main`):

| Workflow (file) | Required gate | Wall time | Slowest jobs |
|---|---|---|---|
| Explorers validation (`ci.yml`) | `replatform-required` | 6-21 min (0 min on docs-only) | E2E Category B 17.2m, E2E Music and account 16.9m, Unit Tests 5.6m, E2E Public shell 5.0m, E2E Category A 4.4m |
| Backend validation (`test.yml`) | `music-required` | 4-12 min (one 36 min outlier = queueing) | database 6.2m, frontend 5.6m, image-deploy-contract 3.8m, contracts 3.6m, platform-fixture 3.0m |
| Music C0 contracts (`music-c0-contracts.yml`) | (check branch protection) | 13-20 min | windows-latest 16.4m, ubuntu-latest 2.4m |
| API image validation (`tunes.yml`) | runs on PRs to `main` | 14-15 min PR, 18 min dispatch | build-test-scan-push 15.2m (single job) |
| Frontend E2E qualification (nightly) | not required | nightly/dispatch | 13 lanes + real-stack lanes |

A code PR therefore waits about 17-21 minutes on the critical path (two e2e lanes and the Windows Music lane), and every update-branch after a merge restarts it. With ~20 PRs in this phase that is the biggest schedule cost.

- **Files:** `.github/workflows/ci.yml`, `test.yml`, `music-c0-contracts.yml`, `tunes.yml`, `explorers-earth/playwright.config.*`, `docs/replatform/evidence/ci-hosted-validation.md`. Not owned by any other package; feature packages only append to the selector lists (see merge rules).
- **Candidate savings (each must pass the coverage proof below before it lands):**
  1. Shard the two 17-minute e2e lanes (Playwright `--shard=1/2`, `2/2`) into parallel jobs: about −8 min on the critical path.
  2. Cache Playwright browsers and `~/.npm` keyed on the three lockfiles (today each job runs `npx playwright install --with-deps`).
  3. Music C0 on Windows: run it on PRs whose diff touches its path filter (Music/contract files, Windows-sensitive scripts), always on `main` push and nightly. Music was retired from the product (P3), so first record what this lane still protects; if it guards Windows-only path handling for the local test scripts, keep it on every PR and just cache it.
  4. `tunes.yml` build-test-scan-push: enable Docker layer cache (`cache-from/cache-to type=gha`) and split scan from build where the attestation flow allows; target about −5 min.
  5. "E2E Music and account": confirm which specs still run after the Music removal; drop dead Music specs only with the owner's sign-off, keep account specs.
  6. Keep the existing docs-only skip (PR #139) as is.
- **Must not weaken anything:** no required check removed or renamed; no job may report success with its steps skipped (the trap that let #119 merge hollow); path filters may only skip whole lanes whose inputs are provably untouched, and the aggregate gates (`replatform-required`, `music-required`) must fail if a lane that should have run did not.
- **Double verification (acceptance):**
  1. Before/after table of wall time and per-job time over at least 3 runs each, on the same code commit.
  2. Proof the same tests still run: compare test counts and spec/file lists from the reporters (Playwright JSON reporter, Vitest JSON output) before vs after; sharded totals must equal the unsharded total, file for file.
  3. A deliberate failing test in each sharded/filtered lane on a throwaway branch must turn the aggregate gate red.
- **Tests:** `scripts/*` workflow-shape tests that already pin selectors stay green; add a test that every e2e spec file is assigned to exactly one shard.
- **Depends on:** nothing; lands first among Wave 1 PRs if possible so the rest benefit.

## Testing per package

Every package names its tests up front; a package is not done until these exist and run in CI (integration files registered in `test.yml`, e2e specs placed in an existing lane or a new one added to `ci.yml`/nightly).

| Package | Unit (Vitest) | Integration (tunes, real Postgres) | E2E (Playwright, `explorers-earth/e2e/`) |
|---|---|---|---|
| WP0 + S1 | `useAddRecommendation` `@handle`/`instagram.com/x` cases | `explorers/collection-slug.integration.test.ts`: archived reuse, live conflict, restore-after-reuse, redirect resolution, duplicate pre-check; migration contract/head tests updated | `locations.spec.ts`: save place with handle; create "paris" after archiving "paris" |
| WP0B | Favorites `?list=` parsing; Home click; Manage tab no-loader | — | `category-navigation-a.spec.ts`: Home → place list; add → back lands on origin list |
| WP1 | `originBack` (from-state, deep-link, refresh); loader single-owner | — | `public-shell-continuity.spec.ts`: one loader on cold entry; `category-navigation-b.spec.ts`: back from add/linked pages for 7 categories |
| WP2 | PublishPill (3 kinds, menu, a11y), BottomAddButton scroll behaviour, nudge rule table | — | covered through WP3A/3B specs |
| WP3A | CategoryPage per category, TopPicksManager, NewListDialog (Places location, duplicate city) | `recommendations` create with Places location data | `categories.spec.ts`: create list per category, drag-reorder cards, Top Picks empty/first-visit |
| WP3B | ListPage tabs mount once, ShareTab QR size, ManageTab archive/delete/slug | archive frees slug; delete; slug rename writes redirect | `movies.spec.ts`/`books.spec.ts`: tabs, QR download dimensions, slug rename keeps old URL |
| WP4 | StarRating mapping, ItemSearch carry-over, TaxonomyCombobox keyboard, sticky bar | — | via WP6-WP8 add flows |
| WP5 | places command invalidation count; view-model provider-photo fallback and error row | movie import job (parallelism, idempotency, progress); batched media insert | `movies.spec.ts`: add provider movie, navigation before import completes; timing assertion in the local proof |
| S2 | taxonomy contract for 5 new categories; product/app/person contract changes | 0067/0068 migrations incl. old two-URL product rows still read | — |
| WP6 | coordinate parser table, nearby cache, four entry paths, person type refused | nearby endpoint (basic fields) | `locations.spec.ts`: add by name, coordinates, my-location (mocked geolocation), map pin |
| WP7 | detail modals (platform chips, provider chip), Enter-to-search, book cover source | taxonomy apply dry-run fixtures; book cover stored copy | `games.spec.ts`, `books.spec.ts`, `movies.spec.ts`: search-first add with curated category |
| WP8 | link-preview parser fixtures (Product/Person JSON-LD, OG-only, blocked, oversize, SSRF), money semantics | link-preview service with SSRF guard against a local server; iTunes adapter (recorded fixture) | `products.spec.ts`, `people.spec.ts`: paste-link prefill, inline currency, sector required |
| S3 | guide/link/sample contracts | 0069 slot→ordered migration on a pre-0069 fixture; 0070 place-link → list-link migration; 0071 sample flag | — |
| WP9 | day strip, smart box, time-heading grouping, move menu | guide commands: ordering invariants, last-day refusal, move atomicity, numberOfDays sync | `guides.spec.ts`: create Trip, add from lists/Google/note, drag within/between days, move via chip and menu, Undo |
| WP10 | link picker, LinkedListsSection, one-level rule | own-lists-only, no self-link, projection hides non-public links | new `linking.spec.ts`: attach/detach/undo across categories, back to origin |
| WP11 | sample badges, Make it mine, delete | seeding idempotency, publish refusal on every path, public read-model exclusion | new `first-visit.spec.ts`: fresh account (India and Global) sees samples; Make it mine; delete stays deleted |
| WPCI | shard assignment test | — | shard totals equal unsharded totals |

## Orchestration model

- **One orchestrator session** (the "Replatform work status review" session) starts every package session, relays owner decisions, reviews each PR against its acceptance list, merges, watches CI, runs the update-branch train and drives the deploy checkpoints. Package sessions never merge, never deploy and never touch GitHub settings.
- **Package sessions**, one per package, each in its own worktree and branch from current `main`, opening one PR. Each package section above is its brief: files it owns, changes, dependencies, acceptance and tests. The orchestrator adds only the current `main` SHA and any merged contract it depends on.
- **Sub-agents inside a package session** are allowed for independent pieces that touch different files (listed in the parallelism map). The package session owns the final diff and runs the full checks itself before pushing.
- **Reporting:** each package session reports PR link, files touched (must be a subset of its ownership list), tests added, and local results of the commands in "Rules for every package".

## Parallelism map

### Sessions per wave

| Wave | Separate sessions / PRs at the same time | Notes |
|---|---|---|
| 0 | WP0 (+S1) → then WP0B | serial; WP0B starts after WP0 merges |
| — | Checkpoint A (orchestrator) | drill at 0064 → republish → deploy |
| 1 | WPCI, WP1, WP2, WP3A, WP3B, WP4, WP5 (7 sessions) | WP3A/3B code against the WP2 interface; WP3B merges after WP1 |
| — | Checkpoint B (orchestrator) | drill at 0066 → republish → deploy |
| 2 | S2 first (1 session); then WP6, WP7, WP8 (3 sessions) | S2 must merge before the three start |
| 3 | S3 (1 session); then WP9 | |
| 4 | WP10 | |
| 5 | WP11 | can start its fixture drafting (content only) during Wave 3 |
| 6 | WP12 (orchestrator + one test session) | final full-test wave, then deploy |

### Sub-agent splits inside a package

| Package | Sub-agent tasks (disjoint files) |
|---|---|
| WP1 | (a) `originBack` + route table for 7 categories; (b) loader single-owner; (c) dead toast removal |
| WP2 | (a) PublishPill; (b) BottomAddButton; (c) usePublishNudge |
| WP3A | (a) CategoryPage + ListCard; (b) Top Picks hero/manager; (c) NewListDialog |
| WP3B | (a) tabs + Recommendations tab; (b) Share tab/QR; (c) Manage tab; (d) drag-and-drop reorder |
| WP4 | (a) StarRating; (b) ItemSearch + PickedItemCard; (c) TaxonomyCombobox; (d) StickyActionBar |
| WP5 | (a) server movie import job; (b) places command batching + view model; (c) `/me` dedupe; (d) media INSERT batch |
| WP6 | (a) server nearby endpoint + provider clients; (b) wire WP4's Places search into the add flow; (c) Places list onto template |
| WP7 | one sub-agent per category (Movies, Books, Games) + one for taxonomy term lists |
| WP8 | (a) link-preview service; (b) Apps + iTunes search; (c) Products form; (d) People form |
| WP9 | (a) guide commands/API; (b) day strip + day list + drag; (c) smart box + My lists panel; (d) New guide dialog + Plan chips |
| WP10 | (a) link API + migration consumer; (b) Manage/linked section UI |
| WP11 | (a) India fixtures; (b) Global fixtures; (c) seeding + refusal paths; (d) UI badges/actions |
| WPCI | (a) measurement + reporter diffing; (b) e2e sharding + caching; (c) tunes image cache |

### File-ownership matrix (Wave 1, the widest wave)

| Area | WP1 | WP2 | WP3A | WP3B | WP4 | WP5 | WPCI |
|---|---|---|---|---|---|---|---|
| `routes/ProtectedRoutes.tsx` | **owner** | | | | | | |
| `pages/Favorites.tsx` | | | **owner** | | | | |
| `components/controls/*` (new) | | **owner** | | | | | |
| `features/shared/category/*`, `topPicks/*`, `lists/NewListDialog` (new) | | | **owner** | | | | |
| `features/*/components/dashboard/*Home.tsx` (7) | | | **owner** | | | | |
| `features/shared/list/*` (new), `*ListView.tsx` (6; Guides has none, R14), `components/ShareModal.tsx`, `components/reorder/*` | | | | **owner** | | | |
| `features/shared/addItem/*`, `components/StarRating`, `TaxonomyCombobox` (new) | | | | | **owner** | | |
| `features/Favorites/api/*`, `Movies/api/moviesClient.ts`, `tunes/server/application/movieMediaImport.ts`, `media.ts`, recommendation repository media loop | | | | | | **owner** | |
| `Add*Page.tsx` (all categories) | | | | | **owner** | | |
| `AddMoviePage.tsx` save function | | | | | (owner) | after WP4 | |
| `tunes/server/repositories/explorersRecommendationRepository.ts` | | | | **owner** (WP0 in Wave 0) | | new module only, after WP3B | |
| `tunes/server/routes/*recommendations*` | | | | **owner** (registers any new route file WP3A needs) | | | |
| `explorers-earth/src/lib/explorersApiClient.ts` | | | | **owner** | | | |
| `GuideDetailsPage.tsx`, `main.tsx` (navigation + loaders only) | **owner** | | | | | | |
| `GuidesPage.tsx` (incl. Top Picks manager deletion, after WP3B) | | | **owner** | | | | |
| `.github/workflows/test.yml` | append only | append only | append only | append only | append only | append only | **owner** |
| loaders, `TabVisibilityGuard`, `PublicColdEntryBoundary`, `lib/navigation/*` | **owner** | | | | | | |
| `.github/workflows/*`, playwright config | | | | | | | **owner** |

Ownership follows the orchestrator rulings R1-R14 below; where a later package touches an owner's file (WP5 call site, AddMoviePage save, test.yml appends), it merges later and resolves the conflict. Waves 2-5 have at most three parallel packages whose areas are per category (WP6 Places, WP7 Movies/Books/Games, WP8 Apps/Products/People) and do not overlap.

### Orchestrator ownership rulings (Wave 0/1, 2026-10-23)

| # | Ruling |
|---|---|
| R1 | `explorersRecommendationRepository.ts`: WP0 in Wave 0, then WP3B in Wave 1. WP5 puts its logic in a new module with a minimal call-site change, after WP3B. |
| R2 | `recommendations.ts` routes: WP3B. WP3A makes no route edits; it gets what it needs from WP3B or from a new route file that WP3B registers. |
| R3 | `lib/explorersApiClient.ts`: WP3B. |
| R4 | `.github/workflows/test.yml`: WPCI. Others only append selectors and bump the count; the later merger resolves. |
| R5 | `Add*Page.tsx`: WP4. `AddMoviePage` is shared with WP5, which merges after WP4. |
| R6 | `GuideDetailsPage` and `main.tsx`: WP1, navigation and loaders only. |
| R7 | `GuidesPage.tsx`: WP3A; its Top Picks manager deletion lands in WP3A after WP3B. |
| R8 | WP3B ships `RestoreListButton` and the restore command (unless WP0 already did); WP3A places it. |
| R9 | S1/WP0 adds the redirect table and makes all 8 public slug lookups follow redirects; WP3B removes the two rename refusals and adds the rename UI. |
| R10 | The `analytics_events` foreign-key fix (RESTRICT → SET NULL/CASCADE + runtime-role privilege) moves from S2 into S1, so permanent delete ships in WP3B. |
| R11 | WP4 owns the SPA Places location, map and coordinate parts; WP6 keeps the server nearby endpoint and provider clients. |
| R12 | WP5's background image import without a job table is approved; the `/me` dedupe is in WP5's file list. |
| R13 | No Storybook; WP4 (and WP2) use state tests. |
| R14 | There are 6 `*ListView` files (Guides has none). |

### Shared files: single owner or sequenced

| Shared file / area | Rule |
|---|---|
| `tunes/migrations/*`, marker-pinned files, OCI fixtures, `music-runtime-role.ts` | schema PRs S1-S3 only, one at a time |
| `routes/ProtectedRoutes.tsx` | WP1 in Wave 1; WP6 (Places route) in Wave 2; WP9 (guide route) in Wave 3 |
| i18n resources (`explorers-earth/src/i18n/resources/*`) | append-only keys under a per-package namespace (`dashboard.<package>.*`); conflicts resolved by the later PR on rebase; `node explorers-earth/scripts/check-i18n.js` must pass |
| `.github/workflows/test.yml` selector list, `music-image-ci-tests.test.ts` | append-only at the end; the later PR rebases and re-appends |
| root `.dockerignore` | regenerated, never hand-edited; the later PR re-runs the generator after rebase |
| `explorersContract.ts`, shared DTOs | changed only in schema PRs or by the package that owns that category's contract |
| `pages/Favorites.tsx` | WP0B → WP3A → WP6, never two at once |

### Merge order and branch rules

1. Within a wave, merge in a fixed order, with update-branch on all open PRs after each merge. **Wave 1: WPCI → WP1 → WP2 → WP3B → WP3A → WP4 → WP5.** Builds run in parallel; when two packages touch one file, the later merger resolves the conflict. Other waves: schema PR first, then shared components, then consumers, then category packages.
2. Merge commits only, one PR at a time. After every merge the orchestrator runs update-branch on every open PR of the wave (`gh pr update-branch <n>`), and each package session re-runs its local checks if the update touched its area.
3. A PR whose head looks stale after update-branch (status UNKNOWN, or "out of date" refused although just updated) is fixed by close and reopen, then re-run.
4. Append-only shared lists (selectors, i18n, `.dockerignore`) are re-generated or re-appended by the later PR after its rebase, never edited by hand in conflict resolution.
5. Nothing merges with a red or skipped required check; CI flakes are re-run once, then root-caused.

## Design acceptance (applies to every UI package)

The approved mocks are the visual spec; packages build to them, not to this text.

- **Fidelity check:** each UI PR attaches screenshots at 1280px and 375px next to the matching mock screen (v3 dashboard, v4/v4.2 Guides, v5 controls), and lists any deliberate difference.
- **States per screen** (every screen must design all five; the PR shows each):

| Screen | Loading | Empty | Error | Partial / offline | Success feedback |
|---|---|---|---|---|---|
| Category page | card + Top Picks skeleton | "Create your first list" CTA; Top Picks "Pin items to feature them here" | inline retry row | cached cards + "Refreshing…" | toast on create/reorder |
| List page | item skeleton, tabs usable | large centred "+ Add item" CTA (no bottom button) | retry row; a failed list read shows an error row, never disappears (OWN-19) | keep data, background-refresh dot | "Order saved", publish pill updates in place |
| Add/edit item | spinner inside Save only | no results → "Add manually" button | inline field errors (URL normalisation, prefill failed: "Couldn't read that link, fill in manually") | prefill partial: filled fields marked, rest editable | "Saved" toast; Save and add another clears the form |
| Places search | — | coordinates with no nearby place → pin only | geolocation denied → hint to type or use the map; no re-prompt | Google quota/offline → OSM fallback note | — |
| Guide editor | day skeletons | empty day: dashed "+ Add to day" | move/reorder failure → item snaps back + toast with Retry | — | Undo toast on move/delete |
| Samples | — | after deleting all samples nothing returns | publish attempt on a sample → pill disabled with "Samples can't be published" | — | "Now yours" after Make it mine |

- **Accessibility:** touch targets ≥ 44px (bottom add button 56px); every drag action has a keyboard path (Space to pick up, arrows, Space to drop) and a menu path ("Move to day…", "Move earlier/later"); the publish pill is a menu button with `aria-haspopup` and announces the current state; contrast on the one-colour All Recommendations cards checked against WCAG AA; focus returns to the trigger when a sheet or dialog closes.
- **Edge content:** list and guide names up to the 500-char limit wrap to two lines then truncate with a tooltip; 47+ char names tested; RTL (Arabic) checked on the pill, bottom button and day strip.

## Package summary

| Package | Wave | Schema | Depends on |
|---|---|---|---|
| WP0 P0 bugs + S1 | 0 | 0065, 0066 | — |
| WP0B Places navigation hotfix | 0 | — | WP0 |
| Deploy checkpoint A | 0 | — | WP0, WP0B |
| WP1 Shell, origin back, loaders, toasts | 1 | — | WP0B |
| WP2 Publish pill, bottom add, nudge | 1 | — | WP0 |
| WP3A Category page + Top Picks + New list (owns Favorites.tsx) | 1 | — | WP0B, WP2 iface |
| WP3B List page + Share/QR + Manage (7 categories) | 1 | — | WP0, WP1, WP2 iface |
| WP4 Add-item template | 1 | — | WP0 |
| WP5 Performance | 1 | — | WP0 |
| Deploy checkpoint B | 1 | — | Wave 1 |
| S2 schema | 2 | 0067, 0068 | Wave 1 |
| WP6 Places (owns Favorites.tsx) | 2 | — | WP3A, WP3B, WP4, WP5, S2 |
| WP7 Movies/Books/Games + taxonomies | 2 | — | WP4, WP5, S2 |
| WP8 Apps/Products/People + prefill | 2 | — | WP4, S2 |
| S3 schema | 3 | 0069, 0070, 0071 | Wave 2 |
| WP9 Guides | 3 | — | WP2, WP3A, WP3B, WP4, WP6, S3 |
| WP10 Linking | 4 | — | WP1, WP3B, WP9, S3 |
| WP11 First-visit samples | 5 | — | WP3A, WP3B, WP7, WP8, WP9, S3 |
| WPCI CI cycle time | 1 | — | — |
| WP12 Final full-test wave, drill, publish, deploy, live UAT | 6 | — | all |

## Review findings (2026-10-23)

Engineering review (gstack `plan-eng-review`) and design review (gstack `plan-design-review`) of the first version of this plan, run for an owner who delegated decisions; the recommended option was adopted each time. Every claim was checked against `origin/main` @ 8063651c.

### Verified correct
- All cited existing paths exist (29 checked). `tunes/server/fixtures/` does not exist and is now marked as new.
- OWN root-cause lines match main: `useAddRecommendation.ts:205`, `0029:33`, `Home.tsx:1000`, `ShareModal.tsx:95`, `Favorites.tsx:1061` and `:1461-1462`, `AddRecommendation.tsx:577`, `movieMediaImport.ts:98`, `placesCommands.ts:41`, `explorersRecommendationRepository.ts:59-62`, `placesViewModel.ts:167`, `PublicColdEntryBoundary.tsx:130`, `TabVisibilityGuard.tsx:51`.
- Migration head is 0064; 0065-0071 are free.
- `npm run platform:restore-drill`, `tunes.yml` `publish_image`/`deploy_music`, and `explorers.yml` `confirm_cutover=replace-explorers-host` match the runbook.

### Findings and changes, by severity

| Sev | Finding | Change made |
|---|---|---|
| P1 | **Drill step was wrong.** The plan said "drill at the new head (0071)". The gate compares the receipt marker with the pre-deploy backup's marker, i.e. the live head before migrating (`platformRecoveryContract.ts:135`). A 0071 receipt would be refused with `DRILL_MARKER_MISMATCH`. | WP12 step 3 and both checkpoints now drill at the live head, then republish from the receipt commit; freshness limits noted. |
| P1 | **Seven migrations in parallel packages collide.** Each new head rewrites ~25 marker-pinned files plus OCI fixtures and head-pinned tests (0064 touched ~50 files). Parallel schema PRs would conflict on all of them every time. | Schema batched into three schema PRs (S1 in WP0, S2, S3) with a written marker-bump checklist; feature packages no longer own migrations. |
| P1 | **Wave 1 was not disjoint.** `pages/Favorites.tsx` (1921 lines: Places category page, list page, Manage, nudge) was edited by WP1, WP2, WP3A and WP3B in the same wave; `useAddRecommendation.ts` by WP0/WP5/WP6. | One owner per wave: new WP0B (Places nav hotfix) → WP3A → WP6. WP1 drops Favorites/usePlacesOwner; WP2 creates new files only; WP3B covers the 7 non-Places categories; Places list moves in WP6. |
| P1 | **CI selector registration missing.** `test.yml` runs only the integration files it names; new ones must be appended to the ordinary selector list and `music-image-ci-tests.test.ts` updated (precedent 8bdc6a34), or they never run in the required lane. | Added to the rules for every package. |
| P2 | **Generated `.dockerignore` is default-deny.** New `tunes/shared/` contracts (e.g. the list-link contract) and the new `tunes/server/fixtures/` would be invisible to the image build. | Rule added: regenerate with `scripts/generate-music-fixture-dockerignore.mjs --write`; named in WP8, WP10, WP11. |
| P2 | **Frozen seal on place links.** WP10 replaces place links, which `scripts/fixtures/place-links-atomic-diagnostic-frozen.json` pins. | WP10 updates the seal in the same PR; general rule added. |
| P2 | **Destructive data loss in 0068.** Dropping People rating/follower columns is irreversible and only a delegated decision. | 0068 keeps the columns (stops reading/writing); the drop is a later cleanup after owner confirmation. |
| P2 | **One big-bang deploy at the end.** All fixes and seven migrations would ship at once. | Two earlier deploy checkpoints (A after Wave 0, B after Wave 1) so bug fixes and speed reach the owner sooner and risk is split. |
| P2 | **OWN-01 edge cases.** Creating the partial index could fail on existing live duplicates; restoring an archived list whose slug was reused was unspecified. | 0065 checks for live duplicates first; restore-after-reuse returns a clear conflict; tests added. |
| P2 | **Design states unspecified.** The first version named screens but not loading/empty/error/partial states, accessibility or edge content. | New "Design acceptance" section: per-screen state table, a11y rules, edge content, and a screenshot-vs-mock fidelity check per UI PR. |
| P2 | **Owner additions (second pass):** no explicit parallel-session map, no CI-time package, tests not named per package, no final full-test wave, no orchestration model. | Added "Parallelism map" (sessions per wave, sub-agent splits, Wave 1 file-ownership matrix, shared-file rules, merge/update-branch/close-reopen rules), WPCI with measured baseline and a double-verification acceptance, "Testing per package" table (unit/integration/e2e), WP12 rewritten as the final full-test wave (serial unit lane, integration suite, all e2e lanes, nightly `lane=all` dispatch, live UAT re-run), and "Orchestration model". |
| P3 | Toast consolidation was scoped as a caller migration. Verified zero non-test importers of the two old toast modules. | WP1 now deletes them as dead code (no caller edits). |

### Design review scores (plan vs approved mocks)

| Dimension | Before | After |
|---|---|---|
| Information architecture | 8 | 9 |
| Interaction states | 3 | 8 |
| User journey / navigation | 7 | 9 |
| AI-slop risk (mocks are the spec) | 7 | 9 |
| Design-system alignment (today's look, one pill, one add button) | 8 | 9 |
| Responsive + accessibility | 4 | 8 |
| Unresolved design decisions | 8 | 9 |

No new mockups were generated: the owner already approved v3, v4/v4.2 and v5, which are the visual source of truth.

### NOT in scope (unchanged)
Public pages, private sharing (invites), saving others' lists, the plugin, monetisation, the Topic guide template, product search (DS-13), dropping the People rating/follower columns.

### Owner-only items
- Approve the two extra production deploys (checkpoints A and B) in GitHub, and run the drill each time with your backup identity (the credentials never pass through a session).
- Run the five new taxonomy applies on the server (dry run, then apply) via your laptop server agent after the final deploy.
- Run the 55 owner-only UAT cases at sign-off.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR (PLAN) | 11 issues, 0 critical gaps open (all folded into the plan) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (PLAN) | score: 6/10 → 9/10, 4 decisions (delegated, recommended options) |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **VERDICT:** ENG + DESIGN CLEARED — ready for the detailed implementation plans.

NO UNRESOLVED DECISIONS
