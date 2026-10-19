# Local acceptance report — 2026-10

The owner's gate before any deploy is "prove the application works locally, everything, from the UI".
This run brought the production-shaped stack up from `fork/main` (`ce5d05d9`, after #148) and drove every
user journey through a real browser (the Claude desktop app's built-in browser pane). Five defects were
found and fixed in the accompanying PR, one commit per defect, each with a test. The rest are reported
below for a decision.

Run date: 2026-10-19. Nothing ran against a real host, nothing was deployed, and the root
`docker-compose.replatform.yml` was not opened.

## Stack under test

| Piece | How it ran | Same as production? |
| --- | --- | --- |
| API | The `tunes/` Docker image built from this commit (`tunes/Dockerfile`, `node dist/server/api.js`), `EXPLORERS_API_MODE=canonical` | Same image. `NODE_ENV=development` (see substitutions) |
| Database | `postgres:15-alpine`, empty volume, separate migrator and runtime roles with 0600 secret files | Same |
| Migrations | `run-migration-gate.js` from the image, exactly as `deploy/production.compose.yml` runs it | Same. Head `0059_explorers_person_suppression_audit` |
| Taxonomy | `node dist/apply-reviewed-taxonomy.js --apply --reviewed-by acceptance-operator` | Same. `places` CONFIGURED, version 1, 335 terms added; `people` stays UNCONFIGURED (not part of this cutover) |
| SPA | `vite build --config vite.platform.config.ts --mode platform`, then `deploy/assemble-release.sh` with a `public.json` | Same build and assembler |
| Web server | `nginx:1.27-alpine` with `deploy/nginx/explorers.conf` rendered by `render-site.sh`, sharing the API's network namespace so `proxy_pass 127.0.0.1:5000` is unchanged | Same site file, minus TLS (see substitutions) |

The compose file and helper scripts lived in the session scratchpad, not in the repository.

## Substitutions

| Area | Production | This run | Effect on coverage |
| --- | --- | --- | --- |
| Sign-in | Google OAuth through Better Auth | A real `auth_user` + `auth_account(provider google)` + `auth_session` row inserted in Postgres, and the session cookie signed with the run's `EXPLORERS_AUTH_SECRET` (HMAC-SHA256, the same construction the e2e fixtures in `tunes/scripts/profile-browser-fixture.ts` use). The browser then talked to the real API, which verified that session on every request. | Everything after the Google redirect is real. The Google consent screen and callback were not exercised. Sign-out was the real `POST /api/auth/sign-out`. |
| TLS / origin | `https://explorers.earth` | `http://localhost:9080`. The browser pane refuses a self-signed certificate, and the API only allows `http:` for `localhost`. The SPA's runtime contract (`publicRuntimeContract.ts`) and the analytics transport (`musicDevelopmentTransport.ts`) require `https:`, so both were relaxed **locally and uncommitted** for `http://localhost`, and the nginx site was served on port 80 without its TLS block. | None on behaviour, but the HTTPS-only checks themselves were not exercised. |
| Media (S3) | `EXPLORERS_MEDIA_ENVIRONMENT=prod`, S3 bucket | `EXPLORERS_MEDIA_ENVIRONMENT=local` (`LocalObjectStorage` on a Docker volume), which requires `NODE_ENV=development`. MinIO was not usable: `resolveObjectStorage` has no endpoint override. | Uploads, the media routes and the public media gate were real; S3 itself was not. |
| Third-party keys | Real Google Maps, Google Books and TMDB keys | Dummy values | Places list creation (needs a Google Places pick) and adding a book (Google Books search only, no manual path) could not be exercised. Movies were added manually. Game search (IGDB through nginx to id.twitch.tv) was not used, to avoid calling a real host. |
| File picker | OS file dialog | A generated PNG handed to the page's own `<input type=file>` through `DataTransfer` | The app's crop, upload and save paths ran as normal. |
| `window.confirm` | The user clicks OK | The browser pane auto-dismisses native dialogs, so `confirm` was stubbed to return true before Movies/Games archive actions | None. The in-app dialogs were clicked normally. |

## Journeys

| Journey | Result | Notes |
| --- | --- | --- |
| Landing, Use cases, About, Contact | Pass | No console errors |
| Legal pages: Terms, Privacy, Cookies | Pass | `/privacy-policy` is a 404, but nothing links to it |
| Login page | Pass | Google button not clicked (real host) |
| Onboarding, handle choice | Pass | Three steps: profile, mobile number, address |
| Reserved handle rejected up front | Pass | `settings` rejected while typing, with suggestions |
| Profile edit (bio) | Pass | Persists across reload |
| Avatar and cover upload | Pass | `POST /api/explorers/v1/media` 201, served from the media route |
| Places: create, edit, media, publish, unpublish, delete | **Blocked** | Needs a Google Places pick (dummy Maps key) |
| Movies: create, edit, media, publish, unpublish, delete | Pass after fix (bug 3) | Manual add; the archived list stayed on the owner page |
| Books: create list, archive list | Pass after fix (bug 3) | Adding a book is **blocked**: Google Books search is the only path |
| Games: create, media, publish, unpublish, delete | Pass after fix (bug 3) | Manual add |
| Apps: create, media, publish, unpublish, delete | Pass after fix (bug 3) | App URL is required but not marked (UX) |
| Products: create, media, publish, unpublish, delete | Pass after fixes (bugs 3, 4) | Deleting a product failed with 422 |
| People: create, media, publish, unpublish, delete | Pass after fixes (bugs 3, 4) | Deleting a person failed with 422 |
| Guides: wizard, cover, day, publish, unpublish, delete | Pass after fix (bug 1) | "Use entered location" works without Google |
| Navigation pinning and order (Settings) | Pass after fix (bug 2) | Five categories read as "Unavailable - refresh to verify" |
| Category visibility ("Enable Public URL") | Pass | Only Guides prompts to go public on first publish |
| Public profile `/<handle>`, anonymous | Pass | |
| Category pages, anonymous; hidden stays hidden | Pass | A hidden category (People) redirects to the profile; a draft game in a published list is not shown; an unpublished list and its nav slot disappear |
| QR code and share | Pass | QR renders; share link carries UTM parameters |
| Guides flow, public | Pass after fix (bug 1) | |
| Owner analytics | Pass | Totals, traffic source, per-page breakdown |
| Guides analytics chart | Pass | 2 page views, 1 open, 1 unique guide |
| Locale change persists across sign-in | Pass after fix (bug 5) | Server-side save always worked; a fresh page stayed English |
| Account deletion; profile 404 afterwards | Pass | Username, reason, then `CONFIRM DELETE`. `/accowner` and `GET /profiles/accowner` return 404, and the session is dead (`get-session` null, `/me` 401) |
| No Strapi / api.localqr.earth traffic | Pass | Zero requests to strapi, localqr, `/graphql` or localtunes on every page checked; the API log has no Strapi or localqr reference |

## Bugs found and fixed (one commit each, with a test)

1. **Guide days without places vanished** (`fix(guides)`). A day saved with a title and overview but no
   places was dropped by the owner's List view (`ItineraryView`: `if (allPlaces.length === 0) return null`),
   leaving "Your Itinerary" blank, while Timeline view showed it. The public day tab showed only "No places
   available for this day." Both now render the title and overview.
   Repro: create a guide, add Day 1 with only a title and overview, open the guide (List view), then open
   the public guide's Day 1 tab.
2. **Settings navigation could not see five categories** (`fix(settings)`). `canonicalNavigationContent.ts`
   read only Books, Movies and Games (the pre-replatform native set), so Places, Guides, Apps, Products and
   People were permanently "Unavailable - refresh to verify", and Products, though public with a list, was
   never auto-pinned.
   Repro: publish an Apps or Products list, make the category public, open Settings > Pinned Navigation Tabs.
3. **Deleted lists stayed on the owner pages** (`fix(dashboard)`). Archiving a Movies, Books, Games, Apps,
   Products or People list returned 200, but the list stayed, labelled DRAFT or PUBLIC with 0 items, even
   after a reload. The complete owner read includes archived parents on purpose; six mappers did not filter
   them. Guides did. Public pages were never affected.
   Repro: Manage > Archive list (or Delete), confirm, reload the category page.
4. **Products and People items could not be deleted** (`fix(api)`). The item menu's Delete sends
   `DELETE /api/explorers/v1/collections/:id/memberships/:recommendationId`, which the repository only
   admitted for Games and Apps: 422 `Apps or Games membership required`, and no message in the UI. Places
   stay refused (pin positions and location links), as the existing test requires.
   Repro: add a product to a list, item menu > Delete.
5. **A saved language did not survive a fresh page** (`fix(i18n)`). After choosing Español, every later full
   load showed English strings under `<html lang="es">`, and the `es` bundle was never requested.
   `i18n.init()` emits `initialized` before its listener is attached, and the platform build imports the app
   after `window` `load` has fired. The first reload looked right only because the account-locale sync calls
   `changeLanguage` when local storage and the account disagree.
   Repro: Settings > Language > Español, then reload any page.

## Reported, not fixed

These need a product decision, or are larger than a one-commit fix.

- **The Guides wizard requires a Budget Type and then discards it.** `guideWizardDetails.ts` writes
  `budgetType: existing?.budgetType ?? null` ("legacy budget tiers have no adopted canonical mapping"), so
  the required Mid-Range choice is stored as `null`. Either map the tiers or drop the required field. The
  "Theme" guide type is also stored as `null`.
- **Analytics consent is only asked on `/`.** `CookieConsent` renders only on the landing page, and
  `hasAnalyticsConsent()` gates every event. A visitor who arrives by QR or link at `/<handle>` is never asked,
  so the owner's analytics stay empty for exactly the traffic QR sharing is meant to measure. Whether
  profile pages should ask is a privacy and product call.
- **A guide opened directly from a link records no event.** Only list-then-open is counted.
- **Public bottom navigation keeps empty slots.** After every list was unpublished or deleted, the profile
  still offered Guides, Movies, Games and Apps tabs with nothing behind them.
- **Places and Books cannot be added without live Google keys.** There is no manual path for a book or a
  Places list. Production has the keys, but these two categories were not proven end to end here.
- **Leftover copy:** the analytics page still says "Music" and shows a "Song Requests" KPI; the per-list QR
  card on Movies and Products lists says "Travel like a local"; Products' list delete dialog says
  "permanently delete ... and all its products" although it archives; several strings (Logout,
  Recommendations, Settings, Danger zone) are not translated; Settings still shows a Billing tab after P4.
- **UX:** App URL and Product URL are required but unmarked (Save stays disabled with no hint); typed guide
  categories are added only by clicking "Add", not with Enter; the manual Movie "Type" select renders as a
  white box in dark mode; only Guides offers to make its category public on first publish.
- **Owner pages duplicate reads.** Each category page issues its full content read two or three times on
  load, with the earlier ones aborted.

## Re-verification after the fixes

The API image and the SPA were rebuilt from the fix branch and redeployed into the same stack (database kept). A
second persona was onboarded, and each fix was re-checked in the browser:

| Fix | Check | Result |
| --- | --- | --- |
| 1 Guides | New guide, Day 1 with only a title and overview: owner List view shows "Day 1 / Higashiyama" and the overview; the anonymous public Day 1 tab shows both | Pass |
| 2 Settings | Settings reads all eight categories (`collections?category=…&status=active` for each); a public guide reads "Auto-pinned" with no "Unavailable" hint; no read loop (16 requests per load) | Pass |
| 3 Deleted lists | Product list deleted, owner Products page shows the empty state | Pass |
| 4 Item delete | Product item Delete: `DELETE …/memberships/…` 200 (was 422), item gone | Pass |
| 5 Language | Spanish chosen; a fresh full load of `/home` shows "Inicio" and fetches the `es` bundle | Pass |

Automated: the whole explorers-earth unit lane run serially (331 files pass after updating one People test that
counted the archived fixture list), `tsc -p tsconfig.app.json` clean, and the tunes contract suite passes except
the two pre-existing Windows-only Music local-state tests.
