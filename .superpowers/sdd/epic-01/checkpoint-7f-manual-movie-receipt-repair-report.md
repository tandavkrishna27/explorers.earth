# Exact 7f manual Movie receipt assertion repair

The API-image PostgreSQL integration failure was a stale test namespace. Manual Movie resolution now enters `resolveMovieEntity`; the shared manual category test still counted `resolveManualEntity`. Earlier identity, normalization, concurrent replay, conflict, and distinct-identity assertions had already passed. Production is unchanged.

The Movies branch now requires exactly two **completed** `resolveMovieEntity` receipts and zero generic `resolveManualEntity` entries. Books, Games, Apps, Products, and People retain the original generic operation and exact-two assertion. No broad OR, reduced cardinality, retry, gate, workflow, schema, or production change is included.

## Evidence

Clean private-Git archive: `C:/Users/TK/AppData/Local/Temp/receipt-7f-ca12e71280034834813fa2f93ffef0ce/source`, exact source `7f6080a6f0e0e96a1b23e3e8ebb3db550216c24b`. Only the owned integration test was overlaid. Inherited Git and ambient database/Docker authority were removed. Root, Tunes, and auth-runtime locks were checked against the owned fresh floor-37 installations before dependency junction reuse; mutable Package B was excluded.

The parent archive directory retains actual Vitest JSON receipts:

- `red-pg.json`: 9 passed / 1 failed / 0 skipped. The sole failed Movies case reached line 38, expected two generic receipts and observed zero.
- `green-pg.json`: 4 files / 90 passed / 0 failed / 0 skipped: manual overrides (10), Movies (14), recommendations (25), and recommendation API (41). Actual `npm run test:integration --prefix <archive>/tunes -- <four named integration selectors> --reporter json --outputFile <receipt>` used the unchanged integration config and destructive-fixture guards.
- `fresh-green-pg.json`: fresh independently provisioned database, manual overrides 10 passed / 0 failed / 0 skipped.

Clean archive `music:types:scoped` compiler exit 0. `music:types:baseline` wrapper exit 0, 142 current / 103 resolved / underlying compiler exit 2, with no baseline change. `git diff --check` passed. Full backend/image/scanner/hosted success is not inferred from these scoped results.

## Owned resource qualification

The exact-commit C10 helper first refused because its fixed container name was already occupied by the active B writer on port 51538. Read-only inspection identified that resource; it was neither borrowed nor changed. The normal unique-run-ID UAT helper instead provisioned PostgreSQL 15 on loopback port 56549, run ID `ca12e71280034834813fa2f93ffef0ce`, unique database `music_uat_ca12e71280034834813fa2f93ffef0ce`, exact 7f commit labels, and image `sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c`.

First owned container `586bcbe619b6c27c86ee54ae75378e2e3a9d21152cc5efcb1b4739f76b158af6` hosted red and four-suite green. The temporary runner initially omitted the stop helper's required drop callback: the first invocation refused; the next attested invocation removed the container but reported the missing database-drop callback. Container absence was verified. This is retained as a harness mistake, not a clean teardown claim.

A second fresh owned container `c415692095785da1b31c5c9f2f5ae53ac08749cf30c74f1d93c87280463d92de` independently passed the final manual suite. The runner then supplied the normal administrative drop sequence: terminate only this database's sessions, drop its exact validated name, and verify absence, followed by the unchanged helper's attested exact-container removal. Guarded cleanup exit 0; subsequent exact-container inspect exit 1 confirmed absence. Protected password and authority files remain confined to the temporary evidence directory and are not committed.

Only this report and `tunes/server/test/explorers-manual-overrides.integration.test.ts` are committed. No push or deployment; independent review and controller-managed exact-commit hosted verification remain next. Floor-38 coordination remains a separate writer-freeze handoff.
