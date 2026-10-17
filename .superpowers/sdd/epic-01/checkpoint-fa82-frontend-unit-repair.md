# fa82 frontend unit fixture repair

Base: `fa82fb54d94f36b1b31fc9217c838d2f8c6d4f95`. Review pending; no commit or push by this writer.

## First causes and scope

Explorers hosted run `37159387423`, Unit Tests job `111309448988`, failed three tests (4110 passed), unlike prior 0c's passing unit job. The isolated owner bundle copied six sibling contracts but omitted the newly imported `explorersMovieMediaContract.ts`; the actual Vite build reported that unresolved import. Two navigation tests still sought Movies Apollo observations and the legacy delete flow after the component migrated to native owner reads and archive commands. The old API stub therefore yielded no Movies Apollo query and the native list error screen instead of Manage.

Only `explorers-earth/src/lib/__tests__/ownerSharedBundle.test.ts` and `explorers-earth/src/features/navigation/__tests__/categoryNavigationSurfaces.test.tsx` changed. The bundle fixture now copies the exact transitive contract. Movies navigation cases exercise the real owner hook, client read coordination, view model and components, with typed observations mocked at the native API boundary. Transport completion branding is explicitly mocked at that same boundary; its security contract remains covered by the client contract suites. Other category cases retain their existing harness and assertions.

The native empty-refresh test verifies two complete category reads, removal of previous content, no legacy MovieListsByAccount operation, and unchanged category visibility/pins. The native failed-refresh case now actually rejects the native API and verifies the visible error and unchanged navigation. Archive coverage retains explicit confirmation, observes the exact editable collection, passes that observation and command key to the native archive API, verifies navigation, no legacy DeleteMovieList and unchanged visibility/pins. No production code, workflow, assertion timeout, retry policy, security gate or product scope changed.

## Reproduction and qualification

Evidence root: `C:/Users/TK/AppData/Local/Temp/fa82-unit-repair-2d1f14f164e146599f50ee0ece751a44`.

Source came from an exact fa82 Git archive, overlaid only these two files. Initial affected-suite red: **98 passed / 3 failed / 101 total**, matching all three hosted failures (`red.json`, `red.log`). Affected green: **101 passed / 0 failed** (`green.json`, `green.log`).

The first whole-suite run reused frontend dependencies through a junction and lacked sibling dependency ownership: **4108 passed / 5 failed** (`full-unit.json`, `full-unit.log`). These were two discovery failures resolving backend zod and three junction-sensitive containment fixtures, not the repaired tests. That unsuccessful facility evidence is retained. The corrected facility installed frontend dependencies freshly with `npm ci --ignore-scripts` (745 packages), bound lock-equal root/backend dependencies from the owned final qualification facility, and preserved the exact frontend lock content (equal after CRLF normalization). No sources or test assertions were changed to bypass those facility failures.

Corrected whole unit run: **4113 passed / 0 failed / 0 skipped** (`full-unit-corrected.json`). Final exact frozen source hosted-style command `node scripts/run-contained-vitest.cjs run --coverage --reporter=json --outputFile=../../final-coverage.json` also exits **0**, **4113 passed / 0 failed / 0 skipped** (`final-coverage.json`, `final-coverage.log`). Final file lint exits 0 (three pre-existing warnings, no errors), final `tsc -b --pretty false` exits 0. Fresh locked `npm run build` exits 0, including landing checks, static generation, TypeScript, Vite and HTTPS-only Music transport bundle verification. Build-generated static files are confined to the private facility. Scoped `git diff --check` passes.

## Frozen bytes and remaining hosted status

`ownerSharedBundle.test.ts` SHA256: `f750a445a12c5c3685483b02a2fb4560c12ad7e18432e5440b74f62fa62e794e`.

`categoryNavigationSurfaces.test.tsx` SHA256: `07113874d917822afee4a42500903caed7ea1fedaabe07ee522a33ccf86440aa`.

`source-hashes.json` binds both integration and copied qualification bytes. Independent review must precede commit/push; no new hosted result is claimed. Existing fa82 legacy browser qualification remains separate: Category A10 and Publishing63 failure identities unchanged; Category B18 is a subset of prior19, for91 completed failures, while Music/account was cancelled and cannot count as complete. Backend's63 failures also remain unchanged. This finite repair does not claim all legacy failures have one established root cause or that hosted qualification/release readiness is complete.
