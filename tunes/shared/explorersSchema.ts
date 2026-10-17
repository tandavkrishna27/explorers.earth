import { pgTable, text, uuid, bigint, boolean, timestamp, jsonb, integer, smallint, primaryKey, uniqueIndex, index, customType, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auth_user } from "./authSchema";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const creatorAccounts = pgTable("creator_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  handle: text("handle"),
  handleKey: text("handle_key").generatedAlwaysAs(sql`lower(handle)`),
  displayName: text("display_name"),
  accountType: text("account_type"),
  onboardingStatus: text("onboarding_status").notNull().default("incomplete"),
  status: text("status").notNull().default("active"),
  publicProfile: boolean("public_profile").notNull().default(true),
  autoPinning: boolean("auto_pinning").notNull().default(true),
  locale: text("locale").notNull().default("en"),
  mobileNumber: text("mobile_number"),
  mobileNumberVisible: boolean("mobile_number_visible").notNull().default(false),
  bioPlain: text("bio_plain"),
  bioRich: jsonb("bio_rich"),
  primaryAddress: jsonb("primary_address"),
  additionalAddresses: jsonb("additional_addresses").notNull().default([]),
  publicAddress: jsonb("public_address"),
  profilePlaceDetails: jsonb("profile_place_details"),
  revision: bigint("revision", { mode: "number" }).notNull().default(1),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountMemberships = pgTable("account_memberships", {
  accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  userId: text("user_id").notNull().references(() => auth_user.id),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.accountId, table.userId] })]);

export const initialAccountBindings = pgTable("initial_account_bindings", {
  userId: text("user_id").primaryKey().references(() => auth_user.id),
  accountId: uuid("account_id").notNull().unique().references(() => creatorAccounts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSecurityState = pgTable("user_security_state", {
  userId: text("user_id").primaryKey().references(() => auth_user.id),
  sessionVersion: bigint("session_version", { mode: "number" }).notNull().default(1),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountCategorySettings = pgTable("account_category_settings", {
  accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  category: text("category").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  displayOrder: integer("display_order").notNull(),
  pinnedOrder: integer("pinned_order"),
}, (table) => [primaryKey({ columns: [table.accountId, table.category] })]);

export const accountPresentation = pgTable("account_presentation", {
  accountId: uuid("account_id").primaryKey().references(() => creatorAccounts.id),
  schemaVersion: smallint("schema_version").notNull().default(1),
  themeSettings: jsonb("theme_settings").notNull().default({}),
  socialLinks: jsonb("social_links").notNull().default([]),
  businessDetails: jsonb("business_details").notNull().default({}),
});

export const accountRecoveryProofs = pgTable("account_recovery_proofs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => auth_user.id),
  accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  tokenHash: bytea("token_hash").notNull(),
  purpose: text("purpose").notNull().default("account-recovery"),
  authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("account_recovery_token_hash_uq").on(table.tokenHash),
  index("account_recovery_expiry_idx").on(table.expiresAt, table.id),
  index("account_recovery_account_user_idx").on(table.accountId, table.userId),
]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  purpose: text("purpose").notNull(), status: text("status").notNull().default("uploading"),
  mimeType: text("mime_type").notNull(), byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  contentSha256: bytea("content_sha256"), originalFilename: text("original_filename"),
  widthPx: integer("width_px"), heightPx: integer("height_px"),
  alternativeText: text("alternative_text"), caption: text("caption"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  deleteRequestedAt: timestamp("delete_requested_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaObjects = pgTable("media_objects", {
  mediaId: uuid("media_id").notNull().references(() => mediaAssets.id),
  variant: text("variant").notNull(), storageEnvironment: text("storage_environment").notNull(),
  objectKey: text("object_key").notNull().unique(), mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(), contentSha256: bytea("content_sha256").notNull(),
  storageVersionId: text("storage_version_id"), deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.mediaId, table.variant] })]);

export const profileMedia = pgTable("profile_media", {
  accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  slot: text("slot").notNull(), mediaId: uuid("media_id").notNull().references(() => mediaAssets.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.accountId, table.slot] })]);

