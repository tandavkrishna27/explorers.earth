# Platform integration and schema acceptance

## Later delegated access (Epic 10)

These application-owned tables bind verified OAuth consent and an application issuance generation to creator accounts. They do not replace Better Auth token/client/consent storage or implement custom OAuth. Native library identifiers are opaque text. Raw OAuth credentials never appear in these tables.

### delegated_grant_bindings

| Column | PostgreSQL type | Null/default | Constraint/meaning |
|---|---|---|---|
| id | uuid | NOT NULL, gen_random_uuid() | PK; application Actor grantId |
| provider_consent_id | text | NULL, no default | FK oauth_consent(id), ON DELETE SET NULL; null always denies authorization |
| generation | bigint | NOT NULL, 1 | CHECK between 1 and 9007199254740991; original issuance generation must be bound into each token |
| user_id | text | NOT NULL, no default | FK auth_user(id), ON DELETE RESTRICT |
| account_id | uuid | NOT NULL, no default | FK creator_accounts(id), ON DELETE RESTRICT |
| client_id | text | NOT NULL, no default | Verified registered OAuth client; not supplied as authority by a tool |
| resource_audience | text | NOT NULL, no default | Exact canonical MCP resource |
| scopes | text[] | NOT NULL, no default | Nonempty subset of approved scope registry |
| created_at | timestamptz | NOT NULL, now() | Creation time |
| updated_at | timestamptz | NOT NULL, now() | Explicitly maintained on update |
| expires_at | timestamptz | NULL, no default | Application binding expiry if imposed; native consent itself has no expiry |
| revoked_at | timestamptz | NULL, no default | Local irreversible denial marker |

Index `(user_id, account_id)` where revoked_at IS NULL for disconnect/account revocation; index provider_consent_id supports live consent lookup. Partial UNIQUE(user_id,account_id,client_id,resource_audience) WHERE revoked_at IS NULL AND provider_consent_id IS NOT NULL permits only one current binding per context. CHECK expires_at IS NULL OR expires_at > created_at; CHECK cardinality(scopes)>0. Validate scope subset at runtime against a versioned registry rather than freezing library-supported future scopes into a misleading SQL enum. Native consent must still exist with matching verified user/client/resource/scopes and membership must be current; a row alone is never proof of authorization. Every protected request also compares the token's original application binding ID/generation to this active row. Scope reduction, disconnect or re-consent invalidates earlier generation; reconnect cannot revive old access or refresh credentials. Creation validates the existing account membership transactionally. Terminal account deletion revokes grants and removes these delegated bindings while retaining the core minimal account tombstone. Native consent deletion sets the FK null and denies use even if the row survives. Better Auth1.7.6 does not expose a universal token grant ID. Its customAccessTokenClaims extension is a candidate binding seam; runnable issuance/refresh tests must prove the original binding generation is preserved and old refresh credentials cannot adopt a new generation. Until that passes, Epic10 cannot claim delegated authorization complete. See [source qualification](auth-recovery-qualification.md).

### mcp_analytics_preferences

| Column | PostgreSQL type | Null/default | Constraint/meaning |
|---|---|---|---|
| user_id | text | NOT NULL, no default | PK component; FK auth_user(id), ON DELETE CASCADE |
| account_id | uuid | NOT NULL, no default | PK component; FK creator_accounts(id), ON DELETE CASCADE |
| enabled | boolean | NOT NULL, false | Absent/false means no linked product analytics |
| policy_version | text | NOT NULL, no default | Version explicitly accepted |
| recorded_at | timestamptz | NOT NULL, now() | User preference evidence |
| withdrawn_at | timestamptz | NULL, no default | Withdrawal time |

PK `(user_id,account_id)`; CHECK enabled=false OR withdrawn_at IS NULL. No anonymous-user row, browser-cookie inference, or default opt-in. Native OAuth consent is separate; granting a tool scope does not set enabled. Do not build a new preference screen solely for analytics: leave disabled until an explicit supported consent interaction exists. These rows are unnecessary for Milestones 1–3 and are created only if Epic 10 introduces that explicit preference.

## Query growth and concurrency qualification

This design supports growth through indexed relationships and bounded queries; no capacity claim is made before measurement. Start with PostgreSQL on each existing host, no RDS, Redis, vector service, partitioning or replica requirement.

