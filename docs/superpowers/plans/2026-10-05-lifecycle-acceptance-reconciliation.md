# Lifecycle Acceptance Reconciliation Implementation Plan

**Current amendment (2026-10-05):** Read the [re-groomed execution plan](2026-10-05-replatform-regroomed-execution.md) for verified checkpoint results, remaining prerequisites and current ownership. Earlier pending/base/agent-reuse wording below is historical where superseded: exact1a5c image/C0 succeeded; navigation6/lifecycle12 remain bounded separate proofs; Category B17/26 passed and Music startup remains open. Every new assignment uses a fresh agent. No full parity, operational QA or release claim follows from these slices.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace obsolete hosted auth/lifecycle fixture protocols with mapped canonical acceptance while retaining every applicable lifecycle safety behavior.

**Architecture:** Establish the earliest observed failure before changing fixtures. Inventory the old 75 browser identities and map their behavior to canonical cookie/account/revision/recovery flows, reusing the existing real-backend runner; fix application code only when a canonical reproduction establishes an actual product gap. Existing canonical ten-case coverage remains a finite slice, not a substitute for the inventory.

**Tech Stack:** TypeScript, Playwright, Better Auth, canonical Express API, owned disposable PostgreSQL 15, Node 24.21.0/npm 11.19.

**Spec:** `docs/replatform-audit/migration-gap-audit-2026-10-05/README.md` and `identity-platform.md`; literal ignored `.superpowers/sdd/epic-01/fresh-auth-fixture-reconciliation.md` and `task3.5-fresh-direct-capture-independent-review.md`. Read also `task3.5-fresh-lifecycle-direct-capture-preparation.md` for the already reviewed observation command.

## Global Constraints

- Planning baseline: `dc61db1cf895b687fd3d32c3b6e4e6463d0d3663`, integration `C:/Users/TK/.codex/worktrees/replatform-audit/explorers.earth-main`, branch `codex/unified-replatform`. Preserve all pre-existing dirty changes and branch. This planning package creates only this file; no execution, source edits, installs, runtime allocation, commits or push.
- Execution must use supported Node 24.21.0/npm 11.19 and a reviewed isolated owned checkout/runtime. Do not use or compete for port 51642, reuse somebody else's server, connect ambient DATABASE_URL/production authority, or kill processes by port/name.
- Preserve no external data egress, foreign-owner denial, verified session authority, Origin/idempotency checks, auth generation/ABA fences, writer identity, failed logout fencing, recovery purpose/single use, terminal denial and exact discovery/cleanup/artifact controls.
- Do not restore JWT/localStorage authority, fabricate active `/me` for suspended/pending/deleted accounts, translate UUIDs back to Strapi subjects, weaken assertions, expand deadlines/retries, or execute broad until-green loops.
- Keep historical exact46ee canonical82/lifecycle10 and exactdc61 API receipts attributed to their own source/environment. An account-error screenshot proves a rendered boundary; it does not prove denied session, `/me` initiation, payload validity or store readiness.
- Real Google/provider/QA/release obligations remain open after local fixture acceptance. No deployment, merge, Strapi retirement or production action belongs to this plan.

## Review Focus

1. Held lifecycle result after A→B and A→B→A must not open old confirmation, navigate, mutate the replacement owner, or log it out (Task 2).
2. Lost successful response must not duplicate feedback/deletion or require a new destructive operation; revision and same idempotency key remain authoritative (Task 2).
3. Pending, expired, wrong-subject and replayed recovery must grant no ordinary session, including reload and second tab (Task 2).
4. Unresolved/error/terminal lifecycle authority must expose no destructive action and produce no destructive request (Task 2).
5. Failed sign-out must fence receiving, reloaded and newly opened tabs until successful revocation; old session revocation must be checked against backend (Task 2).

## Files and ownership

