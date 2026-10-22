# explorers.earth: consolidated scope (2026-10)

Status: **for owner review.** This is the single source of truth for the build plan. Docs only; no app code changes.
Date: 2026-10-22. Code references are against `main` @ 8063651c unless noted.

It combines and replaces, as the place to read decisions:
- PR #187 `docs/operations/owner-walkthrough-root-causes-2026-10.md` (bug root causes)
- PR #188 `docs/design/unified-ux-2026-10.md` (dashboard UX, mocks v1/v2/v3)
- PR #189 `docs/design/category-data-spec-2026-10.md` (data parameters + sourcing)
- the owner's walkthrough transcript and the discussions of 2026-10-22 (UX, guides, linking, privacy, plugin, monetisation)
- the live UAT re-test results (UAT board, area OWN and leftovers)

Those three docs keep the detail (file:line evidence, field inventories, sourcing research). This doc keeps every decision and every open question.

**Mocks v3 (dashboard):** https://claude.ai/artifact/D89UZnowRi1R9veMbYeWtb (private). v2: https://claude.ai/artifact/TmMMFzJnW2cEtmUE7vVF7k (category page and list page approved). v1: rejected.

## How to read this

Each item has an ID, a status and a source.

| Status | Meaning |
|---|---|
| **SETTLED** | The owner decided it. Build it as written. |
| **OPEN** | Needs an owner decision (a recommendation is given where one exists). |
| **LATER** | Agreed direction, deliberately not in the current build. Screens must not block it. |

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
| P187 / P188 / P189 | The three docs PRs |
| UAT | Live UAT re-test of 2026-10-22 and its board |
| MEM | Recorded UX decisions of 2026-10-22 |

Where a later owner statement changes an earlier one, the later one wins and the item says so.

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
| DIR-07 | Simple shared model under everything: **Item** (one thing recommended), **List** (curated items in one category), **Link** (list ↔ list), **Guide** (days holding items). The plugin later calls the same actions the app uses. | OPEN (proposed; owner did not object, guide day model still under discussion, see §6) | O7 discussion |
| DIR-08 | Working method: investigate → owner approves → plan → build; ask rather than guess; mocks are built from the **live screens**, not from code. | SETTLED | WT, O1, MEM |
| DIR-09 | Every user flow must be defined and tested, including the ones the UAT missed ("a lot of these things are not included in the UAT"). The build plan adds UAT cases for every flow in §3. | SETTLED | WT |
| DIR-10 | UI and experience must be **uniform across all categories**: similar UI, button placement, add journeys, data presentation. | SETTLED | WT |

## 2. Screen names

Use these names everywhere (code, docs, tickets). "Category hub" is not a screen name; it confused the owner.

| ID | Screen | Route | Status | Source |
|---|---|---|---|---|
| SCR-01 | **All Recommendations**: the 8 big category cards | `/recommendations` | SETTLED | O1, MEM |
| SCR-02 | **Category page**: one category's lists | `/recommendations/<category>` | SETTLED | O1, MEM |
| SCR-03 | **List page**: one list, three tabs | Places to get a real URL (see BUG OWN-05) | SETTLED | O2, MEM |
| SCR-04 | **Add/edit item page** | per category | SETTLED | MEM |
| SCR-05 | **Public category page**: a handle's lists in one category | `/<handle>/<category>` | SETTLED as a separate screen; design parked (§8) | O1 |
| SCR-06 | **Public list page** | `/<handle>/<category>/<list>` | SETTLED as a separate screen; design parked (§8) | O1 |
| SCR-07 | Public category and public list are **two screens; never merge them**. | SETTLED | O1 |

---

## 3. Dashboard, screen by screen

### 3.0 Global rules

| ID | Item | Status | Source |
|---|---|---|---|
| GL-01 | Keep today's look: near-black page, `#14171f` bars, Poppins, blue `#60a5fa` buttons, card styles, spacing. Change only what is agreed. | SETTLED | O2, P188 |
| GL-02 | **Loaders:** the globe splash only at app start, with a friendlier message ("Getting your recommendations ready…"); content skeletons everywhere else; no full-screen saving overlay (spinner inside the Save button). | SETTLED | O2, P188 |
| GL-03 | **Back always returns to the origin** (the list you came from, not the category). | SETTLED | WT, P188 |
| GL-04 | **Publish nudge:** after the 3rd item, or when leaving a draft list that has items; never on an empty list. | SETTLED | O2, WT |
| GL-05 | One toast system (`sonner`), past-tense verbs, Undo on removals; remove the other two toast systems. | OPEN (proposal, not discussed) | P188 v1 §2.8 |
| GL-06 | Drag-and-drop reorder everywhere (list cards and items), replacing "Reorder lists" mode and arrow buttons; keyboard reorder kept for accessibility. | SETTLED | WT, O2 |
| GL-07 | Saves and loads must feel fast (see BUG OWN-17). | SETTLED | WT |
| GL-08 | **Controls placement:** the top right holds status and publish; Add lives in the content; the floating + appears on phones only. Category page: an "On profile ✓ / Hidden" chip and "+ New list" at the top right, plus a dashed "+ New list" first card. List page: the top right holds only the publish control (a solid "Publish" for a draft, a "🌐 Public ▾" pill with Public / Private (invite, coming soon) / Unpublish to draft once published), replacing the left-side toggle; "+ Add item" at the right end of the tab row on Recommendations only; a dashed "+ Add item" row after the items; a large centred CTA when the list is empty. Guide page: the same pill, plus a dashed "+ Add to day" row per day. On phones, the floating + means New list / Add item / Add to the selected day. Mocks v5: https://claude.ai/artifact/UDhwrVqLBNh8xKtZpppf6v | PROPOSED | O13 |

