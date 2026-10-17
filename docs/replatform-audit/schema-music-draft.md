# Music and operational database schema draft

**Status:** design and source evidence only; no DDL executed or application code changed. Audited repository revision: `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`. This is the Music contribution to the authoritative target schema; canonical auth/accounts, category content and new analytics events are defined by their respective schema drafts.

**Authority order:** ordered SQL migrations `tunes/migrations/0001_runtime_baseline.sql` through `0021_explorers_analytics_receipts.sql`, plus journal DDL in `tunes/server/db/migrate.ts:243`, govern existing database behavior. `tunes/shared/schema.ts` is a partial ORM mapping and is not the complete catalog. The exact migration text is reproduced in the evidence appendix below, including every column, default, constraint, FK, index, trigger, function and privilege statement. Later replacements override earlier definitions. This is repository-intended schema, not an inspected live database.

## 1. Target ownership and retained model

Keep the numeric Music owner identity independent of login identity. Final target renames internal `users` to **`music_owners`**; this is an internal physical cleanup in the explicit canonical migration, not a frontend or public API rename. Existing `users` remains the transitional physical name until that migration and repository changes land together. A canonical account maps to exactly one numeric Music owner through `account_music_identity`.

Proposed target mapping (new):

| Column | Type/null/default | Constraint |
|---|---|---|
| account_id | uuid NOT NULL | PRIMARY KEY; FK canonical `creator_accounts(id)` ON DELETE RESTRICT |
| music_user_id | integer NOT NULL | UNIQUE; FK `music_owners(id)` ON DELETE CASCADE; CHECK >0 |
| created_at | timestamptz NOT NULL DEFAULT transaction_timestamp() | immutable |

Mapping PK/unique indexes serve both directions. Both columns are immutable after creation. Provisioning takes canonical account advisory lock then numeric owner lock, checks canonical tombstone/active state, creates owner and mapping in one transaction. Membership controls **who may operate** the account; the mapping does not point to an arbitrary current owner login. Creator account deletion first executes the authorized Music lifecycle deletion, which cascades the mapping and Music content, then strips canonical profile/content and retains the minimal creator-account, membership and initial-binding tombstone required by the core policy. An exceptional identity-erasure hard purge requires a separately verified child-first sequence and replacement denial boundary; it is not the normal terminal-deletion path. `ON DELETE RESTRICT` prevents bypassing the Music saga by directly deleting the parent account.

Target Music tables retain their internal integer keys and `user_id` column names for compatibility, but every such retained FK points to `music_owners(id)` and every request resolves it server-side from `Actor.accountId`. A caller-provided numeric ID is never authority. Catalog entities do not replace queue occurrences or playlist track snapshots: the same YouTube video may appear multiple times with distinct queue IDs/positions.

## 2. Complete target music_owners columns

The following is the **complete retained column set**, not an abbreviated list. `timestamp` means the existing timestamp-without-time-zone type; preserving it avoids an accidental conversion. New control metadata uses timestamptz. Values crossing the app boundary must have explicit UTC interpretation. `serial` remains the existing integer sequence, NO CYCLE, no reuse after tombstone.

| Columns | Type/null/default | Rules/index |
|---|---|---|
| id | serial PRIMARY KEY | >0; numeric identity immutable; tombstoned ID cannot be reinserted |
| guest_url | text NOT NULL | UNIQUE, nonsecret public slug; capability is separate |
| venue_name | text NOT NULL | Music presentation value, not identity; derive/update from account presentation contract |
| theme | jsonb NOT NULL DEFAULT '{"primary":"#6E56CF"}' | validated current theme shape in service |
| allow_song_requests | boolean NOT NULL DEFAULT true | guest request policy |
| allow_guest_play_on_device | boolean NOT NULL DEFAULT true | guest device playback policy |
| allow_playlist_sharing | boolean NOT NULL DEFAULT false | sharing policy |
| allow_recently_played_visibility | boolean NOT NULL DEFAULT true | history visibility |
| allow_queue_visibility | boolean NOT NULL DEFAULT false | migration0019; do not infer from sharing flag |
| created_at, updated_at | timestamp NOT NULL DEFAULT now() | existing type; updated_at service/trigger policy explicit |
| identity_status | text NOT NULL DEFAULT 'active' | CHECK active/suspended/pending_deletion; canonical account lifecycle is authority, Music value maintained transactionally, not independent editable status |
| session_version | integer NOT NULL DEFAULT1 | CHECK >=1; monotonically nondecreasing; Music revocation generation, not Better Auth session identifier |
| entitlement_state | text NOT NULL DEFAULT 'unknown' | CHECK unknown/included/eligible/entitled/revoked |
| entitlement_version | bigint NOT NULL DEFAULT0 | CHECK >=0 |
| entitlement_source_updated_at | timestamptz NULL | CHECK version=0 OR timestamp IS NOT NULL |
| lifecycle_operation_id | text NOT NULL | nonempty; FK `music_identity_lifecycle_operations(operation_id)` ON DELETE NO ACTION; no longer unique after0003 |
| lifecycle_state | text NOT NULL DEFAULT 'none' | CHECK none/requested/running/completed/failed/cancelled |
| lifecycle_attempt_count | integer NOT NULL DEFAULT0 | CHECK >=0 |
| lifecycle_last_attempt_at | timestamptz NULL | durable retry metadata |
| lifecycle_error_code | text NULL | bounded service code, never upstream response secrets |
| lifecycle_retention_stage | text NOT NULL DEFAULT 'identity-active' | lifecycle retention marker |
| guest_capability_hash | text NOT NULL | UNIQUE; exactly64 lowercase hex characters; plaintext never stored |
| guest_capability_issued_at | timestamptz NOT NULL DEFAULT now() | issuance |
| guest_capability_rotated_at, guest_capability_revoked_at | timestamptz NULL | each absent or >=issued_at; changed hash requires rotation metadata |
| guest_discoverable | boolean NOT NULL DEFAULT false | discoverability differs from possession of an unlisted capability |
| music_queue_revision | bigint NOT NULL DEFAULT0 | source0018 has no nonnegative CHECK; **target adds >=0** and rejects decrement in protected mutation path |
| public_snapshot_revision | bigint NOT NULL DEFAULT0 | source0020; **target adds >=0**; DB-backed invalidation counter |

Retained secondary indexes: entitlement state/source timestamp; lifecycle state/last attempt; partial discoverability WHERE true. Drop selected-Strapi-account and reconciliation indexes after canonical replacements. Mapping's account PK replaces selected account lookup. Do not copy `username`, `password`, `email`, OTP/verification fields, `is_admin` or team manager ownership into this target.

Explicit removed existing `users` columns: `username`, `password`, `email`, `otp`, `otp_expiry`, `email_verification_token`, `email_verification_expiry`, `is_email_verified`, `account_manager_id`, `is_admin`; `strapi_user_document_id`, `strapi_account_document_id`, `strapi_username_snapshot`, `strapi_email_snapshot`, `strapi_account_name_snapshot`, `strapi_account_type_snapshot`, `strapi_account_mobile_snapshot`, `strapi_provider_snapshot`; `last_identity_sync_at`, `last_reconciled_at`, `reconciliation_observation_version`, `reconciliation_mismatch_count`. Auth and profile data have canonical owners. No placeholder Strapi IDs, random login passwords or fake external snapshots are required in the final target.

The complete old users definition remains in the evidence appendix, including all removed column constraints; changing required fields requires replacing dependent triggers/functions and repository insert statements in the same migration release. Do not drop NOT NULL constraints indiscriminately.

## 3. Content and operational tables retained unchanged structurally

Below, `NN` means NOT NULL, `?` nullable, `PK` primary key. All unspecified FK actions are PostgreSQL NO ACTION. These tables keep existing fields; replacing owner FK target is the only structural change unless marked new.

| Table | Every column (SQL type / null / default) | Keys, checks, deletion and indexes |
|---|---|---|
| playlists | id serial PK; user_id integer NN; name text NN; description text?; is_visible_to_guests boolean NN false; created_at timestamp NN now(); updated_at timestamp NN now() | user_id→music_owners CASCADE; idx_playlists_user(user_id) |
| songs | id serial PK; user_id integer NN; youtube_id/title/artist/thumbnail_url text NN; position integer NN; status text NN 'queued'; played_at timestamp? | owner CASCADE; status queued/playing/played; idx_songs_user_status_position(user_id,status,position) |
| played_songs | id serial PK; user_id integer NN; song_id integer NN; played_at timestamp NN now() | owner CASCADE; song→songs CASCADE; idx_played_songs_user_played(user_id,played_at) |
| playlist_songs | id serial PK; playlist_id integer NN; youtube_id/title/artist/thumbnail_url text NN; position integer NN; added_at timestamp NN now() | playlist→playlists CASCADE; idx_playlist_songs_playlist_position(playlist_id,position) |
| guest_interactions | id serial PK; user_id integer NN; guest_id text NN; page_view boolean? true; song_request boolean? false; interaction_type text NN; created_at timestamp NN now(); session_duration integer? | owner CASCADE; idx_guest_interactions_user_created(user_id,created_at) |
| youtube_api_usage | id serial PK; endpoint_type text NN; user_id integer?; quota_cost integer NN0; created_at timestamp NN now() | owner SET NULL; cost>=0; idx_youtube_api_usage_user_created(user_id,created_at) |
| playback_states | id serial PK; user_id integer NN UNIQUE; state jsonb NN '{}'; updated_at timestamp NN now() | owner CASCADE; SQL-only baseline table; retain until active player state is proven to use solely canonical queue state and parity-covered replacement |

Source has **no unique position constraints** on queue or playlist songs and no database CHECK that queue positions are nonnegative. Do not invent a zero/one-based rule without matching current service behavior. Retain owner row locks, exact ordered-set validation and transactional renumbering. Target adds composite owner validation for played history: `UNIQUE songs(id,user_id)` plus composite FK `played_songs(song_id,user_id) REFERENCES songs(id,user_id) ON DELETE CASCADE`, replacing the single-column song FK, so a mismatched history owner cannot reference another account's queue. Preserve the separate owner cascade. Validate its index/query cost.

## 4. Durable control tables: canonical transforms

