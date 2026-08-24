# Production Seven-Category Content QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring production account content coverage to roughly 10 lists per category and 10 items per list for Places, Movies, Books, Games, Apps & Tools, Products, and People, while QA-testing creation, list/detail, navigation, validation, empty states, and post-create refresh.

**Architecture:** This is a production content-fill plus browser QA runbook. Use the logged-in explorers.earth browser session as the source of truth for scenario QA and verification. For full-volume content creation, prefer a controlled backend/API seeding mechanism that calls the same Strapi mutations as the UI; UI-only creation is reserved for representative flow testing and fallback because the production round trip is too slow for hundreds of manual submissions. Guides and Music are explicitly out of scope.

**Tech Stack:** explorers.earth production SPA, Strapi-backed GraphQL data, category dashboard routes, in-app browser automation, markdown QA reports.

---

## Scope

In scope:

- Places: `https://explorers.earth/recommendations`
- Movies: `https://explorers.earth/recommendations/movies`
- Books: `https://explorers.earth/recommendations/books`
- Games: `https://explorers.earth/recommendations/games`
- Apps & Tools: `https://explorers.earth/recommendations/apps`
- Products: `https://explorers.earth/recommendations/products`
- People: `https://explorers.earth/recommendations/people`

Out of scope:

- Guides: wizard was previously unstable and has a different content model.
- Music: Local Tunes sync is still blocked.
- Deleting production data.
- Source-code fixes unless a reproducible product bug blocks the run.

## Current Baseline From Production UI

| Category | Current lists | Current items | Main gap |
| --- | ---: | ---: | --- |
| Places | 2 | 2 | Need 8 more lists and about 98 more place items. |
| Movies | 12 | 2 | Enough lists; most lists need 10 items. |
| Books | 12 | 2 | Enough lists; most lists need 10 items. |
| Games | 10 | 2 | List count is OK; most lists need 10 items. |
| Apps & Tools | 11 | 3 | Enough lists; most lists need 10 items. |
| Products | 11 | 3 | Enough lists; most lists need 10 items. |
| People | 11 | 6 | Enough lists; most lists need 10 items. |

Target rule for this run:

- If a category has fewer than 10 lists, create lists up to 10.
- If a category has more than 10 lists already, do not delete extras.
- For every visible list in the category, fill to 10 items unless the UI blocks creation or duplicate detection prevents safe completion.
- Prefer clean, real-world, non-spammy content names over synthetic numbered junk.

## Data Sets

Use distinct content per list. Reuse known public/common entities so search/autocomplete can resolve reliably.

Movies:

- Mind-Bending Sci-Fi: Interstellar, Arrival, Inception, The Matrix, Blade Runner 2049, Ex Machina, Her, Annihilation, Dune, Tenet.
- Comfort Rewatches: The Secret Life of Walter Mitty, Chef, Paddington 2, The Intern, Julie & Julia, About Time, Little Miss Sunshine, School of Rock, The Holiday, Ocean's Eleven.
- Modern Classics: Parasite, The Social Network, Mad Max Fury Road, Whiplash, Spotlight, Moonlight, Get Out, La La Land, The Grand Budapest Hotel, Everything Everywhere All at Once.
- Travel Mood Films: Into the Wild, Before Sunrise, The Darjeeling Limited, Lost in Translation, The Motorcycle Diaries, Wild, The Beach, Eat Pray Love, A Map for Saturday, Tracks.
- Smart Thrillers: Gone Girl, Prisoners, Zodiac, Nightcrawler, Sicario, The Departed, Memento, Shutter Island, The Prestige, Knives Out.
- Animated Worlds: Spirited Away, Spider-Man Into the Spider-Verse, WALL-E, Toy Story, Soul, Howl's Moving Castle, Coco, Ratatouille, The Iron Giant, Up.
- Great TV Pilots: Breaking Bad, The Bear, Severance, The Last of Us, Succession, Lost, The Wire, Fargo, Black Mirror, Sherlock.
- Documentary Sparks: Free Solo, Jiro Dreams of Sushi, Won't You Be My Neighbor, Man on Wire, 13th, The Social Dilemma, My Octopus Teacher, Searching for Sugar Man, The Rescue, Apollo 11.
- Saturday Night Picks: Top Gun Maverick, Mission Impossible Fallout, John Wick, The Nice Guys, Baby Driver, Edge of Tomorrow, Guardians of the Galaxy, The Martian, Ford v Ferrari, Dungeons & Dragons Honor Among Thieves.
- Underrated Gems: The Fall, Coherence, The Invitation, Sing Street, Hunt for the Wilderpeople, Columbus, Leave No Trace, The Peanut Butter Falcon, Locke, Another Round.

