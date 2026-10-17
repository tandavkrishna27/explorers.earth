# UAT evidence repair and release qualification

## Objective

Finish analytics and public Music with reproducible, truthful owner/guest UAT. Preserve the reviewed fail-closed fixture, do not touch unrelated Tune user-sync/reconciliation code, do not mutate production/real Strapi, and do not push PR #103 until all required local gates and independent reviews are green.

## Global constraints

- Work only in `profile-settings-tabs-rebase-20260828` on `codex/profile-settings-tabs-rebase-20260828`.
- Use TDD: record an expected RED before each production/harness fix, then focused and broad GREEN evidence.
- Only the guarded namespaced local fixture may write. Snapshot before the first possible write; require equal nonempty before/after hashes and zero exact-label containers/volumes plus deleted auth artifacts.
- Never persist raw tokens, bearer headers, capabilities, credentials, environment dumps, absolute workspace paths, or unbounded child output.
- Evidence enums and missing-journey IDs are allowlisted and bounded. Sanitized logs are immutable per-run artifacts.
- A baseline failure is attribution evidence only, never a waiver. Every required current-HEAD release gate must exit zero unless its checked-in gate contract explicitly classifies the lane as informational.
- No Strapi application-code changes, Redis, production deployment, `GATE_PROD`, or Tune user-sync/reconciliation implementation changes.
- One implementation agent at a time; every task receives an independent review. Maximum five fix rounds per task.

### Task 1: Repair live preflight resolution and retain bounded diagnostics

**Files:**
- Modify: `explorers-earth/scripts/music-public-e2e.mjs`
- Modify/Create: a small preflight helper under `explorers-earth/scripts/`
- Modify: `explorers-earth/scripts/music-public-e2e-runner.mjs` only if required for typed result propagation
- Modify: `explorers-earth/e2e/music-harness-contract.spec.ts`

1. RED: from Explorer cwd, execute the exact authority child with deterministic sentinel loopback authority and prove current `explorers-earth/node_modules/tsx/dist/cli.mjs` resolution fails before authority evaluation.
2. Resolve `tsx/cli` from the package that declares it using package-aware resolution. Do not hard-code an absolute workspace path or silently depend on an undeclared sibling install.
3. Extract/test a live-preflight classifier covering: success, authority process failure, authority semantic refusal, collection process failure, and each missing required journey.
4. Define a versioned live-journey manifest in code. Preflight must prove exact manifest membership/count and a null skip reason for every entry before callback; execution must emit exactly one terminal result per manifest ID. The manifest must cover every maintained owner, guest, second-guest, profile batch, and recovery mutation—not sampled title substrings.
   - Manifest version: `explorers-live-mutation-journeys/v1`; exactly 17 Playwright test cases (not 17 HTTP writes/assertions).
   - IDs: `music.owner.queue-add`, `music.owner.mobile-workspace`, `music.owner-guest.permission.allow-song-requests`, `music.owner-guest.permission.allow-guest-play-on-device`, `music.owner-guest.permission.allow-playlist-sharing`, `music.owner-guest.permission.allow-recently-played-visibility`, `music.owner-guest.permission.allow-queue-visibility`, `music.owner-guest.reconnect`, `music.guest.request-lifecycle`, `music.guest.playback-second-guest`, `music.owner.publication-playlist-sharing`, and `profile.owner.pairwise.batch-01` through `profile.owner.pairwise.batch-06`.
   - Bind every ID to one exact collected title and source file. Reject missing, duplicate, unknown, reordered/renamed-without-version-bump, or skipped entries.
   - Each terminal record uses `explorers-live-mutation-journey-result/v1` and includes manifest version, ID/title/source, `status`, null skip reason, `cleanup`, and equal nonempty canonical before/after hashes. IDs 1–11 bind the existing full-account restoration records to IDs. IDs 12–17 add canonical profile hashes plus `rowCount=12`; across them require 72 unique ordered rows and all 484 factor pairs. The runner final full-state restore is a separate `finalRestore`, not an eighteenth journey.
5. Return/persist only bounded allowlisted diagnostics: `failureStage`, `subcheck`, child status/error code/signal/byte counts/truncation, and fixed journey-presence IDs. Preserve exit 4 for preflight refusal and cleanup-driven exit 5.
6. Sanitize any retained child logs to at most 4 KiB per stream, redact known secrets plus bearer/access-token/capability/credential patterns, and normalize workspace paths. Parent console errors remain fixed strings.
7. GREEN: exact inert child reproduction, focused harness, node syntax, diff check. Do not start fixture services or live writes.
8. Commit separately and obtain independent safety/evidence review.

### Task 2: Restore Explorer critical coverage with behavioral boundary tests

**Files:**
- Modify: `explorers-earth/src/features/music/__tests__/publicMusicClient.test.ts`
- Production code changes are forbidden unless a test reveals an actual defect and a separate ruling authorizes it.

