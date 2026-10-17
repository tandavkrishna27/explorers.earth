# Tunes deployment

## Production authority

`.github/workflows/tunes.yml` is the sole image-build and publication authority. A protected `main` push runs the release dependency chain, builds the checked-in multi-stage Dockerfile, verifies the runtime and migration artifacts, scans the image, publishes provenance, pushes the canonical GHCR package with a full-commit tag, and exposes the immutable registry digest. Production promotion then calls the internal reusable `.github/workflows/tunes-deploy.yml` with that digest.

Operators must follow the [immutable deployment runbook](../operations/music-deploy-runbook.md). The checked-in `tunes/deployment/music-deploy.sh` wrapper is the only bootstrap, deploy, and rollback entrypoint. It admits only the canonical digest-qualified image, verifies provenance and OCI labels, authenticates the request and retained state, runs ordered migration/readiness gates, and promotes only after all controls pass. Manual dispatch permits the one-time attested legacy bootstrap or a retained-digest rollback; normal deployment remains internal to the protected main workflow.

Local `npm run build` or `npm run start` may verify developer changes, but local builds, branch names, mutable tags, and ad hoc infrastructure commands are not production authority.

## Image and runtime topology

The image build produces the Vite frontend and bundled Express server in one artifact. The same digest supplies the application, migration gate, readiness checks, compatibility checks, and rollback metadata. Express serves the frontend, HTTP API, and Socket.IO boundary from the configured application port.

The root `docker-compose.yml` defines the production topology consumed by the checked-in deployment engine. `tunes/docker-compose.yml` is intentionally non-runnable, and `docker-compose.test.yml` is fixture-only. Do not substitute a local Compose build or an operator-authored topology for the attested image and generated deployment state.

The runtime database credential is least-privileged and separate from the migrator credential. Secret-bearing environments and credentials are passed through protected files and descriptors described in the runbook; they are not committed, logged, placed on command lines, or copied into a fixed environment file.

## Migration and promotion order

Schema evolution uses reviewed append-only SQL files from `tunes/migrations/`, in the exact order published by `tunes/shared/music-migration-contract.ts`. The candidate image performs the migration gate with the dedicated migrator role, records the authenticated schema epoch, and proves application readiness against the resulting schema before traffic promotion.

Applied migration bytes and journal rows are immutable. Changes use expand/contract compatibility and forward recovery. A rollback may select only a retained, authenticated digest at or above both the permanent security floor and active schema floor; it never reverses an applied migration or restores retired identity behavior.

## Environment and branch controls

Only a protected `main` push can enter the normal production call path. The `tunes-production` GitHub environment is limited to protected branches, holds production-scoped credentials, and enforces its configured independent reviewers. Workflow and deploy preflights fail closed if repository, branch, environment, provenance, digest, or credential authority differs from the published contract.

Use environment variables for non-secret environment-specific configuration and protected file authorities for production secrets. Never hardcode URLs, credentials, or environment-dependent values. See [Environment Variables](../environment-variables.md) and the runbook for the exact allowlist.

## Monitoring and recovery

- Liveness is process-only; readiness proves database, schema, security floor, and required dependency state.
- Sanitized deployment evidence records the commit, digest, migration marker, timing, readiness, promotion, and recovery results without bearer values.
- Application, database, Socket.IO, identity lifecycle, reconciliation, and credential-revocation signals are monitored through the approved platform integration.
- A failed migration, readiness, provenance, or promotion check keeps the prior healthy route active and leaves production closed.
- Rollback, kill-switch, incident, and reconciliation procedures are defined by the immutable runbook and linked incident runbooks; do not improvise alternate mutation paths.