| File | Responsibility and edit scope |
|---|---|
| `docs/replatform-audit/migration-gap-audit-2026-10-05/lifecycle-acceptance-map.md` (execution creates) | Exact old case/project/assertion → canonical assertion/owner/disposition ledger and first-cause receipt pointers. |
| `explorers-earth/e2e/account-lifecycle.spec.ts` | Inventory source; retire only mapped protocol-specific cases after replacements pass. No blind get-session patch. |
| `explorers-earth/e2e/reactivation-lifecycle.spec.ts` | Map its three legacy `/api/user/reactivate?token` behaviors to canonical recovery; retire URL-token authority. |
| `explorers-earth/e2e/replatform/lifecycle.spec.ts` | Canonical real-backend acceptance additions; retain existing ten cases. |
| `explorers-earth/e2e/replatform/auth.spec.ts` | Existing stale persistence/logout/recovery reference; modify only an identified missing mapped auth assertion. |
| `tunes/scripts/lifecycle-browser-guards.ts` | Exact case-name allowlist/discovery/results when adding approved cases; maintain zero retries and no skips. |
| `tunes/scripts/lifecycle-browser-support.ts` | Existing capability-controlled prepare/observe/provider/expire/bump/terminal fixture; extend only a necessary scenario action with equally bounded validation. |
| `tunes/scripts/profile-browser-fixture.ts` | Existing real-backend fixture/receipt owner; minimal routing or approved port-exclusion integration only if required. No new controller. |
| `explorers-earth/e2e/replatform/lifecycle.playwright.config.ts`, `explorers-earth/playwright.lifecycle.config.ts` | Discovery/entry-point reconciliation after mapping; preserve isolation and evidence controls. |
| `.github/workflows/frontend-e2e-qualification.yml`, `.github/workflows/test.yml`, `.github/workflows/ci.yml` | Only lifecycle/auth invocations migrating to canonical fixture commands; preserve other suite identities and security gates. |

`explorers-earth/e2e/setup/auth.ts` is cross-suite shared ownership: classify every importer before proposing a helper migration; this package uses spec-local/canonical fixture issuance and does not broadly mutate it. `explorers-earth/src/features/Settings/Settings.tsx` is owned by the navigation/settings plan: no parallel writes. Conditional application repairs in lifecycle service, auth client/store/coordinator, guards or recovery pages require a reproduced gap, exact file ownership reservation and a reviewed bounded amendment first; this table grants none automatically.

### Task 1: Establish cause and a complete acceptance mapping

**Files:** Create execution ledger above. Read old lifecycle/reactivation specs, canonical auth/lifecycle specs, workflow/config invocations, canonical lifecycle service and reviewed capture reports. No fixture or product edit.

**Interfaces:**
- Consumes unchanged baseline source and reviewed manifest SHA256 `8d91bca6cf63c8be57d08d4fe6e62418a81e7e08cb10a3c5e1de23a1488e5bd8`; existing native `LIFECYCLE_DIRECT` request records.
- Produces ledger rows `{ oldFile, oldTitle, oldProject, assertion, canonicalCase, canonicalAssertion, disposition, evidence }`. Disposition is retained, replaced-protocol, explicitly-excluded, or blocked-product-gap. No unexplained omission/skip is valid.

- [ ] Record HEAD/status and hashes for touched source plus existing dirty files. Read applicable instructions in the execution checkout and freeze the baseline; do not reset/clean.
- [ ] Expand actual test loops and every hosted invocation/project identity into the requested old 75 browser inventory. Classify the lifecycle subset separately from independent Music/accessibility and other families; leave outside-scope identities with their existing owner/selector and evidence. Reconcile duplicate invocations versus distinct case/project identities from native discovery and saved hosted receipts; do not assume 75 equals the isolated desktop/mobile lane or replace it with a smaller count. A count disagreement blocks retirement until explained.
- [ ] Map every assertion, including the following families, to exact replacement assertions and test titles before editing fixtures.