Books:

- Books for Builders: The Lean Startup, Zero to One, The Mom Test, High Output Management, Inspired, Hooked, Crossing the Chasm, Rework, The Hard Thing About Hard Things, Build.
- Travel Writing Shelf: A Walk in the Woods, Vagabonding, In Patagonia, The Art of Travel, The Geography of Bliss, Turn Right at Machu Picchu, The Great Railway Bazaar, Eat Pray Love, Lands of Lost Borders, The Snow Leopard.
- Quiet Fiction: Stoner, Norwegian Wood, The Remains of the Day, A Gentleman in Moscow, Gilead, Klara and the Sun, Small Things Like These, Olive Kitteridge, The Sense of an Ending, The Uncommon Reader.
- Big Ideas: Sapiens, Range, Thinking Fast and Slow, The Beginning of Infinity, The Better Angels of Our Nature, The Black Swan, Factfulness, The Righteous Mind, Superforecasting, The Scout Mindset.
- Creative Work: The War of Art, Steal Like an Artist, Show Your Work, Big Magic, The Creative Act, Bird by Bird, On Writing, Daily Rituals, The Artist's Way, Keep Going.
- Biographies Worth Time: Steve Jobs, Shoe Dog, Elon Musk, Becoming, Leonardo da Vinci, Open, Born a Crime, Educated, The Ride of a Lifetime, Surely You're Joking Mr Feynman.
- Design and Cities: The Design of Everyday Things, Don't Make Me Think, A Pattern Language, The Death and Life of Great American Cities, Walkable City, How Buildings Learn, The Image of the City, Universal Principles of Design, Thinking with Type, The Timeless Way of Building.
- Short Reads: Animal Farm, The Old Man and the Sea, Siddhartha, Of Mice and Men, The Little Prince, The Stranger, The Metamorphosis, Notes from Underground, We Have Always Lived in the Castle, Breakfast at Tiffany's.
- Future Classics: Tomorrow and Tomorrow and Tomorrow, Project Hail Mary, Piranesi, The Overstory, Sea of Tranquility, Cloud Cuckoo Land, Hamnet, The Midnight Library, The Vanishing Half, Trust.
- Weekend Nonfiction: Atomic Habits, Deep Work, Digital Minimalism, Four Thousand Weeks, Essentialism, The Power of Habit, Make Time, Why We Sleep, The Psychology of Money, Outlive.

Games:

- Open Worlds: The Legend of Zelda Breath of the Wild, Red Dead Redemption 2, Elden Ring, The Witcher 3, Ghost of Tsushima, Skyrim, Horizon Zero Dawn, Cyberpunk 2077, No Man's Sky, Assassin's Creed Odyssey.
- Indie Wonders: Hades, Hollow Knight, Celeste, Stardew Valley, Inside, Limbo, Dead Cells, Tunic, Disco Elysium, Slay the Spire.
- Cozy Games: Animal Crossing New Horizons, Stardew Valley, Unpacking, A Short Hike, Spiritfarer, Dorfromantik, Coffee Talk, Ooblets, Lake, Garden Story.
- Strategy Nights: Civilization VI, Age of Empires II Definitive Edition, XCOM 2, Into the Breach, Total War Warhammer III, Crusader Kings III, Frostpunk, Cities Skylines, StarCraft II, Factorio.
- Story-First Games: The Last of Us, Life is Strange, Firewatch, What Remains of Edith Finch, God of War, Detroit Become Human, Mass Effect 2, The Walking Dead, Kentucky Route Zero, Oxenfree.
- Couch Co-op: Overcooked 2, It Takes Two, Lovers in a Dangerous Spacetime, Moving Out, Mario Kart 8 Deluxe, Super Smash Bros Ultimate, Cuphead, Unravel Two, Castle Crashers, Teenage Mutant Ninja Turtles Shredder's Revenge.
- Puzzle Favorites: Portal 2, The Witness, Baba Is You, Return of the Obra Dinn, Tetris Effect, Monument Valley, Fez, The Talos Principle, Human Resource Machine, Gorogoa.
- Retro Energy: Sonic Mania, Shovel Knight, Streets of Rage 4, Mega Man 11, Katana Zero, Hyper Light Drifter, Dead Cells, Celeste, Blasphemous, Axiom Verge.
- Late night: keep existing list and fill with 10 moody/night-friendly games.
- QA Games 713664: keep existing list and fill to 10 with simple search-resolvable games.

