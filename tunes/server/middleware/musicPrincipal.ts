import type { CanonicalMusicVenue, MusicIdentityProjection } from "../repositories/musicIdentityRepository";
import { CANONICAL_SUBJECT_KIND, MusicTokenError, type MusicTokenService } from "../services/musicTokenService";
import type { Request, RequestHandler } from "express";

export interface MusicPrincipal {
  musicUserId: number;
  subject: string;
  accountDocumentId: string;
  sessionVersion: number;
  /**
   * Ticket 6.3. Carried forward from the verified claim so a socket ticket can be
   * minted for the same subject. ADR-008 decision 2 forbids deciding what a subject
   * means from its shape, so the kind travels with the principal rather than being
   * re-derived; absent means a legacy Strapi subject.
   */
  subjectKind?: typeof CANONICAL_SUBJECT_KIND;
  /**
   * Ticket 6.1, step 5 obligation 4. The canonical session this authority derives from.
   * Carried so a socket ticket minted from this principal inherits the binding, and so an
   * open socket can be rechecked against the same session owner HTTP is. Absent on a
   * legacy subject and on a canonical credential minted before the claim existed.
   */
  sessionId?: string;
  userId?: string;
}

export interface MusicCredentialSubjectState {
  identity?: MusicIdentityProjection;
  tombstoned: boolean;
}

export interface CanonicalMusicCredentialSubjectState {
  venue?: CanonicalMusicVenue;
  tombstoned: boolean;
}

export interface MusicCredentialSubjectRepository {
  resolveCredentialSubject(subject: string): Promise<MusicCredentialSubjectState>;
  /** ADR-008. Resolves a canonical account subject through account_music_identity. */
  resolveCanonicalCredentialSubject(accountId: string): Promise<CanonicalMusicCredentialSubjectState>;
  /**
   * Ticket 6.1. Whether the canonical session a credential was minted from is still live
   * for that user. Deliberately the same question `authorizeOperation` asks of HTTP, so
   * the two transports cannot disagree about whether somebody is logged in.
   */
  isCanonicalSessionLive(sessionId: string, userId: string): Promise<boolean>;
}

export type MusicPrincipalErrorCode =
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "IDENTITY_SUSPENDED"
  | "IDENTITY_PENDING_DELETION"
  | "RESOURCE_FORBIDDEN";

export class MusicPrincipalError extends Error {
  constructor(
    readonly code: MusicPrincipalErrorCode,
    readonly status: 401 | 403 | 409,
    message: string,
  ) {
    super(message);
    this.name = "MusicPrincipalError";
  }
}

/**
 * Ticket 6.3. The identity half of a verified credential: everything resolution needs
 * once a token's signature, audience and lifetime have been checked. Keeping it separate
 * from the token is what lets a socket recheck an owner without re-verifying the
 * short-lived ticket that opened the connection.
 */
export interface MusicPrincipalSubject {
  readonly sub: string;
  readonly sessionVersion: number;
  readonly subjectKind?: string;
  /** Ticket 6.1. The session binding, retained so each recheck re-verifies it. */
  readonly sid?: string;
  readonly uid?: string;
  /** The key ID that vouched for the credential this subject was resolved from. */
  readonly signingKeyId: string;
}

export class MusicPrincipalService {
  constructor(
    private readonly tokens: Pick<MusicTokenService, "verifyContext" | "verifySocketTicketContext" | "acceptsSigningKey">,
    private readonly repository: MusicCredentialSubjectRepository,
  ) {}

  async resolve(token: string): Promise<MusicPrincipal> {
    return this.resolveSubject(this.verified(token, "verifyContext"));
  }

