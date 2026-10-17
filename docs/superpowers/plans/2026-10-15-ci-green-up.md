# CI Green-Up Implementation Plan (PR #119, `codex/unified-replatform`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revision 2.** Revised after two adversarial reviews found 28+ defects in revision 1, three of which would have made CI worse. Corrections are marked **[R2]** where they overturn revision 1.

**Goal:** Take 15 of the 16 failing CI checks to green. **`platform-fixture` is explicitly excluded from that promise** — see "What this plan cannot promise".

**Architecture:** Four investigations established that **none** of the 16 failures is a regression from the 16 commits of 2026-10-15; all trace to the earlier 358 commits of the same 374-commit push, which met CI for the first time on this head. Work is ordered by unblocking power: Tier 1 restores the Docker build, the only thing that can exercise the Wave 3 repair at `88a72cbe`; Tier 2 fixes the one genuine product bug; Tier 3 makes Windows-authored tests portable; Tier 4 refreshes two stale Playwright fixtures; Tier 5 clears 251 accumulated lint errors.

**Tech Stack:** GitHub Actions, Docker Compose, nginx, Node 24.21.0, Vitest, Playwright, PostgreSQL 15, TypeScript, ESLint 9 flat config.

---

## What this plan cannot promise **[R2]**

`platform-fixture` runs five canonical probes against a real container stack. **Those probes have never executed once on this branch.** At `622f6893` the job reached `phase=ingress-check`; at this head it dies earlier, at `phase=service-build`, because the image no longer builds. Task 1 restores the build. It says nothing about whether the probes then pass.

So: Task 1 makes `platform-fixture` *able to fail honestly for the first time*. If the five probe bodies fail, that is Wave 3's first real result and must be recorded as such. **A build that merely gets further is not a passing fixture.** Do not report it as one.

## One decision required before Task 9 **[R2]**

Revision 1 proposed raising the fixture-guard bootstrap budget from 1000 ms to 5000 ms. Review found `tunes/server/test/contracts/places-writer-guard-transport.test.ts:24` is **titled** *"collection remains inert and bootstrap has a local 1000ms budget"* and proves it with a fake clock advancing exactly 1000 ms per write. Raising the budget makes that assertion fail and its title false — so the change is not a free latency tweak, it edits a deliberate bound. The stated constraint is "no weakening of assertions". Task 9 therefore stops and asks. Do not self-certify it.

---

## Evidence base

| Check | Root cause | Class |
|---|---|---|
| `platform-fixture` | `.dockerignore` default-deny **and** the Dockerfile COPY list both omit `explorersPublicPeopleSectorContract.ts` → build fails → containers never start, nginx never parsed, 0 of 5 probes run | pre-existing (`b0be32db` + `5c3f9007`) |
| `static`, `contracts`, `Music contracts` (×2) | tunes C0 contracts import across the repo boundary; jobs never install `explorers-earth` deps (missing `react`, `dompurify`, `zod/v3`, `@playwright/test`) | pre-existing + CI-only |
| `database` | `pg_shdepend` queried without `dbid` → 2nd database in a cluster sees the 1st's grants and fails closed | pre-existing (`b9dea2a6`), **real bug** |
| `docs-contracts`, `unit-coverage`, `security` | two stale generated snapshots | pre-existing (`0b4cac23`, `12abecb9`) |
| `build-test-scan-push` | Windows-only ungated test files + the 2 stale snapshots | pre-existing |
| `browser` | bare `music.spec.ts` filter is a regex over the full path, also matching `e2e/replatform/music.spec.ts` | pre-existing |
| `E2E Public shell` | fixture timeline place has no `id`; one bad place drops the whole section | pre-existing (`24b942c0`) |
| `E2E Category A` | contained harness serves none of the canonical places-envelope fields the client now requires | pre-existing (`343df2dd`) |
| `🔍 Lint` | 251 errors / 1858 warnings — identical count at `d0194a7e`, before the 16 | pre-existing |
| `replatform-required`, `music-required` | pure `needs` aggregators, no logic of their own | consequential |

**Do not edit either aggregator.** They go green when their upstreams do. `replatform-required` needs `lint`, `e2e-category-a`, `e2e-public-shell`; `music-required` needs eight more.

## Workflow reach (established, not assumed) **[R2]**

- `ci.yml` — PR to `main`/`develop` + push to `codex/unified-replatform`: `🔍 Lint`, `🔷 TypeScript`, `🧪 Unit Tests`, `🏗️ Build`, `🔗 Integration Tests`, the five `🎭 E2E` lanes, `replatform-required`.
- `test.yml` — every PR: `docs-contracts`, `static`, `unit-coverage`, `contracts`, `database`, `security`, `frontend`, `browser`, `image-deploy-contract`, `platform-fixture`, `music-required`.
- `music-c0-contracts.yml` — PR to `main`, path-filtered: `Music contracts (ubuntu-latest)` / `(windows-latest)`.
- `tunes.yml` — PR to `main`, path-filtered: `build-test-scan-push` only.
- **`e2e/replatform/**` specs run in NO PR or push job.** Only `frontend-e2e-qualification.yml` (`schedule: 23 3 * * *` + dispatch) executes them, deliberately: *"Promote a lane into the required workflow once it has been observed green here, not before."* One caveat — today `test.yml:276`'s bare filter *collects* `e2e/replatform/music.spec.ts`, which is exactly why `browser` dies at import. After Task 11 no PR job touches that directory.

