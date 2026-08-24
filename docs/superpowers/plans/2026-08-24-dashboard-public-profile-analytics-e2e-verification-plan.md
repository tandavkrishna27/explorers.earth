# Dashboard, Public Profile, and Analytics End-to-End Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that every dashboard profile control persists correctly, produces the intended public-profile result across supported themes and layouts, keeps public routes stable, and records accurate analytics and UTM data.

**Architecture:** Verification is split into four layers: pure normalization/unit coverage, deterministic mocked browser coverage, guarded live dashboard-to-public publishing, and real-Chrome UAT. The large appearance space is exhaustive without writes and pairwise for live writes; every live batch snapshots and restores every writable profile field in `finally`. Analytics keeps Strapi unchanged but moves visitor event ingestion and owner-scoped reads behind a separate Local Tunes backend boundary that enforces consent, derives coarse country without persisting raw IP, and supplies idempotency.

**Tech Stack:** React 18, TypeScript, Vite, Apollo Client, Strapi GraphQL/REST, Vitest, Testing Library, Playwright Chromium, real Chrome/CDP.

**Specs:** `docs/superpowers/plans/2026-08-20-profile-settings-information-architecture-plan.md`, `docs/superpowers/plans/2026-08-20-public-profile-recommendations-presentation-plan.md`, `docs/superpowers/plans/2026-08-20-public-profile-theme-customization-plan.md`, `docs/superpowers/plans/2026-08-20-responsive-profile-editor-polish-plan.md`, and `docs/superpowers/plans/2026-08-20-theme-appearance-exhaustive-qa-plan.md`.

## Execution status — 2026-08-24

- Automated implementation and verification are complete: frontend 1,122/1,122 units, backend 113/113 units, and Playwright 52 passed / 1 intentionally gated live-write skip / 0 failed.
- The 1,728-state pure theme matrix, 72-row pairwise covering array, all-nine public route click/reload/history matrix, rapid navigation, Settings Account/Billing responsive browser test, analytics privacy/tenant/target-ownership boundaries, 9.75-second same-ID pending-receipt polling, route-aware SPA deduplication, direct Apps/Products/People list and People-sector UI event wiring, builds, and lint error gate all pass.
- No Strapi code/schema or Local Tunes user-sync file was changed.
- The live `tk2727` pairwise publish is deliberately not marked complete because this run made no live account writes. The harness is concurrency guarded and restore tested, but execution still requires explicit live-write approval/auth storage.
- Visible Chrome UAT remains a manual witness because Chrome control could not initialize in this environment; automated browser evidence is from Playwright Chromium.
- Exact results, fixed defects, residual debt, and manual UAT steps are recorded in `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`.

## Global Constraints

- Work only on branch `codex/profile-settings-tabs` and preserve every unrelated dirty-worktree change.
- Do not change Strapi code or schema. Read-only Strapi inspection is allowed when it is needed to verify event records.
- Do not modify the Local Tunes user-sync files owned by the other session. New analytics routes/services/tests must be isolated in separate files and registered only through the shared route index.
- Redis is not required in this phase. Tests must pass with the currently deployed services.
- Never persist credentials, authorization headers, raw tokens, or the live restore object to Git-tracked files or screenshots.
- `tk2727` is the dedicated UAT account for this plan. Live writes require an in-memory baseline of every writable profile field, an `updatedAt` concurrency check before every write, a `finally` restore, and equality proof after restore.
- Live Playwright uses a separate project with storage state outside the repository and trace/video/network-body capture disabled; artifacts receive an authorization/token redaction scan.
- Do not claim “all combinations” from a smoke test. Report exhaustive values, pairwise live combinations, skipped cases, and blockers separately.
- Any regression discovered in an existing flow receives a failing regression test before implementation changes.

## What Already Exists

