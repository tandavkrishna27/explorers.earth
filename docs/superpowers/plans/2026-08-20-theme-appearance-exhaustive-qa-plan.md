# Theme & Appearance Exhaustive QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove which Dashboard Theme & Appearance combinations persist through Save & Publish and render correctly on `http://localhost:5173/tk2727`, then restore the profile to its exact saved baseline.

**Architecture:** Separate deterministic exhaustive coverage from live persistence coverage. A local 1,584-row Cartesian suite verifies every controlled state without backend writes; a live browser suite either publishes all 1,584 rows literally or publishes the 66-row pairwise covering array below, checks the public DOM after every save, records failures, and always restores the baseline.

**Tech Stack:** React 18, TypeScript, Vitest, React Testing Library, Playwright-compatible Browser control, GraphQL-backed profile persistence.

**Spec:** `docs/superpowers/plans/2026-08-20-public-profile-theme-customization-plan.md`

## Global Constraints

- Literal dimension count is `6 presets × 6 accents × 4 wallpaper modes × 11 landing choices = 1,584` saved combinations.
- Pairwise coverage is not described as exhaustive; it is a separate 66-row option that covers every one of the 260 cross-setting value pairs.
- Run live writes only against the explicitly approved account and public route.
- Capture the complete baseline before the first live mutation and restore it after success, failure, interruption, or cancellation.
- Save through the Dashboard UI; do not replace the persistence path with direct GraphQL mutations.
- Verify the public page after every successful save, not only the Dashboard's selected state or success toast.
- Stop the batch after three consecutive save/load failures, restore the baseline, and retain the failure evidence.
- Do not fix product defects during this QA run. Record reproducible failures first; fixes require a separate reviewed change.

---

## File Structure & Responsibilities

- **Create:** `explorers-earth/e2e/fixtures/theme-appearance-matrix.ts` — canonical values, full Cartesian generator, fixed 66-row pairwise assignments, and pair-coverage validator.
- **Create:** `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx` — controlled-component checks across all 1,584 states plus event-contract checks for every individual option.
- **Create:** `explorers-earth/src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts` — verifies preset/accent CSS-token resolution for every Cartesian row and proves wallpaper/landing selections do not corrupt theme tokens.
- **Modify:** `explorers-earth/e2e/profile-theme.spec.ts` — replace the current URL-only smoke assertion with authenticated Save & Publish/public-render assertions when a dedicated test-session mechanism is available.
- **Create:** `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md` — baseline, chosen coverage track, per-case results, failure evidence, restore proof, and final totals.

## Canonical Dimensions

```ts
export const PRESETS = [
  'cinematic-dark',
  'glassmorphism',
  'sunset-glow',
  'minimal-light',
  'emerald-nature',
  'neon-cyber',
] as const;

export const ACCENTS = [
  '#10B981',
  '#38BDF8',
  '#EC4899',
  '#8B5CF6',
  '#F59E0B',
  '#F43F5E',
] as const;

export const WALLPAPERS = [
  'banner-top',
  'full-wallpaper-image',
  'ambient-gradient',
  'solid-color',
] as const;

export const LANDING_TABS = [
  'all-recommendations',
  'music',
  'guides',
  'movies',
  'books',
  'games',
  'apps',
  'products',
  'people',
  'gallery',
  'business',
] as const;
```

## Live Public-Page Assertions

| Setting | Authoritative public assertion |
|---|---|
| Preset | The theme root's `--bg-page`, `--bg-card`, `--border-card`, `--text-primary`, `--text-secondary`, and `--nav-bg` equal `THEME_PRESETS[preset].styles`. |
| Accent | The theme root's `--accent-color` equals the saved hex value, and the active tab border resolves to that color. |
| `banner-top` | An image with `alt="Cover"` exists; `Full Wallpaper` and the ambient radial-gradient layer do not. |
| `full-wallpaper-image` | An image with `alt="Full Wallpaper"` exists; `Cover` and the ambient radial-gradient layer do not. |
| `ambient-gradient` | A fixed layer contains both `radial-gradient` values using `var(--accent-color)`; `Cover` and `Full Wallpaper` do not. |
| `solid-color` | `Cover`, `Full Wallpaper`, and the ambient radial-gradient layer are all absent; the page root uses `var(--bg-page)`. |
| Landing choice | The expected public tab has `aria-selected="true"`, its panel is rendered, and a full reload keeps that tab selected. |

Known pre-run discrepancy: `PublicProfile.tsx:275` initializes `activeTab` to `"recommendations"` and has no `landingTab` read. The live suite must still record each landing assertion as pass/fail; it must not convert the expected result to the current broken behavior.