  /**
   * Ticket 6.3. The socket handshake's only accepted credential. It refuses a general
   * Music credential, exactly as `verify` refuses a handshake ticket, so neither can be
   * presented where the other is expected.
   */
  async resolveSocketTicket(token: string): Promise<MusicSocketCredentialContext> {
    const verified = this.verified(token, "verifySocketTicketContext");
    const principal = await this.resolveSubject(verified);
    // Narrowed deliberately: only the fields a recheck needs are retained, so an open
    // connection holds no expiry, audience or purpose claim it could be judged against
    // later, and no token at all.
    return {
      subject: {
        sub: verified.sub,
        sessionVersion: verified.sessionVersion,
        signingKeyId: verified.signingKeyId,
        ...(verified.subjectKind ? { subjectKind: verified.subjectKind } : {}),
        // Retained deliberately, unlike expiry/audience/purpose above: this is the one
        // claim an open connection must keep re-checking, because it is the only thing
        // logout changes.
        ...(verified.sid && verified.uid ? { sid: verified.sid, uid: verified.uid } : {}),
      },
      principal,
    };
  }

  private verified(
    token: string,
    method: "verifyContext" | "verifySocketTicketContext",
  ): MusicPrincipalSubject {
    try {
      const context = this.tokens[method](token);
      return { ...context.claims, signingKeyId: context.kid };
    } catch (error) {
      if (error instanceof MusicTokenError) {
        throw new MusicPrincipalError(error.code, 401, error.message);
      }
      throw new MusicPrincipalError("TOKEN_INVALID", 401, "The Music credential is invalid.");
    }
  }

  /**
   * Ticket 6.3. Every identity-side check, run without re-verifying a token. A handshake
   * ticket lives 60 seconds while the connection it opened may live far longer, so
   * rechecking the ticket itself would disconnect every owner a minute after connecting.
   * Nothing is weakened by that: revocation is an identity fact, not a token fact, and a
   * tombstone, suspension, pending deletion or bumped session version fails here exactly
   * as it does on an HTTP request.
   */
  async resolveSubject(claims: MusicPrincipalSubject): Promise<MusicPrincipal> {
    // Rotating the signing keys retires every credential they signed, including the
    // handshake ticket that opened a still-open socket. Checked here rather than only at
    // verification so a recheck cannot outlive its key's bounded acceptance window.
    if (!this.tokens.acceptsSigningKey(claims.signingKeyId)) {
      throw new MusicPrincipalError("TOKEN_INVALID", 401, "The Music credential is invalid.");
    }
    if (claims.subjectKind === CANONICAL_SUBJECT_KIND) {
      return this.resolveCanonical(claims.sub, claims.sessionVersion, claims.sid, claims.uid);
    }
    const state = await this.repository.resolveCredentialSubject(claims.sub);
    const identity = state.identity;
    if (!identity || state.tombstoned || identity.strapiUserDocumentId !== claims.sub) {
      throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
    }
    if (identity.identityStatus === "suspended") {
      throw new MusicPrincipalError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended.");
    }
    if (identity.identityStatus === "pending_deletion") {
      throw new MusicPrincipalError("IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.");
    }
    if (identity.sessionVersion !== claims.sessionVersion) {
      throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
    }
    return {
      musicUserId: identity.id,
      subject: identity.strapiUserDocumentId,
      accountDocumentId: identity.strapiAccountDocumentId,
      sessionVersion: identity.sessionVersion,
    };
  }

