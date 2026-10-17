# Target schema: category, guide and reference extensions

**Proposed database design, not an applied migration.** Complements the parent's core identity/account/entity/recommendation/collection/media schema. Reviewed against the saved Strapi schemas and current category TypeScript/forms, including Places' person variant and both guide budget representations. This document chooses the target representation explicitly; historical data import is out of scope.

## Conventions and core dependencies

The SQL-like table definitions below enumerate **every column** of each feature table. `NOT NULL` means required; a column without it is nullable and defaults to SQL NULL. No implicit extra timestamp/ID columns are assumed. Defaults are written explicitly. All primary/unique keys create their normal B-tree indexes. Additional indexes are listed after each family. All FKs use `ON UPDATE RESTRICT`; delete behavior is explicit. Ordinary deletion is archival in core, not physical cascade; physical cascade below applies only to a deliberate authorized purge.

Core tables consumed, not redefined here: `entities(id uuid,kind text)`, `recommendations(id uuid,account_id uuid,category text,entity_id uuid,...)`, `collections(id uuid,account_id uuid,category text,...)`, `creator_accounts(id uuid)`, `media_assets(id uuid,account_id uuid,...)`, and canonical users with Better Auth's text identifier. Parent must supply unique `(id,account_id)` on recommendations, collections and media_assets. Core owns titles, notes, ratings, visibility, pin/order, revisions and lifecycle timestamps; this file does not duplicate them. Entity kind is singular (`book`, `movie`, `game`, `app`, `product`, `person`, `place`); recommendation category is the nine-category plural navigation key. If parent chooses different spelling, consolidate once in the master schema.

Each typed entity table has exactly one PK/FK `entity_id`. A deferred constraint trigger `entity_detail_kind_guard` rejects a row whose parent kind is not its table's kind, and rejects parent kind changes that invalidate an existing detail row. Do not compare entity kind directly with recommendation category: a Places recommendation may intentionally refer to a person. Provider identities are exclusively in core `entity_identifiers`; no duplicate TMDB/IGDB/Google IDs here. `entities.title` supplies source title/name; creator overrides are described below.

All text URLs in source metadata must pass server HTTP(S)-scheme/provider-origin policy; PostgreSQL text alone does not make a URL safe. Empty optional strings normalize to NULL. Text arrays have no null members; limits: maximum 200 entries, each at most 1,000 characters. Rich JSON payloads have versioned runtime schemas, maximum encoded size 1 MiB per row, maximum nesting 32; DB checks enforce JSON container/type/version, application validators enforce member shapes. Source/catalog refresh can update shared facts; a recommendation write cannot.

## 1. Canonical entity detail tables

### Books

```sql
book_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  subtitle text,
  authors text[] NOT NULL DEFAULT '{}',
  publisher text,
  published_date_text text,
  year_text text,
  description text,
  cover_url text,
  cover_large_url text,
  subjects text[] NOT NULL DEFAULT '{}',
  page_count integer CHECK (page_count >= 0),
  isbn_13 text CHECK (isbn_13 ~ '^[0-9]{13}$'),
  isbn_10 text CHECK (isbn_10 ~ '^[0-9]{9}[0-9X]$'),
  provider_rating numeric(3,2) CHECK (provider_rating BETWEEN 0 AND 5),
  ratings_count bigint CHECK (ratings_count >= 0),
  language_tag text,
  preview_url text
)
```

No unique ISBN constraint: duplicate/malformed provider identifiers require explicit resolution, not silent merges. Google `volume_id` is core external ID `(google_books,volume,id)`. Preserve partial publication dates as text. Index: GIN `(subjects)` for existing subject browse; GIN authors only if measured query needs it (not initially).

### Movies and shows

```sql
movie_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('movie','tv')),
  original_title text,
  year_text text,
  poster_url text,
  backdrop_url text,
  genres text[] NOT NULL DEFAULT '{}',
  director text,
  runtime_minutes integer CHECK (runtime_minutes >= 0),
  provider_rating numeric(4,2) CHECK (provider_rating BETWEEN 0 AND 10),
  overview text,
  season_count integer CHECK (season_count >= 0),
  watch_providers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(watch_providers) = 'object'),
  cast_details jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(cast_details) = 'array'),
  CHECK (media_type = 'tv' OR season_count IS NULL)
)
```

