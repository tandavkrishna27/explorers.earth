# Strapi → canonical field-level coverage register

**Read this framing before any row below.**

## 0. What this document is, and what "MIGRATED" means here

**This is not a data migration.** Historical user, media and analytics import is *explicitly excluded* from the agreed first release — see `docs/replatform-audit/migration-gap-audit-2026-10-05/identity-platform.md:17` ("**INTENTIONALLY EXCLUDED** historical imports/dual-write/password revival/community/billing") and `docs/replatform-audit/revised-direction.md:51` (fresh storage is acceptable "because media migration is not required") and `:55` ("The schema exports contain **structure, not seed rows**").

Therefore, in every table below:

> **MIGRATED** means **a canonical structure exists that can carry the field's semantics**. It never means that rows move, that any row exists, that a write path is implemented, or that a UI consumes it. Ticket-level delivery status is tracked separately in `docs/replatform-audit/ticket-index.md`; several MIGRATED rows below sit behind NOT-STARTED tickets.

**The authorization base is extremely thin.** The only field- or type-level exclusion authority found anywhere in this repository is:

| Authority | What it authorizes |
|---|---|
| `revised-direction.md:13-25` (the 13-row agreed-scope table) | Existing users/data, backend/frontend strategy, categories, Music, auth, ownership, catalog, following/community exclusion, admin deferral, ChatGPT, monetization deferral |
| `revised-direction.md:49` | Excluding the `user.movie_lists` relation as a schema inconsistency |
| `revised-direction.md:53` | Follower/community excluded; subscription monetization deferred; supporter model not automatically rebuilt |
| `identity-platform.md:17` | Password registration/reset/verification, community/following/supporter/billing, historical users/media/analytics migration |

Note on citation drift: the review that commissioned this register cites that table as `revised-direction.md:14-26`. Read first-hand in this worktree it is at **`:13-25`** — the same 13 rows, one line earlier. `identity-platform.md:17` independently cites it as `revised-direction.md:13–25`, which agrees with this reading.

**There is no field-level drop register anywhere in the planning package.** That is the gap this document closes. Consequently, every **MISSING** row below records the *absence of an authorization record*, which is strictly weaker than a recorded product decision to drop. §7 lists the items that need an actual decision.

`revised-direction.md:47` ("Preserve existing language/UI behavior") and `:46` are frequently read as drop authority. `:47` is an **instruction to preserve**, not permission to drop; `:46` ("Separate publication state from visibility; reproduce observed public behavior instead of blindly copying Strapi flags") **is** genuine authority not to reproduce per-type draft/publish flags.

## 1. Evidence base

**Legacy side — read first-hand.** `tandavkrishna27/localqr-strapi-v2` pinned at `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`, read through the GitHub API. All **40** `**/content-types/**/schema.json` files were fetched and fully decoded; **401** declared attributes were enumerated mechanically from those files, not from the in-repo extraction. Re-confirmed from the recursive tree at the pinned SHA: the app has **no `src/components/`**, **no `*/lifecycles/*`** and **no `*/policies/*`** source files. Invariants therefore live only in the `schema.json` declarations. Legacy evidence is cited below as `<type>@50b6c6e1`.

Mechanically derived legacy totals (all first-hand):

| Measure | Value |
|---|---|
| Content types | 40 |
| Declared attributes | 401 |
| `relation` attributes | 65 |
| `enumeration` attributes | 20 |
| `media` attributes | 17 (12 single, 5 multiple — plus `verify-claim.Attachment`) |
| `uid` attributes | 2 (`claimable-place-profile.Place_Id`, `movie-list.slug` → `List_Name`) |
| `required: true` attributes | 44 |
| `unique: true` attributes | **2** — `up_users.username` and `unsubscribe.email` |
| `draftAndPublish: true` types | **4** — `app-category`, `app-list`, `game-category`, `guide-section` |
| `i18n.localized: true` types | **4** — `account`, `faq`, `platform-term`, `recommendation-category` |
| Per-field localized attributes | **19** on `account`, 3 on `faq`, 3 on `platform-term`, 1 on `recommendation-category` |

(The commissioning brief says `account` has "20+" localized fields; the mechanical count at the pinned SHA is **19**.)

**Canonical side — read first-hand in this worktree** at `codex/unified-replatform` @ `225d83e5`: `tunes/shared/explorersSchema.ts`, `tunes/shared/schema.ts`, `tunes/shared/authSchema.ts`, all nine `tunes/shared/explorers*Contract.ts`, `tunes/shared/music-migration-contract.ts`, `tunes/server/db/migrate.ts`, `tunes/drizzle.config.ts`, and all 38 SQL files in `tunes/migrations/`.

Canonical destination anchors used throughout (table → owning migration:line, plus the Drizzle inventory mapping):

| Canonical table | SQL authority | Drizzle mapping |
|---|---|---|
| `auth_user` / `auth_session` / `auth_account` / `auth_verification` | `0022_explorers_identity.sql:3,13,26,44` | `authSchema.ts:4,17,36,60` |
| `user_security_state` | `0022:54` | `explorersSchema.ts:48` |
| `creator_accounts` | `0022:62` (+ handle uniqueness `0022:101`) | `explorersSchema.ts:8` |
| `account_memberships` | `0022:105` | `explorersSchema.ts:35` |
| `initial_account_bindings` | `0022:113` | `explorersSchema.ts:42` |
| `account_category_settings` | `0022:121` | `explorersSchema.ts:56` |
| `account_presentation` | `0022:131` | `explorersSchema.ts:64` |
| `account_recovery_proofs` | `0022:140` | `explorersSchema.ts:72` |
| `account_music_identity` | `0023_explorers_authorization.sql:15` | — |
| `media_assets` / `media_objects` / `profile_media` / `profile_feed_items` | `0024_explorers_profile_media.sql:1,28,44,54` | `explorersSchema.ts:89,104,113,119` |
| `deletion_feedback` / `account_lifecycle_operations` | `0027_explorers_lifecycle.sql:17,31` | — |
| `entities` / `entity_identifiers` | `0029_explorers_recommendations.sql:2,14` | `explorersSchema.ts:132,136` |
| `collections` / `recommendations` / `collection_items` | `0029:23,37,49` | `explorersSchema.ts:140,147,158` |
| `account_category_pin_state` / `category_recommendation_pins` | `0029:59,64` | `explorersSchema.ts:162,171` |
| `collection_media` / `recommendation_media` | `0029:75,82` | `explorersSchema.ts:175,179` |
| `account_category_content_state` | `0031_explorers_content_revision.sql:10` | `explorersSchema.ts:167` |
| `recommendation_display_overrides` | `0033_...:6` | `explorersSchema.ts:154` |
| `book_entity_details` / `book_recommendation_context` | `0034_...:4,12` | `explorersSchema.ts:184,188` |
| `recommendation_book_covers` | `0035_...:4` | `explorersSchema.ts:193` |
| `analytics_events` / `analytics_event_receipts` | `0036_...:2,25` | `explorersSchema.ts:197,200` |
| `movie_entity_details` / `movie_entity_provider_genres` | `0037_...:4,13` | `explorersSchema.ts:206,209` |
| `taxonomy_terms` / `taxonomy_term_translations` | `0037_...:18,24` | `explorersSchema.ts:212,215` |
| `movie_provider_genre_terms` / `recommendation_taxonomy` / `movie_recommendation_context` | `0037_...:29,34,42` | `explorersSchema.ts:218,221,224` |
| `recommendation_movie_media` | `0038_explorers_movie_media.sql:4` | `explorersSchema.ts:229` |

**Nothing was executed.** No test, build, type-check, migration, container, `npm`, `drizzle-kit`, `psql` or database connection; port 51642 untouched. The pre-existing uncommitted overlay (154 porcelain entries at read time) was left exactly as found; this register and the pointer appended to `strapi-schema-inventory.md` are the only files written.

## 2. Classification legend

| Class | Meaning | Evidence requirement |
|---|---|---|
| **MIGRATED** | A canonical structure exists that can carry the field's semantics | Canonical `file:line` named |
| **DROPPED-AUTHORIZED** | Intentionally not carried, with a citable decision | Authorizing doc `file:line` named. **Without a citation it is not this class.** |
| **MISSING** | No canonical equivalent *and* no authorization record | Legacy evidence `<type>@50b6c6e1` + the consequence |
| **UNVERIFIED** | Could not be established from source | Why |

## 3. Classification totals

**401 attributes across 40 content types.**

| Class | Attributes | Share |
|---|---|---|
| MIGRATED | **243** | 60.6% |
| DROPPED-AUTHORIZED | **35** | 8.7% |
| MISSING | **122** | 30.4% |
| UNVERIFIED | **1** | 0.2% |

By type:

| Type outcome | Count | Types |
|---|---|---|
| Fully MIGRATED | **15** | `app-category`, `app-list`, `book-list`, `game-list`, `guide-category`, `movie-category`, `movie-list`, `people-category`, `product-category`, `public-page-analytic`, `reason-for-leaving`, `recommendation-category`, `recommendation-sub-category`, `recommended-book`, `recommended-movie` |
| Fully DROPPED-AUTHORIZED | **5** | `community`, `follower`, `subscription-plan-base`, `supporter`, `user-subscription-plan` |
| Fully MISSING | **7** | `claimable-place-profile`, `faq`, `guide-section`, `platform-term`, `song-limit`, `unsubscribe`, `verify-claim` |
| Mixed | **13** | `account`, `book-category`, `game-category`, `guide`, `person-list`, `product-list`, `recommendation-list`, `recommended-app`, `recommended-game`, `recommended-person`, `recommended-place`, `recommended-product`, `up_users` |

Concentration of the MISSING set: `recommended-game` 17, `guide-section` 14, `guide` 13, `claimable-place-profile` 12, `recommended-product` 9, `recommended-place` 9, `recommended-app` 8, `recommended-person` 7, `verify-claim` 5, `account` 4, `recommendation-list` 4, `up_users` 4, `faq` 3, `platform-term` 3, `song-limit` 3, `unsubscribe` 3, five singletons.

## 4. Cross-cutting dimensions

These are *not* field rows and are not counted in §3. They record invariants that live above or beside individual fields.

### 4.1 Required / unique constraints

| Legacy invariant | Canonical | Class |
|---|---|---|
| `up_users.username` `unique:true, minLength:3` | `creator_accounts.handle_key` generated `lower(handle)` with `CREATE UNIQUE INDEX creator_accounts_handle_key_uq` (`0022:65,101`) and `creator_accounts_handle_valid CHECK` `^[a-z][a-z0-9-]{2,29}$`, no `--`, no trailing `-` (`0022:87-88`). Case-normalized uniqueness is **stronger** than legacy, as `revised-direction.md:43` directs. | MIGRATED |
| `unsubscribe.email` `unique:true` — **the only `unique:true` outside `up_users`** | No canonical table, column, route or test. Repo-wide search of `tunes/migrations`, `tunes/shared`, `tunes/server`, `explorers-earth/src` finds no suppression surface. | **MISSING** — see §7.1 |
| `up_users.email` `required, minLength:6` | `auth_user.email NOT NULL` + `auth_user_email_unique UNIQUE(email)` (`0022:6,11`) — legacy had **no** email uniqueness; canonical adds it | MIGRATED |
| `account.Primary_Address` `required:true` | `creator_accounts.primary_address jsonb` **nullable** (`0022:77`). Deliberate: `revised-direction.md:44` — "do not require fabricated address data merely to create a Google identity/account shell", with completion modelled as `onboarding_status` + `creator_accounts_complete_valid CHECK` (`0022:92,94-95`) | DROPPED-AUTHORIZED (`revised-direction.md:44`) |
| `account.localtunes_integrated` `required:true, default "No"` | Mapping-row existence in `account_music_identity` (`0023:15-19`), immutable by trigger (`0023:20-25`) | MIGRATED |
| The 41 other `required:true` fields (list names, slugs, visibilities, category names, provider IDs, titles, `price_tier`, `media_type`, `app_url`, `product_url`, `Account_Id`) | Carried as `NOT NULL` where the destination exists — `collections.title/slug/visibility/display_order` (`0029:26-30`), `recommendations.category` (`0029:40`), `entities.kind/title/origin` (`0029:4-6`), `entity_identifiers` PK (`0029:20`), `taxonomy_terms.slug` + `UNIQUE(category,slug)` (`0037:19,21`), `analytics_events.account_id` (`0036:2`). `recommended-app.app_url`, `recommended-app.price_tier` and `recommended-product.product_url` have **no destination at all**, so their required-ness is missing with the field. | mixed — per-field rows in §5 |

### 4.2 Defaults

| Legacy default | Canonical | Class |
|---|---|---|
| `account.public_profile` default `"Yes"` | `creator_accounts.public_profile boolean NOT NULL DEFAULT true` (`0022:70`) | MIGRATED |
| `account.auto_pinning` default `true` | `creator_accounts.auto_pinning NOT NULL DEFAULT true` (`0022:71`) | MIGRATED |
| All eight `account.public_<category>` default `"No"` | `account_category_settings.is_public NOT NULL DEFAULT false` (`0022:124`) — preserves the asymmetry `revised-direction.md:45` requires (profile public, categories private) | MIGRATED |
| `*-list.Visibility` default `false` | `collections.visibility NOT NULL DEFAULT 'private'` (`0029:28`) | MIGRATED |
| `up_users.Language_Choice` default `"en"` | `creator_accounts.locale NOT NULL DEFAULT 'en'` (`0022:72`) | MIGRATED |
| `recommended-*.display_order` default `0` | `collection_items.display_order integer NOT NULL CHECK(display_order>=0)` (`0029:52`) — **no default**; order becomes a required write | MIGRATED (default not carried) |
| `movie-list.top_picks_heading` default `"Top Picks"` | `collections.heading text` (`0029:30`) — **no default**. The visible per-category heading fallback must now be supplied by seed or UI; nothing in the canonical schema carries it. | **MISSING** (default only) |
| `recommended-app.price_tier` default `"Freemium"` | no destination | MISSING (with the field) |
| `recommended-person.primary_platform` default `"linkedin"` | no destination | MISSING (with the field) |
| `claimable-place-profile.Is_Claimed` default `false`, `account.Is_Claimable` default `false` | no destination | MISSING (with the fields) |

### 4.3 Enumerations (20 legacy enumerations)