- `explorers-earth/src/features/Profile/types/themeTypes.ts` and the Profile constants normalize theme, landing-tab, layout, and category-order values. Reuse them as the canonical test data source.
- `explorers-earth/e2e/profile-theme.spec.ts` already includes a 72-row covering array, live-write guard, restore guard, and deterministic public-profile fixtures.
- `explorers-earth/e2e/profile-editor-polish.spec.ts` and `profile-presentation-visual.spec.ts` already cover Profile tab polish and responsive presentation.
- The category E2E suites already exercise Apps, Books, Games, Guides, Locations, Movies, Music, People, and Products. The current full run proves five suites share one overlay-blocking failure.
- Vitest currently passes 1,035 tests in 134 files. Playwright currently reports 40 passed, 5 failed, and 3 skipped in 3.6 minutes.
- `UsernameValidator`, `TabVisibilityGuard`, and the parent definitions in `PublicRoutes` jointly own public username, visibility, and nested-category resolution. Route rules must be tested at all three seams and through clicked browser navigation.
- The Analytics feature already renders country, traffic-source, recommendation, and UTM views. The missing work is end-to-end event correctness and dashboard reconciliation.

## NOT in Scope

- Strapi collection/schema/plugin code changes: the user explicitly ruled these out.
- Local Tunes user-sync repair: a separate agent/session owns it.
- Redis-backed queues or deduplication: defer until infrastructure exists and measured traffic requires it.
- Reformatting or translating all locale files: unrelated generated-file churn must not be mixed into QA fixes.
- Production-data bulk cleanup: historical events with missing country remain visible as historical quality debt; new UAT events are permanently retained only on the dedicated test account and carry a unique `codex-e2e-<run-id>` marker.
- A redesign of the rich-text editor: preserve user-authored bold, italic, lists, and links; test safe public rendering only.

## Verification Data Flow

```text
Dashboard control
  -> local form state
  -> Save & Publish mutation
      -> authoritative account payload
      -> cache normalization
  -> clean dashboard reload proves persistence
  -> public URL full reload
      -> Earth shell loader
      -> public profile shell
      -> section skeletons while category queries settle
      -> theme/layout/category content
  -> user interaction
      -> Local Tunes analytics boundary
          -> consent gate
          -> client event ID / idempotency receipt
          -> coarse country derivation; raw IP discarded
          -> Strapi event write with UTM + country, no Strapi code change
      -> authenticated owner-scoped/date-scoped analytics read
      -> Analytics dashboard aggregation
  -> exact raw account restore in finally
```

## Coverage Strategy

| Surface | Coverage method | Required evidence |
|---|---|---|
| Theme preset × accent × wallpaper × landing value | All 1,728 controlled states in a new Vitest matrix (6 × 6 × 4 × 12) | Unique rows, exact count, every value, every factor pair, CSS-token assertions |
| Theme/public persistence | 72-row pairwise live matrix plus baseline/restore publishes | Dashboard state, public DOM/style, raw restore equality |
| Recommendation layouts | All 3 layouts in unit/visual tests and every theme at representative breakpoints | Order, card limits, empty/error/loading states |
| Category order | All 9 values and full permutation invariants in pure tests; drag, keyboard, first/middle/last live witnesses | Saved order and matching public order |
| Responsive UI | 320×568, 375×812, 768×1024, 1280×720, 1440×900 | Screenshots, no overlap/clipping, keyboard/focus checks |
| Public routes | Direct load, clicked navigation, reload, back/forward, hidden, unknown, wrong user | Stable URL, content, fallback/redirect, single tracking event |
| Analytics/UTM | Network contract plus backend/dashboard reconciliation | One canonical event per action, fields preserved, eventual aggregate update |

## Requirement-to-Test Ledger

| Requirement | Test owner | Gate |
|---|---|---|
| Profile/Gallery/Appearance tabs, save lifecycle, sticky action, responsive geometry | Existing `profile-editor-polish.spec.ts`; extend only for uncovered failure states | Deterministic Playwright plus visible Chrome witness |
| Six presets × six accents × four wallpapers × twelve landing values | New `themeCombinationMatrix.test.ts`; existing `profile-theme.spec.ts` | 1,728 pure rows plus 72 pairwise live rows |
| Three layouts and nine-category order | Existing presentation unit/visual tests and live matrix | All values pure; first/middle/last drag and keyboard witnesses live |
| Hero/no-hero, avatar, header/footer, rich text, empty/loading/error states | Existing `profile-presentation-visual.spec.ts`; add only missing loader/identity assertions | Mobile and desktop deterministic screenshots plus Chrome UAT |
| Valid, hidden, unknown, nested, reload, and history public routes | `UsernameValidator.test.tsx`, new `TabVisibilityGuard.test.tsx`, new `public-routes.spec.ts` | Unit branches plus clicked/direct E2E for every category and child-route family |
| Category create/edit/validation/scraper/detail/persistence | Existing category spec per domain; add named cases to the owning file | Every category passes; Guides/Locations may no longer be unconditional skips |
| Account/Billing moves and hidden-field preservation | Existing Settings/Profile unit tests plus new Chrome save/reload witnesses | Account and all six address fields persist without profile/theme loss |
| Loader readiness and recovery | Existing visual state matrix plus route/failure E2E | Earth-on-refresh, skeleton-after-shell, no stacked placeholder, retry recovery |
| Consent, five-field UTM, country privacy, idempotency, tenant isolation | Analytics client tests, new Tunes route/service integration tests, new `analytics-tracking.spec.ts` | P0 privacy/isolation tests and action-to-dashboard reconciliation all pass |
| Console, network, accessibility, and performance budgets | Each Playwright suite console/network hook plus final Chrome audit | Zero product console errors; thresholds in Scenario Inventory pass |
| Live-data and artifact safety | Restore/emergency tests, concurrency guard, redaction scan | Exact field equality, no concurrent overwrite, no credential-bearing artifact |