---

### Task 1: Freeze the Matrix and Prove Its Coverage

**Files:**
- Create: `explorers-earth/e2e/fixtures/theme-appearance-matrix.ts`
- Test: `explorers-earth/src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts`

**Interfaces:**
- Produces: `ThemeAppearanceCase`, `ALL_THEME_APPEARANCE_CASES`, `PAIRWISE_THEME_APPEARANCE_CASES`, and `assertCompletePairCoverage()`.
- Consumes: `ThemePresetId`, `WallpaperMode`, and `LandingTabId` from `src/features/Profile/types/themeTypes.ts`.

- [ ] **Step 1: Write the failing matrix-size and uniqueness test**

```ts
import {
  ALL_THEME_APPEARANCE_CASES,
  PAIRWISE_THEME_APPEARANCE_CASES,
  assertCompletePairCoverage,
} from '../../../../../e2e/fixtures/theme-appearance-matrix';

it('enumerates every Cartesian state exactly once', () => {
  expect(ALL_THEME_APPEARANCE_CASES).toHaveLength(1584);
  expect(new Set(ALL_THEME_APPEARANCE_CASES.map((row) => row.id)).size).toBe(1584);
});

it('covers every cross-setting pair in 66 live rows', () => {
  expect(PAIRWISE_THEME_APPEARANCE_CASES).toHaveLength(66);
  expect(() => assertCompletePairCoverage(PAIRWISE_THEME_APPEARANCE_CASES)).not.toThrow();
});
```

- [ ] **Step 2: Run the test and verify the fixture import fails**

Run: `npm run test:unit -- src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts`

Expected: FAIL because `e2e/fixtures/theme-appearance-matrix.ts` does not exist.

- [ ] **Step 3: Implement the exhaustive generator and fixed pairwise assignments**

```ts
export type ThemeAppearanceCase = {
  id: string;
  preset: (typeof PRESETS)[number];
  accent: (typeof ACCENTS)[number];
  wallpaper: (typeof WALLPAPERS)[number];
  landingTab: (typeof LANDING_TABS)[number];
};

export const ALL_THEME_APPEARANCE_CASES: ThemeAppearanceCase[] = PRESETS.flatMap(
  (preset) => ACCENTS.flatMap(
    (accent) => WALLPAPERS.flatMap(
      (wallpaper) => LANDING_TABS.map((landingTab) => ({
        id: [preset, accent, wallpaper, landingTab].join('|'),
        preset,
        accent,
        wallpaper,
        landingTab,
      })),
    ),
  ),
);

const PAIRWISE_ASSIGNMENTS = [
  { accents: [0, 3, 2, 1, 4, 5], wallpapers: [0, 3, 3, 0, 1, 2] },
  { accents: [1, 2, 0, 4, 3, 5], wallpapers: [3, 0, 2, 3, 1, 2] },
  { accents: [0, 4, 5, 3, 1, 2], wallpapers: [3, 3, 0, 1, 2, 2] },
  { accents: [4, 5, 1, 3, 0, 2], wallpapers: [1, 1, 2, 1, 3, 0] },
  { accents: [2, 4, 3, 0, 1, 5], wallpapers: [2, 3, 0, 1, 2, 1] },
  { accents: [5, 3, 4, 1, 2, 0], wallpapers: [1, 3, 2, 2, 0, 1] },
  { accents: [4, 3, 2, 0, 5, 1], wallpapers: [0, 2, 2, 1, 0, 3] },
  { accents: [5, 3, 0, 2, 1, 4], wallpapers: [2, 3, 0, 1, 0, 0] },
  { accents: [2, 1, 0, 4, 5, 3], wallpapers: [0, 1, 3, 2, 0, 3] },
  { accents: [3, 0, 4, 1, 2, 5], wallpapers: [2, 0, 1, 0, 2, 3] },
  { accents: [0, 4, 1, 5, 2, 3], wallpapers: [0, 0, 2, 1, 3, 2] },
] as const;

export const PAIRWISE_THEME_APPEARANCE_CASES = PAIRWISE_ASSIGNMENTS.flatMap(
  (assignment, landingIndex) => PRESETS.map((preset, presetIndex) => ({
    id: [preset, ACCENTS[assignment.accents[presetIndex]], WALLPAPERS[assignment.wallpapers[presetIndex]], LANDING_TABS[landingIndex]].join('|'),
    preset,
    accent: ACCENTS[assignment.accents[presetIndex]],
    wallpaper: WALLPAPERS[assignment.wallpapers[presetIndex]],
    landingTab: LANDING_TABS[landingIndex],
  })),
);
```

