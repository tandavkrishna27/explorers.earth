<!-- RESTORE POINT: .context/autoplan-responsive-profile-editor-restore.md -->
# Responsive Profile Editor Polish — Implementation Plan

> Use `superpowers:executing-plans` to implement this plan task-by-task after review approval.

**Goal:** Turn the existing three-tab Profile editor into a beautiful, responsive,
flat workspace with centered icon tabs and accessible category drag-and-drop while
preserving every field, save path, Settings relocation, and public-profile behavior.

**Architecture:** Keep `ProfileForm` as the single Formik/save boundary. Add explicit
presentation metadata to its sections so the Profile page can render flat accordions
or direct workspaces without forking field logic. Use Framer Motion's existing Reorder
primitives for handle-only pointer/touch drag, backed by current Up/Down controls and
the existing normalized recommendation wire helpers. Persist only through the current
Save & Publish mutation.

**Tech stack:** React 18, TypeScript, Formik, Tailwind, Framer Motion 12, Lucide React,
Vitest/Testing Library, Playwright, Vite.

**Design spec:**
`docs/superpowers/specs/2026-08-20-responsive-profile-editor-polish-design.md`

**Approved mock:**
`docs/design-system/mockups/page/profile-editor-approved-2026-08-20.png`

## Baseline and Premise Gate

The direction is user-approved, but it is treated as a visual/product polish hypothesis,
not as measured user research. Before screenshots record: current nested surface count
(form card + accordion card + Appearance card), current task steps for reaching First
view/layout/order, and current 320/375/768/1024 geometry. After implementation the same
tasks must require no extra steps, decorative outer surface count must drop to zero on
Gallery/Appearance and one divider system on Profile, and every responsive assertion
below must pass. The user has authorized implementation after skills review provided
there is no scope expansion or change to data behavior.

## What Already Exists

- `src/pages/Profile.tsx` already owns three tabs, tab panels, Arrow/Home/End handling,
  unsaved-change state, Save & Publish orchestration, and the complete initial payload.
- `src/features/Profile/components/ProfileForm.tsx` already renders every Profile,
  Gallery, Appearance, Account, and Billing field through one Formik boundary.
- `src/components/ui/Accordian.tsx` already provides semantic triggers and animated
  content, but hard-codes the elevated card look and aggressive auto-scroll.
- `ThemeAppearanceSection.tsx` already preserves future wire keys while updating
  presets, accent, wallpaper, first view, layout, and category order.
- `RecommendationsPresentationControls.tsx` already normalizes all nine categories,
  supports Up/Down ordering, announces moves, and shows a First-view-aware preview.
- `recommendationsPresentation.ts` already contains canonical category metadata,
  normalization, merge preservation, and effective-order rules used by dashboard and public page.
- `framer-motion` and `lucide-react` are already installed.
- `docs/design-system/design.md`, `01-design-tokens.md`, `04-html-reference-library.md`,
  and `ai-agent-rules.md` are authoritative inputs: Poppins, semantic dashboard tokens,
  4px spacing, 160ms interaction motion, visible focus, and no new raw colors,
  gradients, decorative shadows, or unjustified nested cards.
- Unit tests already cover full payload preservation, the exact three-tab taxonomy,
  layout selection, keyboard reordering, preview promotion, and theme wire preservation.
- Playwright suites already verify 6 presets × 3 public layouts and dashboard-to-public parity.

## NOT in Scope

- New profile fields, API contracts, GraphQL operations, database migrations, or auto-save.
- Hiding categories or changing the public Profile/Gallery/Business tab taxonomy.
- A fourth profile-editor tab.
- A new drag-and-drop package.
- Redesigning the global dashboard shell, Settings Account/Billing content, or public layouts.
- Shipping user-created theme presets, arbitrary color entry, or layout-template builders.

## Approaches Considered

### Approach A: CSS-only patch

- Remove container classes in `ProfileForm`, replace text with icons in `Profile.tsx`,
  and call `onChange` directly from `Reorder.Group`.
- Effort: S. Risk: medium.
- Advantage: smallest implementation diff.
- Cost: Gallery/Appearance remain semantically accordion sections; Formik updates on
  every drag frame; settings reuse is coupled to Profile styling.
- Completeness: 6/10.

### Approach B: Explicit presentation modes (selected)

- Add `presentation: "accordion" | "direct"` to form-section metadata and a
  `surface: "contained" | "flat"` ProfileForm prop.
- Add a `variant: "card" | "flat"` Accordion prop.
- Use a small reorder-row component with handle-only Framer drag, local drag order,
  one Formik update on drop, and the existing accessible fallback.
