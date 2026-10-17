# Music identity local qualification evidence

This template records non-authoritative QA evidence from a mutable checkout.
It cannot authorize production. Production authority is the protected `main`
GitHub Actions run, immutable image provenance, the `tunes-production`
environment policy, and independent approval.

This template records C10 qualification for independent review. It does not
authorize production access, routing changes, reconciliation apply, image
promotion, or deployment. **This template does not authorize deployment.**

## Immutable authority

| Field | Recorded value |
|---|---|
| Exact source commit | `{{commit}}` |
| Immutable image digest | `{{image_digest}}` |
| Migration marker | `{{migration_marker}}` |
| Fixture version | `{{fixture_version}}` |
| Fixture age at start | `{{fixture_age}}` |
| Exact secure rollback digest rehearsed | `{{rollback_digest}}` |
| Secure rollback floor result | `{{secure_rollback_floor}}` |

## Portable fixture readiness

Record the public C0 commands and typed exit/envelope status. Do not paste
environment values or child-process output into this document.

| Check | Result | Sanitized artifact |
|---|---|---|
| `npm run music:bootstrap` | `{{bootstrap_result}}` | `{{bootstrap_artifact}}` |
| `npm run music:doctor` | `{{doctor_result}}` | `{{doctor_artifact}}` |
| `npm run music:up -- --detach --wait` | `{{up_result}}` | `{{up_artifact}}` |
| `npm run music:test:smoke` | `{{smoke_result}}` | `{{smoke_artifact}}` |
| Guarded cleanup | `{{cleanup_result}}` | `{{cleanup_artifact}}` |

## Lane timing and failure integrity

All budgets are hard wall-clock limits. A failed task may run once more for
diagnostics; one diagnostic rerun never changes the original result.

| Measurement | Recorded value |
|---|---|
| Cold time-to-first-green | `{{cold_first_green_ms}}` ms |
| Warm time-to-first-green | `{{warm_first_green_ms}}` ms |
| Fast wall time / 180000 ms budget | `{{fast_wall_ms}}` ms |
| PR wall time / 900000 ms budget | `{{pr_wall_ms}}` ms |
| Nightly wall time / 2700000 ms budget | `{{nightly_wall_ms}}` ms |
| Release wall time / 3600000 ms budget | `{{release_wall_ms}}` ms |
| Cross-run lane p50 | `{{lane_p50_ms}}` ms |
| Cross-run lane p95 | `{{lane_p95_ms}}` ms |
| Diagnostic reruns | `{{diagnostic_reruns}}` |
| Stable original failure codes | `{{failure_codes}}` |
| Documentation-contract failures | `{{documentation_failures}}` |