- [ ] **Step 4: Implement `assertCompletePairCoverage()`**

```ts
export function assertCompletePairCoverage(rows: ThemeAppearanceCase[]): void {
  const fields = ['preset', 'accent', 'wallpaper', 'landingTab'] as const;
  const expectedValues = [PRESETS, ACCENTS, WALLPAPERS, LANDING_TABS] as const;

  for (let left = 0; left < fields.length; left += 1) {
    for (let right = left + 1; right < fields.length; right += 1) {
      const covered = new Set(rows.map((row) => `${row[fields[left]]}|${row[fields[right]]}`));
      const expected = expectedValues[left].length * expectedValues[right].length;
      if (covered.size !== expected) {
        throw new Error(`${fields[left]} × ${fields[right]} covered ${covered.size}/${expected}`);
      }
    }
  }
}
```

- [ ] **Step 5: Run the focused test and verify 1,584 unique rows and all 260 pairs**

Run: `npm run test:unit -- src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts`

Expected: PASS with two tests.

- [ ] **Step 6: Commit the test-only matrix fixture**

```bash
git add explorers-earth/e2e/fixtures/theme-appearance-matrix.ts explorers-earth/src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts
git commit -m "test: define exhaustive theme appearance matrix"
```

---

### Task 2: Exhaustively Verify Dashboard Controlled State Without Publishing

**Files:**
- Create: `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx`
- Test: `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`

**Interfaces:**
- Consumes: `ALL_THEME_APPEARANCE_CASES` and `ThemeAppearanceSection`.
- Produces: a deterministic pass/fail for every one of the 1,584 Dashboard selection states.

- [ ] **Step 1: Write the controlled-state matrix test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  ALL_THEME_APPEARANCE_CASES,
  LANDING_TABS,
  WALLPAPERS,
} from '../../../../../e2e/fixtures/theme-appearance-matrix';
import ThemeAppearanceSection from '../ThemeAppearanceSection';

const ACCENT_NAME_BY_HEX: Record<string, string> = {
  '#10B981': 'Emerald',
  '#38BDF8': 'Ocean Blue',
  '#EC4899': 'Sunset Pink',
  '#8B5CF6': 'Royal Purple',
  '#F59E0B': 'Amber Gold',
  '#F43F5E': 'Crimson',
};

const PRESET_NAME_BY_ID: Record<string, string> = {
  'cinematic-dark': 'Cinematic Dark',
  glassmorphism: 'Glassmorphism Frost',
  'sunset-glow': 'Sunset Glow',
  'minimal-light': 'Minimal Light',
  'emerald-nature': 'Emerald Nature',
  'neon-cyber': 'Neon Cyber',
};

it('renders every Cartesian selection state without substituting a value', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <ThemeAppearanceSection
      themeSettings={{
        preset: ALL_THEME_APPEARANCE_CASES[0].preset,
        accentColor: ALL_THEME_APPEARANCE_CASES[0].accent,
        wallpaperMode: ALL_THEME_APPEARANCE_CASES[0].wallpaper,
        landingTab: ALL_THEME_APPEARANCE_CASES[0].landingTab,
      }}
      onChange={onChange}
    />,
  );

  for (const row of ALL_THEME_APPEARANCE_CASES) {
    rerender(
      <ThemeAppearanceSection
        themeSettings={{
          preset: row.preset,
          accentColor: row.accent,
          wallpaperMode: row.wallpaper,
          landingTab: row.landingTab,
        }}
        onChange={onChange}
      />,
    );
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[0].value, row.id).toBe(row.wallpaper);
    expect(selects[1].value, row.id).toBe(row.landingTab);
    expect(screen.getByTitle(ACCENT_NAME_BY_HEX[row.accent]).className, row.id).toContain('border-white');
    expect(screen.getByText(PRESET_NAME_BY_ID[row.preset]).closest('button')?.className, row.id).toContain('ring-2');
  }
});
```

- [ ] **Step 2: Run the test and inspect any substituted or unrenderable combination**

Run: `npm run test:unit -- src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx`

Expected: PASS for all 1,584 controlled states; any failing row prints its full ID.

- [ ] **Step 3: Add one event-contract case per individual value**

```tsx
const BASE = {
  preset: 'cinematic-dark' as const,
  accentColor: '#10B981',
  wallpaperMode: 'banner-top' as const,
  landingTab: 'all-recommendations' as const,
};

