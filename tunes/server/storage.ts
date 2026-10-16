import {
  users,
  songs,
  type User,
  type InsertUser,
  type Song,
  type SongStatus,
  playlists,
  playlistSongs,
  userActivity,
  teamMembers,
  youtubeApiUsage,
  userSessions,
  type UserSession,
  type YoutubeApiUsage,
  type InsertYoutubeApiUsage,
  userProfiles,
  type UserProfile,
  type InsertUserProfile,
  apiTokens,
  guestInteractions,
  analyticsSnapshots,
  activityLogs,
  playedSongs,
  type ApiToken,
  type InsertApiToken,
  type TeamMember,
  type InsertTeamMember,
  type Playlist,
  type InsertPlaylist,
  type InsertPlaylistSong,
  type InsertSong,
  type PlaylistSong,
  emailTemplates,
  emailLogs,
  type EmailTemplate,
  type InsertEmailTemplate,
  type EmailLog,
  type InsertEmailLog,
  pageContents,
  type PageContent,
  type InsertPageContent,
  seoSettings,
  type SeoSettings,
  type InsertSeoSettings,
  systemSettings,
  type SystemSetting,
  type InsertSystemSetting,
  emailSuppressions,
  normalizeSuppressionEmail,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray, count, gte, lt, gt, lte, or, like, isNotNull, isNull } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { sanitizeUser } from "./utils/sanitize-user";

/** Admin user-list row: sanitized user fields (no secrets) + the accountManager join. */
export type AdminUserListRow = Record<string, any> & {
  accountManager: { name: string; role: string } | null;
};

type UserCreationIdentity = Pick<typeof users.$inferInsert,
  "strapiUserDocumentId" | "strapiAccountDocumentId" | "lifecycleOperationId" | "guestCapabilityHash">;
type UserCreationInput = InsertUser & UserCreationIdentity;

const MemoryStore = createMemoryStore(session);
const PgStore = connectPgSimple(session);

export interface IStorage {
  // Existing methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGuestUrl(guestUrl: string): Promise<User | undefined>;
  createUser(user: UserCreationInput): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  updateUserPassword(id: number, newPassword: string): Promise<void>;
  getSongs(userId: number): Promise<Song[]>;
  addSong(userId: number, song: InsertSong): Promise<Song>;
  removeSong(userId: number, songId: number): Promise<void>;
  removeMultipleSongs(userId: number, songIds: number[]): Promise<void>;
  clearHistory(userId: number): Promise<void>;
  updateSongPosition(userId: number, songId: number, newPosition: number): Promise<void>;
  getCurrentlyPlaying(userId: number): Promise<Song | undefined>;
  setCurrentlyPlaying(userId: number, songId: number | null): Promise<void>;
  getPlayedSongs(userId: number): Promise<Song[]>;
  sessionStore: session.Store;

  // Updated admin methods
  getAllUsers(page: number, limit: number): Promise<{ users: AdminUserListRow[]; total: number }>;
  updateUserAccountManager(userId: number, accountManagerId: number | null): Promise<void>;
  getUserStats(): Promise<{
    total: number;
    active: number;
    totalPlaylists: number;
    avgSongsPerHost: number;
    totalGuests: number;
    totalSongRequests: number;
    peakHours: string;
    avgSessionDuration: string;
    regionalStats: {
      [key: string]: {
        hostCount: number;
        guestCount: number;
        songRequestCount: number;
      };
    };
  }>;
  deleteUser(id: number, operationId?: string): Promise<MusicIdentityDeletionResult>;
  getUserActivity(userId: number): Promise<{ totalSongs: number; lastActive?: Date }>;

  // New team management methods
  getTeamMembers(): Promise<TeamMember[]>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  deleteTeamMember(id: number): Promise<void>;
  updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember>;

  // New method for system metrics
  getActiveConnections(): Promise<number>;

  // Add new methods for OTP handling
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserOTP(id: number, otp: string, expiry: Date): Promise<void>;
  clearUserOTP(id: number): Promise<void>;

