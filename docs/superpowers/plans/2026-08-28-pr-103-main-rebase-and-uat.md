# PR #103 Main Rebase and UAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebase PR #103 onto the current `origin/main`, retain all profile, appearance, public-route, and analytics improvements, preserve the newer Music/user-sync/deployment work from main, and prove the result through code review, automated tests, and live local UI UAT before updating the PR.

**Architecture:** Perform the history rewrite only inside the dedicated temporary worktree and never modify the user's dirty original checkout. Resolve conflicts by subsystem ownership: current main owns Music, user sync, authentication, and deployment architecture; PR #103 owns profile editor, public profile/category routing, and analytics behavior; shared files are manually integrated and tested from both sides. Update the remote feature branch only with an exact `--force-with-lease` after all local gates pass.

**Tech Stack:** Git worktrees and rebase, React 18, TypeScript, Vite, Vitest, Playwright, Apollo Client, Express, Drizzle, Strapi REST API, GitHub Actions.

**Spec:** `docs/superpowers/plans/2026-08-24-dashboard-public-profile-analytics-e2e-verification-plan.md`, `docs/superpowers/plans/2026-08-24-live-profile-settings-analytics-uat-plan.md`, `docs/superpowers/plans/2026-08-20-theme-appearance-exhaustive-qa-plan.md`

## Global Constraints

- Work only in `C:\Users\TK\.config\superpowers\worktrees\explorers.earth-main\profile-settings-tabs-rebase-20260828` on temporary branch `codex/profile-settings-tabs-rebase-20260828` until the remote update step.
- Preserve the user's dirty original checkout and its unrelated Music/user-sync artifacts without staging, editing, moving, or deleting them.
- Treat `origin/main` commit `9284a5d` or a later explicitly re-audited main commit as authoritative for Music, user sync, authentication, deployment, and infrastructure.
- Treat PR #103 commit `4cd5ec5` as the pre-rebase behavior baseline for profile settings, themes, public profile/category routing, analytics, and their tests.
- Do not change Strapi application code or delete/rotate Strapi API tokens in this plan.
- Do not merge PR #103. The deliverable is an updated, reviewed, green PR branch plus a UAT report.
- Never use an unguarded force push. Populate `$auditedRemoteSha` from `git ls-remote` and use it in the exact lease argument after rechecking the remote SHA.
- For every behavior change required during conflict resolution, first reproduce the failing test or add a focused regression test, then implement the minimum repair and rerun that test.

---

### Task 1: Freeze the Rebase Baseline and Conflict Contract

**Files:**
- Modify: `docs/superpowers/plans/2026-08-28-pr-103-main-rebase-and-uat.md`
- Inspect: `.github/workflows/*.yml`
- Inspect: `explorers-earth/src/features/Profile/**`
- Inspect: `explorers-earth/src/features/PublicHome/**`
- Inspect: `explorers-earth/src/pages/public/**`
- Inspect: `explorers-earth/src/features/Analytics/**`
- Inspect: `tunes/server/**`

**Interfaces:**
- Consumes: local PR baseline `4cd5ec5`, current main baseline `9284a5d`, and remote feature ref `origin/codex/profile-settings-tabs`.
- Produces: immutable recorded SHAs, an exact conflict inventory, and subsystem ownership rules used by every later task.

- [ ] **Step 1: Record the exact safety refs**

Run:

```powershell
git rev-parse HEAD
git rev-parse origin/main
git rev-parse origin/codex/profile-settings-tabs
git merge-base HEAD origin/main
git status --short --branch
git worktree list --porcelain
```

Expected: the temporary worktree is clean; `HEAD` and the remote feature ref are `4cd5ec5`; `origin/main` is `9284a5d` unless a newer main commit is deliberately adopted and documented.

- [ ] **Step 2: Save a local recovery ref without changing either checked-out branch**

Run:

```powershell
git branch codex/profile-settings-tabs-pre-rebase-20260828 4cd5ec5
git show-ref --verify refs/heads/codex/profile-settings-tabs-pre-rebase-20260828
```

Expected: the recovery branch resolves exactly to `4cd5ec5`.

- [ ] **Step 3: Capture the complete conflict ledger read-only**

Run:

```powershell
git merge-tree --write-tree HEAD origin/main 2>&1 | Select-String 'CONFLICT'
```

Expected: conflicts include workflows/deployment, shared profile/public route files, locale resources, Apollo cache, and Tunes server wiring; the command leaves the worktree clean.

- [ ] **Step 4: Apply the ownership contract before resolving any conflict**

