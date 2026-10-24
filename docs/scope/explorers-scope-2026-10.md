# explorers.earth: consolidated scope (2026-10)

Status: **FINAL for the dashboard phase (2026-10-23).** The owner approved the dashboard design and delegated the remaining dashboard choices ("you can figure it out from here"). This doc is the single source of truth; the build plan is `docs/superpowers/plans/2026-10-23-dashboard-phase.md`. Docs only; no app code changes.
Code references are against `main` @ 8063651c unless noted.

It combines and replaces, as the place to read decisions:
- PR #187 `docs/operations/owner-walkthrough-root-causes-2026-10.md` (bug root causes)
- PR #188 `docs/design/unified-ux-2026-10.md` (dashboard UX, mocks v1-v5)
- PR #189 `docs/design/category-data-spec-2026-10.md` (data parameters + sourcing)
- the owner's walkthrough transcript and the discussions of 2026-10-22/23 (UX, guides, linking, privacy, controls, plugin, monetisation)
- the live UAT re-test results (UAT board, area OWN and leftovers)

Those three docs keep the detail (file:line evidence, field inventories, sourcing research). This doc keeps every decision.

**Approved mocks (SETTLED by the owner):**
- v3 dashboard: https://claude.ai/artifact/D89UZnowRi1R9veMbYeWtb
- v4 Guides: https://claude.ai/artifact/EQhDwNgFuhBnYM94xs964Q (day structure as revised in v4.2)
- v5 controls: https://claude.ai/artifact/UDhwrVqLBNh8xKtZpppf6v (one publish pill everywhere; full-width bottom add button on phones)
- v2 (category page and list page approved as they were): https://claude.ai/artifact/TmMMFzJnW2cEtmUE7vVF7k. v1: rejected.

Where a mock and an older line in this doc disagree, the newer mock wins (v5 > v4.2 > v4 > v3 > v2).

## How to read this

Each item has an ID, a status and a source.

| Status | Meaning |
|---|---|
| **SETTLED** | The owner decided it. Build it as written. |
| **SETTLED (delegated, recommended option)** | The owner delegated it; we adopted the recommended option written in the source docs (or, where none was written, the option stated here). Build it; the owner can override any of these. |
| **LATER** | Agreed direction, deliberately not in the dashboard phase. Screens must not block it. |
| **SUPERSEDED** | Replaced by a later decision; kept so it is not rebuilt. |

| Source key | What it is |
|---|---|
| WT | Owner's narrated walkthrough, 2026-10-22 (pasted transcript) |
| O1 | Owner on mocks v1 (screen names, Top Picks, toggles) |
| O2 | Owner answers on structure (3 tabs, toggles, nudge, loaders) |
| O3 | Owner on mocks v2 (colour, first visit, add item, public parked) |
| O4 | Owner on mocks v3 questions (colour, samples, location) |
| O5 | Owner on sample localisation |
| O6 | Owner opening the list-creation + Guides discussion |
| O7 | Owner on linking + Guides proposal |
| O8 | Owner on day items, per-list privacy, linking |
| O9 | Owner on privacy model + plugin direction |
| O10 | Owner on phase order, invite-by-email, saving lists, monetisation |
| O11 | Owner approving the Guides proposals: sections + templates (Trip first), in-page editor, day strip (2026-10-22) |
| O12 | Owner decision on Guides v4 day structure: one ordered list per day, optional time labels (2026-10-23) |
| O13 | Owner request: mock the placement of the publish and add controls (2026-10-23) |
| O14 | Owner decisions on v5: one publish pill everywhere; phone full-width bottom add button (2026-10-23) |
| O15 | Owner approval of the dashboard design + delegation of the remaining choices (2026-10-23) |
| P187 / P188 / P189 | The three docs PRs |
| UAT | Live UAT re-test of 2026-10-22 and its board |
| MEM | Recorded UX decisions of 2026-10-22 |
| DEL | Delegated choice made while finalising this doc (2026-10-23) |

---

## 1. Product direction

| ID | Item | Status | Source |
|---|---|---|---|
| DIR-01 | explorers.earth is a **human recommendation layer over AI**: people curate what they actually recommend; AI assistants consume and extend it. | SETTLED | O9 |
| DIR-02 | It stays a "recommend anything" platform across 8 categories: Places, Movies & Shows, Books, Games, Apps & Tools, Products, People, Guides. | SETTLED | O7, P188 |
| DIR-03 | The **main future interface is an AI plugin** (ChatGPT/Claude). Example: "I want to go to Italy for 7 days", discuss, then save the guide or list. | LATER | O9 |
| DIR-04 | Much of the item data can come from the AI itself, reducing our own API calls; we match places and images. | LATER | O9, O10 |
| DIR-05 | Public pages are meant to be shareable anywhere, e.g. in LinkedIn bios. | SETTLED (direction) | O9 |
| DIR-06 | Everything built now must not move away from the later directions: private sharing, plugin, monetisation (§9). | SETTLED | O10 |
| DIR-07 | Simple shared model under everything: **Item**, **List** (one category), **Link** (list ↔ list), **Guide** (sections/days holding items). Every dashboard action is one API command the plugin can later call. | SETTLED (delegated, recommended option) | O7 discussion, DEL |
| DIR-08 | Working method: investigate → owner approves → plan → build; ask rather than guess; mocks are built from the **live screens**, not from code. | SETTLED | WT, O1, MEM |
| DIR-09 | Every user flow must be defined and tested, including the ones the UAT missed. The build plan adds UAT cases for every flow in §3 and §6. | SETTLED | WT |
| DIR-10 | UI and experience must be **uniform across all categories**: similar UI, button placement, add journeys, data presentation. | SETTLED | WT |