## Scenario Inventory

### Dashboard Profile and Settings

- Three centered icon tabs: Profile, Gallery, Appearance; mouse, touch, Left/Right/Home/End keyboard behavior.
- Profile fields: display name, bio rich text, location, social links, avatar, hero image, default avatar, image viewer, invalid and oversized media.
- Gallery: empty, Instagram-only, Google-only, both sources, existing photos, source error, accordion open/close, right-aligned trigger, mobile horizontal constraints.
- Appearance: six presets, six accents, four wallpaper modes, twelve landing choices, three recommendation layouts, nine category-order entries, handle-only pointer/touch drag behavior, keyboard reordering, horizontal strips on mobile.
- Save & Publish: pristine, dirty, saving, success, 4xx, 5xx, timeout, retry, double-click, tab switch while dirty, navigation away, session expiry, reload persistence, desktop floating/sticky and mobile placement.
- Settings Account/Billing: unchanged values, valid edits, invalid username, duplicate username, cooldown, confirm, cancel, account type, every billing field, network failure, reload persistence, hidden profile/theme/social values preserved.

### Public Profile

- Profile shell with hero selected and with no hero; custom and default avatar; no green avatar ring; no duplicate identity box; invariant header logo and larger footer branding across themes.
- Recommendations, Gallery, and Business top-level tabs remain visible and operable at every breakpoint.
- All Recommendations renders the chosen layout and saved category order with appropriate section padding.
- Partial data, true empty, partial query failure, all-query failure, retry-in-progress, recovery, stale cache plus refetch, malformed optional JSON, and backend caps are distinguishable.
- Rich text preserves supported formatting while sanitizing unsafe markup; links and media detail viewers work with touch, mouse, keyboard, accurate labels, Escape, and focus return.
- Loader contract: Earth loader on every full public-profile refresh until the shell is ready; no fixed minimum duration; section skeletons only after shell readiness; no stacked green placeholder; cached client navigation does not replay the Earth loader.

### Public Route Resolution

- `/:username` loads the primary public profile.
- Each visible supported category route loads and remains stable after direct load and clicked navigation: places, books, guides, music, movies, games, apps, products, and people.
- Valid username plus unknown category redirects to `/:username` without a broken intermediate page.
- Valid username plus hidden/unpublished category falls back to `/:username` and does not issue the disabled category query.
- Unknown username never masquerades as a category and uses the product's existing not-found behavior.
- Case, trailing slash, URL encoding, query parameters, hash, rapid tab switching, reload, back, and forward preserve correct resolution.
- Every successful page or category visit records one canonical view; redirects do not create duplicate category views.

### Category Creation and Content

- Create, edit, delete/cancel, empty validation, duplicate name, long name, scraper success, scraper no-result, scraper error, list item detail, external link, and reload persistence for all supported category dashboards.
- Verify the currently failing shared overlay condition once at the application shell and then rerun Apps, Books, Games, Movies, and Products.
- Verify Places/Locations, Guides, Music, and People remain regression-free after the shared fix.

### Analytics, Country, and UTM

