# Frozen lifecycle requirement-to-receipt map (19 + 3)

> **Wave1 update2026-10-09:** Six held deletion/deactivation/recovery completion cases for replacement B/fresh returning A are now authored and locally executed, together with the twelve preserved cases:18 passed,0 skips/retries. See [Wave1 evidence](wave1-execution-2026-10-09.md). This advances L19's canonical completion proof; it does not close all lifecycle requirements, retire legacy protection or establish hosted acceptance. The run names base7f949519 plus the reviewed working-tree source hashes.

> **Independent correction2026-10-09:** L19 is partial. Its cited canonical cases hold deletion-feedback only, not terminal deletion/deactivation/recovery completion. The legend below uses receipt to mean authored assertion, not an executed current-head result. Older all22-covered and obligation6-DONE claims are superseded; preserve legacy coverage until exact replacements gate merges. See [independent review](independent-regroom-review-2026-10-09.md).

**Frozen 2026-10-08** against `codex/unified-replatform`. This is the artifact that
[ticket 2.4](tickets/ticket-2-4.md) names as a hard blocking prerequisite before any 2.4
writer dispatch — correction **C2** records that it had only ever been referenced, never
written. Every row below was read from source at the SHA this document was committed at.

## Read this first: what the denominator is, and what it is not

Ticket 2.4, [epic 2](epics/epic-02.md) and the execution packages all require "the original
18 lifecycle behaviors plus 3 recovery equivalents". **That enumeration does not exist
anywhere in this repository.** A search across `docs/`, `.superpowers/` and the source
trees returns only the figure — never the list. C2 is right that it is unwritten rather
than unlocated, and I could not recover it.

So this map does not claim to be that list. The denominator here is **derived from the
lifecycle contract surface that actually exists**: the service methods and routes in
`tunes/server/application/accountLifecycle.ts` and
`tunes/server/routes/explorersLifecycleRoutes.ts`, the recovery contract in
`tunes/server/auth/accountRecovery.ts`, and the behaviours asserted by the committed
lifecycle and auth suites. Each row is a behaviour the system is required to have, stated
so that it is falsifiable.

**It does not come to 18 + 3. It comes to 19 + 3.** My first draft of this map did total
18 + 3, and that was an artifact of my own omission: I had left out the held-completion
fence (L19 below), which ticket 2.4 names explicitly as a preserved requirement. Having
found it, I am not going to merge two rows to make the total match a figure whose source
nobody can produce. The near-miss is worth recording precisely because it shows how easy it
is to reach "18 + 3" by accident and then believe the list has been recovered. If the
original enumeration ever turns up, reconcile it against this one; do not assume they
match.

What this map is therefore good for: it gives "bounded slice" a denominator that can be
audited, so a residual figure stops being unfalsifiable. What it is not good for: claiming
historical continuity with a list nobody wrote down.

## Two corrections to ticket 2.4 found while writing this

Both of 2.4's own corrections below are **stale** at this SHA. Recorded here because the
ticket is still dispatched from.

**C1 is fully stale: 12 cases are committed and all 12 are executed.** I got this wrong
twice in opposite directions before checking properly, and the method error is worth
recording because it is easy to repeat.

`tunes/scripts/lifecycle-browser-guards.ts:1-13` declares `LIFECYCLE_CASES` with 12 entries
and `e2e/replatform/lifecycle.spec.ts` runs every one. Ten are plain
`test(LIFECYCLE_CASES[n])` calls; the two held-feedback cases are at **`:202`**, written as
`for (const returningA of [false, true]) test(LIFECYCLE_CASES[returningA ? 11 : 10], ...)`.

My first draft said they were committed and running — correct, but by luck rather than by
checking. I then "corrected" it to declared-but-unexecuted on the strength of
`grep -nE "^\s*test\("`, **which is anchored to the start of a line and so cannot see a
`test(` that follows a `for (...)` on the same line.** Counting cases with a line-anchored
pattern undercounts any case generated in a loop; `grep -c "test("` gives 12.