Normalize Strapi `Movie`→`movie`, `Show`/`TV`→`tv`; compatibility adapter preserves current UI spelling. Core external uniqueness is `(tmdb,movie,id)` or `(tmdb,tv,id)`, never TMDB number alone. Watch providers are a bounded region-keyed object with provider id/name/logo/link plus rent/buy/flatrate arrays as returned/consumed; cast entries have provider id/name/character/profile/order. Index GIN `(genres)`; no standalone rating index until a ranked query requires it.

### Games

```sql
game_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  provider_slug text,
  provider_image_id text,
  cover_url text,
  cover_large_url text,
  summary text,
  release_date_text text,
  release_year_text text,
  provider_rating numeric(5,2) CHECK (provider_rating BETWEEN 0 AND 100),
  ratings_count bigint CHECK (ratings_count >= 0),
  genres text[] NOT NULL DEFAULT '{}',
  platforms text[] NOT NULL DEFAULT '{}',
  developer text,
  publisher text,
  game_modes text[] NOT NULL DEFAULT '{}',
  screenshot_ids text[] NOT NULL DEFAULT '{}',
  provider_url text
)
```

IGDB identity is `(igdb,game,id)` in core. Preserve text release precision. Index GIN `(genres)` and GIN `(platforms)` for existing filters.

### Apps and Tools

```sql
app_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  app_url text NOT NULL,
  description text,
  logo_url text,
  developer text,
  platforms text[] NOT NULL DEFAULT '{}',
  price_tier text CHECK (price_tier IN ('Free','Freemium','Paid','Subscription')),
  download_url text,
  screenshot_urls text[] NOT NULL DEFAULT '{}'
)
```

No URL uniqueness; similar URLs are not identity proof. Price tier is nullable to preserve unknown external metadata; the existing new-form default may remain Freemium in UI without fabricating a database fact. Index GIN `(platforms)`; title search uses core search projection.

### Products

```sql
product_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  product_url text NOT NULL,
  brand text,
  logo_url text,
  description text,
  specifications jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(specifications) = 'object'),
  image_urls text[] NOT NULL DEFAULT '{}'
)
```

Specifications are string→string only, maximum 200 entries; no merchant URL uniqueness. **Price, currency and buy URL are creator offer context below**, not universal catalog facts. No extra index initially; core entity search handles discovery.

### People

```sql
person_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  username_handle text,
  headline text,
  location_text text,
  avatar_url text,
  primary_platform text CHECK (primary_platform IN ('instagram','linkedin','twitter','github','youtube','website','other')),
  social_urls jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(social_urls) = 'object'),
  skills_tags text[] NOT NULL DEFAULT '{}',
  external_follower_count_text text
)
```

Core title supplies name; map frontend `x` to stored `twitter`. Social object allows only primary/instagram/linkedin/twitter/github/youtube/website/other with validated URL values. Follower count is external presentation metadata only. No FK to users/accounts, no global unique handle/name; there is no following network. Index GIN `(skills_tags)`.

### Places

```sql
place_entity_details (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  formatted_address text,
  address_components jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(address_components) = 'array'),
  latitude numeric(10,7) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) CHECK (longitude BETWEEN -180 AND 180),
  provider_types text[] NOT NULL DEFAULT '{}',
  provider_rating numeric(3,2) CHECK (provider_rating BETWEEN 0 AND 5),
  ratings_count bigint CHECK (ratings_count >= 0),
  public_phone text,
  public_phone_normalized text,
  website_url text,
  price_level smallint CHECK (price_level BETWEEN 0 AND 4),
  price_range jsonb,
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (price_range IS NULL OR jsonb_typeof(price_range) IN ('object','string'))
)
```

Provider Google Place ID is in core; private owner contact never populates public_phone. Zero coordinates are valid, missing remains null. Index `(public_phone_normalized)` WHERE nonnull; GIN `provider_types`; public address search uses a normalized/FTS query over approved public facts plus public-eligibility joins, not a separate claimable directory. No PostGIS extension in launch schema until a distance query is actually defined.

## 2. Creator-specific context and overrides

### `recommendation_display_overrides`

```sql
recommendation_display_overrides (
  recommendation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  display_values jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(display_values) = 'object'),
  FOREIGN KEY (recommendation_id,account_id)
    REFERENCES recommendations(id,account_id) ON DELETE CASCADE
)
```