Apps & Tools:

- Daily Workflow: Notion, Todoist, Google Calendar, Slack, Linear, Trello, Things 3, Fantastical, Raycast, Superhuman.
- Creator Stack: Canva, Figma, CapCut, Descript, Riverside, Buffer, Later, Adobe Express, Lightroom, OBS Studio.
- Travel Planning Tools: Google Maps, Rome2Rio, Wanderlog, TripIt, Airbnb, Booking.com, Skyscanner, Google Translate, Splitwise, PackPoint.
- AI Utilities: ChatGPT, Claude, Perplexity, Midjourney, Runway, ElevenLabs, Cursor, Grammarly, Otter, NotebookLM.
- Design Toolkit: Figma, Framer, Webflow, FigJam, Miro, Whimsical, Coolors, LottieFiles, Iconify, ProtoPie.
- Writing Apps: Ulysses, Scrivener, Bear, iA Writer, Google Docs, Hemingway Editor, Grammarly, Obsidian, Notion, Drafts.
- Focus and Notes: Obsidian, Evernote, Bear, Forest, Freedom, Focus To-Do, OneNote, Apple Notes, Readwise, Pocket.
- Finance Helpers: YNAB, Splitwise, Wise, Revolut, Zerodha, Groww, Money Manager, Google Sheets, CoinMarketCap, PayPal.
- Learning Platforms: Coursera, Udemy, Khan Academy, Brilliant, Duolingo, Skillshare, MasterClass, edX, Udacity, YouTube.
- QA Apps 713664 and Apps: keep existing lists and fill to 10 if still present.

Products:

- Travel Gear: Anker PowerCore, Peak Design Travel Backpack, Apple AirTag, Matador FlatPak, Patagonia Black Hole Duffel, Kindle Paperwhite, Sony WH-1000XM5, Hydro Flask, Bellroy Tech Kit, GoPro Hero.
- Desk Setup: Logitech MX Master 3S, Keychron K2, Dell UltraSharp Monitor, BenQ ScreenBar, Grovemade Desk Shelf, Herman Miller Aeron, Elgato Stream Deck, Anker USB-C Hub, Apple Magic Trackpad, Twelve South Curve.
- Camera Kit: Sony A7 IV, Fujifilm X100VI, DJI Osmo Pocket 3, Peak Design Capture Clip, SanDisk Extreme Pro, Rode Wireless GO, Manfrotto Befree Tripod, Moment Lens, Lowepro Camera Cube, SmallRig Cage.
- Kitchen Favorites: Instant Pot, Fellow Stagg Kettle, AeroPress, OXO Good Grips Scale, Lodge Cast Iron Skillet, Vitamix Blender, Thermapen, Breville Barista Express, Zwilling Knife, Stasher Bags.
- Fitness Basics: Manduka Yoga Mat, Garmin Forerunner, TRX Suspension Trainer, Bowflex SelectTech Dumbbells, Theragun Mini, Nike Metcon, Fitbit Charge, Bala Bangles, Rogue Kettlebell, Hydro Flask.
- Everyday Carry: Bellroy Wallet, Leatherman Wave, Orbitkey, Apple AirPods Pro, Field Notes, Fisher Space Pen, Peak Design Everyday Sling, Nitecore Flashlight, Secrid Cardprotector, Nomad Cable.
- Home Comforts: Philips Hue, Dyson Purifier, Ember Mug, IKEA Skadis, Sonos One, Nest Thermostat, Muji Aroma Diffuser, Brooklinen Sheets, Xiaomi Air Purifier, Eufy Security Camera.
- Reading Accessories: Kindle Paperwhite, Kobo Libra Colour, Book Darts, Leuchtturm1917 Notebook, Muji Gel Pen, Mighty Bright Book Light, Lap Desk, Book Stand, Readwise Reader, Moleskine Journal.
- Outdoor Essentials: Patagonia Torrentshell, MSR PocketRocket, Hydro Flask, Black Diamond Headlamp, Osprey Daylite, Sawyer Squeeze, Merrell Moab, Sea to Summit Towel, Garmin inReach Mini, Therm-a-Rest Pad.
- Hike and QA Products 713664: keep existing lists and fill to 10.

