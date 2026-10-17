# Task 10 report — identity security and recovery qualification

## Outcome: implemented; independent approval pending

The user explicitly authorized the bounded deployment-authority refactor that
resolved the last C10 blocker. The immutable transactional state machine is now
shared by a GHCR-only production wrapper and a separately gated loopback-only
fixture wrapper. A real Docker local-OCI/PG15/Traefik rehearsal runs the shared
engine through migration and readiness failures, exact-digest rollback,
unknown/pre-floor rollback refusal, kill-switch verification, and guarded
cleanup. It emits the bounded `music-operation/v1` evidence required by the
release lane; no fake Docker result is accepted as that evidence.

No schema, migration, historical marker, production service, external
registry, `GATE_PROD`, Task 11, or Task 12 was changed or invoked. No image was
pushed outside the disposable loopback registry and no deployment occurred.
Task 10 is not approved; a separate independent reviewer must accept the final
exact-commit evidence.

## Delivered qualification

- One portable C0 execution path exposes fast/PR/nightly/release lanes with
  hard 3/15/45/60-minute wall-clock budgets. PR inherits fast; nightly and
  release inherit PR. Owned child processes receive at most one diagnostic
  rerun, and a green diagnostic never erases the original red result.
- Reports bind commit plus environment fingerprint, accept only successful
  exact-authority historical measurements, publish cross-run p50/p95, and fail
  closed on missing bootstrap/doctor/smoke/load/interrupt/recovery/compatibility
  evidence. Release refuses a dirty source tree.
- Public JSON/human envelopes use repository-relative paths. Child launch
  failures cite portable artifact paths. Structured and exact generated
  authorities are redacted, including bare secrets and full token68 bearer
  values. Unsupported raw/malformed fixture authority still writes no artifact
  or checkpoint.
- Tunes and Explorer have unchanged 100%-per-file thresholds covering the C4/C5
  gateway, projection, token, principal, route, credential-store, and API-client
  seams. The 1,425-line PostgreSQL identity repository has a separate real-PG
  100%-per-file gate.
- Executable matrices cover migrations, repositories, concurrent first ensure,
  cached identity and owner reads, lifecycle/reconciliation/owner predicates,
  REST/GraphQL/socket hostile roles, Google/email eligibility, account and
  sharing lifecycles, refresh/replay, rename, browser exit, upstream outage,
  socket/guest concurrency, chaos/recovery, compatibility containment, and
  secure kill-switch/floor contracts.
- Accessibility exercises initial and open-dialog axe audits, keyboard-only
  selection/save, focus restoration, state/toast/request assertions, and 44px
  targets at 375px and desktop. The discovered focus-scale defect was corrected
  without changing layout semantics.
- The built fixture uses reserved HTTPS authority
  `https://music-fixture.invalid`; Playwright forwards only that authority's
  original method, headers, body, path, and query to real loopback Tunes and
  fulfills with the real response. Production clients and the production bundle
  scan remain HTTPS-only. This proves Explorer → Tunes → fixture Strapi → PG,
  but deliberately does not claim TLS/DNS qualification.
- The release evidence template is sanitized and explicitly grants no
  deployment authority.

## RED → GREEN highlights

- C4/C5 RED: identity routes were 50.55/45.74/46.15/48.75%, Explorer credential
  store/API client 88.35/83.62/100/92.74%, and the real-PG identity repository
  82.50/81.15/76.11/86.15%. Added tests made each exact gate 100%.
- Browser refresh RED: both attempts replayed the same bearer and the renewed
  credential was absent. GREEN uses distinct old/new credentials, makes stale
  replay fail, and asserts the retry's exact bearer. Rename now asserts its exact
  Music bearer, idempotency key, body, and absence of `X-Username`.
- Accessibility RED found `button:focus-visible { transform: scale(0.98) }`
  shrinking a focused 44px sharing button to 43.12px. GREEN retains 44px at both
  required viewports after the complete keyboard save.
- Clean fixture RED first caught a fixture cleartext URL/bundle conflict. The
  secure fix retained the production HTTPS contract and uses the reserved-HTTPS
  Playwright transport described above. A later Docker `npm ci` registry
  `ECONNRESET` was preserved; its sole diagnostic rerun succeeded.
- Portable-envelope RED exposed an absolute child-log path. GREEN emits the
  repository-relative path. The later full Tunes gate caught two regressions:
  legacy-authority refusal had begun writing evidence, and old tests resolved
  portable paths from `tunes/`. GREEN restored zero mutation and resolves public
  paths from the repository root (CLI contract 52/52).

## Verification evidence

- Tunes critical coverage: 24 files, 519 passed and 1 skipped; 100% statements,
  branches, functions, and lines (`1751/1751`, `1579/1579`, `265/265`,
  `1528/1528`).
- Explorer critical coverage: 14 files, 220 passed; 100% (`534/534`, `495/495`,
  `117/117`, `442/442`).
- Real-PG identity repository coverage: 9 files, 120 passed; 100% (`606/606`,
  `483/483`, `67/67`, `556/556`) in 30.37s. The labeled standalone PG15 was
  stopped and removed.
- Broad standalone PG15: 10 files, 119 passed. The 50-query/four-connection load
  measured p50 86.20ms and p95 140.94ms. Socket/guest load exercised 12 owner and
  24 guest admissions, 16 accepted plus 8 rate-limited guest requests, 192 owner
  deliveries, and 288 guest player-state deliveries.
- Qualification/clean-bootstrap/release contracts: 28/28. CLI output contract:
  52/52 focused. Scoped Tunes types and exact baseline passed (`170 current`,
  `75 resolved`, compiler exit 2). Tunes and Explorer production builds passed;
  Explorer reported `HTTPS-only`.
- Explorer full unit: 120 files, 964 passed. The safely decomposed Tunes gate is
  65 non-CLI files/1079 passed plus 2 skipped and the isolated CLI contract
  52/52. See the deviation below for why the concurrent aggregate is not an
  authority-safe command in this source worktree.
- Mocked Chromium identity/account matrix: 9/9; accessibility: 2/2; complete
  Music/account lifecycle smoke: 30/30. Scoped Explorer TypeScript passed.
- Clean detached base `964d728...` plus the applied Task 10 snapshot: portable
  bootstrap/doctor passed; first startup failed at the now-fixed transport
  contract (47.657s); the next build reached Explorer but preserved a Tunes npm
  `ECONNRESET` failure (190.407s); one diagnostic rerun passed in 38.012s. The
  final reserved-HTTPS rebuild passed in 60.533s. Cold/warm smoke passed in
  701ms/661ms.
- The clean fixture contained five correctly labeled services: PostgreSQL,
  Strapi, Tunes, and Explorer healthy; `tunes-migrate` exited 0. Built-service
  Chromium passed 1/1 against the real service chain.
- Real runtime recovery emitted
  `music-real-docker-evidence/v1`: 5 containers, 4 healthy services, migration
  exit 0, one stable identity row, owner predicate verified, outage observed,
  recovery verified, and compatibility-route usage 0. Actual C0 signal handling
  emitted `music-operation/v1` with interrupt cleanup and resume verified.
- Dirty-source release proof blocked in 62ms at
  `qualification-source-authority`; no lane task or deployment ran.
- Guarded teardown removed exact fixture containers/networks/volumes/listeners
  (`0/0/0/0`). The generated proof pointer was a zero-byte non-authority
  tombstone. The disposable path is removed after this report is written.
- Final staged/working diff checks passed. Independent review found no Critical
  or Important issue other than the explicit frozen deployment-authority
  blocker, including after the reserved-HTTPS real-service delta.
- Evidence suppression is an explicit no-mutation result flag set only by the
  two preflight unsupported-authority refusals. A post-action authority failure
  still persists its checkpoint/command result (contract RED then 24/24 GREEN;
  existing post-action replacement proof 1/1).

## Authority-test deviation

The final attempt to rerun the inherited full Tunes non-deployment aggregate
invoked `music-cli-contract.test.ts`. Its existing `beforeAll` internally reads,
normalizes, and may rotate repository `.env.music.test`; running it concurrently
with other authority tests is incompatible with the instruction to preserve the
active ignored authority. I did not directly open or repair that file, stopped
using the aggregate after the behavior became evident, and reported the event
immediately. The test helpers snapshot and restore prior bytes, and the final
failure classified the authority as the original unsupported/raw form, but
exact byte preservation cannot be independently proven without the forbidden
read. All Task 10 fixture/PG evidence used disposable authority instead.

## Authorized protected deployment refactor design

The user explicitly authorized the previously blocked protected refactor on
2026-08-21. The bounded design preserves the existing deployment state machine,
authenticated ledger/journal, immutable migration markers, readiness/promotion
checks, transaction recovery, and permanent/schema rollback floors as one
registry-agnostic engine. Registry admission is split into mutually exclusive
policy wrappers:

- `music-deploy.sh` remains the production entrypoint. It accepts only the
  existing GHCR authority schema, canonical `ghcr.io/<owner>/explorers-tunes`
  repository, GitHub OCI source, explicit deploy user, and secure token file.
  It performs isolated authentication and exact digest/provenance materialization
  before the shared engine can run. Fixture mode/local repositories fail closed.