| Legacy enumeration | Canonical | Class |
|---|---|---|
| `account.Account_Type` `[Personal, Creator, Business]` | `creator_accounts_type_valid CHECK (… IN ('Personal','Creator','Business'))` (`0022:91`); DTO `explorersContract.ts:166` | MIGRATED, values identical |
| `account.localtunes_integrated` `[Yes,No]` | mapping-row existence (`0023:15`) | MIGRATED (shape change: enum → row presence) |
| `account.public_{recommendations,profile,music,guides,movie,books,games,apps,products,people}` `[Yes,No]` (9 of them + `public_profile`) | boolean `account_category_settings.is_public` (`0022:124`) / `creator_accounts.public_profile` (`0022:70`) | MIGRATED (enum → boolean) |
| `guide.Guide_Type` `[Itinerary, Theme]` | none | MISSING |
| `guide.Budget_Type` `[Budget, Mid-Range, Luxury, Backpacker, Ultra-Luxury]` | none | MISSING |
| `recommended-app.price_tier` `[Free, Freemium, Paid, Subscription]` | none | MISSING |
| `recommended-movie.media_type` `[Movie, Show, TV]` | `movie_entity_details.media_type CHECK (… IN ('movie','tv'))` (`0037:6`) and `movie_provider_genre_terms.external_kind CHECK (… IN ('movie','tv'))` (`0037:30`) | MIGRATED — three values collapse to two. `Show`/`TV` are the same semantics so this is a normalization, but **no document authorizes the collapse**; recorded here so it is not discovered as a surprise. `0037:10` additionally enforces `media_type='tv' OR season_count IS NULL`, an invariant legacy did not have. |
| `recommended-person.primary_platform` `[instagram, linkedin, twitter, github, youtube, website, other]` | none (the account-level `socialLinkSchema.platform` enum at `explorersContract.ts:141-143` is the *owner's own* links, not a recommended person's) | MISSING |
| `recommended-place.Source_Of_Recommendation` `[self, suggestion]` | none | MISSING |
| `recommended-place.Recommendation_Type` `[place, person]` | `entities.kind CHECK (… IN ('place','movie','book','game','app','product','person'))` (`0029:4`) + `catalogKindSchema` (`explorersContract.ts:29`) | MIGRATED |
| `subscription-plan-base.duration` `[monthly, yearly]` | none | DROPPED-AUTHORIZED (`revised-direction.md:25`) |

### 4.4 Relations and cardinality (65 legacy relations)

| Legacy shape | Canonical | Class |
|---|---|---|
| `account ↔ up_users` `manyToMany` (+ `primary_admin` oneToOne, `all_admins` oneToMany — three competing ownership sources) | Single explicit `account_memberships` PK`(account_id,user_id)` with `role text NOT NULL DEFAULT 'owner' CHECK (role='owner')` (`0022:105-111`), plus `initial_account_bindings` enforcing one initial account per user with a deferred membership FK (`0022:113-119`) | MIGRATED — collapses three overlapping sources into one, as `revised-direction.md:42` directs |
| `account → *_lists` oneToMany, 7 families (`recommendation_lists`, `movie_lists`, `book_lists`, `game_lists`, `app_lists`, `product_lists`, `person_lists`) | One `collections` table keyed by `(account_id, category)` with `category CHECK` admitting 8 values (`0029:24-25`) and `UNIQUE(account_id,category,slug)` (`0029:33`) | MIGRATED |
| `*-list → recommended-*` oneToMany, 7 families | `collection_items` PK`(collection_id,recommendation_id)` with composite ownership FKs `(collection_id,account_id,category)` and `(recommendation_id,account_id,category)` (`0029:49-55`) — a far stronger ownership invariant than legacy | MIGRATED |
| `movie-category → recommended_movie` `manyToOne` (a category belongs to **one** movie) | `recommendation_taxonomy` PK`(recommendation_id,term_id)` (`0037:34-39`) — a reusable many-to-many | MIGRATED; the cardinality change is authorized at `revised-direction.md:48` ("Do not clone legacy cardinality mistakes") |
| `recommended-place.recommendation_category` and `.recommendation_sub_category` `oneToOne` | `recommendation_taxonomy` many-to-many over `taxonomy_terms` with `parent_id` self-FK (`0037:20,34`) | MIGRATED; same authority `:48` |
| `book-category ↔ recommended-book`, `game-category ↔ recommended-game` `manyToMany` | `recommendation_taxonomy` (`0037:34`) | MIGRATED |
| `recommendation-list → person_lists` / `→ product_lists` oneToMany (collection nests collection) | **No parent/child link on `collections`.** `createCollectionSchema` is `.strict()` with no parent field (`explorersContract.ts:60-62`); `collections` has no `parent_id` (`0029:23-34`). | **MISSING** — ticket 5.2 |
| `account.claimable_place_profile` oneToOne, `claimable-place-profile.Claiming_Account` oneToOne | none | **MISSING** — ticket 5.4 |
| `guide → guide_sections` oneToMany | none | **MISSING** — ticket 5.3 |
| `recommended-place.supporter` oneToOne, `supporter.accounts` oneToMany, `account.community_boards` oneToMany, `follower.*` | not rebuilt | DROPPED-AUTHORIZED (`revised-direction.md:22,53`; `identity-platform.md:17`) |
| `up_users.movie_lists` oneToMany mapped `mappedBy: "account"` against an account-targeted model | excluded as a schema inconsistency | DROPPED-AUTHORIZED (`revised-direction.md:49`) |
| `up_users.role → users-permissions.role` manyToOne | `account_memberships.role` is a single-valued `'owner'` (`0022:108`). The legacy role **graph** is administrator-configured in a deployed database and cannot be read from source (`revised-direction.md:63`). | **UNVERIFIED** |

### 4.5 Draft / publish semantics

Legacy enables `draftAndPublish` on exactly 4 of 40 types — `app-category`, `app-list`, `game-category`, `guide-section` — which `revised-direction.md:46` records as "inconsistent across families".

| Legacy | Canonical | Class |
|---|---|---|
| `app-list` D&P | `collections.publication_state text NOT NULL DEFAULT 'draft' CHECK (… IN ('draft','published'))` (`0029:29`), separate from `visibility` (`0029:28`) | MIGRATED |
| `guide-section` D&P | no `guide_sections` table at all | MISSING (with the type) |
| `app-category`, `game-category` D&P | `taxonomy_terms.active boolean NOT NULL DEFAULT true` (`0037:21`) — a publish flag in effect, not a draft/published pair | DROPPED-AUTHORIZED (`revised-direction.md:46`: "reproduce observed public behavior instead of blindly copying Strapi flags") |
| The 36 types **without** D&P, whose canonical counterparts now *have* `publication_state` | `collections`/`recommendations` both carry it (`0029:29,42`) | MIGRATED (canonical is strictly more expressive) |

### 4.6 Media / upload fields and storage (17 legacy media attributes)

| Legacy | Canonical | Class |
|---|---|---|
| `account.profile_picture`, `account.bg_picture` (single, `allowedTypes:["images"]`) | `profile_media` PK`(account_id,slot)` → `media_assets` (`0024:44,1`) | MIGRATED |
| Six `*-list.cover_image` (single; five allow `images,files,videos,audios`, `movie-list` allows `images` only) | `collection_media` PK`(collection_id,slot)` (`0029:75`) → `media_assets` | MIGRATED. The permissive `files,videos,audios` allowance is narrowed by `media_assets.purpose`/`mime_type` guards owned by `0025_explorers_media_attachment_guard.sql` and `0030_explorers_media_purpose_guard.sql`. The narrowing is deliberate hardening; no document authorizes it explicitly, but it reduces rather than expands capability. |
| Five `recommended-*.Media` (multiple) | `recommendation_media` PK`(recommendation_id,media_id)` (`0029:82`), plus `recommendation_book_covers` (`0035:4`) and `recommendation_movie_media` (`0038:4`) | MIGRATED |
| Seven `media_details` JSON siblings | `media_assets.alternative_text`, `.caption`, `.width_px`, `.height_px`, `.original_filename` (`0024:1`); feed shape at `explorersContract.ts:145` | MIGRATED |
| `guide.Guide_Media`, `guide-section.Recomendation_Media` (multiple) | `collection_media` reachable for `category='guides'` (`0029:25,75`); `guide-section` has no table | `Guide_Media` MIGRATED, `Recomendation_Media` MISSING |
| `community.Media`, `verify-claim.Attachment` (multiple) | none | `community.Media` DROPPED-AUTHORIZED (`revised-direction.md:22`); `verify-claim.Attachment` **MISSING** |
| Storage provider | Legacy `config/plugins.ts` configures S3 and Resend (`revised-direction.md:51`). Canonical storage is `media_objects.object_key UNIQUE` + `storage_environment` + `content_sha256 NOT NULL` + `storage_version_id` (`0024:28`). | MIGRATED (structure). Actual bucket/IAM/provider behavior is **UNVERIFIED** — not establishable from source. |
| `account.profile_place_media_details` | no column anywhere; **and zero references in the live frontend or backend** (searched `explorers-earth/src`, `explorers-earth/e2e`, `tunes/server`, `tunes/shared`, `tunes/client`) | **MISSING** — see §7.5 |

### 4.7 i18n localization

Legacy localizes 4 types; per-field `pluginOptions.i18n.localized` appears on **19** `account` attributes, 3 `faq`, 3 `platform-term`, 1 `recommendation-category`.

| Legacy | Canonical | Class |
|---|---|---|
| `recommendation-category.Category_Name` localized | `taxonomy_term_translations` PK`(term_id,locale)` with `locale CHECK ~ '^[a-z]{2}(-[A-Z]{2})?$'` (`0037:24-26`) | MIGRATED — a genuine translation table |
| `account`: 19 localized fields (`username`, `Account_Name`, `Bio_1`, `Bio`, `Addresss`, `Account_Type`, `profile_picture`, `bg_picture`, `social_media`, `mobile_number`, `mobile_number_visibility`, `profile_place_details`, `profile_place_media_details`, `Primary_Address`, `Public_Profile_Address`, `public_apps`, `public_products`, `public_people`, `auto_pinning`) | **One** `creator_accounts.locale` column (`0022:72`), constrained to `["en","hi"]` on write (`explorersContract.ts:202`). No per-field localized variants exist; one account holds one locale. | **MISSING** — see §7.2 |
| `faq.Question`, `.Answer`, `.Sequence` localized | no canonical FAQ destination | MISSING (with the type) |
| `platform-term.Terms_and_Condition`, `.Privacy_and_Policy`, `.Cookie_Policy` localized | no canonical destination | MISSING (with the type) |

`revised-direction.md:47` instructs "Preserve existing language/UI behavior and inspect locale-dependent responses; no need to invent a new multilingual authoring UI." That authorizes **not building an authoring UI**. It does not authorize losing per-field locale variants on the account, FAQ, or legal content, which is what the canonical shape does today.

### 4.8 Slugs and uniqueness

| Legacy | Canonical | Class |
|---|---|---|
| Six `*-list.slug` `string, required` with **no uniqueness declaration** | `collections.slug text NOT NULL CHECK(length BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` + `UNIQUE(account_id,category,slug)` (`0029:27,33`) | MIGRATED — uniqueness newly enforced |
| `movie-list.slug` `type:"uid", targetField:"List_Name"` — server-generated | `collections.slug` is a **client-supplied** validated value; `createCollectionSchema` requires `slug` (`explorersContract.ts:60`). No auto-derivation from title exists. | MIGRATED (generation moved to the caller). `revised-direction.md:101` requires that "New slug/handle uniqueness should not change the visible URL structure" — unverified here, as URL parity is a browser-acceptance question. |
| `claimable-place-profile.Place_Id` `type:"uid"` | none | MISSING (with the type) |
| `account.username` (no uniqueness) | case-normalized unique handle (`0022:65,101`) | MIGRATED, strengthened per `revised-direction.md:43` |
| `app-category.slug`, `product-category.slug` `required` | `taxonomy_terms.slug` + `UNIQUE(category,slug)` (`0037:19,21`) | MIGRATED |

### 4.9 Ownership fields

Legacy ownership is a scattered set of `account` relations, three overlapping admin relations, and string identifiers (`follower.main_account`, `song-limit.username`, `public-page-analytic.Account_Id`, `user-subscription-plan.user_id`).

Canonical ownership is uniform and enforced in SQL: every owned table carries `account_id uuid` and the composite FKs force category and owner to agree — `collection_items` FKs on `(collection_id,account_id,category)` and `(recommendation_id,account_id,category)` (`0029:54-55`), likewise `recommendation_taxonomy` (`0037:37`), `movie_recommendation_context` (`0037:46`), `recommendation_movie_media` (`0038`), `book_recommendation_context`, `recommendation_book_covers` (`0035`). `collections` and `recommendations` reference `creator_accounts(id) ON DELETE RESTRICT` (`0029:24,38`) so the account tombstone survives content. This is **MIGRATED and strictly stronger** than legacy, where no schema constraint tied a child's owner to its parent's.

The string-keyed legacy owners are replaced by typed references: `analytics_events.account_id uuid` (`0036:2`) for `Account_Id` (`revised-direction.md:50`), `deletion_feedback.account_id`/`user_id` (`0027:19-20`) for `reason-for-leaving.User_Details`.

### 4.10 Timestamps

| Legacy | Canonical | Class |
|---|---|---|
| Strapi implicit `createdAt`/`updatedAt`/`publishedAt`/`createdBy`/`updatedBy` on all 40 types | `created_at timestamptz NOT NULL DEFAULT now()` + `updated_at timestamptz NOT NULL DEFAULT now()` on `creator_accounts` (`0022:85-86`), `entities`, `collections`, `recommendations` (`0029:32,44,9`), `media_assets` (`0024:1`), `profile_feed_items` (`0024:54`) | MIGRATED |
| `publishedAt` (the D&P timestamp, on 4 types) | `publication_state` enum only — no publish timestamp | DROPPED-AUTHORIZED (`revised-direction.md:46`) |
| `createdBy`/`updatedBy` (admin-panel authorship) | No per-row actor columns on content tables. `revised-direction.md:87` says "audit events can also record which user acted"; `account_lifecycle_operations` (`0027:31`) and `deletion_feedback.user_id` (`0027:20`) record the acting user for lifecycle only. | DROPPED-AUTHORIZED for content authorship (`revised-direction.md:23`, admin interface deferred) |
| `unsubscribe.unsubscribedAt` | no destination | MISSING (with the type) |
| `user-subscription-plan.start_date`/`end_date` | not rebuilt | DROPPED-AUTHORIZED (`revised-direction.md:25`) |

