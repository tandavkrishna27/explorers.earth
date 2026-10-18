# Subscription, Payment and Billing Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** remove every subscription, payment, billing and Razorpay surface from the product,
because the product launches free (backbone decision D3).

**Architecture:** delete, don't port. This is phase **P4** of
`docs/superpowers/plans/2026-10-17-explorers-launch-backbone.md`, independent of every other
phase and shippable now. There is no database work. Because the work is deletion-heavy the
usual failing-test-first discipline inverts: most tickets name the characterisation tests that
must *keep* passing and the tests that die with their subject. Two tickets add or change
behaviour (the onboarding rename, the FAQ copy fix) and those use the normal test-first shape.

**Tech stack:** React 18 + Vite + TypeScript (`explorers-earth/`), Express + TypeScript
(`tunes/`), Vitest, Playwright.

---

## Read this before you touch anything

### Verification record — what the scoping pass got wrong

This plan was written against the merge of `origin/main` at `605f708b`. Every claim below was
re-verified by reading code. **Five claims in the inherited scoping summary were wrong**, three
of them in ways that would have turned a lane red:

| Inherited claim | Verdict | Reality |
|---|---|---|
| "Not one subscription, payment, **plan or billing** table, column or enum value exists" | **Wrong as stated, right in substance** | A `price_tier` column with a `'Subscription'` enum value does exist — `tunes/migrations/0043_explorers_apps_provider_context.sql:32`, re-validated at `tunes/migrations/0055_explorers_app_enrichment.sql:257`, typed at `tunes/shared/explorersAppContract.ts:23`. It is the **price tier of a third-party app in the Apps category** — product metadata, not our billing. Likewise `tunes/migrations/0051_explorers_launch_controls.sql:82` and `tunes/server/repositories/musicDomainRepository.ts:73` say "billing" only to deny being billing (they bound YouTube API spend). **Preserve all of it.** The actionable conclusion survives: there is no database work in this plan. |
| "`src/content/reference/en.json` … Only `en.json` carries it" | **Wrong** | The ₹300 claim is in **all ten locales**. See T5 for the exact 20 line numbers. |
| "`contained-unit-env.cjs` and its **two test copies** must move in the same commit" | **Wrong, and pointed at the wrong hazard** | There is exactly **one** `contained-unit-env.cjs` (sha256-verified: no copy anywhere in the tree). Nothing in this plan moves it. The real hazard is different and is documented as Trap B below. |
| "the Billing panel also holds the billing-address form, which stays" | **Right, but not where implied** | The address form is **not** inside `BillingTab.tsx` — that file is 100% subscription machinery (three accordions: Usage Dashboard, Current Plan, Browse Plans; `grep -i address` returns nothing). The form is the panel's *sibling* component, `<ProfileAccountSettings section="billing" />` at `explorers-earth/src/features/Settings/Settings.tsx:912`, fed by `getBillingAddressFields` at `explorers-earth/src/features/Profile/config/profileFormSections.tsx:234`. So the conclusion holds — `settingsTabs` stays at two (`Settings.tsx:41`) and no tab is renamed — but `BillingTab.tsx` can be deleted whole without touching the form. |
| "about 85% of it is already dead code … `BillingTab` is the only part still executing" | **Right** | Both gated pages are wrapper components that short-circuit *before* the real body renders (`SubscriptionPlans.tsx:847`, `Checkout.tsx:1100`), so no hook and no query runs. `BillingTab`'s four `useReactQuery` calls are all `enabled`-gated on accordion state (`BillingTab.tsx:92,106,115,124`). Confirmed. |

Two further things the scoping pass did not mention at all, both of which break a lane:

- **An e2e spec asserts `BillingTab`'s own content.** `explorers-earth/e2e/profile-editor-polish.spec.ts:1367-1373` clicks the `"Current Plan"` accordion button and asserts `"No Active Plan"` is visible — that string is `BillingTab.tsx:291` and `:414`. Handled in T1.
- **A second false pricing claim exists in the FAQ**, separate from the ₹300 one: *"Premium features for businesses and advanced analytics are available through our paid plans."* Also in all ten locales. Handled in T5.

### Evidence standard

Verify against code, never documentation — `docs/` has drifted repeatedly and
`docs/tunes/integrations.md:36-53` currently documents four backend files
(`paymentRoutes.ts`, `paymentController.ts`, `subscriptionRoutes.ts`,
`subscriptionController.ts`) **none of which exist**. Cite `path:line`. A grep count cannot
distinguish a live call from dead code — follow reachability.

### Coordination: this plan owns `MusicSubscriptionContainment`

`explorers-earth/src/components/MusicSubscriptionContainment.tsx` (14 lines) is touched by both
this phase and the Music-deletion phase (P3). **P4 owns it and T3 deletes it. The Music phase
must not delete it, and must not delete any of its consumers.** Its complete consumer set, as
of `605f708b`, is three files and all three are deleted by this plan:

| Consumer | `path:line` | Deleted by |
|---|---|---|
| `BillingTab.tsx` | `explorers-earth/src/features/Settings/components/BillingTab.tsx:10` | T1 |
| `SubscriptionPlans.tsx` | `explorers-earth/src/pages/SubscriptionPlans.tsx:12` | T2 |
| `Checkout.tsx` | `explorers-earth/src/pages/Checkout.tsx:21` | T2 |

Its own test, `explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx`,
imports all three (`:6`, `:7`, `:8`) and is retired across T1 and T2. Everything else that
names the string is an inert record — `scripts/browser-baselines/{music,publishing,source-v2,source-v3}.json`,
`.superpowers/sdd/epic-01/task4.1-protected62-final151-passed-receipt.json`,
`docs/replatform-audit/**` — verified to have no reader that compares them to the tree.

**If the Music phase lands first and has already deleted the component, T3 becomes a no-op for
that file; check before deleting and say so in the commit.**

### Do not touch

`docker-compose.replatform.yml` contains the owner's real Google OAuth credentials in the
working tree. No ticket in this plan needs it.

---

## Standing constraints

### The four commands that prove the tree is green

Run from the repository root unless stated.

| # | Command | What it proves |
|---|---|---|
| G1 | `cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1` | The frontend unit lane (~325 files). **Must be `run-contained-vitest.cjs`** — it rejects `--no-file-parallelism`, and plain `vitest` misses the synthetic-env containment. |
| G2 | `cd explorers-earth && npx tsc -b` | Frontend typecheck. **Never `tsc -p tsconfig.json`** — that file is `{"files": [], "references": [...]}` (`explorers-earth/tsconfig.json:1-6`) so it checks nothing and always reports success. `tsc -b` follows the references. Note `tsconfig.app.json:28` excludes tests, so test files are *not* typechecked — a leftover import of a deleted module surfaces in G1, not G2. |
| G3 | `node scripts/generate-music-fixture-dockerignore.mjs --check` | Both generated Docker context manifests match the tracked file list. Exits 0 silently when green. |
| G4 | `cd tunes && npm test -- --run server/test/contracts/music-compose-safety.test.ts` | The contract that runs G3 in CI (`tunes/server/test/contracts/music-compose-safety.test.ts:61-67`). |

`tsconfig.app.json:23` sets `noUnusedLocals: true` and `noUnusedParameters: true`, so **every
deletion must remove its now-unused imports in the same commit** or G2 fails.

**Install all three lockfiles before you trust G1.** This repo is not an npm workspace — it has
three independent lockfiles (root, `explorers-earth/`, `tunes/`). Running G1 with only
`explorers-earth/node_modules` installed yields **8 failed files / 2 failed tests** that are
nothing to do with your change: `src/test/__tests__/category-discovery.test.ts` and seven
siblings shell out to Playwright configs that import from `tunes/`, and fail with
`Cannot find package 'zod' imported from …/tunes/…`. Measured on an otherwise-clean
`605f708b`: `Test Files 8 failed | 383 passed (391)`, `Tests 2 failed | 5196 passed (5198)`,
duration 604s. **Capture your own pre-ticket baseline and compare against it** rather than
expecting a literal `0 failed`; where this plan says "Expected: `0 failed`", read it as "no
failures beyond your recorded baseline".

Also: if you pipe G1 through `tail` or `head`, the shell reports the *pager's* exit code, not
vitest's. Read the summary line, not `$?`.

### Trap A — the generated Docker context manifests (breaks two CI lanes)