- A fixture-only wrapper accepts no GHCR authority, token, user, or ambient
  repository fallback. It requires fixture mode, an exact acknowledgement, a
  loopback-only `127.0.0.1:<port>` registry, an exact disposable Compose project,
  a private marked fixture root, and fixture-labeled Compose services. Its
  isolated Docker config may pull only the exact local OCI digest. The wrapper
  is unusable in default/production mode and cannot address an external
  registry, production root/project, or `GATE_PROD`.
- Both wrappers source the same non-directly-executable engine. The engine
  requires a recognized policy hook, validates the exact digest and the common
  OCI revision/source/containment provenance, then performs the existing real
  migration gate, readiness, promotion, rollback, kill-switch/floor, and crash
  recovery operations unchanged.

Tests must first prove the frozen production executable cannot admit a local
exact image, the new fixture entrypoint is absent, and production still rejects
local/non-GHCR authority. GREEN requires executable/static security contracts
plus a labeled disposable real-Docker local-registry rehearsal. The rehearsal
may transfer images only to its loopback registry; it must not contact or push
to an external registry, production, or `GATE_PROD`. Evidence is bounded,
authority-bound, and secret/path sanitized.

## Protected refactor RED/GREEN and runtime evidence

- Protected RED:
  `npm exec -- vitest run server/test/deployment/music-deploy-executable.test.ts -t "keeps the production entrypoint|fails the fixture entrypoint" --reporter=verbose`
  failed 2/2: the frozen production wrapper rejected the loopback exact image
  and the required fixture entrypoint did not exist.
- Minimal seam GREEN: the same focused command passed 2/2 after the wrappers
  were split around `music-deploy-engine.sh`. Production retains the canonical
  GHCR regex, GitHub OCI source, secure read-token file, isolated Docker config,
  exact RepoDigest/revision/source/containment verification, authenticated
  state, recovery, and rollback floors. Direct engine execution, absent fixture
  acknowledgement, and non-loopback fixture registries fail before Docker.
- Real Docker REDs were retained while bringing up the local proof: missing
  rehearsal module; missing live trusted-proxy/token/lifecycle authorities;
  stale 401 containment expectations against current 410 tombstones; public
  file-provider convergence; exact kill-switch field names; and HTTP status
  parsing. Each was followed by the minimal focused GREEN. The containment
  updates strengthen the bootstrap gate to require the current removed-surface
  410 contract.
- Exact dirty-source diagnostic command:
  `npm exec --silent --prefix tunes -- tsx tunes/scripts/music-docker-release-rehearsal.ts`
  exited 0 in about 50 seconds and emitted only:
  `{"schemaVersion":"music-operation/v1","metric":"real-docker-release","compatibilityRouteUsage":0,"migrationFailureObserved":true,"readinessFailureObserved":true,"rollbackRestored":true,"unknownRollbackRefused":true,"preFloorRollbackRefused":true,"killSwitchVerified":true}`.
- The proof used one labeled `registry:2` bound to a random loopback port,
  exact local candidate digests, PostgreSQL 15 without a host database port,
  private Docker-volume secrets, disposable Traefik without ACME/dashboard/API,
  and a unique `music-c10-release-*` project. Failure and success cleanup
  verified zero labeled containers, volumes, and networks.
- Local-image isolation RED: the focused workflow-security contract failed 1/1
  because the first rehearsal version still permitted Docker's ambient pull
  fallback. Minimal GREEN requires every prerequisite OCI base to be preloaded,
  every `docker run` and Compose service to use never-pull policy, and both
  source/candidate builds to use `--pull=false`. The first live GREEN attempt
  then correctly failed before deployment because the intentionally evicted
  legacy digest was not local; the script now explicitly preloads that one
  immutable digest from its already-running loopback registry. The final live
  rerun exited 0 in about 56 seconds with the same complete
  `real-docker-release` envelope and cleanup again verified labeled
  containers/volumes/networks `0/0/0`. No external image pull or push occurred.
- Independent review found that an ambient remote Docker context could relocate
  the otherwise-loopback rehearsal. Exact RED ran both hostile authorities:
  `DOCKER_HOST=tcp://127.0.0.1:1` and a nonexistent `DOCKER_CONTEXT`; both
  reached image inspection rather than the required pre-Docker refusal. GREEN
  rejects either external override, inspects the selected context read-only,
  admits only a local named-pipe or Unix-socket endpoint, and binds every parent
  Docker call plus the child engine to that inspected endpoint. The first live
  attempt using a context-name binding failed bootstrap because the engine's
  intentionally isolated Docker config cannot resolve ambient context metadata;
  the exact failure remains recorded. The minimal endpoint binding then passed
  workflow security 11/11, standalone TypeScript, and the complete live Docker
  envelope in about 59 seconds, with guarded cleanup `0/0/0`.
- Fresh protected/static gates: workflow security 9/9; deployment files 18/18;
  qualification contract 24/24; other deployment executable/static/security
  files 88 passed plus 2 Docker-capability skips; rehearsal standalone TypeScript
  and scoped Tunes TypeScript passed. The final exhaustive deployment executable
  rerun passed 70/70 in 589.73 seconds.
- Fresh broad gates: Tunes critical coverage 24 files, 519 passed plus one skip,
  100% (`1751/1751`, `1579/1579`, `265/265`, `1528/1528`); Explorer critical
  coverage 14 files/220 passed at 100% (`534/534`, `495/495`, `117/117`,
  `442/442`); labeled standalone PG15 identity repository 9 files/120 passed at
  100% (`606/606`, `483/483`, `67/67`, `556/556`) in 33.16s with cleanup
  containers/listeners `0/0`; security matrix 6 files/119; load/chaos 2 files/5;
  Explorer full unit 120 files/964; Tunes/Explorer types, exact baseline, and
  both production builds passed; Chromium fullstack 9/9 and axe/keyboard 2/2.

## Review and handoff

The protected refactor and local-registry release evidence are implemented.
Independent protected review found the remote-Docker containment gap described
above; after exact RED/GREEN and the endpoint-pinning live rerun, its final delta
review found no remaining Critical or Important issue. Task 10 is not approved;
a separate external approval remains required after the final commit and clean
exact-commit rehearsal.

## Commit and exact detached proof

- Committed all 51 coherent Task 10 paths as
  `2566d462b2a57addd6d4d6661019a9319d97e2ff`
  (`test(music): qualify identity security and recovery`). No push was made.
- A clean detached worktree at that exact hash passed three lockfile installs,
  portable bootstrap, doctor, and five-service startup in about 105 seconds.
  Canonical smoke passed; the built fixture browser reached real Tunes, fixture
  Strapi, and PostgreSQL owner authority (Chromium 1/1).
- A first direct invocation of the runtime helper failed before stopping Tunes
  because it intentionally expects the qualification runner's authenticated
  environment injection. The supported guarded environment reader and secure
  migrator-secret reader were then used against only the detached disposable
  authority (never the original active ignored file). Real outage/recovery
  passed with 5 containers, 4 healthy services, migration exit 0, one stable
  identity row, owner predicate verified, and compatibility usage 0.
- The exact commit's local-registry shared-engine rehearsal passed the complete
  sanitized migration/readiness/rollback/floor/kill-switch envelope. Supported
  fixture teardown left containers/networks/listeners `0/0/0`; its two exact,
  unattached, fixture/project-labeled retained volumes were verified by literal
  name and removed, leaving volumes 0. The detached authority pointer was a
  zero-byte tombstone and tracked status was clean before guarded worktree
  removal. Git deregistered the worktree but hit Windows path length while
  deleting a residual dependency directory; after revalidating the exact target
  and verifying each residual directory was empty, bounded native deletion
  removed it. The disposable path and registration are absent.
- Task 10 is implemented and committed but is not claimed approved. A separate
  external reviewer must approve it before any Task 11, push, production, or
  `GATE_PROD` action.

## External review fix round 1 (2026-08-21)

The five Important findings in `task-10-review.md` were independently traced
to executable gaps before edits. No schema, migration, immutable marker,
production deployment, registry push, `GATE_PROD`, or Task 11 surface changed.
The active ignored `.env.music.test` was not opened, normalized, or mutated.

### RED evidence

- Fixture-wrapper containment RED:
  `npm exec -- vitest run --config vitest.config.ts server/test/deployment/music-deploy-executable.test.ts --testNamePattern "hostile direct fixture|remote effective Docker|non-canonical and non-private|fixture Compose model" --reporter=verbose`
  exited 1 with 12 failures. Direct wrapper invocation admitted ambient Docker
  endpoint/prod/GATE/cleanup authority, marker-only roots, remote effective
  contexts, and incomplete Compose containment.
- Lane-inventory RED: focused qualification contract
  `keeps long release recovery...` failed because the release task omitted
  executable deployment files and the broad unit task still invoked the
  repository-authority CLI contract.
- Persisted-evidence RED: the hostile sanitizer contract failed with
  `sanitizeMusicChildArtifactOutput is not a function`; absolute developer
  roots, secret environment assignments, and raw Docker structured output were
  not comprehensively bounded at the artifact/checkpoint sink.
- Authentication-trigger RED: the new Playwright journeys failed before the
  local IdP/GraphQL harness existed; prior tests entered Music directly and did
  not cross the real Google callback or confirmed-email login/onboarding
  transitions.
- Load-authority RED: focused qualification contracts failed 2/2 because the
  PostgreSQL task exercised only a synthetic pool probe and release evidence
  could remain green without an observed telemetry-label envelope.

### Minimal GREEN implementation and focused proof

