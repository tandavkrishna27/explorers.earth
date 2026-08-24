# Responsive Profile Editor Polish — Design Specification

Date: 2026-08-20
Status: Approved direction, under sequential CEO/design/engineering review
Scope: Dashboard Profile editor only; existing Settings account/billing relocation remains unchanged

## Problem

The Profile page now has the correct information architecture, but the editor still
looks like containers nested inside containers. A bordered Formik surface wraps
bordered accordion cards, while the Appearance tab adds another bordered surface.
The result is visually heavy, especially on mobile. The three tabs also use text even
though the public profile establishes a simpler, centered icon language.

The Appearance controls work, but their hierarchy is weak. Theme presets, accent,
wallpaper, first view, layout, order, and preview compete as one long form. Category
ordering only has Up/Down buttons even though direct manipulation is appropriate here.

## Outcome

The profile editor should feel like one calm workspace:

1. A centered icon tab rail establishes location.
2. One clear tab workspace occupies the page, without redundant outer cards.
3. Profile details use restrained divider accordions.
4. Gallery opens directly into media management.
5. Appearance reads as a guided sequence from broad visual style to fine ordering.
6. Dragging a category updates the illustrative preview immediately, while Save &
   Publish remains the only persistence boundary.

## Approved Visual Reference

| Surface | Path | Direction |
|---|---|---|
| Profile editor | `docs/design-system/mockups/page/profile-editor-approved-2026-08-20.png` | Dark dashboard, centered icon tabs, flat divider sections, quiet fields, blue Save action |

The mock is a hierarchy and density reference, not permission to replace the current
data model or omit existing fields.

Its measurable Profile anchors are part of the contract: restrained section-leading
Lucide icons, Bio spanning the readable content width, Account name and Primary
location sharing two columns only when each field remains usable, one divider system,
and a rectangular dashboard-primary Save action without glass, glow, or pill styling.

## Product Decisions

- Exactly three editor tabs remain: Profile, Gallery, Appearance.
- Account username, account type, and billing address remain in Settings.
- Profile keeps Profile details, Social links, and Business details.
- Gallery keeps every existing feed/photo control and validation path.
- Appearance keeps every current theme and recommendation control.
- The public profile's three visible tabs and saved presentation behavior do not change.
- All settings remain unsaved until the existing Save & Publish action succeeds.
- Games remain a recommendation category; category order changes presentation, not visibility.

## Information Architecture

```text
Profile page
├── Profile cover / avatar / public-profile link (unchanged)
├── Centered editor tablist
│   ├── [person icon] Profile
│   ├── [image icon] Gallery
│   └── [palette icon] Appearance
└── Active tab panel
    ├── Profile
    │   ├── Profile details (open initially)
    │   ├── Social links (collapsed)
    │   └── Business details (collapsed, business accounts only)
    ├── Gallery
    │   └── Existing photo/feed editor, direct and full width
    └── Appearance
        ├── Theme style
        │   ├── Theme preset
        │   ├── Accent color
        │   └── Wallpaper / cover style
        ├── Public landing
        │   └── First view
        ├── Recommendations layout
        │   └── Classic / Mosaic / Featured
        └── Category order
            ├── Drag list + accessible Up/Down actions
            └── Illustrative live preview
```

All visited editor panels remain mounted inside one Formik boundary and are hidden when
inactive. Gallery importer/upload state therefore survives tab changes. Panels remount
only when the account identity scope changes; an uncommitted Appearance drag cancels
when Appearance becomes inactive.

## Visual Contract

### Editor tabs

- Three semantic `role="tab"` buttons in a centered `role="tablist"`.
- Each control is 48px square on mobile and 52px square at `sm+`.
- Only icons are persistently visible; labels are exposed through accessible names
  and a styled tooltip on hover/focus.
- A localized, visible active-workspace heading immediately below the rail gives
  sighted touch users the same location context as hover-capable users.
- Active state uses the dashboard accent and a short bottom indicator.
- Inactive icons use dashboard secondary text and gain contrast on hover.
- Left/Right wraps; Home/End jump; only the active tab is in the tab sequence.
- The sticky bar uses the page background and a subtle bottom divider, not a pill card.

### Flat Profile sections

- The Profile tab has no bordered outer form container.
- Accordion rows are separated by one `--dash-border` divider.
- Triggers are at least 52px high with a 44px chevron target.
- The first section opens by default; other sections remain collapsed.
- Profile details uses one column below a 640px editor container. At 640px+, Bio spans
  both columns, followed by Account name and Primary location side by side.
- Section-leading Lucide icons are decorative, `aria-hidden`, and use the dashboard
  accent; they do not gain circular card backgrounds.