## 2. Screen names

Use these names everywhere (code, docs, tickets). "Category hub" is not a screen name.

| ID | Screen | Route | Status | Source |
|---|---|---|---|---|
| SCR-01 | **All Recommendations**: the 8 big category cards | `/recommendations` | SETTLED | O1, MEM |
| SCR-02 | **Category page**: one category's lists | `/recommendations/<category>` | SETTLED | O1, MEM |
| SCR-03 | **List page**: one list, three tabs | `/recommendations/<category>/<listId>`; Places gets a real URL too (OWN-05) | SETTLED | O2, MEM |
| SCR-04 | **Add/edit item page** | per category | SETTLED | MEM |
| SCR-05 | **Guide page** (Plan \| Share \| Manage) | `/recommendations/guides/<guideId>` | SETTLED | v4, O11 |
| SCR-06 | **Public category page** `/<handle>/<category>` and **public list page** `/<handle>/<category>/<list>`: two separate screens, never merged. Design is the next phase (§8). | SETTLED (separate screens) | O1 |

---

## 3. Dashboard, screen by screen

### 3.0 Global rules

| ID | Item | Status | Source |
|---|---|---|---|
| GL-01 | Keep today's look: near-black page, `#14171f` bars, Poppins, blue `#60a5fa` buttons, card styles, spacing. Change only what is agreed. | SETTLED | O2, P188 |
| GL-02 | **Loaders:** the globe splash only at app start, with a friendlier message ("Getting your recommendations ready…"); content skeletons everywhere else; no full-screen saving overlay (spinner inside the Save button). One loading owner per screen (no stacked loaders). | SETTLED | O2, P188 |
| GL-03 | **Back always returns to the origin** (the list or guide you came from). Router state carries `from`; deep links fall back to the category page. | SETTLED | WT, P188 |
| GL-04 | **Publish nudge:** after the 3rd item, or when leaving a draft list that has items; never on an empty list. "Not now" suppresses it for that list for the session. One shared component driven by router state. | SETTLED | O2, WT, P188 |
| GL-05 | One toast system (`sonner`), bottom centre, past-tense verbs, Undo on removals; remove the other two toast systems. | SETTLED (delegated, recommended option) | P188 v1 §2.8 |
| GL-06 | Drag-and-drop reorder everywhere (list cards, items, guide days and guide items), replacing "Reorder lists" mode and arrow buttons; keyboard reorder kept for accessibility; order saves immediately with an "Order saved" toast. | SETTLED | WT, O2 |
| GL-07 | Saves and loads must feel fast (see OWN-17, OWN-06). | SETTLED | WT |
| GL-08 | **Controls placement (v5).** Top right holds status and publish; Add lives in the content. **One publish pill** on the category, list and guide pages: same component, spot and menu. Category: "🌐 Public ▾" / "🔒 Hidden ▾". List or guide: "✎ Draft ▾" / "🌐 Public ▾", with "👥 Private" (coming soon) in the menu. The menu ticks the current option with a one-line explanation each. Desktop: "+ New list" header button plus a dashed first card; "+ Add item" at the right of the tab row (Recommendations only) plus a dashed end row; a large CTA on an empty list; a dashed "+ Add to day" per day. **Phones:** a full-width sticky bottom button (~56px, above the safe area, shrinks on scroll down, restores on scroll up) reading "+ New list", "+ Add item" or "+ Add to Day N"; hidden on Share/Manage and on an empty list; replaces the floating +. | SETTLED | O13, O14, v5 |
| GL-09 | Superseded by GL-08: the left-side category toggle, the left-side list Published toggle, the separate "On profile" chip and the separate Publish button. | SUPERSEDED | v5 |

### 3.1 All Recommendations

| ID | Item | Status | Source |
|---|---|---|---|
| AR-01 | Keep the 8 cards. Icons, illustrations, animations and features stay exactly as today. | SETTLED | O3, O4 |
| AR-02 | **One brand colour** for all 8 cards, in shades of today's dark card plus the blue accent. No per-category tints. | SETTLED | O4 |
| AR-03 | One badge style (● Public / outlined Hidden) and one ⋯ menu style. | SETTLED | O2 |
| AR-04 | **No sample badges or notes on this screen.** | SETTLED | O4 |

### 3.2 Category page

