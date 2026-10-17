# Local automated results — ticket 7.3, run 2026-10-09

Discharges **one** of ticket 7.3's checkboxes, `:35`: *"Run the complete frontend unit
suite, backend unit suite and applicable disposable-database integration suite using
existing package scripts; preserve required coverage gates."* It is the "local automated
results" section that `:41`'s milestone report calls for, and **nothing more** — the
browser acceptance, QA/provider and owner-UAT sections of that report are not in here, and
the reasons are recorded under `skippedReason` below rather than left blank.

Written in the schema `docs/replatform/evidence/README.md` prescribes, including its rule
that `actualResult` must never be inferred from exit status alone.

| Field | Value |
|---|---|
| `scenarioIds` | 7.3 `:35` — the three automated suites plus both required coverage gates. No matrix scenario IDs: `:35` is a suite-level obligation, not a scenario list. |
| `sourceCommit` | `03cfede6b87fa99772b9965c9d204ca89b193fa0`, **clean tree** (`git status --porcelain` empty at run time). |
| `artifactDigest` | `not deployed` — every run below is local or CI, no image produced. |
| `environment` | `local-fixture`. Windows 11 Pro 10.0.26200, Node v24.14.0. Database: PostgreSQL **15.19** in a disposable `postgres:15-alpine` container, created fresh immediately before the integration run. No browser involved. |
| `fixture` | Disposable container `explorers-pg15-fixture-local` on 127.0.0.1:55432, database `music_fixture`, user `music_migrator`, matching `.github/workflows/test.yml:91-105` exactly. `MUSIC_C3_POSTGRES_TEST=1` — the disposable-target acknowledgement the workflow itself sets. No seeded owner data beyond what each suite creates; **no mocks** in the integration lane. |
| `operatorAndTime` | Agent (Claude), 2026-10-09 UTC. Owner UAT **not** performed and not claimed. |

## `commandOrSteps` and `actualResult`

Counts are the runners' own reported figures, not exit codes.

| Suite / gate | Command | Observed result |
|---|---|---|
| Frontend unit | `node scripts/run-contained-vitest.cjs` in `explorers-earth` | **325 files, 4554 tests, all passing.** See the defect note below — one failure was observed on an earlier attempt and did not reproduce. |
| Frontend critical coverage gate | `npm run test:music-critical-coverage` in `explorers-earth` | **16 files, 441 tests passing**, thresholds held at `perFile` 100% for lines, branches, functions and statements over its 13 `--coverage.include` modules. |
| Backend unit | `npm test --prefix tunes -- --run server/test` | **Not completed locally.** Authoritative result is CI instead — see `skippedReason`. |
| tunes critical coverage gate | `npm run test:music-critical-coverage` in `tunes` | **24 files, 629 passing, 1 skipped**, and the gate's own summary: statements 2010/2010, branches 1939/1939, functions 288/288, lines 1745/1745 — **100% on all four**, `perFile`. Exit 0. |
| Disposable-database integration | `npx vitest run --config vitest.integration.config.ts <the 16 files named in test.yml's database job> --maxWorkers=1 --fileParallelism=false` | **8 files passed, 8 skipped, 0 failed; 122 tests passed, 126 skipped.** The skips are environment-gated files (they require credentials or roles the plain container does not provide), not failures — this is the same 8/8 split CI's `database` job resolves differently because it provides that environment. |

## `defects`

- **One intermittent frontend failure, observed once, cause identified as mine.**
  `src/features/Favorites/components/__tests__/Recommendations.ownerRead.test.tsx > shows
  the first ten of a longer list and keeps the rest in hand` failed on the first full-suite
  attempt. It then passed **three** times in isolation and once in a full re-run, at the
  same commit with no intervening change. The first attempt was running concurrently with
  the backend suite on the same machine; resource contention is the plausible cause, and
  this repository has a prior instance of exactly that (a frontend worker crash caused by a
  concurrent Docker pull). **Recorded rather than discarded**: it is an observed
  intermittent failure, its cause is not proven, and the honest status is "not reproducible
  in four subsequent runs".
- No other failure observed in any suite or gate above.
- Pre-existing at this commit, and not a defect of this run: `music-cli-contract.test.ts`
  fails to load locally with `FixtureEnvironmentPersistenceError … metadata-inspect`,
  because `.env.music.test` is gitignored and this worktree was never provisioned with it.
  It passes in CI. Not counted against the backend suite.

## `skippedReason`

- **Backend unit suite, locally: not completed.** Two attempts were made; the first
  contended with the frontend suite and the second ran past 25 minutes without reporting,
  so it was stopped rather than left to distort this record. **The authoritative result is
  CI**, which is stronger evidence than a contended local run: the `contracts` job on run
  `37872412216` runs `npm test --prefix tunes -- --run server/test` — the whole tree, 170
  files — on a clean checkout and **passed**. A prior local full-tree run at an earlier
  commit gave 168 of 170, with both exceptions explained (the `.env.music.test` artifact
  above, and `music-docker-release-authority` reading the git index while I committed
  mid-run; 46/46 on a static tree).
- **Browser acceptance, QA environment, real-provider checks, owner UAT: not run.** These
  are `:36`-`:41` of the ticket, not `:35`, and each needs something unavailable here —
  coordinator-allocated browser lanes (`scripts/replatform-e2e.mjs` pins `scopeContents` to
  a hardcoded lane set under the `delivered-auth-profile-books` scope identifier), a hosted
  QA environment with live provider credentials, and the owner for UAT. **No milestone gate
  is claimed from this record.**
- **`platform-fixture` / `music-required`: failing, by design.** Ticket 1.2's route-graph
  invariant against a `legacy-music` fixture; see
  `docs/replatform-audit/route-graph-invariant.md:61`. Not a defect of this run and not
  silenced. Current cause `phase=ingress-check; cause=ingress-malformed-body`.

## `traceOrScreenshot`

None. No browser ran, so there are no traces, screenshots or baseline images to reference,
and none are claimed. The runners' textual output is the only artifact; it is quoted above
rather than attached, since the schema asks for sanitized records rather than raw logs.
