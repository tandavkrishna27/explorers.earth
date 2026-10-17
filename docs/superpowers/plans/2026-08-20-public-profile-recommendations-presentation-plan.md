<!-- /autoplan restore point: C:\Users\TK\.gstack\projects\explorers.earth-main\main-autoplan-restore-20260820-183840.md -->
# Public Profile Recommendations Presentation Implementation Plan

> **Execution mode:** Work sequentially in this existing worktree. Do not use implementation subagents, parallel lanes, new worktrees, commits, staging, or stashing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public profile honor its saved initial tab/category while allowing owners to reorder all public recommendation categories and select Classic Shelves, Category Mosaic, or Featured First from the Dashboard.

**Approved product decision:** After reviewing the mocks, the user explicitly chose to keep all three layouts and to interpret a category `landingTab` as “open Recommendations and promote this category.” This supersedes the older draft theme-customization spec that described direct category navigation. The three-layout maintenance cost is accepted consciously and will be contained behind one shared view-model contract.

**Architecture:** Preserve the complete raw `social_media` wire object, normalize its known `theme_settings` fields into a separate render model, and merge only known edits back into the untouched wire object. Shared pure functions resolve the top-level tab, visibility, and eligible order; a save coordinator propagates `saved | failed | deferred` through the Dashboard; `ProfileRecommendationsTab` keeps nine independent query adapters separate from three focused presentational layouts. Existing Public Visibility flags remain the only visibility authority.

**Tech Stack:** React 18, TypeScript, Formik, Apollo Client, React Query, React Router, Tailwind CSS, Vitest, React Testing Library, Playwright/browser QA.

**Spec:** `docs/superpowers/specs/2026-08-20-public-profile-recommendations-presentation-design.md`

## What Already Exists and Governs This Work

- Approved three-layout concept board: `.superpowers/brainstorm/1230-1787230850/content/recommendations-layouts.html`. Task 2 first copies it to `docs/design-system/mockups/page/recommendations-layouts.html` so the implementation reference is durable.
- Existing public-profile shell: `docs/design-system/mockups/page/public_profile.html` and `public_profile.md`.
- Existing recommendations/card vocabulary: `docs/design-system/mockups/page/recommendations.html` and `recommendations.md`.
- Authoritative product UI handbook and tokens: `docs/design-system/design.md`, `01-design-tokens.md`, `02-component-inventory.md`, `03-ux-patterns.md`, `04-html-reference-library.md`, and `ai-agent-rules.md`.
- Existing `PublicPlaceCard`, profile theme variables, Dashboard `Button`, `useToast`, Formik dirty-state handling, Apollo/React Query category fetches, and React Router category routes.

The current design system requires semantic controls, visible focus, AA contrast, a 4px spacing grid, Poppins, the existing token vocabulary, truthful save feedback, and no new raw colors. Where legacy code conflicts—such as global focus suppression or clickable `<div>` cards—this feature fixes the scoped component instead of copying the defect.

## Information Hierarchy

```text
OWNER — Theme & Appearance
├─ Appearance: preset → accent → wallpaper
├─ First view
│  ├─ Recommendations — saved order
│  ├─ Recommendations — {Category} first (nine distinct values)
│  ├─ Gallery
│  └─ Business
├─ Recommendations presentation
│  ├─ Layout: Classic Shelves / Category Mosaic / Featured First
│  ├─ Landing-aware illustrative preview
│  ├─ Category order: all nine, always preserved
│  └─ Note: Public Visibility alone controls publication
└─ Save & Publish with truthful success/failure state

PUBLIC PROFILE
├─ Brand and profile identity
├─ Tablist: Recommendations / Gallery / Business
├─ Active panel status
│  ├─ Preferred eligible category first
│  └─ Remaining eligible categories in saved relative order
└─ Footer
```

## Visual and Responsive Contract

| Area | Contract |
|---|---|
| Classic Shelves | Preserve the existing shelf density: approximately 135×155px cards on mobile and 155×180px on desktop, 16px gaps, 24px category rhythm, and a visible next-card/scroll affordance. |
| Category Mosaic | Whole-tile semantic category links; one column below 640px, two columns from 640px; stable minimum tile height; category label, pluralized list/item counts, and at most three decorative preview images. |
| Featured First | The effective first category is one full-width feature; remaining categories are compact rows. Feature copy clamps to two lines, rows to one line, with reserved media ratios and no text/image overlap at 200% zoom. |
| Dashboard | Layout choices stack at narrow widths and become three columns when space permits; order editor and preview stack below 768px and may split at 768px+; every control is at least 44×44px. |
| Content resilience | Cover 64-character titles, 30% copy expansion, RTL, zero/one/many/four-digit counts, missing and broken images, all nine categories, and `prefers-reduced-motion`. |
| Tokens | Public states use `--bg-page`, `--bg-card`, `--border-card`, `--text-primary`, `--text-secondary`, and `--accent-color`; Dashboard uses `--dash-*`. Category colors are decorative unless their contrast is independently verified. |

Only shelf containers may scroll horizontally. The page itself must not overflow at 320, 639/640, 767/768, 1024, or 1440px.

## Interaction State Contract

| Surface | Loading | Empty | Error | Success | Partial / Recovery |
|---|---|---|---|---|---|
| Dashboard controls | Old settings normalize synchronously. | Not applicable; all nine order rows remain. | Malformed saved JSON silently normalizes. | First view, layout, preview, and order agree. | Unknown/future JSON keys remain preserved. |
| Save & Publish | Spinner; button disabled; edited values remain visible. | — | One error notice; Formik/custom/feed dirty state and edits remain; no success notice. | Formik's saved baseline and every dirty flag clear only after terminal `saved`. | `deferred` waits for username confirm/cancel; retry submits retained values once. |
| Public tab shell | Existing profile skeleton only. | Recommendations availability still follows Public Visibility. | Child query failures cannot hide or switch the shell tab. | Saved available top-level tab is selected. | Username changes cannot flash a prior manual tab selection. |
| Recommendations panel | Ordered placeholders only for unresolved visibility-enabled categories. | “No public recommendations yet” only after all enabled queries settle successfully with no content. | All failed: themed “Couldn’t load recommendations” with Retry. | Selected layout, effective order, semantic navigation, correct counts. | Render successes immediately; keep ordered unresolved placeholders; show one nonblocking partial-error notice and retry only failed queries. |
| Images | Reserved aspect-ratio placeholder. | Intentional no-image treatment. | Broken URL swaps to the same fallback without layout shift. | Stable, decorative previews with accessible surrounding link text. | Other valid preview images remain. |

## Global Constraints

- Keep exactly three public-profile tabs: Recommendations, Gallery, and Business.
- Do not add category visibility controls to Theme & Appearance.
- Preserve the existing `landingTab` values and saved JSON without a backend migration.
- Do not add an account or category network request for ordering or layout.
- Treat saved JSON as untrusted: normalize missing, duplicate, unknown, and future values before rendering.
- Category landing values promote that eligible category inside Recommendations; they do not navigate away or hide other categories.
- Treat Recommendations as shell-available when at least one recommendation category is visibility-enabled. Whether a visible category actually has public lists is resolved inside `ProfileRecommendationsTab`; the shell must not duplicate or hoist the existing nine query paths.
- `ThemeSettings.visibleTabs` is legacy data: preserve it when saving, but do not consult it as a visibility authority.
- Gallery and Business content are unchanged.
- Gallery remains an available tab even when it has no media; name this invariant `hasGalleryTab = true` rather than deriving tab availability from gallery content.
- Treat all saved theme fields and `Public_Profile_Address` as untrusted. Normalize every known enum/color before use and parse business JSON with a non-throwing helper; malformed business data makes Business unavailable but never crashes the profile.
- Preserve unrelated staged/unstaged work exactly. Re-check the external baseline before every task and stop on unexpected drift.
- **Command context:** every `npm`, `npx`, TypeScript, i18n, build, and Playwright command below runs with working directory `explorers-earth`. Every root-level `git`/documentation command runs from the repository root and uses `explorers-earth/...` pathspecs.

