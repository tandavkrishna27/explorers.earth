# Production UI test plan — explorers.earth (2026-10)

Target: **https://explorers.earth** (live, canonical Express + Postgres stack, Google-only sign-in, S3 media, Maps/Places, Google Books, TMDB, IGDB).

## Ground rules

- Browser: the owner's Chrome (Claude in Chrome), own tab group. Signed-in account: **`smoketest1021`** only.
- Never sign in/out of Google, never enter credentials, never touch any other account.
- Visitor/anonymous checks: `fetch(..., {credentials:'omit'})` from the page, or `curl`.
- Test content is created only on `smoketest1021` and every name is prefixed **`UIT`**.
- Destructive account cases (deactivate, delete, recover) are planned but **skipped: destructive, owner to run**.
- Nothing runs on the server; no workflows are triggered.
- Every page: watch the console for errors and the network for 4xx/5xx.

Known before this run (not re-reported as new): popular TMDB movies fail to resolve; Google Books returns 503 `backendFailed`; onboarding does not prefill the Google name/photo.

Owner decisions treated as expected behaviour: apex domain with `www` → 301; 30-day deletion grace; all currencies, `0` shows "Free"; anonymous analytics on public pages with no popup; name stays "Guides".

## Priorities

- **P0** — launch-blocking flow or data/privacy exposure.
- **P1** — core feature correctness.
- **P2** — edge case, validation, polish.
- **K** marks the 23 cases the previous local UAT could not run without real keys; these are run first.

## Cases

