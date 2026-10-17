# Music UAT Harness Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR/nightly PostgreSQL qualification deterministic and safely recover fixture volumes after credential retirement without weakening the production runtime-role invariant.

**Architecture:** PostgreSQL qualification tasks run against one lane-owned PostgreSQL 15 container whose identity, labels, loopback port, image, commit, and lifecycle are attested by the existing C10 authority code. The five-service fixture remains separate for browser and smoke work. Retired fixture credentials never get regenerated over a retained database volume; the CLI instead exposes an explicit, confirmed reset path that can authenticate the labeled resource without recovering retired secrets.

**Tech Stack:** TypeScript, Node.js 22, Docker Engine, PostgreSQL 15, Vitest 4, existing Music CLI and qualification runner.

**Spec:** `docs/testing/music-identity-testing.md` and the root-cause evidence in `.artifacts/music-runs/20260824030459942-07d49100`.

## Global Constraints

- Keep `safeMusicRuntimeIncomingMemberships` and the exact-one-member production security invariant unchanged.
- Bind every disposable database port to `127.0.0.1` only.
- Never place database passwords in command arguments, logs, reports, container labels, or committed files.
- Mutate or remove only containers and volumes proven by exact labels, immutable container ID, source commit, and local Docker endpoint.
- Preserve `music:down` credential retirement and volume-retention behavior.
- Keep Windows and Linux qualification behavior equivalent; macOS remains unsupported where existing contracts say so.
- A failed qualification attempt must clean only the lane-owned standalone container and must retain sanitized evidence.

---

### Task 1: Lane-owned standalone PostgreSQL lifecycle

**Files:**
- Modify: `tunes/scripts/music-qualification-postgres.ts`
- Test: `tunes/server/test/contracts/music-qualification-lanes.test.ts`

**Interfaces:**
- Produces: `startC10StandalonePostgres(input): Promise<OwnedC10StandalonePostgresAuthority>`.
- Produces: `stopC10StandalonePostgres(authority): Promise<void>`.
- `OwnedC10StandalonePostgresAuthority` extends the existing authority with `imageId`, `contextHost`, `containerName`, and `owned: true`; secret paths remain input-only and never enter returned/reportable authority.

- [ ] **Step 1: Write failing contract tests for safe creation.** Add injected Docker-command tests proving creation uses `postgres:15-alpine`, the existing three ownership labels, `127.0.0.1::<port>:5432`, `POSTGRES_USER=music_migrator`, `POSTGRES_DB=music_fixture`, and a read-only bind-mounted `POSTGRES_PASSWORD_FILE`; assert the password is absent from every argument and label.
- [ ] **Step 2: Run the focused test and verify RED.** Run `npm test --prefix tunes -- server/test/contracts/music-qualification-lanes.test.ts --run`. Expected: missing lifecycle exports/assertions fail.
- [ ] **Step 3: Write failing tests for collision and cleanup boundaries.** Prove an existing same-name container is refused, an unlabeled/mismatched container is never removed, failed health readiness removes only the newly created exact ID, and normal stop re-attests ID/labels/local endpoint before `docker rm --force`.
- [ ] **Step 4: Run the focused test and verify the new cases fail for the missing behavior.** Use the command from Step 2.
- [ ] **Step 5: Implement the lifecycle with injected command/readiness adapters.** Reuse `validateC10StandalonePostgresInspect`, choose an available port from the existing disposable range excluding `55432`, bind the already-protected fixture migrator secret read-only as `POSTGRES_PASSWORD_FILE`, wait on Docker health with a deadline, and attest the immutable result without returning or reporting the host secret path.
- [ ] **Step 6: Run the focused contract test and verify GREEN.** Use the command from Step 2 and require exit 0.

### Task 2: Qualification lane acquisition and guaranteed release