The two cases are thorough: they assert unchanged store authority, no stale navigation, no
stale mutation to `/account/*` or `/api/auth/sign-out`, exactly one feedback attempt, and a
still-authenticated replacement session.

**C4's P0 is half resolved.** The retired-assertion half is **done**:
`explorers-earth/e2e/account-lifecycle.spec.ts` contains no `auth-storage`,
no `mock-jwt-token-xyz` and no `**/api/music/identity/lifecycle/**` stub. (`fixture-user-b`
survives at `:192` as a fixture user id, which is not an authority assertion.) The CI half
is **also no longer zero**: `.github/workflows/frontend-e2e-qualification.yml:122`
registers the canonical lane as `{ lane: lifecycle, command: "npm run
explorers:test:lifecycle-browser --" }`, which resolves through
`tunes/package.json:30` to `tsx scripts/profile-browser-fixture.ts --suite lifecycle`.
**Settled 2026-10-08: that workflow does not gate anything.**
`.github/workflows/frontend-e2e-qualification.yml:3-6` triggers on `schedule` (nightly,
`23 3 * * *`) and `workflow_dispatch` only - there is no `pull_request` trigger - so it
feeds no protected aggregate and never runs on a PR. The canonical lifecycle browser
receipt is therefore **nightly, not gating**, and C4's warning holds for the reason it gave:
retiring `account-lifecycle.spec.ts` - which does run in `test.yml` and `ci.yml` - would
remove the only lifecycle coverage that gates a merge. Wiring the canonical lane into a
protected aggregate is a merge-governance change owned jointly with 1.3, and the one-to-one
retirement map is still unwritten; neither is done here.

## Legend

- **Receipt** — a committed assertion that fails if the behaviour breaks, cited as
  `path:line`.
- **OPEN** — no receipt exists. Named as an obligation, never counted as covered.
- A row with both has partial cover, and the gap is stated.

## The 18 lifecycle behaviours

### Deactivation

| # | Behaviour | Receipt | State |
|---|---|---|---|
| L1 | Deactivation issues exactly one canonical command carrying the observed revision, and ends at login | `e2e/account-lifecycle.spec.ts:302`; `server/test/explorers-lifecycle.integration.test.ts:177` | covered |
| L2 | A stale revision cannot deactivate, and reports without issuing a second command | `e2e/account-lifecycle.spec.ts:317` | covered |
| L3 | Deactivation revokes the current session and every other tab | `e2e/replatform/lifecycle.spec.ts:112` (`LIFECYCLE_CASES[2]`); `server/test/explorers-lifecycle.integration.test.ts:126,177` | covered |

### Deletion feedback

| # | Behaviour | Receipt | State |
|---|---|---|---|
| L4 | A deletion requires a trimmed, non-empty reason, bounded to 2,000 characters | `e2e/replatform/lifecycle.spec.ts:64` (`LIFECYCLE_CASES[0]`); `server/test/explorers-lifecycle.integration.test.ts:167` | covered |
| L5 | A duplicate submit records the reason exactly once | `server/test/explorers-lifecycle.integration.test.ts:152`; `e2e/account-lifecycle.spec.ts:331` | covered |
| L6 | Feedback never accepts caller-supplied ownership, and carries no cross-account payload | `server/test/explorers-lifecycle.integration.test.ts:152,177`; `e2e/replatform/lifecycle.spec.ts:93` (`LIFECYCLE_CASES[1]`) | covered |
| L7 | A cross-origin feedback write is denied, and an invalid reason is not recorded at all | `server/test/explorers-lifecycle.integration.test.ts:167`; `e2e/replatform/lifecycle.spec.ts:149` (`LIFECYCLE_CASES[8]`) | covered |
| L8 | A failed feedback submission is retryable and the retry is the same submission | `e2e/replatform/lifecycle.spec.ts:64` (`LIFECYCLE_CASES[0]`, "retries one durable submission") | covered |

### Deletion