Use these exact rules:

```text
CURRENT MAIN WINS: Music UI/API/E2E, user sync, auth, server bootstrap, deployment topology.
PR #103 WINS: profile editor tabs/settings, appearance/theme controls, public profile category routing, analytics semantics and focused tests.
MANUAL COMBINATION: shared profile/public components, route guards, Apollo cache, CI jobs, Tunes route registration, and i18n resources.
I18N RULE: preserve current-main locale documents, add only missing PR keys, then run both i18n checks.
WORKFLOW RULE: preserve current-main workflow structure and permissions; add only still-required analytics publisher secret/env wiring.
```

Expected: every conflict can be classified under exactly one rule; ambiguous files are treated as manual combination.

- [ ] **Step 5: Commit this reviewed execution plan**

Run:

```powershell
git add docs/superpowers/plans/2026-08-28-pr-103-main-rebase-and-uat.md
git commit -m "docs: plan PR 103 main rebase and UAT"
```

Expected: one documentation-only commit and a clean worktree.

### Task 2: Rebase and Resolve by Subsystem Ownership

**Files:**
- Modify on conflict: `.github/workflows/ci.yml`
- Modify on conflict: `.github/workflows/tunes-deploy.yml`
- Modify on conflict: `.github/workflows/tunes.yml`
- Modify on conflict: `docker-compose.yml`
- Modify on conflict: `explorers-earth/e2e/{books,movies,music}.spec.ts`
- Modify on conflict: `explorers-earth/e2e/setup/auth.ts`
- Modify on conflict: `explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts`
- Modify on conflict: `explorers-earth/src/features/PublicHome/components/{ProfileRecommendationsTab,PublicProfile}.tsx`
- Modify on conflict: `explorers-earth/src/features/Settings/Settings.tsx`
- Modify on conflict: `explorers-earth/src/i18n/resources/*.json`
- Modify on conflict: `explorers-earth/src/lib/apolloCache.ts`
- Modify on conflict: `explorers-earth/src/pages/Profile.tsx`
- Modify on conflict: `explorers-earth/src/pages/public/PublicMusic.tsx`
- Modify on conflict: `explorers-earth/src/routes/validators/TabVisibilityGuard.tsx`
- Modify on conflict: `tunes/docker-compose.yml`
- Modify on conflict: `tunes/server/{app,index}.ts`
- Modify on conflict: `tunes/server/routes/index.ts`

**Interfaces:**
- Consumes: Task 1 recovery ref and conflict ownership contract.
- Produces: a clean branch based on current main with the intended PR #103 behavior retained.

- [ ] **Step 1: Start the rebase with editor prompts disabled**

Run:

```powershell
$env:GIT_EDITOR='true'
git rebase origin/main
```

Expected: Git either completes or stops at the first explicit conflict; it never opens an interactive editor.

- [ ] **Step 2: Drop the cancelling historical documentation pair when encountered**

The branch contains `ec7ed79` (Music provisioning design) and `e6f2a0c` (its exact revert). If either conflicts during replay, verify the pair cancels with:

```powershell
git diff ec7ed79^ e6f2a0c -- docs
```

Expected: no retained net documentation change from that pair. Use `git rebase --skip` only for those cancelling commits, never for a profile, routing, analytics, or test commit.

- [ ] **Step 3: Resolve current-main-owned conflicts from the rebased base**

For Music, user-sync, auth, and deployment architecture, begin from the current-main side shown by:

```powershell
$conflictedPaths = git diff --name-only --diff-filter=U
foreach ($conflictedPath in $conflictedPaths) {
  git show "origin/main:$conflictedPath"
  git show "REBASE_HEAD:$conflictedPath"
}
```

Expected: the resulting files retain current main's Music dashboard, sync services, server bootstrap, workflow permissions, and deployment layout. Analytics publisher wiring may be manually re-added only if Task 4 tests require it.

- [ ] **Step 4: Resolve PR-owned profile, public-route, and analytics conflicts semantically**

Compare the pre-rebase behavior baseline with current main:

```powershell
git diff origin/main...codex/profile-settings-tabs-pre-rebase-20260828 -- explorers-earth/src/features/Profile explorers-earth/src/features/PublicHome explorers-earth/src/pages/Profile.tsx explorers-earth/src/pages/public explorers-earth/src/routes explorers-earth/src/features/Analytics tunes/server/routes
```

