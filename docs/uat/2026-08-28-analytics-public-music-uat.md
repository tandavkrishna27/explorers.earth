# Analytics and public Music UAT evidence — 2026-08-29

## Verdict and evidence rule

**Not release qualified.** No retained evidence proves that the guarded owner/guest run executed all 17 mutation journeys, observed the required analytics deliveries, and restored every journey. No Task 3 command used the fixture stack or performed a live write.

This revision distinguishes a retained artifact from a contemporaneous report. `Proven` below means the cited bytes are still available and hashable. `Reported-but-not-retained` means a prior report states the result but the stdout, stderr, per-test report, or inspection output needed to reproduce it is absent. `Observed-not-proven` means the operator/reviewer observed a stage, but the retained artifact does not encode that stage. An unavailable field is written as unavailable rather than reconstructed.

The original qualification base was `25cc0ee296ca48ca59e14267bebcb8faf73efea9`; `origin/main` was reported as `9284a5dbc606979bb3607a7f5934f8b61519ebdc`. Current evidence-repair commits independently reviewed before this task are `e1e28a68630cfc065c091146ce14d4dd905e2505` (live evidence safety) and `8e16a08c9167228bc0b9f77ff2c75c9a7ea68065` (Explorer boundary coverage).

## Guarded-attempt chronology

There were at least two distinct guarded attempts. Neither is the sole attempt, and their evidence must not be combined.

| Attempt | Order and commit | Command / cwd | Exit and totals | What is retained | Qualification |
| --- | --- | --- | --- | --- | --- |
| A — earlier Playwright execution | Earlier than attempt B. Exact commit SHA unavailable. | Exact command and working directory unavailable. | Reported: runner nonzero; Playwright 48 total = 31 passed, 0 failed, 17 skipped. Exact runner exit code and skip reasons unavailable. | No immutable stdout/stderr, per-test report, skip ledger, analytics ledger, visual/trace, Docker inspection, or per-journey restoration hashes retained. | **Reported-but-not-retained.** It does not prove any mutation journey ran or restored. |
| B — later reviewed preflight stop | Reported at `e32ad351c9dd4ba4c6c66f041649289ab705b388`. | Exact invoked command and working directory unavailable. The documented entry point was `npm run music:test:public-e2e`, but the retained artifact does not prove that invocation. | Exact exit code and Playwright totals unavailable; contemporaneous review says nonzero and stopped in preflight. | Local `explorers-earth/.artifacts/music-public/20260829041053317/evidence.json`, 756 bytes, SHA-256 `737cff10fbd4717cbd54c2126e818d9a1e4c5062306656654863fe0f1c9ae120`. | **Failed.** Preflight-stop/before-callback is observed-not-proven by the artifact. Equal final hashes are proven by its current bytes. |

Attempt B's retained JSON proves only `result=failed`, `cleanup=restored`, and one equal before/after pair:

```text
328835bdc95100d75ff52a873bfd697b5a03b1d2da1f9d5b842eeca75ec4efdd
```

It does not contain a stage field, terminal journey records, an analytics ledger, a skip ledger, stdout/stderr, a Docker command/output record, or a manifest. Therefore the claims “preflight stopped before callback,” “zero labeled containers/volumes,” and “the cleanup command succeeded” remain observed-not-proven or reported-but-not-retained. A current directory audit finds only `evidence.json`, so the two private auth files are absent now; that current observation is not substitute proof of the historical deletion commands.

## Historical lane register

The following register covers every lane named by the original UAT document. Unless a retained path is listed, no immutable stdout/stderr artifact exists.