| ID | Item | Status | Source |
|---|---|---|---|
| CAT-01 | One template for all 8 categories, Places and Guides included. | SETTLED | O2, O7 |
| CAT-02 | Category visibility is the publish pill (GL-08: Public / Hidden). It is the **master switch for the profile** (PRIV-04). | SETTLED | O9, v5 |
| CAT-03 | **+ New list** (Places too; "Add Location" goes). Guides: "+ New guide". Placement per GL-08. | SETTLED | O2, O7, v5 |
| CAT-04 | **Top Picks** hero carousel, named Top Picks everywhere (no "Featured"), with Manage Top Picks. Always shows, with an empty state ("Pin items to feature them here") and a first-visit state. One shared Top Picks manager replaces the six per-category managers. | SETTLED | O1, O2, P188 |
| CAT-05 | The Manage Top Picks control never disappears (OWN-16). | SETTLED | WT |
| CAT-06 | List cards keep today's design: cover thumbnails, Public/Draft badge, item count, pinned count. Names wrap. No "Open" word; whole card clickable. | SETTLED | O2 |
| CAT-07 | Dashed "+ New list" card. | SETTLED | O2, v5 |
| CAT-08 | Publishing from a list card: desktop keeps a compact toggle on the card; on phones it moves into the card ⋯ menu (same options as the pill). | SETTLED (delegated, recommended option) | P188 v2 Q2, O2, DEL |
| CAT-09 | Location chips replace "Filters" on the Guides category page. | SETTLED | v4 |

### 3.3 First visit: sample lists

| ID | Item | Status | Source |
|---|---|---|---|
| SMP-01 | A new account gets 2-3 **sample lists** per category, the user's own lists marked **Sample**, shown as normal list cards; Top Picks shows their picks with the same badge. | SETTLED | O3, O4 |
| SMP-02 | Samples open as full list pages with all item details; browsable and reorderable. | SETTLED | O4 |
| SMP-03 | A sample can't be published and never appears on the profile. | SETTLED | O4 |
| SMP-04 | **Make it mine** turns a sample into a normal draft list in place, with no copy. | SETTLED | O4 |
| SMP-05 | Each sample can be **deleted** (card ⋯ or list page); deleted samples never come back. | SETTLED | O4 |
| SMP-06 | Samples stay until deleted; creating a real list doesn't remove them; no "Hide samples" control. | SETTLED | O4, O5 |
| SMP-07 | **Localised by the onboarding country.** Places samples local; movies, books, games mostly global; apps and products global with some local flavour. Start with India and Global. | SETTLED | O5 |
| SMP-08 | Seeded per new account from versioned per-country fixtures with an `is_sample` flag; publish paths and the public read model refuse `is_sample`; Make it mine clears it; delete is a normal delete. | SETTLED | P188 v3 |
| SMP-09 | Sample content: the build session drafts the India and Global fixture sets (realistic, generic items; places only from Google-resolvable real places; no real people's personal data; People samples use public figures' public profiles only) and the owner can swap any item. | SETTLED (delegated, recommended option) | DEL |
| SMP-10 | Guides samples: one sample Trip guide per set (e.g. "3 days in Goa" / "48 hours in Paris"). | SETTLED (delegated, recommended option) | DEL |

### 3.4 Create list

| ID | Item | Status | Source |
|---|---|---|---|
| NL-01 | Creating a list is the **same in every category**: one shared popup with a backdrop. Places' overlay flow goes. | SETTLED | O6 |
| NL-02 | Fields: name, optional short description, web address (slug) shown small and editable. After creating, land on the new list with "Add your first …" ready; no publish prompt on an empty list. | SETTLED (delegated, recommended option) | O6 discussion |
| NL-03 | Places adds one field, **Location** (city/area search); the name starts as the city but is editable. | SETTLED (delegated, recommended option) | O6 discussion |
| NL-04 | Places: more than one list per city is allowed (e.g. "Goa food", "Goa beaches"). | SETTLED (delegated, recommended option) | O6 discussion |
| NL-05 | Places: the social link and note move out of creation into Manage. | SETTLED (delegated, recommended option) | O6 discussion |

### 3.5 List page

| ID | Item | Status | Source |
|---|---|---|---|
| LP-01 | Header: Back and list name on the left; the publish pill top right (GL-08). | SETTLED | O2, v5 |
| LP-03 | Three tabs: **Recommendations** (add item, drag reorder, ☆ pin to Top Picks, item ⋯ menu), **Share** (link, Copy, QR card with working full-size Download QR, social share), **Manage** (name, description, cover, URL slug, Places social link + note; linked lists attach/detach; Archive/Delete). | SETTLED | O1, O2 |
| LP-04 | No duplicate Published toggle inside Manage. | SETTLED | O2 |
| LP-05 | **Per-item Draft/Publish is removed**: items follow their list. | SETTLED | O2 |
| LP-06 | Switching tabs never reloads the screen (OWN-06). | SETTLED | WT |
| LP-07 | Linked lists show as a section under the items (§5). | SETTLED | O7, O8 |
| LP-08 | Keep both: **Archive** hides the list and frees its slug (pairs with the OWN-01 fix) and can be restored from an "Archived" filter; **Delete** is permanent, with an in-page confirm. | SETTLED (delegated, recommended option) | P188 v2 Q7, DEL |
| LP-09 | The URL slug stays editable after publishing; the old slug keeps redirecting to the list (printed QR codes keep working). | SETTLED (delegated, recommended option) | P188 v2 Q8 |
| LP-10 | Privacy options designed into the pill menu and Share now ("👥 Private" coming soon); built later (§7). | SETTLED (design now, build LATER) | O9, v5 |