it.each([
  ['Cinematic Dark', 'cinematic-dark', '#10B981'],
  ['Glassmorphism Frost', 'glassmorphism', '#38BDF8'],
  ['Sunset Glow', 'sunset-glow', '#EC4899'],
  ['Minimal Light', 'minimal-light', '#0F172A'],
  ['Emerald Nature', 'emerald-nature', '#059669'],
  ['Neon Cyber', 'neon-cyber', '#F43F5E'],
] as const)('selects preset %s and applies its default accent', (name, preset, accentColor) => {
  const onChange = vi.fn();
  render(<ThemeAppearanceSection themeSettings={BASE} onChange={onChange} />);
  fireEvent.click(screen.getByText(name));
  expect(onChange).toHaveBeenLastCalledWith({ ...BASE, preset, accentColor });
});

it.each([
  ['Emerald', '#10B981'],
  ['Ocean Blue', '#38BDF8'],
  ['Sunset Pink', '#EC4899'],
  ['Royal Purple', '#8B5CF6'],
  ['Amber Gold', '#F59E0B'],
  ['Crimson', '#F43F5E'],
] as const)('selects accent %s without changing the other fields', (name, accentColor) => {
  const onChange = vi.fn();
  render(<ThemeAppearanceSection themeSettings={BASE} onChange={onChange} />);
  fireEvent.click(screen.getByTitle(name));
  expect(onChange).toHaveBeenLastCalledWith({ ...BASE, accentColor });
});

it.each(WALLPAPERS)('selects wallpaper %s without changing the other fields', (wallpaperMode) => {
  const onChange = vi.fn();
  render(<ThemeAppearanceSection themeSettings={BASE} onChange={onChange} />);
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: wallpaperMode } });
  expect(onChange).toHaveBeenLastCalledWith({ ...BASE, wallpaperMode });
});

it.each(LANDING_TABS)('selects landing tab %s without changing the other fields', (landingTab) => {
  const onChange = vi.fn();
  render(<ThemeAppearanceSection themeSettings={BASE} onChange={onChange} />);
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: landingTab } });
  expect(onChange).toHaveBeenLastCalledWith({ ...BASE, landingTab });
});
```

- [ ] **Step 4: Run both ThemeAppearanceSection test files**

Run: `npm run test:unit -- src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx`

Expected: PASS with every option exercised.

- [ ] **Step 5: Commit the component matrix tests**

```bash
git add explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx
git commit -m "test: exhaust theme appearance control states"
```

---

### Task 3: Capture the Live Baseline and Recover the Test Surface

**Files:**
- Create: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Produces: a restore object with `preset`, `accentColor`, `wallpaperMode`, `landingTab`, public CSS tokens, selected tab, and profile `updatedAt`.
- Consumes: the authenticated Dashboard at `http://localhost:5173/profile` and public page at `http://localhost:5173/tk2727`.

- [ ] **Step 1: Reproduce the current clean-load failure**

Open a fresh `/profile` tab, wait 30 seconds, and record the current defect if `#root` remains empty with `document.readyState === "interactive"`.

- [ ] **Step 2: Restart only the verified local Vite process if the clean-load failure persists**

Before stopping it, verify that the listening PID's command line points to this workspace's `explorers-earth/node_modules/vite/bin/vite.js`. Restart the same workspace command hidden, retain stdout/stderr, and re-open `/profile`.

- [ ] **Step 3: Capture the authoritative saved Dashboard values**

Reload `/profile`, expand Theme & Appearance, read the selected preset styling, selected accent styling, wallpaper `<select>` value, and landing `<select>` value. Do not use a pre-reload unsaved tab as the baseline.

- [ ] **Step 4: Capture the authoritative public values**

Reload `/tk2727` and record the CSS variables, wallpaper marker, `aria-selected` tab, title, username, and visible account name. Confirm the Dashboard and public theme values agree before starting the batch.

- [ ] **Step 5: Save the restore object and initial evidence in the report**

Use a table with Dashboard value, public value, equality result, and DOM evidence. If equality fails, stop and report the mismatch before any publish.

---

### Task 4: Obtain Action-Time Approval for the Exact Live Batch

**Files:**
- Modify: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Consumes: the verified baseline and one explicit coverage choice.
- Produces: approval for either exactly 1,584 test publishes plus one restore publish, or exactly 66 pairwise publishes plus one restore publish.

- [ ] **Step 1: Present both scopes without conflating them**

