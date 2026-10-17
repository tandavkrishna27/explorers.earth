# Production Comprehensive E2E QA Plan — All Categories + Guides

Date: 2026-07-25
Environment: Production (`https://explorers.earth`), logged-in TK account
Backend: Strapi CMS at `https://api.localqr.earth` (GraphQL `/graphql`, REST `/api` for uploads)
Driver: gstack `browse` (per global CLAUDE.md — no claude-in-chrome)

## Goal

End-to-end test every content category on production against the real account:
create lists and recommendations with **all fillable parameters**, verify creation
persists after reload, verify **images load in every category**, and stress-test
Guides across all types to reproduce/fix the "images don't come back after adding a
day" bug. Record every result in a QA report.

## Target coverage (user-specified minimums)

Per creatable category: **≥ 2 lists**, each with **≥ 5 recommendations**, every
optional parameter that the UI exposes filled at least once.

| Category | Route | Item image source | Category-specific fields to fill |
|---|---|---|---|
| Places | `/recommendations/places` | User upload + Google Photos | subcategory (req), contact, socialLink, reason, userRating, googleRating, linked people/products |
| Movies & Shows | `/recommendations/movies` | TMDB poster URL | media_type, user note, user rating, pin |
| Books | `/recommendations/books` | Google Books cover | user note, user rating, pin |
| Games | `/recommendations/games` | IGDB cover | user note, user rating, pin |
| Apps & Tools | `/recommendations/apps` | logo_url / screenshots | app_url, price_tier, download_url, note, rating |
| Products | `/recommendations/products` | images / logo_url | product_url, brand, price, currency, buy_url, note, rating |
| People | `/recommendations/people` | avatar_path | username_handle, headline, location, primary_platform, social_urls, skills_tags |
| Guides | `/guides` → `/guides/new` | Google Photos (cover + activity) | see Guides section |
| Music | `/music` | n/a (external SSO) | smoke-check only; likely blocked (Local Tunes sync) |

## Guides — variant matrix (≥ 5 guides)

Guide type drives step count: **Itinerary** = 3 steps (adds days + categories +
best-time + budget); **Theme** = 2 steps. Location mode is orthogonal: single-city
vs multi-city. Days = number of sections.

1. Itinerary · single-city · single-day (1 section)
2. Itinerary · single-city · multi-day (3 sections)
3. Itinerary · multi-city · multi-day (2 cities, 2+ sections)
4. Theme · single-city (2 steps, no day count)
5. Theme · multi-city
6. (stretch) Itinerary with AI-generated sections (awaited photo path) for A/B vs manual

Each guide: fill title, description, categories (≥4 — validation minimum), best time
months, budget, cover media; add sections with Timeline places, at least one
**activity place** (museum/park/attraction — only "activity"-typed places get photos),
Transport, Stay, Budget, Tips.

## The image bug — reproduction protocol

Hypothesis: `GuideSectionForm.tsx:687` `fetchAndUploadActivityPhotos` is fire-and-forget
(not awaited). Saving before upload completes persists empty `Recommendation_Activity`
photos.

Repro A (expected fail): add activity place → **Save immediately** (before "Loading
photos…" finishes) → reopen section → check if photos present.
Repro B (control): add activity place → **wait** for upload → Save → reopen → compare.
Instrument: watch `POST ${REST}/upload` responses and the `Recommendation_Activity`
JSON in the `GetGuideById` GraphQL response; check `ActivityCard` for onError gradient
fallback masking a 403/404 on an expired S3/Google URL.

If confirmed: fix = await the photo upload (or block submit while `photosLoading`) in
`GuideSectionForm.tsx` handleSubmit. Verify with a fresh guide.

## Known bugs to re-verify (from 2026-07-09 runs)

1. Places final "Add Location"/recommendation submit produced no loading/validation/
   toast/navigation. Medium.
2. Guides Step 2 month/category picker state unstable (month clears on category
   interaction; wizard didn't reach step 3). Medium.
3. Music `/music`: "Could not connect to Local Tunes" / sync fails. High, backend.

## Datasets (5 per list, reuse public entities so search resolves)

- Movies L1 Mind-Bending Sci-Fi: Interstellar, Arrival, Inception, Blade Runner 2049, Dune.
  L2 Comfort Rewatches: Chef, Paddington 2, The Intern, About Time, School of Rock.
- Books L1 Big Ideas: Sapiens, Range, Thinking Fast and Slow, Factfulness, The Black Swan.
  L2 Weekend Nonfiction: Atomic Habits, Deep Work, Four Thousand Weeks, Why We Sleep, The Psychology of Money.
- Games L1 Open Worlds: Zelda BOTW, Red Dead Redemption 2, Elden Ring, The Witcher 3, Ghost of Tsushima.
  L2 Indie Wonders: Hades, Hollow Knight, Celeste, Stardew Valley, Disco Elysium.
- Apps L1 Daily Workflow: Notion, Todoist, Slack, Linear, Raycast.
  L2 AI Utilities: ChatGPT, Claude, Perplexity, Cursor, Grammarly.
- Products L1 Travel Gear: Anker PowerCore, Peak Design Backpack, Apple AirTag, Sony WH-1000XM5, Kindle Paperwhite.
  L2 Desk Setup: Logitech MX Master 3S, Keychron K2, Dell UltraSharp, BenQ ScreenBar, Elgato Stream Deck.
- People L1 Writers & Thinkers: Paul Graham, Morgan Housel, James Clear, Austin Kleon, Cal Newport.
  L2 Product People: Lenny Rachitsky, Shreyas Doshi, Marty Cagan, Teresa Torres, April Dunford.
- Places L1 Bengaluru, L2 Mumbai: 5 real spots each via Google autocomplete.

## Execution order

1. **Auth** — get logged-in session into the driven browser (decision pending).
2. **Inventory** — open each category dashboard, record current lists/items, console errors.
3. Categories in order: Movies → Books → Games → Apps → Products → People → Places
   (Places last — its submit bug + Google autocomplete is slowest/most fragile).
   For each: create/verify 2 lists, add 5 items each, fill optional fields on a
   representative item, reload and confirm counts + images render.
4. **Guides** — build the 5-variant matrix; run the image-bug repro protocol.
5. **Music** — smoke check only.
6. **Fix** any confirmed frontend bug (atomic commit) and re-verify — only if a bug
   blocks the flow or is clearly frontend and low-risk. Prod fixes require deploy;
   flag anything needing deploy rather than assuming it's live.
7. **Report** — `.gstack/qa-reports/qa-report-explorers-earth-2026-07-25-comprehensive-e2e.md`
   with per-category pass/fail, screenshots, image-load results, bug repros, health score.

## Constraints / risks (from prior runs)

- UI creation is slow and can stall on prod (infra distance, RDS routing). Lower volume
  this run (≥2×5) is more tractable than the prior 700-item attempt, but expect a long
  automated session. Use long waits, avoid double-submits, reload to verify.
- Browser sandbox does not expose JWT/`fetch`/localStorage for reading, so no API
  seeding — all creation is UI-driven.
- Windows Chrome cookie import is blocked (app-bound encryption / DPAPI) — auth must
  come from a browser we log into or attach to (see decision).
- Do not delete production data. Keep new content clean/non-spammy.

## Stop conditions

White screen on a create flow; submit no-ops twice on valid input; dashboard count
never updates after reload+direct-open; fatal console error after creation; duplicate/
wrong entities being created.