These tables are **not** ordinary account-owned rows to cascade away. Operation records surviving owner deletion prevent replay against a new resource. Canonical account IDs and actor audit IDs deliberately have no FK where immutable deletion history must outlive the referenced account/user. An absent FK is intentional here, not permission to accept client IDs.

### music_identity_lifecycle_operations

Target columns: `operation_id text PK`; `account_id uuid NN` replaces the two Strapi document IDs; `initiated_by_user_id text?` is a non-FK audit snapshot, not ownership; `music_user_id integer NN CHECK >0` (legacy SQL allowed NULL for unmappable historical rows; fresh canonical data does not need those rows); `operation_kind text NN`; `requested_identity_status text NN`; `operation_state text NN DEFAULT 'requested'`; `attempt_count integer NN DEFAULT0`; `result_session_version integer?`; `error_code text?`; `created_at,updated_at timestamptz NN DEFAULT now()`; `operation_phase text NN DEFAULT 'single'`.

Checks: operation nonempty; kind provision/suspend/reactivate/delete/cancel_deletion/tombstone; requested status active/suspended/pending_deletion; state requested/running/completed/failed/cancelled; attempt>=0; result NULL or>=1; phase single/prepared/finalized. Index `(account_id,created_at)` replaces source subject index; `(music_user_id,operation_kind)` retained, no partial predicate needed with target NN. No FK to music owner/account/user; surviving history is required.

Triggers preserve immutable operation ID/account/numeric resource/kind/requested status; attempt increment exactly on requested→running and failed→requested; allowed transitions requested→running/failed/cancelled, running→completed/failed/cancelled, failed→requested; updated_at maintained by DB. Only completed delete operation may transition prepared→finalized. Source of final semantics: migrations0004–0006.

### music_identity_tombstones

Target columns: `account_id uuid PK`; `music_user_id integer NN UNIQUE CHECK >0`; `reason text NN`; `lifecycle_operation_id text NN UNIQUE CHECK length>0` FK lifecycle operations ON DELETE NO ACTION; `retention_stage text NN DEFAULT 'tombstone-retained'`; `source_updated_at timestamptz?` becomes canonical lifecycle source timestamp (no remote absence proof); `created_at timestamptz NN DEFAULT now()`. Remove both Strapi document IDs. Numeric/account uniqueness are independent; prevent re-provision of either retired account or numeric owner.

Tombstone identity immutability and restricted insertion remain. No CASCADE FK to deleted owner/account. `account_id` PK replaces subject/account duplicate indexes. Deletion replay requires matching numeric owner, account and operation—not a mere reused operation key. Source0005 explicitly rejects binding a historical external-only tombstone to an arbitrary numeric identity; target keeps equivalent resource-bound replay.

### music_credential_revocation_operations

Target columns: `operation_id text PK`; `music_user_id integer NN CHECK>0`; `account_id uuid NN`; `initiated_by_user_id text?`; `reason text NN`; `expected_session_version integer NN`; `result_session_version integer NN`; `operation_state text NN DEFAULT 'completed'`; `completed_at timestamptz NN DEFAULT now()`. Remove two Strapi document IDs. No owner/account/user FKs. Checks preserve UUIDv4 regex for operation ID, reason logout_all/entitlement_security_revocation/credential_compromise, expected>0, result=expected+1, state exactly completed. UNIQUE(music_user_id,expected_session_version); index(account_id,music_user_id) replaces subject pair index. Runtime SELECT/INSERT only; ALWAYS immutability trigger rejects UPDATE/DELETE. Exact retry returns same result; conflicting operation/resource/version rejects.

### music_reactivation_tokens

Target columns: `token_hash text PK CHECK /^[a-f0-9]{64}$/`; `account_id uuid NN`; `requesting_user_id text NN` canonical identity snapshot; `operation_id uuid NN UNIQUE`; `expires_at timestamptz NN`; `lease_owner uuid?`; `lease_expires_at timestamptz?`; `consumed_at,revoked_at timestamptz?`; `created_at timestamptz NN DEFAULT clock_timestamp()`. Replace numeric Strapi user and both document IDs. No cascading history FK; authenticated reactivation resolves current canonical Google user/account membership before consuming authority. Token is hashed, never plaintext at rest.

Checks: lease owner/expiry both null or both present; expires>created. Partial expiry index on expires_at WHERE consumed_at IS NULL AND revoked_at IS NULL. Trigger locks identity/hash/operation/expiry/created fields and makes consumed/revoked timestamps one-way. Runtime SELECT/INSERT/UPDATE, no DELETE/TRUNCATE/REFERENCES/TRIGGER. Expiration/lease/idempotency tests remain; recovery code never clears a consumed token to reuse it.

## 5. Publication and queue receipts retained exactly

### music_publication_operations

Columns: `music_user_id integer NN CHECK>0`; `idempotency_key_hash char(64) NN`, `request_fingerprint char(64) NN` (both lowercase64hex); `request_mode varchar(16) NN` private/unlisted/public; `operation_state varchar(24) NN` completed/replay_expired; `created_at,completed_at,expires_at,updated_at timestamptz NN`; `shredded_at timestamptz?`; `response_key_id varchar(64)?`; `response_nonce,response_ciphertext,response_tag bytea?`. PK(music_user_id,idempotency_key_hash). No owner FK: replay history must survive owner deletion.

Checks: completed>=created; expires=completed+24hours; updated>=completed; completed state requires no shred timestamp, valid key ID pattern, nonce12bytes, ciphertext1–4096bytes, tag16bytes; replay_expired requires shred timestamp and all cipher fields NULL. Expiry index `(expires_at,music_user_id,idempotency_key_hash) WHERE response_ciphertext IS NOT NULL`; compaction index same columns WHERE state='replay_expired'. Final trigger overwrites creation/completion/update times with database transaction time on INSERT, derives expiry and prevents mutation except expiry-qualified one-way shredding and archive-backed expired deletion. Runtime SELECT/INSERT/UPDATE only; compaction deletes through the bounded SECURITY DEFINER function. SQL0011 initial trigger is superseded by0012/0013/0015; do not copy only the original.

### music_publication_operation_archive

Columns: music_user_id integer NN CHECK>0; idempotency_key_hash char(64) NN hex; request_fingerprint char(64) NN hex; request_mode varchar(16) NN private/unlisted/public; completed_at,expires_at timestamptz NN; archived_at timestamptz NN DEFAULT clock_timestamp(). PK(music_user_id,idempotency_key_hash); expires=completed+24h; archived>=expires. Index `(archived_at,music_user_id,idempotency_key_hash)`. No owner FK. Runtime has no direct table rights; function-mediated lookup/compaction only. Archive immutable during30-day retention; DB trigger permits aged deletion, compactor limited1–1000 rows and SKIP LOCKED. Historical publication key cannot become a new write after archive deletion: application validates timestamp-bearing key age against DB time.

Application contract source `tunes/shared/musicPublicationContract.ts`: replay24h, key retention30days, future skew5minutes. Repository `musicPublicationOperationRepository.ts` bounds100 active operations per owner and10,000 globally with advisory locks. Preserve these initial limits pending measured qualification. Capability replay ciphertext has key ID/nonce/tag; backups without the corresponding protected decryption keys cannot reproduce pending replay responses. Do not publish the keys in schema/data exports.

### music_owner_operations

Columns: music_user_id integer NN FK music_owners CASCADE; operation text NN; idempotency_key_hash text NN hex64; request_hash text NN hex64; status_code integer NN; response_body jsonb NN; created_at timestamptz NN DEFAULT transaction_timestamp(); expires_at timestamptz NN. PK(music_user_id,operation,idempotency_key_hash); expires>created. Index `(expires_at,music_user_id,operation)`. Runtime SELECT/INSERT/DELETE only, not UPDATE. Unlike publication/lifecycle history, this owner-command cache cascades when the owner is finalized; numeric IDs remain nonreusable, so the old receipt cannot target a new account.

Queue replace/append in `musicDomainRepository.ts:319` onward uses command hash/replay lookup, owner row FOR UPDATE, expected queue revision, ordered snapshot mutation and receipt in one transaction. Failed transaction preserves old queue. Duplicate same command replays without reappending; same key different request conflicts; stale expected revision conflicts. Public and owner revision notifications must become observable only after commit. `publicMusicRevision.ts` and repository calls are authoritative for actual notification protocol. Retain public revision for queue visibility and publication changes, not solely track inserts.

## 6. Every other baseline table: retained, replaced or retired

All columns/defaults/FKs/indexes of these source tables are reproduced verbatim in appendix0001; this table gives the target disposition without suggesting legacy admin features are required.

| Source table | Target disposition | Reason / constraint preservation |
|---|---|---|
| team_members | Retire after removing `users.account_manager_id` | Legacy admin/team model, not canonical creator membership |
| user_profiles | Replace by creator profile schema; retire | Do not maintain duplicate personal/address/social profile authority |
| session | Replace by Better Auth session table; retire | Existing sid/sess/expire is Passport express-session, not a second required session system |
| api_tokens | Retire | Legacy plaintext token/admin system; no conversion to MCP OAuth grants |
| page_contents | Replace with canonical reference/legal/help content | Admin UI deferred; repeatable seeds, locale support defined in core schema |
| seo_settings | Retire; deployment/reference content owns equivalent active metadata | No reintroduced settings admin; environment canonicals still required |
| system_settings | Retire after active config consumers use validated runtime config | `is_secret` flag is not encrypted storage or a reason to copy secrets into DB |
| youtube_music_playlists | Retire | Legacy external-import content; no active paid import revival |
| youtube_music | Retire | Same |
| youtube_tokens | Retire | Legacy provider credentials not needed by current API-key Music flow |
| youtube_playlists | Retire | Legacy integration snapshots |
| widgets | Retire | Legacy widget product excluded |
| youtube_api_calls | Retire after writer audit; retain `youtube_api_usage` as canonical quota writer | Avoid two counters; raw SQL baseline existence does not imply active route |
| user_sessions | Retire after replacing active analytics consumers with canonical minimal event model | This contains device/IP/location and must not be conflated with Better Auth sessions |
| user_activity | Retire after canonical audit/analytics replacement | Raw request path logging is not required indefinitely |
| activity_logs | Replace by canonical audit events | Preserve required audit behavior, not duplicate logs |
| analytics_snapshots | Replace by canonical analytics aggregates | Preserve existing dashboard totals using event fixtures; no historical backfill |
| email_templates | Retain as operational service table until canonical template ownership established | Existing fields below; do not rebuild email-admin UI |
| email_logs | Retain minimized operational delivery log | Existing fields below; replace legacy API-token attribution, do not drop required delivery evidence |
| explorers_analytics_receipts | Replace Strapi publisher dependency, retain idempotent receipt role | Fresh canonical analytics event storage owns payloads; receipt integration described below |
| music_schema_migrations | Retain | Audit/checksum/ordered migration authority, no app mutation |

