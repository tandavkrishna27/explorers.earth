# Dashboard, Public Profile, and Analytics QA Report

**Status:** AUTOMATED QA PASS; LIVE-WRITE UAT NOT RUN
**Date:** 2026-08-24
**Branch:** `codex/profile-settings-tabs`
**Baseline HEAD:** `7333dc4`
**Primary public account:** `tk2727`
**Live data:** No live account or Strapi writes were made during this verification run.

## Final gates

| Gate | Result | Evidence |
|---|---:|---|
| Frontend unit suite | PASS | 144 files, 1,122 tests |
| Backend unit suite | PASS | 13 files, 113 tests |
| Full Playwright Chromium suite | PASS with intentional skip | 52 passed, 1 live-write test skipped, 0 failed; 53 total |
| Frontend TypeScript | PASS | Included in `npm run build`; `npx tsc -b` also exited 0 |
| Frontend production build | PASS | 5,295 modules; landing i18n/copy checks passed for 47 languages |
| Backend production build | PASS | Vite client and esbuild server completed |
| Frontend lint | PASS with debt | 0 errors; 1,478 existing warnings |
| Backend repository-wide TypeScript | PRE-EXISTING DEBT | Fails across Local Tunes auth, playlists, admin, storage, legacy routes, user-sync, and other existing files; production build and all 113 backend tests pass |

## Verified scenario coverage

### Dashboard Profile and Settings

- Profile, Gallery, and Appearance tab behavior, mounted-state preservation, dirty state, failed save/retry, reload persistence, mouse drag, handle-only touch drag, edge scrolling, cancellation, keyboard focus, RTL, reduced motion, and responsive geometry.
- Appearance options include six presets, six accents, four wallpaper modes, twelve first-view values, three recommendation layouts, and nine ordered categories.
- The pure theme matrix proves exactly 1,728 unique controlled states. The dry-run covering array proves all factor values and all factor pairs in 72 rows.
- The guarded live-write harness snapshots the full mutation payload, checks `updatedAt` before every write, refuses concurrent changes, restores the full baseline, and has deterministic normal/emergency restore tests.
- Settings `/settings` now has exactly Account and Billing tabs with roving tab focus, Arrow/Home/End behavior, 44px mobile targets, no horizontal overflow, and clean reload behavior at 375px and 1440px.
- Moved Account data (username/account type) and all Billing Address data load from the authoritative profile snapshot. Billing plan accordions load their empty state without being covered by a fixed save bar.

### Public Profile and routes

- Direct load, real UI click, full reload, browser back, and browser forward pass for Places, Guides, Movies, Music, Books, Games, Apps, Products, and People.
- Rapid Places-to-Products navigation keeps the latest route/content and back restores Places.
- Hidden and unknown category paths replace to `/:username` while preserving query/hash attribution; valid visible routes remain stable.
- Route query failures and successful lookups with no account both fail closed and do not mount protected category content.
- Public Music no longer remains on the Earth loader when the Local Tunes guest URL is missing or malformed; it reaches the controlled unavailable state.
- Six presets × three layouts render at mobile and desktop. Header identity remains unboxed, avatar ring is removed, custom/default avatars open the accessible viewer, branding is theme-invariant, and solid/banner/full-wallpaper/ambient contrast is checked from rendered pixels.
- Recommendation loading, true empty, partial error, cached error, total error, retry, media failure, malformed optional JSON, sanitizer behavior, and privacy boundaries are covered.
- Recommendation queries no longer request up to 350,000 relation IDs for counts. Counts are derived from bounded preview relations and use a truthful lower-bound presentation when capped.

### Analytics and attribution

- Consent is owned globally, is reactive, and a public view is marked handled only after a committed write.
- Five-field first-touch UTM attribution persists across internal navigation for a bounded session window.
- Non-UTM external referrers are reduced to origin only; same-origin, unsafe, paths, and query strings are discarded. UTM source wins over referrer, then direct.
- Raw visitor IP is not persisted. Country is derived on the backend, and trust-proxy behavior is constrained.
- Public ingestion validates the target account plus optional list/item ownership through existing account-nested Strapi relations, uses server timestamps, strict event/metadata limits, rate limiting, timeouts, idempotency receipts, startup migration readiness, stale-pending recovery, and controlled error mappings.
- Target-validation cache entries include account, page, list, and item dimensions. Live read-only schema probes passed for Places/recommendation detail, Guides, Movies, Books, Games, Apps, Products, and People without a Strapi code/schema change.
- The write client polls `202 pending` receipts for 9.75 seconds with capped exponential backoff, covering the backend's eight-second publish bound, and preserves one event ID across every poll and later retry.
- Apps, Products, and People index and direct-list routes now emit view, item, list-navigation, and share events; People sector routes emit route-specific view/item/share events. Browser clicks prove canonical account/list/item fields, and same-component SPA transitions remain independent even while the source view is in flight.
- Rate-limit buckets use Express's trust-proxy-resolved client IP with a socket fallback, so unrelated visitors behind one ingress do not share a bucket.
- Owner analytics reads are authenticated and account/date scoped. Cross-account reads are rejected.
- Dashboard empty/failure/mobile states and scoped date refreshes pass the Analytics Playwright suite.

