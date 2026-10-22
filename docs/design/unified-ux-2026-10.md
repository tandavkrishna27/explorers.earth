# Unified UX across categories (2026-10)

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