## Dependency, Failure, and Rollback Model

```text
Task 0 safety baseline
  -> Task 1 wire/normalized contracts + visibility
      -> Task 2 lossless save coordinator
      -> Task 3 semantic shared layouts/card API
          -> Task 4 independent category adapters
              -> Task 5 safe three-tab shell
                  -> Task 6 deterministic QA -> separately approved live QA
```

| Failure | Required handling |
|---|---|
| Mutation rejects or cannot confirm the update | Return `failed`; keep all edits and dirty flags; emit one error; allow retry. |
| Username change needs confirmation | Return `deferred`; terminal confirm/cancel/failure resolves through the same save coordinator. |
| Apollo returns partial data plus error | Render the data, report a partial failure, and retry only that adapter. |
| Music refetch fails with cached data | Keep cached data visible and expose a recoverable error. |
| Missing visibility value | Places remains enabled for legacy compatibility; every other category is disabled. |
| Malformed business JSON | Business is unavailable; Recommendations/Gallery and the rest of the profile still render. |
| Count exceeds a backend relation cap | Show an honest lower bound such as `500+`, never a false exact count. |
| Normal live-test restore fails | Replay the captured authenticated mutation in memory, verify raw equality, and report the original restore failure. |

No new runtime account/category request is allowed. Prefer aggregate totals already available in the same GraphQL operation; cap rendered cards/images. Authentication headers and restore templates remain memory-only, redacted, and never attached to reports. Rollback is a frontend revert; leave backward-compatible saved `recommendations` JSON untouched so a later redeploy can recover it.

---

## File Structure and Responsibilities

- **Modify:** `explorers-earth/src/features/Profile/types/themeTypes.ts` — saved presentation types.
- **Modify:** `explorers-earth/src/features/Profile/constants/themePresets.ts` — default nested presentation settings.
- **Create:** `explorers-earth/src/features/Profile/constants/recommendationsPresentation.ts` — canonical category metadata and pure normalization/resolution/order helpers.
- **Create:** `explorers-earth/src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts` — full data-contract and legacy-landing matrix.
- **Create:** `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx` — Dashboard layout selector, accessible ordering editor, and compact preview.
- **Create:** `explorers-earth/src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx` — control contract and keyboard ordering tests.
- **Modify:** `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx` — compose the new controls without resetting other theme fields.
- **Modify:** `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx` — preservation and integration tests.
- **Modify:** `explorers-earth/src/features/Profile/components/ProfileForm.tsx` — clear dirty state only after confirmed save success.
- **Modify:** `explorers-earth/src/pages/Profile.tsx` — coordinate normal, deferred username, and unsaved-modal saves without DOM clicking or fixed delays.
- **Modify:** `explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts` — mutation-only boundary that returns/rethrows truthful completion and preserves the raw `social_media` wire object.
- **Create/Modify:** focused `ProfileForm`/`Profile.tsx`/`useUpdateProfile` tests — save failure retention, deferred completion, and retry contract.
- **Modify:** `explorers-earth/src/i18n/resources/en.json` plus `npm run i18n:sync` output — translated First view, layout, order, state, and accessibility copy.
- **Create:** `docs/design-system/mockups/page/recommendations-layouts.html` — durable copy of the user-reviewed concept board.
- **Create:** `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsLayouts.tsx` — three query-free public layouts.
- **Create:** `explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx` — layout, order, navigation, and empty-input tests.
- **Modify:** `explorers-earth/src/features/PublicHome/components/PublicPlaceCard.tsx` and its test — semantic keyboard-operable list-card navigation and image fallback.
- **Modify:** `explorers-earth/src/features/PublicHome/components/PublicHome.tsx` — migrate existing modal card callers to the semantic action variant without changing behavior.
- **Modify:** `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx` — build eligible ordered view models and delegate rendering.
- **Create:** `explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx` — resilient-query wiring and ordered-render integration tests.
- **Modify:** `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx` — initialize the three-tab shell and pass preferred category/presentation settings.
- **Create:** `explorers-earth/src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx` — legacy landing and fallback integration tests.
- **Modify:** `explorers-earth/src/index.css` — scoped visible-focus rule that survives the legacy global outline reset.
- **Modify:** `explorers-earth/e2e/profile-theme.spec.ts` — authenticated, opt-in Save & Publish/public verification for layouts and ordering.
- **Modify:** `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md` — append the fix verification and restore evidence after implementation.

---

### Task 0: Snapshot and Guard the Dirty Worktree

**Files:** No repository files are modified in this task. Store artifacts in a new timestamped directory under `C:\Users\TK\.gstack\projects\explorers.earth-main\`.

- [ ] **Step 1: Capture immutable external evidence before any product edit**

From the repository root, save `git status --porcelain=v2 --untracked-files=all`, `git diff --binary`, and `git diff --cached --binary` outside the repository. Copy every overlapping tracked or untracked target file byte-for-byte into the same external directory and create a SHA-256 manifest for the copies and both diffs.

- [ ] **Step 2: Establish the drift gate**

Before each later task, re-run status and hash checks. The cached diff must remain byte-identical throughout. Compare each current target against its external baseline with `git diff --no-index -- <baseline> <current>` so implementation changes can be reviewed without confusing them with the user's starting work. If a target changes outside the active sequential task, stop and reconcile before continuing.

- [ ] **Step 3: Enforce workspace restrictions**

Do not stage, stash, commit, install dependencies, run a repo-wide formatter, or mutate files outside the active task's declared file list. The untracked theme files and E2E file are user-owned starting content, not disposable generated files.

---

### Task 1: Define and Normalize the Saved Presentation Contract

**Files:**
- Modify: `explorers-earth/src/features/Profile/types/themeTypes.ts`
- Modify: `explorers-earth/src/features/Profile/constants/themePresets.ts`
- Create: `explorers-earth/src/features/Profile/constants/recommendationsPresentation.ts`
- Create: `explorers-earth/src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts`

**Interfaces:**
- Produces: lossless `SocialMediaWire`, `ThemeSettingsWire`, and `RecommendationsPresentationWire` types plus strict normalized render types.
- Produces: `RECOMMENDATION_CATEGORY_IDS`, `RECOMMENDATION_CATEGORY_METADATA`, `DEFAULT_RECOMMENDATIONS_PRESENTATION`, `normalizeThemeSettings()`, `normalizeRecommendationsPresentation()`, `mergeThemeSettingsWire()`, `mergeSocialMediaWire()`, `isRecommendationCategoryVisible()`, `getPreferredRecommendationCategory()`, `resolveInitialPublicProfileTab()`, and `orderEligibleRecommendationCategoryIds()`.
- Consumes: existing `LandingTabId` and untrusted JSON from `accountData.social_media`; rendering never mutates or narrows the raw wire object.

- [ ] **Step 1: Write failing normalization and ordering tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOMMENDATIONS_PRESENTATION,
  normalizeRecommendationsPresentation,
  orderEligibleRecommendationCategoryIds,
} from "../recommendationsPresentation";

describe("normalizeRecommendationsPresentation", () => {
  it("uses complete defaults for an old profile", () => {
    expect(normalizeRecommendationsPresentation(undefined)).toEqual(
      DEFAULT_RECOMMENDATIONS_PRESENTATION,
    );
  });

  it("drops unknown and duplicate IDs, then appends missing IDs", () => {
    expect(
      normalizeRecommendationsPresentation({
        layout: "grid",
        categoryOrder: ["music", "music", "unknown", "books"],
      }).categoryOrder,
    ).toEqual([
      "music", "books", "places", "movies", "games",
      "guides", "apps", "products", "people",
    ]);
  });

  it("falls back from an unknown layout", () => {
    expect(normalizeRecommendationsPresentation({ layout: "carousel" }).layout)
      .toBe("shelves");
  });

  it("round-trips future keys at every JSON level", () => {
    const raw = {
      futureSocial: { keep: true },
      theme_settings: {
        futureTheme: "keep",
        recommendations: { layout: "grid", futureRecommendation: 7 },
      },
    };
    const merged = mergeSocialMediaWire(raw, {
      recommendations: { layout: "featured", categoryOrder: ["music"] },
    });
    expect(merged.futureSocial).toEqual({ keep: true });
    expect(merged.theme_settings.futureTheme).toBe("keep");
    expect(merged.theme_settings.recommendations.futureRecommendation).toBe(7);
  });
});

describe("orderEligibleRecommendationCategoryIds", () => {
  it("filters eligibility while retaining saved relative order", () => {
    expect(orderEligibleRecommendationCategoryIds({
      savedOrder: ["music", "books", "places"],
      eligible: ["places", "music"],
    })).toEqual(["music", "places"]);
  });

  it("promotes an eligible preferred category without hiding the rest", () => {
    expect(orderEligibleRecommendationCategoryIds({
      savedOrder: ["places", "books", "music"],
      eligible: ["places", "books", "music"],
      preferred: "music",
    })).toEqual(["music", "places", "books"]);
  });

  it("ignores a preferred category that is unavailable", () => {
    expect(orderEligibleRecommendationCategoryIds({
      savedOrder: ["places", "books"],
      eligible: ["places", "books"],
      preferred: "music",
    })).toEqual(["places", "books"]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify imports fail**

Run:

```bash
npm run test:unit -- src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts
```

Expected: FAIL because the types and helper module do not exist.

- [ ] **Step 3: Add the saved types and default object**

Add to `themeTypes.ts`:

```ts
export const RECOMMENDATION_CATEGORY_IDS = [
  "places", "music", "movies", "books", "games",
  "guides", "apps", "products", "people",
] as const;

