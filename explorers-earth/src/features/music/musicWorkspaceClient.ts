import { MusicClientError, type LocalMusicRequest, type MusicClientErrorCode } from "../../lib/localTunesApiClient";
import { z } from "zod";
import {
  parseMusicEntitlementResponse,
} from "./musicEntitlementContract";
import {
  parseMusicPublicationResponse,
  type MusicPublicationCommandResponse,
  type MusicPublicationMode,
} from "../../../../tunes/shared/musicPublicationContract";

export type { MusicEntitlementResponse, MusicEntitlementState } from "./musicEntitlementContract";

export interface MusicSong {
  id: number;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  position: number;
  status: "queued" | "playing" | "played";
  playedAt: string | null;
}

export interface MusicPlaylist {
  id: number;
  name: string;
  description: string | null;
  isVisibleToGuests: boolean;
  songs: MusicPlaylistSong[];
}

export interface MusicPlaylistSong {
  id: number;
  playlistId: number;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  position: number;
  addedAt: string;
}

export type { MusicPublicationMode } from "../../../../tunes/shared/musicPublicationContract";

export interface MusicDashboardResponse {
  queueRevision: number;
  playbackRevision?: number;
  songs: MusicSong[];
  currentlyPlaying: MusicSong | null;
  playedSongs: MusicSong[];
  publication: { mode: MusicPublicationMode; publicSlug: string };
  guestControls?: MusicGuestControls;
}
export interface MusicGuestControls {
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
  allowQueueVisibility: boolean;
}

export type MusicRequest = (input: LocalMusicRequest) => Promise<Response>;

export const MAX_RETRY_AFTER_SECONDS = 3_600;

export async function requestMusicJson<T>(request: MusicRequest, input: LocalMusicRequest, parse?: (value: unknown) => T): Promise<T> {
  const response = await request(input);
  if (!response.ok) throw await containedWorkspaceError(response);
  try {
    const value: unknown = await response.json();
    return parse ? parse(value) : value as T;
  } catch (error) {
    if (error instanceof MusicClientError) throw error;
    throw invalidSuccessfulResponse();
  }
}

export async function requestMusicEmpty(request: MusicRequest, input: LocalMusicRequest): Promise<void> {
  const response = await request(input);
  if (!response.ok) throw await containedWorkspaceError(response);
}

export async function containedWorkspaceError(response: Response): Promise<MusicClientError> {
  let upstreamCode: string | undefined;
  let retryable = false;
  try {
    const body = await response.clone().json() as { error?: { code?: unknown; retryable?: unknown } };
    upstreamCode = typeof body.error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.error.code) ? body.error.code : undefined;
  } catch {
    // The response body is intentionally contained; status remains canonical.
  }
  const trustedRetry = (response.status === 429 && upstreamCode === "RATE_LIMITED")
    || (response.status === 500 && upstreamCode === "INTERNAL_ERROR")
    || (response.status === 502 && ["UPSTREAM_MALFORMED", "UPSTREAM_UNAVAILABLE"].includes(upstreamCode ?? ""))
    || (response.status === 503 && ["UPSTREAM_UNAVAILABLE", "DATABASE_UNAVAILABLE"].includes(upstreamCode ?? ""));
  retryable = trustedRetry;
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = trustedRetry && retryAfterHeader && /^[1-9][0-9]*$/.test(retryAfterHeader)
    ? Number(BigInt(retryAfterHeader) > BigInt(MAX_RETRY_AFTER_SECONDS) ? MAX_RETRY_AFTER_SECONDS : BigInt(retryAfterHeader))
    : undefined;
  const requestIdHeader = response.headers.get("x-request-id");
  const requestId = requestIdHeader && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(requestIdHeader)
    ? requestIdHeader
    : undefined;
  const code: MusicClientErrorCode = response.status === 401 ? "AUTH_REQUIRED"
    : response.status === 400 ? "REQUEST_INVALID"
      : response.status === 403 || response.status === 409 ? "AUTH_UNAVAILABLE" : "SERVICE_UNAVAILABLE";
  return new MusicClientError(
    code,
    response.status,
    response.status === 401 ? "Music authorization is required." : "Music is temporarily unavailable.",
    retryAfter,
    upstreamCode,
    retryable,
    requestId,
  );
}

function invalidSuccessfulResponse(): MusicClientError {
  return new MusicClientError("SERVICE_UNAVAILABLE", 502, "Music returned an invalid response.");
}

const boundedText = (maximum: number) => z.string().min(1).max(maximum);
const dateTime = z.string().datetime({ offset: true }).max(40);
const songSchema = z.object({
  id: z.number().int().positive(), userId: z.number().int().positive().optional(),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: boundedText(1_024), artist: boundedText(1_024),
  thumbnailUrl: boundedText(2_048), position: z.number().int().nonnegative(),
  status: z.enum(["queued", "playing", "played"]), playedAt: dateTime.nullable(),
}).strict();
const playlistSongSchema = z.object({
  id: z.number().int().positive(), playlistId: z.number().int().positive(), youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: boundedText(1_024), artist: boundedText(1_024), thumbnailUrl: boundedText(2_048),
  position: z.number().int().nonnegative(), addedAt: dateTime,
}).strict();
const playlistSchema = z.object({
  id: z.number().int().positive(), userId: z.number().int().positive().optional(), name: boundedText(120),
  description: z.string().max(2_000).nullable(), isVisibleToGuests: z.boolean(),
  createdAt: dateTime.optional(), updatedAt: dateTime.optional(), songs: z.array(playlistSongSchema).max(500),
}).strict();
const guestControlsSchema = z.object({ allowSongRequests: z.boolean(), allowGuestPlayOnDevice: z.boolean(), allowPlaylistSharing: z.boolean(), allowRecentlyPlayedVisibility: z.boolean(), allowQueueVisibility: z.boolean() }).strict();
const dashboardSchema = z.object({
  queueRevision: z.number().int().nonnegative(), playbackRevision: z.number().int().nonnegative().optional(), songs: z.array(songSchema).max(500),
  currentlyPlaying: songSchema.nullable(), playedSongs: z.array(songSchema).max(500),
  publication: z.object({ mode: z.enum(["private", "unlisted", "public"]), publicSlug: boundedText(128) }).strict(), guestControls: guestControlsSchema.optional(),
}).strict();