| # | Behaviour | Receipt | State |
|---|---|---|---|
| L9 | A deletion requires feedback belonging to the same account | `server/test/explorers-lifecycle.integration.test.ts:177`; `e2e/replatform/lifecycle.spec.ts:93` | covered |
| L10 | A lost deletion response keeps authority, and the retry reuses the same durable key rather than issuing a second deletion | `e2e/account-lifecycle.spec.ts:349` | covered |
| L11 | Finalisation purges owned content and typed attachments, retains the shared catalog, and leaves a non-revivable tombstone | `server/test/explorers-lifecycle.integration.test.ts:75,615` | covered |
| L12 | A Music-mapped deletion stays pending until the Music owner boundary releases it, and an unmapped deletion is not starved behind it | `server/test/explorers-lifecycle.integration.test.ts:328,363,414,447` | covered |
| L13 | A terminally deleted account is not recreated with its old content by repeating Google login | `server/test/explorers-recovery.integration.test.ts:47`; `e2e/replatform/lifecycle.spec.ts:148` (`LIFECYCLE_CASES[7]`) | covered |

### Authority and fencing

| # | Behaviour | Receipt | State |
|---|---|---|---|
| L14 | Unresolved lifecycle authority fails closed before any destructive control is reachable | `e2e/account-lifecycle.spec.ts:219` (parameterised over status modes) | covered |
| L15 | A finalised deletion hides every ordinary delete entry point and performs no destructive call | `e2e/account-lifecycle.spec.ts:232` | covered |
| L16 | A pending deletion survives a reload and a second tab | `e2e/account-lifecycle.spec.ts:248` | covered |
| L17 | Checking a pending deletion re-reads the authority without mutating it | `e2e/account-lifecycle.spec.ts:282` | covered |
| L18 | An identity change mid-flight abandons the in-flight lifecycle command, and a delayed old response cannot navigate or act for a new owner | `e2e/account-lifecycle.spec.ts:369`; `e2e/replatform/lifecycle.spec.ts:153` (`LIFECYCLE_CASES[9]`) | covered |
| L19 | A **held** deletion, deactivation or recovery completion cannot mutate, navigate or log out either a verified replacement owner B or a fresh verified returning A session | `e2e/replatform/lifecycle.spec.ts:202` (`LIFECYCLE_CASES[10]` and `[11]`, both generated by the `returningA` loop) | partial — feedback only; terminal completions unverified |

## The 3 recovery behaviours

| # | Behaviour | Receipt | State |
|---|---|---|---|
| R1 | A purpose-bound proof recovers an eligible account exactly once, and content access then requires a **fresh ordinary session** | `server/test/explorers-lifecycle.integration.test.ts:194`; `server/test/account-recovery.test.ts:30`; `server/test/explorers-recovery.integration.test.ts:52`; `e2e/replatform/auth.spec.ts:118` | covered |
| R2 | The recovery credential authorises recovery and nothing else: an ordinary route refuses it, and a wrong provider identity, an expired proof and a replay each fail **without any state change** | `e2e/replatform/auth.spec.ts:126-127` (ordinary `/me` returns 401 holding only the proof); `server/test/explorers-recovery.integration.test.ts:40,60`; `server/test/explorers-recovery-callback.integration.test.ts:101,140,151,165,177,194`; `e2e/replatform/lifecycle.spec.ts:145,147` (`LIFECYCLE_CASES[4]`, `[6]`) | covered |
| R3 | Two simultaneous recoveries produce exactly one transition, and the loser is rejected rather than queued | `server/test/explorers-lifecycle.integration.test.ts:250`; `e2e/replatform/lifecycle.spec.ts:146` (`LIFECYCLE_CASES[5]`) | covered |

## Open obligations

These are the rows above that are **not** discharged, plus the obligations 2.4 states
outside the behaviour set. Nothing here is counted as covered anywhere in this map.

