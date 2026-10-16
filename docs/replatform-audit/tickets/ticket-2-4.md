# Ticket 2.4: Auth UX and lifecycle

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-02.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 2.2, 2.3. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Package L: map original 18 plus 3 recovery behaviors against the **10 committed** browser cases (corrected 2026-10-05 from "accepted 12" — cases 11-12 are overlay-only); implement missing held completion, response-loss and reload cases. Socket closure joins reviewed 6.1. **Blocking prerequisite:** the frozen 18+3 requirement-to-receipt map is **unwritten** and must be produced before any writer dispatch. See [Second independent review corrections (2026-10-05)](#second-independent-review-corrections-2026-10-05) below.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 2.2/2.3; socket disconnection acceptance completes with 6.1.

**Grooming focus:** verify stale-session and cross-tab transitions using the actual web client, including in-flight response cancellation, repeat logout/recovery and guarded real-API sessions. A test fixture cannot stand in for the live Google callback acceptance.

**Modify — relabelled from "Create" on 2026-10-05, all five files already exist and are tracked at the review SHA:** `explorers-earth/src/lib/authClient.ts`, `tunes/server/application/accountLifecycle.ts`, `tunes/server/routes/explorersLifecycleRoutes.ts`, `explorers-earth/e2e/replatform/auth.spec.ts`, `tunes/server/test/explorers-lifecycle.integration.test.ts`. These were labelled create when authored and were since delivered and reviewed. **A literal reading of the old label invites overwriting reviewed code: extend these files, never recreate them.** Read each file before changing it and preserve its existing assertions and safety behavior.

**Modify:** `explorers-earth/src/pages/Login.tsx`, `explorers-earth/src/pages/GoogleAuthRedirect.tsx`, `explorers-earth/src/routes/AuthRoutes.tsx`, `explorers-earth/src/store/store.ts`, `explorers-earth/src/components/AuthSyncManager.tsx`, `explorers-earth/src/hooks/useLogout.ts`, `explorers-earth/src/services/accountLifecycleService.ts`, `explorers-earth/src/features/Settings/Settings.tsx`, `explorers-earth/src/features/Settings/api/mutation.ts`, `explorers-earth/src/features/Settings/components/AccountDeletionLifecyclePanel.tsx`.

**Deletion feedback contract:** the current Settings wizard writes freeform reasons before advancing; this is not seeded reference content. Add `recordDeletionFeedback(actor, input:{reason:string}, context):Promise<{id:string}>` to `accountLifecycle.ts` with POST `/account/deletion-feedback`. Require trimmed nonempty reason, bound length to 2,000 characters, use idempotency, derive account/user from Actor and avoid copying private address/email into generic feedback. Preserve current required-reason/error/retry step behavior, and define restricted retention with deletion policy before production. Add tests for failed feedback retry, duplicate submit and no cross-account payload injection; full deletion E2E must prove no Strapi mutation remains.

**Lifecycle boundary:** define `requestAccountDeactivation(actor:Actor,input:RevisionInput,context:RequestContext):Promise<AccountLifecycleDto>`, `requestAccountDeletion(actor:Actor,input:RevisionInput & {feedbackId:string},context:RequestContext):Promise<AccountLifecycleDto>` and `getAccountLifecycle(actor:Actor):Promise<AccountLifecycleDto>`. AccountLifecycleDto is `{accountId,status:'active'|'suspended'|'pending_deletion'|'deleted',operationId:string|null,revision:number}`. Feedback must belong to the same account. Retain the currently exposed reactivation/cancellation journey through a purpose-bound recovery authority, not `requireActor` which correctly denies suspended accounts; pin that authority to the verified Better Auth session/re-authentication primitives during 2.1. Its implementation must reject cross-account, expired and replayed recovery authority. A deleted account must not be automatically recreated with the old content merely by repeating Google login. Retain a minimal deletion boundary or remove ownership references according to the reviewed deletion policy; test this separately from fresh first-login provisioning. Ticket 2.4 cannot pass before the following recovery contract is qualified.

**Recovery contract (owned by 2.1, consumed by 2.4):** create `server/auth/accountRecovery.ts` and `server/test/account-recovery.test.ts`. `requireRecoveryPrincipal(request):Promise<RecoveryPrincipal>` verifies fresh Google authentication through the pinned Better Auth integration and resolves only the existing identity/account binding. `RecoveryPrincipal` is a server-only `{userId:string,accountId:string,purpose:'account-recovery',proofId:string}` and is never assignable to `Actor`. Issue an opaque, single-use, five-minute recovery proof held in a secure HttpOnly same-site cookie; persist only its hash, binding and expiry. `recoverAccount(principal:RecoveryPrincipal,input:RevisionInput,context:RequestContext):Promise<AccountLifecycleDto>` consumes the proof atomically with the permitted reactivation/deletion-cancellation transition. It cannot recover terminally deleted accounts or provision a replacement account. Require the ordinary CSRF/origin protections. Successful recovery requires a new normal session; the recovery credential itself grants no profile/content/Music access. Qualification in 2.1 must identify the actual supported provider callback hook and prove inactive-account authentication can complete without provisioning or ordinary authorization. If the pinned library cannot support that flow, stop that ticket and amend the adapter design before downstream lifecycle implementation, rather than inventing an API.

- [ ] Assert `recovery_only_authorizes_recovery`: recovery proof is denied on ordinary content routes; another account ID, an expired proof and a replay each fail without state changes. Assert two simultaneous recoveries produce exactly one transition, Google re-login cannot restore a terminally deleted account, and a successful eligible recovery requires a fresh ordinary session before content access.

- [ ] Add failing tests for expired/revoked session, cross-origin mutation, logout in another tab, cancelled Google callback, blocked account login and repeated lifecycle request. Existing password-only routes redirect to Google sign-in without exposing broken forms; record this agreed visible change.
- [ ] Replace localStorage Strapi JWT authority with verified Better Auth session client; clear old auth cache on transition/logout, retain noncredential presentation preferences, and invalidate pending requests from the previous account generation.
- [ ] Implement deactivation/deletion/reactivation state transitions from the existing baseline, deriving ownership from Actor and requiring current authority for irreversible operations. Revoke sessions and publish disconnection after the transaction commits. Do not retain upstream absence polling as proof of canonical deletion.
- [ ] Run auth/lifecycle unit/integration and browser scenarios. Perform an actual development Google callback using configured credentials; provider simulation is separate evidence. Commit. **Done:** session behavior and existing lifecycle screens work; any provider access blocker is explicit, not a mock-based success claim.

**Frontend authority closure (2.4):** include `components/ProtectedRoute.tsx`, `GuestRoute.tsx`, `OnboardingCheckError.tsx`, `main.tsx`, `pages/OnBoarding.tsx`, `ReactivateAccount.tsx`, `ReactivateConfirm.tsx`, `features/Settings/Settings.tsx`, `features/navigation/CategoryNavigationProvider.tsx`, `services/useAccountLifecycleIdentity.ts` and their source-listed tests. The [auth gap review](../frontend-auth-gap-review.md) is part of this ticket's required file/test inventory.

- [ ] Implement explicit verified-session states: loading, signed-out, active/incomplete, active/complete, recovery-only, terminal and retryable error. Stale local auth storage cannot authorize rendering. Test private/public deep links, reload and no home/onboarding redirect loop.
- [ ] Replace all logout entry points with one server-session-ending coordinator. Immediately fence local authority, cancel old work, clear account-scoped stores/caches, disconnect sockets and notify other tabs. Preserve theme/language. A failed revocation stays visible as retryable; do not silently rehydrate old authority or claim server logout completed.
- [ ] Handle definitive session expiry once across simultaneous requests; do not globally log out for ordinary404/403/provider outages. Never automatically replay a failed mutation after re-login. Test delayed A→B→A responses and stale navigation/lifecycle callbacks under a new session generation.
- [ ] Replace email/token recovery page integrations and corresponding text with the agreed Google recovery flow. This is an explicit Google-only auth exception to visual-behavior parity. Test cancellation, wrong identity, expired/replayed proof, deleted account and fresh-session success; legacy URL tokens confer no authority.
- [ ] Remove new-auth dependency on qrtoken from global bootstrap. Clearly fence temporarily retained Apollo traffic until category conversion; new session credentials never go to Strapi. Extend every named existing test in the gap review and the real auth/profile browser suites before the Books milestone.


## Remaining lifecycle acceptance (2026-10-05)

> **Corrected 2026-10-05 (historical count):** the "12" below is **10 committed** cases plus 2 overlay-only cases; see correction C1 under [Second independent review corrections (2026-10-05)](#second-independent-review-corrections-2026-10-05).

Accepted canonical lifecycle12 proves only its reviewed identities, including feedback A-B/verified ABA. Preserve all18 original lifecycle plus3 recovery equivalents: held deletion/deactivation/recovery completion fences, successful response-loss observation without proof replay, precommit atomicity/retry, purpose-only reload/second-tab recovery and the unresolved typed manual-review UI contract. Music45/accessibility12 remain separately owned. Discovery/registry changes must be atomic before protected execution. Do not retire old workflow coverage from a partial map; real Google and Music socket revocation remain named prerequisites.


## Independent review correction (2026-10-05)

Lifecycle observation is a prerequisite contract package L0 owned by 2.4, before L1 response-loss/reload implementation. Trace the actual service and define observation authority, typed terminal/pending/unknown/manual-review response and fresh-session transition. Ordinary Actor reads cannot be assumed available after deletion; single-use proof replay is forbidden. Retain HttpOnly purpose-only cookie and server-side hashed authority; never persist proof in browser-readable storage/logs. Freeze the original 18+3 requirement-to-receipt map and manual-review UI DTO before writer dispatch. This contract is unresolved, not an invented new endpoint.

## Second independent review corrections (2026-10-05)

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §3 P0-4, §4 P1-9/P1-10, §6 row 2.4 and §8. Disposition remains **partial / INCOMPLETE**; the canonical server and client lifecycle are real. The six corrections below replace the corresponding counts, scope claims and file labels used above. Every gate, requirement and negative-test obligation stated earlier in this ticket remains in force.

### C1 — Committed browser cases are 10, not 12

Verified at the review SHA: committed `tunes/scripts/lifecycle-browser-guards.ts:1-12` defines a `LIFECYCLE_CASES` array of **10** entries. **Cases 11 and 12 — "held feedback cannot mutate navigate or log out verified replacement B" and "…a fresh verified returning A session" — exist only in the uncommitted working-tree overlay** and are not part of delivered, attested scope. Wherever the text above says "accepted canonical lifecycle12" or "accepted 12", read **10 committed cases plus 2 overlay-only cases**. An overlay receipt is not delivered scope: do not cite 12 as a committed count, and do not treat the two overlay cases as discharged obligations. (Related: the committed browser manifest totals 82 identities; the working tree totals 88.)

### C2 — The frozen 18+3 requirement-to-receipt map does not exist

`ticket-2-4.md:64` above and the execution packages declare the frozen original 18-plus-3 requirement-to-receipt map a **hard prerequisite** before any 2.4 writer dispatch. A repository-wide search at the review SHA finds **only references to that map — the map itself is nowhere in the repo**. It is unwritten, not merely unlocated.

It therefore remains a **blocking prerequisite and is not satisfied**. The practical consequence must be stated plainly: because the denominator was never written down, **"bounded slice" currently has no denominator** — there is no auditable basis for any residual-work estimate, percentage complete, or claim that a given subset of lifecycle behavior is covered. Do not derive a residual figure from the 10 committed cases against an unwritten 21.

- [x] **Done 2026-10-08: [the frozen requirement-to-receipt map](../lifecycle-requirement-receipt-map.md).** Read its first section before using it. Three things in it change this ticket:
  - The original enumeration **could not be recovered** - it is referenced across this ticket, epic 2 and the execution packages and appears nowhere in the repository. The map's denominator is derived from the lifecycle contract surface that exists, and is stated as such rather than presented as the lost list.
  - The derived inventory is **19 + 3, not 18 + 3**. A first draft did total 18 + 3, by omitting the held-completion fence that this ticket names explicitly; the near-miss is recorded in the map because it shows how easily that figure is reached by accident.
  - C1 below is **fully stale**: all 12 cases are committed and all 12 execute. Ten are plain `test(LIFECYCLE_CASES[n])` calls; the two held-feedback cases are generated by a `for` loop at `e2e/replatform/lifecycle.spec.ts:202`. Counting them with a line-anchored `test(` pattern undercounts - see the map's C1 note.

  **All 22 behaviour rows have receipts.** The map carried six open obligations; the typed observation union and the manual-review DTO are now done (see its obligations 1 and 2, including the security boundary change they required and C3's one wrong claim), and the held-completion fence turned out to be covered already. Three remain, none of them a behaviour gap: the real Google callback, Music socket revocation owned by 6.1, and hosted attestation. It is still a partial map and retires no existing coverage.

### C3 — L0's absence claim is overstated; name the existing observation authority

The L0 correction above states the observation contract is unresolved. Part of it already exists in production source, and the claim must be narrowed so a writer does not invent a second observation endpoint alongside it. Verified at the review SHA:

- `tunes/server/routes/explorersLifecycleRoutes.ts:46-53` **already exposes `GET /api/explorers/v1/recovery/status`** under `requireRecoveryPrincipal` — the purpose-bound recovery authority (HttpOnly purpose cookie), explicitly **not** `requireActor` — returning `{status, revision}` read from `creator_accounts`.
- `:54-64` (`POST /api/explorers/v1/recovery/complete`) clears the recovery proof cookie **only on delivered success**, after `recoverAccount` returns.

  **Corrected 2026-10-08, and this was the load-bearing error in C3.** The sentence that followed claimed this is "precisely the lost-response observation case L3/L11 requires: a client that loses the response can re-observe state through `/recovery/status` without replaying the proof." It could not. `requireRecoveryPrincipal` gates on `consumed_at IS NULL` **and** `status IN ('suspended','pending_deletion')`, so the two observations that matter most were unreachable: a recovery that had *succeeded* re-read as 403 (and `ReactivateConfirm` told the owner "This account cannot be recovered"), and a terminal deletion was indistinguishable from a transient failure, offering retry forever.

  Closing it needed a security boundary change, not an extension of this route's authority: `requireRecoveryObservation` in `tunes/server/auth/accountRecovery.ts`, a branded **read-only** authority that drops exactly those two conditions while keeping the proof's five-minute expiry and its revocation checks, and is not assignable to `RecoveryPrincipal` or `Actor`. `/recovery/complete` is untouched. The security inventory label moved from `single-use-google-bound-recovery-proof` to `google-bound-recovery-proof-within-expiry-read-only`.

  **TK reviewed and kept this on 2026-10-08.** It was offered for veto because it widens a recovery gate; reverting it re-breaks the lost-response and terminal-deletion cases, and that was the trade accepted.

**That route is the existing observation authority. Extend it; do not add a second observation endpoint.** L0's genuinely-absent scope is narrowed to exactly two items:

- [ ] The **typed terminal / pending / unknown response union** for lifecycle observation. The existing route returns a raw `{status, revision}` read, not a typed union that distinguishes a terminal outcome from a still-pending operation from an unknown/indeterminate one.
- [ ] The **manual-review DTO**. `manualReview` has **zero hits across `tunes/server` and `explorers-earth/src`** at the review SHA — no server contract and no UI contract exists for it.

Unchanged from the L0 text above: ordinary Actor reads cannot be assumed available after deletion, single-use proof replay stays forbidden, and the proof stays in an HttpOnly purpose-only cookie with server-side hashed authority and is never persisted in browser-readable storage or logs.

### C4 — P0: the legacy browser gate still asserts the auth contracts 2.4 removed, so there is no merge path

This is the blocking defect on 2.4's merge path and is owned jointly with 1.3 (CI registration).

`explorers-earth/e2e/account-lifecycle.spec.ts:249,314,329,345` still assert `localStorage.getItem("auth-storage")` contains `mock-jwt-token-xyz` / `fixture-user-b`, and `:77` still stubs the retired `**/api/music/identity/lifecycle/**` route. Ticket 2.4 deliberately made all of that impossible: `explorers-earth/src/store/store.ts:146-147` persists nothing (`partialize: () => ({})`, `merge: (_persisted, current) => current`) and `explorers-earth/src/lib/authClient.ts:11` deletes the `auth-storage` key outright. The spec asserts retired contracts against their intended removal.

That spec runs at `.github/workflows/test.yml:170` and `.github/workflows/ci.yml:421`, so it feeds **both protected aggregates** (`music-required` and `replatform-required`). The hosted first failure, read from the log, is `[1/75] account-lifecycle.spec.ts:227:3` → `TimeoutError: locator.click … waiting for getByRole('button', { name: 'Cancel deletion' })`.

- [ ] Translate every affected case in `explorers-earth/e2e/account-lifecycle.spec.ts` to the canonical cookie session service, **preserving every safety assertion**. Each removed `auth-storage` / `mock-jwt-token-xyz` / `fixture-user-b` assertion must be replaced by an equivalent assertion over canonical session authority that fails for the same underlying unsafe behavior. Translate assertions; never delete one to make a lane green, and never relax one to accommodate the new transport.
- [ ] **Register the canonical suite in CI before retiring the legacy spec**, in that order, with a one-to-one behavioral map from each retired case to its canonical replacement. Verified at the review SHA: `explorers-earth/e2e/replatform/lifecycle.spec.ts` and the `platform:test:e2e` script appear in **no workflow at all** — a repository-wide search of `.github/workflows/` returns zero hits for either. **The entire 2.4 browser receipt is therefore local-only and has never been re-attested at an exact hosted SHA.** Retiring the legacy spec before the canonical suite is a required check would remove the only hosted lifecycle coverage that exists.

### C5 — Shared-file exclusions for dispatched writers

Two files in this ticket's **Modify** list are also listed by other tickets. A writer reading only this ticket would edit them without knowing. Both are excluded from 2.4's writer scope and require coordinator allocation:

| File | Also owned by | Rule |
|---|---|---|
| `explorers-earth/src/features/Settings/api/mutation.ts` | ticket 7.2 (listed at `ticket-7-2.md:31`) | Excluded from 2.4 writer scope. Coordinator allocation and an exclusive window before any edit. |
| `explorers-earth/src/components/AuthSyncManager.tsx` | ticket 6.1 (listed at `ticket-6-1.md:44`) | Excluded from 2.4 writer scope. Coordinator allocation and an exclusive window before any edit. |

These are **file** duplications, not requirement duplications — the requirements have one owner each, so do not resolve them by splitting a requirement or adding a ticket. `AuthSyncManager.tsx` and `Settings*` are on the never-parallel list; do not dispatch overlapping writers.

### C6 — Named prerequisites that remain open and are not owned here

Unchanged and restated for dispatch safety: the **real Google callback** acceptance remains mandatory and cannot be satisfied by a fixture (per the Grooming focus above), and **Music socket revocation** closure is deferred to reviewed 6.1 — `tunes/server/music/canonicalMusicPrincipal.ts:8` self-documents that socket credentials belong to 6.1. The review-focus item "a logged-out or suspended owner must lose socket authority as well as HTTP access" is therefore **unproven** at the review SHA and is not evidenced by anything in this ticket.