`.dockerignore` and `explorers-earth/Dockerfile.music-fixture.dockerignore` are **generated
default-deny allow-lists of tracked files**. Eight of this plan's deletion targets appear in
each, at `:434`, `:437`, `:896`, `:1040`, `:1063`, `:1090`, `:1091`, `:1100`.

The generator is `scripts/generate-music-fixture-dockerignore.mjs`, and it enumerates files with
`git ls-files -z -- explorers-earth/src explorers-earth/public` (`:111`). **Consequence: it reads
the git index, not the working tree.** So in every deletion ticket the order is:

```bash
git rm <files>
node scripts/generate-music-fixture-dockerignore.mjs --write
git add .dockerignore explorers-earth/Dockerfile.music-fixture.dockerignore
```

Deleting with `rm` instead of `git rm`, or running `--write` before staging the removal,
produces no manifest change and leaves G3/G4 red. A stale manifest fails
`.github/workflows/music-c0-contracts.yml:73` and `.github/workflows/test.yml:148` with
`"Music fixture Docker context manifest is stale."`

### Trap B — the 21-key synthetic VITE matrix (asserted in three places)

`explorers-earth/scripts/contained-unit-env.cjs` freezes a 21-key `VITE_*` matrix including
`VITE_PAYMENT_API_URL` (`:6`) and `VITE_RAZORPAY_KEY_ID_DEV` / `VITE_RAZORPAY_KEY_ID_PROD`
(`:19`). The same 21 keys are duplicated as literals in two test files, and
`explorers-earth/src/test/__tests__/contained-unit.launcher.test.ts:140-163` asserts **exact set
equality in both directions** between the matrix keys and every `VITE_[A-Z0-9_]+` identifier it
finds by recursively scanning `explorers-earth/src`.

**Verified: this plan does not break it, and this plan does not change those three files.** After
T3 deletes `paymentService.ts:19-20`, the two Razorpay identifiers still occur in
`explorers-earth/src/test/__tests__/contained-unit.environment.test.ts:69-70`, which *is* inside
the scanned tree (the scan at `:143-144` skips only `contained-unit.policy.test.ts` and
`contained-unit.launcher.test.ts`), so `discovered` remains a 21-key set. `VITE_PAYMENT_API_URL`
likewise survives via `explorers-earth/src/features/music/__tests__/replatformLocalVite.test.ts:32`.

**The rule this implies:** do **not** "tidy up" the three frontend VITE vars out of
`contained-unit-env.cjs`. If a future ticket ever does, it must edit all three of
`scripts/contained-unit-env.cjs:6,19`, `contained-unit.launcher.test.ts:37,51,52` and
`contained-unit.environment.test.ts:55,69,70` **in one commit**, and also remove the surviving
test-side identifiers — otherwise the set equality fails from one side or the other. That is the
hazard the inherited summary was reaching for. It is out of scope here.

### Trap C — the coverage ratchet is a floor, and deletion pushes coverage *down*

`explorers-earth/vitest.config.ts:59` sets global thresholds
`{ statements: 8, branches: 6, functions: 6, lines: 8 }`, deliberately "set just under measured
coverage (8.81/6.87/6.63/8.74 on 2026-07-10) so coverage can only rise". The measured headroom on
lines was **0.74 percentage points**.

This plan deletes **3,562 source lines out of 54,187** non-test `src` lines (6.6% of the
frontend), and the deleted set is **better covered than the repository average** — `paymentService.ts`
(435 lines) and `subscriptionService.ts` (263 lines) each have a dedicated unit test, and
`BillingTab.tsx` (668 lines) is rendered for real by the containment test. Removing
better-than-average-covered code lowers the global percentage.

**So treat a coverage threshold failure as an expected outcome, not a defect.**

One procedural note, measured rather than assumed: on a run with failing test files, vitest
printed **no coverage report at all** and wrote no `explorers-earth/coverage/` directory, even
though the wrapper does accept `--coverage` (`scripts/run-contained-vitest.cjs:66`). So the
ratchet is only measurable on an otherwise-green suite. That is why the coverage step in each
ticket comes *after* the green check, not with it — and why the three-lockfile install above is a
precondition, not a nicety.

The rule, applied in T1, T2 and T3:

1. Run `cd explorers-earth && node scripts/run-contained-vitest.cjs run --coverage --maxWorkers 1`.
   If it prints no coverage table, the suite is not green — fix that first; the number is not
   available yet.
2. If every threshold still passes, change nothing.
3. If a threshold fails, read the four measured percentages off the report and lower that
   threshold in `explorers-earth/vitest.config.ts:59` to the **floor of the measured value**
   (e.g. measured 7.63 → `lines: 7`), **in the same commit as the deletion**, and record both
   the old and the new measured numbers in the commit message.
4. Never lower a threshold below the measured value minus 1. The ratchet must stay a real gate.

Lowering a ratchet is normally forbidden. It is legitimate here only because the denominator
shrank: no test was deleted that covered surviving code. State that reasoning in the commit.

### Which of this plan's work is *not* in a CI lane

For honest reporting: `explorers-earth/e2e/profile-editor-polish.spec.ts` (T1) runs only in
`.github/workflows/frontend-e2e-qualification.yml:56`, lane `remaining-contained-contracts` —
which is a Strapi-era lane and is not known to pass today. Fix the spec because it is wrong
otherwise, but do not claim the fix is verified by a green lane unless you actually ran it.

---

## File inventory

Everything this plan deletes, with its current size and the ticket that removes it.

| File | Lines | Ticket |
|---|---|---|
| `explorers-earth/src/features/Settings/components/BillingTab.tsx` | 668 | T1 |
| `explorers-earth/src/pages/SubscriptionPlans.tsx` | 851 | T2 |
| `explorers-earth/src/pages/Checkout.tsx` | 1104 | T2 |
| `explorers-earth/src/components/PaymentModeToggle.tsx` | 98 | T2 |
| `explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx` | 84 | T1 (trimmed) → T2 (deleted) |
| `explorers-earth/src/services/subscriptionService.ts` | 263 | T3 |
| `explorers-earth/src/services/paymentService.ts` | 435 | T3 |
| `explorers-earth/src/types/payment.ts` | 129 | T3 |
| `explorers-earth/src/components/MusicSubscriptionContainment.tsx` | 14 | T3 |
| `explorers-earth/src/services/__tests__/subscriptionService.test.ts` | 132 | T3 |
| `explorers-earth/src/services/__tests__/paymentService.test.ts` | 222 | T3 |
| `tunes/server/utils/razorpayConfig.ts` | 107 | T6 |
| `tunes/server/utils/razorpayPlanMapping.ts` | 46 | T6 |

Modified, not deleted: `Settings.tsx`, five Settings test files, `AppRoutes.tsx`,
`ProtectedRoutes.tsx`, `ProtectedRoute.tsx`, `CookieConsent.tsx`, `OnBoarding.tsx`, ten locale
JSON files, two generated `.dockerignore` files, `tunes/package.json`, `tunes/package-lock.json`,
`docker-compose.yml`, two `.env.example` files, three workflow files, and the docs listed in T6.

### Ticket order and sizes

| Ticket | Scope | Size |
|---|---|---|
| T1 | Delete `BillingTab`, repair its five Settings test mocks, its e2e assertion, the manifests | **M** |
| T2 | Delete the two gated pages, `PaymentModeToggle`, both route tables, two path allow-lists | **M** |
| T3 | Delete the services, payment types, `MusicSubscriptionContainment`, two service tests | **S** |
| T4 | Onboarding rename + delete its unreachable plan-return branches *(test-first)* | **S** |
| T5 | Fix two false pricing claims across ten locales *(test-first)* | **S** |
| T6 | Backend dead code, the `razorpay` dependency, compose/env/CI vars, misleading docs | **M** |
| T7 | **Deferred — do not ship with P4.** Tombstone removal | **L** |

T1 → T2 → T3 must run in that order (each removes the consumers the next one needs gone). T4,
T5 and T6 are independent of all of them and of each other.

---

## Task T1: Delete the Billing tab panel

`BillingTab.tsx` is the only subscription code still executing. Its four queries are
`enabled`-gated on accordion state so nothing fires on render, and its backend
(`/api/subscriptions/*`) is already tombstoned — this is not an incident, but it is the right
first ticket because it is self-contained.