**Consequence:** the e2e work in the recent 16 commits is unverified by CI by design, which is also why it cannot have broken CI.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/generate-music-fixture-dockerignore.mjs` | generates both ignore files from entry points | 1 |
| `.dockerignore`, `explorers-earth/Dockerfile.music-fixture.dockerignore` | generated build-context allow-lists | 1 |
| `explorers-earth/Dockerfile.music-fixture` | fixture image COPY list | 1 |
| `scripts/dockerfile-shared-contract-closure.test.mjs` | **new** — guards the COPY list and the ignore files | 1 |
| `.github/workflows/test.yml` | `static` order; `contracts` install; `browser` filter | 2, 11 |
| `.github/workflows/music-c0-contracts.yml` | C0 install; lifecycle gate requirement | 2, 5 |
| `.github/workflows/tunes.yml` | image-pipeline install | 2 |
| `docs/architecture/music-runtime-surface-inventory.json`, `...music-authorization-matrix.json` | generated snapshots | 3 |
| `tunes/server/db/app-enrichment-worker-custody.ts` + its contract test | worker-role custody guard | 4 |
| `tunes/server/test/contracts/lifecycle-browser-support.test.ts` | native lifecycle gate | 5 |
| `tunes/server/test/contracts/apps-private-custody.test.ts` | win32 privacy closure | 6 |
| `tunes/server/test/contracts/public-parity-controller.test.ts` | parity controller contract | 7 |
| `tunes/server/test/contracts/guides-bootstrap-contract.test.ts`, `music-fixture-services.test.ts` | spawn budgets | 8 |
| `tunes/server/test/helpers/placesWriterGuardTransport.ts` + `places-writer-guard-transport.test.ts` | bootstrap budget | 9 (blocked) |
| `tunes/server/test/contracts/guides-fullform-preservation.test.ts` | form-preservation bindings | 10 |
| `explorers-earth/e2e/public-shell-continuity.spec.ts` | public shell fixture | 12 |
| `explorers-earth/e2e/setup/category-navigation.ts`, `e2e/category-navigation-a.spec.ts` | contained category harness | 13 |
| ~20 lint-bearing files | Tier 5 | 14, 15 |

---

# Tier 1 — Restore the build

### Task 1: Admit the missing shared contract to the build context, the image, and a guard

Three separate gates omit `tunes/shared/explorersPublicPeopleSectorContract.ts`:

1. **[R2] `.dockerignore:16` is `tunes/shared/*` — default-deny**, with 24 explicit `!tunes/shared/<file>` re-admissions. The contract appears in **neither** `.dockerignore` nor `explorers-earth/Dockerfile.music-fixture.dockerignore` (verified: 0 matches in both). So adding only a `COPY` line fails *earlier* than the TS2307 it was meant to fix — the file is not in the context at all.
2. Both ignore files are **generated** by `scripts/generate-music-fixture-dockerignore.mjs` from `sharedContractEntryPoints` (line 20) plus a relative-import closure. This contract's only import is `zod/v3`, so it can never enter that closure — it must be added as an **entry point**.
3. `tunes/server/test/contracts/music-compose-safety.test.ts:61-67` runs the generator with `--check` and fails if the committed files are stale. That is a hard gate, so the regeneration is mandatory, not optional.

- [ ] **Step 1: Write the failing guard test [R2]**

**It must live in the repo-root `scripts/`, not `tunes/scripts/`.** `test.yml:80` globs root `scripts/*.test.mjs` (22 files) and `test.yml` sets no `defaults.working-directory`; the single existing `tunes/scripts/*.test.mjs` is named in no workflow, so a guard placed there would be run by nothing.

Create `scripts/dockerfile-shared-contract-closure.test.mjs`:

```javascript
// Guards both halves of the fixture image's shared-contract admission: the generated
// .dockerignore allow-lists AND the hand-maintained COPY list in
// Dockerfile.music-fixture. Omitting either makes `RUN npm run build` fail inside Docker
// and platform-fixture dies in provision -- a full CI round trip to discover.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// Both quote styles: 14 frontend files import tunes/shared with double quotes, and one
// contract is imported ONLY that way, so a single-quote-only regex would miss a regression.
const IMPORT = /from\s+["'][^"']*tunes\/shared\/([A-Za-z0-9_.-]+)["']/g;

function frontendSharedImports() {
  const walk = (dir) => readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
  const required = new Set();
  for (const file of walk(path.join(root, 'explorers-earth/src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      required.add(match[1].endsWith('.ts') ? match[1] : `${match[1]}.ts`);
    }
  }
  return required;
}

test('every tunes/shared contract imported by frontend source is COPYed into the fixture image', () => {
  const dockerfile = readFileSync(path.join(root, 'explorers-earth/Dockerfile.music-fixture'), 'utf8');
  const copied = new Set([...dockerfile.matchAll(/^COPY\s+tunes\/shared\/([^\s]+)\s/gm)].map((m) => m[1]));
  const missing = [...frontendSharedImports()].filter((name) => !copied.has(name)).sort();
  assert.deepEqual(missing, [], `Dockerfile.music-fixture does not COPY: ${missing.join(', ')}`);
});

test('every tunes/shared contract imported by frontend source is admitted by both ignore files', () => {
  const missing = [];
  for (const ignore of ['.dockerignore', 'explorers-earth/Dockerfile.music-fixture.dockerignore']) {
    const admitted = new Set([...readFileSync(path.join(root, ignore), 'utf8')
      .matchAll(/^!tunes\/shared\/([^\s]+)$/gm)].map((m) => m[1]));
    for (const name of frontendSharedImports()) if (!admitted.has(name)) missing.push(`${ignore}: ${name}`);
  }
  assert.deepEqual(missing.sort(), [], `build context excludes: ${missing.join(', ')}`);
});
```

- [ ] **Step 2: Run it to verify both cases fail**

```bash
node --test scripts/dockerfile-shared-contract-closure.test.mjs
```

Expected: 2 failed — `does not COPY: explorersPublicPeopleSectorContract.ts` and `build context excludes:` naming it in **both** ignore files.

- [ ] **Step 3: Add the entry point and regenerate both ignore files [R2]**

In `scripts/generate-music-fixture-dockerignore.mjs`, add to `sharedContractEntryPoints` (keep the list's existing order convention, beside the other person/people contracts):

```javascript
  "tunes/shared/explorersPublicPeopleSectorContract.ts",
```

Then regenerate:

```bash
node scripts/generate-music-fixture-dockerignore.mjs --write
```

- [ ] **Step 4: Add the COPY line [R2]**

Line 40 **is** the `explorersPersonContract` line — do not re-emit it or you create a duplicate COPY. Insert exactly one new line after line 40:

```dockerfile
COPY tunes/shared/explorersPublicPeopleSectorContract.ts /workspace/tunes/shared/explorersPublicPeopleSectorContract.ts
```

- [ ] **Step 5: Run the guard and the compose-safety gate**

```bash
node --test scripts/dockerfile-shared-contract-closure.test.mjs
cd tunes && npm test -- --run server/test/contracts/music-compose-safety.test.ts
```

Expected: 2 passed, then 0 failures — the latter proves the committed ignore files match the generator's `--check` output.

- [ ] **Step 6: Prove the TypeScript build resolves [R2]**

```bash
cd explorers-earth && npm run build
```

Expected: exit 0, no `TS2307`. **This runs outside Docker and cannot prove the build context** — Step 5 covers that half. Now revert the build's side effects, which `generate-static` rewrites:

```bash
git checkout -- explorers-earth/public/robots.txt explorers-earth/public/sitemap.xml
git status --short explorers-earth/public/
```

Expected: empty output. Do not proceed while those files are dirty — Task 14 stages broadly and would otherwise commit them.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-music-fixture-dockerignore.mjs .dockerignore explorers-earth/Dockerfile.music-fixture.dockerignore explorers-earth/Dockerfile.music-fixture scripts/dockerfile-shared-contract-closure.test.mjs
git commit -m "fix(fixture): admit the public people sector contract to the build context and image

Three gates omitted tunes/shared/explorersPublicPeopleSectorContract.ts, which
non-test frontend source imports: the generator's entry-point list, both
generated .dockerignore allow-lists (tunes/shared/* is default-deny), and the
Dockerfile COPY list. The image build therefore failed and platform-fixture
died in provision (phase=service-build) two phases before ingress -- the
containers never started, nginx was never parsed, and none of the five
canonical probes ran. The new root-scripts node --test cases guard both the
COPY list and the ignore files, matching single- and double-quoted imports, so
the next shared contract cannot repeat this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Install `explorers-earth` dependencies in the jobs that reach across the boundary

The tunes C0 suites deliberately assert against `explorers-earth`'s real harness and real frontend types (`guides-harness-client`, `travelModeConfig`), so the cross-boundary scope is intentional. Narrowing it would silently stop typechecking those tests. **[R2]** Only `npm ci --prefix explorers-earth` is load-bearing: `react`, `dompurify`, `zod` and `@playwright/test` are all in `explorers-earth/package.json`, the root has no `workspaces` key, and Node resolution from `explorers-earth/src/**` never reaches the root. The root `npm ci` serves the pre-existing `node --test` cases only.

**Files:** `.github/workflows/test.yml` (`static`, `contracts`), `.github/workflows/music-c0-contracts.yml`, `.github/workflows/tunes.yml`

- [ ] **Step 1: Reorder `static`, carrying its comment with it [R2]**

`test.yml:54-76` is a 23-line comment justifying these two installs, including the `tunes/auth-runtime` postinstall note. **Move the comment with the steps** — do not orphan it above `playwright install`.

Result: `npm ci` and `npm ci --prefix explorers-earth` (with their comment) sit immediately after `npm ci --prefix tunes --legacy-peer-deps` and before `music:types:scoped`; `playwright install` and `node --test` keep their position. Add one line to the moved comment:

```yaml
      # Also required by music:types:scoped below: the C0 scope reaches explorers-earth
      # sources transitively through server/test/contracts/guides-*.test.ts, so without
      # explorers-earth/node_modules the typecheck reports TS2307 for react, dompurify,
      # zod/v3 and @playwright/test -- errors that read as source defects.
```

- [ ] **Step 2: Add the install to the `contracts` job**

After `npm ci --prefix tunes` (line 111), before the test run at line 128:

```yaml
      # public-parity-spec-contract and guides-native-diagnostic resolve @playwright/test
      # and a CSS asset out of explorers-earth/node_modules at runtime.
      - run: npm ci --prefix explorers-earth
```

- [ ] **Step 3: Add the install to `music-c0-contracts.yml` — after line 64, NOT before 105 [R2]**

Revision 1 put this before `music:types:scoped` (line 105). **That would not have fixed either `Music contracts` check:** the steps that *execute* the cross-boundary tests are line 68 (Linux, `npm test --prefix tunes -- --run server/test/contracts`) and lines 88-104 (the Windows named list) — both **earlier** than 105. Insert immediately after `- run: npm ci --prefix tunes` (line 64):

```yaml
      # Both the Linux contracts run below and music:types:scoped reach explorers-earth
      # sources, so this must precede them, not sit at the end of the job.
      - run: npm ci --prefix explorers-earth
```

- [ ] **Step 4: Add the install to the image pipeline**

In `.github/workflows/tunes.yml`, in the `Test Tunes` step (`working-directory: tunes`):

```yaml
          npm ci --legacy-peer-deps
          npm ci --prefix ../explorers-earth
          node node_modules/tsx/dist/cli.mjs scripts/music-image-ci-tests.ts
```

- [ ] **Step 5: Verify both the typecheck and the execution path [R2]**

```bash
cd tunes && npx tsc --project tsconfig.music-c0.json && npm test -- --run server/test/contracts
```

Expected: typecheck exit 0, and the contracts run with no `Cannot find package '@playwright/test'` / `Cannot find module ... react-vertical-timeline-component`. (Other failures here are Tasks 5-10.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/test.yml .github/workflows/music-c0-contracts.yml .github/workflows/tunes.yml
git commit -m "ci: install explorers-earth deps before the steps that reach across the boundary

The C0 contract suites assert against explorers-earth's real harness and real
frontend types, so four jobs typecheck or execute files that resolve react,
dompurify, zod and @playwright/test out of explorers-earth/node_modules. None
installed them. static already had the install steps 26 lines below the
typecheck that needs them, so this costs no extra time there; in
music-c0-contracts the install must precede the Linux contracts run at line 68,
not the typecheck at line 105.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Regenerate the two stale snapshots

`0b4cac23` added one import line to `canonicalApp.ts`, shifting 7 route line numbers; the app-enrichment work added 4 scheduled-callback rows and 2 routes. Clears a failing test in `docs-contracts`, `unit-coverage`, `security`, and 2 of the 9 files in `build-test-scan-push`.

**Order is load-bearing:** `music-authorization-matrix.test.ts` builds its expectation from a **live source scan**, not the committed inventory, so regenerating the matrix from a stale inventory would still fail.

- [ ] **Step 1: Confirm both fail**

```bash
cd tunes && npm test -- --run server/test/contracts/runtime-surface-inventory.test.ts server/test/contracts/music-authorization-matrix.test.ts
```

Expected: 2 failed, `to deeply equal` in each.

- [ ] **Step 2: Regenerate, inventory first**

```bash
cd tunes && npx tsx scripts/inventory-runtime-surfaces.ts --write && npx tsx scripts/generate-music-authorization-matrix.ts
```

- [ ] **Step 3: Check diff size and CRLF**

```bash
git diff --stat docs/architecture/
```

Expected: ~14 changed lines in the inventory, ~82 in the matrix. **If either shows thousands, stop** — that is CRLF churn under `core.autocrlf=true` (both writers emit `\n`), not content. Neither generator writes any other committed file.

- [ ] **Step 4: Run all four dependent suites**

```bash
cd tunes && npm test -- --run server/test/contracts/runtime-surface-inventory.test.ts server/test/contracts/music-authorization-matrix.test.ts server/test/contracts/music-documentation-contract.test.ts server/test/music-surface-policy.test.ts
```

Expected: 0 failures. (`music-surface-policy` reads the *committed* inventory and asserts counts and fail-closed decisions, so it is the one that would catch a bad regeneration.)

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/music-runtime-surface-inventory.json docs/architecture/music-authorization-matrix.json
git commit -m "chore(docs): regenerate the runtime surface inventory and authorization matrix

0b4cac23 added one import line to canonicalApp.ts, shifting 7 route line
numbers; 12abecb9/b9dea2a6 added 4 scheduled-callback surfaces and 2
app-enrichment routes. Neither snapshot was regenerated, failing one test each
in docs-contracts, unit-coverage and security. Generated output only -- no
generator and no comparator was edited.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tier 2 — The one genuine product bug

### Task 4: Scope the custody guard to the current database

`pg_shdepend` is a **cluster-shared** catalog with a `dbid` column; `prepareAppWorkerCustody` omits it. Migration `0056` creates ~17 `GRANT`s (deptype `a`) and three `ALTER FUNCTION ... OWNER TO` (deptype `o`), and `sealAppWorkerCustody` never drops the four roles. So the first database in a cluster migrates fine and **every later database sees the first one's rows and fails closed** — 15 files / 26 failures, all aborting at `migrate.ts:260`. Local runs never hit it because only one database is migrated.

`dbid = 0` stays admitted: that is how genuinely cluster-wide (shared-object) authority keeps refusing.

- [ ] **Step 1: Write the failing test [R2]**

Revision 1's mock returned `{rows: []}` for every query. `prepareAppWorkerCustody` first runs a `rolsuper AS privileged` check and throws `Privileged Apps worker migration authority required` unless exactly one row says `privileged`, so the function would die **before** `pg_shdepend` was ever issued — the test could not fail for the stated reason, nor pass after the fix. Use the sibling idiom at `app-enrichment-worker-custody.test.ts:13`, and insert the case **inside** the existing `describe` (line 16 is its closing `});`):

```typescript
it('scopes the shared dependency guard to this database while still refusing shared-object authority', async () => {
  const statements: string[] = [];
  const client = {query: async (sql: string) => {
    statements.push(sql);
    return {rows: sql.includes('rolsuper AS privileged') ? [{privileged: true}] : []} as never;
  }};
  await prepareAppWorkerCustody(client as never);
  const guard = statements.find((sql) => sql.includes('pg_shdepend'));
  expect(guard).toBeDefined();
  // pg_shdepend is cluster-shared: without this predicate the guard sees authority the
  // roles hold in OTHER databases of the same cluster, so the second database ever
  // migrated through 0056 fails closed.
  expect(guard).toContain('current_database()');
  // dbid=0 is shared-object authority and must still refuse.
  expect(guard).toContain('d.dbid=0');
});
```

- [ ] **Step 2: Run it to verify it fails for the right reason**

```bash
cd tunes && npm test -- --run server/test/contracts/app-enrichment-worker-custody.test.ts
```

Expected: FAIL on `expected '...' to contain 'current_database()'` — **not** on `Privileged Apps worker migration authority required` and **not** on `expect(guard).toBeDefined()`. If you see either of those, the mock is still wrong.

- [ ] **Step 3: Add the `dbid` predicate**

Replace lines 20-23 of `tunes/server/db/app-enrichment-worker-custody.ts`:

```typescript
 const authorityDependencies=await client.query(`SELECT true AS unsafe FROM pg_catalog.pg_shdepend d
 JOIN pg_catalog.pg_roles r ON r.oid=d.refobjid
 WHERE d.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND r.rolname=ANY($1::text[])
 AND d.deptype IN ('a','o','i')
 -- pg_shdepend is a cluster-shared catalog. Without this predicate the guard sees
 -- authority these roles hold in *other* databases of the same cluster, so the second
 -- database ever migrated through 0056 fails closed. dbid=0 is retained deliberately:
 -- shared-object authority must still refuse.
 AND (d.dbid=0 OR d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()))
 LIMIT 1`,[[...roles]]);
```

The added text `FROM pg_catalog.pg_database` matches no existing SQL-text-keyed mock predicate, so the three other mocks in that suite are unaffected.

- [ ] **Step 4: Run the contract, then two real sequential databases**

```bash
cd tunes && npm test -- --run server/test/contracts/app-enrichment-worker-custody.test.ts
```

Expected: PASS.

```bash
cd tunes && MUSIC_C3_POSTGRES_TEST=1 npm run test:integration -- server/test/migrations/music-migration.integration.test.ts
```

Expected: 0 failures, no `Unsafe Apps worker existing object authority`. Note this is only a true proof if **two** databases are created in one cluster; the `database` job is the real arbiter.

**If `database` is still red after this**, the next place to look is `pg_auth_members` (lines 16-18), also cluster-shared and with no `dbid` column at all. It only fires on role memberships, which `0056` does not create — so this fix is probably sufficient, but that is where a residual failure would live.

- [ ] **Step 5: Commit**

```bash
git add tunes/server/db/app-enrichment-worker-custody.ts tunes/server/test/contracts/app-enrichment-worker-custody.test.ts
git commit -m "fix(db): scope the Apps worker custody guard to the current database

pg_shdepend is cluster-shared and the guard omitted its dbid column, so once
migration 0056 had created its GRANTs and function ownerships in one database,
every later database in the same cluster saw those rows and refused with
'Unsafe Apps worker existing object authority' -- 15 files and 26 failures in
the database lane, which creates a fresh database per test. dbid=0 stays
admitted so genuine shared-object authority still fails closed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tier 3 — Make Windows-authored tests portable

These files pass on Windows and **cannot** pass on Linux; they were never gated, so they read as product failures in two Linux jobs. The repo already has the right convention in `guides-bootstrap-contract.test.ts:13-24`: resolve the interpreter from an env var, refuse to skip when a `*_REQUIRED` variable is set, print the reason and embed it in the suite title. Reuse it — *a silent skip is as bad as a false failure*.

### Task 5: Remove **four** committed personal paths and gate per-case

**[R2] Revision 1 found three paths and gated whole describes. Both were wrong:**

- There is a **fourth** hardcoded path at line 159: `C:/Users/TK/AppData/Local/Temp/explorers-wave1-tools/node-v24.21.0-win-x64/node.exe`, inside the describe at line 94. Gating that describe hides it on Linux but does not fix it — and Step 4 adds this file to the **Windows** lane with `REQUIRED=1`, where pwsh resolves, so the case runs and dies on a `node.exe` path absent from a hosted runner. Revision 1 would have traded a Linux failure for a **new Windows failure**.
- Gating whole describes **loses currently-green Linux coverage**: describe@94 holds four pure-JS `it`s (lines 112, 130, 138, 146) that import `guides-parent-supervision` and spawn nothing; describe@488 has non-spawning `it`s at 518 and 522. Those pass on Linux today. Gate **per-`it`**.

Confirmed facts: `describe` is imported (line 1); `statSync` is **not** (the file imports `readFileSync` and `existsSync`); the three pwsh spawns are at 99, 492, 536 (the `'C:\\pwsh.exe'` strings at 121 and 218 are inert fixtures); describe titles are `'Guides parent job contract'` (94), `'Guides R1 review regressions'` (488), `'Guides coordinated worker bootstrap ABI'` (528).

- [ ] **Step 1: Add the gate header**

After the existing imports, adding `statSync` to the `node:fs` import:

```typescript
// HARNESS GATE (not a product assertion). The cases below drive a real PowerShell 7 host
// chosen explicitly through GUIDES_POWERSHELL_EXECUTABLE. This file previously hardcoded one
// developer's cache paths, so on every other host it reported failures that read as lifecycle
// product defects. Rule: executable genuinely unavailable => LOUD, reasoned skip; variable set
// and naming a real file => the cases run and FAIL for real if the gate's subject is wrong.
const configuredPwsh=process.env.GUIDES_POWERSHELL_EXECUTABLE;
const pwshUnavailable=((): string|undefined=>{
 if(process.platform!=='win32')return `host platform is ${process.platform}, and this native lifecycle gate is Windows-only`;
 if(!configuredPwsh)return 'GUIDES_POWERSHELL_EXECUTABLE is unset, so no PowerShell 7 host was selected for the native lifecycle gate';
 try{if(!statSync(configuredPwsh).isFile())return 'GUIDES_POWERSHELL_EXECUTABLE is set but does not name a regular file';}
 catch{return 'GUIDES_POWERSHELL_EXECUTABLE is set but the executable it names is not present on this host';}
 return undefined;
})();
if(pwshUnavailable&&process.env.LIFECYCLE_BROWSER_GATE_REQUIRED)throw new Error(`LIFECYCLE_BROWSER_GATE_REQUIRED is set, so the native lifecycle gate must execute, but ${pwshUnavailable}`);
if(pwshUnavailable)console.warn(`[SKIP] lifecycle-browser-support.test.ts: ${pwshUnavailable}. Harness gate unavailable - this is NOT a passing lifecycle product contract and NOT a product defect.`);
// Per-CASE gating: these describes also hold pure-JS cases that pass on Linux today.
const nativeIt=pwshUnavailable?it.skip:it;
const pwsh=configuredPwsh as string;
```

- [ ] **Step 2: Replace all four hardcoded paths [R2]**

Lines 99, 492, 536 — first argument becomes `pwsh`:

```typescript
const output = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
```

Line 159 — use the Node already running the suite:

```typescript
        // process.execPath is the interpreter running this suite; the previous literal was
        // one developer's temp toolchain and exists on no other host, CI included.
        try { result = execFileSync(process.execPath, [probe], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
```

Confirm none remain:

```bash
cd tunes && grep -n "C:/Users/TK" server/test/contracts/lifecycle-browser-support.test.ts
```

Expected: no output.

- [ ] **Step 3: Gate only the spawning cases [R2]**

Change `it(` to `nativeIt(` for exactly the cases that spawn PowerShell — those containing lines 99, 492 and 536. **Leave every non-spawning case as `it(`**, in particular lines 112, 130, 138, 146, 518 and 522, which run on Linux today. Line 159's case now uses `process.execPath` and needs no gate.

- [ ] **Step 4: Require the gate in the Windows lane**

In `.github/workflows/music-c0-contracts.yml`, in the `env:` block of the Windows-only step beside `GUIDES_BOOTSTRAP_GATE_REQUIRED`:

```yaml
          LIFECYCLE_BROWSER_GATE_REQUIRED: "1"
```

and add to that step's test list:

```yaml
          server/test/contracts/lifecycle-browser-support.test.ts
```

- [ ] **Step 5: Verify BOTH paths [R2]**

Windows, gate required — proves the cases really ran:

```bash
cd tunes && GUIDES_POWERSHELL_EXECUTABLE='C:\Users\TK\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' LIFECYCLE_BROWSER_GATE_REQUIRED=1 npm test -- --run server/test/contracts/lifecycle-browser-support.test.ts
```

Expected: 0 failures, **no `[SKIP]` line**. Note the **backslashes** — `assertGuidesPowerShellRuntime` demands `path.resolve(x) === x`, which a forward-slash path fails.

Skip path — proves the non-spawning cases still execute:

```bash
cd tunes && npm test -- --run server/test/contracts/lifecycle-browser-support.test.ts
```

Expected: the `[SKIP]` warning, 0 failures, and a **non-zero passed count** (the pure-JS cases). A passed count of 0 means the gating is too broad.

- [ ] **Step 6: Commit**

```bash
git add tunes/server/test/contracts/lifecycle-browser-support.test.ts .github/workflows/music-c0-contracts.yml
git commit -m "test(lifecycle): resolve interpreters from the environment, not committed personal paths

Four call sites spawned one developer's machine paths -- three a pwsh under
~/.cache and one a node.exe under AppData/Local/Temp -- so on every other host
the suite failed with ENOENT in a way that read as a lifecycle product defect.
Adopts the GUIDES_POWERSHELL_EXECUTABLE + *_GATE_REQUIRED convention already
used by guides-bootstrap-contract, uses process.execPath for the node probe,
and gates per case rather than per describe so the pure-JS cases that pass on
Linux today keep running. Named in the Windows lane with the REQUIRED flag set
so the gate cannot silently stop running.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Exercise the win32 closure deterministically with `path.win32`

`apps-private-custody.test.ts:18` injects `{platform:'win32'}` but passes the **real** `node:path`. On Linux, `join`/`dirname` treat `C:\Temp\...` as one relative segment, so the win32 branches get POSIX semantics — proven by the mixed-separator message `"{ path: 'C:\Temp/explorers-profile-e...' }"`. Injecting `path.win32` makes the suite **stronger**: the win32 logic then runs identically on every host.

- [ ] **Step 1: Inject the win32 path implementation**

At line 18, change the first injected argument from `path` to `path.win32`:

```typescript
  // The closure under test is given {platform:'win32'}, so it must also be given the
  // win32 path implementation -- otherwise POSIX join/dirname semantics apply to
  // 'C:\Temp\...' and the win32 branches are never really exercised.
  const actual=new Function('path','process','canonical','privateOperation','remember','registerAppsPrivateDirectory','inspectAppsPrivateDescendant','Refusal',code)(path.win32,{platform:'win32'},/* ...rest unchanged... */
