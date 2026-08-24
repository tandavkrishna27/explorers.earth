# CI Pipeline Fix & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new `CI Pipeline` workflow green on `main` so production deploys of the explorers frontend unblock, and harden the workflow to production-grade practice.

**Architecture:** The repo gained `.github/workflows/ci.yml` in PR #84 (lint → typecheck → unit tests → integration → E2E), and `explorers.yml` (Netlify-style frontend deploy) now only runs when CI Pipeline succeeds via `workflow_run`. CI is red on `main` for two reasons: (a) 3 vitest tests fail, (b) ESLint reports 1,305 errors of accumulated debt, including 37 genuine `react-hooks/rules-of-hooks` bugs. The workflow file itself also has a fatal latent bug (Jest-only `--testPathPattern` flag passed to vitest). Strategy: fix the workflow bugs, fix all real code bugs (hooks + 3 tests + ~31 small mechanical lint errors), downgrade only the two bulk style rules (`no-explicit-any`: 1,125 hits, `no-unused-vars`: 93 hits) to warnings for a later burn-down.

**Tech Stack:** GitHub Actions, Node 22, Vite/React 18/TypeScript, ESLint 9 flat config (`typescript-eslint`), vitest + Testing Library + Apollo `MockedProvider`, Playwright.

**Explicit user decisions (do NOT revisit):**
- Tunes deploy workflows (`tunes.yml` active, `tunes-deploy.yml` manually disabled) are **out of scope — do not touch them**.
- No tunes CI jobs in this plan — explorers-earth only.
- Lint strategy: fix real bugs as errors now; bulk style rules become warnings with a follow-up burn-down.

**Current-state audit (evidence from run 29072555801 on main):**

Already good in `ci.yml` — keep as-is: `concurrency` with `cancel-in-progress`, `paths-ignore` for docs, `defaults.run.working-directory: explorers-earth`, `npm ci` with lockfile-scoped cache, coverage artifact upload, E2E artifacts on failure, deploy gated on CI success with `workflow_dispatch` escape hatch.

Problems this plan fixes:
1. Unit Tests job: 3 failing tests (`igdbService.test.ts`, `AppsAndTools/__tests__/scrape-flow.integration.test.tsx`, `People/__tests__/profile-scrape.integration.test.tsx`).
2. Lint job: 1,305 errors. Breakdown: 1,125 `no-explicit-any`, 93 `no-unused-vars`, 37 `rules-of-hooks` (real bugs, 12 files), 17 `no-useless-escape`, 7 `ban-ts-comment`, 5 `no-case-declarations`, 4 `no-empty`, 2 `no-useless-catch`, 2 `no-unused-expressions`, 4 misc.
3. `integration-tests` job runs `npx vitest run --reporter=verbose --testPathPattern="integration"` — `--testPathPattern` is a Jest flag; vitest exits with an unknown-option error. This job has never executed (always skipped so far because `needs` failed) and will fail the moment lint/tests go green.
4. No `timeout-minutes` on any job (a hung E2E run burns 6 h of runner time) and no top-level `permissions:` block (jobs get the default token scope instead of least privilege).
5. E2E job has never run; it must pass on main or the whole workflow stays red and deploys stay blocked (deploy gates on workflow conclusion, not individual jobs).
6. **E2E cannot pass as configured (Codex finding, verified):** `explorers-earth/playwright.config.ts` sets `baseURL: http://localhost:5173` but has **no `webServer` block**, and the e2e job never starts Vite — every spec will die with connection refused. Task 1b fixes this.
7. **CI never runs `npm run build` (Codex finding, verified):** the deploy workflow runs `npm run build` (which also runs `landing:check` and `generate-static`), but no CI job does. Main can pass CI and still fail at deploy time. Task 1c adds a build job.

**Note on shell:** all commands in this plan are written for the **Bash tool (Git Bash)**, not PowerShell. Run them there.

---

### Task 0: Sync local checkout and create a working branch

Local `main` is 15+ commits behind `origin/main` and does not have `ci.yml`. Working tree has only untracked/modified docs under `.gstack/` and `docs/` — safe to pull.

**Files:** none modified (git operations only)

- [ ] **Step 0.1: Fast-forward main**