| Old behavior | Canonical replacement / disposition |
|---|---|
| In-flight cancel/boundary under replacement identity | Held canonical feedback/deletion/deactivation or recovery completion result, A→B and A→B→A; stale result cannot affect current generation. Replace Music suffix/token assertions, retain identity safety. |
| Partial cancel retry after token refresh; lost nullable cancellation response | Pending deletion → Google-purpose recovery → revision-bound single-use completion; after response loss observe committed state, no duplicate operation/proof replay or automatic ordinary session. No Music resume/token-refresh requirement. |
| Never-provisioned Music absence; Google/local suspension before Strapi block | Canonical account deactivation transaction/revocation and retained account identity. Google-only exception removes local-password branch; retained Music service absence semantics stay with Music service ownership, not silently dropped as acceptance. |
| Suspension outage; pending Music deletion; unconfirmed Strapi block compensation | Preserve failure atomicity/retry and no false success against canonical lifecycle/revision API. Legacy multi-service sequencing/compensation remains in retained service tests where applicable; never pretend canonical fixtures exercise Strapi. |
| Pending deletion reload/second-tab and pre-boundary cancellation | No ordinary Actor while pending; recovery route remains available with valid purpose proof, cancellation before terminal maintenance, fresh Google login afterwards. Existing lifecycle cases 2–3 are references, not complete parity. |
| Crossed-boundary ordering/additional account/lost account mutation | Canonical account-bound operation/revision/idempotency and observed owned state; wrong account cannot be deleted; terminal result cannot replay/recreate. Keep Music saga ordering in its service owner where still retained. |
| Dead-letter/manual review; finalized deletion | Typed non-retryable failure when supported; no destructive control or call. Deleted tombstone denies recovery/new collection; unsupported mapped UI obligation is a product-gap decision, not a passing omission. |
| Delayed/error lifecycle read | Loading/error fails closed, retry does not fabricate authority, zero deletion/deactivation requests until verified state. |
| Legacy reactivation conflict/terminal/success destination | Canonical wrong-subject/expired/terminal proof denies and shows retry-safe recovery UI; exact proof completion shows success and requires fresh ordinary session. Legacy query token supplies no authority. |
| Persisted token assertions / ordinary logout | Replace authority-positive storage assertions with verified canonical `/me` account and backend session state. Preserve negative stale-storage, failed revocation and cross-tab/fresh-tab fencing assertions. |

- [ ] Inspect existing fresh native stdout for complete chronological request-only records. If qualifying evidence exists, reuse it. Otherwise allocate **one** unchanged original desktop cancel case using the existing reviewed controller command below, only after verifying manifest/source hashes, ownership, Node 24.21.0 and port exclusions. No new recorder/controller, locator change or rerun loop.

```powershell
# Cwd: the reviewed private controller directory; NOT the integration dev server.
& 'C:/Users/TK/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -NoProfile -File 'C:/Users/TK/.codex/tmp/fresh-lifecycle-private-20261005/private-controller.ps1' -Run -ReviewedManifestHash '8d91bca6cf63c8be57d08d4fe6e62418a81e7e08cb10a3c5e1de23a1488e5bd8'
```

- [ ] Record get-session initiation/status versus transport failure, `/me` initiation if reached, and canonical profile/lifecycle outcome if reached. HTTP 200 is not valid-payload/store proof; HTTP401 is not blockedbyclient. Complete interval/no overflow is required for absence assertions. Retain native stdout separately; predecessor attachments/old complete-envelope are not new request evidence. Missing capture/failed cleanup/inventoryComplete=false remains unknown and stops additional allocations.
- [ ] Name first cause and branch decision: source fixture divergence plus matching observation → Task 2 fixture migration; valid canonical fixture with reproduced failure → reserve bounded application repair amendment; inconclusive observation → report uncertainty without product-fix claim. Independently review this ledger/cause before Task 2.

**Completion:** All 75 old identities have exact case/project selectors and ownership classification; every in-scope lifecycle assertion has an explicit replacement/disposition, while other families retain their existing owners. First runtime cause is observed or explicitly unknown; no protocol migration is credited as product parity. Review may reject mapping independently of code.

### Task 2: Migrate mapped behavior using the canonical owned fixture