- The fixture wrapper now independently rejects `DOCKER_HOST`,
  `DOCKER_CONTEXT`, all prod/GATE aliases and cleanup escape variables before
  mutation; attests and pins an effective local npipe/unix Docker endpoint;
  requires a canonical, owned, private, project-named disposable root with all
  authority leaves inside it; and validates the exact seven-service Compose
  model. Every service must use a loopback-registry exact digest,
  `pull_policy: never`, exact fixture labels/networks/volumes, no build,
  privilege, device, ambient namespace, unsafe bind, or non-Traefik port.
  Hostile direct invocation is covered. The standalone real-Docker rehearsal
  passed in about 51 seconds and emitted migration/readiness failure,
  exact-digest restoration, unknown/pre-floor refusal, kill switch, and
  compatibility usage 0, followed by labeled cleanup 0/0/0.
- The release rehearsal task enumerates all 11 deployment test files. The
  broad Tunes task excludes the authority-bearing CLI contract, which is now a
  serial PR task in a clean detached exact-commit worktree with guarded
  dependency links and cleanup. It never points at the source checkout's
  ignored authority. A direct Windows execution RED exposed `ERR_FS_EISDIR`
  when removing its already-empty temporary parent; the minimal directory-API
  fix made the same direct check fail at the intended clean-source guard and
  leave zero helper roots. Qualification contract 26/26 passed. Actual lane
  evidence is deferred to the committed detached checkout below.
- CLI artifact, checkpoint, command argument, stdout, and stderr sinks now
  portableize repository/developer paths; recursively redact structured and
  exact sensitive values; redact hostile `KEY=value`, DSN, bearer, and home
  forms; and replace raw Compose/inspect/daemon payloads with a bounded byte
  envelope. Hostile corpus tests and the full qualification contract passed.
- Playwright now crosses the actual Google callback and actual confirmed-email
  page/login/three-step onboarding before the sole eligibility observer emits
  one bodyless ensure. The harness uses local IdP/GraphQL/REST seams only and
  verifies distinct application/Music bearer authority, no `X-Username`, one
  account create under a double submit, no duplicate ensure, and zero ensure
  for incomplete, ambiguous, or unconfirmed accounts. Focused Chromium passed
  3/3; combined authentication plus full-stack browser passed 12/12.
- The C10 load gate now crosses actual loopback HTTP, Express identity routes,
  Strapi gateway fetches, projection, token/principal services, the real
  repository, and a fresh PostgreSQL 15 database. It measures concurrent first
  ensure/single-flight, 200 cached ensures, 200 ordinary owners with zero
  Strapi calls, 200 invalid-token requests, and 50-query four-connection pool
  saturation. Latest focused GREEN emitted first/cached/owner/pool p95 values
  66.76/32.20/154.10/437.05ms, 300 actual metric events, one exact eight-key
  set, zero forbidden identity keys, and bounded value cardinality 8.

### Broad pre-commit gates

- Tunes critical per-file coverage: 24 files, 519 passed plus one skip, exact
  100% (`1751/1751`, `1579/1579`, `265/265`, `1528/1528`).
- Explorer critical per-file coverage: 14 files/220 passed, exact 100%
  (`534/534`, `495/495`, `117/117`, `442/442`).
- Real-PG identity-repository coverage: 9 files/120 passed, exact 100%
  (`606/606`, `483/483`, `67/67`, `556/556`).
- Complete deployment executable/static/security run: 99 passed, one skipped;
  the only initial failure was one stale caller-side Docker assertion. After
  updating it to assert wrapper-side endpoint pinning, its focused file passed
  11/11. The full executable behavior itself was green.
- Tunes and Explorer scoped TypeScript, exact Tunes baseline, both production
  builds, qualification 26/26, unit load 3/3, focused real-PG load 1/1, and
  combined Chromium 12/12 passed. The Explorer build's generated sitemap was
  restored exactly and is absent from the diff.

Final independent rereview, the separate fix commit, actual two-sample C0 lane
evidence, sanitized newly generated artifacts, and clean detached exact-commit
five-service/recovery proof follow below. Task 10 remains unapproved.

## External review fix round 1: exact-commit evidence (2026-08-22)

All results in this section are bound to the clean detached execution authority
`2315a8806e0c12324ba7cbefc39dab0b1a94c855`
(`fix(music): make qualification evidence authoritative`). The later
`docs(music): record qualification evidence` successor records these results
only; it was not the execution authority. This separation avoids changing the
tested hash while still leaving tracked documentation clean. It costs one
docs-only successor commit and requires reviewers to inspect the named tested
commit rather than infer authority from final `HEAD`.

The proof checkout was
`C:\Users\TK\AppData\Local\Temp\music-c10-final-2315a88\checkout`. The active
ignored source `.env.music.test` was never read, repaired, normalized, or
mutated. The supported detached bootstrap generated only disposable authority.
No schema, migration, protected production, registry push, `GATE_PROD`, Task 11,
or Task 12 action occurred.

### Fix-round RED, diagnosis, and minimal GREEN

- Preserved PR failures `20260822090053805-6b0c81cd` (475.123s),
  `20260822091258481-123a8b19` (413.097s), and
  `20260822092807285-2ec4df7d` (284.851s) proved that PostgreSQL lane tasks
  first fell back to the fixture database and then reached a mismatched
  standalone credential generation. Preserved doctor/up failures
  `20260822092100626-805666f5` (0.597s) and
  `20260822092252861-92b26f26` (93.242s) retain the occupied-port and retained
  volume/rotated-credential lifecycle evidence.
- Preserved PR `20260822094515397-b0508b11` (326.504s) retains an original
  critical-coverage failure although its one diagnostic rerun passed. The
  original result remains failure/flakiness and was not promoted. Its peak
  identity-route fetch count and reconciliation timeout did not reproduce in
  either final exact-hash PR sample.
- Preserved release `20260822100930269-3ee9a46c` (995.890s) proved two real
  defects: `real-docker-evidence` wrote identity state to the five-service
  fixture DB but queried the standalone PG sidecar, and the sanitizer redacted
  the numeric `invalidTokensRejected` measurement so persisted telemetry could
  not remain authoritative. Its otherwise-green local-registry envelope and
  its original release failure remain recorded.
- Exact focused RED added two failing contracts: real-Docker fixture evidence
  must strip all standalone-PG authority while actual PG tasks retain it, and
  the sanitizer must preserve only the known nonnegative numeric
  `invalidTokensRejected` measurement while redacting adjacent secret-shaped
  fields. Minimal GREEN introduced the explicit standalone-PG task set,
  task-specific child ambient environment and sidecar attestation, and the
  bounded numeric sanitizer exception. Focused contracts passed 2/2, the full
  qualification contract passed 35/35, scoped Tunes TypeScript passed, and
  `git diff --check` was clean before the same-subject fix commit was amended to
  the tested hash above.

### Clean detached authority and five-service proof

- Root `npm ci` passed with 33 packages and zero reported vulnerabilities.
  Fresh supported bootstrap `20260822102924647-852034e3` passed in 44.350s.
  A commit-labeled `postgres:15-alpine` sidecar was bound only to
  `127.0.0.1:59156`; doctor `20260822103031945-8580513b` passed in 0.607s,
  resume-safe bootstrap `20260822103044624-e3861d18` in 38.473s, and ordered
  doctor `20260822103128978-88bc3f5c` in 0.589s.
- Supported five-service startup `20260822103135243-5fba24fc` passed in
  110.575s. Cold/warm canonical smoke runs
  `20260822103445352-1e9a1506` and `20260822103451359-785aa069` passed in
  0.909s and 0.875s.
- Both release samples independently crossed the five-container fixture. Each
  observed four healthy long-running services plus successful migration exit,
  exactly one stable Music identity row, repeated ensure stability, verified
  owner predicate, an actual Tunes outage, recovery, and compatibility-route
  usage 0.

### Authoritative two-sample lane evidence

Every row below used `npm run --silent music:test:<lane> -- --format json` in
the clean detached checkout. Final exact-hash report paths are relative to
`.artifacts/music-c10-evidence/2315a88/music-runs/`; the complete prior-hash
ledger is under `.artifacts/music-c10-evidence/6c4d6cf/music-runs/`.

| Lane | Sample 1 | Sample 2 | Cross-run p50 / p95 | Budget | Result |
| --- | --- | --- | --- | --- | --- |
| fast | `20260822103501519-af2f84cd`, 19.123s lane wall | `20260822103526644-e5d2ed25`, 5.048s | 5.048s / 19.123s | 3m | 3/3 twice, green |
| PR | `20260822103538644-222bc054`, 340.252s | `20260822104127154-899245a8`, 312.856s | 312.856s / 340.252s | 15m | 14/14 twice, green |
| nightly | `20260822104648344-06b713d3`, 380.004s | `20260822105326051-9451e550`, 381.353s | 380.004s / 381.353s | 45m | 23/23 twice, green |
| release | `20260822110005960-3e8cb9f9`, 993.835s | `20260822111712428-71f677bb`, 973.222s | 973.222s / 993.835s | 60m | 20/20 twice, green |

