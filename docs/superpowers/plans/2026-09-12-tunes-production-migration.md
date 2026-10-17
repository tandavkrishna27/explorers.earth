# Tunes Production Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the evidence-gathering tasks inline. Production cutover is blocked until the decision gates below pass.

**Goal:** Deploy the reviewed Tunes release without losing existing data or interrupting the existing route prematurely.

**Architecture:** Preserve the running legacy service while proving the new image, database transition, and ingress compatibility separately. Do not treat successful SSH preflight as deployment readiness.

**Tech Stack:** GitHub Actions, Docker/Compose, ARM64 Linux, PostgreSQL 15, Node 22, Traefik.

**Spec:** Existing `docs/operations/music-deploy-runbook.md`, qualified by the actual host evidence from Actions run 34699357360 and the user's requirement to preserve existing functionality and data.

## Global Constraints

- Keep GATE_PROD absent until every release prerequisite passes.
- Do not print environment values, private keys, database rows, or secret files.
- Do not delete/recreate the production database, reset migrations, infer ownership by username/email, or relabel the running container to bypass validation.
- Do not change Strapi code or permissions.
- Never claim production verification from fixture-only tests.

## Verified facts and unresolved questions

- Host is ARM64; build job uses ubuntu-24.04 with no explicit image platform. Inspect the published image platform before changing the build; native ARM build/test is the preferred candidate, subject to runner and scanner support verification.
- `/opt/explorers` is absent. This is not merely a mkdir fix: Compose expects credentials, networks, routing, and signed deployment state there.
- Running container is `tunes-app-1`; wrapper demands Compose service label `tunes`. Exact labels must be observed, not inferred from the name.
- Existing project is `tunes`, volume `tunes_postgres-data`, host port 5001. New topology introduces Traefik on 80/443 and different networks. Existing ingress ownership remains unverified.
- Runbook explicitly refuses automatic adoption of unversioned databases. Production schema/journal state and restore evidence remain unverified.
- Standalone preflight received environment credentials. Earlier reusable deploy did not; the propagation discrepancy remains unresolved.
- Only 5.1 GB disk was available. Capacity for backup, restored rehearsal, and image layers must be measured before preparation.

## Task 1: Sanitized deployment inventory

**Files:** `.github/workflows/tunes-host-preflight.yml`; `tunes/server/test/deployment/music-host-preflight.test.ts`.

- [ ] Add failing contract tests for explicit container labels/image architecture, Node version, listening port metadata, and database volume identity. Reject full `docker inspect`, environment dumps, row queries, and mutation commands.
- [ ] Extend the existing protected read-only workflow with narrowly formatted metadata only; do not load full Compose configuration because interpolation can expose credentials.
- [ ] Run focused preflight contract tests; review the diff for secret exposure and command injection.
- [ ] Submit the diagnostic change through PR/CI, then run on protected main with user environment approval.
- [ ] Record exact legacy service/project/network, image architecture, ingress process/ports, database volume, available runtime and capacity.

## Task 2: Database migration decision gate

- [ ] Design a read-only catalog report identifying migration journal existence, schema version, extensions, table names and aggregate sizes, without rows or connection strings.
- [ ] Identify the existing backup mechanism and restore evidence. A backup filename alone does not prove recoverability.
- [ ] If versioned and compatible, rehearse the candidate migration against an access-controlled restored copy in an isolated environment with all external workers disabled.
- [ ] If unversioned, stop the release: prepare a separately reviewed data-preserving migration design from the observed schema. Do not fake journal entries or run baseline DDL over existing tables.
- [ ] Verify row counts, constraints, identity relationships, playlist/queue ownership, failure rollback and restoration on the isolated copy.

## Task 3: Image and bootstrap compatibility

**Files:** `.github/workflows/tunes.yml`; `tunes/deployment/music-deploy.sh`; relevant tests under `tunes/server/test/deployment/`.

- [ ] Establish published image architecture and native ARM runner/scanner availability.
- [ ] Write failing tests for the chosen ARM platform and exact-image test/scan/attestation sequence; keep digest provenance intact.
- [ ] Implement only the verified platform change, then run the complete image gate on that architecture.
- [ ] Design explicit legacy service validation using the observed project/service/container identity; retain rejection tests for mismatches, stopped containers and arbitrary services.
- [ ] Rehearse ingress transition with the observed topology. Prove the old route stays healthy on every pre-promotion failure.
- [ ] Resolve reusable environment credential availability without copying protected secrets to repository scope or weakening approval gates.

## Task 4: Host preparation and cutover

- [ ] Review exact directory ownership, secret file provisioning, proxy subnet, existing ingress integration, database volume binding and storage headroom against Task 1 evidence.
- [ ] Require successful restore rehearsal and a reviewed migration path before any database mutation.
- [ ] Apply narrowly scoped host preparation; verify it without stopping legacy.
- [ ] Deploy the attested ARM-compatible candidate privately; verify migrations, readiness and API contract against that exact digest.
- [ ] Promote only after all gates pass; verify public digest/version, HTTP routes and Socket.IO connectivity. Retain the prior service and documented recovery path.

## Task 5: Production verification

- [ ] Confirm landing, public profile and every enabled category route load without new errors.
- [ ] Verify logged-in Music search, song selection, player, playlists and queue on the authorized test account.
- [ ] Verify guest queue visibility, playlist sharing and controls in a separate browser session; check live on/off changes and reconnect without refresh.
- [ ] Verify unpublished access denial, navigation pin consistency and browser refresh/deep links.
- [ ] Verify analytics delivery without sensitive payloads; distinguish ingestion success from dashboard aggregation lag.
- [ ] Restore test settings and remove only explicitly created test records. Record actual pass/fail/blocked outcomes; do not claim exhaustive or 100% correctness.

## Review outcome

This is an evidence-gated plan, not permission to bypass missing migration prerequisites. Detailed implementation of Tasks 2-4 depends on Task 1 results; inventing those details now would be unsafe. No production cutover is currently approved by technical readiness. The immediate executable scope is sanitized inventory and contract tests.
