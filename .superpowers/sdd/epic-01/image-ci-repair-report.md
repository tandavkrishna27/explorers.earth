# Canonical public Books image prerequisite assertion repair

2026-10-02, source base b645aa722051000e8893e5bb987146f4f514060f plus only this report's test overlay. Scope follows reviewed `image-ci-repair-preflight.md` and `checkpoint-b645aa72-image-ci-diagnosis.md`. No producer/schema/workflow/migration/dependency change, test removal, broad subset replacement, retry/timeout/threshold change or image gate weakening. No push or hosted retry; independent review is next.

## Exact change

`tunes/server/test/explorers-public-content.integration.test.ts` retains the two failing assertions' exact allowed key/full-response equality, extending them only with the approved canonical typed Book fields: default `emptyBookDetails()`, `{buyLinks:[]}` and `{cover:null,thumbnail:null}`. Title string/null, rating, note envelope/content and all privacy/ancestor/unsafe-note/bounded-response/continuation assertions remain. Shared strict response parsing supplements those exact comparisons. The override detail case additionally asserts canonical account/entity IDs are absent from serialized public detail.

`tunes/server/test/explorers-manual-overrides.test.ts` adds the previously missing strict detail boundary regression: all six non-Book kinds reject each Book addition; Book details reject raw account/entity/displayOverride/provenance/storage keys, untyped Book facts, unsafe buy-link URL and extra copied-cover fields. It verifies the approved Book additions exactly. No new runtime behavior is proposed.

## Executed verification

Portable Node24.21.0; existing installed worktree dependencies (Vitest4.1.9), no new clean install claim. PostgreSQL runs use temporary `%TEMP%/image-preflight-b645-harness.mts`, existing start/stop C10 authority helpers, locally cached PG15, loopback51542, protected generated password mount, exact current source commit and C3/C8/C9 flags consistent with hosted Test Tunes. Password/URLs are never printed. Each run creates a fresh owned attested PG15 instance, runs unchanged integration global setup/migrations, and re-attests/removes only its exact container in finally; password file deleted. No Docker image build/scan was performed.

- **Red before repair**: exact public-content file **2 failed/9 passed (11)**,zero skips,19.00s,exit1; reproduces both hosted failures. `%TEMP%/image-preflight-b645-pg-reproduction.log`, already recorded in preflight.
- **Focused green**: `vitest run --config vitest.integration.config.ts server/test/explorers-public-content.integration.test.ts`: **11/11 passed**,zero skips,5.28s,exit0. `%TEMP%/image-repair-b645-focused.log`.
- **Nearest real PostgreSQL**: same integration command with `server/test/book-catalog.integration.test.ts server/test/book-cover-import.integration.test.ts server/test/books-public-gateway.integration.test.ts`: **3 files/24 tests passed**,zero skips,11.06s,exit0. `%TEMP%/image-repair-b645-nearest.log`. This includes protected runtime Books gateway authority, effective facts/context, copied covers/media and independent privacy revocation checks. It is distinct from the generic public-content file's migrator-seeded/app pool.
- **Strict unit boundary**: `vitest run server/test/explorers-manual-overrides.test.ts`: **4/4 passed**,zero skips,308ms,exit0. `%TEMP%/image-repair-b645-strict-unit.log`.
- **Full affected integration**: unchanged `vitest run --config vitest.integration.config.ts` under C3/C8/C9: **27 passed/10 skipped files (37);317 passed/105 skipped tests (422)**,133.06s,exit0. `%TEMP%/image-repair-b645-full-integration.log`. This matches the hosted422 total with both former failures now passing; no failure excluded. Flags/prerequisites are unchanged.
- **Scoped types**: portable Node `node_modules/typescript/bin/tsc --project tsconfig.music-c0.json --pretty false --incremental false`:exit0. `%TEMP%/image-repair-b645-types.log`. Scoped diff check:pass.

## Scope limits and required next gates

The105 skipped tests remain explicit, not accepted: domain34(C6), lifecycle22(C7), runtime-role27+credential10(C5), identity projection5(C4), load HTTP1+PG1(C10), restore3(C11), capture1(C12), identity-count adapter1(C13). Image Test Tunes intentionally sets only C3/C8/C9. Separate selected C3–C9 PostgreSQL job and other hosted passing checks have their own scope; no all-integration/all-milestone closure is inferred.

The generic failing file uses migrator seeding and that test pool to compose its app: its green count does not prove protected production runtime permissions. Dedicated nearest Books gateway above provides its own protected runtime check. No cloud/provider/OAuth/S3/production/media-host deployment is qualified here.

After independent review and explicitly authorized push, hosted image qualification must run its unchanged full Test Tunes sequence and actual single image build, migration inventory, production graph load, exact identity/disk reserves, fixed high/critical blocking scan and validated complete report. This local repair removes the demonstrated integration assertion prerequisite; it does **not** claim a qualified image, scan, hosted aggregate success, production release, resolved legacy browser debt or milestone acceptance. Other agents' tracked edits and unrelated scratch/artifacts were preserved and excluded.
