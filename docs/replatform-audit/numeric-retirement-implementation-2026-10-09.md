# Canonical numeric retirement implementation — 2026-10-09

Package B1 adds append-only migration0052 after integrated0051. It records canonical Music numeric IDs against the retained account deletion operation without referencing deleted users or manufacturing Strapi identities. Historical canonical releases did not retain IDs; no reliable backfill is claimed.

Finalization takes the numeric advisory lock before the user-row lock and writes retirement atomically with deletion. Exact operation retries remain idempotent. INSERT checks both legacy tombstones and canonical retirement. A separate UPDATE trigger makes numeric user IDs immutable. Runtime permissions and attestation deny UPDATE/DELETE/TRUNCATE of the ledger. Legacy tombstone behavior remains intact.

Schema markers, image migration inventory, table/role manifests, restore trigger inventory, deployment marker history and their contracts accompany the migration. Released0051 remains in the deployment ordering; released migrations0040–0042 are unchanged.

## Evidence scope

- Static batch:10 files,131 tests passed. Additional batch:4 files,71 tests passed; the new numeric contract appears in both batches, so these counts are not unique-test totals.
- Esbuild parsed four modified integration test files and runtime-role source. Parsing is not database execution.
- Independent source reviewer approved the final diff with no remaining introduced P0/P1/P2 findings after deployment-marker and restore-inventory repairs. Reviewer ran no tests.
- Database regressions are authored for terminal ledger retention, exact/wrong retries, runtime canonical/legacy explicit reuse, sequence reset, primary-key UPDATE, immutable permissions, concurrent retirement/insertion and rollback. Runtime cases set `music_runtime` and assert non-superuser authority. Timeouts and cleanup bound concurrency tests.
- No database or browser fixture was allocated or executed locally. Full6.4 acceptance remains pending database, browser and release qualification. The prior head's hosted database pass cannot qualify0052.

**Subsequent hosted qualification:** [run37943365187](https://github.com/tandavkrishna27/explorers.earth/actions/runs/37943365187) at `1f4ce7bf` passes43 database files/659 tests, with5 files/7 tests skipped. All28 lifecycle tests pass after source-test cleanup repair. The0052 behavioral regressions now have hosted PostgreSQL execution evidence; canonical browser/hosted milestone acceptance still remains. See [CI follow-up](ci-followup-2026-10-09.md).

See [the integrated preflight](lifecycle-preflight-3e5113c0.md) for the remaining canonical browser replacement cases and the fixture runner's explicit disposable-PG acknowledgement requirement.