Retirement is contingent on exact reader/writer replacement in source and parity tests. It is not permission to delete a table merely because its admin route is tombstoned. Current `storage.ts` still references many of these tables; explicit cleanup/recomposition must precede final DROP. Fresh database does not prevent runtime SQL from failing on absent relations.

**Retained email_templates complete target:** id serial PK; name,subject,html_content,text_content text NN; variables jsonb NN DEFAULT '{}'; created_at,updated_at timestamp NN DEFAULT now(); created_by_user_id text? FK canonical auth user ON DELETE SET NULL (replaces numeric created_by); is_active boolean NN DEFAULT true. Target adds UNIQUE(name); use stable canonical template names as seed keys. Seed collisions fail rather than overwrite arbitrary content. This is the sole operational email-template table; no admin UI is added.

**Retained email_logs complete target:** id serial PK; recipient,subject,status text NN; template_id integer? FK email_templates SET NULL; error_message text?; created_at timestamp NN DEFAULT now(); delivered_at timestamp?; message_id text?; metadata jsonb? DEFAULT '{}'; is_test boolean? DEFAULT false; variables text?. Remove api_token_id after retired legacy API-token routes are removed; never store entire credential-bearing template inputs in variables/metadata. Target adds index(created_at,id) for bounded retention and `(message_id)` partial WHERE NOT NULL for delivery lookup; whether unique requires provider-event semantics verification, so no invented unique constraint.

**explorers_analytics_receipts existing complete schema:** event_id text PK; payload_hash text NN; status text NN DEFAULT pending CHECK pending/committed/failed; strapi_document_id text?; last_error text?; lease_id text?; created_at,updated_at timestamp NN DEFAULT now(). Target retires this legacy table in Epic 8 after the canonical analytics_events and analytics_event_receipts tables replace every consumer. Do not mutate it into a second competing receipt store. Event payload and receipt commit must be one PG transaction; no external publisher lease is required for a local-only transaction. If retaining delivery leases for external telemetry, put them in an explicit outbox, not the receipt. Event IDs/hash equality enforce duplicate retry versus conflict. This source receipt table alone is not analytics storage.

**music_schema_migrations complete schema:** id text PK; checksum char(64) NN lowerhex64; schema_checksum char(64) NN lowerhex64; applied_at timestamptz NN DEFAULT now(). Runtime SELECT only. Migration executor compares actual catalog fingerprint and ordered chain, serializes authority, transacts each migration and records its checksum. No schema-push command bypass.

## 7. SQL/Drizzle alignment and canonical migration order

`schema.ts` has25 pgTable declarations; SQL migrations create35 tables and the runner creates the36th, `music_schema_migrations`. SQL additionally defines raw-control/legacy tables. Especially `music_publication_operations`, archive, reactivation tokens and migration journal remain SQL-owned. `public_snapshot_revision` exists in0020 but is not mapped in current users pgTable. ORM `.references()` alone does not reproduce source check constraints, triggers, partial indexes or function privilege boundaries. Target ORM must map all retained columns it reads/writes and leave explicit SQL-only authority documented; no autogenerated diff should drop unrecognized objects.

Append migrations after0021 rather than edit historical checksums. Canonical identity/media/category migrations may consume0022 onward; reserve the Music migration number in the shared migration plan before writing it. Implementation order:

1. Create canonical users/accounts/memberships and account lifecycle policy.
2. In one reviewed Music canonical migration release, replace external-ID columns/functions with account-bound equivalents, create mapping, add target checks/composite history FK, update runtime grants and repositories. Empty database means no historical data transform, but migrations0001–0021 still execute first and must be followed by compatible ALTERs.
3. Rename internal users to music_owners with all function bodies/raw SQL/ORM/FK/readiness manifests updated; if root chooses to retain physical users temporarily, record that explicit transitional state rather than two competing targets.
4. Replace analytics/session/profile/config consumers, remove retired tables only after route/storage reference audit; update table manifest and schema fingerprint expectations atomically.
5. Validate fresh migration, repeated migration no-op, wrong checksum/catalog rejection and final schema constraints/privileges against disposable PostgreSQL15. Assert no Strapi variable needed for API boot or canonical identity creation.

Numeric owner deletion cannot be a plain DELETE. The lifecycle service checks canonical account/user authority, locks account then numeric identity deterministically, records prepared durable operation, advances generation, transitions pending_deletion, finalizes the authorized delete and tombstone in one transaction, then emits disconnect. Remove external absence proof and HTTP exchange, but retain saga idempotency, operation/resource matching, immutable history and cancellation transition restrictions. Canonical account deletion must be orchestrated around these DB safeguards.

## 8. Operational roles, scalability and verification

Self-hosted PostgreSQL15 on each accepted QA/prod host, distinct databases/credentials/volumes. Runtime login inherits a NOLOGIN nonsuperuser capability role; no CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS or schema CREATE. Migrator is a separate deployment authority. Source0010 default privileges grant broad future table DML: every new canonical auth/secret/control table must explicitly revoke inappropriate inherited rights in the migration. Do not claim least privilege because a role is nonsuperuser while exposing all new credentials tables to unnecessary code paths.

Security-definer functions pin `search_path=pg_catalog,public`, qualify tables and revoke PUBLIC execution. Runtime cannot rewrite migration journal, tombstones, revocation history or archive; function-mediated compaction/authorized lifecycle must remain bounded and test role permissions directly. Test rogue runtime DELETE/TRUNCATE/UPDATE failures, not only route403 responses. Migrator-only restore/provision authority must never be placed in web environment variables.

Index/query checks: explain plans for owner queue(status,position), playlist membership, recent history, public slug/capability lookup, current account mapping, lifecycle retry scan, receipt expiry and publication compaction using representative seeded cardinality. Add id tie-breakers to deterministic ordering where source only orders position/time. Bound all list reads and cleanup batches; SKIP LOCKED compaction avoids global stalls. Size database pool against colocated host limits and actual concurrent sockets; socket connections must not each reserve a PG connection. Retain PostgreSQL transactional notification semantics; no extra graph/cache service required for Music correctness.

Bigint counters exceed safe JS integer range eventually; use decimal strings at wire boundary or explicit checked safe-integer conversion, never silently truncate. Existing ORM mode number and raw `Number(row.revision)` are source behavior to harden deliberately. Preserve serial integer IDs until capacity demonstrates need; no speculative bigint migration hidden inside auth work.

Required tests: concurrent account provisioning yields one map; duplicate numeric ID blocked after tombstone; same-account team member future policy does not create new owner; wrong-owner queue/history/playlist mutation denied; queue expected-revision/retry semantics; public/private/unlisted/capability rotation; database-clock replay expiry; archive retention/key retirement; suspended/revoked socket access; deletion retry wrong resource fails; rollback produces no partial queue or premature public invalidation; entitlement unknown does not accidentally remove active core Music or revive retired paid integration; public snapshot revision increments and private metadata does not leak.

Backup/restore includes all durable control tables, sequences, checks/functions/triggers and grants, plus protected replay encryption key references. Dump each self-hosted DB consistently; restore into disposable PG15 with new role credentials, verify migration fingerprint and serial sequences, then exercise publication replay/deletion idempotency. Same accepted S3 bucket uses qa/prod prefixes for backups; keys shared across prefixes are application separation, not IAM isolation. No restore into production as a test. Retained immutable receipts are not silently excluded as “cache” because some underpin durable replay/security behavior.

## Evidence appendix — complete ordered source DDL

The following blocks reproduce the exact audited SQL, not proposed migration code. They include retired tables for complete column-level traceability. Use final replacements above to derive the target; do not execute this document. Source migrations must remain unchanged.

### Source: tunes/migrations/0001_runtime_baseline.sql

