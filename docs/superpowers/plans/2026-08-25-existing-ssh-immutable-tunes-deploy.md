# Existing SSH Immutable Tunes Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy PR #102 through the proven Tunes SSH connection while preserving the immutable-image, migration, canary, and rollback authority.

**Architecture:** GitHub remains the sole image builder and publishes one attested digest. The production workflow reuses `TUNES_DEPLOY_HOST`, `TUNES_DEPLOY_KEY`, and the proven `deploy` account, while an ephemeral job-scoped GitHub token supplies package-read access. Production remains closed until a read-only host preflight proves the existing Hetzner topology and required bootstrap permissions.

**Tech Stack:** GitHub Actions, OpenSSH, Docker Compose, GHCR, Node.js 22, Vitest, Bash, Hetzner, Traefik.

**Spec:** `docs/adr/005-music-identity-migration-deployment-authority.md`

## Global Constraints

- Never run `docker compose down` during deployment.
- The tested, migrated, canaried, and promoted image must be the same immutable digest.
- Reuse the existing `TUNES_DEPLOY_HOST` and `TUNES_DEPLOY_KEY` repository secrets without revealing their values.
- Keep `GATE_PROD` closed until host preflight, CI, review, backup readiness, and explicit production gates pass.
- Preserve the unrelated local `explorers-earth/public/sitemap.xml` modification.

---

### Task 1: Bind production deployment to the proven connection

**Files:**
- Modify: `.github/workflows/tunes-deploy.yml`
- Modify: `tunes/server/test/deployment/music-deployment-files.test.ts`
- Modify: `tunes/server/test/deployment/music-deploy-workflow-security.test.ts`

- [ ] Add failing contract tests for the existing host/key names, fixed `deploy` user, and ephemeral GHCR credentials.
- [ ] Run the focused tests and confirm the expected failure.
- [ ] Update the workflow minimally to satisfy the new contract.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Add a read-only Hetzner preflight

**Files:**
- Create: `.github/workflows/tunes-host-preflight.yml`
- Create: `tunes/deployment/music-host-preflight.sh`
- Create: `tunes/server/test/deployment/music-host-preflight.test.ts`
- Modify: `docs/operations/music-production-preflight.md`

- [ ] Add failing tests proving the preflight cannot mutate Docker, files, traffic, or the database.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement the fixed-command SSH preflight and sanitized evidence artifact.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Validate and review the PR

- [ ] Run deployment contract tests.
- [ ] Run the full Tunes unit, integration, scoped type, and deployment qualification suites.
- [ ] Review the exact diff for secret exposure and production mutation paths.
- [ ] Commit and push only the intended files.
- [ ] Wait for all PR checks and resolve any review findings.

### Task 4: Establish external production controls

- [ ] Create the `tunes-production` environment with protected-main admission.
- [ ] Configure branch protection required by the policy verifier.
- [ ] Generate the deployment-state HMAC secret without printing it.
- [ ] Keep `GATE_PROD` absent or closed.

### Task 5: Land, preflight, canary, and promote

- [ ] Merge PR #102 only after every required check passes.
- [ ] Monitor the main build, scan, publication, and attestation.
- [ ] Run and review the read-only Hetzner preflight.
- [ ] Resolve host bootstrap prerequisites without stopping the live service.
- [ ] Deploy the candidate privately, run authentication/lifecycle/public-URL UAT, and promote only on success.
- [ ] Verify `localtunes.earth`, retain rollback evidence, and publish the deployment report.