### 3.1 All Recommendations

| ID | Item | Status | Source |
|---|---|---|---|
| AR-01 | Keep the 8 cards. Icons, illustrations, animations and features stay exactly as today. | SETTLED | O3, O4 |
| AR-02 | **One brand colour** for all 8 cards, in shades of today's dark card plus the blue accent. No per-category tints (option A chosen). | SETTLED | O4 |
| AR-03 | One badge style (● Public / outlined Hidden) and one ⋯ menu style. | SETTLED | O2 |
| AR-04 | **No sample badges or notes on this screen**: a new account's cards look like anyone's. | SETTLED | O4 |

### 3.2 Category page

Owner approved v2's category page as it is (P188 v3).

| ID | Item | Status | Source |
|---|---|---|---|
| CAT-01 | One template for all 8 categories, Places and Guides included. | SETTLED | O2, O7 |
| CAT-02 | Top-left: the category visibility toggle, e.g. "Show Movies on my profile". It is the **master switch for the profile** (see PRIV-04). | SETTLED | O2, O9, brief |
| CAT-03 | Top-right: **New List** (Places too; "Add Location" goes). Guides: "New Guide". | SETTLED | O2, O7 |
| CAT-04 | **Top Picks** hero carousel, named Top Picks everywhere (no "Featured"), with Manage Top Picks. It always shows, with an empty state ("Pin items to feature them here") and a first-visit state. | SETTLED | O1, O2 |
| CAT-05 | The Manage Top Picks control must never disappear (today the bar vanishes after closing; OWN-16). | SETTLED | WT |
| CAT-06 | List cards keep today's design: cover thumbnails, Public/Draft badge, public toggle on the card, item count, pinned count. Names wrap (no truncation). Drop the word "Open"; the whole card is clickable. | SETTLED | O2 |
| CAT-07 | "+ Add new list" card. | SETTLED | O2 |
| CAT-08 | On mobile: keep the public toggle on each list card, or move it into the card ⋯ menu? | OPEN | P188 v2 Q2 |

### 3.3 First visit: sample lists

| ID | Item | Status | Source |
|---|---|---|---|
| SMP-01 | A new account gets 2-3 **sample lists** per category. They are the user's own lists, marked **Sample**, shown as normal list cards; Top Picks shows their picks with the same badge. | SETTLED | O3, O4 |
| SMP-02 | Samples open as full list pages with all item details, and can be browsed and reordered. | SETTLED | O4 |
| SMP-03 | A sample can't be published and never appears on the profile. | SETTLED | O4 |
| SMP-04 | **Make it mine** turns a sample into a normal draft list in place, with no copy. (Replaces the earlier "Use as a starting point" copy idea.) | SETTLED | O4 |
| SMP-05 | Each sample can be **deleted** (card ⋯, or on the list page). Deleted samples never come back, even if all real lists are deleted. | SETTLED | O4 |
| SMP-06 | Samples stay until the user deletes them; creating a real list does not remove them. No "Hide samples" control. (Replaces the earlier auto-hide idea.) | SETTLED | O4, O5 |
| SMP-07 | **Localised by the country captured at onboarding.** Places samples are local ("Goa means nothing to someone in London"). Movies, books, games mostly global. Apps and products: a global standard set with some local flavour. Start with two sets, India and Global; more countries later as data. | SETTLED | O5 |
| SMP-08 | Implementation: seeded per new account from versioned per-country fixtures with an `is_sample` flag; publish paths and the public read model refuse `is_sample`; Make it mine clears the flag; delete is a normal delete. | SETTLED (design) | P188 v3 |
| SMP-09 | The actual sample content (list names, items) for India and Global. | OPEN (to draft for owner review) | — |

### 3.4 Create list

