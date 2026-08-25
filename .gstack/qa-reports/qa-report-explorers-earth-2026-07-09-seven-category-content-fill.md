# explorers.earth Production Content Fill QA - Seven Categories

Date: 2026-07-09
Environment: Production (`https://explorers.earth`)
Account: logged-in TK account
Scope: Places, Movies, Books, Games, Apps & Tools, Products, People
Out of scope: Guides, Music

## Current Status

In progress.

## Plan

Plan file: `docs/superpowers/plans/2026-07-09-production-seven-category-content-qa-plan.md`

## Products

Baseline before this run:

- 11 visible product lists.
- 8 empty lists.
- 3 lists with 1 product.

Pilot list:

- `Hike`
- Started at 0 products.
- Added 10 products through the production UI manual product flow.
- Kept the list as Draft when the publish modal appeared.
- Reloaded/opened the list and verified all 10 product cards were visible.

Products added to `Hike`:

1. Osprey Daylite Plus
2. Black Diamond Spot 400 Headlamp
3. Merrell Moab 3 Hiking Shoe
4. Sawyer Squeeze Water Filter
5. Hydro Flask 32 oz Wide Mouth
6. Patagonia Torrentshell 3L Jacket
7. Garmin inReach Mini 2
8. Sea to Summit Aeros Pillow
9. REI Co-op Flash 22 Pack
10. Darn Tough Hiker Micro Crew Socks

Findings:

- Add Product page loads correctly.
- Manual product path works.
- Required fields observed: product URL and title.
- Submit button can be below viewport; coordinate-based browser control needs scrolling before click.
- Draft publish modal appears after each successful add; choosing `Keep Draft` preserves visibility.
- No white screen observed during `Hike` fill.

Second list:

- `Travel Gear`
- Started at 1 product.
- Added 9 products through the production UI manual product flow.
- List remained Published; no draft modal appeared.
- Reopened the list and verified all 10 product cards were visible.

Products added to `Travel Gear`:

1. Anker PowerCore 20K
2. Peak Design Travel Backpack 45L
3. Apple AirTag
4. Matador FlatPak Toiletry Bottle
5. Patagonia Black Hole Duffel 40L
6. Kindle Paperwhite
7. Sony WH-1000XM5
8. Bellroy Tech Kit
9. GoPro HERO12 Black

Third list attempt:

- `QA Products 713664`
- Started at 1 product.
- Attempted a 3-product UI chunk.
- Production/browser automation timed out before completion; after recovery, the list still showed only the original product.
- No partial duplicate products were observed on recovery.

Execution constraint discovered:

- UI-only creation is too slow and fragile for the full target volume (>600 remaining item creations).
- The logged-in browser can reach production, but local shell DNS currently cannot resolve `explorers.earth`.
- The in-app browser read-only evaluation sandbox does not expose `localStorage` or `fetch`, so the logged-in JWT cannot be reused directly for a safe local GraphQL seeding script.
- Recommended revised flow: use browser UI for representative end-to-end scenario QA, and use a controlled backend/API seeding mechanism for volume data creation, then verify counts and pages in browser.