All eight counted samples had zero original task failures, zero timeouts, and
zero diagnostic reruns. Expected interrupt/resume child runs remain separately
persisted as original failed/interrupted fast commands followed by bounded
successful resumes: `20260822105259790-dc0fed5b` /
`20260822105302033-7087506a`, `20260822105940432-06a66a60` /
`20260822105941191-92ffc9f4`, `20260822110533292-0e265df3` /
`20260822110535511-3c3c4411`, and
`20260822112246078-b3eb05d9` / `20260822112246848-deff555d`.
They are operational evidence, not substituted green lane samples.
The earlier exact-hash ledger likewise retains all three expected
interrupt/resume child pairs: `20260822100245779-8da4f8ec` /
`20260822100246529-5ef88fdf`, `20260822100914086-9e7eed48` /
`20260822100914839-57e41dcb`, and
`20260822101502401-b94d466f` / `20260822101503176-29dea05d`.

Nightly sample 1 observed first/cached/owner/pool p95 values
58.685/31.878/98.128/398.695ms; sample 2 observed
61.179/31.877/103.324/410.893ms. Each crossed 200 cached ensures, 200 ordinary
owner requests with zero Strapi owner fetches, 200 rejected invalid tokens, and
50 concurrent queries through a four-connection pool. Each captured 300 actual
telemetry events with one exact eight-key set, zero forbidden identity keys,
and bounded label-value cardinality 8. Both interrupt/resume measurements were
`verified` for owned-child cleanup and resume.

Both release reports persisted the same complete
`music-operation/v1 real-docker-release` envelope: compatibility usage 0;
migration and readiness failures observed; exact rollback restored; unknown and
pre-floor rollback refused; and kill switch verified. Sample 1 measured the
immutable release rehearsal / real-Docker release at 596.061s / 63.404s;
sample 2 measured 571.824s / 61.940s. No deployment or external registry action
was performed.

### Artifact sanitation, preservation, and cleanup

- All 756 retained files across the final- and prior-hash ledgers, including
  every original failure and diagnostic artifact, were scanned. Match counts
  were zero for developer
  absolute paths, the active source authority path, raw Docker inspect
  `Config`/`Env`/`Mounts`, bearer material, non-redacted secret assignments,
  and PostgreSQL URIs. Both copied evidence trees matched their detached
  sources byte-for-byte with zero SHA-256 mismatches and total 3,169,705 bytes.
- Supported fixture teardown `20260822113401415-dcb511c7` passed in 4.320s with
  volume confirmation. The exact sidecar passed literal name, Task 10 label,
  owner, full commit, image, loopback binding, and sole-volume-use attestation
  before its container and anonymous volume were removed.
- Final read-only checks found fixture containers, qualification containers,
  fixture networks, fixture volumes, release/registry matches, and watched
  listeners on 55432/51337/55000/55173/59156 all at zero. These disposable
  resources are not recoverable.
- After both evidence trees were copied, sanitized, and SHA-256 verified and
  the tracked ledger successor was committed, the final and earlier detached
  worktrees passed exact path, registration, hash, and clean tracked-state
  attestation. Git deregistered each but reported a Windows long-path deletion
  failure. Each bounded residual contained only `tunes` and one verified
  self-referential workspace junction; the exact junction was removed without
  traversal, absence of all other reparse points was verified, and the two
  exact disposable roots were deleted. Both registrations and paths are now
  absent. The removed generated authorities and dependencies are not
  recoverable; the sanitized ignored evidence copies remain.

Task 10 remains unapproved. The controller must dispatch a separate independent
scoped rereview of the tested code hash; this report is not self-approval.

## External rereview fix round 2: exact-commit evidence (2026-08-22)

Every result in this section is bound to the clean detached execution authority
`9000eca66eb66e158bbb70526ccf3c77a08243f6`
(`fix(music): close qualification rereview gaps`). The subsequent
`docs(music): record qualification evidence` commit records the already-produced
results only and was not the execution authority. This controller ruling keeps
the tested code hash unchanged, at the cost of two commits for the fix round and
an explicit tested-parent-hash check by reviewers. Two exact-proof restarts were
also required: one after persisted telemetry exposed over-redaction and one
after three distinct 20-second deployment-process timeouts established a
recurring harness defect. All superseded evidence and setup REDs were retained.

The exact proof checkout was
`C:\Users\TK\AppData\Local\Temp\music-c10-r2-9000eca\checkout`; its generated
evidence was copied byte-for-byte to
`.artifacts/music-c10-evidence/9000eca/music-runs/`. The active ignored source
`.env.music.test` was not read, repaired, or mutated. No schema, migration,
production, external registry push, `GATE_PROD`, Task 11, or Task 12 action
occurred.

### Three rereview findings: RED, diagnosis, and GREEN

- **I1, default-deny fixture contract.** Direct hostile-wrapper REDs proved the
  prior rendered-Compose check admitted empty database/gate mounts,
  `SYS_ADMIN`, wrong digests, and other ambient authority. The validator now
  exhaustively checks all seven expected services: exact repository and digest,
  required read-only secret/config sources and targets, networks, volumes,
  labels, ports, commands/entrypoints, health and dependencies. It rejects
  missing/empty mounts plus dangerous or ambient fields including privilege,
  capability deviations, devices, host namespaces, security options, sysctls,
  extra hosts, env files, builds, raw binds/host paths, and pull/build escapes.
  The final hostile suite passed 23 cases, including empty database/gate mounts
  and `SYS_ADMIN`.
- **I2, release deployment execution.** Exact release-only opt-in
  `MUSIC_C3_TRAEFIK_TEST=1` made `registration-compat-traefik.test.ts` execute.
  Its first real run exposed a stale `${router_security}` YAML substitution;
  the focused RED became 2/2 GREEN. Qualification now requires the exact
  `Test Files 11 passed (11)` summary and fails on any wholly skipped deployment
  file. Both final release samples executed 11/11 files; each reported 192
  passing tests plus one intentional individual-test skip and no file-level
  skip.
- **I3, generic sanitation.** Hostile corpus RED showed
  `MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY` could survive persisted text.
  Sanitization now covers case-insensitive `*_KEY`, `*_SECRET`, `*_TOKEN`,
  `*_PASSWORD`, credential/private/signing/encryption variants in text,
  command arguments, `Config.Env` arrays, and nested objects. A subsequent real
  lane proved harmless numeric telemetry had also been hidden; the minimal
  GREEN preserves only the exact bounded telemetry fields while redacting
  secret-shaped neighbors. The qualification contract passed 37/37.
- Three different full deployment runs then timed out at the former hard 20s
  cleanup bound (`after_ledger`, diagnostic `after_floor`, and public-response
  nonzero cleanup). Healthy focused upper tails were measured at 14.66s for
  crash recovery and 12.73s for public-response cleanup. A source-contract RED
  preceded the smallest scoped fix: only the seven affected recovery cases use
  a 30s Windows process-recovery bound; other tests remain at 20s. Worst-case
  allowance increases by 70s, leaving the 60-minute release budget meaningful.
  Independent focused verification passed all seven affected cases in 97.68s;
  post-fix maxima were 14.60s and 13.16s.

Superseded ledgers remain under
`.artifacts/music-c10-evidence/f2e62c8/music-runs/` (423 files) and
`.artifacts/music-c10-evidence/ee88f1b/music-runs/` (312 files). They retain the
telemetry-redaction release failure, all three recurring timeout samples, their
diagnostics, and every setup/lane failure; none was rewritten or promoted.

### Clean exact authority and two-sample lane matrix

Fresh supported lifecycle commands passed: bootstrap
`20260822155101648-858e11e5` in 43.598s; resume bootstrap
`20260822155217037-235211d0` in 58.712s; doctor
`20260822155343650-df4f309e` in 0.616s; five-service up
`20260822155344836-8cc664a8` in 110.429s; cold/warm smoke
`20260822155544401-bd2f7301` / `20260822155545862-e0fb7649` in
0.907s / 0.824s; and the real fixture browser passed 1/1 in 4.7s. The disposable
PostgreSQL 15 authority was bound to loopback port 59158 and all proof artifacts
used environment fingerprint
`fec1ee2240a6af449afd6180f33e56d18b382e8de9ff86cccc30a78d9819491a`.

Each row used the supported `npm run --silent music:test:<lane> -- --format json`
runner. The named directory contains `qualification-<lane>.json`,
`command-result.json`, and retained task logs.

| Lane | Sample 1 | Sample 2 | Budget | Result |
| --- | --- | --- | --- | --- |
| fast | `20260822155607616-7e32bdde`, 17.994s | `20260822155626165-86779217`, 4.388s | 3m | 3/3 twice, green |
| PR | `20260822155635771-269d68de`, 315.336s | `20260822160156884-2e58c934`, 307.395s | 15m | 14/14 twice, green |
| nightly | `20260822161444088-98270f29`, 418.486s | `20260822162155962-2576e90e`, 435.750s | 45m | 23/23 twice, green |
| release | `20260822162927742-1e3d9ed0`, 1091.969s | `20260822164800804-006d2300`, 1105.629s | 60m | 20/20 twice, green |

All eight counted samples had zero task failures and zero diagnostic reruns.
Nightly setup `20260822160716163-66c7f3c0` remains a failure (429.991s): its
original reconciliation checkpoint timeout and security peak 4>2 were retained
even though both diagnostics passed. It was not counted. Both counted nightly
samples observed bounded real HTTP/service/repository/PostgreSQL load at load 5,
300 telemetry events, one exact eight-key set, zero forbidden keys, value
cardinality 8, and 200 rejected invalid tokens.

Both counted release samples passed all 20 tasks and all 11 deployment files.
Their local-registry rehearsals took 678.47s and 679.59s. Each persisted the
full real-Docker envelope: migration and readiness failures observed, exact
rollback restored, unknown and pre-floor rollback refused, kill switch
verified, compatibility-route usage 0, and bounded telemetry cardinality.