People:

- Founders to Follow: keep existing 5, add five more recognizable founders.
- Travel Creators: Kara and Nate, Drew Binsky, Eva zu Beck, The Bucket List Family, Lost LeBlanc, Nas Daily, Hey Nadine, Mark Wiens, Flying The Nest, Sam Kolder.
- Design Voices: Don Norman, Julie Zhuo, Sarah Drasner, Jessica Hische, Pablo Stanley, Khoi Vinh, Mike Monteiro, Debbie Millman, Luke Wroblewski, Tobias Van Schneider.
- Writers and Thinkers: Paul Graham, Morgan Housel, James Clear, Austin Kleon, Seth Godin, Cal Newport, Derek Sivers, Ryan Holiday, Tim Urban, Maria Popova.
- Local Experts: use city/travel/local-guide profiles that are public and search-resolvable.
- Product People: Lenny Rachitsky, Shreyas Doshi, Marty Cagan, Teresa Torres, April Dunford, Gibson Biddle, Julie Zhuo, Sachin Rekhi, John Cutler, Melissa Perri.
- Photographers: Peter McKinnon, Chris Burkard, Annie Leibovitz, Brandon Woelfel, Jimmy Chin, Murad Osmann, Alan Schaller, Steve McCurry, Vivian Maier, Humans of New York.
- Educators: Sal Khan, Andrew Huberman, Barbara Oakley, Hank Green, John Green, Ali Abdaal, CrashCourse, Veritasium, Mark Rober, 3Blue1Brown.
- Builders in Public: Pieter Levels, Marc Lou, Danny Postma, Tony Dinh, Arvid Kahl, Sahil Lavingia, Jack Butcher, Justin Welsh, Ben Tossell, Jon Yongfook.
- Culture Curators: Maria Popova, Jason Kottke, David Perell, Rex Woodbury, The Marginalian, Austin Kleon, Colossal, Dezeen, Hypebeast, Monocle.
- QA People 713664: keep existing list and fill to 10.

Places:

- Keep Hyderabad and Singapore.
- Add eight city/location lists: Bengaluru, Mumbai, Delhi, Goa, Jaipur, London, Tokyo, New York.
- Fill every place list to 10 recommendations using real places in that city through Google Places autocomplete/search.

## Execution Strategy

Use a two-lane category-by-category gate:

Volume lane:

1. Inventory the category and identify missing list/item counts.
2. Seed missing volume through a controlled backend/API mechanism when authenticated API access is available.
3. Make the seeding operation idempotent by checking existing titles before creating records.
4. Record every created item and any skipped duplicate in the QA report.

Browser QA lane:

1. Capture current category dashboard text and console warnings.
2. For one representative list per category, create an item through the UI to exercise the real end-to-end flow.
3. For every filled list, open/reload the list and confirm the count is 10.
4. Return to the category dashboard and confirm no white screen, no stuck loading, and no item count regression.
5. Record pass/fail notes in `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`.

Stop conditions:

- A category create flow produces a white screen.
- Submit does nothing for two consecutive valid attempts.
- The dashboard count does not update after reload and direct list open.
- The same category shows a fatal console error after content creation.
- A form starts creating duplicate or obviously wrong entities.
- Authenticated backend/API seeding is unavailable and UI-only creation repeatedly exceeds the browser automation timeout.

## Task 1: Production Inventory Recheck

**Files:**