### 3.6 Add/edit item

| ID | Item | Status | Source |
|---|---|---|---|
| ADD-01 | Always a **full page**, never an overlay without a backdrop (OWN-09). Same journey in every category. | SETTLED | WT, O2 |
| ADD-02 | **Sticky action bar** so the user never scrolls to Save (OWN-04). | SETTLED | WT |
| ADD-03 | No Search/Manual tabs. Full-row search bar; small **"Can't find it? Add manually"** link above it on the right; empty results show an "Add manually" button; typed text carries into the manual Name; "Back to search" returns. | SETTLED | O3, O4 |
| ADD-04 | The picked item shows clearly at the top as a confirmed card with **Change** (OWN-09). | SETTLED | WT, P188 |
| ADD-05 | One **5-star** rating widget with half-steps everywhere (DS-01); tap again to clear; keyboard arrows; no dropdowns (OWN-12). | SETTLED (delegated, recommended option) | WT, P189 |
| ADD-06 | Places: one field takes a name **or coordinates**; `15.49, 73.82` resolves to a pin plus the nearest named places. | SETTLED | O3, O4 |
| ADD-07 | Places: ◎ use my location (nearby suggestions) and a map icon (pick-on-map sheet; "Use this pin" continues in the manual form). | SETTLED | O3, O4 |
| ADD-08 | Location cost: browser geolocation is free and remembered; nearby lookup only on tap, cached per rounded area, basic fields only; OpenStreetMap as a free fallback. | SETTLED | O4 |
| ADD-09 | Places: remove the "Place / Person" type (OWN-10). | SETTLED | WT |
| ADD-10 | Places category/subcategory picker works and is a **searchable** combobox (type to filter the 335 terms; subcategory follows category) (OWN-03). Same picker component for every category's taxonomy. | SETTLED (delegated, recommended option) | WT, UAT, DEL |
| ADD-11 | Products form per DS-03..DS-06 and DS-14. | SETTLED (delegated, recommended option) | WT, P189 |
| ADD-12 | People form: sector picker (required), no rating, profile link with platform auto-detect, per DS-02/DS-08/DS-09. | SETTLED (delegated, recommended option) | WT, P189 |
| ADD-13 | Action bar: Cancel, **Save and add another**, Save. | SETTLED (delegated, recommended option) | P188 v1 §2.3 |
| ADD-14 | Paste-a-link prefill for Apps, Products and People (DS-11); Apps keyword search (DS-12). | SETTLED (delegated, recommended option) | P189 |

### 3.7 Home

| ID | Item | Status | Source |
|---|---|---|---|
| HOME-01 | Clicking a place (list) on Home opens that list (OWN-18). | SETTLED | WT |

### 3.8 Bugs: root cause and fix

All SETTLED as "must fix". Root cause and fix from P187 unless noted.