| ID | Item | Status | Source |
|---|---|---|---|
| NL-01 | Creating a list must be the **same in every category** (one shared popup with a backdrop). Places' different overlay/flow goes. | SETTLED | O6 |
| NL-02 | Fields: name, optional short description, web address (slug) shown small and editable. After creating, land on the new list with "Add your first …" ready; no publish prompt on an empty list. | OPEN (proposed) | O6 discussion |
| NL-03 | Places adds one field, **Location** (city/area search); the name starts as the city but is editable. | OPEN (proposed) | O6 discussion |
| NL-04 | Places: allow more than one list per city (e.g. "Goa food", "Goa beaches"). | OPEN (proposed) | O6 discussion |
| NL-05 | Places: move the social link and note out of creation into Manage. | OPEN (proposed) | O6 discussion |

### 3.5 List page

Owner approved v2's list page as it is (P188 v3).

| ID | Item | Status | Source |
|---|---|---|---|
| LP-01 | Header left: Back, list name, and the list's **Published toggle on the LEFT** (same spot as the category toggle). | SETTLED | O2 |
| LP-02 | Three toggles exist and all three stay: category (category page), list (on the card), list (inside the list). | SETTLED | O2 |
| LP-03 | Three tabs: **Recommendations** (add item, drag reorder, ☆ pin to Top Picks, item ⋯ menu), **Share** (link, Copy, QR card with working full-size Download QR, social share), **Manage** (name, description, cover, URL slug; linked lists attach/detach; Archive/Delete). | SETTLED | O1, O2 |
| LP-04 | Remove the duplicate Published toggle inside Manage. | SETTLED | O2 |
| LP-05 | **Per-item Draft/Publish is removed**: items in a published list are visible wherever the list is. | SETTLED | O2 |
| LP-06 | Switching tabs never reloads the screen (OWN-06). | SETTLED | WT |
| LP-07 | Linked lists show as a section under the items (see §5). | SETTLED | O7, O8 |
| LP-08 | Archive vs Delete: keep both? | OPEN | P188 v2 Q7 |
| LP-09 | Should the URL slug stay editable after publishing (breaks printed QR codes)? Proposed: editable, with a redirect from the old slug. | OPEN | P188 v2 Q8 |
| LP-10 | Privacy control in Manage for Published-Public / Published-Private (see §7); screens designed for it now. | SETTLED (design now, build LATER) | O9, brief |

### 3.6 Add/edit item