```

Edit only that one argument; leave the remaining arguments byte-identical.

- [ ] **Step 2: Run it**

```bash
cd tunes && npm test -- --run server/test/contracts/apps-private-custody.test.ts
```

Expected: 15 tests, 0 failures, no mixed `C:\Temp/` separators.

- [ ] **Step 3: Commit**

```bash
git add tunes/server/test/contracts/apps-private-custody.test.ts
git commit -m "test(apps): inject path.win32 so the win32 custody closure runs on any host

The suite injected {platform:'win32'} but the real node:path, so on Linux the
win32 branches ran with POSIX join/dirname semantics and 15 assertions failed
with mixed 'C:\\Temp/' separators. Passing path.win32 makes the win32 logic
genuinely exercised on both platforms rather than skipped on one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Make the parity controller fixture path platform-neutral

**[R2] Scope corrected.** Revision 1 claimed both parity files hardcode `'C:\\public-synthetic\\descriptor.json'`. Verified false: `public-parity-spec-contract.test.ts` contains **zero** `C:` literals. Only `public-parity-controller.test.ts` does, at line 6 (`privateFile`) and inline at line 4 — 2 occurrences, 40 failures.

`canonical()` at `explorers-earth/e2e/replatform/public-parity-controller.ts:80` requires `path.isAbsolute`, false on Linux → `denied()`. That is production harness code and keeps its check; only the fixture literal is Windows-specific, so make it host-canonical rather than skipping 40 assertions.

