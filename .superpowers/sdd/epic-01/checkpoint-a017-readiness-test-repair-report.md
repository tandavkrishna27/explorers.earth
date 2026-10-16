# a017 readiness test repair

## Cause and scope

The exact a017 API-image run failed its backend test step because the current-image readiness fixture still asserted schema 0036, while the reviewed production contract required 0037. Its test title also described 0021. The subsequent scanner validation was downstream of the failed image build; this repair does not change scanning or any gate.

Only `tunes/server/test/deployment/music-readiness.test.ts` and this report are owned by this repair. Production, workflow, migration, and mutable Movies Package B source remain outside scope. The later floor-38 coordination is a separate task after the writer's final freeze.

## Repair

The test explicitly binds `CURRENT_MIGRATION_MARKER` to `0037_explorers_movies_provider_context`, uses that authoritative marker in the candidate, and derives the attestation checksum from the committed migration SQL bytes. The exact a017 SQL SHA-256 is `b983ca663d350f567366d69590055c3c1d0fa9787273d653d461ef981f0a2ce2`.

The existing older-marker and wrong-checksum negatives remain. Additional assertions reject historical 0036, missing journal state, and a current journal whose readiness state is false. The title now names approved 0037. No readiness behavior or assertion was weakened.

## Retained evidence

The clean source archive is `C:/Users/TK/AppData/Local/Temp/a017-readiness-4ffa71ae4a0f49c4848f08be27df337e/source`, based on exact commit `a0174b943ea10cf1a5798bb1fe6515c480e4a25e`. The parent directory retains:

- `red-readiness-result.json`: original exact-source readiness test, 1 failed / 6 passed / 0 skipped. The failure reproduces the stale 0036 versus authoritative 0037 binding.
- `focused-final-result.json`: final test source, 3 files / 23 passed / 0 failed / 0 skipped, through the actual `npm test --prefix <archive>/tunes -- server/test/deployment/music-readiness.test.ts server/test/deployment/music-deployment.test.ts server/test/deployment/music-health-routes.test.ts --reporter json --outputFile <receipt>` command.
- `full-backend-incomplete.json`: the optional full `npm test` expansion was bounded after more than twelve minutes in Windows Git Bash deployment executable subprocess tests, with no final JSON receipt. New subprocesses continued to appear; a deadlock was not established. The exact verified task-owned npm process tree was stopped. Its transient two termination warnings referred to subprocesses which were absent on subsequent inspection. This run is incomplete, not a passing full-backend claim. A whitespace-only title correction was copied during that optional expansion; the final scoped receipt above independently covers the exact final source.

Final readiness-test SHA-256: `21de1b1603320d8797a48bb2765a736eee6f53ca2cf7aa613f4b54b7a6f6b821`. `git diff --check` passed.

The archive uses private Git metadata created by a shared-object clone followed by the exact git archive and private-index reset. Inherited `GIT_DIR` and `GIT_WORK_TREE` were removed. The integration checkout's local `core.worktree` remains unset before and after testing. Archive changes contain only the owned readiness test.

Root, Tunes, and auth-runtime dependency locks were byte-checked against the previously freshly installed owned floor-37 closure at `C:/Users/TK/AppData/Local/Temp/floor37-final-closure-c27f8942414f43a8bc876747b05b4ec7`; archive dependency junctions reuse those owned installations. No primary-checkout dependency installation, mutable Package B overlay, or competing PostgreSQL fixture was used.

## Qualification boundary

The diagnosed readiness failure is reproduced and the scoped repair is locally qualified. The prior hosted run's 19 skips are not reclassified as locally executed. Full backend, exact repaired API image build, scanner, and hosted qualification remain unproven by this report. No push, merge, or deployment is performed here; independent review precedes the controller's explicit push decision.