Index `(account_id,recommendation_id)` for account purge/audit. This is a **typed sparse display object**, not an arbitrary metadata bag. Runtime validation chooses the category variant, forbids unknown keys, and forbids provider IDs/owner IDs/visibility/revision/taxonomy/media storage keys. Allowed keys are title and nullable display fields from that category detail table above (same types/ranges), excluding immutable media_type, source identity and provider_rating/ratings_count. For products, price/currency/buy URL live only in the typed context table below. Book buy links live below. Null explicitly clears an overridable field; absent inherits canonical source. Arrays/objects replace as a whole. Uploaded media is always linked through FK tables, never embedded as an asset URL override; external approved provider images can use the corresponding URL key. A's edits do not alter B or catalog facts. One source of truth: this table owns overrides; core `recommendations` must not retain a second inline override object.

### `book_recommendation_context`

```sql
book_recommendation_context (
  recommendation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  buy_links jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(buy_links) = 'array'),
  FOREIGN KEY (recommendation_id,account_id)
    REFERENCES recommendations(id,account_id) ON DELETE CASCADE
)
```

Each buy link is `{name:string,url:http(s),logo?:string}`; maximum 20. Category guard requires books. Index account_id. Editorial note/rating/media/pin remain core.

### `product_recommendation_context`

```sql
product_recommendation_context (
  recommendation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  price numeric(20,6) CHECK (price >= 0),
  currency_code text CHECK (currency_code ~ '^[A-Z]{3}$'),
  buy_url text,
  FOREIGN KEY (recommendation_id,account_id)
    REFERENCES recommendations(id,account_id) ON DELETE CASCADE
)
```

Category guard products. Currency may be unknown even when amount exists; no implicit USD. Validate known currency precision in application against versioned ISO metadata; unknown three-letter code is rejected at API boundary. Wire amounts are decimal strings; adapter converts only for current display. Index `(account_id,price,recommendation_id)` WHERE price nonnull. Do not compare mixed currencies as an economic conversion; retain current explicit UI sort behavior. Numeric scale is not a claim every currency supports six minor digits.

### `place_recommendation_context`

```sql
place_recommendation_context (
  recommendation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  recommendation_type text NOT NULL DEFAULT 'place' CHECK (recommendation_type IN ('place','person')),
  source_of_recommendation text NOT NULL DEFAULT 'self' CHECK (source_of_recommendation IN ('self','suggestion')),
  contact_name text,
  contact_number text,
  contact_visibility text NOT NULL DEFAULT 'private' CHECK (contact_visibility IN ('private','public')),
  place_social_url text,
  place_website_url text,
  creator_social_url text,
  legacy_place_note jsonb,
  person_profile_url text,
  person_address text,
  FOREIGN KEY (recommendation_id,account_id)
    REFERENCES recommendations(id,account_id) ON DELETE CASCADE,
  CHECK (legacy_place_note IS NULL OR jsonb_typeof(legacy_place_note) IN ('object','array')),
  CHECK (recommendation_type = 'person' OR (person_profile_url IS NULL AND person_address IS NULL))
)
```

Category guard places. A deferred invariant verifies core recommendation entity kind = place when type place, person when type person. This preserves `Recommendation_Type:'person'` in the Places form; it does not force the item into the separate People category or infer a login identity. Existing `Person_Details.instagram` maps person_profile_url; `address` maps person_address. Legacy `Users_Place_Note` is separate from core `user_recommendation_note` where both are still consumed; remove only after caller proof. No supporters/community relationships copied. Index account_id. Public DTO applies contact_visibility plus parent policy; seeded fresh rows default private, and adapter must explicitly carry the existing user's public-disclosure selection when present.

## 3. Collection extensions, taxonomy and associations

### Core collection presentation mapping

All category heading aliases (`top_reads_heading`, `top_games_heading`, `top_apps_heading`, `top_products_heading`, `top_people_heading`, `top_picks_heading`) map core `collections.heading`; no separate presentation table. List name/description/slug/visibility/display order and cover FK remain core.

### `place_collection_details`

```sql
place_collection_details (
  collection_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  location_entity_id uuid REFERENCES entities(id) ON DELETE RESTRICT,
  location_snapshot jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(location_snapshot) = 'object'),
  instagram_media_url text,
  FOREIGN KEY (collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE
)
```

