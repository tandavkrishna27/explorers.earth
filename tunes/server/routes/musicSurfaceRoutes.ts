import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { MusicIdentityError, musicErrorEnvelope } from "../../shared/musicError";
import { isMusicPublicationIdempotencyKeyCurrent } from "../../shared/musicPublicationContract";
import { createMusicPrincipalMiddleware, MusicPrincipalError, type MusicPrincipal } from "../middleware/musicPrincipal";
import { consumeContainmentLimit, consumePublicSurfaceLimit, safeMusicRequestError } from "../security-containment";
import {
  entitlementDecision,
  hashGuestCapability,
  MUSIC_ENTITLEMENT_MAX_AGE_SECONDS,
  type MusicEntitlementState,
} from "../policies/musicSurfacePolicy";
import { matchRetiredMusicSurface } from "../policies/musicRetirementPolicy";
import type { PublicMusicResource } from "../repositories/musicDomainRepository";
import type { MusicPublicObservability } from "../observability/musicPublicObservability";

interface CanonicalMusicRepository {
  listPlaylists(ownerId: number): Promise<unknown[]>;
  getPlaylist(ownerId: number, playlistId: number): Promise<unknown | undefined>;
  createPlaylist(ownerId: number, input: { name: string; description: string | null }): Promise<unknown | undefined>;
  createPlaylistIdempotent(ownerId: number, idempotencyKey: string, input: { name: string; description: string | null }): Promise<
    | { status: "completed"; replayed: boolean; response: unknown }
    | { status: "conflict" }
    | { status: "limit" }
  >;
  updatePlaylist(ownerId: number, playlistId: number, input: { name: string; description: string | null }): Promise<unknown | undefined>;
  deletePlaylist(ownerId: number, playlistId: number): Promise<boolean>;
  addPlaylistSongIdempotent(ownerId: number, idempotencyKey: string, playlistId: number, input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }): Promise<
    | { status: "completed"; replayed: boolean; response: unknown }
    | { status: "conflict" }
    | { status: "limit" }
    | { status: "not_found" }
  >;
  removePlaylistSong(ownerId: number, playlistId: number, songId: number): Promise<boolean>;
  reorderPlaylistSong(ownerId: number, playlistId: number, songId: number, position: number): Promise<boolean>;
  setPlaylistVisibility(ownerId: number, playlistId: number, visible: boolean): Promise<boolean>;
  listQueue(ownerId: number): Promise<unknown[]>;
  replaceQueue(ownerId: number, idempotencyKey: string, expectedRevision: number, songs: Array<{ playlistId: number; songId: number }>): Promise<
    | { status: "completed"; replayed: boolean; response: { version: "music-queue/v1"; revision: number; songs: unknown[] } }
    | { status: "stale"; revision: number }
    | { status: "conflict" }
    | { status: "not_found" }
  >;
  ownerDashboard(ownerId: number): Promise<unknown>;
  getGuestControls(ownerId: number): Promise<GuestControls | undefined>;
  updateGuestControls(ownerId: number, controls: GuestControlsUpdate): Promise<GuestControls | undefined>;
  addSong(ownerId: number, input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }): Promise<unknown>;
  addGuestSongIdempotent(publicSlug: string, capability: string | undefined, source: string, idempotencyKey: string, input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }): Promise<
    | { status: "completed"; replayed: boolean; response: { accepted: true } }
    | { status: "conflict" | "limit" | "forbidden" | "rate_limited" }
    | { status: "quota_exceeded"; cap: number; retryAfterSeconds: number }
  >;
  setPlaying(ownerId: number, songId: number | null, expectedRevision?: number, expectedPlaybackRevision?: number): Promise<unknown | null | undefined>;
  updateSongPosition(ownerId: number, songId: number, position: number): Promise<unknown | undefined>;
  removeSong(ownerId: number, songId: number): Promise<boolean>;
  removeSongs(ownerId: number, songIds: number[]): Promise<number>;
  removeHistorySong?(ownerId: number, idempotencyKey: string, songId: number): Promise<
    | { status: "completed"; replayed: boolean }
    | { status: "conflict" }
    | { status: "not_found" }
  >;
  appendQueue(ownerId: number, idempotencyKey: string, expectedRevision: number, songs: Array<{ playlistId: number; songId: number }>): Promise<
    | { status: "completed"; replayed: boolean; response: { version: "music-queue/v1"; revision: number; songs: unknown[] } }
    | { status: "stale"; revision: number }
    | { status: "conflict" }
    | { status: "not_found" }
    | { status: "limit" }
    | { status: "empty" }
  >;
  clearHistory(ownerId: number): Promise<number>;
  setPublicationMode(ownerId: number, mode: "private" | "unlisted" | "public", capabilityHash?: string): Promise<{ mode: "private" | "unlisted" | "public"; publicSlug: string } | undefined>;
  executePublicationCommand(ownerId: number, idempotencyKey: string, mode: "private" | "unlisted" | "public"): Promise<
    | { status: "completed"; replayed: boolean; response: { version: "music-publication/v1"; publication: { mode: "private" | "unlisted" | "public"; publicSlug: string }; capability?: string } }
    | { status: "rate_limited"; retryAfterSeconds: number }
    | { status: "conflict" | "expired" | "invalid" | "not_found" }
  >;
  rotateGuestCapability(ownerId: number, capabilityHash: string): Promise<unknown>;
  revokeGuestCapability(ownerId: number): Promise<void>;
  setDiscoverable?(ownerId: number, discoverable: boolean): Promise<void>;
  resolveEntitlement(ownerId: number): Promise<{ state: MusicEntitlementState; sourceUpdatedAt?: Date } | undefined>;
  resolvePublicDescriptor(accountDocumentId: string): Promise<{
    mode: "public";
    publicSlug: string;
    revision: number;
  } | undefined>;
  resolvePublicMusicResource(publicSlug: string, capability?: string): Promise<{
    state: string;
    noindex?: boolean;
    resource?: PublicMusicResource;
  } | undefined>;
  resolveGuestResource(publicSlug: string, capability?: string): Promise<{ state: string; noindex?: boolean; playlist?: unknown } | undefined>;
  resolveGuestSocketAuthority(capability: string): Promise<{ musicUserId: number; active: true; allowSongRequests: boolean } | undefined>;
  resolveGuestRequestAuthority(publicSlug: string, capability?: string): Promise<{ musicUserId: number; active: true; allowSongRequests: boolean } | undefined>;
}