export type RecommendationCategoryId =
  (typeof RECOMMENDATION_CATEGORY_IDS)[number];

export type RecommendationsLayout = "shelves" | "grid" | "featured";

export interface RecommendationCategoryMetadata {
  id: RecommendationCategoryId;
  labelKey: string;
  visibilityField:
    | "public_recommendations" | "public_music" | "public_movie"
    | "public_books" | "public_games" | "public_guides"
    | "public_apps" | "public_products" | "public_people";
  legacyEnabledWhenMissing: boolean;
}

export interface RecommendationsPresentationWire {
  layout?: unknown;
  categoryOrder?: unknown;
  [futureKey: string]: unknown;
}

export interface ThemeSettingsWire {
  preset?: unknown;
  wallpaperMode?: unknown;
  wallpaperUrl?: unknown;
  accentColor?: unknown;
  customTextColor?: unknown;
  landingTab?: unknown;
  visibleTabs?: unknown;
  footerBranding?: unknown;
  recommendations?: RecommendationsPresentationWire | null;
  [futureKey: string]: unknown;
}

export interface SocialMediaWire {
  theme_settings?: ThemeSettingsWire | null;
  [futureKey: string]: unknown;
}

export interface NormalizedRecommendationsPresentationSettings {
  layout: RecommendationsLayout;
  categoryOrder: RecommendationCategoryId[];
}
```

Keep `ThemeSettingsWire.recommendations` optional and raw. Add `recommendations: NormalizedRecommendationsPresentationSettings` only to the strict normalized render model, and add this default in `themePresets.ts`:

```ts
recommendations: {
  layout: "shelves",
  categoryOrder: [...RECOMMENDATION_CATEGORY_IDS],
},
```

- [ ] **Step 4: Implement explicit normalization and ordering helpers**

```ts
import {
  RECOMMENDATION_CATEGORY_IDS,
  type LandingTabId,
  type RecommendationCategoryId,
  type RecommendationsLayout,
  type NormalizedRecommendationsPresentationSettings,
} from "../types/themeTypes";

export type PublicProfileTab = "recommendations" | "gallery" | "business";

const layouts = new Set<RecommendationsLayout>(["shelves", "grid", "featured"]);
const categorySet = new Set<string>(RECOMMENDATION_CATEGORY_IDS);

export const DEFAULT_RECOMMENDATIONS_PRESENTATION: NormalizedRecommendationsPresentationSettings = {
  layout: "shelves",
  categoryOrder: [...RECOMMENDATION_CATEGORY_IDS],
};