1. **The typed lifecycle observation union — DONE 2026-10-08.**
   `tunes/shared/explorersLifecycleObservation.ts` defines the union over outcomes
   (`recovered` / `pending` / `terminal` / `manual_review` / `unknown`) and a pure
   `classifyLifecycleObservation`, so every outcome is reachable in a unit test. C3 is
   followed: `GET /api/explorers/v1/recovery/status` returns it and **no second endpoint was
   added**. `ReactivateConfirm.tsx` now has a state per outcome.

   Writing it found that **C3 is wrong about one thing, and the error mattered.** C3 says a
   client which lost its response "can re-observe state through `/recovery/status` without
   replaying the proof". It could not. `requireRecoveryPrincipal` gates on `consumed_at IS
   NULL` **and** `a.status IN ('suspended','pending_deletion')`, and a successful recovery
   violates both — so the re-read returned **403**, indistinguishable from an expired proof.
   A terminal account was excluded by the same status filter, so `terminal` could never be
   reported either. Two of the five outcomes were unreachable by construction.

   **This required a security boundary change, and it is called out rather than buried.**
   `requireRecoveryObservation` in `server/auth/accountRecovery.ts` is a separate authority
   with its own brand and `purpose`, not assignable to `RecoveryPrincipal` or to `Actor`.
   Relative to the transition principal it drops exactly two conditions — `consumed_at IS
   NULL`, and the account-status filter — and keeps all the others, including the proof's
   original five-minute expiry and the revocation check. So the widening is: *for the
   remainder of a proof's own lifetime, its holder may read that one account's lifecycle
   status after using it.* It writes nothing, resolves only the binding already on the
   proof, returns no profile or content, and cannot be exchanged for a session.
   `/recovery/complete` keeps the strict gate untouched.

   The security inventory was updated to stop saying something untrue: that route's
   `ownerSource` was `single-use-google-bound-recovery-proof` and is now
   `google-bound-recovery-proof-within-expiry-read-only`
   (`tunes/scripts/inventory-runtime-surfaces.ts`, and the regenerated
   `docs/architecture/music-runtime-surface-inventory.json`).

   **If the owner would rather a consumed proof read nothing, revert the authority split.**
   The consequence of reverting is explicit: the lost-response and terminal cases become
   unreportable again, which is the defect L0 exists to remove.

   Receipts: `server/test/explorers-lifecycle-observation.test.ts` (17 classifier cases,
   including every indeterminate input and the ordering rules);
   `server/test/explorers-lifecycle.integration.test.ts` "typed lifecycle observation"
   (6 cases against real PostgreSQL, covering the two formerly unreachable outcomes,
   read-only-ness, expiry, revocation and that the authority grants nothing else);
   `explorers-earth/src/pages/__tests__/Reactivate.music-transport.test.tsx` (5 cases, one
   per rendered outcome). Mutation-checked: putting `requireRecoveryPrincipal` back fails
   exactly the recovered and terminal cases.
2. **The manual-review DTO — DONE 2026-10-08.** `lifecycleManualReviewSchema` in the same
   contract file, reached by two derivations: `operation_failed` (the latest operation is in
   state `failed`) and `orphaned_transition` (the account is mid-transition with no
   operation to account for it). It carries a quotable operation reference and an internal
   failure **code** — never the owner's own feedback text, which a test asserts does not
   travel in the payload. The UI contract is the `review` state in `ReactivateConfirm.tsx`,
   which shows the reference and deliberately offers **no action**, since re-entering a
   stuck flow is how one stuck account becomes a loop.
3. **The real Google callback acceptance — DISCHARGED 2026-10-09, executed and observed.**
   The provider-adapter boundary was already well covered
   (`server/test/explorers-recovery-callback.integration.test.ts`, 8 cases), but every one
   of those drives a *simulated* callback. 2.4's grooming focus states a fixture cannot
   stand in for the live callback, and C6 kept it mandatory. So it was run for real.

   **Run.** `tunes/scripts/live-google-local.ts --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`
   at commit `f16b6202` on a clean tree, 2026-10-08T21:30Z. The harness starts a disposable
   PostgreSQL 15, migrates it, composes `createCanonicalApp` with a freshly generated
   `EXPLORERS_AUTH_SECRET` and the Google client from `tunes/.env.oauth.local`, and serves
   the real Vite app at `http://localhost:5175`. Configured callback:
   `http://localhost:5175/api/auth/callback/google`. Database
   `music_uat_fa41c9b9aed1194cff0e2e1c69711226`, at floor
   **`0051_explorers_launch_controls`** — so this also exercised the new schema floor.

   **This is the canonical Better Auth callback, not the legacy one.** Worth stating because
   the live product's Google flow goes to `https://api.localqr.earth/api/connect/google`
   (Strapi), and a receipt against that would attest to the wrong thing. The harness passes
   only `EXPLORERS_PUBLIC_ORIGIN`, `EXPLORERS_AUTH_SECRET` and the Google client into
   `createCanonicalApp`; no `STRAPI_*` variable reaches it, and the run log contains no
   Strapi contact.

   **Who did what.** TK completed Google consent in a browser with their own account. The
   before and after state was read directly out of the disposable database. No credential
   was handled by the writer of this receipt.

   **Before — captured empty, which is what makes the after evidence:**

       auth_user=0  auth_account=0  auth_session=0  creator_accounts=0

   **After:**

   | Observation | Value |
   |---|---|
   | `auth_user` | 1 |
   | `auth_account` | 1, `provider_id='google'`, provider subject 21 chars, access and id tokens both present |
   | `auth_session` | 1, expires in 168h, `ip_address` present, token 32 chars |
   | `creator_accounts` | 1, `handle` **NULL**, `onboarding_status='incomplete'`, `status='active'`, `locale='en'`, `public_profile=true`, `revision=1` |
   | `initial_account_bindings` | one row binding user `uQ3Ak2…` to account `75341800-ddb1-4b4a-bfff-d9129bc98b49` |
   | `account_music_identity` | **0** |

   **What that demonstrates.** An inactive-to-active first login through the real provider
   completes; a normal session is issued with the ordinary 7-day lifetime; exactly one
   canonical account is provisioned, keyed by a **UUID** rather than a Strapi document id;
   the account-to-identity binding is recorded once; and the owner is routed to onboarding
   because `onboarding_status` is `incomplete` with no handle yet — which is the lifecycle
   screen 2.4's line 48 asks to see working, and is what TK observed in the browser.

   `account_music_identity` staying at 0 is correct, not a gap: `AuthSyncManager` provisions
   the Music identity only after verified authentication **and completed onboarding**, so a
   first login that stops at onboarding must not create one.

   **What this receipt does NOT cover**, so it is not read wider than it is:

   - Completing onboarding, and the transition to `onboarding_status='complete'`.
   - "A deleted account must not be automatically recreated with the old content merely by
     repeating Google login" (2.4's lifecycle boundary). That needs a prior deletion in the
     same database and a second consent; it is covered by simulation in
     `explorers-recovery-callback.integration.test.ts` and not by this run.
   - Cancelled consent, wrong identity, ambiguous binding and issuance failure. All eight
     of those remain covered by the simulated suite, which 2.4 treats as separate evidence —
     this receipt does not replace it.
   - Hosted execution. This ran on a developer machine; obligation 5 is still open.