```sql
CREATE TABLE team_members (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  regions text[] NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  email text UNIQUE,
  otp text,
  otp_expiry timestamp,
  email_verification_token text,
  email_verification_expiry timestamp,
  is_email_verified boolean DEFAULT false,
  guest_url text NOT NULL UNIQUE,
  venue_name text NOT NULL,
  theme jsonb NOT NULL DEFAULT '{"primary":"#6E56CF"}'::jsonb,
  allow_song_requests boolean NOT NULL DEFAULT true,
  allow_guest_play_on_device boolean NOT NULL DEFAULT true,
  allow_playlist_sharing boolean NOT NULL DEFAULT false,
  allow_recently_played_visibility boolean NOT NULL DEFAULT true,
  account_manager_id integer REFERENCES team_members(id),
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE playlists (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_visible_to_guests boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE songs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played')),
  played_at timestamp
);

CREATE TABLE played_songs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE playlist_songs (
  id serial PRIMARY KEY,
  playlist_id integer NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text NOT NULL,
  position integer NOT NULL,
  added_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE guest_interactions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  page_view boolean DEFAULT true,
  song_request boolean DEFAULT false,
  interaction_type text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  session_duration integer
);

CREATE TABLE youtube_api_usage (
  id serial PRIMARY KEY,
  endpoint_type text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  quota_cost integer NOT NULL DEFAULT 0 CHECK (quota_cost >= 0),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time timestamp NOT NULL,
  end_time timestamp,
  last_active_at timestamp,
  device_info jsonb,
  ip_address text,
  country_code text,
  region text,
  geo_data jsonb,
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE TABLE activity_logs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE analytics_snapshots (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date timestamp NOT NULL,
  total_views integer NOT NULL,
  total_song_requests integer NOT NULL,
  average_session_duration integer,
  total_playlists_created integer NOT NULL,
  total_songs_played integer NOT NULL,
  additional_metrics jsonb
);

CREATE TABLE user_activity (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path text NOT NULL,
  method text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX idx_session_expire ON "session"(expire);

CREATE TABLE api_tokens (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  name text NOT NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description text,
  scopes text[] NOT NULL DEFAULT '{}',
  is_app_wide boolean NOT NULL DEFAULT false,
  expires_at timestamp,
  expires_in_days integer,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE user_profiles (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  profile_picture text,
  country_code text,
  phone_number text,
  street_name text,
  state text,
  city text,
  country text,
  postal_code text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  twitter_url text,
  whatsapp_url text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE email_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  html_content text NOT NULL,
  text_content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE email_logs (
  id serial PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  template_id integer REFERENCES email_templates(id) ON DELETE SET NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  delivered_at timestamp,
  api_token_id integer REFERENCES api_tokens(id) ON DELETE SET NULL,
  message_id text,
  metadata jsonb DEFAULT '{}',
  is_test boolean DEFAULT false,
  variables text
);

CREATE TABLE page_contents (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true
);

CREATE TABLE seo_settings (
  id serial PRIMARY KEY,
  site_title text NOT NULL,
  meta_description text NOT NULL,
  meta_keywords text NOT NULL,
  og_title text NOT NULL,
  og_description text NOT NULL,
  og_image text NOT NULL,
  twitter_title text NOT NULL,
  twitter_description text NOT NULL,
  twitter_image text NOT NULL,
  google_analytics_id text,
  facebook_pixel_id text,
  google_tag_manager_id text,
  microsoft_clarity_id text,
  robots_txt text NOT NULL,
  sitemap_xml text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by integer REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE system_settings (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  is_secret boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by integer REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE youtube_music_playlists (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_music (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_tokens (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_ciphertext text, revoked_at timestamp, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_playlists (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE widgets (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'legacy', configuration jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_api_calls (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint text NOT NULL DEFAULT 'unknown', quota_cost integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE playback_states (id serial PRIMARY KEY, user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, state jsonb NOT NULL DEFAULT '{}', updated_at timestamp NOT NULL DEFAULT now());

CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_songs_user_status_position ON songs(user_id, status, position);
CREATE INDEX idx_played_songs_user_played ON played_songs(user_id, played_at);
CREATE INDEX idx_playlist_songs_playlist_position ON playlist_songs(playlist_id, position);
CREATE INDEX idx_guest_interactions_user_created ON guest_interactions(user_id, created_at);
CREATE INDEX idx_youtube_api_usage_user_created ON youtube_api_usage(user_id, created_at);
CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, last_active_at);
CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at);
CREATE INDEX idx_analytics_snapshots_user_date ON analytics_snapshots(user_id, snapshot_date);
CREATE INDEX idx_user_activity_user_created ON user_activity(user_id, created_at);
```

### Source: tunes/migrations/0002_identity_lifecycle.sql

```sql
ALTER TABLE users
  ADD COLUMN strapi_user_document_id text NOT NULL,
  ADD COLUMN strapi_account_document_id text NOT NULL,
  ADD COLUMN strapi_username_snapshot text,
  ADD COLUMN strapi_email_snapshot text,
  ADD COLUMN strapi_account_name_snapshot text,
  ADD COLUMN strapi_account_type_snapshot text,
  ADD COLUMN strapi_account_mobile_snapshot text,
  ADD COLUMN identity_status text NOT NULL DEFAULT 'active',
  ADD COLUMN session_version integer NOT NULL DEFAULT 1,
  ADD COLUMN last_identity_sync_at timestamp with time zone,
  ADD COLUMN entitlement_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN entitlement_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN entitlement_source_updated_at timestamp with time zone,
  ADD COLUMN last_reconciled_at timestamp with time zone,
  ADD COLUMN reconciliation_observation_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN reconciliation_mismatch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lifecycle_operation_id text NOT NULL,
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'none',
  ADD COLUMN lifecycle_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lifecycle_last_attempt_at timestamp with time zone,
  ADD COLUMN lifecycle_error_code text,
  ADD COLUMN lifecycle_retention_stage text NOT NULL DEFAULT 'identity-active',
  ADD COLUMN guest_capability_hash text NOT NULL,
  ADD COLUMN guest_capability_issued_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN guest_capability_rotated_at timestamp with time zone,
  ADD COLUMN guest_capability_revoked_at timestamp with time zone,
  ADD COLUMN guest_discoverable boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_strapi_user_document_id_unique UNIQUE (strapi_user_document_id),
  ADD CONSTRAINT users_strapi_account_document_id_unique UNIQUE (strapi_account_document_id),
  ADD CONSTRAINT users_lifecycle_operation_id_unique UNIQUE (lifecycle_operation_id),
  ADD CONSTRAINT users_guest_capability_hash_unique UNIQUE (guest_capability_hash),
  ADD CONSTRAINT users_identity_status_check CHECK (identity_status IN ('active','suspended','pending_deletion')),
  ADD CONSTRAINT users_session_version_check CHECK (session_version >= 1),
  ADD CONSTRAINT users_entitlement_state_check CHECK (entitlement_state IN ('unknown','included','eligible','entitled','revoked')),
  ADD CONSTRAINT users_entitlement_version_check CHECK (entitlement_version >= 0),
  ADD CONSTRAINT users_entitlement_freshness_check CHECK (entitlement_version = 0 OR entitlement_source_updated_at IS NOT NULL),
  ADD CONSTRAINT users_reconciliation_version_check CHECK (reconciliation_observation_version >= 0),
  ADD CONSTRAINT users_reconciliation_mismatch_check CHECK (reconciliation_mismatch_count >= 0),
  ADD CONSTRAINT users_lifecycle_state_check CHECK (lifecycle_state IN ('none','requested','running','completed','failed')),
  ADD CONSTRAINT users_lifecycle_attempt_count_check CHECK (lifecycle_attempt_count >= 0),
  ADD CONSTRAINT users_lifecycle_operation_id_check CHECK (length(lifecycle_operation_id) > 0),
  ADD CONSTRAINT users_guest_capability_hash_check CHECK (guest_capability_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT users_guest_capability_dates_check CHECK (
    (guest_capability_rotated_at IS NULL OR guest_capability_rotated_at >= guest_capability_issued_at) AND
    (guest_capability_revoked_at IS NULL OR guest_capability_revoked_at >= guest_capability_issued_at)
  );

COMMENT ON COLUMN users.guest_url IS 'Non-secret public discoverability slug; never a guest authorization capability';
COMMENT ON COLUMN users.guest_capability_hash IS 'SHA-256 hash of the random guest capability; plaintext is never persisted';

CREATE INDEX idx_users_selected_account ON users(strapi_account_document_id);
CREATE INDEX idx_users_reconciliation_scan ON users(identity_status, last_reconciled_at, reconciliation_mismatch_count);
CREATE INDEX idx_users_entitlement_freshness ON users(entitlement_state, entitlement_source_updated_at);
CREATE INDEX idx_users_lifecycle_scan ON users(lifecycle_state, lifecycle_last_attempt_at);
CREATE INDEX idx_users_guest_discoverability ON users(guest_discoverable) WHERE guest_discoverable = true;

CREATE TABLE music_identity_tombstones (
  strapi_user_document_id text PRIMARY KEY,
  strapi_account_document_id text NOT NULL UNIQUE,
  reason text NOT NULL,
  lifecycle_operation_id text NOT NULL UNIQUE,
  retention_stage text NOT NULL DEFAULT 'tombstone-retained',
  source_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (length(strapi_user_document_id) > 0),
  CHECK (length(strapi_account_document_id) > 0),
  CHECK (length(lifecycle_operation_id) > 0)
);
CREATE INDEX idx_music_identity_tombstones_account ON music_identity_tombstones(strapi_account_document_id);

CREATE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN
    RAISE EXCEPTION 'immutable strapi_user_document_id';
  END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN
    RAISE EXCEPTION 'immutable strapi_account_document_id';
  END IF;
  IF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'immutable lifecycle_operation_id';
  END IF;
  IF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION 'session_version cannot decrease';
  END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status AND NOT (
    (OLD.identity_status = 'active' AND NEW.identity_status IN ('suspended','pending_deletion')) OR
    (OLD.identity_status = 'suspended' AND NEW.identity_status IN ('active','pending_deletion')) OR
    (OLD.identity_status = 'pending_deletion' AND NEW.identity_status = 'suspended')
  ) THEN
    RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status;
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN
    RAISE EXCEPTION 'guest capability rotation metadata required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_music_identity_immutability
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_immutability();
```

### Source: tunes/migrations/0003_identity_lifecycle_hardening.sql