export interface CanonicalMusicRouteDependencies {
  repository: CanonicalMusicRepository;
  resolvePrincipal(token: string): Promise<MusicPrincipal>;
  /**
   * Ticket 6.3. Issues a short, purpose-limited handshake ticket for an already
   * authenticated owner. Required: the socket accepts nothing else, so a composition that
   * serves the socket without mounting this route leaves every owner unable to connect.
   * It was optional once, and production did not pass it, which is exactly that outage.
   */
  mintSocketTicket(input: {
    subject: string;
    sessionVersion: number;
    subjectKind?: MusicPrincipal["subjectKind"];
  }): { token: string; expiresAt: number };
  requestIdFactory?: () => string;
  now?: () => Date;
  allowedOrigins: string[];
  trustedProxyHops?: 0 | 1;
  isTrustedProxy?: (peerAddress: string | undefined) => boolean;
  publicRateLimited?: (input: { source: string; resource: string; capability?: string }) => boolean;
  youtube?: {
    search(input: { query: string; pageToken?: string }): Promise<unknown>;
    videoFromUrl(url: string): Promise<unknown | undefined>;
  };
  observability?: MusicPublicObservability;
}

const OWNER_KEYS = new Set([
  "username", "email", "userId", "musicUserId", "ownerId", "accountId", "documentId",
  "strapiUser", "strapiUserDocumentId", "strapiAccountDocumentId",
]);
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const PUBLIC_DESCRIPTOR_PATH_PREFIX = "/api/music/public-profile/";
const MALFORMED_PUBLIC_DESCRIPTOR_RESOURCE = "malformed-account-document-id";
const PUBLIC_RESOURCE_PATH_PREFIX = "/api/music/public-resource/v1/";
const MALFORMED_PUBLIC_RESOURCE = "malformed-public-slug";