export function normalizeRecommendationsPresentation(
  value: unknown,
): NormalizedRecommendationsPresentationSettings {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const layout = typeof raw.layout === "string" && layouts.has(raw.layout as RecommendationsLayout)
    ? raw.layout as RecommendationsLayout
    : "shelves";
  const seen = new Set<string>();
  const saved = Array.isArray(raw.categoryOrder) ? raw.categoryOrder : [];
  const categoryOrder = saved.filter((id): id is RecommendationCategoryId => {
    if (typeof id !== "string") return false;
    if (!categorySet.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of RECOMMENDATION_CATEGORY_IDS) {
    if (!seen.has(id)) categoryOrder.push(id);
  }
  return { layout, categoryOrder };
}
```

Export `RECOMMENDATION_CATEGORY_METADATA` as the single ordered source for category IDs, i18n label keys, existing `public_*` visibility fields, and `legacyEnabledWhenMissing`. Only Places sets `legacyEnabledWhenMissing: true`; every other category requires the exact value `"Yes"`. Keep final translated strings and renderer-only icon/color data outside the saved contract so the shared profile module does not import React components or persist locale-specific text.

`normalizeThemeSettings()` validates every known preset, wallpaper, landing, color, and nested recommendation field without throwing. `mergeThemeSettingsWire(rawThemeSettings, knownPatch)` spreads the untouched raw `theme_settings` and nested `recommendations` records before applying normalized known edits. `mergeSocialMediaWire(rawSocialMedia, themePatch)` spreads the untouched raw `social_media` record and delegates the nested merge; no write path reconstructs any of these objects from a whitelist. The raw `social_media` object travels through Formik to the mutation boundary so siblings such as `localTunes` and future fields survive.

Implement the remaining helpers with these exact signatures:

```ts
export function getPreferredRecommendationCategory(
  landingTab?: LandingTabId | string | null,
): RecommendationCategoryId | undefined;

export function resolveInitialPublicProfileTab(args: {
  landingTab?: LandingTabId | string | null;
  hasVisibleRecommendationCategories: boolean;
  hasGallery: boolean;
  hasBusiness: boolean;
}): PublicProfileTab;

export function orderEligibleRecommendationCategoryIds(args: {
  savedOrder: readonly RecommendationCategoryId[];
  eligible: readonly RecommendationCategoryId[];
  preferred?: RecommendationCategoryId;
}): RecommendationCategoryId[];

export function isRecommendationCategoryVisible(
  account: Record<string, unknown>,
  id: RecommendationCategoryId,
): boolean;

export interface KnownThemeSettingsPatch {
  preset?: ThemePresetId;
  wallpaperMode?: WallpaperMode;
  wallpaperUrl?: string;
  accentColor?: string;
  customTextColor?: string;
  landingTab?: LandingTabId;
  recommendations?: NormalizedRecommendationsPresentationSettings;
}

export function mergeThemeSettingsWire(
  raw: unknown,
  patch: KnownThemeSettingsPatch,
): ThemeSettingsWire;

export function mergeSocialMediaWire(
  raw: unknown,
  themePatch: KnownThemeSettingsPatch,
): SocialMediaWire;
```

- [ ] **Step 5: Add the complete legacy landing matrix test**

```ts
it.each([
  ["all-recommendations", "recommendations", undefined],
  ["places", "recommendations", "places"],
  ["music", "recommendations", "music"],
  ["guides", "recommendations", "guides"],
  ["movies", "recommendations", "movies"],
  ["books", "recommendations", "books"],
  ["games", "recommendations", "games"],
  ["apps", "recommendations", "apps"],
  ["products", "recommendations", "products"],
  ["people", "recommendations", "people"],
  ["gallery", "gallery", undefined],
  ["business", "business", undefined],
] as const)("maps %s", (landingTab, expectedTab, expectedCategory) => {
  expect(resolveInitialPublicProfileTab({
    landingTab,
    hasVisibleRecommendationCategories: true,
    hasGallery: true,
    hasBusiness: true,
  })).toBe(expectedTab);
  expect(getPreferredRecommendationCategory(landingTab)).toBe(expectedCategory);
});
```

Add separate cases for unavailable Business, no Recommendations, missing settings, an unknown string, every known top-level theme field receiving malformed input, and non-object/null wire values.

For visibility, table-test `"Yes"`, `"No"`, `undefined`, `null`, and malformed values across all nine categories. Assert only Places defaults enabled when missing/null and that the same helper will drive shell availability and query `skip` decisions.

Add a lazy (non-materializing) permutation test over all 9! valid category orders. For each permutation, assert normalization preserves every valid ID exactly once and `orderEligibleRecommendationCategoryIds()` preserves relative order after filtering. Add canary round-trip cases for unknown keys at `social_media`, `theme_settings`, and `recommendations` levels. Keep this pure/unit-level; live QA uses representative order shapes rather than 362,880 publishes.

- [ ] **Step 6: Run the contract tests and typecheck**

Run:

```bash
npm run test:unit -- src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts
npx tsc -b
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 7: Review the contract unit without committing unrelated work**

```bash
git diff -- explorers-earth/src/features/Profile/types/themeTypes.ts explorers-earth/src/features/Profile/constants/themePresets.ts explorers-earth/src/features/Profile/constants/recommendationsPresentation.ts explorers-earth/src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts
```

---

### Task 2: Add Dashboard Layout and Ordering Controls

**Files:**
- Create: `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx`
- Create: `explorers-earth/src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx`
- Modify: `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`
- Modify: `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx`
- Modify: `explorers-earth/src/features/Profile/components/ProfileForm.tsx` and its focused test
- Modify: `explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts` and its focused test
- Modify: `explorers-earth/src/pages/Profile.tsx`
- Create/Modify: `explorers-earth/src/pages/__tests__/Profile.save.test.tsx` (or the existing focused Profile test location)
- Modify: `explorers-earth/src/i18n/resources/en.json`; mechanically synchronize the locale catalogs
- Create: `docs/design-system/mockups/page/recommendations-layouts.html` from the approved concept board

**Interfaces:**
- Consumes: normalized presentation defaults and canonical category metadata from Task 1.
- Produces: `RecommendationsPresentationControls({ value, landingTab, onChange })` where `onChange` emits a complete normalized known-field patch while the save boundary merges it into the untouched wire object; the preview applies the effective landing promotion.
- Produces: accessible layout radios and Move Up/Move Down category-order actions.
- Produces: a truthful, terminal save result across direct, username-confirmation, and unsaved-navigation flows.

- [ ] **Step 1: Write failing control-contract tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecommendationsPresentationControls from "../RecommendationsPresentationControls";

describe("RecommendationsPresentationControls", () => {
  it("offers all three layouts without category visibility checkboxes", () => {
    render(<RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Classic Shelves/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Category Mosaic/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Featured First/i })).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("emits a complete object when layout changes", () => {
    const onChange = vi.fn();
    render(<RecommendationsPresentationControls value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Category Mosaic/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      layout: "grid",
      categoryOrder: expect.arrayContaining(["places", "music", "people"]),
    }));
  });

  it("moves a category with an accessible button", () => {
    const onChange = vi.fn();
    render(<RecommendationsPresentationControls value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Places down" }));
    expect(onChange.mock.lastCall?.[0].categoryOrder.slice(0, 2))
      .toEqual(["music", "places"]);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the missing component failure**

Run:

```bash
npm run test:unit -- src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused Dashboard component**

Use this public contract:

```tsx
interface RecommendationsPresentationControlsProps {
  value?: RecommendationsPresentationWire | null;
  landingTab?: LandingTabId | string | null;
  onChange: (value: NormalizedRecommendationsPresentationSettings) => void;
}
```

Implement layout choices as a `fieldset` containing three native radio inputs. Implement category order as an `<ol>` with visible Move Up and Move Down buttons. Each row exposes “{Category}, position N of 9”; buttons are at least 44×44px, disable at boundaries, and retain focus after moving. Announce “{Category} moved to position N of 9” through one polite live region. Pointer drag-and-drop is intentionally out of scope; do not render an inert drag handle.

The preview accepts normalized values plus `landingTab`, applies `getPreferredRecommendationCategory()` and `orderEligibleRecommendationCategoryIds()` to its static sample data, and uses translated labels. It must include `aria-label="Recommendations layout preview"`, `data-layout={layout}`, and visible “Illustrative preview” copy so tests and live QA can identify it without relying on CSS classes.

- [ ] **Step 4: Integrate without resetting theme fields**

Change `ThemeAppearanceSection` to accept `ThemeSettingsWire`, normalize a separate known render value, and emit a losslessly merged wire value. Render:

```tsx
<RecommendationsPresentationControls
  value={themeSettings.recommendations}
  landingTab={themeSettings.landingTab}
  onChange={(recommendations) => onChange(
    mergeThemeSettingsWire(themeSettings, { recommendations }),
  )}
/>
```

Use the same lossless merge helper for the preset, accent, wallpaper, First view, and recommendations controls so unknown root/nested keys survive every edit. Do not replace nested recommendations with only normalized known keys.

Rename **Initial Landing Tab** to **First view** and render all twelve distinct persisted values: “Recommendations — saved order,” “Recommendations — Places first,” the remaining eight “Recommendations — {Category} first” values, Gallery, and Business. Add help text that category choices promote one category but keep every other public category. Use Dashboard semantic tokens and existing components; do not copy emoji headings or hard-coded white/gray styles from the legacy section.

- [ ] **Step 5: Expand the integration tests**

Add a test with unknown keys at `social_media`, `theme_settings`, and `recommendations`, click `Glassmorphism Frost`, and assert all canaries remain byte-equivalent while only `preset` and the preset default accent change. Add tests proving partial old profiles normalize, all twelve First view values are distinct (especially `all-recommendations` vs `places`), a Music landing promotes Music in preview without hiding the remaining sample categories, boundary buttons disable, focus stays on the invoked move button, and the live region announces the new position.

- [ ] **Step 6: Make Save & Publish feedback truthful**

Define and propagate this coordinator contract through `ProfileForm.tsx`, `Profile.tsx`, and the unsaved-changes modal path:

```ts
type SaveTerminalStatus = "saved" | "failed" | "cancelled";
type ProfileSaveResult =
  | { status: "saved" }
  | { status: "failed" }
  | { status: "deferred"; completion: Promise<SaveTerminalStatus> };

type ProfileSubmit = (values: KeyValuePair) => Promise<ProfileSaveResult>;
```

`useUpdateProfile` is mutation-only: it merges the known edit into the raw `social_media` wire object, returns confirmed mutation data or throws, and owns no toast. `Profile.tsx` is the single success/error toast owner and returns the coordinator result from every wrapper. Direct saves settle immediately. A username change returns `deferred`; its confirmation, cancellation, mutation failure, or retry settles `completion`. Replace the current DOM query/click plus fixed 1.5-second delay in the unsaved-changes flow with a registered async submit function that returns this result.

`ProfileForm` keeps its saving indicator local, awaits a terminal outcome, and resets Formik's saved baseline plus custom/feed dirty flags only on terminal `saved`. `failed` and `cancelled` keep current values and dirtiness; failure re-enables Save and produces exactly one error. Add page-level tests for direct success, GraphQL/network rejection, unconfirmed mutation response, username deferred/confirm/cancel/failure/retry, unsaved-modal save failure/success, retained values, and no duplicate toast.

- [ ] **Step 7: Preserve the approved visual reference and synchronize copy**

Copy `.superpowers/brainstorm/1230-1787230850/content/recommendations-layouts.html` to `docs/design-system/mockups/page/recommendations-layouts.html` without treating its raw colors, emoji, or drag affordance as production code. Add English i18n keys for First view choices, layouts, ordering announcements, preview label, loading/partial/empty/error/retry states, and pluralized counts, then run:

```bash
npm run i18n:sync
npm run i18n:check
```

Expected: all locale catalogs have identical key shape; untranslated new keys safely retain synchronized English fallback until translation work lands.

- [ ] **Step 8: Run Dashboard and save-contract tests and accessibility assertions**

Run:

```bash
npm run test:unit -- src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx src/features/Profile/components/__tests__/ProfileForm.test.tsx src/features/Profile/hooks/__tests__/useUpdateProfile.test.ts src/pages/__tests__/Profile.save.test.tsx
npm run i18n:check
npx tsc -b
```

Expected: all tests PASS; TypeScript exits 0.

- [ ] **Step 9: Review the Dashboard unit without committing unrelated work**

```bash
git diff -- explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx explorers-earth/src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx explorers-earth/src/features/Profile/components/ProfileForm.tsx explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts explorers-earth/src/pages/Profile.tsx explorers-earth/src/pages/__tests__/Profile.save.test.tsx explorers-earth/src/i18n/resources docs/design-system/mockups/page/recommendations-layouts.html
```

---

### Task 3: Build the Three Query-Free Public Layouts

**Files:**
- Create: `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsLayouts.tsx`
- Create: `explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx`
- Modify: `explorers-earth/src/features/PublicHome/components/PublicPlaceCard.tsx`
- Modify: `explorers-earth/src/features/PublicHome/components/__tests__/PublicPlaceCard.test.tsx`
- Modify: `explorers-earth/src/features/PublicHome/components/PublicHome.tsx` (prop migration only)
- Modify: `explorers-earth/src/index.css` with a scoped `profile-presentation-focus` rule that overrides the legacy global focus reset

**Interfaces:**
- Consumes: ordered ready/loading category slots from `ProfileRecommendationsTab`.
- Produces: `ProfileRecommendationsLayouts({ layout, slots })`.
- Must not import Apollo Client, React Query, or account settings.
- Preserves both existing `PublicPlaceCard` interaction modes with a discriminated semantic API:

```ts
type PublicPlaceCardNavigation = { href: string; onAction?: never };
type PublicPlaceCardAction = { onAction: () => void; href?: never };
type PublicPlaceCardProps = PublicPlaceCardBaseProps &
  (PublicPlaceCardNavigation | PublicPlaceCardAction);
```

The card renders a React Router `Link` for `href` and a native `button` for `onAction`. Existing `PublicHome.tsx` modal callers migrate from `onClickhandler` to `onAction`; profile recommendation layouts always use `href`.

Define the shared view model in the new file:

```ts
export interface RecommendationListCardViewModel {
  id: string;
  title: string;
  image?: string | null;
  previewImages?: string[];
  subtitle?: string;
  href: string;
}

export interface RecommendationCategoryReadyViewModel {
  status: "ready";
  id: RecommendationCategoryId;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  lists: RecommendationListCardViewModel[];
  listCount: number;
  itemCountLabel?: string;
  href: string;
}

export interface RecommendationCategoryLoadingViewModel {
  status: "loading";
  id: RecommendationCategoryId;
  label: string;
}

export type RecommendationCategorySlotViewModel =
  | RecommendationCategoryReadyViewModel
  | RecommendationCategoryLoadingViewModel;
```

- [ ] **Step 1: Write failing layout tests**

```tsx
it.each([
  ["shelves", "recommendations-shelves"],
  ["grid", "recommendations-grid"],
  ["featured", "recommendations-featured"],
] as const)("renders %s in the supplied order", (layout, testId) => {
  render(<ProfileRecommendationsLayouts layout={layout} slots={categories} />);
  const root = screen.getByTestId(testId);
  const headings = within(root).getAllByRole("heading", { level: 2 });
  expect(headings.map((heading) => heading.textContent)).toEqual(["Music", "Places"]);
});

it("uses the first category as the Featured First spotlight", () => {
  render(<ProfileRecommendationsLayouts layout="featured" slots={categories} />);
  expect(screen.getByTestId("featured-category")).toHaveTextContent("Music");
});

it("renders the category as a semantic route link", async () => {
  render(<ProfileRecommendationsLayouts layout="grid" slots={categories} />);
  expect(screen.getByRole("link", { name: "Open Music" }))
    .toHaveAttribute("href", "/alice/music");
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx
```

Expected: FAIL because `ProfileRecommendationsLayouts.tsx` does not exist.

- [ ] **Step 3: Implement Classic Shelves first**

Move the existing `CategorySection` presentation out of `ProfileRecommendationsTab.tsx`. Preserve the visual density and themed CSS variables. Replace the current clickable `<h2>` with one semantic category `<Link>` whose accessible name is `Open {Category}`; keep the visible `<h2>` as non-interactive heading content and avoid a duplicate nested “See all” target. Use the discriminated `PublicPlaceCard` link variant, reserve image dimensions, lazy-load/decode non-feature images, swap missing/broken images to the same fallback without layout shift, and render at most 12 shelf cards per category. Add `data-testid="recommendations-shelves"` and `data-category-id` on every category root.

- [ ] **Step 4: Implement Category Mosaic**

Render each category as a whole-tile semantic link with its label, `lists.length`, the adapter's honest `itemCountLabel`, and at most three decorative preview images. Use one column below 640px and two columns from 640px; do not truncate the accessible label. Add `data-testid="recommendations-grid"` and `data-category-id` on every category root.

- [ ] **Step 5: Implement Featured First**

Render `categories[0]` as one full-width semantic featured link and the remainder as compact ordered links. Use the category label as visible text and the accessible name; imagery is decorative. The hero uses at most four preview images and the first above-fold image may load eagerly; each compact row uses one lazy image. Clamp feature text to two lines and row text to one without clipping at 200% zoom. Add `data-testid="recommendations-featured"`, `data-testid="featured-category"`, and `data-category-id` on every category root.

- [ ] **Step 6: Preserve shared empty behavior**

Return `null` for an empty `slots` array because `ProfileRecommendationsTab` owns true-empty and error/recovery states. Render layout-specific, theme-token placeholders for `status: "loading"` slots so ready categories appear immediately without reordering around unresolved earlier categories.

Add fixtures for a 64-character title, 30% expanded/RTL labels, zero/one/many/four-digit/lower-bound counts, missing imagery, and a broken image event. In JSDOM, assert semantics, href/action behavior, classes, state, image caps, keyboard activation, and no nested interactive elements. Do not claim computed layout/focus geometry in unit tests; Playwright owns actual focus rendering, contrast, dimensions, overflow, zoom, breakpoints, and reduced motion.

- [ ] **Step 7: Run layout tests, footer/card regressions, and typecheck**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx src/features/PublicHome/components/__tests__/PublicPlaceCard.test.tsx src/features/PublicHome/components/__tests__/PublicProfileFooter.test.tsx
npx tsc -b
```

Expected: link and action variants both pass focused regressions, including the modal callback behavior used by `PublicHome.tsx`; TypeScript verifies all migrated PublicHome callers and exits 0.

- [ ] **Step 8: Review the public layout unit without committing unrelated work**

```bash
git diff -- explorers-earth/src/features/PublicHome/components/ProfileRecommendationsLayouts.tsx explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx explorers-earth/src/features/PublicHome/components/PublicPlaceCard.tsx explorers-earth/src/features/PublicHome/components/__tests__/PublicPlaceCard.test.tsx explorers-earth/src/features/PublicHome/components/PublicHome.tsx explorers-earth/src/index.css
```

---

### Task 4: Apply Saved Order and Layout to Resilient Category Data

**Files:**
- Modify: `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx`
- Create: `explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx`

**Interfaces:**
- Consumes: normalized Recommendations presentation, optional `RecommendationCategoryId`, and the shared visibility helper from the profile shell.
- Produces: ordered ready/loading category slots for `ProfileRecommendationsLayouts`, plus distinct partial, empty, and all-error recovery UI.
- Retains: nine independent query paths; uses the one privacy helper for every query `skip`; adds no account or category request.

Change the props to:

```ts
interface ProfileRecommendationsTabProps {
  accountData: PublicRecommendationAccountData;
  username: string;
  presentation?: RecommendationsPresentationWire | null;
  preferredCategory?: RecommendationCategoryId;
}
```

- [ ] **Step 1: Write a failing ordered-render integration test**

Mock Apollo's `useQuery` by GraphQL operation name so only Places and Books return lists; mock React Query's music request as skipped/empty. Render with `presentation={{ layout: "grid", categoryOrder: ["books", "places"] }}` and assert:

```tsx
expect(screen.getByTestId("recommendations-grid")).toBeVisible();
expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent))
  .toEqual(["Books", "Places"]);
```

Add a second case with `preferredCategory="places"` and assert Places moves first while Books remains.

- [ ] **Step 2: Run the focused test and verify the current hardcoded order fails**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx
```

Expected: FAIL because the component has no presentation props and uses static `CATEGORIES` order.

- [ ] **Step 3: Normalize settings at the component boundary**

```ts
const normalizedPresentation = useMemo(
  () => normalizeRecommendationsPresentation(presentation),
  [presentation],
);
```

Do not place a raw nested settings object directly in dependency arrays after spreading it.

- [ ] **Step 4: Build one explicit per-category query-state adapter**

For each visibility-enabled category, adapt its existing Apollo/React Query result to two orthogonal axes so data and error can coexist:

```ts
interface RecommendationCategoryQueryState {
  id: RecommendationCategoryId;
  dataStatus: "loading" | "empty" | "ready";
  lists: RecommendationListCardViewModel[];
  listCount: number;
  itemCount?: { value: number; isLowerBound: boolean; unitKey: string };
  error: unknown | null;
  retry: () => Promise<unknown>;
}
```

Apollo `data`, `loading`, `error`, and `refetch` and TanStack `data`, `isLoading`, `isFetching`, `isRefetchError`/`error`, and `refetch` must all be captured. `loading && data == null` is unresolved; partial Apollo data or cached Music data remains `ready`/`empty` while an error is reported separately. Disabled categories issue zero requests. A missing account `documentId` becomes a recoverable panel error rather than a malformed request.

Use and test this adapter map before changing query shapes:

| Category | Public collection | Category / card href | List count | Item-count meaning | Cover / preview source |
|---|---|---|---|---|---|
| Places | visible recommendation lists | `/:u/places` / `/:u/places/:slug` | visible lists | public places | list/recommended-place media |
| Music | public playlists | `/:u/music` / existing playlist route | playlists | songs | playlist artwork / songs |
| Movies | visible movie lists | `/:u/movies` / `/:u/movies/:slug` | visible lists | movies | cover / movie posters |
| Books | visible book lists | `/:u/books` / `/:u/books/:slug` | visible lists | books | cover / book covers |
| Games | visible game lists | `/:u/games` / `/:u/games/:slug` | visible lists | games | cover / game covers |
| Guides | visible guides | `/:u/guides` / `/:u/guides/:slug` | guides | omit aggregate item count; label guides honestly | first guide media |
| Apps | visible app lists | `/:u/apps` / `/:u/apps/:slug` | visible lists | apps | cover / logos |
| Products | visible product lists | `/:u/products` / `/:u/products/:slug` | visible lists | products | cover / parsed first product image |
| People | visible people lists | `/:u/people` / `/:u/people/:slug` | visible lists | people | avatars |

Verify whether exact aggregate totals are available in the existing operations without another request. Replace count-only relation-ID payloads with same-operation aggregate totals when supported. If the backend only returns a capped relation (currently up to 500), set `isLowerBound` and display `500+`; never call it exact. Count before rendering caps, keep at most four preview URLs per card in memory, and convert current `navigate()` closures to route `href` strings at this boundary.

Order visibility-enabled IDs through the normalized saved order and preferred-category promotion before mapping to slots. Emit loading slots in place, ready slots for any nonempty data even when `error` also exists, and omit successfully empty categories from the layout while preserving their state for panel-level messages. This prevents layout jumps when an earlier saved category is unresolved and prevents stale/partial content from disappearing during refetch errors.

- [ ] **Step 5: Delegate the rendered result**

Replace the hardcoded `categoriesToShow.map(CategorySection)` block with:

```tsx
<ProfileRecommendationsLayouts
  layout={normalizedPresentation.layout}
  slots={orderedSlots}
/>
```

Mark the panel `aria-busy` while any enabled query has `dataStatus="loading"`, but render ready categories immediately. Use only public theme tokens for skeleton, empty, partial, and error surfaces. A shared `isRetrying` lock snapshots only adapters with `error`, disables repeated Retry clicks, and awaits them with `Promise.allSettled`. When some queries fail, render ready/cached content plus one nonblocking “Some categories are unavailable” notice. When no renderable content exists and every enabled adapter has an error, show “Couldn’t load recommendations” with Retry. When any adapter errored and the rest succeeded empty, show recovery rather than true emptiness. Show “No public recommendations yet” only after every enabled adapter settles successfully with no error and no content.

- [ ] **Step 6: Add the complete state and recovery matrix**

Add tests for initial loading, a slow earlier category plus a ready later category, partial Apollo data plus error, cached Music plus refetch error, paused/disabled Music, missing document ID, partial failure plus success, all failure, empty successes plus a failure, true empty, rapid Retry clicks, `Promise.allSettled` partial retry, recovery, preferred-category failure, and no presentation prop. Assert disabled categories issue zero requests, failed-query retry does not refetch successful categories, cached/partial data stays visible, copy never conflates privacy with absence, `aria-busy` clears, counts/caps follow the table, and Minimal Light uses theme tokens rather than hard-coded white/blue utilities.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx
npx tsc -b
```

Expected: all tests PASS; TypeScript exits 0.

- [ ] **Step 8: Review the data-to-layout integration without committing unrelated work**

```bash
git diff -- explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx explorers-earth/src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx
```

---

### Task 5: Fix Initial Public Tab and Preferred Category Resolution

**Files:**
- Modify: `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx`
- Create: `explorers-earth/src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx`

**Interfaces:**
- Consumes: `normalizeThemeSettings()`, `resolveInitialPublicProfileTab()`, `getPreferredRecommendationCategory()`, and `isRecommendationCategoryVisible()`.
- Produces: a valid `activeTab` without route navigation or post-load selection flash.
- Passes: `presentation` and `preferredCategory` to `ProfileRecommendationsTab`.
- Guarantees: malformed theme/business JSON cannot throw; Gallery remains an available empty-capable tab.

- [ ] **Step 1: Write failing Gallery, Business, and category-landing tests**

Mock `getPublicProfileDataQuery`, analytics, QR hooks, and heavy child components. Use a `MemoryRouter` route `/:username`. For Gallery settings, assert the visibly labeled Gallery tab has `aria-selected="true"`. For Business settings with business details, assert Business is selected. For Music settings, assert Recommendations is selected and the mocked `ProfileRecommendationsTab` receives `preferredCategory="music"`.

- [ ] **Step 2: Run the test and reproduce the hardcoded Recommendation state**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx
```

Expected: Gallery and Business tests FAIL because line 275 initializes `"recommendations"`; Music prop wiring also fails.

- [ ] **Step 3: Replace the hardcoded initial state with a resolved effective state**

Use an explicit user override so async data can determine the initial value without overwriting later clicks:

```ts
const requestedInitialTab = resolveInitialPublicProfileTab({
  landingTab: themeSettings.landingTab,
  hasVisibleRecommendationCategories,
  hasGallery: hasGalleryTab,
  hasBusiness: hasBusinessDetails,
});
const [selection, setSelection] = useState<{
  username: string;
  tab: PublicProfileTab;
} | null>(null);
const activeTab = selection?.username === username
  ? selection.tab
  : requestedInitialTab;
```

Replace tab click handlers with `setSelection({ username, tab })`. This keyed override prevents a prior profile's manual selection from flashing on a newly routed username. Adapt the availability guard to replace only a same-username override that becomes unavailable; never navigate routes to implement landing behavior.

Derive `hasVisibleRecommendationCategories` by calling the shared visibility helper for all nine IDs. Use `const hasGalleryTab = true` explicitly; do not rename or replace it with “has gallery media.” Parse `Public_Profile_Address` through a `safeParseBusinessDetails()` helper that accepts object/string/null and returns `null` on malformed JSON. Normalize all raw theme settings before calculating styles, tab selection, or child props.

Implement the complete tabs pattern: wrapper `role="tablist"`; visible text labels; each trigger has `role="tab"`, stable `id`, `aria-controls`, `aria-selected`, and roving `tabIndex`; each mounted panel has `role="tabpanel"`, matching `id`, and `aria-labelledby`. Left/Right wrap among currently available tabs, Home/End move to first/last, Enter/Space activates, click activates, and focus remains visibly rendered through the scoped focus class. Use 44px minimum hit targets without relying on color alone.

- [ ] **Step 4: Pass normalized Recommendations settings and preferred category**

```tsx
<ProfileRecommendationsTab
  accountData={accountData}
  username={username || ""}
  presentation={themeSettings.recommendations}
  preferredCategory={getPreferredRecommendationCategory(themeSettings.landingTab)}
/>
```

- [ ] **Step 5: Add unavailable and username-change tests**

Test Business requested without business data, malformed `Public_Profile_Address`, Gallery requested with no media, all recommendation visibility fields false, Places visibility missing, missing/malformed settings, unknown legacy values, a manual tab click, and a rerender from one username/settings object to another. Unit tests own Left/Right wrap, Home/End, Enter/Space, unavailable Business omission, ID relationships, roving tab stop, visible labels, and focus classes. Playwright owns 44px geometry and computed focus rendering. Assert no stale selection flash, no profile crash, and no call to `navigate()` occurs solely because of landing presentation.

- [ ] **Step 6: Run the complete public presentation test set**

Run:

```bash
npm run test:unit -- src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx
npx tsc -b
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Review the landing fix without committing unrelated work**

```bash
git diff -- explorers-earth/src/features/PublicHome/components/PublicProfile.tsx explorers-earth/src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx
```

---

### Task 6: Verify Persistence, Responsive Layouts, and Safe Restore

**Files:**
- Modify: `explorers-earth/e2e/profile-theme.spec.ts`
- Create: `explorers-earth/e2e/profile-presentation-visual.spec.ts`
- Modify: `docs/superpowers/reports/2026-08-20-theme-appearance-qa.md`

**Interfaces:**
- Consumes: an explicitly supplied authenticated storage state, username, and approved test account.
- Produces: deterministic theme/state/viewport proof, an always-running pure covering-array proof, separately gated Dashboard-save/public-render coverage, and an exact raw `social_media` restore with an emergency fallback.

- [ ] **Step 1: Gate authenticated writes behind explicit environment values**

Keep the pure generator/coverage test outside all live-write gating. Only the live `describe`/test reads and skips on:

```ts
const username = process.env.E2E_PROFILE_USERNAME;
const storageState = process.env.E2E_PROFILE_STORAGE_STATE;
const liveWritesApproved = process.env.E2E_PROFILE_LIVE_WRITES === "1";

test.describe("approved live profile writes", () => {
  test.skip(
    !username || !storageState || !liveWritesApproved,
    "Requires approved profile account, auth storage state, and E2E_PROFILE_LIVE_WRITES=1",
  );
  // live test only
});
```

Load the storage state in a scoped `test.use({ storageState, trace: "off", video: "off" })`; do not change the default Playwright configuration for unrelated tests. Do not record HAR or attach live network diagnostics because authenticated headers must remain memory-only.

- [ ] **Step 2: Capture the exact raw baseline and content preconditions before the first write**

After a clean Dashboard reload, capture the authenticated profile query's complete raw `social_media` JSON, not just `theme_settings` or visible controls. Also record the visible preset, accent, wallpaper, landing, layout, and all nine category-order values.

Before the first real mutation, route-intercept one baseline Save & Publish attempt, capture its authenticated `UpdateAccount` URL/headers/variables strictly in memory, abort it before network dispatch, and re-read the profile to prove no write occurred. Remove the interceptor, then use that template for one controlled setup mutation that adds a unique nested sentinel under `theme_settings.recommendations`; verify the sentinel and all original keys. This proves the restore channel before matrix writes begin. Refuse the setup write unless both the raw baseline and template are available. Never print, persist, attach, or include headers/tokens in traces; redact mutation diagnostics. Load the public Recommendations tab once, require at least two content-bearing categories, and record whether Business is actually available so Business assertions can use an explicit precondition/fallback. Fail precisely before the setup write if ordering/promotion cannot be proven.

- [ ] **Step 3: Define all-layout witness cases inside the live matrix**

Build the live matrix from the first three content-bearing category IDs discovered in the preflight (or both when exactly two exist), rotating/reversing them across all three layouts. This avoids hard-coding categories that the approved account may not contain while still proving nontrivial ordering.

```ts
const cases = [
  { layout: "shelves", order: reverse(eligibleSample) },
  { layout: "grid", order: rotate(eligibleSample, 1) },
  { layout: "featured", order: rotate(eligibleSample, 2) },
] as const;
```

Require the eventual pairwise matrix to contain these three witness rows. When the live matrix runs, move the named categories through visible Dashboard controls, Save & Publish once per matrix row, reload `/${username}`, and assert:

- Recommendations is selected unless the saved top-level setting is Gallery/Business.
- If Gallery or Business is the saved initial tab, click Recommendations before asserting layout evidence; then assert the corresponding `data-testid` exists.
- Rendered category headings begin in the requested relative order after filtering categories that have no public content.
- Featured First's `data-testid="featured-category"` contains the first eligible saved category.
- Gallery remains clickable and renders its existing empty/content panel; Business renders its panel when the preflight says it is available, otherwise the saved Business witness must prove the documented safe fallback.

- [ ] **Step 4: Define a preferred-category witness inside the live matrix**

Require at least one matrix row to save a category First view value that has public content. On that row, reload, assert Recommendations remains selected, assert that category is first, and assert at least one other eligible category remains rendered below it.

- [ ] **Step 5: Restore in `finally` and prove equality**

Use nested `finally` cleanup. First reapply all captured visible fields through the Dashboard, Save & Publish once, clean-reload, re-read the raw authenticated profile query, and deep-compare the complete final `social_media` JSON with the baseline. If the UI restore or equality proof fails, replay the captured authenticated mutation with the exact raw baseline, verify raw equality again, then rethrow the original restore failure with redacted diagnostics. The emergency mutation is allowed only for cleanup, at most once, and never masks a failed normal restore. Also compare public layout/order/tab evidence with the captured baseline. Add a mocked Playwright cleanup test that forces normal restore failure and proves emergency restore plus original-error propagation.

- [ ] **Step 6: Run deterministic local verification first**

Run:

```bash
npm run test:unit -- src/features/Profile/constants/__tests__/recommendationsPresentation.test.ts src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx src/features/Profile/components/__tests__/ProfileForm.test.tsx src/features/Profile/hooks/__tests__/useUpdateProfile.test.ts src/pages/__tests__/Profile.save.test.tsx src/features/PublicHome/components/__tests__/PublicPlaceCard.test.tsx src/features/PublicHome/components/__tests__/ProfileRecommendationsLayouts.test.tsx src/features/PublicHome/components/__tests__/ProfileRecommendationsTab.test.tsx src/features/PublicHome/components/__tests__/PublicProfile.presentation.test.tsx
npx tsc -b
npm run build
```

Expected: all focused tests PASS, TypeScript exits 0, and production build exits 0. Existing bundle-size warnings are recorded but do not weaken the assertions.

- [ ] **Step 7: Run the deterministic public visual/state matrix without live writes**

In `profile-presentation-visual.spec.ts`, intercept public-profile and category queries with fixed fixtures. Cover all 6 public presets × all 3 layouts at 375px and 1024px (36 success compositions), then cover loading, true empty, partial data+error, stale data+refetch error, all-error/retry, missing image, and broken image under Minimal Light and Cinematic Dark. At 320, 639/640, 767/768, 1024, and 1440px assert no page-level horizontal overflow, 44px targets, intended Mosaic column count, and Featured text/media separation at 200% zoom. Include 64-character titles, 30% expanded copy, RTL, zero/one/many/four-digit/lower-bound counts, rapid Retry locking, malformed business JSON, and disabled-category no-request fixtures. Assert text contrast ≥4.5:1 and control/focus contrast ≥3:1 from computed styles, visible focus, and reduced-motion behavior. Dashboard controls need light/dark Dashboard modes only. These browser tests—not JSDOM—own computed geometry/style assertions.

Run:

```bash
npx playwright test e2e/profile-presentation-visual.spec.ts --project=chromium
```

Expected: 0 failures; save screenshots/traces only on failure unless approved baselines are intentionally added.

- [ ] **Step 8: Generate the deterministic pairwise live-write matrix in dry-run mode**

Extend `profile-theme.spec.ts` with a deterministic covering-array generator across every value of public preset (6), accent swatch (6), wallpaper mode (4), First view (12), recommendations layout (3), and representative order shape (canonical, reverse, rotate, preferred-first). The always-running test validates every value and every pair, determinism, and required witness rows without navigating or writing. The 6-preset × 12-First-view pair alone creates a hard lower bound of 72 rows; print the exact generated matrix size, publish count, and duration estimate. The 9! order invariant remains unit-level.

Run without any live-write variables:

```bash
npx playwright test e2e/profile-theme.spec.ts --project=chromium --grep "covering array dry run"
```

Expected: the pure test runs rather than skips, performs zero navigation/mutations, proves full pair coverage, and reports `N >= 72`.

- [ ] **Step 9: Obtain action-time approval and run the live pairwise test**

Before enabling `E2E_PROFILE_LIVE_WRITES=1`, state the exact account, route, dry-run matrix size `N` (at least 72), `N` matrix publishes, one controlled sentinel setup publish, one normal restore publish, and at most one emergency cleanup publish. Set an explicit per-test timeout derived from `(N + 2) × measuredPublishBudget + preflight/verificationBudget`, print the estimate, and request action-time approval. After approval, run:

```bash
$env:E2E_PROFILE_USERNAME="tk2727"
$env:E2E_PROFILE_STORAGE_STATE="C:\Users\TK\AppData\Local\Temp\explorers-earth-e2e-auth-state.json"
$env:E2E_PROFILE_LIVE_WRITES="1"
npx playwright test e2e/profile-theme.spec.ts --project=chromium
```

Expected: PASS with normal restore and raw `social_media` equality proven. Do not commit or document the auth-state file, mutation template, headers, or tokens.

- [ ] **Step 10: Update the QA report with exact evidence**

Append local test counts, all 6×3 deterministic visual results, responsive/state/accessibility results, pairwise coverage proof, exact live publish count/duration, preferred-category result, Gallery/Business regression result, raw `social_media` baseline/restore equality, whether emergency restore was needed, and any browser console/network errors. Keep expected and actual values separate and redact all authentication material.

- [ ] **Step 11: Run the complete frontend unit suite**

Run:

```bash
npm run test:unit
```

Expected: zero failed test files and zero failed tests. Record the exact counts from fresh output.

- [ ] **Step 12: Review verification artifacts without committing credentials or unrelated work**

```bash
git diff -- explorers-earth/e2e/profile-theme.spec.ts explorers-earth/e2e/profile-presentation-visual.spec.ts docs/superpowers/reports/2026-08-20-theme-appearance-qa.md
```

---

## Final Review Checklist

- [ ] The three top-level profile tabs remain Recommendations, Gallery, and Business.
- [ ] All nine category IDs are always preserved by Dashboard ordering state.
- [ ] Existing Public Visibility remains the sole privacy control.
- [ ] Old profiles and malformed JSON normalize to safe theme defaults and Classic Shelves/canonical order without losing unknown keys at any JSON level.
- [ ] The shared visibility helper makes missing/null Places public for legacy compatibility, disables missing/null non-Places categories, and prevents disabled queries.
- [ ] Category landing values promote rather than navigate or hide.
- [ ] Gallery and Business landing values select their real tabs with safe fallback.
- [ ] No new account or category request was introduced.
- [ ] All three layouts are themed, responsive, keyboard operable, and tested.
- [ ] `PublicPlaceCard`, category routes, and the three profile tabs use semantic keyboard-operable controls with visible focus.
- [ ] `PublicPlaceCard` preserves both semantic route-link and modal-action variants; all existing PublicHome callers typecheck.
- [ ] Dashboard reordering exposes positions, retains focus, and announces moves.
- [ ] First view exposes all twelve distinct saved values and its preview matches effective public promotion.
- [ ] Partial/cached data can coexist with query errors; progressive loading, true empty, partial failure, all-error/retry, retry locking, and recovery are distinguishable and tested.
- [ ] Direct, deferred username, cancellation, unsaved-modal, failed, retried, and confirmed save outcomes clear dirtiness/toast exactly once only when appropriate.
- [ ] Count labels are honest at backend caps, preview/card limits are enforced, and no count-only request or excessive relation-ID payload is introduced when aggregate totals are available.
- [ ] Malformed Business JSON cannot crash the profile, and Gallery remains available even with no media.
- [ ] The 6-preset × 3-layout deterministic matrix and all breakpoint/content-resilience cases pass.
- [ ] The generated live matrix proves all values and all pairwise factor combinations, while 9! order permutations remain pure unit coverage.
- [ ] The pure covering-array test runs without credentials; live writes are separately approved with a computed timeout and the exact `N + 2` normal / optional one emergency publish budget.
- [ ] Complete raw `social_media` equality is proven after normal restore; the memory-only emergency restore path is tested and authentication material is never logged or persisted.
- [ ] Unrelated dirty worktree changes remain untouched.

## GSTACK REVIEW REPORT

| Phase | Voices | Initial result | Incorporated resolution | Final disposition |
|---|---|---|---|---|
| CEO/founder | Independent CEO review + Codex cross-check | Technical contract gaps; both reviewers questioned maintaining three layouts. | Shell availability no longer hoists nine queries; normalizers accept untrusted input; raw baselines and username-keyed tab state are explicit. The layout-scope concern is closed by the user's explicit post-mock decision to ship all three, with one shared view model containing the maintenance cost. | CLEAR |
| Design | Independent designer review + Codex cross-check | 6/10: inaccessible clickable cards/tabs, missing progressive/error states, weak theme/responsive matrix, and ambiguous owner IA. | Semantic link/button cards, full tabs pattern, progressive/error/empty state table, First view IA, ordered-list announcements, durable mock references, design-system tokens, 6×3 theme/layout coverage, RTL/zoom/breakpoint rules. | CLEAR |
| Engineering | Independent engineering review + Codex cross-check | 5/10 and 4/10: dirty-tree risk, lossy JSON writes, false save success, single-axis query state, unsafe live restore, caller compatibility, command cwd, count cost, JSDOM assertions, malformed business JSON. | Added Task 0 drift gate; wire/normalized split and lossless merge; `saved/failed/deferred` coordinator; dual-axis adapters; shared privacy helper; discriminated card API; explicit cwd; honest/capped counts; browser-owned geometry; safe business parsing; always-running dry run; `N+2` live budget; raw equality and emergency restore. | CLEAR |
| Developer experience | Applicability check | Not applicable: no public API, CLI, SDK, schema, or developer documentation surface changes. | No DX phase run. | N/A |

Engineering test plan: `C:\Users\TK\.gstack\projects\explorers.earth-main\TK-main-eng-review-test-plan-20260820-193105.md`.

Review-log note: this Windows host has neither `jq` nor the `gstack` executable, so no hand-written JSONL or synthetic command log was created. All findings, decisions, and dispositions are recorded in this report and the linked engineering test plan.

VERDICT: READY FOR USER APPROVAL. Product code and live profile writes remain gated. Implementation must be sequential in the current dirty worktree; the live matrix requires a second action-time approval after the exact `N >= 72` matrix and duration are known.

NO UNRESOLVED DECISIONS
