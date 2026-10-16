# Target schema: core, identity, media and analytics

**Proposed authoritative application schema for consolidation — no migration executed.** This is the core portion of the unified PostgreSQL schema, derived from `implementation-backend.md`, the verified Strapi schema inventory and current frontend/server types. Category-specific facts, guide sections, taxonomy, claims and retained Music tables are supplied by the companion schema portions; they must reference the keys defined here rather than create competing account/entity tables.

## Conventions and engineering decisions

- PostgreSQL 15; UUID primary keys use `gen_random_uuid()`. IDs on the wire are strings. `timestamptz` values are stored as instants and serialized as ISO timestamps. `bigint` revision/counters are checked within JavaScript's safe integer range before number serialization.
- Every column is listed below. `N` means NOT NULL, `Y` nullable. `—` means no database default. All FKs default to `ON UPDATE RESTRICT`. Delete actions are explicit. Text codes use `text` plus CHECK, avoiding difficult enum replacement during category rollout.
- `stamp` means exactly `created_at timestamptz N DEFAULT now()`, `updated_at timestamptz N DEFAULT now()`; tables which include it list it explicitly. A database trigger updates `updated_at`; application-only timestamps are not the concurrency boundary. `revision bigint N DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991)` is incremented atomically under optimistic predicates.
- `CategoryKey` is exactly `places,guides,music,movies,books,games,apps,products,people`. Catalog recommendation categories exclude guides/music; guides are structured collections, Music retains its specialized tables. No followers/community/admin/commerce schema is introduced.
- Soft archive is the normal content delete operation. Terminal account deletion strips profile/content and revokes access through an explicit orchestrated job; restrictive FKs stop accidental cascading deletion of shared catalog facts. Hard cleanup is performed in a documented child-first transaction/job sequence.
- Auth user IDs are text, because Better Auth owns their generation; creator account and content IDs are UUID. Do not force library IDs to UUID without qualifying the pinned adapter. One initial account per auth user is a provisioning policy enforced by `initial_account_bindings`; membership/content does not encode a permanent one-account limitation.
- Source-fact category tables attach to `entities.id` with one row per entity. Rich text and presentation settings use versioned, strictly validated JSONB where existing data is inherently structured; raw arbitrary Strapi payloads are not accepted. JSON checks below enforce container/type/version at DB level; typed runtime validators enforce individual keys and limits.
- S3: one existing bucket, `qa/` and `prod/` prefixes, existing shared AWS principal. Server configuration fixes prefix. These are application boundaries, not independent IAM credentials. No bucket credentials in DB rows or public DTOs. Media URL is derived from media ID, not stored raw S3 URL.

## 1. Better Auth-owned schema — pinned and locally qualified

The exact generated definitions for Better Auth **1.7.6**, Drizzle adapter **1.7.6**, Drizzle ORM **0.45.2** and Drizzle Kit **0.31.10** are attached: [core columns/relations](auth-qualification/generated-core-schema.ts), [core SQL](auth-qualification/generated-core.sql), [later MCP/JWT/CIMD SQL](auth-qualification/generated-mcp.sql). These files specify every generated column, SQL nullability/default, PK/FK/index and deletion action. They are documentation evidence, not repository migrations.

The core four tables have 34 columns and use configured auth_user/auth_session/auth_account/auth_verification names. Auth IDs are text. Generated time columns are timestamp without time zone; use UTC consistently, unlike application timestamptz columns. Drizzle on-update behavior is not a database trigger/default. Generated user deletion cascades provider accounts/sessions; application tombstone policy prevents an ordinary account deletion from blindly deleting auth_user.

The generator does not create provider-subject uniqueness: add the reviewed [provider identity index](auth-qualification/provider-identity-index.sql). Its duplicate rejection was tested. Preserve the generated nullable password column but disable password authentication; its presence is not enrollment support.