export function isExactMusicOriginAllowed(req: Pick<Request, "get">, allowedOrigins: readonly string[]): boolean {
  const origin = req.get("origin");
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

export function setupCanonicalMusicRoutes(app: Express, dependencies: CanonicalMusicRouteDependencies): void {
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  const principal = createMusicPrincipalMiddleware(dependencies.resolvePrincipal);
  const identify: RequestHandler = (req, res, next) => {
    const supplied = req.get("x-request-id");
    const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : requestIdFactory();
    res.locals.musicRequestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  };
  const ownerInputGuard: RequestHandler = (req, _res, next) => {
    const headerTarget = ["x-username", "x-user-id", "x-owner-id", "x-account-id", "x-email"]
      .some((header) => req.get(header) !== undefined);
    const queryTarget = Object.keys(req.query).some((key) => OWNER_KEYS.has(key));
    const bodyTarget = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      && Object.keys(req.body).some((key) => OWNER_KEYS.has(key));
    if (headerTarget || queryTarget || bodyTarget) return next(new MusicIdentityError(
      "REQUEST_INVALID", 400, "Owner targets are not accepted on Music requests.", "none", false,
    ));
    next();
  };
  const originGuard: RequestHandler = (req, _res, next) => {
    if (!isExactMusicOriginAllowed(req, dependencies.allowedOrigins)) return next(new MusicIdentityError(
      "ORIGIN_FORBIDDEN", 403, "The request origin is not allowed.", "none", false,
    ));
    next();
  };
  const owner = (...handlers: RequestHandler[]) => [identify, principal, ownerInputGuard, ...handlers];
  const mutation = (...handlers: RequestHandler[]) => owner(originGuard, ...handlers);
  const observePublic = (operation: "descriptor" | "resource" | "request"): RequestHandler => (req, res, next) => {
    const finish = dependencies.observability?.startHttp(operation, res.locals.musicRequestId);
    res.once("finish", () => finish?.(httpOutcome(res.statusCode), res.statusCode));
    next();
  };
  app.get("/api/music/public-profile/:accountDocumentId", identify, observePublic("descriptor"), async (req, res, next) => {
    try {
      if (hasUnexpectedPublicDescriptorAuthority(req)) throw new MusicIdentityError(
        "REQUEST_INVALID", 400, "The public Music descriptor request is invalid.", "none", false,
      );
      const accountDocumentId = boundedIdentityDocumentId(req.params.accountDocumentId);
      if (!accountDocumentId) throw notFound();
      const source = publicRequestSource(req, dependencies);
      const limited = dependencies.publicRateLimited?.({ source, resource: accountDocumentId })
        ?? consumePublicSurfaceLimit({ source, resource: accountDocumentId });
      if (limited) throw new MusicIdentityError(
        "RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60,
      );
      const descriptor = await dependencies.repository.resolvePublicDescriptor(accountDocumentId);
      if (!descriptor) throw notFound();
      res.status(200).json({
        version: "music-public-descriptor/v1",
        publication: {
          mode: "public",
          publicSlug: descriptor.publicSlug,
          revision: descriptor.revision,
        },
      });
    } catch (error) { next(error); }
  });
  app.get("/api/music/public-resource/v1/:publicSlug", identify, observePublic("resource"), async (req, res, next) => {
    try {
      if (hasUnexpectedPublicResourceAuthority(req) || !/^[A-Za-z0-9_-]{8,128}$/.test(req.params.publicSlug)) throw notFound();
      const suppliedCapability = req.get("x-music-guest-capability");
      if (suppliedCapability && !/^[A-Za-z0-9_-]{43}$/.test(suppliedCapability)) throw notFound();
      const capability = suppliedCapability && /^[A-Za-z0-9_-]{43}$/.test(suppliedCapability)
        ? suppliedCapability
        : undefined;
      const source = publicRequestSource(req, dependencies);
      const rateInput = { source, resource: req.params.publicSlug, ...(capability ? { capability } : {}) };
      const limited = dependencies.publicRateLimited?.(rateInput) ?? consumePublicSurfaceLimit(rateInput);
      if (limited) throw new MusicIdentityError(
        "RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60,
      );
      const result = await dependencies.repository.resolvePublicMusicResource(req.params.publicSlug, capability);
      if (!result || !["public", "unlisted"].includes(result.state) || !result.resource) throw notFound();
      if (Buffer.byteLength(JSON.stringify(result.resource), "utf8") > 512 * 1_024) throw new MusicIdentityError(
        "PAYLOAD_TOO_LARGE", 413, "The public Music resource exceeds its encoded limit.", "none", false,
      );
      if (result.noindex) res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(200).json(result.resource);
    } catch (error) { next(error); }
  });
  app.get("/api/playlists", ...owner(async (req, res, next) => {
    try { res.status(200).json((await dependencies.repository.listPlaylists(req.musicPrincipal!.musicUserId)).map(playlistDto)); } catch (error) { next(error); }
  }));

  app.post("/api/playlists", ...mutation(async (req, res, next) => {
    try {
      const input = playlistInput(req.body);
      const idempotencyKey = req.get("idempotency-key");
      if (!idempotencyKey || idempotencyKey.length > 128) throw invalidQueue();
      const result = await dependencies.repository.createPlaylistIdempotent(
        req.musicPrincipal!.musicUserId, idempotencyKey, input,
      );
      if (result.status === "conflict") throw new MusicIdentityError(
        "IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false,
      );
      if (result.status === "limit") throw playlistLimitReached();
      res.status(201).json(playlistDto(result.response));
    } catch (error) { next(error); }
  }));

  app.get("/api/playlists/:playlistId", ...owner(async (req, res, next) => {
    try {
      const playlist = await dependencies.repository.getPlaylist(req.musicPrincipal!.musicUserId, positiveId(req.params.playlistId));
      if (!playlist) throw notFound();
      res.status(200).json(playlistDto(playlist));
    } catch (error) { next(error); }
  }));

  app.patch("/api/playlists/:playlistId", ...mutation(async (req, res, next) => {
    try {
      const playlist = await dependencies.repository.updatePlaylist(
        req.musicPrincipal!.musicUserId,
        positiveId(req.params.playlistId),
        playlistInput(req.body),
      );
      if (!playlist) throw notFound();
      res.status(200).json(playlistDto(playlist));
    } catch (error) { next(error); }
  }));

  app.delete("/api/playlists/:playlistId", ...mutation(async (req, res, next) => {
    try {
      if (!await dependencies.repository.deletePlaylist(req.musicPrincipal!.musicUserId, positiveId(req.params.playlistId))) throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.post("/api/playlists/:playlistId/songs", ...mutation(async (req, res, next) => {
    try {
      const idempotencyKey = req.get("idempotency-key");
      if (!idempotencyKey || idempotencyKey.length > 128) throw invalidQueue();
      const result = await dependencies.repository.addPlaylistSongIdempotent(
        req.musicPrincipal!.musicUserId, idempotencyKey, positiveId(req.params.playlistId), songInput(req.body),
      );
      if (result.status === "conflict") throw new MusicIdentityError(
        "IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false,
      );
      if (result.status === "limit") throw savedPlaylistLimitReached();
      if (result.status === "not_found") throw notFound();
      res.status(201).json(playlistSongDto(result.response));
    } catch (error) { next(error); }
  }));

  app.delete("/api/playlists/:playlistId/songs/:songId", ...mutation(async (req, res, next) => {
    try {
      if (!await dependencies.repository.removePlaylistSong(
        req.musicPrincipal!.musicUserId, positiveId(req.params.playlistId), positiveId(req.params.songId),
      )) throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.patch("/api/playlists/:playlistId/reorder", ...mutation(async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => !["songId", "position"].includes(key))
          || !Number.isSafeInteger(req.body.position) || req.body.position < 0
          || !await dependencies.repository.reorderPlaylistSong(
            req.musicPrincipal!.musicUserId, positiveId(req.params.playlistId), positiveId(String(req.body.songId)), req.body.position,
          )) throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.patch("/api/playlists/:playlistId/visibility", ...mutation(async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => key !== "isVisibleToGuests")
          || typeof req.body.isVisibleToGuests !== "boolean") throw invalidQueue();
      if (!await dependencies.repository.setPlaylistVisibility(
        req.musicPrincipal!.musicUserId, positiveId(req.params.playlistId), req.body.isVisibleToGuests,
      )) throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.get("/api/playlist/songs", ...owner(async (req, res, next) => {
    try { res.status(200).json((await dependencies.repository.listQueue(req.musicPrincipal!.musicUserId)).map(songDto)); } catch (error) { next(error); }
  }));

  app.post("/api/music/queue/replace", ...mutation(async (req, res, next) => {
    try {
      const idempotencyKey = req.get("idempotency-key");
      const input = queueReplaceInput(req.body);
      if (!idempotencyKey || idempotencyKey.length > 128) throw invalidQueue();
      const result = await dependencies.repository.replaceQueue(
        req.musicPrincipal!.musicUserId, idempotencyKey, input.expectedRevision, input.songs,
      );
      if (result.status === "stale") throw new MusicIdentityError(
        "QUEUE_REVISION_CONFLICT", 409, "The queue changed before replacement.", "retry", false,
      );
      if (result.status === "conflict") throw new MusicIdentityError(
        "IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false,
      );
      if (result.status === "not_found") throw notFound();
      res.status(200).json({
        version: "music-queue/v1",
        revision: result.response.revision,
        songs: result.response.songs.map(songDto),
      });
    } catch (error) { next(error); }
  }));

  // Ticket 6.3. A handshake ticket is minted only for an owner who already proved a
  // credential on this request, and it is never accepted in place of one: the socket
  // takes tickets and every HTTP surface refuses them. Short-lived by construction, so
  // the client asks again per connection attempt rather than holding one.
  app.post("/api/music/socket-ticket", ...mutation(async (req, res, next) => {
    try {
      const principal = req.musicPrincipal!;
      const ticket = dependencies.mintSocketTicket({
        subject: principal.subject,
        sessionVersion: principal.sessionVersion,
        ...(principal.subjectKind ? { subjectKind: principal.subjectKind } : {}),
        // Inherited, not re-derived: the handshake must be revocable by the same logout
        // that revokes the credential it was minted from.
        ...(principal.sessionId && principal.userId
          ? { sessionId: principal.sessionId, userId: principal.userId } : {}),
      });
      res.status(200).json({ version: "music-socket-ticket/v1", ticket });
    } catch (error) { next(error); }
  }));

  app.get("/api/music/dashboard", ...owner(async (req, res, next) => {
    try { res.status(200).json(dashboardDto(await dependencies.repository.ownerDashboard(req.musicPrincipal!.musicUserId), true)); } catch (error) { next(error); }
  }));

  app.post("/api/music/queue/append", ...mutation(async (req, res, next) => {
    try {
      const idempotencyKey = req.get("idempotency-key");
      const input = queueReplaceInput(req.body);
      if (!idempotencyKey || idempotencyKey.length > 128 || input.songs.length === 0) throw invalidQueue();
      const result = await dependencies.repository.appendQueue(
        req.musicPrincipal!.musicUserId, idempotencyKey, input.expectedRevision, input.songs,
      );
      if (result.status === "stale") throw new MusicIdentityError(
        "QUEUE_REVISION_CONFLICT", 409, "The queue changed before append.", "retry", false,
      );
      if (result.status === "conflict") throw new MusicIdentityError(
        "IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false,
      );
      if (result.status === "empty") throw invalidQueue();
      if (result.status === "limit") throw queueLimitReached();
      if (result.status === "not_found") throw notFound();
      res.status(200).json({
        version: "music-queue/v1",
        revision: result.response.revision,
        songs: result.response.songs.map(songDto),
      });
    } catch (error) { next(error); }
  }));

  app.patch("/api/music/guest-controls", ...mutation(async (req, res, next) => {
    try {
      const controls = guestControlsInput(req.body);
      const updated = await dependencies.repository.updateGuestControls(req.musicPrincipal!.musicUserId, controls);
      if (!updated) throw notFound();
      res.status(200).json(guestControlsDto(updated));
    } catch (error) { next(error); }
  }));
  app.get("/api/music/guest-controls", ...owner(async (req, res, next) => {
    try {
      const controls = await dependencies.repository.getGuestControls(req.musicPrincipal!.musicUserId);
      if (!controls) throw notFound();
      res.status(200).json(guestControlsDto(controls));
    } catch (error) { next(error); }
  }));

  app.post("/api/playlist/songs", ...mutation(async (req, res, next) => {
    try {
      const song = await dependencies.repository.addSong(req.musicPrincipal!.musicUserId, songInput(req.body));
      if (!song) throw queueLimitReached();
      res.status(201).json(songDto(song));
    } catch (error) { next(error); }
  }));

  app.post("/api/playlist/currently-playing", ...mutation(async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => !["songId", "expectedRevision", "expectedPlaybackRevision"].includes(key))) throw invalidQueue();
      const songId = req.body.songId === null ? null : positiveId(String(req.body.songId));
      const expectedRevision = req.body.expectedRevision === undefined
        ? undefined
        : nonNegativeSafeInteger(req.body.expectedRevision);
      const expectedPlaybackRevision = req.body.expectedPlaybackRevision === undefined
        ? undefined
        : nonNegativeSafeInteger(req.body.expectedPlaybackRevision);
      const song = await dependencies.repository.setPlaying(req.musicPrincipal!.musicUserId, songId, expectedRevision, expectedPlaybackRevision);
      if (expectedRevision !== undefined) {
        const result = record(song);
        if (property(result, "status") === "stale") throw new MusicIdentityError(
          property(result, "queueOnly") === true ? "PLAYBACK_QUEUE_REVISION_CONFLICT" : "PLAYBACK_REVISION_CONFLICT",
          409,
          property(result, "queueOnly") === true ? "The queue changed without a newer playback command." : "A newer playback command is already canonical.",
          "none", false,
        );
        if (property(result, "status") === "not_found") throw notFound();
        if (property(result, "status") !== "completed") throw notFound();
        const canonicalSong = property(result, "song");
        return res.status(200).json({
          version: "music-playback/v1",
          revision: Number(property(result, "revision")),
          playbackRevision: Number(property(result, "playbackRevision")),
          song: canonicalSong ? songDto(canonicalSong) : null,
        });
      }
      if (songId === null) return res.status(204).end();
      if (!song) throw notFound();
      res.status(200).json(songDto(song));
    } catch (error) { next(error); }
  }));

  app.delete("/api/playlist/songs/bulk", ...mutation(async (req, res, next) => {
    try {
      const songIds = Array.isArray(req.body?.songIds) ? req.body.songIds.map((value: unknown) => positiveId(String(value))) : undefined;
      if (!songIds?.length || songIds.length > 500 || Object.keys(req.body).some((key) => key !== "songIds")) throw invalidQueue();
      await dependencies.repository.removeSongs(req.musicPrincipal!.musicUserId, songIds);
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.delete("/api/playlist/songs/:songId", ...mutation(async (req, res, next) => {
    try {
      if (!await dependencies.repository.removeSong(req.musicPrincipal!.musicUserId, positiveId(req.params.songId))) throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.patch("/api/playlist/songs/:songId/position", ...mutation(async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => key !== "position")
          || !Number.isSafeInteger(req.body.position) || req.body.position < 0) throw invalidQueue();
      const song = await dependencies.repository.updateSongPosition(
        req.musicPrincipal!.musicUserId,
        positiveId(req.params.songId),
        req.body.position,
      );
      if (!song) throw notFound();
      res.status(200).json(songDto(song));
    } catch (error) { next(error); }
  }));

  app.delete("/api/playlist/history", ...mutation(async (req, res, next) => {
    try { await dependencies.repository.clearHistory(req.musicPrincipal!.musicUserId); res.status(204).end(); } catch (error) { next(error); }
  }));

  app.delete("/api/playlist/history/:songId", ...mutation(async (req, res, next) => {
    try {
      const idempotencyKey = req.get("idempotency-key");
      if (!idempotencyKey || idempotencyKey.length > 128) throw invalidQueue();
      if (!dependencies.repository.removeHistorySong) throw notFound();
      const result = await dependencies.repository.removeHistorySong(
        req.musicPrincipal!.musicUserId, idempotencyKey, positiveId(req.params.songId),
      );
      if (result.status === "conflict") throw new MusicIdentityError(
        "IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false,
      );
      if (result.status === "not_found") throw notFound();
      res.status(204).end();
    } catch (error) { next(error); }
  }));

  app.post("/api/youtube/search", ...mutation(async (req, res, next) => {
    try {
      if (!dependencies.youtube || !req.body || typeof req.body.query !== "string"
          || req.body.query.trim().length < 1 || req.body.query.length > 200
          || Object.keys(req.body).some((key) => !["query", "pageToken"].includes(key))
          || (req.body.pageToken !== undefined && (typeof req.body.pageToken !== "string" || req.body.pageToken.length > 256))) {
        throw new MusicIdentityError("REQUEST_INVALID", 400, "The YouTube search input is invalid.", "none", false);
      }
      res.status(200).json(await dependencies.youtube.search({ query: req.body.query.trim(), pageToken: req.body.pageToken }));
    } catch (error) { next(error); }
  }));

  app.post("/api/youtube/video-from-url", ...mutation(async (req, res, next) => {
    try {
      if (!dependencies.youtube || !req.body || typeof req.body.url !== "string" || req.body.url.length > 2_048
          || Object.keys(req.body).some((key) => key !== "url")) {
        throw new MusicIdentityError("REQUEST_INVALID", 400, "The YouTube URL is invalid.", "none", false);
      }
      const video = await dependencies.youtube.videoFromUrl(req.body.url);
      if (!video) throw notFound();
      res.status(200).json(video);
    } catch (error) { next(error); }
  }));

  app.post("/api/music/publication", ...mutation(async (req, res, next) => {
    try {
      const mode = req.body?.mode;
      const idempotencyKey = req.get("idempotency-key");
      if (!req.body || Object.keys(req.body).some((key) => key !== "mode")
          || !["private", "unlisted", "public"].includes(mode)
          || !idempotencyKey
          || !isMusicPublicationIdempotencyKeyCurrent(idempotencyKey, (dependencies.now?.() ?? new Date()).getTime())) {
        throw new MusicIdentityError("REQUEST_INVALID", 400, "The publication command is invalid.", "none", false);
      }
      const result = await dependencies.repository.executePublicationCommand(
        req.musicPrincipal!.musicUserId,
        idempotencyKey,
        mode,
      );
      if (result.status !== "completed") {
        if (result.status === "invalid") {
          throw new MusicIdentityError("REQUEST_INVALID", 400, "The publication command is invalid.", "none", false);
        }
        if (result.status === "conflict") {
          throw new MusicIdentityError("IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false);
        }
        if (result.status === "expired") {
          throw new MusicIdentityError("PUBLICATION_REPLAY_EXPIRED", 409, "The publication replay window has expired.", "none", false);
        }
        if (result.status === "rate_limited") {
          throw new MusicIdentityError("RATE_LIMITED", 429, "Too many publication commands.", "retry", true, result.retryAfterSeconds);
        }
        throw notFound();
      }
      res.status(200).json(result.response);
    } catch (error) { next(error); }
  }));

  app.post("/api/music/paid/import", ...mutation(async (req, res, next) => {
    try {
      const entitlement = await dependencies.repository.resolveEntitlement(req.musicPrincipal!.musicUserId);
      if (!entitlement || !entitlementDecision(entitlement, dependencies.now?.() ?? new Date()).paidMutation) {
        throw new MusicIdentityError("ENTITLEMENT_REQUIRED", 403, "A current Music entitlement is required.", "none", false);
      }
      throw new MusicIdentityError("SURFACE_REMOVED", 410, "This Music operation is unavailable.", "none", false);
    } catch (error) { next(error); }
  }));

  app.get("/api/music/entitlement", ...owner(async (req, res, next) => {
    try {
      const entitlement = await dependencies.repository.resolveEntitlement(req.musicPrincipal!.musicUserId)
        ?? { state: "unknown" as const };
      const decision = entitlementDecision(entitlement, dependencies.now?.() ?? new Date());
      res.status(200).json({
        state: entitlement.state,
        sourceUpdatedAt: entitlement.sourceUpdatedAt?.toISOString(),
        paidMutation: decision.paidMutation,
        coreRead: decision.coreRead,
        coreMutation: decision.coreMutation,
        maxAgeSeconds: MUSIC_ENTITLEMENT_MAX_AGE_SECONDS,
      });
    } catch (error) { next(error); }
  }));

  app.get("/api/playlist/:guestUrl", identify, async (req, res, next) => {
    try {
      const suppliedCapability = req.get("x-music-guest-capability");
      const capability = suppliedCapability && /^[A-Za-z0-9_-]{43}$/.test(suppliedCapability)
        ? suppliedCapability
        : undefined;
      const peerAddress = req.socket.remoteAddress;
      const source = dependencies.trustedProxyHops === 1 && dependencies.isTrustedProxy?.(peerAddress)
        ? (req.ip ?? peerAddress ?? "unknown")
        : (peerAddress ?? "unknown");
      const rateInput = { source, resource: req.params.guestUrl, ...(capability ? { capability } : {}) };
      const limited = dependencies.publicRateLimited?.(rateInput) ?? consumePublicSurfaceLimit(rateInput);
      if (limited) throw new MusicIdentityError(
        "RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60,
      );
      const resource = await dependencies.repository.resolveGuestResource(req.params.guestUrl, capability);
      if (!resource || !["unlisted", "public"].includes(resource.state) || !resource.playlist) throw notFound();
      if (resource.noindex) res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(200).json(publicPlaylistDto(resource.playlist));
    } catch (error) { next(error); }
  });

  app.post("/api/playlist/:guestUrl/youtube/search", identify, originGuard, async (req, res, next) => {
    try {
      const authority = await guestRequestAuthority(req, dependencies);
      if (!dependencies.youtube || !req.body || typeof req.body.query !== "string"
          || req.body.query.trim().length < 1 || req.body.query.length > 200
          || Object.keys(req.body).some((key) => !["query", "pageToken"].includes(key))
          || (req.body.pageToken !== undefined && (typeof req.body.pageToken !== "string" || req.body.pageToken.length > 256))) {
        throw new MusicIdentityError("REQUEST_INVALID", 400, "The YouTube search input is invalid.", "none", false);
      }
      void authority;
      res.status(200).json(await dependencies.youtube.search({ query: req.body.query.trim(), pageToken: req.body.pageToken }));
    } catch (error) { next(error); }
  });

  app.post("/api/playlist/:guestUrl/youtube/video-from-url", identify, originGuard, async (req, res, next) => {
    try {
      await guestRequestAuthority(req, dependencies);
      if (!dependencies.youtube || !req.body || typeof req.body.url !== "string" || req.body.url.length > 2_048
          || Object.keys(req.body).some((key) => key !== "url")) {
        throw new MusicIdentityError("REQUEST_INVALID", 400, "The YouTube URL is invalid.", "none", false);
      }
      const video = await dependencies.youtube.videoFromUrl(req.body.url);
      if (!video) throw notFound();
      res.status(200).json(video);
    } catch (error) { next(error); }
  });

  app.post("/api/playlist/:guestUrl/requests", identify, observePublic("request"), originGuard, async (req, res, next) => {
    try {
      const capability = req.get("x-music-guest-capability") ?? "";
      const capabilityValid = /^[A-Za-z0-9_-]{43}$/.test(capability);
      const idempotencyKey = req.get("idempotency-key");
      if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw invalidQueue();
      const result = await dependencies.repository.addGuestSongIdempotent(
        req.params.guestUrl, capabilityValid ? capability : undefined, publicRequestSource(req, dependencies), idempotencyKey, songInput(req.body),
      );
      if (result.status === "conflict") throw new MusicIdentityError("IDEMPOTENCY_CONFLICT", 409, "The idempotency key was already used for another Music command.", "none", false);
      else if (result.status === "limit") throw new MusicIdentityError("REQUEST_INVALID", 413, "The Music request queue is full.", "retry", true);
      else if (result.status === "forbidden") throw invalidGuestCapability();
      else if (result.status === "rate_limited") throw new MusicIdentityError("RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60);
      // Decision D1's monthly ceiling. RATE_LIMITED rather than a new error code: a monthly
      // cap is a rate limit, 429 is the right status for it, and reusing the code keeps the
      // published error contract and the OpenAPI surface unchanged. Retry-After is the real
      // time to the next calendar month, not a token minute - telling a guest to come back
      // in sixty seconds when the limit resets in nine days would simply be false.
      else if (result.status === "quota_exceeded") {
        throw new MusicIdentityError(
          "RATE_LIMITED", 429,
          `This venue has reached its monthly limit of ${result.cap} song requests. Requests open again next month.`,
          "retry", true, result.retryAfterSeconds,
        );
      }
      if (result.status !== "completed") throw invalidGuestCapability();
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(201).json(result.response);
    } catch (error) { next(error); }
  });

  app.use((cause: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const malformedPublicResource = malformedPublicDecodeResource(cause, req);
    const limited = malformedPublicResource !== undefined && (dependencies.publicRateLimited?.({
      source: publicRequestSource(req, dependencies),
      // A constant dimension prevents malformed encodings from manufacturing unbounded resource buckets.
      resource: malformedPublicResource,
    }) ?? consumePublicSurfaceLimit({
      source: publicRequestSource(req, dependencies),
      resource: malformedPublicResource,
    }));
    const error = limited
      ? new MusicIdentityError("RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60)
      : malformedPublicResource !== undefined ? notFound() : safeRouteError(cause);
    if (error.status === 429 || error.status === 503) res.setHeader("Retry-After", String(error.retryAfterSeconds ?? 1));
    const currentHeader = res.getHeader("X-Request-Id");
    const supplied = malformedPublicResource !== undefined ? req.get("x-request-id") : undefined;
    const requestId = res.locals.musicRequestId
      ?? (typeof currentHeader === "string" ? currentHeader : undefined)
      ?? (supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : undefined)
      ?? requestIdFactory();
    res.setHeader("X-Request-Id", requestId);
    res.status(error.status).json(musicErrorEnvelope(error, requestId));
  });
}

function httpOutcome(status: number): "success" | "invalid" | "not_found" | "forbidden" | "rate_limited" | "conflict" | "too_large" | "unavailable" {
  if (status < 400) return "success";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid";
}

function publicRequestSource(req: Request, dependencies: CanonicalMusicRouteDependencies): string {
  const peerAddress = req.socket.remoteAddress;
  return dependencies.trustedProxyHops === 1 && dependencies.isTrustedProxy?.(peerAddress)
    ? (req.ip ?? peerAddress ?? "unknown")
    : (peerAddress ?? "unknown");
}

function malformedPublicDecodeResource(cause: unknown, req: Request): string | undefined {
  if (!(cause instanceof URIError) || req.method !== "GET") return undefined;
  const queryOffset = req.originalUrl.indexOf("?");
  const path = queryOffset === -1 ? req.originalUrl : req.originalUrl.slice(0, queryOffset);
  for (const [prefix, resource] of [
    [PUBLIC_DESCRIPTOR_PATH_PREFIX, MALFORMED_PUBLIC_DESCRIPTOR_RESOURCE],
    [PUBLIC_RESOURCE_PATH_PREFIX, MALFORMED_PUBLIC_RESOURCE],
  ] as const) {
    if (!path.startsWith(prefix)) continue;
    const encodedSegment = path.slice(prefix.length);
    if (encodedSegment.length === 0 || encodedSegment.includes("/")) return undefined;
    try {
      decodeURIComponent(encodedSegment);
      return undefined;
    } catch (error) {
      return error instanceof URIError ? resource : undefined;
    }
  }
  return undefined;
}

/**
 * First-handler fail-closed boundary for every legacy surface which has not
 * been replaced by a canonical route above it. It never delegates owner,
 * paid, admin, GraphQL, or ambiguous legacy authority into old handlers.
 */
export function setupMusicSurfaceBoundary(app: Express, dependencies: CanonicalMusicRouteDependencies): void {
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  app.all("/{*musicRetiredPath}", async (req, res, next) => {
    const requestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(req.get("x-request-id") ?? "")
      ? req.get("x-request-id")!
      : requestIdFactory();
    res.setHeader("X-Request-Id", requestId);
    const retirement = matchRetiredMusicSurface(req.originalUrl);
    if (!retirement) return next();
    if (retirement.family === "legacy-browser-identity" && consumeContainmentLimit(`c6-legacy-identity:${req.socket.remoteAddress ?? "unknown"}`, 30, 60_000)) {
      const error = new MusicIdentityError("RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60);
      res.setHeader("Retry-After", "60");
      return res.status(429).json(musicErrorEnvelope(error, requestId));
    }
    const error = new MusicIdentityError("SURFACE_REMOVED", 410, "This Music operation is unavailable.", "none", false);
    return res.status(410).json(musicErrorEnvelope(error, requestId));
  });
}

function hasForbiddenOwnerInput(req: Request): boolean {
  return ["x-username", "x-user-id", "x-owner-id", "x-account-id", "x-email"].some((header) => req.get(header) !== undefined)
    || Object.keys(req.query).some((key) => OWNER_KEYS.has(key))
    || !!req.body && typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).some((key) => OWNER_KEYS.has(key));
}

const PUBLIC_DESCRIPTOR_AUTHORITY_HEADERS = [
  "authorization", "x-username", "x-email", "x-user-id", "x-music-user-id", "x-owner-id", "x-account-id",
  "x-document-id", "x-strapi-user-document-id", "x-strapi-account-document-id", "x-music-guest-capability",
] as const;

function hasUnexpectedPublicDescriptorAuthority(req: Request): boolean {
  const contentLength = req.get("content-length");
  return PUBLIC_DESCRIPTOR_AUTHORITY_HEADERS.some((header) => req.get(header) !== undefined)
    || Object.keys(req.query).length > 0
    || req.body !== undefined
    || contentLength !== undefined && contentLength !== "0"
    || req.get("transfer-encoding") !== undefined;
}

function hasUnexpectedPublicResourceAuthority(req: Request): boolean {
  const contentLength = req.get("content-length");
  return [
    "authorization", "x-username", "x-email", "x-user-id", "x-music-user-id", "x-owner-id", "x-account-id",
    "x-document-id", "x-strapi-user-document-id", "x-strapi-account-document-id",
  ].some((header) => req.get(header) !== undefined)
    || Object.keys(req.query).length > 0
    || req.body !== undefined
    || contentLength !== undefined && contentLength !== "0"
    || req.get("transfer-encoding") !== undefined;
}

function boundedIdentityDocumentId(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 512 ? normalized : undefined;
}

type DtoRecord = Record<string, unknown>;

function record(value: unknown): DtoRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DtoRecord : {};
}

function property(source: DtoRecord, camelCase: string, snakeCase: string = camelCase): unknown {
  return source[camelCase] ?? source[snakeCase];
}

function dateTime(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

function songDto(value: unknown) {
  const source = record(value);
  return {
    id: property(source, "id"),
    userId: property(source, "userId", "user_id"),
    youtubeId: property(source, "youtubeId", "youtube_id"),
    title: property(source, "title"),
    artist: property(source, "artist"),
    thumbnailUrl: property(source, "thumbnailUrl", "thumbnail_url"),
    position: property(source, "position"),
    status: property(source, "status"),
    playedAt: dateTime(property(source, "playedAt", "played_at")) ?? null,
  };
}

function playlistSongDto(value: unknown) {
  const source = record(value);
  return {
    id: property(source, "id"),
    playlistId: property(source, "playlistId", "playlist_id"),
    youtubeId: property(source, "youtubeId", "youtube_id"),
    title: property(source, "title"),
    artist: property(source, "artist"),
    thumbnailUrl: property(source, "thumbnailUrl", "thumbnail_url"),
    position: property(source, "position"),
    addedAt: dateTime(property(source, "addedAt", "added_at")),
  };
}

function playlistDto(value: unknown) {
  const source = record(value);
  const songs = property(source, "songs");
  return {
    id: property(source, "id"),
    userId: property(source, "userId", "user_id"),
    name: property(source, "name"),
    description: property(source, "description") ?? null,
    isVisibleToGuests: property(source, "isVisibleToGuests", "is_visible_to_guests") === true,
    createdAt: dateTime(property(source, "createdAt", "created_at")),
    updatedAt: dateTime(property(source, "updatedAt", "updated_at")),
    songs: Array.isArray(songs) ? songs.map(playlistSongDto) : [],
  };
}

function dashboardDto(value: unknown, includeQueueRevision = false) {
  const source = record(value);
  const songs = property(source, "songs");
  const playedSongs = property(source, "playedSongs", "played_songs");
  const currentlyPlaying = property(source, "currentlyPlaying", "currently_playing");
  const publication = record(property(source, "publication"));
  return {
    ...(includeQueueRevision ? {
      queueRevision: Number(property(source, "queueRevision", "queue_revision") ?? 0),
      playbackRevision: Number(property(source, "playbackRevision", "playback_revision") ?? 0),
    } : {}),
    songs: Array.isArray(songs) ? songs.map(songDto) : [],
    currentlyPlaying: currentlyPlaying ? songDto(currentlyPlaying) : null,
    playedSongs: Array.isArray(playedSongs) ? playedSongs.map(songDto) : [],
    ...(property(source, "publication") ? { publication: {
      mode: property(publication, "mode"),
      publicSlug: property(publication, "publicSlug", "public_slug"),
    } } : {}),
    ...(property(source, "guestControls", "guest_controls") ? { guestControls: guestControlsDto(property(source, "guestControls", "guest_controls")) } : {}),
  };
}

type GuestControls = {
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
  allowQueueVisibility: boolean;
};

type GuestControlsUpdate = Omit<GuestControls, "allowQueueVisibility"> & { allowQueueVisibility?: boolean };

const LEGACY_GUEST_CONTROL_KEYS = ["allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility"] as const;
const GUEST_CONTROL_KEYS = [...LEGACY_GUEST_CONTROL_KEYS, "allowQueueVisibility"] as const;

function guestControlsInput(value: unknown): GuestControlsUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidQueue();
  const source = value as Record<string, unknown>;
  if ((Object.keys(source).length !== LEGACY_GUEST_CONTROL_KEYS.length && Object.keys(source).length !== GUEST_CONTROL_KEYS.length)
      || Object.keys(source).some((key) => !GUEST_CONTROL_KEYS.includes(key as typeof GUEST_CONTROL_KEYS[number]))
      || LEGACY_GUEST_CONTROL_KEYS.some((key) => typeof source[key] !== "boolean")
      || ("allowQueueVisibility" in source && typeof source.allowQueueVisibility !== "boolean")) throw invalidQueue();
  return Object.fromEntries(GUEST_CONTROL_KEYS.filter((key) => key in source).map((key) => [key, source[key]])) as GuestControlsUpdate;
}

function guestControlsDto(value: unknown): GuestControls {
  const source = record(value);
  return {
    allowSongRequests: property(source, "allowSongRequests", "allow_song_requests") === true,
    allowGuestPlayOnDevice: property(source, "allowGuestPlayOnDevice", "allow_guest_play_on_device") === true,
    allowPlaylistSharing: property(source, "allowPlaylistSharing", "allow_playlist_sharing") === true,
    allowRecentlyPlayedVisibility: property(source, "allowRecentlyPlayedVisibility", "allow_recently_played_visibility") === true,
    allowQueueVisibility: property(source, "allowQueueVisibility", "allow_queue_visibility") === true,
  };
}

function publicPlaylistDto(value: unknown) {
  const source = record(value);
  const user = record(property(source, "user"));
  const playlists = property(source, "playlists");
  return {
    ...dashboardDto(source),
    user: {
      id: property(user, "id"),
      username: property(user, "username"),
      guestUrl: property(user, "guestUrl", "guest_url"),
      venueName: property(user, "venueName", "venue_name") ?? null,
      theme: property(user, "theme") ?? null,
      allowSongRequests: property(user, "allowSongRequests", "allow_song_requests") === true,
      allowGuestPlayOnDevice: property(user, "allowGuestPlayOnDevice", "allow_guest_play_on_device") === true,
      allowPlaylistSharing: property(user, "allowPlaylistSharing", "allow_playlist_sharing") === true,
      allowRecentlyPlayedVisibility: property(user, "allowRecentlyPlayedVisibility", "allow_recently_played_visibility") === true,
      allowQueueVisibility: property(user, "allowQueueVisibility", "allow_queue_visibility") === true,
    },
    allowGuestPlayOnDevice: property(source, "allowGuestPlayOnDevice", "allow_guest_play_on_device") === true,
    allowRecentlyPlayedVisibility: property(source, "allowRecentlyPlayedVisibility", "allow_recently_played_visibility") === true,
    allowQueueVisibility: property(source, "allowQueueVisibility", "allow_queue_visibility") === true,
    playlists: Array.isArray(playlists) ? playlists.map(playlistDto) : [],
  };
}

function positiveId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new MusicIdentityError("REQUEST_INVALID", 400, "The resource identifier is invalid.", "none", false);
  return id;
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw invalidQueue();
  return Number(value);
}

function playlistInput(value: unknown): { name: string; description: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MusicIdentityError("REQUEST_INVALID", 400, "The playlist input is invalid.", "none", false);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["name", "description"].includes(key))
      || typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 120
      || (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.length > 2_000))) {
    throw new MusicIdentityError("REQUEST_INVALID", 400, "The playlist input is invalid.", "none", false);
  }
  return { name: body.name.trim(), description: typeof body.description === "string" ? body.description : null };
}

function songInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidQueue();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["youtubeId", "title", "artist", "thumbnailUrl"].includes(key))
      || typeof body.youtubeId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(body.youtubeId)
      || ![body.title, body.artist].every((entry) => typeof entry === "string" && entry.length >= 1 && entry.length <= 1_024)
      || typeof body.thumbnailUrl !== "string" || body.thumbnailUrl.length < 1 || body.thumbnailUrl.length > 2_048) {
    throw invalidQueue();
  }
  return { youtubeId: body.youtubeId as string, title: body.title as string, artist: body.artist as string, thumbnailUrl: body.thumbnailUrl as string };
}

function queueReplaceInput(value: unknown): { expectedRevision: number; songs: Array<{ playlistId: number; songId: number }> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidQueue();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["expectedRevision", "songs"].includes(key))
      || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0
      || !Array.isArray(body.songs) || body.songs.length > 500) throw invalidQueue();
  const songs = body.songs.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidQueue();
    const source = value as Record<string, unknown>;
    if (Object.keys(source).some((key) => !["playlistId", "songId"].includes(key))
        || !Number.isSafeInteger(source.playlistId) || Number(source.playlistId) < 1
        || !Number.isSafeInteger(source.songId) || Number(source.songId) < 1) throw invalidQueue();
    return { playlistId: Number(source.playlistId), songId: Number(source.songId) };
  });
  return { expectedRevision: Number(body.expectedRevision), songs };
}