## Bugs found and fixed during final UI verification

1. **Settings partial-data crash:** `accounts[0]` was indexed while `accounts` could still be absent. Optional access now fails safely.
2. **Settings mobile overlay:** the moved Account/Billing forms inherited the Profile editor's fixed Save & Publish dock and blocked billing controls. Embedded Settings forms now use an inline action; Profile keeps its fixed action.
3. **Settings tab accessibility:** inactive tabs remained in the tab order and both tabs were only 28px high. Roving `tabIndex` and 44px targets are now enforced.
4. **Public Music infinite loader:** a missing/invalid Local Tunes link made readiness impossible. Guest URL is derived deterministically and the loader runs only while a valid guest request is pending.
5. **Recommendation over-fetch:** duplicate 500-ID count aliases across seven categories were removed.
6. **Attribution gap:** non-UTM referrals were incorrectly classified as direct; privacy-safe origin attribution was added.
7. **Strict fixture regressions:** new brand assets and bounded count wording were brought into the deterministic request/content contracts.
8. **Analytics entity spoofing:** optional list/item IDs were accepted after only account validation and the cache was account-only. The backend now proves the complete ownership chain and caches by the complete target tuple.
9. **Ingress rate-limit collapse:** the limiter used the proxy socket address. It now uses the constrained Express client IP and keeps visitors behind the same ingress independent.
10. **Pending receipt identity loss:** immediate `202` retry exhaustion allowed a later retry to mint another event ID. Bounded backoff polling and retry-ID retention now keep one semantic action on one event ID.
11. **Category analytics gaps:** Apps, Products, and People lacked public analytics wiring. Page, item, list-navigation, and share tracking now match the existing media categories and recover nested list ownership deterministically.
12. **Missing-account route fail-open:** an empty successful visibility query mounted optional content. Only the primary profile may handle its own missing-account state; optional categories redirect to the profile root.
13. **Nested category analytics gaps:** direct Apps, Products, and People list URLs plus People sectors were untracked. Their views now wait for canonical ownership where required and record item/share actions.
14. **SPA view dedupe collision:** People sector-to-sector navigation could inherit the prior route's handled or in-flight view. Canonical path now participates in session, retry, in-flight, and view-reset identity; stale source completions cannot mark the destination handled.

## Intentional limitations and follow-ups

- **Live 72-row account mutation was not executed.** It remains gated behind explicit write approval/auth storage. Deterministic tests prove the matrix and restore/concurrency machinery, but they do not prove the current dev Strapi account accepts every live row.
- **Visible user Chrome control was unavailable in this environment.** Browser QA used Playwright Chromium. Do not describe this run as visible Chrome UAT.
- **No Strapi code or schema was changed.** The analytics boundary uses Local Tunes and existing Strapi data contracts.
- **Local Tunes user-sync was not touched.** Its errors remain owned by the separate session.
- The frontend main chunk is still about 6.72 MB minified (about 1.80 MB gzip). Route-level code splitting is a performance follow-up.
- Analytics owner reads still need bounded pagination/aggregate endpoints for very large lifetime datasets; Home should not request from the Unix epoch indefinitely.
- The in-memory rate limiter is suitable for the current single-process phase. A distributed store can be added when multi-instance infrastructure exists.
- Historical analytics events missing country remain historical data-quality debt; new events use the new contract.
- The nine category creation suites pass, but a shared strict dispatcher and deeper edit/delete/duplicate/scraper-negative coverage remain maintainability follow-ups.
- ProfileForm still has a legacy 100ms readiness timer in dirty-state initialization; replace it with a deterministic lifecycle signal in a separate change.

## Restore ledger

| Batch | Baseline captured | Live writes | Restore | Equality proof |
|---|---|---|---|---|
| Deterministic unit/browser suites | Fixture state | No | N/A | Fixture assertions passed |
| Live theme matrix | Harness supports full snapshot | Skipped by gate | Not needed | Restore/concurrency logic passed deterministic tests |
| Visible Chrome UAT | N/A | No | N/A | Chrome control unavailable |

## Suggested user UAT

1. Open `/profile`, change one Appearance option, save, then hard-refresh both `/profile` and `/tk2727`.
2. On `/tk2727`, tap every bottom category once, then use browser Back/Forward. No section should flash and disappear or show “can't load this section.”
3. Test the public page at a narrow phone width with and without hero image, and open the default/custom avatar.
4. Open `/settings`; verify Account and Billing, expand Billing Address and Current Plan, and ensure no save bar covers the controls.
5. After consenting to analytics, open a UTM-tagged public URL, click a list/item, then confirm the Analytics dashboard after backend propagation.
