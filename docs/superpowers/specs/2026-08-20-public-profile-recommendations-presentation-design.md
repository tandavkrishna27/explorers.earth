# Public Profile Recommendations Presentation Design

**Date:** 2026-08-20

**Status:** Product direction approved; implementation plan reviewed and awaiting execution approval

**Approved visual directions:** Classic Shelves, Category Mosaic, and Featured First are all offered as selectable layouts.

## Problem

The public profile has three top-level tabs: Recommendations, Gallery, and Business. The Dashboard currently stores eleven `landingTab` values, but `PublicProfile.tsx` always initializes the top-level tab to Recommendations and does not consume the saved value. The Recommendations tab also renders eligible categories in a hardcoded order and one fixed horizontal-shelf layout.

The configuration currently conflates two different concepts:

1. Which of the three profile tabs opens first.
2. How the category sections inside Recommendations are ordered and presented.

The feature must separate those behaviors without breaking existing saved `theme_settings` JSON or the existing Public Visibility controls.

## Approved Product Behavior

### Top-level profile tabs

The public profile continues to expose exactly these three tabs:

1. Recommendations
2. Gallery
3. Business, when business details exist

Gallery and Business keep their current content and interaction behavior.

### Recommendations categories

The Recommendations tab continues to support these nine categories:

1. Places
2. Music
3. Movies & Shows
4. Books
5. Games
6. Guides
7. Apps & Tools
8. Products
9. People

There is no second visibility system in Theme & Appearance. Existing account fields such as `public_music`, `public_books`, and `public_games` remain the only privacy and publication controls. The presentation settings only change ordering and layout.

At render time, Recommendations includes a category only when it is globally public and has at least one public list or equivalent public item. One shared privacy helper controls both shell availability and query skipping: legacy Places is enabled when its visibility value is missing/null, while every other category requires exactly `"Yes"`. Removing an empty or private category must not disturb the saved relative order of the remaining categories, and disabled categories must issue no content request.

### Saved landing behavior

Existing saved `landingTab` values remain backward compatible:

| Saved value | Public behavior |
|---|---|
| `all-recommendations` | Open Recommendations and use the saved category order. |
| `places`, `music`, `guides`, `movies`, `books`, `games`, `apps`, `products`, or `people` | Open Recommendations, promote that eligible category to the first position, and retain every other eligible category below it in saved relative order. |
| `gallery` | Open Gallery. |
| `business` | Open Business when business details exist; otherwise fall back safely. |
| Missing or unknown value | Open Recommendations with the normalized saved order. |

A category landing choice does not navigate to `/:username/<category>` and does not hide other categories. Visitors can still use each category heading or “See all” action to open its dedicated public route.

### Fallback priority

The initial top-level tab is resolved only after public profile data is available:

1. Use the requested Gallery or Business tab when that tab is available.
2. Otherwise use Recommendations when at least one recommendation category is enabled by the existing Public Visibility fields. Content eligibility remains inside the Recommendations panel; the shell does not repeat or hoist its nine query paths.
3. Otherwise use Gallery, which currently supports an empty state.
4. Otherwise use Business when business data exists.

The resolver must never navigate between routes, so an unavailable saved category cannot create a redirect loop with `TabVisibilityGuard`.

## Saved Data Contract

The existing `theme_settings` JSON gains one nested, optional object:

```json
{
  "preset": "cinematic-dark",
  "wallpaperMode": "banner-top",
  "accentColor": "#10B981",
  "landingTab": "all-recommendations",
  "recommendations": {
    "layout": "shelves",
    "categoryOrder": [
      "places",
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people"
    ]
  }
}
```

The persisted shape is a forward-compatible wire object, while rendering uses a separate strict normalized model:

```ts
export type RecommendationCategoryId =
  | "places"
  | "music"
  | "movies"
  | "books"
  | "games"
  | "guides"
  | "apps"
  | "products"
  | "people";

export type RecommendationsLayout = "shelves" | "grid" | "featured";

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

export interface NormalizedRecommendationsPresentationSettings {
  layout: RecommendationsLayout;
  categoryOrder: RecommendationCategoryId[];
}
```