  /**
   * ADR-008. A canonical credential is accepted only when account_music_identity maps
   * that exact account to a venue row. It never falls back to the legacy subject
   * resolution, so a canonical claim cannot be satisfied by a Strapi-keyed row.
   *
   * sessionVersion is the venue's users.session_version, not the canonical web
   * session's, because that is the counter Music credential revocation bumps.
   */
  private async resolveCanonical(
    accountId: string,
    claimedSessionVersion: number,
    sessionId?: string,
    userId?: string,
  ): Promise<MusicPrincipal> {
    const state = await this.repository.resolveCanonicalCredentialSubject(accountId);
    const venue = state.venue;
    if (!venue || state.tombstoned) {
      throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
    }
    if (venue.identityStatus === "suspended") {
      throw new MusicPrincipalError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended.");
    }
    if (venue.identityStatus === "pending_deletion") {
      throw new MusicPrincipalError("IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.");
    }
    if (venue.sessionVersion !== claimedSessionVersion) {
      throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
    }
    /*
     * Ticket 6.1, step 5 obligation 4: a logged-out owner must lose socket authority as
     * well as HTTP access.
     *
     * Everything above this point reads the *venue*, and logout does not touch the venue -
     * `users.session_version` moves only on suspend, block, delete and recovery. So before
     * this check an open socket outlived its session: HTTP answered 401 because
     * `authorizeOperation` looks for the `auth_session` row that logout deletes, while the
     * socket's per-event recheck still matched and kept delivering owner events.
     *
     * This is the same question that path asks, so the two transports now revoke together.
     * It runs on the credential resolve AND on every socket recheck, because the recheck is
     * the only thing standing between a logged-out tab and the next owner event.
     */
    if (sessionId !== undefined && userId !== undefined
        && !(await this.repository.isCanonicalSessionLive(sessionId, userId))) {
      throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
    }
    return {
      subjectKind: CANONICAL_SUBJECT_KIND,
      musicUserId: venue.musicUserId,
      subject: accountId,
      ...(sessionId && userId ? { sessionId, userId } : {}),
      // Opaque stable per-account identifier, used for feature allowlists and cohort
      // hashing. The canonical account id is the right value; note it buckets
      // differently from a legacy Strapi subject, so percentage rollouts re-bucket an
      // owner on migration.
      accountDocumentId: accountId,
      sessionVersion: venue.sessionVersion,
    };
  }
}

const MUSIC_BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export function createMusicPrincipalMiddleware(
  resolvePrincipal: (token: string) => Promise<MusicPrincipal>,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      req.musicPrincipal = await resolveMusicPrincipalRequest(req, resolvePrincipal);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function resolveMusicPrincipalRequest(
  req: Pick<Request, "rawHeaders">,
  resolvePrincipal: (token: string) => Promise<MusicPrincipal>,
): Promise<MusicPrincipal> {
  const authorizationFields: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === "authorization") {
      authorizationFields.push(req.rawHeaders[index + 1] ?? "");
    }
  }
  if (authorizationFields.length !== 1) {
    throw new MusicPrincipalError("TOKEN_INVALID", 401, "A single Music bearer credential is required.");
  }
  const match = MUSIC_BEARER_PATTERN.exec(authorizationFields[0]);
  if (!match) throw new MusicPrincipalError("TOKEN_INVALID", 401, "The Music credential is invalid.");
  return resolvePrincipal(match[1]);
}

export function assertMusicResourceOwner(principal: MusicPrincipal, musicUserId: number): void {
  if (!Number.isSafeInteger(musicUserId) || musicUserId < 1 || principal.musicUserId !== musicUserId) {
    throw new MusicPrincipalError("RESOURCE_FORBIDDEN", 403, "The Music resource is not owned by this identity.");
  }
}

export interface MusicSocketCredentialContext {
  readonly subject: MusicPrincipalSubject;
  readonly principal: MusicPrincipal;
}

/**
 * Ticket 6.3. The socket admits a purpose-limited handshake ticket and nothing else, and
 * then retains only the resolved subject. It deliberately does not keep the ticket: an
 * open connection has no use for it, and a credential kept for the life of a connection
 * is a credential available to anything that can read that connection's state.
 */
export function createMusicSocketCredentialVerifier(principals: MusicPrincipalService) {
  return {
    async handshake(input: { token: string }): Promise<MusicSocketCredentialContext> {
      return principals.resolveSocketTicket(input.token);
    },
    async recheck(context: MusicSocketCredentialContext): Promise<MusicPrincipal> {
      return principals.resolveSubject(context.subject);
    },
  };
}