Expected: keep profile icon tabs, Settings account relocation, theme/appearance controls and reordering, valid category navigation, invalid-category fallback to `/:username`, canonical analytics paths, consent/privacy behavior, and publisher-token server isolation.

- [ ] **Step 5: Resolve locale conflicts without replacing main's locale documents**

For `en.json`, retain both main keys and PR-specific keys. Run the repository sync tool to propagate the canonical key structure:

```powershell
npm run i18n:sync --prefix explorers-earth
npm run i18n:check --prefix explorers-earth
```

Expected: sync changes only locale key parity/order required by the repository and the check exits 0.

- [ ] **Step 6: Continue one commit at a time and scan after each resolution**

Run after every stop:

```powershell
git diff --check
$unresolvedPaths = git diff --name-only --diff-filter=U
if ($unresolvedPaths) { throw "Resolve these paths before continuing: $unresolvedPaths" }
$resolvedPaths = git diff --name-only
git add -- $resolvedPaths
$env:GIT_EDITOR='true'
git rebase --continue
```

Expected: no whitespace errors, no unresolved paths before continue, and eventually a completed rebase with a clean index.

- [ ] **Step 7: Prove no conflict markers remain**

Run:

```powershell
rg -n '^(<<<<<<<|=======|>>>>>>>)' . --glob '!node_modules/**' --glob '!package-lock.json'
git status --short --branch
git merge-base --is-ancestor origin/main HEAD
```

Expected: `rg` returns no matches, status is clean, and main is an ancestor of `HEAD`.

### Task 3: Review the Rebased Change Set Against Both Baselines

**Files:**
- Inspect: every path in `git diff --name-status origin/main...HEAD`
- Test: `explorers-earth/src/**/*.test.{ts,tsx}`
- Test: `explorers-earth/e2e/**/*.spec.ts`
- Test: `tunes/server/**/*.test.ts`

**Interfaces:**
- Consumes: clean rebased history from Task 2.
- Produces: a reviewed feature inventory and focused regression tests for any semantic loss found during rebase.

- [ ] **Step 1: Compare old and rebased patch series**

Run:

```powershell
git range-diff origin/main...codex/profile-settings-tabs-pre-rebase-20260828 origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Expected: intentional feature commits remain recognizable; the obsolete merge commit and cancelling documentation pair need not remain.

- [ ] **Step 2: Audit for regressions in current-main-owned areas**

Run:

```powershell
git diff origin/main...HEAD -- explorers-earth/src/features/Music explorers-earth/src/pages/public/PublicMusic.tsx tunes/server/services tunes/server/routes/music.ts .github/workflows docker-compose.yml tunes/docker-compose.yml
```

Expected: any differences are limited to necessary shared integration and tests; no current-main Music, user-sync, auth, or deployment capability is removed.

- [ ] **Step 3: Audit the complete PR-owned feature inventory**

Verify the diff still contains each behavior:

```text
Dashboard Profile: centered icon tabs for Profile, Gallery, Appearance; account/billing moved to Settings.
Appearance: theme selection, responsive horizontal overflow, full-card drag/drop plus keyboard ordering, save/publish state.
Public profile: mobile hero/no-hero states, visible tabs, category padding, avatar viewer, stable footer/header branding, empty/loading/error states.
Routes: every published category route loads; invalid/unpublished category paths redirect to the valid username root without analytics duplication.
Analytics: consent gating, UTM capture, canonical paths, privacy-safe referrer handling, item/list/category clicks, country fallback, dashboard range/aggregation handling.
```

Expected: each item maps to implementation and at least one automated or UAT assertion.

- [ ] **Step 4: Add a failing regression test for every missing behavior before repairing it**

Place tests beside the owning unit or in the matching Playwright spec. Run only the new test first:

Run the exact newly added test by substituting its committed file path and literal test title into this command before execution. For the route fallback regression, use:

```powershell
npm exec --prefix explorers-earth -- vitest run src/routes/validators/TabVisibilityGuard.test.tsx -t "redirects an invalid category to the username root"
```

Expected: the new assertion fails for the identified semantic loss, then passes after the minimum implementation repair.

- [ ] **Step 5: Run an independent pre-landing code review**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`, prioritizing correctness, security/privacy, data integrity, route compatibility, and Music/user-sync preservation.

Expected: all P0/P1 findings are fixed with regression tests; lower-priority findings are either fixed or recorded with explicit rationale.

### Task 4: Run Deterministic Static, Unit, Integration, Build, and E2E Gates

