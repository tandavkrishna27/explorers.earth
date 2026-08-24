import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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
  accountManagerId: integer("account_manager_id").references(() => teamMembers.id),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  status: text("status").notNull(), // sent, delivered, bounced, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  apiTokenId: integer("api_token_id").references(() => apiTokens.id),
  messageId: text("message_id"), // AWS SES message ID
  metadata: jsonb("metadata").default({}),
  isTest: boolean("is_test").default(false),
  variables: text("variables")
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
export type User = typeof users.$inferSelect;
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