| ID | Sev | Bug | Root cause | Fix | Source |
|---|---|---|---|---|---|
| OWN-11 | P0 | Saving a place fails: Zod `invalid_string url` on `creatorSocialUrl` | `useAddRecommendation.ts:205` passes `recommendationLink` raw | Wrap with `profile()`; refuse non-normalisable values on the form; unit case for `@handle`. S | WT, P187 |
| OWN-01 | P1 (P0 in plan order) | "URL already used" for an invisible Paris list | `UNIQUE(account_id,category,slug)` (0029) ignores `archived_at` | Partial unique index `WHERE archived_at IS NULL` (migration 0065). S | WT, P187 |
| OWN-17 | P1 | Saves and loads slow | Serial round trips × ~185 ms; serial TMDB image import inside the request; whole owner reload after every places command; `/me` ×3 on Home | Async movie image import (3-4 parallel); drop the thrown-away GET; invalidate once; parallel photo upload before create; dedupe `/me`; batch media INSERTs. M (movies L) | WT, P187 |
| OWN-18 | P1 | Home → place doesn't open | `Home.tsx:1000` navigates to `/recommendations` | Navigate to the list route. S | WT, P187 |
| OWN-05 | P1 | Back/open goes to the category | Hard-coded targets; open list only in a store | Addressable list route; every return path carries it. M | WT, P187 |
| OWN-07 | P1 | Downloaded QR cut to a quarter | `ShareModal.tsx:95-104` `toPng` without width/height in a scaled modal | Width/height, no style override, pixelRatio 2 (or off-screen render). S | WT, P187 |
| OWN-19 | P1 | Place images missing; a list missing | Images only from uploaded media; failed per-list reads dropped silently | Provider-photo fallback; retry + error row. M | WT, P187 |
| OWN-06 | P2 | Manage tab reloads the screen | `refetchCities()` → `Favorites.tsx:1061` swaps the page for `EarthLoader` | `(loading && !cities) \|\| !accountById`; background-refresh indicator; tabs kept mounted. S | WT, P187 |
| OWN-08 | P2 | Two loaders on the public page | `PublicColdEntryBoundary` EarthLoader then `TabVisibilityGuard` HeroSkeleton | One loading owner (shared loader work in the dashboard phase); the rest of the public redesign is §8. S | WT, P187 |
| OWN-02 | P2 | Publish prompt too early | Places has two triggers with no empty check | GL-04 shared component. | WT, P188 |
| OWN-03 | P1 | Category/subcategory unusable, overlapping text | Taxonomy unconfigured (applied 2026-10-22) + styling | ADD-10. | WT, UAT |
| OWN-04 | P2 | Save not sticky | Save at end of scroll | ADD-02. | WT |
| OWN-09 | P1 | Add-place overlay without backdrop; picked name not shown | `AddPlaceOverlay` + `RecommendForm` | ADD-01, ADD-04. | WT, P188 |
| OWN-10 | P2 | Person type inside add-place | `recommendationType: person` | ADD-09. | WT, P189 |
| OWN-12 | P1 | Inconsistent add forms | Per-category copies | One add template. | WT, P188 |
| OWN-13 | P1 | Linked lists can't be detached | Detach only inside linked add pages | §5. | WT, P188 |
| OWN-14 | P2 | Reorder clumsy | Grip + arrows + mode | GL-06. | WT |
| OWN-15 | P2 | Product form confusing | "Logo URL" used as main photo; two price inputs; 200-row specs | DS-03..DS-06. | WT, P189 |
| OWN-16 | P2 | Manage topics bar disappears; carousels differ | Six Top Picks managers | CAT-04/05. | WT, P188 |
| OWN-20 | P2 | Sourcing for products and people | Manual only | DS-11, DS-12. | WT, P189 |
| UAT-01 | P2 | Game detail shows only the first platform chip | to root-cause | Fix in Games package. | UAT |
| UAT-02 | P3 | Enter in game search doesn't search | to root-cause | Fix in Games package. | UAT |
| UAT-03 | P2 | Book cover still hotlinked from Open Library after a 200 import | to root-cause | Use our stored copy everywhere. | UAT |
| UAT-04 | P3 | Arabic "Itinerary" untranslated | missing string | Add translation. | UAT |
| UAT-06 | — | Google Books 503; Open Library serves search | external | Monitor; no code. | UAT |
| UAT-07 | — | "UAT Games Retest" draft left on the test account | leftover | Clean up at live re-test. | UAT |
| UAT-08 | — | 55 board cases blocked on owner-only actions | owner / second account | Owner runs them at final sign-off. | UAT |

---

## 4. Per-category data parameters

Detail and code citations: P189.

### 4.1 Shared core (every category)

| Field | Spec | Status |
|---|---|---|
| Title | required, ≤500 | SETTLED (delegated, recommended option) |
| Image | one primary image (uploaded or provider-imported) + gallery ≤10; one UI name ("Photo"/"Cover") | SETTLED (delegated, recommended option) |
| Your note | RichNote, optional | SETTLED (delegated, recommended option) |
| Your rating | 5 stars with half-steps, stored as today's 1-10 integer (star = value/2); no data migration | SETTLED (delegated, recommended option) |
| Link | one primary link; extra links in a category list | SETTLED (delegated, recommended option) |
| Category | one curated taxonomy term (Places two levels) | SETTLED (delegated, recommended option) |
| Tags | optional free-text, ≤12 | SETTLED (delegated, recommended option) |

### 4.2 Category extras

All rows SETTLED (delegated, recommended option), per P189 §2.2.

| Category | Essential | Nice | Remove / hide | Taxonomy | Source |
|---|---|---|---|---|---|
| Places | address + pin, category/subcategory, photos | opening-hours link, price level, phone (public only if opted in), website | person toggle; legacy note after migration; provider types internal | 335 terms (applied) | Google Places (New) |
| Movies & Shows | type, year, poster, genres, where to watch | director, runtime/seasons (surface them), cast top 10, overview | — | curated genres | TMDB |
| Books | authors, cover, year | publisher, pages, description, buy links | hide ISBN, language, preview link | ~25 genres | Google Books → Open Library |
| Games | cover, year, platforms, genres | developer (add from IGDB `involved_companies`), summary, screenshots ≤10 | dead `developer` render until the field exists; stop fetching unused IGDB fields | IGDB genres → curated | IGDB |
| Apps & Tools | icon, one link, platforms, price model (Free/Freemium/Paid/Subscription) | developer, screenshots, description | separate `downloadUrl` (merge into link + "other platform links") | ~20 terms | iTunes search + link preview |
| Products | product photo, brand, "Where to buy" link, price with currency in one input | ≤8 key specs as labelled rows | brand-logo URL, second URL, 200-row specs | ~20 terms | link preview + JSON-LD |
| People | name, photo, headline, sector (required), profile link (platform auto-detected) | ≤4 extra social links, location | rating, follower count, platform select; skills become plain tags | 20 sectors (applied) | link preview / oEmbed + manual |
| Guides | per §6 | — | free-text `categories` → core picker; tags kept, optional | guide type + core picker | none |