**`public-parity-spec-contract.test.ts`'s 5 Linux failures are a Task 2 install problem** (`Cannot find package '@playwright/test' imported from ... public-parity-spec-support.ts:6`), not a path literal. It is listed here only so it is not mistaken for unexplained.

- [ ] **Step 1: Make the fixture path host-canonical**

Replace line 6:

```typescript
// canonical() requires path.isAbsolute, which is platform-specific. The controller logic
// under test is not Windows-only -- only this literal was -- so derive an absolute path
// for the host and keep all cases running on both platforms.
const privateFile=process.platform==='win32'?'C:\\public-synthetic\\descriptor.json':'/public-synthetic/descriptor.json';
const origin='http://127.0.0.1:43123';
```

- [ ] **Step 2: Substitute the inline literals at line 4**

```typescript
PUBLIC_PARITY_E2E_FIXTURE_PATH:privateFile,REPLATFORM_E2E_FIXTURE_PATH:privateFile
```

**`privateFile` is declared at line 6, after its use at line 4.** `const` is not hoisted, so either move the declaration above line 4 or inline the ternary at line 4. Verify no literal remains:

```bash
cd tunes && grep -c "public-synthetic" server/test/contracts/public-parity-controller.test.ts
```

Expected: 1 (the ternary only).

- [ ] **Step 3: Run both suites**