### 4.11 Cascade and delete behavior

Legacy declares **no** delete behavior at all — Strapi relations in `schema.json` carry no `onDelete`. Canonical makes every edge explicit, which is a net gain, but the choices are worth recording because they are invariants no legacy artifact can be checked against:

| Canonical edge | Behavior | Note |
|---|---|---|
| `auth_session`/`auth_account` → `auth_user` | `ON DELETE CASCADE` (`0022:23,40`) | Better Auth generated contract |
| `user_security_state`, `account_memberships.user_id`, `initial_account_bindings` → `auth_user` | `ON DELETE RESTRICT` (`0022:55,107,114`) | a user cannot be deleted out from under an account |
| `account_memberships.account_id` → `creator_accounts` | `ON DELETE CASCADE` (`0022:106`) | |
| `collections`, `recommendations` → `creator_accounts` | `ON DELETE RESTRICT` (`0029:24,38`) | tombstone-preserving |
| `account_category_content_state` → `creator_accounts` | `ON DELETE RESTRICT` (`0031`; `explorersSchema.ts:168` comment) | revision counters outlive content |
| `recommendations.entity_id` → `entities` | `ON DELETE RESTRICT` (`0029:39`) | shared catalog rows survive |
| `collection_items` → `collections` | `CASCADE`; → `recommendations` `RESTRICT` (`0029:54-55`) | deleting a collection drops memberships, not recommendations |
| `*_entity_details` → `entities` | `ON DELETE CASCADE` (`0034:5`, `0037:5`) | |
| `taxonomy_term_translations` → `taxonomy_terms` | `CASCADE`; `taxonomy_terms.parent_id` self-FK `RESTRICT` (`0037:20,25`) | |
| `recommendation_taxonomy` → `recommendations` | `CASCADE`; → `taxonomy_terms(id,category)` `RESTRICT` (`0037:37-38`) | |
| Terminal account purge | `purge_explorers_account_content(uuid,uuid)` `SECURITY DEFINER`, newest body at `0038:168-196`, gated on `status='pending_deletion'` (`0038:172-175`) and a matching running `delete` operation (`0038:181-186`) | **Watch item — see §8.2** |

## 5. Per-type, per-field register

Ordering follows the legacy repository. `D&P` = `draftAndPublish`. Row counts match §3 exactly.

### 5.1 `account` — 44 fields · D&P false · i18n localized (19 fields) · `account@50b6c6e1`

| Legacy field | Type | Class | Canonical destination / authority / consequence |
|---|---|---|---|
| `username` | string (localized) | MIGRATED | `creator_accounts.handle` + unique `handle_key` (`0022:64-65,101`); DTO `explorersContract.ts:164` |
| `Account_Name` | string (localized) | MIGRATED | `creator_accounts.display_name` (`0022:66`) + `CHECK` (`0022:89-90`); DTO `:165` |
| `Bio_1` | string (localized) | MIGRATED | `creator_accounts.bio_plain` (`0022:75`); DTO `:175` |
| `users_permissions_users` | relation m2m → user | MIGRATED | `account_memberships` (`0022:105-111`) |
| `Addresss` | json (localized) | MIGRATED | `creator_accounts.additional_addresses jsonb NOT NULL DEFAULT '[]'` + array `CHECK` (`0022:78,99`); DTO `:178` capped at 20 |
| `Account_Type` | enum (localized) | MIGRATED | `creator_accounts.account_type` + `CHECK` (`0022:67,91`); DTO `:166` |
| `profile_picture` | media single images (localized) | MIGRATED | `profile_media(account_id,slot)` → `media_assets` (`0024:44,1`); DTO `:185` |
| `bg_picture` | media single images (localized) | MIGRATED | same (`0024:44`); DTO `:186` |
| `social_media` | json (localized) | MIGRATED | `account_presentation.social_links` (`0022:131`); typed `socialLinkSchema` 15-platform enum (`explorersContract.ts:141-143`); DTO `:183` |
| `primary_admin` | relation o2o → user | MIGRATED | `initial_account_bindings` (`0022:113-119`) + `role='owner'` (`0022:108`) |
| `all_admins` | relation o2m → user | MIGRATED | `account_memberships` (`0022:105`); the one-account/one-owner policy is `revised-direction.md:20,85` |
| `mobile_number_visibility` | boolean (localized) | MIGRATED | `creator_accounts.mobile_number_visible` (`0022:74`); DTO `:174` |
| `profile_place_details` | json (localized) | MIGRATED | `creator_accounts.profile_place_details` (`0022:80`); typed `placeDetailsSchema` (`explorersContract.ts:126`); DTO `:180` |
| **`profile_place_media_details`** | json (localized) | **MISSING** | `account@50b6c6e1`. No canonical column; **zero references in live frontend or backend**. Consequence: if it carried any live profile media metadata, that metadata has no destination and no consumer would notice until a user reports it. Low risk, but undecided. §7.5 |
| `recommendation_lists` | relation o2m → recommendation-list | MIGRATED | `collections` where `category='places'` (`0029:23-25`) |
| `mobile_number` | string (localized) | MIGRATED | `creator_accounts.mobile_number` (`0022:73`); DTO `:173` |
| `Primary_Address` | json **required** (localized) | MIGRATED | `creator_accounts.primary_address` (`0022:77`), nullable; required-ness intentionally relaxed per `revised-direction.md:44`, with completion as `creator_accounts_complete_valid` (`0022:94-95`) |
| `Bio` | richtext (localized) | MIGRATED | `creator_accounts.bio_rich jsonb` (`0022:76`); typed `richTextSchema` (`explorersContract.ts:128`); DTO `:176` |
| `community_boards` | relation o2m → community | DROPPED-AUTHORIZED | `revised-direction.md:22` ("Following/community … Excluded even though Strapi schemas exist"), `:53`, `identity-platform.md:17` |
| `guides` | relation o2m → guide | MIGRATED | Ownership edge → `collections.account_id` with `category='guides'` admitted at `0029:25`. The guide **body and sections** are separately MISSING — see §5.13/§5.14 and §8 |
| `Public_Profile_Address` | json (localized) | MIGRATED | `creator_accounts.public_address` (`0022:79`); typed `publicAddressSchema` (`explorersContract.ts:122`); DTO `:179` |
| `Feed_Data` | json | MIGRATED | `profile_feed_items` (`0024:54`); typed `profileFeedItemSchema` (`explorersContract.ts:148`); DTO `:187` |
| **`claimable_place_profile`** | relation o2o | **MISSING** | `account@50b6c6e1`. No claim table. §7.4 / ticket 5.4 |
| **`Is_Claimable`** | boolean default false | **MISSING** | `account@50b6c6e1`. **Zero references in live frontend or backend.** Consequence: "a pending claim must not grant ownership" has nowhere to be enforced. §7.4 / ticket 5.4 |
| `localtunes_integrated` | enum **required** default No | MIGRATED | `account_music_identity` row existence (`0023:15-19`), immutable (`0023:20-25`) |
| `public_recommendations` | enum default No | MIGRATED | `account_category_settings(account_id,'places').is_public` (`0022:121-124`) |
| `public_profile` | enum default Yes | MIGRATED | `creator_accounts.public_profile DEFAULT true` (`0022:70`); DTO `:170` |
| `public_music` | enum default No | MIGRATED | `account_category_settings` `category='music'` admitted (`0022:123`) |
| **`localtunes_public`** | string | **MISSING** | `account@50b6c6e1`. Still a typed field on the live public surface at `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx:46`. `socialLinkSchema.platform` admits `"localTunes"` (`explorersContract.ts:142`), which *may* be the intended destination, but nothing maps it. §7.5 |
| `public_guides` | enum default No | MIGRATED | `account_category_settings` `'guides'` (`0022:123`) |
| `movie_lists` | relation o2m | MIGRATED | `collections` `category='movies'` (`0029:25`) |
| `public_movie` | enum default No | MIGRATED | `account_category_settings` `'movies'` |
| `book_lists` | relation o2m | MIGRATED | `collections` `category='books'` |
| `public_books` | enum default No | MIGRATED | `account_category_settings` `'books'` |
| `game_lists` | relation o2m | MIGRATED | `collections` `category='games'` |
| `public_games` | enum default No | MIGRATED | `account_category_settings` `'games'` |
| `pinned_nav_tabs` | json | MIGRATED | `account_category_settings.pinned_order` + deferred `UNIQUE(account_id,pinned_order)` (`0022:126,129`); tab order also in `themeSettings.recommendations.categoryOrder` (`explorersContract.ts:139`) |
| `app_lists` | relation o2m | MIGRATED | `collections` `category='apps'` |
| `product_lists` | relation o2m | MIGRATED | `collections` `category='products'` |
| `public_apps` | enum default No (localized) | MIGRATED | `account_category_settings` `'apps'` |
| `public_products` | enum default No (localized) | MIGRATED | `account_category_settings` `'products'` |
| `person_lists` | relation o2m | MIGRATED | `collections` `category='people'` |
| `public_people` | enum default No (localized) | MIGRATED | `account_category_settings` `'people'` |
| `auto_pinning` | boolean default true (localized) | MIGRATED | `creator_accounts.auto_pinning DEFAULT true` (`0022:71`); DTO `:171` |

**Type totals** — MIGRATED 39 · DROPPED-AUTHORIZED 1 · MISSING 4. Plus the cross-cutting **per-field i18n loss on 19 of these fields** (§4.7, §7.2) and the business/theme additions (`account_presentation.theme_settings`/`business_details`, `0022:131`) which have no legacy counterpart.

### 5.2 `app-category` — 3 fields · **D&P true** · `app-category@50b6c6e1`

| Legacy field | Type | Class | Canonical / authority |
|---|---|---|---|
| `recommended_apps` | relation o2m | MIGRATED | `recommendation_taxonomy` (`0037:34`), `category='apps'` admitted (`0037:35`) |
| `name` **required** | string | MIGRATED | `taxonomy_term_translations.label NOT NULL` (`0037:24-26`) |
| `slug` **required** | string | MIGRATED | `taxonomy_terms.slug` + `UNIQUE(category,slug)` (`0037:19,21`) |

D&P flag → `taxonomy_terms.active` (`0037:21`), DROPPED-AUTHORIZED at `revised-direction.md:46`. **No rows exist** — see §7.7 / §8.1.

### 5.3 `app-list` — 9 fields · **D&P true** · `app-list@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `List_Name` **required** | string | MIGRATED | `collections.title NOT NULL` + length `CHECK` (`0029:26`) |
| `list_description` | text | MIGRATED | `collections.description` (`0029:26`) |
| `slug` **required** | string | MIGRATED | `collections.slug NOT NULL` + regex + `UNIQUE(account_id,category,slug)` (`0029:27,33`) |
| `Visibility` **required** default false | boolean | MIGRATED | `collections.visibility DEFAULT 'private'` (`0029:28`) |
| `cover_image` | media single | MIGRATED | `collection_media(collection_id,slot)` (`0029:75`) → `media_assets` (`0024:1`) |
| `display_order` default 0 | integer | MIGRATED | `collections.display_order NOT NULL CHECK>=0` (`0029:30`) — default not carried (§4.2) |
| `top_apps_heading` | string | MIGRATED | `collections.heading` (`0029:30`) |
| `account` | relation m2o | MIGRATED | `collections.account_id … ON DELETE RESTRICT` (`0029:24`) |
| `recommended_apps` | relation o2m | MIGRATED | `collection_items` (`0029:49`) |

D&P → `collections.publication_state` (`0029:29`). **MIGRATED 9.**

### 5.4 `book-category` — 3 fields · `book-category@50b6c6e1`

| Legacy field | Type | Class | Canonical / consequence |
|---|---|---|---|
| `subject_name` **required** | string | MIGRATED | `taxonomy_term_translations.label` (`0037:24`) |
| `recommended_books` | relation m2m | MIGRATED | `recommendation_taxonomy` (`0037:34`) |
| **`description`** | string | **MISSING** | `book-category@50b6c6e1`. `taxonomy_terms` (`0037:18-21`) and `taxonomy_term_translations` (`0037:24-26`) have **no description column**. Consequence: any per-subject blurb shown with a book category has no destination and is not localizable. |

**MIGRATED 2 · MISSING 1.**

### 5.5 `book-list` — 9 fields · `book-list@50b6c6e1`

Identical shape to §5.3 with `visibility` (lower-case) and `top_reads_heading`. `List_Name`→`collections.title`, `list_description`→`.description`, `slug`→`.slug`+unique, `visibility`→`.visibility`, `cover_image`→`collection_media`, `display_order`→`.display_order`, `top_reads_heading`→`.heading`, `account`→`.account_id`, `recommended_books`→`collection_items`. All `0029:23-34,49,75`.

**MIGRATED 9.**

### 5.6 `claimable-place-profile` — 12 fields · `claimable-place-profile@50b6c6e1`

Every field is **MISSING**. No `claimable_place_profiles` table, service, repository, route or migration exists; `grep -rli claimable tunes/migrations tunes/shared` returns nothing.

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| `Place_Id` | **uid** | MISSING | the claim subject has no canonical identity |
| `Name` | string | MISSING | |
| `Address` | string | MISSING | |
| `Lat` | decimal | MISSING | |
| `Long` | decimal | MISSING | |
| `Phone` | string | MISSING | |
| `Website` | string | MISSING | |
| `Meta_Data` | json | MISSING | |
| `Recommendation_Count` | integer | MISSING | the public claim prompt's count has no source |
| `Is_Claimed` | boolean default false | MISSING | **no canonical place can be marked claimed; "a pending claim must not grant ownership" is unenforceable** |
| `Claiming_Account` | relation o2o → account | MISSING | the claim→owner edge does not exist |
| `Added_By_User` | json | MISSING | claim provenance lost |

Live frontend still carries the flow: `explorers-earth/src/features/Favorites/services/claimablePlaceProfileService.ts`, `features/Authentication/components/PlaceProfileCard.tsx`, `features/Authentication/api/queries.ts`, `features/Favorites/api/mutation.ts`, `features/Favorites/hooks/useAddRecommendation.ts`. **MISSING 12.** §7.4 / ticket 5.4.