Release command (Windows):
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tunes\scripts\music-release-launcher.ps1 -Mode qualification`.
Release command (protected Linux qualification host; macOS unsupported):
`/usr/bin/env -i HOME=/ PATH=/usr/bin:/bin /bin/sh tunes/scripts/music-release-launcher.sh qualification`.
The npm/tsx entrypoint is intentionally unsupported because Node startup
authority would run before the release guard. A green diagnostic rerun must be
recorded as flaky evidence while the lane remains failed.

## Correctness, authorization, and critical coverage

| Gate | Result | Evidence |
|---|---|---|
| Tunes unit and per-file 100% critical coverage | `{{tunes_coverage}}` | `{{tunes_coverage_artifact}}` |
| Explorer unit and per-file 100% critical coverage | `{{explorer_coverage}}` | `{{explorer_coverage_artifact}}` |
| Real PG15 migration/repository/concurrency/lifecycle/reconciliation/owner predicates | `{{postgres_result}}` | `{{postgres_artifact}}` |
| REST/GraphQL/socket authorization matrix | `{{security_matrix_result}}` | `{{security_matrix_artifact}}` |
| Google/email/account/sharing/lifecycle/outage browser matrix | `{{fullstack_result}}` | `{{fullstack_artifact}}` |
| Axe and keyboard at 375px/desktop | `{{accessibility_result}}` | `{{accessibility_artifact}}` |

## Performance and bounded telemetry

| Measurement | Recorded value | Budget/result |
|---|---|---|
| 50 concurrent first ensures | `{{first_ensure_50_ms}}` ms | `{{first_ensure_result}}` |
| 200 cached calls | `{{cached_p95_ms}}` ms p95 | `{{cached_result}}` |
| Ensure latency | `{{ensure_p95_ms}}` ms p95 | `{{ensure_budget_result}}` |
| Ordinary owner latency | `{{owner_p95_ms}}` ms p95 | `{{owner_budget_result}}` |
| Ordinary owner upstream identity calls | `{{owner_strapi_calls}}` | must be `0` |
| Invalid-token storm | `{{invalid_token_result}}` | `{{invalid_token_artifact}}` |
| Same-token single-flight | `{{single_flight_result}}` | `{{single_flight_artifact}}` |
| PG pool saturation | `{{pool_saturation_result}}` | `{{pool_saturation_artifact}}` |
| Socket/guest limits | `{{socket_guest_result}}` | `{{socket_guest_artifact}}` |
| Telemetry cardinality bounds | `{{telemetry_result}}` | `{{telemetry_artifact}}` |

No measurement may include workstation identity, account identity, host name,
raw request material, or arbitrary labels.

## Fault, recovery, and reversibility

| Rehearsal | Result | Typed code / recovery | Evidence |
|---|---|---|---|
| Upstream and DB outage | `{{outage_result}}` | `{{outage_recovery}}` | `{{outage_artifact}}` |
| Malformed identity/entitlement | `{{malformed_result}}` | `{{malformed_recovery}}` | `{{malformed_artifact}}` |
| Deadlock/partial transaction | `{{transaction_result}}` | `{{transaction_recovery}}` | `{{transaction_artifact}}` |
| Truncated/duplicate reconciliation | `{{reconciliation_chaos_result}}` | `{{reconciliation_chaos_recovery}}` | `{{reconciliation_chaos_artifact}}` |
| Credential rotation/stale credential | `{{rotation_result}}` | `{{rotation_recovery}}` | `{{rotation_artifact}}` |
| Browser exit and lifecycle resume | `{{browser_exit_result}}` | `{{browser_exit_recovery}}` | `{{browser_exit_artifact}}` |
| Migration/readiness failure | `{{migration_failure_result}}` | `{{migration_failure_recovery}}` | `{{migration_failure_artifact}}` |
| Exact rollback and kill switch | `{{rollback_result}}` | `{{rollback_recovery}}` | `{{rollback_artifact}}` |
| Interrupt cleanup | `{{interrupt_cleanup}}` | `{{interrupt_recovery}}` | `{{interrupt_artifact}}` |
| Resume | `{{resume_result}}` | `{{resume_recovery}}` | `{{resume_artifact}}` |
| Fixture age/drift | `{{fixture_drift}}` | `{{fixture_drift_recovery}}` | `{{fixture_drift_artifact}}` |
| Compatibility-route usage | `{{compatibility_route_usage}}` | `{{compatibility_recovery}}` | `{{compatibility_artifact}}` |

## Sanitized artifact inventory

List only artifacts emitted by the C0 harness after structured and text
redaction. Screenshots must contain fixture-only UI. Do not attach raw trace
archives unless a separate sanitizer has verified headers, storage, request
bodies, URLs, and console output.

| Artifact | SHA-256 | Sanitizer result | Reviewer note |
|---|---|---|---|
| `{{artifact_path}}` | `{{artifact_sha256}}` | `{{artifact_sanitizer_result}}` | `{{artifact_reviewer_note}}` |

## Independent review

| Review | Recorded value |
|---|---|
| Reviewer decision | `{{review_decision}}` |
| Critical findings | `{{critical_findings}}` |
| Important findings | `{{important_findings}}` |
| Minor findings | `{{minor_findings}}` |
| Review evidence reference | `{{review_evidence}}` |

Task completion is not approval. Promotion remains blocked until the protected
production workflow and environment reviewers accept the exact immutable-image
evidence; this local report is supplemental only.
