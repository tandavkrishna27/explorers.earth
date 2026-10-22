# Unified UX across categories (2026-10)

Status: **v2, awaiting owner decisions.** No app code changes.
Mocks v2: https://claude.ai/artifact/TmMMFzJnW2cEtmUE7vVF7k (private, clickable, desktop + mobile).
v1 mocks (https://claude.ai/artifact/MjTwMPH2QyCkQB6ZHaV2zx) were rejected by the owner: built from code only, merged the two public screens, dropped Top Picks, ignored visibility toggles and Manage/QR. v2 replaces them.

## v5: controls placement (PROPOSED, 2026-10-23)

Mocks v5: https://claude.ai/artifact/UDhwrVqLBNh8xKtZpppf6v (private; desktop and 375px phone). Status: **PROPOSED**, awaiting the owner's decision.

- **Rule:** the top right holds status and publish. Add lives in the content. The floating + appears on phones only.
- **Category page:**
  - Header right: an "On profile ✓ / Hidden" chip (the category master switch), then the primary "+ New list".
  - The first grid card is a dashed "+ New list".
  - Phone: the header keeps only the chip, and the floating + means New list.
- **List page:**
  - Header right holds only the publish control. A draft shows a solid "Publish"; a published list shows a "🌐 Public ▾" pill whose menu offers Public / Private (invite, coming soon) / Unpublish to draft.
  - This replaces the left-side Published toggle from earlier mocks.
  - Tab row: Recommendations | Share | Manage, with "+ Add item" at the right end, shown on Recommendations only.
  - A dashed "+ Add item" row sits at the end of the items. An empty list shows one large centred "+ Add item".
  - Phone: the header keeps the pill, and the floating + means Add item.
- **Guide page:**
  - The same Publish / Public pill sits in the header.
  - A dashed "+ Add to day" row ends each day.
  - Phone: the floating + adds to the selected day.

## v4: dashboard Guides (proposal for owner review)

Mocks v4: https://claude.ai/artifact/EQhDwNgFuhBnYM94xs964Q (private). Model decisions are in PR #190 (scope doc).

- **Guides page:** same template as every category. "Show Guides on my profile" sits on the left, "New Guide" on the right, then the "Top Picks" hero (today it says "Featured"). Location chips replace Filters. Guide cards carry a Public/Draft badge, can be dragged to reorder, and end with a "+ New guide" card.
- **New Guide popup:** title, destination, number of days, optional dates, optional tags. Today's 3-step page requires 4 tags; the popup replaces it. The guide is created as a Draft and the user lands straight in the day editor.
- **Guide page:** Back, the Published toggle and its badge sit on the left. There are three tabs, **Plan | Share | Manage**, the same pattern as lists. Today's 5 round tabs become chips inside Plan:
  - Itinerary (today's Journey) is always there.
  - Stay, Transport, Budget and Tips start as "+ Add" chips and appear once they have content.
- **Day editor:** each day has Morning, Afternoon and Evening slots holding **single items**. Each item is tagged with where it came from: a list, a search, or a note. "Add to …" opens one sheet with three tabs:
  - **From my lists:** a multi-select picker across all categories.
  - **Search:** Google, with the location and map buttons from v3.
  - **Free text:** a note.

  Items drag to reorder, and can move between slots and days. Days drag by their grip. Items picked from lists stay in those lists; the guide references them.
- **Linked lists:** whole lists attach at guide level, each with a role such as "Places to choose from" or "Packing list". They can come from any category. Attach and detach live in Manage; the Plan tab shows them read-only. Visitors see only the public ones.
- **Privacy:**
  - **Draft:** only the owner.
  - **Public:** anyone with the link, plus the profile when Guides is shown.
  - **Private:** invite by email. Marked "Coming soon".

  The setting appears in both Share and Manage.
- **Make it mine:** the entry point to copy a public guide into your own drafts sits on the public guide page. Public pages are out of scope for this round.

### v4.2: Day structure (SETTLED by owner, 2026-10-23)

These rules replace the fixed Morning/Afternoon/Evening slots in v4 and v4.1. Everything else in v4 is approved.

- **Each day is one ordered list.** Users add items and drag to reorder, within a day and across days. "+ Add to Day N" opens the smart box at the end of the day.
- **Optional time label per item:** Morning, Afternoon, Evening, Night, or an exact time (e.g. 9:30). It is set from a small chip on the item or from the item menu.
- **Headings only when labels exist.** When a day's items carry labels, small time headings appear automatically. Otherwise the day is a plain numbered list. The mock shows Day 1 with labels and Day 2 without.
- **Imports** from ChatGPT and other sources keep their time labels.
- **Data model:** item order plus one nullable `time_label` field (a label or a time). There are no slot entities.

### v4.1: Guides editor revision (owner discussion, 2026-10-22)

These changes replace the v4 "Add to slot" popup. Mock: same v4 link, "Day editor" and "Topic guide" screens.

- **Model: a guide is a set of sections.** Each section holds items from any category plus notes. A template defines the sections:
  - **Trip** is built first and is the full trip planner: days, Morning/Afternoon/Evening, optional dates.
  - **Topic guide** comes later: the user names the sections (gift guides, learning paths, setups and routines, city or area guides), with no slots or dates.
  - Both use the same editor and the same data. The New Guide popup offers the template choice, with Topic marked "Later".
- **In-page editor, no popup.** "+ Add" opens one **smart box in place** (slots superseded by v4.2). Suggestions come in this order:
  1. the user's saved items, across categories;
  2. Google results, with the location and map buttons;
  3. "Add as a note: …".
- **My lists panel:**
  - Desktop: a panel to the right of the plan. Pick a list, then drag items into any slot or tap +. A Map tab shows the days as coloured pins.
  - Mobile: the same panel opens as a bottom sheet, used only for browsing.
- **Days:**
  - A sticky **day strip** sits at the top. It shows dates when the guide has them, otherwise Day 1, 2, and so on. Tapping a day jumps to it, and "+ Day" appends one.
  - Each day's ⋯ menu: insert before/after, duplicate, clear, delete.
  - Days are dragged by a grip. The number of days in Manage stays in sync.
- **Status:** the Published toggle and badge sit top-left as on lists. Draft shows "Only you can see this".

Research basis (quick): Wanderlog adds items from saved lists into days, with drag reorder and a map of everything added. Mindtrip combines chat, map and a day-by-day plan in one workspace. Google Maps is centred on reorderable, shareable and collaborative lists. Our direction matches these; the improvement is keeping additions in-page.

## v3 (dashboard only): decisions, final after owner review 2026-10-22

Mocks v3: https://claude.ai/artifact/D89UZnowRi1R9veMbYeWtb (private). The owner approved v2's category page and list page as they are. Public category and public list screens are out of scope here and will be discussed separately.

1. **All Recommendations cards**: one brand colour, in shades of today's dark card plus the blue accent. No per-category tints. Icons, illustrations, animations and features stay exactly as today. **No sample badges or notes on the hub**: a new account's cards look like anyone's.
2. **Sample lists for new accounts.**
   - Each category starts with 2-3 sample lists. They are the user's own lists, marked **Sample**, shown as normal list cards. Top Picks shows their picks with the same badge.
   - They open as full list pages with all item details, and can be browsed and reordered.
   - A sample can't be published and never appears on the profile.
   - **Make it mine** turns a sample into a normal draft list in place, with no copy. It can then be edited and published.
   - Each sample can be **deleted** (card ⋯ menu, or on the list page). Deleted samples don't come back, even if all real lists are deleted later.
   - Samples stay until the user deletes them. Creating a real list does not remove them. There is no "Hide samples" control.
   - **Localisation**: the sample set is chosen from the country captured at onboarding.
     - Places samples are local.
     - Movies, books and games are mostly global.
     - Apps and products are a global standard set with some local flavour.
     - Start with two sets, India and Global. More countries can be added later as data.
3. **Add item.**
   - No Search/Manual tabs. The search bar takes the full row, and a small **"Can't find it? Add manually"** link sits above it on the right.
   - When a search has no results, a clear "Add manually" button appears in the empty state.
   - Typed text carries into the manual Name field, and "Back to search" returns.
   - Places has one field that takes a name or coordinates; placeholder "Search a place or paste coordinates". `15.49, 73.82` is detected automatically and resolves to a pin plus the nearest named places.
   - Places has two icon buttons in the field: ◎ use my location, which suggests nearby places, and a map icon that opens a pick-on-map sheet. "Use this pin" continues in the manual form.
   - **Location cost.** Browser geolocation is free, and the browser remembers the permission after the first grant, so there is no re-prompting. Only the nearby-places lookup costs a Google Places call. That call runs only on tap, results are cached per rounded area, and it asks for basic fields only. OpenStreetMap is a free fallback, but its data for Indian food places is thinner.

Implementation notes for later:
- Sample lists are seeded per new account from versioned per-country fixtures, with an `is_sample` flag. The publish paths and the public read model must refuse `is_sample` lists. "Make it mine" clears the flag. Delete is a normal delete with no resurrection.
- Coordinate detection is a decimal lat,lng regex, followed by a pin and a nearby lookup.

## v2: live walkthrough notes (2026-10-22, smoketest1021, read-only)

Look of today's app, reproduced in v2: near-black page, `#14171f` sidebar/top bar, Poppins (900 uppercase on All Recommendations), blue `#60a5fa` 12px-radius buttons, list cards `#151a25` (Places uses `#1a2332`) with a 1px white/10% border and 16px radius, green `PUBLIC` badge, yellow bar before section titles, globe splash loader with a rotating tagline.

Observed differences:
- All Recommendations: badges differ (green "Public" with icon vs outlined "Hidden"), ⋯ menu styles vary.
- Category page, Movies: "Public Visibility" toggle top-left, "New List" top-right, Top Picks hero (black box while loading/empty), "Reorder lists" button, cards with truncated names ("Smoke Test …"), toggle on card, "Open ›" link, "1 pinned", dashed "Add new list".
- Category page, Places: hero titled **Featured**, button **Add Location**, cards have ⋮ menu instead of a toggle, image-strip covers.
- List page (Movies): Back + name top-left, **Published toggle top-right**, two tabs. Manage holds Archive, Edit, a **second Published toggle**, and the QR card with Share link / Copy / Download QR.
- Public category `/<handle>/places`: Featured hero (empty black box showing "3 saved places"), one row per list with See All, green **Map View** pill above a bottom tab dock. A category whose visibility is off redirects to the profile.
- Public list `/<handle>/places/goa`: back link, name, a "Places 1" filter chip, card grid, same Map View pill.

## v2 decisions encoded in the mocks
1. **All Recommendations**: keep the 8 cards; one badge style (● Public / outlined Hidden) and one ⋯ style; owner picks colour option A (one brand colour + icons) or B (subtle per-category tints).
2. **Category page** (one template, all 8): top-left toggle "Show <Category> on my profile"; top-right "New List" (Places too); "Top Picks" hero everywhere, always visible, with an empty state ("Pin items to feature them here") and a first-visit explainer; list cards as today, but names wrap to two lines, no "Open", whole card clickable, public toggle on every card; drag-and-drop replaces "Reorder lists"; "+ Add new list" card.
3. **List page**: Back, Published toggle and name on the left; tabs **Recommendations** (add, drag reorder, ☆ pin to Top Picks, ⋯ item menu), **Share** (link, Copy, QR card with full-size Download, social), **Manage** (name, description, cover, URL slug; linked lists attach/detach on Place lists; Archive/Delete). Duplicate Published toggle removed; **per-item Draft/Publish removed** (items in a published list are public).
4. **Add/edit item**: full page, sticky action bar, search first then manual, one 5-star rating. Places: place types only (no Person). Products: product photo, one price field with inline currency. People: sector picker, no rating (pending confirmation).
5. **Public category** and **public list** stay two screens. Map toggle (List | Map) only on Places.
6. **Publish nudge**: after the 3rd item, or when leaving a draft list with items; never on an empty list.
7. **Loaders**: globe splash only at app start ("Getting your recommendations ready…"); skeletons elsewhere; no full-screen saving overlay.
8. **Back** always returns to the origin.

## Open questions (v2)
1. Hub colour: option A or B?
2. On mobile, keep the public toggle on each list card, or move it into the card ⋯ menu?
3. 5-star migration: halve existing 10-point ratings, rounding to half stars?
4. People: confirm no rating.
5. Public category page with no Top Picks: hide the hero for visitors (proposed)?
6. Show a Place list's linked People/Products lists to visitors ("Also on this list")?
7. Archive vs Delete: keep both?
8. Should the URL slug stay editable after publishing (breaks printed QR codes)? Proposed: editable, with a redirect from the old slug.

---

# v1 (superseded): code audit


Status: **proposal, awaiting owner decisions.** No app code changes yet.
Mocks: https://claude.ai/artifact/MjTwMPH2QyCkQB6ZHaV2zx (private; clickable, desktop and mobile).
Source: owner walkthrough 2026-10-22 (UAT board area OWN, OWN-01..OWN-20) plus a code read of `fork/main` @ 8063651c.

Method note: the audit below is from the code and the owner's findings. A live click-through of every category with the test account was not done in this pass; the mocks should be checked against production before implementation starts.

## 1. Audit: where the categories differ today

Paths are relative to `explorers-earth/src/`.

| Aspect | Places | Movies | Books | Games | Apps | Products | People | Guides |
|---|---|---|---|---|---|---|---|---|
| Hub + list page | One page `pages/Favorites.tsx`, internal `step` 1/2 (no URL) | `MoviesHome` + `MovieListView` | `BooksHome` + `BookListView` | `GamesHome` + `GameListView` | `AppsHome` + `AppListView` | `ProductsHome` + `ProductListView` | `PeopleHome` + `PersonListView` | `GuidesPage` + `GuideDetailsPage` (plus legacy `/guides/:id`) |
| Add container | Search overlay (`AddPlaceOverlay`) then full page (`AddRecommendation` + `RecommendForm`) | Full page, sticky header | Full page, sticky header | Bare full page | Full page | Full page | Full page | 3-step wizard |
| Search first | Google Places | TMDB + manual | Google Books + manual | Optional Search button + "existing" select + manual | Manual + "existing" select | Manual only | Manual only | n/a |
| Rating input | 10 stars | 10 stars | 10 stars | `<select>` 1-10 | `<select>` | `<select>` | `<select>` | none |
| Save button | Fixed on mobile, end of scroll on desktop | End of scroll | End of scroll | End of scroll | End of scroll | End of scroll | End of scroll | Wizard |
| Selected item shown | Only pre-filled in the title field (OWN-09) | Search card | Search card | – | – | – | – | – |
| Extra type | "Place / Person" dropdown (OWN-10) | – | – | – | – | – | – | – |
| Reorder | `ReorderableList` (drag grip + arrows) | same | same | unconfirmed | same | same | same | `PlaceMoveButtons` / `DayOrderPanel` |
| Linked lists | People + Products; detach exists only inside the linked add pages ("Unlink from this location") | – | – | – | – | – | – | – |
| Featured / topics | Pin toggle per list | `TopPicksManager` | `TopReadsManager` | `TopGamesManager` | `AppTopPicksManager` | `ProductTopPicksManager` | `PersonTopPicksManager` | `TopPicksHero` |
| Publish prompt | Two triggers, no empty-list check, `history.replaceState` (Favorites L154-222) | Guarded: ≥1 item, not public | same | same | same + category modal | same + category modal | same + category modal | hook |
| Manage tab | Calls `refetchCities()` and remounts content (OWN-06) | Conditional render | same | same | same | same | same | n/a |
| Back from add | `/recommendations/places` (loses the list) | list | list | list | list | list | list | `/guides/...` |
| Back from list | internal step | `/recommendations/<cat>` | same | same | same | same | same | – |
| Home card click | Goes to the hub `/recommendations` (OWN-18) | opens list | opens list | opens list | opens list | opens list | opens list | `/guides/:id` |
| Loaders | `EarthLoader` (full screen) + `FavoritesSkeleton` + `RecommendationCardSkeleton` + full-screen saving overlay | `HeroSkeleton`, poster skeleton, `Loader2` | `HeroSkeleton`, `Loader2` | `Loader2` only | `HeroSkeleton`, `Loader2` | same | same | `GuideCardSkeleton` |

Other findings:
- Linked People/Products add pages pass `redirectBack=/recommendations`, but no add page reads it, so after saving the owner lands on that category, not on the Place list (OWN-05).
- No back button uses history; every target is hard-coded.
- Three toast systems exist (`sonner`, `LandingPage/hooks/use-toast.ts`, `hooks/useToast.ts`); the app uses `sonner`.
- Public places: `PublicHome` shows a hero map preview with a count badge (`MapPreviewFallback`, L253) and a CSS spinner, then `PublicRouteLoadingState` on map routes: the "two loaders + odd badge" in OWN-08.
- There is no "topics" model in code: what the owner calls topics are the per-category Top Picks managers and public browse rows (Genre/Subject/Sector), which exist for only four categories.

## 2. The system

### 2.1 Category hub template (all 8)
Header (back to origin, category name, **New list**) → topic chips row, ending in a fixed **Manage topics** chip that never hides → Featured row (same card component everywhere) → Your lists grid (cover, name, Published/Draft pill, item count). Cards open the list. Replaces the six Top Picks managers with one `FeaturedManager` keyed by category.

### 2.2 List page template
Header: back to origin, Share. Cover, name, count, status pill. Tabs **Recommendations | Manage** switched in place (no refetch, no remount; keep both mounted or cache the query). Recommendations: reorderable item rows (grip, thumbnail, title, subtitle, stars, Edit), **Add <item>**, and for Places the **Linked lists** panel. Manage: name, description, visibility, Share and QR, Delete (in-page confirm). Places moves from `step` state to a real `/recommendations/places/:listId` URL.

### 2.3 Add / edit item template
Always a full page, never an overlay. Order: search box → results → picked item shown as a confirmed card with **Change** → "Can't find it? Add manually" (keeps typed text) → category fields → rating → note → topics. **Sticky action bar** at the bottom on every width: Cancel, Save and add another, Save. Saving shows a spinner inside the Save button, not a full-screen overlay. Places: no Person type.

### 2.4 Rating
One `StarRating` component, tap again to clear, keyboard arrows. Scale is an owner decision (today: 10 stars or 1-10 select; mocks show 5).

### 2.5 Reorder
Keep `ReorderableList` drag grip as the primary interaction on every list including Games and Guides; arrows become keyboard-only (Space to pick up, arrows to move) instead of visible buttons. Save order immediately with a "Order saved" toast.

### 2.6 Linked lists panel (Places)
Panel under the items: each linked list as a row with type pill, Open, **Detach** (toast with Undo). **Link a list** opens a picker sheet with a backdrop. Opening a linked list and pressing back returns to the Place list.

### 2.7 Publish prompt rules
- Never on an empty list.
- Offer once when the list reaches 3 items, and when leaving an unpublished list that has at least one item (once per session per list).
- "Not now" suppresses it for that list until the next session.
- One component, driven by router state (not `history.replaceState`), used by all categories; the category-level visibility modal is asked only the first time a category gets a published list.

### 2.8 Loaders, empty states, toasts
- Skeletons shaped like the content for every page load; `EarthLoader` only for the very first app boot.
- One empty-state component (`CategoryEmptyState`): what goes here, one primary action.
- `sonner` only, bottom centre, past-tense verbs, Undo on removals. Remove the other two toast systems.

### 2.9 Navigation
Back returns to the origin: pass `from` in router state on every navigation into a list or add page and use it for back; fall back to the category hub on deep links. Implement `redirectBack` on all add pages. Home cards open the list (fix Places).

### 2.10 Public list page
One header band: owner handle and category, list name, count, **List | Map** toggle (Places only), Share. No floating map badge. One skeleton loader for the whole page, including map routes. Linked lists shown as "Also from this list" cards. Footer CTA to make your own list.

## 3. Proposed implementation order (after sign-off)
1. Shared primitives: `StarRating`, `StickyActionBar`, `ItemSearch` + manual fallback, origin-aware back helper, `PublishPrompt`.
2. Add/edit template, migrating Games, Apps, Products, People first (biggest gap), then Movies/Books, then Places.
3. List page template incl. Places URL route and linked-lists panel.
4. Hub template + unified `FeaturedManager`.
5. Public page header/map/loader.

## 4. Decisions needed from the owner
See the PR description (top 10).