Deleting it leaves `<ProfileAccountSettings section="billing" />` as the Billing panel's sole
occupant, so the tab survives and `settingsTabs` stays `['account', 'billing']`.

**Files:**
- Delete: `explorers-earth/src/features/Settings/components/BillingTab.tsx`
- Modify: `explorers-earth/src/features/Settings/Settings.tsx:7` and `:913`
- Modify: `explorers-earth/src/features/Settings/__tests__/Settings.canonical-navigation.test.tsx:9`
- Modify: `explorers-earth/src/features/Settings/__tests__/Settings.lifecycle-identity.test.tsx:22`
- Modify: `explorers-earth/src/features/Settings/__tests__/Settings.music-publishing.test.tsx:20`
- Modify: `explorers-earth/src/features/Settings/__tests__/Settings.native-visibility-investigation.test.tsx:8`
- Modify: `explorers-earth/src/features/Settings/__tests__/Settings.profile-account-placement.test.tsx:109-111` and `:477`
- Modify: `explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx:8`, `:48-72`
- Modify: `explorers-earth/e2e/profile-editor-polish.spec.ts:1367-1373`
- Regenerate: `.dockerignore`, `explorers-earth/Dockerfile.music-fixture.dockerignore`

### Characterisation tests that must keep passing

These prove the Billing *tab* and the billing-address form survive. Do not weaken them.

- `explorers-earth/src/features/Settings/__tests__/Settings.profile-account-placement.test.tsx:460`
  — `it("places private identity in Account and billing address in Billing")`. After this ticket
  it still asserts two tabs, `aria-selected` switching, and `moved-billing`
  (the `ProfileAccountSettings` mock from `:104-108`) present in the Billing panel. Only the
  `existing-billing` assertion at `:477` goes.
- `explorers-earth/src/features/Settings/components/__tests__/ProfileAccountSettings.test.tsx:215`
  — `it("uses every detailed address field in Settings Billing")`. Untouched; this is the
  address form's own characterisation test.
- `explorers-earth/src/features/Profile/config/__tests__/profileFormSections.test.tsx:106` —
  asserts the six `getBillingAddressFields` field *names*. Untouched.

### Tests deleted alongside their subject

- `musicSubscriptionContainment.test.tsx:53-72`, `it("refuses a free-plan upgrade from Billing
  instead of writing a subscription")` — its subject is `BillingTab`'s refusal branch
  (`BillingTab.tsx:229`). The file's other two tests cover the two pages and survive until T2.

---

- [ ] **Step 1: Confirm the gate is green before you change anything**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --check
```

Expected: exit 0, no output. If it already fails, stop — something else is stale and this
ticket's signal would be unreadable.

- [ ] **Step 2: Remove the two references in `Settings.tsx`**

Delete line 7 entirely:

```tsx
import BillingTab from "./components/BillingTab";
```

Then at `:912-913`, delete the `<BillingTab />` line so the panel reads:

```tsx
            <ProfileAccountSettings section="billing" />
          </div>
        )}
```

- [ ] **Step 3: Drop the `BillingTab` mock from the four test files that stub it to null**

In each of these, delete the single `vi.mock` line:

- `Settings.canonical-navigation.test.tsx:9` — `vi.mock('../components/BillingTab', () => ({ default: () => null }));`
- `Settings.lifecycle-identity.test.tsx:22` — `vi.mock("../components/BillingTab", () => ({ default: () => null }));`
- `Settings.music-publishing.test.tsx:20` — `vi.mock('../components/BillingTab', () => ({ default: () => null }));`
- `Settings.native-visibility-investigation.test.tsx:8` — `vi.mock('../components/BillingTab', () => ({ default: () => null }));`

A `vi.mock` of a path that no longer resolves is an error, not a no-op — this is why they must go
in the same commit as the deletion.

- [ ] **Step 4: Fix the placement test**

In `Settings.profile-account-placement.test.tsx`, delete the mock at `:109-111`:

```tsx
vi.mock("../components/BillingTab", () => ({
  default: () => <div data-testid="existing-billing">Existing billing</div>,
}));
```

and delete the one assertion that depends on it, at `:477`:

```tsx
    expect(screen.getByTestId("existing-billing")).toBeInTheDocument();
```

Leave `:476` (`moved-billing`) and `:478` (`moved-account` absent) exactly as they are — those
are the assertions that prove the tab and the address form survive.

- [ ] **Step 5: Trim the containment test to the two surviving subjects**

In `musicSubscriptionContainment.test.tsx`, delete the `BillingTab` import at `:8`:

```tsx
import BillingTab from "../../features/Settings/components/BillingTab";
```

and delete the whole second test together with the comment block that explains it, `:48-72`
(from `// Step 9. BillingTab was the third entrance…` through the closing `});` of
`it("refuses a free-plan upgrade from Billing instead of writing a subscription")`).

The two remaining tests (`:41` and `:74`) still exercise `SubscriptionPlans` and `Checkout` and
must still pass.

- [ ] **Step 6: Fix the e2e spec that asserts `BillingTab`'s own accordion**

In `explorers-earth/e2e/profile-editor-polish.spec.ts`, delete `:1367-1373`:

```ts
      const currentPlan = page.getByRole("button", {
        name: "Current Plan",
        exact: true,
      });
      await currentPlan.click();
      await expect(page.getByText("No Active Plan", { exact: true }))
        .toBeVisible();
```

`"Current Plan"` is `BillingTab.tsx:593` and `"No Active Plan"` is `BillingTab.tsx:291`/`:414`;
both disappear with the component. Everything else in that test
(`#settings-panel-billing` at `:1350`, `[data-profile-account-settings="billing"]` at `:1353`,
the `"Billing Address"` button at `:1356`, the input values at `:1358-1361`) comes from
`Settings.tsx` and `ProfileAccountSettings.tsx` and must be left intact — it is the e2e
characterisation of the surviving panel.

- [ ] **Step 7: Remove the file from the index, then regenerate the manifests**

Order matters — the generator reads `git ls-files`.

```bash
git rm explorers-earth/src/features/Settings/components/BillingTab.tsx
node scripts/generate-music-fixture-dockerignore.mjs --write
```

- [ ] **Step 8: Prove the tree is green**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --check
```

Expected: exit 0, no output.

```bash
cd explorers-earth && npx tsc -b
```

Expected: no output, exit 0. A `TS6133` ("declared but its value is never read") here means a
leftover import from Step 2 — `noUnusedLocals` is on.

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Expected: `0 failed`. The summary line must show two fewer tests than the pre-ticket baseline
(the deleted containment test, and nothing else). If any `Settings.*` test fails with
`Cannot find module '../components/BillingTab'`, a `vi.mock` from Step 3 was missed.

```bash
cd tunes && npm test -- --run server/test/contracts/music-compose-safety.test.ts
```

Expected: `0 failed`, including
`it("keeps the generated exact tracked-file fixture context synchronized")`.

- [ ] **Step 9: Check the coverage ratchet and apply the Trap C rule**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --coverage --maxWorkers 1
```

If the run ends with `ERROR: Coverage for lines (…) does not meet global threshold (8)` or
similar, apply **Trap C** above: lower only the failing thresholds in
`explorers-earth/vitest.config.ts:59` to the floor of the measured value, and record the measured
numbers in the commit message. If all thresholds pass, change nothing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(settings): delete the subscription Billing panel

The product launches free (backbone D3), so BillingTab's three subscription
accordions have no subject. The Billing tab itself stays: the billing-address
form is ProfileAccountSettings section=billing, a sibling of the deleted
component, so settingsTabs remains ['account','billing'] and no e2e selector
for the tab changes.

Repairs the five Settings tests that mocked the component, trims the one
containment test whose subject was its refusal branch, drops the e2e
assertion on its Current Plan accordion, and regenerates both Docker context
manifests (generated from git ls-files).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T2: Delete the gated pages, their routes and `PaymentModeToggle`

`SubscriptionPlans` and `Checkout` are wrapper components whose entire body is unreachable:
each returns `<MusicSubscriptionUnavailable />` before rendering its real implementation
(`SubscriptionPlans.tsx:847`, `Checkout.tsx:1100`). Nothing renders a hook or issues a request.
Deleting them removes 1,955 lines and both route registrations.