Columns: ID · Pri · Steps · Expected. IDs reuse the local UAT board (https://claude.ai/artifact/L7QKrUaLCQio6gnSs3G7JR) where a case exists; `LIVE-*` cases are new for production.

### 1. Domain, transport, landing, legal (MKT / LIVE-NET)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| LIVE-NET-01 | P0 | `curl -I https://www.explorers.earth/` | 301 to `https://explorers.earth/` |
| LIVE-NET-02 | P0 | `curl -I http://explorers.earth/` | 301 to https |
| LIVE-NET-03 | P1 | Inspect response headers on `/` | CSP, nosniff, referrer-policy and HSTS present |
| LIVE-NET-04 | P1 | `curl` `/robots.txt`, `/sitemap.xml` | 200, apex URLs only |
| MKT-01 | P1 | Visitor opens `/`, clicks each anchor and category pill | Sections scroll; pills switch; no console errors |
| MKT-02 | P0 | Signed in, open `/` and `/login` | Both go to `/home` |
| MKT-03 | P2 | Open About, Use cases, Contact | Each loads; Contact has a mailto, no form |
| MKT-04 | P1 | Open `/privacy?return=/home`, `/terms?return=//evil.example` | Valid return shows Back; `//` ignored → Return to Home |
| MKT-X01 | P1 | `/privacy?return=/\evil.example` | Ignored → Return to Home |
| MKT-05 | P2 | Open `/music`, `/hub`, `/guides`, legacy password URLs | Redirect per routing table |
| MKT-06 | P2 | Open `/this/does/not/exist` | 404 page with Go Home |
| MKT-07 K | P1 | Visitor on `/`: look for a cookie banner and third-party analytics requests | No banner (owner decision: anonymous analytics, no popup); no GA/Clarity requests |

### 2. Auth and session (AUTH)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| AUTH-01 K | P0 | New Google user signs in | Lands on `/onboarding` — **skipped: needs a fresh Google account, owner to run** |
| AUTH-02 K | P0 | Returning user: open `/home` in the signed-in Chrome; reload | Stays on `/home` with the account's data; `/api/explorers/v1/me` 200 |
| AUTH-03 K | P1 | Open `/login?error=…` (cancel state) as visitor | Amber "cancelled or could not finish" message — run via URL only, no sign-in |
| AUTH-04 | P0 | Visitor `GET /home`, `/settings`, `/profile` (curl/omit) | SPA redirects to `/login`; `/me` 401 |
| AUTH-05/06/07/08 | P0 | Logout, cross-tab logout, A→B→A | **skipped: would sign the test account out of Google session; owner to run** |
| AUTH-09 | P2 | Session error retry | Covered locally; not reproducible live without fault injection — N/A |

### 3. Onboarding (ONB)

The test account is already onboarded. Run only what is reachable without a new account.

| ID | Pri | Steps | Expected |
|---|---|---|---|
| ONB-07 | P1 | Finished user opens `/onboarding` | Sent to `/home` |
| ONB-02 | P0 | Handle validation (via Profile handle field / availability API): `ab`, `-bad`, `has space`, `UPPER`, 31+ chars | Refused with reasons and suggestions; uppercase lowercased |
| ONB-03 | P1 | Availability for a taken handle (`smoketest1021`) | "already taken" |
| ONB-01/04/05/06/08 | — | Full wizard | **skipped: needs a new account** |

### 4. Profile and handle (PRF)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| PRF-01 | P0 | Edit bio (prefix UIT, unicode `ü 漢字 🚀`) and save | Persists after reload and shows publicly |
| PRF-02 | P0 | Upload avatar and cover (small JPEG/PNG) | Upload, display publicly |
| LIVE-PRF-IMG1 | P2 | Upload a non-image (`.txt` renamed `.png`) and an over-size image (>limit) | Refused with a clear message |
| PRF-03 | P1 | Add a social link, toggle visibility | Visible link renders publicly; hidden one does not |
| PRF-04 | P1 | Change appearance preset | Public profile matches |
| PRF-05 | P1 | Recommendations layout / landing tab | Public profile opens accordingly |
| PRF-06 | P2 | Edit, navigate away | Unsaved-changes guard |
| PRF-07 | P1 | Handle change | **skipped: would move the test account's public URL; availability checks only** |
| LIVE-PRF-RES | P1 | Availability for reserved handles `home`, `settings`, `login`, `api`, `admin`, `privacy` | Refused as reserved |
| PRF-09 K | P2 | Gallery and business details tabs | Tabs appear only with content |
| LIVE-PRF-LONG | P2 | Bio of 5,000+ chars | Limit enforced with message, no crash |

### 5. Recommendations hub, Home and navigation (HUB / SET)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| HUB-01 | P1 | Home tabs per category; search | Lists per category; empty state where empty |
| HUB-02 K | P1 | Create a list from Home | Lands on the new list page |
| HUB-03 | P0 | Recommendations hub card menu: pin, disable, enable | Each works; disabling asks; 6th pin refused |
| HUB-04 | P2 | Toggle dashboard theme, reload | Persists; readable |
| SET-01 | P1 | Settings → language → Español, reload, back to English | Persists and is saved to the account |
| SET-02 | P0 | Hide a category → public pages follow | Category gone publicly; restore after |
| SET-04 | P0 | Manual pins: 6th refused; public nav order | Exactly pins in order |
| SET-06 | P2 | Settings search | Filters sections |
| LIFE-01 / LIFE-03 | P0 | Deactivate / delete account | **skipped: destructive, owner to run** |
| LIFE-02/04/05 K | P0/P1 | Recovery and cancel-deletion | **skipped: destructive, owner to run** |
| LIFE-06 | P2 | Delete form validation without submitting | Blocks with messages (no submit) |

### 6. Categories — the 8 categories

For each of **Places, Books, Movies, Games, Guides, Apps & Tools, Products, People**: create a `UIT` list, add an item (provider search where available, then manual), edit, upload media, reorder, publish, view publicly as visitor, unpublish, check hidden publicly, delete an item, delete the list.

| ID | Pri | Steps | Expected |
|---|---|---|---|
| PLC-01 K | P0 | Create a Places list with Google autocomplete city | Created with coordinates; without a suggestion it asks to select one |
| PLC-02 K | P0 | Add a place from Google Places search | Saves with provider photos copied |
| PLC-03 | P1 | Add a place manually | Saves without provider data |
| PLC-04 K | P1 | Add a place far from the list city | Refused with distance and max |
| PLC-11 K | P0 | Public Places pages and maps as visitor | Map renders; filters work |
| PLC-09 | P0 | Publish, unpublish, delete list | Public follows each state |
| BKS-01/03 | P0 | Create Books list, add manually | Saved |
| BKS-02 K | P0 | Add from Google Books | Saved with cover — known 503, record status only |
| BKS-06 K | P0 | Public books pages | Render; buy link opens |
| MOV-01/03 | P0 | Create Movies list, add manually | Saved |
| MOV-02 K | P0 | Add from TMDB (non-popular title) | Poster/cast/providers copied (popular titles: known issue) |
| MOV-08 K | P0 | Public movie pages: hero, rows, genre, modal | Render |
| GMS-01 | P0 | Add a game manually | Saved |
| GMS-02 K | P2 | IGDB search | Results, or "unavailable" keeping the draft |
| GMS-04 | P0 | Publish and public pages | Hero, rows, modal |
| APP-01/04 | P0 | Add app with valid URL; publish | Saves; public page links |
| APP-03 K | P2 | Enrichment panel from the app URL | Accepted values apply |
| APP-X01 | P2 | Invalid URL, `http://host:8080`, `https://u:p@host` | Plain-language validation |
| PRD-01/02/03 | P0/P1 | Add products: price 0 (Free), empty, 19.90 USD, 100 JPY, 100.50 JPY | 0 = Free; JPY decimals refused |
| PPL-01/03 | P0 | Add a person, publish | Public page with social links, no private data |
| PPL-02 K | P2 | Sector catalog page | Person on `/<u>/people/sector/<slug>` |
| GDE-01/02 | P0 | Guides wizard: Itinerary and Theme | Created |
| GDE-04 | P1 | Wizard validation | Each step blocks |
| GDE-05 K | P0 | Days and sections with places; budget; theme | Days show in List/Timeline and publicly |
| GDE-07/08 | P0 | Publish, pin, view publicly, delete | Follows state |
| LIVE-CAT-EMPTY | P2 | Publish an empty list | Refused |
| LIVE-CAT-LONG | P2 | 300-char list title; unicode title | Limit message or clean truncation; unicode round-trips |
| LIVE-CAT-REORDER | P1 | Reorder items, reload | Persists |
| LIVE-CAT-IMG | P2 | Item image: valid JPEG; >size limit; `.txt` | Valid stored on S3; others refused with message |

### 7. Public profile and visibility as a visitor (PUB / SEC / MED)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| PUB-01 | P0 | Visitor `/smoketest1021`, `/SmokeTest1021` | Renders; capitals → lowercase |
| PUB-02 | P0 | Hidden category URL | Redirects to profile |
| PUB-03 | P0 | Draft list/item direct URL | Not found |
| PUB-06 | P1 | Unknown handle; bad sub-paths | Not found / redirect |
| PUB-09 | P0 | Network on public pages | No strapi / localqr / `/graphql` |
| SEC-01 | P0 | Owner-only APIs with credentials omitted | 401 |
| SEC-03 K | P1 | Public JSON responses | No email, phone, private contact or owner ids |
| MED-01 | P0 | Draft item image URL as visitor | Denied |
| SEC-02/X01 | P1 | Reserved paths `/settings`, `/home` | App pages, not profiles |

### 8. QR, share, UTM, analytics (QR / ANL)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| QR-01 | P1 | Open a list's QR card; download | Renders; decodes to the list URL |
| QR-X01 | P1 | Inspect encoded QR URL | Has `utm_source=qr_code_scan&utm_medium=qr_code` |
| QR-03 K | P2 | Share modal: copy link, taglines | Copy toast; Places says "Travel like a local" |
| ANL-01 | P0 | Visitor loads public page; check event POST | 2xx; no cookie; no storage |
| ANL-02 | P0 | Owner analytics dashboard | Totals, sources, countries render |
| ANL-03 | P1 | Guides chart | Counts opens/views |
| QR-02 | P1 | Visit with QR UTM as visitor → dashboard QR tile | Counted |

### 9. Cross-cutting (XC / I18N / a11y)

| ID | Pri | Steps | Expected |
|---|---|---|---|
| XC-01 | P2 | Resize to 375 px on home, profile, public pages | Mobile layout, no horizontal scroll |
| XC-02 | P2 | Keyboard: Tab through landing and a dialog, Esc | Visible focus; dialog traps and closes |
| LIVE-A11Y-01 | P2 | Images have alt; buttons have names; `html[lang]` set | Basics present |
| I18N-01/02 | P1 | Switch to Arabic on landing | `dir=rtl`, persists |
| LIVE-CONSOLE | P1 | Console errors on every visited page | None |

---

## Results — run of 2026-10-21

Run against https://explorers.earth in the owner's Chrome as `smoketest1021`, plus `curl` / `fetch(credentials:'omit')` for visitor checks. Outcome: **10 failures (1 P0, 2 P1, 7 P2) plus 3 rows of P3 polish**, 4 cases blocked by the P0, about 50 cases passed (listed below), and the destructive or new-account cases skipped. Results board: https://claude.ai/artifact/TAJr91JBjuGTW6gB9WDqSd (private).

### Failures, by severity

| # | Sev | Case | What happens | Likely root cause |
|---|---|---|---|---|
| 1 | **P0** | PLC-01 (blocks PLC-02/03/04/11) | Places → Add Places List → pick "Lisbon, Portugal" from autocomplete → Add Location: toast "Failed to create recommendation list", form resets. No Places list can be created. | Browser call `GET places.googleapis.com/v1/places/{id}` returns **403 `PERMISSION_DENIED` / `API_KEY_SERVICE_BLOCKED`**: the browser Maps key's API restrictions do not include **Places API (New)**. `explorers-earth/src/features/Favorites/hooks/useCreateLocation.ts:83` hard-depends on that call. The legacy Maps JS Autocomplete and `PlaceService.GetPlaceDetails` work, so only the New API is blocked. Fix is GCP console config (add Places API (New) to the key's allowed APIs), not code. Same 403 empties Guides "Explore with explorers" (`places:searchNearby`) and guide place images (`locationImageService.ts:36`). |
| 2 | **P1** | MOV-02 (extends known issue) | TMDB search works (Paterson, 2016 listed), but selecting it fires `POST /entities/resolve` → **502** and the UI shows nothing; the user is left on the search list. | `MovieProviderFailure(502,'PROVIDER_INVALID_RESPONSE')` (`tunes/server/services/movieCatalog.ts:5`): the strict TMDB detail parser rejects the response. Same family as the known "popular movies" bug but it also hits a non-popular title, and the client gives no feedback. |
| 3 | **P1** | GMS-02 | Games search always says "Games provider is unavailable" (`GET /catalog/games` → 503). | IGDB is not wired: `CatalogService.searchGames` unconditionally `throw new GameCatalogFailure()` (`tunes/server/application/catalog.ts:51`, also `:57` for resolve). Contradicts the assumption that IGDB is live. Manual add works. |
| 4 | P2 | PPL-02 | Add Person → Sector shows only "No sector" plus "Sector catalog is not configured." | `GET /catalog/taxonomy?category=people` returns state `UNCONFIGURED`: people sector taxonomy is not seeded/activated in the production DB (`AddPersonPage.tsx:207`). |
| 5 | P2 | LIVE-API-503 | Right after every write (create list, add item, add day), `GET /categories/{cat}/content-snapshot` (and once `/guide`, `/memberships`) returns **503**, then succeeds on retry. Seen in guides and people. | Unclassified error falls through `sendActorError` → 503 (`explorersRecommendationRoutes.ts:45-55`). Each owner read opens its own REPEATABLE READ connection and a page fires ~20 at once after a write; pool/connect pressure is the plausible cause (not proven; a 12-request burst at rest did not reproduce). |
| 6 | P2 | HUB-01 | Home card shows **0 Active lists / 0 Recommendations** while the account has 7 UIT lists (3 published). Views counter does update. | Not traced. |
| 7 | P2 | PRF-06 | After a successful "Save & Publish" on Profile (toast "Saved & published successfully"), leaving the page still raises "Unsaved changes". | Dirty-state baseline not reset after save (false positive). |
| 8 | P2 | ANL-02 | Analytics: "Top 3 Countries" shows India and "5 events with country data", but the world map says "No Geographic Data Available". "Engagement with Location" lists a **Books** list as a location. | Map and location charts read different fields than the country/top chart (cf. UAT ANL-X03). |
| 9 | P2 | BKS-06 | Manual book with an uploaded photo: public card and modal cover show the placeholder; the photo appears only in the "Photos" strip. | Public projection sets `cover_url: null` and does not fall back to `Media[0]` for manual books. |
| 10 | P2 | LIVE-CAT-IMG | Uploading a non-image or an 8 MB PNG: client shows a broken preview, then save fails with the toast "Invalid media upload" (`POST /media` 422). Doesn't say the limit is 5 MB or that the file isn't an image. | No client-side type/size check; server `tunes/server/application/media.ts:28-29,107` has one generic message. |
| 11 | P3 | LIVE-NET-03 | No `Strict-Transport-Security` header on `/`. | Not set at the ingress. |
| 12 | P3 | LIVE-CAT-LONG | 300-char list name → "List_Name must be at most 100 characters" (internal field name). Slug for "Bücher" drops the ü ("bcher"). | Raw schema message surfaced; slugify strips non-ASCII instead of transliterating. |
| 13 | P3 | UX polish | Publish toggles: toast says "published" but the header/item still read "Draft" for 3-5 s. Guides wizard step counter goes "Step 1 of 2" → "Step 2 of 3". Porto guide default cover is a stock photo of a Japanese street. List delete uses native `window.confirm` (`BookListView.tsx:208` and 5 more) while item delete uses an in-app dialog. Places create ignores the typed list URL and slugifies the name (`useCreateLocation.ts` `slug: toUrlSlug(values.listName)`). Maps console warns `google.maps.places.Autocomplete` is deprecated for new customers. | — |

