# Recovery callback error route repair

2026-10-02. Reviewed source13acf274b1578675fbe6e6f03c9aea18889e9454 plus the scoped overlay below. This is the separately authorized narrow repair for canonical-lifecycle-browser-blocker-report.md. The lifecycle runner remains pending and is not promoted by this repair.

## Scope and behavior

Only two production redirect literals in tunes/server/auth/recoveryCallback.ts change from the unrouted /app/recover?error=recovery_unavailable to existing /reactivate-confirm?error=recovery_unavailable. Callback state/intent checks, verified Google binding checks, temporary-session deletion, cookie clearing, proof scope/expiry and all other behavior are unchanged. The existing ReactivateConfirm component obtains real recovery/status and shows the unavailable-proof alert with Try Google recovery again. No alias, simulated callback/API response, credential fallback or UI source change was introduced.

The callback integration helper/example callbackURLs now use actual /reactivate-confirm. Both existing exact error redirect assertions require that route. One added regression creates two real Google auth_account bindings for the same suspended user, requiring exact failure redirect, no positive ordinary/proof cookie, zero persisted sessions/proofs and unchanged suspended status.

## TDD and focused validation

Portable Node24.21.0 with independent locked npm ci installs in the source13acf274 clean export C:/Users/TK/AppData/Local/Temp/lifecycle-browser-clean-6dc50d2e69d342fc8c22afdb06149549; fresh local Git metadata fetched that precise source without replacing exported source. Only scoped source/test overlays were copied there. Existing C10 helpers start/re-attest/remove owned disposable local PostgreSQL15; integration setup runs actual migrations.

- Before production edits, updated original exact assertions:2 failed,8 passed,exit1 (lifecycle-callback-red.log), received old /app/recover redirect.
- Added ambiguous-binding regression still before production edits:3 failed,8 passed,exit1 (lifecycle-callback-provider-red.log), all three failed on old exact redirect.
- After the two-literal fix, vitest run --config vitest.integration.config.ts server/test/explorers-recovery-callback.integration.test.ts server/test/explorers-recovery.integration.test.ts server/test/explorers-lifecycle.integration.test.ts:3 files34 passed,0 skipped,exit0,8.22s (lifecycle-callback-green.log). Existing cancellation, subject spoof, intent mismatch, prior proof revocation/replay, expiry and lifecycle gates remain.
- account-recovery.test.ts:1 passed,exit0 on owned attested PG15 using integration config,2.79s (lifecycle-callback-recovery-domain.log). Initial default unit-config selection excluded this database-backed file and exited1 with no test files; corrected explicitly to its existing integration config, without changing discovery.
- Scoped backend tsc --project tsconfig.music-c0.json --pretty false --incremental false:exit0 (lifecycle-callback-types.log).
- Unchanged frontend prerequisites from blocker preflight:5 files58 passed plus actual auth client6 passed; frontend tsc -b exit0. No frontend source changed in this repair.

## Actual protected-runtime browser verification

Temporary diagnostic source remains only in clean export tunes/scripts/.lifecycle-error-repro.ts, extending the exact prior real-red reproduction. Each scenario starts separate owned attested PG15, migrates/seeds through migrator, provisions separate lifecycle_runtime and composes real canonicalApp with that protected runtime pool. Browser runs actual Vite profile config, recovery/start, sign-in/social OAuth state, local callback, recovery/status, /me and rendered ReactivateConfirm. Provider simulation replaces only existing Better Auth validateAuthorizationCode/getUserInfo seam; the external Google authorization navigation redirects to the actual callback using real returned state. No auth/callback/proof/status DTO is synthesized.

Three serial cases passed exit0 (lifecycle-recovery-unavailable-green.log, lifecycle-recovery-ambiguous-provider-green.log, lifecycle-recovery-mismatched-intent-green.log): active account unavailable for recovery; suspended user with ambiguous Google bindings; real state with a replaced trusted recovery-intent cookie. All reached exact /reactivate-confirm?error=recovery_unavailable, rendered Recovery proof is expired or unavailable. Start again with Google., showed one retry control and clicking it reached /reactivate with Continue with Google. Actual DB sessions0/proofs0, /me401, recovery/status403 RECOVERY_INVALID expected no-proof guard, unsupported HTTP/socket egress0. This verifies both production redirect branches and invalid provider binding failure with real protected runtime authority.

The first post-fix browser diagnostic had a test-only incorrect recovery/status401 expectation: actual403 is the existing requireRecoveryPrincipal no-proof contract. Its real route/UI/session/proof observations already passed; the diagnostic expectation was corrected to exact403 after reading source, then the three cases ran. No production guard was relaxed. Browser containment fulfills only inert fonts.googleapis.com/css2 stylesheet with empty CSS, closes exact loopback Vite dev websocket / with token, contains exact expected Google authorization navigation, and rejects all other external HTTP/sockets. Those presentation/dev treatments carry no identity authority. No real Google/network credential, cloud/production data or secret was used.

Every run finally closes browser, Vite, canonical server and pools, removes only exact re-attested owned PG15 container and deletes generated password. Final docker ps is empty. No retries, skipped browser cases, Docker image/hosted CI acceptance or full lifecycle harness acceptance are claimed. The temporary browser diagnostic is not a committed milestone runner/spec or discovery receipt.

## Source evidence and review boundary

At execution the two-literal production overlay SHA256 was9E8D61158190962536FD01736452BDB7DB52620A2FA74EBF36A82485BE6F63F3; temporary diagnostic SHA25607ED7B6462C011EF69A5AB6F5B8140DD2A44AF4D3C0F02E916B3CCEBD0611B00. Logs and screenshot lifecycle-recovery-error.png remain in the exact clean export above for independent review. Test-only final whitespace spacing does not alter executed cases. Scoped git diff --check passes. Commit contains only production callback, its integration test and this report. No push. Stop for independent narrow-fix review; original harness writer scope resumes only after review.