**Files:**
- Inspect: `package.json`
- Inspect: `explorers-earth/package.json`
- Inspect: `tunes/package.json`
- Inspect: `explorers-earth/playwright.config.ts`
- Inspect: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: reviewed rebased code from Task 3.
- Produces: fresh command output proving local correctness using the same contracts as CI.

- [ ] **Step 1: Install locked dependencies in the isolated worktree**

Run:

```powershell
npm ci --prefix explorers-earth
npm ci --prefix tunes
```

Expected: both installs exit 0 without modifying either lockfile.

- [ ] **Step 2: Run frontend lint, translation, type, unit, and coverage gates**

Run:

```powershell
npm run lint --prefix explorers-earth
npm run i18n:check --prefix explorers-earth
npm run landing:check --prefix explorers-earth
npm exec --prefix explorers-earth -- tsc -b --pretty false
npm run test:unit --prefix explorers-earth
npm run test:coverage --prefix explorers-earth
```

Expected: every command exits 0; coverage meets the configured thresholds.

- [ ] **Step 3: Run Tunes type, unit, integration, and build gates**

Run:

```powershell
npm run check --prefix tunes
npm test --prefix tunes
npm run test:integration --prefix tunes
npm run build --prefix tunes
```

Expected: all commands exit 0. If an integration test documents a required unavailable external service, record the exact test and error separately rather than treating unrelated passing tests as proof.

- [ ] **Step 4: Run the production frontend and monorepo builds**

Run:

```powershell
npm run build --prefix explorers-earth
npm run build:all
git status --short
```

Expected: both builds exit 0 and generated artifacts do not introduce unreviewed tracked changes.

- [ ] **Step 5: Reproduce the GitHub Actions E2E environment locally**

Read the rebased CI workflow and Playwright config, set only the non-secret test values they require, then run:

```powershell
$env:CI='true'
npm run test:e2e --prefix explorers-earth -- --reporter=line
```

Expected: the complete deterministic Playwright suite passes on Chromium. No required project is silently skipped; tests explicitly designed for live credentials may remain skipped and are covered in Task 5.

- [ ] **Step 6: Classify every failure before editing code**

For each failure, capture the command, first causal stack frame, screenshot/trace path when available, and whether it reproduces alone:

```powershell
npm exec --prefix explorers-earth -- playwright test e2e/profile.spec.ts:1 --project=chromium --retries=0 --trace=on
```

Expected: use `superpowers:systematic-debugging`; repair product defects with a failing regression test and avoid weakening assertions to make CI green.

### Task 5: Execute the Dashboard-to-Public-Page UI/UAT Matrix

**Files:**
- Create: `.gstack/qa-reports/qa-report-pr-103-rebase-2026-08-28.md`
- Inspect through UI: dashboard `/profile`, `/settings`, `/analytics`
- Inspect through UI: public `/:username` and every supported category route

**Interfaces:**
- Consumes: passing deterministic gates from Task 4 and the existing logged-in test-account browser session when available.
- Produces: screenshots/observations, a state-restoration record, and a UAT matrix covering desktop and mobile.

- [ ] **Step 1: Start the rebased application from the isolated worktree**

Run the current-main development topology from the repository root:

```powershell
npm run dev
```

Expected: Tunes and Explorers.Earth both reach ready state; `http://localhost:5173` returns the application and API requests target the intended test/dev backend.

- [ ] **Step 2: Record the test account's initial dashboard state before mutations**

Using the browser-control skill, record theme, layout, hero presence, selected landing category, category order, gallery integrations, bio formatting, social links, and published state.

Expected: the report contains enough values to restore the account exactly after UAT; credentials and tokens are never written into the report.

- [ ] **Step 3: Test every appearance combination with pairwise-plus-boundary coverage**

Exercise every theme individually, every layout individually, hero present/absent, bio present/empty, avatar custom/default, category landing choices, first/last category reordering, pointer drag, touch-sized viewport, and keyboard reorder. For the cross-product, cover all pairs plus these boundaries rather than an impractical blind Cartesian explosion.

Expected after each save/publish: reload the dashboard and public page; assert persistence, correct public rendering, no duplicate boxes, no clipped tabs, stable footer contrast, and no console/network errors.

- [ ] **Step 4: Test public navigation and fallback routes**

For the test username, click every visible public tab/category rather than typing only URLs. Also request an unknown category, an unpublished category, a valid category with UTM parameters, and an unknown username.

Expected: visible categories remain loaded after navigation; valid data renders; unknown/unpublished categories redirect to `/:username` while retaining allowed query attribution; an unknown username shows the intended not-found state; no “can't load this section” flash or redirect loop occurs.