```bash
cd tunes && npm test -- --run server/test/contracts/public-parity-controller.test.ts server/test/contracts/public-parity-spec-contract.test.ts
```

Expected: 45 tests, 0 failures — the spec-contract half passing because Task 2 installed `explorers-earth` deps.

- [ ] **Step 4: Commit**

```bash
git add tunes/server/test/contracts/public-parity-controller.test.ts
git commit -m "test(parity): derive the fixture descriptor path for the host

public-parity-controller hardcoded a C:\\ descriptor path and canonical()
requires path.isAbsolute, so all 40 cases were denied on Linux. The controller
logic is not Windows-specific -- only the literal was -- so the cases now run
on both platforms instead of being gated off one. canonical()'s isAbsolute
check is untouched. public-parity-spec-contract has no such literal; its Linux
failures were the missing explorers-earth install.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Raise two spawn budgets that sit below their own test timeout

`tunes/vitest.config.ts` sets no `testTimeout`, so Vitest's default 5000 ms applies. Two consequences:

1. `guides-bootstrap-contract.test.ts` — `ps()` (line 31) allows a **10 000 ms** spawn inside a 5000 ms test, so the spawn budget is unreachable and a cold hosted PowerShell start always "times out". **[R2]** Only **one** `it` uses `ps()` (line 33, calling it at line 42); the `it` at line 45 spawns via its own inline `execFileSync(pwsh, ...)` at line 51 with its own timeout — check that value too.
2. `music-fixture-services.test.ts:52` — `timeout: 1_000` for a cold Windows PowerShell 5.1 start on a hosted runner.

Neither touches an assertion; the process-creation-ticks check is untouched.

- [ ] **Step 1: Give both spawning cases a budget above their spawn's [R2]**

Append `,60_000` as the **third argument** to the `it` at line 33 and the `it` at line 45. Do not retype either body:

```typescript
 }, 60_000);