### Artifact sanitation and guarded cleanup

- The final ignored evidence copy contains 278 files. Its sorted byte-manifest
  SHA-256 is
  `36bbf87378c7de377fd6417f1c60ce17f81e7d6b2510b1f5f13beace10c56ed4`
  and matched the detached source byte-for-byte.
- A guarded count-only scan found zero developer absolute paths, zero active
  authority paths, zero raw Docker inspect payloads, zero exact sensitive
  values, and zero generic unredacted sensitive assignments. Post-down cleanup
  artifacts also contained zero unsafe paths/raw inspect/assignments and no
  missing structured redaction placeholders.
- Supported down `20260822170731781-2861a01f` passed in 4.694s. The exact
  sidecar was removed only after literal name, ID, image, commit labels,
  loopback binding, and volume-use checks. Fourteen unattached orphan release
  proxy networks from retained prior evidence were each exact-name/project/
  label/attachment attested before removal. Final fixture/qualification
  containers, volumes, networks, registry matches, and listeners on
  55432/51337/55000/55173/59158 were zero.
- The final and two superseded proof worktrees each passed exact path, detached
  hash, registration, and clean tracked-state checks. Git deregistered them;
  two Windows long-path residues contained only the bounded `tunes` tree and
  one exact self-junction apiece. Each junction target was revalidated and its
  reparse tag removed without traversal, an isolated empty-index dry run named
  only that disposable `tunes` tree, and Git cleared the residual. Fresh clean
  detached registrations at the same exact hashes were then removed normally.
  All three registrations, checkout paths, and parent temporary roots are
  absent. Removed generated authority/dependencies are not recoverable; the
  sanitized ignored evidence copies remain.

Task 10 remains unapproved. The controller must dispatch a separate independent
scoped rereview of tested code hash
`9000eca66eb66e158bbb70526ccf3c77a08243f6`; this report is not self-approval.

## External rereview fix round 3: authenticated manifest evidence (2026-08-23)

Every result in this section is bound to the clean detached execution authority
`ae573ac40709e2a9aca5073105560412cfb799fd`
(`fix(music): authenticate fixture compose manifest`). The subsequent
`docs(music): record qualification evidence` commit records these already-run
results only and was not the execution authority. This preserves the tested
code hash at the cost of a docs-only successor and an explicit tested-parent
hash check by the reviewer. The active ignored source `.env.music.test` was not
read, repaired, or mutated. No schema, migration, production, external push,
`GATE_PROD`, Task 11, or Task 12 action occurred.

The final proof checkout was
`C:\Users\TK\AppData\Local\Temp\music-c10-r3-ae573ac\checkout`; its generated
evidence was copied byte-for-byte to
`.artifacts/music-c10-evidence/ae573ac/music-runs/`. Superseded round-3 ledgers
remain under `.artifacts/music-c10-evidence/8c400c3/music-runs/` (137 files)
and `.artifacts/music-c10-evidence/46f54f8/music-runs/` (79 files), including
all setup failures, three release failures, diagnostics, and expected
interrupt-child failures. Nothing was overwritten or promoted to green.

### I1 and M1: RED, diagnosis, and GREEN

- **I1, authenticated exact Compose authority.** Hostile direct-wrapper REDs
  independently substituted the PostgreSQL, Traefik, Tunes, and every other
  service digest; changed security-relevant environment values; introduced
  wildcard origins, disabled required controls, duplicated/added environment
  entries, altered secret/config targets, and supplied ambient dangerous
  fields. The wrapper now receives authenticated canonical image authority,
  binds every expected service to its exact image reference, and performs an
  exhaustive/default-deny comparison of the seven-service rendered Compose
  contract. Exact allowlists cover production environment values and required
  absences, including kill-switch state and allowed origins, while explicitly
  admitted per-run values remain narrow. All direct probes fail before Docker
  mutation. The final qualification contract suite passed 39/39, and the
  affected critical suite passed 519 tests plus one intentional platform skip
  with 100% critical-module coverage in 50.60s.
- **M1, reproducible evidence hash.** The committed
  `npm run --silent music:evidence-manifest --prefix tunes -- <create|verify>
  <evidence-root> <manifest-file>` utility writes and verifies the exact
  manifest bytes. Serialization is UTF-8 with one
  `relative-path<TAB>byte-length<TAB>sha256` record per regular file,
  forward-slash paths sorted by UTF-8 byte order, LF separators, and no trailing
  newline. Symlinks, non-files, unsafe path characters, byte-length changes,
  path-set changes, digest changes, and non-canonical manifest bytes fail
  closed. The preserved 278-file round-2 corpus verifies against
  `.artifacts/music-c10-evidence/9000eca/music-runs.manifest.tsv` at exact
  SHA-256
  `c9eca9e017e1716e7634f32ae842d531baa705117936776f6b5a10716f16fb55`.
- Two distinct deployment recovery cases exceeded the old 20-second process
  bound at 20.893s and 20.815s. A source-contract RED preceded the smallest
  platform-scoped correction: all tests in that process-heavy file use its
  existing 30-second Windows / 20-second non-Windows bound. Independent focused
  verification passed both prior cases in 19.85s. The full deployment/security
  command then passed 212 tests plus three intentional skips in 718.52s, and
  release-only Traefik verification executed 2/2.
- Two release attempts independently exposed the same hard 5-second
  checkpoint-filesystem proof timeout at 5.055s and 5.495s. Both RED samples
  remain preserved. A second source-contract RED preceded a narrow 10-second
  Windows / 5-second non-Windows bound; the checkpoint test passed twice at
  approximately 1.29s. No unchanged retry loop was used after recurrence.

### Clean exact authority, real services, and retained flake

Supported lifecycle commands on the final authority passed: bootstrap
`20260822202913986-5f19e4e6` in 86.443s; doctor
`20260822203047088-3f5cc0d4` in 0.798s; five-service up
`20260822203055753-e4fbca1a` in 103.885s; cold smoke
`20260822203245919-7bd5928e` in 1.057s; and warm smoke
`20260822203247733-42a475d4` in 1.097s. All clean counted evidence used
environment fingerprint
`507715dc0f6097c6c31b14e412ec29f19dbbefc647ce422a901acd183aa5d56b`
and the exact labeled PostgreSQL 15 sidecar on loopback port 54050.

Nightly `20260822203308780-a7d48e15` is retained as a failure: 22 original
tasks passed, `security-matrices` failed its socket-expiration owner-disconnect
timing assertion, and its 119/119 diagnostic rerun passed. The clean independent
repeat `20260822203959123-449af659` passed 23/23 with no rerun in 373.384s,
inside the 45-minute budget, so the timing flake did not reproduce. That green
run crossed real HTTP/services/repository/PostgreSQL load: 50 concurrent
queries through a four-connection pool at 189.528ms p50 / 298.828ms p95, 200
invalid tokens rejected, five persisted load measurements, and 300 observed
telemetry events with one exact eight-key set, zero forbidden keys, bounded
label-value cardinality 8, and `telemetryCardinality=bounded`.

### Two clean release samples

Both samples used
`npm run --silent music:test:release -- --format json`, remained under the
60-minute budget, used the exact commit/fingerprint above, and recorded zero
original failures, timeouts, retries, or diagnostic reruns.

| Sample | Lane wall | Tasks | Deployment execution | Real local-registry rehearsal |
| --- | --- | --- | --- | --- |
| `20260822204628869-ca335f37` | 1,019.091s | 20/20 | 653.101s; 11/11 files, 214 pass + 1 intentional test skip | 63.384s, attempt 1 |
| `20260822210339326-b67025af` | 1,055.131s | 20/20 | 674.017s; 11/11 files, 214 pass + 1 intentional test skip | 74.585s, attempt 1 |

The second report persisted the cross-run release p50/p95 as
1,019.091s / 1,055.131s. In both samples the fixture browser, disposable
real-Docker proof, interrupt/resume proof, 11-file deployment suite, and shared
engine local-registry rehearsal each passed on attempt 1. Each persisted the
complete operational envelope: compatibility-route usage 0; migration and
readiness failures observed; exact rollback restored; unknown and pre-floor
rollback refused; kill switch verified; and bounded observed telemetry.
Release setup `20260822200532679-be00348d` is retained as a 1,189.307s
measurement failure after its 20 tasks passed because its lifecycle fingerprint
was not authoritative; it was not counted.

### Artifact preservation, sanitation, and guarded cleanup

- The final detached source and ignored copy contain 266 files and matched
  path-for-path and SHA-256-for-SHA-256 with zero mismatches. Canonical manifest
  `.artifacts/music-c10-evidence/ae573ac/music-runs.manifest.tsv` has 266
  records and exact SHA-256
  `59ac329f3346dc51f85d02fad674d889589b716ecdaae73dbf6d07329dfc2370`;
  two independent `verify` invocations reproduced it.
- A count-only sanitation scan over all 267 final files found zero developer
  absolute paths, zero active-source authority absolute paths, and zero raw
  Docker `Config.Env` arrays. Generic secret-shaped assignment scanning found
  no credential assignments; its only lexical candidates were the intended
  harmless numeric/telemetry `metricKeySet` property in six reports/logs,
  explicitly preserved by the sanitizer contract.