```sql
CREATE TABLE music_identity_lifecycle_operations (
  operation_id text PRIMARY KEY,
  strapi_user_document_id text NOT NULL,
  strapi_account_document_id text NOT NULL,
  operation_kind text NOT NULL,
  requested_identity_status text NOT NULL,
  operation_state text NOT NULL DEFAULT 'requested',
  attempt_count integer NOT NULL DEFAULT 0,
  result_session_version integer,
  error_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (length(operation_id) > 0),
  CHECK (length(strapi_user_document_id) > 0),
  CHECK (length(strapi_account_document_id) > 0),
  CHECK (operation_kind IN ('provision','suspend','reactivate','request_deletion','cancel_deletion','tombstone')),
  CHECK (requested_identity_status IN ('active','suspended','pending_deletion')),
  CHECK (operation_state IN ('requested','running','completed','failed','cancelled')),
  CHECK (attempt_count >= 0),
  CHECK (result_session_version IS NULL OR result_session_version >= 1)
);
CREATE INDEX idx_music_identity_lifecycle_operations_identity
  ON music_identity_lifecycle_operations(strapi_user_document_id,created_at);

INSERT INTO music_identity_lifecycle_operations(
  operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
  requested_identity_status,operation_state,attempt_count,result_session_version,created_at,updated_at
)
SELECT lifecycle_operation_id,strapi_user_document_id,strapi_account_document_id,'provision',
  identity_status,'completed',GREATEST(lifecycle_attempt_count,1),session_version,created_at,updated_at
FROM users;

INSERT INTO music_identity_lifecycle_operations(
  operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
  requested_identity_status,operation_state,attempt_count,created_at,updated_at
)
SELECT lifecycle_operation_id,strapi_user_document_id,strapi_account_document_id,'tombstone',
  'pending_deletion','completed',1,created_at,created_at
FROM music_identity_tombstones;

ALTER TABLE users
  DROP CONSTRAINT users_lifecycle_operation_id_unique,
  DROP CONSTRAINT users_lifecycle_state_check,
  ADD CONSTRAINT users_lifecycle_state_check CHECK (lifecycle_state IN ('none','requested','running','completed','failed','cancelled')),
  ADD CONSTRAINT users_lifecycle_operation_id_fk FOREIGN KEY (lifecycle_operation_id)
    REFERENCES music_identity_lifecycle_operations(operation_id);

ALTER TABLE music_identity_tombstones
  ADD CONSTRAINT music_identity_tombstone_operation_fk FOREIGN KEY (lifecycle_operation_id)
    REFERENCES music_identity_lifecycle_operations(operation_id);

CREATE FUNCTION enforce_music_lifecycle_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN RAISE EXCEPTION 'lifecycle attempt_count cannot decrease'; END IF;
  IF NEW.operation_state IS DISTINCT FROM OLD.operation_state AND NOT (
    (OLD.operation_state = 'requested' AND NEW.operation_state IN ('running','failed','cancelled')) OR
    (OLD.operation_state = 'running' AND NEW.operation_state IN ('completed','failed','cancelled')) OR
    (OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
  ) THEN RAISE EXCEPTION 'invalid lifecycle operation transition: % -> %', OLD.operation_state, NEW.operation_state; END IF;
  IF (OLD.operation_state = 'requested' AND NEW.operation_state = 'running'
      OR OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
     AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
    RAISE EXCEPTION 'lifecycle attempt_count must increment for an attempt';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_lifecycle_operation_state
BEFORE UPDATE ON music_identity_lifecycle_operations
FOR EACH ROW EXECUTE FUNCTION enforce_music_lifecycle_operation_state();

CREATE FUNCTION lock_music_identity_pair(user_document_id text, account_document_id text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('music:user:' || user_document_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('music:account:' || account_document_id, 0));
END;
$$;

CREATE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_music_tombstone_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM users
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'live immutable external identity exists';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
    requested_identity_status,operation_state,attempt_count
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'tombstone','pending_deletion','completed',1) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.operation_kind <> 'tombstone' OR operation.requested_identity_status <> 'pending_deletion'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION retain_music_identity_tombstone_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  IF requested_operation_id IS NULL THEN
    requested_operation_id := 'automatic-delete:' || OLD.id::text || ':' || txid_current()::text;
  END IF;
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,
    coalesce(requested_reason,'direct-database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN RAISE EXCEPTION 'immutable strapi_user_document_id'; END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN RAISE EXCEPTION 'immutable strapi_account_document_id'; END IF;
  IF NEW.session_version < OLD.session_version THEN RAISE EXCEPTION 'session_version cannot decrease'; END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    IF NEW.lifecycle_operation_id IS NOT DISTINCT FROM OLD.lifecycle_operation_id THEN RAISE EXCEPTION 'distinct lifecycle operation required'; END IF;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
    IF NOT FOUND OR operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
       OR operation.requested_identity_status IS DISTINCT FROM NEW.identity_status
       OR operation.operation_state <> 'completed' OR NEW.lifecycle_state <> 'completed' THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    IF NOT (
      (OLD.identity_status='active' AND NEW.identity_status='suspended' AND operation.operation_kind='suspend') OR
      (OLD.identity_status='suspended' AND NEW.identity_status='active' AND operation.operation_kind='reactivate') OR
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion' AND operation.operation_kind='request_deletion') OR
      (OLD.identity_status='pending_deletion' AND NEW.identity_status='suspended' AND operation.operation_kind='cancel_deletion')
    ) THEN RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status; END IF;
    IF (NEW.identity_status='suspended' AND OLD.identity_status='active' OR NEW.identity_status='pending_deletion')
       AND NEW.session_version <= OLD.session_version THEN RAISE EXCEPTION 'session_version must increment for suspension or deletion'; END IF;
  ELSIF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'lifecycle operation cannot change without identity status';
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN RAISE EXCEPTION 'guest capability rotation metadata required'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_music_identity_insert BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_insert();
CREATE TRIGGER music_identity_tombstone_insert BEFORE INSERT ON music_identity_tombstones
FOR EACH ROW EXECUTE FUNCTION enforce_music_tombstone_insert();
CREATE TRIGGER users_retain_music_identity_tombstone AFTER DELETE ON users
FOR EACH ROW EXECUTE FUNCTION retain_music_identity_tombstone_on_delete();
```

### Source: tunes/migrations/0004_identity_delete_saga.sql

```sql
ALTER TABLE music_identity_lifecycle_operations
  DROP CONSTRAINT music_identity_lifecycle_operations_operation_kind_check,
  ADD COLUMN operation_phase text NOT NULL DEFAULT 'single',
  ADD CONSTRAINT music_identity_lifecycle_operations_operation_phase_check
    CHECK (operation_phase IN ('single','prepared','finalized'));

DROP TRIGGER music_lifecycle_operation_state ON music_identity_lifecycle_operations;

UPDATE music_identity_lifecycle_operations
SET operation_kind='delete', operation_phase='prepared'
WHERE operation_kind='request_deletion';

ALTER TABLE music_identity_lifecycle_operations
  ADD CONSTRAINT music_identity_lifecycle_operations_operation_kind_check
    CHECK (operation_kind IN ('provision','suspend','reactivate','delete','cancel_deletion','tombstone'));

CREATE OR REPLACE FUNCTION enforce_music_lifecycle_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
  END IF;
  IF NEW.operation_phase IS DISTINCT FROM OLD.operation_phase AND NOT (
    OLD.operation_kind='delete' AND OLD.operation_state='completed'
    AND OLD.operation_phase='prepared' AND NEW.operation_phase='finalized'
  ) THEN
    RAISE EXCEPTION 'invalid lifecycle operation phase transition: % -> %', OLD.operation_phase, NEW.operation_phase;
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN RAISE EXCEPTION 'lifecycle attempt_count cannot decrease'; END IF;
  IF NEW.operation_state IS DISTINCT FROM OLD.operation_state AND NOT (
    (OLD.operation_state = 'requested' AND NEW.operation_state IN ('running','failed','cancelled')) OR
    (OLD.operation_state = 'running' AND NEW.operation_state IN ('completed','failed','cancelled')) OR
    (OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
  ) THEN RAISE EXCEPTION 'invalid lifecycle operation transition: % -> %', OLD.operation_state, NEW.operation_state; END IF;
  IF (OLD.operation_state = 'requested' AND NEW.operation_state = 'running'
      OR OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
     AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
    RAISE EXCEPTION 'lifecycle attempt_count must increment for an attempt';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_lifecycle_operation_state
BEFORE UPDATE ON music_identity_lifecycle_operations
FOR EACH ROW EXECUTE FUNCTION enforce_music_lifecycle_operation_state();

CREATE OR REPLACE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN RAISE EXCEPTION 'immutable strapi_user_document_id'; END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN RAISE EXCEPTION 'immutable strapi_account_document_id'; END IF;
  IF NEW.session_version < OLD.session_version THEN RAISE EXCEPTION 'session_version cannot decrease'; END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    IF NEW.lifecycle_operation_id IS NOT DISTINCT FROM OLD.lifecycle_operation_id THEN RAISE EXCEPTION 'distinct lifecycle operation required'; END IF;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
    IF NOT FOUND OR operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
       OR operation.requested_identity_status IS DISTINCT FROM NEW.identity_status
       OR operation.operation_state <> 'completed' OR NEW.lifecycle_state <> 'completed' THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    IF NOT (
      (OLD.identity_status='active' AND NEW.identity_status='suspended' AND operation.operation_kind='suspend') OR
      (OLD.identity_status='suspended' AND NEW.identity_status='active' AND operation.operation_kind='reactivate') OR
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion'
        AND operation.operation_kind='delete' AND operation.operation_phase='prepared') OR
      (OLD.identity_status='pending_deletion' AND NEW.identity_status='suspended' AND operation.operation_kind='cancel_deletion')
    ) THEN RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status; END IF;
    IF (NEW.identity_status='suspended' AND OLD.identity_status='active' OR NEW.identity_status='pending_deletion')
       AND NEW.session_version <= OLD.session_version THEN RAISE EXCEPTION 'session_version must increment for suspension or deletion'; END IF;
  ELSIF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'lifecycle operation cannot change without identity status';
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN RAISE EXCEPTION 'guest capability rotation metadata required'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_tombstone_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM users
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'live immutable external identity exists';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,operation_phase
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'tombstone','pending_deletion','completed',1,'single') ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.requested_identity_status <> 'pending_deletion' OR operation.operation_state <> 'completed'
     OR NOT (
       operation.operation_kind='tombstone' AND operation.operation_phase='single'
       OR operation.operation_kind='delete' AND operation.operation_phase IN ('prepared','finalized')
     ) THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION reject_unauthorized_music_identity_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS NULL THEN
    RAISE EXCEPTION 'direct user delete forbidden; use finalize_music_identity_deletion';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER users_reject_unauthorized_music_identity_delete
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION reject_unauthorized_music_identity_delete();

CREATE FUNCTION finalize_music_identity_deletion(
  p_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  identity users%ROWTYPE;
  operation music_identity_lifecycle_operations%ROWTYPE;
  tombstone music_identity_tombstones%ROWTYPE;
  next_session_version integer;
BEGIN
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'immutable external identity not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'immutable external identity not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks tombstone';
  END IF;

  IF identity.identity_status <> 'pending_deletion' THEN
    UPDATE users SET
      identity_status='pending_deletion', session_version=next_session_version,
      lifecycle_operation_id=p_operation_id, lifecycle_state='completed',
      lifecycle_attempt_count=lifecycle_attempt_count+1, lifecycle_last_attempt_at=now(),
      lifecycle_error_code=NULL
    WHERE id=p_user_id
    RETURNING * INTO identity;
  ELSIF identity.lifecycle_operation_id IS DISTINCT FROM p_operation_id
        OR identity.session_version IS DISTINCT FROM operation.result_session_version THEN
    RAISE EXCEPTION 'lifecycle operation mismatch';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$$;
```