```bash
git checkout main
git pull --ff-only origin main
```

Expected: `Updating 38a32f9..a77142a` (or later), no conflicts. If ff fails, STOP and report — do not merge or rebase without the user.

- [ ] **Step 0.2: Verify the workflow files arrived**

```bash
ls .github/workflows/
```

Expected: `ci.yml  explorers.yml  tunes-deploy.yml  tunes.yml`

- [ ] **Step 0.3: Create the branch**

```bash
git checkout -b ci/fix-pipeline
```

- [ ] **Step 0.4: Install dependencies**

```bash
cd explorers-earth && npm ci
```

Expected: clean install, exit 0.

---

### Task 1: Fix the workflow file (`ci.yml`)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1.1: Fix the vitest flag in the integration-tests job**

Find in `.github/workflows/ci.yml`:

```yaml
      - name: Run integration tests
        run: npx vitest run --reporter=verbose --testPathPattern="integration"
```

Replace with (vitest uses positional filename filters, not Jest's `--testPathPattern`):

```yaml
      - name: Run integration tests
        run: npx vitest run --reporter=verbose integration
```

- [ ] **Step 1.2: Add least-privilege permissions at workflow level**

Directly under the `concurrency:` block (before `defaults:`), add:

```yaml
permissions:
  contents: read
```

No job in this workflow needs write scope (artifact upload does not require it).

- [ ] **Step 1.3: Add timeouts to every job**

Add `timeout-minutes` under each job's `runs-on: ubuntu-latest` line:

| Job | timeout-minutes |
|-----|-----------------|
| lint | 10 |
| typecheck | 10 |
| unit-tests | 15 |
| integration-tests | 15 |
| e2e-tests | 30 |

Example for lint:

```yaml
  lint:
    name: 🔍 Lint
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

- [ ] **Step 1.4: Validate YAML parses**

```bash
npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('OK')"
```

Expected: `OK` (or yaml-lint success).

- [ ] **Step 1.5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: fix vitest integration filter, add permissions and job timeouts"
```

---

### Task 1b: Make E2E actually runnable — add Playwright `webServer`

**Files:**
- Modify: `explorers-earth/playwright.config.ts`

Without this, the e2e job fails on every spec with `net::ERR_CONNECTION_REFUSED` — nothing serves `localhost:5173` in CI.

- [ ] **Step 1b.1: Add the webServer block**

In `playwright.config.ts`, after the `projects:` array (still inside `defineConfig({...})`), add:

```ts
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
```

`reuseExistingServer: !process.env.CI` keeps local DX unchanged (devs with a running dev server reuse it) while CI always gets a fresh one.

- [ ] **Step 1b.2: Verify locally**

```bash
cd explorers-earth && npx playwright test --project=chromium --list
```

Expected: spec list prints without connection errors (webServer only starts on actual run; `--list` validates the config parses).

- [ ] **Step 1b.3: Audit what the specs actually need**

```bash
grep -rn "VITE_\|apiClient\|graphql" e2e/ | head -20
```

The e2e job sets `VITE_API_URL=http://localhost:5173` — the frontend's own origin, not a real API. If specs exercise real API flows they need mocking/stubbing (check `e2e/setup/auth.ts`). Record what you find; if specs require a live backend, STOP and report — that's a scope decision for the user.

- [ ] **Step 1b.4: Commit**

```bash
git add explorers-earth/playwright.config.ts
git commit -m "ci: add Playwright webServer so E2E can run without a manually started dev server"
```

---

### Task 1c: Add a build job to CI (parity with deploy)

**Files:**
- Modify: `.github/workflows/ci.yml`

The deploy runs `npm run build` (`landing:check` + `generate-static` + `tsc -b` + `vite build`); CI currently never does, so main can be CI-green and deploy-broken.

- [ ] **Step 1c.1: Add the job**

Add alongside the other jobs in `ci.yml`:

```yaml
  build:
    name: 🏗️ Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: explorers-earth/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
```

- [ ] **Step 1c.2: Prove it locally first**

```bash
cd explorers-earth && npm run build
```

Expected: exit 0. The deploy's build works today with secrets in `.env`; if the CI build (no `.env`) fails on a missing env var, add dummy `VITE_*` values to the job's `env:` block mirroring the e2e job's pattern — do not add real secrets.

- [ ] **Step 1c.3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build job for parity with the deploy build"
```

---

### Task 2: Fix `igdbService` unit test

**Root cause (verified):** `src/services/igdbService.ts:45` short-circuits `getAccessToken()` with a mock token when `import.meta.env.MODE === 'test'` **or** `window.location.hostname === 'localhost'` (added for E2E/local dev). Under vitest both conditions are true (MODE is `test`, jsdom's default hostname is `localhost`), so the OAuth `axios.post` never fires. The test `authenticates and fetches games` still expects 2 posts for `searchGames` and 3 cumulative — it gets 1 and 2.

**Files:**
- Modify: `explorers-earth/src/services/__tests__/igdbService.test.ts` (the `authenticates and fetches games` test, ~line 67)

- [ ] **Step 2.1: Run the failing test to confirm the baseline**

```bash
cd explorers-earth && npx vitest run src/services/__tests__/igdbService.test.ts
```

Expected: 1 failure — `AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times`.

- [ ] **Step 2.2: Update the test to match the test-mode token bypass**

Replace the entire `it('authenticates and fetches games', ...)` block with:

```ts
    it('fetches games using the test-mode token bypass', async () => {
      (axios.post as any).mockImplementation((url: string) => {
        if (url.includes('/igdb-api/v4/games')) {
          return Promise.resolve({ data: [{ id: 1, name: 'Zelda' }] });
        }
        return Promise.reject(new Error('not found'));
      });

      const results = await igdbService.searchGames('Zelda');

      // MODE === 'test' short-circuits Twitch OAuth (igdbService.getAccessToken),
      // so only the IGDB games request reaches axios.
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Zelda');

      // Token stays cached; the next call adds exactly one more IGDB request.
      await igdbService.getGameDetails(1);
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
```

- [ ] **Step 2.3: Run the test file, verify all pass**

```bash
npx vitest run src/services/__tests__/igdbService.test.ts
```

Expected: 13 passed, 0 failed.

- [ ] **Step 2.4: Commit**

```bash
git add src/services/__tests__/igdbService.test.ts
git commit -m "test: align igdb auth test with test-mode token bypass"
```

---

### Task 3: Fix AppsAndTools scrape-flow integration test

**Root cause (verified from CI log):** After submit, the "Add to List" button stays disabled with a loading spinner — the `CREATE_RECOMMENDED_APP` mutation never resolves. Apollo `MockedProvider` matches mocks by **exact variables**; PR #82 ("recommendation forms and associated hooks") changed the variables `AddAppPage` sends, so the mock no longer matches. The test masks the diagnostic because `beforeEach` silences `console.error`, which is where MockedProvider prints `No more mocked responses for the query: mutation CreateRecommendedApp...`.

**Files:**
- Modify: `explorers-earth/src/features/AppsAndTools/__tests__/scrape-flow.integration.test.tsx` (the `createAppMock.request.variables` object, ~line 85)
- Read (do not modify): `explorers-earth/src/features/AppsAndTools/components/dashboard/AddAppPage.tsx` and any submit hook it calls

- [ ] **Step 3.1: Expose the real diagnostic**

Temporarily comment out this line in `beforeEach`:

```ts
    // vi.spyOn(console, 'error').mockImplementation(() => {});
```

Run:

```bash
npx vitest run src/features/AppsAndTools/__tests__/scrape-flow.integration.test.tsx 2>&1 | grep -A20 "No more mocked responses"
```

Expected output: the exact mutation and variables the component actually sent.

- [ ] **Step 3.2: Diff actual vs mocked variables — AND check the pre-mutation upload path**

Compare the printed variables against `createAppMock.request.variables` in the test. Cross-check by reading the submit handler in `AddAppPage.tsx` (and its form hook from PR #82) to confirm which fields changed — do not guess from the error alone.

**Codex finding (verified in component source):** `AddAppPage` now uploads the scraped logo/screenshots via `axios` *before* firing `CREATE_RECOMMENDED_APP`, and the mutation variables include the *uploaded* URLs, not the scraped ones. The test currently mocks `global.fetch` but NOT `axios` — so the submit may stall or send unexpected `logo_url`/`screenshots` values before Apollo matching even matters. Mock the axios upload calls (`vi.mock('axios')` with resolved upload responses) and make the mocked upload URLs the ones you put in `createAppMock.request.variables`.

- [ ] **Step 3.3: Update the mock variables to match the component**

Edit `createAppMock.request.variables` so every field matches what the component sends (add new fields, fix changed values, remove dropped ones — including uploaded-URL fields from Step 3.2). Keep the `result.data.createRecommendedApp` shape unchanged unless the mutation's selection set also changed — if it did, mirror the new selection set fields. If any variable embeds a timestamp (`Date.now()`), freeze it with `vi.useFakeTimers()` / `vi.setSystemTime()` rather than matching a moving value.

- [ ] **Step 3.4: Restore the console.error silencing and verify green**

Un-comment the `vi.spyOn(console, 'error')` line, then:

```bash
npx vitest run src/features/AppsAndTools/__tests__/scrape-flow.integration.test.tsx
```

Expected: 1 passed, 0 failed.

- [ ] **Step 3.5: Commit**

```bash
git add src/features/AppsAndTools/__tests__/scrape-flow.integration.test.tsx
git commit -m "test: sync apps scrape-flow mock variables with current create mutation"
```

---

### Task 4: Fix People profile-scrape integration test

Same failure signature and same root cause class as Task 3 (submit button stuck in loading state → unmatched Apollo mock after PR #82).

**Files:**
- Modify: `explorers-earth/src/features/People/__tests__/profile-scrape.integration.test.tsx`
- Read (do not modify): the People add/create page component and its submit hook

- [ ] **Step 4.1: Expose the diagnostic** — comment out the test file's `console.error` silencing, run:

```bash
npx vitest run src/features/People/__tests__/profile-scrape.integration.test.tsx 2>&1 | grep -A20 "No more mocked responses"
```

- [ ] **Step 4.2: Update the create-person mock's `request.variables`** to match what the component sends, verified against the component source (same procedure as Steps 3.2–3.3). **Codex finding:** this component also has a pre-mutation upload path (avatar/media via axios) — the test already mocks axios, but the expected mutation variables depend on the mocked upload URLs, avatar path, and possibly `Date.now()`-derived values. Verify the whole upload → variables chain, and freeze time if timestamps appear in variables.

- [ ] **Step 4.3: Restore silencing, verify green**

```bash
npx vitest run src/features/People/__tests__/profile-scrape.integration.test.tsx
```

Expected: 1 passed.

- [ ] **Step 4.4: Commit**

```bash
git add src/features/People/__tests__/profile-scrape.integration.test.tsx
git commit -m "test: sync people profile-scrape mock variables with current create mutation"
```

---

### Task 5: Reclassify bulk style lint rules as warnings

**Files:**
- Modify: `explorers-earth/eslint.config.js`

- [ ] **Step 5.1: Add rule downgrades**

In `eslint.config.js`, extend the `rules` block:

```js
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Bulk legacy debt (1,125 + 93 hits on 2026-07-10) — warn now, burn down
      // in follow-up PRs, then restore to 'error'.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
```

Downgrade ONLY these two rules. `rules-of-hooks`, `no-useless-escape`, `ban-ts-comment`, `no-case-declarations`, `no-empty`, `no-useless-catch`, `no-unused-expressions` and the rest stay errors and get fixed in Tasks 6–7.

- [ ] **Step 5.2: Measure remaining errors**

```bash
npm run lint 2>&1 | tail -3
```

Expected: roughly `✖ 1428 problems (~87 errors, ~1341 warnings)` — errors drop from 1,305 to ≈87 (37 hooks + ~50 mechanical). All counts in this plan came from run 29072613551 on 2026-07-10 and WILL drift as main moves — treat them as ballpark, record the actual numbers, and don't treat a small delta as a failure.

- [ ] **Step 5.3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): downgrade no-explicit-any and no-unused-vars to warnings pending burn-down"
```

---

### Task 6: Fix all 37 `react-hooks/rules-of-hooks` errors (real bugs)

These are conditional hook calls — hooks placed after early returns or inside conditionals. They can crash with "Rendered fewer hooks than expected" at runtime. File inventory from the CI log:

| File | Errors |
|------|--------|
| `src/features/Favorites/components/RecommendForm.tsx` | 6 |
| `src/components/InteractiveMap.tsx` | 6 |
| `src/features/Profile/components/ProfileForm.tsx` | 3 |
| `src/features/Products/components/public/ProductTopPicksHero.tsx` | 3 |
| `src/features/People/components/public/PersonTopPicksHero.tsx` | 3 |
| `src/features/Movies/components/public/TopPicksHero.tsx` | 3 |
| `src/features/Guides/components/TopPicksHero.tsx` | 3 |
| `src/features/Games/components/public/TopGamesHero.tsx` | 3 |
| `src/features/AppsAndTools/components/public/AppTopPicksHero.tsx` | 3 |
| `src/features/PublicHome/components/PlaceDetails/Details/MediaGallery.tsx` | 2 |
| `src/features/PublicHome/components/PublicGuideViews/GuideCoverMapView.tsx` | 1 |
| `src/features/Guides/pages/GuideDetailsPage.tsx` | 1 |

**The canonical transformation** — move every hook above the first early return; the early return moves below the hooks. Behavior is preserved because hooks run unconditionally anyway on React's rules. Worked example, `InteractiveMap.tsx` (`FullscreenOverlay`, lines 188–205):

Before:

```tsx
  const FullscreenOverlay = () => {
    if (!isFullscreen) return null;

    const [fullscreenCoords, setFullscreenCoords] = useState(currentCoords);
    const [fullscreenZoom, setFullscreenZoom] = useState(currentZoom);
    const [fullscreenTargetCoords, setFullscreenTargetCoords] = useState(targetCoords);
    const [fullscreenTargetZoom, setFullscreenTargetZoom] = useState(targetZoom);
    const [fullscreenMapTypeId, setFullscreenMapTypeId] = useState<"satellite" | "roadmap">(mapTypeId);

    // Sync with main map state
    useEffect(() => {
      setFullscreenCoords(currentCoords);
      ...
    }, [currentCoords, currentZoom, targetCoords, targetZoom, mapTypeId]);
```

After:

```tsx
  const FullscreenOverlay = () => {
    const [fullscreenCoords, setFullscreenCoords] = useState(currentCoords);
    const [fullscreenZoom, setFullscreenZoom] = useState(currentZoom);
    const [fullscreenTargetCoords, setFullscreenTargetCoords] = useState(targetCoords);
    const [fullscreenTargetZoom, setFullscreenTargetZoom] = useState(targetZoom);
    const [fullscreenMapTypeId, setFullscreenMapTypeId] = useState<"satellite" | "roadmap">(mapTypeId);

    // Sync with main map state
    useEffect(() => {
      setFullscreenCoords(currentCoords);
      ...
    }, [currentCoords, currentZoom, targetCoords, targetZoom, mapTypeId]);

    if (!isFullscreen) return null;
```

Watch for two subtleties (the second is a Codex finding):
1. If code *between* the old early return and a hook computed values the hook uses, move that computation too (it must be side-effect-free; if it isn't, restructure so the hook takes the raw inputs).
2. **Moving hooks above an early return is NOT automatically behavior-preserving for effects.** A `useEffect` that previously never ran (component returned `null` first) will now run on every render — if it fetches, subscribes, or calls a maps/DOM API, gate the effect body instead: `useEffect(() => { if (!isVisible) return; ... }, [isVisible, ...])`. Pure state-sync effects (like `FullscreenOverlay`'s) are safe to move as-is. Judge each effect individually.

- [ ] **Step 6.1** For each file in the table: run `npx eslint <file>` to get exact line numbers, apply the transformation, re-run `npx eslint <file>` until `rules-of-hooks` errors are 0, then run **both** that feature's tests (`npx vitest run <feature-dir>`) **and** `npx tsc --noEmit` (hook moves can surface null/undefined assumptions immediately, not at the end). Commit in logical batches — the 6 near-identical `TopPicksHero` variants can share one commit; distinct components get their own:

```bash
git add <files>
git commit -m "fix: unconditional hook calls in <ComponentName or component group>"
```

- [ ] **Step 6.2: Verify zero hook errors repo-wide**

```bash
npm run lint 2>&1 | grep -c "rules-of-hooks" || echo "0 - clean"
```

Expected: `0 - clean`.

---

### Task 7: Fix remaining mechanical lint errors (~50)

Rules and how to fix each:

| Rule | Count | Fix |
|------|-------|-----|
| `no-useless-escape` | 17 | Delete the unnecessary `\` in the regex/string (e.g. `\/` → `/` outside character classes) |
| `@typescript-eslint/ban-ts-comment` | 7 | Replace `@ts-ignore` with `@ts-expect-error` plus a `: description` |
| `no-case-declarations` | 5 | Wrap the `case` body in `{ }` braces |
| `no-empty` | 4 | Add `/* intentionally empty */` comment or handle the error |
| `no-useless-catch` | 2 | Remove the try/catch that only rethrows |
| `@typescript-eslint/no-unused-expressions` | 2 | Convert to a statement or remove |
| `no-irregular-whitespace` | 1 | Replace the invisible char with a normal space |
| `no-empty-pattern` | 1 | Remove the empty `{}` destructuring |
| `no-dupe-else-if` | 1 | **Read carefully — duplicated condition may hide a logic bug.** Fix the intended condition, don't just delete |
| `no-constant-condition` | 1 | Same — check whether the constant condition is a leftover debug or a real bug |

- [ ] **Step 7.1: List them all**

```bash
npm run lint 2>&1 | grep -B5 " error " > /tmp/lint-errors.txt && grep -c " error " /tmp/lint-errors.txt
```

- [ ] **Step 7.2:** Fix rule-by-rule per the table. For `no-dupe-else-if` and `no-constant-condition`, read the surrounding logic and preserve intent. Group commits by rule:

```bash
git commit -m "fix(lint): resolve no-useless-escape errors"   # etc. per rule
```

- [ ] **Step 7.3: Verify lint fully green (errors = 0)**

```bash
npm run lint 2>&1 | tail -3
```

Expected: `✖ N problems (0 errors, N warnings)` — exit code 0.

- [ ] **Step 7.4: Commit any stragglers**

---

### Task 8: Full local verification (mirror every CI job)

Run from `explorers-earth/`, in CI job order:

- [ ] **Step 8.1: Lint** — `npm run lint` → exit 0, 0 errors.
- [ ] **Step 8.2: Typecheck** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 8.3: Unit tests + coverage** — `CI=true npm run test:coverage` → expect `Tests  589 passed` (0 failed; count may be higher if tests were added).
- [ ] **Step 8.4: Integration filter** — `npx vitest run --reporter=verbose integration` → runs only the `*integration*` test files, all pass, exit 0. This proves the Task 1 flag fix works.
- [ ] **Step 8.5: Build** — `npm run build` → exit 0 (mirrors the new build job from Task 1c).

- [ ] **Step 8.6: E2E** — this job has NEVER run in CI; if it fails on main the deploy stays blocked, so it must be proven locally first (the Task 1b `webServer` now starts Vite automatically):

```bash
npx playwright install --with-deps chromium
CI=true VITE_API_URL=http://localhost:5173 VITE_GOOGLE_MAPS_API_KEY=test-key VITE_PUBLIC_ACCESS_TOKEN=test-token npx playwright test --project=chromium
```

Expected: all specs pass. **If E2E fails:** STOP and report the failures to the user before pushing — E2E fixes are a separate investigation, and the user must decide whether to fix forward or temporarily remove the e2e job from the blocking path. Do not silently mark it `continue-on-error`.

---

### Task 9: Ship and verify the pipeline end-to-end

- [ ] **Step 9.1: Push and open the PR**

```bash
git push -u origin ci/fix-pipeline
gh pr create --base main --title "ci: fix pipeline failures and harden workflow" --body "$(cat <<'EOF'
## Summary
- Fix vitest integration filter (Jest-only --testPathPattern), add job timeouts + least-privilege permissions to ci.yml
- Fix 3 failing tests (igdb test-mode bypass, 2 Apollo mock variable mismatches from PR #82)
- Fix all 37 react-hooks/rules-of-hooks violations (12 files) — real conditional-hook bugs
- Fix ~50 mechanical lint errors; downgrade no-explicit-any / no-unused-vars to warnings pending burn-down

Unblocks the explorers frontend deploy, which is gated on CI Pipeline success.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9.2: Watch CI on the PR**

```bash
gh pr checks --watch
```

Expected: all 6 jobs green (lint, typecheck, build, unit, integration, e2e).

- [ ] **Step 9.3:** Ask the user to review/merge the PR (do not self-merge). **This is a hard handoff** — the executing session stops here and reports; Step 9.4 runs only after the user confirms the merge (same session or a fresh one reading this plan).

- [ ] **Step 9.4: After merge, verify main + deploy**

```bash
gh run list --branch main --limit 4
```

Expected: `CI Pipeline` = success on the merge commit, followed by `Deploy Explorers Frontend` = success (triggered via workflow_run, no longer skipped). If deploy is still skipped/failed, investigate before closing out.

---

## Follow-ups (explicitly out of this plan's scope)

1. **Warning burn-down:** ~1,218 `no-explicit-any`/`no-unused-vars` warnings remain. Burn down feature-by-feature in small PRs, then restore both rules to `error`. Consider adding `--max-warnings <current-count>` to the lint script as a ratchet so the count can only go down.
2. **Tunes CI:** declined for now (user decision 2026-07-10). Revisit — tunes deploys to production with zero CI.
3. **Tunes deploy cleanup:** `tunes-deploy.yml` (GHCR path) is manually disabled but still in the repo with the same display name as the active `tunes.yml`. User chose not to touch deploy workflows now.
4. **Action version bumps:** `checkout@v4`/`setup-node@v4` emit Node 20 deprecation annotations (cosmetic; forced to Node 24 and working). When bumping, verify latest majors first: `gh api repos/actions/checkout/releases/latest --jq .tag_name`.
5. **Duplicate test execution:** the unit-tests job (`test:coverage`) also runs the integration files that the integration-tests job runs (~30 s duplication). Acceptable for now; the cleaner fix (Codex suggestion) is dedicated `test:unit` / `test:integration` package scripts with mutually exclusive globs.
6. **Deploy build reproducibility (Codex finding):** `explorers.yml` installs with `npm i`, not `npm ci` — deploys aren't lockfile-reproducible. Out of scope now (user: don't touch working deploys), but change it in the next deploy-workflow PR.
7. **igdb OAuth path is untested (Codex finding):** the Task 2 fix accepts the test-mode bypass, which means no unit test exercises the real Twitch OAuth flow. Follow-up: extract the token logic behind an injectable seam (or gate the bypass on an explicit env flag) so the OAuth path is testable.
8. **`no-unused-vars` warnings can hide real bugs (Codex caveat):** unused catch-params or destructured values sometimes indicate dropped error handling. When burning down warnings, read before deleting.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 19 findings, 12 absorbed into plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | — |

- **CODEX:** 2 verified P1-class gaps fixed (missing Playwright `webServer` → Task 1b; no CI build job → Task 1c); upload-path mock guidance added to Tasks 3/4; hook-move safety caveat added to Task 6; 4 items added to follow-ups. Rejected: PowerShell-command concern (plan runs in Git Bash), protected-file concern (Codex misread its own sandbox boundary as a plan constraint), PR-attribution removal (harness requirement), Task 0 pull risk (working tree only has untracked docs; `--ff-only` + STOP guard already present).
- **CROSS-MODEL:** Claude's investigation and Codex agree on: vitest flag bug, deploy gating consequence, lint-debt strategy, Apollo mock root cause direction. Codex uniquely found: missing webServer, missing build job, pre-mutation upload path, localhost-hostname bypass condition, effect-behavior caveat on hook moves. Claude uniquely found: the tunes dual-deploy config debt (out of scope per user), the 37-vs-6 hooks undercount.
- **UNRESOLVED:** 1 — whether the e2e specs need a live backend (Task 1b Step 1b.3 investigates; STOP point if so).
- **VERDICT:** CODEX CLEARED after absorption — ready to implement; eng review optional (Codex covered architecture-level gaps).