[Qualification report](auth-schema-qualification.md) records successful TypeScript compile, disposable PostgreSQL application, eight core adapter/constraint assertions and five MCP startup/discovery assertions. This closes the unknown generated-schema gate for the pinned configuration. Ticket2.1 must integrate the same schema into append-only project migrations and run application tests; upgrading packages or plugin options requires regeneration and review. Live Google and later token-generation/revocation acceptance remain separately identified checks.

## 2. `user_security_state`

Application revocation generation independent of library session implementation; must be checked with actual current session validity.

| Column | Type | Null | Default / rule |
|---|---|---|---|
| user_id | text | N | PK; FK auth_user.id DELETE RESTRICT |
| session_version | bigint | N | 1; CHECK 1..9007199254740991 |
| blocked_at | timestamptz | Y | — |
| created_at, updated_at | stamp | N | now() each |

No extra indexes beyond PK. Logout-all/compromise/deactivation increments version in the revocation transaction; ordinary logout must still invalidate the specific library session. Retain minimal identity binding after terminal account deletion to prevent accidental resurrection; removal follows reviewed identity-erasure policy and must not transfer ownership to a new identity with the same email.

## 3. `creator_accounts`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| handle | text | Y | —; incomplete onboarding may have none |
| handle_key | text generated always as lower(handle) stored | Y | derived |
| display_name | text | Y | —; trim length 1..200 when present |
| account_type | text | Y | —; Personal/Creator/Business |
| onboarding_status | text | N | 'incomplete'; incomplete/complete |
| status | text | N | 'active'; active/suspended/pending_deletion/deleted |
| public_profile | boolean | N | true |
| auto_pinning | boolean | N | true |
| locale | text | N | 'en'; supported locale validator |
| mobile_number | text | Y | —; normalized validated phone, not unique identity |
| mobile_number_visible | boolean | N | false |
| bio_plain | text | Y | —; maps Bio_1 |
| bio_rich | jsonb | Y | —; versioned rich-text document, maps Bio |
| primary_address | jsonb | Y | —; validated AddressSnapshot; no fabricated onboarding address |
| additional_addresses | jsonb | N | '[]'; array of AddressSnapshot, maps Addresss |
| public_address | jsonb | Y | —; separately selected public projection |
| profile_place_details | jsonb | Y | —; versioned selected place details |
| revision | bigint | N | 1; safe-positive revision |
| suspended_at | timestamptz | Y | — |
| deletion_requested_at | timestamptz | Y | — |
| deleted_at | timestamptz | Y | — |
| created_at, updated_at | stamp | N | now() each |

Unique non-null `handle_key`; preserve verified `src/utils/usernameValidation.ts` / Profile validator behavior: length 3..30, starts with a lowercase letter, remaining lowercase letters/digits/hyphens, no trailing or consecutive hyphens. CHECK `handle ~ '^[a-z][a-z0-9-]{2,29}$' AND handle !~ '--' AND right(handle,1)<>'-'` when non-null. Reserved routes are validated against the application route registry transactionally with handle allocation, not only in the input widget. Complete onboarding requires handle/display_name/account_type; extra actual screen requirements remain domain validation. CHECK deleted status iff deleted_at non-null; pending_deletion requires deletion_requested_at; suspended requires suspended_at. Status transitions clear obsolete timestamps consistently.

Indexes: `(status,id)` for lifecycle work; `(handle_key)` unique; `(created_at,id)`. Do not index phone/email for identity matching. Deletion leaves a stripped account tombstone until operations/media cleanup are complete; no contact/bio/address retained in tombstone. Releasing handles is permitted only on terminal deletion; handle changes invalidate old public caches but historical redirect migration is not required for the fresh launch.

## 4. `account_memberships` and `initial_account_bindings`