| Query/workload | Required access path and correctness check |
|---|---|
| Public creator by handle | Unique normalized handle lookup, then active/public gates; no sequential profile scan |
| Creator category feed | Account/category/visibility/order index with stable ID tie-breaker; signed opaque keyset cursor bound to filters |
| Shared entity discovery | Provider identifier unique lookup, or bounded text search; no title-based identity merge |
| Who recommends entity | Entity/account index, distinct active public accounts; repeated recommendations do not inflate creator count |
| Collection contents | Collection/position/ID index; ownership and visibility predicates apply to parent and child |
| Reorder and guide section edits | Lock parent; compare revision once; reorder atomically with deferrable uniqueness or equivalent transaction-safe mechanism |
| Owner analytics | Account/time index and bounded 366-day range; event dedupe transaction; no all-account event scan |
| Media retrieval | Asset primary key plus typed attachment lookup; current visibility each request, no public URL as authority |
| Job claiming | Partial eligible-job index; SKIP LOCKED leases, bounded batches, retries idempotent |
| Music publication/queue | Preserve existing advisory locks, transactional guards, revision/idempotency rules; measure socket reconnect and write contention |

Ticket 1.1 records baseline host capacity and product traffic assumptions. Tickets 3.1, 7.3 and 8.5 capture EXPLAIN (ANALYZE, BUFFERS) on disposable representative data, including one creator with many items, many creators sharing an entity and sparse private/public mixes. Test small and at least one materially larger dataset, record sizes, concurrency, p50/p95, buffer reads and query count, and agree observed acceptance limits before release. A small fixture choosing a sequential scan is not itself failure; unexplained unbounded scans at representative scale are. Use real query plans rather than inventing universal latency promises. Check N+1 behavior with query-count assertions. Add indexes only for observed/required predicates; include write/storage cost in review. Future partitioning/read replicas require measured need.

## Physical-schema completion gate

This document fixes application design; executable SQL still belongs to ticket implementation. Before an owning schema ticket passes:

1. Generate pinned Better Auth/Drizzle definitions where library-owned, and diff every field, nullability, default, PK/FK, unique/check, index, trigger and function against the reviewed contract.
2. Apply the complete append-only migration chain to an empty authorized PostgreSQL database. Test a prior milestone database upgrade separately; fresh production start does not excuse broken subsequent migrations.
3. Query pg_catalog to assert named constraints, FK actions, index order/predicates and runtime grants; ORM types alone do not prove SQL enforcement.
4. Exercise foreign ownership, invalid category, concurrent provision/reorder/retry, rollback, archive and terminal delete against the real database.
5. Restore a backup into a disposable database and verify domain counts, media manifest and migration journal before promoting the tested application artifact.

No schema push, library startup migration or modification of existing committed migration history is permitted as a shortcut. QA and production use the same migration version with separate data and credentials. Generated library fields and version-specific OAuth compatibility remain qualification gates, explicitly not verified DDL in this planning document.

## Bounded retention defaults

These are explicit initial engineering choices for implementation, not claims about legal retention requirements. Product/legal policy may shorten them; changes must update the schema contract, scheduled jobs and tests together. Jobs use database time and bounded batches.

| Data | Initial policy |
|---|---|
| Recovery proofs | Expire after exactly 5 minutes; delete expired rows after 24 hours; never retain raw proof |
| Unattached uploads | Mark for cleanup after 24 hours; only delete when no typed attachment exists; retry storage failures |
| Deletion feedback | Purge raw text/user attribution on terminal deletion or after 30 days, whichever occurs first |
| Analytics events | Keep at most 366 days; delete earlier on account terminal deletion |
| Analytics retry receipts | Keep minimized retired key/hash marker for account lifetime so old events cannot be replayed after event purge; no raw payload |
| General command receipts | Replay sanitized responses for 24 hours; retain only minimized key/hash marker for account lifetime; resource references are nonauthoritative |
| Successful outbox jobs | Remove payload after 7 days; terminal failed jobs keep minimized error/task context up to 30 days with an alert/retry decision |
| Email delivery logs | Redact message/template variables at creation; keep operational metadata up to 30 days |
| Music publication | Retain existing 24-hour replay, 30-day archive and timestamp-bearing key-retirement rules; never replace with general receipt policy |
| Account/Music tombstones | Keep only minimal identifier/generation/deletion boundaries required to prevent resurrection; strip contact/content immediately; no automatic expiry that could restore old authority |
| Backups | Daily, 14-day expiry as the deployment plan's initial default; off-host S3 copies; terminal deletion may remain in inaccessible backups until expiry, restore must reapply deletion boundaries before serving traffic |

Expired retries return an explicit retired/conflict response rather than silently re-executing writes. Future bounded-marker retirement needs an issued-at key protocol like Music's; do not delete replay guards solely to reduce table size. Storage prefix/backup access remains backend-only. Prove cleanup cannot erase currently referenced media or required lifecycle history.
