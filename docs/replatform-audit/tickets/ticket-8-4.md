# Ticket 8.4: Final production topology and promotion authority

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-08.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 3.5, 8.3. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Prepare promotion from same immutable artifacts; production deployment requires separate authorization.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 8.3; extend 3.5 artifacts and QA authority rather than creating competing deployment paths.

**Files:** extend `deploy/platform.compose.yml`, `deploy/platform-routing.yml`, `scripts/platform-release.ts`, `apps/api/server/test/contracts/platform-release.test.ts`; add `.github/workflows/platform-production.yml`; retire/supersede old deployment workflows explicitly and update source tests that describe their authority.

**Interface produced:** production accepts the exact QA-tested release manifest/digests plus production runtime configuration, validates successful evidence for that release and performs serialized migration/readiness/route switch. QA cannot reference the production database or S3 prefix, although both use the accepted shared bucket/AWS credential arrangement. Reverse proxy is the only public ingress; API, self-hosted PostgreSQL and migration job use least-privilege network/roles. Production promotion is an explicit manual release action; successful QA deployment never triggers it automatically.

- [ ] Add tests refusing untested/mutable artifact, mismatched commit, absent QA evidence, missing environment authority and migration failure; failed readiness keeps previous release selected.
- [ ] Test that QA completion cannot dispatch production and that production rejects QA runtime configuration, wrong S3 prefix, reused QA session secret and unknown callback origin. Recheck environment approval rules before dispatch; retain real GitHub protection, not a documented promise of a gate.
- [ ] Configure web fallback only for frontend routes; API errors and socket upgrade must not receive index HTML. Include TLS, forwarded-proxy trust, secure session cookies, graceful shutdown and socket reconnect during restart.
- [ ] Rehearse QA candidate migration, health and readiness, switch, failed-candidate non-switch and previous compatible image rollback. Preserve useful existing advisory lock/checksum/catalog and runtime/migrator-role guarantees.
- [ ] Verify architecture equality or resolve same multi-platform manifest's platform digest on each host. No rebuild after QA; report both index and platform digests if relevant.
- [ ] Run contract, real-tool compose/image and deployment E2E checks. Commit. **Gate:** production mechanism is ready but has not executed merely because tests passed. Explicit release authorization remains necessary.


## Independent review correction (2026-10-05)

Separate promotion mechanism implementation from production release eligibility. Mechanism work can precede 8.5; actual production dispatch additionally consumes successful 8.5 recovery/capacity/final-acceptance evidence for the exact candidate, all required CI and QA evidence, plus separate release authorization. A failed or missing recovery receipt blocks dispatch. This acceptance join is not a reverse implementation dependency.

### Second correction pass (2026-10-05, independent review)

**Verdict: BOUNDED-SLICE.** All requirements and gates above are retained. The corrections below record what exists, what is synthetic and where the real gap is.

**The intended production workflow does not exist.** `.github/workflows/platform-production.yml` is **absent**; the workflows directory contains only `ci.yml`, `explorers.yml`, `frontend-e2e-qualification.yml`, `music-c0-contracts.yml`, `music-reconcile.yml`, `test.yml`, `tunes-deploy.yml`, `tunes-host-preflight.yml` and `tunes.yml`.

**The compose graph self-labels as non-authoritative.** `deploy/platform.compose.yml:1-2` reads, verbatim, that it is a "Synthetic local reference graph; not hosted deployment authority" and that "supplied image digests below are placeholders"; `:38` carries `…@sha256:aaaaaaaa…`. It must not be cited as evidence of a hosted topology.

**The real production authority today is the legacy path, and it is genuinely gated.** This is a correction in the ticket's favour and must not be read as licence to relax it:

- `.github/workflows/tunes-deploy.yml:68` restricts the deploy job to `github.ref == 'refs/heads/main'` and requires the preflight to have succeeded.
- `:69` sets `environment: tunes-production`.
- `:63` runs a runtime GitHub-API policy check, `node tunes/deployment/verify-production-environment-policy.mjs`.
- `:140` pins the caller workflow ref to `…/.github/workflows/tunes.yml@refs/heads/main`.
- `:176` runs `gh attestation verify "oci://${IMAGE_REPOSITORY}@${DIGEST}"` (the ticket's earlier `:168` cite is the step name; the command is at `:176`).

The `tunes-production` environment really does carry protection — verified read-only against the live repository: `protected_branches=true`, `custom_branch_policies=false`, a `required_reviewers` rule naming one reviewer, and `prevent_self_review=true`. **Production promotion therefore needs a second human today.** Preserve every one of these when building the replacement; a new workflow that reproduces the mechanism without reproducing the environment protection is a regression.

**The real gap: the 8.5 acceptance join is not wired into any workflow step.** The recovery-receipt obligation recorded above exists only as prose in this ticket. No workflow — not `tunes-deploy.yml`, and not the absent `platform-production.yml` — reads, validates or blocks on an 8.5 recovery receipt, so the join **cannot currently be evaluated** by any automated gate. Compounding this, 8.5 has produced no artifact of any kind (see the ticket 8.5 correction), so there is nothing for such a step to consume.

- [ ] The recovery receipt check becomes a **required step** in whichever workflow becomes the promotion authority: it resolves the receipt for the exact candidate digest/commit, fails closed on a missing, stale or failed receipt, and cannot be satisfied by a manually asserted input.
- [ ] **8.4 is not mechanism-complete until that step exists.** A promotion workflow that passes its own contract tests while the recovery join remains prose does not satisfy this ticket.

**Explicit retirement/supersession decision owed.** The ticket requires retiring old deployment workflows "explicitly"; that decision is still unrecorded for two files and is owed as part of this ticket:

- [ ] `.github/workflows/explorers.yml` is dead at `:15` (`if: ${{ false }}`) with a source comment deferring to the Epic 8 release workflow. Record whether it is deleted or superseded, and by what.
- [ ] `.github/workflows/tunes-deploy.yml` is the current real production authority. Record whether `platform-production.yml` replaces it or runs alongside it, and which one holds the `tunes-production` environment binding afterwards. Do not leave two live promotion paths.

### Environment gap owed to the operations owner (not a workflow edit)

Recorded here because it belongs to deployment authority, and is an operations action rather than a change to any workflow file:

The `music-reconciliation-staging-apply` environment referenced by `.github/workflows/music-reconcile.yml:184-191` **does not exist** in the repository. Verified read-only: the environment API returns 404; the environments that do exist are `explorers-qa`, `music-reconciliation-production-report` and `tunes-production`. GitHub auto-creates a referenced-but-missing environment on first run **with no protection rules**, so that job's `environment:` gate is currently **vacuous**. Its real gates are the manual dispatch condition, the main-only ref condition, reviewed-run provenance and an approval token — which hold, but are not the environment protection the workflow's shape implies.

- [ ] Operations owner: create `music-reconciliation-staging-apply` and apply protection (required reviewers and branch policy) **before** that job is next dispatched, so the declared gate is real. No workflow edit is required or authorized for this.