No Strapi collection or schema migration is required because `theme_settings` is already stored inside the existing JSON payload.

Writes are lossless read/merge/write operations. The complete raw `social_media` object travels through the form; known theme/recommendation edits are spread into the untouched raw `social_media`, `theme_settings`, and `recommendations` objects. Unknown siblings at all three levels—including existing values such as `localTunes` and future canary keys—must survive every Dashboard edit and save.

## Normalization Rules

Every read path must normalize untrusted or older JSON before rendering:

1. Unknown layout values become `shelves`.
2. Unknown category IDs are discarded.
3. Duplicate category IDs keep their first occurrence.
4. Missing known categories are appended in canonical order.
5. A missing `recommendations` object becomes the complete default object.
6. A preferred landing category is promoted in memory only when it is eligible; the stored category order is not mutated merely by visiting the public page.
7. Every known top-level theme enum/color is validated before use; unknown values fall back without narrowing the wire object.
8. Rendering normalization and persistence merging are separate operations: normalization never becomes the replacement payload.

These rules make partial old settings and future category additions safe.

## Approved Visual and Design References

- Approved three-layout concept board: `.superpowers/brainstorm/1230-1787230850/content/recommendations-layouts.html` (copy to `docs/design-system/mockups/page/recommendations-layouts.html` as the first implementation artifact so the reference is durable).
- Existing public-profile shell: `docs/design-system/mockups/page/public_profile.html` and `public_profile.md`.
- Existing recommendations/card vocabulary: `docs/design-system/mockups/page/recommendations.html` and `recommendations.md`.
- Authoritative rules: `docs/design-system/design.md`, `01-design-tokens.md`, `02-component-inventory.md`, `03-ux-patterns.md`, `04-html-reference-library.md`, and `ai-agent-rules.md`.

The mock board establishes composition, not literal colors or pointer drag behavior. Production uses semantic theme tokens, native controls, and the accessibility rules below.

## Dashboard Experience

`Theme & Appearance` keeps the current preset, accent, and wallpaper controls. Rename the mixed landing selector to **First view**. Its twelve explicit choices are “Recommendations — saved order,” nine “Recommendations — {Category} first” choices (including a distinct Places choice), Gallery, and Business. It adds a `Recommendations presentation` subsection containing:

### Layout selector

Three selectable visual cards:

- **Classic Shelves (`shelves`)**: the current category-heading and horizontally scrolling list-card pattern.
- **Category Mosaic (`grid`)**: a responsive category overview using two columns on wider viewports and one column on narrow mobile screens. Each tile shows the category name, public list/item count, and a direct action.
- **Featured First (`featured`)**: the first eligible category receives a large feature block; remaining categories use compact ordered rows.

The selected card must have a visible selected state independent of color alone.

### Category order editor

The editor displays all nine category names. Owners can reorder them with accessible Move Up/Move Down buttons. Each ordered-list row exposes its current position, retains focus after a move, and announces the new position through a polite live region. Pointer drag-and-drop and drag handles are not included. It does not include visibility checkboxes.

The Dashboard preserves all category IDs even when one is currently private or empty. This allows its position to remain stable if the owner publishes content later. A short note explains that Public Visibility controls whether a category appears.

### Preview

The subsection includes a compact preview driven by the same normalized layout, order, and `landingTab` promotion data used by the public renderer. Preview data is illustrative and must be labeled as a preview; it does not issue the nine public content queries.

### Saving

Every control updates a known-field patch that is merged into Formik's complete raw settings value. `Save & Publish` continues using the existing profile mutation path. Selecting a theme preset may change its default accent but must not reset `landingTab`, `recommendations`, or any unknown wire key.

Save completion is an explicit coordinator result:

