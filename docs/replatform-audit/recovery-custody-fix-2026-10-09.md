# Recovery flow custody fix — 2026-10-09

Package B2 follows the integrated-source preflight at `3e5113c0`. It changes only `ReactivateConfirm.tsx` and its existing transport test file.

Recovery observation, completion, and retained actions now check synchronous auth-generation custody. Replacement B or fresh returning A permanently expires the mounted flow. Held success/failure and unmounted responses cannot offer stale recovery actions. A synchronous submission latch prevents duplicate completion POSTs.

Recovery can legitimately start signed out. Cold entry waits for initial auth loading to settle before capturing a generation or observing recovery. Already-settled auth binds immediately. Once bound, the flow never adopts a later generation.

## Evidence and review

- Initial component regressions: 9 failed, 11 passed; subsequent ready-flow coverage increased the suite to21.
- Root inspection found a cold-entry regression in the first fix: actual `AuthSyncManager` starts verification after component layout. A new StrictMode integration case reproduced it: 1 failed,21 passed.
- Final focused component suite:22 passed,0 failed. It uses actual auth refresh/store and auth manager with mocked HTTP; includes held observation/completion success and rejection, B/fresh-A replacement, unmount, duplicate submission, ready-flow invalidation, and cold entry.
- Frontend `npx tsc -b`: passed.
- Independent reviewer approved the final two-file diff with no introduced P0/P1/P2 findings. Reviewer performed source inspection and did not run tests independently.

These are component and type-check results. They do not close ticket2.4, L19, or the canonical database/browser/hosted lifecycle requirements. No disposable database or browser fixture was allocated for this package. Local Node24.14.0 differs from the pinned24.21.0 hosted runtime; exact pushed-head CI remains required.
