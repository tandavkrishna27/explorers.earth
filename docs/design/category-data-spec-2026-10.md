# Category data spec — review for owner approval (2026-10)

Status: **proposal, not implemented.** Docs only. Nothing here changes app code.
Inputs:
- owner UAT walkthrough, area OWN: product fields confusing, People rating dropdown, empty sector, fields that differ per category without a reason;
- code on `main` at 8063651c;
- the data-sourcing research of 2026-07-01, re-summarised below.

Paths are relative to the repo root. Contracts live in `tunes/shared/`, UI in `explorers-earth/src/features/`.

---

## 1. What exists today (inventory from code)

### 1.1 Shared core, as implemented
| Concept | Today | Problem |
|---|---|---|
| Owner rating | `userRating` integer 1–10, nullable (`explorersContract.ts:59`) | Places, Books and Movies show 10 star buttons. Apps, Products, People and Games show a 1–10 `<select>`. People has a rating at all. |
| Note | RichNote, quill-html ≤256 KB (`explorersRichNoteContract.ts:3-5`) | Consistent. |
| Image | Per category: `photoMediaIds` (places), `posterUrl` (movies), `coverUrl` (books), `images[]` (games), `logoUrl` + screenshots (apps), `logoUrl` + `imageUrls` (products), `avatarUrl` (people) | Seven names for one idea. |
| Link | `websiteUrl`, `appUrl` + `downloadUrl`, `productUrl` + `offer.buyUrl`, `socialUrls.primary`, `buyLinks[]`, `previewLink` | Product and App both require *two* URLs. |
| Category / tags | Curated taxonomy only for Places (2-level) and People (flat sector) (`explorersTaxonomyContract.ts:5,37,56`). Movies use per-owner `movieTerms`, Books use provider `subjects`, Games use genres, Guides use free text. Apps and Products have nothing. | Uncategorised items. People sector is empty in prod until the taxonomy is applied. |
| Provider rating | Places and Books 0–5, shown ×2 as "/10". TMDB 0–10. IGDB 0–100, dropped. | Shown inconsistently, and easy to confuse with the owner's own rating. |

### 1.2 Per category (condensed; full field tables in the appendix)
| Category | Auto-fill | Required | Notable stored-but-not-shown | Notable asked-but-misused |
|---|---|---|---|---|
| Places | Google Places (New) + photo import | title | addressComponents, providerTypes, ratingsCount, priceLevel/priceRange, publicPhone, websiteUrl, legacyPlaceNote, creatorSocialUrl | `recommendationType: person` toggle inside Places duplicates the People category; contact fields default private |
| Movies & Shows | TMDB | title, mediaType | originalTitle, runtimeMinutes, seasonCount | — |
| Books | Google Books → Open Library | title | isbn13/10, languageTag, publishedDateText, previewLink, ratingsCount | form shows provider rating ×2 but it can't be edited |
| Games | IGDB (year, platforms, genres, cover) | title | storyline, companies, releases and total_rating are fetched but `providerFacts` is forced null (`explorersGameOwnerContract.ts:10-20`) | public modal renders `developer`, but no such field exists |
| Apps & Tools | opt-in enrichment: Apple lookup by id + website OG/JSON-LD; only title, description, priceTier and platforms are accepted | title, appUrl | — | logo/developer/downloadUrl never enriched; Apple price maps only to Free/Paid (never Freemium/Subscription) |
| Products | none (manual) | title, productUrl | `imageUrls[]` vs uploaded mediaIds overlap (unverified) | **"Logo URL" is rendered as the product's main photo** (`ProductDetailModal:88-90`); price and currency are separate inputs; "specifications" is an unexplained key/value grid |
| People | none (manual) | title (name) | usernameHandle, non-primary socialUrls | rating dropdown; "Profile URL" is just `socialUrls.primary`, other socials have no inputs; sector empty in prod; follower count is free text |
| Guides | wizard; place picks via Google | guideType etc. | — | no rating (correct); categories/tags free text |

Product money semantics are sound and should be kept:
- exact decimal string;
- "0" means free, null means not recorded;
- price and currency must come together, ISO 4217;
- old currency-less rows stay readable (`explorersProductContract.ts:15-111`).

The *form* is what confuses: two inputs for one value.

---

## 2. Proposed spec

### 2.1 One core for every category
| Core field | Spec | Rationale |
|---|---|---|
| **Title** | required, ≤500 | Already universal. |
| **Image** | one *primary image* (uploaded or provider-imported into our media store) + optional gallery ≤10 | One concept, one name in the UI ("Photo"/"Cover"). Re-hosting provider images only where terms allow it (see §3). |
| **Your note** | RichNote, optional | Already universal; it is the product's voice. |
| **Your rating** | optional, **5 stars with half-steps**, stored as today's 1–10 integer (star = value/2) | Same widget everywhere. Zero migration: storage stays 1–10. Removes the dropdown. |
| **Link** | one primary link (where to go / buy / follow), optional except where it is identity | One "Link" input. Extra links go into a category-specific list. |
| **Category** | one curated taxonomy term per category (Places keeps two levels) | Fixes "uncategorised". Same picker everywhere. |
| **Tags** | optional free-text tags ≤12 | Owner's own labels, separate from the curated category. |