export const profileFeedItems = pgTable("profile_feed_items", {
  id: uuid("id").defaultRandom().primaryKey(), accountId: uuid("account_id").notNull().references(() => creatorAccounts.id),
  mediaId: uuid("media_id").references(() => mediaAssets.id), externalUrl: text("external_url"),
  source: text("source").notNull(), mediaType: text("media_type").notNull(), caption: text("caption"),
  displayOrder: integer("display_order").notNull(), details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Migration 0029 owns composite ownership/category FKs, deferred ordering, guards and grants.
// These mappings do not authorize generated schema diffs to drop SQL-owned constraints.
const contentTimes = () => ({createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()});
export const entities=pgTable('entities',{
  id:uuid('id').primaryKey().defaultRandom(),kind:text('kind').notNull(),title:text('title').notNull(),origin:text('origin').notNull(),
  factsVersion:smallint('facts_version').notNull().default(1),searchDocument:tsvector('search_document').notNull().default(sql`''::tsvector`),...contentTimes(),
});
export const entityIdentifiers=pgTable('entity_identifiers',{
  entityId:uuid('entity_id').notNull(),provider:text('provider').notNull(),externalKind:text('external_kind').notNull(),
  externalId:text('external_id').notNull(),fetchedAt:timestamp('fetched_at',{withTimezone:true}).notNull().defaultNow(),sourceUrl:text('source_url'),
},t=>[primaryKey({columns:[t.provider,t.externalKind,t.externalId]})]);
export const collections=pgTable('collections',{
  id:uuid('id').primaryKey().defaultRandom(),accountId:uuid('account_id').notNull(),category:text('category').notNull(),
  title:text('title').notNull(),description:text('description'),descriptionRich:jsonb('description_rich'),slug:text('slug').notNull(),
  visibility:text('visibility').notNull().default('private'),publicationState:text('publication_state').notNull().default('draft'),
  displayOrder:integer('display_order').notNull(),pinOrder:integer('pin_order'),heading:text('heading'),
  revision:bigint('revision',{mode:'number'}).notNull().default(1),archivedAt:timestamp('archived_at',{withTimezone:true}),...contentTimes(),
},t=>[index('collections_owner_order_idx').on(t.accountId,t.category,t.displayOrder,t.id)]);
export const recommendations=pgTable('recommendations',{
  id:uuid('id').primaryKey().defaultRandom(),accountId:uuid('account_id').notNull(),entityId:uuid('entity_id').notNull(),
  category:text('category').notNull(),note:jsonb('note'),userRating:smallint('user_rating'),
  publicationState:text('publication_state').notNull().default('draft'),revision:bigint('revision',{mode:'number'}).notNull().default(1),
  archivedAt:timestamp('archived_at',{withTimezone:true}),...contentTimes(),
},t=>[index('recommendations_owner_id_idx').on(t.accountId,t.category,t.id)]);
// 0033 owns the composite account FK, schema-version/object CHECKs and triggers.
export const recommendationDisplayOverrides=pgTable('recommendation_display_overrides',{
  recommendationId:uuid('recommendation_id').primaryKey(),accountId:uuid('account_id').notNull(),
  schemaVersion:smallint('schema_version').notNull().default(1),displayValues:jsonb('display_values').notNull().default({}),
},t=>[index('recommendation_display_overrides_account_idx').on(t.accountId,t.recommendationId)]);
export const collectionItems=pgTable('collection_items',{
  collectionId:uuid('collection_id').notNull(),recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),
  category:text('category').notNull(),displayOrder:integer('display_order').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.collectionId,t.recommendationId]}),index('collection_items_owner_page_idx').on(t.accountId,t.category,t.recommendationId,t.collectionId),index('collection_items_owner_collection_order_idx').on(t.accountId,t.category,t.collectionId,t.displayOrder,t.recommendationId)]);
export const accountCategoryPinState=pgTable('account_category_pin_state',{
  accountId:uuid('account_id').notNull(),category:text('category').notNull(),revision:bigint('revision',{mode:'number'}).notNull().default(1),
},t=>[primaryKey({columns:[t.accountId,t.category]})]);
// 0031 owns the bounded category CHECK and tombstone-preserving RESTRICT FK.
// Decimal strings preserve revision identity without JS arithmetic/coercion.
export const accountCategoryContentState=pgTable('account_category_content_state',{
  accountId:uuid('account_id').notNull().references(()=>creatorAccounts.id,{onDelete:'restrict'}),
  category:text('category').notNull(),revision:bigint('revision',{mode:'bigint'}).notNull(),
},t=>[primaryKey({columns:[t.accountId,t.category]})]);
export const categoryRecommendationPins=pgTable('category_recommendation_pins',{
  accountId:uuid('account_id').notNull(),category:text('category').notNull(),recommendationId:uuid('recommendation_id').notNull(),
  collectionId:uuid('collection_id').notNull(),position:integer('position').notNull(),
},t=>[primaryKey({columns:[t.accountId,t.category,t.recommendationId]})]);
export const collectionMedia=pgTable('collection_media',{
  collectionId:uuid('collection_id').notNull(),accountId:uuid('account_id').notNull(),slot:text('slot').notNull(),mediaId:uuid('media_id').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.collectionId,t.slot]})]);