- Supported teardown `20260822212255061-6354b986` passed in 4.059s. The two
  exact fixture-owned volumes and the exact PG sidecar were removed only after
  literal names, image, full-commit/owner labels, loopback port, and tmpfs/data
  authority were checked. Final fixture containers, networks, volumes, and
  commit-labeled sidecars were 0/0/0/0; listeners on
  55432/51337/55000/55173/54050 were all zero. These disposable resources are
  not recoverable; the sanitized ignored evidence copies remain.
- The final proof passed exact detached hash and clean tracked-state checks.
  Git deregistered it but reported a Windows long-path deletion failure. The
  residual was confined to the exact disposable checkout and contained one
  verified self-junction back to that same checkout. Its reparse tag was
  removed without traversal, a zero-reparse-point rescan passed, and an
  isolated empty-index dry run named only `tunes/` before bounded cleanup.
  The worktree registration, checkout, and parent temporary root are absent.

Task 10 remains unapproved. The controller must dispatch an independent scoped
rereview of tested code hash
`ae573ac40709e2a9aca5073105560412cfb799fd`; this report is not self-approval.

## External review fix round 4: exact-source fixture authority (2026-08-23)

Tested code commit
`33a90dd6a9e30b2671229e5876d4a663b9b746c1`
(`fix(music): anchor fixture images to exact source`) closes the remaining
round-3 Important finding. This section records evidence for that exact parent;
the later documentation-only successor is not execution authority.

### Design ruling and hostile RED

The only available C0 trust anchor that is independent of caller-selected
fixture material is the tracked program plus Git object database in the exact,
clean checkout executing the rehearsal. A caller-owned expected-image map,
Compose model, manifest MAC key, source root, or disposable root cannot be an
authority: coherently replacing all of them merely lets the caller
self-authenticate its own substitution. Adding a long-lived test secret would
move, not remove, that trust problem and was rejected.

Before edits, the coherent substitution RED replaced the expected image map,
rendered Compose, MAC key, and recomputed MAC together; the old direct fixture
wrapper exited 0. The direct wrapper is now retired and fails before Docker
with one instruction to use the tracked no-input rehearsal. The shared engine
also refuses direct use without its internal adapter. Hostile external
`MUSIC_DEPLOY_*`, root/source, map, Compose, key, digest, PATH-tool, dirty
tracked-source, hidden assume-unchanged/skip-worktree, native-identity swap,
and same-byte TOCTOU probes all fail closed before mutation.

### Minimal GREEN architecture

- `music-docker-release-rehearsal.ts` accepts no caller inputs. It derives the
  repository from its own tracked path, requires a clean exact 40-character
  commit, verifies the executing script through Git's clean/smudge filter
  against the exact commit object, captures `HEAD:tunes`, and revalidates that
  source authority across mutation boundaries.
- Fixed OS-protected Git, Docker, and curl executables are ACL/owner checked;
  Docker is pinned to the inspected local engine. A private ACL-constrained
  sibling root is internally created and native file identity, bytes, size,
  link count, and digest are checked before and after each authority use.
- The rehearsal builds Tunes from the captured Git archive, content-addresses
  the fixed local base images, starts a loopback registry, pushes the exact
  candidates, and accepts only registry-returned immutable digests. Compose,
  environment, request, state key, image allowlist, and fixture policy adapter
  exist only inside the tracked flow and are passed in memory to the exact Git
  object of the shared engine. No external map, MAC key, Compose, source, or
  root is accepted.
- Production GHCR policy, workflow behavior, and `music-deploy.sh` remain
  unchanged and fail closed. No production deployment, external push, schema,
  migration, GATE, Task 11, or Task 12 action occurred.

### Focused, exhaustive, and real-Docker proof

- Authority/direct-wrapper/workflow focused verification passed 54/54 plus
  scoped TypeScript. The protected production executable suite passed 69/69 in
  662.62s. The broader deployment/security qualification passed 12 files plus
  one intentionally platform-gated file, 202 tests plus two intentional skips,
  in 665.57s. Both counted releases independently executed all 12 mandatory
  deployment files, 165/165, with no file-level skip.
- A direct current-hash loopback-registry rehearsal completed in about 52s and
  emitted `compatibilityRouteUsage=0`, observed migration/readiness failures,
  restored exact rollback, refused unknown and pre-floor rollback, verified
  the kill switch, and cleaned its labeled Docker resources.
- Real-Docker REDs found during implementation were retained and fixed at their
  causes: pull the registry-returned digest before local inspection; accept OCI
  index/manifest-list registry media types; compare the executing Windows file
  through Git's filter rather than raw CRLF bytes; and include the new authority
  suite in the mandatory 12-file release inventory.

### Clean exact lifecycle, telemetry, and two release samples

The final detached authority used fingerprint
`57796704523a6f71b85a5d28452c9cf96df4ee2c2847141b541eb3fce6d0b0f7`
and an attested `postgres:15-alpine` sidecar on loopback port 63520. Its exact
supported lifecycle passed: bootstrap `20260822234318462-54fed960` in 83.715s,
doctor `20260822234442874-2160b114` in 0.661s, five-service up
`20260822234444129-7e729363` in 99.762s, and cold/warm smoke
`20260822234624477-5559542e` / `20260822234626066-7187c84e` in
0.981s / 0.954s. Nightly `20260822234635090-27418534` passed 23/23 on attempt 1
in 413.399s with five bounded load measurements, 300 telemetry events, one
exact eight-key set, zero forbidden keys, cardinality 8, 200 invalid-token
rejections, and real PostgreSQL p50/p95 253.400/404.012ms.

| Sample | Lane wall | Tasks | Deployment execution | Real local-registry rehearsal |
| --- | --- | --- | --- | --- |
| `20260822235335428-ecee6d7f` | 1,053.858s | 20/20, attempt 1, zero diagnostics | 652.235s; 12/12 files, 165/165 | 54.497s, attempt 1 |
| `20260823003241997-ea564a06` | 1,005.616s | 20/20, attempt 1, zero diagnostics | 617.979s; 12/12 files, 165/165 | 50.330s, attempt 1 |

Both samples remained below 60 minutes and persisted bounded telemetry,
compatibility usage 0, observed migration/readiness failures, exact rollback,
unknown/pre-floor refusal, and kill-switch verification. Cross-run release
p50/p95 were 1,005.616s / 1,053.858s.

The failure ledger was not promoted or erased. A pre-final 15/20 sample retained
the original missing-standalone-PG repository failures and exposed the release
inventory/CRLF issues. Run `20260822231739348-0a0fdcc8` then passed all 20 tasks
in 1,156.987s but correctly failed measurement authority because lifecycle and
telemetry had a different fingerprint. Cold setup retained an occupied-port
doctor failure and a stale-volume credential failure; supported exact-project
volume reset removed that cause. Initial second sample
`20260823001126379-88d4ff3c` retained 17/20 after a security timing peak and
PostgreSQL cleanup hook contention. The hook left 24 exact `music_c3_*` test
databases; after exact-sidecar attestation they were removed, focused migration
passed 16/16 twice in 18.50/15.83s, and only then was the final second sample
run. No unchanged retry loop was used.

### Evidence preservation, sanitation, and guarded cleanup

- The final checkout and ignored copy match path-for-path and SHA-256-for-
  SHA-256 across 277 files. Canonical manifest
  `.artifacts/music-c10-evidence/33a90dd/music-runs.manifest.tsv` has exact
  SHA-256
  `55abb7deb84df24daffb84b3ec52bd31587fe01e5505d300d5d27dff852b9306`;
  two independent verifies reproduced it.
- Superseded round-4 ledgers are also preserved byte-identically under
  `dfe28ba-r4-evidence` (68 files, manifest SHA-256
  `6af0fdca933877b5112e64ae440df3b28004de716bc0211dd388530f52e033f6`)
  and `dfe28ba-r4-samples` (43 files, manifest SHA-256
  `0647e0c0cc415c4ee42eb633275d5a0a087d6df2db1d8d6a7349eae1e8dabdfd`).
  Across all 388 new files, count-only sanitation found zero developer paths,
  active-source paths, raw Docker `Config.Env`, or credential assignments.
- Supported teardown `20260823005050436-2ffc7e9f` passed in 4.417s. The exact
  sidecar was removed only after full ID, image, owner/commit labels, health,
  and loopback port were re-attested. Final fixture/qualification/rehearsal/
  registry containers, networks, volumes, and watched listeners were all zero.
- Git deregistered all three exact/superseded proof worktrees. Windows long-path
  failures left one verified self-junction in each dependency install and one
  verified dependency junction in the sample checkout; each link was removed
  without traversal before bounded exact-path deletion. Registrations and paths
  are all absent, and the task worktree was clean before this documentation.

Task 10 remains unapproved. The controller must dispatch independent round-4
rereview of tested code hash
`33a90dd6a9e30b2671229e5876d4a663b9b746c1`; this report is not self-approval.

## Round 5 final fixture-authority closeout

Round-four I1 and I2 are addressed in tested code commit
`f7fe99bceca99ee2d7964d45527a9a473d02c184`
(`fix(music): eliminate ambient fixture authority`). The later evidence commit
is documentation only and is not execution authority. Production
`music-deploy.sh`, production workflow behavior, GHCR policy, schemas,
migrations, historical markers, external registries, `GATE_PROD`, Task 11, and
Task 12 were not changed or invoked.

### I1: sanitized runtime boundary