- Effort: M. Risk: low.
- Advantage: one data/save pipeline, intentional UI per tab, no new dependency, easy
  regression tests, and Settings keeps its current contained presentation.
- Cost: several coordinated component/test edits.
- Completeness: 10/10.

### Approach C: Separate form per tab

- Create ProfileDetailsForm, GalleryForm, and AppearanceForm with independent state.
- Effort: L. Risk: high.
- Advantage: maximum per-tab isolation.
- Cost: duplicates save/dirty/payload logic and creates partial-save/data-loss risk.
- Completeness: 8/10 but wrong architecture for the current shared payload.

**Decision:** Approach B. It is explicit without duplicating domain logic and keeps the
cost of being wrong low because every change is presentational and reversible.

## Screen and Dependency Diagram

```text
Profile.tsx
├── profile cover (unchanged)
├── semantic icon tablist
└── ProfileForm mode="workspaces" surface="flat" scopeKey=account.documentId
    ├── visited ProfileWorkspace panel (hidden, never unmounted after visit)
    │   └── FormSection presentation="accordion"
    │   └── Accordion variant="flat"
    ├── visited GalleryWorkspace panel (hidden, never unmounted after visit)
    │   └── FeedFields + async lifecycle callback
    └── visited AppearanceWorkspace panel (hidden, never unmounted after visit)
        └── ThemeAppearanceSection
            ├── Theme style
            ├── Public landing
            ├── Recommendations layout
            └── RecommendationsPresentationControls
                ├── SortableCategoryRow × 9
                ├── useReorderTransaction(scopeKey)
                ├── keyboard Up/Down fallback
                └── effective-order preview

Settings.tsx
└── ProfileAccountSettings
    └── ProfileForm surface="contained" (default, unchanged)

Save & Publish
└── existing Profile.handleFormSubmit
    └── existing useUpdateProfile mutation
        └── existing public profile renderer
```

## Interaction State Machine

```text
TAB IDLE
  click / Arrow / Home / End
      ▼
ACTIVE TAB CHANGES
  ├── first visit -> lazy-mount workspace inside the existing Formik boundary
  ├── later visit -> unhide the stable panel; local Gallery state remains mounted
  └── leaving Appearance -> cancel any uncommitted drag transaction

ACCOUNT SCOPE CHANGES
  └── scopeKey changes -> remount workspaces + cancel drafts; never cross accounts

REORDER IDLE
  handle pointer/touch down
      ▼
DRAGGING
  Reorder.Group onReorder -> local order -> live preview
      │ release
      ▼
FORM DIRTY
  onChange once -> theme_settings.recommendations.categoryOrder
      │
      ├── Save succeeds -> reset dirty + public page uses saved order
      ├── Save fails -> retain visible order + actionable existing toast
      └── Navigate -> existing unsaved-change protection
```

## State Coverage Table

| Surface | Loading | Empty | Error | Success | Partial/unsaved |
|---|---|---|---|---|---|
| Profile tab | Existing page skeleton | Optional fields blank | Validation under fields | Saved/reset | Navigation warning |
| Gallery tab | Existing media loading/upload | Existing add-photo state | Existing upload feedback | Media visible | Feed dirty flag |
| Appearance | Normalized defaults | Not applicable | Save toast; choices retained | Rehydrate saved settings | Dirty until Save |
| Drag order | Canonical order | Not applicable | Drop stays local if save later fails | Rehydrates saved order | Preview follows draft |
| Flat skeleton | Existing account query | N/A | Existing page error | Resolves to the flat hierarchy | N/A |
| Save action | Pristine and available | N/A | Values retained; retry active | Existing success/reset feedback | Dirty/saving state; repeat submit blocked |
| Gallery async | Existing upload/import progress | Existing add-photo state | Existing actionable feedback | Result retained | Preserve or explicitly guard the in-flight local state |

## Failure Modes Registry

