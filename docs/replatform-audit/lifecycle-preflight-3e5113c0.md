# Lifecycle implementation preflight at3e5113c0

Two fresh read-only subagents inspected the integrated source. These are source findings, not new runtime receipts. They refine package B of the reconciled sequence.

## Numeric retirement: genuine database gap

Canonical provisioning in `tunes/server/music/accountMusicRepository.ts` uses serial allocation. Migration0040's INSERT guard checks numeric IDs only against legacy `music_identity_tombstones`.0041 skips that tombstone for canonical deletion;0042 deletes the canonical venue without persisting its numeric ID. The runtime role has table INSERT and sequence UPDATE authority. Normal serial allocation avoids reuse, but explicit retired-ID inserts and sequence reset are not durably denied.

The existing terminal maintenance test proves finalization and intentionally zero Strapi tombstones. The existing concurrent numeric reuse test at `server/test/migrations/music-migration.integration.test.ts:604` covers legacy retirement only. This is a missing database guarantee, not just missing naming or documentation.

### B1 bounded implementation

- Allocate the next append-only migration identifier after rechecking the integrated chain; do not edit0040–0042.
- Persist immutable canonical numeric retirement separately from Strapi identities, linked to the retained account deletion operation. Do not reference the deleted users row or manufacture Strapi IDs.
- Replace `finalize_canonical_music_venue_deletion(integer,text,text)` to acquire the existing numeric advisory lock before row locking and record retirement atomically with deletion. Preserve exact pending-operation ownership and retry behavior.
- Update `enforce_music_identity_insert()` to reject either legacy or canonical retired numeric IDs before its canonical/legacy branch. Check UPDATE-based ID reassignment too; INSERT protection alone does not close that path.
- Protect retirement evidence against runtime UPDATE/DELETE/TRUNCATE; update role manifests/attestation, migration contracts and restore inventories.
- Amend ADR008 decision5 to describe the delivered account-operation retirement and separate numeric fence. Previous canonical releases did not preserve IDs; record unavailable backfill rather than fabricating it.

**Named proofs:** existing terminal maintenance case retains numeric evidence and operation link; explicit canonical/legacy inserts and sequence reset reject retired canonical ID; concurrent retirement/insert serialize correctly; runtime cannot alter retirement history. Preserve legacy release behavior and zero fake Strapi tombstones.

## Recovery completion: genuine stale UI gap

`ReactivateConfirm.tsx` is reachable outside GuestRoute and can stay mounted after verifying another ordinary session. Its completion success and catch handlers unconditionally update UI after awaiting fetch. Its observation guards unmount only, not auth generation. A held old completion can therefore show stale success/error under replacement B or fresh A. Settings has generation guards; recovery does not.

### B2 smallest component package

Extend existing `src/pages/__tests__/Reactivate.music-transport.test.tsx` using the actual auth refresh/store interface. Hold one real revision-bound completion request; verify B, or B then fresh A; release success or failure. Assert replacement authority unchanged, no stale success/error/recovery action, no navigation/sign-out/follow-up mutation. Also hold observation and unmount to preserve cleanup behavior.

Use a synchronous generation snapshot/subscription fence, following `services/useAccountLifecycleIdentity.ts` invalidation timing but not its ordinary-auth predicate: recovery legitimately starts signed out with purpose-only authority. Invalidate both ready/submitting completion and observation on generation change; render an inert expired-flow state. Do not automatically acquire or submit new recovery authority for the replacement owner.

Scoped frontend verification: `npm run test:unit -- src/pages/__tests__/Reactivate.music-transport.test.tsx`, then `npx tsc -b`. Exact behavior should fail before the fix and pass after it; no fixture database needed for this component regression.

## B3 canonical browser replacement qualification

Add deletion/deactivation/recovery completion × verified B/fresh returning A. Keep existing feedback cases unchanged. Use actual UI command, `route.fetch()` committed response, then held `route.fulfill()`. Verify session plus `/me` and generation, capture settled server state, release response and assert no stale action/navigation/sign-out and unchanged current identity.

Deletion/deactivation revoke A's sessions and block A. To establish fresh returning A, use real Google recovery in a second page before verifying A; `control('session',0)` alone must fail `/me`. No unblock/status fabrication.

Current standalone runner: from tunes, `npm run explorers:test:lifecycle-browser -- --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15`. It allocates disposable PostgreSQL and requires the explicit acknowledgement. It rejects invented grep/subset flags. Update actual case identities/guards/contracts and protected manifests under one coordinator, retain capability isolation and deny-by-default egress.

Legacy replacement residuals remain: unresolved read UI fencing, pending deletion reload/second tab, terminal controls, read-only checking, deactivation revision/request count, stale revision rejection and lost deletion/idempotency custody. Successful canonical deletion revokes authority; do not recreate it to satisfy stale legacy prose.

B1 and B2 implementation can be separately reviewed. Schema/fixtures/protected manifests and source qualification windows remain serialized. Full6.4/2.4 acceptance still requires the real database/browser/hosted proofs, not component passes alone.
