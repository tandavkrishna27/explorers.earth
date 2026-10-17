# Schema37 prior-release fixture coordination

Finite tests/independent fixture scope coordinated with Movies writer. No production, schema, workflow, ledger, artifact ZIP, or genuine attestation fixture changes. Full package completion/commit awaits composed source freeze.

Owned manifest:

- `tunes/server/test/contracts/platform-release.test.ts`: semantic current-floor positive fixtures use exported `SCHEMA_FLOOR`; unsupported-floor and foreign-repository checks are independent. Explicit historical35 and36 coherent-manifest rejection retained.
- `tunes/server/test/contracts/platform-oci-evidence.test.ts`: explicit all-fixture current-floor assertion and historical36 rejection (existing OCI boundary categorizes malformed release as `OCI_METADATA_INVALID`).
- `tunes/server/test/contracts/fixtures/platform-oci/generate.py`: explicit reviewed independent `SCHEMA_VERSION=37`, no application or validator imports.
- Generated `cases.json` and `receipt.json`, plus README provenance/current-floor notes.
- This report only.

Artifact ZIP fixtures carry `{"version":1}` transport payloads and do not assert a schema floor. Official attestation fixtures are immutable genuine external provenance and do not encode this application floor. Both remain unchanged. Historical schema36 upgrade/corruption scenarios in runtime smoke and Movies sources remain outside this scope and were not replaced.

Actual red: old-floor positive release case fails `RELEASE_SCHEMA_INVALID` after the writer's approved0037 marker advance. Scoped implementation regenerates all71 OCI release documents and their coherent detached digests through the normal independent Python producer. Every API/web metadata/config/index/manifest byte array, case name and expected first error remains byte-identical to HEAD; layer tar/gzip bytes are unchanged.

Provisional verification against the current moving source: four suites **272 passed, zero skips** (release50/artifact46/attestation93/OCI83). Initial root-cwd probe had an unrelated template-path error and a new OCI historical test incorrectly expected the unwrapped release error; source inspection confirmed the existing OCI boundary wraps it as `OCI_METADATA_INVALID`. Backend-directory full selection with the correct first-error assertion passes. No production assertion or gate changed.

Independent generation in a fresh temporary directory reproduces exact bytes without application imports:

- cases.json:364217 bytes, SHA256 `486468e54c8b2a90d63718b9d2b860c05b78f89715fcac20ac21cc6b38c63f97`.
- receipt.json:334 bytes, SHA256 `3851e28b9f817cf354ff18502bfbdf51b8e2c6146793af030b5eb8a012f640bc`.
- layer.tar:10240 bytes, unchanged SHA256 `72b328d868963c3b4b755045274ec5cefafb9c06c3f09518be448e8a1eb65566`.
- layer.tar.gz:135 bytes, unchanged SHA256 `e6385f552ab942f5a56188f0352347a41a0b67d65d05614031bc7c87e0365430`.

Writer reports production runtime-plan floor coordinated to37, historical36 retained. Writer has not granted composed source freeze: SQL/concurrency/restore obligations remain. Final frozen source qualification, C0/baseline checks and package commit are pending; no push, release/milestone/QA/parity completion claim.

Provisional current-worktree full C0 exit0 and baseline comparison clean:142 accepted diagnostics/103 resolved/compiler exit2, wrapper exit0. These do not replace final source-freeze qualification. A fresh explicit four-selector JSON receipt `provisional272-result.json` is retained in the independent-regeneration temporary directory recorded by `%TEMP%/floor37-fixture-regeneration-path`. No skip selection was used for this green run; the only exclusion is the retained unrelated historical duplicate scratch collection. `git diff --check` passes for the six owned source/fixture paths.

## Final revised-freeze qualification

Supersedes the provisional pending state above. After reading the writer's early-audit repair report, the controller authorized final closure against the revised58-file Movies freeze. All58 hashes matched `.superpowers/movie-package-a-source-hashes.json` before extraction. Clean probe archives base `975cd4bddd70bd1eb6e27f202292ffff04724f41` plus exactly those58 frozen writer overlays and the six owned proof-fixture files. `composed-source-receipt.json` preserves both manifests; all64 source hashes match the original working tree and archive after testing. Movies sources remain outside this package commit.

Archive: `C:/Users/TK/AppData/Local/Temp/floor37-final-closure-c27f8942414f43a8bc876747b05b4ec7`. Final `final272-result.json` records the exact four selectors above:272PASS, zero failed/skipped. Full C0 exit0; baseline comparison clean142accepted/103resolved/compilerexit2, wrapperexit0. Normal independent Python regeneration in archive `independent-regeneration` reproduces cases/receipt/tar/gzip bytes exactly; graph/hash provenance above remains accurate. No test exclusion or reused historical scratch collection is needed in this clean archive.

Actual dependency ownership: fresh root npmci33, backend npmci779, separately locked auth-runtime npmci24, all with ignore-scripts/no-audit/no-fund; auth-runtime is explicitly installed so its missing-postinstall declarations cannot fabricate compiler failures. Backend require resolution for Vitest/TypeScript/yauzl points inside this archive's backend node_modules; `#auth-runtime` resolves to this archive's auth-runtime/index.js. An initial attempt to reuse prior owned dependencies refused raw lockfile byte checks due line-ending differences; it was abandoned before tests. Final qualification uses fresh archive-owned installations, not borrowed modules.

Only the six owned proof-fixture paths and this report are committed; no Movies production/schema/deployment file, ledger, workflow or lock change is included. This is a **composed source qualification** with the writer's approved0037 marker, not standalone qualification of a fixture-only commit atop the earlier0036 marker. Independent review must preserve/recompose the frozen writer manifest until its separate package is reviewed and committed. No push, Movies completion, live provider, QA/trusted release or broader parity claim is made.