### 5.7 `community` — 6 fields · `community@50b6c6e1`

All **DROPPED-AUTHORIZED** by `revised-direction.md:22` ("Following/community … Excluded even though Strapi schemas exist. Public creator profiles remain in scope"), `:53` and `identity-platform.md:17`.

`description`, `Title`, `media_details`, `Media`, `visibility`, `account` — **DROPPED-AUTHORIZED 6.**

### 5.8 `faq` — 3 fields · i18n localized (3) · `faq@50b6c6e1`

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| `Question` | text (localized) | MISSING | |
| `Answer` | text (localized) | MISSING | |
| `Sequence` | integer (localized) | MISSING | FAQ ordering has no canonical source |

No canonical FAQ table, route or seed. The nearest existing table, `page_contents` (`0001_runtime_baseline.sql:205-215`), is a legacy Tunes table keyed on `slug` with `created_by`/`updated_by` referencing the **legacy integer `users` table**, has no locale column and no sequence — it is not a destination for localized FAQ rows. Live consumers still call GraphQL: `explorers-earth/src/features/LandingPage/hooks/useFaqs.ts`, `features/LandingPage/api/queries.ts`. **MISSING 3.** §7.3 / ticket 7.2.

### 5.9 `follower` — 2 fields · `follower@50b6c6e1`

`main_account`, `follower_account` — **DROPPED-AUTHORIZED 2** (`revised-direction.md:22,53`; `identity-platform.md:17`). Note `revised-direction.md:27` preserves the People feature's external follower-count field as ordinary profile metadata, distinct from this excluded network.

### 5.10 `game-category` — 3 fields · **D&P true** · `game-category@50b6c6e1`

| Legacy field | Type | Class | Canonical / consequence |
|---|---|---|---|
| `genre_name` **required** | string | MIGRATED | `taxonomy_term_translations.label` (`0037:24`); `taxonomy_terms` admits `category='games'` (`0037:19`) |
| **`igdb_genre_id`** | integer | **MISSING** | `game-category@50b6c6e1`. The provider-genre bridge is movies-only: `movie_provider_genre_terms.category text NOT NULL DEFAULT 'movies' CHECK(category='movies')` (`0037:31`). Consequence: IGDB genre IDs cannot be mapped to canonical terms, so game genre taxonomy cannot be seeded from the provider and must be maintained by hand. |
| `recommended_games` | relation m2m | MIGRATED | `recommendation_taxonomy` (`0037:34-35`) |

**MIGRATED 2 · MISSING 1.** Ticket 4.2.

### 5.11 `game-list` — 9 fields · `game-list@50b6c6e1`

Identical shape to §5.3, `top_picks_heading` → `collections.heading`. **MIGRATED 9.**

### 5.12 `guide-category` — 1 field · `guide-category@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `Category_Name` | string | MIGRATED | `taxonomy_terms` with `category='guides'` admitted (`0037:19`) + `taxonomy_term_translations.label` (`0037:24`) |

**MIGRATED 1.** Structure only — no rows (§7.7), and `recommendation_taxonomy` rows for `'guides'` are unreachable because its FK targets `recommendations(id,account_id,category)` (`0037:37`) whose own `CHECK` omits `'guides'` (`0029:40`). See §8.1.

### 5.13 `guide-section` — 14 fields · **D&P true** · `guide-section@50b6c6e1`

Every field is **MISSING**. There is no `guide_sections` table, aggregate, route or migration anywhere (`grep -rli guide_section tunes/migrations tunes/shared` → nothing).

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| `Title` | string | MISSING | |
| `Sequence` | decimal | MISSING | fractional section ordering has no destination |
| `Description` | **blocks** | MISSING | section rich text |
| `Recommendation_Activity` | json | MISSING | |
| `guide` | relation m2o → guide | MISSING | the section→guide edge does not exist |
| `Recomendation_Media` | media multiple | MISSING | |
| `Map_Details` | json | MISSING | |
| `Packing_List` | json | MISSING | |
| `Pre_Tasks` | json | MISSING | |
| `Section_tags` | json | MISSING | |
| `Timeline` | json | MISSING | |
| `Transport` | json | MISSING | |
| `Stay` | json | MISSING | |
| `Budget` | json | MISSING | |

Its D&P flag is MISSING with the type. **MISSING 14.** Ticket 5.3.

### 5.14 `guide` — 22 fields · `guide@50b6c6e1`

| Legacy field | Type | Class | Canonical / consequence |
|---|---|---|---|
| `Title` | string | MIGRATED | `collections.title` with `category='guides'` admitted (`0029:25-26`) |
| `Description` | blocks | MIGRATED | `collections.description_rich jsonb` (`0029:26`) |
| **`Tips_Notes`** | blocks | **MISSING** | `guide@50b6c6e1`. `collections` has exactly **one** rich field (`description_rich`, `0029:26`); a second guide-level rich block has nowhere to go |
| `Visibility` | boolean | MIGRATED | `collections.visibility` (`0029:28`) |
| `account` | relation m2o | MIGRATED | `collections.account_id` (`0029:24`) |
| **`Estimated_Budget`** | json | **MISSING** | `guide@50b6c6e1`; no guide aggregate |
| **`Guide_Section_Details`** | json | **MISSING** | `guide@50b6c6e1`; the denormalized section index has no destination |
| **`guide_sections`** | relation o2m | **MISSING** | `guide@50b6c6e1`; see §5.13 |
| `Guide_Media` | media multiple | MIGRATED | `collection_media` (`0029:75`) |
| `slug` | string | MIGRATED | `collections.slug` + `UNIQUE(account_id,category,slug)` (`0029:27,33`) |
| **`Guide_Type`** | enum `[Itinerary, Theme]` | **MISSING** | `guide@50b6c6e1`. Consequence: itinerary vs theme guides become indistinguishable, so no view can branch on it |
| **`Guide_Tags`** | json | **MISSING** | `guide@50b6c6e1`. `taxonomy_terms` admits `'guides'` (`0037:19`) but `recommendation_taxonomy`'s FK is unreachable for guides (`0037:37` vs `0029:40`) |
| **`Place_Details`** | json | **MISSING** | `guide@50b6c6e1`; guide locations have no destination |
| **`Transportation`** | json | **MISSING** | `guide@50b6c6e1` |
| **`Number_Of_Days`** | integer | **MISSING** | `guide@50b6c6e1` |
| **`Category`** | json | **MISSING** | `guide@50b6c6e1` |
| **`Best_Time_To_Visit`** | json | **MISSING** | `guide@50b6c6e1` |
| **`Budget_Type`** | enum (5 values) | **MISSING** | `guide@50b6c6e1` |
| **`is_Multicity`** | boolean default false | **MISSING** | `guide@50b6c6e1` |
| `is_pinned` | boolean | MIGRATED | `collections.pin_order` (`0029:30`) / `account_category_pin_state` (`0029:59`) |
| `pin_order` | integer | MIGRATED | `collections.pin_order CHECK>=0` (`0029:30`) |
| `display_order` | integer | MIGRATED | `collections.display_order` (`0029:30`) |

**MIGRATED 9 · MISSING 13.** Critically, even the MIGRATED rows are **not insertable today** for recommendations and items — see §8.1. Ticket 5.3.

### 5.15 `movie-category` — 2 fields · `movie-category@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `genre_name` **required** | string | MIGRATED | `taxonomy_term_translations.label` (`0037:24`) + `movie_provider_genre_terms` (`0037:29`) + `movie_entity_provider_genres.name` (`0037:13`) |
| `recommended_movie` | relation **m2o** | MIGRATED | `recommendation_taxonomy` many-to-many (`0037:34`). The legacy one-movie-per-category cardinality is deliberately not cloned — `revised-direction.md:48` |

**MIGRATED 2.**

### 5.16 `movie-list` — 9 fields · `movie-list@50b6c6e1`

Same shape as §5.3. Two notes: `slug` is legacy `type:"uid", targetField:"List_Name"` → canonical `collections.slug` is caller-supplied (§4.8); `top_picks_heading` default `"Top Picks"` → `collections.heading` has **no default** (§4.2, recorded there as a MISSING default). Also the only `*-list.cover_image` restricted to `["images"]`, matching the canonical media-purpose guards.

**MIGRATED 9.**

### 5.17 `people-category` — 2 fields · `people-category@50b6c6e1`

`Category_name` → `taxonomy_term_translations.label` (`0037:24`); `recommended_people` → `recommendation_taxonomy` (`0037:34`, `category='people'` at `:35`). **MIGRATED 2.**

### 5.18 `person-list` — 10 fields · `person-list@50b6c6e1`

Nine fields as §5.3 (`List_Name`, `list_description`, `slug`, `Visibility`, `cover_image`, `display_order` default 0, `top_picks_heading`, `account`, `recommended_people`) — all MIGRATED, plus:

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| **`recommendation_list`** | relation m2o → recommendation-list | **MISSING** | `person-list@50b6c6e1`. `collections` has no parent column (`0029:23-34`) and `createCollectionSchema` is `.strict()` with no parent field (`explorersContract.ts:60-62`). Consequence: a people list nested under a places list cannot be expressed, so the linked-list navigation that produced it has no canonical shape. |

**MIGRATED 9 · MISSING 1.** Ticket 5.2.

### 5.19 `platform-term` — 3 fields · i18n localized (3) · `platform-term@50b6c6e1`

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| `Terms_and_Condition` | blocks (localized) | MISSING | |
| `Privacy_and_Policy` | blocks (localized) | MISSING | |
| `Cookie_Policy` | blocks (localized) | MISSING | legal pages have no canonical source or locale variant |

No canonical destination; `page_contents` is unsuitable for the reasons in §5.8. Live consumers remain GraphQL: `explorers-earth/src/features/LandingPage/hooks/usePlatformTerms.ts`, `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`. **MISSING 3.** §7.2/§7.3, ticket 7.2.

### 5.20 `product-category` — 3 fields · `product-category@50b6c6e1`

`recommended_products` → `recommendation_taxonomy` (`0037:34`); `name` **required** → `taxonomy_term_translations.label` (`0037:24`); `slug` **required** → `taxonomy_terms.slug` + `UNIQUE(category,slug)` (`0037:19,21`). **MIGRATED 3.**

### 5.21 `product-list` — 10 fields · `product-list@50b6c6e1`

Nine as §5.3 (`List_Name`, `slug`, `Visibility`, `cover_image`, `display_order` default 0, `top_products_heading`, `account`, `recommended_products`, `list_description`) — MIGRATED — plus `recommendation_list` relation m2o → **MISSING**, same evidence and consequence as §5.18.

**MIGRATED 9 · MISSING 1.** Ticket 5.2.

### 5.22 `public-page-analytic` — 4 fields · `public-page-analytic@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `Account_Id` **required** | string | MIGRATED | `analytics_events.account_id uuid NOT NULL` (`0036:2`) — a validated FK-style reference replaces a free string, exactly as `revised-direction.md:50` directs |
| `Location_Id` | string | MIGRATED | `analytics_events.collection_id uuid` (`0036:2`) |
| `Recommendation_Id` | string | MIGRATED | `analytics_events.recommendation_id uuid` (`0036:2`) |
| `Stats` | json | MIGRATED | decomposed into typed columns — `event_type`, `page`, `category`, `canonical_path`, `element`, `referrer_origin`, `utm`, `metadata`, `country_code`, `consent_version`, `occurred_at`, `received_at` (`0036:2`), with idempotency in `analytics_event_receipts` (`0036:25`) |

**MIGRATED 4.** Historical analytics rows are explicitly excluded (`revised-direction.md:50`, `identity-platform.md:17`).

### 5.23 `reason-for-leaving` — 2 fields · `reason-for-leaving@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `Reasons` | json | MIGRATED | `deletion_feedback.reason text` (`0027:21`) |
| `User_Details` | json | MIGRATED | `deletion_feedback.account_id` + `user_id` (`0027:19-20`) with `deletion_feedback_lifecycle_check` (`0027:25`) |

**MIGRATED 2.** Cross-cutting: the *selectable seed list* of reasons is **DROPPED-AUTHORIZED** at `identity-platform.md:12` — "Schema presence of reason-for-leaving … does not require rebuilding unused selectable seed rows: current retained Settings reason is free text (`Settings.tsx:453–460,1377`)."

### 5.24 `recommendation-category` — 2 fields · i18n localized (1) · `recommendation-category@50b6c6e1`

| Legacy field | Type | Class | Canonical |
|---|---|---|---|
| `Category_Name` | string (localized) | MIGRATED | `taxonomy_terms` (`0037:18`) + `taxonomy_term_translations(term_id,locale)` with locale regex `CHECK` (`0037:24-26`). **This is the one place where legacy per-field localization is genuinely preserved.** |
| `recommendation_sub_categories` | relation o2m | MIGRATED | `taxonomy_terms.parent_id` self-FK `ON DELETE RESTRICT` + anti-self-parent `CHECK` (`0037:20-21`) |

**MIGRATED 2.** No rows (§7.7).

### 5.25 `recommendation-list` — 13 fields · `recommendation-list@50b6c6e1`

| Legacy field | Type | Class | Canonical / consequence |
|---|---|---|---|
| `slug` | string | MIGRATED | `collections.slug` + `UNIQUE(account_id,category,slug)` (`0029:27,33`) |
| `List_Name` | string | MIGRATED | `collections.title` (`0029:26`) |
| **`Instagram_Media_URL`** | string | **MISSING** | `recommendation-list@50b6c6e1`. Written live by `explorers-earth/src/features/Favorites/hooks/useCreateLocation.ts:147` from `values.recommendationSocialLink`; read by `features/Favorites/api/query.ts:29` and `api/mutation.ts:6,68`. Consequence: an in-use authoring field silently loses its value on migration. §7.3 |
| `account` | relation m2o | MIGRATED | `collections.account_id … RESTRICT` (`0029:24`) |
| `Visibility` | boolean | MIGRATED | `collections.visibility` (`0029:28`) |
| **`List_Name_Details`** | json | **MISSING** | `recommendation-list@50b6c6e1`. Live and consumed as `{thumbnail}` and a `place_id` source: `explorers-earth/src/components/CircularPlacesModal.tsx:12,275`, `src/components/ShareModal.tsx:314`, `src/components/ui/AddLocationModal.tsx:144`. Consequence: list thumbnails and the share-card background lose their source. §7.5 |
| `Sequence` | integer | MIGRATED | `collections.display_order` (`0029:30`) |
| `recommended_places` | relation o2m | MIGRATED | `collection_items` with composite ownership FKs (`0029:49-55`) |
| `is_pinned` | boolean | MIGRATED | `category_recommendation_pins` (`0029:64`) / `collections.pin_order` |
| `pin_order` | integer | MIGRATED | `collections.pin_order` (`0029:30`) |
| `display_order` | integer | MIGRATED | `collections.display_order` (`0029:30`) |
| **`person_lists`** | relation o2m | **MISSING** | `recommendation-list@50b6c6e1`; no collection nesting (see §5.18). Ticket 5.2 |
| **`product_lists`** | relation o2m | **MISSING** | `recommendation-list@50b6c6e1`; same. Ticket 5.2 |

