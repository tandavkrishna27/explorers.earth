# Ticket 7.3: All-category regression and milestone evidence

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-07.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 2.4, 3.5, 7.1, 7.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Run full retained regression only after reviewed producers; preserve required red positives and publish exact-source evidence, not fixture aggregates.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Grooming focus:** the complete affected frontend suite and each package's clean isolated install/build/test are required before review. Any claimed baseline failure needs the same check reproduced on the base commit. Define real-API fixtures before dependent acceptance and keep mocked UI, provider simulation and hosted gates distinct in the report.

**Depends on:** 7.1/7.2 and all preceding functional gates; consumes, rather than replaces, per-ticket tests.

**Existing:** all category E2E specs, dedicated public/theme/Music configs, package scripts and CI jobs qualified by Epic 1. **Create:** `docs/replatform/evidence/milestone-2.md` during execution; the evidence document contains actual run results, not prefilled PASS entries.

- [x] Run the complete frontend unit suite, backend unit suite and applicable disposable-database integration suite using existing package scripts; preserve required coverage gates or replace obsolete paths with equivalent behavioral coverage in the same change.

  **Run 2026-10-09 at `03cfede6` on a clean tree. Record:**
  [`docs/replatform/evidence/2026-10-09/local-automated-7-3/record.md`](../../replatform/evidence/2026-10-09/local-automated-7-3/record.md),
  written in the schema `evidence/README.md` prescribes. Frontend **325 files / 4554
  tests**; frontend critical-coverage gate **16 files / 441 tests** at `perFile` 100%;
  tunes critical-coverage gate **24 files / 629 tests** with statements 2010/2010,
  branches 1939/1939, functions 288/288, lines 1745/1745; disposable-database integration
  **8 passed / 8 environment-skipped / 0 failed, 122 tests** on a fresh `postgres:15-alpine`.
  No coverage gate was lowered and no path replaced, so the "or replace" branch did not apply.

  Two things the record states rather than smooths over: the backend unit suite did **not**
  complete locally - its authoritative result is CI's `contracts` job on run `37872412216`,
  which runs the whole `server/test` tree on a clean checkout and passed - and one frontend
  test failed once, then passed three times in isolation and once in a full re-run, with
  concurrent suite execution as the probable cause.

  **This closes `:35` only.** The browser, QA-provider and owner-UAT obligations at
  `:36`-`:41` are untouched, and the record's `skippedReason` names what each needs.
- [ ] Run all new real API scenarios through the reviewed per-category guarded runners for every category that has a landed producer, each entered with its own exact scope token, owned-disposable acknowledgement and fresh owned receipt directory, at desktop and mobile projects; run retained Music full-stack/capability suites through the commands pinned by Epic 6. *(Corrected 2026-10-05: the historical spelling `npm run platform:test:e2e -- --suite all --milestone 2 --project desktop-chromium --environment local` does not exist — see the verification section below. Every behavioral obligation of the original step is retained: all nine categories, both projects, real API, no browser mocks.)*
- [ ] Run applicable baseline presentation suites, keyboard/accessibility checks and desktop/mobile visual comparisons. Fail on unexpected required scenario skips; record baseline defects separately.
- [ ] On QA, exercise Google login and each external provider with nonproduction configuration. Record provider quotas/outages as blocked checks, not successful fixture tests.
- [ ] Drive all nine categories and profile/settings/analytics/claim flows in the browser. Record expected versus actual behavior, screenshots/traces where useful, environment and exact tested commit; no claim of owner sign-off.
- [ ] Capture a network log proving retained runtime flows no longer require Strapi. Separately verify environment-neutral canonical URL output from static generation; the inspected generator has no established live Strapi fetch. Categorize remaining traffic rather than blocking all external catalog/CDN calls indiscriminately.
- [ ] Run branch CI at the tested checkpoint and link its results. Publish milestone report with delivered scope, local automated results, browser acceptance, QA/provider checks, remote CI, defects, blocked cases and optional owner reproduction steps.
- [ ] Gate Milestone 2 on all required category/ownership/privacy scenarios passing. Do not start destructive retirement work merely because mock UI tests pass.
- [ ] Repeat every per-category guarded run at its mobile project, then repeat both projects against the QA environment under Epic 1's safety rules, each with its own fresh owned receipt. Record exact discovered/executed/passed/failed/skipped scenario counts per lane; fail the milestone for a required scenario that is absent from discovery, skipped or retried into an unexplained pass. *(Corrected 2026-10-05: `--project mobile-chromium` and `--environment qa` are not accepted flags — see the verification section below. The desktop-and-mobile and local-and-QA obligations are retained in full; project names come from each lane's own reviewed configuration.)*
- [ ] Attach a nine-row category coverage table to the milestone report: owner create/edit/item-delete/list-delete, order/pin, publish/hide, anonymous detail, B denial, media byte check, desktop/mobile and real-provider result. Guides add parent/section round-trip and deletion; Music refers to its distinct owner/guest/socket/publication cases rather than generic collection semantics.