| Codepath | Failure mode | Rescue | Test | User sees | Logged |
|---|---|---|---|---|---|
| Tab keyboard navigation | focus target missing after rerender | guard optional element, still activate | unit | active panel remains usable | N/A |
| Legacy global focus reset | `outline`/shadow `!important` hides custom focus | scoped profile-editor token outline with sufficient specificity | computed-style E2E | reliable visible focus | N/A |
| Accordion | duplicate headings create duplicate content IDs | stable generated ID from section key | unit | correct expanded region | N/A |
| Pointer drag | pointer cancel/Escape/unmount | restore drag-start snapshot; no dirty/onChange | unit + Chrome | row returns to its starting slot | N/A |
| Touch drag | page scroll steals gesture or target is offscreen | handle-only `touch-action:none`; edge auto-scroll; row body remains scrollable | touch-enabled Chrome | direct drag works; Up/Down remains available | N/A |
| Reorder control state | props/account changes during or after drag | sync normalized props only while idle; commit from latest-order ref | unit | correct current account/order | N/A |
| Workspace lifecycle | inactive Gallery is unmounted | lazy-mount once, then hide stable panel until account scope changes | integration | importer selection/progress survives tab switches | N/A |
| Gallery pending save/navigation | upload/fetch still in flight | typed async state blocks misleading Save and adds actionable route warning | integration + E2E | finish the operation or retry after failure | existing request logging |
| Drag finalization | cancel is followed by drag-end or last reorder frame | pure phase guard + synchronous draft ref; at most one commit | hook unit | correct final order or full rollback | N/A |
| Dirty-tree rollback | feature delta overlaps pre-existing changes | verified patch/hash baseline; reverse only this feature delta | manifest verification | unrelated work is preserved | baseline artifact |
| Reorder normalization | stale/missing category IDs | existing normalize helper restores canonical nine | unit | complete category list | N/A |
| Save mutation | backend rejects update | existing terminal status/toast; Formik values retained | existing + regression | retry without losing choices | existing mutation logging |
| Public parity | saved order/layout not reflected | existing public parity E2E | Playwright | regression caught before ship | test artifact |

All planned failures above have a deterministic rescue and test. Any newly discovered
failure during implementation must be added before this statement is reasserted.

## Execution Precondition and Source Ownership

- The overlapping dirty-tree baseline is captured and verified at
  `.context/profile-editor-baseline-2026-08-21/MANIFEST.md`, including staged/unstaged
  patches and exact copies/hashes of the two untracked Appearance components.
- Do not stash, reset, checkout, or overwrite the current tree. Implement with scoped
  patches and roll back only the post-baseline feature delta.
- Keep exactly one `ProfileForm`/Formik instance. Persisted values continue through the
  existing combined Formik/local snapshot and mutation contract in this scope; do not
  change validation or backend-save semantics as part of the visual restructuring.
- Both the visible Save button and registered navigation-save path must call one stable
  `submitCurrentSnapshot()` wrapper so they cannot diverge. It preserves the current
  payload merge, terminal statuses, retry behavior, and hidden/future keys.
- Local state is allowed only for existing presentation/async state and an uncommitted
  reorder draft. No draft may persist or cross `scopeKey={account.documentId}`.

## Critical Execution Order

```text
verified source baseline
  -> failing contracts/tests
    -> typed persistent workspaces inside one ProfileForm
      -> flat/direct presentation + icon tab rail + container CSS
        -> Gallery async lifecycle seam
          -> Appearance composition
            -> pure reorder transaction controller + sortable rows
              -> cross-tab integration + dedicated mocked E2E
                -> full verification + live design/Chrome audit
```

The workspace contract is implemented before cosmetic tab work to avoid rebuilding the
tab panels twice.

## Task 1: Lock the new presentation contract with tests

**Files:**

- Modify: `explorers-earth/src/pages/__tests__/Profile.save.test.tsx`
- Modify: `explorers-earth/src/features/Profile/config/__tests__/profileFormSections.test.tsx`
- Modify: `explorers-earth/src/features/Profile/components/__tests__/ProfileForm.save.test.tsx`
- Create: `explorers-earth/src/features/Profile/components/__tests__/Profile.cross-tab.integration.test.tsx`
- Create: `explorers-earth/src/features/Profile/components/__tests__/FeedFields.persistence.test.tsx`
- Create: `explorers-earth/src/components/ui/__tests__/Accordian.test.tsx`
- Modify: `explorers-earth/src/i18n/resources/*.json` only if existing keys cannot be reused

**Steps:**

1. Add a failing Profile-page test asserting exactly three icon tabs with accessible
   names, roving `tabIndex`, selected state, and Arrow/Home/End focus+activation.
2. Assert the selected panel uses the same full initial values and field sets as today.
3. Add the unmocked integration in a new file (the existing Profile page suite globally
   mocks ProfileForm): edit Profile, Gallery, and Appearance, switch tabs
   repeatedly, save once, and assert one complete payload including untouched fields,
   feed data, and future theme keys. Repeat through save failure and retry.
4. Update section-config tests to require Profile accordion presentation and direct
   Gallery/Appearance presentation.
5. Add ProfileForm tests proving `surface="flat"` removes the outer bordered surface,
   while the default contained variant remains available to Settings.
6. Add Accordion tests for `variant="flat"`, stable `aria-controls`, open/closed state,
   and no forced scroll.