**Files:**
- Modify: `tunes/scripts/music-cli.ts`
- Modify: `tunes/scripts/music-qualification.ts`
- Test: `tunes/server/test/contracts/music-qualification-lanes.test.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle functions.
- Produces: a lane-scoped authority used by every task for which `qualificationTaskUsesStandalonePostgres(id)` is true.

- [ ] **Step 1: Write a failing lane orchestration test.** Inject a fake lifecycle and executor; assert PR starts one standalone cluster before `postgres-integration`, reuses it for both repository-coverage tasks, does not expose its environment to other tasks, and stops it once after the final dependent task.
- [ ] **Step 2: Add failing error-path tests.** Assert acquisition failure prevents destructive tasks, a task failure still triggers exact cleanup, cleanup failure makes the lane/report red, and an explicitly attested caller-supplied standalone authority is reused but not removed by the CLI.
- [ ] **Step 3: Run the focused test and verify RED.** Run `npm test --prefix tunes -- server/test/contracts/music-qualification-lanes.test.ts --run`.
- [ ] **Step 4: Implement lane-scoped acquisition.** Acquire before the first standalone task, inject the four existing `MUSIC_C10_STANDALONE_POSTGRES_*` values only into allowlisted child environments, rewrite `DATABASE_URL_TEST` to its port, and release in a `finally` path after the last dependent stage.
- [ ] **Step 5: Record sanitized authority evidence.** Include port, hashed container ID, image ID, commit, acquisition status, and cleanup status; exclude names derived from secrets and all credential values/paths.
- [ ] **Step 6: Run the focused test and verify GREEN.** Use the command from Step 3.

### Task 3: Integration-test cleanup hardening

**Files:**
- Modify: `tunes/server/test/music-runtime-role.integration.test.ts`
- Test: `tunes/server/test/music-runtime-role.integration.test.ts`

**Interfaces:**
- Produces: every temporary cluster-global role is PID-qualified and owned by a `try/finally` beginning before its first mutation.

- [ ] **Step 1: Add a failing regression case for setup-time failure.** Force `provisionMusicRuntimeLogin` to reject after the unexpected owner role/table ownership mutation and assert cleanup restores ownership and drops the PID-qualified role.
- [ ] **Step 2: Run only the regression and verify RED.** Run the integration suite against the lane-owned PostgreSQL authority with `--maxWorkers=1 --fileParallelism=false`; expected failure is the surviving role or ownership.
- [ ] **Step 3: Move all setup mutations inside `try/finally`.** Replace fixed `music_unexpected_owner` with `music_unexpected_owner_${process.pid}`, make cleanup idempotent in dependency order, and retain cleanup errors rather than swallowing the original test failure.
- [ ] **Step 4: Audit every `CREATE ROLE`, membership grant, and ownership mutation in this file.** Ensure each has a matching cleanup reachable when the next statement throws; do not change production role validation.
- [ ] **Step 5: Run the runtime-role integration file twice against the same lane-owned cluster.** Both runs must pass, and a catalog query afterward must show no roles matching the test prefixes.

### Task 4: Retired-credential retained-volume recovery

**Files:**
- Modify: `tunes/scripts/music-cli.ts`
- Test: `tunes/server/test/contracts/music-cli-contract.test.ts`
- Modify: `docs/testing/music-identity-testing.md`

**Interfaces:**
- Produces: a read-only classification of `retired credentials + exact labeled retained volume`.
- Produces: `db:reset` recovery that validates the compile-time fixture target and exact confirmations without reconstructing retired credentials.

- [ ] **Step 1: Write failing CLI contract tests.** Model a zero-byte retired authority with an exact labeled retained volume; assert `bootstrap` refuses before secret rotation and returns the exact confirmed `music:db:reset` recovery command.
- [ ] **Step 2: Add a failing reset test.** Assert the confirmed fixture-only reset accepts the retired state, uses the fixed `127.0.0.1:55432/music_fixture` target plus inspected labels, removes only the exact Compose volume, and never reads or regenerates a retired password.
- [ ] **Step 3: Add hostile-resource tests.** Refuse absent labels, a different Compose project/database/host, extra production-like resources, incomplete confirmation, and replacement of a resource between inspect and delete.
- [ ] **Step 4: Run the CLI contract file and verify RED.** Run `npm test --prefix tunes -- server/test/contracts/music-cli-contract.test.ts --run`.
- [ ] **Step 5: Implement the fail-closed bootstrap preflight and retired reset path.** Keep ordinary `music:down` unchanged; bootstrap proceeds normally only with no retained volume or supported live authority. Reset must re-inspect immediately before deletion.
- [ ] **Step 6: Update command/testing documentation.** Document restart after ordinary down, the explicit retained-volume/retired-credential refusal, and the exact confirmed reset-then-bootstrap sequence.
- [ ] **Step 7: Run the focused CLI contract and documentation contract.** Run the Step 4 command plus `npm test --prefix tunes -- server/test/contracts/music-documentation-contract.test.ts --run`; require exit 0.

### Task 5: End-to-end verification and UAT evidence

**Files:**
- No production-file changes unless a failing test identifies a new root cause.
- Evidence: `.artifacts/music-runs/<runId>/` generated by supported commands.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: fresh qualification reports demonstrating isolated PostgreSQL, clean retry behavior, and fixture recovery.

- [ ] **Step 1: Run static safeguards.** Run `npm run music:types:scoped`, `npm run music:types:baseline`, and `git diff --check`.
- [ ] **Step 2: Run focused contracts and fast lane.** Run the three focused contract files, the runtime-role integration regression, and `npm run music:test:fast`.
- [ ] **Step 3: Prove clean PostgreSQL qualification.** From no C10 container, run `npm run music:test:pr`; require the standalone container to be created, all PostgreSQL tasks to use its non-55432 port, and cleanup to remove it.
- [ ] **Step 4: Prove retry cleanliness.** Run `npm run music:test:pr` a second time; require no `already exists`, `does not exist`, reverse-membership, or password-authentication failures.
- [ ] **Step 5: Prove fixture recovery.** Run bootstrap/up/down, verify bootstrap refuses over the retained volume after credential retirement, run the exact confirmed reset, then bootstrap/up/smoke/down successfully.
- [ ] **Step 6: Inspect evidence and repository state.** Confirm reports contain no secret values, no owned containers remain, unrelated Docker resources are untouched, and `git status` contains only planned source/document changes.

## Engineering Review

The minimal safe repair is lane-owned PostgreSQL plus explicit retained-volume recovery. Reusing the five-service database would require weakening the exact-one-member invariant or rotating a shared login while services are running; both create security and test-coupling regressions. Automatically deleting retained volumes during bootstrap would violate the existing destructive-action contract. The proposed design reuses the current C10 attestation, qualification allowlist, process runner, Compose-label checks, and confirmation model; it introduces no new service or external dependency.

Primary risks are orphaned containers after interruption and time-of-check/time-of-use resource swaps. The plan addresses both through immutable container IDs, re-attestation before cleanup, tracked child termination, health deadlines, and failure evidence. The implementation should remain within seven modified source/test/document files plus this plan; if it expands into a second Docker orchestration framework, stop and refactor onto the existing process runner.

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Scope challenge | PASS | Keep production security invariant; isolate destructive tests instead. |
| Architecture | PASS | Reuse existing C10 attestation and lane allowlists; no parallel infrastructure stack. |
| Code quality | PASS WITH GUARDRAIL | Dependency-inject Docker execution for deterministic tests; keep cleanup ownership explicit. |
| Tests | PASS | Red/green contracts cover creation, collision, cleanup, retry, retained volume, and hostile resources. |
| Performance | PASS | One PostgreSQL container per lane, reused across serial DB tasks; bounded health wait. |

VERDICT: APPROVED FOR TEST-FIRST EXECUTION

NO UNRESOLVED DECISIONS

## Execution Update — 2026-08-24

- Tasks 1–3 are implemented and covered by qualification contracts. The first clean PR run proved lane-owned PostgreSQL creation and cleanup; its diagnostic retry exposed two 10-second integration hooks, now raised to the explicit 30-second integration budget.
- Critical coverage repairs expanded the planned test-only scope to the publication repository, identity repository, gateway, and absence-proof suites. The resulting critical run is 100% for statements, branches, functions, and lines (538 passed, 1 skipped).
- Task 4 is implemented. Real Docker UAT proved: ordinary teardown retires credentials and retains volumes; bootstrap refuses before rotation; confirmed reset re-attests and removes only the two exact labeled fixture volumes; fresh bootstrap/up/smoke/down succeeds.
- Task 5 remains the final clean-commit static, focused, fast, and repeated PR qualification pass.