| ID | Item | Status | Source |
|---|---|---|---|
| ADD-01 | Always a **full page**, never an overlay without a backdrop (OWN-09). Same journey in every category. | SETTLED | WT, O2 |
| ADD-02 | **Sticky action bar** so the user never scrolls to Save (OWN-04). | SETTLED | WT |
| ADD-03 | No Search/Manual tabs. The search bar takes the full row; a small **"Can't find it? Add manually"** link sits above it on the right. Empty results show a clear "Add manually" button. Typed text carries into the manual Name field; "Back to search" returns. | SETTLED | O3, O4 |
| ADD-04 | The picked item is shown clearly at the top (today the selected place name doesn't show; OWN-09). | SETTLED | WT |
| ADD-05 | One star rating widget everywhere; no dropdowns (OWN-12). Scale is DS-01. | SETTLED (widget) / OPEN (scale) | WT, P189 |
| ADD-06 | Places: one field takes a name **or coordinates**; placeholder "Search a place or paste coordinates"; `15.49, 73.82` is detected and resolves to a pin plus the nearest named places. | SETTLED | O3, O4 |
| ADD-07 | Places: two icon buttons in the field: ◎ use my location (suggests nearby places) and a map icon (pick-on-map sheet; "Use this pin" continues in the manual form). | SETTLED | O3, O4 |
| ADD-08 | Location cost: browser geolocation is free and remembered after the first grant (no re-prompting). Only the nearby lookup costs a Google Places call: on tap only, cached per rounded area, basic fields only. OpenStreetMap as a free fallback (thinner for Indian food places). | SETTLED | O4 |
| ADD-09 | Places: remove the "Place / Person" type; people are added as People lists and linked (OWN-10). | SETTLED | WT |
| ADD-10 | Places category/subcategory picker must work and be searchable (OWN-03: overlapping black text, unusable, "I think we had a search bar here"). Taxonomy is now applied in prod (Places 335 terms, People 20 sectors, 2026-10-22); re-verify the picker. | SETTLED (must work) / OPEN (searchable picker design) | WT, UAT |
| ADD-11 | Products form: per DS-03..DS-06, DS-14 (owner found "logo URL" weird, currency should sit in the same row as price, specifications unclear; OWN-15). | OPEN (decisions DS-*) | WT, P189 |
| ADD-12 | People form: sector picker; rating per DS-02 (owner found the dropdown inconsistent). | OPEN (DS-02, DS-08) | WT, P189 |
| ADD-13 | Option "Save and add another" in the action bar. | OPEN (proposal) | P188 v1 §2.3 |

### 3.7 Home

| ID | Item | Status | Source |
|---|---|---|---|
| HOME-01 | Clicking a place (list) on Home opens that list (OWN-18). | SETTLED | WT |

### 3.8 Bugs: root cause and fix

All are SETTLED as "must fix". Root cause and fix from P187 unless noted; sizes S/M/L.

| ID | Sev | Bug | Root cause | Fix | Source |
|---|---|---|---|---|---|
| OWN-11 | P0 | Saving a place fails: Zod `invalid_string url` on `creatorSocialUrl` | `useAddRecommendation.ts:205` passes `recommendationLink` raw; only the person branch normalises (PR #180) | Wrap with `profile()`; refuse non-normalisable values on the form; unit case for `@handle` on a place. S | WT, P187 |
| OWN-17 | P1 | Saves and loads slow | Serial round trips × ~185 ms; movie add imports up to 12 TMDB images serially inside the request; places reload the whole owner read after every command; Home fetches `/me` 3× in series | Async movie image import (3-4 parallel), drop the thrown-away GET; invalidate once at the end; upload photos in parallel before create; dedupe `/me`; batch media INSERTs. M (movies L) | WT, P187 |
| OWN-01 | P1 | "URL already used" for an invisible Paris list | `UNIQUE(account_id,category,slug)` in migration 0029 ignores `archived_at` | Partial unique index `WHERE archived_at IS NULL` (next free migration number, follow the migration checklist) or free the slug on archive. S | WT, P187 |
| OWN-18 | P1 | Home → place doesn't open | `Home.tsx:1000` navigates to `/recommendations` | Navigate to the list (`?list=<id>`). S | WT, P187 |
| OWN-05 | P1 | Back/open goes to the category, not the origin list | Hard-coded targets with no list id; open list lives only in a store | Make the list addressable (`?list=<id>` or a real route); every return path carries it. M | WT, P187 |
| OWN-07 | P1 | Downloaded QR cut to a quarter | `ShareModal.tsx:95-104` `toPng` with no width/height inside a scaled modal | Pass width/height, drop style override, pixelRatio 2, or render off-screen; test mobile + desktop. S | WT, P187 |
| OWN-19 | P1 | Place images missing; a list missing in Places | Images built only from uploaded `photoMediaIds`; lists whose per-list read failed are silently dropped | Fall back to provider photo; retry and show an error row. M | WT, P187 |
| OWN-06 | P2 | Manage tab reloads the whole screen | Manage click calls `refetchCities()`; `Favorites.tsx:1061` swaps the page for `EarthLoader` | `(loading && !cities) \|\| !accountById`; background-refresh indicator. S | WT, P187 |
| OWN-08 | P2 | Public page: two loaders, odd map badge, top nav | `PublicColdEntryBoundary` EarthLoader then `TabVisibilityGuard` HeroSkeleton | One loading owner. Handled with public pages (§8). S | WT, P187 |
| OWN-02 | P2 | Publish prompt too early (after first item / empty list) | Places has two triggers with no empty check (P188 v1 audit) | GL-04 rule, one shared component. | WT, P188 |
| OWN-03 | P1 | Add-place category/subcategory unusable, overlapping text, search bar missing | Taxonomy was unconfigured in prod (applied 2026-10-22); overlap is a UI defect | Re-verify after apply; fix styling; ADD-10. | WT, UAT |
| OWN-04 | P2 | Save button not sticky | Save at end of scroll on most forms | ADD-02. | WT, P188 |
| OWN-09 | P1 | Add-place is an overlay with no backdrop; selected place name not shown | `AddPlaceOverlay` + `RecommendForm` | ADD-01, ADD-04. | WT, P188 |
| OWN-10 | P2 | Person type inside add-place | `recommendationType: person` | ADD-09. | WT, P189 |
| OWN-12 | P1 | Inconsistent add forms (dropdown vs stars, layouts, buttons) | Per-category copies | ADD-01..05, one template. | WT, P188 |
| OWN-13 | P1 | Linked lists can't be detached; linked section needs design | Detach exists only inside linked add pages | §5. | WT, P188 |
| OWN-14 | P2 | Reorder UI clumsy | Grip + arrows + separate mode | GL-06. | WT |
| OWN-15 | P2 | Product form confusing | "Logo URL" rendered as main photo; two inputs for price; 200-row specs | DS-03..DS-06. | WT, P189 |
| OWN-16 | P2 | Manage topics bar disappears; carousel differs per category | Six separate Top Picks managers | CAT-04, CAT-05, one shared manager. | WT, P188 |
| OWN-20 | P2 | Data sourcing for products and people | No sourcing beyond manual | DS-11..DS-13. | WT, P189 |
| UAT-01 | P2 | Game detail shows only the first platform chip | not root-caused | Investigate. | UAT |
| UAT-02 | P3 | Enter in the game search doesn't search | not root-caused | Investigate. | UAT |
| UAT-03 | P2 | Book cover still loaded from covers.openlibrary.org in the owner list although the cover import returned 200 | not root-caused | Check owner + public pages use our copy. | UAT |
| UAT-04 | P3 | Arabic: guide-type label "Itinerary" untranslated | missing string | Add translation. | UAT |
| UAT-05 | P3 | Link previews use the generic site hero, not the profile/list image | by design today | Decide with public pages (§8). | UAT |
| UAT-06 | — | Google Books returns 503; Open Library fallback serves search | external | Monitor. | UAT |
| UAT-07 | — | Test list "UAT Games Retest" left as a draft on the test account | leftover | Clean up. | UAT |
| UAT-08 | — | Board cases blocked on owner-only actions (55) | need owner / second account | Owner runs them before final sign-off. | UAT |

Other walkthrough statements, all covered above: People "details are not fetched automatically" (DS-11); after adding from a Place list, back lands in People/Products (OWN-05); Places hero is "Featured" and button "Add Location" (CAT-03, CAT-04); movie "Add manually" is a separate button (ADD-03); movie add takes long (OWN-17).

---

## 4. Per-category data parameters

Detail, field inventory and code citations: P189. Summary:

### 4.1 Shared core (proposed for every category)

| Field | Spec |
|---|---|
| Title | required, ≤500 |
| Image | one primary image (uploaded or provider-imported) + optional gallery ≤10; one name in the UI |
| Your note | RichNote, optional |
| Your rating | optional star widget (scale: DS-01) |
| Link | one primary link; extra links in a category list |
| Category | one curated taxonomy term (Places keeps two levels) |
| Tags | optional free-text, ≤12 |

### 4.2 Category extras (proposed)

| Category | Essential | Nice | Remove / hide | Taxonomy | Source |
|---|---|---|---|---|---|
| Places | address + pin, category/subcategory, photos | opening-hours link, price level, phone (public only if opted in), website | person toggle (SETTLED, ADD-09); legacy note after migration; provider types internal | 335 terms (applied) | Google Places (New) |
| Movies & Shows | type, year, poster, genres, where to watch | director, runtime/seasons (stored, not shown), cast top 10, overview | — | curated genres (DS-07) | TMDB |
| Books | authors, cover, year | publisher, pages, description, buy links | hide ISBN, language, preview link | ~25 genres (DS-07) | Google Books → Open Library |
| Games | cover, year, platforms, genres | developer (add from IGDB), summary, screenshots ≤10 | dead `developer` render; stop fetching unused IGDB fields | IGDB genres → curated (DS-07) | IGDB |
| Apps & Tools | icon, one link, platforms, price model (Free/Freemium/Paid/Subscription) | developer, screenshots, description | separate `downloadUrl` | ~20 terms (DS-07) | iTunes search + link preview |
| Products | product photo, brand, "Where to buy" link, price with currency in one input | key specs as labelled rows | brand-logo URL, second URL, 200-row specs | ~20 terms (DS-07) | link preview + JSON-LD |
| People | name, photo, headline, sector, profile link (platform auto-detected) | up to 4 extra social links, location | rating (DS-02), follower count (DS-09), platform select | 20 sectors (applied) | link preview / oEmbed + manual |
| Guides | as today (rich editor), simplified per §6 | — | — | type + core picker | none |

Keep the product money semantics (exact decimal, "0" = free, null = not recorded, ISO 4217, old rows readable). Legal line: user-initiated one URL at a time, public metadata only, images only where terms allow, opt-out via `suppressed`.

### 4.3 The 15 data decisions

All **OPEN** (none answered yet). Where the walkthrough shows the owner's leaning, it is noted; the owner still has to confirm.

| ID | Decision | Rec | Status | Owner leaning (WT) | Source |
|---|---|---|---|---|---|
| DS-01 | One 5-star widget (half-stars) for every rated category, stored as today's 1-10 | yes | OPEN | wants stars everywhere; scale not stated. v2 mocks show 5 stars | P189 #1, P188 v2 Q3 |
| DS-02 | Remove rating from People | yes | OPEN | — | P189 #2, P188 v2 Q4 |
| DS-03 | Product "Logo URL" → "Product photo"; drop brand-logo idea | yes | OPEN | "Why do we need a logo URL?" | P189 #3 |
| DS-04 | One "Where to buy" link instead of product URL + buy URL | yes | OPEN | — | P189 #4 |
| DS-05 | Price as one input with a currency selector, default from locale | yes | OPEN | "should be in the same row" | P189 #5 |
| DS-06 | Specifications: cap at ~8 key facts, or remove | cap at 8 | OPEN | "I don't know what this is" | P189 #6 |
| DS-07 | Curated ~20-term taxonomies for Movies, Books, Games, Apps, Products | yes; owner reviews lists | OPEN | "uncategorized … problematic" | P189 #7 |
| DS-08 | People sector required once taxonomy is live (now live) | yes | OPEN | — | P189 #8 |
| DS-09 | Drop follower count on People | drop | OPEN | — | P189 #9 |
| DS-10 | Retire Places person toggle and keep the Instagram scraper off | yes | OPEN (toggle removal itself SETTLED as ADD-09; scraper part open) | "We don't need the person here" | P189 #10 |
| DS-11 | One "paste a link" prefill service for Apps, Products, People; no paid APIs at launch | yes | OPEN | asked how products/people are sourced | P189 #11 |
| DS-12 | Apps: add free iTunes keyword search; Play Store stays paste-URL | yes | OPEN | — | P189 #12 |
| DS-13 | Product search (SerpApi/eBay): defer until owners ask | defer | OPEN | — | P189 #13 |
| DS-14 | Affiliate-disclosure toggle on Products | yes | OPEN | — | P189 #14 |
| DS-15 | Provider ratings as a small source chip ("TMDB 7.8"), never on the owner's scale | yes | OPEN | — | P189 #15 |

Related: if the AI plugin supplies most data later (DIR-04), the sourcing decisions above cover the dashboard path only.

| ID | Item | Status | Source |
|---|---|---|---|
| DATA-01 | All parameters, data points, DB and logic must be sorted for the dashboard before moving to public pages. | SETTLED | O10 |
| DATA-02 | Games: year, platforms, genres stored (migration 0064, deployed). | SETTLED (done) | coordinating session |

---

## 5. Linking

| ID | Item | Status | Source |
|---|---|---|---|
| LNK-01 | **Any list can link to any list**, in any category (e.g. a Places list ↔ Books, Apps, People, Products lists). Places with People/Products becomes one example of the general rule. | SETTLED | O7, O8 |
| LNK-02 | **Own lists only** for now. Linking other people's public lists may come later. | SETTLED | O8 discussion, brief |
| LNK-03 | **One level deep**: a linked list shows as a card; its own links are not shown under it (no chains). | SETTLED | O8 discussion, brief |
| LNK-04 | Managed in one place: "Linked lists" under Manage with **Attach** and **Detach** (Detach with Undo). Fixes OWN-13. | SETTLED | WT, O7 |
| LNK-05 | Shown in one place: a "Linked lists" section under the items on the list page; opening a linked list and pressing Back returns to the origin list. | SETTLED | O7, GL-03 |
| LNK-06 | Creating a new list from the link picker uses the same New list popup and returns to the origin list. | OPEN (proposed) | O6 discussion |
| LNK-07 | Visitors see only linked lists that are publicly visible; a Draft or Published-Private linked list stays hidden from public visitors. | SETTLED (follows §7) | O8 discussion |
| LNK-08 | Guides can link whole lists (Places "to choose from", a Products packing list, Books for the trip). | SETTLED | O7 |
| LNK-09 | Show a Place list's linked lists to visitors as "Also on this list"? | OPEN (public pages, §8) | P188 v2 Q6 |

## 6. Guides (open, under discussion)

Guides is the one category that differs: a day-by-day plan, not a list of recommendations. The overall Guides spec is **OPEN**; the points below record what the owner has agreed so far.

| ID | Item | Status | Source |
|---|---|---|---|
| GD-01 | Keep the name **Guides** (not "Trips & Guides"). | SETTLED | O8 |
| GD-02 | Guides uses the same category-page layout as every other category: profile toggle, New Guide, Top Picks, draggable cards. | SETTLED | O7 |
| GD-03 | Creating starts with the same popup, asking only title, destination and number of days, then straight into the day editor. | SETTLED | O7 |
| GD-04 | Best months, budget type and tags/categories become optional; the 4-category minimum goes. | SETTLED | O7, O8 |
| GD-05 | Optional trip dates. | SETTLED (optional) | O7 |
| GD-06 | New guides start as Draft and publish with the same rules as lists (now §7: Draft / Published-Public / Published-Private). | SETTLED | O7, brief |
| GD-07 | The day editor gets "Add from my lists" next to Google search, so saved places become the plan. | SETTLED | O7 |
| GD-08 | A day holds **single items**, not whole lists ("more like dropping an item instead of the whole list"). Each item comes from my lists, search, or free text ("Drive to Gokarna, 2h"). | SETTLED (owner approved the Guides proposals, O11) | O8, O11 |
| GD-09 | Guide-level linked lists (whole lists) vs day items (single items): the two-layer model. | SETTLED | O8, O11 |
| GD-10 | One guide serves as a private plan for your own trip and as a published guide for others. | OPEN (proposed) | O7 discussion |
| GD-11 | Must support real-time planning and sharing of guides. | OPEN (how) | O10 |
| GD-12 | Planning extras: packing/booking checklist, planning with a friend. | LATER | O7 discussion |
| GD-13 | "Copy this guide into my plans" from someone else's published guide. | OPEN (part of OQ-01 saving others' lists) | O7 discussion |
| GD-14 | Guides built in ChatGPT: arrive in explorers as **Draft**, places matched to real ones where possible, anything unmatched marked "check this"; never published automatically. Pasting a plan from elsewhere uses the same path. | LATER | O8, O9 |
| GD-15 | The public guide UI from the Strapi era was "pretty neat and nice": check whether it still exists and reuse its strengths. | OPEN | O10 |
| GD-16 | Can anyone use Guides for their own planning? Today: partly (private day plan with budget; no dates, no pulling saved places). GD-05/GD-07 close the gap. | OPEN | O6 |
| GD-17 | **A guide is a set of sections**, each holding items from any category plus notes. A **template** defines the sections: **Trip**, built first as a full trip planner (days, optional dates; day structure per GD-23), and **Topic guide**, later, with sections the user names (gift guides, learning paths, setups and routines, city or area guides) and no slots or dates. Same editor and same data for both. | SETTLED (Trip now, Topic later) | O11 |
| GD-18 | **In-page editor, no popup.** "+ Add" opens a smart box in place at the end of the day: the user's saved items first (any category), then Google results (with location and map buttons), then "Add as a note". | SETTLED | O11 |
| GD-19 | **My lists panel**: on desktop, beside the plan, with drag into any day or tap +, and a Map tab showing days as pins. On mobile, a bottom sheet used for browsing only. | SETTLED | O11 |
| GD-20 | **Day strip** at the top, showing dates when set, otherwise Day N; "+ Day" appends a day. Each day's ⋯ menu offers insert before/after, duplicate, clear and delete. Days reorder by drag, and the day count stays in sync. | SETTLED | O11 |
| GD-21 | Guide status shown like lists: the Published toggle and badge top-left, with Draft labelled "Only you can see this". The full privacy choice lives in Share/Manage (§7). | SETTLED | O11 |
| GD-22 | Guide page tabs follow the list pattern: **Plan \| Share \| Manage**. Today's Journey/Transport/Stay/Budget/Tips become optional chips inside Plan; Itinerary is always shown, and the others appear once they have content. | OPEN (proposed in v4 mock) | v4 |
| GD-23 | **Each day is one ordered list.** Items are added and dragged to reorder within and across days. Each item has an optional **time label**: Morning, Afternoon, Evening, Night, or an exact time (e.g. 9:30), set from a chip or the item menu. Small time headings appear automatically only when items carry labels; otherwise the day is a plain numbered list. Imports from ChatGPT and elsewhere keep their labels. Data: item order plus one nullable `time_label`; no slot entities. This replaces the fixed Morning/Afternoon/Evening slots. | SETTLED | O12 |

## 7. Privacy model

| ID | Item | Status | Source |
|---|---|---|---|
| PRIV-01 | **Draft**: owner only; cannot be shared. | SETTLED | O9, brief |
| PRIV-02 | **Published-Public**: on the public page. | SETTLED | O9, brief |
| PRIV-03 | **Published-Private**: invite-only by email. Only a published list can be private; a draft can never be private. | SETTLED (build LATER) | O9, O10, brief |
| PRIV-04 | The **category toggle is a master switch** for the profile: with it off, even Published-Public lists in that category don't appear. | SETTLED | O9, brief |
| PRIV-05 | Privacy is **per list** (and per guide), in every category, not per category. | SETTLED | O8 |
| PRIV-06 | Private is **built LATER**, but the screens (list toggle, Manage, Share) are designed with it in mind now. | SETTLED | brief, O10 |
| PRIV-07 | Optional **password** for private lists. | LATER | O10 |
| PRIV-08 | Close circle: add a set of people (e.g. 10 friends) and share specific lists or a dated guide with them; they can also access it from their own ChatGPT. Covered by Published-Private invitations. | LATER | O7, O9 |
| PRIV-09 | Superseded proposals, recorded so they are not rebuilt: "Draft becomes Private" and a 4-level setting with "Link only". The owner was confused by Link only and chose the three states above. | SETTLED (rejected) | O9 |
| PRIV-10 | Private lists across categories: one private collection mixing places, books, products for a trip = a Guide with linked lists; no new type. | OPEN (proposed) | O8 |
| PRIV-11 | Invite flow details (who can invite, invitee needs an account?, revoke, what invitees see). | OPEN | O10 |

## 8. Public pages (parked)

Out of scope for the dashboard round; a separate discussion follows the dashboard ("a lot of things are sorted there").

| ID | Item | Status | Source |
|---|---|---|---|
| PUB-01 | Public category and public list design, discussed separately after the dashboard. | LATER | O3 |
| PUB-02 | OWN-08 two loaders + odd map-view badge + top navigation needs work. | LATER (with PUB-01) | WT |
| PUB-03 | Map toggle (List \| Map) only on Places. | OPEN | P188 v2 #5 |
| PUB-04 | Public category page with no Top Picks: hide the hero for visitors? | OPEN | P188 v2 Q5 |
| PUB-05 | "Also on this list" linked lists on public list pages (LNK-09). | OPEN | P188 v2 Q6 |
| PUB-06 | Footer CTA "make your own list". | OPEN (proposal) | P188 v1 §2.10 |
| PUB-07 | A category whose toggle is off redirects to the profile (today's behaviour; consistent with PRIV-04). | OPEN (confirm) | P188 v2 |
| PUB-08 | Link previews use the list/profile image (UAT-05). | OPEN | UAT |
| PUB-09 | Public Guides UI (GD-15). | OPEN | O10 |

## 9. Later phases, in order

| # | Phase | Status | Source |
|---|---|---|---|
| 1 | **Platform finished and cleared on hosted**: all bugs (§3.8), dashboard UX (§3), data parameters (§4), linking (§5), Guides (§6), then public pages (§8); verified on the hosted site. | SETTLED (now) | O10, WT |
| 2 | **Private sharing**: Published-Private with invite by email (PRIV-03), then optional password (PRIV-07). Needs DB + access logic. | LATER | O10 |
| 3 | **Plugin**: ChatGPT/Claude plugin as the main interface. ChatGPT supplies most of the data; we match places and images. Shared guides are accessible to invitees from their own ChatGPT. Built **last**, after the platform is finished and cleared on hosted. The plugin calls the same actions the app uses (create list, add item, link lists, create guide, add to day, share). | LATER | O9, O10, brief |
| 4 | **Monetisation**: sell digital guides/lists; influencer group trips (e.g. 10 people to Paris, Thailand, Sri Lanka) with OTA integrations, we handle the rest. Discussed later; referenced so nothing built now blocks it. | LATER | O10 |

## 10. Open questions (index)

Every OPEN item above, in one place.

| ID | Question | Where |
|---|---|---|
| OQ-01 | **Saving someone else's list** (from a public page or via ChatGPT): how is it saved? Copy, follow, or link? Includes copying a guide (GD-13). | O10, brief |
| OQ-02 | DS-01..DS-15 data decisions | §4.3 |
| OQ-03 | Mobile: list-card toggle on the card or in ⋯ (CAT-08) | §3.2 |
| OQ-04 | Sample content for India and Global (SMP-09) | §3.3 |
| OQ-05 | New list popup fields; Places location field; multiple lists per city; social link + note to Manage (NL-02..05) | §3.4 |
| OQ-06 | Archive vs Delete (LP-08) | §3.5 |
| OQ-07 | Editable slug after publish + redirect (LP-09) | §3.5 |
| OQ-08 | Searchable category picker design (ADD-10) | §3.6 |
| OQ-09 | "Save and add another" (ADD-13); single toast system (GL-05) | §3.0, §3.6 |
| OQ-10 | Create-list-from-link-picker flow (LNK-06) | §5 |
| OQ-11 | Guide day model: single items vs linked lists, free-text items (GD-08, GD-09) | §6 |
| OQ-12 | One guide as private plan + published guide (GD-10); real-time planning and sharing (GD-11) | §6 |
| OQ-13 | Strapi-era public guide UI (GD-15); Guides for personal planning (GD-16) | §6 |
| OQ-14 | Cross-category private collection = Guide with linked lists? (PRIV-10) | §7 |
| OQ-15 | Invite flow details (PRIV-11) | §7 |
| OQ-16 | Public pages: PUB-03..PUB-09 | §8 |
| OQ-17 | Simple Item/List/Link/Guide model as the base for the plugin (DIR-07) | §1 |

## Appendix: status count

| Status | Count |
|---|---|
| SETTLED | 111 (of which 28 are bug rows in §3.8) |
| OPEN | 46 (incl. the 15 data decisions) |
| LATER | 11 |

Counted over tagged items in §1-§9 (bug rows in §3.8 count as SETTLED "must fix"; mixed items count once by their first status). The §10 index repeats OPEN items and is not counted.