State that the literal track temporarily changes the `tk2727` public page 1,584 times and submits the whole profile mutation each time. State that the pairwise track changes it 66 times, covers all 260 cross-setting pairs, and combines with the local 1,584-row state suite.

- [ ] **Step 2: Request a narrow action-time confirmation**

Ask the user to approve one exact batch on `http://localhost:5173/profile` for account `tk2727`, including the final restore. Do not click the first Save & Publish button before this answer.

- [ ] **Step 3: Record the selected track in the report**

Record `literal-cartesian` or `pairwise-plus-local-exhaustive`, the row count, the public route, and the baseline restore values.

---

### Task 5: Execute the Approved Live Save/Public Verification Loop

**Files:**
- Modify: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Consumes: the approved case list, Dashboard tab, public tab, preset token map, and restore object.
- Produces: one result row per attempted publish with Dashboard persistence and public-render assertions.

- [ ] **Step 1: Apply one case through visible controls**

Click the preset card, click the accent swatch, select the wallpaper value, and select the landing value. Re-read all four Dashboard selections before publishing; do not publish if a selected value differs from the case.

- [ ] **Step 2: Save through the Dashboard UI and wait for authoritative completion**

Click `Save & Publish` once. Wait for the success toast and the button to become enabled again. Record timeout, GraphQL error toast, or navigation failure as a failed save.

- [ ] **Step 3: Reload the public route and evaluate all public assertions**

Check the six preset tokens, accent token and active-border color, exclusive wallpaper marker, selected landing tab, and rendered tab panel. Record expected and actual values separately.

- [ ] **Step 4: Check saved Dashboard persistence**

Reload `/profile`, expand Theme & Appearance, and assert all four controls still match the case. This distinguishes a public renderer failure from a persistence failure.

- [ ] **Step 5: Append the result and continue from a durable checkpoint**

Write the case ID, save result, Dashboard persistence result, public preset result, public accent result, public wallpaper result, public landing result, console errors, and duration. Checkpoint after every 25 literal cases or every 11 pairwise cases.

- [ ] **Step 6: Apply the abort rule**

After three consecutive save or load failures, stop generating new writes and proceed directly to Task 6.

---

### Task 6: Restore and Prove the Original Public State

**Files:**
- Modify: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Consumes: the exact Task 3 restore object.
- Produces: verified Dashboard and public equality with the baseline.

- [ ] **Step 1: Reapply the four baseline controls**

Set the preset first, then explicitly set the saved accent because the preset click resets it. Set the baseline wallpaper and landing values.

- [ ] **Step 2: Publish the restore state once**

Click Save & Publish and wait for the same authoritative completion signal used in the batch.

- [ ] **Step 3: Verify Dashboard persistence after a clean reload**

Reload `/profile`, expand Theme & Appearance, and compare all four values to the restore object.

- [ ] **Step 4: Verify public equality after a clean reload**

Reload `/tk2727` and compare all six theme tokens, accent, wallpaper marker, and selected tab to the baseline evidence.

- [ ] **Step 5: Escalate any failed restore immediately**

If any value differs, stop, keep both tabs open, and report the exact mismatch. Do not attempt unrelated profile edits.

---

### Task 7: Produce the Evidence-Backed QA Report

**Files:**
- Modify: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Consumes: local suite output, live case results, console errors, and restore proof.
- Produces: final totals and actionable defects with exact reproduction rows.

- [ ] **Step 1: Report coverage honestly**

Include local Cartesian rows executed, live rows attempted/completed, Save successes/failures, Dashboard persistence passes/failures, public preset/accent/wallpaper/landing passes/failures, and whether all 260 pairs were covered.

- [ ] **Step 2: Group duplicate failures by root cause**

For example, all landing rows that persist but reload to Recommendations are one renderer defect with the affected case count, not hundreds of separately worded bugs.

- [ ] **Step 3: Attach the smallest reproducer for each defect**

Give the first failing case ID, expected state, actual Dashboard state, actual public state, relevant source line, and console error if present.

- [ ] **Step 4: Record restore status at the top and bottom of the report**

The report is not complete unless it states whether `tk2727` was restored and shows the final equality check.

- [ ] **Step 5: Run the final read-only verification suite**

Run: `npx tsc -b`

Run: `npm run test:unit -- src/features/Profile/constants/__tests__/themePresets.test.ts src/features/Profile/constants/__tests__/themeCombinationMatrix.test.ts src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx src/features/Profile/components/__tests__/ThemeAppearanceSection.matrix.test.tsx`

Expected: TypeScript passes; all focused tests pass. Product defects found by the live run remain documented rather than being hidden by weakening assertions.