**Files:**
- Delete: `explorers-earth/src/pages/SubscriptionPlans.tsx`
- Delete: `explorers-earth/src/pages/Checkout.tsx`
- Delete: `explorers-earth/src/components/PaymentModeToggle.tsx`
- Delete: `explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx`
- Modify: `explorers-earth/src/routes/AppRoutes.tsx:11-12`, `:38-39`
- Modify: `explorers-earth/src/routes/ProtectedRoutes.tsx:15-16`, `:162-163`
- Modify: `explorers-earth/src/components/ProtectedRoute.tsx:26`
- Modify: `explorers-earth/src/features/LandingPage/components/CookieConsent.tsx:22`, `:44`
- Regenerate: `.dockerignore`, `explorers-earth/Dockerfile.music-fixture.dockerignore`

### Characterisation tests that must keep passing

- `explorers-earth/src/__tests__/ProtectedRoutes.test.tsx` — the route-table test. It must still
  pass with both routes gone; if it names `/subscription-plans` or `/checkout`, that assertion is
  part of this ticket (grep it in Step 1 rather than assuming).
- `explorers-earth/src/features/LandingPage/components/__tests__/CookieConsent.public-nav.test.tsx`
  — verified **not** to assert the contents of `INTERNAL_FIRST_PATH_SEGMENTS`, so editing the set
  is safe. It must still pass.

### Tests deleted alongside their subject

- `explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx` — the whole file.
  After T1 it holds exactly two tests, `:41` and `:74`, whose subjects are the two pages deleted
  here. Nothing it asserts outlives the pages.

---

- [ ] **Step 1: Find out whether the route test names these paths**

```bash
cd explorers-earth && grep -rn "subscription-plans\|/checkout" src/__tests__/ProtectedRoutes.test.tsx
```

Expected: no output. If there are hits, remove those cases in Step 5 — they are route-table
assertions for routes this ticket deletes.

- [ ] **Step 2: Remove both route registrations from `AppRoutes.tsx`**

Delete the two imports at `:11-12`:

```tsx
import SubscriptionPlans from "../pages/SubscriptionPlans";
import Checkout from "../pages/Checkout";
```

and the two routes at `:38-39`:

```tsx
        <Route path="/subscription-plans" element={<SubscriptionPlans />} />
        <Route path="/checkout" element={<Checkout />} />
```

- [ ] **Step 3: Remove both route registrations from `ProtectedRoutes.tsx`**

Delete the two imports at `:15-16`:

```tsx
import SubscriptionPlans from "../pages/SubscriptionPlans";
import Checkout from "../pages/Checkout";
```

and the two routes at `:162-163`:

```tsx
      <Route key="subscription-plans" path="/subscription-plans" element={<SubscriptionPlans />} />
      <Route key="checkout" path="/checkout" element={<Checkout />} />
```

- [ ] **Step 4: Drop the two paths from the onboarding allow-list**

`explorers-earth/src/components/ProtectedRoute.tsx:26` currently reads:

```tsx
  const allowedDuringOnboarding = ["/onboarding", "/music", "/recommendations/music", "/instagram", "/subscription-plans", "/checkout"];
```

Replace with:

```tsx
  const allowedDuringOnboarding = ["/onboarding", "/music", "/recommendations/music", "/instagram"];
```

- [ ] **Step 5: Drop the two slugs from the cookie-banner internal-path set**

`CookieConsent.tsx`'s `INTERNAL_FIRST_PATH_SEGMENTS` (declared at `:17`) decides whether a first
path segment is an app route or a public-profile username, which only chooses the banner's
vertical offset (`:143`). With the routes gone, these two slugs are no longer internal routes.

Delete `'checkout',` at `:22` and `'subscription-plans',` at `:44`.

Verified: no server-side reserved-handle list contains either slug, and no test asserts the set's
contents, so this is a behaviour-correct, test-neutral edit.

- [ ] **Step 6: Remove the files from the index and regenerate the manifests**

```bash
git rm explorers-earth/src/pages/SubscriptionPlans.tsx \
       explorers-earth/src/pages/Checkout.tsx \
       explorers-earth/src/components/PaymentModeToggle.tsx \
       explorers-earth/src/pages/__tests__/musicSubscriptionContainment.test.tsx
node scripts/generate-music-fixture-dockerignore.mjs --write
```

`PaymentModeToggle` goes here because `Checkout.tsx:777` and `:973` were its only two consumers
(verified: no other file imports it).

- [ ] **Step 7: Prove the tree is green**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --check
```

Expected: exit 0, no output. (Only three of the four deleted files appear in the manifests — the
generator filters `.test.` paths — so the diff shows three removed lines per file, not four.)

```bash
cd explorers-earth && npx tsc -b
```

Expected: no output, exit 0.

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Expected: `0 failed`, and two fewer tests than after T1.

```bash
cd tunes && npm test -- --run server/test/contracts/music-compose-safety.test.ts
```

Expected: `0 failed`.

- [ ] **Step 8: Check the coverage ratchet**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --coverage --maxWorkers 1
```

Apply the **Trap C** rule. This is the ticket most likely to trip it — 1,955 of the deleted lines
land here.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(routes): delete the contained subscription and checkout pages

Both pages were wrapper components that returned MusicSubscriptionUnavailable
before rendering their bodies, so 1,955 lines were unreachable. The product
launches free (backbone D3), so there is nothing to port.

Removes both route registrations from AppRoutes and ProtectedRoutes, drops the
two paths from the onboarding allow-list, drops the two slugs from the cookie
banner's internal-path set (they are no longer app routes), deletes
PaymentModeToggle whose only consumer was Checkout, and retires the containment
test whose two remaining subjects were these pages.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T3: Delete the services, payment types and the containment component

With `BillingTab`, `SubscriptionPlans` and `Checkout` gone, every consumer of the service layer
is gone. Verified closure as of `605f708b`: `subscriptionService`, `paymentService`,
`types/payment`, `isFreePlan` and `MusicSubscriptionContainment` are imported *only* by those
three files and by their own tests.

**This ticket deletes `MusicSubscriptionContainment.tsx`. The Music phase must not.** See
"Coordination" above.

**Files:**
- Delete: `explorers-earth/src/services/subscriptionService.ts`
- Delete: `explorers-earth/src/services/paymentService.ts`
- Delete: `explorers-earth/src/types/payment.ts`
- Delete: `explorers-earth/src/components/MusicSubscriptionContainment.tsx`
- Delete: `explorers-earth/src/services/__tests__/subscriptionService.test.ts`
- Delete: `explorers-earth/src/services/__tests__/paymentService.test.ts`
- Regenerate: `.dockerignore`, `explorers-earth/Dockerfile.music-fixture.dockerignore`

### Characterisation tests that must keep passing

- `explorers-earth/src/test/__tests__/contained-unit.launcher.test.ts:140-163` — the exact
  `VITE_*` set-equality test. **Verified green after this deletion** (see Trap B): the two
  Razorpay identifiers survive in `contained-unit.environment.test.ts:69-70`, which is inside
  the scanned tree. This is the single most important assertion in this ticket; run it explicitly
  in Step 3 rather than trusting the suite summary.
- `explorers-earth/src/test/__tests__/contained-unit.environment.test.ts` — untouched, must pass.

### Tests deleted alongside their subject

- `explorers-earth/src/services/__tests__/subscriptionService.test.ts` (132 lines) — every case
  targets a deleted export.
- `explorers-earth/src/services/__tests__/paymentService.test.ts` (222 lines) — same, including
  `describe('isFreePlan')` at `:153`.

No test file covers `MusicSubscriptionContainment.tsx` after T2; its only test was the containment
suite deleted there.

---

- [ ] **Step 1: Confirm the consumer set really is empty**

```bash
cd explorers-earth && grep -rn "subscriptionService\|paymentService\|types/payment\|PaymentModeToggle\|isFreePlan\|MusicSubscriptionContainment" src/ --include=*.ts --include=*.tsx
```

Expected: hits **only** inside the six files being deleted in this ticket. Any other hit is a
consumer T1 or T2 missed — resolve it before deleting, not after.

- [ ] **Step 2: Remove the files from the index and regenerate the manifests**

```bash
git rm explorers-earth/src/services/subscriptionService.ts \
       explorers-earth/src/services/paymentService.ts \
       explorers-earth/src/types/payment.ts \
       explorers-earth/src/components/MusicSubscriptionContainment.tsx \
       explorers-earth/src/services/__tests__/subscriptionService.test.ts \
       explorers-earth/src/services/__tests__/paymentService.test.ts
node scripts/generate-music-fixture-dockerignore.mjs --write
```

