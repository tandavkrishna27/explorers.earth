# Production Music UAT and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every deployed owner Music workflow reliable and verify the complete experience end to end on desktop and mobile.

**Architecture:** Treat production behavior as authoritative. Reproduce each failure through the authenticated Explorers UI, add a focused regression at the failing boundary, apply the smallest fix, and repeat the same browser journey locally and after guarded deployment. Keep guest workspace and playlist imports separately gated unless the UAT explicitly validates their enabled state.

**Tech Stack:** React, TypeScript, Vitest, TanStack Query, Express, PostgreSQL, Docker Compose, GitHub Actions, authenticated browser UAT.

**Spec:** Active user objective in this task: search, player, queue lifecycle and movement, playlist lifecycle and song membership/import, history, responsive UI, deployment, and post-deployment verification.

## Global Constraints

- Never bypass CI, immutable-image provenance, migration, readiness, or environment approval gates.
- Reproduce every defect twice and capture before/after browser evidence.
- Use one atomic commit per independently fixable defect.
- Verify exact deployed commit, digest, migration marker, and owner-only rollout after deployment.
- Do not expose credentials or server environment contents.

---

### Task 1: Stabilize owner-workspace feature renewal

**Files:**
- Create: `tunes/server/test/music-feature-decision-service.regression-1.test.ts`
- Modify: `tunes/server/services/musicFeatureDecisionService.ts`

**Interfaces:**
- Consumes: `MusicFeatureDecisionService.decide(principal)` and its expiring cached exposure.
- Produces: a renewed exposure before the cached expiry enters the bounded clock-skew window.

- [ ] Write a failing fake-clock test proving a request near expiry receives a fresh future exposure instead of the nearly expired cached value.
- [ ] Run only the regression test and confirm it fails against the current implementation.
- [ ] Add a bounded server-side refresh window without changing deterministic flag decisions.
- [ ] Run feature-service, feature-route, rollout-client, and page tests.
- [ ] Re-run the deployed-style browser timing journey locally for longer than two exposure periods.
- [ ] Commit the verified defect fix atomically.

### Task 2: Execute the exhaustive functional matrix

**Files:**
- Create: `.gstack/qa-reports/qa-report-explorers-earth-2026-08-27.md`
- Create: `.gstack/qa-reports/screenshots/production-music-*.png`

**Interfaces:**
- Consumes: authenticated owner account and the deployed `/recommendations/music` surface.
- Produces: pass/fail evidence for each workflow and a prioritized defect list.

- [ ] Verify identity setup, refresh, route navigation, and workspace stability.
- [ ] Verify text search, pagination, empty query, no-result query, and URL discovery.
- [ ] Verify play-now, play/pause, mute/volume, seek, previous, next, and refresh persistence.
- [ ] Verify queue add-one, add-many, reorder up/down, selection, remove, clear, and refresh persistence.
- [ ] Verify recently-played creation, ordering, replay, clear, and refresh persistence.
- [ ] Verify playlist create, rename, description, privacy/publication, add/remove/reorder songs, replace queue, import, persistence, and disposable-playlist deletion.
- [ ] Verify sharing settings and owner-only rollout boundaries.
- [ ] Verify desktop and mobile layouts, keyboard operation, focus, labels, empty/error/loading states, and application-origin console/network errors.
- [ ] Record every failure with exact reproduction steps and screenshots before inspecting its source.

### Task 3: Repair every reproducible UAT defect

**Files:**
- Modify only the source file at each reproduced failing boundary.
- Create one new `*.regression-N.test.ts(x)` beside the closest existing test suite per defect.

**Interfaces:**
- Consumes: Task 2 reproduction evidence.
- Produces: one reviewed, independently verified commit per defect.

- [ ] Trace each failure from UI action through client, gateway, service, persistence, and returned state.
- [ ] Add a failing regression with the exact production precondition.
- [ ] Implement the smallest behavior-preserving fix.
- [ ] Run the focused test, adjacent suite, full Music qualification lanes, and local authenticated browser journey.
- [ ] Capture the after screenshot and update the QA report.
- [ ] Commit each verified fix separately.

### Task 4: Review, land, deploy, and repeat UAT

**Files:**
- Modify: PR description and QA evidence only; deployment uses checked-in trusted workflows.

**Interfaces:**
- Consumes: reviewed commits and complete local UAT evidence.
- Produces: an exact production commit with a requirement-by-requirement final verdict.

- [ ] Review the full diff for security, rollback, UX, and regression risk.
- [ ] Open a PR, request Codex review, resolve valid findings, and wait for every CI gate.
- [ ] Merge only the reviewed all-green commit.
- [ ] Run the guarded exact-main Tunes deployment and any required Explorers frontend deployment.
- [ ] Verify live readiness metadata and rollout scope.
- [ ] Repeat every Task 2 browser check against production.
- [ ] Mark the goal complete only when every explicit workflow has direct passing evidence.