Category guard places; location_entity kind guard place if supplied. `List_Name_Details` maps versioned location_snapshot containing the current location/city selection display fields (name, address, provider ID, coordinates); identity is separately linked. `Sequence` aliases core display_order. Index `(account_id,location_entity_id)` and `(location_entity_id)` WHERE nonnull.

### `location_linked_collections`

```sql
location_linked_collections (
  child_collection_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  location_collection_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  FOREIGN KEY (child_collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE,
  FOREIGN KEY (location_collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE,
  CHECK (child_collection_id <> location_collection_id)
)
```

Deferred trigger requires parent places and child products/people. PK enforces one location parent per child. Index `(location_collection_id,position,child_collection_id)`, `(account_id)`. Parent archive explicitly deletes association rows in the same transaction while preserving child collections; physical parent purge also removes links only. Linking to an individual place recommendation is invalid. Create child+link is atomic.

### Taxonomy

```sql
taxonomy_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('places','books','movies','games','apps','products','people','guides')),
  parent_id uuid REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (length(slug) BETWEEN 1 AND 100),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE(category,slug),
  UNIQUE(id,category),
  CHECK (parent_id IS NULL OR parent_id <> id)
)
taxonomy_term_translations (
  term_id uuid NOT NULL REFERENCES taxonomy_terms(id) ON DELETE CASCADE,
  locale text NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  PRIMARY KEY(term_id,locale)
)
recommendation_taxonomy (
  recommendation_id uuid NOT NULL,
  account_id uuid NOT NULL,
  term_id uuid NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY(recommendation_id,term_id),
  FOREIGN KEY(recommendation_id,account_id)
    REFERENCES recommendations(id,account_id) ON DELETE CASCADE
)
```

Deferred taxonomy trigger requires same category between parent/child term and no cycles; Places uses at most two levels. Assignment trigger requires recommendation category = term.category; multiple assignments are allowed to preserve books/games reusable taxonomies, and Places stores selected parent+child. For apps/products/people UI expects one selected leaf: enforce at most one leaf in its application command (the table does not pretend those records are one-to-one with the term). Index taxonomy `(parent_id,position,id)`, translations `(locale,term_id)`, assignments `(term_id,recommendation_id)`, `(account_id,recommendation_id)`. Do not copy legacy one-to-one taxonomy errors. Category labels/locale values are seed inputs unavailable from schema exports.

## 4. Guide aggregate and sections

Guides are core collections, not canonical entity detail rows. Recommendation entity sharing does not erase authored itinerary structure.

```sql
guide_collection_details (
  collection_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  guide_type text NOT NULL CHECK (guide_type IN ('Itinerary','Theme')),
  estimated_budget_amount numeric(20,6) CHECK (estimated_budget_amount >= 0),
  estimated_budget_currency text CHECK (estimated_budget_currency ~ '^[A-Z]{3}$'),
  budget_type text CHECK (budget_type IN ('Budget','Mid-Range','Luxury','Backpacker','Ultra-Luxury')),
  is_multicity boolean NOT NULL DEFAULT false,
  number_of_days integer CHECK (number_of_days > 0),
  tags text[] NOT NULL DEFAULT '{}',
  tips jsonb,
  place_details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(place_details) = 'object'),
  transportation jsonb,
  best_time_to_visit text[] NOT NULL DEFAULT '{}',
  section_details_version smallint NOT NULL DEFAULT 1 CHECK (section_details_version = 1),
  section_details jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(section_details) = 'array'),
  FOREIGN KEY(collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE,
  CHECK (tips IS NULL OR jsonb_typeof(tips) IN ('array','object')),
  CHECK (transportation IS NULL OR jsonb_typeof(transportation) IN ('array','object'))
)
guide_taxonomy (
  collection_id uuid NOT NULL,
  account_id uuid NOT NULL,
  term_id uuid NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
  PRIMARY KEY(collection_id,term_id),
  FOREIGN KEY(collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE
)
guide_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  account_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description jsonb,
  position integer NOT NULL CHECK (position >= 0),
  block_schema_version smallint NOT NULL DEFAULT 1 CHECK (block_schema_version = 1),
  timeline jsonb,
  transport jsonb,
  stay jsonb,
  activities jsonb,
  budget jsonb,
  map_details jsonb,
  packing_list jsonb,
  pre_tasks jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(id,account_id),
  FOREIGN KEY(collection_id,account_id)
    REFERENCES collections(id,account_id) ON DELETE CASCADE,
  CHECK (description IS NULL OR jsonb_typeof(description) IN ('array','object')),
  CHECK (timeline IS NULL OR jsonb_typeof(timeline) = 'object'),
  CHECK (transport IS NULL OR jsonb_typeof(transport) = 'object'),
  CHECK (stay IS NULL OR jsonb_typeof(stay) = 'object'),
  CHECK (activities IS NULL OR jsonb_typeof(activities) = 'object'),
  CHECK (budget IS NULL OR jsonb_typeof(budget) = 'object')
)
guide_section_media (
  section_id uuid NOT NULL,
  account_id uuid NOT NULL,
  media_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY(section_id,media_id),
  FOREIGN KEY(section_id,account_id) REFERENCES guide_sections(id,account_id) ON DELETE CASCADE,
  FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT
)
guide_collection_media (
  collection_id uuid NOT NULL,
  account_id uuid NOT NULL,
  media_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY(collection_id,media_id),
  FOREIGN KEY(collection_id,account_id) REFERENCES collections(id,account_id) ON DELETE CASCADE,
  FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT
)
```