Keep the product money semantics (exact decimal, "0" = free, null = not recorded, ISO 4217, old rows readable). Legal line: user-initiated, one URL at a time, public metadata only, images only where terms allow, opt-out via `suppressed`.

### 4.3 The 15 data decisions

| ID | Decision adopted | Status | Source |
|---|---|---|---|
| DS-01 | One 5-star widget (half-stars) for every rated category, stored as today's 1-10 | SETTLED (delegated, recommended option) | P189 #1 |
| DS-02 | Remove rating from People | SETTLED (delegated, recommended option) | P189 #2 |
| DS-03 | Product "Logo URL" → "Product photo"; no brand-logo concept | SETTLED (delegated, recommended option) | P189 #3, WT |
| DS-04 | One "Where to buy" link (affiliate allowed, never cloaked) | SETTLED (delegated, recommended option) | P189 #4 |
| DS-05 | Price as one input with a currency selector, default from the owner's locale | SETTLED (delegated, recommended option) | P189 #5, WT |
| DS-06 | Specifications capped at 8 "key facts" | SETTLED (delegated, recommended option) | P189 #6 |
| DS-07 | Curated ~20-term taxonomies for Movies, Books (~25), Games, Apps, Products; the build session drafts the term lists, the owner can edit them | SETTLED (delegated, recommended option) | P189 #7 |
| DS-08 | People sector required (taxonomy is live) | SETTLED (delegated, recommended option) | P189 #8 |
| DS-09 | Drop the follower count on People | SETTLED (delegated, recommended option) | P189 #9 |
| DS-10 | Retire the Places person toggle; Instagram scraper off by default | SETTLED (delegated, recommended option) | P189 #10, WT |
| DS-11 | One "paste a link" prefill service (OG/Twitter/JSON-LD + oEmbed) for Apps, Products, People; no paid APIs | SETTLED (delegated, recommended option) | P189 #11 |
| DS-12 | Apps: free iTunes keyword search; Play Store stays paste-URL | SETTLED (delegated, recommended option) | P189 #12 |
| DS-13 | Product search (SerpApi/eBay): deferred until owners ask (not built) | SETTLED (delegated, recommended option) | P189 #13 |
| DS-14 | Affiliate-disclosure toggle on Products | SETTLED (delegated, recommended option) | P189 #14 |
| DS-15 | Provider ratings as a small source chip ("TMDB 7.8"), never on the owner's scale | SETTLED (delegated, recommended option) | P189 #15 |

| ID | Item | Status | Source |
|---|---|---|---|
| DATA-01 | All parameters, data points, DB and logic sorted for the dashboard before public pages. | SETTLED | O10 |
| DATA-02 | Games year, platforms, genres stored (migration 0064, deployed). | SETTLED (done) | coordinating session |

---

## 5. Linking

| ID | Item | Status | Source |
|---|---|---|---|
| LNK-01 | **Any list can link to any list**, in any category; Places with People/Products is one example. | SETTLED | O7, O8 |
| LNK-02 | **Own lists only.** | SETTLED | O8, brief |
| LNK-03 | **One level deep**: a linked list shows as a card; no chains. | SETTLED | O8, brief |
| LNK-04 | Managed in Manage: "Linked lists" with **Attach** and **Detach** (Detach with Undo). Fixes OWN-13. | SETTLED | WT, O7 |
| LNK-05 | Shown as a "Linked lists" section under the items; opening one and pressing Back returns to the origin. | SETTLED | O7 |
| LNK-06 | "Create a new list" in the attach picker uses the shared New list popup, attaches it, and returns to the origin list. | SETTLED (delegated, recommended option) | O6 discussion |
| LNK-07 | Visitors see only linked lists that are publicly visible. | SETTLED | O8 |
| LNK-08 | Guides link whole lists at guide level, each with a role ("Places to choose from", "Packing list", free label). Attach/detach in Manage; Plan shows them read-only. | SETTLED | O7, v4 |
| LNK-09 | Today's Places-only People/Products links migrate into the general link model. | SETTLED (delegated, recommended option) | DEL |
| LNK-10 | Show linked lists to visitors as "Also on this list" | LATER (public pages) | P188 v2 Q6 |

## 6. Guides

Approved: v4 (as revised by v4.1 and v4.2) and v5. Trip template now; Topic template later.

