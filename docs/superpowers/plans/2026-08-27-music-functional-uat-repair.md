# Music Dashboard Functional UAT Repair Plan

> Execute this plan test-first in the isolated `codex/music-dashboard-responsive` worktree. Do not weaken production origin enforcement for local testing.

**Goal:** Make the redesigned authenticated Music dashboard fully functional and design-system consistent, and prove that its publication and guest controls are reflected correctly on the public Music page.

**Approach:** Restore a trustworthy isolated full-stack UAT lane first. Then repair shared interaction contracts (switches, mutations, playback), complete the public-page contract, and run a scenario matrix at desktop and mobile sizes. Keep server authorization and origin checks fail-closed.

## Phase 1 — Freeze the product contract in tests

### Task 1: Add a scenario and permission matrix

**Files:**

- Create: `explorers-earth/e2e/music-functional-uat.spec.ts`
- Create: `explorers-earth/e2e/music-public-reflection.spec.ts`
- Modify: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`

**Steps:**

1. Define owner scenarios for player, queue, history, playlists, publication, and guest controls.
2. Define anonymous scenarios for Private, Public, valid Unlisted, revoked Unlisted, and expired Unlisted access.
3. Define the three playlist-exposure gates and expected results for every combination.
4. Add failing tests for the defects in this report before changing implementation.
5. Record network responses and assert that each mutation reached the isolated Tunes backend and returned the expected status.

### Task 2: Repair the isolated full-stack fixture

**Files:**

- Modify: `docker-compose.music-test.yml`
- Modify: `explorers-earth/playwright.config.ts`
- Modify: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`
- Modify or create fixture bootstrap scripts only where already routed by the compose configuration.

**Steps:**

1. Rebuild Explorers and Tunes fixtures from the exact branch commit.
2. Supply explicit test-only secret files and validate their resolved paths before compose starts.
3. Configure Tunes to accept only the fixture frontend origin; keep production origins unchanged.
4. Seed a deterministic owner, songs, queue, history, playlists, and publication state.
5. Update selectors for the centered Playlists / Live dashboard structure.
6. Prove login, identity ensure, one read, and one mutation before enabling the broader suite.

## Phase 2 — Standardize switch behavior

### Task 3: Replace bespoke playlist and guest switches

**Files:**

- Modify: `explorers-earth/src/features/music/MusicPlaylistCollection.tsx`
- Modify: `explorers-earth/src/features/music/MusicGuestControls.tsx`
- Reuse/modify only if necessary: `explorers-earth/src/components/ui/Switch.tsx`
- Test: corresponding Music component test files

**Steps:**

1. Write failing interaction tests for keyboard activation, pending state, success, rejection, and prop resynchronization.
2. Replace custom switch markup with the shared Explorers switch primitive.
3. Lock the control while its mutation is pending.
4. Apply optimistic state only with an explicit rollback path.
5. Contain rejection and expose an accessible inline status instead of an unhandled promise.
6. Verify focus, disabled/loading state, labels, and mobile target size.

## Phase 3 — Make mutations truthful and resilient

### Task 4: Separate queue mutation from reconciliation

**Files:**

- Modify: `explorers-earth/src/features/music/MusicQueue.tsx`
- Modify: `explorers-earth/src/features/music/musicQueueClient.ts`
- Test: queue component/client tests and full-stack UAT

**Steps:**

1. Write failing tests for write failure, write success plus refresh failure, duplicate input, and out-of-order responses.
2. Give each mutation an explicit pending/acknowledged/reconciling/failed lifecycle.
3. Roll back only when the write itself fails.
4. If reconciliation fails after an acknowledged write, retain the acknowledged optimistic state and offer a refresh/retry status.
5. Preserve keyboard reorder and add pointer drag-and-drop with an accessible alternative.
6. Verify add, play, reorder, remove, clear, reload persistence, and multi-tab refresh.

### Task 5: Apply the same mutation contract to playlists and guest controls

**Files:**

- Modify: playlist and guest-control API/component modules
- Test: component, client, and full-stack UAT suites

**Steps:**

1. Cover create, rename, delete, add/remove song, reorder, visibility, and all guest switches.
2. Prevent concurrent duplicate submissions.
3. Distinguish validation, authorization, connectivity, and reconciliation errors.
4. Verify server persistence after a full page reload.