Guide detail/category triggers require parent collections.category guides; guide_taxonomy term category guides. Guide title/description/publication/pin/display order/cover media remain core. Core collection description must accept the same validated rich-text document as guide `Description`; do not silently collapse it to plain text. Budget source can be scalar or `{amount,currency}`; target amount+currency preserves both, adapter retains expected screen representation, unknown currency stays NULL. `section_details` preserves the wizard's journey/destination arrangement separately from canonical section rows; commands update both coherently where the same current UI edit affects both, never use this JSON as the authoritative section ownership/order list.

Indexes: guide details `(account_id)`; guide_taxonomy `(term_id,collection_id)` and `(account_id)`; guide_sections `(collection_id,position,id)` WHERE archived_at NULL, `(account_id,id)`; guide_section_media `(media_id)` and `(account_id,section_id)`; guide_collection_media `(media_id)` and `(collection_id,position,media_id)`. Guide gallery keeps all `Guide_Media` values; its first item is the compatibility cover. Do not also write a conflicting core collection_media cover for a guide: core cover junction is used by ordinary lists. A deferred guard requires guide_collection_media parent category guides and forbids claim-evidence/nonready assets. Do not unique-constrain section positions because reorder may temporarily overlap; reorder holds the parent collection lock, validates exact active section IDs and rewrites positions atomically with its revision bump. `updated_at` is explicitly changed by write statements; no presumed auto-update default.

### Section JSON v1 field contract

Port current `guideSectionTypes.ts` shapes exactly, with decimal-string monetary amounts at the storage/wire boundary. `timeline` = morning/afternoon/evening arrays of DayPlace. `transport` = `{segments:[{fromPlaceId,toPlaceId,mode,distanceKm,estimatedMinutes}]}` with mode walk/drive/bike/public_transit/taxi/auto/ferry/flight; nonnegative finite distance/time. `stay` = accommodations DayPlace array. `activities` = activities DayPlace array. `budget` = period arrays of BudgetPlace (place_id,name,optional priceLevel/priceRange/customBudget/budgetAmount/budgetCurrency). Maximum 500 total places per section; no duplicate DayPlace.id within a section. Transport endpoints refer to existing DayPlace.id in that section.

DayPlace fields: id, name, formatted_address, place_id; optional geometry.location.lat/lng, types, tips, photos, priceLevel, priceRange, customBudget, budgetAmount, budgetCurrency, isVerified, source (google/ai-unverified/manual). Do not persist `photosLoading`; it is UI state. Photos contain stable media ID or approved provider reference, fileName,width,height,aspectRatio; do not persist signed/public byte URL as ownership. Uploaded IDs must also exist in guide_section_media with matching account; recursive JSON validator rejects unlinked media references. Provider place IDs are external references, not UUID FKs; if linking canonical entities is needed later add an explicit junction rather than treating JSON as FK enforcement. Map/packing/pre-task payloads preserve current supported object/array shapes under the size/depth limits; they cannot hold actor/visibility/order fields or executable HTML.

## 5. Pending claims and evidence

