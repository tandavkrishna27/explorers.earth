import { pgTable, text, serial, integer, timestamp, boolean, jsonb, bigint, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Team members table
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  regions: text("regions").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  otp: text("otp"),
  otpExpiry: timestamp("otp_expiry"),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  isEmailVerified: boolean("is_email_verified").default(false),
  guestUrl: text("guest_url").notNull().unique(),
  venueName: text("venue_name").notNull(),
  theme: jsonb("theme").default({ primary: '#6E56CF' }).notNull(),
  allowSongRequests: boolean("allow_song_requests").default(true).notNull(),
  allowGuestPlayOnDevice: boolean("allow_guest_play_on_device").default(true).notNull(),
  allowPlaylistSharing: boolean("allow_playlist_sharing").default(false).notNull(),
  allowRecentlyPlayedVisibility: boolean("allow_recently_played_visibility").default(true).notNull(),
  allowQueueVisibility: boolean("allow_queue_visibility").default(false).notNull(),
  accountManagerId: integer("account_manager_id").references(() => teamMembers.id),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Immutable server-owned identity projection. Username/email/Account names
  // remain mutable display snapshots and are never identity lookup keys.
  strapiUserDocumentId: text("strapi_user_document_id").notNull().unique(),
  strapiAccountDocumentId: text("strapi_account_document_id").notNull().unique(),
  strapiUsernameSnapshot: text("strapi_username_snapshot"),
  strapiEmailSnapshot: text("strapi_email_snapshot"),
  strapiProviderSnapshot: text("strapi_provider_snapshot").notNull().default("legacy-unknown").$type<"legacy-unknown" | "local" | "google">(),
  strapiAccountNameSnapshot: text("strapi_account_name_snapshot"),
  strapiAccountTypeSnapshot: text("strapi_account_type_snapshot"),
  strapiAccountMobileSnapshot: text("strapi_account_mobile_snapshot"),
  identityStatus: text("identity_status").notNull().default("active").$type<"active" | "suspended" | "pending_deletion">(),
  sessionVersion: integer("session_version").notNull().default(1),
  lastIdentitySyncAt: timestamp("last_identity_sync_at", { withTimezone: true }),
  entitlementState: text("entitlement_state").notNull().default("unknown").$type<"unknown" | "included" | "eligible" | "entitled" | "revoked">(),
  entitlementVersion: bigint("entitlement_version", { mode: "number" }).notNull().default(0),
  entitlementSourceUpdatedAt: timestamp("entitlement_source_updated_at", { withTimezone: true }),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  reconciliationObservationVersion: bigint("reconciliation_observation_version", { mode: "number" }).notNull().default(0),
  reconciliationMismatchCount: integer("reconciliation_mismatch_count").notNull().default(0),
  // Points to the migration-owned music_identity_lifecycle_operations control
  // table. It remains raw-repository-owned so legacy Drizzle insert/update
  // shapes cannot gain a lifecycle-operation mass-assignment surface. Nullable
  // since migration 0040: a canonically provisioned venue has no Strapi-keyed
  // lifecycle operation to reference, and the legacy path still supplies one.
  lifecycleOperationId: text("lifecycle_operation_id"),
  lifecycleState: text("lifecycle_state").notNull().default("none").$type<"none" | "requested" | "running" | "completed" | "failed" | "cancelled">(),
  lifecycleAttemptCount: integer("lifecycle_attempt_count").notNull().default(0),
  lifecycleLastAttemptAt: timestamp("lifecycle_last_attempt_at", { withTimezone: true }),
  lifecycleErrorCode: text("lifecycle_error_code"),
  lifecycleRetentionStage: text("lifecycle_retention_stage").notNull().default("identity-active"),
  guestCapabilityHash: text("guest_capability_hash").notNull().unique(),
  guestCapabilityIssuedAt: timestamp("guest_capability_issued_at", { withTimezone: true }).defaultNow().notNull(),
  guestCapabilityRotatedAt: timestamp("guest_capability_rotated_at", { withTimezone: true }),
  guestCapabilityRevokedAt: timestamp("guest_capability_revoked_at", { withTimezone: true }),
  guestDiscoverable: boolean("guest_discoverable").notNull().default(false),
  musicQueueRevision: bigint("music_queue_revision", { mode: "number" }).notNull().default(0),
});