1. RED: capture the current critical coverage failure and exact V8 uncovered statements/branches for `publicMusicClient.ts`.
2. Add compact table-driven behavioral tests for: inconsistent playlist/history resource states; request HTTP status mapping; oversized/invalid-UTF8/malformed/missing bodies and observability reasons; request input and response schema guards; descriptor input/status/JSON/schema guards; signal/no-signal and default-base branches.
3. Assert public error codes, bounded retry/request IDs, safe observability, and no capability/token leakage—not line execution alone.
4. GREEN: focused client tests, exact `test:music-critical-coverage` at 100% per-file/aggregate, unit suite, lint/build/diff check.
5. Commit separately and obtain independent review.

### Task 3: Make qualification evidence reproducible before live UAT

**Files:**
- Modify: `explorers-earth/scripts/music-public-e2e.mjs` only for artifact plumbing already covered by Task 1 contracts
- Modify/Create: qualification log manifest helper/tests if needed
- Modify: `docs/uat/2026-08-28-analytics-public-music-uat.md`

1. Reconcile the chronology: explicitly separate the earlier 31-pass/17-skip attempt from the later reviewed preflight-stopped attempt. Do not call either the sole attempt.
2. Add exact commit SHA, commands, working directories, sanitized immutable stdout/stderr artifact paths, exit codes, pass/fail/skip totals, and skip-reason ledger for every lane.
3. Add exact visual/trace paths or explicitly state none retained. Add observed analytics-event ledger with safe field values and UTM/exactly-once evidence.
4. Retain exact Docker label-inspection and auth-artifact deletion output for the next guarded run.
5. Each run uses exclusive-create semantics for a new run directory. Generate a sanitized manifest containing the relative path, SHA-256, and byte count of every stdout/stderr log, analytics ledger, visual/trace, Docker inspection, skip ledger, restoration record, and evidence file. A verifier must fail on a missing, extra-required, or hash/size-mismatched artifact.
6. Mark historical claims as reported-but-not-retained where authoritative artifacts do not prove them.
7. Run an independent evidence review before live execution.

### Task 4: Execute guarded owner/guest UAT and owned database qualification

1. Run one guarded local attempt only after Tasks 1–3 reviews are clean.
2. Require exact versioned-manifest equality and null skip reasons before callback, then execute every manifest journey. Required behavior includes exhaustive pairwise profile batches and five toggles, logged-out View-as-guest, owner readiness combinations, public/private/invalid/outage transitions, playlist visibility, player/play-on-device, queue, request accept/replay/conflict/rate-limit/revocation, offline mutation/reconnect/fallback, second-guest isolation, all themes/heroes/viewports, and dashboard-to-public live changes.
   - Expected Playwright outcome is 49 passed, 0 skipped, 0 failed: 32 read-only cases plus all 17 manifested write-authorized cases.
   - Do not overclaim actor contexts: the request-lifecycle case uses unauthenticated guest HTTP, the publication case observes public routes in the owner page context, and only playback isolation has a second guest browser. Run and retain a separate logged-out browser-context `View as guest` UI journey for the two-context UAT requirement.
3. Run repository database integration only against the fixture-owned disposable PostgreSQL database with explicit ownership/allowlist checks; never reuse a real/shared database.
4. Record per-journey before/after hashes, analytics events/UTM, screenshots/traces, exact logs, and final full snapshot hash.
5. Require cleanup `restored`, exit 0, equal nonempty hashes, zero exact-label containers/volumes, and absent auth artifacts. On any failure, stop further writes and keep the sanitized artifact.
6. Require exactly 17 terminal journey records, all passed/restored with equal hashes, plus a separate equal `finalRestore`; profile totals must prove six batches, 72 ordered rows, and 484 pairs.

### Task 5: Final release gates, whole-branch review, and PR update

1. Run fresh current-HEAD Tune and Explorer static, unit, coverage, contract, database, security, load, build, i18n, five-timezone, and sanitized PR-safe browser lanes. Every required current-HEAD gate must exit zero; baseline reproduction cannot waive a red gate.
2. Attribute failures with retained `origin/main` logs for diagnosis only. A failed current-HEAD required gate blocks release even when `origin/main` reproduces it.
3. Run secret scan (install/use an approved scanner if available; otherwise record a blocking gap), final diff review, and no-user-sync overlap check.
4. Reconcile the UAT document against immutable artifacts and obtain an independent whole-branch review.
5. Produce local/pre-merge rollout qualification: old-frontend/new-backend and new-frontend/old-backend compatibility, reversed-order isolation, migration readiness and rollback, immutable image digest plus commit attestation, canary queries/thresholds/rollback conditions, `image-deploy-contract`, protected-main deployment refusal, and verified operator runbook/release-evidence handoff. Do not deploy.
6. Only when every required branch gate and UAT restoration proof is green: push `HEAD:codex/profile-settings-tabs`, update PR #103, request `@codex review`, and watch all required CI. Do not merge or deploy production from this task.