Known issues re-confirmed (not new): Google Books search → "Book provider unavailable" (BKS-02); onboarding photo — the avatar is a generated "ST" image.

### Passes

AUTH-02, AUTH-04, MKT-07 (no banner; no GA/Clarity in the bundle, CSP would block them; old `_ga`/`_clck` cookies on the domain are leftovers from the previous site), LIVE-NET-01/02/04, ONB-02/03 + SEC-X01 (reserved `home/settings/login/api/admin/privacy/explorers` and taken handles refused; `ab` and 36-char rejected), PRF-01 (unicode + Arabic bio round-trips publicly), SET-01 + I18N-02 (Arabic → `dir=rtl`, persists across navigation; reverted to English), SET-02, SET-06, BKS-01/03/04, BKS-06 (render, modal, buy link, Esc closes), MOV-01/03, GMS-01, APP-01, APP-X01, PRD-01/02/03 (JPY decimals refused; 0 → "Free" publicly), PPL-01, GDE-01/04/05/07/08, LIVE-CAT-EMPTY (empty list publish refused), item delete, PUB-01/02/03/06/09, MED-01 (media 404 after unpublish), SEC-01/03 (no email/phone in public JSON; analytics read 403 anonymously), QR-01/X01 (encoded URL has `utm_source=qr_code_scan&utm_medium=qr_code`), QR-02 (QR view counted), QR-03 (copy link), ANL-01 (events 201), ANL-03, XC-02 (visible 3 px focus ring, Esc closes dialogs), LIVE-A11Y-01, LIVE-CONSOLE (no site console errors; one from a Chrome extension).

### Not run

- Skipped, destructive (owner to run): LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, AUTH-05/06/07/08, PRF-07 (handle change).
- Skipped, needs a fresh Google account: AUTH-01, ONB-01/04/05/06/08.
- Blocked by PLC-01: PLC-02, PLC-03, PLC-04, PLC-11.
- Not reached: AUTH-03, MOV-08 (movie list left Draft), HUB-02, PRF-02/03/04/05/09, SET-04, XC-01 (owner's Chrome window could not be resized to phone width), QR image download (would save a file).
- APP-03: the app form states "Details are not fetched automatically"; enrichment is not exposed in the live UI.

### Test data left on `smoketest1021`

Lists: UIT Books (empty; a native "Delete…?" confirm was left open in the test tab), UIT Movies (draft), UIT Games (draft), UIT Apps (draft), UIT Products (published), UIT People (draft), guide "UIT Porto 3 days" (published). Books, Products and Guides categories are now public. Bio now starts "UIT bio:". Language restored to English.