**MIGRATED 9 · MISSING 4.**

### 5.26 `recommendation-sub-category` — 2 fields · `recommendation-sub-category@50b6c6e1`

`sub_category` → `taxonomy_terms.slug` + `taxonomy_term_translations.label` (`0037:19,24`); `recommendation_category` relation m2o → `taxonomy_terms.parent_id` (`0037:20`). **MIGRATED 2.** No rows (§7.7).

### 5.27 `recommended-app` — 16 fields · `recommended-app@50b6c6e1`

| Legacy field | Type | Class | Canonical / consequence |
|---|---|---|---|
| **`app_url`** **required** | string | **MISSING** | `recommended-app@50b6c6e1`. No `app_entity_details` table. Manual resolution accepts `details:{title}` and nothing else — `resolveManualEntitySchema` at `explorersContract.ts:87` is `.strict()` over `z.object({title:displayTitleWriteSchema}).strict()`; and `createRecommendationSchema` requires, for every non-books/non-movies category, `Object.keys(v.displayOverrides??{}).every(k=>k==='title')` (`explorersContract.ts:69`). The public read path enforces the same: `tunes/server/application/publicContent.ts:34` throws `PublicContentFailure(400)` for any non-`title` override key outside books/movies. **Consequence: an app recommendation's required URL is structurally unrepresentable — a required legacy field with no canonical slot at all.** |
| `title` **required** | string | MIGRATED | `entities.title NOT NULL CHECK(length 1..500)` (`0029:5`) |
| **`description`** | text | **MISSING** | `recommended-app@50b6c6e1`; same `{title}`-only ceiling |
| **`logo_url`** | string | **MISSING** | same |
| **`developer`** | string | **MISSING** | same |
| **`platforms`** | json | **MISSING** | same |
| **`price_tier`** **required** enum default Freemium | enum | **MISSING** | same; a required enum with a default disappears entirely |
| **`download_url`** | string | **MISSING** | same |
| `user_recommendation_note` | blocks | MIGRATED | `recommendations.note jsonb` (`0029:41`) + `richNoteSchema` (`explorersRichNoteContract.ts`) |
| `user_rating` | integer | MIGRATED | `recommendations.user_rating smallint CHECK BETWEEN 1 AND 10` (`0029:41`) |
| `is_pinned` default false | boolean | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | integer | MIGRATED | `category_recommendation_pins.position` (`0029:64`) |
| `display_order` default 0 | integer | MIGRATED | `collection_items.display_order` (`0029:52`) |
| **`screenshots`** | json | **MISSING** | `recommended-app@50b6c6e1`; same ceiling |
| `app_list` | relation m2o | MIGRATED | `collection_items.collection_id` (`0029:49`) |
| `app_category` | relation m2o | MIGRATED | `recommendation_taxonomy` (`0037:34`) |

**MIGRATED 8 · MISSING 8.** Ticket 4.3.

### 5.28 `recommended-book` — 28 fields · `recommended-book@50b6c6e1`

The only fully covered provider category besides movies. All 28 MIGRATED.

| Legacy field | Class | Canonical |
|---|---|---|
| `volume_id` **required** | MIGRATED | `entity_identifiers` PK`(provider,external_kind,external_id)`, `provider` CHECK admits `'google_books'` (`0029:14-20`) |
| `title` **required** | MIGRATED | `entities.title` (`0029:5`) |
| `subtitle` | MIGRATED | `book_entity_details.subtitle` (`0034:4`; `explorersSchema.ts:186`) |
| `authors` | MIGRATED | `.authors text[] NOT NULL DEFAULT '{}'` |
| `publisher` | MIGRATED | `.publisher` |
| `published_date` | MIGRATED | `.published_date_text` |
| `year` | MIGRATED | `.year_text` |
| `description` | MIGRATED | `.description` |
| `cover_url` | MIGRATED | `.cover_url` |
| `cover_url_large` | MIGRATED | `.cover_large_url` |
| `subjects` | MIGRATED | `.subjects text[]` |
| `page_count` | MIGRATED | `.page_count` |
| `isbn_13` | MIGRATED | `.isbn_13` |
| `isbn_10` | MIGRATED | `.isbn_10` |
| `google_rating` | MIGRATED | `.provider_rating numeric(3,2)` |
| `ratings_count` | MIGRATED | `.ratings_count` |
| `language` | MIGRATED | `.language_tag` |
| `preview_link` | MIGRATED | `.preview_url` |
| `user_recommendation_note` | MIGRATED | `recommendations.note` (`0029:41`) |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |
| `buy_links` | MIGRATED | `book_recommendation_context.buy_links jsonb NOT NULL DEFAULT '[]'` (`0034:12`) |
| `is_pinned` | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | MIGRATED | `.position` |
| `display_order` | MIGRATED | `collection_items.display_order` (`0029:52`) |
| `Media` | MIGRATED | `recommendation_media` (`0029:82`) + `recommendation_book_covers(recommendation_id,slot)` (`0035:4`) |
| `media_details` | MIGRATED | `media_assets.alternative_text/caption/width_px/height_px` (`0024:1`) |
| `book_list` | MIGRATED | `collection_items` (`0029:49`) |
| `book_categories` | MIGRATED | `recommendation_taxonomy` (`0037:34`) |

**MIGRATED 28.**

### 5.29 `recommended-game` — 27 fields · `recommended-game@50b6c6e1`

The largest MISSING cluster. `GameProviderFacts` is a fully typed 18-field contract at `tunes/shared/explorersGameContract.ts` (the `GameProviderFacts` type declaration), but **no `game_entity_details` table exists in any of the 38 migrations** — `grep -rli game_entity_details tunes/migrations tunes/shared` returns nothing.

| Legacy field | Class | Canonical / consequence |
|---|---|---|
| `igdb_id` **required** | MIGRATED | `entity_identifiers`, `provider` CHECK admits `'igdb'` (`0029:16`) |
| **`igdb_slug`** | **MISSING** | `recommended-game@50b6c6e1`; typed as `GameProviderFacts.slug` but no column |
| `title` **required** | MIGRATED | `entities.title` (`0029:5`) |
| **`igdb_image_id`** | **MISSING** | typed `coverImageId`; no column |
| **`cover_url`** | **MISSING** | no column |
| **`cover_url_large`** | **MISSING** | no column |
| **`summary`** | **MISSING** | typed `summary`; no column |
| **`release_date`** | **MISSING** | typed `firstReleaseDate` + a full `GameReleaseFact` precision model; no column |
| **`release_year`** | **MISSING** | no column |
| **`igdb_rating`** | **MISSING** | typed `providerRating`; no column |
| **`igdb_rating_count`** | **MISSING** | typed `ratingsCount`; no column |
| **`genres`** | **MISSING** | typed `genres`; no `game_entity_details`, and no games provider-genre bridge (`0037:31` is movies-only) |
| **`platforms`** | **MISSING** | typed `platforms`; no column |
| **`developer`** | **MISSING** | typed `developer`; no column |
| **`publisher`** | **MISSING** | typed `publisher`; no column |
| **`game_modes`** | **MISSING** | typed `gameModes`; no column |
| **`screenshot_ids`** | **MISSING** | typed `screenshotIds`; no column |
| **`igdb_url`** | **MISSING** | typed `providerUrl` with an `https://www.igdb.com/games/<slug>` guard; no column |
| `user_recommendation_note` | MIGRATED | `recommendations.note` (`0029:41`) |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |
| `is_pinned` default false | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | MIGRATED | `.position` |
| `display_order` | MIGRATED | `collection_items.display_order` (`0029:52`) |
| `Media` | MIGRATED | `recommendation_media` (`0029:82`) |
| `media_details` | MIGRATED | `media_assets` (`0024:1`) |
| `game_list` | MIGRATED | `collection_items` (`0029:49`) |
| `game_categories` | MIGRATED | `recommendation_taxonomy` (`0037:34`, `'games'` at `:35`) |

**MIGRATED 10 · MISSING 17.** Consequence: a Games recommendation can be created and ordered, but **every provider fact about the game is unstorable** — the only surviving provider data is the IGDB identifier. The typed contract makes this especially easy to mistake for parity. Ticket 4.2.

### 5.30 `recommended-movie` — 24 fields · `recommended-movie@50b6c6e1`

All 24 MIGRATED.

| Legacy field | Class | Canonical |
|---|---|---|
| `tmdb_id` **required** | MIGRATED | `entity_identifiers`, `provider` CHECK admits `'tmdb'` (`0029:16`) |
| `media_type` **required** enum `[Movie,Show,TV]` | MIGRATED | `movie_entity_details.media_type CHECK IN('movie','tv')` (`0037:6`) — three→two collapse recorded in §4.3 |
| `title` **required** | MIGRATED | `entities.title` (`0029:5`) |
| `original_title` | MIGRATED | `movie_entity_details.original_title` (`0037:6`) |
| `year` | MIGRATED | `.year_text` (`0037:6`) |
| `poster_path` | MIGRATED | `.poster_url` (`0037:6`) |
| `backdrop_path` | MIGRATED | `.backdrop_url` (`0037:6`) |
| `genres` | MIGRATED | `.genres text[] CHECK cardinality<=32` (`0037:7`) + `movie_entity_provider_genres(entity_id,position)` (`0037:13`) |
| `director` | MIGRATED | `.director` (`0037:7`) |
| `runtime` | MIGRATED | `.runtime_minutes CHECK>=0` (`0037:7`) |
| `tmdb_rating` | MIGRATED | `.provider_rating numeric(4,2) CHECK BETWEEN 0 AND 10` (`0037:8`) |
| `overview` | MIGRATED | `.overview` (`0037:8`) |
| `season_count` | MIGRATED | `.season_count CHECK>=0` + `CHECK(media_type='tv' OR season_count IS NULL)` (`0037:8,10`) |
| `user_recommendation_note` | MIGRATED | `recommendations.note` (`0029:41`) |
| `watch_providers` | MIGRATED | `.watch_providers jsonb` object `CHECK` (`0037:9`) + `movie_recommendation_context.region`/`selected_provider_ids` (`0037:42-45`) |
| `is_pinned` default false | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | MIGRATED | `.position` |
| `display_order` | MIGRATED | `collection_items.display_order` (`0029:52`) |
| `media_details` | MIGRATED | `media_assets` (`0024:1`) |
| `Media` | MIGRATED | `recommendation_media` (`0029:82`) + `recommendation_movie_media` with immutable source binding (`0038:4`) |
| `movie_list` | MIGRATED | `collection_items` (`0029:49`) |
| `movie_categories` | MIGRATED | `recommendation_taxonomy` (`0037:34`); legacy m2o cardinality not cloned (`revised-direction.md:48`) |
| `cast_details` | MIGRATED | `.cast_details jsonb` array `CHECK len<=200` (`0037:9`) + `recommendation_movie_media.person_id/credit_id/cast_ordinal` (`0038:4`) |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |

**MIGRATED 24.**

### 5.31 `recommended-person` — 17 fields · `recommended-person@50b6c6e1`

| Legacy field | Class | Canonical / consequence |
|---|---|---|
| `name` **required** | MIGRATED | `entities.title` (`0029:5`); `entities.kind` admits `'person'` (`0029:4`) |
| **`username_handle`** | **MISSING** | `recommended-person@50b6c6e1`; no `person_entity_details`, and manual resolve is `{title}`-only (`explorersContract.ts:87`), rejected on read at `publicContent.ts:34` |
| **`headline`** | **MISSING** | same |
| **`location`** | **MISSING** | same |
| **`avatar_path`** | **MISSING** | same |
| **`primary_platform`** enum default linkedin | **MISSING** | same; the account-level `socialLinkSchema.platform` enum (`explorersContract.ts:141`) is the owner's own links, not a recommended person's |
| **`social_urls`** | **MISSING** | same. Note `revised-direction.md:27` explicitly keeps "the People feature's external follower-count field … ordinary profile metadata", so this cluster is **not** covered by the community exclusion |
| **`skills_tags`** | **MISSING** | same |
| `user_recommendation_note` | MIGRATED | `recommendations.note` (`0029:41`) |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |
| `is_pinned` default false | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | MIGRATED | `.position` |
| `display_order` default 0 | MIGRATED | `collection_items.display_order` (`0029:52`) |
| `Media` | MIGRATED | `recommendation_media` (`0029:82`) |
| `media_details` | MIGRATED | `media_assets` (`0024:1`) |
| `person_list` | MIGRATED | `collection_items` (`0029:49`) |
| `people_category` | MIGRATED | `recommendation_taxonomy` (`0037:34`) |

**MIGRATED 10 · MISSING 7.** Ticket 4.5.

### 5.32 `recommended-place` — 20 fields · `recommended-place@50b6c6e1`

