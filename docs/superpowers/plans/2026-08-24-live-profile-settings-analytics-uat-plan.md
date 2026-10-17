# Live Profile, Settings, and Analytics UAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the real `tk2727` development account accepts the guarded appearance/settings matrix, renders every affected public route correctly, records consented analytics with correct attribution and ownership, and returns to its exact baseline before a pull request is created.

**Architecture:** Run the existing deterministic suites first, then authenticate a dedicated Playwright session whose storage state lives outside the repository. The live profile matrix snapshots every restorable account field in memory, checks `updatedAt` before each mutation, publishes 72 pairwise rows plus sentinel/restore writes, verifies the public page after every row, and restores in `finally`. Analytics UAT runs in a separate unauthenticated visitor context so owner-view suppression does not hide events, while the authenticated dashboard context polls and reconciles the uniquely tagged results.

**Tech Stack:** React 18, TypeScript, Vite, Apollo Client, Strapi GraphQL, Local Tunes analytics API, Playwright Chromium, Vitest, PowerShell.

**Spec:** `docs/superpowers/plans/2026-08-24-dashboard-public-profile-analytics-e2e-verification-plan.md`

## Global Constraints

- Work only on `codex/profile-settings-tabs`; never merge, force-push, or create a PR before every gate below is clear.
- Do not change Strapi code/schema or any Local Tunes user-sync file.
- Use only the `tk2727` development/UAT account. Abort if the authenticated username or public username differs.
- Keep authentication storage under `$env:TEMP\explorers-earth-live-uat`; never print, inspect, stage, or commit it.
- Before every profile write, compare the authoritative account `updatedAt` with the version returned by the preceding write. Any mismatch aborts all later writes and forbids emergency restore.
- After the first mutation, every exit path must execute the exact restore guard. Completion requires deep equality for `social_media` and the full restorable account snapshot.
- Analytics UAT events are intentionally retained and must use a unique `codex-live-uat-<timestamp>` campaign marker. Do not attempt destructive cleanup.
- Trace, screenshot, video, and network-body capture stay disabled for authenticated/live-write contexts.
- A defect receives a failing regression test before a code fix. After a fix, rerun its focused test and the complete relevant suite.

---

### Task 1: Read-only live preflight and isolation gate

**Files:**
- Read: `explorers-earth/playwright.config.ts`
- Read: `explorers-earth/e2e/profile-theme.spec.ts`
- Update after execution: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

**Interfaces:**
- Consumes: pushed branch `origin/codex/profile-settings-tabs` at `ed73f66`.
- Produces: a preflight ledger containing branch SHA, frontend health, backend analytics health, username, public-route readiness, and a zero-user-sync diff assertion.

- [x] **Step 1: Confirm branch isolation and remote parity**

  Run `git rev-parse HEAD`, `git rev-parse '@{u}'`, `git status --short --branch`, and a case-insensitive `user.?sync` scan over `git diff --name-only HEAD`. Continue only when the SHAs match and no application/user-sync changes are present.

- [x] **Step 2: Confirm service readiness without writing**

  Require HTTP 200 from `http://localhost:5173/login`, `http://localhost:5173/tk2727`, and the configured Local Tunes health/readiness endpoint. Record status codes only; never print tokens or response bodies containing account data.

- [x] **Step 3: Reprove restore and covering-array guards**

  Run:

  ```powershell
  npx playwright test e2e/profile-theme.spec.ts `
    --grep "restore guard|covering array dry run" `
    --reporter=line
  ```

  Expected: four restore/covering tests pass, the matrix reports 72 rows, 74 normal publishes, and one optional emergency publish.

### Task 2: Create an isolated authenticated UAT session

**Files:**
- Temporary only: `$env:TEMP\explorers-earth-live-uat\storage-state.json`
- No repository file is created or modified.

**Interfaces:**
- Consumes: a user-completed login at `http://localhost:5173/login`.
- Produces: a temporary Playwright storage-state path passed through `E2E_PROFILE_STORAGE_STATE`.

