# Server Identity, Lifecycle, and Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Explorer identity selection, lifecycle tombstones, and account reactivation bounded, durable, concurrency-safe, and free of credential leakage.

**Architecture:** Identity reads exhaust a strictly bounded, metadata-authenticated Strapi account result set before binding. Every upstream response is consumed through a deadline- and byte-bounded stream reader or explicitly cancelled. Reactivation authority moves from process memory to a PostgreSQL hash-only token table with DB-clock expiry, recoverable leases, and atomic single-use consumption; the runtime role is repaired and attested so it cannot delete tombstones or token history.

**Tech Stack:** TypeScript, Node.js 22.12.0, Express, PostgreSQL 15, Vitest, PowerShell.

**Spec:** Parent Task12 SERVER IDENTITY/LIFECYCLE/REACTIVATION assignment approved 2026-08-23.

## Global Constraints

- Strict TDD: observe every focused test fail for the intended missing behavior before implementation.
- Add migrations only; never rewrite migrations `0001` through `0013`.
- Store only SHA-256 token hashes, immutable identity identifiers, operation identifiers, timestamps, and lease state; never store raw tokens or email addresses.
- Use PostgreSQL `clock_timestamp()` for issue, expiry, lease, and consumption decisions.
- Runtime can never `DELETE` `music_identity_tombstones` or `music_reactivation_tokens`.
- Never log emails, raw tokens, reactivation links, raw response bodies, or provider error objects.
- Windows release launch requires exact `v22.12.0` before executing any Node target.
- Do not add, commit, push, deploy, run production gates, read ignored environment files, or edit SDD progress.

---

### Task 1: Bounded identity pagination and response lifecycle

**Files:**
- Modify: `tunes/server/services/strapiIdentityGateway.ts`
- Modify: `tunes/server/services/strapiIdentityAbsenceProof.ts`
- Modify: `tunes/server/services/youtubeReadService.ts`
- Test: existing focused service tests under `tunes/server/services/__tests__` and `tunes/server/test`

**Interfaces:**
- Produces: all-page account resolution with explicit immutable sort, coherent `meta.pagination`, capped total/page count, exact row count, and duplicate rejection.
- Produces: byte-bounded body readers that drain successful bodies and cancel error, timeout, and oversized bodies before retry or return.

- [ ] Write hostile tests for second-page ambiguity, metadata drift, duplicate/missing rows, oversized/slow streams, and error-body cancellation.
- [ ] Run the exact focused test files and record RED failures caused by first-page binding and unclosed/unbounded bodies.
- [ ] Implement all-page validation and bounded stream consumption without broad refactoring.
- [ ] Run the same test files and record GREEN results.

### Task 2: Append-only runtime and durable token authority

**Files:**
- Create: `tunes/migrations/0014_durable_reactivation_authority.sql`
- Modify: `tunes/shared/music-migration-contract.ts`
- Modify: `tunes/server/db/music-runtime-role.ts`
- Modify: `tunes/server/repositories/musicIdentityRepository.ts`
- Modify: relevant migration/runtime-role fixtures and tests

**Interfaces:**
- Produces: `issueReactivationToken`, `claimReactivationToken`, `releaseReactivationToken`, `consumeReactivationToken`, and `revokeReactivationToken` repository operations.
- Token claim returns the immutable Strapi numeric/document/account tuple plus stable Music operation ID and an owner-bound lease.

- [ ] Write migration-contract and repository tests for hash-only storage, DB-clock expiry, restart/multi-instance claim, concurrent single-use, failure release, lease recovery, tombstone DELETE denial, and no tombstone recreation.
- [ ] Run focused migration/repository/runtime-role tests and record RED failures.
- [ ] Add migration `0014`, extend the exact migration authority, and implement repository SQL with atomic conditional updates.
- [ ] Repair runtime grants on every startup and attest exact table privileges, including explicit no-DELETE rules.
- [ ] Run focused unit, migration, and PostgreSQL tests and record GREEN results.

### Task 3: Harden reactivation service and request controls

**Files:**
- Modify: `tunes/server/services/reactivation-service.ts`
- Modify: `tunes/server/routes/reactivationRoutes.ts`
- Modify: `tunes/server/app.ts`
- Modify: `tunes/server/services/__tests__/reactivation-music-lifecycle.test.ts`
- Modify: `tunes/server/routes/__tests__/reactivationRoutes.test.ts`
- Add or modify focused logger/transport tests

**Interfaces:**
- Consumes: durable token repository operations from Task 2.
- Produces: fixed-origin, manual-redirect, timeout- and size-bounded Strapi request/confirm transport.
- Produces: per-email inbox cap, canonical socket-address cap, and a bounded high-ceiling global abuse backstop.

- [ ] Write tests proving restart persistence, replica concurrency, retry after Music/Strapi partial failure, redirect rejection, slow/oversized response handling, and log sanitization.
- [ ] Run focused tests and record RED failures.
- [ ] Replace the in-memory map with hashed durable repository calls and lease release/consume transitions.
- [ ] Remove sensitive logs, sanitize the application request URL, and layer email/address/global limits.
- [ ] Run focused tests and record GREEN results.

### Task 4: Exact Windows Node authority

**Files:**
- Modify: `tunes/scripts/music-release-launcher.ps1`
- Modify: `tunes/server/test/deployment/music-release-native-launcher.test.ts`

**Interfaces:**
- Produces: a native pre-target check that accepts only exit code zero plus exact stdout `v22.12.0` from the already fixed and Authenticode-verified executable.

- [ ] Add a behavioral Windows launcher test that substitutes a controlled executable authority and distinguishes exact, wrong, malformed, and failing versions without reaching the target.
- [ ] Run it and record the RED result.
- [ ] Add the exact version check before any Node target execution.
- [ ] Run the focused launcher suite and record GREEN.

### Task 5: Verification

**Files:**
- Modify only tests or implementation above if verification exposes an owned regression.

**Interfaces:**
- Consumes: Tasks 1 through 4.
- Produces: focused service, route, migration, PostgreSQL, type-check, and launcher evidence.

- [ ] Run focused Vitest suites for gateway, absence proof, YouTube, reactivation, migration contract, runtime role, and launcher.
- [ ] Run the authorized PostgreSQL migration/runtime tests when `DATABASE_URL_TEST` is provided by the test harness; never inspect ignored environment files.
- [ ] Run TypeScript checking/build in the smallest project scope that covers changed files.
- [ ] Review the diff for sensitive values, raw-body logs, migration rewrites, unrelated edits, and missing cleanup.
- [ ] Report exact RED/GREEN commands, results, and changed files without adding or committing.