If `MusicSubscriptionContainment.tsx` is already gone because the Music phase landed first, drop
it from the `git rm` list and say so in the commit message.

- [ ] **Step 3: Run the set-equality test on its own, first**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/test/__tests__/contained-unit.launcher.test.ts --maxWorkers 1
```

Expected: `0 failed`, including
`covers every VITE identifier used by application and existing test TypeScript`.

If it fails with a set difference naming `VITE_RAZORPAY_KEY_ID_DEV` or
`VITE_RAZORPAY_KEY_ID_PROD`, then `contained-unit.environment.test.ts:69-70` has changed since
this plan was written and Trap B now binds — stop and resolve all three copies in this commit.

- [ ] **Step 4: Prove the tree is green**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --check
```

Expected: exit 0, no output.

```bash
cd explorers-earth && npx tsc -b
```

Expected: no output, exit 0.

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Expected: `0 failed`, with the two deleted service test files' cases gone from the count.

```bash
cd tunes && npm test -- --run server/test/contracts/music-compose-safety.test.ts
```

Expected: `0 failed`.

- [ ] **Step 5: Check the coverage ratchet**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --coverage --maxWorkers 1
```

Apply the **Trap C** rule. Note this ticket deletes 698 well-covered service lines *and* their
354 lines of tests, so it is the clearest case of the denominator-shrink effect.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(services): delete the subscription and payment service layer

Completes the frontend removal for a free product (backbone D3). With
BillingTab and both gated pages gone, subscriptionService, paymentService,
types/payment and isFreePlan have no consumers, so the modules and their two
dedicated test files go with them.

Also deletes MusicSubscriptionContainment. P4 owns that component; its three
consumers were exactly the files removed in the previous two commits. The
Music-deletion phase must not delete it again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T4: Rename onboarding's misnamed finalisation path

**This ticket changes names and deletes unreachable code. It is test-first.**

Onboarding's "free plan auto-registration" registers nothing. `OnBoarding.tsx` imports no
subscription module (verified: its 41 imports contain none), and
`handleSubscriptionSubmit` at `:716` is pure account finalisation — it calls
`explorersApiClient.updateAccount({ …, onboardingStatus: "complete" })` at `:730-740`, writes a
localStorage completion marker, and navigates to `/home`. There is no plan, price or
subscription anywhere in it. `handleSubscriptionSubmitWithFreePlan` at `:769` is a one-line
pass-through to it.

The names are the whole defect: they make a future reader believe onboarding has a billing
dependency. Renaming is behaviour-preserving.

Two branches also go, because they became unreachable: `:376` (`state?.selectedPlan`) and `:387`
(`state?.skipSubscription`) read React Router navigation state that **no caller ever sets** —
verified repo-wide, the only producers would have been the pages deleted in T2, and
`Checkout.tsx:655` navigated to `/onboarding` with no state at all.

**Files:**
- Modify: `explorers-earth/src/pages/OnBoarding.tsx` — `:322`, `:373-392`, `:617-622`, `:667-675`, `:713-716`, `:720`, `:750`, `:761-770`, `:776`, `:779`, `:1179`, `:1182`
- Test: `explorers-earth/src/pages/__tests__/` (the onboarding test file identified in Step 1)

---

- [ ] **Step 1: Find the existing onboarding test coverage**

```bash
cd explorers-earth && grep -rln "OnBoarding\|onboarding" src/pages/__tests__/ src/__tests__/
```

Record which files render `OnBoarding`. They are this ticket's characterisation set: the
rename must not change a single assertion in them, because it must not change behaviour.

- [ ] **Step 2: Write the failing test for the surviving behaviour**

Add this to the onboarding test file found in Step 1 (adjust the mock scaffolding to match that
file's existing setup — do not invent a new harness).

```tsx
it("finalizes the account on the last step without any subscription concept", async () => {
  renderOnboarding();

  await completeStepsThroughProfile();
  fireEvent.click(screen.getByRole("button", { name: /finish|complete|done/i }));

  await waitFor(() =>
    expect(updateAccountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStatus: "complete" }),
    ),
  );
  expect(navigateSpy).toHaveBeenCalledWith("/home");
});
```

- [ ] **Step 3: Run it and watch it pass**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/pages/__tests__/<onboarding-test-file> --maxWorkers 1
```

Expected: **PASS.** This is a characterisation test, not a red-green test — the behaviour already
exists and the point is to pin it before renaming. If it fails, the harness in Step 2 does not
match the file's conventions; fix the harness, not the assertion.

- [ ] **Step 4: Delete the two unreachable navigation-state branches**

In `OnBoarding.tsx`, delete the whole `useEffect` spanning `:373-392` that begins:

```tsx
  // Handle returning from subscription page
  useEffect(() => {
```

and contains the `state?.selectedPlan` branch at `:376` and the `state?.skipSubscription` branch
at `:387`. No caller sets either key.

- [ ] **Step 5: Apply the three renames**

| Old | New | Occurrences |
|---|---|---|
| `handleSubscriptionSubmitWithFreePlan` | `finalizeOnboarding` | `:769` (declaration), `:671`, `:779` |
| `handleSubscriptionSubmit` | `saveOnboardingAccount` | `:716` (declaration), `:770` |
| `isCreatingSubscription` / `setIsCreatingSubscription` | `isFinalizing` / `setIsFinalizing` | `:322` (declaration), `:720`, `:750`, `:776`, `:1179`, `:1182` |

After the rename, `finalizeOnboarding` is a one-line pass-through to `saveOnboardingAccount`.
**Collapse it:** delete `finalizeOnboarding` entirely and call `saveOnboardingAccount` directly
at the two call sites (`:671`, `:779`). A wrapper that only forwards its argument earns nothing.

- [ ] **Step 6: Replace the misleading comments**

Delete the stale instructions that describe re-enabling a plan-selection step that no longer
exists: `:617-620`, `:667-669`, `:713-715`, `:761-768`. Replace the block at `:761-768` with:

```tsx
  /**
   * Finalizes the account at the end of onboarding: uploads any pending profile and
   * background images, writes the account, and marks onboarding complete. The product
   * is free, so there is no plan to select (backbone D3).
   */
```

Also fix the comment at `:774` which says "on the free plan".

- [ ] **Step 7: Prove nothing changed**

```bash
cd explorers-earth && npx tsc -b
```

Expected: no output, exit 0. `noUnusedLocals` will catch a missed rename.

```bash
cd explorers-earth && grep -rn "Subscription\|subscription" src/pages/OnBoarding.tsx
```

Expected: **no output.** This is the ticket's real success criterion.

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Expected: `0 failed`, and the **same test count** as after T3 plus the one test added in Step 2.
A rename that changes the test count changed behaviour — investigate.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(onboarding): name the finalisation path for what it does

handleSubscriptionSubmit never touched a subscription: it uploads pending
images, calls updateAccount with onboardingStatus=complete and navigates home.
OnBoarding.tsx imports no subscription module. The names were the only thing
suggesting onboarding had a billing dependency, and they would have misled the
next reader.

Renames it to saveOnboardingAccount, collapses the one-line
handleSubscriptionSubmitWithFreePlan wrapper into its two call sites, renames
isCreatingSubscription to isFinalizing, and deletes the selectedPlan /
skipSubscription navigation-state effect, which no caller has set since the
plan-selection pages were removed.

Behaviour-preserving: the test count and every existing assertion are unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T5: Correct two false pricing claims in the public FAQ

**This ticket changes user-facing content. It is test-first.**

The public FAQ advertises paid plans on a product that launches free. No existing test catches
it, because the reference-content tests only assert `length > 0`
(`explorers-earth/src/content/reference/__tests__/referenceContent.test.ts:36-39`, `:66-69`).

There are **two** false claims, each present in **all ten locales** — the inherited summary
named one claim in one locale.

**Claim A** — *"Is explorers.earth free to use?"* answers "…Premium features for businesses and
advanced analytics are available through our paid plans."

**Claim B** — *"How much does Local Tunes cost?"* answers "LocalTunes has a free plan and a
₹300/month subscription (with a 10% discount for yearly billing)…"