```sql
place_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimant_account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 50),
  email text NOT NULL,
  phone text NOT NULL CHECK (length(phone) BETWEEN 10 AND 20),
  message text NOT NULL CHECK (length(message) BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,claimant_account_id)
)
place_claim_evidence (
  claim_id uuid NOT NULL,
  claimant_account_id uuid NOT NULL,
  media_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY(claim_id,media_id),
  FOREIGN KEY(claim_id,claimant_account_id)
    REFERENCES place_claims(id,claimant_account_id) ON DELETE CASCADE,
  FOREIGN KEY(media_id,claimant_account_id)
    REFERENCES media_assets(id,account_id) ON DELETE RESTRICT
)
```

Claim entity kind must be place. Index claims `(claimant_account_id,created_at,id)`, `(entity_id,created_at,id)`; evidence `(media_id)`, `(claimant_account_id,claim_id)`. Email/phone/message/evidence never enter public projections or search documents. Pending-only status intentionally has no review/admin workflow or inferred ownership. Core operation idempotency deduplicates retries; do not add a conflicting global unique (claimant,place) that forbids a legitimate later submission. A deferred constraint trigger requires at least one evidence row before the claim transaction commits; this matches the mandatory document in `Authentication/data.ts:228`. That validator also requires both email and phone, name 2–50 and message 10–500: update the previously optional claim-contact API proposal accordingly. API validates current name/phone/email formats and 5 MiB maximum PDF/DOC/DOCX/JPEG/PNG evidence with actual MIME inspection; no broader image/video default overrides this screen-specific policy. Private media purpose constraint prevents a claim evidence asset from being attached to public content; validate in a database guard/application transaction as specified by media owner. Evidence remains private even when the place is public.

**No `claimable_place_profiles` target table.** Lookup joins canonical place facts to current public eligible recommendations and account/category/collection visibility, with distinct recommending accounts. `Recommendation_Count` and `Added_By_User` are derived, not mutable client JSON. `Is_Claimed`/`Claiming_Account` are not set by a pending receipt; no verified-ownership feature is invented.

## 6. Reference/legal content

```sql
reference_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('faq','terms','privacy','cookies')),
  locale text NOT NULL,
  title text NOT NULL,
  answer_text text,
  rich_body jsonb,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(content_key,locale),
  CHECK ((kind = 'faq' AND answer_text IS NOT NULL AND rich_body IS NULL)
      OR (kind <> 'faq' AND answer_text IS NULL AND rich_body IS NOT NULL)),
  CHECK (rich_body IS NULL OR jsonb_typeof(rich_body) IN ('array','object'))
)
```

Partial unique `(kind,locale)` WHERE kind IN ('terms','privacy','cookies') ensures one legal body per kind/locale; FAQ has many stable content keys. Index `(kind,locale,active,position,id)`. No FKs or delete cascades. Seed updater uses content_key+locale and explicit revision; active=false removes normal presentation without losing audited change history in core. Locale format/allowlist and fallback come from the configured UI locale manifest; do not permit arbitrary unbounded locale strings. FAQ title/answer/position map Question/Answer/Sequence. Terms/Privacy/Cookies map the three separate platform-term rich fields. Account exit reasons are private lifecycle writes owned by core, never reference seeds.

## 7. Core media linkage requirements and source-field coverage

Core supplies account-checked recommendation media and ordinary collection-cover media junctions with order and FK ownership; media captions/alternativeText come from `media_assets`. `Media`, `media_details.imageDetails`, thumbnail and cover fields are compatibility DTO projections from those junctions plus approved external image metadata, not another unchecked blob containing raw S3 keys. Core media columns are `width_px integer NULL CHECK(width_px>0)` and `height_px integer NULL CHECK(height_px>0)` with no defaults; both are null or both present. Derive aspectRatio from those measured values rather than storing a second independent ratio or accepting caller-trusted dimensions. These preserve `ActivityPhoto.width/height/aspectRatio`; original filename comes from the core filename field. Uploaded image/video byte delivery remains the parent media design; this draft does not introduce a public bucket or new URL authority.

### Explicit field map

Notation: `E` = core entity title/identifier, `R` = core recommendation, `C` = core collection, `RM` = core recommendation media, `CM` = core collection cover, `O` = typed recommendation display override of the named source detail field. Every inherited account/ID/list relation uses canonical keys; there is no silent raw-source JSON fallback for a missing mapping.

