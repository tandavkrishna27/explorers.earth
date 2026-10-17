import { createHmac, randomBytes as secureRandomBytes, timingSafeEqual } from "node:crypto";
import type { MusicIdentityProjection } from "../repositories/musicIdentityRepository";

export const MUSIC_TOKEN_ISSUER = "explorers-tunes" as const;
export const MUSIC_TOKEN_AUDIENCE = "music-api" as const;

export interface MusicTokenKey {
  kid: string;
  secret: string;
}

export interface MusicTokenPreviousKey extends MusicTokenKey {
  acceptUntil: number;
}

export interface MusicTokenConfiguration {
  current: MusicTokenKey;
  previous?: MusicTokenPreviousKey;
  tokenLifetimeSeconds: number;
  clockSkewSeconds: number;
}

export interface MusicTokenClaims {
  iss: typeof MUSIC_TOKEN_ISSUER;
  aud: typeof MUSIC_TOKEN_AUDIENCE;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  sessionVersion: number;
  /**
   * ADR-008. Present only when `sub` is a canonical account id. Absent means the
   * subject is a legacy Strapi user document id. The kind is carried explicitly
   * because a Strapi document id that happened to be UUID-shaped would otherwise be
   * resolved against the wrong table.
   */
  subjectKind?: typeof CANONICAL_SUBJECT_KIND;
  /**
   * Ticket 6.3. Present only on a socket handshake ticket. Its absence means a general
   * owner credential, which the socket must refuse; its presence means a ticket, which
   * every HTTP surface must refuse. The separation is the point: before this claim the
   * socket consumed the same 600-second bearer as owner HTTP, so a leaked handshake
   * value was ten minutes of full owner access.
   */
  purpose?: typeof SOCKET_TICKET_PURPOSE;
  /**
   * Ticket 6.1, step 5 obligation 4. The canonical session this credential was minted
   * from, and its owner. Present only on a canonical subject.
   *
   * Why both: `auth_session.session_version` is the canonical session's counter while
   * `sessionVersion` above is the *venue's*, so they cannot be compared. The check these
   * enable is therefore "this session still exists for this user", which is precisely
   * what logout changes - it deletes the row.
   *
   * Optional, so a legacy Strapi subject and any canonical credential minted before this
   * claim existed still verify until it expires.
   */
  sid?: string;
  uid?: string;
}

/** Ticket 6.3. A verified token's claims and the key ID that vouched for them. */
export interface MusicTokenContext {
  readonly claims: MusicTokenClaims;
  readonly kid: string;
}

export interface MintedMusicToken {
  token: string;
  expiresAt: number;
}

export class MusicTokenError extends Error {
  constructor(readonly code: "TOKEN_INVALID" | "TOKEN_EXPIRED", message: string) {
    super(message);
    this.name = "MusicTokenError";
  }
}

interface MusicTokenDependencies {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

const HEADER_KEYS = ["alg", "kid"] as const;
const CLAIM_KEYS = ["aud", "exp", "iat", "iss", "jti", "sessionVersion", "sub"] as const;
const OPTIONAL_CLAIM_KEYS = ["subjectKind", "purpose", "sid", "uid"] as const;
export const CANONICAL_SUBJECT_KIND = "canonical-account";
export const SOCKET_TICKET_PURPOSE = "music-socket";
/**
 * Deliberately a constant rather than configuration. The configured lifetime is
 * pinned to exactly 600 seconds by validateMusicTokenConfiguration, and a handshake
 * ticket must be far shorter without weakening that invariant.
 */
export const SOCKET_TICKET_LIFETIME_SECONDS = 60;
/**
 * Better Auth ids for `auth_session.id` and `auth_user.id`, both `text`. Bounded and
 * restricted to URL-safe characters so a claim cannot carry a SQL fragment or an
 * unbounded string into the session lookup.
 */
const SESSION_BINDING_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const CANONICAL_SUBJECT_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
const JTI_PATTERN = /^[a-f0-9]{32}$/;

export class MusicTokenService {
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;

  constructor(
    private readonly configuration: MusicTokenConfiguration,
    dependencies: MusicTokenDependencies = {},
  ) {
    this.now = dependencies.now ?? Date.now;
    this.randomBytes = dependencies.randomBytes ?? secureRandomBytes;
    validateMusicTokenConfiguration(configuration, this.now());
  }

