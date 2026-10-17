# PR 103 Review Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make maximum custom analytics ranges and attribution tracking reliable at their boundary conditions.

**Architecture:** Validate the exact normalized date interval sent to the backend while keeping a 93-inclusive-calendar-day UI contract. Treat session attribution storage as an optional cache: storage failures must never prevent an analytics event or strand request state.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, Express/Zod.

**Spec:** PR #103 inline review discussions `r3849795780`, `r3849795786`, and `r3849795788`.

## Global Constraints

- Preserve the backend maximum elapsed analytics window of 93 days.
- Preserve full-day inclusive custom filters.
- Do not change Strapi code or the already-correct Drizzle `leaseId` declaration.
- Storage failures degrade attribution only; analytics delivery and request cleanup continue.
- Work only in the existing isolated PR worktree and branch.

---

### Task 1: Inclusive analytics date boundary

**Files:**
- Modify: `explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx`
- Modify: `explorers-earth/src/features/Analytics/utils/analyticsDateRange.ts`
- Test: `explorers-earth/src/features/Analytics/__tests__/analyticsDateRange.test.ts`
- Test: the closest existing `AnalyticsDashboard` component test

**Interfaces:**
- Consumes: `getAnalyticsDateRange(filter, now)`.
- Produces: a shared validity helper that compares the normalized start-of-day/end-of-day interval to `93 * 24h`.

- [ ] **Step 1: Write failing boundary tests**

Add literal assertions proving a 93-calendar-day inclusive selection is accepted, the next day is rejected, reversed/incomplete ranges remain invalid, and the displayed input limits cannot select the rejected date.

- [ ] **Step 2: Run focused tests and verify RED**

Run the analytics date-range and dashboard test files. Confirm failure occurs because the current raw-date subtraction accepts a 94-calendar-day inclusive request.

- [ ] **Step 3: Implement the minimum shared validation**

Normalize through `getAnalyticsDateRange`, compare the exact outbound interval to the server cap, and derive date-input bounds as 93 inclusive calendar dates without duplicating a mismatched rule.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused files and confirm all boundary cases pass.

### Task 2: Fail-safe UTM attribution storage

**Files:**
- Modify: `explorers-earth/src/utils/urlHelpers.ts`
- Modify: `explorers-earth/src/services/analyticsService.ts`
- Test: `explorers-earth/src/utils/__tests__/urlHelpers.test.ts`
- Test: the existing analytics service hook test file

**Interfaces:**
- Consumes: optional `Storage`-compatible dependency.
- Produces: `getSessionAttributionUtmParams()` that always returns sanitized current/stored attribution or `{}` without throwing because storage is unavailable.

- [ ] **Step 1: Write failing storage tests**

Add separate storage doubles whose `getItem`, `removeItem`, and `setItem` throw. Assert current URL attribution is still returned where available and no storage failure escapes.

- [ ] **Step 2: Write failing request-cleanup test**

Make attribution preparation throw in the analytics hook test and assert request loading/in-flight state is released and a later attempt is allowed.

- [ ] **Step 3: Run focused tests and verify RED**

Confirm failures reproduce the unguarded cleanup/write and pre-`try/finally` request-state bug.

- [ ] **Step 4: Implement minimum containment**

Guard UTM cleanup and writes like referrer storage, and include attribution preparation inside the hook's existing `try/finally` lifecycle.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run URL-helper and analytics-service tests with zero failures.

### Task 3: Review and complete verification

**Files:**
- Review all modified files above and `tunes/shared/schema.ts` without changing its existing `leaseId` field.

- [ ] **Step 1: Review the diff against all three comments**

Confirm comments 1 and 3 are covered and comment 2 remains already satisfied.

- [ ] **Step 2: Run frontend unit, typecheck, lint, build, integration, and E2E validation**

Use the repository's existing scripts and exact PR-safe E2E environment. Confirm the live-write matrix remains skipped unless separately authorized.

- [ ] **Step 3: Check repository integrity**

Run `git diff --check`, inspect `git status --short`, and verify no unrelated user-sync files changed.

- [ ] **Step 4: Commit, push, and verify CI**

Push to `codex/profile-settings-tabs`, wait for every required PR check, and reply to the inline review threads with the verified resolution or technical explanation.

## Self-Review

- Spec coverage: all three review comments are mapped; two receive tests/fixes and the already-satisfied schema comment receives verification only.
- Placeholder scan: no deferred implementation steps or unspecified error handling remain.
- Type consistency: date normalization remains `Date` based; storage keeps the existing `Storage`-compatible interface; no new backend or Strapi interface is introduced.