export const musicOwnerOperations = pgTable("music_owner_operations", {
  musicUserId: integer("music_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  idempotencyKeyHash: text("idempotency_key_hash").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  responseBody: jsonb("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.musicUserId, table.operation, table.idempotencyKeyHash] })]);

// Migration-owned idempotency history. `musicUserId` deliberately has no
// reference to users: it must survive the user row and bind deletion replay to
// the retired numeric resource rather than only to a caller-provided saga ID.
export const musicIdentityLifecycleOperations = pgTable("music_identity_lifecycle_operations", {
  operationId: text("operation_id").primaryKey(),
  strapiUserDocumentId: text("strapi_user_document_id").notNull(),
  strapiAccountDocumentId: text("strapi_account_document_id").notNull(),
  musicUserId: integer("music_user_id"),
  operationKind: text("operation_kind").notNull(),
  requestedIdentityStatus: text("requested_identity_status").notNull(),
  operationState: text("operation_state").notNull().default("requested"),
  attemptCount: integer("attempt_count").notNull().default(0),
  resultSessionVersion: integer("result_session_version"),
  errorCode: text("error_code"),
  operationPhase: text("operation_phase").notNull().default("single"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Durable C5 credential-revocation idempotency history. It deliberately has
// no users foreign key so the immutable operation/resource tuple survives a
// later identity deletion.
export const musicCredentialRevocationOperations = pgTable("music_credential_revocation_operations", {
  operationId: text("operation_id").primaryKey(),
  musicUserId: integer("music_user_id").notNull(),
  strapiUserDocumentId: text("strapi_user_document_id").notNull(),
  strapiAccountDocumentId: text("strapi_account_document_id").notNull(),
  reason: text("reason").notNull().$type<"logout_all" | "entitlement_security_revocation" | "credential_compromise">(),
  expectedSessionVersion: integer("expected_session_version").notNull(),
  resultSessionVersion: integer("result_session_version").notNull(),
  operationState: text("operation_state").notNull().default("completed").$type<"completed">(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const musicIdentityTombstones = pgTable("music_identity_tombstones", {
  strapiUserDocumentId: text("strapi_user_document_id").primaryKey(),
  strapiAccountDocumentId: text("strapi_account_document_id").notNull().unique(),
  musicUserId: integer("music_user_id").unique(),
  reason: text("reason").notNull(),
  lifecycleOperationId: text("lifecycle_operation_id").notNull().unique()
    .references(() => musicIdentityLifecycleOperations.operationId),
  retentionStage: text("retention_stage").notNull().default("tombstone-retained"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Add playlists table
export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  isVisibleToGuests: boolean("is_visible_to_guests").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SongStatus = 'queued' | 'playing' | 'played';

export const songs = pgTable("songs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  youtubeId: text("youtube_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  position: integer("position").notNull(),
  status: text("status").notNull().default('queued').$type<SongStatus>(),
  playedAt: timestamp("played_at"),
});

export const playedSongs = pgTable("played_songs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  songId: integer("song_id").notNull().references(() => songs.id),
  playedAt: timestamp("played_at").defaultNow().notNull(),
});

// Add playlist_songs junction table
export const playlistSongs = pgTable("playlist_songs", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull().references(() => playlists.id),
  // Remove song_id reference and add direct song fields
  youtubeId: text("youtube_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  position: integer("position").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

// New table for tracking guest views and interactions
export const guestInteractions = pgTable("guest_interactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  guestId: text("guest_id").notNull(),
  pageView: boolean("page_view").default(true),
  songRequest: boolean("song_request").default(false),
  interactionType: text("interaction_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sessionDuration: integer("session_duration"),
});

// Add new youtube_api_usage table
export const youtubeApiUsage = pgTable("youtube_api_usage", {
  id: serial("id").primaryKey(),
  endpointType: text("endpoint_type").notNull(),
  userId: integer("user_id").references(() => users.id),
  quotaCost: integer("quota_cost").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// New table for user sessions
export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  lastActiveAt: timestamp("last_active_at"),
  deviceInfo: jsonb("device_info"),
  ipAddress: text("ip_address"),
  countryCode: text("country_code"),
  region: text("region"),
  geoData: jsonb("geo_data"),
});

// New table for activity logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// New table for analytics snapshots
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  snapshotDate: timestamp("snapshot_date").notNull(),
  totalViews: integer("total_views").notNull(),
  totalSongRequests: integer("total_song_requests").notNull(),
  averageSessionDuration: integer("average_session_duration"),
  totalPlaylistsCreated: integer("total_playlists_created").notNull(),
  totalSongsPlayed: integer("total_songs_played").notNull(),
  additionalMetrics: jsonb("additional_metrics"),
});

// Idempotency receipts for explorers.earth analytics ingestion. The event
// payload remains in Strapi; this table stores only delivery state and hashes,
// never visitor IP addresses or analytics metadata.
export const explorersAnalyticsReceipts = pgTable("explorers_analytics_receipts", {
  eventId: text("event_id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull().default("pending"),
  strapiDocumentId: text("strapi_document_id"),
  lastError: text("last_error"),
  leaseId: text("lease_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Add user_activity table
export const userActivity = pgTable("user_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  path: text("path").notNull(),
  method: text("method").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Session table for express-session
export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// API Tokens table
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  description: text("description"),
  scopes: text("scopes").array().notNull().default([]),
  isAppWide: boolean("is_app_wide").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  expiresInDays: integer("expires_in_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").default(true).notNull(),
});

// Add new userProfiles table
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profilePicture: text("profile_picture"), // Store base64 encoded image
  countryCode: text("country_code"),
  phoneNumber: text("phone_number"),

  // Address fields
  streetName: text("street_name"),
  state: text("state"),
  city: text("city"),
  country: text("country"),
  postalCode: text("postal_code"),

  // Social media URLs
  instagramUrl: text("instagram_url"),
  facebookUrl: text("facebook_url"),
  youtubeUrl: text("youtube_url"),
  twitterUrl: text("twitter_url"),
  whatsappUrl: text("whatsapp_url"),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Email templates table
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  html_content: text("html_content").notNull(),
  text_content: text("text_content").notNull(),
  variables: jsonb("variables").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  isActive: boolean("is_active").default(true).notNull()
});

// Email logs table
export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  templateId: integer("template_id").references(() => emailTemplates.id),
  status: text("status").notNull(), // pending, sent, delivered, bounced, failed, suppressed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  apiTokenId: integer("api_token_id").references(() => apiTokens.id),
  messageId: text("message_id"), // Resend message id
  metadata: jsonb("metadata").default({}),
  isTest: boolean("is_test").default(false),
  variables: text("variables")
});

/**
 * Addresses that must not be contacted. Decision D2, 2026-10-08. DDL lives in
 * migration 0051; this is the access definition for the one sender that exists.
 *
 * Keyed on the ADDRESS, not an account: a bounce, a complaint and an unsubscribe click all
 * arrive carrying nothing but an address, and an address that never had an account can
 * still land here.
 *
 * `email` is always stored normalised - lower(btrim(...)) - and the migration enforces it
 * with a CHECK, so writes must normalise before inserting or the send-time lookup will
 * never match the row. Use `normalizeSuppressionEmail`.
 *
 * There is no UPDATE or DELETE grant for the runtime role. Un-suppressing an address is the
 * one operation here that can cause mail to reach somebody who asked for none.
 */
export const emailSuppressions = pgTable("email_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  reason: text("reason").notNull(), // unsubscribe, bounce, complaint, manual
  source: text("source"),
  suppressedAt: timestamp("suppressed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * The single normalisation rule for a suppression address. Migration 0051 enforces the same
 * rule as a CHECK, so this is the only shape that can be written.
 */
export function normalizeSuppressionEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const insertEmailSuppressionSchema = createInsertSchema(emailSuppressions).pick({
  email: true,
  reason: true,
  source: true,
});

// Add relations
export const usersRelations = relations(users, ({ one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

// Define insert schemas
export const insertTeamMemberSchema = createInsertSchema(teamMembers).pick({
  name: true,
  role: true,
  regions: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  venueName: true,
}).extend({
  email: z.string().email().optional(),
  _csrf: z.string().optional(),
  phoneNumber: z.string().optional(),
  countryCode: z.string().optional(),
});

export const insertSongSchema = createInsertSchema(songs).pick({
  youtubeId: true,
  title: true,
  artist: true,
  thumbnailUrl: true,
  position: true,
});

export const themeSchema = z.object({
  primary: z.string()
});

export const insertPlaylistSchema = createInsertSchema(playlists).pick({
  name: true,
  description: true,
  isVisibleToGuests: true,
});

export const insertPlaylistSongSchema = createInsertSchema(playlistSongs).pick({
  youtubeId: true,
  title: true,
  artist: true,
  thumbnailUrl: true,
  position: true,
});

export const insertYoutubeApiUsageSchema = createInsertSchema(youtubeApiUsage).pick({
  endpointType: true,
  userId: true,
});

// Add insert schema for userProfiles
export const insertUserProfileSchema = createInsertSchema(userProfiles)
  .pick({
    firstName: true,
    lastName: true,
    profilePicture: true,
    countryCode: true,
    phoneNumber: true,
    streetName: true,
    state: true,
    city: true,
    country: true,
    postalCode: true,
    instagramUrl: true,
    facebookUrl: true,
    youtubeUrl: true,
    twitterUrl: true,
    whatsappUrl: true,
  })
  .extend({
    profilePicture: z.string().optional(), // Store as base64 string
  });

// Add insert schema for API tokens
export const insertApiTokenSchema = createInsertSchema(apiTokens)
  .pick({
    name: true,
    userId: true,
    description: true,
    scopes: true,
    isAppWide: true,
    expiresAt: true,
    expiresInDays: true,
  })
  .extend({
    expiresAt: z.date().optional(),
    scopes: z.array(z.string()).default([]),
  });

// Add insert schema for email templates
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates)
  .pick({
    name: true,
    subject: true,
    html_content: true,
    text_content: true,
    variables: true,
    createdBy: true,
    isActive: true,
  })
  .extend({
    variables: z.record(z.string(), z.string()).default({}),
  });

// Add insert schema for email logs
export const insertEmailLogSchema = createInsertSchema(emailLogs)
  .pick({
    recipient: true,
    subject: true,
    templateId: true,
    status: true,
    errorMessage: true,
    apiTokenId: true,
    messageId: true,
    metadata: true,
  })
  .extend({
    metadata: z.record(z.string(), z.any()).default({}),
  });

// Export types
export type Theme = z.infer<typeof themeSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type MusicIdentityFields = Pick<typeof users.$inferSelect,
  | "strapiUserDocumentId"
  | "strapiAccountDocumentId"
  | "strapiUsernameSnapshot"
  | "strapiEmailSnapshot"
  | "strapiProviderSnapshot"
  | "strapiAccountNameSnapshot"
  | "strapiAccountTypeSnapshot"
  | "strapiAccountMobileSnapshot"
  | "identityStatus"
  | "sessionVersion"
  | "lastIdentitySyncAt"
  | "entitlementState"
  | "entitlementVersion"
  | "entitlementSourceUpdatedAt"
  | "lastReconciledAt"
  | "reconciliationObservationVersion"
  | "reconciliationMismatchCount"
  | "lifecycleOperationId"
  | "lifecycleState"
  | "lifecycleAttemptCount"
  | "lifecycleLastAttemptAt"
  | "lifecycleErrorCode"
  | "lifecycleRetentionStage"
  | "guestCapabilityHash"
  | "guestCapabilityIssuedAt"
  | "guestCapabilityRotatedAt"
  | "guestCapabilityRevokedAt"
  | "guestDiscoverable"
>;
// Legacy route/application code receives only its pre-C3 user projection.
// New identity/lifecycle code must use MusicIdentityRepository so immutable
// fields cannot accidentally become mass-assignment inputs in Task 4.
export type User = Omit<typeof users.$inferSelect, keyof MusicIdentityFields>;
export type Song = typeof songs.$inferSelect;
export type InsertSong = z.infer<typeof insertSongSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type PlayedSong = typeof playedSongs.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type InsertPlaylistSong = z.infer<typeof insertPlaylistSongSchema>;
export type GuestInteraction = typeof guestInteractions.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type UserActivity = typeof userActivity.$inferSelect;
export type YoutubeApiUsage = typeof youtubeApiUsage.$inferSelect;
export type InsertYoutubeApiUsage = z.infer<typeof insertYoutubeApiUsageSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type InsertEmailSuppression = z.infer<typeof insertEmailSuppressionSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// Page content tables
export const pageContents = pgTable("page_contents", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // 'terms', 'privacy', etc.
  title: text("title").notNull(),
  content: text("content").notNull(), // HTML/rich text content
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  isPublished: boolean("is_published").default(true).notNull(),
});

// Add insert schema for page contents
export const insertPageContentSchema = createInsertSchema(pageContents)
  .pick({
    slug: true,
    title: true,
    content: true,
    createdBy: true,
    isPublished: true,
  });

// SEO settings table
export const seoSettings = pgTable("seo_settings", {
  id: serial("id").primaryKey(),
  siteTitle: text("site_title").notNull(),
  metaDescription: text("meta_description").notNull(),
  metaKeywords: text("meta_keywords").notNull(),
  ogTitle: text("og_title").notNull(),
  ogDescription: text("og_description").notNull(),
  ogImage: text("og_image").notNull(),
  twitterTitle: text("twitter_title").notNull(),
  twitterDescription: text("twitter_description").notNull(),
  twitterImage: text("twitter_image").notNull(),
  googleAnalyticsId: text("google_analytics_id"),
  facebookPixelId: text("facebook_pixel_id"),
  googleTagManagerId: text("google_tag_manager_id"),
  microsoftClarityId: text("microsoft_clarity_id"),
  robotsTxt: text("robots_txt").notNull(),
  sitemapXml: text("sitemap_xml").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
});

// Add insert schema for SEO settings
export const insertSeoSettingsSchema = createInsertSchema(seoSettings)
  .pick({
    siteTitle: true,
    metaDescription: true,
    metaKeywords: true,
    ogTitle: true,
    ogDescription: true,
    ogImage: true,
    twitterTitle: true,
    twitterDescription: true,
    twitterImage: true,
    googleAnalyticsId: true,
    facebookPixelId: true,
    googleTagManagerId: true,
    microsoftClarityId: true,
    robotsTxt: true,
    sitemapXml: true,
    isActive: true,
    updatedBy: true,
  });

export type PageContent = typeof pageContents.$inferSelect;
export type InsertPageContent = z.infer<typeof insertPageContentSchema>;
export type SeoSettings = typeof seoSettings.$inferSelect;
export type InsertSeoSettings = z.infer<typeof insertSeoSettingsSchema>;

// System Settings table for application-wide configuration
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., "app_url", "email_from", etc.
  value: text("value").notNull(),
  description: text("description"),
  isSecret: boolean("is_secret").default(false).notNull(), // Whether this is a sensitive value that should be masked in UI
  category: text("category").notNull(), // e.g., "urls", "email", "integrations", etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
});

// Add insert schema for System Settings
export const insertSystemSettingSchema = createInsertSchema(systemSettings)
  .pick({
    key: true,
    value: true,
    description: true,
    isSecret: true,
    category: true,
    updatedBy: true,
  });

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
