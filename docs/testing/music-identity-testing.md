# Music identity testing and clean-checkout guide

## Prerequisites and safe target

Use Node 24.21.0 (24.x), npm, and Docker Compose v2. Run from the repository root. Fixture mode is the default and uses deterministic fake Strapi plus disposable PostgreSQL 15. Never create or export `DATABASE_URL`; the only test database authority is `DATABASE_URL_TEST=postgresql://music_migrator@127.0.0.1:55432/music_fixture`, created and validated by bootstrap. Every migration/reset/integration command refuses any different host, port, user, or database name.

From a clean checkout:

```text
npm ci
npm ci --prefix tunes --legacy-peer-deps
npm ci --prefix explorers-earth
npm run music:bootstrap -- --mode fixture
npm run music:doctor -- --mode fixture
npm run music:up -- --mode fixture --detach --wait
npm run music:test:smoke -- --mode fixture
npm run music:down -- --mode fixture
```

`music:down` preserves volumes. Volume deletion requires the exact isolated Compose project and matching `--confirm-project`; it refuses unlabeled or mismatched resources. Do not inspect, copy, or commit the generated `.env.music.test` or `.artifacts` credentials.

After an ordinary `music:down`, the generated credentials are retired while the database volume is intentionally retained. A subsequent bootstrap refuses to rotate new credentials over that database. To discard the fixture database, run the exact confirmed recovery command and then bootstrap again:

```text
npm run music:db:reset -- --mode fixture --target test --confirm-project explorers-music-fixture --confirm-reset "RESET explorers-music-fixture/music_fixture"
npm run music:bootstrap -- --mode fixture
```

The retired-authority reset validates and re-inspects the exact Compose volume names and fixture labels immediately before deletion. It does not read or reconstruct retired passwords and refuses missing, replaced, differently labeled, or production-like resources.

## Executable lanes

| Lane | Budget | Command | Proof |
|---|---:|---|---|
| fast | 3 minutes | `npm run music:test:fast -- --mode fixture` | scoped types plus focused Tunes and Explorer Music units |
| PR | 15 minutes | `npm run music:test:pr -- --mode fixture` | critical 100% coverage, normalized diagnostics, full units/contracts/security, disposable migrations/real DB, browser smoke |
| nightly | 45 minutes | `npm run music:test:nightly -- --mode fixture` | full-stack and accessibility browsers, load/chaos, interruption/resume, fixture drift |
| release | 60 minutes | platform-native launcher below | exact fixture/digest, real Docker migration/readiness/rollback/kill-switch rehearsal and sanitized evidence |

`music:test:all` runs `npm test --prefix tunes`; it is the complete Tunes Vitest suite, but it does not run the Explorer, real PostgreSQL, browser, load/chaos, or release lanes. The full supported non-production progression is fast, PR, then nightly. Those lanes remain separate so their prerequisites, budgets, evidence, and recovery behavior stay explicit.

Release has intentionally no root npm shortcut. Qualification is supported on
Windows through the checked-in PowerShell launcher and on a narrowly defined
Linux qualification host. macOS is not a supported release-qualification host;
an nvm-managed or other user-writable Node is not qualification authority.

The Linux host must provide regular, non-symlink `/usr/bin/node`, `/usr/bin/git`,
`/usr/bin/sha256sum`, and `/usr/bin/find` files owned by root with mode `0755`.
Node must be exactly v24.21.0. The pinned workflow installs both Node and npm
from the official Linux x64 archive only after verifying SHA-256
`fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`,
then protects npm at `/opt/explorers-music-node-v24.21.0`; neither ambient npm
nor caller `PATH` is authority. Its npm CLI SHA-256 is fixed as
`8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7`.
Nightly also installs the lockfile-pinned
Playwright Chromium with OS dependencies at `/opt/explorers-music-playwright`.
Both trees are root-owned and group/world non-writable. The native preflight
validates these authorities, including the one Chromium executable against its
protected `.chromium-executable.sha256` installation manifest, before Node
starts. Reproduce the fixed-file prerequisite check before qualification:

```sh
test "$(/usr/bin/node --version)" = v24.21.0
test "$(/usr/bin/stat -c '%u:%g:%a' /usr/bin/node)" = 0:0:755
test "$(/usr/bin/stat -c '%u:%g:%a' /usr/bin/git)" = 0:0:755
test "$(/usr/bin/stat -c '%u:%g:%a' /usr/bin/sha256sum)" = 0:0:755
test "$(/usr/bin/stat -c '%u:%g:%a' /usr/bin/find)" = 0:0:755
test "$(/usr/bin/stat -c '%u:%g:%a' /opt/explorers-music-node-v24.21.0/bin/npm)" = 0:0:755
test "$(/usr/bin/stat -c '%u:%g:%a' /opt/explorers-music-node-v24.21.0/lib/node_modules/npm/bin/npm-cli.js)" = 0:0:755
test -z "$(/usr/bin/find /opt/explorers-music-node-v24.21.0 /opt/explorers-music-playwright -xdev \( ! -uid 0 -o ! -gid 0 -o -perm /022 \) -print -quit)"
```

Run the checked-in launcher from the repository root with the command for the
supported host:

```text
# Windows
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tunes\scripts\music-release-launcher.ps1 -Mode qualification

# Linux qualification host
/usr/bin/env -i HOME=/ PATH=/usr/bin:/bin /bin/sh tunes/scripts/music-release-launcher.sh qualification
```

Record the exact commit, image digest, migration marker, fixture version, timing, sanitized artifacts, recovery results, and independent review in the [release evidence template](music-release-evidence-template.md). Direct npm/tsx execution is unsupported because it would allow Node startup authority to run before the native guard. No test command opens `GATE_PROD`, deploys, pushes, or mutates a live service.

## Dependency order

The release dependency chain gates static baseline, unit and per-file critical coverage, API/route/environment/migration contracts, disposable migrations and real PostgreSQL repositories, REST/Socket.IO security, Explorer frontend, browser E2E/accessibility, scheduled load/chaos, and image/deployment contracts in that order. Documentation contracts run independently and remain triggerable for documentation-only changes rather than becoming the first release dependency.

Contract tests fail when a stable Music route lacks policy/OpenAPI coverage, a runtime table is absent from the manifest, a migration ID/file diverges, a stable error code is not documented, a public command disappears, a required fixture environment value is missing, a new TypeScript diagnostic appears, or a forbidden owner/auth pattern returns.

Critical identity, authorization, token, lifecycle, selection, precedence, and redaction modules require 100% lines, branches, functions, and statements per file. Repository-wide legacy debt may not regress. Tunes is Express 5.2 at runtime with Express 4.17 type definitions; the scoped gate protects new Music code while the normalized baseline prevents new legacy diagnostics. Both clients are React 18.3.

## Evidence and failures

Every CLI result uses the versioned human/JSON envelope, stable exit code, run ID, phase, duration, sanitized artifact paths, checkpoint, and recovery command. A prior green is not current evidence: rerun the focused test, the affected lane, `npm run music:types:scoped`, `npm run music:types:baseline`, and `git diff --check` before committing.

Exit 1 is a verification failure, 2 usage/config, 3 prerequisite/state mismatch, 4 dependency unavailable, 5 safety refusal, 78 native release authority refusal, 130 interruption. Interrupts clean owned children and write an atomic checkpoint; resume rejects a different commit, fixture version, gate set, migration epoch, thresholds, or environment fingerprint.
