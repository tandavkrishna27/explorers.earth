# Responsive Profile Editor — Engineering Review Test Plan

Date: 2026-08-21
Plan: `docs/superpowers/plans/2026-08-20-responsive-profile-editor-polish-plan.md`

## Objective

Prove that the visual restructuring preserves the exact saved wire behavior, all
cross-tab state, Gallery async state, drag cancellation semantics, responsive geometry,
and dashboard-to-public parity.

## Fixtures

- Complete valid personal and business accounts.
- Unknown future keys in `social_media`, `theme_settings`, and `recommendations`.
- Synthetic feed media only.
- Stateful mocked GraphQL query/mutation that applies saved variables to later reads.
- Mocked upload, Google, Instagram, and image-probe endpoints.
- Long-label fixture plus Arabic/Hebrew direction.
- Light/dark dashboard themes, reduced motion, expanded/collapsed sidebar.

## Unit tests

- Typed workspace/section IDs, presentation defaults, field spans, and Settings default.
- Accordion card/flat modes, stable IDs, open/closed behavior, no flat forced scroll.
- Reorder transaction: start, last-frame draft, unchanged drop, single commit,
  pointercancel plus drag-end, Escape, inactive workspace, prop/scope revision, unmount.
- Recommendation normalization, effective order, and future-key preservation.
- Stable three-tab taxonomy, roving focus, Arrow/Home/End activation.
- i18n key parity and long/RTL labels.

## Component integration

- Edit Profile, Gallery, and Appearance, switch repeatedly, save once, assert the exact
  complete payload and untouched/future keys.
- First save fails; visible state and exact payload survive; retry succeeds.
- Gallery delayed selection/progress/success/failure survives hiding twice.
- Save/navigation during Gallery pending work cannot report false success.
- Account scope change remounts workspaces and cancels Appearance drafts.
- Settings keeps contained single mode; no duplicate panel/section/field headings.

## Playwright

- Dedicated `e2e/profile-editor-polish.spec.ts` with synthetic auth and strict routing.
- Real pointer drag and touch-enabled drag; no mutation before Save.
- Live bounding-box coordinates, semantic polling, and no fixed sleeps.
- Edge auto-scroll tall-mobile fixture; no scrolling after Escape/unmount.
- Row-body swipe scrolls; move buttons never initiate drag.
- Exact mutation, dashboard reload, public effective-order parity, failure/retry.
- Container widths 639/640, 767/768, 903/904; viewports 320, 375, 1024, 1440.
- Sidebar open/collapsed, short/tall viewport sticky behavior, 200% zoom/reflow.
- No unintended overflow, 44px targets, computed visible focus, safe-area clearance.
- RTL, long labels, reduced motion, light/dark.
- Public Profile/Gallery/Business taxonomy and availability remain unchanged.

## Flake, privacy, and performance controls

- Fresh deterministic fixture state per test/retry; freeze animations where necessary.
- Fail every unhandled GraphQL/REST/image request.
- No live credentials, tokens, storage state, proxy URLs, or authenticated screenshots.
- Lazy-mount workspaces on first visit to avoid initial Gallery media cost.
- Draft reorder remains local; Formik updates at most once on successful changed drop.
- Screenshots are diagnostic; computed geometry and semantic state are the gates.
- Real-device soft-keyboard check is a manual artifact, not a blocking CI assertion.

## Commands

```powershell
npm --prefix explorers-earth run test:unit
npm --prefix explorers-earth exec -- tsc -b explorers-earth/tsconfig.json
npm --prefix explorers-earth run build
npm --prefix explorers-earth run i18n:check
npm --prefix explorers-earth run test:e2e -- e2e/profile-editor-polish.spec.ts
```

## Exit criteria

- Focused and full Vitest green.
- TypeScript, production build, and i18n parity green.
- Dedicated mocked E2E green locally without requiring retry.
- Zero unhandled external requests.
- Exact payload/future keys and public behavior preserved.
- Dirty-tree baseline remains recoverable.
- Live Chrome visual/responsive checklist and manual soft-keyboard note attached.
