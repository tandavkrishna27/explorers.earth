# Responsive Music Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Playlists-first and Live-second authenticated Music dashboard for desktop and mobile without weakening the secured owner-workspace contracts.

**Architecture:** Keep `MusicDashboard` as the owner coordinator, introduce a two-view `MusicSectionTabs` boundary, and separate playlist collection/detail presentation from the Live workspace. Both views consume the existing secured clients and one refetch path; no state or mutation logic is duplicated and unsupported imports remain honest unavailable states.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright, existing Music workspace clients.

**Spec:** `docs/superpowers/specs/2026-08-27-music-dashboard-responsive.md`

## Global Constraints

- Preserve the global dashboard header and sidebar/bottom navigation; remove only the duplicate in-page `Music` heading.
- Center the master tabs in the order `Playlists`, `Live`; default to `Playlists`.
- Page actions remain inside their selected Music view, never in the global header.
- One unified input accepts search text, supported song URLs, and supported playlist URLs.
- Video is off by default.
- Minimum interactive target is 44px; mobile must not overflow horizontally.
- No retired legacy LocalTunes client or separate Tunes authentication.
- Public Music rendering remains out of scope.

---

### Task 1: Master Music navigation

**Files:**
- Create: `explorers-earth/src/features/music/components/MusicSectionTabs.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/MusicSectionTabs.test.tsx`
- Modify: `explorers-earth/src/components/MusicDashboard.tsx`
- Test: `explorers-earth/src/components/__tests__/MusicDashboard.test.tsx`

**Interfaces:**
- Produces: `MusicSection = "playlists" | "live"` and `MusicSectionTabs({ value, onChange })`.
- Consumes: no server data; selection remains local presentation state.

- [ ] Write failing tests proving `Playlists` precedes `Live`, Playlists is selected by default, arrow keys move selection, and no duplicate in-page Music heading renders.
- [ ] Run the focused tests and confirm they fail against the current queue-first shell.
- [ ] Implement the centered two-tab switcher and conditionally render the two views without remounting secured clients.
- [ ] Run the focused tests and commit `feat(music): add playlists-first dashboard navigation`.

### Task 2: Playlist collection and detail views

**Files:**
- Create: `explorers-earth/src/features/music/components/MusicPlaylistCollection.tsx`
- Create: `explorers-earth/src/features/music/components/MusicPlaylistDetail.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/MusicPlaylistCollection.test.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/MusicPlaylistDetail.test.tsx`
- Modify: `explorers-earth/src/components/MusicDashboard.tsx`
- Test: `explorers-earth/src/components/__tests__/MusicDashboard.test.tsx`

**Interfaces:**
- Produces: collection filtering/search/selection and detail actions for one `MusicPlaylist`.
- Consumes: existing create, rename, visibility, delete, add/remove/reorder song, and queue-replacement callbacks owned by `MusicDashboard`.

- [ ] Write failing collection tests for All/Private/Public filters, name search, empty states, card selection, keyboard access, and private/public New playlist actions.
- [ ] Write failing detail tests for back navigation, rename, visibility, add/remove/reorder song, queue replacement, deletion confirmation, pending/error states, and focus restoration.
- [ ] Implement the responsive two-column desktop and one-column mobile collection; keep destructive and mutation logic in existing callbacks.
- [ ] Implement detail composition by reusing `MusicSearch` for additions and existing guarded dialogs/actions.
- [ ] Run focused collection/detail/dashboard tests and commit `feat(music): add playlist collection and detail workflow`.

### Task 3: Live workspace composition

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicWorkspaceShell.tsx`
- Modify: `explorers-earth/src/components/MusicDashboard.tsx`
- Test: `explorers-earth/src/features/music/components/__tests__/MusicWorkspaceShell.test.tsx`
- Test: `explorers-earth/src/components/__tests__/MusicDashboard.test.tsx`

**Interfaces:**
- Produces: Live layout containing unified discovery, player, queue, guest controls, and history.
- Consumes: existing `MusicSearch`, `MusicPlayer`, `MusicQueue`, `MusicGuestControls`, and `MusicHistory` behavior unchanged.

- [ ] Write failing layout tests for discovery-before-player, desktop queue/right-rail composition, mobile single-column order, and truthful import-disabled state.
- [ ] Remove the old Queue/Guest controls/Recent/Playlists sub-tab model and compose the Live workspace directly.
- [ ] Preserve video-off default, sticky mobile player, queue recovery, history replay, and guest-control mutations.
- [ ] Run all focused Live component tests and commit `refactor(music): compose complete live workspace`.

### Task 4: Responsive, accessible browser contracts

**Files:**
- Modify: `explorers-earth/e2e/music.spec.ts`
- Modify: `explorers-earth/e2e/music-accessibility.spec.ts`
- Modify: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`

**Interfaces:**
- Produces: deterministic browser coverage at desktop, tablet, and 390px mobile widths.
- Consumes: existing authenticated local fixture stack.

- [ ] Add failing Playwright assertions for default Playlists view, centered tab order, collection/detail flow, Live layout, and no duplicate heading.
- [ ] Cover create/visibility/filter/search/rename/add/remove/reorder/delete and return navigation with fixture data.
- [ ] Cover Live search, URL, player/video, queue reorder/clear/persistence, history, guest controls, errors/retry, keyboard order, 44px targets, reduced motion, and no overflow.
- [ ] Make only necessary presentation/accessibility corrections, then run the targeted Playwright suites.
- [ ] Commit `test(music): qualify playlists and live dashboard views`.

### Task 5: Full regression and authenticated local UAT

**Files:**
- Modify only if a verified regression requires a focused fix and new regression test.
- Evidence: `.gstack/qa-reports/qa-report-127-0-0-1-2026-08-27.md`

**Interfaces:**
- Produces: build/test/browser evidence for release review.
- Consumes: completed Tasks 1–4 and the local authenticated fixture environment.

- [ ] Run the complete Music Vitest suite, TypeScript/build gates, and targeted full-stack Playwright suite.
- [ ] Perform authenticated desktop, tablet, and mobile UAT for every Playlists and Live workflow, refreshing and navigating away/back to verify persistence.
- [ ] Inspect console and network after every major interaction; distinguish unrelated extension warnings from application failures.
- [ ] Capture final desktop/mobile screenshots and record any deferred external-capability boundary.
- [ ] Run final diff review and commit only verified fixes/evidence.

## Self-review

- Spec coverage: every approved Playlists and Live desktop/mobile behavior maps to Tasks 1–5.
- Unsupported server behavior is surfaced honestly; no legacy authority is reintroduced.
- Type names and component boundaries are consistent across tasks.
- No placeholders or deferred implementation language exists for in-scope supported behavior.

## Review decisions (2026-08-27)

- Product: preserve the full owner workflow, but never imply retired playlist import works.
- Design: Playlists is first/default, Live is second, the master tabs are centered, the duplicate heading is removed, and New playlist remains an in-page action.
- Engineering: reuse the current secured owner gateway and idempotency model; never call the legacy Tunes browser client.
- DX/testing: every behavior ships through red-green focused tests, then full Music regression, build, Playwright, and authenticated local desktop/mobile UAT.
- Coordination: this branch does not edit the public Music page; settings contracts are shaped so the separate public-URL agent can consume them without conflicting UI edits.