- Event taxonomy: public profile view, category view, recommendation/list click, individual item click, external CTA/link, social link, share, gallery interaction, and any existing business action.
- Required identity fields: profile/account ID, public username, event type, category, entity/list ID when applicable, canonical path, timestamp, referrer, session/correlation ID if the current contract provides one.
- UTM: the current implementation supports only source/medium and must fail the new contract test; the fixed contract covers all five standard fields, encoded values, first-value-wins duplicate keys, empty-value omission, case-sensitive canonical keys, unrelated query parameters, direct share, QR, social, email, referral, and same-session navigation after a UTM landing.
- Country: the current client-side raw-IP flow must fail the privacy test; the fixed Local Tunes boundary covers resolved ISO two-letter country, lookup timeout/429/5xx, localhost/private IP, unknown country, raw-IP discard, and historical events without country.
- Privacy: analytics consent allowed/denied, public visitor logged out, profile owner logged in, and no token/PII leakage in event payloads.
- Correctness: one action creates one client-generated event ID, repeated delivery is idempotent through a Tunes database receipt, rapid double-click behavior matches the intended contract, failed navigation does not create success events, and dashboard totals reconcile after the documented eventual-consistency window.
- Tenant isolation: authenticated owner reads are account- and date-scoped at the Local Tunes backend; a cross-account request is denied and the browser never downloads all accounts' analytics.
- Dashboard states: Earth/page loading if applicable, chart skeleton, empty, partial, error/retry, date filters, country map, traffic sources, top links/lists/items, responsive charts, and accessibility labels/tooltips.

### Failure Injection and Non-Functional Checks

- API 401/403/404/409/429/500, network offline, timeout, malformed JSON, missing optional GraphQL fields, slow 3G, and aborted navigation.
- Console gate: no uncaught exceptions, Apollo missing-field errors, hydration errors, duplicate-key errors, or unhandled promise rejections on the tested path.
- Network gate: no unexpected 4xx/5xx, duplicated category requests, disabled-category requests, leaked auth query parameters, or mixed-content requests.
- Performance: after one cold warm-up, take five warm samples. Public shell p95 must be ≤2.5 s, category navigation p95 ≤1.5 s, publish p95 ≤6 s, analytics dashboard p95 ≤3 s for the test fixture, CLS <0.10, no duplicated category query, and JS heap/listener count may not grow >20% after 25 tab round trips.
- Accessibility: semantic tabs/accordions/buttons, visible focus, logical order, keyboard reordering, modal focus trap/return, labels, contrast, reduced motion, and 200% zoom.

## Test Coverage Diagram

```text
CODE PATHS                                      USER FLOWS
[+] Theme normalization                         [+] Dashboard -> public publish
  + [★★★] valid values                            + [★★★] deterministic fixture render
  + [★★★] malformed/legacy values                 + [GAP -> E2E] live pairwise writes
  + [★★★] unknown-key preservation                 + [GAP -> E2E] exact restore proof
[+] Route validation                            [+] Category navigation
  + [★★★] root username                           + [GAP -> E2E] click/reload/back-forward
  + [★★★] valid/hidden/unknown category            + [GAP -> E2E] no flash/disappearance
  + [★★★] reserved/unknown username                + [GAP -> E2E] one event per resolved view
[+] Profile persistence                         [+] Profile/Settings editing
  + [★★★] success/preservation                    + [★★] happy-path saves
  + [★★★] failure/retry/cancel                     + [GAP -> E2E] timeout/session expiry
[+] Analytics event construction                [+] Analytics reconciliation
  + [★★★] UTM helpers                             + [GAP -> E2E] action -> backend -> chart
  + [GAP] country fallback and consent             + [GAP -> E2E] empty/partial/retry states
[+] Category flows                              [+] Add list/item
  + [★★] nine suite happy paths                   + [REGRESSION -> E2E] overlay blocks five

Current branch-level E2E baseline: 40 passed / 5 failed / 3 skipped.
```

## Failure Modes and Expected User Experience

| Failure | Test | Expected handling |
|---|---|---|
| Auth/onboarding overlay never resolves | Category E2E and real Chrome | Clear retry/logout action; no invisible click interception |
| Profile mutation times out | Save & Publish E2E | Saving ends, error shown, dirty state retained, retry safe |
| One category query fails | Public mocked E2E | Other categories remain; failed section offers retry |
| All category queries fail | Public mocked E2E | Stable shell and one clear retry state; no green placeholder flash |
| Invalid/hidden category URL | Route E2E | Replace/fallback to username root without duplicate analytics |
| Country lookup fails | Tunes service unit/E2E | Event remains valid with explicit unknown country, no raw IP persisted, and dashboard explains unavailable data |
| Analytics write is delayed | Reconciliation E2E | Bounded polling and pending evidence; no false zero or duplicate retry |
| Live matrix aborts | Guard test | `finally` restores exact raw `social_media`; emergency cleanup is single-use |
| Cross-account analytics read | Tunes integration test | 403/empty result; no other account rows reach the browser |
| Committed analytics write times out | Idempotency integration test | Same client event ID returns the original receipt and creates no duplicate event |