### Source: tunes/migrations/0005_resource_bound_deletion_history.sql

```sql
ALTER TABLE music_identity_lifecycle_operations
  ADD COLUMN music_user_id integer,
  ADD CONSTRAINT music_identity_lifecycle_operations_music_user_id_check
    CHECK (music_user_id IS NULL OR music_user_id > 0);

ALTER TABLE music_identity_tombstones
  ADD COLUMN music_user_id integer,
  ADD CONSTRAINT music_identity_tombstones_music_user_id_check
    CHECK (music_user_id IS NULL OR music_user_id > 0);

-- Bind every operation whose identity still exists. Historical external-only
-- tombstones cannot be assigned a numeric ID safely, so they remain NULL and
-- are deliberately ineligible for numeric deletion replay.
UPDATE music_identity_lifecycle_operations operation
SET music_user_id=identity.id
FROM users identity
WHERE operation.music_user_id IS NULL
  AND operation.strapi_user_document_id=identity.strapi_user_document_id
  AND operation.strapi_account_document_id=identity.strapi_account_document_id;

CREATE UNIQUE INDEX idx_music_identity_tombstones_music_user_id
  ON music_identity_tombstones(music_user_id) WHERE music_user_id IS NOT NULL;
CREATE INDEX idx_music_identity_operations_music_user_id
  ON music_identity_lifecycle_operations(music_user_id,operation_kind)
  WHERE music_user_id IS NOT NULL;

ALTER SEQUENCE users_id_seq NO CYCLE;

CREATE OR REPLACE FUNCTION enforce_music_lifecycle_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
  END IF;
  IF NEW.operation_phase IS DISTINCT FROM OLD.operation_phase AND NOT (
    OLD.operation_kind='delete' AND OLD.operation_state='completed'
    AND OLD.operation_phase='prepared' AND NEW.operation_phase='finalized'
  ) THEN
    RAISE EXCEPTION 'invalid lifecycle operation phase transition: % -> %', OLD.operation_phase, NEW.operation_phase;
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN RAISE EXCEPTION 'lifecycle attempt_count cannot decrease'; END IF;
  IF NEW.operation_state IS DISTINCT FROM OLD.operation_state AND NOT (
    (OLD.operation_state = 'requested' AND NEW.operation_state IN ('running','failed','cancelled')) OR
    (OLD.operation_state = 'running' AND NEW.operation_state IN ('completed','failed','cancelled')) OR
    (OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
  ) THEN RAISE EXCEPTION 'invalid lifecycle operation transition: % -> %', OLD.operation_state, NEW.operation_state; END IF;
  IF (OLD.operation_state = 'requested' AND NEW.operation_state = 'running'
      OR OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
     AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
    RAISE EXCEPTION 'lifecycle attempt_count must increment for an attempt';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN RAISE EXCEPTION 'immutable strapi_user_document_id'; END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN RAISE EXCEPTION 'immutable strapi_account_document_id'; END IF;
  IF NEW.session_version < OLD.session_version THEN RAISE EXCEPTION 'session_version cannot decrease'; END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    IF NEW.lifecycle_operation_id IS NOT DISTINCT FROM OLD.lifecycle_operation_id THEN RAISE EXCEPTION 'distinct lifecycle operation required'; END IF;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
    IF NOT FOUND OR operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM NEW.id
       OR operation.requested_identity_status IS DISTINCT FROM NEW.identity_status
       OR operation.operation_state <> 'completed' OR NEW.lifecycle_state <> 'completed' THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    IF NOT (
      (OLD.identity_status='active' AND NEW.identity_status='suspended' AND operation.operation_kind='suspend') OR
      (OLD.identity_status='suspended' AND NEW.identity_status='active' AND operation.operation_kind='reactivate') OR
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion'
        AND operation.operation_kind='delete' AND operation.operation_phase='prepared') OR
      (OLD.identity_status='pending_deletion' AND NEW.identity_status='suspended' AND operation.operation_kind='cancel_deletion')
    ) THEN RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status; END IF;
    IF (NEW.identity_status='suspended' AND OLD.identity_status='active' OR NEW.identity_status='pending_deletion')
       AND NEW.session_version <= OLD.session_version THEN RAISE EXCEPTION 'session_version must increment for suspension or deletion'; END IF;
  ELSIF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'lifecycle operation cannot change without identity status';
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN RAISE EXCEPTION 'guest capability rotation metadata required'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_tombstone_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  operation music_identity_lifecycle_operations%ROWTYPE;
  authorized_user_id integer;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM users
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'live immutable external identity exists';
  END IF;
  authorized_user_id := nullif(current_setting('music.lifecycle_user_id',true),'')::integer;
  IF NEW.music_user_id IS NOT NULL AND NEW.music_user_id IS DISTINCT FROM authorized_user_id THEN
    RAISE EXCEPTION 'numeric Music user ID requires deletion authorization';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,operation_phase
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.music_user_id,
    'tombstone','pending_deletion','completed',1,'single') ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.music_user_id
     OR operation.requested_identity_status <> 'pending_deletion' OR operation.operation_state <> 'completed'
     OR NOT (
       operation.operation_kind='tombstone' AND operation.operation_phase='single'
       OR operation.operation_kind='delete' AND operation.operation_phase IN ('prepared','finalized')
     ) THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_music_tombstone_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id
     OR NEW.music_user_id IS DISTINCT FROM OLD.music_user_id THEN
    RAISE EXCEPTION 'tombstone identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_identity_tombstone_immutability
BEFORE UPDATE ON music_identity_tombstones
FOR EACH ROW EXECUTE FUNCTION enforce_music_tombstone_immutability();

CREATE OR REPLACE FUNCTION reject_unauthorized_music_identity_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS NULL
     OR nullif(current_setting('music.lifecycle_user_id',true),'')::integer IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'direct user delete forbidden; use finalize_music_identity_deletion';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION retain_music_identity_tombstone_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,OLD.id,
    coalesce(requested_reason,'database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_music_identity_deletion(
  p_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  identity users%ROWTYPE;
  operation music_identity_lifecycle_operations%ROWTYPE;
  tombstone music_identity_tombstones%ROWTYPE;
  next_session_version integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,identity.id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM identity.id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND AND tombstone.music_user_id=p_user_id THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks resource-bound tombstone';
  END IF;

  IF identity.identity_status <> 'pending_deletion' THEN
    UPDATE users SET
      identity_status='pending_deletion', session_version=next_session_version,
      lifecycle_operation_id=p_operation_id, lifecycle_state='completed',
      lifecycle_attempt_count=lifecycle_attempt_count+1, lifecycle_last_attempt_at=now(),
      lifecycle_error_code=NULL
    WHERE id=p_user_id
    RETURNING * INTO identity;
  ELSIF identity.lifecycle_operation_id IS DISTINCT FROM p_operation_id
        OR identity.session_version IS DISTINCT FROM operation.result_session_version THEN
    RAISE EXCEPTION 'lifecycle operation mismatch';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$$;
```

### Source: tunes/migrations/0006_numeric_identity_lock.sql

```sql
-- Numeric Music user IDs are durable identity resources. Serialize every
-- INSERT and authorized delete on the numeric key after the external user and
-- Account keys, but before PostgreSQL can take a users row/unique-index lock.
CREATE FUNCTION lock_music_numeric_user_id(p_user_id integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION 'numeric Music user ID is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('music:numeric-user:' || p_user_id::text,0));
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  PERFORM lock_music_numeric_user_id(NEW.id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_music_identity_deletion(
  p_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  identity users%ROWTYPE;
  operation music_identity_lifecycle_operations%ROWTYPE;
  tombstone music_identity_tombstones%ROWTYPE;
  next_session_version integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  PERFORM lock_music_numeric_user_id(p_user_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,identity.id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM identity.id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND AND tombstone.music_user_id=p_user_id THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks resource-bound tombstone';
  END IF;

  IF identity.identity_status <> 'pending_deletion' THEN
    UPDATE users SET
      identity_status='pending_deletion', session_version=next_session_version,
      lifecycle_operation_id=p_operation_id, lifecycle_state='completed',
      lifecycle_attempt_count=lifecycle_attempt_count+1, lifecycle_last_attempt_at=now(),
      lifecycle_error_code=NULL
    WHERE id=p_user_id
    RETURNING * INTO identity;
  ELSIF identity.lifecycle_operation_id IS DISTINCT FROM p_operation_id
        OR identity.session_version IS DISTINCT FROM operation.result_session_version THEN
    RAISE EXCEPTION 'lifecycle operation mismatch';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$$;
```

### Source: tunes/migrations/0007_identity_provider_snapshot.sql

```sql
-- C4 persists the authoritative provider as a mutable display/eligibility
-- snapshot. It is never an ownership key and may converge on later ensures.
ALTER TABLE users
  ADD COLUMN strapi_provider_snapshot text NOT NULL DEFAULT 'legacy-unknown',
  ADD CONSTRAINT users_strapi_provider_snapshot_check
    CHECK (strapi_provider_snapshot IN ('legacy-unknown','local','google'));

COMMENT ON COLUMN users.strapi_provider_snapshot IS
  'Mutable authoritative Strapi provider snapshot; never an identity lookup key';
```

### Source: tunes/migrations/0008_credential_revocation_operations.sql