4. **Music socket revocation — DISCHARGED 2026-10-09 in `e809d57b`.** It was open, and the record of why is kept below because the argument for it being *already* satisfied was wrong in an instructive way, and the fix was the thing that argument assumed away.

   The argument, recorded because it is persuasive for three of its four steps: the socket's per-event recheck calls `resolveSubject`/`resolveCanonical`, which refuse a tombstoned, suspended or pending-deletion venue **and** a `sessionVersion` mismatch, and `musicSocketServer.ts:188-205` disconnects on refusal, with tests covering it. All true.

   Where it fails: **nothing bumps the venue's `session_version` on logout.** That column is moved only by Music revocation operations - suspend, block, delete, recovery. There is no canonical logout handler and nothing revoking the Music credential on sign-out; `useLogout` calls `closeLocalMusicSession()` and `authClient.signOut()`, both **client side**. A cooperative client close is not revocation: a crashed tab, a modified client or a socket open elsewhere keeps receiving owner events after sign-out, while HTTP is correctly denied because owner routes require a live web-session Actor.

   So suspension and deletion revoked both transports; **logout revoked only HTTP**. That was the residual, and it was exactly what this obligation's wording asks for.

   **Closed by binding a canonical Music credential to the session that minted it**, and rechecking that session with the same predicate `authorizeOperation` applies to HTTP - the `auth_session` row exists, belongs to this user, and has not expired. The handshake ticket inherits the binding, so an open socket is rechecked against the same session as owner HTTP and the two transports revoke together.

   Receipt: the measured before/after is in `e809d57b`'s message. Proof is
   `canonical-music-identity.integration.test.ts` - "revokes both transports on logout, not just HTTP", which asserts HTTP still 401s, that the venue's `session_version` is deliberately unchanged (the reason the old recheck passed), and that the credential and the open socket's recheck both now refuse. Mutation-checked: removing the recheck fails exactly that case. Four unit cases in `music-principal.test.ts` carry the branch coverage the 100% Music gate requires, including that an unbound credential consults no session, so a credential minted before the claim existed keeps working until it expires.

   Two claims were needed rather than one: `auth_session.session_version` is the canonical session's counter while a Music credential's `sessionVersion` is the venue's, so they cannot be compared. A partial binding is refused at mint and at verification, since a session id with no user cannot be looked up and would silently skip the check. The review-focus item
   "a logged-out or suspended owner must lose socket authority as well as HTTP access" has
   no receipt here. `tunes/server/music/canonicalMusicPrincipal.ts:8` documents that socket
   credentials belong to 6.1. L3 above covers HTTP and tab revocation only, and must not be
   read as covering sockets.