  mint(identity: MusicIdentityProjection): MintedMusicToken {
    if (identity.identityStatus !== "active"
        || !SUBJECT_PATTERN.test(identity.strapiUserDocumentId)
        || !Number.isSafeInteger(identity.sessionVersion)
        || identity.sessionVersion < 1) {
      throw new MusicTokenError("TOKEN_INVALID", "Music credential cannot be minted for this identity.");
    }
    return this.issue(identity.strapiUserDocumentId, identity.sessionVersion);
  }

  /**
   * ADR-008. Mints a credential whose subject is the canonical account that owns the
   * venue row. Additive: it does not widen MusicIdentityProjection, so the legacy
   * path and its call sites keep their guarantees.
   */
  mintCanonical(input: {
    accountId: string; musicUserId: number; sessionVersion: number;
    sessionId?: string; userId?: string;
  }): MintedMusicToken {
    if (!CANONICAL_SUBJECT_PATTERN.test(input.accountId)
        || !Number.isSafeInteger(input.musicUserId)
        || input.musicUserId < 1
        || !Number.isSafeInteger(input.sessionVersion)
        || input.sessionVersion < 1
        || (input.sessionId !== undefined && !SESSION_BINDING_PATTERN.test(input.sessionId))
        || (input.userId !== undefined && !SESSION_BINDING_PATTERN.test(input.userId))
        // Neither half is useful alone: the session cannot be checked without the user it
        // must belong to, so refuse a partial binding rather than mint an uncheckable one.
        || (input.sessionId === undefined) !== (input.userId === undefined)) {
      throw new MusicTokenError("TOKEN_INVALID", "Music credential cannot be minted for this identity.");
    }
    return this.issue(input.accountId, input.sessionVersion, CANONICAL_SUBJECT_KIND, undefined,
      input.sessionId, input.userId);
  }

  /**
   * Ticket 6.3. A short, purpose-limited handshake ticket for the same owner. It carries
   * the subject and session version so revocation still applies, and nothing else: it is
   * not accepted by any HTTP surface, so it cannot stand in for a credential.
   */
  mintSocketTicket(input: {
    subject: string; sessionVersion: number; subjectKind?: typeof CANONICAL_SUBJECT_KIND;
    sessionId?: string; userId?: string;
  }): MintedMusicToken {
    const canonical = input.subjectKind === CANONICAL_SUBJECT_KIND;
    if (!(canonical ? CANONICAL_SUBJECT_PATTERN : SUBJECT_PATTERN).test(input.subject)
        || !Number.isSafeInteger(input.sessionVersion)
        || input.sessionVersion < 1
        || (input.sessionId !== undefined && !SESSION_BINDING_PATTERN.test(input.sessionId))
        || (input.userId !== undefined && !SESSION_BINDING_PATTERN.test(input.userId))
        || (input.sessionId === undefined) !== (input.userId === undefined)) {
      throw new MusicTokenError("TOKEN_INVALID", "Music socket ticket cannot be minted for this identity.");
    }
    // The handshake inherits the credential's session binding, so an open socket is
    // rechecked against the same session owner HTTP is.
    return this.issue(input.subject, input.sessionVersion, input.subjectKind, SOCKET_TICKET_PURPOSE,
      input.sessionId, input.userId);
  }