| Source type | Field → target |
|---|---|
| Common recommended item | title/name→E.title with O.title; user_recommendation_note→R.note; user_rating→R.user_rating; is_pinned/pin_order/display_order→core collection membership pin/order; account→R.account_id; *_list→core collection membership; Media→RM; media_details.imageDetails/thumbnail→ordered RM DTO; documentId→R.id |
| Common lists | List_Name→C.title; list_description→C.description; slug→C.slug; Visibility/visibility→C.visibility; cover_image→CM; display_order/Sequence→C.display_order; all top_*_heading→C.heading; account→C.account_id; recommended_*→membership query; is_pinned/pin_order→C pin fields |
| RecommendedBook | volume_id→entity_identifiers google_books/volume; subtitle→subtitle; authors→authors; publisher→publisher; published_date→published_date_text; year→year_text; description→description; cover_url→cover_url; cover_url_large→cover_large_url; subjects→subjects; page_count→page_count; isbn_13→isbn_13; isbn_10→isbn_10; google_rating→provider_rating; ratings_count→ratings_count; language→language_tag; preview_link→preview_url; buy_links→book_recommendation_context.buy_links; book_categories→recommendation_taxonomy |
| RecommendedMovie | tmdb_id→entity_identifiers tmdb/movie or tmdb/tv; media_type→media_type; original_title→original_title; year→year_text; poster_path→poster_url; backdrop_path→backdrop_url; genres→genres; director→director; runtime→runtime_minutes; tmdb_rating→provider_rating; overview→overview; season_count→season_count; watch_providers→watch_providers; cast_details→cast_details; movie_categories→recommendation_taxonomy |
| RecommendedGame | igdb_id→entity_identifiers igdb/game; igdb_slug→provider_slug; igdb_image_id→provider_image_id; cover_url→cover_url; cover_url_large→cover_large_url; summary→summary; release_date→release_date_text; release_year→release_year_text; igdb_rating→provider_rating; igdb_rating_count→ratings_count; genres→genres; platforms→platforms; developer→developer; publisher→publisher; game_modes→game_modes; screenshot_ids→screenshot_ids; igdb_url→provider_url; game_categories→recommendation_taxonomy |
| RecommendedApp | app_url→app_url; description→description; logo_url→logo_url; developer→developer; platforms→platforms; price_tier→price_tier; download_url→download_url; screenshots→screenshot_urls; app_category→recommendation_taxonomy |
| RecommendedProduct | product_url→product_url; brand→brand; logo_url→logo_url; description→description; specifications→specifications; images→image_urls; price/currency/buy_url→product_recommendation_context.price/currency_code/buy_url; product_category→recommendation_taxonomy |
| RecommendedPerson | username_handle→username_handle; headline→headline; location→location_text; avatar_path→avatar_url; primary_platform→primary_platform; social_urls→social_urls; skills_tags→skills_tags; people_category→recommendation_taxonomy; frontend follower_count→external_follower_count_text/O; aliases full_name,handle,avatar_url,platform,tags,bio/profile_url derive from mapped name/handle/avatar/platform/skills/headline/social primary URL |
| RecommendedPlace | Place_Details.Title→E.title/O.title; Place_Name/Place_Address→formatted_address/O; Place_Id→entity_identifiers google_places/place; Geometry→latitude/longitude; Rating/google_rating→provider_rating; Rating_Count→ratings_count; Price_Range→price_range; Contact_Name/Number→place_recommendation_context.contact_name/contact_number; Places_Social_Link→place_social_url; Places_Website→place_website_url; Users_Social_URL→creator_social_url; Users_Place_Note→legacy_place_note; Source_Of_Recommendation→source_of_recommendation; Recommendation_Type→recommendation_type; Person_Details.instagram/address→person_profile_url/person_address; recommendation_category/sub_category→recommendation_taxonomy; supporters/supporter→explicitly excluded |
| RecommendationList location fields | List_Name_Details→place_collection_details.location_snapshot; Instagram_Media_URL→instagram_media_url; person_lists/product_lists→location_linked_collections child records |
| Guide parent | Title/Description/Visibility/slug/account/pins/order→core collection fields; Guide_Type→guide_type; Estimated_Budget scalar or object→estimated_budget_amount/currency; Tips_Notes→tips; Guide_Section_Details→section_details; Guide_Media→guide_collection_media; Guide_Tags→tags; Place_Details→place_details; Transportation→transportation; Number_Of_Days→number_of_days; Category→guide_taxonomy; Best_Time_To_Visit→best_time_to_visit; Budget_Type→budget_type; is_Multicity→is_multicity; guide_sections→guide_sections query |
| Guide section | Title→title; Sequence→position (integer ordinal at target); Description→description; Recommendation_Activity→activities; guide→collection_id; Recomendation_Media→guide_section_media; Map_Details→map_details; Packing_List→packing_list; Pre_Tasks→pre_tasks; Section_tags→tags; Timeline→timeline; Transport→transport; Stay→stay; Budget→budget |
| Taxonomy source names | Category_Name/Category_name/name/subject_name/sub_category→taxonomy_term_translations.label; slug→taxonomy_terms.slug; every source category relation→taxonomy_terms parent or recommendation/guide assignment; source one-to-one item cardinality is intentionally replaced by reusable assignment |
| VerifyClaim | Email→email; Phone→phone; Message→message; Name→name; Attachment→place_claim_evidence; target account/place references are new server-resolved authority fields |
| ClaimablePlaceProfile | Place_Id/Name/Address/Lat/Long/Phone/Website/Meta_Data→canonical place/provider data; Recommendation_Count→distinct eligible recommender count; Added_By_User→derived eligible account query; Is_Claimed/Claiming_Account→not granted or synthesized by pending claims |
| FAQ/legal | Question→reference_content.title; Answer→answer_text; Sequence→position; Terms_and_Condition→kind terms.rich_body; Privacy_and_Policy→kind privacy.rich_body; Cookie_Policy→kind cookies.rich_body; locale→locale |