Display rule: a provider rating is shown only as a small "TMDB 7.8" / "Google 4.5★" chip, never on the owner's star scale.

### 2.2 Category extras
Each category is shown as Essential / Nice-to-have / Remove-or-hide.

**Places.**
- Essential: address + map pin, category/subcategory (335-term taxonomy), photos.
- Nice: opening hours link, price level ($–$$$$), phone (public only if owner opts in), website.
- Remove: the `recommendationType: person` toggle (move to People); `legacyPlaceNote` after a migration; `providerTypes` stay internal (feed the taxonomy suggestion only).
- Rationale: Google fills it all; the shown set should match what a visitor needs to go there.

**Movies & Shows.**
- Essential: type (movie/show), year, poster, genres, where to watch (region).
- Nice: director, runtime (movie) / seasons (show), cast top 10, overview.
- Remove: nothing. Surface runtime/seasons, which are stored but not shown.
- Category: map TMDB genres to a small curated list instead of per-owner `movieTerms` (decision D6).

**Books.**
- Essential: author(s), cover, year.
- Nice: publisher, page count, description, buy links.
- Hide (keep for dedupe): ISBN, language, previewLink.
- Category: a curated ~25-genre list (BISAC-top-level-like) seeded from provider `subjects`.

**Games.**
- Essential: cover, year, platforms, genres.
- Nice: developer (add the field, which IGDB `involved_companies` supplies), short summary, screenshots ≤10.
- Remove: the `developer` render in the modal until the field exists. Stop fetching storyline/releases that are thrown away.

**Apps & Tools.**
- Essential: icon, link (single: store page *or* website), platforms (fixed list), price model (Free / Freemium / Paid / Subscription).
- Nice: developer, screenshots, short description.
- Remove: the separate `downloadUrl` (merge into the one link + optional "other platform links" list).
- Category: curated ~20 terms (Productivity, Design, Finance, Travel…).