7. Run the focused tests and confirm the new assertions fail for the intended reasons.
8. Add translation-parity assertions for the tablist, tabs, visible workspace headings,
   four Appearance areas, and drag lift/move/drop/cancel messages. Include Arabic/Hebrew
   direction and one deliberately long-label fixture.
9. Add delayed Gallery success/failure fixtures and assert importer selection/progress
   survives two tab switches; mock all REST/image-probe traffic.

**Verify:**

```powershell
npm --prefix explorers-earth run test:unit -- src/pages/__tests__/Profile.save.test.tsx src/features/Profile/config/__tests__/profileFormSections.test.tsx src/features/Profile/components/__tests__/ProfileForm.save.test.tsx src/features/Profile/components/__tests__/Profile.cross-tab.integration.test.tsx src/features/Profile/components/__tests__/FeedFields.persistence.test.tsx src/components/ui/__tests__/Accordian.test.tsx
```

## Task 2: Build the centered icon tab rail

**Files:**

- Modify: `explorers-earth/src/pages/Profile.tsx`
- Modify: `explorers-earth/src/index.css`
- Modify: `explorers-earth/src/i18n/resources/*.json` only if existing keys cannot be reused

**Steps:**

1. Add Lucide person, images, and palette icons to the existing tab metadata.
2. Replace the segmented card with a centered, flat sticky tab rail using dashboard tokens.
3. Update `ProfileSkeleton` to the icon-rail + divider hierarchy so loading does not
   morph from the old nested-card composition.
4. Keep text labels visually hidden but available as accessible names.
5. Add hover/focus tooltips that do not affect layout or tab semantics.
6. Render exactly one localized panel heading: `Profile details`, `Gallery`, or
   `Appearance`, associated with the panel so touch users do not depend on tooltips.
7. Add `aria-orientation="horizontal"`, roving tab stop, visible focus, and reuse the
   existing Arrow/Home/End activation behavior.
8. Add a stable `.profile-editor` root and a scoped `:focus-visible` outline in
   `index.css`: `2px solid var(--dash-focus-ring)`, 2px offset, and sufficient
   `!important` specificity to defeat the legacy reset for tabs, triggers, inputs,
   drag/move controls, and Save.
9. Use 48px mobile and 52px `sm+` targets; prevent the rail from overflowing at 320px.
10. Source labels/tooltips from translations and cover long-label plus RTL geometry.
11. Run the focused Profile test until green.

## Task 3: Add persistent workspaces and explicit flat/direct presentation

**Files:**

- Modify: `explorers-earth/src/features/Profile/components/ProfileForm.tsx`
- Modify: `explorers-earth/src/features/Profile/config/profileFormSections.tsx`
- Modify: `explorers-earth/src/components/ui/Accordian.tsx`
- Modify: `explorers-earth/src/pages/Profile.tsx`
- Modify: `explorers-earth/src/features/Profile/components/FeedFields.tsx`
- Create: `explorers-earth/src/features/Profile/types/profileWorkspaces.ts`

**Steps:**

1. Define `ProfileWorkspaceId = "profile" | "gallery" | "appearance"` and a discriminated
   ProfileForm contract: existing single-section/default mode for Settings, plus
   `mode="workspaces"`, typed workspaces, `activeWorkspace`, and `scopeKey` for Profile.
2. In workspace mode, lazy-mount each panel on first visit, then keep it mounted and
   toggle `hidden`; use stable `role="tabpanel"`/IDs, keep one Save outside all panels,
   and remount only on account `scopeKey` change.
3. Extend `FormSection` with a stable `id`, optional `presentation`, decorative Lucide
   icon metadata, layout metadata, and explicit structural-label metadata. Add field
   span metadata so direct sections do not duplicate headings.
4. Add `surface?: "contained" | "flat"` to ProfileForm, defaulting to `contained`.
5. Pass workspaces/`surface="flat"` only from Profile.tsx; Settings keeps its current
   `formFields` single mode and contained styling unchanged.
6. For `presentation="direct"`, render the section heading/helper copy and existing
   field renderer without an Accordion wrapper.
7. For accordion sections, pass a stable ID and `variant="flat"` on the Profile surface.
8. Make Profile details open initially; keep Social and Business collapsed.
9. Encode the approved Profile composition: Bio full span; Account name + Primary
   location in two columns only at a 640px+ editor container; section icons are
   `aria-hidden` and accent-only with no circle/card background.
10. Refactor Accordion styling into card/flat variants. Remove document auto-scroll from
   the flat variant and respect reduced motion.
11. Preserve overflow behavior needed by emoji/media controls.
12. Give Profile/Gallery a readable maximum width and Appearance a 960px maximum;
   the order/preview split belongs only to the exact 904px container query in Task 4.