## Phase 4 — Establish one playback command contract

### Task 6: Route every Play action through the player

**Files:**

- Modify: `explorers-earth/src/features/music/MusicPlayer.tsx`
- Modify: `explorers-earth/src/features/music/MusicQueue.tsx`
- Modify: Music search/results component
- Modify: `explorers-earth/src/features/music/MusicHistory.tsx`
- Create or modify: a scoped playback command/controller module

**Steps:**

1. Write failing tests proving a Play action calls the media element's `play()` after selecting the track.
2. Define explicit commands: play track, pause, resume, next, previous, and optionally play without video.
3. Route Search, Queue, and History through the same command contract.
4. Preserve server current-song synchronization without using it as a substitute for local playback intent.
5. Surface browser autoplay rejection as an actionable user state.
6. Verify actual time progression, pause/resume, track transitions, video toggle, and persisted recently played state.

### Task 7: Add replay to Recently played

**Files:**

- Modify: `explorers-earth/src/features/music/MusicHistory.tsx`
- Test: history component and browser UAT suites

**Steps:**

1. Add one row Play action only, matching the approved compact design.
2. Use the canonical playback command.
3. Verify replay promotes the item according to the agreed history-order rule without duplicate corruption.

## Phase 5 — Make publication state understandable and safe

### Task 8: Represent effective playlist exposure

**Files:**

- Modify: `explorers-earth/src/features/music/MusicPlaylistCollection.tsx`
- Modify: sharing/publication settings components
- Test: playlist and publication suites

**Steps:**

1. Add tests for the workspace publication × playlist visibility × sharing-permission matrix.
2. Replace misleading binary badge copy with effective exposure state.
3. Keep playlist-level control disabled or clearly qualified when a higher-level gate prevents exposure.
4. Verify draft/public changes, unlisted link generation, link revoke/expiry, and reload persistence.

## Phase 6 — Complete the public Music experience

### Task 9: Validate and consume the full guest response

**Files:**

- Modify: `explorers-earth/src/features/music/publicMusicClient.ts`
- Modify: `explorers-earth/src/pages/public/PublicMusic.tsx`
- Add: public Music response schema/types
- Test: public component and full-stack reflection suites

**Steps:**

1. Add runtime response validation; reject malformed or missing fields safely.
2. Consume current song, queue, recently played, playlists, and every guest permission flag.
3. Render search/request, player, queue, history, and playlist sections only when authorized.
4. Ensure `allowGuestPlayOnDevice` never grants server-side queue mutation by implication.
5. Verify dashboard changes reflect on the public page after refresh and authorized live synchronization.
6. Verify private or disabled resources remain inaccessible even when a prior link or response is cached.

## Phase 7 — Design review and comprehensive UAT

### Task 10: Visual and responsive review

**Viewports:** desktop, tablet, narrow mobile

**Steps:**

1. Compare playlist cards and switches with established Explorers list-card patterns.
2. Check hierarchy, spacing, focus, overflow, sticky player behavior, drag targets, and empty/loading/error states.
3. Verify Playlists remains the first centered tab and Live the second.
4. Verify no horizontal scrolling, clipped controls, or unreachable queue actions on mobile.

### Task 11: Run the release UAT matrix

**Steps:**

1. Run unit, component, accessibility, client contract, server integration, and isolated full-stack suites.
2. Run authenticated owner UAT for every player, queue, history, playlist, publication, and guest-control action.
3. Run anonymous public UAT for every publication/permission combination.
4. Inspect browser console and network logs; allow no relevant unhandled errors or failed mutations.
5. Capture screenshots and response evidence for desktop and mobile.
6. Run an adversarial code review focused on authorization boundaries, race conditions, and stale state.
7. Only after all exact-head checks pass, prepare a PR and request Codex review.

## Completion criteria

- No mocked-only claim is used as evidence for a real mutation or media behavior.
- Every visible Play action starts playback or explains a browser restriction.
- Queue and playlist writes persist after reload and report truthful failure states.
- All switches match the Explorers design system and work by pointer and keyboard.
- Dashboard publication and guest controls produce the documented public-page result.
- Private, disabled, expired, and revoked access remains fail-closed.
- The isolated full-stack suite, desktop/mobile UAT, and final review all pass on the same commit.