| Table.column | Type | Null | Default / rule |
|---|---|---|---|
| account_memberships.account_id | uuid | N | composite PK; FK creator_accounts.id DELETE CASCADE |
| account_memberships.user_id | text | N | composite PK; FK auth_user.id DELETE RESTRICT |
| account_memberships.role | text | N | 'owner'; CHECK role='owner' for current release |
| account_memberships.created_at | timestamptz | N | now() |
| initial_account_bindings.user_id | text | N | PK; FK auth_user.id DELETE RESTRICT |
| initial_account_bindings.account_id | uuid | N | UNIQUE; FK creator_accounts.id DELETE RESTRICT |
| initial_account_bindings.created_at | timestamptz | N | now() |

Membership PK `(account_id,user_id)` plus index `(user_id,account_id)`. Initial binding uses composite FK `(account_id,user_id)` to membership with DELETE RESTRICT, deferrable initially deferred, so provisioning inserts all rows in one transaction. Exactly one owner exists initially; avoid adding team roles/screens now. Terminal deletion may retain the binding/membership to a stripped tombstone so subsequent Google login cannot auto-provision resurrected content. Future team switching requires relaxing policy, not moving recommendations.

## 5. Account presentation tables

### `account_category_settings`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| account_id | uuid | N | PK part; FK creator_accounts.id DELETE CASCADE |
| category | text | N | PK part; CategoryKey CHECK |
| is_public | boolean | N | false |
| display_order | integer | N | —; CHECK >=0 |
| pinned_order | integer | Y | —; CHECK >=0 when present |

PK `(account_id,category)`; unique `(account_id,display_order)` DEFERRABLE INITIALLY DEFERRED; unique `(account_id,pinned_order)` likewise (nulls allowed). Initial seed inserts all nine rows deterministically; category changes increment account revision. Maps legacy public category flags and pinned_nav_tabs. Ordered reorder is exact-set transaction.

### `account_presentation`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| account_id | uuid | N | PK/FK creator_accounts.id DELETE CASCADE |
| schema_version | smallint | N | 1; CHECK =1 |
| theme_settings | jsonb | N | '{}' object; normalized defaults from existing theme normalizer |
| social_links | jsonb | N | '[]' array of validated platform/url/visible records |
| business_details | jsonb | N | '{}' object; existing profile/business keys only |

No extra indexes. Theme payload keys are explicitly the current `ThemeSettingsWire` set: preset, wallpaperMode, wallpaperUrl, accentColor, customTextColor, landingTab, visibleTabs, footerBranding, recommendations(layout/categoryOrder). Uploaded wallpaper URL is derived from a `profile_media` relation; do not let arbitrary JSON URLs grant media ownership. Source `social_media.theme_settings` maps here; other actual social/business fields use typed adapters, unknown/unapproved keys fail validation instead of becoming public. Root account revision controls all changes.

### `profile_feed_items`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| media_id | uuid | Y | —; composite FK account/media described below |
| external_url | text | Y | —; approved provider URL only |
| source | text | N | —; manual/google/instagram |
| media_type | text | N | —; image/video |
| caption | text | Y | — |
| display_order | integer | N | —; CHECK >=0 |
| details | jsonb | N | '{}' object; schema-validated existing Feed_Data metadata |
| created_at, updated_at | stamp | N | now() each |

CHECK exactly one of media_id/external_url; source manual requires media_id. Unique `(account_id,display_order)` deferrable; index `(account_id,id)`. An external URL is not evidence we may copy bytes; preserve baseline provider rules. Account terminal purge deletes feed rows before media. Existing imported feed presentation works without reviving retired Instagram fetch services.

## 6. `entities` and `entity_identifiers`

### `entities`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| kind | text | N | —; place/movie/book/game/app/product/person |
| title | text | N | —; trim length 1..500 |
| origin | text | N | —; provider/manual |
| facts_version | smallint | N | 1; CHECK >0 |
| search_document | tsvector | N | ''::tsvector; maintained from approved public fact fields |
| created_at, updated_at | stamp | N | now() each |