**Files:** Modify canonical lifecycle spec, guards and support only as justified by Task 1. Modify canonical auth spec only for a mapped missing assertion. Retire mapped old specs/config only after replacement proof. Settings/shared auth helper remain reserved.

**Interfaces:**
- `createCanonicalAccountLifecycleService({ fetchImpl?: typeof fetch, isCurrent: () => boolean })` exposes `status()`, `recordDeletionFeedback(reason: string, key: string)`, `deactivate(expectedRevision: number, key: string)`, `deleteAccount(expectedRevision: number, feedbackId: string, key: string)`; DTO `{ accountId: string, status: 'active'|'suspended'|'pending_deletion'|'deleted', operationId: string|null, revision: number }`.
- Reuse spec-local `Owner = { userId: string; accountId: string; handle: string; cookie: string }`, `session(context: BrowserContext, owner: Owner)`, `command(page: Page, path: string, data: unknown, owner = 0, origin: string|null = fixture.origin, key = randomUUID())`, and `control(action: string, owner = 0, extra: Record<string, unknown> = {})`.
- Existing control actions are prepare/observe/provider/expire/bump/terminal; capability, loopback and exact case allowlist remain mandatory. Produced additions must join `LIFECYCLE_CASES` and `assertLifecycleResults` exact discovery/results, never disable them for arbitrary titles.
- Recovery uses `/api/explorers/v1/recovery/start`, `/status`, `/complete`, purpose-bound HttpOnly proof and revision; ordinary auth uses valid fixture-issued Better Auth cookie then actual get-session and `/me`, without synthetic active accounts for inactive states.

- [ ] Add only missing ledger assertions as named canonical tests: held completion under replacement owner and ABA; committed response loss/retry; pending reload/second tab; delayed/error read fail closed; typed terminal/manual-review denial. Pin zero foreign-owner mutations, same-key durable effects, no stale navigation/logout and no ordinary authority before fresh login. Existing auth six/lifecycle ten cases remain intact.
- [ ] Run the smallest new failing case with exact discovery/result attestation under the existing owned runner. If the runner has no supported case selector, use its exact approved suite once; do not inject unsupported arguments. Record assertion failure distinct from fixture startup/authority failure. A valid canonical product failure triggers the conditional amendment, not fixture assertion weakening.
- [ ] Extend only fixture scenario setup/control needed for those tests, preserving origin/capability/case validation and real backend mutations. Do not introduce a parallel lifecycle controller or arbitrary request bypass. If a change to exact discovery is necessary, update the guard expected set and its negative contract tests together.
- [ ] For canonical product failures only, add the smallest failing app regression test and reserve exact source ownership before a reviewed minimal fix. Coordinate any Settings edit serially with navigation owner. Preserve generation checks even when account A returns after B; cookies/account IDs alone are insufficient.
- [ ] Run mapped tests and canonical auth/lifecycle regression once after each justified change; record actual skips/retries/cleanup and hashes. Stop at first new cause. Require every ledger row marked retained to have a passing exact assertion; blocked or explicitly excluded rows require an explicit review disposition before retiring old cases.
- [ ] Retire only obsolete Music-envelope/Strapi/JWT/query-token protocol assertions whose retained behaviors are mapped and proven. Do not add get-session to the legacy fixture and call it repaired. Independently review security negatives, mapping completeness and source diff before CI routing.

**Completion:** The mapped retained behavioral set passes against real canonical backend/session state, with zero egress violations, retries or hidden skips and verified owned cleanup. Historical lifecycle10 remains credited separately. Full Google provider parity is not claimed.

### Task 3: Route acceptance and qualify the exact repair source

**Files:** Minimal lifecycle invocation changes in the three workflow files and relevant lifecycle config; ledger receipts. Preserve independent Music tests/lane counts.

**Interfaces:** Existing Tunes package commands `explorers:test:auth-browser` and `explorers:test:lifecycle-browser` invoke `scripts/profile-browser-fixture.ts --suite auth|lifecycle`; exact remaining acknowledgement is `--ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`. Protected receipt mode is required when used by current security lanes; reuse its existing argument/authority schema, never invent a bypass.