**Products** (the most confusing today).
- Essential: product photo (rename "Logo URL" → **Product photo**, upload or from link preview), brand, link (rename to "Where to buy"; the affiliate link is allowed, never cloaked), price as **one input with a currency selector** (default from the owner's locale).
- Nice: short "why I like it" (= the note), 3–5 **key specs** as labelled rows (e.g. "Weight: 1.2 kg").
- Remove:
  - the **brand logo URL** concept entirely (no visitor value; brand is text);
  - the second required URL (`productUrl` vs `offer.buyUrl`), keeping one link;
  - the 200-row specification grid (cap at 8, hint text "key facts a buyer compares").
- Category: curated ~20 terms (Tech, Home, Outdoor, Beauty, Books-adjacent…).
- Add: an affiliate-disclosure toggle.

**People.**
- Essential: name, photo, headline ("what they're known for"), sector (20-term taxonomy, *required* once applied), primary profile link (platform auto-detected from the URL, so drop the platform select).
- Nice: up to 4 extra social links (inputs for the keys the contract already allows), location.
- Remove:
  - **rating** (rating a person reads badly; the note is the endorsement);
  - free-text follower count (stale, unverifiable; drop or show only if the owner opts in);
  - make skillsTags plain tags.
- Rationale: People is about *why follow*, not stats.

**Guides.** Keep as is (rich wizard).
- No rating, which is correct: it is the owner's own content.
- Convert free-text `categories` to the core Category picker (guide type already covers most of it); keep tags.

---

## 3. Sourcing research

Facts below come from the 2026-07-01 deep-research pass (25 claims verified then). Price and limit numbers move: re-verify before building.

| Option | What it gives | Cost / limits | Terms / risk | Verdict |
|---|---|---|---|---|
| **Our own Open Graph / Twitter-card / JSON-LD fetch of a pasted URL** (already in `appEnrichmentProviderCore.mjs` website adapter) | title, description, image, site name; schema.org `Product` (name, brand, image, offers.price/priceCurrency) and `Person` (name, image, jobTitle, sameAs) where the page publishes them | free; our bandwidth; need SSRF guard, timeout, size cap (already present) | Reading metadata a site publishes for link previews, on a user's single paste, is the standard link-unfurl use (Slack, iMessage). Respect robots-blocked/login-walled pages by failing soft. | **Backbone for Products, Apps, People, websites.** Extend it from title/description to image + Product/Person fields. |
| oEmbed (YouTube, Vimeo, X, Spotify, SoundCloud…) | title, author, thumbnail | free, no key for most | official | Add for creator profiles/videos in People; cheap. |
| Hosted link-preview APIs (Iframely free ~2k/mo, Microlink ~50/day free) | the same OG data + better coverage of JS-heavy sites | free tiers small; paid beyond | fine | Fallback only if our fetcher's hit rate is poor. |
| **iTunes Search / Lookup API** | iOS/macOS apps + podcasts: search, icon, developer, price, genres, screenshots | free, no key, ~20 calls/min | official, allowed | **Apps: add keyword search**, not only id lookup; map icon, developer, genre and screenshots too. |
| Google Play | — | no official search API | `google-play-scraper` is unofficial and fragile; SerpApi is a paid proxy | Play = paste URL + OG preview. |
| Amazon PA-API | — | closed to new customers; deprecated 2026-05 → Creators API (uninvestigated) | Amazon forbids re-hosting scraped product images | **Don't build.** Amazon = pasted affiliate link + owner-uploaded photo. |
| Flipkart Affiliate API | search | signups closed ~2018 | — | No. |
| eBay Browse API | product search | free with key; no India | official | Optional later, for non-India owners. |
| SerpApi Google Shopping | product search | free 250/mo, then paid | scraping proxy; ToS risk sits with the vendor | Optional "search products" if owners ask; not v1. |
| LinkedIn / Instagram / Facebook for People | — | LinkedIn forbids storing others' data; IG Business Discovery gated to business accounts; FB needs a token | Proxycurl was sued and shut down 2025 | **No API backbone for People.** |
| Third-party profile scrapers (Apify, Bright Data, ~$1.50/1k) | name, photo, bio by profile URL | paid, free tiers | US-defensible for public logged-out data; not covered by GDPR / UK DPA / India DPDP | Not recommended at launch. The existing bespoke IG scraper in Places should be retired or kept off by default. |

Legal line we keep:
- only user-initiated, one URL at a time;
- public metadata only, no bulk harvesting, no login-walled pages;
- images either uploaded by the owner or copied only from providers whose terms allow it (Google Places photos via the API attribution rules; TMDB and IGDB with attribution; Open Library; Apple artwork for display);
- an opt-out for people who ask to be removed (the `suppressed` flag already exists).

### Recommendation per category
| Category | Approach | Effort |
|---|---|---|
| Places | keep Google Places (New) | none |
| Movies & Shows | keep TMDB; surface runtime/seasons | S |
| Books | keep Google Books → Open Library | none |
| Games | keep IGDB; add developer from involved_companies | S |
| Apps & Tools | add iTunes **search** + map icon/developer/screenshots; paste-URL OG for Play/web/SaaS | M |
| Products | paste-URL → extended OG + JSON-LD `Product` (photo, brand, price+currency) prefill; owner edits; affiliate link kept verbatim | M |
| People | paste profile URL → OG/oEmbed prefill (name, photo, headline) where it is public, platform auto-detected; else manual | S–M |
| Guides | no external source | none |

Shared building block: **one "paste a link" prefill service.** Generalise the app-enrichment website adapter to return `{title, description, imageUrl, siteName, product?, person?}`, used by Apps, Products and People. This is the single highest-leverage change.

---

## 4. Summary table

| Category | Core + extras (essential) | Remove / hide | Category taxonomy | Source |
|---|---|---|---|---|
| Places | address, pin, photos | person toggle, legacy note | 335-term (exists) | Google Places |
| Movies & Shows | type, year, poster, genres, where-to-watch | — | curated genres (new) | TMDB |
| Books | authors, cover, year | ISBN/lang hidden | curated genres (new) | Google Books → OL |
| Games | cover, year, platforms, genres | dead modal `developer` render | IGDB genres → curated | IGDB |
| Apps & Tools | icon, one link, platforms, price model | separate downloadUrl | curated ~20 (new) | iTunes search + link preview |
| Products | photo, brand, one link, price+currency in one input | brand-logo URL, 2nd URL, 200-row specs | curated ~20 (new) | link preview + JSON-LD |
| People | name, photo, headline, sector, profile link | rating, follower text, platform select | 20 sectors (exists) | link preview/oEmbed + manual |
| Guides | as today | — | type + core picker | none |

---

## 5. Decisions for the owner

1. **Rating scale:** one 5-star widget (half-stars, stored as today's 1–10) for every rated category? *Rec: yes.*
2. **People rating:** remove it? *Rec: yes.*
3. **Product "Logo URL":** rename to "Product photo" and drop the brand-logo idea? *Rec: yes.*
4. **Product links:** collapse product URL + buy URL into one "Where to buy" link? *Rec: yes.*
5. **Price + currency:** one input with a currency selector, defaulting to the owner's locale? *Rec: yes.*
6. **Specifications:** cap at ~8 "key facts", or remove entirely? *Rec: cap at 8.*
7. **Curated categories for Movies, Books, Games, Apps and Products** (new small taxonomies, like Places/People), replacing per-owner movie terms and free subjects? *Rec: yes, ~20 terms each, owner reviews the lists.*
8. **People sector required** once the 20-sector taxonomy is applied in prod? *Rec: yes.*
9. **Follower count on People:** drop it? *Rec: drop.*
10. **Places "person" toggle:** retire it in favour of the People category, and keep the Instagram scraper off? *Rec: yes.*
11. **Paste-a-link prefill** as the shared sourcing backbone for Apps, Products and People (no paid APIs at launch)? *Rec: yes.*
12. **Apps:** add iTunes keyword search (free)? *Rec: yes.* Play Store stays paste-URL.
13. **Product search** (SerpApi/eBay): defer until owners ask? *Rec: defer.*
14. **Affiliate disclosure toggle** on Products? *Rec: yes.*
15. **Provider ratings:** show as a small source chip (e.g. "TMDB 7.8"), never on the owner's star scale? *Rec: yes.*

---

## Appendix — field-level inventory (code citations)

**Places** (`explorersPlaceContract.ts`):
- title;
- formattedAddress / addressComponents;
- lat/lng (both or neither, :49-50);
- providerTypes;
- providerRating 0–5 + ratingsCount;
- publicPhone, websiteUrl, priceLevel 0–4, priceRange;
- providerPlaceId;
- context: recommendationType place/person, source, contactName/Number with contactVisibility default private (:99-106);
- placeSocialUrl, placeWebsiteUrl, creatorSocialUrl, personProfileUrl, personAddress, legacyPlaceNote;
- photoMediaIds ≤10 (:108-111);
- taxonomy category/subcategory term ids;
- the list stores a location snapshot + instagramMediaUrl (:120-130).

**Movies** (`explorersMovieContract.ts`):
- title, mediaType movie/tv, originalTitle, yearText, director, runtimeMinutes, overview, seasonCount;
- posterUrl/backdropUrl (TMDB host only, :4);
- genres;
- providerRating 0–10;
- cast ≤200 (10 photos copied);
- watchProviders by region;
- context region + selectedProviderIds ≤8;
- movieTerms ≤32.

**Books** (`explorersBookContract.ts`):
- title, subtitle, publisher, publishedDateText, yearText, description, pageCount, languageTag;
- authors, subjects;
- coverUrl/coverLargeUrl/previewLink (Google Books / Open Library hosts, :6);
- isbn13/10;
- providerRating 0–5 + ratingsCount (not overridable, :10);
- buyLinks ≤20.

**Games** (`explorersGameContract.ts`, `explorersGameOwnerContract.ts`):
- title, releaseYear, platforms ≤12, genres ≤12;
- images ≤20, first = cover;
- IGDB providerFacts forced null.

**Apps** (`explorersAppContract.ts`):
- title;
- appUrl (required, identity, :8-11, 39);
- developer, logoUrl, description ≤8192, downloadUrl;
- priceTier Free/Freemium/Paid/Subscription;
- platforms ≤16;
- screenshotMediaIds ≤10;
- enrichment accepts title/description/priceTier/platforms only (`explorersAppEnrichmentContract.ts:11,30-34`).

**Products** (`explorersProductContract.ts`):
- title;
- productUrl (required identity, :128, 141);
- brand;
- logoUrl (rendered as the hero image, `ProductDetailModal:88-90`);
- description;
- specifications `[{key, value}]` ≤200 (:114-125);
- imageUrls ≤20;
- per-recommendation offer {price numeric(20,6), currencyCode ISO 4217, buyUrl} (:7-111).

**People** (`explorersPersonContract.ts`):
- title (name);
- usernameHandle (identity, :60);
- headline, locationText, avatarUrl;
- primaryPlatform enum (x→twitter, :27-34);
- socialUrls with a closed key set (:38-39);
- skillsTags ≤32;
- externalFollowerCountText (:49-51);
- suppressed;
- sector taxonomy id.

**Guides** (`explorersGuideContract.ts:261-279`):
- guideType, multiCity, numberOfDays 1–365;
- estimatedBudget + budgetCurrency + budgetType, budgetTier;
- bestTimeToVisit, categories, tags;
- tipsNotes, place snapshot, locationEntityId;
- sections (timeline, transport, stay, activities, budget, map, checklist);
- no userRating.

**Rating UI:**
- star buttons: RecommendForm:1270-1276, AddMoviePage:534, AddBookPage:383-390;
- `<select>`: AddAppPage:210-213, AddProductPage:247-249, AddPersonPage:242-245, AddGamePage:126.
