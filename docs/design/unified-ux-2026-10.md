# Unified UX across categories (2026-10)

Status: **v2, awaiting owner decisions.** No app code changes.
Mocks v2: https://claude.ai/artifact/TmMMFzJnW2cEtmUE7vVF7k (private, clickable, desktop + mobile).
v1 mocks (https://claude.ai/artifact/MjTwMPH2QyCkQB6ZHaV2zx) were rejected by the owner: built from code only, merged the two public screens, dropped Top Picks, ignored visibility toggles and Manage/QR. v2 replaces them.

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
