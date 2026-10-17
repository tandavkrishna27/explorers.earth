# Task 3.1 owner shared-contract build correction

Base: db33460841e38e6aebe0bb83ba3669d558d7a1ea. This slice corrects clean frontend and fixture image builds only; it does not implement read bounds, combined snapshots, top-pick writes, or UI changes.

## Cause and change

The owner contract imports executable validators from `zod/v3` while living under sibling `tunes/shared`. Hosted frontend installation installs only the frontend package. Local sibling dependencies masked the missing resolution. The frontend already declares Zod, its TypeScript configuration maps this compatibility export, and Vitest resolves it through the frontend package. Vite now uses the same exact alias, resolved with `createRequire(import.meta.url)`, so Rolldown bundles the frontend's declared validator dependency. No browser externalization, ancestor dependency, package manifest, or lockfile change is needed. Other shared-contract imports use this same export and benefit from the exact alias.

The fixture Dockerfile omitted the newly imported owner contract. Its COPY list and the generator's exact fixed-file allowlist now include only that checked-in contract. Both generated Docker ignore manifests were regenerated. Context tests require it and include fake OAuth environment-file sentinels to prove default denial still holds.

## Tests first and verification

- A real Vite/Rolldown regression builds copied sibling contracts in a temporary directory without sibling dependencies, executes the emitted validator, checks defaults, and rejects forged authority fields. It failed on unresolved `zod/v3` before the alias and passes afterward. An initial test setup environment error was corrected before the meaningful red run.
- A clean tracked-file export under `C:/Users/TK/AppData/Local/Temp/owner-build-d59b4531b72941b191dbb6565d827d8d` installed only frontend dependencies with `npm ci`. The actual full production build failed resolving `zod/v3` before the fix and passed after copying the corrected Vite config. It includes TypeScript, static/landing checks, and HTTPS-only Music bundle checks. No ignored environment or OAuth files were copied.
- Actual Docker builder build failed before the missing COPY fix with TS2307 for the owner contract. The final full fixture image build passed using fake fixture endpoint/token arguments, including npm installation, frontend build, and nginx runner. Tag: `explorers-owner-build:db334608-fix`; manifest digest: `sha256:161806de7fcc7a3434b961e6542dc97ddc53c6793ad3e68eb27df4950f1d469f`.
- Runtime image has index/assets and passes `nginx -t` with fixture upstream names supplied through `--add-host`. The first standalone check lacked compose DNS names and failed for unresolved `tunes`; supplying those names passed. No ports or live services were started.
- Full contained frontend suite: 277 files, 3,939 tests passed, zero skipped. Final scoped rerun after test-only lint cleanup: two files, eight tests passed (owner collector and shared bundle). Scoped ESLint passes. A direct Vitest attempt was rejected by the containment guard; the required `npm run test:unit` runner passes.
- Scoped Tunes fixture/services/authority/qualification contracts: four files, 134 tests passed, zero skipped, with explicit exclusion of unrelated CLI scratch.
- Actual Docker/BuildKit context contracts: two tests passed, zero skipped, including exact context equality and OAuth sentinel exclusion.
- Official runtime inventory and separate authorization matrix generators ran; generated artifacts did not change. Inventory/policy/exact forbidden-authority/auth-matrix contracts: four files, 122 tests passed, zero skipped. Docker ignore generator check passes.

Build logs are under `C:/Users/TK/AppData/Local/Temp`: `task3-owner-clean-install.log`, `task3-owner-clean-red.log`, `task3-owner-clean-green.log`, `task3-owner-docker-red.log`, `task3-owner-docker-green.log`, and `task3-owner-build-frontend-full.log`.

## Limits

These local clean-install and actual image builds reproduce and correct the diagnosed hosted failure. A new hosted workflow run remains pending independent review and push. Existing browser parity debt is unchanged; no browser gate was suppressed. No API/database/schema changes were made, so no new PostgreSQL or migration checks were introduced. Unrelated dirty documentation, public artifacts, scratch directories, and ignored OAuth files are preserved. No push, merge, or deployment was performed.