## Worktree and Execution Order

Testing is sequential in the current worktree because the Vite server, authenticated account, Playwright output, and live restore state are shared. No parallel agent or second worktree may publish to the same account during the live matrix.

### Task 1: Freeze Baseline and Failure Evidence

**Files:**
- Read: `explorers-earth/test-results/*/error-context.md`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

- [ ] Record branch, HEAD, dirty-state fingerprint, environment URLs, browser version, and service reachability without printing secrets.
- [ ] Save per-file staged and unstaged patch hashes plus an ownership allowlist for `UsernameValidator`, `TabVisibilityGuard`, `PublicRoutes`, analytics client/service, and generated public files before any edit.
- [ ] Record the completed baseline: unit 1,035/1,035; Playwright 40 passed, 5 failed, 3 skipped.
- [ ] Capture one canonical overlay failure and prove the other four share the same intercepting DOM layer.
- [ ] Record all skipped-test reasons and classify each as intentional approval gate, unavailable service, or missing coverage.

### Task 2: Re-run Static and Deterministic Test Gates

**Files:**
- Test: `explorers-earth/src/**/*.test.ts(x)`
- Test: `explorers-earth/e2e/profile-*.spec.ts`

- [ ] Run `npm --prefix explorers-earth run test:unit`; expect every test to pass with no unhandled rejection.
- [ ] Run `npm --prefix explorers-earth exec tsc -b`; expect exit 0.
- [ ] Run `npm --prefix explorers-earth run build`; expect exit 0 and no missing environment-variable crash.
- [ ] Hash `public/sitemap.xml` and `public/robots.txt` before and after the build; classify their known generator rewrite separately and reject any other unexpected build mutation.
- [ ] Run the route, Apollo cache, Profile save, Settings placement, theme, recommendation presentation, UTM helper, and analytics-focused Vitest files separately for attributable evidence.
- [ ] Run deterministic profile Playwright suites and attach screenshots/traces for any new failure.

### Task 3: Write Regression Tests for Observed Gaps Before Fixing

**Files:**
- Create: `explorers-earth/src/components/__tests__/appReadinessOverlay.regression-1.test.tsx` or the closest existing shell-test location after tracing ownership.
- Create: `explorers-earth/e2e/public-routes.spec.ts`
- Create: `explorers-earth/e2e/analytics-tracking.spec.ts`
- Create: `explorers-earth/src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts`
- Create: `explorers-earth/src/routes/__tests__/TabVisibilityGuard.test.tsx`
- Create: `tunes/server/routes/__tests__/explorersAnalyticsRoutes.test.ts`

- [ ] Trace the overlay owner and write a failing test that reproduces authenticated readiness completing while the blocking layer remains mounted.
- [ ] Write failing route tests for visible category, hidden category, unknown category, redirect analytics dedupe, clicked navigation, reload, and history.
- [ ] Write failing nested-route tests for Places maps and every category list/detail child route while its parent visibility flag is disabled.
- [ ] Write the missing 1,728-row Cartesian test from exported canonical constants; assert exact count, uniqueness, every value, every factor pair, and token normalization.
- [ ] Write failing analytics tests for consent-before-IP, all five UTM fields, raw-IP discard, country unavailable, client event idempotency, cross-account denial, and action-to-dashboard reconciliation.
- [ ] Run only each new file and preserve the red result as regression evidence.

### Task 4: Diagnose and Repair Shared Ship Blockers with TDD

**Files:** Determined by the failing regression trace. Expected owners are the application-readiness shell, `UsernameValidator.tsx`, `TabVisibilityGuard.tsx`, `PublicRoutes.tsx`, `urlHelpers.ts`, `analyticsService.ts`, plus new isolated `tunes/server/routes/explorersAnalyticsRoutes.ts`, `tunes/server/services/explorers-analytics-service.ts`, a Tunes idempotency receipt table/migration, and their new tests.