| Locale file | Claim A | Claim B |
|---|---|---|
| `explorers-earth/src/content/reference/en.json` | `:2029` | `:2059` |
| `explorers-earth/src/content/reference/ar.json` | `:551` | `:581` |
| `explorers-earth/src/content/reference/bn.json` | `:19` | `:49` |
| `explorers-earth/src/content/reference/de.json` | `:695` | `:725` |
| `explorers-earth/src/content/reference/es.json` | `:632` | `:662` |
| `explorers-earth/src/content/reference/fr.json` | `:695` | `:725` |
| `explorers-earth/src/content/reference/hi.json` | `:533` | `:563` |
| `explorers-earth/src/content/reference/id.json` | `:19` | `:49` |
| `explorers-earth/src/content/reference/pt.json` | `:695` | `:725` |
| `explorers-earth/src/content/reference/ru.json` | `:695` | `:725` |

**Claim B needs an owner decision before you start — see Owner decisions, item 2.** It is about
LocalTunes, the Music product being deleted in phase P3, so "make it free" and "delete the FAQ
entry" are both defensible. The steps below assume the default: **correct the copy, do not delete
the entry**, so the fix is independent of P3's timing.

**Files:**
- Modify: the ten locale files above
- Test: `explorers-earth/src/content/reference/__tests__/referenceContent.test.ts`

---

- [ ] **Step 1: Write the failing test**

Add this inside the existing `describe('every locale resolves to something renderable')` block in
`explorers-earth/src/content/reference/__tests__/referenceContent.test.ts` (which starts at
`:61`), directly after the `it.each(locales)` case at `:64`. Reuse that block's existing
`locales` array declared at `:62` — do not declare a second one. The loader is the already-imported
async `loadReferenceContent` (imported at `:6`), and the FAQ field is `Answer`
(`src/content/reference/index.ts:39`):

```ts
    // The product launches free (backbone D3). Two FAQ answers advertised paid tiers:
    // a "paid plans" upsell and a ₹300/month LocalTunes subscription, both in all ten
    // locales. The sibling assertions here are deliberately about non-emptiness rather
    // than wording, so nothing else would have caught a false price claim.
    //
    // Two assertions, not one, because a paid-tier claim can be regexed reliably in
    // nine languages only by its NUMBERS. "Premium-Funktionen", "Recursos premium",
    // "Fitur premium" and their Arabic, Bengali, Hindi and Russian equivalents are not
    // worth a brittle alternation, so prose is pinned in English, at the source the
    // owner actually authors, and the currency markers are pinned everywhere.

    // Verified to match exactly the two target lines in every locale, and nothing else.
    const PRICE_MARKER = /₹|\bINR\b|\b300\b/;

    it.each(locales)('%s quotes no price in any FAQ answer', async (locale) => {
      const content = await loadReferenceContent(locale);
      const answers = content.faqs.map((faq) => faq.Answer).join('\n');
      expect(answers).not.toMatch(PRICE_MARKER);
    });

    it('offers no paid tier in the English FAQ copy', () => {
      const answers = englishReferenceContent.faqs.map((faq) => faq.Answer).join('\n');
      expect(answers).not.toMatch(/premium|subscription|paid plan/i);
    });
```

`englishReferenceContent` is already imported at `:5`; `loadReferenceContent` at `:6`.

- [ ] **Step 2: Run it and verify it fails**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/content/reference/__tests__/referenceContent.test.ts --maxWorkers 1
```

Expected: **eleven failures** — all ten cases of `quotes no price in any FAQ answer` (each
locale carries the ₹300 claim) plus `offers no paid tier in the English FAQ copy`. A pass on any
locale means `PRICE_MARKER` does not match that locale's live copy; widen it before editing any
content, or you will "fix" a claim the test never guarded.

- [ ] **Step 3: Fix Claim A in all ten locales**

Replace the trailing sentence about paid plans with a sentence that says the product is free.
English (`en.json:2029`) becomes:

```json
      "Answer": "Yes.  explorers.earth is free forever. You can create your QR code, add unlimited recommendations, and track analytics at no cost.",
```

Note the deliberate second change: "basic analytics" becomes "analytics", because "basic" only
meant anything next to a paid tier. Translate the same two-clause sentence into the other nine
locales, keeping each file's existing punctuation style (several locales run sentences together
without a space after the full stop — preserve that; it is pre-existing and not this ticket's
business).

- [ ] **Step 4: Fix Claim B in all ten locales**

English (`en.json:2059`) becomes:

```json
      "Answer": "LocalTunes is free. You get unlimited playlists, analytics, and advanced features at no cost.",
```

Translate into the other nine locales.

- [ ] **Step 5: Run the test and verify it passes**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/content/reference/__tests__/referenceContent.test.ts --maxWorkers 1
```

Expected: `0 failed`, including all ten `quotes no price in any FAQ answer` cases and
`offers no paid tier in the English FAQ copy`.

Then confirm the nine translations by hand, since only the English prose is regex-guarded:

```bash
cd explorers-earth/src/content/reference && grep -cniE "premium|300|₹" ar.json bn.json de.json es.json fr.json hi.json id.json pt.json ru.json
```

Expected: `0` for every file.

- [ ] **Step 6: Prove the tree is green**

```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run --maxWorkers 1
```

Expected: `0 failed`. In particular
`src/content/reference/__tests__/referenceContent.test.ts` and
`referenceContent.chunkFailure.test.ts` must pass — both assert each locale's `faqs` array is
non-empty, which the edits preserve because no entry is removed.

```bash
cd explorers-earth && node scripts/check-i18n.js
```

Expected: exit 0. This repo has an i18n consistency checker; run it because this ticket touches
ten locale files. If it reports pre-existing failures unrelated to these keys, record that in the
commit message rather than fixing them here.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(content): stop advertising paid plans on a free product

Two FAQ answers claimed paid tiers: one offered premium business features
through paid plans, the other quoted a 300/month LocalTunes subscription with
a yearly billing discount. The product launches free (backbone D3), so both
were factually wrong, in all ten locales rather than only English.

Adds a locale-wide test asserting no FAQ answer advertises a price or a paid
plan, so this cannot regress silently - the existing reference-content tests
only assert the arrays are non-empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T6: Backend dead code, the `razorpay` dependency, infrastructure vars and docs

No live billing machinery exists in `tunes/server/`: no payment, subscription, plan or billing
route, service, controller or middleware is mounted into any composed app. What remains is two
orphaned utility modules, one npm dependency, a set of environment variables, and documentation
that actively lies.

**Files:**
- Delete: `tunes/server/utils/razorpayConfig.ts`
- Delete: `tunes/server/utils/razorpayPlanMapping.ts`
- Modify: `tunes/package.json:123`, `tunes/package-lock.json`
- Modify: `docker-compose.yml:45-50`
- Modify: `tunes/.env.example:60-64`, `explorers-earth/.env.example:8`, `:47-48`, `:58-59`, `:61-62`, `:64-65`
- Modify: `.github/workflows/explorers.yml:34-36`, `tunes/.github/workflows/main.yml:62-73`
- Modify: `docs/tunes/integrations.md:36-53`, `:121`; `docs/tunes/overview.md:88`, `:92`; `docs/explorers-earth/integrations.md:140-144`, `:192`; `docs/environment-variables.md:25-27`, `:39`, `:116-121`; `docs/architecture.md:90`; `docs/README.md:43`; `tunes/CLAUDE.md`; `explorers-earth/CLAUDE.md`; `docs/architecture/music-runtime-table-manifest.md:98`, `:121`

### What must NOT be touched in this ticket

Re-read the Verification record. These are *not* our billing and deleting them breaks the Apps
category or the cost controls:

- `tunes/shared/explorersAppContract.ts:23` — `appPriceTierSchema` with `'Subscription'`
- `tunes/migrations/0043_explorers_apps_provider_context.sql:32`, `tunes/migrations/0055_explorers_app_enrichment.sql:257`
- `tunes/server/services/appEnrichmentDecoderFields.generated.mjs:4059`
- `tunes/server/test/explorers/apps.test.ts:16`, `:46`; `tunes/server/test/contracts/app-enrichment-contract.test.ts:11`
- `tunes/server/utils/priceParsing.ts` — product price-string parsing for Apps and Products
- `tunes/server/repositories/musicDomainRepository.ts:73-79`, `tunes/migrations/0051_explorers_launch_controls.sql:82` — YouTube/AI spend caps
- Everything in `tunes/server/policies/` and `tunes/server/security-containment.ts` — that is T7