- Create/update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Re-open each category dashboard in the logged-in in-app browser.
- [ ] Capture dashboard text and visible item counts.
- [ ] Confirm target deficits against the baseline table above.
- [ ] Record any route that fails to hydrate within 30 seconds.

## Task 2: Places Lists And Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Create missing city lists until Places has at least 10 lists.
- [ ] For each Places list, open it and add real places until it has 10 items.
- [ ] Test empty list creation validation once if not already observed in this run.
- [ ] Verify list dashboard shows 10 visible place lists and each tested list count is 10.
- [ ] Record any Google autocomplete/select/submit failure with exact repro.

## Task 3: Movies Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing movie lists; do not delete extra lists.
- [ ] For each movie list, search TMDB and add entries from the Movie data set until the list has 10.
- [ ] Test one invalid/empty add attempt if accessible without destructive impact.
- [ ] Verify one representative detail/edit navigation after adding.
- [ ] Record count for each list.

## Task 4: Books Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing book lists; do not delete extra lists.
- [ ] Search and add entries from the Books data set until each visible list has 10.
- [ ] Verify one representative list detail route and back navigation.
- [ ] Record count for each list.

## Task 5: Games Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing game lists.
- [ ] Search and add entries from the Games data set until each visible list has 10.
- [ ] Verify one representative detail/edit navigation.
- [ ] Record count for each list.

## Task 6: Apps & Tools Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing app lists.
- [ ] Prefer App Store search for app entities where available; use URL/manual fallback for web tools.
- [ ] Add entries from the Apps & Tools data set until each visible list has 10.
- [ ] Verify one representative detail/edit navigation.
- [ ] Record count for each list.

## Task 7: Products Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing product lists.
- [ ] Use URL/manual fallback when product scraping fails.
- [ ] Add entries from the Products data set until each visible list has 10.
- [ ] Verify one representative detail/edit navigation.
- [ ] Record count for each list.

## Task 8: People Items

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Use existing people lists.
- [ ] Prefer URL/manual profile creation and avoid private or sensitive personal data.
- [ ] Add entries from the People data set until each visible list has 10.
- [ ] Verify one representative detail/edit navigation.
- [ ] Record count for each list.

## Task 9: Cross-Category QA Scenarios

**Files:**

- Update: `.gstack/qa-reports/qa-report-explorers-earth-2026-07-09-seven-category-content-fill.md`

- [ ] Reload every category dashboard after creation.
- [ ] Confirm category navigation links still work.
- [ ] Confirm public/private toggles are visible and not broken by new content.
- [ ] Confirm top-picks manage buttons still open where applicable.
- [ ] Confirm no category white-screens after reload.
- [ ] Collect console warnings/errors by category.

## Engineering Review

Findings:

1. High risk: UI-only creation is slow and can silently stall, especially with production infra distance and category forms that require external lookups.
   - Mitigation: use UI for representative E2E validation, not for the full volume run.
2. High risk: More than 700 item creations is large for a single production session.
   - Mitigation: seed through authenticated Strapi GraphQL/REST or a backend console job, then verify counts and route health through the browser.
3. Medium risk: Duplicate detection may reject some common entities.
   - Mitigation: maintain replacement entries from the same theme and record every substitution.
4. Medium risk: Some categories have more than 10 lists.
   - Mitigation: do not delete; fill all visible lists unless user narrows scope later.
5. Medium risk: Production performance may be slow due known infra distance and RDS routing.
   - Mitigation: use long waits, reload verification, and avoid double-clicking submit buttons.
6. Confirmed constraint: local shell DNS could not resolve `explorers.earth`, and the in-app browser evaluation sandbox does not expose the logged-in JWT or `fetch`.
   - Mitigation: complete UI pilots now; for bulk creation, use a server-side seeding path, deployment-side script, or provide a temporary scoped Strapi token/API route for this QA run.

Verdict:

- Plan is acceptable only as a staged QA/content-fill run.
- UI-only bulk creation is not acceptable for the remaining full-volume run under current production/browser constraints.
- The run began with Products as the pilot. `Hike` and `Travel Gear` were successfully filled and verified; `QA Products 713664` exposed the timeout constraint.
