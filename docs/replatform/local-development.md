# Disposable local platform environment

Ticket 1.2 runs the current Explorers client and Tunes API against disposable local fixtures. It does not use hosted application data, production credentials, or a real provider account. The canonical account, profile, and content tables and acceptance personas are owned by Epics 2–3; the current acceptance seed creates only the existing Music fixture identity. Do not treat it as a completed cross-domain acceptance dataset.

## Prerequisites

- Node.js 24.21.0 (24.x), npm, Git, and Docker with Compose v2. Docker Desktop is supported on Windows; a local Docker socket is required on Linux/macOS. Remote Docker contexts and inherited database/test-authority variables are refused.
- Install the checked-in package locks with `npm ci` at the root and `npm ci --prefix tunes` and `npm ci --prefix explorers-earth`. Docker builds the fixture API and web gateway images on first provision.
- Keep loopback port 51434 available for PostgreSQL's declared binding, 51474 for the gateway, and 5175 for Vite. On Windows, check `netsh interface ipv4 show excludedportrange protocol=tcp` if Docker reports a port allocation failure. No hosted provider secret is needed.

## Commands

Run from the repository root:

```text
npm run platform:local -- provision
npm run platform:local -- check
npm run platform:seed -- --dataset acceptance
npm run platform:seed -- --dataset acceptance
npm run platform:test:integration
npm run platform:test:routes
npm run platform:local -- start
# In another terminal while Vite is running:
npm run platform:test:browser-egress
```

`provision` creates the exact `explorers-replatform-local` Compose project and `music_fixture` PostgreSQL 15 database, runs migrations, then starts the private API and the fixed-upstream web gateway. It records the container ID and source commit in ignored `.replatform-local/authority.json`. The generated fixture secret files and receipt stay in that directory and are never printed. A complete, regular-file secret inventory can be reused after an interrupted provision; partial, linked, unexpected, or mismatched state is refused.

`check` validates the receipt, live container identity and labels, loopback binding, private network, PostgreSQL version, and migration count. `platform:test:integration` requires this check before it runs the existing disposable Music UAT database harness; that harness still creates isolated databases for its tests. `platform:test:routes` probes the current mounted auth, analytics, lifecycle, Music, and Strapi handlers through the gateway. `seed` upserts the current fixture Music identity and verifies its one-row stable ID, so rerunning it does not multiply that identity.

`start` ensures the API and gateway are healthy, then starts the existing Explorers Vite app at `http://127.0.0.1:5175` in the foreground. Stop Vite with Ctrl+C. The gateway is at `http://127.0.0.1:51474`; Vite forwards application requests only to that loopback gateway and does not load project dotenv files. The gateway has fixed internal upstreams and no arbitrary URL forwarding. PostgreSQL, Tunes, and Strapi are attached only to the internal Docker network, which denies their direct hosted egress. Both Vite and the static gateway send a local-only CSP. With Vite running, `npm run platform:test:browser-egress` checks both browser entrypoints with a synthetic nonlocal TEST-NET destination; the existing E2E hosted-egress guard remains an additional check. The static gateway can serve the fixture web build at port 51474 without Vite.

`npm run platform:local -- stop` stops the owned containers and retains local volumes and receipt. Cleanup attests the exact receipt, source revision, Compose model, recorded PostgreSQL container, and every present project resource. It does not require application health or migrations to have succeeded, so an interrupted application build can be stopped safely. Undeclared resources, foreign name collisions, and changed ownership are refused. Qualification commands continue to require application and migration readiness. `provision` or `start` can restart the fixture. `npm run platform:local -- reset` removes only the exact attested Compose project and its volumes after checking the recorded container and resource ownership. Reset writes a local intent so a following `provision` can reuse complete interrupted fixture secrets. A source commit change invalidates `check`, `start`, `stop`, and `seed`; `reset` still accepts the exact recorded authority so you can reprovision from the new revision. Never repoint this wrapper to a QA or production database.

Build failures emit only fixed phase, cause, and build-stage categories. A failed BuildKit step can identify `base-image-pull`, `npm-build-command`, or another `build-command`; ambiguous or missing step evidence remains `unknown`. A rate-limit category alone does not identify which registry failed. Raw child logs, registry URLs, image names, and credentials are never included in these diagnostics.

The fixture-mode API preserves the current native route graph, including optional auth, analytics, lifecycle, and Music integrations; external provider calls are contained by the private network. Canonical profile/content routes, the account/persona seed manifest, and the dedicated real-API browser harness remain pending their owning tickets. Ticket 2.3 must introduce the base local nonproduction object-storage adapter for profile/avatar/background uploads; ticket 3.2 extends it for catalog media. The current Strapi fixture is an identity/profile projection, not proof of writable object storage. Real provider smoke runs require a separately selected nonproduction configuration.
