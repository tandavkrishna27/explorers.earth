import { describe, expect, it } from "vitest";
import {
  MusicPrincipalError,
  MusicPrincipalService,
  assertMusicResourceOwner,
  createMusicSocketCredentialVerifier,
  type CanonicalMusicCredentialSubjectState,
  type MusicCredentialSubjectState,
} from "../middleware/musicPrincipal";
import { CANONICAL_SUBJECT_KIND, MusicTokenService, type MusicTokenConfiguration } from "../services/musicTokenService";

const NOW = 1_800_000_000_000;
const CANONICAL_ACCOUNT = "11111111-1111-4111-8111-111111111111";
const currentSecret = Buffer.alloc(32, 0x31).toString("base64url");
const previousSecret = Buffer.alloc(32, 0x32).toString("base64url");
const tokenConfiguration: MusicTokenConfiguration = {
  current: { kid: "current", secret: currentSecret },
  tokenLifetimeSeconds: 600,
  clockSkewSeconds: 10,
};
const active = {
  id: 41,
  strapiUserDocumentId: "subject-41",
  strapiAccountDocumentId: "account-41",
  identityStatus: "active" as const,
  sessionVersion: 3,
};

function tokenService(configuration = tokenConfiguration, now = NOW): MusicTokenService {
  return new MusicTokenService(configuration, { now: () => now, randomBytes: () => Buffer.alloc(16, 0x44) });
}

const canonicalVenue = { musicUserId: 41, sessionVersion: 3, identityStatus: "active" as const };

function repository(
  initial: MusicCredentialSubjectState,
  canonicalInitial: CanonicalMusicCredentialSubjectState = { venue: undefined, tombstoned: false },
) {
  let state = initial;
  let canonicalState = canonicalInitial;
  let sessionLive = true;
  const sessionLookups: Array<{ sessionId: string; userId: string }> = [];
  return {
    resolveCredentialSubject: async () => state,
    resolveCanonicalCredentialSubject: async () => canonicalState,
    isCanonicalSessionLive: async (sessionId: string, userId: string) => {
      sessionLookups.push({ sessionId, userId });
      return sessionLive;
    },
    set: (next: MusicCredentialSubjectState) => { state = next; },
    setCanonical: (next: CanonicalMusicCredentialSubjectState) => { canonicalState = next; },
    setSessionLive: (next: boolean) => { sessionLive = next; },
    sessionLookups,
  };
}

function expectPrincipalError(operation: () => Promise<unknown> | unknown, code: MusicPrincipalError["code"]) {
  return expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code });
}

