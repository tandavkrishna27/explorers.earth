# Music Dashboard Functional Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved Playlists/Live Music dashboard reliable against a real isolated Tunes fixture and prove owner controls, playback, queue, playlist, and public-contract scenarios with real data.

**Architecture:** Preserve the existing `MusicDashboard` coordinator and the separate public-page agent boundary. First restore an isolated browser-to-Tunes test route; then consolidate dashboard interaction behavior around explicit mutation and playback outcomes. Tests must prove the actual browser and fixture behavior rather than mocked rendered state.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright, Docker Compose, Tunes gateway and PostgreSQL fixtures.

**Spec:** `docs/superpowers/specs/2026-08-27-music-dashboard-responsive.md`

## Global Constraints

- Do not weaken production origin/CORS enforcement or proxy local writes to production.
- Do not edit the public Music page; another agent owns that UI. Verify its existing response contract and report gaps.
- Preserve current uncommitted dashboard/layout work and build only additive, reviewed fixes on top of it.
- Every production behavior change begins with a focused failing regression test.
- Do not claim real-data support based only on mocked component tests.

---

### Task 1: Restore trustworthy isolated full-stack Music UAT

**Files:**

- Modify: `docker-compose.music-test.yml`
- Modify: `tunes/scripts/music-fixture-server.ts`
- Modify: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`
- Test: `tunes/server/test/contracts/music-fixture-services.test.ts`
- Test: `tunes/server/test/contracts/music-qualification-lanes.test.ts`

**Interfaces:**

- Produces a deterministic fixture origin allowed by its fixture Tunes service only.
- Produces test evidence for login, identity, read, and mutation transport.

- [ ] Write a failing fixture contract test that distinguishes the fixture frontend origin from production and requires a successful authenticated queue mutation.
- [ ] Run it and verify the present fixture/proxy configuration fails for the expected origin or login reason.
- [ ] Make the smallest compose/bootstrap/test-harness correction so frontend, gateway, fixture Strapi, and PostgreSQL use the same branch-local test stack.
- [ ] Update full-stack selectors to the Playlists-first / Live-second UI without loosening assertions.
- [ ] Run the fixture service contracts and one authenticated mutation scenario; record exact endpoint/status evidence.

### Task 2: Correct dashboard command and mutation behavior

**Files:**

- Modify: `explorers-earth/src/features/music/components/MusicPlayer.tsx`
- Modify: `explorers-earth/src/features/music/components/MusicQueue.tsx`
- Modify: `explorers-earth/src/features/music/components/MusicHistory.tsx`
- Modify: `explorers-earth/src/features/music/components/MusicPlaylistCollection.tsx`
- Modify: `explorers-earth/src/features/music/components/MusicGuestControls.tsx`
- Reuse: `explorers-earth/src/components/ui/Switch.tsx` or `SwitchButton.tsx`
- Test: matching focused component tests

**Interfaces:**

- Produces an explicit dashboard playback request understood by `MusicPlayer`.
- Produces mutation state that distinguishes rejected write from acknowledged write plus failed refresh.

- [ ] Write failing tests that prove Queue/Search/History Play causes a media play request after a canonical song change.
- [ ] Write failing tests for acknowledged queue reorder followed by refresh failure, switch rejection/pending state, and history replay.
- [ ] Implement the smallest shared command/state path; retain canonical server synchronization and safe stale-state handling.
- [ ] Replace bespoke switches with the shared Explorers switch primitive, including disabled, pending, rollback, and accessible error state.
- [ ] Run focused tests and the complete Music component suite.

### Task 3: Verify owner-to-public contract without overlapping the public UI branch

**Files:**

- Modify: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`
- Create: `explorers-earth/e2e/music-public-contract.spec.ts`
- Test: existing public client contract tests

**Interfaces:**

- Produces fixture-backed evidence for the workspace publication, playlist visibility, and guest-sharing gates.
- Does not modify public-page rendering.

- [ ] Write a failing matrix test for Private, Public, valid Unlisted, disabled guest sharing, and playlist-visible combinations.
- [ ] Verify the backend response exposes or withholds the expected resources in each scenario.
- [ ] Verify dashboard mutation persistence after reload and report public UI behavior as pass, blocked, or a handoff finding.
- [ ] Run the public-client contract and fixture scenarios.

### Task 4: Perform final real-data UAT and review

**Files:**

- Create: `.gstack/qa-reports/qa-report-music-functional-uat-2026-08-27.md`
- Modify only for newly reproduced, test-backed defects.

- [ ] Run unit/component, production build, fixture contracts, and targeted full-stack Playwright suites on the same head.
- [ ] Perform authenticated owner UAT at desktop, 768px, and 390px: playlist lifecycle, visibility, search/URL, player, queue add/play/reorder/remove/clear/persistence, guest controls, and history replay.
- [ ] Run anonymous/public contract scenarios and document only the public UI findings that belong to the other agent.
- [ ] Inspect application console and network after each major flow; separate unrelated extension/Maps warnings from Music failures.
- [ ] Run an adversarial final diff review, capture evidence/screenshots, and report unresolved blockers precisely.

## Completion Criteria

- Local writes use an isolated test backend and succeed or fail for application reasons visible in test evidence.
- Every visible dashboard Play action starts media playback or offers a clear browser-policy recovery.
- Queue, playlist, and guest-control mutations handle pending, rejection, acknowledgment, and reload persistence truthfully.
- Switches use the shared Explorers interaction language.
- The publication/guest-control contract is tested across its three exposure gates.
- Full-stack real-data UAT, responsive UAT, and an adversarial review are all run on the exact same branch head.