13. Add `onAsyncStateChange({ pending, operation })` to FeedFields and clear it in every
   upload/Google/Instagram/import success, failure, and `finally` path. Pending work
   remains mounted across internal tab changes; Save/navigation presents an actionable
   finish-operation-first result instead of a false success.
14. Route the visible Save and registered navigation Save through one
   `submitCurrentSnapshot()` wrapper without changing current validation/payload semantics.
15. Restyle Save with the standard rectangular dashboard-primary action, token radius,
   44px+ height, no pill/blur/glow/decorative shadow. Desktop is in-flow/centered;
   mobile uses 16px gutters, bottom-nav/`env(safe-area-inset-bottom)` clearance, and
   matching content padding. Preserve pristine availability, saving disable, success,
   failure, retry, mutation, and persistence behavior.
16. Add top/bottom scroll padding so focus remains clear of the rail and Save bar.
17. Assert one Gallery heading, exactly one panel H2, field DOM order, actual two-column
   geometry, and no duplicate structural field label.
18. Assert Settings remains contained/single mode, visited panels retain local state,
   scope change remounts, inactive Appearance cancels any uncommitted drag, and both
   Save entry points use the identical complete snapshot.
19. Run Task 1 tests until green.

## Task 4: Reorganize Appearance into a guided responsive workspace

**Files:**

- Modify: `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`
- Modify: `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx`
- Modify: `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx`
- Modify: `explorers-earth/src/index.css`
- Modify: `explorers-earth/src/i18n/resources/*.json` only if existing keys cannot be reused

**Steps:**

1. Remove the all-enclosing Appearance card.
2. Render four titled areas in order: Theme style, Public landing,
   Recommendations layout, Category order.
3. Keep theme preset, accent, wallpaper, and First view wire updates exactly as today.
4. Make `ThemeAppearanceSection` own exactly those four top-level headings and suppress
   the old field/recommendations structural headings.
5. Apply container-driven responsive behavior: one column at 320/375, paired theme inputs
   only when both meet their component minimums, three layout choices at 768+, and an
   order/preview split at 904px editor-container width using
   `minmax(560px, 1fr) 320px` plus a 24px token gap—not a viewport `lg:` class.
6. Keep every label visible and token-based. Do not introduce raw decorative colors
   except the existing user-selectable accent swatches.
7. Add tests for exactly four headings in order, all preset/landing values, future-key
   preservation, and absence of decorative outer wrappers.
8. On mobile show a three-category effective-order summary plus expandable full preview;
   desktop keeps the full sticky preview. When First view promotes a category, show
   plain utility copy above preview and mark the promoted row textually.
9. Let long localized category labels wrap to two lines; keep handle/actions at least
   44px and mirror the action cluster correctly in RTL.

## Task 5: Add handle-only pointer/touch drag with accessible fallback

**Files:**

- Modify: `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx`
- Modify: `explorers-earth/src/features/Profile/components/__tests__/RecommendationsPresentationControls.test.tsx`
- Create: `explorers-earth/src/features/Profile/hooks/useReorderTransaction.ts`
- Create: `explorers-earth/src/features/Profile/hooks/__tests__/useReorderTransaction.test.ts`
- Modify: `explorers-earth/src/i18n/resources/*.json` only if existing keys cannot be reused

**Steps:**

1. Create a pure transaction hook/reducer with phases `idle -> pointer-drag | keyboard-lift
   -> committed | cancelled -> idle`, tracking `scopeKey`, normalized snapshot, draft,
   synchronous `draftRef`, and an idempotent cancelled/finalized guard.
2. Add a `SortableCategoryRow` component using `Reorder.Item` and `useDragControls`.
3. Start drag only from a GripVertical handle; set `touch-action:none` on the handle.
4. Make the handle a localized `type="button"`; use `dragListener={false}` and explicit
   drag controls so row presses and action buttons never start drag or submit.
5. Keep a local display order while dragging so the row and preview move smoothly.
   `onReorder` updates only local state + `draftRef`.
6. On successful pointer-up, read `draftRef` and emit at most one normalized
   `{ layout, categoryOrder }`; an unchanged drop emits zero changes.
   change and announce the final position. Avoid Formik updates on animation frames.
7. Mark cancellation synchronously before `dragControls.cancel()` so a later
   `onDragEnd` is a no-op. `pointercancel`, Escape, inactive Appearance, prop revision,
   `scopeKey` revision, and unmount never emit; value/scope revision adopts new props.
8. Use Framer Motion 12's installed Reorder auto-scroll behavior and verify its cleanup;
   do not add a second competing RAF loop. Confirm no scrolling continues after
   cancel/unmount in browser tests.