- `saved`: the backend confirms the update; reset Formik's saved baseline plus custom/feed dirty state and show one success.
- `failed`: rejection, network failure, or unconfirmed response; retain all edits/dirtiness, show one error, and enable retry.
- `deferred`: username confirmation is still pending; its confirmation, cancellation, failure, or retry supplies a terminal completion result before any dirty state changes.

The mutation hook owns no toasts and does not swallow failure. The Profile page owns the single toast boundary. The unsaved-navigation modal calls a registered async submit function; it does not locate a DOM button or assume completion after a fixed delay.

## Public Rendering

`PublicProfile.tsx` safely normalizes theme settings and parses business details before resolving the top-level initial tab. Malformed business JSON makes Business unavailable rather than crashing the profile. Gallery remains an available empty-capable tab even when there is no media. It passes the normalized Recommendations presentation and optional preferred category to `ProfileRecommendationsTab`.

`ProfileRecommendationsTab` remains responsible for fetching public category data. Each independent adapter exposes data state (`loading | empty | ready`) separately from `error`, because partial Apollo data and cached React Query data may coexist with a failure. As its nine independent queries settle, it progressively:

1. Builds the existing category-to-list map.
2. Skips private categories through the shared visibility helper and filters successfully empty categories.
3. Applies normalized `categoryOrder`.
4. Promotes an eligible preferred landing category.
5. Renders the selected layout through a focused presentational component.

All three layouts reuse one semantic category/list vocabulary, existing navigation targets, and theme CSS variables. The shared card exposes a discriminated navigation/action API: route destinations render as links while existing in-page modal actions render as native buttons. Successful, partial, or cached categories render without waiting for unrelated slow queries; unresolved categories keep ordered placeholders; partial and all-error states remain distinct from a genuine empty result. Retry snapshots only failed adapters, uses `Promise.allSettled`, and locks against rapid duplicate retries. Layout selection must not introduce additional network requests.

Count labels have explicit category meanings. Places count public places; Music songs; list categories their public items; Guides display guide count only. Exact same-operation aggregate totals are preferred. When the backend only provides a capped relation, the UI shows an honest lower bound such as `500+`. Render caps are 12 shelf cards/category, 3 Mosaic images, 4 featured-hero images, 1 compact-row image, and 4 images/card; category routes retain access to full content.

## Accessibility and Responsive Rules

- Reordering must be possible without drag-and-drop.
- Layout cards must use buttons or radios with an accessible selected state.
- Tab buttons retain `aria-selected`; tab panels retain `role="tabpanel"`.
- Interactive targets are at least 44 by 44 CSS pixels on touch layouts.
- The grid becomes one column when two columns would make cards narrower than the existing readable card width.
- Featured content must not rely on a background image for its accessible name.
- Loading, empty, and partial-query states retain readable themed foreground/background contrast.
- Motion honors `prefers-reduced-motion` and is not required to understand the order change.
- Public tabs implement the complete `tablist`/`tab`/`tabpanel` relationship, roving focus, Left/Right/Home/End keys, stable IDs, and visible focus indicators.
- Category/list navigation uses semantic links or buttons rather than clickable non-interactive containers.
- Every new user-facing label uses the existing i18n system; layouts tolerate RTL and 30% copy expansion.
- Unit/JSDOM tests own semantics, classes, state, and keyboard behavior. Browser tests own computed focus/contrast, 44px geometry, overflow, columns, 200% zoom, broken-image layout, and reduced motion.

## Error and Recovery Behavior

