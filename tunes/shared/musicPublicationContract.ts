export type MusicPublicationMode = "private" | "unlisted" | "public";

export const MUSIC_PUBLICATION_IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const MUSIC_PUBLICATION_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const MUSIC_PUBLICATION_IDEMPOTENCY_FUTURE_SKEW_MS = 5 * 60 * 1_000;

const PUBLICATION_IDEMPOTENCY_KEY_PATTERN =
  /^tunes-share-v1-(\d{13})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function createMusicPublicationIdempotencyKey(issuedAtMs: number, uuid: string): string {
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 1 || !PUBLICATION_IDEMPOTENCY_KEY_PATTERN.test(`tunes-share-v1-${issuedAtMs}-${uuid}`)) {
    throw new Error("Music publication idempotency key input is invalid.");
  }
  return `tunes-share-v1-${issuedAtMs}-${uuid.toLowerCase()}`;
}

export function parseMusicPublicationIdempotencyKey(value: string): number | undefined {
  const match = PUBLICATION_IDEMPOTENCY_KEY_PATTERN.exec(value);
  if (!match) return undefined;
  const issuedAtMs = Number(match[1]);
  return Number.isSafeInteger(issuedAtMs) && issuedAtMs > 0 ? issuedAtMs : undefined;
}

export function isMusicPublicationIdempotencyKeyCurrent(value: string, authorityNowMs: number): boolean {
  const issuedAtMs = parseMusicPublicationIdempotencyKey(value);
  return issuedAtMs !== undefined
    && Number.isSafeInteger(authorityNowMs)
    && issuedAtMs > authorityNowMs - MUSIC_PUBLICATION_IDEMPOTENCY_RETENTION_MS - MUSIC_PUBLICATION_REPLAY_WINDOW_MS
    && issuedAtMs <= authorityNowMs + MUSIC_PUBLICATION_IDEMPOTENCY_FUTURE_SKEW_MS;
}

type Publication<M extends MusicPublicationMode> = {
  mode: M;
  publicSlug: string;
};

export type MusicPublicationCommandResponse =
  | { version: "music-publication/v1"; publication: Publication<"private"> }
  | { version: "music-publication/v1"; publication: Publication<"public"> }
  | { version: "music-publication/v1"; publication: Publication<"unlisted">; capability: string };

const PUBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

export function parseMusicPublicationResponse(
  value: unknown,
  requestedMode: "unlisted",
): Extract<MusicPublicationCommandResponse, { publication: { mode: "unlisted" } }>;
export function parseMusicPublicationResponse(
  value: unknown,
  requestedMode: "private",
): Extract<MusicPublicationCommandResponse, { publication: { mode: "private" } }>;
export function parseMusicPublicationResponse(
  value: unknown,
  requestedMode: "public",
): Extract<MusicPublicationCommandResponse, { publication: { mode: "public" } }>;
export function parseMusicPublicationResponse(
  value: unknown,
  requestedMode: MusicPublicationMode,
): MusicPublicationCommandResponse;
export function parseMusicPublicationResponse(
  value: unknown,
  requestedMode: MusicPublicationMode,
): MusicPublicationCommandResponse {
  const invalid = () => { throw new Error("Music sharing returned an invalid response."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  const expectedRootKeys = requestedMode === "unlisted"
    ? ["capability", "publication", "version"]
    : ["publication", "version"];
  if (!hasExactKeys(result, expectedRootKeys) || result.version !== "music-publication/v1") invalid();
  if (!result.publication || typeof result.publication !== "object" || Array.isArray(result.publication)) invalid();
  const publication = result.publication as Record<string, unknown>;
  if (!hasExactKeys(publication, ["mode", "publicSlug"])
      || publication.mode !== requestedMode
      || typeof publication.publicSlug !== "string"
      || !PUBLIC_SLUG_PATTERN.test(publication.publicSlug)) invalid();
  if (requestedMode === "unlisted"
      && (typeof result.capability !== "string" || !CAPABILITY_PATTERN.test(result.capability))) invalid();
  return value as MusicPublicationCommandResponse;
}
