# PR 102 CI and Review Repair Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve every reproducible required-check failure and every verified Codex review finding on PR 102, then obtain a fresh Codex review and green required CI.

**Architecture:** Keep cross-service account deactivation as a recoverable saga: Music suspension happens before Explorer blocking, and a new authenticated, bodyless, idempotent Music reactivation endpoint compensates an unconfirmed Explorer block. Preserve publication privacy at the share-URL boundary, make playback selection atomic in one owner-locked SQL statement, and align public polling demand with containment budgets.

**Tech Stack:** React, TypeScript, Vitest, Playwright, Express, PostgreSQL, Docker Compose, GitHub Actions.

---

### Task 1: Restore a recoverable account-deactivation saga

**Files:**
- Modify: `tunes/server/services/musicLifecycleService.ts`
- Modify: `tunes/server/routes/musicIdentityRoutes.ts`
- Modify: `tunes/server/test/music-lifecycle-service.test.ts`
- Modify: `tunes/server/test/music-identity-route.test.ts`
- Modify: `explorers-earth/src/services/accountLifecycleService.ts`
- Modify: `explorers-earth/src/services/__tests__/accountLifecycleService.test.ts`
- Modify: `explorers-earth/src/features/Settings/accountDeactivationCoordinator.ts`
- Modify: `explorers-earth/src/features/Settings/accountDeactivationCoordinator.test.ts`
- Modify: `explorers-earth/src/features/Settings/Settings.tsx`
- Modify: `explorers-earth/e2e/account-lifecycle.spec.ts`

1. Add failing server service and route tests for an authenticated, bodyless `resume` operation that reactivates the exact bound suspended identity and is idempotent for absent/already-active identities.
2. Run the focused server tests and confirm they fail because `resume` is unavailable.
3. Implement the minimal lifecycle-service and route support, preserving strict bearer, binding, rate-limit, and error-envelope behavior.
4. Add failing client service tests for parsing the exact reactivation response.
5. Implement `accountLifecycle.resume()`.
6. Replace coordinator tests with the desired saga: suspend first; block second; on unconfirmed block, resume Music; surface the original error after successful compensation and a typed compensation error after failed compensation.
7. Run coordinator tests and confirm the new cases fail against the current block-first implementation.
8. Implement the minimal coordinator and wire `resumeMusic` from Settings.
9. Update Playwright expectations and mocks to prove normal convergence, no Explorer mutation on suspend/pending-deletion failure, and Music compensation after unconfirmed Explorer blocking.
10. Run focused unit and Playwright lifecycle tests.

### Task 2: Make playback target selection atomic

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`
- Modify: `tunes/server/test/music-domain-repository.integration.test.ts`

1. Add an integration regression test that starts one valid playing song, attempts to play a missing or foreign song, and asserts the original song remains playing.
2. Run the test and confirm it fails because the current data-modifying CTE marks the previous song played before discovering the missing target.
3. Gate the previous-song update on a locked target CTE and activate only that validated target in the same statement.
4. Run the focused repository integration tests.

### Task 3: Prevent private and unlisted Music link leakage

**Files:**
- Modify: `explorers-earth/src/pages/Home.tsx`
- Create or modify: `explorers-earth/src/pages/__tests__/Home.test.tsx`

1. Add focused tests proving a bare Music share URL is produced only for `publication.mode === "public"`; private and unlisted modes must not expose a bare slug URL.
2. Run the tests and confirm the current slug-only condition fails the privacy cases.
3. Gate the Music share URL on public publication mode while preserving other category URLs.
4. Run the focused page tests.

### Task 4: Align public playlist polling with limiter capacity

**Files:**
- Modify: `tunes/client/src/pages/playlist-page.tsx`
- Create or modify: `tunes/client/src/pages/playlist-page.test.tsx`
- Modify: `tunes/server/test/music-security-containment.test.ts`

1. Add a contract test for a bounded fallback polling interval compatible with the existing WebSocket update path and limiter budgets.
2. Confirm the test fails at the current one-second interval.
3. Increase fallback polling to 15 seconds; keep WebSocket-driven invalidation for immediate updates.
4. Add limiter-capacity assertions showing the configured interval supports realistic concurrent viewers behind one address and globally without weakening hostile-source isolation.
5. Run focused client and containment tests.

### Task 5: Remove the Ubuntu contract timeout flake

**Files:**
- Modify: `tunes/server/test/contracts/music-credential-config-contract.test.ts`

1. Re-run the focused contract repeatedly and record duration; compare with the Ubuntu failure (5.18 seconds against Vitest's 5-second default).
2. Set an explicit 15-second timeout only on the Docker Compose rendering contract, which is an external-process contract rather than an in-memory unit test.
3. Re-run the focused contract repeatedly.

### Task 6: Verify, review, publish, and monitor

1. Run formatting/type checks and all focused suites changed above.
2. Run the repository's required-check-equivalent suites, including Music C0 contracts and Playwright lifecycle qualification.
3. Review `git diff --check`, the complete final diff, and the independent reviewer report; fix any verified must-fix findings through another red-green cycle.
4. Commit and push only this PR work.
5. Reply to each Codex inline comment with the root cause, fix, and verification evidence.
6. Comment `@codex review` on PR 102.
7. Watch required GitHub Actions checks to terminal state; investigate and repair any new deterministic failure, then repeat verification/push/watch until required CI is green.