- [ ] Fix the shared overlay lifecycle once; rerun its unit regression and all five affected category suites.
- [ ] Align deterministic Apollo fixtures/cache policies so missing-field console errors are not accepted as test noise.
- [ ] Implement the settled route contract: any unknown or hidden category for a valid username replaces to `/:username`; guard all nested category routes at the parent boundary; rerun unit route tests and real clicked-navigation E2E.
- [ ] Add the isolated Local Tunes analytics boundary: consent gate, five-field UTM contract, coarse-country derivation without raw-IP persistence, client event ID/idempotency receipt, and owner/date-scoped reads; keep Strapi code/schema unchanged.
- [ ] Replace the browser's unscoped `limit: -1` analytics read and client-side raw-IP country resolution with the authenticated Tunes endpoint; prove cross-account denial.
- [ ] After each fix, run adjacent passing suites to catch blast-radius regressions.

### Task 5: Execute Dashboard-to-Public Appearance Matrix

**Files:**
- Test: `explorers-earth/e2e/profile-theme.spec.ts`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

- [ ] Prove all 1,728 controlled states and every declared factor pair in the new pure test.
- [ ] Prove all three layouts, all nine category IDs, malformed/legacy defaults, and permutation invariants.
- [ ] Capture the live account's exact raw baseline in memory and verify content preconditions.
- [ ] Measure three complete witness rows, set the matrix timeout from measured p95 plus a 30% reserve and a protected restore reserve, use exponential backoff for 429s, and abort after two consecutive row failures.
- [ ] For every row, verify dashboard persistence and authoritative public DOM/style/content after clean reload.
- [ ] Restore in `finally`; reload dashboard and public profile; prove exact raw equality.

### Task 6: Execute Real-Chrome Responsive UAT

**Files:**
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`
- Evidence: `.gstack/qa-reports/screenshots/2026-08-24-*`

- [ ] In the logged-in Chrome session, verify Profile, Gallery, Appearance, Settings Account, and Settings Billing at desktop and mobile sizes.
- [ ] Verify mobile horizontal strips, drag/touch reorder, keyboard reorder, rounded accordions, right-aligned Gallery source controls, and sticky/floating Save & Publish.
- [ ] Snapshot every writable profile field and `updatedAt`; publish representative hero/no-hero, custom/default avatar, light/dark, each wallpaper, each layout, category-order, Gallery, and Business witnesses inside a second visible-Chrome `try/finally` restore guard.
- [ ] Before every visible-Chrome write, re-read `updatedAt` and abort on concurrent modification; after the batch, prove equality for every snapshotted field.
- [ ] Open the public profile after each witness and verify header/footer branding, no identity box, no green avatar ring, tabs, padding, empty states, loaders, content, and accessibility.
- [ ] Verify full refresh, client navigation, reload, back, forward, rapid tab switching, slow network, offline/retry, and session-expired behavior.

### Task 7: Execute Analytics and UTM Reconciliation

**Files:**
- Test: `explorers-earth/e2e/analytics-tracking.spec.ts`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

- [ ] Snapshot current analytics totals and event timestamps before generating test actions.
- [ ] Generate one uniquely identifiable action for every tracked public interaction and capture its network request/response.
- [ ] Repeat with the UTM, referrer, consent, country-success, and country-failure scenarios from the inventory.
- [ ] Inspect the existing Strapi event collection read-only when needed and confirm the tagged UAT payload without changing schema or server code; test records on `tk2727` are retained with the run marker by design.
- [ ] Poll the Analytics dashboard within a documented bound; reconcile per-event rows, totals, country, sources, lists/items, and date filters.
- [ ] Verify no duplicate event on redirect, retry, rapid click, reload, or browser history unless the product contract explicitly counts a new view.
- [ ] Verify historical events without country render as unavailable/unknown instead of breaking charts.

### Task 8: Final Regression, Evidence, and Restore Gate

**Files:**
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`
- Update: `.gstack/qa-reports/baseline.json`