- The no-input rehearsal rejects non-empty Git repository/index/object/config/
  executable/SSH/proxy variables, Docker variables, `BASH_ENV`, `ENV`,
  `CDPATH`, `SHELLOPTS`, `BASHOPTS`, `IFS`, `PROMPT_COMMAND`, `PS4`, exported
  shell functions, `NODE_OPTIONS`, `NODE_PATH`, and `LD_*`/`DYLD_*` before
  source capture or Docker mutation. Git then runs with system/global config
  disabled, no replace objects, no external diff/text conversion, a fixed
  home, and a minimal allowlisted environment.
- All Node, Git, Bash, Docker, Docker Compose, curl, identity, and ACL helpers
  are canonical absolute protected executables. Their ACL/owner, native file
  identity, link count, size, bytes, and SHA-256 are captured and revalidated
  across use. The exact Windows authorities exercised by the final proof were:

| Authority | Canonical executable | SHA-256 |
| --- | --- | --- |
| Git | `C:\Program Files\Git\cmd\git.exe` | `5db0e3a8e7b6cb0aa793b8f11b8caa2317c9da7189e4ab38c027f4fac0bc5a33` |
| Docker | `C:\Program Files\Docker\Docker\resources\bin\docker.exe` | `e2e510d439845d873b8c979c19dda43347bcb5d5a52b2e3ec8f4a2fe0ac16208` |
| Docker Compose | `C:\Program Files\Docker\cli-plugins\docker-compose.exe` | `d1fa4f80979ee9cb8454c6e2721764be5abbd31d3577f83595ea1b7bb02d72c5` |
| Bash | `C:\Program Files\Git\bin\bash.exe` | `581414addd001643ccf6d0eba233a8c9c27b99ee703e74e702fb22ae4d47c724` |
| curl | `C:\Program Files\Git\mingw64\bin\curl.exe` | `de7a1483e5e52e6b9714acbf0c5d588165cbe83c28fad3080cb8d7a49fb50c8d` |
| Node | `C:\Program Files\nodejs\node.exe` | `63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088` |
| whoami | `C:\Windows\System32\whoami.exe` | `23240ef9f8b0a9a324110b1c2331de31dc1b0e08f5359cb707e51a939af56cd3` |
| icacls | `C:\Windows\System32\icacls.exe` | `cb9e55d4c02f4e55100724d2da9a1267f49e196bd39fcdf36cec6ea6314fad2a` |

- Child `PATH` contains only protected Git Unix/MinGW, Node, and Windows system
  directories. Bash is invoked with `--noprofile --norc`; the generated adapter
  performs hashing and manifest parsing in the protected Node executable, not
  ambient `sha256sum` or `awk`.
- Docker is pinned to `npipe:////./pipe/dockerDesktopLinuxEngine`, and the
  inspected server must be exactly `linux/amd64`. Every Docker call includes
  that endpoint plus an ACL-constrained private config containing only
  `{"auths":{}}`; caller contexts, hosts, configs, credentials, and helpers are
  unavailable. Private source/Compose/request/key/adapter authorities retain
  byte, digest, and native-identity checks through the shared engine.

Strict RED preceded these changes. Twenty-four caller Git/shell/Docker/Node
override cases reached old code; a hostile `BASH_ENV` with counterfeit
`sha256sum`/`awk` let a tampered old adapter pass. The final override matrix
rejects every case before mutation, while hardlink, inherited ACL, protected
Compose-plugin, Windows command-size, manifest conversion, tag eviction, and
TOCTOU tests remain fail closed. Focused authority, workflow-security, and lane
contracts pass 96/96; scoped TypeScript passes; the six REST/GraphQL/socket
security files pass 119/119. A direct exact-hash local-registry rehearsal also
completed with compatibility use 0, observed migration/readiness failures,
exact rollback restored, unknown/pre-floor rollback refused, and the kill
switch verified.

### I2: immutable prerequisite and build images

Only one reviewed platform is admitted. A server that is not `linux/amd64`, an
unsupported platform, a missing offline digest, or an inspected ID/OS/
architecture/RepoDigest mismatch fails closed. No tag is pulled or substituted.
Each digest is inspected before use, passed to create/build/Compose with
pull-never semantics, and rechecked across loopback-registry transfer.

| Image role | Reviewed immutable reference |
| --- | --- |
| loopback registry | `registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373` |
| PostgreSQL 15 | `postgres@sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c` |
| Traefik | `traefik@sha256:74d72c7a1345984f186bddbabcc462b2128d0d8054177dc84afaeac4db1f0f56` |
| Node/build base | `node@sha256:51eff88af6dff26f59316b6e356188ffa2c422bd3c3b76f2556a2e7e89d080bd` |

Before implementation, retagging each mutable prerequisite and changing the
platform was accepted. The final substitution contracts reject each case
before the first Docker mutation. The derived Dockerfile itself names the
reviewed Node digest, and later registry-returned digests authenticate only
content already anchored to these reviewed inputs and the captured exact Git
archive.

### Contention diagnosis and release scheduling

The failure ledger was preserved instead of hidden by timeouts. At
`7acde8c73e6dab974c3fb8f32c9bddcf44f14d95`, release sample
`20260823043035679-a80c6a2b` passed 20/20 in 1,288.997s, but sample
`20260823045220814-f2a0a78a` retained 17/20 in 2,284.621s: PostgreSQL
integration and identity coverage hit their existing 10s `afterAll` bounds,
and two deployment tests hit 30s while their diagnostic rerun passed. This was
filesystem/database lane contention, not the previously observed `57P01`.

Strict lane RED proved critical coverage still shared a six-way static stage
and the nested PostgreSQL/deployment Vitest tasks lacked a file-worker cap.
GREEN runs Tunes and Explorer critical coverage in a serial stage before the
remaining parallel static tasks, and passes `--maxWorkers=1
--fileParallelism=false` to PostgreSQL integration, both PostgreSQL coverage
gates, PostgreSQL load/chaos, and the release rehearsal. No timeout increased.
The lane contract passes 41/41; critical coverage passes 24 files with 519
tests and one platform skip at 100% per-file thresholds. Both final releases
then passed PostgreSQL integration and all deployment files on their first
attempt with no cleanup or filesystem timeout.

### Clean exact lifecycle and two eligible releases

The final detached proof used commit `f7fe99b...d02c184`, environment
fingerprint
`de1937d3d70aad1fe5a2f0fafb950882acdfa47298d13749b9d3e406e4002ee6`,
and exact labeled PostgreSQL sidecar ID
`b37783cdb9976b09fa28445d4f4730dfb2fcef231d830074180135b94dd893a0`
on loopback port 63523. The sidecar used the reviewed PostgreSQL digest and
literal required image name; its owner/commit/name/image/health/port were
attested before use. After the fingerprint-bearing bootstrap rotated the proof
credential, the new secret was passed through a file, installed by a fixed
in-container command, removed from staging, and verified over TCP without
printing it.

The same authority passed final bootstrap `20260823060054210-ef4b883a` in
61.841s, doctor `20260823060257753-63eaddb1` in 0.728s, five-service up
`20260823060303015-56b043d9` in 116.824s, and cold/warm smoke
`20260823060505932-bfde4c48` / `20260823060507543-d9357ec7` in
0.980/1.190s. Nightly `20260823060513674-73ed608f` passed 23/23 on attempt 1
in 504.857s with zero diagnostics, p50/p95 9.184/65.753s, five bounded load
records, 300 telemetry events, one exact eight-key set, zero forbidden keys,
cardinality 8, 200 invalid-token rejections, and PostgreSQL p50/p95
274.172/428.329ms.

| Release sample | Lane wall | PostgreSQL integration | Deployment rehearsal | Real local-registry |
| --- | --- | --- | --- | --- |
| `20260823061350550-b9f83482` | 1,345.238s; 20/20, attempt 1, zero diagnostics | 10 files/119 tests, 32.75s | 12 files/205 tests, 833.58s | 91.517s, complete envelope |
| `20260823063635972-5a15946d` | 1,281.117s; 20/20, attempt 1, zero diagnostics | 10 files/119 tests, 32.89s | 12 files/205 tests, 790.37s | 88.075s, complete envelope |

Both are below 60 minutes; cross-run p50/p95 are 1,281.117/1,345.238s. Every
task has original status success, one attempt, zero timeout, and no diagnostic
rerun. Both registry measurements record compatibility use 0, observed
migration/readiness failures, restored exact rollback, unknown/pre-floor
refusal, and kill-switch verification. The earlier exact-hash green sample and
every generated authority/lane failure artifact remain in the preserved
ledgers. Terminal-only operator setup errors occurred before qualification
sampling: one direct rehearsal clean check rejected before Docker mutation and
then passed both isolated capture and the complete rehearsal; the first
sidecar role-update command named a nonexistent default role before alteration;
and two auth-probe invocations failed to compile/resolve before the final TCP
probe returned only `sidecar-auth-ok`. None was promoted as evidence, and no
unchanged retry was used to replace a failed qualification sample.

### Final evidence, sanitation, and cleanup

- The final source and ignored copy match at 148 files/478,770 bytes. Canonical
  manifest `.artifacts/music-c10-evidence/round5-f7fe99b-final/music-runs.manifest.tsv`
  verifies twice with SHA-256
  `17b14fda7f24bc150116ddc178fe0d2a4160e1f814ea11e04a1cb078aa6761a5`.