```sql
-- C5 durable idempotency authority for local Music credential revocation.
-- No foreign key targets users: the immutable operation record must survive
-- later identity deletion and remain bound to the retired numeric resource.
CREATE TABLE music_credential_revocation_operations (
  operation_id text PRIMARY KEY,
  music_user_id integer NOT NULL,
  strapi_user_document_id text NOT NULL,
  strapi_account_document_id text NOT NULL,
  reason text NOT NULL,
  expected_session_version integer NOT NULL,
  result_session_version integer NOT NULL,
  operation_state text NOT NULL DEFAULT 'completed',
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT music_credential_revocation_operation_id_check CHECK (
    operation_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  ),
  CONSTRAINT music_credential_revocation_user_check CHECK (music_user_id > 0),
  CONSTRAINT music_credential_revocation_subject_check CHECK (length(strapi_user_document_id) > 0),
  CONSTRAINT music_credential_revocation_account_check CHECK (length(strapi_account_document_id) > 0),
  CONSTRAINT music_credential_revocation_reason_check CHECK (
    reason IN ('logout_all','entitlement_security_revocation','credential_compromise')
  ),
  CONSTRAINT music_credential_revocation_expected_version_check CHECK (expected_session_version > 0),
  CONSTRAINT music_credential_revocation_result_version_check CHECK (
    result_session_version = expected_session_version + 1
  ),
  CONSTRAINT music_credential_revocation_state_check CHECK (operation_state = 'completed'),
  CONSTRAINT music_credential_revocation_version_unique UNIQUE (music_user_id, expected_session_version)
);

CREATE INDEX idx_music_credential_revocation_subject
  ON music_credential_revocation_operations(strapi_user_document_id, strapi_account_document_id);

COMMENT ON TABLE music_credential_revocation_operations IS
  'Durable exact-operation authority for atomic Music session-version revocation';
```

### Source: tunes/migrations/0009_credential_revocation_history_immutability.sql

```sql
-- Credential revocation operations are durable idempotency authority. Once
-- written, neither application code nor the runtime database role may rewrite
-- or remove any part of the operation/resource/version tuple.
CREATE FUNCTION reject_music_credential_revocation_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'credential revocation history is immutable';
END;
$$;

CREATE TRIGGER music_credential_revocation_history_immutability
BEFORE UPDATE OR DELETE ON music_credential_revocation_operations
FOR EACH ROW EXECUTE FUNCTION reject_music_credential_revocation_history_mutation();
```

### Source: tunes/migrations/0010_least_privilege_runtime_role.sql

```sql
-- The application login inherits only this NOLOGIN capability role. Password
-- provisioning remains a bounded gate operation and is never stored in SQL.
DO $$
DECLARE runtime_role record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO runtime_role FROM pg_roles WHERE rolname='music_runtime';
  IF NOT FOUND THEN
    CREATE ROLE music_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF runtime_role.rolcanlogin OR runtime_role.rolsuper OR runtime_role.rolcreaterole
      OR runtime_role.rolcreatedb OR runtime_role.rolreplication OR runtime_role.rolbypassrls THEN
    RAISE EXCEPTION 'music_runtime capability role has unsafe attributes';
  END IF;
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM music_runtime;
GRANT USAGE ON SCHEMA public TO music_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO music_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO music_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO music_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_schema_migrations FROM music_runtime;
GRANT SELECT ON music_schema_migrations TO music_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_credential_revocation_operations FROM music_runtime;
GRANT SELECT, INSERT ON music_credential_revocation_operations TO music_runtime;

ALTER TABLE music_credential_revocation_operations
  ENABLE ALWAYS TRIGGER music_credential_revocation_history_immutability;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO music_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO music_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO music_runtime;

CREATE FUNCTION provision_music_runtime_login(p_login_role name, p_password text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE login_attributes record;
BEGIN
  IF p_login_role::text !~ '^[a-z_][a-z0-9_]{1,62}$'
      OR p_login_role::text IN ('postgres','music_runtime',current_user) THEN
    RAISE EXCEPTION 'runtime login role is invalid';
  END IF;
  IF length(p_password) < 43 OR length(p_password) > 256 OR p_password !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'runtime login credential is invalid';
  END IF;

  SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO login_attributes FROM pg_roles WHERE rolname=p_login_role;
  IF NOT FOUND THEN
    EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
      p_login_role, p_password);
  ELSE
    IF NOT login_attributes.rolcanlogin OR login_attributes.rolsuper OR login_attributes.rolcreaterole
        OR login_attributes.rolcreatedb OR login_attributes.rolreplication OR login_attributes.rolbypassrls THEN
      RAISE EXCEPTION 'existing runtime login role has unsafe attributes';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_auth_members memberships
      JOIN pg_roles granted_role ON granted_role.oid=memberships.roleid
      JOIN pg_roles login_role ON login_role.oid=memberships.member
      WHERE login_role.rolname=p_login_role AND granted_role.rolname<>'music_runtime'
    ) THEN
      RAISE EXCEPTION 'existing runtime login role has unsafe membership';
    END IF;
    EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
      p_login_role, p_password);
  END IF;
  EXECUTE format('GRANT music_runtime TO %I', p_login_role);
END;
$$;

REVOKE ALL ON FUNCTION provision_music_runtime_login(name,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION provision_music_runtime_login(name,text) FROM music_runtime;
```

### Source: tunes/migrations/0011_durable_publication_idempotency.sql

```sql
CREATE TABLE music_publication_operations (
  music_user_id integer NOT NULL CHECK (music_user_id > 0),
  idempotency_key_hash character(64) NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint character(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_mode character varying(16) NOT NULL CHECK (request_mode IN ('private','unlisted','public')),
  operation_state character varying(24) NOT NULL CHECK (operation_state IN ('completed','replay_expired')),
  created_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  shredded_at timestamp with time zone,
  response_key_id character varying(64),
  response_nonce bytea,
  response_ciphertext bytea,
  response_tag bytea,
  PRIMARY KEY (music_user_id, idempotency_key_hash),
  CHECK (completed_at >= created_at),
  CHECK (expires_at = completed_at + interval '24 hours'),
  CHECK (updated_at >= completed_at),
  CHECK (
    (operation_state='completed'
      AND shredded_at IS NULL
      AND response_key_id IS NOT NULL
      AND response_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      AND octet_length(response_nonce)=12
      AND octet_length(response_ciphertext) BETWEEN 1 AND 4096
      AND octet_length(response_tag)=16)
    OR
    (operation_state='replay_expired'
      AND shredded_at IS NOT NULL
      AND response_key_id IS NULL
      AND response_nonce IS NULL
      AND response_ciphertext IS NULL
      AND response_tag IS NULL)
  )
);

CREATE INDEX music_publication_operations_expiry_idx
  ON music_publication_operations(expires_at, music_user_id, idempotency_key_hash)
  WHERE response_ciphertext IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;

CREATE TRIGGER music_publication_operation_immutability
  BEFORE UPDATE OR DELETE ON music_publication_operations
  FOR EACH ROW EXECUTE FUNCTION enforce_music_publication_operation_immutability();

ALTER TABLE music_publication_operations
  ENABLE ALWAYS TRIGGER music_publication_operation_immutability;

REVOKE ALL ON music_publication_operations FROM PUBLIC;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_publication_operations FROM music_runtime;
GRANT SELECT, INSERT, UPDATE
  ON music_publication_operations TO music_runtime;
```

### Source: tunes/migrations/0012_publication_replay_expiry_guard.sql

```sql
CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND clock_timestamp() >= OLD.expires_at
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.shredded_at >= OLD.expires_at
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed' AND clock_timestamp() < OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation cannot be shredded before response expiry';
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;
```

### Source: tunes/migrations/0013_publication_operation_database_clock.sql

```sql
CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.operation_state<>'completed' THEN
      RAISE EXCEPTION 'publication operation must begin completed';
    END IF;
    NEW.created_at := transaction_timestamp();
    NEW.completed_at := NEW.created_at;
    NEW.expires_at := NEW.completed_at + interval '24 hours';
    NEW.updated_at := NEW.completed_at;
    RETURN NEW;
  END IF;

  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND clock_timestamp() >= OLD.expires_at
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.shredded_at >= OLD.expires_at
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed' AND clock_timestamp() < OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation cannot be shredded before response expiry';
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;

DROP TRIGGER music_publication_operation_immutability ON music_publication_operations;
CREATE TRIGGER music_publication_operation_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON music_publication_operations
  FOR EACH ROW EXECUTE FUNCTION enforce_music_publication_operation_immutability();

ALTER TABLE music_publication_operations
  ENABLE ALWAYS TRIGGER music_publication_operation_immutability;
```

### Source: tunes/migrations/0014_durable_reactivation_authority.sql

```sql
CREATE TABLE music_reactivation_tokens (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  strapi_user_id BIGINT NOT NULL CHECK (strapi_user_id > 0),
  strapi_user_document_id TEXT NOT NULL CHECK (length(strapi_user_document_id) BETWEEN 1 AND 512),
  strapi_account_document_id TEXT NOT NULL CHECK (length(strapi_account_document_id) BETWEEN 1 AND 512),
  operation_id UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  lease_owner UUID,
  lease_expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT music_reactivation_token_lease_pair CHECK (
    (lease_owner IS NULL) = (lease_expires_at IS NULL)
  ),
  CONSTRAINT music_reactivation_token_expiry_after_issue CHECK (expires_at > created_at)
);

CREATE INDEX music_reactivation_tokens_expiry_idx
  ON music_reactivation_tokens (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION enforce_music_reactivation_token_identity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
      OR NEW.strapi_user_id IS DISTINCT FROM OLD.strapi_user_id
      OR NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
      OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
      OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'reactivation token authority is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_reactivation_token_identity_immutability
  BEFORE UPDATE ON music_reactivation_tokens
  FOR EACH ROW EXECUTE FUNCTION enforce_music_reactivation_token_identity();

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_identity_tombstones, music_reactivation_tokens FROM music_runtime;
GRANT SELECT, INSERT, UPDATE ON music_reactivation_tokens TO music_runtime;
```

### Source: tunes/migrations/0015_publication_operation_archive.sql