Also leave `.github/workflows/ci.yml`'s five `VITE_PAYMENT_API_URL` entries (`:202`, `:262`,
`:322`, `:382`, `:451`) and `.github/workflows/frontend-e2e-qualification.yml:83` alone. They set
a now-unread variable, which is harmless, and each sits in a job whose e2e behaviour this ticket
has no reason to perturb. Remove them in a later housekeeping pass if ever.

### Characterisation tests that must keep passing

- `tunes/server/test/contracts/music-documentation-contract.test.ts:715-733` — asserts every
  path in `publishedMarkdownDocuments()` exists on disk and contains no stale guidance.
  `tunes/CLAUDE.md` (`:716`) and `docs/explorers-earth/integrations.md` (`:724`) are both in that
  list, so the doc edits in this ticket **are** tested. Do not delete either file; edit in place.
- `tunes/server/test/contracts/replatform-local-authority.test.ts:315-317` — asserts
  `VITE_PAYMENT_API_URL` is *stripped* from the fixture Vite env. Asserts absence, so it stays
  green. Untouched.

---

- [ ] **Step 1: Confirm both utility modules are orphans**

```bash
cd "$(git rev-parse --show-toplevel)" && grep -rn "razorpayConfig\|razorpayPlanMapping\|getRazorpayInstance\|getRazorpayPlanId" tunes/server tunes/shared tunes/scripts --include=*.ts
```

Expected: hits **only** inside the two files themselves, plus `razorpayPlanMapping.ts:5`
importing the `RazorpayMode` type from `razorpayConfig.ts`. Any other hit means one of them is
reachable — stop and trace it.

- [ ] **Step 2: Delete both modules, then the dependency**

```bash
git rm tunes/server/utils/razorpayConfig.ts tunes/server/utils/razorpayPlanMapping.ts
```

Order matters: `tunes/tsconfig.json` includes `server/**/*`, so `razorpayConfig.ts:5`
(`import Razorpay from 'razorpay'`) is typechecked even though no bundle contains it. **Removing
the package first would break the typecheck.**

Now remove the dependency. Delete the `"razorpay": "^2.9.2"` line at `tunes/package.json:123`,
then regenerate the lockfile rather than hand-editing it:

```bash
cd tunes && npm install --package-lock-only
```

Expected: `tunes/package-lock.json` loses the `node_modules/razorpay` entry (currently at
`:9636-9644`, resolved 2.9.6) and the dependency reference at `:83`. This is the only lockfile in
the repo containing it — root and `explorers-earth` have no razorpay entry.

- [ ] **Step 3: Verify the backend typechecks and tests**

```bash
cd tunes && npx tsc --noEmit 2>&1 | grep -E "^(shared|server)/" | head -20
```

Expected: no new lines versus the pre-ticket baseline. Capture that baseline first — this repo
carries roughly 138 pre-existing errors in the duplicate `client/` tree, which is why the output
is filtered to `^(shared|server)/`.

```bash
cd tunes && npm test -- --run server/test/contracts
```

Expected: `0 failed`.

- [ ] **Step 4: Remove the six compose variables**

Delete `docker-compose.yml:45-50`:

```yaml
  RAZORPAY_KEY_ID_PROD: ${RAZORPAY_KEY_ID_PROD:-}
  RAZORPAY_KEY_SECRET_PROD: ${RAZORPAY_KEY_SECRET_PROD:-}
  RAZORPAY_PLAN_ID_MONTHLY_PROD: ${RAZORPAY_PLAN_ID_MONTHLY_PROD:-}
  RAZORPAY_PLAN_ID_MONTHLY_PRO_PROD: ${RAZORPAY_PLAN_ID_MONTHLY_PRO_PROD:-}
  RAZORPAY_PLAN_ID_YEARLY_PROD: ${RAZORPAY_PLAN_ID_YEARLY_PROD:-}
  RAZORPAY_PLAN_ID_YEARLY_PRO_PROD: ${RAZORPAY_PLAN_ID_YEARLY_PRO_PROD:-}
```

All six use `:-` (default-empty), **not** `:?`, so their absence cannot abort compose render —
contrast `MUSIC_GATE_ATTESTATION_KEY` at `:51`, which does use `:?`. Leave that one.

Verify the render still works:

```bash
docker compose -f docker-compose.yml config > /dev/null && echo RENDER_OK
```

Expected: `RENDER_OK`. (Do not pass `docker-compose.replatform.yml` — it holds real credentials.)

- [ ] **Step 5: Clean the example env files**

In `tunes/.env.example`, delete the `# Razorpay` section header at `:60` and the four entries at
`:61-64`. In `explorers-earth/.env.example`, delete `:47-48` (`VITE_PAYMENT_API_URL`), `:58-59`
and `:61-62` (the two `VITE_RAZORPAY_KEY_ID_*`), and `:64-65` (the legacy `RAZORPAY_KEY_ID`), and
drop the "uploads/auth/payments fallback" phrasing from the comment at `:8`.

- [ ] **Step 6: Remove the CI secret injection**

In `.github/workflows/explorers.yml`, delete `:34` and `:36` (the two `VITE_RAZORPAY_KEY_ID_*`
echo lines) and `:35` (`VITE_PAYMENT_API_URL`).

In `tunes/.github/workflows/main.yml`, delete the twelve `RAZORPAY_*` secret lines at `:62-73`.
Note this file is at `tunes/.github/`, not the repository root, so GitHub Actions does not
execute it — it is a stale nested workflow. Clean it anyway; leaving twelve payment secret
references in a file that looks live is worse than deleting them.

**The repository secrets themselves are not yours to delete — see Owner decisions, item 3.**

- [ ] **Step 7: Fix the documentation that describes files which do not exist**

This is the most valuable part of the ticket. `docs/tunes/integrations.md:36-53` documents a live
Razorpay integration with a four-step webhook flow and names four backend files
(`server/routes/paymentRoutes.ts`, `server/controllers/paymentController.ts`,
`server/controllers/subscriptionController.ts`, `server/routes/subscriptionRoutes.ts`) — **none
of which exist in the repository.** Replace that section with a short statement that the product
is free, that no payment integration exists, and that monetization will be designed from scratch
(backbone D3).

Apply the same correction to each of:

- `docs/tunes/overview.md:88`, `:92` — remove the two fictional route-module rows
- `docs/explorers-earth/integrations.md:140-144`, `:192` — remove the claim that payment
  verification is handled server-side
- `docs/environment-variables.md:25-27`, `:39`, `:116-121` — remove the three Vite vars, the
  Razorpay note and the `### Payments` section
- `docs/architecture.md:90` — remove "Razorpay (payments)" from the integration list
- `docs/README.md:43` — remove "Razorpay" from the integrations index line
- `tunes/CLAUDE.md` — remove `paymentRoutes.ts` and `subscriptionRoutes.ts` from the `server/`
  tree block, and remove "payment" from the "Key route groups" line
- `explorers-earth/CLAUDE.md` — remove `paymentService.ts` and `subscriptionService.ts` from the
  `services/` tree block
- `docs/architecture/music-runtime-table-manifest.md:98`, `:121` — remove `payment` and
  `subscriptions` from the registered-route-source prose

Leave `docs/replatform/acceptance-matrix.md:66` alone — it already correctly records
`/subscription-plans` and `/checkout` as intentional removals.

- [ ] **Step 8: Verify the documentation contract**

```bash
cd tunes && npm test -- --run server/test/contracts/music-documentation-contract.test.ts
```

Expected: `0 failed`, including
`keeps every published or indexed Markdown document free of retired guidance`. This is the test
that proves `tunes/CLAUDE.md` and `docs/explorers-earth/integrations.md` are still well-formed
after editing.

- [ ] **Step 9: Prove the tree is green**

```bash
node scripts/generate-music-fixture-dockerignore.mjs --check
```

Expected: exit 0. (This ticket deletes nothing under `explorers-earth/src`, so the manifests
should be unaffected — if `--check` fails, something unexpected moved.)

```bash
cd tunes && npm test -- --run server/test
```

Expected: `0 failed`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: remove the Razorpay dependency and the billing docs that outlived it