Unique `(id,kind)` supports typed FK; GIN search_document; index `(kind,id)`. Category details are companion one-to-one typed tables; no unlimited unvalidated facts JSON. Shared entity is not account-owned. An entity is not discoverable simply because it exists; public discovery requires a public recommendation path. DELETE RESTRICT while referenced by recommendations/identifiers/details. No fuzzy merge; provider facts are re-fetched/validated by server.

### `entity_identifiers`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| entity_id | uuid | N | FK entities.id DELETE CASCADE |
| provider | text | N | —; approved provider registry |
| external_kind | text | N | —; provider-specific kind incl movie vs tv |
| external_id | text | N | —; trim length 1..512 |
| fetched_at | timestamptz | N | now() |
| source_url | text | Y | —; approved provenance URL |

PK `(provider,external_kind,external_id)`; unique `(entity_id,provider,external_kind)`; index entity_id. One Google volume is an edition identifier, not a title-level canonical book merge. Manual entities have no identifier rows by default. New identifiers cannot silently reassign an existing provider key to another entity.

## 7. `collections`, `recommendations`, `collection_items`

### `collections`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| category | text | N | —; CategoryKey except music |
| title | text | N | —; trim length 1..200 |
| description | text | Y | —; plain list description |
| description_rich | jsonb | Y | —; validated guide rich-text document; guides use this, not lossy plain conversion |
| slug | text | N | —; normalized route-safe value |
| visibility | text | N | 'private'; private/public |
| publication_state | text | N | 'draft'; draft/published |
| display_order | integer | N | —; >=0 |
| pin_order | integer | Y | —; >=0 |
| heading | text | Y | —; top reads/picks/people heading |
| revision | bigint | N | 1; safe-positive revision |
| archived_at | timestamptz | Y | — |
| created_at, updated_at | stamp | N | now() each |

Unique `(id,category)`, `(id,account_id)` and `(id,account_id,category)` for child FKs. Unique `(account_id,category,slug)` including archived rows so stale URLs do not resolve to unrelated replacements; domain may explicitly rename/release only through a controlled operation. Partial indexes `(account_id,category,display_order,id)` and `(account_id,category,pin_order,id)` WHERE archived_at IS NULL. CreateCollectionInput parentLocationCollectionId populates the companion `location_linked_collections` relation atomically; do not also store a parent column here. Guide-specific header data is a companion extension. Existing UI create operation passes observed visibility/publication explicitly; conservative SQL defaults do not change current UI defaults.

### `recommendations`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| entity_id | uuid | N | FK entities.id DELETE RESTRICT |
| category | text | N | —; catalog categories only |
| note | jsonb | Y | —; versioned validated rich-text document |
| user_rating | smallint | Y | —; CHECK BETWEEN 1 AND 10 |
| publication_state | text | N | 'draft'; draft/published |
| revision | bigint | N | 1; safe-positive revision |
| archived_at | timestamptz | Y | — |
| created_at, updated_at | stamp | N | now() each |

Unique `(id,category)`, `(id,account_id)` and `(id,account_id,category)`; indexes `(account_id,category,created_at,id)` WHERE not archived, `(entity_id,account_id)` WHERE not archived. A deferred constraint trigger enforces the category→entity-kind map: places→place or person; movies→movie; books→book; games→game; apps→app; products→product; people→person. Category discriminator is presentation context, not always entity kind. **No unique account/entity pair:** same account may recommend the same entity in different contexts; overlap search counts distinct accounts. RecommendationDto display/order/pin comes from selected collection membership below, not a second conflicting recommendation order. Publication also requires eligible public parent/account/category. Category-owned title/cover/offer overrides use the companion one-to-one `recommendation_display_overrides`, not a second JSON field here, and never mutate global provider facts. Price wire values are decimal strings; companion schema specifies exact numeric storage/precision.

