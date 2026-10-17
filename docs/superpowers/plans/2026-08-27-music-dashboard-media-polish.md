# Music Dashboard Media Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Playlists match established Explorers list cards and turn Live into a polished, responsive media workspace without changing Music security or server contracts.

**Architecture:** Keep the existing secured Music clients and mutations. Refine the four focused presentation components (`MusicPlaylistCollection`, `MusicPlayer`, `MusicQueue`, `MusicGuestControls`, `MusicHistory`) and let `MusicWorkspaceShell` provide only responsive layout. Queue ordering continues through `moveSong`; pointer drag-and-drop and keyboard reordering share that canonical operation.

**Tech Stack:** React 18, TypeScript, lucide-react, existing dashboard CSS tokens, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-music-dashboard-responsive.md` plus the approved mock `C:/Users/TK/.codex/generated_images/019ff94e-5647-70f0-bc85-f974698b6abe/exec-88a27eb0-915c-47d5-af42-a3586d2759db.png`

## Global Constraints

- Preserve Explorer authentication, owner-workspace rollout, gateway clients, idempotency, retry, and stale/read-only behavior.
- Preserve the existing Explorer sidebar/header; do not edit public Music pages.
- Queue rows expose only a drag handle and direct Play action. Remove and bulk operations live in the Queue header menu.
- Drag-and-drop must have keyboard-accessible move equivalents and live announcements.
- Video remains hidden by default. All controls remain at least 44px.
- Unsupported playlist import remains visibly unavailable.

---

### Task 1: Explorers-consistent playlist collection

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicPlaylistCollection.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/MusicPlaylistCollection.test.tsx`
- Modify: `explorers-earth/src/components/__tests__/MusicDashboard.test.tsx`

**Interfaces:**
- Consumes: `MusicPlaylist[]`, `onSelect(playlist)`, and `emptyAction`.
- Produces: searchable list-card grid with no visibility filter state.

- [ ] Write a failing test proving there is no All/Private/Public filter group, search and New playlist share the action row, cards expose badge/switch/art/counts, and the add-new card triggers creation.
- [ ] Run the focused test and confirm failure is caused by the old filter/card composition.
- [ ] Rebuild cards using the established Movies list-card hierarchy: header title, PUBLIC/DRAFT badge, visibility switch, description, four-preview strip, count footer, and dashed Add new playlist card.
- [ ] Keep card opening and visibility switching as distinct keyboard actions; prevent the switch from opening the card.
- [ ] Run collection and dashboard tests until green.

### Task 2: Familiar media player

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicPlayer.tsx`
- Modify: `explorers-earth/src/features/music/components/__tests__/MusicPlayer.test.tsx`

**Interfaces:**
- Preserve `MusicPlayerProps` and all queue/recovery callbacks.
- Produce artwork-first presentation, icon media controls, progress/time, compact volume/mute, and secondary video toggle.

- [ ] Write failing tests for artwork, icon-labeled Previous/Play-or-Pause/Next controls, time display, video-off default, and retained playback transitions.
- [ ] Verify the focused test fails against text-button layout.
- [ ] Implement the approved player hierarchy with lucide icons and responsive artwork; preserve ReactPlayer callbacks and recovery logic exactly.
- [ ] Verify play/pause, previous/next, seeking, volume, mute, video toggle, end-of-track, and media-error tests pass.

### Task 3: Queue header actions and accessible drag ordering

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicQueue.tsx`
- Modify: `explorers-earth/src/features/music/components/__tests__/MusicQueue.test.tsx`

**Interfaces:**
- Preserve the existing `QueueClient` operations.
- Produce row drag state and one header menu for selection/removal/clear.

- [ ] Write failing tests proving each row has only Play plus a drag handle, the header menu contains selection/removal/clear operations, pointer drop calls `moveSong`, and keyboard movement remains available through the drag handle.
- [ ] Verify failures describe the old Play/Up/Down/Remove row controls.
- [ ] Implement thumbnail media rows, native pointer drag/drop with insertion feedback, and an accessible drag-handle menu/keyboard command using the same `move()` function.
- [ ] Move Select all, Remove selected, and Clear queue into the three-dot header menu with confirmation for destructive bulk actions.
- [ ] Preserve optimistic ordering, rollback, busy locking, reconciliation, and live announcements; run queue tests green.

### Task 4: Guest controls and recently played cards

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicGuestControls.tsx`
- Modify: `explorers-earth/src/features/music/components/MusicHistory.tsx`
- Modify: corresponding tests under `explorers-earth/src/features/music/components/__tests__/`

**Interfaces:**
- Preserve current guest-control and history callbacks.
- Produce visual pill switches and compact replayable history rows.

- [ ] Write failing tests for switch state/disabled/saving/error behavior and history thumbnail rows with a quiet header Clear history action.
- [ ] Implement pill tracks/thumbs without changing optimistic rollback semantics.
- [ ] Implement history media rows; add Play only where the existing client supplies a supported replay callback, otherwise keep rows informational.
- [ ] Run focused tests green, including empty/loading/failure states.

### Task 5: Responsive composition and browser qualification

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicWorkspaceShell.tsx`
- Modify: `explorers-earth/e2e/music-accessibility.spec.ts`
- Modify: `explorers-earth/e2e/music.spec.ts`

**Interfaces:**
- Consume the refined components without duplicating their headings.
- Produce desktop player/queue/right-rail layout and single-column mobile layout.

- [ ] Add failing browser assertions for the approved playlist row/cards, player hierarchy, queue-only Play actions, drag reorder, header bulk actions, switch UI, history rows, and mobile ordering.
- [ ] Verify browser tests fail for the expected old presentation.
- [ ] Apply only layout corrections required for the target mock at 375px and 1280px, retaining sticky mobile player behavior and no horizontal overflow.
- [ ] Run complete Music Vitest, TypeScript/build, and Playwright gates.
- [ ] Perform local authenticated desktop/mobile UAT, inspect console/network errors, and capture final Playlists and Live screenshots.

## Plan Review

- Product: every currently supported action remains reachable; unsupported imports are not implied.
- Interaction: queue rows have one obvious Play action; ordering and destructive actions are separated to reduce accidental taps.
- Accessibility: drag is never the only reorder path; icon buttons retain explicit accessible names; destructive bulk actions require confirmation.
- Responsive: Playlists action row collapses cleanly; Live becomes one column on mobile with a sticky compact player.
- Scope: no server, deployment, authentication, or public-page changes.
- Verification: each behavior starts with an observed failing test, then focused green, full regression, build, and real browser evidence.
- Placeholder scan: no TBD/TODO or undefined interface remains.
