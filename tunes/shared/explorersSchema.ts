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