| Legacy field | Class | Canonical / authority / consequence |
|---|---|---|
| **`Place_Details`** | **MISSING** | `recommended-place@50b6c6e1`. No `place_entity_details` table. `entity_identifiers.provider` admits `'google_places'` (`0029:16`) so the *identifier* has a home, but the place payload (address, coordinates, hours, types, photos) does not. The `{title}`-only manual ceiling applies (`explorersContract.ts:87`; `publicContent.ts:34`). Note `creator_accounts.profile_place_details` (`0022:80`) is the **account's own** place, not a recommended one. |
| **`Contact_Name`** | **MISSING** | `recommended-place@50b6c6e1`; same ceiling |
| **`Contact_Number`** | **MISSING** | same |
| `recommendation_category` relation o2o | MIGRATED | `recommendation_taxonomy` (`0037:34`); cardinality change authorized `revised-direction.md:48` |
| **`Places_Social_Link`** | **MISSING** | `recommended-place@50b6c6e1`; same ceiling |
| **`Places_Website`** | **MISSING** | same |
| `Users_Place_Note` blocks | MIGRATED | `recommendations.note jsonb` (`0029:41`) |
| **`Users_Social_URL`** | **MISSING** | `recommended-place@50b6c6e1`; same ceiling |
| `Media` multiple | MIGRATED | `recommendation_media` (`0029:82`) |
| `media_details` | MIGRATED | `media_assets` (`0024:1`) |
| `supporters` json | DROPPED-AUTHORIZED | `revised-direction.md:53` ("supporter model not automatically rebuilt"); `identity-platform.md:17` |
| **`Source_Of_Recommendation`** enum `[self,suggestion]` | **MISSING** | `recommended-place@50b6c6e1`. `entities.origin CHECK IN('provider','manual')` (`0029:6`) is catalog provenance, not *who suggested the recommendation*. Consequence: self vs suggested places become indistinguishable. |
| `recommendation_list` relation m2o | MIGRATED | `collection_items` (`0029:49`) |
| `recommendation_sub_category` relation o2o | MIGRATED | `recommendation_taxonomy` over `taxonomy_terms.parent_id` (`0037:20,34`) |
| `supporter` relation o2o | DROPPED-AUTHORIZED | `revised-direction.md:53` |
| `user_recommendation_note` richtext | MIGRATED | `recommendations.note` (`0029:41`) |
| `Recommendation_Type` enum `[place,person]` | MIGRATED | `entities.kind CHECK` (`0029:4`); `catalogKindSchema` (`explorersContract.ts:29`) |
| **`Person_Details`** json | **MISSING** | `recommended-place@50b6c6e1`; the person variant of a place recommendation has no payload destination |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |
| **`google_rating`** decimal | **MISSING** | `recommended-place@50b6c6e1`; no `place_entity_details.provider_rating` (books and movies both have one — `0034:4`, `0037:8`) |

**MIGRATED 9 · DROPPED-AUTHORIZED 2 · MISSING 9.** Ticket 5.1.

### 5.33 `recommended-product` — 17 fields · `recommended-product@50b6c6e1`

| Legacy field | Class | Canonical / consequence |
|---|---|---|
| **`product_url`** **required** | **MISSING** | `recommended-product@50b6c6e1`; no `product_entity_details`; `{title}`-only ceiling (`explorersContract.ts:87`; `publicContent.ts:34`). A **required** legacy field with no slot. |
| `title` **required** | MIGRATED | `entities.title` (`0029:5`) |
| **`brand`** | **MISSING** | same ceiling |
| **`price`** decimal | **MISSING** | same; no price/currency pair anywhere in the 38 migrations |
| **`currency`** | **MISSING** | same |
| **`buy_url`** | **MISSING** | same |
| **`logo_url`** | **MISSING** | same |
| **`description`** | **MISSING** | same |
| **`specifications`** json | **MISSING** | same |
| `user_recommendation_note` | MIGRATED | `recommendations.note` (`0029:41`) |
| `user_rating` | MIGRATED | `recommendations.user_rating` (`0029:41`) |
| `is_pinned` default false | MIGRATED | `category_recommendation_pins` (`0029:64`) |
| `pin_order` | MIGRATED | `.position` |
| `display_order` default 0 | MIGRATED | `collection_items.display_order` (`0029:52`) |
| **`images`** json | **MISSING** | same ceiling |
| `product_list` | MIGRATED | `collection_items` (`0029:49`) |
| `product_category` | MIGRATED | `recommendation_taxonomy` (`0037:34`) |

**MIGRATED 8 · MISSING 9.** Ticket 4.4.

### 5.34 `song-limit` — 3 fields · `song-limit@50b6c6e1`

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| **`username`** | string | **MISSING** | the quota subject has no canonical key |
| **`song_requests`** | integer | **MISSING** | live consumer: `explorers-earth/src/features/Settings/components/BillingTab.tsx:153,256,259`, `src/pages/Checkout.tsx:314`. Guest song-request quota becomes unenforceable. |
| **`ai_guide_requests`** | integer default 0 | **MISSING** | live consumer: `BillingTab.tsx:154,256`; `explorers-earth/src/hooks/useAIGuideQuota.ts`. AI-guide quota becomes unenforceable. |

**MISSING 3.** `revised-direction.md:25` defers **monetization**, which covers plan/billing surfaces. A per-user request counter is an **operational abuse control**, not a billing surface, and `revised-direction.md:18` requires Music functionality be preserved "with no … deliberate feature reduction". No citation covers dropping it. §7.6.

### 5.35 `subscription-plan-base` — 9 fields · `subscription-plan-base@50b6c6e1`

`plan_name`, `cost`, `songs_quota`, `features`, `duration`, `plan_code`, `feature_control`, `max_devices`, `ai_guide_quota` — all **DROPPED-AUTHORIZED 9** by `revised-direction.md:25` ("Monetization | Deferred; do not rebuild retired billing/integration surfaces simply because files exist"), `:53` and `identity-platform.md:17`.

### 5.36 `supporter` — 2 fields · `supporter@50b6c6e1`

`recommended_place`, `accounts` — **DROPPED-AUTHORIZED 2** (`revised-direction.md:53`; `identity-platform.md:17`).

### 5.37 `unsubscribe` — 3 fields · `unsubscribe@50b6c6e1`

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| **`email`** | email **required, unique** | **MISSING** | **The only `unique:true` field in the entire legacy app outside `up_users`.** This is an email **suppression list**. Resend is the configured mail provider (`revised-direction.md:51`). Dropping it silently means previously-unsubscribed recipients are mailable again on day one: a consent/legal exposure (CAN-SPAM / GDPR-style opt-out persistence) and a deliverability exposure (complaint-rate damage to the sending domain). |
| **`feedback`** | string | **MISSING** | unsubscribe reason lost |
| **`unsubscribedAt`** | datetime | **MISSING** | no proof-of-opt-out timestamp |

No canonical table, column, route, contract or test. **MISSING 3.** §7.1 — the single highest-consequence undecided item in this register.

### 5.38 `user-subscription-plan` — 7 fields · `user-subscription-plan@50b6c6e1`

`user_id`, `start_date`, `end_date`, `plan_id`, `razorpay_sub_id`, `razorpay_plan_id`, `razorpay_customer_id` — all **DROPPED-AUTHORIZED 7** (`revised-direction.md:25,53`; `identity-platform.md:17`).

### 5.39 `up_users` (`plugin::users-permissions.user`) — 21 fields · `users-permissions/user@50b6c6e1`

| Legacy field | Type | Class | Canonical / authority / consequence |
|---|---|---|---|
| `username` | string **unique** min3 | MIGRATED | `creator_accounts.handle_key` unique (`0022:65,101`) + handle `CHECK` (`0022:87-88`) |
| `email` | email **required** min6 | MIGRATED | `auth_user.email NOT NULL` + `auth_user_email_unique` (`0022:6,11`) |
| `provider` | string | MIGRATED | `auth_account.provider_id` (`0022:29`) + `auth_account_provider_subject_uq UNIQUE(provider_id,account_id)` (`0022:43`) — keyed by provider subject, as `revised-direction.md:89` requires |
| `password` | password private | DROPPED-AUTHORIZED | `revised-direction.md:19` (Google-only), `:89`; `identity-platform.md:17` |
| `resetPasswordToken` | string private | DROPPED-AUTHORIZED | same |
| `confirmationToken` | string private | DROPPED-AUTHORIZED | same |
| `confirmed` | boolean default false | MIGRATED | `auth_user.email_verified NOT NULL DEFAULT false` (`0022:7`) |
| `blocked` | boolean default false | MIGRATED | `user_security_state.blocked_at` (`0022:57`) + `creator_accounts.status='suspended'` with `creator_accounts_suspended_valid` (`0022:93,98`) |
| `role` | relation m2o → role | **UNVERIFIED** | `account_memberships.role text NOT NULL DEFAULT 'owner' CHECK (role='owner')` (`0022:108`) is a single-valued membership role. The legacy users-permissions **role graph and its permission grants are administrator-configured in a deployed database** and cannot be read from this source; `revised-direction.md:63` states exactly this and directs defining a new explicit authorization matrix. Classified UNVERIFIED, not MIGRATED. |
| `mobile_number` | string | MIGRATED | `creator_accounts.mobile_number` (`0022:73`) |
| `mobile_number_visibility` | string | MIGRATED | `creator_accounts.mobile_number_visible boolean` (`0022:74`) — string→boolean normalization |
| `Language_preference` | string | MIGRATED | `creator_accounts.locale` (`0022:72`) |
| `accounts` | relation m2m → account | MIGRATED | `account_memberships` (`0022:105`) |
| `Language_Choice` | string default "en" | MIGRATED | `creator_accounts.locale NOT NULL DEFAULT 'en'` (`0022:72`); write-constrained to `["en","hi"]` (`explorersContract.ts:202`) |
| `is_subscribed` | boolean default false | DROPPED-AUTHORIZED | `revised-direction.md:25` |
| `razorpay_customer_id` | string | DROPPED-AUTHORIZED | `revised-direction.md:25` |
| **`instagramUserId`** | string | **MISSING** | `users-permissions/user@50b6c6e1`. `profile_feed_items.source` admits `'instagram'` (`0024:59`) so imported *items* have a home, but **the linked Instagram account itself has none** |
| **`instagramUsername`** | string | **MISSING** | same |
| **`instagramAccountType`** | string | **MISSING** | same |
| **`instagramAccessToken`** | **text** | **MISSING** | `users-permissions/user@50b6c6e1`. Consequence: the Instagram OAuth connection cannot be persisted, so Instagram feed import cannot be re-run or refreshed after first authorization. Note `auth_account` already holds `access_token`/`refresh_token`/`scope`/`access_token_expires_at` (`0022:31-36`) — a non-Google provider row **could** be the destination, but `revised-direction.md:19` sets Google-only sign-in and `identity-platform.md` records implicit provider linking as **disabled**, so nothing authorizes using it. §7.3 |
| `movie_lists` | relation o2m (malformed) | DROPPED-AUTHORIZED | `revised-direction.md:49` — "Treat as schema inconsistency to exclude, not as a second valid ownership path" |

**MIGRATED 10 · DROPPED-AUTHORIZED 6 · MISSING 4 · UNVERIFIED 1.**

### 5.40 `verify-claim` — 5 fields · `verify-claim@50b6c6e1`

| Legacy field | Type | Class | Consequence |
|---|---|---|---|
| **`Email`** | email | **MISSING** | |
| **`Phone`** | string | **MISSING** | |
| **`Message`** | text | **MISSING** | |
| **`Attachment`** | media multiple | **MISSING** | claim evidence documents have no storage slot |
| **`Name`** | string | **MISSING** | |

No canonical claim-verification table, service or route. **MISSING 5.** §7.4 / ticket 5.4.

## 6. Reading guide: what the MISSING column is really measuring

Two structural ceilings produce most of the 122 MISSING rows, and both are *deliberate design*, not oversights — which is precisely why they need a decision rather than a bug fix:

1. **The `{title}`-only manual-entity ceiling.** `resolveManualEntitySchema` accepts `details: { title }` and nothing else, `.strict()` (`tunes/shared/explorersContract.ts:87`). `createRecommendationSchema` enforces, for every category that is not `books` or `movies`, `Object.keys(v.displayOverrides ?? {}).every(k => k === 'title')` (`:69`). The public read path enforces the same invariant and fails closed: `tunes/server/application/publicContent.ts:34` throws `PublicContentFailure(400)` on any non-`title` override key outside books/movies. So Apps, Products, People and Places can carry **a title and nothing else** until a typed `*_entity_details` table is added, exactly as books (`0034`) and movies (`0037`) have.

2. **No per-category details table for games, places, apps, products or people.** Only `book_entity_details` (`0034:4`) and `movie_entity_details` (`0037:4`) exist. `entity_identifiers.provider` already admits `'igdb'` and `'google_places'` (`0029:16`), so provider identity is solved for games and places; only the facts payload is absent.

Neither ceiling is a defect. Both mean **"the category's typed metadata ticket has not landed"** — and the register's job is to make sure nobody reads "the schema exists" as "the fields survive".

## 7. Items needing a product decision from the repository owner

Each of these is **MISSING with no authorization record**. They are ordered by consequence, not by size.

### 7.1 `unsubscribe` — the email suppression list

