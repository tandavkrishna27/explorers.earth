# Music command contract (v1)

All commands accept `--format human|json`; fixture mode is the default and live
mode is opt-in with `--mode live`. Human output gives the next and recovery
command. JSON is a single final object with `schemaVersion`, `command`,
`runId`, `status`, `phase`, `durationMs`, `artifacts`, `checkpoint`, and a
redacted `error` when present.

The documented public JSON invocation is `npm run --silent <music-command> -- --format json`. Run root `npm ci` first: the root lockfile supplies `tsx` and the
CLI's typed configuration dependency before either child dependency tree
exists. `music:bootstrap` then installs Tunes and Explorers. This is supported
at the pinned minimum Node 24.21.0; do not invoke the TypeScript entrypoint with
bare `node`.

| Exit | Meaning |
| --- | --- |
| 0 | successful verification/action |
| 1 | verification failure |
| 2 | usage or configuration error |
| 3 | prerequisite or state mismatch |
| 4 | dependency unavailable |
| 5 | safety refusal |
| 130 | SIGINT/SIGTERM; owned children stopped and checkpoint atomically written |

Root commands: `music:bootstrap`, `music:doctor`, `music:up`,
`music:test:smoke`, `music:test:all`, `music:down`, `music:db:status`,
`music:db:migrate`, `music:db:verify`, `music:db:reset`, and
`music:fixtures:capture`. The read-only root command
`music:fixture:authority:attest` accepts no arguments or caller-selected path.

`music:bootstrap` creates only disposable secrets in ignored `.env.music.test`;
it never requests payment or production API credentials. A raw pre-generation
`.env.music.test` is unsupported and the ordinary command returns the safety
phase `fixture-authority` without mutating it or its credentials. Exact project
confirmation does not authorize conversion or cleanup. Every application
command returns the same typed
`MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED` refusal before npm, Docker,
generation, credential, journal, or pointer mutation. After preserving source
changes according to operator policy, discard the entire disposable worktree
and create a clean checkout; no application command interprets or erases raw
legacy fixture state. This safety admission precedes full command, mode,
format, option, and resume validation; an invalid invocation therefore cannot
bypass the refusal and uses the safe default human output format when its
requested format cannot be trusted.

Aggregate fixture teardown authenticates a supported pointer, its generation,
and the three referenced credentials before its action. Missing or tombstoned
pointers are accepted only when the complete recognized credential,
generation, journal, temporary, and pointer inventory is already zero/empty;
that retired state is an idempotent no-op. A populated inventory without the
supported pointer and generation fails before the action or first erase.
During supported teardown the exact inventory, file identities, and bytes are
revalidated before every phase and every descriptor erase. Credentials and
unreferenced artifacts retire first, the current generation next, and the
pointer last. A swap, missing member, or additional target aborts before any
further erase and never touches replacement bytes. Successful teardown leaves
all recognized leaves as zero-byte tombstones, so a repeated teardown can run
its guarded action and clean up again. If the action replaces authority with
raw or malformed bytes, teardown fails with the typed refusal and leaves every
credential, generation, journal, temporary, and unrelated file byte-exact.

**Pre-retirement failure.** Only when the failure occurred before any retirement
or mutation and the supported authority still authenticates exactly, the same
confirmed command may be retried. **Partial or uncertain retirement.** After
any possible mutation—including a truncate/fsync/close failure after mutation,
a digest or generation mismatch, or any mixed authority state—no in-application
retry or cleanup is authorized. Preserve source work according to operator
policy, then externally discard and recreate the disposable worktree from a
clean checkout; never copy ignored fixture authority into the replacement
checkout. Do not manually delete or reinterpret an authority leaf.

The retired-authority oracle accepts only pointer absence or an owned zero-byte
pointer tombstone after proving every recognized credential, generation,
journal, temporary, and pointer leaf is absent or zero bytes. It rejects a
supported reference, raw/nonempty or malformed pointer, populated or ambiguous
inventory, unreadable entry, and any symlink at a recognized authority path.
Success emits only `music-fixture-authority-attestation/v1` with the exact fields
`schemaVersion`, `state`, `safeToBootstrap`, and `usableRecords`; it contains no
path, filename, raw error, or authority material.

`music:down` retains volumes. Its generic volume deletion requires `--volumes
--confirm-project explorers-music-fixture`; before cleanup it renders the Compose
model, resolves and inspects every actual container, network, and volume, and
refuses absent, unlabeled, mismatched, or production-like resources. That
all-resource authority remains unchanged. Project-name confirmation alone is
never sufficient.

Child output is captured and sanitized under `.artifacts/music-runs/<runId>`;
JSON stdout contains exactly one envelope. Verification, prerequisite,
dependency, and safety failures retain their distinct exit categories, with
phase-specific next and recovery commands. Resume uses the actual Git SHA and
rejects a changed commit, fixture/schema version, validated gate values, or
SHA-256 environment fingerprint. SIGINT/SIGTERM terminates only tracked child
process trees before the atomic checkpoint is written.

C3 database status, migrate, and verify require explicit `--target test` and
read only the exact allowlisted `DATABASE_URL_TEST` target
`127.0.0.1:55432/music_fixture`. They reject an ambient `DATABASE_URL` and emit
redacted target, expected/current ID, checksum and pending-list evidence.
Status and verify are read-only; migrate uses the checked-in forward-only
checksummed chain and never invokes `drizzle-kit push`.

Reset instead uses a dedicated volume-only path and requires `--mode fixture
--target test --confirm-project explorers-music-fixture --confirm-reset "RESET
explorers-music-fixture/music_fixture"`. Before mutation it requires two equal
snapshots with zero Compose-project containers and exactly the mandatory
`explorers-music-fixture_music-fixture-postgres` plus optional
`explorers-music-fixture_music-fixture-gates` dual-label volumes. Every present
volume is bound to its exact name, creation identity, mountpoint, fixture/project
labels, Compose project, and Compose logical-volume label. Extra, missing,
unlabeled, mismatched, malformed, ambiguous, or changing targets refuse with no
delete and byte-identical authority.

After that authorization boundary, reset retires the authenticated fixture
bundle (or accepts an already-safe missing/tombstone authority), rechecks the
exact fingerprints, issues one exact allowlisted volume-removal argv, proves
both names absent and the dual-label enumeration empty, and runs the retired
oracle again. An attempted deletion or failed postcondition is non-success and
keeps authority retired for containment. Removing volumes alone is never reset
success.

`music:fixtures:capture --mode live --format json` requires both
`LIVE_STRAPI_URL` and `LIVE_STRAPI_READ_ONLY_CREDENTIAL`, then remains blocked
until TK (identity owner) reviews the endpoint allowlist. No network call is
made before that gate. Fixture captures are schema-versioned, sanitized,
secret-scanned, and refreshed only after identity-owner review; drift is a
blocking change, never silently accepted.