- [ ] Rerun `npm --prefix explorers-earth run test:unit`, typecheck, build, and `npm --prefix explorers-earth run test:e2e`.
- [ ] Rerun every previously failing test twice to detect flakes.
- [ ] Confirm the live account profile baseline is restored; record the permanent tagged analytics UAT events as expected test-account data rather than a cleanup failure.
- [ ] Review console/network logs and classify third-party Google Maps or Local Tunes issues separately from product regressions.
- [ ] Record exact pass/fail/skip counts, coverage claims, screenshots/traces, restore proof, and ship blockers.
- [ ] Review `git diff` and `git status` to prove unrelated user and Local Tunes changes were not overwritten.
- [ ] Scan Playwright storage state, reports, traces, screenshots, videos, and test-results for bearer tokens, authorization headers, JWT-like strings, and the supplied public token; block artifact publication on any match.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2h / Codex: ~20min)** — App readiness — add a regression for the blocking overlay and fix its lifecycle once.
  - Surfaced by: Full Playwright baseline; five category suites time out behind the same `z-[160]` overlay.
  - Verify: affected unit regression plus Apps, Books, Games, Movies, and Products Playwright suites.
- [ ] **T2 (P1, human: ~4h / Codex: ~40min)** — Public routing — cover and repair valid, hidden, unknown, nested, and history navigation across all three route owners.
  - Surfaced by: User-reported category links show content briefly and then “can't load this section”; current E2E inventory has no dedicated public-route suite.
  - Verify: route unit tests plus direct/click/reload/back-forward E2E.
- [ ] **T3 (P1, human: ~3d / Codex: ~4h)** — Analytics — add the isolated Local Tunes privacy/idempotency/scoping boundary and end-to-end reconciliation coverage.
  - Surfaced by: Browser currently persists raw IP, downloads unscoped analytics, ignores consent for custom events, and supports only two UTM fields.
  - Verify: Tunes unit/integration suite, cross-account denial, network payload assertions, Strapi read-only record check, dashboard aggregate reconciliation.
- [ ] **T4 (P2, human: ~2h / Codex: ~20min)** — Apollo fixtures — remove missing-field cache errors from deterministic profile tests.
  - Surfaced by: Full Playwright run emits repeated Apollo `message:13` missing-field errors for account and category fixture objects.
  - Verify: profile E2E console gate and Apollo cache unit tests.
- [ ] **T5 (P2, human: ~1d / Codex: ~2h)** — Live UAT — execute the 72-row pairwise dashboard/public matrix and prove restore equality.
  - Surfaced by: Three Playwright tests are skipped, including the approved live-write matrix.
  - Verify: computed publish count, per-row result ledger, `finally` restore, dashboard/public clean reload equality.
- [ ] **T6 (P1, human: ~2h / Codex: ~20min)** — Appearance coverage — add the missing exact 1,728-row Cartesian test generated from canonical constants.
  - Surfaced by: Current tests prove individual values and pair coverage but do not execute the claimed full Cartesian state space.
  - Verify: exact count, uniqueness, every factor value/pair, normalization, and CSS-token assertions.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | Not required | Verification scope follows prior product decisions |
| Codex Review | `/codex review` | Independent second opinion | 1 | ABSORBED | 18 findings; valid findings folded into this revision |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 18 reviewed gaps, 0 unresolved decisions after applying prior user choices |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 prior | Context only | Existing responsive/theme plans define the visual contract |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | Not required | No new developer-facing API or distribution artifact |

- **ARCHITECTURE:** Layered deterministic, mocked, live-write, and real-Chrome gates avoid unsafe Cartesian writes. Local Tunes owns consent, privacy, idempotency, and scoped analytics access while Strapi code remains unchanged.
- **CODE QUALITY:** Shared overlay ownership, three explicit route owners, canonical analytics construction, and Apollo fixture alignment prevent duplicated fixes and hidden bypasses.
- **TESTS:** Dedicated public-route, nested-visibility, analytics, and exact 1,728-row appearance tests are ship blockers; all observed regressions require red tests first.
- **PERFORMANCE:** Keep live writes serial with measured p95 timeouts, 429 backoff, abort/restore reserves, and concrete UI/request/memory budgets.
- **CODEX:** Corrected two P0 analytics risks, route ownership, Cartesian count, live restore/artifact safety, dirty-tree build mutation, and executable scenario mapping.
- **CROSS-MODEL:** Both reviews agree on layered coverage and pairwise live writes; the outside review tightened privacy, tenant isolation, exact matrix count, and restore boundaries.
- **VERDICT:** ENG CLEARED — execute in the listed order; current baseline is not ship-ready because 5 E2E tests fail and 3 are skipped.

NO UNRESOLVED DECISIONS