9. Implement keyboard lift mode on the handle: Space/Enter lifts, ArrowUp/ArrowDown
   and Home/End move locally, Space/Enter drops once, and Escape calls
   `dragControls.cancel()` and restores. Announce lift/move/drop/cancel and expose
   instructions with `aria-describedby`.
10. Specify lifted/drop visuals: token outline/elevation, insertion space, grab/grabbing
   cursor, stable focus, and no spring flourish under reduced motion.
11. Keep Up/Down buttons, disabled boundaries, focus retention, and live announcements.
12. Update preview order from the current display order plus First-view promotion.
13. Respect reduced motion and prevent row controls from starting a drag.
14. Unit-test the pure controller directly: final-frame ref, unchanged drop, single
   commit, pointercancel followed by drag-end, keyboard lift/drop/cancel, inactive panel,
   external prop/account scope revision, unmount cleanup, and no cross-account commit.
15. Keep component tests for
   tab switching, keyboard fallback, boundaries, preview parity, missing-category
   normalization, and accessible drag-handle names.

## Task 6: Update dashboard/public parity E2E coverage

**Files:**

- Modify: `explorers-earth/e2e/profile-theme.spec.ts`
- Modify: `explorers-earth/e2e/profile-presentation-visual.spec.ts`
- Create: `explorers-earth/e2e/profile-editor-polish.spec.ts`

**Steps:**

1. Replace accordion-opening helpers with direct Appearance-tab navigation.
2. Put the new editor journey in the focused `profile-editor-polish.spec.ts`, using the
   existing synthetic-auth helper and a non-skipped stateful mocked-GraphQL fixture:
   touch/pointer drag, verify no mutation,
   Save, assert exact payload, reload dashboard, reload public page, and assert the saved
   layout/order/first-view. Keep live-account writes supplementary.
3. Use a touch-enabled context/CDP sequence at 320/375: drag first-to-last and back with
   edge auto-scroll, row-body swipe still scrolls, and Up/Down never initiates drag.
4. Save, reload dashboard, and assert order persists.
5. Open the public profile and assert the saved layout/order/first-view effective order.
6. Retain the existing six-presets-by-three-layout public matrix.
7. Add dashboard screenshots/assertions at 320, 375, 639/640, 767/768, 1024, and 1440.
8. Assert document/workspace no-overflow (excluding named media scrollers), 44px targets,
   actual container geometry with sidebar open/collapsed and short/tall viewports,
   readable light/dark contrast, computed focus outline visibility, and focused-element
   rectangles unobscured by both sticky surfaces.
9. Test save failure/retry with the dragged order and complete cross-tab payload retained.
10. Assert editor Profile/Gallery/Appearance does not change public
    Profile/Gallery/Business taxonomy or Business availability rules.
11. Add 200% zoom/reflow, drag-layer z-index, safe-area, and a manual real-device soft
    keyboard check; desktop emulation is not virtual-keyboard proof.
12. Test tab switching during Gallery import selection/progress/success/failure. Preserve
    the mounted state; if a specific importer cannot, guard the change with actionable
    status and prove nothing is silently discarded.
13. Compare desktop Profile to approved anchors: rail alignment, divider system, Bio
    span, Account/location grid, section icons, and rectangular Save across
    personal/business and complete/incomplete account states.
14. Route/mock GraphQL, upload, Google, Instagram, and image-probe traffic; fail on every
    unhandled external request. Required CI uses synthetic data only—never storage state,
    bearer tokens, proxy URLs, live media, or authenticated screenshots.
15. Use live bounding boxes, semantic polling, frozen fixture data/animations, and no
    arbitrary sleeps. Geometry assertions are gates; screenshots are diagnostics.

## Task 7: Full verification and live design audit

**Files:**

- Review only all files above; fix only failures caused by this change.

**Steps:**

1. Run focused unit tests.
2. Run the entire Vitest suite.
3. Run TypeScript, production build, and relevant Playwright suites.
4. Start the local app and test in Chrome using the authenticated account.
5. Inspect desktop and device-emulated widths for Profile, Gallery, Appearance.
6. Exercise every Appearance setting, drag category order, Save & Publish, and verify
   dashboard reload plus public page output.
7. Run the task journey without code knowledge: switch all tabs, find First view and
   layout, move a category, save, and record hesitation, mistaps, and Save understanding.
8. Run a live design review after implementation and correct visual hierarchy,
   spacing, overflow, focus, and touch issues found.

**Commands:**