**DECIDED 2026-10-08 — in scope.** Build it, on Resend (already the provider).
See [owner decisions](owner-decisions-2026-10-08.md#d2--unsubscribe-on-resend).

**Evidence.** `unsubscribe@50b6c6e1`: `email` is `type:"email", required:true, unique:true` — **the only `unique:true` attribute in the entire legacy app outside `up_users`** (mechanically confirmed: exactly 2 `unique:true` attributes across all 401). Plus `feedback` and `unsubscribedAt`. No canonical table, column, route, contract or test exists.

**Why it is a decision and not a ticket.** Resend is the configured mail provider (`revised-direction.md:51`). A fresh database with no suppression list means every previously-unsubscribed address becomes mailable on launch day. That is an opt-out-persistence exposure (consent withdrawal does not expire with a backend migration) and a deliverability exposure (complaint rate degrades the sending domain). "No existing users to migrate" (`revised-direction.md:13`) authorizes starting with **zero rows**; it does not authorize having **no table**, because new unsubscribes must still be recorded and honored from the first email sent.

**Recommendation.** Decide to carry a canonical suppression table (`email` citext-unique, `reason`, `unsubscribed_at`, `source`) as part of the first mail-sending ticket, and treat it as launch-blocking for any outbound email. Explicitly record whether legacy suppression rows will be read-only-exported once before Strapi retirement — the only item in this register where a selective row read may be warranted despite the no-import decision.

**Owner.** Product owner for the opt-out policy decision; ticket **7.2** for the canonical table and route.

### 7.2 Per-field i18n localization on `account`, `faq`, `platform-term`, `recommendation-category`

**DECIDED 2026-10-08 — per-field `account` i18n dropped**; frontend UI i18n is
unaffected and the `locale` enum widens. See
[owner decisions](owner-decisions-2026-10-08.md#d7--per-field-account-i18n-dropped).

**Evidence.** Legacy localizes 4 types; per-field `pluginOptions.i18n.localized` appears on **19** `account` attributes (including `username`, `Account_Name`, `Bio`, `Bio_1`, `Primary_Address`, `Public_Profile_Address`, `social_media`, `profile_picture`, `bg_picture`, `Account_Type`, and four `public_*` flags), 3 on `faq`, 3 on `platform-term`, 1 on `recommendation-category`. Canonical has exactly **one** locale column — `creator_accounts.locale` (`0022:72`), write-constrained to `["en","hi"]` (`explorersContract.ts:202`) — plus a genuine translation table **only** for taxonomy (`taxonomy_term_translations`, `0037:24-26`).

**Why it is a decision.** `revised-direction.md:47` says "Preserve existing language/UI behavior and inspect locale-dependent responses; no need to invent a new multilingual authoring UI." That is an **instruction to preserve**, plus relief from building an authoring UI. It is *not* authorization to collapse 19 localized account fields and 6 localized content fields into a single per-account locale. Nothing else in the planning package addresses it.

**Recommendation.** Confirm explicitly that per-field localization is out of scope for launch (most likely correct — one account, one locale, and the 19 flags are plausibly Strapi defaults rather than used features), and record that decision **in this register** so the drop becomes DROPPED-AUTHORIZED. Separately decide FAQ and legal content localization, which is more likely to be real: those are published pages, not user data. Before deciding, a read-only locale-dependent response inspection against the live Strapi (as `:47` instructs) would establish whether more than one locale actually has rows.

**Owner.** Product owner for the scope decision; tickets **2.3/2.4** for the account side, **7.2** for FAQ/legal.

### 7.3 Instagram OAuth token storage and `recommendation_list.Instagram_Media_URL`

**DECIDED 2026-10-08 — dropped for launch.** A live Instagram UI still points at the
already-tombstoned `/api/instagram` and needs its own scope call. See
[owner decisions](owner-decisions-2026-10-08.md#d6--instagram-import-dropped-for-launch).

**Evidence.** `users-permissions/user@50b6c6e1`: `instagramUserId`, `instagramUsername`, `instagramAccountType`, `instagramAccessToken` (`type:"text"`). `recommendation-list@50b6c6e1`: `Instagram_Media_URL`. Canonical: `profile_feed_items.source` admits `'instagram'` (`0024:59`) and the DTO carries it (`explorersContract.ts:152`), so imported items have a home — but there is no linked-account or token storage, and no list-level social URL column. `Instagram_Media_URL` is **live in the current frontend**: written at `explorers-earth/src/features/Favorites/hooks/useCreateLocation.ts:147`, read at `features/Favorites/api/query.ts:29` and `api/mutation.ts:6,68`.

**Why it is a decision.** Without token storage, Instagram feed import works exactly once, at the moment of authorization, and can never refresh. `auth_account` already has `access_token`/`refresh_token`/`scope`/`access_token_expires_at` (`0022:31-36`), so the storage shape exists — but `revised-direction.md:19` sets Google-only sign-in and implicit provider linking is disabled, so using it is a policy change, not an implementation detail. Separately, `Instagram_Media_URL` is an **in-use authoring field** that will silently lose its value.

**Recommendation.** Decide (a) whether Instagram import is in launch scope at all — if not, record it as DROPPED-AUTHORIZED and remove the live write path in the same change so the field does not keep accepting data that goes nowhere; and (b) if it is in scope, add a non-login provider-connection table rather than reusing `auth_account`. Independently, give `Instagram_Media_URL` a destination (a `collections` social-link column or `account_presentation.social_links` at list scope), because it is live today.

**Owner.** Product owner for Instagram scope; ticket **5.1/5.2** for the list-level URL; ticket **7.1** for the feed consumer.

### 7.4 The whole claim flow — `claimable-place-profile`, `verify-claim`, `account.Is_Claimable`

**DECIDED 2026-10-08 — dropped, and removed in `7399cfe1`.** `Is_Claimable` and
`claimable_place_profile` are DROPPED-AUTHORIZED. See
[owner decisions](owner-decisions-2026-10-08.md#d4--the-claim-flow-is-dropped).

**Evidence.** 12 + 5 + 1 = **18 fields, all MISSING**, with zero canonical surface (`grep -rli 'claimable\|verify_claim' tunes/migrations tunes/shared` → nothing). The live frontend still carries the flow: `explorers-earth/src/features/Favorites/services/claimablePlaceProfileService.ts`, `features/Authentication/components/PlaceProfileCard.tsx`, `features/Authentication/api/queries.ts`, `features/Favorites/api/mutation.ts`, `features/Favorites/hooks/useAddRecommendation.ts`. Notably, `account.Is_Claimable` and `claimable-place-profile.Is_Claimed` have **zero references anywhere in the live codebase**.

**Why it is a decision.** `revised-direction.md:27` says "'Preserve everything' … does not mean restoring previously retired endpoints or implementing unused Strapi models" — but the claim flow is **not unused**: it has live frontend services and an authentication-surface card. Nothing in the planning package excludes it. Meanwhile the safety invariant "a pending claim must not grant ownership" has nowhere to be enforced, because `Is_Claimed` has no canonical column.

**Recommendation.** Decide whether claims ship at launch. If yes, ticket 5.4 needs a migration plus the explicit ownership-fencing test. If no, record the exclusion here **and** retire the live frontend services in the same change — leaving a claim UI that cannot be served is worse than removing it, because a user who submits a claim gets silence.

**Owner.** Product owner for launch scope; ticket **5.4** for implementation.

### 7.5 Residual unaccounted fields — `account.profile_place_media_details`, `account.localtunes_public`, `recommendation_list.List_Name_Details`

**PARTLY DECIDED 2026-10-08.** `profile_place_media_details` is DROPPED-AUTHORIZED;
`localtunes_public` maps onto `account_category_settings` for `music` and its unread
typed field is removed. **`List_Name_Details` is still open** — three live readers.
See [owner decisions](owner-decisions-2026-10-08.md#d8--two-resolved-one-still-open).

**Evidence and live status differ sharply across the three, which is why they need separate answers:**

| Field | Legacy | Live consumers found | Consequence |
|---|---|---|---|
| `account.profile_place_media_details` | `account@50b6c6e1`, json, localized | **none** (searched `explorers-earth/src`, `explorers-earth/e2e`, `tunes/server`, `tunes/shared`, `tunes/client`) | likely dead; drop is probably safe but is undecided |
| `account.localtunes_public` | `account@50b6c6e1`, string | **yes** — typed field at `explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx:46` | the public profile's LocalTunes link/flag loses its source. `socialLinkSchema.platform` admits `"localTunes"` (`explorersContract.ts:142`) — a plausible destination that nothing maps |
| `recommendation_list.List_Name_Details` | `recommendation-list@50b6c6e1`, json | **yes, three components** — `src/components/CircularPlacesModal.tsx:12,275` (reads `.thumbnail`), `src/components/ShareModal.tsx:314` (share-card background), `src/components/ui/AddLocationModal.tsx:144` (extracts `place_id`) | list thumbnails and the share-card background lose their source; the share card falls back to a hard-coded Unsplash image |

**Recommendation.** Confirm `profile_place_media_details` is dead and record it as DROPPED-AUTHORIZED. Map `localtunes_public` onto `account_presentation.social_links` with `platform:"localTunes"` and record that mapping. Give `List_Name_Details` a typed destination — a `collection_media` thumbnail slot plus a `place_id` on the places collection — because three live components read it and one of them is the public share surface.

**Owner.** Product owner for the `profile_place_media_details` confirmation; ticket **7.1** for `localtunes_public`; ticket **5.1/5.2** for `List_Name_Details`.

### 7.6 `song-limit` — song and AI-guide request quotas

**DECIDED 2026-10-08.** No AI features (removed in `76224913`; they were already
unserved). Song/YouTube requests cap at **100 per creator per month**, surface
labelled beta. The AI-guide half of this table has no remaining consumer. See
[owner decisions](owner-decisions-2026-10-08.md#d1--no-ai-and-the-measurement-changed-the-job).

**Evidence.** `song-limit@50b6c6e1`: `username`, `song_requests`, `ai_guide_requests` (default 0) — all MISSING, no canonical counter table. Live consumers: `explorers-earth/src/features/Settings/components/BillingTab.tsx:153,154,256,259`, `src/pages/Checkout.tsx:314`, `src/hooks/useAIGuideQuota.ts`.

**Why it is a decision.** `revised-direction.md:25` defers **monetization** — plan catalogs, Razorpay, billing surfaces. A per-user request counter is an **abuse/cost control**, not a billing surface, and `revised-direction.md:18` requires Music be preserved with no "deliberate feature reduction". With no counter, guest song requests and AI guide generation are effectively unlimited on launch day, which is a direct cost exposure on the AI and YouTube API paths.

**Recommendation.** Decide whether launch ships with quota enforcement. If yes, a small canonical counter keyed on `account_id` belongs in the Music identity work, independent of billing. If no, record the exclusion **and** state the accepted cost exposure explicitly, because the frontend currently displays quota numbers that would become fictional.

**Owner.** Product owner for the exposure decision; Music identity writer (ticket **6.1**) for the counter if in scope.

### 7.7 Taxonomy seed rows (decision: which values)

**Evidence.** `taxonomy_terms` (`0037:18`) and `taxonomy_term_translations` (`0037:24`) exist and admit all eight content categories. **No rows exist.** `revised-direction.md:55` is explicit: "The schema exports contain **structure, not seed rows**. Category names, FAQ/terms content and reasons-for-leaving values cannot be recovered from type definitions alone. Before acceptance, create explicit reviewed seed fixtures from product requirements or a selective read-only reference-data export."

This is already authorized as *work*; what is undecided is **the content**. Needed: recommendation category and sub-category names (and their `hi` translations if §7.2 keeps localization), book subjects, game genres, people categories, app and product categories, guide categories, FAQ question/answer text, and the terms/privacy/cookie bodies.

**Recommendation.** Treat the seed values as a product input, not an engineering decision; `revised-direction.md:55` explicitly permits a **selective read-only reference-data export** from the live Strapi as the source, which is the lowest-risk path and does not contradict the no-import decision.

**Owner.** Product owner for the values; owning category tickets plus **7.2** for the seed mechanism (see §9).

## 8. Which ticket owes each MISSING cluster

| MISSING cluster | Size | Owning ticket | What the ticket must add that it does not currently say |
|---|---|---|---|
| **Games provider facts** — `igdb_slug`, `igdb_image_id`, `cover_url`, `cover_url_large`, `summary`, `release_date`, `release_year`, `igdb_rating`, `igdb_rating_count`, `genres`, `platforms`, `developer`, `publisher`, `game_modes`, `screenshot_ids`, `igdb_url`, plus `game-category.igdb_genre_id` | **17** | **4.2** (Games) | A **`game_entity_details` migration**. The typed `GameProviderFacts` contract exists in full at `tunes/shared/explorersGameContract.ts`, but no such table exists in any of the 38 migrations. The typed contract makes the gap easy to mistake for parity. A games provider-genre bridge is also needed: `movie_provider_genre_terms` is pinned `CHECK(category='movies')` (`0037:31`). |
| **Apps typed metadata** — `app_url` (required), `description`, `logo_url`, `developer`, `platforms`, `price_tier` (required, defaulted), `download_url`, `screenshots` | **8** | **4.3** (Apps & Tools) | An `app_entity_details` migration **and** a contract change: manual resolve accepts `details:{title}` only (`explorersContract.ts:87`), `createRecommendationSchema` rejects any non-`title` override for non-books/movies (`:69`), and `publicContent.ts:34` fails the read closed. Without both, an Apps recommendation can only ever carry a title. |
| **Products typed metadata** — `product_url` (required), `brand`, `price`, `currency`, `buy_url`, `logo_url`, `description`, `specifications`, `images` | **9** | **4.4** (Products) | Same pair, plus a decision on money representation — nothing in the 38 migrations stores a price/currency. |
| **People typed metadata** — `username_handle`, `headline`, `location`, `avatar_path`, `primary_platform`, `social_urls`, `skills_tags` | **7** | **4.5** (People) | Same pair. Note `revised-direction.md:27` explicitly keeps the external follower-count field in scope as ordinary profile metadata, so this cluster is **not** covered by the community exclusion. |
| **Places typed metadata** — `Place_Details`, `Person_Details`, `Contact_Name`, `Contact_Number`, `Places_Social_Link`, `Places_Website`, `Users_Social_URL`, `Source_Of_Recommendation`, `google_rating` | **9** | **5.1** (Places and taxonomy) | A `place_entity_details` migration + the same contract change. `entity_identifiers.provider` already admits `'google_places'` (`0029:16`), so provider identity is solved; only the facts payload is missing. |
| **Guides** — `guide` 13 + `guide-section` 14 | **27** | **5.3** (Guides and sections) | **A new migration is required before any guides row can exist, not just code.** `0029:25` admits `'guides'` in the `collections.category` CHECK, but `0029:40` (`recommendations.category`) and `0029:51` (`collection_items.category`) **omit it**. `recommendation_taxonomy` compounds this: its CHECK admits `'guides'` (`0037:35`) while its FK targets `recommendations(id,account_id,category)` (`0037:37`), which rejects it. So a guide collection is insertable but can hold nothing. Plus a `guide_sections` table and a second guide-level rich field. |
| **Claim flow** — `claimable-place-profile` 12 + `verify-claim` 5 + `account.Is_Claimable` 1 | **18** | **5.4** (Existing claim flow) | Tables, service, routes **and** migration — currently none exist. The "pending claim must not grant ownership" invariant needs a column to hang on. Gated on the §7.4 scope decision. |
| **Collection nesting** — `person-list.recommendation_list`, `product-list.recommendation_list`, `recommendation-list.person_lists`, `recommendation-list.product_lists` | **4** | **5.2** (Maps, QR and linked lists) | A parent/child edge on `collections` — the table has no `parent_id` (`0029:23-34`) and `createCollectionSchema` is `.strict()` with no parent field (`explorersContract.ts:60-62`). |
| **Reference content** — `faq` 3 + `platform-term` 3 + `book-category.description` 1 | **7** | **7.2** (Analytics and platform content) | A canonical content table with a locale dimension, a typed read route, seeds, and screen adapters. `page_contents` (`0001:205-215`) is unsuitable: it keys on `created_by`/`updated_by` FKs into the **legacy integer `users` table**, has no locale and no sequence. Live consumers are still GraphQL (`useFaqs.ts`, `usePlatformTerms.ts`, `pages/Terms.tsx`, `pages/Privacy.tsx`). |
| **Email suppression** — `unsubscribe` 3 | **3** | **7.2** + a product decision (§7.1) | A suppression table honored by the Resend path before any outbound email ships. |
| **Instagram linkage** — 4 `up_users` fields + `recommendation_list.Instagram_Media_URL` | **5** | **7.1** (shared navigation/profile) + product decision (§7.3) | Either a non-login provider-connection table, or an explicit exclusion plus removal of the live write path. |
| **Request quotas** — `song-limit` 3 | **3** | **6.1** (Music identity) + product decision (§7.6) | An account-keyed counter, independent of the deferred billing surfaces. |
| **Residual account/list fields** — `profile_place_media_details`, `localtunes_public`, `List_Name_Details` | **3** | **7.1** / **5.1** / **5.2** (§7.5) | Two of the three are live-consumed today. |
| **Taxonomy seed ROWS** (structure exists, zero rows) | not counted as fields | **owning category tickets** (4.2–4.5, 5.1, 5.3) for their own term sets, plus **7.2** for the seed mechanism and the FAQ/legal bodies | `revised-direction.md:55`; §7.7 |

Cross-check against the ticket index: 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4 and 7.2 are all recorded **NOT-STARTED** and 4.2 **INCOMPLETE** at this SHA (`docs/replatform-audit/ticket-index.md:42-49,54`). Every MISSING cluster therefore has an owner, and none has delivered.

## 9. Migration-history integrity

### 9.1 What is sound — verified first-hand at `225d83e5`

| Property | Verification performed | Result |
|---|---|---|
| Chain length and gap-freedom | Enumerated `tunes/migrations/*.sql`; parsed the four-digit prefixes | **38 files, `0001`–`0038`, gap-free, no duplicate IDs** |
| Contract agreement | Parsed `EXPECTED_MUSIC_MIGRATION_CHAIN` from `tunes/shared/music-migration-contract.ts` and compared the sorted sets | **Exact match, 38 = 38**, head `0038_explorers_movie_media` (`music-migration-contract.ts:1`) |
| Sequence enforcement | `tunes/server/db/migrate.ts:53-56` and `:64-70` reject a file whose index does not match its prefix | enforced |
| Duplicate-ID rejection | `migrate.ts:57-58` — `if (ids.size !== migrations.length) throw new Error("duplicate migration ID")` | enforced |
| Per-file sha256 | `migrate.ts:37` computes it, `:67-69` re-verifies the object, `:163-165` compares the journal row to the file and rejects a non-`^[a-f0-9]{64}$` value | enforced |
| Exact-chain pinning | `migrate.ts:72-74` rejects any ordering or membership difference from the contract | enforced |
| Journal monotonicity | `migrate.ts:154-167` rejects unknown-future rows and missing predecessors; `:201` additionally rejects **live schema drift** by comparing a six-query `pg_catalog` fingerprint (`:119-152`) to the stored `schema_checksum` | enforced |
| Append-only | For each of the 38 files, `git log --oneline -- <file>` (without `--follow`, which inflates counts via copy detection `C051`/`C052`/`C080`) | **every file is touched by exactly one commit** — append-only holds |
| Destructive DDL | Grepped all 38 files for `DROP TABLE`, `TRUNCATE`, `ALTER … DROP COLUMN` | **none.** The only `TRUNCATE` matches are `REVOKE … TRUNCATE` privilege statements (`0010:25,28`, `0011:83`, `0014:47`) |
| Historical `0001` ID collision | `git log --all -- 'tunes/migrations/0001_explorers*'` | **confirmed and corrected.** `0001_explorers_analytics_receipts.sql` existed (added `a6f77f8f`/`ed73f664`, modified `528b45dd`/`79fe14f6`), colliding with `0001_runtime_baseline.sql`; **deleted in `e5d05c66` "fix: preserve music migration contracts"** and now lives as `0021_explorers_analytics_receipts.sql`. Also confirmed: a drizzle-kit `tunes/migrations/meta/_journal.json` existed in history and **no longer exists** in the tree |

**Correction to the commissioning summary — where migrations actually run.** The claim "no migration runs on push or in PR CI — the only applier is reachable solely through the dispatch-gated production path" is **too strong as worded**, and this register records the verified version instead:

- `tunes/server/db/migrate.ts` **does** run in PR CI. `test.yml:89-91` starts a `postgres:15-alpine` service and `:123` runs the migration integration suite, including `server/test/migrations/music-migration.integration.test.ts`, which applies the full chain.
- That is safe, and provably bounded: `test.yml:104` pins `DATABASE_URL_TEST=postgresql://music_migrator:music@127.0.0.1:55432/music_fixture` and `test.yml:121` asserts that exact shape and **exits 5** on any deviation. `validateDisposableDatabaseTarget` (`migrate.ts:296-309`) independently refuses an ambient `DATABASE_URL`, refuses anything but `127.0.0.1:55432/music_fixture`, and requires the exact Compose project and an exact confirmation string. The browser fixture scripts add their own fences — `tunes/scripts/books-browser-fixture.ts:27-32` refuses `DATABASE_URL`, `DATABASE_URL_TEST`, `DOCKER_HOST`, `DOCKER_CONTEXT`, `GATE_PROD`, `MUSIC_DEPLOY_*` and `NODE_ENV=production`, then provisions a throwaway `music_uat_<runid>` database on a random loopback port.
- **The accurate statement:** no migration runs against any persistent or production database on push or in PR CI. The only applier with production authority is `tunes/server/deployment/run-migration-gate.ts`, reachable solely through the dispatch-gated production path (`tunes-deploy.yml:1-12`, `workflow_call` + `workflow_dispatch` only). In PR CI the applier runs exclusively against disposable loopback databases behind three independent target fences.

A separate, corroborated issue outside this register's scope: `tunes.yml:142` enumerates the in-image migration files only up to `0035`, so an image missing `0036`/`0037`/`0038` passes PR validation.

### 9.2 Watch item 1 — the account-purge function is re-declared in four migrations

`purge_explorers_account_content(uuid, uuid)` is declared and then **re-declared whole** four times:

| Declaration | Deleting body |
|---|---|
| `0029_explorers_recommendations.sql:143` (`CREATE FUNCTION`) | `0029:157-161` |
| `0031_explorers_content_revision.sql:161` (`CREATE OR REPLACE`) | `0031:180-184` |
| `0036_explorers_analytics_events.sql:60` (`CREATE OR REPLACE`) | `0036:79-85` |
| `0038_explorers_movie_media.sql:168` (`CREATE OR REPLACE`) | `0038:187-194` — **the live body** |

The newest body deletes `analytics_event_receipts` (retire-in-place), `analytics_events`, `collections`, `recommendation_movie_media`, `recommendations` and `account_category_pin_state` (`0038:187-194`), under a `status='pending_deletion'` gate (`0038:172-175`) and a matching running `delete` operation (`0038:181-186`), with per-category advisory locks taken in sorted order (`0038:178-180`).

**The risk.** Because the whole body is restated each time, adding a future account-owned table requires editing **the newest body** — nothing in the schema or the test suite couples the two. A new owned table added without that edit leaks rows past terminal account deletion, silently. Many current tables are protected only indirectly, by `ON DELETE CASCADE` on a composite ownership FK from `collections`/`recommendations` (e.g. `collection_items` `0029:54`, `recommendation_taxonomy` `0037:37`, `movie_recommendation_context` `0037:46`) — so the leak surface is precisely any new table that is **not** cascade-reachable from those two. `account_category_content_state` is already in that shape: it references `creator_accounts` with `ON DELETE RESTRICT` (`0031`; `explorersSchema.ts:168`) and is deliberately retained, which is correct but makes the distinction invisible to a reader.

**No test enforces the coupling.** This is a register finding, not a repair, and no change was made.

### 9.3 Watch item 2 — `drizzle.config.ts` has no `check` or `generate` gate

`tunes/drizzle.config.ts` exists, requires `DATABASE_URL`, and declares `out: "./migrations"` with **`schema: "./shared/schema.ts"`**.

Three compounding facts, all verified first-hand:

1. **The config's schema path excludes the entire Explorers surface.** It names only `shared/schema.ts`. `shared/explorersSchema.ts` (31 tables) and `shared/authSchema.ts` (4 tables) are **not** in scope. A `drizzle-kit generate` run against this config would therefore see none of those 35 tables — and, pointed at a migrated database, could propose dropping them.
2. **There is no script and no CI gate.** `drizzle-kit` appears only as a devDependency (`tunes/package.json:173`); neither `tunes/package.json` nor the root `package.json` defines any drizzle script at all (no schema-push, schema-generate or schema-check entry point), and no workflow references drizzle-kit. So the config is inert today — but nothing prevents someone running it.
3. **Prose comments are the only defense.** `explorersSchema.ts:128-129`, `:153`, `:165-166`, `:183`, `:192`, `:196`, `:204-205` and `:228` state in comments that migrations `0029`–`0038` own the composite ownership FKs, deferred bounds, category CHECKs, triggers, guards and grants, and that "These declarations are inventory mappings, not authority to replace SQL-owned constraints" (`:205`). A generated diff would not read those comments. The SQL-owned invariants at risk are substantial: every composite `(id, account_id, category)` FK, every category CHECK, the deferred unique constraints on display and pin order (`0022:128-129`), the revision triggers, and all `music_runtime` grants.

The in-database defense is real — `migrate.ts:201` rejects schema drift against the stored catalog fingerprint — but it fires *after* a drift has been applied to a database, not before a generated migration is committed.

**This is a register finding, not a repair.** No change was made to `drizzle.config.ts`, `explorersSchema.ts` or any workflow.

## 10. Limits of this register

**Read first-hand (primary evidence).**
- All **40** legacy `content-types/**/schema.json` files at `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`, fetched through the GitHub API and fully decoded. Every count in §1 and every classification in §5 is derived mechanically from those files, not from the in-repo `strapi-schema-inventory.md`/`.json` extraction or from the commissioning review's summary.
- The recursive legacy tree at that SHA, re-confirming **no `src/components/`, no `*/lifecycles/*`, no `*/policies/*`**.
- Canonical: `tunes/shared/explorersSchema.ts`, `schema.ts`, `authSchema.ts`, all nine `explorers*Contract.ts`, `music-migration-contract.ts`, `tunes/server/db/migrate.ts`, `tunes/server/application/publicContent.ts`, `tunes/drizzle.config.ts`, all **38** files in `tunes/migrations/`, and the relevant parts of `.github/workflows/test.yml`, `tunes.yml`, `tunes-deploy.yml`, `music-c0-contracts.yml`.
- Authorizing documents: `docs/replatform-audit/revised-direction.md` (in full) and `docs/replatform-audit/migration-gap-audit-2026-10-05/identity-platform.md` (in full), plus `categories.md:42` and `ticket-index.md`.
- Git history for append-only verification and the `0001`→`0021` collision.
- Live-consumer evidence: targeted greps over `explorers-earth/src`, `explorers-earth/e2e`, `tunes/server`, `tunes/shared`, `tunes/client`. Hits inside `.superpowers/sdd/.../shared-notes-clean-*/` were **excluded** — that directory is an untracked snapshot copy belonging to the pre-existing overlay, not the live tree.

**Taken second-hand.**
- **The 117 legacy controller/router/service files were not read.** `revised-direction.md:33` asserts they "use Strapi core factories; no separate lifecycle or policy source files were present in the repository tree. Registration/bootstrap are empty." This register **re-confirmed the structural half** of that claim from the tree (no components, lifecycles or policies exist as files), but takes the `createCoreController`-factory characterization — and therefore the absence of controller-level invariants such as request filtering, population defaults, or sanitization overrides — **second-hand**. If any of those 117 files contains a hand-written override, an invariant could exist that this register does not record.
- Ticket delivery statuses in §8 are read from `ticket-index.md`, not re-verified against source.

**Not done.**
- **Nothing was executed.** No test, build, type-check, lint, migration, `drizzle-kit`, `npm`, container, or database connection of any kind; port 51642 untouched. Every statement is static source, git history, or an authorizing document.
- No row counts, no live Strapi query, no deployed-environment read.
- The pre-existing uncommitted overlay (154 porcelain entries at read time) was **not** touched, reverted or staged. No `git add`, `commit`, `push`, `stash`, `checkout` or `reset` was run.
- No code, workflow, migration or spec file was edited. The only files written are this register and a pointer section appended to `strapi-schema-inventory.md`.

**Cannot be established from source at all** — these are not gaps in this register but hard limits of static evidence, and each needs a live read or a product input:
- **Seed rows.** Zero row content is recoverable from type definitions (`revised-direction.md:55`). Category names, sub-category names, book subjects, game genres, FAQ text, terms/privacy/cookie bodies and reasons-for-leaving values are all unknowable here. §7.7.
- **Administrator roles and permission grants.** The legacy users-permissions role graph is database-configured (`revised-direction.md:63`), which is why `up_users.role` is the register's single UNVERIFIED row.
- **Provider settings.** Google OAuth client configuration, S3 bucket and IAM policy, Resend domain and sending configuration, IGDB/Twitch, TMDB and Google Books credentials — all runtime configuration.
- **Webhooks.** Any Strapi webhook configured in the deployed admin is invisible to source and could carry behavior this register treats as absent.
- **Effective locale population.** Whether more than one locale actually has rows for the 19 localized `account` fields, `faq` and `platform-term` — decisive for §7.2 and only answerable by the read-only locale-dependent response inspection `revised-direction.md:47` asks for.
- **Deployed CORS, proxy and URL behavior**, and therefore whether canonical slug and handle rules preserve the visible URL structure `revised-direction.md:101` requires.

**One structural limit worth stating plainly.** Because the only exclusion authority in the planning package is 13 coarse rows plus three lines, **122 of 401 attributes (30.4%) are MISSING**, which means only that no authorization record exists for them — not that anyone decided to drop them. Several are almost certainly intentional and will become DROPPED-AUTHORIZED the moment §7 is answered. Until then, this register should be read as a list of **undecided** items, not a list of defects. The counts in §3 will move between classes as §7 decisions land; they are a snapshot of the authorization record at `225d83e5`, not a quality score.