### `collection_items`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| collection_id | uuid | N | PK part; composite FK collections(id,account_id,category) DELETE CASCADE |
| recommendation_id | uuid | N | PK part; composite FK recommendations(id,account_id,category) DELETE RESTRICT |
| account_id | uuid | N | —; participates in both composite FKs |
| category | text | N | —; catalog categories only |
| display_order | integer | N | —; >=0 |
| pin_order | integer | Y | —; >=0 |
| created_at | timestamptz | N | now() |

PK `(collection_id,recommendation_id)`. Unique `(collection_id,display_order)` and `(collection_id,pin_order)` DEFERRABLE INITIALLY DEFERRED. Index recommendation_id. `is_pinned` DTO is `pin_order IS NOT NULL`; do not persist contradictory boolean. Reorder checks exact active item set, locks collection, changes positions and increments parent revision atomically. Archiving a collection hides items but does not delete shared catalog or a recommendation referenced elsewhere. Guides use companion section rows instead of forcing blocks into this table; Music uses retained playlist membership.

## 8. Media persistence and typed attachments

### `media_assets`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| purpose | text | N | —; profile/background/feed/collection/recommendation/guide/claim-evidence |
| status | text | N | 'uploading'; uploading/ready/pending_delete/deleted/failed |
| mime_type | text | N | —; server-sniffed allowlist |
| byte_size | bigint | N | —; CHECK >=0, per-purpose limit validated server-side |
| content_sha256 | bytea | Y | —; CHECK octet_length=32 when present |
| original_filename | text | Y | —; metadata only, not storage key |
| width_px | integer | Y | —; CHECK >0; server-decoded image/video width |
| height_px | integer | Y | —; CHECK >0; server-decoded image/video height |
| alternative_text | text | Y | — |
| caption | text | Y | — |
| ready_at | timestamptz | Y | — |
| delete_requested_at | timestamptz | Y | — |
| deleted_at | timestamptz | Y | — |
| created_at, updated_at | stamp | N | now() each |

CHECK width_px and height_px are both null or both present; aspect ratio is derived from them, never an independent conflicting value. Unique `(id,account_id)`. Index `(account_id,status,id)`; partial `(created_at,id)` WHERE status IN ('uploading','failed') for abandoned cleanup; partial `(delete_requested_at,id)` WHERE status='pending_delete'. CHECK ready requires ready_at/hash; deleted requires deleted_at. Delete is state transition; object cleanup completes before hard deleting metadata. No cross-account deduplication grants access to another account's bytes.

### `media_objects`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| media_id | uuid | N | PK part; FK media_assets.id DELETE RESTRICT |
| variant | text | N | PK part; original/thumbnail/display |
| storage_environment | text | N | —; local/qa/prod |
| object_key | text | N | —; UNIQUE; server-assigned prefixed key |
| mime_type | text | N | — |
| byte_size | bigint | N | —; >=0 |
| content_sha256 | bytea | N | —; exactly32 bytes |
| storage_version_id | text | Y | —; only if S3 returns versioning ID |
| deleted_at | timestamptz | Y | — |
| created_at | timestamptz | N | now() |

CHECK object_key begins exactly storage_environment + '/' and does not include traversal/control bytes. DB can't know its host environment, so validated runtime rejects any row not matching its configured environment before storage access. S3 bucket is runtime config, not user-selectable per-row. PK `(media_id,variant)`; index `(storage_environment,object_key)` already served by unique key where appropriate. Cleanup job uses stored version ID if deleting a versioned object; metadata cannot assert permanent purge while versioned bytes remain contrary to retention policy.

### Typed media attachment tables

