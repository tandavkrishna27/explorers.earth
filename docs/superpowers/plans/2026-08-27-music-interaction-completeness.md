# Music Interaction Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the owner Music dashboard interactions with safe row actions, automatic video URL discovery, playlist-to-queue controls, and qualified playback behavior.

**Architecture:** Keep the dashboard as the UI orchestration boundary. Use durable owner operations for history removal and new atomic saved-playlist append; use canonical queue replacement followed by the playback arbiter for replace/shuffle. Discovery has three explicit outcomes: video lookup, text search, and unsupported playlist import.

**Tech Stack:** React, TypeScript, TanStack Query, Express, PostgreSQL, Vitest, Playwright, Docker Compose fixture.

**Spec:** `docs/superpowers/specs/2026-08-27-music-interaction-completeness-design.md`

## Global Constraints

- Preserve credential-derived owner authority and idempotency on every mutation.
- Do not reintroduce automatic playback when queue entries appear.
- Do not change public Music page UI.
- Test with the isolated real PostgreSQL fixture at `http://localhost:55173`.

---

### Task 1: Durable owner-scoped individual history removal

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`, `tunes/server/routes/musicSurfaceRoutes.ts`, `tunes/server/routes/musicOpenApiRoutes.ts`, `tunes/migrations/*`
- Modify: `explorers-earth/src/features/music/musicQueueClient.ts`, `explorers-earth/src/features/music/components/MusicHistory.tsx`
- Test: `tunes/server/test/music-domain-repository.integration.test.ts`, `tunes/server/test/music-surface-routes.test.ts`, `tunes/server/test/migrations/music-migration-contract.test.ts`, `explorers-earth/src/features/music/__tests__/musicQueueClient.test.ts`, `explorers-earth/src/features/music/components/__tests__/MusicHistory.test.tsx`

- [ ] Add failing integration/route tests proving owner-only removal, durable same-key/same-target replay (204), same-key/different-target conflict, and migration registration.
- [ ] Implement the durable owner-operation protocol and route contract without altering generic queue-row deletion semantics.
- [ ] Add a failing Explorer client/component test for a row kebab menu with Play again and Remove from history, including acknowledged-write/refetch-failure messaging.
- [ ] Implement client method and row menu behavior; header kebab → Clear history opens a confirmed accessible dialog with Escape/cancel/focus restoration.
- [ ] Run focused server and Explorer tests.

### Task 2: Queue row actions and safe server-owned playlist queue actions

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`, `tunes/server/routes/musicSurfaceRoutes.ts`, `tunes/server/routes/musicOpenApiRoutes.ts`, `tunes/migrations/*`
- Modify: `explorers-earth/src/features/music/components/MusicQueue.tsx`, `explorers-earth/src/components/MusicDashboard.tsx`, `explorers-earth/src/features/music/musicQueueClient.ts`
- Test: `tunes/server/test/music-domain-repository.integration.test.ts`, `tunes/server/test/music-surface-routes.test.ts`, `explorers-earth/src/features/music/components/__tests__/MusicQueue.test.tsx`, `explorers-earth/src/components/__tests__/MusicDashboard.test.tsx`, `explorers-earth/src/features/music/__tests__/musicQueueClient.test.ts`

- [ ] Add failing component tests for one-open-row-menu behavior, keyboard/Escape/outside close/focus restore, action lock, and 390px overflow-safe layout.
- [ ] Implement the queue row menu, preserving drag reorder through an explicit reorder mode and existing header bulk actions.
- [ ] Add failing server/client tests for revisioned, durable atomic playlist append; stale revision and cross-owner cases must reconcile instead of losing existing queue.
- [ ] Add failing tests for confirmed replace/shuffle, queue-replaced/playback-failed retry, and concurrent stale revision.
- [ ] Implement playlist action menu: Append is non-destructive; Replace and Shuffle require named confirmation dialogs. Use atomic server commands and playback arbiter; never use legacy per-song delete/re-add loops.
- [ ] Run focused component/client tests.

### Task 3: Automatic discovery URL behavior and loading copy

**Files:**
- Modify: `explorers-earth/src/features/music/components/MusicSearch.tsx`, `explorers-earth/src/pages/Music.tsx`
- Test: `explorers-earth/src/features/music/components/__tests__/MusicSearch.test.tsx`, `explorers-earth/src/pages/__tests__/MusicPage.test.tsx`

- [ ] Add failing tests for whitespace, direct `youtu.be`, watch and shorts URLs, normal text, malformed/unsupported lookalike URLs, and playlist URLs producing visible import-unavailable feedback without a search/lookup request.
- [ ] Add a failing page-state test that entitlement loading renders a skeleton without the visible sentence.
- [ ] Implement URL classification and skeleton-only state without weakening retry/error accessibility.
- [ ] Run focused tests.

### Task 4: Browser playback and responsive UAT

**Files:**
- Modify/create only tests as needed: `explorers-earth/e2e/music-fixture-fullstack.spec.ts`, `explorers-earth/e2e/music-public-contract.spec.ts`

- [ ] Add deterministic component/adapter cases for Next, Previous, end-to-next, failed-media skip-once, and playlist queue action state transitions; browser UAT validates displayed controls and canonical state, not cross-origin provider completion.
- [ ] Execute owner scenarios at desktop and 390px; validate no horizontal overflow, visible menus, and no first-party console/network failures.
- [ ] Execute private/public/unlisted/sharing public data-contract matrix. Do not modify public UI.
- [ ] Run full affected unit/component, PostgreSQL, build/type, fixture smoke, and Playwright checks.

### Task 5: Final review and PR readiness report

- [ ] Review all changes against this spec, including owner authorization, idempotency, stale refresh, accessibility, responsive behavior, and old-feature parity.
- [ ] Resolve every actionable review finding.
- [ ] Record exact commands/results and remaining non-scope public UI ownership items.
- [ ] State PR readiness only with fresh passing evidence.

## Plan Review

| Review area | Result | Required change |
|---|---|---|
| Old feature parity | Preserves playlist queue actions; rejects unsafe auto-start | Use canonical queue replace, not legacy loops |
| Data safety | History removal and append add durable owner operations | Require migration, ownership, same-key replay/conflict, and revision tests |
| UX | Kebab menus and automatic URL submit are explicit | Keep 44px targets, keyboard focus semantics, confirmations, and playlist-URL feedback |
| Mobile | Actions must not add horizontal overflow | Run 390px fixture UAT |
| Public UI boundary | Other agent owns public UI | Contract-only verification here |

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Engineering plan review | Complete | Added durable history semantics, atomic append, and two-phase replacement/playback failure handling |
| Design plan review | Complete | Added playlist-URL feedback, dialog/menu keyboard rules, and 390px row layout constraints |
| Historical compatibility review | Complete | Preserve queue/playlist actions; exclude auto-start |

**VERDICT:** Reviewed plan is ready for test-first implementation.

NO UNRESOLVED DECISIONS