- [ ] **Step 5: Test loading, empty, error, and responsive states**

At 320, 375, 768, 1024, and 1440 CSS-pixel widths, verify the Earth loader appears for initial profile readiness, skeletons are stable for section data, and loaded content does not jump through multiple incompatible placeholders. Use network throttling and one controlled failed request to inspect error recovery.

Expected: no hero image covers tabs, category content has balanced padding, avatar ring/viewer behavior is intentional, tab underline matches content width, controls remain reachable, and retry/error copy is readable in every theme.

- [ ] **Step 6: Test analytics creation and dashboard consumption end to end**

With consent denied, visit/click and verify no analytics write. With consent accepted, open a UTM-tagged public root, navigate categories, click one list and one recommendation item, then inspect `/analytics` ranges and charts.

Expected: one canonical profile view per navigation contract; category/list/item click types are distinct; UTM source/medium/campaign are present; path excludes sensitive query data; referrer is privacy-safe; country is populated when the server can resolve it and falls back without breaking aggregation; dashboard totals agree with the generated events.

- [ ] **Step 7: Verify account/settings and gallery behavior**

Confirm account username and billing address live under Settings, profile data remains under Profile, gallery provider controls are right-aligned accordion-style controls, and existing Instagram/Google behavior is unchanged.

Expected: no data point or save function was lost during the information-architecture move.

- [ ] **Step 8: Restore the test account and finalize the report**

Restore every value captured in Step 2, reload dashboard and public page, and record PASS/FAIL/BLOCKED for each matrix row with URLs, viewport, evidence path, and exact error.

Expected: the test account matches its initial state and the report contains no secrets.

### Task 6: Safely Update PR #103 and Observe CI

**Files:**
- Modify only if CI finds a real defect: the owning implementation/test file
- Update: PR #103 remote branch `codex/profile-settings-tabs`

**Interfaces:**
- Consumes: passing Tasks 3-5, clean worktree, and audited remote SHA.
- Produces: updated PR #103 with current main ancestry and green required checks; does not merge it.

- [ ] **Step 1: Recheck local and remote safety conditions immediately before push**

Run:

```powershell
git status --short --branch
git merge-base --is-ancestor origin/main HEAD
git ls-remote origin refs/heads/codex/profile-settings-tabs
git log --oneline --decorate -5
```

Expected: worktree is clean, main is an ancestor, and the remote feature SHA still equals the Task 1 lease SHA. If it differs, stop and audit the new remote commits; do not push.

- [ ] **Step 2: Push with an exact force-with-lease target**

Populate the lease value directly from the remote and prove it still matches the Task 1 SHA before pushing:

```powershell
$auditedRemoteSha = (git ls-remote origin refs/heads/codex/profile-settings-tabs).Split("`t")[0]
if ($auditedRemoteSha -ne '4cd5ec5a610d205ec794c14d2cc54553666ea91a') { throw "Remote branch moved; re-audit before pushing." }
git push --force-with-lease="refs/heads/codex/profile-settings-tabs:$auditedRemoteSha" origin HEAD:refs/heads/codex/profile-settings-tabs
```

Expected: only `codex/profile-settings-tabs` is rewritten; no other branch or tag changes.

- [ ] **Step 3: Verify the PR base, diff, and mergeability**

Run:

```powershell
gh pr view 103 --json url,headRefName,baseRefName,mergeable,mergeStateStatus,commits,files,statusCheckRollup
git fetch origin main codex/profile-settings-tabs
git rev-parse origin/codex/profile-settings-tabs
```

Expected: PR #103 targets `main`, remote head equals local `HEAD`, merge conflicts are gone, and the diff contains only intended feature/plan changes.

- [ ] **Step 4: Watch every required GitHub Actions check to completion**

Run:

```powershell
gh pr checks 103 --watch --interval 15
```

Expected: lint/type/unit/build/E2E/security/deployment validation checks pass. If a check fails, inspect the job logs, reproduce locally, use systematic debugging, commit the focused repair, run the affected local gate plus the full required gate, and push normally if the remote branch has not moved.

- [ ] **Step 5: Deliver the final verification and UAT handoff without merging**

Report the rebased head SHA, current main SHA, PR URL, exact local commands and outcomes, CI outcomes, UAT matrix summary, any external-service limitations, test-account restoration status, and remaining low-risk manual checks the user may repeat.

Expected: no claim of “everything works” is made without fresh evidence, and PR #103 remains open for the user's merge decision.