No payment, subscription or billing route, service or middleware was mounted
into any composed app. What remained: two orphaned utils (razorpayConfig,
razorpayPlanMapping) whose only importer was each other, the razorpay npm
dependency their dead import kept alive, six default-empty compose vars, the
example-env and CI secret plumbing, and documentation describing four backend
files that do not exist.

Deletes the modules before the package, because tunes/tsconfig.json includes
server/**/* and typechecks the dead import.

Preserves the Apps category price_tier enum (its 'Subscription' value is a
third-party app's own pricing model, not ours) and the YouTube/AI spend caps
whose comments mention billing only to deny being billing. Leaves the
/api/subscriptions and /api/payments tombstones in place - removing those is
gated on the blue/green deploy probe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task T7: Tombstone removal — DEFERRED, do not ship with P4

**Do not execute this ticket as part of P4.** It is recorded here so the work is not lost and so
nobody removes the tombstones by accident while doing T6.

`/api/subscriptions` and `/api/payments` return a deliberate **410 Gone**, from
`tunes/server/policies/musicRetirementPolicy.ts:33-34` (`match: "prefix"`), produced at
`tunes/server/routes/musicSurfaceRoutes.ts:747-748` and mounted at
`tunes/server/routes/index.ts:196`. Removing them converts an intentional 410 into a 404.

### Why it is deferred

**It would break production deployment, not just CI.**
`tunes/deployment/music-deploy-engine.sh:954` contains a live pre-routing hostile probe —
`["/api/subscriptions/user-plans/hostile", {}, 410],` — executed against the candidate container
*before* traffic is cut over. A 404 there fails the blue/green promotion gate. Backbone ticket
**P1-3** already owns porting that path into the canonical app, and backbone **P2-1** owns the
bootstrap that runs the probe. **T7 must land after P1-3 and P2, never before.**

### Its full blast radius, for whoever picks it up

Tests asserting a 410 or the tombstone list for these paths:

- `tunes/server/test/music-security-containment.test.ts:226`, `:230` (asserts
  `expect([401,410]).toContain(status)` and `not.toBe(404)` at `:243-245`)
- `tunes/server/test/music-security-containment.test.ts:256`, `:259` (asserts `410` +
  `SURFACE_REMOVED` at `:273-275`)
- `tunes/server/test/music-security-containment.test.ts:310-313` (asserts `410` +
  `SURFACE_REMOVED` + `fetch` not called, `:316-318`)
- `tunes/server/test/music-security-containment.test.ts:341` — asserts **413**, not 410, but the
  path reference still needs retargeting
- `tunes/server/test/contracts/runtime-surface-inventory.test.ts:42-43` — `arrayContaining` over
  retired-surface families including `"subscription"` and `"payment"`
- `tunes/server/test/music-surface-policy.test.ts:200-201` — `decisionForRoute` classification
  from `PAID_PREFIXES` (`tunes/server/policies/musicSurfacePolicy.ts:97-103`)
- `tunes/server/test/deployment/music-deployment-files.test.ts:331`, `:340` — asserts the deploy
  script literally contains the hostile-probe string
- `tunes/client/src/lib/musicCredential.test.ts:217` — asserts `/api/payments/order` and
  `/api/subscriptions/change` are recognized owner routes

Not broken, for the record: `tunes/server/test/music-retirement-policy.test.ts:9-12` is
`it.each(RETIRED_MUSIC_ROUTE_RULES)`, so deleting two rows removes two cases.

Also in scope: `tunes/server/security-containment.ts:189-190`, `:199`, `:276-278` (a second
hard-coded 410 for these paths); two generated artifacts that are equality-tested against a fresh
scan — `docs/architecture/music-runtime-surface-inventory.json:60-62`, `:90-92`, `:218-219`,
`:224-225` (from `tunes/scripts/inventory-runtime-surfaces.ts:29`, `:35`, `:202`) and
`docs/architecture/music-authorization-matrix.json:3584`, `:4851-4852`, `:4871-4872` (from
`tunes/scripts/generate-music-authorization-matrix.ts`).

---

## Owner decisions needed before implementation starts

1. **Is the surviving "Billing address" form still wanted, and should it keep that name?**
   After T1 the Billing tab holds only an address form — `address`, `streetName`, `state`, `city`,
   `country`, `postalCode` (`explorers-earth/src/features/Profile/config/profileFormSections.tsx:234-271`),
   headed by i18n key `dashboard.profile.account.sections.billingAddress`. On a free product there
   is nothing to bill. Three options: keep it as-is (this plan's default, zero work); rename the
   heading and the tab to "Address" (one i18n key plus `Settings.tsx:456`, but it moves e2e
   selectors — `profile-editor-polish.spec.ts:1326` matches the tab by the exact name `"Billing"`);
   or drop the tab entirely and move the form into Account, which would take `settingsTabs`
   (`Settings.tsx:41`) down to one and is a real IA change. **Renaming the field names is not an
   option** — `profileFormSections.test.tsx:106` pins them and the server stores
   `additionalAddresses` from `OnBoarding.tsx:735`.

2. **For FAQ Claim B: correct the copy, or delete the entry?** *"How much does Local Tunes
   cost?"* is about the Music product, which phase P3 deletes. T5's default is to correct it to
   "free" so the fix does not depend on P3's timing; the entry then disappears with the rest of
   the LocalTunes FAQ when P3 lands. If the owner would rather delete the entry now, T5 Step 4
   becomes a deletion in ten files — safe, because the reference-content tests only assert each
   locale's `faqs` array is non-empty.

3. **Who revokes the Razorpay secrets?** T6 removes the code that reads them, but the repository
   and organization secrets themselves (`VITE_RAZORPAY_KEY_ID_DEV`, `VITE_RAZORPAY_KEY_ID_PROD`,
   `VITE_PAYMENT_API_URL` in the root workflows, and twelve `RAZORPAY_*` in
   `tunes/.github/workflows/main.yml:62-73`) can only be deleted by someone with repository admin
   access, and the keys should be revoked in the Razorpay dashboard too. Unused secrets are a
   standing credential-exposure risk. **This is an owner action, not a code change.**

4. **Confirm T7 stays out of P4.** This plan treats tombstone removal as blocked on backbone
   P1-3 and P2 because of the live deploy probe. If the owner wants the 404s sooner, P1-3 has to
   move first.

5. **The design system still specifies a billing UI.**
   `docs/design-system/mockups/page/settings.md:10`, `:26-28`, `:59`, `:95`, `:125`, `:129`,
   `:147-155` and `docs/design-system/Readme.md:22` specify a full "Billing & Subscriptions" pane
   with "Pro Plan Subscription", "$8.00 / month · Billed annually" and a
   `switchPlanBillingCycle` interaction. That is live design intent for a UI this plan deletes.
   T6 does not touch it, because changing design intent is the owner's call. **Should it be
   removed, or kept as a record of the monetization design to be revisited?**

---

## Self-review

**Spec coverage.** Backbone P4-1 → T1. P4-2 → T2. P4-3 → T3. P4-4 → T4. P4-5 → T5 (widened: two
claims, ten locales). P4-6 → T6. P4-7 → T7, deferred with its blocker named. The backbone's "no
database work" holds, with the `price_tier` false positive documented so a grep-driven
implementer cannot destroy the Apps category. The backbone's `contained-unit-env.cjs` trap is
replaced by the verified Trap B, and two traps the backbone did not record — the generated Docker
manifests (Trap A) and the coverage ratchet (Trap C) — are documented with remediation.

**Placeholders.** None. Every step names exact paths with line numbers, shows the code it changes,
and gives a command with its expected output. Two steps deliberately begin with a discovery
command rather than a hardcoded path — T4 Step 1 (the onboarding test file) and T2 Step 1 (whether
the route test names the deleted paths) — because asserting a path there without having read it
would be a guess, and both resolve before any edit.

**Type and name consistency.** `finalizeOnboarding` is introduced and then deliberately collapsed
in T4 Step 5, so it does not appear in any later task. `saveOnboardingAccount` and `isFinalizing`
are the surviving names. `MusicSubscriptionContainment` is referenced in T1, T2 and T3 and deleted
exactly once, in T3. `isFreePlan` is deleted with `paymentService.ts` in T3 after its three
consumers go in T1 and T2. The four green-tree commands G1-G4 are defined once and referenced by
name thereafter.