describe("local Music principal resolution", () => {
  it("derives the only numeric owner from a verified immutable subject and current DB truth", async () => {
    const tokens = tokenService();
    const token = tokens.mint(active).token;
    const service = new MusicPrincipalService(tokens, repository({ identity: active, tombstoned: false }));
    await expect(service.resolve(token)).resolves.toEqual({
      musicUserId: 41,
      subject: "subject-41",
      accountDocumentId: "account-41",
      sessionVersion: 3,
    });
  });

  it.each([
    ["missing user", { identity: undefined, tombstoned: false }, "TOKEN_REVOKED"],
    ["user tombstone", { identity: undefined, tombstoned: true }, "TOKEN_REVOKED"],
    ["Account tombstone", { identity: active, tombstoned: true }, "TOKEN_REVOKED"],
    ["suspended", { identity: { ...active, identityStatus: "suspended" as const }, tombstoned: false }, "IDENTITY_SUSPENDED"],
    ["pending deletion", { identity: { ...active, identityStatus: "pending_deletion" as const }, tombstoned: false }, "IDENTITY_PENDING_DELETION"],
    ["session mismatch", { identity: { ...active, sessionVersion: 4 }, tombstoned: false }, "TOKEN_REVOKED"],
  ])("rejects %s from local truth", async (_label, state, code) => {
    const tokens = tokenService();
    const service = new MusicPrincipalService(tokens, repository(state));
    await expectPrincipalError(() => service.resolve(tokens.mint(active).token), code as MusicPrincipalError["code"]);
  });

  it("rejects Strapi bearer material and a native session cannot substitute for a Music token", async () => {
    const service = new MusicPrincipalService(tokenService(), repository({ identity: active, tombstoned: false }));
    for (const credential of ["strapi-bearer-proof", "", "not-a-jwt"] as const) {
      await expectPrincipalError(() => service.resolve(credential), "TOKEN_INVALID");
    }
  });

  it("asserts resources against the resolved numeric DB owner, never a caller ID", () => {
    const principal = { musicUserId: 41, subject: "subject-41", accountDocumentId: "account-41", sessionVersion: 3 };
    expect(() => assertMusicResourceOwner(principal, 41)).not.toThrow();
    expect(() => assertMusicResourceOwner(principal, 42)).toThrow(expect.objectContaining({ code: "RESOURCE_FORBIDDEN" }));
  });

  it("rechecks signature rotation and local revocation for an already-connected socket", async () => {
    let now = NOW;
    const previousConfiguration: MusicTokenConfiguration = {
      ...tokenConfiguration,
      previous: { kid: "previous", secret: previousSecret, acceptUntil: NOW + 5_000 },
    };
    const previousSigner = new MusicTokenService({
      ...previousConfiguration,
      current: { kid: "previous", secret: previousSecret },
      previous: undefined,
    }, { now: () => now, randomBytes: () => Buffer.alloc(16, 0x55) });
    const verifierTokens = new MusicTokenService(previousConfiguration, { now: () => now });
    const local = repository({ identity: active, tombstoned: false });
    const socketVerifier = createMusicSocketCredentialVerifier(new MusicPrincipalService(verifierTokens, local));

    // Ticket 6.3. The handshake takes a purpose-limited ticket and refuses the general
    // credential every HTTP surface uses, so a leaked owner bearer cannot open a socket.
    await expectPrincipalError(
      () => socketVerifier.handshake({ token: previousSigner.mint(active).token }),
      "TOKEN_INVALID",
    );

    const ticket = previousSigner.mintSocketTicket({
      subject: active.strapiUserDocumentId,
      sessionVersion: active.sessionVersion,
    });
    const context = await socketVerifier.handshake({ token: ticket.token });
    // The connection retains the resolved subject and its signing key ID, never the ticket.
    expect(context).toEqual({
      subject: { sub: "subject-41", sessionVersion: 3, signingKeyId: "previous" },
      principal: { musicUserId: 41, subject: "subject-41", accountDocumentId: "account-41", sessionVersion: 3 },
    });

    await expect(socketVerifier.recheck(context)).resolves.toMatchObject({ musicUserId: 41 });

    local.set({ identity: { ...active, sessionVersion: 4 }, tombstoned: false });
    await expectPrincipalError(() => socketVerifier.recheck(context), "TOKEN_REVOKED");
    local.set({ identity: active, tombstoned: false });
    now = NOW + 5_000;
    await expectPrincipalError(() => socketVerifier.recheck(context), "TOKEN_INVALID");
  });

  it("keeps an already-connected socket alive once only its handshake ticket has expired", async () => {
    // Break caught: the socket rechecks the ticket that opened it, so every owner is
    // disconnected 60 seconds after connecting while their identity is perfectly valid.
    let now = NOW;
    const tokens = new MusicTokenService(tokenConfiguration, { now: () => now, randomBytes: () => Buffer.alloc(16, 0x44) });
    const local = repository({ identity: active, tombstoned: false });
    const socketVerifier = createMusicSocketCredentialVerifier(new MusicPrincipalService(tokens, local));
    const ticket = tokens.mintSocketTicket({
      subject: active.strapiUserDocumentId,
      sessionVersion: active.sessionVersion,
    });
    const context = await socketVerifier.handshake({ token: ticket.token });

    // A ticket lives 60 seconds; the connection it opened may live for hours.
    now = NOW + 3_600_000;
    await expect(socketVerifier.recheck(context)).resolves.toMatchObject({ musicUserId: 41 });

    // Revocation still lands, because the recheck judges identity and not the ticket.
    local.set({ identity: { ...active, sessionVersion: 4 }, tombstoned: false });
    await expectPrincipalError(() => socketVerifier.recheck(context), "TOKEN_REVOKED");

    // The expired ticket still cannot open a second connection.
    local.set({ identity: active, tombstoned: false });
    await expectPrincipalError(() => socketVerifier.handshake({ token: ticket.token }), "TOKEN_EXPIRED");
  });

  it("carries the canonical subject kind through a socket handshake and its rechecks", async () => {
    // Break caught: the handshake drops subjectKind, so the recheck falls through to the
    // legacy Strapi subject resolution for a canonical owner. ADR-008 decision 2 forbids
    // re-deriving the kind from the subject's shape, so losing it here is unrecoverable.
    const accountId = "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411";
    const tokens = tokenService();
    const canonical = repository(
      { identity: undefined, tombstoned: false },
      { venue: canonicalVenue, tombstoned: false },
    );
    const socketVerifier = createMusicSocketCredentialVerifier(new MusicPrincipalService(tokens, canonical));
    const ticket = tokens.mintSocketTicket({
      subject: accountId,
      sessionVersion: 3,
      subjectKind: CANONICAL_SUBJECT_KIND,
    });

    const context = await socketVerifier.handshake({ token: ticket.token });
    expect(context.subject).toEqual({
      sub: accountId,
      sessionVersion: 3,
      signingKeyId: tokenConfiguration.current.kid,
      subjectKind: CANONICAL_SUBJECT_KIND,
    });
    expect(context.principal).toMatchObject({ musicUserId: 41, subjectKind: CANONICAL_SUBJECT_KIND });

    await expect(socketVerifier.recheck(context)).resolves.toMatchObject({ musicUserId: 41 });

    // The recheck resolves through the canonical mapping, not the legacy subject: an
    // unmapped venue revokes even though the legacy repository would have no opinion.
    canonical.setCanonical({ venue: undefined, tombstoned: false });
    await expectPrincipalError(() => socketVerifier.recheck(context), "TOKEN_REVOKED");
  });

  it("resolves a canonical credential through the account mapping", () => {
    const repo = repository({ identity: undefined, tombstoned: false }, { venue: canonicalVenue, tombstoned: false });
    const tokens = tokenService();
    const minted = tokens.mintCanonical({ accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 3 });
    return expect(new MusicPrincipalService(tokens, repo).resolve(minted.token)).resolves.toEqual({
      musicUserId: 41,
      subject: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411",
      accountDocumentId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411",
      sessionVersion: 3,
      // Ticket 6.3. The kind travels with the principal so a socket ticket can be minted
      // for the same subject without re-deriving it from the subject's shape, which
      // ADR-008 decision 2 forbids. A legacy principal carries no kind at all, which the
      // legacy case above asserts by pinning its exact shape.
      subjectKind: "canonical-account",
    });
  });

  it("never falls back to the legacy subject for a canonical credential", () => {
    // The property that matters: a canonical claim must not be satisfiable by a
    // Strapi-keyed row that happens to carry the same string.
    const repo = repository(
      { identity: { ...active, strapiUserDocumentId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411" }, tombstoned: false },
      { venue: undefined, tombstoned: false },
    );
    const tokens = tokenService();
    const minted = tokens.mintCanonical({ accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 3 });
    return expectPrincipalError(() => new MusicPrincipalService(tokens, repo).resolve(minted.token), "TOKEN_REVOKED");
  });

  it.each([
    ["an unmapped account", { venue: undefined, tombstoned: false }, "TOKEN_REVOKED"],
    ["a tombstoned venue", { venue: canonicalVenue, tombstoned: true }, "TOKEN_REVOKED"],
    ["a suspended venue", { venue: { ...canonicalVenue, identityStatus: "suspended" as const }, tombstoned: false }, "IDENTITY_SUSPENDED"],
    ["a venue pending deletion", { venue: { ...canonicalVenue, identityStatus: "pending_deletion" as const }, tombstoned: false }, "IDENTITY_PENDING_DELETION"],
    ["a revoked session version", { venue: { ...canonicalVenue, sessionVersion: 4 }, tombstoned: false }, "TOKEN_REVOKED"],
  ])("refuses a canonical credential for %s", (_label, canonicalState, code) => {
    const repo = repository({ identity: undefined, tombstoned: false }, canonicalState);
    const tokens = tokenService();
    const minted = tokens.mintCanonical({ accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 3 });
    return expectPrincipalError(
      () => new MusicPrincipalService(tokens, repo).resolve(minted.token),
      code as MusicPrincipalError["code"],
    );
  });
});

describe("canonical session binding", () => {
  /*
   * Ticket 6.1, step 5 obligation 4. Logout deletes the `auth_session` row and touches
   * nothing on the venue, so before this binding an open socket outlived its session: HTTP
   * answered 401 while the per-event recheck still matched the venue's session_version.
   */
  const bound = { sessionId: "sessionAbcdefgh", userId: "userAbcdefgh" };

  function canonicalTokens() {
    const tokens = tokenService();
    const repo = repository({ identity: undefined, tombstoned: false },
      { venue: { ...canonicalVenue }, tombstoned: false });
    return { tokens, repo, principals: new MusicPrincipalService(tokens, repo) };
  }

  it("refuses a bound credential once its session is gone, and says which session it asked about", async () => {
    const { tokens, repo, principals } = canonicalTokens();
    const credential = tokens.mintCanonical({
      accountId: CANONICAL_ACCOUNT, musicUserId: canonicalVenue.musicUserId,
      sessionVersion: canonicalVenue.sessionVersion, ...bound,
    });
    await expect(principals.resolve(credential.token)).resolves.toMatchObject({
      musicUserId: canonicalVenue.musicUserId, sessionId: bound.sessionId, userId: bound.userId,
    });
    expect(repo.sessionLookups).toEqual([bound]);

    repo.setSessionLive(false);
    await expectPrincipalError(() => principals.resolve(credential.token), "TOKEN_REVOKED");
  });

  it("refuses an open socket's recheck once its session is gone", async () => {
    // The recheck is the only thing between a logged-out tab and the next owner event.
    const { tokens, repo, principals } = canonicalTokens();
    const ticket = tokens.mintSocketTicket({
      subject: CANONICAL_ACCOUNT, sessionVersion: canonicalVenue.sessionVersion,
      subjectKind: CANONICAL_SUBJECT_KIND, ...bound,
    });
    const open = await principals.resolveSocketTicket(ticket.token);
    expect(open.subject).toMatchObject({ sid: bound.sessionId, uid: bound.userId });
    await expect(principals.resolveSubject(open.subject)).resolves.toMatchObject({
      musicUserId: canonicalVenue.musicUserId,
    });

    repo.setSessionLive(false);
    await expectPrincipalError(() => principals.resolveSubject(open.subject), "TOKEN_REVOKED");
  });

  it("does not consult a session for an unbound credential", async () => {
    // Backwards compatibility: a canonical credential minted before the claim existed has
    // no binding and must keep working until it expires, rather than logging out every
    // current owner at deploy.
    const { tokens, repo, principals } = canonicalTokens();
    const unbound = tokens.mintCanonical({
      accountId: CANONICAL_ACCOUNT, musicUserId: canonicalVenue.musicUserId,
      sessionVersion: canonicalVenue.sessionVersion,
    });
    repo.setSessionLive(false);
    await expect(principals.resolve(unbound.token)).resolves.toMatchObject({
      musicUserId: canonicalVenue.musicUserId,
    });
    expect(repo.sessionLookups).toEqual([]);
  });

  it("refuses to mint a half-bound credential or ticket", () => {
    const { tokens } = canonicalTokens();
    const base = {
      accountId: CANONICAL_ACCOUNT, musicUserId: canonicalVenue.musicUserId,
      sessionVersion: canonicalVenue.sessionVersion,
    };
    // A session id with no user cannot be looked up, so a token carrying one would skip
    // the very check it exists to enforce.
    expect(() => tokens.mintCanonical({ ...base, sessionId: bound.sessionId })).toThrow();
    expect(() => tokens.mintCanonical({ ...base, userId: bound.userId })).toThrow();
    expect(() => tokens.mintCanonical({ ...base, sessionId: "short", userId: bound.userId })).toThrow();
    expect(() => tokens.mintCanonical({ ...base, sessionId: bound.sessionId, userId: "bad id!" })).toThrow();
    const ticketBase = {
      subject: CANONICAL_ACCOUNT, sessionVersion: canonicalVenue.sessionVersion,
      subjectKind: CANONICAL_SUBJECT_KIND,
    };
    expect(() => tokens.mintSocketTicket({ ...ticketBase, sessionId: bound.sessionId })).toThrow();
    expect(() => tokens.mintSocketTicket({ ...ticketBase, userId: bound.userId })).toThrow();
    expect(() => tokens.mintSocketTicket({ ...ticketBase, sessionId: "no", userId: bound.userId })).toThrow();
  });
});