```powershell
npm --prefix explorers-earth run test:unit
npm --prefix explorers-earth exec -- tsc -b explorers-earth/tsconfig.json
npm --prefix explorers-earth run build
npm --prefix explorers-earth run i18n:check
npm --prefix explorers-earth run test:e2e -- e2e/profile-editor-polish.spec.ts e2e/profile-theme.spec.ts e2e/profile-presentation-visual.spec.ts
```

## Test Diagram

```text
PROFILE EDITOR
├── icon tablist
│   ├── click Profile/Gallery/Appearance ........ unit + Chrome
│   ├── ArrowLeft/Right wrap .................... unit
│   ├── Home/End ................................ unit
│   └── accessible name/focus/44px .............. unit + Playwright
│   └── localized/RTL visible workspace context .. unit + Playwright
├── flat form presentation
│   ├── Profile accordions ...................... unit + Chrome
│   ├── Gallery direct editor ................... unit + Chrome
│   ├── Appearance direct workspace ............. unit + Chrome
│   └── Settings contained form unchanged ....... unit regression
├── Appearance
│   ├── 6 presets ............................... unit + existing E2E matrix
│   ├── 6 accents ............................... unit + Chrome
│   ├── 4 wallpaper modes ....................... unit + Chrome
│   ├── 12 first-view values .................... unit + E2E
│   ├── 3 layouts ................................ unit + E2E
│   └── future wire keys preserved .............. unit
├── category order
│   ├── pointer drag ............................ component + Chrome
│   ├── touch drag .............................. Playwright mobile
│   ├── Up/Down + boundaries .................... unit
│   ├── live announcement ....................... unit
│   ├── preview effective order ................. unit
│   └── save failure retains order .............. integration/E2E
│   ├── cancel/Escape rollback + prop sync ....... unit
└── public parity
    ├── save + dashboard reload ................. E2E
    ├── saved order/layout/first view ............ E2E
    ├── public Profile/Gallery/Business tabs ..... existing E2E
    └── 6 themes × 3 layouts × mobile/desktop .... existing E2E

RESPONSIVE
├── 320 / 375 no overflow ....................... Playwright + Chrome
├── 639/640 + 767/768 intentional reflow ......... Playwright
├── 1024 / 1440 split preview .................... Playwright + Chrome
├── 47-char labels / localized expansion ......... component/visual
└── reduced motion / keyboard-only ............... unit + Chrome
```

## Rollout and Rollback

- No migration or feature flag is required: saved data and API contracts are unchanged.
- Deploy as a normal frontend bundle.
- Smoke test Profile, Gallery, Appearance, Save & Publish, dashboard reload, and the
  public profile immediately after deploy.
- No data/wire rollback is needed. Revert only post-baseline feature patches in reverse
  dependency order, then regenerate and compare against
  `.context/profile-editor-baseline-2026-08-21/MANIFEST.md`. Existing saved theme
  settings remain compatible and unrelated dirty-tree work must be unchanged.

## Implementation Tasks