- [ ] Change hosted lifecycle invocation from stale synthetic fixtures to the canonical owned real-backend entry point, preserving required project/viewport behavior from the ledger. Remove only mapped lifecycle/reactivation files from general Music bundles; leave all independent Music identities unchanged. Ensure provider fixture success is named contained/local, not live Google.
- [ ] Preflight source SHA and lockfile hashes, supported Node/npm, physically owned dependencies/browser, loopback/disposable PostgreSQL authority, runtime inventory and artifact-off/protected retention policy. Existing fixture chooses random ports including control range 51000–51999: reserve/exclude 51642 before allocation through its reviewed owned boundary; abort if this cannot be attested. Do not patch/replace the reviewed private direct-capture controller to accommodate a port conflict.
- [ ] Execute from an isolated owned checkout's `tunes` directory with the supported executable below. These are planned commands, not executed by this plan; dependency setup is separately approved owned preflight, not permission to install now.

```powershell
# Cwd: <owned-checkout>/tunes; approved supported Node and physical dependencies.
& 'C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64/node.exe' --version
& 'C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64/node.exe' --import ./node_modules/tsx/dist/loader.mjs scripts/profile-browser-fixture.ts --suite auth --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
& 'C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64/node.exe' --import ./node_modules/tsx/dist/loader.mjs scripts/profile-browser-fixture.ts --suite lifecycle --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
```

- [ ] Preserve exact discovery/execution JSON, owned receipt/source hashes and cleanup inventory; no raw credentials or unsafe trace artifacts in public reports. A local Windows contained run cannot stand in for protected Linux native custody/security qualification.
- [ ] Obtain independent final diff/map review. Then, only under separately authorized commit/push/hosted execution, qualify the exact repair commit SHA: affected account-lifecycle and remaining-contained-contracts lanes, preserved Music bundle regressions, canonical auth/lifecycle protected checks, existing API/security/owner/lifecycle and required image-custody gates. Record run URL, exact SHA, native discovered/passed/failed/skipped/retried counts and cleanup. Red/cancelled/stale-SHA gates remain open; never relabel prior evidence.

**Completion:** Review confirms no unmapped retained assertion, all required affected exact-SHA hosted gates pass, shared-source collision resolved, and provider/QA/release exclusions are explicit. No whole-ticket/full migration closure while retained rows or required gates are blocked.

## Dependencies and decisions

- Navigation/settings canonical owner adapter can be built separately; its accepted interface/Settings ownership must settle before integrated UI qualification. Lifecycle and navigation writers serialize Settings edits.
- Shared auth helper migration is deferred until importer consumers are classified; this plan does not authorize broad cross-suite fixture repair. Analytics/content/image packages are separate owners.
- Image verification is owned by `docs/superpowers/plans/2026-10-05-games-image-ci-verification.md`; lifecycle invocation edits in shared workflow files must be serialized with that owner. This plan consumes its required exact-SHA gate outcome and does not rewrite Games/image custody or security infrastructure.
- Decide from the reviewed ledger whether retained Music-specific transaction assertions remain under Music service ownership or identify a real canonical product requirement. Do not silently declare all legacy orchestration obsolete.
- If dead-letter/manual-review or pending/reload cancellation behavior is absent from canonical UI/API, review the actual reproduction and precise required behavior before application repair. No universal bridge/new infrastructure is preauthorized.
- Runtime absence/overflow/cleanup failure does not authorize another capture allocation. Escalate the concrete evidence limitation; do not rerun until green.

## Self-review and handoff

Checked spec coverage, exact existing signatures, ownership, cause-before-fix branch, retained safety focus, finite evidence labels and task proportion. Each task is independently reviewable: cause/map, behavioral migration, exact-source acceptance routing. The five review-focus conditions belong to Task 2 tests; no uncovered safety condition is waived. Old75 inventory is a mandatory execution deliverable, not a count asserted by this source-only plan.

This plan is ready for review only. Implementation begins after user review under the previously chosen execution method, using the listed skills; this document records no passing test or runtime claim.