- Inputs retain their own borders because they are interactive controls.
- Opening a section does not forcibly scroll the document.

### Gallery

- Gallery is a direct section with a small heading and helper copy, followed by the
  existing FeedFields content.
- It does not add a decorative wrapper solely to contain the media editor.
- Upload and remove actions keep their existing states and validation.
- An upload/import in progress is never silently unmounted. Keep the Gallery workspace
  mounted until terminal status; if a specific importer cannot be preserved, explicitly
  guard tab switching rather than discarding local selection.

### Appearance

- The Appearance tab has no all-enclosing border.
- Each major area has a heading, one sentence of utility copy, and spacing/dividers.
- Presets are selectable tiles because the tile itself is the interaction.
- Accent swatches remain circular and at least 44px.
- The layout selector uses three illustrative tiles; one column at 320/375, three at 768+.
- Category rows are compact list items. Their drag handle is visible and communicates
  move affordance; rows are not decorative cards.
- Preview is sticky only at 1024+ and only while its column has enough height.
- On small screens, immediate feedback is the moving row plus live announcement. A
  compact preview shows the first three effective categories and an expandable full
  preview instead of permanently duplicating all nine rows.
- Long category names wrap to two lines. Handle/actions never shrink below 44px; RTL
  mirrors the row controls without reversing category semantics.

### Save & Publish

- Preserve the current single mutation boundary and retry behavior.
- Use the rectangular dashboard-primary action, at least 44px high, token radius, and
  no pill, blur, glow, or decorative shadow.
- Wide screens use an in-flow centered action. Mobile uses a safe-area-aware bar above
  bottom navigation with 16px gutters and matching content padding.
- Pristine, dirty, saving, success, and failure states are explicit. Pristine Save stays
  available to preserve behavior; saving alone disables repeat submission. Failure
  retains values and a usable retry action.

## Responsive Contract

| Viewport | Tabs | Content | Appearance | Category order |
|---|---|---|---|---|
| 320–375px | 48px icons, centered, no overflow | 16px horizontal padding, full-width fields | Single column; preview below list | Full-width rows; handle + compact 44px actions; no horizontal scroll |
| 640–767px | 52px icons | Up to 640px readable line length | Presets may use 2 columns; layout remains 1–2 columns based on min width | Rows remain single column |
| 768–1023px | Same centered rail | Up to 768px content | Three layout choices; theme controls may pair | Preview remains below order to avoid cramped split |
| 1024px+ | Sticky rail aligned to workspace | Profile/Gallery retain readable width; Appearance may grow to 960px | Container-driven split only when 560px + 24px + 320px fit | Preview may be sticky only when measured height fits; list retains comfortable drag space |

The Appearance split is driven by inline-size, not viewport: stack below 904px available
editor width; at/above 904px use `minmax(560px, 1fr) 320px` with the token 24px gap. A
1024px viewport with an expanded sidebar therefore remains stacked, while a collapsed
sidebar may split if measured space permits.

The document and active workspace must not overflow horizontally; the media strip and
other explicitly named horizontal scrollers are the only exceptions. Breakpoint pairs
639/640 and 767/768 must be checked as well as 320, 375, 1024, and 1440. Focused-control
rectangles must remain between the sticky tab rail and bottom Save action. The editor
root supplies top/bottom scroll padding, safe-area insets, a drag-layer z-index, and
near-edge auto-scroll zones. Sticky preview height is capped by `100dvh` minus the rail,
Save action, safe area, and token gaps.

## Drag-and-Drop Interaction

```text
IDLE
  pointer/press handle
       │
       ▼
DRAGGING ── onReorder ──▶ local visual order + live preview
  │
  ├── successful release ──▶ COMMIT IN FORM
  │                            ├── emit one normalized categoryOrder update
  │                            ├── mark Formik dirty
  │                            └── announce final position
  │
  └── pointercancel / Escape / unmount ──▶ restore drag-start snapshot

COMMIT IN FORM
  ├── emit one normalized categoryOrder update total
  ├── mark Formik dirty
  ├── announce "Music moved to position 1 of 9"
  └── return to IDLE

Save & Publish
  ├── success -> existing mutation persists wire shape
  └── failure -> order remains visible and unsaved for retry
```

- Drag begins only from the handle so links/buttons inside a row never start a drag.
- Touch uses `touch-action: none` on the handle, not the whole row.
- The handle is a localized `type="button"` using explicit Framer drag controls;
  pressing the row or Up/Down controls never starts drag or submits the form.