- [x] **Step 1: Create and validate the exact temporary directory**

  Resolve `$env:TEMP\explorers-earth-live-uat`, verify it is outside the repository root, create it if absent, and define the storage path without echoing its contents.

- [x] **Step 2: Launch the headed login capture**

  From `explorers-earth`, run:

  ```powershell
  npx playwright codegen `
    --save-storage="$env:TEMP\explorers-earth-live-uat\storage-state.json" `
    http://localhost:5173/login
  ```

  The user signs in to `tk2727`, opens `/profile`, confirms the correct account, and closes the codegen browser so the state is saved.

- [x] **Step 3: Validate authentication without exposing state**

  Run the live profile test with `E2E_PROFILE_LIVE_WRITES` unset and the temporary storage path supplied. Confirm the test is skipped by the write-approval gate rather than redirected to `/login`; if authentication is expired, repeat Step 2.

### Task 3: Execute the guarded 72-row live profile matrix

**Files:**
- Execute: `explorers-earth/e2e/profile-theme.spec.ts:714`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

**Interfaces:**
- Consumes: authenticated temporary state, username `tk2727`, 72-row covering array, full baseline mutation template.
- Produces: per-row dashboard persistence/public-render evidence and exact final restore equality.

- [x] **Step 1: Set process-scoped live variables**

  Set `E2E_PROFILE_USERNAME=tk2727`, `E2E_PROFILE_STORAGE_STATE` to the temporary file, and `E2E_PROFILE_LIVE_WRITES=1` only for the single Playwright command. Do not persist these values in `.env` files.

- [x] **Step 2: Run the approved live-write batches serially**

  ```powershell
  $env:E2E_PROFILE_USERNAME = 'tk2727'
  $env:E2E_PROFILE_STORAGE_STATE = "$env:TEMP\explorers-earth-live-uat\storage-state.json"
  $env:E2E_PROFILE_LIVE_WRITES = '1'
  npx playwright test e2e/profile-theme.spec.ts `
    --grep "publishes the pairwise matrix" `
    --workers=1 `
    --reporter=line
  Remove-Item Env:E2E_PROFILE_USERNAME,Env:E2E_PROFILE_STORAGE_STATE,Env:E2E_PROFILE_LIVE_WRITES
  ```

  Expected: sentinel write succeeds; every row preserves its returned `updatedAt`; public preset, accent, wallpaper, first view, layout, category order, Gallery and Business tab expectations pass; exact restore passes in `finally`.

- [x] **Step 3: Run an independent post-restore equality witness**

  Reopen `/profile` and `/tk2727` with the authenticated state, verify the baseline initial tab/layout/order and authoritative snapshot, and record that no emergency restore was required. If equality fails, stop immediately and do not create a PR.

### Task 4: Live responsive dashboard and public-route UAT

**Files:**
- Execute against: `explorers-earth/src/pages/Profile.tsx`, `explorers-earth/src/features/Settings/Settings.tsx`, `explorers-earth/src/routes/PublicRoutes.tsx`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

**Interfaces:**
- Consumes: restored live baseline and authenticated browser session.
- Produces: viewport/route checklist with console and failed-response evidence.

- [x] **Step 1: Verify dashboard surfaces at 375×812 and 1440×900**

  Check Profile, Gallery, Appearance, Settings Account, and Settings Billing. Verify horizontal strips, whole-card drag handles, sticky Save & Publish, rounded accordions, right-aligned Gallery source controls, keyboard focus, and absence of horizontal overflow.

- [x] **Step 2: Verify all public routes using UI navigation and history**

  On `/tk2727`, visit Recommendations/Places, Guides, Movies, Music, Books, Games, Apps, Products, People, Gallery, and Business when available. For each supported category, test click, direct reload, Back, Forward, and rapid navigation; hidden/unknown categories must replace to `/tk2727`.

- [x] **Step 3: Verify public theme invariants**

  At phone and desktop widths, verify no identity box, no accent avatar ring, accessible custom/default avatar viewer, visible tabs with and without hero media, content padding, invariant header/footer branding, and controlled loading/empty/error/retry states.

### Task 5: Execute live analytics and UTM reconciliation

**Files:**
- Execute: `explorers-earth/e2e/analytics.spec.ts`
- Read: `explorers-earth/src/services/analyticsService.ts`
- Read: `tunes/server/routes/explorersAnalyticsRoutes.ts`
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`

