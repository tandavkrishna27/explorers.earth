# Image CI disk remediation implementation

Implemented in the isolated replatform-audit checkout on 2026-10-02, following `.superpowers/sdd/epic-01/image-ci-disk-remediation-plan.md` and hosted failure [36895420700](https://github.com/tandavkrishna27/explorers.earth/actions/runs/36895420700). The observed failure exhausted Docker export storage, cataloged zero packages, and retained a zero-byte SARIF; it did not establish a vulnerability result.

## Scoped changes

- `.github/workflows/tunes.yml`: reclaim SDK storage before dependencies/build; disk receipts before build and scans; compare loaded tag ID to build action's `imageid` and revision to source SHA before/after scanning; guard scan temp reserve and validated report upload/release archive transfer. Both original pinned scanner actions, strict fixable-high gate, all-findings scan, build count, triggers and downstream release/deployment jobs remain intact.
- `scripts/image-ci-disk.sh`: require GitHub-hosted Linux; validate the two literal SDK paths (`/usr/local/lib/android/sdk`, `/usr/share/dotnet`) with `realpath -e` before any deletion, then recheck each before `sudo rm -rf --`. Missing installations are receipts, not alternative deletion searches. Record byte metrics and reclaimed root bytes. No Docker/cache/builder/workspace/toolcache cleanup.
- `scripts/image-ci-report.cjs`: nonempty parseable SARIF 2.1.0, nonempty Grype runs with results arrays, and positive successfully gathered package evidence from the complete scan's INFO log. Zero vulnerabilities are allowed; zero catalog packages are rejected.
- `scripts/image-ci-disk.test.cjs`: isolated fake-command Bash harness plus actual YAML structure and shell syntax validation. Also executed by the image workflow after Tunes dependencies are installed.
- `tunes/server/test/deployment/music-deploy-workflow-security.test.ts`: existing contract strengthened for complete-scan reserve, actual scan outcome, report validation and qualified artifact/release guards; strict vulnerability flags remain required.

Scanner `TMPDIR` is explicitly `runner.temp`; `df` checks that same filesystem. Reserve is **provisional**, `max(8 GiB, 3 * imageSize + 4 GiB)`, not an established measured peak. No cleanup was executed on the workstation. All local shell execution of production cleanup used fake functions for OS, filesystem observations, Docker, SDK observations and sudo deletion.

## Catalog proof

Pinned scan action's default Grype is [v0.110.0](https://github.com/anchore/scan-action/blob/e1165082ffb1fe366ebaf02d8526e7c4989ea9d2/GrypeVersion.js). Its [catalog completion code](https://github.com/anchore/grype/blob/v0.110.0/cmd/grype/cli/commands/root.go) emits `gathered packages` with a `packages` count. The [configuration](https://oss.anchore.com/docs/reference/grype/configuration/) supports `GRYPE_LOG_FILE`; pinned [Clio logging](https://github.com/anchore/clio/blob/a0fa658e5084/logging.go) and [logger implementation](https://github.com/anchore/go-logger/blob/07ae343dd722/adapter/logrus/logger.go) retain text logs to both stderr and the named file. This preserves action logs and supplies catalog evidence without another image export/tool/scan. Complete scan's actual action outcome must also be success; tolerant step conclusions cannot hide catalog/infrastructure errors.

## Local verification

- Test first: observed expected failures for missing production script/report validator before implementation.
- `node --test scripts/image-ci-disk.test.cjs`: 6/6 passing; includes missing SDK, both symlink refusals with no deletion, self-hosted/non-Linux refusals, only exact SDK deletions, reserve boundary and malformed measurement rejection, immutable ID/revision rejection, invalid report/catalog rejection and valid zero-finding report.
- Git Bash `bash -n scripts/image-ci-disk.sh`: passing. Actual workflow Bash snippets are also syntax-checked by the contract test.
- Actual YAML contract proves trigger equality and unchanged downstream release-preflight/publish/deploy jobs against HEAD, one build, pinned strict flags, same scan temp filesystem and qualified upload/transfer conditions.
- Initial targeted existing deployment/migration/reconciliation contract run: 146 passing, 4 failing across 10 discovered files. The stale top-level security contract expected unconditional disclosure/upload and single-file artifact path; it is now strengthened to require reserve/report validation and catalog-log retention. Three unrelated initial failures came from a pre-existing nested `.music-cli-contract-isolated-lD7DRB/repository` native-launcher suite whose copied checkout lacks `node_modules/tsx/dist/cli.mjs`.
- Final exact current-source run: `npx vitest run server/test/deployment/music-deployment-files.test.ts server/test/deployment/music-deploy-workflow-security.test.ts server/test/deployment/music-release-native-launcher.test.ts server/test/contracts/music-reconciliation-workflow.test.ts server/test/migrations/music-migration-contract.test.ts --maxWorkers=2 --exclude '**/.music-cli-contract-isolated-*/**'`: **5 files, 75/75 passing**. The CLI-only exclusion omits only that pre-existing copied scratch repository, without skipping real current-source assertions. No test-discovery/config exclusions or copied checkout files changed.
- Full global/PostgreSQL suites were not run while the joint collector agent owns active shared testing.

## Remaining qualification

Hosted qualification is pending. Local mocked checks do not prove reclaimed runner capacity, real Grype catalog count/log formatting, actual source-image scanning success, vulnerability gate results, or peak storage headroom. Next authorized ordinary hosted validation must show receipts, built ID/revision equality, positive catalog, valid complete SARIF, strict scan result and no disk warning. No push, merge, hosted rerun, production release or deployment was performed.