| Table | Complete columns | Keys/index/delete behavior |
|---|---|---|
| profile_media | account_id uuid N; slot text N CHECK profile/background/wallpaper; media_id uuid N; created_at timestamptz N DEFAULT now() | PK(account_id,slot); account FK DELETE CASCADE; composite (media_id,account_id) FK media_assets DELETE RESTRICT; index(media_id); same asset may occupy two slots |
| collection_media | collection_id uuid N; account_id uuid N; slot text N CHECK cover; media_id uuid N; created_at timestamptz N DEFAULT now() | PK(collection_id,slot); composite collection/account FK DELETE CASCADE; composite media/account FK DELETE RESTRICT; index(media_id) |
| recommendation_media | recommendation_id uuid N; account_id uuid N; media_id uuid N; display_order integer N CHECK>=0; created_at timestamptz N DEFAULT now() | PK(recommendation_id,media_id); composite recommendation/account FK DELETE CASCADE; composite media/account FK DELETE RESTRICT; unique(recommendation_id,display_order) deferrable; index(media_id) |

`profile_feed_items(media_id,account_id)` references media_assets(id,account_id) DELETE RESTRICT when media_id non-null. Guide/claim attachments require equivalent typed companion joins with composite ownership FKs; never a generic target_type/target_id FK-less media table. A deferred constraint trigger rejects attach of non-ready asset or claim-evidence purpose to public-content slots. Public delivery is derived from current live attachments, account/category/list state, not a stale public flag on media_assets. Detached assets remain owner-readable until deleted/grace cleanup. Claim evidence never has a public attachment path.

## 9. `application_command_receipts`

General authenticated create/update/archive/recovery replay; not a replacement for existing durable Music publication receipts.

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| actor_user_id | text | Y | —; FK auth_user.id DELETE SET NULL |
| operation | text | N | —; named application operation registry |
| idempotency_key_hash | bytea | N | —;32 bytes |
| input_hash | bytea | N | —;32 bytes, canonical validated input |
| status | text | N | 'pending'; pending/succeeded/failed/retired |
| response_status | smallint | Y | —;100..599 |
| response_body | jsonb | Y | —; sanitized DTO only, never credentials/provider tokens |
| resource_id | uuid | Y | —; diagnostic only, not generic authority FK |
| completed_at | timestamptz | Y | — |
| replay_until | timestamptz | N | —; explicit operation policy |
| created_at, updated_at | stamp | N | now() each |

Unique `(account_id,operation,idempotency_key_hash)`; index `(status,replay_until)`. Mutations and successful receipt commit atomically; in-progress concurrent calls serialize/wait under database row lock, never leave a successful resource with no receipt. Same key/different input conflicts. After replay expiry, strip response data and retain a retired hash marker for the account lifetime so a stale create cannot silently execute again. State failed does not imply external effects absent; resumable job operations return operation ID and consult lifecycle/outbox. Auth/key secrets use purpose-specific receipts rather than this plaintext sanitized-response table.

## 10. Lifecycle, feedback and recovery

### `account_lifecycle_operations`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| requested_by_user_id | text | Y | —; FK auth_user.id DELETE SET NULL |
| kind | text | N | —; deactivate/delete/reactivate/cancel_deletion |
| state | text | N | 'pending'; pending/running/succeeded/failed/cancelled |
| expected_revision | bigint | N | —; safe positive |
| feedback_id | uuid | Y | —; same-account composite feedback FK DELETE RESTRICT |
| receipt_id | uuid | N | UNIQUE; FK application_command_receipts.id DELETE RESTRICT |
| failure_code | text | Y | —; safe internal code, no raw token/provider response |
| created_at, updated_at | stamp | N | now() each |
| completed_at | timestamptz | Y | — |

Unique `(id,account_id)`; partial unique account_id WHERE state IN ('pending','running') prevents conflicting lifecycle operations. Index `(state,created_at,id)`. Delete kind requires feedback_id; same-account FK `(feedback_id,account_id)` ensures ownership. Status/revision changes and event-outbox insertion occur in same transaction. AccountLifecycleDto.operationId resolves the active/latest relevant operation, not a free mutable account JSON value.

### `deletion_feedback`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| user_id | text | Y | —; FK auth_user.id DELETE SET NULL |
| reason | text | Y | —; length(trim(reason)) 1..2000 while present |
| purged_at | timestamptz | Y | — |
| created_at | timestamptz | N | now() |