export const recommendationMedia=pgTable('recommendation_media',{
  recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),mediaId:uuid('media_id').notNull(),
  displayOrder:integer('display_order').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.recommendationId,t.mediaId]})]);
// 0043 owns the kind guard, URL scheme and price-tier CHECKs, indexes and grants.
export const appEntityDetails=pgTable('app_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),
 appUrl:text('app_url').notNull(),developer:text('developer'),logoUrl:text('logo_url'),description:text('description'),downloadUrl:text('download_url'),priceTier:text('price_tier'),platforms:text('platforms').array().notNull().default(sql`'{}'::text[]`),
});
// 0043 owns composite ownership FKs, the image guard and category revisions.
export const recommendationAppScreenshots=pgTable('recommendation_app_screenshots',{
 recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('apps'),slotIndex:integer('slot_index').notNull(),mediaId:uuid('media_id').notNull(),
},t=>[primaryKey({columns:[t.recommendationId,t.slotIndex]}),index('recommendation_app_screenshots_asset_idx').on(t.mediaId,t.accountId),index('recommendation_app_screenshots_account_idx').on(t.accountId,t.recommendationId)]);
// 0034 owns kind/category guards, cascading composite FK, revision triggers and grants.
export const bookEntityDetails=pgTable('book_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),
 subtitle:text('subtitle'),authors:text('authors').array().notNull().default(sql`'{}'::text[]`),publisher:text('publisher'),publishedDateText:text('published_date_text'),yearText:text('year_text'),description:text('description'),coverUrl:text('cover_url'),coverLargeUrl:text('cover_large_url'),subjects:text('subjects').array().notNull().default(sql`'{}'::text[]`),pageCount:integer('page_count'),isbn13:text('isbn_13'),isbn10:text('isbn_10'),providerRating:numeric('provider_rating',{precision:3,scale:2}),ratingsCount:bigint('ratings_count',{mode:'number'}),languageTag:text('language_tag'),previewUrl:text('preview_url'),
});
export const bookRecommendationContext=pgTable('book_recommendation_context',{
 recommendationId:uuid('recommendation_id').primaryKey(),accountId:uuid('account_id').notNull(),buyLinks:jsonb('buy_links').notNull().default([]),
},t=>[index('book_recommendation_context_account_idx').on(t.accountId,t.recommendationId)]);

// 0035 owns composite ownership FKs, image/reverse guards and category revisions.
export const recommendationBookCovers=pgTable('recommendation_book_covers',{
 recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),slot:text('slot').notNull(),mediaId:uuid('media_id').notNull(),
},t=>[primaryKey({columns:[t.recommendationId,t.slot]}),index('recommendation_book_covers_asset_idx').on(t.mediaId,t.accountId),index('recommendation_book_covers_account_idx').on(t.accountId,t.recommendationId)]);
// 0036 owns strict payload constraints, composite linkage, indexes and retention authority.
export const analyticsEvents=pgTable('analytics_events',{
 id:uuid('id').defaultRandom().primaryKey(),accountId:uuid('account_id').notNull(),clientEventId:text('client_event_id').notNull(),eventType:text('event_type').notNull(),page:text('page').notNull(),category:text('category'),collectionId:uuid('collection_id'),recommendationId:uuid('recommendation_id'),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull(),receivedAt:timestamp('received_at',{withTimezone:true}).notNull().defaultNow(),canonicalPath:text('canonical_path').notNull(),element:text('element'),referrerOrigin:text('referrer_origin'),utm:jsonb('utm').notNull().default({}),metadata:jsonb('metadata').notNull().default({}),countryCode:text('country_code'),consentVersion:text('consent_version').notNull(),
});
export const analyticsEventReceipts=pgTable('analytics_event_receipts',{
 accountId:uuid('account_id').notNull(),clientEventId:text('client_event_id').notNull(),inputHash:bytea('input_hash').notNull(),eventId:uuid('event_id'),acceptedAt:timestamp('accepted_at',{withTimezone:true}).notNull().defaultNow(),retiredAt:timestamp('retired_at',{withTimezone:true}),
},t=>[primaryKey({columns:[t.accountId,t.clientEventId]})]);