  private issue(
    sub: string,
    sessionVersion: number,
    subjectKind?: typeof CANONICAL_SUBJECT_KIND,
    purpose?: typeof SOCKET_TICKET_PURPOSE,
    sid?: string,
    uid?: string,
  ): MintedMusicToken {
    const iat = Math.floor(this.now() / 1_000);
    const exp = iat + (purpose ? SOCKET_TICKET_LIFETIME_SECONDS : this.configuration.tokenLifetimeSeconds);
    const header = { alg: "HS256", kid: this.configuration.current.kid };
    const claims: MusicTokenClaims = {
      iss: MUSIC_TOKEN_ISSUER,
      aud: MUSIC_TOKEN_AUDIENCE,
      sub,
      jti: this.randomBytes(16).toString("hex"),
      iat,
      exp,
      sessionVersion,
      ...(subjectKind ? { subjectKind } : {}),
      ...(purpose ? { purpose } : {}),
      ...(sid && uid ? { sid, uid } : {}),
    };
    const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`;
    return {
      token: `${unsigned}.${signature(unsigned, this.configuration.current.secret)}`,
      expiresAt: exp * 1_000,
    };
  }

  /**
   * Ticket 6.3. Every HTTP surface verifies through here, and a handshake ticket is
   * refused: a ticket is not a credential, so a leaked one cannot be replayed against
   * owner HTTP. Use verifySocketTicket for the handshake, which refuses the inverse.
   */
  verify(token: string): MusicTokenClaims {
    return this.verifyContext(token).claims;
  }

  /** Ticket 6.3. The handshake's only accepted credential, and never a general one. */
  verifySocketTicket(token: string): MusicTokenClaims {
    return this.verifySocketTicketContext(token).claims;
  }

  /**
   * Ticket 6.3. Verification plus the signing key that vouched for the token. A socket
   * keeps the key ID rather than the token, so an operator who rotates keys to invalidate
   * credentials still evicts already-connected owners through acceptsSigningKey, without
   * the connection holding a replayable credential for its whole lifetime.
   */
  verifyContext(token: string): MusicTokenContext {
    const context = this.decode(token);
    if (context.claims.purpose !== undefined) return invalid();
    return context;
  }

  /** Ticket 6.3. The handshake equivalent of verifyContext. */
  verifySocketTicketContext(token: string): MusicTokenContext {
    const context = this.decode(token);
    if (context.claims.purpose !== SOCKET_TICKET_PURPOSE) return invalid();
    return context;
  }

  /**
   * Ticket 6.3. Whether a key ID is still accepted for verification right now. A rotated
   * previous key stops being accepted once its bounded overlap elapses, which is the
   * mechanism that retires credentials it signed.
   */
  acceptsSigningKey(kid: string): boolean {
    return this.verificationKey(kid, this.now()) !== undefined;
  }

  private decode(token: string): MusicTokenContext {
    try {
      if (typeof token !== "string" || token.length < 64 || token.length > 4_096) return invalid();
      const segments = token.split(".");
      if (segments.length !== 3 || segments.some((segment) => !segment)) return invalid();
      const [headerPart, payloadPart, signaturePart] = segments;
      const header = decodeStrictObject(headerPart, HEADER_KEYS) as { alg?: unknown; kid?: unknown };
      if (header.alg !== "HS256" || typeof header.kid !== "string" || !KID_PATTERN.test(header.kid)) return invalid();
      const now = this.now();
      const key = this.verificationKey(header.kid, now);
      if (!key) return invalid();
      const unsigned = `${headerPart}.${payloadPart}`;
      const expected = Buffer.from(signature(unsigned, key.secret));
      const provided = Buffer.from(signaturePart);
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return invalid();
      const claims = decodeStrictObject(payloadPart, CLAIM_KEYS, OPTIONAL_CLAIM_KEYS) as Partial<MusicTokenClaims>;
      validateClaims(claims, this.configuration, now);
      return { claims: claims as MusicTokenClaims, kid: header.kid };
    } catch (error) {
      if (error instanceof MusicTokenError) throw error;
      return invalid();
    }
  }

  private verificationKey(kid: string, now: number): MusicTokenKey | undefined {
    if (kid === this.configuration.current.kid) return this.configuration.current;
    const previous = this.configuration.previous;
    return previous && kid === previous.kid && now < previous.acceptUntil ? previous : undefined;
  }
}

export function validateMusicTokenConfiguration(configuration: MusicTokenConfiguration, now: number): void {
  if (configuration.tokenLifetimeSeconds !== 600) {
    throw new Error("MUSIC_TOKEN_LIFETIME_SECONDS must be exactly 600");
  }
  if (!Number.isSafeInteger(configuration.clockSkewSeconds)
      || configuration.clockSkewSeconds < 0
      || configuration.clockSkewSeconds > 30) {
    throw new Error("MUSIC_TOKEN_CLOCK_SKEW_SECONDS must be between 0 and 30");
  }
  validateKey(configuration.current, "current");
  if (configuration.previous) {
    validateKey(configuration.previous, "previous");
    if (configuration.previous.kid === configuration.current.kid) throw new Error("Music token key IDs must differ");
    if (!Number.isSafeInteger(configuration.previous.acceptUntil)
        || configuration.previous.acceptUntil > now + (configuration.tokenLifetimeSeconds + configuration.clockSkewSeconds) * 1_000) {
      throw new Error("Music token previous-key overlap is invalid or unbounded");
    }
  }
}

function validateKey(key: MusicTokenKey, label: string): void {
  if (!KID_PATTERN.test(key.kid)) throw new Error(`Music token ${label} kid is invalid`);
  if (!/^[A-Za-z0-9_-]+$/.test(key.secret)) throw new Error(`Music token ${label} secret must be canonical base64url`);
  const decoded = Buffer.from(key.secret, "base64url");
  if (decoded.length < 32 || decoded.toString("base64url") !== key.secret) {
    throw new Error(`Music token ${label} secret must contain at least 32 decoded bytes`);
  }
}

function validateClaims(
  claims: Partial<MusicTokenClaims>,
  configuration: MusicTokenConfiguration,
  nowMilliseconds: number,
): void {
  if (claims.iss !== MUSIC_TOKEN_ISSUER
      || claims.aud !== MUSIC_TOKEN_AUDIENCE
      || typeof claims.sub !== "string"
      || !SUBJECT_PATTERN.test(claims.sub)
      || typeof claims.jti !== "string"
      || !JTI_PATTERN.test(claims.jti)
      || !Number.isSafeInteger(claims.iat)
      || !Number.isSafeInteger(claims.exp)
      || !Number.isSafeInteger(claims.sessionVersion)
      || (claims.sessionVersion ?? 0) < 1
      || (claims.subjectKind !== undefined && claims.subjectKind !== CANONICAL_SUBJECT_KIND)
      || (claims.subjectKind === CANONICAL_SUBJECT_KIND && !CANONICAL_SUBJECT_PATTERN.test(claims.sub))
      || (claims.purpose !== undefined && claims.purpose !== SOCKET_TICKET_PURPOSE)
      || (claims.sid !== undefined && (typeof claims.sid !== "string" || !SESSION_BINDING_PATTERN.test(claims.sid)))
      || (claims.uid !== undefined && (typeof claims.uid !== "string" || !SESSION_BINDING_PATTERN.test(claims.uid)))
      // A half-bound token is uncheckable, so it is invalid rather than treated as unbound.
      || ((claims.sid === undefined) !== (claims.uid === undefined))
      // Only a canonical subject carries a session binding.
      || (claims.sid !== undefined && claims.subjectKind !== CANONICAL_SUBJECT_KIND)) return invalid();
  const iat = claims.iat as number;
  const exp = claims.exp as number;
  const lifetime = exp - iat;
  // Exact for both kinds. A handshake ticket must be exactly its own short lifetime and a
  // credential exactly the configured one, so neither can be minted with the other's
  // window and neither can be stretched by an attacker reusing the structure.
  const expectedLifetime = claims.purpose === SOCKET_TICKET_PURPOSE
    ? SOCKET_TICKET_LIFETIME_SECONDS
    : configuration.tokenLifetimeSeconds;
  if (lifetime !== expectedLifetime) return invalid();
  const now = Math.floor(nowMilliseconds / 1_000);
  if (iat > now + configuration.clockSkewSeconds) return invalid();
  if (now >= exp + configuration.clockSkewSeconds) {
    throw new MusicTokenError("TOKEN_EXPIRED", "The Music credential has expired.");
  }
}

function decodeStrictObject(segment: string, expectedKeys: readonly string[], optionalKeys: readonly string[] = []): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return invalid();
  const bytes = Buffer.from(segment, "base64url");
  if (bytes.toString("base64url") !== segment) return invalid();
  const raw = bytes.toString("utf8");
  if (raw.includes("\\")) return invalid();
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalid();
  const keys = Array.from(raw.matchAll(/"([A-Za-z][A-Za-z0-9]*)"\s*:/g), (match) => match[1]);
  if (new Set(keys).size !== keys.length) return invalid();
  const actualKeys = Object.keys(parsed as object);
  // Every required key present, and nothing beyond required plus explicitly optional.
  // Unknown claims remain refused outright; optionality is never inferred.
  const allowed = new Set<string>([...expectedKeys, ...optionalKeys]);
  if (actualKeys.some((key) => !allowed.has(key))) return invalid();
  if (expectedKeys.some((key) => !actualKeys.includes(key))) return invalid();
  return parsed as Record<string, unknown>;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(unsigned: string, secret: string): string {
  return createHmac("sha256", Buffer.from(secret, "base64url")).update(unsigned).digest("base64url");
}

function invalid(): never {
  throw new MusicTokenError("TOKEN_INVALID", "The Music credential is invalid.");
}