Unique `(id,account_id)`; index account_id. CHECK exactly one of non-null reason / non-null purged_at. Raw feedback is not reference seed data. On terminal deletion clear reason/user_id, retaining minimal ID linkage until lifecycle operation cleanup; abandoned feedback uses explicit retention job. Time-based retention follows the consolidated retention policy below.

### `account_recovery_proofs`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| user_id | text | N | FK auth_user.id DELETE RESTRICT |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| token_hash | bytea | N | UNIQUE;32-byte digest of opaque random token |
| purpose | text | N | 'account-recovery'; CHECK exact value |
| authenticated_at | timestamptz | N | —; verified fresh Google auth time |
| issued_at | timestamptz | N | now() |
| expires_at | timestamptz | N | —; CHECK expires_at=issued_at+interval '5 minutes' |
| consumed_at | timestamptz | Y | — |
| revoked_at | timestamptz | Y | — |

Composite `(account_id,user_id)` FK membership DELETE RESTRICT. Index `(expires_at,id)` and `(account_id,user_id)`. Transaction consumes only unused/unrevoked/unexpired proof at database time and transitions eligible account revision. A recovery proof authorizes no ordinary Actor operation; terminally deleted account never recovers. No raw token, cookie or Google token stored here. Remove expired consumed rows after a bounded operational retention period; that period is documented before launch, while replay denial is immediate via consumed_at.

## 11. `application_outbox`

Only required durable side effects: media cleanup, account purge/revocation notifications, cache/public snapshot invalidation. This is not a general event-sourcing system.

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | Y | —; FK creator_accounts.id DELETE RESTRICT |
| topic | text | N | —; allowlisted job/event kind |
| dedupe_key | text | N | UNIQUE |
| payload | jsonb | N | —; typed minimal object, IDs only except storage cleanup descriptor |
| state | text | N | 'pending'; pending/leased/done/dead |
| attempts | integer | N | 0; >=0 |
| available_at | timestamptz | N | now() |
| lease_until | timestamptz | Y | — |
| lease_token | uuid | Y | — |
| last_error_code | text | Y | —; sanitized |
| completed_at | timestamptz | Y | — |
| created_at | timestamptz | N | now() |

CHECK leased iff both lease fields present; done requires completed_at. Partial `(available_at,id)` WHERE state='pending'; `(lease_until,id)` WHERE state='leased'. Claim using row locks/SKIP LOCKED; completion requires matching lease token. Post-commit delivery only; rollback emits nothing. Idempotent consumers tolerate at-least-once delivery. For deletion, durable job retains exact server-owned object reference until storage deletion verified; never caller-provided key.

## 12. Analytics events and retry receipts

### `analytics_events`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| id | uuid | N | PK; gen_random_uuid() |
| account_id | uuid | N | FK creator_accounts.id DELETE RESTRICT |
| client_event_id | text | N | —; length8..128 |
| event_type | text | N | —; view/click/interaction |
| page | text | N | —; exact existing analyticsPageSchema enum |
| category | text | Y | —; CategoryKey |
| collection_id | uuid | Y | —; same-account composite FK collections DELETE RESTRICT |
| recommendation_id | uuid | Y | —; same-account composite FK recommendations DELETE RESTRICT |
| occurred_at | timestamptz | N | —; validated input time |
| received_at | timestamptz | N | now() |
| canonical_path | text | N | —; safe public path max2048, no query/fragment |
| element | text | Y | —; max256 |
| referrer_origin | text | Y | —; origin only max255 |
| utm | jsonb | N | '{}' object; only existing five utm fields each max100 |
| metadata | jsonb | N | '{}' object; exact existing metadataSchema allowlist |
| country_code | text | Y | —; two-letter uppercase code when resolved |
| consent_version | text | N | —; configured consent contract version |