```

- [ ] **Step 2: Raise the PowerShell 5.1 start budget**

```typescript
      // A cold Windows PowerShell 5.1 start on a hosted runner exceeds 1s routinely.
      // This bounds latency only; the returned process-creation ticks are still asserted.
      { encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
```

- [ ] **Step 3: Run both on Windows**

```bash
cd tunes && GUIDES_POWERSHELL_EXECUTABLE='C:\Users\TK\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' GUIDES_BOOTSTRAP_GATE_REQUIRED=1 npm test -- --run server/test/contracts/guides-bootstrap-contract.test.ts server/test/contracts/music-fixture-services.test.ts
```

Expected: 0 failures, no `[SKIP]`.

- [ ] **Step 4: Commit**

```bash
git add tunes/server/test/contracts/guides-bootstrap-contract.test.ts tunes/server/test/contracts/music-fixture-services.test.ts
git commit -m "test(windows): lift two spawn budgets above their own test timeouts

guides-bootstrap-contract allowed a 10s spawn inside Vitest's 5s default test
timeout, so the spawn budget was unreachable; music-fixture-services allowed 1s
for a cold PowerShell 5.1 start. Both bound latency, not correctness, and no
assertion changes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: BLOCKED — needs an owner decision **[R2]**

`placesWriterGuardTransport.ts:37` fails bootstrap if `now()-began>=1000`. Under 312-file parallel load on a hosted runner that fires as `Error: Fixture guard bootstrap`, aborting `places-writer-race-controller`.

**Revision 1 proposed raising it to 5000 ms. That is not a free change.** `places-writer-guard-transport.test.ts:24` is titled *"collection remains inert and bootstrap has a local 1000ms budget"* and proves it with a fake clock advancing exactly 1000 ms per write, asserting `expect(()=>guard.bootstrap()).toThrow()`. At a 5000 ms budget the clock reaches only 2000, nothing rejects, and that assertion fails — so raising the budget means **editing a deliberate assertion and falsifying its title**. Revision 1's verification ran only the race-controller suite and would never have seen it.

Four suites consume the helper: `places-bootstrap-diagnostic.test.ts:34`, `places-writer-guard-transport.test.ts:4`, `places-writer-race-controller.test.ts:5`, `explorers-place-pins.integration.test.ts:6`. The first three run in `contracts` and in `build-test-scan-push`.

- [ ] **Step 1: Establish whether the failure is load-induced or deterministic**

```bash
cd tunes && npm test -- --run server/test/contracts/places-writer-race-controller.test.ts
cd tunes && npm test -- --run server/test
```

If it passes alone and fails in the full run, it is contention, which decides between the options.

- [ ] **Step 2: Present the options and STOP**

- **(a) Serialize the file, keep the budget.** No assertion changes. Requires a Vitest mechanism to exempt one file from `fileParallelism` — **feasibility unverified**; check before offering it.
- **(b) Raise the budget to 5000 ms and update `places-writer-guard-transport.test.ts:24` plus its title** to say 5000 ms. Honest, but it edits an assertion the constraint protects.
- **(c) Leave it.** One failure persists in `contracts` and `build-test-scan-push`; neither reaches green.

Do not proceed without a decision. If (b) is chosen, the commit must name the assertion and title change explicitly — not describe it as a timeout tweak.

---

### Task 10: Supply the missing harness binding

`GuideSectionForm.tsx:1112` calls `guideDescriptionText(...)` inside `handleSubmit`, but the test compiles that initializer with `new Function(...Object.keys(context), ...)` and `context` never supplies the binding → `ReferenceError`, 6 failures. The sibling `GuideSectionForm.description.test.ts:21` does it correctly. The util is real: `explorers-earth/src/utils/guideDescriptionText.ts:15`.

- [ ] **Step 1: Import the util**

Beside the `travelModeConfig` import at line 9:

```typescript
import {guideDescriptionText} from '../../../../explorers-earth/src/utils/guideDescriptionText';
```

- [ ] **Step 2: Insert the binding surgically [R2]**

Line 27 is a single ~900-character statement. **Do not retype it.** Insert the one identifier after `calculateTravelTime,`:

```
calculateTravelTime,guideDescriptionText,...overrides};
```

- [ ] **Step 3: Run it**

```bash
cd tunes && npm test -- --run server/test/contracts/guides-fullform-preservation.test.ts
```

Expected: 0 failures, no `ReferenceError`.

- [ ] **Step 4: Commit**

```bash
git add tunes/server/test/contracts/guides-fullform-preservation.test.ts
git commit -m "test(guides): inject guideDescriptionText into the form-preservation harness

handleSubmit calls guideDescriptionText, but the compiled-initializer harness
never supplied the binding, so all 6 cases died with a ReferenceError that read
as a form defect. The sibling description suite already injects it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Anchor the browser lane's spec filters

`test.yml:276` passes bare basenames. Playwright treats each as a **regex over the full test path**, so `music.spec.ts` also matches `e2e/replatform/music.spec.ts`, which throws `Owned Music fixture missing` at import because `MUSIC_E2E_FIXTURE_PATH` is set in no workflow — the run exits 1 before any browser test executes. `ci.yml:426` already anchors identically. Verified: `e2e/music.spec.ts` does not match `music-accessibility.spec.ts`.

- [ ] **Step 1: Anchor each filter**

```yaml
        # Bare basenames are regexes over the full test path and also match
        # e2e/replatform/music.spec.ts, which requires MUSIC_E2E_FIXTURE_PATH and throws
        # at import. Anchor to e2e/ as ci.yml already does. The replatform spec keeps its
        # own protected lane; nothing is skipped here.
        run: npm run test:e2e --prefix explorers-earth -- e2e/music.spec.ts e2e/account-lifecycle.spec.ts e2e/music-accessibility.spec.ts --project=chromium-pr-safe --project=firefox-music-visual --project=webkit-music-visual --retries=0
```

- [ ] **Step 2: Confirm the selection**

```bash
cd explorers-earth && npx playwright test e2e/music.spec.ts e2e/account-lifecycle.spec.ts e2e/music-accessibility.spec.ts --project=chromium-pr-safe --list
```

Expected: no path under `e2e/replatform/`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci(browser): anchor the e2e spec filters to the legacy directory

Playwright filters are regexes over the full path, so bare music.spec.ts also
matched e2e/replatform/music.spec.ts, which throws at import without
MUSIC_E2E_FIXTURE_PATH -- failing the lane before any browser test ran. ci.yml
already anchors its filters this way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Tier 4 — Two stale Playwright fixtures

### Task 12: Give the public-shell timeline place an `id`

`24b942c0` added a filter to `normalizeRenderableGuide` (`PublicGuideDetailPage.tsx:61`, under `components/`); `legacyPlace()` rejects a place with no `id`, conversion returns `{ok:false}`, and the `.flatMap` drops the section. The fixture place at `public-shell-continuity.spec.ts:264` has no `id`, so `sections` is empty, `hasPlacesForMap` is false, the "Map View" button never renders, and `click` times out at 12 000 ms. 10 of the file's 11 tests pass.

The rejection is deliberate and unit-tested (`publicGuidePhotoViewModel.test.ts:41` asserts `{...legacy(), id: undefined}` → `{ok:false}`), so production is right and the fixture is stale.

- [ ] **Step 1: Add the `id`**

```typescript
      morning: [{ id: 'fixture-map-entry', place_id: 'fixture-map-place', name: 'Fixture map place', formatted_address: 'Fixture City', geometry: { location: { lat: 26.9124, lng: 75.7873 } }, photos: [] }],
```

- [ ] **Step 2: Run the lane**

```bash
cd explorers-earth && npx playwright test --config=playwright.public-shell-continuity.config.ts --project=chromium
```

Expected: 11 passed, 0 failed.

- [ ] **Step 3: Commit**

```bash
git add explorers-earth/e2e/public-shell-continuity.spec.ts
git commit -m "test(public-shell): give the fixture timeline place the id the view model requires

24b942c0 made section conversion reject a place without an id, and
normalizeRenderableGuide drops the whole section when conversion fails. The
fixture place had no id, so the guide rendered with no sections, the Map View
button never appeared and the click timed out. The production rejection is
unit-tested and unchanged; only the stale fixture moves.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Flagged, not fixed here:** that `.flatMap` silently discards an **entire guide section** when a **single** place fails validation. If any real stored legacy place lacks an `id`, public guides lose content rather than degrade. Per-place rejection is intentional; the whole-section amplification likely is not. It needs its own reviewed change and must not ride inside a fixture commit.

---

### Task 13: Serve the canonical places envelope from the contained harness

`343df2dd` introduced `publicProfilePagination.ts`, whose `placeParent()` rejects any places payload lacking a full canonical envelope: `collection_revision` and `category_content_revision` as `/^\d+$/`, `eligibility_fingerprint` as `/^[a-f0-9]{64}$/`, `eligible_item_count`/`eligible_pin_count` as safe non-negative integers with pin ≤ item, and `recommended_places_next_cursor` matching `/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/` or `null`. Any miss throws `PUBLIC_PROFILE_INVALID_RESPONSE`.

`e2e/setup/category-navigation.ts` is unchanged across all 374 commits and serves **none** of those fields, so every places response is rejected on arrival. That one rejection explains all three failures: the paging test shows the category error state, and `MapView.tsx` falls into its `error && !hasUsableData` branch (`"Failed to Load Map"`) instead of the `!mapsApiLoaded` branch (`"Map Unavailable"`) under assertion.

**Which side is canonical was resolved from the server projection, not guessed:** `postgresPublicProfileGateway.ts` passes `movieCursorSecret` into `publicPlacesProjection`, so the real gateway mints **signed**, dot-separated cursors. The client is correct; the harness and the test's hardcoded `o24` are stale.

**Both reviews independently verified the envelope arithmetic** against every gate — fingerprint regex, revision format, pin ≤ item, cursor shape, `placesSelection` already including `documentId` and `slug`, the spread ordering, the 36-item slice math (24 then 12), `mergePlacePage`'s terminal count and offset-disjoint duplicate rules, and `usePublicProfileDetail.ts:14` exempting places from the `rows.length!==pageSize` throw. The arithmetic is right; revision 1's **edit range** was not.

- [ ] **Step 1: Replace lines 371-374 — NOT 371-378 [R2]**

Lines 375-379 are the `match[2]` ternary (`: {}),` on 379). Replacing through 378 deletes its opening and orphans line 379, a syntax error. Replace **371-374** and leave 375-380 untouched:

```typescript
        // Places cursors are opaque and signed on the real gateway (publicPlacesProjection
        // is given movieCursorSecret), so the harness mints the same `<offset>.<signature>`
        // shape the client validates, and tolerates it on the way back in.
        const offset = cursor && /^o(?:0|[1-9][0-9]{0,4})(?:\.[-_A-Za-z0-9]+)?$/.test(cursor)
          ? Number(cursor.slice(1).split('.')[0]) : 0;
        const relation = recommendationRelationByRoute[category.route];
        const placesEnvelope = (list: Record<string, unknown>, served: number) => {
          const total = Array.isArray(list[relation]) ? (list[relation] as unknown[]).length : 0;
          return {
            collection_revision: String(state.revision),
            category_content_revision: String(state.revision),
            eligibility_fingerprint: 'f'.repeat(64),
            eligible_item_count: total,
            eligible_pin_count: 0,
            recommended_places_next_cursor: served < total ? `o${served}.fixture` : null,
          };
        };
        const pageList = (list: Record<string, unknown>) => ({
          ...(category.route === 'places' ? project(placesSelection, list) : list),
          ...(category.route === 'places'
            ? placesEnvelope(list, match[2] ? offset + limit : Math.min(24, Array.isArray(list[relation]) ? (list[relation] as unknown[]).length : 0))
            : {}),
```

After editing, confirm the file still parses — **nothing typechecks it** (`tsconfig.app.json` includes only `src`, and no tunes test imports this harness), so a type error would otherwise first appear at Playwright runtime:

```bash
cd explorers-earth && npx tsc --noEmit --allowJs false --skipLibCheck e2e/setup/category-navigation.ts
```

A clean parse is the bar here; module-resolution complaints from the ad-hoc invocation are acceptable, a syntax error is not.

- [ ] **Step 2: Grow the paging fixture to 36**

The existing `?limit=24&cursor=o24` expectation is **unsatisfiable as written**, independent of the harness: `readNext` takes the places cursor from the server-provided `movieCursors` and only falls back to `` `o${offset}` `` for non-places categories; and with exactly 24 items the envelope requires `next_cursor: null`, so no second request may be issued at all. The fixture must exceed one page for the test's own stated intent — "one bounded unauthenticated next-page request" — to remain assertable.

At `category-navigation-a.spec.ts:401`:

```typescript
  // A bounded next page only exists when the collection exceeds one page, which the
  // canonical envelope now states explicitly instead of inferring it from a full page.
  list.recommended_places = Array.from({ length: 36 }, (_, index) => ({
```

- [ ] **Step 3: Match the signed cursor**

At line 428:

```typescript
    await expect.poll(() => requests.some((request) => request.search === '?limit=24&cursor=o24.fixture')).toBe(true);
```

The bound, the single-request claim and the `authorization === undefined` check all stay.

- [ ] **Step 4: Enumerate request-count assertions before running [R2]**

With the envelope served, `completePlacesPreviews` now loops until the cursor is null for every places list — requests that **never happened before**, because places previews threw immediately. Any test asserting an exact request count or a "single request" invariant may break.

```bash
cd explorers-earth && grep -n "requests.length\|requests.filter\|toHaveLength" e2e/category-navigation-a.spec.ts e2e/category-navigation-b.spec.ts e2e/contained-auth-session.spec.ts e2e/music-publish-controls.spec.ts
```

Review each hit against the new request pattern before proceeding. Also check whether any places test uses `kind:'partial'` — the harness injects `null` into the root list there, and `documentRow(null)` still throws `PUBLIC_PROFILE_INVALID_RESPONSE`; the envelope does not change that:

```bash
cd explorers-earth && grep -n "partial" e2e/category-navigation-a.spec.ts e2e/category-navigation-b.spec.ts
```

- [ ] **Step 5: Run ALL FIVE lanes that import this harness [R2]**

Revision 1 ran three. Twelve spec files import `category-navigation.ts`; five are reached by PR jobs, and two of those are **currently green** — `🎭 E2E Category B` and `🎭 E2E Publishing`. A shared-harness edit must be proven against both.

```bash
cd explorers-earth && npx playwright test --config=playwright.category-navigation-a.config.ts --project=chromium-pr-safe --retries=0
cd explorers-earth && npx playwright test --config=playwright.contained-auth-session.config.ts --project=chromium-pr-safe --retries=0
cd explorers-earth && npx playwright test --config=playwright.category-navigation-b.config.ts --project=chromium-pr-safe --retries=0
cd explorers-earth && npx playwright test --config=playwright.music-publishing.config.ts --retries=0
cd explorers-earth && npx playwright test --config=playwright.public-shell-continuity.config.ts --project=chromium
```

Expected: 0 failures in all five. Specifically, the two matrix viewports reach `Map Unavailable` and `Paging Place 24` is visible.

- [ ] **Step 6: Run the frontend unit lane, serially [R2]**

`publicProfilePagination` has unit tests pinning the envelope, and this is the only cross-ticket gate. Note the lane's real command takes a `run` argument:

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run
```

Expected: 0 failures across ~390 files / ~5322 tests.

- [ ] **Step 7: Commit**

```bash
git add explorers-earth/e2e/setup/category-navigation.ts explorers-earth/e2e/category-navigation-a.spec.ts
git commit -m "test(category-nav): serve the canonical places envelope from the contained harness

343df2dd made the client require a full places envelope (revisions, 64-hex
eligibility fingerprint, eligible counts, signed next cursor) and reject any
payload without it. The contained harness was never updated and served none of
those fields, so every places response threw PUBLIC_PROFILE_INVALID_RESPONSE --
showing the category error state in the paging test and pushing MapView into
its error branch instead of the Map Unavailable branch under assertion. Which
side is canonical was resolved from the server projection: the real gateway
mints signed cursors, so the harness was stale. The paging fixture grows to 36
because with exactly 24 items the envelope requires a null next cursor, making
the test's own second-page assertion unsatisfiable. No assertion is weakened.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Residual risk, accepted knowingly:** `placesEnvelope` derives `collection_revision` from the live `state.revision`, which `category-navigation.ts:527` increments on a publication-mode change. `mergePlacePage` throws `PUBLIC_PROFILE_409` when that value differs between pages, so a spec that flips mode *between* two page requests would 409. No current spec is known to; if one appears, pin the value per list instead.

---

# Tier 5 — 251 lint errors

`explorers-earth/eslint.config.js` is **byte-identical** between `622f6893` and this head, and the same ESLint at `d0194a7e` gives **251 errors / 1858 warnings — identical**. Nothing was promoted to error; the errors accumulated across the 358. **Do not touch the config, do not add `allowEmptyCatch`, do not add blanket `eslint-disable`.**

The gate: job `lint` / `🔍 Lint`, `ci.yml:41-42`, `npm run lint` → `explorers-earth/package.json:13` `eslint .`, no `--max-warnings`, so it exits non-zero on any error and zero with warnings only. `eslint.config.js:8` ignores only `dist`, so `e2e/**`, `scripts/**` and `src/**` are all in scope. `lint` is a `needs` of `replatform-required`.

| rule | n | nature |
|---|---|---|
| `no-empty` | 151 | mechanical |
| `@typescript-eslint/no-unsafe-function-type` | 47 | type-only |
| `no-unsafe-finally` | 15 | **real bug** |
| `prefer-const` | 7 | autofixable |
| `no-empty-pattern` | 6 | mechanical |
| `@typescript-eslint/no-unused-expressions` | 6 | mechanical |
| `no-useless-escape` | 5 | autofixable |
| `react-hooks/rules-of-hooks` | 5 | **real bug, production code** |
| `no-constant-condition` | 4 | mechanical |
| `no-control-regex` | 3 | mechanical |
| `no-useless-catch`, `no-ex-assign` | 2 | mechanical |

Total 251: **231 mechanical/type-only** (Task 14) and **20 behavioural** (Task 15). **[R2]** Revision 1 said "229" in one place and 231 in another; 231 is correct.

### Task 14: Clear the 231 mechanical and type-only errors

- [ ] **Step 1: Record the baseline**

```bash
cd explorers-earth && npx eslint . 2>&1 | tail -3
```

Expected: `✖ 2109 problems (251 errors, 1858 warnings)`

- [ ] **Step 2: Apply the autofixable subset — scoped [R2]**

Revision 1 used `--fix --rule '{...}'`, which **adds** severities but leaves `--fix` applying **every** fixable rule in the config, including fixes for the 1858 warnings, across `src/**`, `e2e/**` and `scripts/**` — an unreviewed mass edit of production code gated by four currently-green checks. Scope it and review the diff:

```bash
cd explorers-earth && npx eslint . --fix --fix-type problem && git diff --stat
```

Inspect the diff before continuing. If it reaches files with no `prefer-const` or `no-useless-escape` error, discard and fix the 12 sites by hand.

- [ ] **Step 3: Fix `no-empty` the way the repo already does**

`e2e/replatform/guides.spec.ts:335` sets the precedent — a comment inside the block satisfies the rule without changing behaviour:

```typescript
catch{/* Passive classification preserves the original failure. */}
```

Apply per site with an **honest, site-specific** reason. Do not paste one generic comment 151 times; where a block's reason is not clear, move that site to Task 15.

- [ ] **Step 4: Replace bare `Function` types**

These sit in AST-transpile diagnostic harnesses (`guidesOwnerReadOracle.test.tsx:22`, `peopleColdEntryDiagnostic.test.ts:9`). Replace `Function` with the actual call shape, e.g. `(...args: never[]) => unknown`. **Type-only — if a retype changes any assertion on exact source text, revert that site and handle it in Task 15.**

- [ ] **Step 5: Fix the remaining mechanical rules**

`no-empty-pattern`, `no-unused-expressions`, `no-constant-condition`, `no-control-regex`, `no-useless-catch`, `no-ex-assign` — one reviewed line each.

- [ ] **Step 6: Confirm only the two real-bug groups remain**

```bash
cd explorers-earth && npx eslint . 2>&1 | tail -3
```

Expected: 20 errors — the 15 `no-unsafe-finally` and 5 `react-hooks/rules-of-hooks`.

- [ ] **Step 7: Run the full gate set this touches [R2]**

`src/**` edits are gated by four currently-green checks, and the coverage lane enforces per-file 100% thresholds:

```bash
cd explorers-earth && npx tsc -b && npm run build && node scripts/run-contained-vitest.cjs run && npm run test:music-critical-coverage
```

Expected: all four clean. **`tsc -p tsconfig.json` is a false green here — it checks nothing**; `tsc -b` (as `ci.yml:69` runs) is the real check. Then revert the build's side effects:

```bash
git checkout -- explorers-earth/public/robots.txt explorers-earth/public/sitemap.xml
```

- [ ] **Step 8: Commit with an explicit path list [R2]**

Not `git add -A` — that would sweep up `public/` artifacts if a revert was missed.

```bash
git status --short explorers-earth/public/
git add $(cd explorers-earth && npx eslint . -f json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log([...new Set(JSON.parse(s).map(f=>f.filePath))].join(' '))})")
git commit -m "style(explorers-earth): clear 231 mechanical and type-only lint errors

All 251 errors predate the 2026-10-15 commits -- the same ESLint run at
d0194a7e reports an identical 251/1858, and eslint.config.js is byte-identical
to 622f6893. This clears the mechanical and type-only groups only. The config
is untouched and no rule is disabled. The two groups that can change runtime
behaviour (no-unsafe-finally, react-hooks/rules-of-hooks) are left for a
separate reviewed commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Fix the 20 errors that can change behaviour

Real defects, reviewed per site, never bulk-edited.

- [ ] **Step 1: Enumerate the exact sites**

```bash
cd explorers-earth && npx eslint . -f json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const f of JSON.parse(s))for(const m of f.messages)if(m.severity===2)console.log(f.filePath+':'+m.line+' '+m.ruleId)})"
```

- [ ] **Step 2: Fix `no-unsafe-finally` per site**

A `throw` inside `finally` **discards the original exception** — a cleanup failure masks the real one. This is the same class of defect as the reverted `69b78c65`, which turned loud refusals into silent drops. Per site:

```typescript
let failure: unknown;
try { /* body */ } catch (error) { failure = error; }
finally { /* cleanup that no longer throws */ }
if (failure) throw failure;
```

**[R2] Note on verification reach:** the `no-unsafe-finally` sites in `e2e/replatform/*.spec.ts` are **lint-gated only** — no PR job executes those specs, so their runtime behaviour is exercised only by the nightly `replatform-real-stack` lane. Treat those edits as unverified-by-CI and keep them minimal.

- [ ] **Step 3: Fix the 5 `rules-of-hooks` violations**

`src/features/Guides/components/CreateGuideStep1.tsx` is **production** Guides code consumed by the frontend unit lane *and* the Guides e2e lanes; conditional or nested hook calls change render behaviour. Hoist each hook to the component's top level and move the condition into the hook's argument or the rendered output. **Do not reorder hooks relative to one another.**

- [ ] **Step 4: Confirm zero errors**

```bash
cd explorers-earth && npx eslint . 2>&1 | tail -3
```

Expected: `0 errors`. Warnings may remain — the gate is 0 errors with a warning burn-down.

- [ ] **Step 5: Run the full gate set, then the Guides lane**

```bash
cd explorers-earth && npx tsc -b && npm run build && node scripts/run-contained-vitest.cjs run && npm run test:music-critical-coverage
git checkout -- explorers-earth/public/robots.txt explorers-earth/public/sitemap.xml
```

Expected: all clean. The Guides protected lane refuses a dirty tree, so commit Step 6 first, then:

```bash
node scripts/replatform-e2e.mjs --lane guides
```

Expected: no new failure beyond the known-unstable case 4 recorded in `guides-case4-instability-2026-10-15.md`.

- [ ] **Step 6: Commit**

```bash
git add explorers-earth/src explorers-earth/e2e
git commit -m "fix(lint): correct 20 lint errors that affect behaviour

no-unsafe-finally (15 sites): a throw inside finally discards the original
exception, so a cleanup failure masked the real failure -- the same class of
defect as the reverted 69b78c65. Each site now preserves and rethrows the
original. react-hooks/rules-of-hooks (5 sites in CreateGuideStep1.tsx):
conditional hook calls in production Guides code, hoisted to the top level with
the condition moved into the hook argument. Reviewed per site, not bulk-edited.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Final verification

- [ ] **Step 1: Full local sweep [R2]**

Revision 1 chained `cd tunes && ... cd explorers-earth`, which fails from inside `tunes`. Run from the repo root, one line at a time:

```bash
cd tunes && npm test -- --run server/test
```

```bash
cd explorers-earth && npx eslint . 2>&1 | tail -3
```

```bash
cd explorers-earth && npx tsc -b && node scripts/run-contained-vitest.cjs run
```

```bash
cd tunes && npx tsc --project tsconfig.music-c0.json
```

```bash
node --test scripts/*.test.mjs
```

- [ ] **Step 2: Confirm a clean tree, then push**

```bash
git status --short
git push origin codex/unified-replatform
```

Then poll until every check settles.

- [ ] **Step 3: Record the outcome honestly**

Append to `docs/replatform-audit/reconciliation-2026-10-15.md`: the pushed head, per-check before/after, and above all **whether `platform-fixture` reached the probe stage**. Only a run where the `explorers` image builds can say anything about `88a72cbe`. If the five probe bodies fail, that is Wave 3's first real result — record it as such. Also record Task 9's disposition, and that the `e2e/replatform/` edits remain CI-unverified by design.

## Self-review

**Spec coverage.** `platform-fixture`→1 (build only; probes explicitly out of scope); `static`/`contracts`/`Music contracts`×2→2 (+5,6,7,8,10); `docs-contracts`/`unit-coverage`/`security`→3; `database`→4; `build-test-scan-push`→1,3,5,6,7,8,9,10; `browser`→11; `E2E Public shell`→12; `E2E Category A`→13; `Lint`→14,15; `replatform-required`/`music-required`→consequential, deliberately no task.

**Known gaps, stated rather than hidden.** (1) `platform-fixture`'s five probes may fail — this plan cannot say. (2) Task 9 is blocked on a decision. (3) `build-test-scan-push` runs the whole tunes tree; if a Windows-only file outside Tasks 5-10 surfaces there, it needs the same per-case gate treatment. (4) The `no-unsafe-finally` edits under `e2e/replatform/` are verified by no PR job. (5) Whether the 251/1858 counts still hold at this exact head was not re-measured; Task 14 Step 1 measures it.

**Type consistency.** `pwsh`/`configuredPwsh`/`pwshUnavailable`/`nativeIt` (Task 5) follow the `configured`/`unavailable`/`suite` convention without colliding; `privateFile` (Task 7) is the existing identifier, with its declaration-order hazard called out; `placesEnvelope`/`pageList`/`offset`/`relation` (Task 13) match the harness's names; `guideDescriptionText` (Task 10) matches the export at `src/utils/guideDescriptionText.ts:15`.