**Acceptance gate:** the route matrix from 1.1 reconciles one-to-one with executed scenarios or explicit agreed exclusions; optional owner testing is not a prerequisite, but required technical checks cannot be waived by silence.

## Independent review verification (2026-10-05)

Measured against source at `225d83e5`. **NOT-STARTED.**

### The mandated commands do not exist

`scripts/replatform-e2e.mjs:47-48` accepts **exactly six arguments** and exactly three flags:

```
--milestone delivered-auth-profile-books
--ack       TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
--receipt   <fresh, absolute, direct-child-of-tmpdir, non-existent replatform-e2e-* directory>
```

`:47` fails on `args.length !== 6`, on any flag outside that set, and on a duplicate or empty value. `:48` fails unless `--milestone` equals the `SCOPE` constant at `:9` and `--ack` equals the `ACK` constant at `:7`. `:49-50` require the receipt path to be absolute, a direct child of the real temp directory, matching `^replatform-e2e-[A-Za-z0-9-]{8,64}$`, not already existing, and not reached through a symlink.

So none of `--suite`, `--project`, `--environment`, `--milestone 2`, `--project desktop-chromium` or `--project mobile-chromium` is accepted. The lane set is fixed at `:11` to `auth`, `profile`, `books`, `lifecycle`, `movies`, `games`, each with a pinned runner, config, project list and exact identity count, validated by `validateManifest` at `:53-56`.

Steps `:36` and `:43` are rewritten above to consume reviewed per-category guarded runners instead.

**Weakening the runner guard to satisfy the old command spelling is forbidden.** The `--ack`/`--receipt`/scope checks at `:47-50`, the ambient-authority refusal at `:43-44` (which rejects production `NODE_ENV`, ambient `DATABASE_URL`, Docker context and hosted fixture variables), and the exact lane/identity validation at `:53-56` are the mechanism that makes a receipt mean anything. Adding a permissive `--suite all` path, relaxing the receipt ownership test, or widening the accepted flag set to make the documented command run is a stop condition, not a fix. New per-category lanes are added by reviewed extension of the lane table and manifest, with their own exact identity counts.

### No milestone evidence exists

`docs/replatform/evidence/milestone-2.md` **does not exist**. `docs/replatform/evidence/` holds `2026-09-30/`, `README.md`, `ci-hosted-validation.md` and `main-protection-settings.json`. The `:33` instruction to create it during execution stands, and its warning that the document must contain actual run results rather than prefilled PASS entries stays in force.

### The scope token is milestone-shaped and should be renamed or gated first

`scripts/replatform-e2e.mjs:9` sets `SCOPE='delivered-auth-profile-books'` and `:8` labels it a "stable compatibility identifier". It is consumed through the `--milestone` flag, so a reader of a receipt sees a *milestone* value that actually names a delivered slice of six lanes — none of which is the nine-category milestone-2 scope this ticket must publish. Before 7.3 publishes any evidence, the token must be renamed to a scope-shaped identifier, or the evidence document must explicitly gate the distinction, so that a `--milestone delivered-auth-profile-books` receipt can never be read as milestone-2 attestation.