export function parseMusicSong(value: unknown): MusicSong {
  const result = songSchema.safeParse(value);
  if (!result.success) throw invalidSuccessfulResponse();
  return {
    id: result.data.id, youtubeId: result.data.youtubeId, title: result.data.title, artist: result.data.artist,
    thumbnailUrl: result.data.thumbnailUrl, position: result.data.position, status: result.data.status, playedAt: result.data.playedAt,
  };
}

export function parseMusicPlaylist(value: unknown): MusicPlaylist {
  const result = playlistSchema.safeParse(value);
  if (!result.success) throw invalidSuccessfulResponse();
  return {
    id: result.data.id, name: result.data.name, description: result.data.description,
    isVisibleToGuests: result.data.isVisibleToGuests, songs: result.data.songs,
  };
}

export function parseMusicDashboard(value: unknown): MusicDashboardResponse {
  const result = dashboardSchema.safeParse(value);
  if (!result.success) throw invalidSuccessfulResponse();
  return {
    ...result.data,
    songs: result.data.songs.map(parseMusicSong),
    currentlyPlaying: result.data.currentlyPlaying === null ? null : parseMusicSong(result.data.currentlyPlaying),
    playedSongs: result.data.playedSongs.map(parseMusicSong),
  };
}

export function createMusicWorkspaceClient(request: MusicRequest) {
  return {
    loadDashboard() {
      return requestMusicJson<MusicDashboardResponse>(request, { method: 'GET', path: '/api/music/dashboard' }, parseMusicDashboard);
    },
    async load() {
      const [playlists, dashboard, entitlement] = await Promise.all([
        requestMusicJson<MusicPlaylist[]>(request, { method: "GET", path: "/api/playlists" }, (value) => {
          const result = z.array(playlistSchema).max(200).safeParse(value);
          if (!result.success) throw invalidSuccessfulResponse();
          return result.data.map(parseMusicPlaylist);
        }),
        requestMusicJson<MusicDashboardResponse>(request, { method: "GET", path: "/api/music/dashboard" }, parseMusicDashboard),
        requestMusicJson<unknown>(request, { method: "GET", path: "/api/music/entitlement" }).then(parseMusicEntitlementResponse),
      ]);
      return { playlists, dashboard, entitlement, guestControls: dashboard.guestControls ?? { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false } };
    },
    createPlaylist(name: string, description: string | null, idempotencyKey: string) {
      return requestMusicJson<MusicPlaylist>(request, { method: "POST", path: "/api/playlists", body: { name, description }, idempotencyKey }, parseMusicPlaylist);
    },
    renamePlaylist(playlistId: number, name: string, description: string | null, idempotencyKey: string) {
      return requestMusicJson<MusicPlaylist>(request, { method: "PATCH", path: `/api/playlists/${playlistId}`, body: { name, description }, idempotencyKey }, parseMusicPlaylist);
    },
    deletePlaylist(playlistId: number, idempotencyKey: string) {
      return requestMusicEmpty(request, { method: "DELETE", path: `/api/playlists/${playlistId}`, idempotencyKey });
    },
    removePlaylistSong(playlistId: number, songId: number, idempotencyKey: string) {
      return requestMusicEmpty(request, { method: "DELETE", path: `/api/playlists/${playlistId}/songs/${songId}`, idempotencyKey });
    },
    addPlaylistSong(playlistId: number, song: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }, idempotencyKey: string) {
      return requestMusicJson<MusicPlaylistSong>(request, { method: "POST", path: `/api/playlists/${playlistId}/songs`, body: song, idempotencyKey }, (value) => {
        const result = playlistSongSchema.safeParse(value);
        if (!result.success) throw invalidSuccessfulResponse();
        return result.data;
      });
    },
    updateGuestControls(controls: MusicGuestControls, idempotencyKey: string) {
      return requestMusicJson<MusicGuestControls>(request, { method: "PATCH", path: "/api/music/guest-controls", body: controls, idempotencyKey }, (value) => {
        const result = guestControlsSchema.safeParse(value); if (!result.success) throw invalidSuccessfulResponse(); return result.data;
      });
    },
    setPlaylistVisibility(playlistId: number, isVisibleToGuests: boolean, idempotencyKey: string) {
      return requestMusicEmpty(request, { method: "PATCH", path: `/api/playlists/${playlistId}/visibility`, body: { isVisibleToGuests }, idempotencyKey });
    },
    reorderPlaylistSong(playlistId: number, songId: number, position: number, idempotencyKey: string) {
      return requestMusicEmpty(request, { method: "PATCH", path: `/api/playlists/${playlistId}/reorder`, body: { songId, position }, idempotencyKey });
    },
    async setPublication(mode: MusicPublicationMode, idempotencyKey: string): Promise<MusicPublicationCommandResponse> {
      const response = await request({
        method: "POST", path: "/api/music/publication", body: { mode }, idempotencyKey,
      });
      if (!response.ok) throw await containedWorkspaceError(response);
      return parseMusicPublicationResponse(await response.json(), mode);
    },
  };
}
