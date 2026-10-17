import { createCipheriv, createDecipheriv, createHash, randomBytes as nodeRandomBytes } from "node:crypto";

export const MUSIC_PUBLICATION_RESPONSE_VERSION = "music-publication/v1" as const;
export const MUSIC_PUBLICATION_RESPONSE_RETENTION_SECONDS = 86_400 as const;

export type MusicPublicationMode = "private" | "unlisted" | "public";

export interface MusicPublicationCommandResponse {
  version: typeof MUSIC_PUBLICATION_RESPONSE_VERSION;
  publication: { mode: MusicPublicationMode; publicSlug: string };
  capability?: string;
}

export interface MusicPublicationResponseKey {
  kid: string;
  key: Buffer;
}

export interface MusicPublicationResponsePreviousKey extends MusicPublicationResponseKey {
  acceptUntil: number;
}

export interface MusicPublicationResponseKeyring {
  current: MusicPublicationResponseKey;
  previous?: MusicPublicationResponsePreviousKey;
  retentionSeconds: typeof MUSIC_PUBLICATION_RESPONSE_RETENTION_SECONDS;
}

export interface MusicPublicationResponseContext {
  musicUserId: number;
  idempotencyKeyHash: string;
  requestFingerprint: string;
}

export interface EncryptedMusicPublicationResponse {
  responseKeyId: string;
  responseNonce: Buffer;
  responseCiphertext: Buffer;
  responseTag: Buffer;
}

export interface MusicPublicationResponseCipherDependencies {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const KID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PUBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function hashPublicationIdempotencyKey(key: string): string {
  return createHash("sha256")
    .update("explorers.music.publication.idempotency-key/v1\0", "utf8")
    .update(key, "utf8")
    .digest("hex");
}

export function publicationRequestFingerprint(mode: MusicPublicationMode): string {
  return createHash("sha256")
    .update(`explorers.music.publication.request/v1\0mode=${mode}`, "utf8")
    .digest("hex");
}

export class MusicPublicationResponseCipher {
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;

  constructor(
    readonly keyring: MusicPublicationResponseKeyring,
    dependencies: MusicPublicationResponseCipherDependencies = {},
  ) {
    validateKeyring(keyring);
    this.now = dependencies.now ?? Date.now;
    this.randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
  }

  encrypt(
    context: MusicPublicationResponseContext,
    response: MusicPublicationCommandResponse,
  ): EncryptedMusicPublicationResponse {
    validateContext(context);
    validateResponse(response);
    const nonce = this.randomBytes(12);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new Error("Publication response nonce generation failed.");
    const cipher = createCipheriv("aes-256-gcm", this.keyring.current.key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad(context, this.keyring.current.kid));
    const plaintext = Buffer.from(JSON.stringify(response), "utf8");
    const responseCiphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    plaintext.fill(0);
    return {
      responseKeyId: this.keyring.current.kid,
      responseNonce: nonce,
      responseCiphertext,
      responseTag: cipher.getAuthTag(),
    };
  }

  decrypt(
    context: MusicPublicationResponseContext,
    encrypted: EncryptedMusicPublicationResponse,
  ): MusicPublicationCommandResponse {
    validateContext(context);
    const key = this.resolveReplayKey(encrypted.responseKeyId);
    if (encrypted.responseNonce.length !== 12 || encrypted.responseTag.length !== 16
        || encrypted.responseCiphertext.length < 1 || encrypted.responseCiphertext.length > 4096) {
      throw new Error("Publication response ciphertext is invalid.");
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, encrypted.responseNonce, { authTagLength: 16 });
      decipher.setAAD(aad(context, encrypted.responseKeyId));
      decipher.setAuthTag(encrypted.responseTag);
      const plaintext = Buffer.concat([decipher.update(encrypted.responseCiphertext), decipher.final()]);
      try {
        const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
        validateResponse(parsed);
        return parsed;
      } finally {
        plaintext.fill(0);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Publication response payload is invalid.") throw error;
      throw new Error("Publication response could not be authenticated or decrypted.");
    }
  }

  acceptsReplayKey(kid: string): boolean {
    if (kid === this.keyring.current.kid) return true;
    const previous = this.keyring.previous;
    return previous !== undefined && kid === previous.kid
      && this.now() <= previous.acceptUntil;
  }

  private resolveReplayKey(kid: string): Buffer {
    if (kid === this.keyring.current.kid) return this.keyring.current.key;
    const previous = this.keyring.previous;
    if (previous && kid === previous.kid && this.now() <= previous.acceptUntil) return previous.key;
    throw new Error("Publication response key unavailable.");
  }
}

function aad(context: MusicPublicationResponseContext, kid: string): Buffer {
  return Buffer.from([
    "explorers.music.publication.response-aead/v1",
    `schema=${MUSIC_PUBLICATION_RESPONSE_VERSION}`,
    `owner=${context.musicUserId}`,
    `operation=${context.idempotencyKeyHash}`,
    `request=${context.requestFingerprint}`,
    `kid=${kid}`,
  ].join("\n"), "utf8");
}

function validateKeyring(keyring: MusicPublicationResponseKeyring): void {
  if (keyring.retentionSeconds !== MUSIC_PUBLICATION_RESPONSE_RETENTION_SECONDS
      || !KID_PATTERN.test(keyring.current.kid) || keyring.current.key.length !== 32
      || (keyring.previous && (!KID_PATTERN.test(keyring.previous.kid)
        || keyring.previous.key.length !== 32
        || keyring.previous.kid === keyring.current.kid
        || keyring.previous.key.equals(keyring.current.key)
        || !Number.isSafeInteger(keyring.previous.acceptUntil)))) {
    throw new Error("Publication response key configuration is invalid.");
  }
}

function validateContext(context: MusicPublicationResponseContext): void {
  if (!Number.isSafeInteger(context.musicUserId) || context.musicUserId < 1
      || !HASH_PATTERN.test(context.idempotencyKeyHash) || !HASH_PATTERN.test(context.requestFingerprint)) {
    throw new Error("Publication response context is invalid.");
  }
}

function validateResponse(value: unknown): asserts value is MusicPublicationCommandResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Publication response payload is invalid.");
  const response = value as Record<string, unknown>;
  const publication = response.publication as Record<string, unknown> | undefined;
  const responseKeys = Object.keys(response);
  if (response.version !== MUSIC_PUBLICATION_RESPONSE_VERSION
      || !publication || typeof publication !== "object" || Array.isArray(publication)
      || !["private", "unlisted", "public"].includes(String(publication.mode))
      || typeof publication.publicSlug !== "string" || !PUBLIC_SLUG_PATTERN.test(publication.publicSlug)
      || Object.keys(publication).some((key) => !["mode", "publicSlug"].includes(key))
      || responseKeys.some((key) => !["version", "publication", "capability"].includes(key))
      || (response.capability !== undefined && (typeof response.capability !== "string" || !CAPABILITY_PATTERN.test(response.capability)))
      || (publication.mode === "unlisted") !== (typeof response.capability === "string")) {
    throw new Error("Publication response payload is invalid.");
  }
}
