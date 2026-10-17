# Next package: source consolidation and lifecycle evidence repair

This brief turns the independent review into the first bounded work allocation. The larger sequence is in `../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md`. It authorizes no deployment, database reset or protection bypass.

## A — existing package review

**Inputs:** integration `46274e06`; PR #121 `67260702`; independent review and reconciled ticket ledger.

**Output:** PR #121 review disposition, verified artifact/receipt inventory and one consolidated integration source freeze. If its head changes, inspect the delta before relying on this brief.

**Read:** PR diff and reviews; pending `HANDOFF.md`; `docs/replatform/evidence/2026-10-09/local-automated-7-3/record.md`; workflow base/path filters; Google callback receipt and lifecycle/Music receipts.

**Checks:** distinguish every artifact's assertion source from the SHA where it ran, record missing artifacts, inspect exact-head required checks and known-red cause. Preserve122-pass/126-skip custody; do not relabel unexecuted browser/provider/UAT as passed. Check migration0042 and0051 manifest/role declarations through existing image/database checks. This is review of existing outputs, not a blanket test rerun.

**Shared-file ownership:** one integration owner controls merge, index, migrations, route registration, workflow and fixture manifest. Other reviews are read-only. Integration must preserve the local reconciliation edits and pending branch changes rather than staging unrelated shared-worktree files.

## B — lifecycle contract/evidence package

**Prerequisite:** A's consolidated source freeze. Documentation traceability can be prepared beforehand, but code edits and qualification bind to the actual resulting tree.

**Files to reconcile:**

- `docs/replatform-audit/lifecycle-requirement-receipt-map.md`: authored assertion versus executed receipt, L19 partial.
- `docs/replatform-audit/lifecycle-legacy-retirement-map.md`: both gaps/five partials, preserved fail-closed unresolved-authority UI.
- `docs/adr/008-canonical-account-is-the-music-credential-subject.md`: actual account-operation retirement implemented by0042, replacing stale unimplemented claim without pretending numeric retirement proof exists.
- `docs/replatform-audit/tickets/ticket-2-4.md`, `ticket-6-4.md`: residual obligations and current dispositions; preserve acceptance requirements.
- `explorers-earth/e2e/replatform/lifecycle.spec.ts` and its actual guarded fixture: missing held terminal-completion assertions.
- `tunes/server/test/explorers-lifecycle.integration.test.ts`, real retirement implementation and existing numeric tombstone/reuse tests: trace actual nonreuse guarantee before adding code.

**Named required outcomes for L19:** for each deletion, deactivation and recovery completion, hold the actual completion response, establish verified replacement B or fresh returning A, then release it. Assert current authority/session remains unchanged, no stale navigation/sign-out or follow-up mutation is issued, and state of both accounts matches the committed server operation. Preserve the existing feedback cases; they prove a different boundary. Observe a real sent completion request so a test cannot pass without exercising the operation.

**Legacy replacement outcomes:** unresolved/pending/terminal controls remain correctly fenced; pending deletion survives reload and second tab; stale deactivation preserves the replacement identity; lost deletion response retains command/idempotency custody; observed revisions and request counts remain asserted. Reuse existing cases only when their exact behavior matches.

**6.4 outcome:** keep delivered canonical finalization/removal/operation proof. Identify how retired numeric Music ID cannot be reissued. If no current guarantee proves that requirement, write a failing regression against the actual allocator and propose its bounded implementation; do not add a Strapi tombstone for a canonical identity by assumption.

**Execution rule:** first bind named cases to current runner/fixture identities and commands. Use the existing PostgreSQL guarded harness and receipt producers; proposed files/flags in old tickets are not executable commands. Confirm resource ownership/explicit acknowledgement before allocating a disposable database. Keep both old and canonical gates until replacement coverage and protected execution are proved.

**Exit:** requirements→actual source→authored assertion→execution receipt→hosted gate map; ADR reflects implemented retirement design; any residual numeric guarantee is assigned, not silently dropped. No whole-ticket acceptance is inferred from the map itself.

## C — combined Music harness handoff

After B, allocate canonical auth/ensure server plus actual Music HTTP/socket entrypoint over shared owned database/signing configuration, with frontend Music origin explicitly pointed at it. Qualify actual Better Auth sign-out with a connected socket, owner/guest isolation, reconnect, expiry, suspension/deletion, terminal maintenance and desktop/mobile. Existing direct session-delete principal proof is an input. Old credentials without session bindings require their documented expiry compatibility to be pinned and dispositioned.

The owner of this fixture also owns protected manifest/runner changes. Category/public lane writers consume this frozen interface; they do not edit shared identity authority or allocate migration IDs independently. QA Q1 preparation can proceed concurrently without creating a trusted candidate before required green.