| ID | Item | Status | Source |
|---|---|---|---|
| GD-01 | Name stays **Guides**. | SETTLED | O8 |
| GD-02 | Same category-page template: publish pill, "+ New guide", Top Picks, location chips, draggable cards. | SETTLED | O7, v4, v5 |
| GD-03 | **New guide popup:** template (Trip; Topic marked "Later"), title, destination, number of days, optional dates, optional tags. Created as Draft; land straight in the editor. Replaces today's 3-step page. | SETTLED | O7, v4, O11 |
| GD-04 | Best months, budget type and tags optional; the 4-tag minimum goes. | SETTLED | O7, O8 |
| GD-05 | Optional trip dates. | SETTLED | O7 |
| GD-06 | Draft / Public now (Private coming soon) with the same publish pill and nudge rules as lists. | SETTLED | O7, v4, v5 |
| GD-07 | "From my lists" in the add box, across all categories. | SETTLED | O7, O11 |
| GD-08 | A day holds **single items**: from my lists (referenced, they stay in their list), Google search, or a free-text note. | SETTLED | O8, O11 |
| GD-09 | Two layers: whole lists linked at guide level (LNK-08); single items in days. | SETTLED | O8, O11 |
| GD-10 | One guide serves as a private plan (Draft) and, once published, a guide for others. | SETTLED (delegated, recommended option) | O7 discussion |
| GD-11 | Planning is single-editor in this phase; planning with friends/real-time shared editing comes with private sharing. | SETTLED (delegated, recommended option) / sharing LATER | O10, DEL |
| GD-12 | Packing/booking checklist. | LATER | O7 discussion |
| GD-13 | "Make it mine" copy of someone else's public guide (entry on the public guide page). | LATER (saving others' lists) | v4, O10 |
| GD-14 | Guides built in ChatGPT arrive as Draft, places matched, unmatched marked "check this", never auto-published; imports keep time labels. | LATER | O8, O9, O12 |
| GD-15 | Strapi-era public guide UI as reference. | LATER (public pages) | O10 |
| GD-16 | Guides usable for personal planning (dates + from-my-lists close the gap). | SETTLED (delegated, recommended option) | O6 |
| GD-17 | **A guide is a set of sections** defined by a template: **Trip** (days) now; **Topic guide** (user-named sections, no days) later. Same editor and data. | SETTLED (Trip now; Topic LATER) | O11 |
| GD-18 | **In-page editor, no popup.** "+ Add to Day N" opens a **smart box in place** at the end of the day: saved items first (any category), then Google results (with location + map buttons), then "Add as a note: …". | SETTLED | O11, O12 |
| GD-19 | **My lists panel:** desktop panel right of the plan (pick a list, drag items into any day or tap +; Map tab with days as coloured pins); phones: bottom sheet for browsing. | SETTLED | O11 |
| GD-20 | **Day strip** sticky at top: dates when set, otherwise Day N; tap jumps; "+ Day" appends. Day ⋯: insert before/after, duplicate, clear, delete. Days drag by grip; Manage's day count stays in sync. | SETTLED | O11 |
| GD-21 | Status uses the publish pill (GL-08); Draft shows "Only you can see this". | SETTLED | O11, v5 |
| GD-22 | Guide page tabs **Plan \| Share \| Manage**. Inside Plan: Itinerary always; Stay, Transport, Budget, Tips as "+ Add" chips that appear once they have content. | SETTLED | v4 (approved by v4.2) |
| GD-23 | **Each day is one ordered list**, optional **time label** per item (Morning, Afternoon, Evening, Night, or exact time like 9:30) set from a chip or the item menu; time headings appear only when labels exist; data = order + one nullable `time_label`; no slot entities. | SETTLED | O12 |
| GD-24 | **Add a day:** "+ Day" on the day strip appends a day (and extends dates by one when dates are set); day ⋯ "Insert before/after" adds one in place and renumbers; numberOfDays updates in the same command. | SETTLED (delegated) | DEL |
| GD-25 | **Add to a day:** desktop dashed "+ Add to day" row at the end of each day; phones the bottom button "+ Add to Day N" for the selected day (strip selection). Both open the GD-18 smart box anchored to that day; Enter/tap adds and keeps the box open for the next item; Esc/outside closes. Dragging from My lists into a day inserts at the drop position. | SETTLED (delegated) | v5, DEL |
| GD-26 | **Reorder within a day:** drag handle on each item; keyboard Space + arrows; the time label stays with the item (headings re-group automatically); order saves immediately ("Order saved"). | SETTLED (delegated) | GL-06, DEL |
| GD-27 | **Move between days:** drag an item onto another day's list (desktop) or onto a day chip in the strip (drops at the end of that day). Item ⋯ menu "Move to day…" lists days for phones and keyboard users. One command moves (no delete + re-add), with Undo. | SETTLED (delegated) | v4, DEL |
| GD-28 | **Reorder days:** drag the day grip (or day ⋯ "Move earlier/later" on phones); items move with their day; with dates set, dates stay attached to positions (Day 1 keeps the start date) and content moves. | SETTLED (delegated) | O11, DEL |
| GD-29 | **Delete/clear a day:** clear empties it; delete removes it with Undo; deleting the last remaining day is not allowed. | SETTLED (delegated) | O11, DEL |
| GD-30 | **Item actions:** set/clear time label, edit note, open source item, move to day, remove from guide (never deletes the source list item). | SETTLED (delegated) | DEL |
| GD-31 | Existing guides migrate: today's morning/afternoon/evening picks become ordered items with the matching time label; sections (stay, transport, budget, tips, checklist) map to the Plan chips. | SETTLED (delegated) | O12, DEL |
| GD-32 | Superseded: fixed Morning/Afternoon/Evening slots (v4) and the "Add to slot" popup. | SUPERSEDED | O12, v4.1 |