**Interfaces:**
- Consumes: unauthenticated visitor context with analytics consent, authenticated owner dashboard context, unique campaign marker.
- Produces: committed event IDs and dashboard reconciliation for views, list/item clicks, shares, UTM/referrer/country fields, and deduplication.

- [x] **Step 1: Snapshot owner analytics totals read-only**

  Record current total views/clicks and the latest event timestamp for `tk2727` without copying raw event bodies into artifacts.

- [x] **Step 2: Generate uniquely tagged visitor actions**

  In a clean unauthenticated context, grant analytics consent and open:

  ```text
  /tk2727?utm_source=codex_live_uat&utm_medium=automation&utm_campaign=codex-live-uat-<timestamp>&utm_content=profile
  ```

  Then use visible UI controls to open one content-bearing category list, one item, and Share. Repeat one rapid click and one Back/Forward transition to prove idempotent/session behavior. Capture only status, event ID, page, element, canonical path, and ownership IDs from the analytics requests.

- [ ] **Step 3: Reconcile backend and dashboard within a bounded window — BLOCKED: Strapi token lacks analytics create permission**

  Poll for at most 90 seconds. Require committed responses, one event per intended semantic action, correct account/list/item ownership, all five UTM fields when supplied, country present or explicitly unknown, no raw IP/token/full-referrer path, and matching dashboard date/source/content totals.

- [ ] **Step 4: Verify owner suppression and consent denial**

  Confirm an authenticated `tk2727` owner view produces no event and a clean visitor without analytics consent produces no event. These checks must not alter profile settings.

### Task 6: Final regression, security scan, branch update, and PR gate

**Files:**
- Update: `docs/superpowers/reports/2026-08-24-dashboard-public-analytics-qa.md`
- Update: this plan's execution-status section/check boxes.

**Interfaces:**
- Consumes: restored account equality, live analytics reconciliation, zero unresolved P1/P2 defects.
- Produces: one reviewed commit pushed to `codex/profile-settings-tabs`, followed by a PR only when all required gates pass.

- [ ] **Step 1: Run fresh complete verification**

  Run frontend 1,122+ unit tests, backend 113+ unit tests, frontend/backend production builds, frontend lint error gate, and all 53 Playwright tests. The normal suite must report 52 passed, one intentional live-write skip, and zero failures after the separate live run.

- [ ] **Step 2: Scan artifacts and Git scope**

  Prove no auth state, token, JWT-like string, live baseline, `.env`, user-sync path, trace, screenshot, video, or network body is tracked. Delete only the validated temporary UAT directory after the run; preserve unrelated local agent artifacts.

- [ ] **Step 3: Review and publish the UAT evidence**

  Update the QA report with exact live publish count, duration, restore result, analytics marker/result, test counts, browser surface, defects/fixes, and residual limitations. Commit only plan/report or regression-fix files, push without force, and verify local/remote SHA equality.

- [ ] **Step 4: Create the PR only if the ship gate is clear**

  Create a PR from `codex/profile-settings-tabs` to the repository's detected default branch. The PR body must include scope, live-write/restore proof, analytics reconciliation, exact automated counts, the intentional skip explanation, no-Strapi/no-user-sync statement, performance follow-ups, and manual reviewer UAT steps. If any live restore, analytics reconciliation, or regression gate fails, do not create the PR.

## Self-review

- Spec coverage: account mutation combinations, Settings/public responsiveness, every public route, analytics consent/UTM/country/ownership/deduplication, restore, isolation, security scan, and PR gating each have an executable task.
- Safety: authentication stays outside Git; every write is version-guarded; restore is mandatory; analytics events are explicitly retained rather than destructively cleaned up.
- Type/contract consistency: the environment variables and test title exactly match `profile-theme.spec.ts`; expected 72 matrix rows and 74 normal publishes match the deterministic budget test.
- No unresolved implementation placeholders remain. Login is the only expected user interaction.