Unlisted creator-editable canonical display fields above use O with the same typed value; IDs, source rating and kind are never overrideable. The ticket contract now uses `estimatedBudget: {amount:decimal-string|null,currency:string|null}|null` and required claim contacts. These corrections are grounded in `GuideHeader.tsx` object-budget rendering and `Authentication/data.ts` validation, not speculative scope expansion.

| Existing field group | Target |
|---|---|
| All `documentId`/numeric REST IDs | Canonical UUID rendered as compatibility documentId at edge; no historical ID columns needed for fresh DB |
| Account, *_list, guide relations | Core account-owned aggregate FKs; linked location lists use location_linked_collections |
| Name/title, note/rating, pin/order/publication | Core entity title or recommendation override; core recommendation/collection authored fields |
| Book bibliographic fields/provider rating | book_entity_details; external volume identity core; buy_links account context |
| Movie/TV facts and metadata | movie_entity_details with kind-aware core external ID |
| Games metadata and screenshots | game_entity_details; provider IDs core |
| Apps descriptive tier/platform/download | app_entity_details plus creator overrides; no paid entitlement meaning |
| Products specs/images/brand, price/currency/buy link | product_entity_details plus product_recommendation_context |
| People name/handle/social/skills/avatar | person entity/details plus local overrides; no auth/follow relation |
| Place_Details, Google rating, geometry | place_entity_details and core source assertion for retained raw provider snapshot; account editorial fields separate |
| Recommendation_Type person, Person_Details | place_recommendation_context referencing person entity while retaining Places category |
| Guide parent fields including amount+currency | core collection and guide_collection_details |
| Every guide section field | guide_sections columns and JSON v1; media FK junction |
| Categories and subcategories | taxonomy_terms/translations/assignment junctions |
| Claim submission evidence | place_claims/place_claim_evidence, pending-only private |
| FAQs and all three legal documents | reference_content kinds/locales |
| Followers, supporters, community, unused billing models | Excluded, not placeholder tables |

## 8. Required database qualification

Test all composite FK wrong-account cases, detail-kind mismatches, invalid subtype enums and rating ranges, latitude/longitude pairing, decimal round-trip, taxonomy cycles/cross-category assignment, location parent category/single-parent invariant, section reorder rollback/parent revision, JSON media reference ownership, public-versus-private direct media access, pending claim no-membership side effects, and seed rerun uniqueness. Every property enforced only in application validation must have a contract test; every deferred trigger/FK must have a direct SQL negative integration test under the disposable database authority. Deleting one creator must not delete another's canonical entity or recommendation. Draft JSON columns are not permission to omit validators.

**Genuine external inputs:** reviewed reference/taxonomy labels and legal copy/locales; actual provider field/usage permissions; approved media limits/provider metadata caching policy. Missing values do not require redesigning these tables. No schema, constraint or test described here has been applied or executed.