```sql
CREATE TABLE music_publication_operation_archive (
  music_user_id integer NOT NULL CHECK (music_user_id > 0),
  idempotency_key_hash character(64) NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint character(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_mode character varying(16) NOT NULL CHECK (request_mode IN ('private','unlisted','public')),
  completed_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (music_user_id, idempotency_key_hash),
  CHECK (expires_at = completed_at + interval '24 hours'),
  CHECK (archived_at >= expires_at)
);

CREATE OR REPLACE FUNCTION reject_music_publication_archive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'publication operation archive is immutable';
END;
$$;

CREATE TRIGGER music_publication_operation_archive_immutability
  BEFORE UPDATE OR DELETE ON music_publication_operation_archive
  FOR EACH ROW EXECUTE FUNCTION reject_music_publication_archive_mutation();

ALTER TABLE music_publication_operation_archive
  ENABLE ALWAYS TRIGGER music_publication_operation_archive_immutability;

CREATE OR REPLACE FUNCTION music_lookup_publication_operation_archive(
  p_music_user_id integer,
  p_idempotency_key_hash text
)
RETURNS TABLE(request_fingerprint text, request_mode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT archive.request_fingerprint::text, archive.request_mode::text
    FROM public.music_publication_operation_archive archive
   WHERE p_music_user_id > 0
     AND p_idempotency_key_hash ~ '^[a-f0-9]{64}$'
     AND archive.music_user_id=p_music_user_id
     AND archive.idempotency_key_hash=p_idempotency_key_hash
$$;

CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.operation_state='replay_expired'
        AND OLD.expires_at<=clock_timestamp()
        AND EXISTS (
          SELECT 1
            FROM public.music_publication_operation_archive archive
           WHERE archive.music_user_id=OLD.music_user_id
             AND archive.idempotency_key_hash=OLD.idempotency_key_hash
             AND archive.request_fingerprint=OLD.request_fingerprint
             AND archive.request_mode=OLD.request_mode
             AND archive.completed_at=OLD.completed_at
             AND archive.expires_at=OLD.expires_at
        ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'publication operation history is immutable except archived replay-expired deletion';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.operation_state<>'completed' THEN
      RAISE EXCEPTION 'publication operation must begin completed';
    END IF;
    NEW.created_at := transaction_timestamp();
    NEW.completed_at := NEW.created_at;
    NEW.expires_at := NEW.completed_at + interval '24 hours';
    NEW.updated_at := NEW.completed_at;
    RETURN NEW;
  END IF;

  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND clock_timestamp() >= OLD.expires_at
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.shredded_at >= OLD.expires_at
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed' AND clock_timestamp() < OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation cannot be shredded before response expiry';
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;

CREATE OR REPLACE FUNCTION music_compact_publication_operations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate record;
  compacted_count integer := 0;
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'publication operation compaction limit is invalid';
  END IF;

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.music_publication_operation_archive(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,
      completed_at,expires_at,archived_at
    ) VALUES (
      candidate.music_user_id,candidate.idempotency_key_hash,
      candidate.request_fingerprint,candidate.request_mode,
      candidate.completed_at,candidate.expires_at,clock_timestamp()
    ) ON CONFLICT (music_user_id,idempotency_key_hash) DO NOTHING;

    DELETE FROM public.music_publication_operations operation
     WHERE operation.music_user_id=candidate.music_user_id
       AND operation.idempotency_key_hash=candidate.idempotency_key_hash
       AND EXISTS (
         SELECT 1
           FROM public.music_publication_operation_archive archive
          WHERE archive.music_user_id=operation.music_user_id
            AND archive.idempotency_key_hash=operation.idempotency_key_hash
            AND archive.request_fingerprint=operation.request_fingerprint
            AND archive.request_mode=operation.request_mode
            AND archive.completed_at=operation.completed_at
            AND archive.expires_at=operation.expires_at
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    compacted_count := compacted_count + deleted_count;
  END LOOP;

  RETURN compacted_count;
END;
$$;

REVOKE ALL ON music_publication_operation_archive FROM PUBLIC;
REVOKE ALL ON music_publication_operation_archive FROM music_runtime;
REVOKE ALL ON FUNCTION reject_music_publication_archive_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION music_lookup_publication_operation_archive(integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION music_compact_publication_operations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reject_music_publication_archive_mutation() TO music_runtime;
GRANT EXECUTE ON FUNCTION music_lookup_publication_operation_archive(integer,text) TO music_runtime;
GRANT EXECUTE ON FUNCTION music_compact_publication_operations(integer) TO music_runtime;
```

### Source: tunes/migrations/0016_publication_operation_retention.sql

```sql
CREATE OR REPLACE FUNCTION reject_music_publication_archive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.archived_at<=clock_timestamp()-interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'publication operation archive is immutable within retention';
END;
$$;

CREATE INDEX music_publication_operation_archive_retention_idx
  ON music_publication_operation_archive(archived_at,music_user_id,idempotency_key_hash);

CREATE INDEX music_publication_operations_compaction_idx
  ON music_publication_operations(expires_at,music_user_id,idempotency_key_hash)
  WHERE operation_state='replay_expired';

CREATE OR REPLACE FUNCTION music_compact_publication_operations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate record;
  compacted_count integer := 0;
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'publication operation compaction limit is invalid';
  END IF;

  WITH expired_archive AS (
    SELECT archive.music_user_id,archive.idempotency_key_hash
      FROM public.music_publication_operation_archive archive
     WHERE archive.archived_at<=clock_timestamp()-interval '30 days'
     ORDER BY archive.archived_at,archive.music_user_id,archive.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.music_publication_operation_archive archive
   USING expired_archive
   WHERE archive.music_user_id=expired_archive.music_user_id
     AND archive.idempotency_key_hash=expired_archive.idempotency_key_hash;
  GET DIAGNOSTICS compacted_count = ROW_COUNT;

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.music_publication_operation_archive(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,
      completed_at,expires_at,archived_at
    ) VALUES (
      candidate.music_user_id,candidate.idempotency_key_hash,
      candidate.request_fingerprint,candidate.request_mode,
      candidate.completed_at,candidate.expires_at,clock_timestamp()
    ) ON CONFLICT (music_user_id,idempotency_key_hash) DO NOTHING;

    DELETE FROM public.music_publication_operations operation
     WHERE operation.music_user_id=candidate.music_user_id
       AND operation.idempotency_key_hash=candidate.idempotency_key_hash
       AND EXISTS (
         SELECT 1
           FROM public.music_publication_operation_archive archive
          WHERE archive.music_user_id=operation.music_user_id
            AND archive.idempotency_key_hash=operation.idempotency_key_hash
            AND archive.request_fingerprint=operation.request_fingerprint
            AND archive.request_mode=operation.request_mode
            AND archive.completed_at=operation.completed_at
            AND archive.expires_at=operation.expires_at
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    compacted_count := compacted_count + deleted_count;
  END LOOP;

  RETURN compacted_count;
END;
$$;
```

### Source: tunes/migrations/0017_publication_idempotency_key_retirement.sql

```sql
CREATE OR REPLACE FUNCTION music_compact_publication_operations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate record;
  compacted_count integer := 0;
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'publication operation compaction limit is invalid';
  END IF;

  WITH expired_archive AS (
    SELECT archive.music_user_id,archive.idempotency_key_hash
      FROM public.music_publication_operation_archive archive
     WHERE archive.archived_at<=clock_timestamp()-interval '30 days'
     ORDER BY archive.archived_at,archive.music_user_id,archive.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.music_publication_operation_archive archive
   USING expired_archive
   WHERE archive.music_user_id=expired_archive.music_user_id
     AND archive.idempotency_key_hash=expired_archive.idempotency_key_hash;
  GET DIAGNOSTICS compacted_count = ROW_COUNT;

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT GREATEST(p_limit-compacted_count,0)
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.music_publication_operation_archive(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,
      completed_at,expires_at,archived_at
    ) VALUES (
      candidate.music_user_id,candidate.idempotency_key_hash,
      candidate.request_fingerprint,candidate.request_mode,
      candidate.completed_at,candidate.expires_at,clock_timestamp()
    ) ON CONFLICT (music_user_id,idempotency_key_hash) DO NOTHING;

    DELETE FROM public.music_publication_operations operation
     WHERE operation.music_user_id=candidate.music_user_id
       AND operation.idempotency_key_hash=candidate.idempotency_key_hash
       AND EXISTS (
         SELECT 1
           FROM public.music_publication_operation_archive archive
          WHERE archive.music_user_id=operation.music_user_id
            AND archive.idempotency_key_hash=operation.idempotency_key_hash
            AND archive.request_fingerprint=operation.request_fingerprint
            AND archive.request_mode=operation.request_mode
            AND archive.completed_at=operation.completed_at
            AND archive.expires_at=operation.expires_at
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    compacted_count := compacted_count + deleted_count;
  END LOOP;

  RETURN compacted_count;
END;
$$;
```

### Source: tunes/migrations/0018_transactional_queue_replacement.sql

```sql
ALTER TABLE users
  ADD COLUMN music_queue_revision BIGINT NOT NULL DEFAULT 0;

CREATE TABLE music_owner_operations (
  music_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (music_user_id, operation, idempotency_key_hash),
  CHECK (expires_at > created_at)
);

CREATE INDEX music_owner_operations_expiry_idx
  ON music_owner_operations(expires_at, music_user_id, operation);

REVOKE ALL ON music_owner_operations FROM PUBLIC;
REVOKE ALL ON music_owner_operations FROM music_runtime;
GRANT SELECT, INSERT, DELETE ON music_owner_operations TO music_runtime;
GRANT SELECT, UPDATE(music_queue_revision) ON users TO music_runtime;
```

### Source: tunes/migrations/0019_queue_visibility_control.sql

```sql
ALTER TABLE users
  ADD COLUMN allow_queue_visibility BOOLEAN NOT NULL DEFAULT false;

GRANT UPDATE(allow_queue_visibility) ON users TO music_runtime;
```

### Source: tunes/migrations/0020_public_snapshot_revision.sql

```sql
ALTER TABLE users
  ADD COLUMN public_snapshot_revision BIGINT NOT NULL DEFAULT 0;

GRANT UPDATE(public_snapshot_revision) ON users TO music_runtime;
```

### Source: tunes/migrations/0021_explorers_analytics_receipts.sql

```sql
CREATE TABLE explorers_analytics_receipts (
  event_id text PRIMARY KEY,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  strapi_document_id text,
  last_error text,
  lease_id text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT explorers_analytics_receipts_status_check
    CHECK (status IN ('pending', 'committed', 'failed'))
);
```