| Condition | Required behavior |
|---|---|
| Missing `theme_settings` | Use all defaults. |
| Invalid layout or order JSON | Normalize locally; render without throwing. |
| Unknown keys in `social_media`, `theme_settings`, or `recommendations` | Preserve them byte-for-byte across known-field edits and saves. |
| One category query fails | Continue rendering successful categories using the existing resilient query policy. |
| Query has usable partial/cached data and an error | Keep the data visible, include it in order/layout, show the partial-error notice, and retry that adapter only. |
| Some category queries are unresolved or fail | Render successful categories immediately, retain ordered placeholders for unresolved categories, show a nonblocking retry affordance, and disable repeated Retry while recovery is running. |
| Every enabled category query fails | Show a themed actionable error with Retry; do not show empty-state copy. |
| Preferred category is private, empty, or failed | Ignore the promotion and render the remaining saved order. |
| Business is requested but absent | Fall back to Recommendations, then Gallery. |
| No visibility-enabled recommendation categories have content after successful settlement | Show a themed “No public recommendations yet” empty state; shell availability remains governed by Public Visibility, not child query results. |
| Save mutation fails or returns no confirmed update | Keep unsaved Dashboard selections and every dirty state visible, show exactly one page-owned error, re-enable Save for retry, and do not emit success. |
| Username save is awaiting confirmation | Return `deferred`; retain edits/dirtiness until confirmation/cancellation reaches a terminal outcome. |
| `Public_Profile_Address` is malformed JSON | Treat Business as unavailable and continue rendering the profile. |
| Backend relation total reaches a query cap | Display a lower bound such as `500+`, never a false exact count. |

## File Boundaries

- `themeTypes.ts` owns separate wire and normalized setting types.
- `recommendationsPresentation.ts` owns canonical categories, defaults, and pure normalization/order functions shared by Dashboard and public rendering.
- `RecommendationsPresentationControls.tsx` owns Dashboard layout selection, reordering, and preview.
- `ProfileRecommendationsLayouts.tsx` owns the three public presentational variants and contains no data fetching.
- `ProfileRecommendationsTab.tsx` owns public queries, progressive state aggregation, eligibility filtering, ordered view-model construction, and retry handling.
- `PublicProfile.tsx` owns top-level tab initialization and availability fallback.
- `Profile.tsx` owns the save-result coordinator and the single success/error toast boundary.

## Verification and Acceptance Criteria

1. Old profiles with no `recommendations` object render Classic Shelves in canonical order.
2. All three layouts persist through Dashboard Save & Publish and survive a clean reload.
3. Every permutation of the nine category IDs normalizes deterministically without dropping a valid ID.
4. Private, empty, failed, duplicated, missing, and unknown categories are handled according to the normalization and shared visibility rules; disabled categories issue zero queries.
5. Every legacy `landingTab` value produces the tabled top-level tab and preferred-category behavior.
6. The public page performs no additional account request and no additional category request because of presentation settings.
7. A deterministic public render matrix covers all 6 presets × all 3 layouts at 375px and 1024px, with breakpoint-edge checks at 320, 639/640, 767/768, 1024, and 1440px.
8. Keyboard tests confirm layout selection, category reordering with focus retention/announcement, semantic cards, and full tab keyboard behavior.
9. A pure deterministic covering-array test proves every value and every factor pair without credentials or writes. Separately approved live QA reports its exact matrix size (at least 72), computed timeout, account, route, publish budget, and restores the complete raw `social_media` object.
10. Live cleanup first proves normal UI restore; a memory-only authenticated mutation is an at-most-once emergency fallback, raw equality is rechecked, and authentication material is never logged or persisted.
11. Loading, true empty, partial data+error, cached data+refetch error, all-error/retry, rapid-retry locking, missing/broken imagery, 64-character titles, zero/one/many/lower-bound counts, 200% zoom, and RTL fixtures are verified with readable theme-token contrast.
12. Direct, failed, unconfirmed, deferred username, cancelled, retried, and unsaved-navigation saves clear baseline/dirtiness and emit success/error exactly once only when appropriate.

## Not in Scope

- A second category privacy or visibility system.
- Reordering lists or individual recommendations inside a category.
- Changing Gallery or Business content layouts.
- New public routes.
- Backend schema work or a new Strapi collection.
- Replacing the existing Public Visibility or pinned-navigation settings.
- Automatically ranking categories by engagement analytics.