5. **Hosted attestation of the browser receipts — OPEN, with its written prerequisite now
   done.** The one-to-one retirement map C4 demanded is written:
   [`lifecycle-legacy-retirement-map.md`](lifecycle-legacy-retirement-map.md). It maps all
   **11** executing legacy cases, and finds 2 clean gaps and 5 partials - so retirement is
   blocked on coverage as well as on gating, which was not previously established. The
   canonical lane is registered at
   `.github/workflows/frontend-e2e-qualification.yml:122`, but that workflow runs only on a
   nightly schedule and manual dispatch, so **none of the 12 canonical lifecycle cases gates
   a merge**. Two things are needed and neither belongs to this map: wiring the lane into a
   protected aggregate (merge governance, owned jointly with 1.3) and the one-to-one map
   from each retired legacy case to its canonical replacement. Until both exist,
   `account-lifecycle.spec.ts` stays, because it is the only lifecycle coverage that gates.
6. **The held-completion fence (L19) — DONE, and it was already done.** Kept as an entry
   rather than deleted, because this list previously said the opposite. Both cases run at
   `e2e/replatform/lifecycle.spec.ts:202`; the C1 correction above explains why a
   line-anchored grep missed them.
7. **The hardening note is closed by obligation 1.** `/recovery/status` used to index
   `account.rows[0]` unchecked. The observation query no longer joins `creator_accounts` at
   all — a missing row now reaches the classifier and becomes `unknown`, which is exactly
   what that outcome is for.

## What this map does not license

- It does not retire any existing coverage. 2.4 is explicit that old workflow coverage must
  not be retired against a partial map, and this map is partial — **one open obligation
  remains (5, hosted attestation)**. Obligation 3 was discharged on 2026-10-09 by an
  executed run and obligation 4 on the same day in `e809d57b`.
- It does not give a percentage. All 22 behaviour rows have receipts, and obligations 3 and
  4 are now discharged — the real Google callback by an executed, observed run rather than
  by simulation, and Music socket revocation by closing the logout gap. Reporting "22/22"
  would still be misleading while **obligation 5** is open: hosted execution is an
  attestation gap that no behaviour row can discharge.
- It does not substitute for the original enumeration, which remains lost. See the first
  section.