## 7. Privacy model

| ID | Item | Status | Source |
|---|---|---|---|
| PRIV-01 | **Draft**: owner only; cannot be shared. | SETTLED | O9, brief |
| PRIV-02 | **Published-Public**: on the public page. | SETTLED | O9, brief |
| PRIV-03 | **Published-Private**: invite-only by email; only a published list/guide can be private. | SETTLED (build LATER) | O9, O10 |
| PRIV-04 | The **category toggle is a master switch** for the profile. | SETTLED | O9 |
| PRIV-05 | Privacy is **per list and per guide**, in every category. | SETTLED | O8 |
| PRIV-06 | Private is built later; the pill menu and Share show "👥 Private — coming soon" now, and the state model reserves it (no schema rework later). | SETTLED | brief, O10, v5 |
| PRIV-07 | Optional password for private lists. | LATER | O10 |
| PRIV-08 | Close circle / share a dated guide with friends, accessible from their own ChatGPT. | LATER | O7, O9 |
| PRIV-09 | "Draft becomes Private" and the 4-level setting with "Link only". | SUPERSEDED | O9 |
| PRIV-10 | A cross-category private collection = a Guide with linked lists; no new type. | SETTLED (delegated, recommended option) | O8 |
| PRIV-11 | Invite flow details (who invites, account needed, revoke, what invitees see). | LATER (private sharing phase) | O10 |

## 8. Public pages (next phase)

| ID | Item | Status | Source |
|---|---|---|---|
| PUB-01 | Public category and public list design: the next phase, discussed separately after the dashboard ships. | LATER | O3 |
| PUB-02 | Odd map-view badge and top navigation on the public list page (remainder of OWN-08). | LATER | WT |
| PUB-03 | Map toggle (List \| Map) only on Places. | LATER | P188 v2 |
| PUB-04 | Hide the Top Picks hero for visitors when empty. | LATER | P188 v2 Q5 |
| PUB-05 | "Also on this list" (LNK-10). | LATER | P188 v2 Q6 |
| PUB-06 | Footer CTA "make your own list". | LATER | P188 v1 |
| PUB-07 | Category off → redirect to the profile (today's behaviour). | LATER (confirm then) | P188 v2 |
| PUB-08 | Link previews use the list/profile image (UAT-05). | LATER | UAT |
| PUB-09 | Public Guides UI (GD-15). | LATER | O10 |

## 9. Later phases, in order

| # | Phase | Status | Source |
|---|---|---|---|
| 1 | **Dashboard phase** (this scope; build plan `docs/superpowers/plans/2026-10-23-dashboard-phase.md`), then **public pages** (§8); platform finished and cleared on hosted. | SETTLED (now) | O10, O15 |
| 2 | **Private sharing**: Published-Private by email invite, then optional password. | LATER | O10 |
| 3 | **Saving others' lists** (from a public page or via ChatGPT; copy vs follow vs link) incl. "Make it mine" on public guides. | LATER | O10, brief |
| 4 | **Plugin** (ChatGPT/Claude): main interface; ChatGPT supplies most data, we match places and images; invitees reach shared guides from their own ChatGPT. Built last, after the platform is cleared on hosted. | LATER | O9, O10 |
| 5 | **Monetisation**: selling digital guides/lists; influencer group trips with OTA integrations. | LATER | O10 |

## 10. Open questions

None for the dashboard phase: every remaining dashboard item was delegated (O15) and is marked "SETTLED (delegated, recommended option)". Questions for later phases live with them in §7-§9 (invite flow, saving others' lists, public page details).

### Delegated choices most worth the owner's glance

1. DS-01 / ADD-05: 5-star half-step ratings everywhere (stored as 1-10, so existing ratings display halved).
2. DS-02, DS-09: People lose rating and follower count.
3. DS-07: new curated category lists for Movies, Books, Games, Apps, Products (term lists drafted by the build).
4. LP-08 / LP-09: Archive frees the slug; slugs stay editable with redirects.
5. NL-04: several Places lists per city.
6. CAT-08: on phones, card publishing moves into the card ⋯ menu.
7. GD-27 / GD-28: move-between-days and reorder-days behaviour (dates stay with positions).
8. SMP-09: sample content drafted by the build session.

## Appendix: status count

| Status | Count |
|---|---|
| SETTLED (owner) | 116 (incl. 27 bug-fix rows) |
| SETTLED (delegated, recommended option) | 60 (GD-24..GD-31 are the delegated Guides flow) |
| LATER | 23 |
| SUPERSEDED | 3 |

Counted over tagged rows in §1-§9, each row once by its first status. The 7 shared-core rows in §4.1 and 8 category rows in §4.2 count as delegated.