  // Playlist management methods
  getPlaylists(userId: number): Promise<Playlist[]>;
  getPlaylistById(id: number): Promise<Playlist | undefined>;
  createPlaylist(userId: number, playlist: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: number, updates: Partial<Playlist>): Promise<Playlist>;
  deletePlaylist(id: number): Promise<void>;
  addSongToPlaylist(playlistId: number, song: InsertPlaylistSong): Promise<void>;
  removeSongFromPlaylist(playlistId: number, songId: number): Promise<void>;
  getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]>;
  addSongsToPlaylist(playlistId: number, songsToAdd: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }[]): Promise<void>;
  reorderPlaylistSong(playlistId: number, songId: number, newPosition: number): Promise<void>;
  logUserActivity(userId: number, path: string, method: string): Promise<void>;

  // Add new methods for YouTube API usage
  logYoutubeApiUsage(data: InsertYoutubeApiUsage): Promise<YoutubeApiUsage>;
  getYoutubeApiUsageStats(): Promise<{
    total: number;
    weeklyAvg: number;
    monthlyTotal: number;
    daily: { date: string; count: number; endpoint_type: string }[];
  }>;
  deleteUserPlaylists(userId: number): Promise<void>;
  deleteUserSongs(userId: number): Promise<void>;
  removeSongsFromPlaylists(playlistIds: number[]): Promise<void>;
  cleanupUserSessions(userId: number): Promise<void>;

  // Add to IStorage interface
  updatePlaylistVisibility(playlistId: number, isVisible: boolean): Promise<void>;

  // Add new methods for user profiles
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(userId: number, profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, profile: Partial<InsertUserProfile>): Promise<UserProfile>;
  deleteUserProfile(userId: number): Promise<void>;

  // Add new methods for user devices
  getUserSessions(userId: number): Promise<UserSession[]>;
  createUserSession(
    userId: number,
    sessionId: string,
    ipAddress: string,
    deviceInfo: any,
    countryCode?: string,
    region?: string,
    geoData?: string | null
  ): Promise<UserSession>;
  terminateUserSession(sessionId: number): Promise<void>;

  // API token management methods
  createApiToken(data: InsertApiToken, tokenString: string): Promise<ApiToken>;
  getApiTokens(userId?: number): Promise<ApiToken[]>;
  getApiTokenById(id: number): Promise<ApiToken | undefined>;
  getApiTokenByToken(token: string): Promise<ApiToken | undefined>;
  updateApiTokenLastUsed(id: number): Promise<void>;
  deactivateApiToken(id: number): Promise<void>;
  deleteApiToken(id: number): Promise<void>;

  // Email management methods
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplateById(id: number): Promise<EmailTemplate | undefined>;
  getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined>;
  updateEmailTemplate(id: number, updates: Partial<EmailTemplate>): Promise<EmailTemplate>;
  deleteEmailTemplate(id: number): Promise<void>;

  // Email suppression (decision D2). Honoured before every send.
  isEmailSuppressed(email: string): Promise<boolean>;

  // Email logs methods
  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(page?: number, limit?: number): Promise<{ logs: EmailLog[]; total: number }>;
  getEmailLogsByApiToken(apiTokenId: number, page?: number, limit?: number): Promise<{ logs: EmailLog[]; total: number }>;
  getEmailLogsByRecipient(recipient: string, page?: number, limit?: number): Promise<{ logs: EmailLog[]; total: number }>;
  getEmailLogsByStatus(status: string, page?: number, limit?: number): Promise<{ logs: EmailLog[]; total: number }>;
  updateEmailLogStatus(id: number, status: string, messageId?: string, errorMessage?: string): Promise<void>;
  getEmailStats(): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    daily: { date: string; count: number; status: string }[];
  }>;

  // Page content management methods
  getPageContentBySlug(slug: string): Promise<PageContent | undefined>;
  getAllPageContents(): Promise<PageContent[]>;
  createPageContent(content: InsertPageContent): Promise<PageContent>;
  updatePageContent(id: number, updates: Partial<PageContent>): Promise<PageContent>;
  deletePageContent(id: number): Promise<void>;

  // SEO settings management methods
  getSeoSettings(): Promise<SeoSettings | undefined>;
  updateSeoSettings(updates: Partial<SeoSettings>): Promise<SeoSettings>;

  // Email verification methods
  updateUserVerificationToken(userId: number, token: string, expiryDate: Date): Promise<boolean>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  markEmailAsVerified(userId: number): Promise<boolean>;

  // System settings management methods
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getSystemSettings(category?: string): Promise<SystemSetting[]>;
  createSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting>;
  updateSystemSetting(data: {
    id: number;
    key: string;
    value: string;
    description?: string;
    category: string;
    isSecret?: boolean;
    updatedBy?: number;
  }): Promise<SystemSetting>;
  deleteSystemSetting(key: string): Promise<void>;

  // Get raw database connection for direct SQL queries
  getConnection(): any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    try {
      console.log("Initializing session store with PostgreSQL");
      this.sessionStore = new PgStore({
        pool: pool,
        tableName: 'session', // Default
        createTableIfMissing: false,
        pruneSessionInterval: 60 * 60 // Prune expired sessions every hour (in seconds)
      });
      console.log("Session store initialized successfully");
    } catch (error) {
      console.error("Failed to initialize session store:", error);
      // Fallback to memory store if PostgreSQL connection fails
      console.log("Falling back to memory store for sessions");
      this.sessionStore = new MemoryStore({
        checkPeriod: 60 * 60 * 1000 // Prune expired sessions every hour (in milliseconds)
      });
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    console.log('Getting user by ID:', id);
    const [user] = await db.select().from(users).where(eq(users.id, id));
    console.log('Retrieved user:', user ? { ...user, password: '[REDACTED]' } : undefined);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log('Getting user by username:', username);
    const [user] = await db.select().from(users).where(eq(users.username, username));
    console.log('Retrieved user:', user ? { ...user, password: '[REDACTED]' } : undefined);
    return user;
  }

  async getUserByGuestUrl(guestUrl: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.guestUrl, guestUrl));
    return user;
  }

  async createUser(insertUser: UserCreationInput): Promise<User> {
    console.log('Creating user with server-owned identity:', { username: insertUser.username });
    const { strapiUserDocumentId, strapiAccountDocumentId, lifecycleOperationId, guestCapabilityHash } = insertUser;
    if (!strapiUserDocumentId || !strapiAccountDocumentId || !lifecycleOperationId || !guestCapabilityHash) {
      throw new Error('Legacy user creation requires server-owned identity fields');
    }
    const guestUrl = randomBytes(16).toString('hex');
    const [user] = await db.insert(users)
      .values({ ...insertUser, strapiUserDocumentId, strapiAccountDocumentId, lifecycleOperationId,
        guestCapabilityHash, guestUrl, theme: { primary: '#6E56CF' } })
      .returning();
    console.log('Created user:', { id: user.id, username: user.username });
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    console.log('Updating user:', { id, ...updates, password: updates.password ? '[REDACTED]' : undefined });
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    console.log('Updated user:', { ...user, password: '[REDACTED]' });
    return user;
  }

  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    console.log('Updating password for user:', id);
    try {
      await db.update(users)
        .set({ password: newPassword })
        .where(eq(users.id, id));
      console.log('Password updated successfully');
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }

  async getSongs(userId: number): Promise<Song[]> {
    console.log('Getting songs for user:', userId);
    const result = await db.select()
      .from(songs)
      .where(and(
        eq(songs.userId, userId),
        eq(songs.status, 'queued')
      ))
      .orderBy(songs.position);
    console.log('Found queued songs:', result.length);
    return result;
  }

  async addSong(userId: number, song: InsertSong): Promise<Song> {
    console.log('Adding song for user:', userId);
    const [newSong] = await db.transaction(async (tx) => {
      const existingSongs = await tx.select()
        .from(songs)
        .where(and(
          eq(songs.userId, userId),
          eq(songs.status, 'queued')
        ))
        .orderBy(desc(songs.position));  // Order by position descending to get max position first

      // Get the highest position and add 1, or use 0 if no songs exist
      const position = existingSongs.length > 0 ? existingSongs[0].position + 1 : 0;

      return tx.insert(songs)
        .values({ ...song, userId, position, status: 'queued' })
        .returning();
    });

    console.log('Added song:', newSong);
    return newSong;
  }

  async removeSong(userId: number, songId: number): Promise<void> {
    console.log('Removing song:', songId, 'for user:', userId);
    await db.transaction(async (tx) => {
      // Get the position of the song to be removed
      const [songToRemove] = await tx.select()
        .from(songs)
        .where(and(
          eq(songs.id, songId),
          eq(songs.userId, userId)
        ));

      if (!songToRemove) return;

      // Delete the song
      await tx.delete(songs)
        .where(and(
          eq(songs.id, songId),
          eq(songs.userId, userId)
        ));

      // If the song was in the queue, update positions of remaining songs
      if (songToRemove.status === 'queued') {
        await tx.update(songs)
          .set({
            position: sql`${songs.position} - 1`
          })
          .where(and(
            eq(songs.userId, userId),
            eq(songs.status, 'queued'),
            sql`position > ${songToRemove.position}`
          ));
      }
    });
  }

  async removeMultipleSongs(userId: number, songIds: number[]): Promise<void> {
    console.log('Removing multiple songs:', songIds, 'for user:', userId);
    try {
      await db.transaction(async (tx) => {
        // Get the songs to be removed
        const songsToRemove = await tx.select()
          .from(songs)
          .where(and(
            eq(songs.userId, userId),
            inArray(songs.id, songIds)
          ));

        if (!songsToRemove.length) {
          console.log('No songs found to remove');
          return;
        }

        console.log('Found songs to remove:', songsToRemove.map(s => ({
          id: s.id,
          title: s.title,
          status: s.status,
          position: s.position
        })));

        // Delete the selected songs first
        await tx.delete(songs)
          .where(and(
            eq(songs.userId, userId),
            inArray(songs.id, songIds)
          ));

        // Then update positions for remaining queued songs
        const queuedSongsToRemove = songsToRemove.filter(s => s.status === 'queued');
        if (queuedSongsToRemove.length > 0) {
          const remainingQueuedSongs = await tx.select()
            .from(songs)
            .where(and(
              eq(songs.userId, userId),
              eq(songs.status, 'queued')
            ))
            .orderBy(songs.position);

          // Update positions sequentially
          for (let i = 0; i < remainingQueuedSongs.length; i++) {
            await tx.update(songs)
              .set({ position: i })
              .where(eq(songs.id, remainingQueuedSongs[i].id));
          }
        }

        console.log('Successfully removed songs and updated positions');
      });
    } catch (error) {
      console.error('Error in removeMultipleSongs:', error);
      throw error;
    }
  }

  async clearHistory(userId: number): Promise<void> {
    console.log('Clearing history for user:', userId);

    // Get all songs in history before deleting
    const historyToDelete = await db.select()
      .from(songs)
      .where(and(
        eq(songs.userId, userId),
        eq(songs.status, 'played')
      ));

    console.log('Found history songs to delete:', historyToDelete.map(s => ({ id: s.id, title: s.title })));

    // Delete all played songs
    await db.delete(songs)
      .where(and(
        eq(songs.userId, userId),
        eq(songs.status, 'played')
      ));
  }

  async updateSongPosition(userId: number, songId: number, newPosition: number): Promise<void> {
    console.log('Updating song position:', { userId, songId, newPosition });

    await db.transaction(async (tx) => {
      // Get all queued songs in current order
      const queuedSongs = await tx.select()
        .from(songs)
        .where(and(
          eq(songs.userId, userId),
          eq(songs.status, 'queued')
        ))
        .orderBy(songs.position);

      console.log('Current queued songs:', queuedSongs.map(s => ({ id: s.id, position: s.position })));

      // Find the song we want to move
      const currentIndex = queuedSongs.findIndex(s => s.id === songId);
      if (currentIndex === -1) {
        console.error('Song not found in queue:', songId);
        throw new Error('Song not found in queue');
      }

      // Validate new position
      if (newPosition < 0 || newPosition >= queuedSongs.length) {
        console.error('Invalid target position:', newPosition);
        throw new Error('Invalid position');
      }

      // Remove song from current position and insert at new position
      const [songToMove] = queuedSongs.splice(currentIndex, 1);
      queuedSongs.splice(newPosition, 0, songToMove);

      console.log('Reordered songs:', queuedSongs.map(s => ({ id: s.id })));

      // Update all positions sequentially
      for (let i = 0; i < queuedSongs.length; i++) {
        await tx.update(songs)
          .set({ position: i })
          .where(eq(songs.id, queuedSongs[i].id));
      }

      console.log('Successfully updated all positions');
    });
  }

  async getCurrentlyPlaying(userId: number): Promise<Song | undefined> {
    try {
      console.log('Getting currently playing song for user:', userId);
      const [song] = await db.select()
        .from(songs)
        .where(and(
          eq(songs.userId, userId),
          eq(songs.status, 'playing')
        ));

      console.log('Found currently playing song:', song);
      return song;
    } catch (error) {
      console.error('Error getting currently playing song:', error);
      return undefined;
    }
  }

  async setCurrentlyPlaying(userId: number, songId: number | null): Promise<void> {
    try {
      console.log('Setting currently playing song:', { userId, songId });

      await db.transaction(async (tx) => {
        // First, update any currently playing song to played status
        const [currentlyPlaying] = await tx.select()
          .from(songs)
          .where(and(
            eq(songs.userId, userId),
            eq(songs.status, 'playing')
          ));

        if (currentlyPlaying) {
          await tx.update(songs)
            .set({
              status: 'played',
              playedAt: new Date()
            })
            .where(eq(songs.id, currentlyPlaying.id));
        }

        // Then, if we have a new song to play, update its status
        if (songId !== null) {
          await tx.update(songs)
            .set({ status: 'playing' })
            .where(eq(songs.id, songId));
        }
      });
    } catch (error) {
      console.error('Error setting currently playing song:', error);
    }
  }

  async getPlayedSongs(userId: number): Promise<Song[]> {
    try {
      console.log('Getting played songs for user:', userId);

      const played = await db.select()
        .from(songs)
        .where(and(
          eq(songs.userId, userId),
          eq(songs.status, 'played')
        ))
        .orderBy(desc(songs.playedAt))
        .limit(50);

      console.log('Retrieved played songs:', {
        userId,
        count: played.length,
        songs: played.map(s => ({ id: s.id, title: s.title }))
      });

      return played;
    } catch (error) {
      console.error('Error getting played songs:', error);
      return [];
    }
  }


  async getAllUsers(page: number = 1, limit: number = 10, searchTerm?: string): Promise<{ users: AdminUserListRow[]; total: number }> {
    console.log('Getting all users with pagination:', { page, limit, searchTerm });
    const offset = (page - 1) * limit;

    try {
      let query = db.select().from(users).$dynamic();

      // Apply search if term is provided
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        query = query.where(
          or(
            like(users.username, searchPattern),
            like(users.venueName, searchPattern),
            like(users.email, searchPattern)
          )
        );
      }

      // First get total count with search applied
      const [countResult] = await db
        .select({ value: count() })
        .from(query.as('filtered_users'));

      // Then get paginated users with join to team members
      let userQuery = db
        .select({
          user: users,
          manager: teamMembers
        })
        .from(users)
        .leftJoin(teamMembers, eq(users.accountManagerId, teamMembers.id))
        .$dynamic();

      // Apply search if term is provided
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        userQuery = userQuery.where(
          or(
            like(users.username, searchPattern),
            like(users.venueName, searchPattern),
            like(users.email, searchPattern)
          )
        );
      }

      const usersWithManagers = await userQuery
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.id));

      console.log(`Retrieved ${usersWithManagers.length} users (page ${page}/${Math.ceil(Number(countResult.value) / limit)})`);

      // Map the results to include account manager info.
      // sanitizeUser whitelists safe fields (drops password/otp/otpExpiry/
      // emailVerificationToken/emailVerificationExpiry — the old code only
      // redacted password and still leaked otp + tokens). accountManager is a
      // join, not a users column, so re-attach it after sanitizing.
      const mappedUsers: AdminUserListRow[] = usersWithManagers.map((row: { user: User; manager: { name: string; role: string } | null }) => ({
        ...sanitizeUser(row.user),
        accountManager: row.manager ? {
          name: row.manager.name,
          role: row.manager.role
        } : null,
      }));

      console.log('Users:', mappedUsers.map((u: AdminUserListRow) => ({
        id: u.id,
        username: u.username,
        accountManager: u.accountManager?.name
      })));

      return {
        // Sanitized admin-list rows (AdminUserListRow): sanitized user + accountManager join.
        users: mappedUsers,
        total: Number(countResult.value)
      };
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      throw error;
    }
  }

  async updateUserAccountManager(userId: number, accountManagerId: number | null): Promise<void> {
    console.log('Updating account manager:', { userId, accountManagerId });
    await db
      .update(users)
      .set({ accountManagerId })
      .where(eq(users.id, userId));
    console.log('Account manager updated successfully');
  }

  async getUserStats(): Promise<{
    total: number;
    active: number;
    totalPlaylists: number;
    avgSongsPerHost: number;
    totalGuests: number;
    totalSongRequests: number;
    peakHours: string;
    avgSessionDuration: string;
    regionalStats: {
      [key: string]: {
        hostCount: number;
        guestCount: number;
        songRequestCount: number;
      };
    };
  }> {
    console.log('Getting comprehensive user statistics');

    // Get total and active users count
    const [totalResult] = await db
      .select({ value: sql<number>`count(*)` })
      .from(users);

    const [activeResult] = await db
      .select({ value: sql<number>`count(distinct ${users.id})` })
      .from(users)
      .leftJoin(songs, eq(users.id, songs.userId))
      .where(sql`${songs.playedAt} > NOW() - INTERVAL '30 days'`);

    // Get playlist and song statistics
    const [songStats] = await db
      .select({
        totalPlaylists: sql<number>`count(distinct ${users.id})`,
        totalSongs: sql<number>`count(${songs.id})`,
      })
      .from(users)
      .leftJoin(songs, eq(users.id, songs.userId));

    // Get regional statistics based on real IP geolocation data
    const regionalStats: { [key: string]: { hostCount: number; guestCount: number; songRequestCount: number } } = {};

    // First, get total count of users and build a mapping of user IDs to ensure we track all users
    const allUsers = await db
      .select({
        id: users.id,
      })
      .from(users);

    // Initialize with all users marked as "Unknown" region
    // This ensures every user is accounted for in regional stats even if they don't have location data
    regionalStats['Unknown'] = {
      hostCount: allUsers.length,
      guestCount: 0,
      songRequestCount: 0
    };

    // Now get country-level distribution from user sessions
    const countryDistribution = await db
      .select({
        countryCode: userSessions.countryCode,
        userId: userSessions.userId,
        userCount: sql<number>`count(distinct ${userSessions.userId})`,
      })
      .from(userSessions)
      .where(isNotNull(userSessions.countryCode))
      .groupBy(userSessions.countryCode, userSessions.userId);

    // Track which users we've assigned to regions to avoid double-counting
    const accountedUserIds = new Set<number>();

    // Process the countries into our expected format
    for (const countryData of countryDistribution) {
      // Skip if no country code (though our WHERE should prevent this)
      if (!countryData.countryCode) continue;

      const countryCode = countryData.countryCode;
      const userId = Number(countryData.userId);

      // Use country code directly instead of region for more granular data
      if (!regionalStats[countryCode]) {
        regionalStats[countryCode] = {
          hostCount: 0,
          guestCount: 0,
          songRequestCount: 0
        };
      }

      // Only increment hostCount if we haven't counted this user already
      if (!accountedUserIds.has(userId)) {
        regionalStats[countryCode].hostCount += 1;
        accountedUserIds.add(userId);

        // Decrement from Unknown category since we've now counted this user
        regionalStats['Unknown'].hostCount -= 1;
      }
    }

    // Get song request counts per country
    const songRequestDistribution = await db
      .select({
        countryCode: userSessions.countryCode,
        requestCount: sql<number>`count(${songs.id})`,
      })
      .from(userSessions)
      .leftJoin(users, eq(userSessions.userId, users.id))
      .leftJoin(songs, eq(users.id, songs.userId))
      .groupBy(userSessions.countryCode);

    // Add song request counts to our country statistics
    for (const songData of songRequestDistribution) {
      const countryCode = songData.countryCode || 'Unknown';

      if (!regionalStats[countryCode]) {
        regionalStats[countryCode] = {
          hostCount: 0,
          guestCount: 0,
          songRequestCount: 0
        };
      }

      regionalStats[countryCode].songRequestCount = Number(songData.requestCount) || 0;
    }

    const stats = {
      total: Number(totalResult.value) || 0,
      active: Number(activeResult.value) || 0,
      totalPlaylists: Number(songStats.totalPlaylists) || 0,
      avgSongsPerHost: Math.round(Number(songStats.totalSongs) / Number(songStats.totalPlaylists)) || 0,
      totalGuests: 0, // To be implemented with guest tracking
      totalSongRequests: Number(songStats.totalSongs) || 0,
      peakHours: "9PM-11PM", // To be implemented with timestamp tracking
      avgSessionDuration: "25m", // To be implemented with session tracking
      regionalStats,
    };

    console.log('Comprehensive statistics:', stats);
    return stats;
  }

  async deleteUser(id: number, requestedOperationId?: string): Promise<MusicIdentityDeletionResult> {
    // Keep selection, saga validation, cleanup, and finalization in one transaction; identity locks
    // preserve the database primitive's global lock order. A prepared deletion
    // owns its operation ID; callers may replay it but cannot substitute one.
    // Active administrative deletion gets an unpredictable internal ID. The
    // finalized tombstone remains the idempotency record after the user is gone.
    try {
      const connectionPool = this.getConnection();
      const connection = typeof connectionPool.connect === "function"
        ? await connectionPool.connect()
        : connectionPool;

      await connection.query('BEGIN');

      try {
        const initialIdentity = (await connection.query(`SELECT id,strapi_user_document_id,strapi_account_document_id,
          identity_status,session_version,lifecycle_operation_id FROM users WHERE id=$1`, [id])).rows[0];
        if (!initialIdentity) {
          if (!requestedOperationId) throw new LifecycleOperationConflictError();
          const completed = (await connection.query(`SELECT 1 FROM music_identity_tombstones t
            JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
            WHERE t.lifecycle_operation_id=$1 AND o.operation_kind='delete' AND t.music_user_id=$2
              AND o.music_user_id=$2 AND o.operation_state='completed' AND o.operation_phase='finalized'`, [requestedOperationId,id])).rows[0];
          if (!completed) throw new LifecycleOperationConflictError();
          await connection.query('COMMIT');
          return { operationId: requestedOperationId, finalized: false };
        }
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:user:${initialIdentity.strapi_user_document_id}`]);
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:account:${initialIdentity.strapi_account_document_id}`]);
        await connection.query("SELECT lock_music_numeric_user_id($1::integer)", [id]);
        const identity = (await connection.query(`SELECT identity_status,session_version,lifecycle_operation_id
          FROM users WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!identity) throw new LifecycleOperationConflictError();
        let operationId: string;
        if (identity.identity_status === "pending_deletion") {
          operationId = identity.lifecycle_operation_id;
          if (!operationId || (requestedOperationId !== undefined && requestedOperationId !== operationId)) {
            throw new LifecycleOperationConflictError();
          }
        } else {
          if (requestedOperationId !== undefined) throw new LifecycleOperationConflictError();
          operationId = `storage-delete:${randomBytes(32).toString("hex")}`;
        }

        await connection.query(`UPDATE users SET account_manager_id = NULL WHERE account_manager_id = $1`, [id]);

        await connection.query(`UPDATE page_contents SET created_by = NULL WHERE created_by = $1`, [id]);
        await connection.query(`UPDATE page_contents SET updated_by = NULL WHERE updated_by = $1`, [id]);

        await connection.query(`UPDATE seo_settings SET updated_by = NULL WHERE updated_by = $1`, [id]);
        await connection.query(`DELETE FROM youtube_music_playlists WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM youtube_music WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM youtube_tokens WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM youtube_playlists WHERE user_id = $1`, [id]);

        // Now handle all other user-dependent entities
        await connection.query(`DELETE FROM api_tokens WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM email_logs WHERE api_token_id IN 
          (SELECT id FROM api_tokens WHERE user_id = $1)`, [id]);

        await connection.query(`DELETE FROM guest_interactions WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM youtube_api_usage WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM analytics_snapshots WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM activity_logs WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM user_activity WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM widgets WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM youtube_api_calls WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM playback_states WHERE user_id = $1`, [id]);

        await connection.query(`DELETE FROM user_sessions WHERE user_id = $1`, [id]);

        // Delete playlist songs first (they depend on playlists)
        await connection.query(`DELETE FROM playlist_songs WHERE playlist_id IN 
          (SELECT id FROM playlists WHERE user_id = $1)`, [id]);

        // Now delete playlists
        await connection.query(`DELETE FROM playlists WHERE user_id = $1`, [id]);

        // Delete played songs records
        await connection.query(`DELETE FROM played_songs WHERE user_id = $1`, [id]);

        // Delete songs
        await connection.query(`DELETE FROM songs WHERE user_id = $1`, [id]);

        // Delete user profiles
        await connection.query(`DELETE FROM user_profiles WHERE user_id = $1`, [id]);

        // Finally, finalize the identity deletion through the one lock-ordered DB primitive.
        const deletion = await connection.query(
          `SELECT finalize_music_identity_deletion($1::integer,$2::text,$3::text) AS finalized`,
          [id, operationId, 'storage-delete'],
        );
        // If we get here, commit the transaction
        await connection.query('COMMIT');
        // Database sessions were transactional; now clear fallback memory sessions.
        if (this.sessionStore instanceof MemoryStore) {
          await this.cleanupUserSessions(id);
        }
        return { operationId, finalized: deletion.rows[0].finalized };
      } catch (txError) {
        // If anything goes wrong, roll back
        await connection.query('ROLLBACK');
        throw txError;
      } finally {
        if (typeof connection.release === "function") connection.release();
      }
    } catch (error) {
      if (error instanceof LifecycleOperationConflictError) throw error;
      throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserActivity(userId: number): Promise<{ totalSongs: number; lastActive?: Date }> {
    console.log('Getting activity for user:', userId);
    const [result] = await db
      .select({
        totalSongs: count(songs.id),
        lastActive: sql<Date>`MAX(${songs.playedAt})`
      })
      .from(songs)
      .where(eq(songs.userId, userId));

    console.log('User activity:', result);
    return {
      totalSongs: Number(result?.totalSongs) || 0,
      lastActive: result?.lastActive
    };
  }

  async getTeamMembers(): Promise<TeamMember[]> {
    console.log('Getting all team members');
    const members = await db.select().from(teamMembers);
    console.log(`Retrieved ${members.length} team members`);
    return members;
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    console.log('Creating new team member:', member);
    const [newMember] = await db.insert(teamMembers)
      .values(member)
      .returning();
    console.log('Created team member:', newMember);
    return newMember;
  }

  async deleteTeamMember(id: number): Promise<void> {
    console.log('Deleting team member:', id);
    await db.transaction(async (tx) => {
      // First update any users that had this team member as account manager
      await tx.update(users)
        .set({ accountManagerId: null })
        .where(eq(users.accountManagerId, id));

      // Then delete the team member
      await tx.delete(teamMembers)
        .where(eq(teamMembers.id, id));
    });
    console.log('Team member deleted successfully');
  }

  async updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember> {
    console.log('Updating team member:', { id, updates });
    const [member] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    console.log('Updated team member:', member);
    return member;
  }

  async getActiveConnections(): Promise<number> {
    try {
      // Get active connection count from pg_stat_activity
      const result = await db.execute(
        sql`SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'`
      );
      const rows = Array.isArray(result) ? result : result.rows;
      return Number(rows[0]?.count) || 0;
    } catch (error) {
      console.error('Error getting active connections:', error);
      return 0;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    console.log('Getting user by email:', email);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    console.log('Retrieved user:', user ? { ...user, password: '[REDACTED]' } : undefined);
    return user;
  }

  async updateUserVerificationToken(userId: number, token: string, expiryDate: Date): Promise<boolean> {
    console.log('Updating verification token for user:', userId);
    try {
      await db.update(users)
        .set({
          emailVerificationToken: token,
          emailVerificationExpiry: expiryDate
        })
        .where(eq(users.id, userId));
      console.log('Verification token updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating verification token:', error);
      return false;
    }
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    console.log('Getting user by verification token');
    try {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.emailVerificationToken, token));

      console.log('Retrieved user with token:', user ? { ...user, password: '[REDACTED]' } : undefined);
      return user;
    } catch (error) {
      console.error('Error getting user by verification token:', error);
      return undefined;
    }
  }

  async markEmailAsVerified(userId: number): Promise<boolean> {
    console.log('Marking email as verified for user:', userId);
    try {
      await db.update(users)
        .set({
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null
        })
        .where(eq(users.id, userId));
      console.log('Email marked as verified successfully');
      return true;
    } catch (error) {
      console.error('Error marking email as verified:', error);
      return false;
    }
  }

  async updateUserOTP(id: number, otp: string, expiry: Date): Promise<void> {
    console.log('Updating OTP for user:', id);
    try {
      await db.update(users)
        .set({ otp, otpExpiry: expiry })
        .where(eq(users.id, id));
      console.log('OTP updated successfully');
    } catch (error) {
      console.error('Error updating OTP:', error);
      throw error;
    }
  }

  async clearUserOTP(id: number): Promise<void> {
    console.log('Clearing OTP for user:', id);
    try {
      await db.update(users)
        .set({ otp: null, otpExpiry: null })
        .where(eq(users.id, id));
      console.log('OTP cleared successfully');
    } catch (error) {
      console.error('Error clearing OTP:', error);
      throw error;
    }
  }

  async getPlaylists(userId: number): Promise<Playlist[]> {
    console.log('Getting playlists for user:', userId);
    // First get all playlists
    const userPlaylists = await db.select()
      .from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(playlists.createdAt);

    // Then for each playlist, get its songs
    const playlistsWithSongs = await Promise.all(
      userPlaylists.map(async (playlist) => {
        const songs = await this.getPlaylistSongs(playlist.id);
        return {
          ...playlist,
          songs
        };
      })
    );

    console.log('Found playlists with songs:', playlistsWithSongs.length);
    return playlistsWithSongs;
  }

  async getPlaylistById(id: number): Promise<Playlist | undefined> {
    console.log('Getting playlist by ID:', id);
    const [playlist] = await db.select()
      .from(playlists)
      .where(eq(playlists.id, id));
    return playlist;
  }

  async createPlaylist(userId: number, playlist: InsertPlaylist): Promise<Playlist> {
    console.log('Creating playlist for user:', userId);
    const [newPlaylist] = await db.insert(playlists)
      .values({ ...playlist, userId })
      .returning();
    console.log('Created playlist:', newPlaylist);
    return newPlaylist;
  }

  async updatePlaylist(id: number, updates: Partial<Playlist>): Promise<Playlist> {
    console.log('Updating playlist:', id);
    const [playlist] = await db.update(playlists)
      .set(updates)
      .where(eq(playlists.id, id))
      .returning();
    console.log('Updated playlist:', playlist);
    return playlist;
  }

  async deletePlaylist(id: number): Promise<void> {
    console.log('Deleting playlist:', id);
    await db.transaction(async (tx) => {
      // First delete all playlist songs
      await tx.delete(playlistSongs)
        .where(eq(playlistSongs.playlistId, id));
      // Then delete the playlist
      await tx.delete(playlists)
        .where(eq(playlists.id, id));
    });
    console.log('Playlist deleted successfully');
  }

  async addSongToPlaylist(playlistId: number, song: InsertPlaylistSong): Promise<void> {
    console.log('Adding song to playlist:', { playlistId, youtubeId: song.youtubeId, position: song.position });
    await db.insert(playlistSongs)
      .values({ playlistId, ...song });
    console.log('Song added to playlist successfully');
  }

  async removeSongFromPlaylist(playlistId: number, songId: number): Promise<void> {
    console.log('Removing song from playlist:', { playlistId, songId });
    await db.transaction(async (tx) => {
      // Delete the song directly using its id from playlist_songs
      await tx.delete(playlistSongs)
        .where(and(
          eq(playlistSongs.playlistId, playlistId),
          eq(playlistSongs.id, songId)  // Use id instead of songId
        ));

      // Get remaining songs to update positions
      const remainingSongs = await tx
        .select()
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, playlistId))
        .orderBy(playlistSongs.position);

      // Update positions sequentially
      for (let i = 0; i < remainingSongs.length; i++) {
        await tx.update(playlistSongs)
          .set({ position: i })
          .where(eq(playlistSongs.id, remainingSongs[i].id));
      }
    });
    console.log('Song removed from playlist successfully');
  }

  async addSongsToPlaylist(playlistId: number, songsToAdd: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }[]): Promise<void> {
    console.log('Adding songs to playlist:', { playlistId, songCount: songsToAdd.length });

    try {
      await db.transaction(async (tx) => {
        // Get playlist first to verify it exists
        const [playlist] = await tx
          .select()
          .from(playlists)
          .where(eq(playlists.id, playlistId));

        if (!playlist) {
          console.error('Playlist not found:', playlistId);
          throw new Error('Playlist not found');
        }

        // Get current max position for this playlist
        const existingSongs = await tx
          .select()
          .from(playlistSongs)
          .where(eq(playlistSongs.playlistId, playlistId))
          .orderBy(desc(playlistSongs.position));

        const startPosition = existingSongs.length > 0 ? existingSongs[0].position + 1 : 0;

        // Add each song in sequence
        for (let i = 0; i < songsToAdd.length; i++) {
          const songData = songsToAdd[i];
          const newPosition = startPosition + i;

          console.log('Adding song to playlist:', {
            title: songData.title,
            playlistId,
            position: newPosition
          });

          try {
            // Insert directly into playlist_songs with song details
            await tx.insert(playlistSongs)
              .values({
                playlistId,
                youtubeId: songData.youtubeId,
                title: songData.title,
                artist: songData.artist,
                thumbnailUrl: songData.thumbnailUrl,
                position: newPosition,
                addedAt: new Date()
              });

            console.log('Successfully added song:', {
              title: songData.title,
              position: newPosition
            });
          } catch (songError) {
            console.error('Erroradding individual song:', {
              title: songData.title,
              error: songError instanceof Error ? songError.message : 'Unknown error'
            });
            // Continue with other songs even if one fails
            continue;
          }
        }

        console.log('Successfully completed adding all songs to playlist');
      });
    } catch (error) {
      console.error('Transaction error in addSongsToPlaylist:', error);
      throw new Error('Failed to add songs to playlist');
    }
  }

  async getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]> {
    console.log('Getting songs for playlist:', playlistId);

    // Get all songs directly from playlist_songs table
    const songs = await db
      .select()
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlistId))
      .orderBy(playlistSongs.position);

    console.log(`Found ${songs.length} songs for playlist ${playlistId}:`,
      songs.map(s => ({ id: s.id, title: s.title }))
    );
    return songs;
  }

  async reorderPlaylistSong(playlistId: number, songId: number, newPosition: number): Promise<void> {
    console.log('Starting reorderPlaylistSong:', { playlistId, songId, newPosition });
    try {
      await db.transaction(async (tx) => {
        // Get all songs in playlist with their current positions
        const songs = await tx
          .select()
          .from(playlistSongs)
          .where(eq(playlistSongs.playlistId, playlistId))
          .orderBy(playlistSongs.position);

        console.log('Current playlist songs:', songs.map(s => ({
          id: s.id,
          position: s.position
        })));

        // Get current song's position
        const songToMove = songs.find(s => s.id === songId);
        if (!songToMove) {
          throw new Error('Song not found in playlist');
        }

        const currentPosition = songToMove.position;
        const maxPosition = songs.length - 1;

        // Validate new position
        if (newPosition < 0 || newPosition > maxPosition) {
          throw new Error(`Invalid position. Must be between 0 and ${maxPosition}`);
        }

        if (newPosition === currentPosition) {
          console.log('No position change needed');
          return;
        }

        console.log('Moving song:', {
          songId,
          from: currentPosition,
          to: newPosition,
          totalSongs: songs.length
        });

        // Update positions for all affected songs
        if (newPosition > currentPosition) {
          // Moving down: update songs between old and new position
          await tx
            .update(playlistSongs)
            .set({ position: sql`${playlistSongs.position} - 1` })
            .where(
              and(
                eq(playlistSongs.playlistId, playlistId),
                gt(playlistSongs.position, currentPosition),
                lte(playlistSongs.position, newPosition)
              )
            );
        } else {
          // Moving up: update songs between new and old position
          await tx
            .update(playlistSongs)
            .set({ position: sql`${playlistSongs.position} + 1` })
            .where(
              and(
                eq(playlistSongs.playlistId, playlistId),
                gte(playlistSongs.position, newPosition),
                lt(playlistSongs.position, currentPosition)
              )
            );
        }

        // Update the moved song's position
        await tx
          .update(playlistSongs)
          .set({ position: newPosition })
          .where(eq(playlistSongs.id, songId));

        console.log('Successfully reordered playlist songs');
      });
    } catch (error) {
      console.error('Error in reorderPlaylistSong:', error);
      throw error;
    }
  }

  async logUserActivity(userId: number, path: string, method: string): Promise<void> {
    try {
      console.log('Logging user activity:', { userId, path, method });
      // Updated to use 'user_id' instead of 'userId' to match the database column
      await db.execute(sql`
        INSERT INTO user_activity (user_id, path, method, created_at)
        VALUES (${userId}, ${path}, ${method}, ${new Date()})
      `);
      console.log('Activity logged successfully');
    } catch (error) {
      console.error('Error logging user activity:', error);
    }
  }
  async logYoutubeApiUsage(data: InsertYoutubeApiUsage): Promise<YoutubeApiUsage> {
    console.log('Logging YouTube API usage:', data);
    try {
      const [result] = await db.insert(youtubeApiUsage)
        .values({
          ...data,
          createdAt: new Date()
        })
        .returning();

      console.log('Successfully logged YouTube API usage:', result);
      return result;
    } catch (error) {
      console.error('Failed to log YouTube API usage:', error);
      throw error;
    }
  }

  async getYoutubeApiUsageStats(): Promise<{
    total: number;
    weeklyAvg: number;
    monthlyTotal: number;
    daily: { date: string; count: number; endpoint_type: string }[];
  }> {
    console.log('Getting YouTube API usage statistics');
    try {
      // Get total count using Drizzle builder
      const totalResult = await db
        .select({
          count: sql<number>`cast(count(*) as integer)`
        })
        .from(youtubeApiUsage);

      // Get daily stats with proper type casting
      const dailyStats = await db
        .select({
          date: sql<string>`to_char(date(created_at), 'YYYY-MM-DD')`,
          count: sql<number>`cast(count(*) as integer)`,
          endpoint_type: youtubeApiUsage.endpointType
        })
        .from(youtubeApiUsage)
        .where(gte(youtubeApiUsage.createdAt, sql`now() - interval '7 days'`))
        .groupBy(
          sql`to_char(date(created_at), 'YYYY-MM-DD')`,
          youtubeApiUsage.endpointType
        )
        .orderBy(desc(sql`to_char(date(created_at), 'YYYY-MM-DD')`));

      // Get weekly average
      const weeklyAvgResult = await db
        .select({
          avg: sql<number>`cast(round(count(*)::numeric / 7, 2) as float)`
        })
        .from(youtubeApiUsage)
        .where(gte(youtubeApiUsage.createdAt, sql`now() - interval '7 days'`));

      // Get monthly total
      const monthlyResult = await db
        .select({
          count: sql<number>`cast(count(*) as integer)`
        })
        .from(youtubeApiUsage)
        .where(gte(youtubeApiUsage.createdAt, sql`date_trunc('month', current_date)`));

      // Build the response with proper type handling
      const stats = {
        total: totalResult[0]?.count ?? 0,
        weeklyAvg: weeklyAvgResult[0]?.avg ?? 0,
        monthlyTotal: monthlyResult[0]?.count ?? 0,
        daily: dailyStats.map(stat => ({
          date: stat.date,
          count: stat.count,
          endpoint_type: stat.endpoint_type
        }))
      };

      console.log('YouTube API usage stats:', stats);
      return stats;
    } catch (error) {
      console.error('Error getting YouTube API usage stats:', error);
      throw error;
    }
  }
  async deleteUserPlaylists(userId: number): Promise<void> {
    console.log('Deleting playlists for user:', userId);
    await db.delete(playlists)
      .where(eq(playlists.userId, userId));
  }

  async deleteUserSongs(userId: number): Promise<void> {
    console.log('Deleting songs for user:', userId);
    await db.delete(songs)
      .where(eq(songs.userId, userId));
  }

  async removeSongsFromPlaylists(playlistIds: number[]): Promise<void> {
    console.log('Removing songs from playlists:', playlistIds);
    await db.delete(playlistSongs)
      .where(inArray(playlistSongs.playlistId, playlistIds));
  }

  async cleanupUserSessions(userId: number): Promise<void> {
    console.log('Cleaning up sessions for user:', userId);
    try {
      // First, delete all session records from database
      await db.delete(userSessions)
        .where(eq(userSessions.userId, userId));
      console.log('Deleted user sessions from database');

      // Clean up the session store
      if (this.sessionStore instanceof MemoryStore) {
        // Use Promise to handle asynchronous session store operations
        await new Promise<void>((resolve, reject) => {
          // Type assertion to access 'all' method
          (this.sessionStore as any).all((err: any, sessions: any) => {
            if (err) {
              console.error('Error retrieving sessions:', err);
              reject(err);
              return;
            }

            // Track pending operations
            const pendingOperations: Promise<void>[] = [];

            for (let sid in sessions) {
              const session = sessions[sid];
              if (session?.passport?.user === userId) {
                pendingOperations.push(
                  new Promise<void>((resolveDestroy) => {
                    this.sessionStore.destroy(sid, (destroyErr: any) => {
                      if (destroyErr) {
                        console.error(`Error destroying session ${sid}:`, destroyErr);
                      } else {
                        console.log(`Successfully destroyed session ${sid}`);
                      }
                      resolveDestroy(); // Always resolve, even on error
                    });
                  })
                );
              }
            }

            // Wait for all session destroy operations to complete
            Promise.all(pendingOperations)
              .then(() => {
                console.log(`Cleaned up all sessions for user ${userId}`);
                resolve();
              })
              .catch(deleteError => {
                console.error('Error during session cleanup:', deleteError);
                reject(deleteError);
              });

            // If no operations to perform, resolve immediately
            if (pendingOperations.length === 0) {
              console.log(`No sessions to clean for user ${userId}`);
              resolve();
            }
          });
        });
      } else if (this.sessionStore instanceof PgStore) {
        // For PgStore - directly delete sessions from the session table
        try {
          // Execute raw SQL to delete sessions for this user
          await pool.query(
            'DELETE FROM "session" WHERE sess->>\'passport\' LIKE $1',
            [`%"user":${userId}%`]
          );
          console.log(`Deleted sessions from PostgreSQL store for user ${userId}`);
        } catch (pgError) {
          console.error('Error deleting sessions from PostgreSQL store:', pgError);
          // Non-fatal error, continue with the rest of cleanup
        }
      } else if (this.sessionStore) {
        // For other session store types
        console.log('Using other session store type, sessions will expire naturally');
      }

      console.log('Session cleanup completed successfully');
    } catch (error) {
      console.error('Error cleaning up user sessions:', error);
      throw error; // Rethrow to ensure deletion process fails if sessions can't be cleaned
    }
  }
  // Add implementation in DatabaseStorage class
  async updatePlaylistVisibility(playlistId: number, isVisible: boolean): Promise<void> {
    console.log('Updating playlist visibility:', { playlistId, isVisible });
    try {
      await db.update(playlists)
        .set({ isVisibleToGuests: isVisible })
        .where(eq(playlists.id, playlistId));
      console.log('Successfully updated playlist visibility');
    } catch (error) {
      console.error('Error updating playlist visibility:', error);
      throw error;
    }
  }
  // Implement new profile methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    console.log('Getting profile for user:', userId);
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(userId: number, profile: InsertUserProfile): Promise<UserProfile> {
    console.log('Creating profile for user:', userId);
    const [newProfile] = await db
      .insert(userProfiles)
      .values({ ...profile, userId })
      .returning();
    return newProfile;
  }

  async updateUserProfile(userId: number, profile: Partial<InsertUserProfile>): Promise<UserProfile> {
    console.log('Updating profile for user:', userId);
    const [updatedProfile] = await db
      .update(userProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return updatedProfile;
  }

  async deleteUserProfile(userId: number): Promise<void> {
    console.log('Deleting profile for user:', userId);
    await db
      .delete(userProfiles)
      .where(eq(userProfiles.userId, userId));
  }

  // User sessions and devices methods
  async getUserSessions(userId: number): Promise<UserSession[]> {
    console.log('Getting user sessions for user:', userId);
    try {
      const sessions = await db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.userId, userId),
            isNull(userSessions.endTime) // Only active sessions (not terminated)
          )
        )
        .orderBy(desc(userSessions.startTime));

      console.log(`Retrieved ${sessions.length} active sessions for user:`, userId);
      return sessions;
    } catch (error) {
      console.error('Error retrieving user sessions:', error);
      return [];
    }
  }

  async createUserSession(
    userId: number,
    sessionId: string,
    ipAddress: string,
    deviceInfo: any,
    countryCode?: string,
    region?: string,
    geoData?: string | null
  ): Promise<UserSession> {
    console.log('Creating user session:', { userId, sessionId, ipAddress, countryCode, region });
    try {
      // Check if this session already exists by userId, IP, and recent activity
      // Since we don't have a sessionIdentifier column, we need to find by user and check if it's the same device
      const recentSessions = await db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.userId, userId),
            eq(userSessions.ipAddress, ipAddress),
            isNull(userSessions.endTime) // Only active sessions
          )
        )
        .orderBy(desc(userSessions.lastActiveAt))
        .limit(5); // Get last 5 matching sessions to find the right one

      // Try to find matching session by comparing device info
      let existingSession = null;
      for (const session of recentSessions) {
        const sessionDeviceInfo = session.deviceInfo as any;
        const newDeviceInfo = deviceInfo as any;

        // Match by browser and OS
        if (sessionDeviceInfo?.browser?.name === newDeviceInfo?.browser?.name &&
          sessionDeviceInfo?.os?.name === newDeviceInfo?.os?.name) {
          existingSession = session;
          break;
        }
      }

      if (existingSession) {
        console.log('Session already exists (ID:', existingSession.id, '), updating last active time');
        // Session exists, update it
        const [updated] = await db
          .update(userSessions)
          .set({
            lastActiveAt: new Date(),
            ipAddress: ipAddress,
            deviceInfo: deviceInfo,
            countryCode: countryCode || 'Unknown',
            region: region || 'Unknown',
            geoData: geoData ? sql`${geoData}::jsonb` : null
          })
          .where(eq(userSessions.id, existingSession.id))
          .returning();

        return updated;
      }

      // Create new session
      const [newSession] = await db
        .insert(userSessions)
        .values({
          userId,
          startTime: new Date(),
          lastActiveAt: new Date(),
          ipAddress,
          deviceInfo,
          countryCode: countryCode || 'Unknown',
          region: region || 'Unknown',
          geoData: geoData ? sql`${geoData}::jsonb` : null
        })
        .returning();

      console.log('New session created:', newSession.id);
      return newSession;
    } catch (error) {
      console.error('Error creating user session:', error);
      throw error;
    }
  }

  async terminateUserSession(sessionId: number): Promise<void> {
    console.log('Terminating user session:', sessionId);
    try {
      await db
        .update(userSessions)
        .set({ endTime: new Date() })
        .where(eq(userSessions.id, sessionId));

      console.log('Session terminated successfully:', sessionId);
    } catch (error) {
      console.error('Error terminating user session:', error);
      throw error;
    }
  }

  // API token management methods
  async createApiToken(data: InsertApiToken, tokenString: string): Promise<ApiToken> {
    console.log('Creating new API token:', {
      ...data,
      token: `${tokenString.substring(0, 5)}...${tokenString.substring(tokenString.length - 5)}`
    });

    try {
      const [token] = await db.insert(apiTokens)
        .values({
          ...data,
          token: tokenString,
          isActive: true,
          createdAt: new Date()
        })
        .returning();

      console.log('API token created successfully:', {
        id: token.id,
        name: token.name,
        userId: token.userId,
        isAppWide: token.isAppWide
      });

      return token;
    } catch (error) {
      console.error('Error creating API token:', error);
      throw error;
    }
  }

  async getApiTokens(userId?: number): Promise<ApiToken[]> {
    console.log('Getting API tokens', userId ? `for user ${userId}` : 'for all users');

    try {
      let query = db.select().from(apiTokens).$dynamic();

      if (userId) {
        query = query.where(eq(apiTokens.userId, userId));
      }

      const tokens = await query.orderBy(desc(apiTokens.createdAt));

      console.log(`Retrieved ${tokens.length} API tokens`);

      // Mask the actual token values for logging/security
      const maskedTokens = tokens.map(token => ({
        ...token,
        token: `${token.token.substring(0, 5)}...${token.token.substring(token.token.length - 5)}`
      }));

      console.log('API tokens:', maskedTokens);

      return tokens;
    } catch (error) {
      console.error('Error getting API tokens:', error);
      return [];
    }
  }

  async getApiTokenById(id: number): Promise<ApiToken | undefined> {
    console.log('Getting API token by ID:', id);

    try {
      const [token] = await db.select()
        .from(apiTokens)
        .where(eq(apiTokens.id, id));

      if (token) {
        console.log('API token found:', {
          id: token.id,
          name: token.name,
          userId: token.userId,
          isAppWide: token.isAppWide
        });
      } else {
        console.log('API token not found');
      }

      return token;
    } catch (error) {
      console.error('Error getting API token by ID:', error);
      return undefined;
    }
  }

  async getApiTokenByToken(token: string): Promise<ApiToken | undefined> {
    console.log('Getting API token by token string:', `${token.substring(0, 5)}...${token.substring(token.length - 5)}`);

    try {
      const [apiToken] = await db.select()
        .from(apiTokens)
        .where(eq(apiTokens.token, token));

      if (apiToken) {
        console.log('API token found:', {
          id: apiToken.id,
          name: apiToken.name,
          userId: apiToken.userId,
          isAppWide: apiToken.isAppWide
        });
      } else {
        console.log('API token not found');
      }

      return apiToken;
    } catch (error) {
      console.error('Error getting API token by token string:', error);
      return undefined;
    }
  }

  async updateApiTokenLastUsed(id: number): Promise<void> {
    console.log('Updating last used timestamp for API token:', id);

    try {
      await db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, id));

      console.log('API token last used timestamp updated');
    } catch (error) {
      console.error('Error updating API token last used timestamp:', error);
      throw error;
    }
  }

  async deactivateApiToken(id: number): Promise<void> {
    console.log('Deactivating API token:', id);

    try {
      await db.update(apiTokens)
        .set({ isActive: false })
        .where(eq(apiTokens.id, id));

      console.log('API token deactivated successfully');
    } catch (error) {
      console.error('Error deactivating API token:', error);
      throw error;
    }
  }

  async deleteApiToken(id: number): Promise<void> {
    console.log('Deleting API token:', id);

    try {
      await db.delete(apiTokens)
        .where(eq(apiTokens.id, id));

      console.log('API token deleted successfully');
    } catch (error) {
      console.error('Error deleting API token:', error);
      throw error;
    }
  }

  // Email template methods
  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    console.log('Creating email template:', template.name);
    try {
      const [newTemplate] = await db.insert(emailTemplates)
        .values(template)
        .returning();
      return newTemplate;
    } catch (error) {
      console.error('Error creating email template:', error);
      throw error;
    }
  }

  async getEmailTemplates(): Promise<EmailTemplate[]> {
    try {
      return db.select().from(emailTemplates).orderBy(emailTemplates.name);
    } catch (error) {
      console.error('Error getting email templates:', error);
      throw error;
    }
  }

  async getEmailTemplateById(id: number): Promise<EmailTemplate | undefined> {
    try {
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
      return template;
    } catch (error) {
      console.error('Error getting email template by ID:', error);
      throw error;
    }
  }

  async getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined> {
    try {
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
      return template;
    } catch (error) {
      console.error('Error getting email template by name:', error);
      throw error;
    }
  }

  async updateEmailTemplate(id: number, updates: Partial<EmailTemplate>): Promise<EmailTemplate> {
    try {
      const [template] = await db.update(emailTemplates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(emailTemplates.id, id))
        .returning();
      return template;
    } catch (error) {
      console.error('Error updating email template:', error);
      throw error;
    }
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    try {
      await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
    } catch (error) {
      console.error('Error deleting email template:', error);
      throw error;
    }
  }

  // Email logs methods
  /**
   * Whether this address has asked not to be contacted. Decision D2, 2026-10-08.
   *
   * Deliberately throws rather than returning false when the query itself fails. The caller
   * is deciding whether to send, and "the database was unreachable" is not evidence that
   * somebody consented - failing closed is the only answer that cannot violate an opt-out.
   */
  async isEmailSuppressed(email: string): Promise<boolean> {
    const normalized = normalizeSuppressionEmail(email);
    if (!normalized) return false;
    const [row] = await db.select({ id: emailSuppressions.id })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, normalized))
      .limit(1);
    return row !== undefined;
  }

  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    console.log('Creating email log:', { recipient: log.recipient, subject: log.subject });
    try {
      const [newLog] = await db.insert(emailLogs)
        .values(log)
        .returning();
      return newLog;
    } catch (error) {
      console.error('Error creating email log:', error);
      throw error;
    }
  }

  async getEmailLogs(page: number = 1, limit: number = 20): Promise<{ logs: EmailLog[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const logs = await db.select()
        .from(emailLogs)
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db.select({
        count: sql`count(*)`.mapWith(Number)
      }).from(emailLogs);

      return { logs, total: count };
    } catch (error) {
      console.error('Error getting email logs:', error);
      throw error;
    }
  }

  async getEmailLogsByApiToken(apiTokenId: number, page: number = 1, limit: number = 20): Promise<{ logs: EmailLog[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const logs = await db.select()
        .from(emailLogs)
        .where(eq(emailLogs.apiTokenId, apiTokenId))
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db.select({
        count: sql`count(*)`.mapWith(Number)
      })
        .from(emailLogs)
        .where(eq(emailLogs.apiTokenId, apiTokenId));

      return { logs, total: count };
    } catch (error) {
      console.error('Error getting email logs by API token:', error);
      throw error;
    }
  }

  async getEmailLogsByRecipient(recipient: string, page: number = 1, limit: number = 20): Promise<{ logs: EmailLog[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const logs = await db.select()
        .from(emailLogs)
        .where(eq(emailLogs.recipient, recipient))
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db.select({
        count: sql`count(*)`.mapWith(Number)
      })
        .from(emailLogs)
        .where(eq(emailLogs.recipient, recipient));

      return { logs, total: count };
    } catch (error) {
      console.error('Error getting email logs by recipient:', error);
      throw error;
    }
  }

  async getEmailLogsByStatus(status: string, page: number = 1, limit: number = 20): Promise<{ logs: EmailLog[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const logs = await db.select()
        .from(emailLogs)
        .where(eq(emailLogs.status, status))
        .orderBy(desc(emailLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db.select({
        count: sql`count(*)`.mapWith(Number)
      })
        .from(emailLogs)
        .where(eq(emailLogs.status, status));

      return { logs, total: count };
    } catch (error) {
      console.error('Error getting email logs by status:', error);
      throw error;
    }
  }

  async updateEmailLogStatus(id: number, status: string, messageId?: string, errorMessage?: string): Promise<void> {
    try {
      const updates: any = { status };

      if (messageId) {
        updates.messageId = messageId;
      }

      if (errorMessage) {
        updates.errorMessage = errorMessage;
      }

      if (status === 'delivered') {
        updates.deliveredAt = new Date();
      }

      await db.update(emailLogs)
        .set(updates)
        .where(eq(emailLogs.id, id));
    } catch (error) {
      console.error('Error updating email log status:', error);
      throw error;
    }
  }

  async getEmailStats(): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    daily: { date: string; count: number; status: string }[];
  }> {
    try {
      // Get total count
      const [{ total }] = await db.select({
        total: sql`count(*)`.mapWith(Number)
      }).from(emailLogs);

      // Get counts by status
      const statusCounts = await db.select({
        status: emailLogs.status,
        count: sql`count(*)`.mapWith(Number)
      })
        .from(emailLogs)
        .groupBy(emailLogs.status);

      const sent = statusCounts.find(s => s.status === 'sent')?.count || 0;
      const delivered = statusCounts.find(s => s.status === 'delivered')?.count || 0;
      const failed = statusCounts.find(s => s.status === 'failed')?.count || 0;

      // Get daily stats
      const dailyStats = await db.select({
        date: sql<string>`to_char(${emailLogs.createdAt}, 'YYYY-MM-DD')`.as('date'),
        status: emailLogs.status,
        count: sql`count(*)`.mapWith(Number)
      })
        .from(emailLogs)
        .where(sql`${emailLogs.createdAt} > now() - interval '7 days'`)
        .groupBy(sql`date`, emailLogs.status)
        .orderBy(sql`date`);

      return {
        total,
        sent,
        delivered,
        failed,
        daily: dailyStats.map(s => ({
          date: s.date,
          count: s.count,
          status: s.status
        }))
      };
    } catch (error) {
      console.error('Error getting email stats:', error);
      return {
        total: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        daily: []
      };
    }
  }

  // Page content management methods implementation
  async getPageContentBySlug(slug: string): Promise<PageContent | undefined> {
    console.log('Getting page content by slug:', slug);
    try {
      const [content] = await db.select()
        .from(pageContents)
        .where(eq(pageContents.slug, slug));

      console.log('Retrieved page content:', content ? { id: content.id, slug: content.slug } : 'Not found');
      return content;
    } catch (error) {
      console.error('Error getting page content by slug:', error);
      return undefined;
    }
  }

  async getAllPageContents(): Promise<PageContent[]> {
    console.log('Getting all page contents');
    try {
      const contents = await db.select()
        .from(pageContents)
        .orderBy(pageContents.slug);

      console.log('Retrieved all page contents:', contents.length);
      return contents;
    } catch (error) {
      console.error('Error getting all page contents:', error);
      return [];
    }
  }

  async createPageContent(content: InsertPageContent): Promise<PageContent> {
    console.log('Creating page content:', { slug: content.slug });
    try {
      const [newContent] = await db.insert(pageContents)
        .values({
          ...content,
          updatedAt: new Date()
        })
        .returning();

      console.log('Created page content:', { id: newContent.id, slug: newContent.slug });
      return newContent;
    } catch (error) {
      console.error('Error creating page content:', error);
      throw error;
    }
  }

  async updatePageContent(id: number, updates: Partial<PageContent>): Promise<PageContent> {
    console.log('Updating page content:', { id, ...updates });
    try {
      const [updatedContent] = await db.update(pageContents)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(pageContents.id, id))
        .returning();

      console.log('Updated page content:', { id: updatedContent.id, slug: updatedContent.slug });
      return updatedContent;
    } catch (error) {
      console.error('Error updating page content:', error);
      throw error;
    }
  }

  async deletePageContent(id: number): Promise<void> {
    console.log('Deleting page content:', id);
    try {
      await db.delete(pageContents)
        .where(eq(pageContents.id, id));

      console.log('Deleted page content:', id);
    } catch (error) {
      console.error('Error deleting page content:', error);
      throw error;
    }
  }

  // SEO settings methods
  async getSeoSettings(): Promise<SeoSettings | undefined> {
    console.log('Getting SEO settings');
    try {
      const [settings] = await db
        .select()
        .from(seoSettings)
        .where(eq(seoSettings.isActive, true))
        .limit(1);

      console.log('Retrieved SEO settings:', settings ? settings.id : 'none');
      return settings;
    } catch (error) {
      console.error('Error getting SEO settings:', error);
      throw error;
    }
  }

  async updateSeoSettings(updates: Partial<SeoSettings>): Promise<SeoSettings> {
    console.log('Updating SEO settings:', updates);
    try {
      // First try to get existing settings
      const [existing] = await db
        .select()
        .from(seoSettings)
        .limit(1);

      let result: SeoSettings;

      if (existing) {
        // Update existing settings
        const [updated] = await db
          .update(seoSettings)
          .set({
            ...updates,
            updatedAt: new Date()
          })
          .where(eq(seoSettings.id, existing.id))
          .returning();

        result = updated;
      } else {
        // Create new settings with default values for required fields
        const newSettings = {
          siteTitle: updates.siteTitle || 'Cosmic - Collaborative Playlist Management Platform',
          metaDescription: updates.metaDescription || 'Cosmic is an advanced collaborative playlist management platform that transforms music sharing across diverse social and venue settings.',
          metaKeywords: updates.metaKeywords || 'music, playlist, collaboration, venue, event, sharing, youtube',
          ogTitle: updates.ogTitle || 'Cosmic - Transform Your Music Experience',
          ogDescription: updates.ogDescription || 'Create immersive and interactive music experiences with Cosmic collaborative playlists',
          ogImage: updates.ogImage || '/logo-social.png',
          twitterTitle: updates.twitterTitle || 'Cosmic Music Platform',
          twitterDescription: updates.twitterDescription || 'Advanced playlist management for venues and events',
          twitterImage: updates.twitterImage || '/logo-social.png',
          robotsTxt: updates.robotsTxt || 'User-agent: *\nAllow: /',
          sitemapXml: updates.sitemapXml || '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://cosmic.app/</loc>\n    <lastmod>2025-04-03</lastmod>\n    <priority>1.0</priority>\n  </url>\n</urlset>',
          isActive: true,
          updatedAt: new Date(),
          ...updates
        };

        const [created] = await db
          .insert(seoSettings)
          .values(newSettings)
          .returning();

        result = created;
      }

      console.log('Updated SEO settings:', result.id);
      return result;
    } catch (error) {
      console.error('Error updating SEO settings:', error);
      throw error;
    }
  }

  // System settings management methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    console.log('Getting system setting:', key);
    try {
      const [setting] = await db.select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key));

      console.log('Found system setting:', setting ?
        { ...setting, value: setting.isSecret ? '[REDACTED]' : setting.value } :
        undefined);

      return setting;
    } catch (error) {
      console.error('Error getting system setting:', error);
      return undefined;
    }
  }

  async getSystemSettings(category?: string): Promise<SystemSetting[]> {
    console.log('Getting all system settings', category ? `for category: ${category}` : '');
    try {
      let query = db.select().from(systemSettings).$dynamic();

      if (category) {
        query = query.where(eq(systemSettings.category, category));
      }

      const settings = await query.orderBy(systemSettings.category, systemSettings.key);

      console.log('Found system settings:', settings.map(s => ({
        key: s.key,
        category: s.category,
        isSecret: s.isSecret,
        value: s.isSecret ? '[REDACTED]' : s.value
      })));

      return settings;
    } catch (error) {
      console.error('Error getting system settings:', error);
      return [];
    }
  }

  async createSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    console.log('Creating system setting:', {
      ...setting,
      value: setting.isSecret ? '[REDACTED]' : setting.value
    });

    try {
      const [newSetting] = await db.insert(systemSettings)
        .values({
          ...setting,
          updatedAt: new Date()
        })
        .returning();

      console.log('Created system setting:', {
        ...newSetting,
        value: newSetting.isSecret ? '[REDACTED]' : newSetting.value
      });

      return newSetting;
    } catch (error) {
      console.error('Error creating system setting:', error);
      throw error;
    }
  }

  async updateSystemSetting(data: {
    id: number;
    key: string;
    value: string;
    description?: string;
    category: string;
    isSecret?: boolean;
    updatedBy?: number;
  }): Promise<SystemSetting> {
    console.log('Updating system setting with ID:', data.id, 'New value:', data.isSecret ? '[REDACTED]' : data.value);
    console.log('Full update data:', {
      ...data,
      value: data.isSecret ? '[REDACTED]' : data.value
    });

    try {
      // Use direct SQL query to avoid schema/ORM issues
      const pool = this.getConnection();

      const query = `
        UPDATE system_settings 
        SET 
          value = $1, 
          description = $2, 
          category = $3, 
          is_secret = $4,
          updated_at = NOW(),
          updated_by = $5
        WHERE id = $6
        RETURNING *
      `;

      const queryParams = [
        data.value,
        data.description || null,
        data.category,
        data.isSecret === undefined ? false : data.isSecret,
        data.updatedBy || null,
        data.id
      ];

      console.log('Executing SQL query:', query);
      console.log('With parameters:', queryParams);

      const result = await pool.query(query, queryParams);
      console.log('SQL execution result:', result);

      if (result.rows && result.rows.length > 0) {
        const updatedSetting = result.rows[0];
        console.log('Updated system setting from SQL:', {
          ...updatedSetting,
          value: updatedSetting.is_secret ? '[REDACTED]' : updatedSetting.value
        });

        // Map the SQL result to match SystemSetting type
        const formattedSetting: SystemSetting = {
          id: updatedSetting.id,
          key: updatedSetting.key,
          value: updatedSetting.value,
          description: updatedSetting.description,
          category: updatedSetting.category,
          isSecret: updatedSetting.is_secret,
          createdAt: updatedSetting.created_at,
          updatedAt: updatedSetting.updated_at,
          updatedBy: updatedSetting.updated_by
        };

        return formattedSetting;
      } else {
        throw new Error(`No rows returned after update for system setting with ID: ${data.id}`);
      }

    } catch (error) {
      console.error('Error updating system setting:', error);
      throw error;
    }
  }

  async deleteSystemSetting(key: string): Promise<void> {
    console.log('Deleting system setting:', key);

    try {
      await db.delete(systemSettings)
        .where(eq(systemSettings.key, key));

      console.log('Deleted system setting successfully');
    } catch (error) {
      console.error('Error deleting system setting:', error);
      throw error;
    }
  }

  // Get raw database connection for direct SQL queries
  getConnection(): any {
    // Return a properly configured pool connection for raw SQL queries
    return pool;
  }
}

export const storage = new DatabaseStorage();

export interface MusicIdentityDeletionResult {
  operationId: string;
  finalized: boolean;
}

export class LifecycleOperationConflictError extends Error {
  readonly code = "LIFECYCLE_OPERATION_CONFLICT" as const;

  constructor() {
    super("lifecycle operation conflicts with the current deletion saga");
    this.name = "LifecycleOperationConflictError";
  }
}