| Lane | Commit, exact command and cwd | Exit / totals | Retained evidence and gap |
| --- | --- | --- | --- |
| Tunes check | Reported current SHA `e32ad351c9dd4ba4c6c66f041649289ab705b388`; `npm run check`; cwd `tunes`. | Nonzero; exact exit/totals unavailable. | Broad TypeScript categories were reported on branch and detached baseline. Logs unavailable. |
| Tunes full test | Same reported SHA; `npm test`; cwd `tunes`. | Reported 99 files: 89 passed, 9 failed, 1 skipped; 1,582 passed, 92 failed, 72 skipped plus one failed suite. Exact exit code unavailable. | Logs unavailable; baseline attribution is reported-but-not-retained here. |
| Tunes critical coverage | Same reported SHA; `npm run test:music-critical-coverage`; cwd `tunes`. | Reported 551 passed, 1 skipped, 0 failed and 100% statements/branches/functions/lines; exact exit unavailable. | Logs unavailable. |
| OpenAPI/security/load | Same reported SHA. Exact combined Vitest command unavailable; cwd `tunes`. | Reported 3 files, 13 passed, 0 failed; exact exit unavailable. | Logs unavailable. |
| Repository/database integration | Same reported SHA. Exact command unavailable; cwd `tunes`. | Safely refused because `MUSIC_C3_POSTGRES_TEST=1` and an explicitly owned destructive database were absent; exact exit/totals unavailable. | Refusal stdout/stderr unavailable. Gap remains. |
| Explorer unit | Same reported SHA; `npm run test:unit`; cwd `explorers-earth`. | Reported 190 files, 1,916 passed; exact exit unavailable. | Logs unavailable. Superseded by the current repair lane below. |
| Explorer lint | Same reported SHA; `npm run lint`; cwd `explorers-earth`. | Reported exit 0, 0 errors, 1,377 warnings. | Logs unavailable. |
| Explorer i18n | Same reported SHA; `npm run i18n:check`; cwd `explorers-earth`. | Reported pass; exact exit/totals unavailable. | Logs unavailable. |
| Explorer build | Same reported SHA; `npm run build`; cwd `explorers-earth`. | Reported pass, 5,397 modules; exact exit unavailable. | Logs unavailable. |
| Explorer critical coverage | Same reported SHA; `npm run test:music-critical-coverage`; cwd `explorers-earth`. | 369 tests passed but coverage threshold failed at 96.99% statements / 95.65% branches / 100% functions / 99.31% lines; exact exit unavailable. | Logs unavailable. Superseded by the current repair lane below. |
| PR-safe browser | `e32ad351c9dd4ba4c6c66f041649289ab705b388`. Exact environment-clearing command and cwd were not retained. | Reported exit 0, 296 total = 251 passed, 0 failed, 45 skipped, 16.8 minutes. Skip-reason ledger unavailable. | No immutable stdout/stderr or trace inventory. |
| Harness-focused browser | Reported at the same historical review point. `npx playwright test e2e/music-harness-contract.spec.ts --project=chromium-pr-safe`; cwd `explorers-earth`. | Reported 28 passed, 0 failed, 0 skipped; exact exit unavailable. | Logs unavailable. |
| Five-timezone analytics/Home | Same reported SHA. Exact environment assignments and Vitest command unavailable; cwd reported as `explorers-earth`. | Reported 28/28 in each of `UTC`, `America/New_York`, `America/Los_Angeles`, `Asia/Kolkata`, and `Pacific/Kiritimati` (140 total); exact exits unavailable. | Per-timezone stdout/stderr unavailable. |
| Guarded live A | Commit/command/cwd unavailable. | Reported nonzero; 31 passed, 0 failed, 17 skipped. | No retained lane artifacts. |
| Guarded live B | `e32ad351c9dd4ba4c6c66f041649289ab705b388`; exact command/cwd/exit unavailable. | Preflight stop reported; exact totals unavailable. | The single 756-byte evidence file described above; no manifest or stream logs. |

## Current non-live repair evidence

These lanes are not live UAT. Their committed reports are retained, but terminal stdout/stderr were not separately preserved under the new manifest format, so they do not retroactively satisfy that format.

The current fixture-capability repair is also non-live and awaits independent review. It gives the loopback Strapi fixture an exact checked-in GraphQL document registry, deterministic full profile state, and token-plus-tuple private snapshot/restore that is not exposed by the Explorer proxy. Mutation journeys now enable Explorer `public_music`, seed playlist/queue/current/history prerequisites inside the canonical snapshot, publish Tunes, and consume the actual returned public slug; guest-device playback is asserted local-only. Profile baseline acquisition and all 72 pairwise rows now execute under the same transactional restore, fixed terminal, and durable guard ownership. These contracts do not constitute a guarded UI result, and the release verdict above remains unchanged.

