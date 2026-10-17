# Ticket 6.4: Canonical Music owner deletion saga

> **Implementation update2026-10-09:** Canonical finalization is delivered by0042. Append-only0052 now implements separate canonical numeric retirement, insertion nonreuse and immutable numeric keys; see [the B1 record](../numeric-retirement-implementation-2026-10-09.md). Source/static review and exact-head hosted database regressions pass at1f4ce7bf; browser/release acceptance remains pending. ADR008 decision5 records the implementation without fake Strapi tombstones or historical backfill. Historical representability preflights below are superseded; execution requirements remain binding.

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-06.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## Why this ticket exists

Added 2026-10-06, after 6.1 landed. It is the deferred half of ADR-008 decision 5, raised to a ticket because 6.1 made its absence reachable and a real-stack lane proved it.

`accountLifecycleMaintenance` refuses to finalise an account deletion while `account_music_identity` holds a row for that account: it marks the operation `MUSIC_BOUNDARY_PENDING` and excludes it from the claim window. Its comment states the dependency plainly — *"Music ownership is delivered in 6.1"*. Before 6.1 nothing in production ever wrote that row, because `musicIdentityCoordinator.reconcile()` had no caller, so the boundary was unreachable and deletions completed.

6.1 delivered provisioning and not the release. `15c119df` contains the blast radius by provisioning only from the Music surface, so the boundary again applies to Explorers who actually opened Music — the population it was written for. **It does not close the hole: a real Music owner's deletion request still never finalises.** That is a privacy-relevant failure and it is this ticket's whole subject.

`e2e/replatform/lifecycle.spec.ts` case `terminal maintenance preserves tombstone and denies recovery` is the standing proof. It passes 11 of 12 in the `real-stack lifecycle` lane and fails that case, expecting `{ status: 'deleted', collections: 0 }` and observing `{ status: 'pending_deletion', collections: 1 }`. Treat a green lane as this ticket's acceptance signal, not as an invitation to change the case.

## What was tried and why it was reverted

`a3019187` attempted the release inside maintenance and `65693ae5` reverted it. Three independent guards each encode "a Music venue has a Strapi identity", and clearing one only exposes the next:

1. `retain_music_identity_tombstone_on_delete` (AFTER DELETE on `users`) records a tombstone keyed on `strapi_user_document_id`, that table's primary key, and `strapi_account_document_id`, `NOT NULL UNIQUE`. Both are NULL on a canonical venue. **Migration 0041 already resolves this one** by returning early for a canonical venue, since there is no external identity for a Strapi-keyed tombstone to protect.
2. A direct `DELETE FROM users` is forbidden outright — *"direct user delete forbidden; use finalize_music_identity_deletion"* (0004, reinforced in 0005).
3. `finalize_music_identity_deletion` itself inserts into `music_identity_lifecycle_operations` with `identity.strapi_user_document_id` and `identity.strapi_account_document_id`, both `NOT NULL`.

**Corrected 2026-10-06, after implementation.** The paragraph that stood here claimed guard 3 was the real scope and that clearing it meant widening the Strapi-keyed lifecycle tables — the ripple [ADR-008](../../adr/008-canonical-account-is-the-music-credential-subject.md) decision 3 refused. That was wrong, and it was the stated reason for the revert. The three guards are not a chain: guard 2 is a *capability* check, satisfied when three transaction-local settings name the exact venue, so `finalize_music_identity_deletion` is never required and its NOT NULL Strapi columns are never reached. **No lifecycle table is widened and decision 3's ripple is not incurred.**

Setting those settings from `accountLifecycleMaintenance` was the obvious next step and was correctly refused in review: that flag is the control between ordinary code and deleting a Music identity, and application code must not assert it. Migration 0042 puts the privilege inside the database as `finalize_canonical_music_venue_deletion(integer,text,text)`, which does strictly more than assert — it refuses unless the venue is genuinely canonical *and* genuinely owned by a pending account deletion naming that operation, clears the authorization before returning so a second unchecked delete cannot ride the same transaction, and is idempotent for a retried maintenance pass. Its EXECUTE grant also belongs in `expectedRuntimeFunctions` in `server/db/music-runtime-role.ts`; omitting it fails the role attestation, which is how that was found.

## Implementation and acceptance

**Depends on:** 6.1 (landed), and the ADR decision below. **Modify:** a new append-only migration; `tunes/server/application/accountLifecycleMaintenance.ts`; `tunes/server/repositories/musicIdentityRepository.ts`; `tunes/shared/schema.ts`; existing `tunes/server/test/explorers-lifecycle.integration.test.ts`, `server/test/musicLifecycle.integration.test.ts`.

- [ ] **Blocking preflight — record the representability decision in an ADR before any writer is dispatched.** ADR-008 decision 5 states a canonical owner has no representable tombstone and that giving it one is a further append-only migration belonging to the lifecycle work. This ticket is that work, so the decision must be made explicitly: either make `music_identity_tombstones` and `music_identity_lifecycle_operations` accept a canonical owner, or define a separate canonical retirement record. Do not widen either table without it.
- [ ] Choose and record which identity retires a canonical owner. `music_identity_tombstones.strapi_user_document_id` is the primary key and `lifecycle_operation_id` carries a foreign key into the operations table, so a canonical tombstone needs both a key and an operation row that does not exist today.
- [ ] Add a failing real-PostgreSQL regression first: an account owning a canonical venue requests deletion, maintenance claims it, the venue and its mapping are gone, the account reaches `deleted`, and the retirement record exists in whatever form the ADR chose. A canonical venue must be provisioned the way `accountMusicRepository` does — both Strapi columns NULL from the start, venue and mapping in one transaction, because 0039's ownership check is a deferred constraint trigger.
- [ ] Preserve the legacy path unchanged. A venue carrying Strapi document ids still records its tombstone and still blocks until its own saga retires it. The existing case asserting `MUSIC_BOUNDARY_PENDING` uses `MusicIdentityRepository.ensureIdentity`, which is a legacy venue, and must keep asserting the block.
- [ ] Keep every guard that does not depend on a Strapi identity: the numeric user id advisory lock, the numeric tombstone check that stops a retired id being reused, and the batch fairness that prevents a blocked owner starving others.
- [ ] Run the real-PostgreSQL lifecycle and Music suites, then the `real-stack lifecycle` lane, and require its terminal-maintenance case green. **Done:** a canonical Music owner's deletion request finalises, with retirement recorded and no orphaned venue or content.

## Risks

It is account deletion, so the failure modes are asymmetric: finalising when the venue has not been released orphans Music content belonging to a deleted account, and failing to finalise is the defect this ticket exists to remove. The numeric Music user id must not become reusable. Widening a lifecycle table's `NOT NULL` is visible to every reader of that table, which is the cost ADR-008 decision 3 priced and deferred rather than denied.

## Notes for whoever picks this up

Replacing a function in this append-only chain is a trap worth knowing: `retain_music_identity_tombstone_on_delete` was created in 0003 and replaced in 0005, and writing 0041 from the 0003 body silently reverted three of 0005's hardenings with no conflict and no type error. Grep every migration for the latest definition and extend that one, and compare the statements programmatically rather than by eye. Only a real-database suite catches it.