- Pre-scheduling evidence remains under `round5-aef0855-pre-scheduling` (359
  files/1,094,616 bytes; manifest SHA-256
  `2b6223ee7a7e6ea51018f92584b5819e4a13fe085e4961518f41c495054aa445`).
  Pre-worker-cap evidence remains under `round5-7acde8c-pre-worker-cap` (169
  files/616,940 bytes; manifest SHA-256
  `981117855e16f03da17e75713a5f8ef2d080ff1264b991f36629aa7354e419b8`).
  Across all 679 files/2,280,083 bytes, count-only sanitation found zero
  developer paths, active proof/source paths, raw Docker `Config.Env`, or
  credential assignments.
- Supported teardown `20260823065819655-4059b4b9` passed in 4.654s. The exact
  sidecar and four named volumes were removed only after literal ID/name/image,
  digest, full commit/owner labels, health, loopback port, and Compose volume
  labels were re-attested. Final fixture, qualification, rehearsal, registry
  containers/networks/volumes and watched listeners are all zero.
- The two final proof self-junctions were verified to target only their own
  exact roots and unlinked without traversal. Git then removed the final f7,
  pre-worker-cap 7ac, and superseded round-three registrations; the bounded
  unregistered round-five residual and empty round-three parent were removed
  after exact temp-parent/name checks. All Task 10 proof registrations and temp
  roots are absent.

Task 10 remains unapproved. The controller must dispatch independent round-5
rereview of tested code hash
`f7fe99bceca99ee2d7964d45527a9a473d02c184`; this report is not self-approval.

## Final breaker ruling: pre-Node fixture authority

Ruling: round-five's `NODE_OPTIONS` finding is real and load-bearing. The cost
if this ruling were wrong is limited to the native launcher and its tests; the
cost of ignoring a correct finding is much larger: caller preload code can
mutate Docker or the filesystem before an in-process rejection, invalidating
the claimed no-input exact-source release evidence.

Tested code commit `b5150274f5763db7d633988d6562930dedb5e4ee`
(`fix(music): gate fixture authority before node`) therefore makes the native
Windows/PowerShell or POSIX launcher the only supported fixture release entry.
It rejects Node loader/import/inspect/profiling variables before Node starts,
uses canonical protected executables and a minimal environment, and passes a
one-use 64-hex attestation through anonymous stdin plus argv. The module-private
channel consumes that attestation; a caller-set environment flag cannot forge
it. Direct Node invocation refuses `test:release` before deployment. The native
TypeScript resolver/transform/register chain removes npm/tsx from this trust
boundary. Existing Git/Docker/Bash/PATH sanitation, immutable image digests,
private Docker config/endpoint, TOCTOU checks, and production policy remain in
force; the production wrapper was not changed.

Strict RED showed the old Node entrypoint executed a hostile preload marker
before its rejection. GREEN proved the native launcher rejects before Node
starts with no marker, and direct Node cannot reach mutation. The reviewer's
disposable `%TEMP%\music-c10-r5-deps` root was inspected as task-owned, its one
self-junction unlinked without traversal, and the bounded temp root removed;
it was temporary-only and is not recoverable.

### Scheduler and browser isolation RED/GREEN

The first final-hash candidate `d165b00d201b658a59808f237fd4581995a6802a`
retained nested `--maxWorkers=1 --fileParallelism=false`, but nightly
`20260823110056536-b7884b7c` failed 19/23 with three diagnostic reruns. Critical
coverage crossed an existing 15-second test bound, isolated CLI crossed two
existing 5-second bounds, PostgreSQL observed a loaded-run timing race, and
fullstack auth finished at `/home`. No timeout was increased.

The lane scheduler RED failed 1/43 because no global concurrency authority
existed. GREEN caps the complete inherited nightly/release scheduler at one
task on Windows and batches at most two tasks elsewhere; batch maxima are
summed so the 45/60-minute budgets remain honest. The executable peak contract
passes 44/44. Candidate `e42a19af23829a45b279d59451c7d59d53ba2f65`
then cleared every resource-related failure but nightly
`20260823113330511-c0bea784` retained one deterministic fullstack failure on
both attempts (22/23, 584.333s). The affected journey passed alone and after
either predecessor, but failed when all three auth journeys shared one worker.
Playwright parallel-mode worker scoping, with the configured global worker
count still one, isolates those journeys without increasing concurrency or a
timeout. RED was 2/3 in the complete auth file and 11/12 in the exact fullstack
command; GREEN is 3/3 and 12/12.

Final focused proof passed 68/68 authority/scheduler/workflow tests, isolated
clean bootstrap 2/2, scoped TypeScript with zero diagnostics, exact fullstack
12/12, and capped critical coverage 24 files with 519 tests plus one Windows
skip and 100% per-file coverage.

### Exact `b515027` lifecycle and eligible releases

The final detached proof used exact labeled PG15 sidecar
`b3e29a2a6624ae31b05c247bced13477ce6c48c1c300296fd2b8fba9c9de5ede`
on loopback port 57232. Its literal `postgres:15-alpine` tag mapped to reviewed
image ID `sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c`
on `linux/amd64`; ID/name/image/labels/health/port and the required
login/superuser/createdb/createrole role plus `music_fixture` were attested.

- bootstrap `20260823115122112-5b6ae2ea`: 63.258s
- doctor `20260823115315506-926f06e0`: 0.715s
- five-service up `20260823115349442-b3536acf`: 129.323s
- cold/warm smoke `20260823115614317-c3a68a99` /
  `20260823115646701-e6e1b594`: 1.468/0.986s
- nightly `20260823120155060-96083e34`: 23/23 original successes, zero
  failures/timeouts/reruns, 549.061s

| Native release sample | Lane wall | Deployment | Result |
| --- | ---: | --- | --- |
| `20260823121124689-11df7496` | 1,342.562s | 12/12 files, 205/205, 831.32s | 20/20 attempt 1 |
| `20260823123435053-0a1b0dc5` | 1,360.215s | 12/12 files, 205/205, 841.11s | 20/20 attempt 1 |

Both samples are below 60 minutes, have zero diagnostics, and record five
bounded load measurements, 300 telemetry events, one exact eight-key set, zero
forbidden keys, cardinality eight, 200 invalid-token rejections,
interrupt/resume verified, compatibility use zero, migration/readiness failure
observation, exact rollback restoration, unknown/pre-floor refusal, and kill
switch verification. Cross-run release p50/p95 are 1,342.562/1,360.215s.

The failure ledger was preserved without promotion. It includes the `d165`
nightly, `e42` browser-only nightly, preload RED, earlier launcher/config/path/
transform failures, and terminal-only operator errors: wrong teardown syntax;
two fail-closed sidecar label/name expectations; reserved PowerShell `$Host`;
clean-bootstrap inheriting an unrelated standalone-PG commit; and two
ANSI-unaware deployment-summary validators. None mutated production or was
substituted for an eligible release.

### Final evidence and cleanup

Final ignored evidence contains 144 files/964,227 bytes at
`.artifacts/music-c10-evidence/breaker-b515027-final/music-runs`; its canonical
manifest verifies twice with SHA-256
`63b9166712ca9d45d0ed3d54d22a9b2d812dbedf879ca8df28b91f06e8c1c1ab`.
The new `d165` and `e42` ledgers contain 74 and 69 files with verified manifest
SHA-256 values `5fc66d50b883a651380a8ec3cf56df99ff2e54c40431aa8d600d6ba95cd9dee5`
and `e9e4bfb9c59f528c1fd7e776fb59537ceabfedfb457ade8218789538ccb4baf9`.
Across all 290 files/1,411,326 bytes, count-only sanitation found zero developer
paths, proof paths, raw Docker `Config.Env`, or credential assignments.

Supported teardown `20260823125848699-dcd61cc0` passed in 4.611s. The exact
sidecar was removed only after full re-attestation. No schema, migration,
production, external push, `GATE_PROD`, Task 11, or Task 12 action occurred.
All nine bounded node-gate proof registrations and temp roots were removed
after non-traversing reparse inspection and exact-root validation; the three
self-junctions found targeted only their own proof roots and were unlinked
before removal. The reviewer dependency temp root remains absent. A final scan
through the explicit local npipe endpoint found zero Task 10 containers,
networks, volumes, or watched listeners. The active source `.env.music.test`
was neither directly read nor modified.
Task 10 remains unapproved pending the controller's final scoped rereview of
`b5150274f5763db7d633988d6562930dedb5e4ee`; this is not self-approval.

### Controller breaker adjudication

The final scoped reviewer reported 0 Critical, 1 Important, and 1 Minor. The
Important finding is parked: a direct Node caller can forge the in-process
launcher channel, but that caller already controls arbitrary pre-import code
under the same local OS user and Docker authority. Ruling: the supported trust
boundary begins at the native launcher; preventing an unsupported same-user
caller from exercising equivalent Docker authority requires a new privileged
native broker or OS service outside C10. Cost if wrong: that caller could enter
fixture rehearsal through unsupported direct Node invocation instead of
calling Docker directly.

The Minor finding is deferred: the POSIX launcher rejection regex does not
match every `NODE_*` name, although `env -i` strips those variables before
Node. Carry it to Task 11/final review.

Task 10 is complete by controller breaker adjudication at tested code authority
`b5150274f5763db7d633988d6562930dedb5e4ee`, with docs-only evidence successor
`a19d493635a06f75be9fd45d3e236dfd9a406f04`. This is an explicit boundary
ruling, not a claim of cryptographic launcher authentication or reviewer
approval. Production, external push, and `GATE_PROD` remain closed.