Unique `(account_id,client_event_id)`, indexes `(account_id,occurred_at,id)`, `(account_id,category,occurred_at)`, `(collection_id,occurred_at)` and `(recommendation_id,occurred_at)`. No raw IP, full referrer URL, provider credential, chat prompt or permanent anonymous-user identifier. Server validates public ownership/visibility before insertion. Guides/music events use their companion validated target mapping without assigning their IDs to recommendation FK; typed guide_collection_id can use collection_id, Music public descriptor is validated against canonical Music account and allowable metadata, not an invented FK to catalog recommendations.

Domain rejects consent=false without inserting an event. Separate receipt store below may record only accepted retry state; consent-denied input does not preserve payload. Aggregates use occurred_at UTC with inclusive from/exclusive to and max366-day query window. Account terminal deletion removes event payloads before account hard purge; no historic import required. Time-based retention follows the consolidated retention policy; do not build partitioning/warehouse infrastructure before measured need.

### `analytics_event_receipts`

| Column | Type | Null | Default / rule |
|---|---|---|---|
| account_id | uuid | N | PK part; FK creator_accounts.id DELETE RESTRICT |
| client_event_id | text | N | PK part; length8..128 |
| input_hash | bytea | N | —;32 bytes |
| event_id | uuid | Y | —; FK analytics_events.id DELETE SET NULL |
| accepted_at | timestamptz | N | now() |
| retired_at | timestamptz | Y | — |

PK `(account_id,client_event_id)`; unique event_id where non-null; CHECK event_id not null OR retired_at not null; index `(accepted_at,account_id)`. Insert event+receipt atomically, making external publisher leases unnecessary on the new PG-only path. Concurrent same-key retries produce one event; changed body is conflict. On event retention purge mark retired_at and clear event_id atomically; retain hash marker for the receipt retention policy so old retries do not recreate expired data. Legacy `explorers_analytics_receipts` is not repurposed in place while old runtime uses it; append new schema and retire old table in the explicit cleanup epic.

## 13. Deletion, defaults and contracts cross-check

- AccountDto uses creator_accounts, category settings and presentation. Profile media/feed attachment IDs generate application URLs. No provider-auth rows join the public projection.
- CollectionDto uses collections plus ordered collection_items/media or guide sections. RecommendationDto uses recommendations + shared entity/category details + selected membership order/pin; display overrides win only for that recommendation.
- MediaDto derives URL from asset ID, size/type from ready asset; no object key or AWS credential. Public bytes require at least one currently public eligible attachment; claim purpose never qualifies.
- Actor user/account/member is resolved against library session, user_security_state and creator_accounts.status. RecoveryPrincipal uses recovery proof instead of Actor and cannot pass content authorization.
- Required command dedupe is in application_command_receipts; Music publication operations remain specialized. SQL constraints do not replace HTTP/domain permission checks.
- New indexes listed are minimum workload-driven indexes; no speculative graph/vector database, analytics warehouse, feed-follow tables or multi-tenant organization hierarchy.

## 14. Remaining exactness gates for the consolidated schema

1. Better Auth 1.7.6 generated physical schema is attached and locally qualified. Requalify any package/configuration change; full application migration tests remain required.
2. Companion category/guide/claim/Music schemas must use the exact keys above. Product/People optional `parentLocationCollectionId` maps to `location_linked_collections`; direct place-recommendation links, if separately present in the verified flow, need a distinct typed companion relation rather than overloading this ID.
3. Rich JSON validators require field-level schema definitions from existing theme/address/feed/rich-text models and full source fixtures before accepting writes; storage version1 alone is not validation. This document records the DB container and mapping; companion DTO appendix should list those payload keys.
4. Retention durations follow the consolidated engineering-default policy. Verify deletion jobs and operational evidence before production; these are product defaults, not a legal-compliance claim.
5. Account handle character/length rule was aligned to the existing Profile/username validator; retain its reserved-word tests when moving availability checking to the new API.