- The handle has real keyboard activation: Space/Enter lifts; ArrowUp/ArrowDown and
  Home/End move locally; Space/Enter drops and commits once; Escape cancels.
  `aria-describedby` exposes instructions and the live region announces each state.
- Lifted rows use a token outline/elevation and `cursor: grabbing`; insertion space is
  visible without a new card. Reduced motion removes spring flourish.
- The list snapshots normalized props at drag start, synchronizes external prop changes
  only while idle, and reads the latest local order at successful drop.
- Near-edge handle dragging auto-scrolls the page. Up/Down remains the reliable
  long-distance alternative on very small screens.
- Up/Down buttons remain the deterministic keyboard fallback.
- Boundary buttons are disabled; focus remains on the invoked button after a move.
- The preview uses the effective order, including First view category promotion.

## State Coverage

| Feature | Initial/loading | Empty | Error | Success | Partial/unsaved |
|---|---|---|---|---|---|
| Profile form | Existing page skeleton | Existing blank optional fields | Existing validation and save toast | Existing saved toast/reset | Unsaved navigation protection remains |
| Gallery | Existing feed loading/upload state | Existing add-media affordance | Existing upload/remove feedback | Media shown in editor | Unsaved feed flag remains |
| Theme controls | Normalized defaults | N/A, defaults always exist | Save failure retains choices | Saved values rehydrate | Current choices remain in Formik until save |
| Drag order | Canonical normalized order | N/A, nine categories remain | Save failure retains dragged order | Saved order rehydrates and public preview matches | Live preview follows local drag order |
| Flat skeleton | Existing account query | N/A | Existing page error | Icon rail + divider skeleton resolves without card morph | N/A |
| Save action | Pristine but available | N/A | Values retained; retry available | Success/reset feedback | Dirty/saving status; duplicate submit blocked |
| Gallery async | Existing loader/progress | Add-media affordance | Existing upload/import feedback | Result remains visible | Tab switch preserves or guards local in-flight state |

## Accessibility Contract

- Semantic tabs with stable IDs, `aria-controls`, `aria-labelledby`, roving tab stop,
  Left/Right/Home/End, and visible `focus-visible` ring.
- Icon-only controls always have localized accessible names.
- Accordions use semantic buttons with unique stable content IDs.
- Drag handles have names such as `Drag Music`; direct drag is supplementary to
  keyboard Up/Down controls.
- Reordering uses a polite live region with category, position, and total.
- All pointer targets are at least 44px.
- Body text and focus indicators meet WCAG AA in both dashboard themes.
- Reduced-motion users receive no animated height/drag flourish beyond essential state change.
- Long localized labels and RTL order do not change the three-button taxonomy or cause
  the 320px rail to overflow.
- A profile-editor scoped `:focus-visible` rule defeats the legacy global
  `outline/shadow: none !important` reset using the dashboard focus token; computed
  focus visibility is verified in both dashboard themes.

## What Is Not Changing

- No new API call, endpoint, GraphQL field, database field, or wire-format key.
- No fourth editor tab.
- No public-page taxonomy change.
- No auto-save and no persistence on drop.
- No new drag dependency; use the installed Framer Motion package.
- No redesign of Settings Account/Billing in this unit.
- No public-profile theme/layout redesign beyond regression verification.
- No validation-policy rewrite; the visual refactor preserves the existing combined
  submit snapshot and payload semantics while routing both Save entry points through
  one stable wrapper.

## Acceptance Criteria

- Profile page renders exactly three centered icon-only editor tabs.
- The tabs are fully keyboard operable and expose Profile/Gallery/Appearance names.
- Profile has no nested outer card plus accordion-card double border.
- Gallery content is direct and retains all existing functionality.
- Appearance is ordered into the four approved areas.
- Profile skeleton, field grid, divider rhythm, and Save action match the approved
  reference anchors without new nested cards, gradients, pills, or decorative shadows.
- Pointer and touch dragging reorder all nine categories from the handle.
- Up/Down controls and announcements remain available.
- Drag updates the preview but does not call the backend until Save & Publish.
- `pointercancel`, Escape, and unmount during drag restore the drag-start order without
  dirtying Formik or invoking `onChange`.
- A failed save retains every visible choice for retry.
- Edits made in Profile, Gallery, and Appearance survive repeated tab switches and one
  save payload; a failed save followed by retry preserves the same complete payload.
- Saved theme, first view, layout, and order continue to render on the public page.
- Editor Profile/Gallery/Appearance are distinct from the public Profile/Gallery/Business
  taxonomy; editor changes do not add an Appearance tab to public pages.
- 320, 375, 639/640, 767/768, 1024, and 1440 layouts have no unintended viewport overflow.