// 0037 owns all composite ownership/category FKs, deferred bounds, taxonomy tree guards and grants.
// These declarations are inventory mappings, not authority to replace SQL-owned constraints.
export const movieEntityDetails=pgTable('movie_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),mediaType:text('media_type').notNull(),originalTitle:text('original_title'),yearText:text('year_text'),posterUrl:text('poster_url'),backdropUrl:text('backdrop_url'),genres:text('genres').array().notNull().default(sql`'{}'::text[]`),director:text('director'),runtimeMinutes:integer('runtime_minutes'),providerRating:numeric('provider_rating',{precision:4,scale:2}),overview:text('overview'),seasonCount:integer('season_count'),watchProviders:jsonb('watch_providers').notNull().default({}),castDetails:jsonb('cast_details').notNull().default([]),
},t=>[index('movie_entity_details_genres_idx').using('gin',t.genres)]);
export const movieEntityProviderGenres=pgTable('movie_entity_provider_genres',{
 entityId:uuid('entity_id').notNull().references(()=>movieEntityDetails.entityId,{onDelete:'cascade'}),position:integer('position').notNull(),providerGenreId:bigint('provider_genre_id',{mode:'number'}).notNull(),name:text('name').notNull(),
},t=>[primaryKey({columns:[t.entityId,t.position]})]);
export const taxonomyTerms=pgTable('taxonomy_terms',{
 id:uuid('id').defaultRandom().primaryKey(),category:text('category').notNull(),parentId:uuid('parent_id'),slug:text('slug').notNull(),position:integer('position').notNull().default(0),active:boolean('active').notNull().default(true),
},t=>[index('taxonomy_terms_parent_position_idx').on(t.parentId,t.position,t.id)]);
export const taxonomyTermTranslations=pgTable('taxonomy_term_translations',{
 termId:uuid('term_id').notNull().references(()=>taxonomyTerms.id,{onDelete:'cascade'}),locale:text('locale').notNull(),label:text('label').notNull(),
},t=>[primaryKey({columns:[t.termId,t.locale]}),index('taxonomy_term_translations_locale_idx').on(t.locale,t.termId)]);
export const movieProviderGenreTerms=pgTable('movie_provider_genre_terms',{
 externalKind:text('external_kind').notNull(),providerGenreId:bigint('provider_genre_id',{mode:'number'}).notNull(),termId:uuid('term_id').notNull(),category:text('category').notNull().default('movies'),
},t=>[primaryKey({columns:[t.externalKind,t.providerGenreId]})]);
export const recommendationTaxonomy=pgTable('recommendation_taxonomy',{
 recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),category:text('category').notNull(),termId:uuid('term_id').notNull(),position:integer('position').notNull().default(0),
},t=>[primaryKey({columns:[t.recommendationId,t.termId]}),index('recommendation_taxonomy_term_idx').on(t.termId,t.recommendationId),index('recommendation_taxonomy_account_idx').on(t.accountId,t.recommendationId)]);
export const movieRecommendationContext=pgTable('movie_recommendation_context',{
 recommendationId:uuid('recommendation_id').primaryKey(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('movies'),region:text('region').notNull().default('US'),selectedProviderIds:bigint('selected_provider_ids',{mode:'number'}).array(),
},t=>[index('movie_recommendation_context_account_idx').on(t.accountId,t.recommendationId)]);

// 0048 owns the collection FK, the location kind guard and the snapshot shape. The
// snapshot is presentation; location_entity_id is identity, linked separately.
// 0049 owns both composite ownership FKs, the one-parent primary key and the category
// CHECKs. The parent key includes the places category, so a place recommendation id has
// nothing to reference.
export const collectionLocationLinks=pgTable('collection_location_links',{
 childCollectionId:uuid('child_collection_id').primaryKey(),accountId:uuid('account_id').notNull(),
 childCategory:text('child_category').notNull(),locationCollectionId:uuid('location_collection_id').notNull(),
 locationCategory:text('location_category').notNull().default('places'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('collection_location_links_location_idx').on(t.accountId,t.locationCollectionId,t.childCategory)]);
export const placeCollectionDetails=pgTable('place_collection_details',{
 collectionId:uuid('collection_id').primaryKey(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('places'),
 locationEntityId:uuid('location_entity_id').references(()=>entities.id,{onDelete:'restrict'}),
 locationSnapshot:jsonb('location_snapshot').notNull().default(sql`'{}'::jsonb`),instagramMediaUrl:text('instagram_media_url'),
},t=>[index('place_collection_details_location_idx').on(t.accountId,t.locationEntityId)]);

// 0050 owns the guide aggregate. Ticket 5.3.
//
// A guide is a `collections` row with category 'guides' plus these tables; its sections
// are NOT recommendations and NOT collection_items, so 0029's CHECKs on those two tables
// still omit 'guides' on purpose - that is what stops a guide being flattened into
// ordinary item rows. Section places are denormalised provider snapshots inside `blocks`,
// because a published itinerary has to keep saying what the author arranged.
//
// 0050 owns the composite ownership FKs, the deferrable section order, the block version
// CHECK and the registry-matches-JSON guard. It does NOT guard the parent's category:
// the composite FK is immediate NO ACTION and already refuses that.
export const guideCollectionDetails=pgTable('guide_collection_details',{
 collectionId:uuid('collection_id').primaryKey(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('guides'),
 guideType:text('guide_type'),multiCity:boolean('multi_city').notNull().default(false),numberOfDays:integer('number_of_days'),
 estimatedBudget:numeric('estimated_budget',{precision:14,scale:2}),budgetCurrency:text('budget_currency'),budgetType:text('budget_type'),
 bestTimeToVisit:jsonb('best_time_to_visit').notNull().default(sql`'[]'::jsonb`),categories:jsonb('categories').notNull().default(sql`'[]'::jsonb`),
 tags:jsonb('tags').notNull().default(sql`'[]'::jsonb`),tipsNotes:jsonb('tips_notes'),
 placeSnapshot:jsonb('place_snapshot').notNull().default(sql`'{}'::jsonb`),
 locationEntityId:uuid('location_entity_id').references(()=>entities.id,{onDelete:'restrict'}),
},t=>[index('guide_collection_details_account_idx').on(t.accountId,t.collectionId),index('guide_collection_details_entity_idx').on(t.locationEntityId)]);
export const guideSections=pgTable('guide_sections',{
 id:uuid('id').primaryKey().defaultRandom(),collectionId:uuid('collection_id').notNull(),accountId:uuid('account_id').notNull(),
 category:text('category').notNull().default('guides'),displayOrder:integer('display_order').notNull(),
 blockVersion:text('block_version').notNull(),title:text('title').notNull(),description:text('description'),
 blocks:jsonb('blocks').notNull(),archivedAt:timestamp('archived_at',{withTimezone:true}),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('guide_sections_order_idx').on(t.collectionId,t.displayOrder,t.id),index('guide_sections_account_idx').on(t.accountId,t.collectionId)]);
// The referential integrity for photo ids that travel inside a section's block JSON. JSON
// cannot hold a foreign key, so the layout lives in the JSON and the FK plus the
// purpose='guide' readiness guard live here; 0050's deferred trigger asserts the two agree.
// No UPDATE grant: a photo is attached or detached, never rewritten in place.
export const guideSectionPhotos=pgTable('guide_section_photos',{
 sectionId:uuid('section_id').notNull(),accountId:uuid('account_id').notNull(),mediaId:uuid('media_id').notNull(),
},t=>[primaryKey({columns:[t.sectionId,t.mediaId]}),index('guide_section_photos_asset_idx').on(t.mediaId,t.accountId),index('guide_section_photos_account_idx').on(t.accountId,t.sectionId)]);
// 0047 owns composite ownership FKs, the image readiness guard and category revisions.
// Provider photos are imported into owned media, so a place gallery is S3 bytes.
export const recommendationPlacePhotos=pgTable('recommendation_place_photos',{
 recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('places'),slotIndex:integer('slot_index').notNull(),mediaId:uuid('media_id').notNull(),
},t=>[primaryKey({columns:[t.recommendationId,t.slotIndex]}),index('recommendation_place_photos_asset_idx').on(t.mediaId,t.accountId),index('recommendation_place_photos_account_idx').on(t.accountId,t.recommendationId)]);
// 0046 owns the kind guards, the paired-coordinate invariant, URL schemes and grants.
export const placeEntityDetails=pgTable('place_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),
 formattedAddress:text('formatted_address'),addressComponents:jsonb('address_components').notNull().default(sql`'[]'::jsonb`),
 latitude:numeric('latitude',{precision:10,scale:7}),longitude:numeric('longitude',{precision:10,scale:7}),
 providerTypes:text('provider_types').array().notNull().default(sql`'{}'::text[]`),
 providerRating:numeric('provider_rating',{precision:3,scale:2}),ratingsCount:bigint('ratings_count',{mode:'number'}),
 publicPhone:text('public_phone'),publicPhoneNormalized:text('public_phone_normalized'),websiteUrl:text('website_url'),
 priceLevel:smallint('price_level'),priceRange:jsonb('price_range'),
});
// 0046 owns composite ownership FKs, the deferred type/kind invariant and revisions.
// contact_visibility defaults to private: disclosure is the creator's explicit choice.
export const placeRecommendationContext=pgTable('place_recommendation_context',{
 recommendationId:uuid('recommendation_id').primaryKey(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('places'),
 recommendationType:text('recommendation_type').notNull().default('place'),sourceOfRecommendation:text('source_of_recommendation').notNull().default('self'),
 contactName:text('contact_name'),contactNumber:text('contact_number'),contactVisibility:text('contact_visibility').notNull().default('private'),
 placeSocialUrl:text('place_social_url'),placeWebsiteUrl:text('place_website_url'),creatorSocialUrl:text('creator_social_url'),
 legacyPlaceNote:jsonb('legacy_place_note'),personProfileUrl:text('person_profile_url'),personAddress:text('person_address'),
},t=>[index('place_recommendation_context_account_idx').on(t.accountId,t.recommendationId)]);
// 0045 owns the kind guard, the social-link key set, URL schemes and grants. The table is
// insert-only for the runtime, so suppressed_at has no application write path at all.
export const personEntityDetails=pgTable('person_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),
 usernameHandle:text('username_handle'),headline:text('headline'),locationText:text('location_text'),avatarUrl:text('avatar_url'),
 primaryPlatform:text('primary_platform'),socialUrls:jsonb('social_urls').notNull().default(sql`'{}'::jsonb`),
 skillsTags:text('skills_tags').array().notNull().default(sql`'{}'::text[]`),externalFollowerCountText:text('external_follower_count_text'),
 suppressedAt:timestamp('suppressed_at',{withTimezone:true}),
});
// 0044 owns the kind guard, URL scheme CHECKs, the specifications shape and grants.
export const productEntityDetails=pgTable('product_entity_details',{
 entityId:uuid('entity_id').primaryKey().references(()=>entities.id,{onDelete:'cascade'}),
 productUrl:text('product_url').notNull(),brand:text('brand'),logoUrl:text('logo_url'),description:text('description'),
 specifications:jsonb('specifications').notNull().default(sql`'{}'::jsonb`),imageUrls:text('image_urls').array().notNull().default(sql`'{}'::text[]`),
});
// 0044 owns composite ownership FKs, the price CHECK and category revisions. price is
// numeric(20,6) and is read and written as an exact decimal string, never a float.
export const productRecommendationContext=pgTable('product_recommendation_context',{
 recommendationId:uuid('recommendation_id').primaryKey(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('products'),
 price:numeric('price',{precision:20,scale:6}),currencyCode:text('currency_code'),buyUrl:text('buy_url'),
},t=>[index('product_recommendation_context_price_idx').on(t.accountId,t.price,t.recommendationId)]);

// 0038 SQL owns source binding, inverse guards, immutable identity and grants.
export const recommendationMovieMedia=pgTable('recommendation_movie_media',{
 recommendationId:uuid('recommendation_id').notNull(),accountId:uuid('account_id').notNull(),category:text('category').notNull().default('movies'),sourceEntityId:uuid('source_entity_id').notNull(),sourceExternalKind:text('source_external_kind').notNull(),sourceExternalId:text('source_external_id').notNull(),sourceFetchedAt:bigint('source_fetched_at',{mode:'number'}).notNull(),sourceMappingVersion:smallint('source_mapping_version').notNull(),slot:text('slot').notNull(),slotIndex:integer('slot_index').notNull(),castOrdinal:integer('cast_ordinal'),personId:bigint('person_id',{mode:'number'}),creditId:text('credit_id'),mediaId:uuid('media_id').notNull(),
},t=>[primaryKey({columns:[t.recommendationId,t.slotIndex]}),index('recommendation_movie_media_asset_idx').on(t.mediaId,t.accountId),index('recommendation_movie_media_account_idx').on(t.accountId,t.recommendationId)]);