| Lane | Exact SHA, command and cwd | Exit / totals | Retained report |
| --- | --- | --- | --- |
| Task 1 final focused | `e1e28a68630cfc065c091146ce14d4dd905e2505`; `npx playwright test e2e/music-harness-contract.spec.ts --project=chromium-pr-safe`; cwd `explorers-earth`. | Exit 0; 53 total = 53 passed, 0 failed, 0 skipped. | `.superpowers/sdd/2026-08-29-uat-evidence-repair/task-1-report.md`, 24,327 bytes, SHA-256 `311cff47570af239a988e09209136eef2e120168c078d0ea39b41c1ced5b199d`. |
| Task 1 sanitized broad | Same SHA; the exact environment-clearing prefix was not retained, followed by the `chromium-pr-safe` Playwright lane; cwd `explorers-earth`. | Exit 0; 197 total = 180 passed, 0 failed, 17 skipped. Skip reason: the reviewed live mutation cases were intentionally gated. | Same Task 1 report; stdout/stderr unavailable. |
| Task 2 critical coverage | `8e16a08c9167228bc0b9f77ff2c75c9a7ea68065`; `npm run test:music-critical-coverage`; cwd `explorers-earth`. | Exit 0; 16 files, 418 passed, 0 failed; 100% statements/branches/functions/lines. | `.superpowers/sdd/2026-08-29-uat-evidence-repair/task-2-report.md`, 9,828 bytes, SHA-256 `cee46b5d6acf98e9dfb51534a83462e65c77989dd5dee9c1c6c81b41f21366cb`. |
| Task 2 unit | Same SHA; `npm run test:unit`; cwd `explorers-earth`. | Exit 0; 190 files, 1,965 passed, 0 failed. | Same Task 2 report; stdout/stderr unavailable. |

## Visual, trace, and analytics truth

Neither guarded attempt retained a live-attempt screenshot, video, or trace. “No live visual/trace retained” is the exact evidence state; the earlier broad statement that failed-run traces lived under `test-results` did not identify immutable attempt paths and is withdrawn.

Six tracked deterministic regression baselines exist, but they are not live-attempt evidence:

| Relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/320-long-nav-stress.png` | 22,758 | `afcf2e9cb843d72ddce34fbd87526ce29aeecb839a7c034653d7a4f5e584bdaa` |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/dark-banner-full-content.png` | 24,301 | `7499f90f0c40e595c1021eedc35ef88faf0543df03ade44ce1c9f154b4b97d2b` |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/desktop-full-content.png` | 5,851 | `d8ca05183efe7053013ef91e7f1dc64971713b46b275275bfdc9d10d1c0fa439` |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/failed-image-fallback.png` | 24,301 | `7499f90f0c40e595c1021eedc35ef88faf0543df03ade44ce1c9f154b4b97d2b` |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/minimal-light-solid.png` | 24,957 | `589569058fb18eaf5962b876a688618f6478bef7b4072d5bfe03a49a8018dae3` |
| `explorers-earth/e2e/music-public-contract.spec.ts-snapshots/mobile-reconnecting.png` | 74,606 | `060d352f73cc57a9959fee2dc9bd0449c7db6815c2e5cf1bb85b45afeea90874` |

No guarded attempt retained an observed analytics-event ledger. Read-only tests cover safe event fields, UTM propagation, retry, and exactly-once behavior, but those tests are not an observation of a guarded live delivery. Live analytics therefore remains an explicit evidence gap.

For a future observed record, `analytics-events.jsonl` accepts only product-event enums, `utm_source|utm_medium|utm_campaign|utm_term|utm_content` with bounded non-secret values, SHA-256 occurrence and event identifiers, bounded attempt/duplicate counts, `distinctEventIds=1`, `committedEvents=1`, and `exactlyOnce=true`. A stopped or unobserved run stores one typed `unavailable` record with zero events; it never creates placeholder events.

## Mandatory post-reset bootstrap gate

The next authorized attempt must preserve this order: exact fixture-only `music:db:reset`; read-only proof of zero volumes carrying both reviewed fixture/project labels; read-only proof that ports `55432`, `51337`, `55000`, `55173`, and `55174` have no listeners; successful `npm run --silent music:fixture:authority:attest`; then the exact command below. The reset is a dedicated volume-only lane and first requires zero exact-project containers. The live runner repeats the exact attestation immediately before bootstrap. It sets `fixtureLifecycleAttempted` only after acceptance, so a rejected gate is pre-bootstrap and performs no `down`; this classification is valid only after the separate volume and port proofs.

```powershell
npm run music:test:public-e2e -- --ack I_UNDERSTAND_THIS_MUTATES_A_DISPOSABLE_FIXTURE --fixture-version music-public-e2e-fixture/v1 --confirm-project explorers-music-fixture --confirm-namespace-reset RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE
```

This argv contains no secret. Missing, wrong, duplicate, reordered, or extra inputs refuse. Before generating any random value or allocating evidence, the live runner also refuses ambient Music E2E, database, production, Docker, URL, token, or identity authority. It derives the exact five loopback origins and health URLs, a unique namespace with distinct owner/account/user identifiers, and an ephemeral random local fixture token internally.

After readiness and the first private full database/profile snapshot, a mandatory capability qualifier runs before Playwright collection, callback authentication, auth-file allocation, or any journey. A distinct ephemeral qualifier Tunes JWT exists only in bounded memory. The qualifier proves populated identity/profile state, deterministic database and `UpdateAccount` mutation, exact transactional database/profile rollback, direct-only optimistic revision authority and stale rejection, exact checked-in identity/update documents, direct plus Explorer-proxied public profile and every category, an actual non-literal publication slug, and seeded playlist/queue/current/recent/guest-control prerequisites. It then restores the initial baseline, requires the qualifier JWT to be unusable and the durable guard clear, and retains only strict fixed status/code/boolean/count/hash/revision metadata. A qualifier failure is an execution failure and cannot start collection or callback; final restore and teardown remain mandatory.

The retained qualifier schema is `explorers-public-prebrowser-qualification/v3`. Public-flow failure uses the top-level fixed code `public-flow-failed` plus exactly one of 34 predeclared request stages: visibility, owner dashboard, playlist creation, three separately numbered saved-song writes, playlist visibility, queue replacement, two separately numbered playback writes, controls, publication, ten operation-specific direct GraphQL stages, the same ten Explorer-proxy stages, and direct/proxied public-Music resources. The subordinate code is only `operation-failed`, `operation-timeout`, `http-failed`, or `contract-invalid`; status values, URLs, bodies, and error text are never retained. Queue qualification requires the exact three canonical ordered queue rows returned by replacement and starts playback only with those new queue-row IDs, never the playlist-saved IDs supplied to replacement.

The browser-free C14 entrypoint now has one guarded root command for a separately authorized one-shot qualification:

```powershell
npm run music:test:public-c14 -- --ack TASK4_FULL_FIXTURE_PREBROWSER_QUALIFICATION_V1 --fixture-version music-public-e2e-fixture/v1 --confirm-project explorers-music-fixture --confirm-namespace-reset RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE
```

It rejects every missing, wrong, duplicate, reordered, or extra argv element and every recognized ambient Music, database, Docker, URL, token, identity, Node-preload, or C14-control override before randomness or lifecycle. It then derives the full 11-field loopback authority tuple internally and uses the same reviewed authority attestation and fixture bootstrap/up/down-with-volumes helpers as the live runner. The private state service is confined to one identity-checked operating-system temporary directory. C14 shares the production initial-snapshot codec and exact qualifier phase, and a pass requires all 20 direct/proxied GraphQL operations, both public-Music resources, exactly three queue rows, equal final database/profile restoration, qualifier-owner retirement, a clear durable guard, exact fixture down, post-down tombstone attestation, and temporary removal. It allocates no browser, callback JWT, auth/storage file, Playwright process, or live evidence directory. Its sole public output is one bounded canonical fixed-code JSON line. This orchestration boundary was exercised only through inert shims and protocol contracts in the non-live repair; no full-fixture C14 service run occurred.

Before that qualifier, the initial snapshot itself is now a strict typed gate. The production state-service capture core advances through only `container-authority`, `schema-inventory`, `pg-dump`, `dump-hash`, `identity-count-query`, `profile-private-fetch`, `profile-schema`, `profile-field-count`, and `snapshot-store`. Failure evidence contains only one of those stages and the fixed code `operation-failed`, `operation-timeout`, or `contract-invalid`; raw errors, SQL, origins, credentials, paths, response bodies, database dumps, and profile snapshots are forbidden. A successful record retains only database/profile SHA-256 values plus bounded identity, profile-revision, and field counts. The separately gated C12 owned-database integration is registered against this exact production core and the exact loopback private-profile codec, but it was not executed by this non-live repair.

After qualifier success, exact collection must prove `49 = 17 mutation + 32 read-only`. The callback-minted owner Tunes JWT must differ from the qualifier credential and is written to the protected auth path only after that collection gate. Every lifecycle-attempted failure still restores, runs exact `down`, and retires the generated fixture token; public output and retained evidence sanitize it.

The child attestation is a single canonical JSON line with only `schemaVersion`, `state`, `safeToBootstrap`, and `usableRecords`. Only `absent|tombstone`, `true`, and `0` are accepted. Reference/live, raw/nonempty, populated, malformed, unsupported, ambiguous, unreadable, symlinked, credential-bearing, extra-field, multi-record, nonzero-exit, signal, and spawn-error states all block. Raw stdout/stderr is discarded rather than sanitized into evidence.

Before mutation, `db:reset` takes two equal snapshots of the empty container set and exact dual-label volume inventory. The only authorized target set is mandatory `explorers-music-fixture_music-fixture-postgres` with optional `explorers-music-fixture_music-fixture-gates`; exact name, creation identity, mountpoint, fixture/project labels, Compose project, and logical-volume labels are fingerprinted. Extras, missing postgres, unlabeled/mismatched/malformed/ambiguous targets, or preauthorization change block without a delete and leave fixture authority byte-identical. Once authorized, it retires authenticated fixture authority, revalidates the fingerprints, performs one exact volume-removal argv, proves both exact names and the dual-label inventory absent, and repeats the oracle. Any deletion-attempt or postcondition failure is non-success and retains the safe retired authority. Removing volumes alone is never reset success.

## Executable evidence contract for the next run

From repository-relative cwd `explorers-earth`, each runner invocation allocates one new direct child of its fixed `.artifacts/music-public` parent with exclusive-create semantics. The runner accepts no parent from CLI or environment; the allocator rejects reuse, traversal, symlinks, or a parent outside an exact `.artifacts/music-public` hierarchy. The parent may be created separately; the run child is never recursively reopened.

Every complete run contains these required relative paths:

```text
logs/fixture-bootstrap.stdout.log
logs/fixture-bootstrap.stderr.log
logs/fixture-up.stdout.log
logs/fixture-up.stderr.log
logs/fixture-down.stdout.log
logs/fixture-down.stderr.log
logs/state-service.stdout.log
logs/state-service.stderr.log
fixture-authority.json
analytics-events.jsonl
visual-trace-ledger.json
docker-inspection.json
skip-reasons.json
restoration.json
journey-outcomes.json
mutation-guard.json
evidence.json
manifest.json
manifest.sha256
```

Any retained `visuals/*.(png|jpg|jpeg|webp)` or `traces/*.zip` named by `visual-trace-ledger.json` becomes an additional required manifest entry. If none exists, the ledger says `none-retained` with empty arrays.

`manifest.json` is canonical JSON and lists every required artifact except itself and the sidecar as an exact `{role,path,bytes,sha256}` entry. `manifest.sha256` is the self-reference terminus: exactly one lowercase 64-hex SHA-256 plus newline, with no path or other data. The verifier rejects a missing file, an unlisted file/directory, an extra/duplicate/reordered role or path, unsafe path, sidecar mismatch, non-canonical manifest, byte mismatch, or artifact hash mismatch.

The eight per-source stdout/stderr files are the authoritative stream evidence. Each file is independently bounded, path-normalized, and secret-redacted; no lossy aggregate log is used to claim completeness. `fixture-authority.json` retains the exact fixed logical argv, normalized repository cwd, exit code, termination class, and either the strict accepted attestation or `null`; it never retains raw child output. `journey-outcomes.json` carries all 49 stable journey IDs and all 17 mutation-terminal slots using only strict status/reason/stage codes. `mutation-guard.json` is the canonical unlinked run-scoped clear/blocked record and must equal `evidence.json.mutationGuard`; an arbitrary reason, extra field, symlink, or hard link is invalid. `evidence.json` also carries one exact typed record for every declared source/stream with its status, raw observed byte count, retained byte count, and truncation state. The verifier rejects a missing, extra, reordered, duplicated, or metadata-mismatched stream record, and rejects an unsafe fixture-authority, journey ledger, or mutation-guard state even when an attacker rebuilds every artifact hash and the sidecar. Raw Playwright JSON, output directories, private mutation-recovery records, auth files, bearer values, capability values, absolute workspace paths, and unbounded child output are private inputs and must be deleted before manifest creation.

The state service restores the bounded private data dump through one `psql --single-transaction` operation addressed to an immutable attested container ID. Frozen table, checked-in migration checksum, and trigger fingerprints are verified before truncation and after replay. Replay failure is called rolled back only when the pre-attempt mutated hash remains exact; success requires the stored snapshot hash. Any restore or verification failure atomically blocks the shared run-scoped mutation guard, which a fresh Playwright worker must read before invoking a mutation. The live child is additionally fixed to one worker, `--max-failures=1`, and zero retries. A distinct orchestration token owns the original snapshot and `/restore-final`, so final recovery remains possible while worker mutation authority is blocked. Every started mutation emits one fixed-code terminal, and report reconciliation records skipped/not-run IDs without manufacturing successful evidence.

Live fixture `bootstrap`, `up --detach --wait`, and exact `down` never inherit child streams. Each command captures bounded private stdout/stderr, writes the two corresponding independently bounded sanitized stream artifacts, and adds a typed lifecycle record with its fixed logical argv, normalized cwd, exit status, termination class, observed and retained byte counts, and truncation or unavailable state. The loopback state service installs `error`, `exit`, and `close` listeners immediately after spawn and captures its two streams the same way. Spawn error and unexpected terminal-event races route through one idempotent failure finalizer. Shutdown is successful only after an attested terminal `close`: code 0 without a signal, or code `null` with the expected `SIGKILL`; signal acceptance alone is insufficient. A bounded condition/event wait records timeout, nonzero, inconsistent, or unknown termination as cleanup failure while later exact down, Docker inspection, and artifact finalization still run. Raw child output is never sent directly to the invoking terminal.

Once live bootstrap is attempted, every exit path attempts the exact fixture `down` independently of private artifact deletion and state-service shutdown. Each private file/directory removal continues after another removal fails. A live exit is forced to code 5 unless cleanup is both classified `restored` or `not-required-safe` and the exact Docker/auth inspection below verifies no labeled containers, labeled volumes, or private auth artifacts. A down failure, unavailable Docker inspection, residue, private-artifact presence, or any other unverified cleanup classification remains explicit evidence and cannot preserve an ordinary execution exit.

The next guarded run also records these exact cleanup inspections, executed from the repository root, with argv, exit code, and bounded matching output stored in `docker-inspection.json`:

```text
docker ps -aq --filter label=com.explorers.music.fixture=true --filter label=com.explorers.music.project=explorers-music-fixture
docker volume ls -q --filter label=com.explorers.music.fixture=true --filter label=com.explorers.music.project=explorers-music-fixture
```

It separately records whether `owner-auth.json` and `profile-storage-state.json` are absent. Missing Docker output is `unavailable`; it is not replaced with an empty successful inspection.
A live lane is forced to exit 5 when either inspection is unavailable, labeled resources remain, either private auth artifact is not proven absent, exact teardown fails, or restoration is otherwise unverified; the exact gap stays in `evidence.json`.

Independent verification command after a runner finishes:

```text
node scripts/music-public-qualification-artifacts.mjs verify .artifacts/music-public/<runId>
```

## Reviewer index and release blockers

| Requirement | Evidence | Result |
| --- | --- | --- |
| Guarded live chronology | Separate attempts A and B above | Reconciled; neither attempt qualifies UAT |
| Terminal mutation evidence | 17 ordered journey hashes plus final restore required | Missing |
| Analytics/UTM exactly once | Observed safe ledger required | Missing for live UAT |
| Visual/trace inventory | Live ledger required | Historical attempts retained none |
| Immutable streams and manifest | New executable contract | Non-live contract verification required before any live attempt; no historical bundle |
| Docker/auth cleanup | Exact argv/exits/matches required | Historical output not retained |
| Explorer critical coverage | Task 2 committed report | Pass, 418/418 and 100% coverage |
| Live harness safety | Task 1 committed report | Non-live contracts pass; live path deliberately unexercised after repair |
| Repository/database lane | Explicit disposable database authority | Still refused / missing |
| Independent evidence review | Separate reviewer before live execution | Required; not replaced by this author review |

Release remains blocked on independent review of the artifact contract, one newly authorized guarded run that crosses preflight and retains all 17 terminal journey hashes plus an observed analytics ledger, a clean manifest verification, and the explicitly authorized repository/database lane. Push, PR review request, merge, deployment, and production mutation remain outside this evidence repair.