function invalidQueue() {
  return new MusicIdentityError("REQUEST_INVALID", 400, "The queue input is invalid.", "none", false);
}

function queueLimitReached() {
  return new MusicIdentityError("REQUEST_INVALID", 400, "The Music queue can contain at most 500 songs.", "none", false);
}

function playlistLimitReached() {
  return new MusicIdentityError("REQUEST_INVALID", 400, "Music can contain at most 200 saved playlists.", "none", false);
}

function savedPlaylistLimitReached() {
  return new MusicIdentityError("REQUEST_INVALID", 400, "A saved playlist can contain at most 500 songs.", "none", false);
}

function notFound() {
  return new MusicIdentityError("PUBLIC_NOT_FOUND", 404, "The Music resource was not found.", "none", false);
}

function invalidGuestCapability() {
  return new MusicIdentityError("GUEST_CAPABILITY_INVALID", 403, "The guest capability is invalid.", "none", false);
}

async function guestRequestAuthority(req: Request, dependencies: CanonicalMusicRouteDependencies) {
  const capability = req.get("x-music-guest-capability") ?? "";
  const capabilityValid = /^[A-Za-z0-9_-]{43}$/.test(capability);
  const authorityKey = capabilityValid ? hashGuestCapability(capability) : `public:${req.params.guestUrl}`;
  if (consumeContainmentLimit(`c6-guest-lookup:${authorityKey}`, 30, 60_000)) {
    throw new MusicIdentityError("RATE_LIMITED", 429, "Too many Music requests.", "retry", true, 60);
  }
  const authority = await dependencies.repository.resolveGuestRequestAuthority(req.params.guestUrl, capabilityValid ? capability : undefined);
  if (!authority?.active || !authority.allowSongRequests) throw invalidGuestCapability();
  return authority;
}

function safeRouteError(cause: unknown): MusicIdentityError {
  if (cause instanceof MusicIdentityError) return cause;
  if (cause instanceof MusicPrincipalError) {
    return new MusicIdentityError(cause.code, cause.status, cause.message, cause.status === 403 ? "contact_support" : "authenticate", false);
  }
  return safeMusicRequestError(cause);
}