- [x] P0: Verify recoverable dirty-tree source baseline.
- [ ] P1: Add persistence/presentation contract tests.
- [ ] P1: Add typed persistent workspaces inside one ProfileForm boundary.
- [ ] P1: Add Gallery async lifecycle seam and stable Save snapshot wrapper.
- [ ] P1: Add flat/direct form/Accordion variants and semantic icon tab rail.
- [ ] P1: Reorganize Appearance with named container-query CSS.
- [ ] P1: Add the pure reorder transaction controller and sortable rows.
- [ ] P1: Add dedicated deterministic editor-to-public E2E and responsive matrix.
- [ ] P2: Complete live Chrome design audit in both dashboard themes.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | Intake | Preserve exactly three tabs and all existing data/functionality | User-confirmed | P2 honor explicit intent | Repeatedly confirmed in the design discussion | Fourth tab or field cuts |
| 2 | Intake | Use explicit presentation modes over separate forms | Auto-decided | P5 explicit over clever | Removes double boxes without duplicating save logic | CSS-only patch; per-tab forms |
| 3 | Intake | Use installed Framer Motion for handle-only drag | Auto-decided | P1/P5 completeness + simplicity | Provides pointer/touch behavior without a new dependency | New DnD package; Up/Down only |
| 4 | Intake | Keep Save & Publish as the only persistence boundary | User-confirmed | P2 honor intent | Preserves current behavior and failure recovery | Auto-save on drop |
| 5 | Intake | Treat responsive QA as core scope | User-confirmed | P1 completeness | User explicitly requires proper responsive behavior | Desktop-first follow-up |
| 6 | CEO review | Prove one complete cross-tab save and deterministic public parity in CI | Auto-decided | P1 completeness | The central unchanged-data promise cannot rely on mocked ProfileForm or optional live credentials | Per-tab prop assertions; live-only E2E |
| 7 | CEO review | Treat reordering as a transactional controller with rollback and idle-only prop sync | Auto-decided | P3 least destructive | Cancelled touch gestures must not dirty or save unintended order | Commit on any drag end |
| 8 | CEO review | Add touch edge auto-scroll and retain Up/Down for long moves | Auto-decided | P1/P5 completeness + simplicity | Handle drag must work beyond one viewport without making the whole row non-scrollable | Mouse-only mobile viewport test |
| 9 | CEO review | Add visible localized workspace context and exact breakpoint geometry | Auto-decided | P6 user control | Icon-only rail must remain understandable on touch and focus must remain reachable | Tooltip-only discovery |
| 10 | CEO review | Version the approved mock in the repository | Auto-decided | P1 completeness | Reviewers and CI need a durable source of truth | User-local reference only |
| 11 | Design review | Encode the mock's field grid/icons and rectangular Save action | Auto-decided | P2/P5 intent + explicitness | Flat styling alone could miss the approved hierarchy or retain a glass pill | Generic vertical stack |
| 12 | Design review | Give the focusable handle full keyboard lift/drop semantics | Auto-decided | P6 user control | A semantic button must not be inert when activated | Pointer-only handle button |
| 13 | Design review | Use 904px editor-container geometry and sticky safe areas | Auto-decided | P1 completeness | Sidebar and mobile fixed surfaces make viewport-only breakpoints unreliable | `lg:` split at 1024 |
| 14 | Design review | Scope a real focus override against the legacy reset | Auto-decided | P3 least destructive | Component classes cannot defeat the existing `!important` reset | Class-presence-only focus test |
| 15 | Design review | Preserve or guard Gallery in-flight state and update the skeleton | Auto-decided | P3/P6 least destructive + control | Navigation must not discard importer progress or morph from obsolete card UI | Completed-data-only testing |
| 16 | Engineering review | Lazy-mount each workspace once and keep visited panels mounted in one ProfileForm | Auto-decided | P1/P3 completeness + least destructive | Active-only fields currently unmount Gallery local state | Continue swapping one formFields array |
| 17 | Engineering review | Preserve validation policy but unify both Save entry points on one current snapshot | Auto-decided | P2/P3 intent + least destructive | A validation rewrite would expand scope, but divergent Save paths are unsafe | Full Formik ownership/validation rewrite in this UI unit |
| 18 | Engineering review | Extract an idempotent scope-aware reorder transaction hook | Auto-decided | P5 explicit over clever | React state alone races final reorder/cancel/account changes | Inline drag flags |
| 19 | Engineering review | Record and verify a scoped source baseline before edits | Auto-decided | P3 least destructive | Core files contain pre-existing staged, unstaged, and untracked work | Stash/reset/single revert |
| 20 | Engineering review | Use a dedicated stateful mocked editor E2E with a strict network allowlist | Auto-decided | P1 completeness | Required CI cannot depend on live credentials or giant existing suites | Live-only proof |

## Sequential Review Report

| Phase | Initial gate | Material decisions folded in | Post-edit gate |
|---|---|---|---|
| CEO | Conditional no-go | Complete cross-tab payload proof, deterministic mocked public parity, drag rollback/scope sync, touch edge behavior, visible mobile context, exact breakpoint checks, repository-owned mock | Proceed to design |
| Design | 6.8/10, no-go | Approved field grid/icons, rectangular Save states, full keyboard drag semantics, container-driven split, sticky/safe-area geometry, flat skeleton, Gallery in-flight preservation, scoped focus override | Proceed to engineering |
| Engineering | 4/10, no-go | Verified dirty-tree snapshot, persistent visited workspaces, stable current-snapshot Save seam, pure transaction controller, exact container ownership, typed Gallery async lifecycle, dedicated strict-network E2E, correct working-directory commands | Ready to implement (~8.5/10) |

Baseline evidence before source implementation:

- Focused editor suites: 5 files, 24 tests passed in 2.55s.
- TypeScript build mode: `tsc -b explorers-earth/tsconfig.json` passed.
- Exact source recovery manifest: `.context/profile-editor-baseline-2026-08-21/MANIFEST.md`.
- Engineering test plan: `.context/responsive-profile-editor-eng-review-test-plan.md`
  and the mirrored gstack review artifact.

No unresolved product decision remains. The one engineering recommendation deliberately
not adopted is a full Formik ownership/validation rewrite: it would change the explicit
“same functionality/data” premise. This plan instead preserves current validation and
payload semantics while making workspace lifetime, Save entry points, async work, and
uncommitted drag state deterministic.
