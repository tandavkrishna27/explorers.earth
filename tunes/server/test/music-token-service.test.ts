import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MusicTokenError,
  MusicTokenService,
  type MusicTokenConfiguration,
} from "../services/musicTokenService";

const NOW_SECONDS = 1_800_000_000;
const CURRENT_SECRET = Buffer.alloc(32, 0x41).toString("base64url");
const PREVIOUS_SECRET = Buffer.alloc(32, 0x42).toString("base64url");

function configuration(overrides: Partial<MusicTokenConfiguration> = {}): MusicTokenConfiguration {
  return {
    current: { kid: "music-current-2026-08", secret: CURRENT_SECRET },
    tokenLifetimeSeconds: 600,
    clockSkewSeconds: 15,
    ...overrides,
  };
}

function service(overrides: Partial<MusicTokenConfiguration> = {}, nowSeconds = NOW_SECONDS) {
  return new MusicTokenService(configuration(overrides), {
    now: () => nowSeconds * 1_000,
    randomBytes: (size) => Buffer.alloc(size, 0x7a),
  });
}

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function rawToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret = CURRENT_SECRET,
): string {
  const unsigned = `${encoded(header)}.${encoded(payload)}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64url")).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "explorers-tunes",
    aud: "music-api",
    sub: "strapi-user-document-id",
    jti: "0123456789abcdef0123456789abcdef",
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 600,
    sessionVersion: 7,
    ...overrides,
  };
}

function expectTokenError(operation: () => unknown, code: MusicTokenError["code"]): void {
  try {
    operation();
    throw new Error("expected MusicTokenError");
  } catch (error) {
    expect(error).toBeInstanceOf(MusicTokenError);
    expect((error as MusicTokenError).code).toBe(code);
  }
}

describe("scoped Music token service", () => {
  it("mints exactly the approved ten-minute HS256 header and claims without mutable identity data", () => {
    const result = service().mint({
      id: 99,
      strapiUserDocumentId: "strapi-user-document-id",
      strapiAccountDocumentId: "account-secret-context",
      identityStatus: "active",
      sessionVersion: 7,
    });
    const [headerPart, payloadPart] = result.token.split(".");
    expect(JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"))).toEqual({
      alg: "HS256",
      kid: "music-current-2026-08",
    });
    expect(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"))).toEqual({
      iss: "explorers-tunes",
      aud: "music-api",
      sub: "strapi-user-document-id",
      jti: "7a".repeat(16),
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 600,
      sessionVersion: 7,
    });
    expect(result.expiresAt).toBe((NOW_SECONDS + 600) * 1_000);
    expect(service().verify(result.token)).toEqual(validClaims({ jti: "7a".repeat(16) }));
    expect(result.token).not.toContain("account-secret-context");
    expect(result.token).not.toContain("99");
  });

  it("uses a fresh 128-bit-or-greater jti for every token", () => {
    const tokenService = new MusicTokenService(configuration());
    const projection = {
      id: 1,
      strapiUserDocumentId: "subject",
      strapiAccountDocumentId: "account",
      identityStatus: "active" as const,
      sessionVersion: 1,
    };
    const claims = Array.from({ length: 50 }, () => tokenService.verify(tokenService.mint(projection).token));
    expect(new Set(claims.map(({ jti }) => jti)).size).toBe(50);
    expect(claims.every(({ jti }) => /^[a-f0-9]{32}$/.test(jti))).toBe(true);
  });

  it.each([
    ["none", { alg: "none", kid: "music-current-2026-08" }, ""],
    ["alternate algorithm", { alg: "HS384", kid: "music-current-2026-08" }, CURRENT_SECRET],
    ["missing kid", { alg: "HS256" }, CURRENT_SECRET],
    ["unknown kid", { alg: "HS256", kid: "unknown" }, CURRENT_SECRET],
  ])("rejects %s header", (_label, header, secret) => {
    const token = secret ? rawToken(header, validClaims(), secret) : `${encoded(header)}.${encoded(validClaims())}.`;
    expectTokenError(() => service().verify(token), "TOKEN_INVALID");
  });

  it("rejects a duplicate kid before JSON interpretation", () => {
    const header = Buffer.from('{"alg":"HS256","kid":"music-current-2026-08","kid":"other"}').toString("base64url");
    const payload = encoded(validClaims());
    const unsigned = `${header}.${payload}`;
    const signature = createHmac("sha256", Buffer.from(CURRENT_SECRET, "base64url")).update(unsigned).digest("base64url");
    expectTokenError(() => service().verify(`${unsigned}.${signature}`), "TOKEN_INVALID");
  });

  it.each([
    ["wrong issuer", { iss: "attacker" }],
    ["wrong audience", { aud: "other-api" }],
    ["missing subject", { sub: undefined }],
    ["missing jti", { jti: undefined }],
    ["wrong session type", { sessionVersion: "7" }],
    ["zero session", { sessionVersion: 0 }],
    ["fractional iat", { iat: NOW_SECONDS + 0.5 }],
    ["excessive lifetime", { exp: NOW_SECONDS + 601 }],
    ["short lifetime", { exp: NOW_SECONDS + 599 }],
    ["zero lifetime", { exp: NOW_SECONDS }],
    ["extra mutable claim", { username: "pii-user" }],
  ])("rejects %s", (_label, overrides) => {
    expectTokenError(() => service().verify(rawToken(
      { alg: "HS256", kid: "music-current-2026-08" },
      validClaims(overrides),
    )), "TOKEN_INVALID");
  });

  it("rejects header, payload, and signature tampering", () => {
    const valid = rawToken({ alg: "HS256", kid: "music-current-2026-08" }, validClaims());
    const [header, payload, signature] = valid.split(".");
    for (const token of [
      `${encoded({ alg: "HS256", kid: "other" })}.${payload}.${signature}`,
      `${header}.${encoded(validClaims({ sub: "attacker" }))}.${signature}`,
      `${header}.${payload}.${signature.slice(0, -1)}A`,
    ]) expectTokenError(() => service().verify(token), "TOKEN_INVALID");
  });

  it("enforces expiry and future-iat at the documented skew edges", () => {
    const header = { alg: "HS256", kid: "music-current-2026-08" };
    expect(service({}, NOW_SECONDS + 614).verify(rawToken(header, validClaims()))).toMatchObject({ sub: "strapi-user-document-id" });
    expectTokenError(() => service({}, NOW_SECONDS + 615).verify(rawToken(header, validClaims())), "TOKEN_EXPIRED");
    expect(service().verify(rawToken(header, validClaims({ iat: NOW_SECONDS + 15, exp: NOW_SECONDS + 615 })))).toMatchObject({ iat: NOW_SECONDS + 15 });
    expectTokenError(() => service().verify(rawToken(header, validClaims({ iat: NOW_SECONDS + 16, exp: NOW_SECONDS + 616 }))), "TOKEN_INVALID");
  });

  it("verifies but never signs with previous only before its hard cutoff", () => {
    const previous = {
      kid: "music-previous-2026-08",
      secret: PREVIOUS_SECRET,
      acceptUntil: (NOW_SECONDS + 100) * 1_000,
    };
    const token = rawToken({ alg: "HS256", kid: previous.kid }, validClaims(), PREVIOUS_SECRET);
    expect(service({ previous }, NOW_SECONDS + 99).verify(token)).toMatchObject({ sub: "strapi-user-document-id" });
    expectTokenError(() => service({ previous }, NOW_SECONDS + 100).verify(token), "TOKEN_INVALID");
    expectTokenError(() => service({ previous }, NOW_SECONDS + 101).verify(token), "TOKEN_INVALID");
    const mintedHeader = JSON.parse(Buffer.from(service({ previous }).mint({
      id: 1, strapiUserDocumentId: "subject", strapiAccountDocumentId: "account",
      identityStatus: "active", sessionVersion: 1,
    }).token.split(".")[0], "base64url").toString("utf8"));
    expect(mintedHeader.kid).toBe("music-current-2026-08");
  });

  it("mints a canonical credential whose subject is the account and whose kind is explicit", () => {
    // ADR-008. The subject is the canonical account id, and the kind is carried as a
    // claim so no reader has to guess from the subject's shape.
    const minted = service().mintCanonical({ accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 3 });
    const claims = service().verify(minted.token);
    expect(claims.sub).toBe("6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411");
    expect(claims.subjectKind).toBe("canonical-account");
    expect(claims.sessionVersion).toBe(3);
    expect(minted.expiresAt).toBe((NOW_SECONDS + 600) * 1_000);
  });

  it("mints a socket ticket that no HTTP surface accepts, and a credential the socket refuses", () => {
    // Ticket 6.3. Before this the handshake consumed the same 600-second bearer as owner
    // HTTP, so a leaked handshake value was ten minutes of full owner access. The
    // separation only holds if it is refused in both directions, which is what this
    // asserts: a ticket is not a credential and a credential is not a ticket.
    const ticket = service().mintSocketTicket({ subject: "strapi-user-document-id", sessionVersion: 7 });
    const credential = service().mint({
      id: 41, strapiUserDocumentId: "strapi-user-document-id", strapiAccountDocumentId: "strapi-account",
      identityStatus: "active", sessionVersion: 7,
    });

    const claims = service().verifySocketTicket(ticket.token);
    expect(claims.purpose).toBe("music-socket");
    expect(claims.sub).toBe("strapi-user-document-id");
    expect(claims.sessionVersion).toBe(7);

    expectTokenError(() => service().verify(ticket.token), "TOKEN_INVALID");
    expectTokenError(() => service().verifySocketTicket(credential.token), "TOKEN_INVALID");
  });

  it("gives a socket ticket its own short lifetime without touching the pinned credential lifetime", () => {
    // The configured lifetime is pinned to exactly 600 seconds by configuration
    // validation, so the ticket's 60 seconds is a constant rather than a setting.
    const ticket = service().mintSocketTicket({ subject: "strapi-user-document-id", sessionVersion: 7 });
    expect(ticket.expiresAt).toBe((NOW_SECONDS + 60) * 1_000);
    // Expiry bites at exp plus the 15-second configured skew, not at exp.
    expectTokenError(() => service({}, NOW_SECONDS + 75).verifySocketTicket(ticket.token), "TOKEN_EXPIRED");
    expect(service({}, NOW_SECONDS + 74).verifySocketTicket(ticket.token).purpose).toBe("music-socket");
  });

  it("carries the canonical subject kind on a socket ticket when the owner is canonical", () => {
    const ticket = service().mintSocketTicket({
      subject: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", sessionVersion: 3, subjectKind: "canonical-account",
    });
    const claims = service().verifySocketTicket(ticket.token);
    expect(claims.subjectKind).toBe("canonical-account");
    expect(claims.purpose).toBe("music-socket");
  });

  it.each([
    ["a legacy subject that is not a document id", { subject: "", sessionVersion: 7 }],
    ["a canonical kind with a non-uuid subject", { subject: "strapi-user", sessionVersion: 7, subjectKind: "canonical-account" as const }],
    ["a zero session version", { subject: "strapi-user-document-id", sessionVersion: 0 }],
    ["a fractional session version", { subject: "strapi-user-document-id", sessionVersion: 1.5 }],
  ])("refuses to mint a socket ticket for %s", (_label, input) => {
    expectTokenError(() => service().mintSocketTicket(input), "TOKEN_INVALID");
  });

  it("keeps a legacy credential free of the canonical kind", () => {
    const minted = service().mint({
      id: 41, strapiUserDocumentId: "strapi-user-document-id", strapiAccountDocumentId: "strapi-account",
      identityStatus: "active", sessionVersion: 7,
    });
    expect(service().verify(minted.token).subjectKind).toBeUndefined();
  });

  it.each([
    ["not a uuid", { accountId: "strapi-user-document-id", musicUserId: 41, sessionVersion: 3 }],
    ["a non-v4 uuid", { accountId: "6f1a9c42-0d3b-1f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 3 }],
    ["a zero venue id", { accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 0, sessionVersion: 3 }],
    ["a fractional venue id", { accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 1.5, sessionVersion: 3 }],
    ["a zero session version", { accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 0 }],
    ["a fractional session version", { accountId: "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411", musicUserId: 41, sessionVersion: 1.5 }],
  ])("refuses to mint a canonical credential for %s", (_label, input) => {
    expectTokenError(() => service().mintCanonical(input), "TOKEN_INVALID");
  });

  it.each([
    ["an unrecognised subject kind", { subjectKind: "strapi-user" }],
    ["a canonical kind over a non-uuid subject", { subjectKind: "canonical-account" }],
  ])("rejects %s", (_label, overrides) => {
    // The second case is the attack this claim exists to stop: claiming canonical
    // provenance for a subject that is not a canonical account id.
    const token = rawToken({ alg: "HS256", kid: "music-current-2026-08" }, validClaims(overrides));
    expectTokenError(() => service().verify(token), "TOKEN_INVALID");
  });

  it("refuses a purpose it does not recognise, and a ticket lifetime that is not exactly its own", () => {
    // The purpose claim decides which lifetime is exact, so an unrecognised value must be
    // refused before it can select one, and a 'music-socket' token minted with the
    // credential window must not pass as a ticket.
    const unknownPurpose = rawToken({ alg: "HS256", kid: "music-current-2026-08" },
      validClaims({ purpose: "music-admin" }));
    expectTokenError(() => service().verify(unknownPurpose), "TOKEN_INVALID");
    expectTokenError(() => service().verifySocketTicket(unknownPurpose), "TOKEN_INVALID");

    const stretched = rawToken({ alg: "HS256", kid: "music-current-2026-08" },
      validClaims({ purpose: "music-socket" }));
    expectTokenError(() => service().verifySocketTicket(stretched), "TOKEN_INVALID");
  });

  it("still refuses a claim it does not recognise at all", () => {
    // Optionality is granted to one named claim; it does not loosen strictness.
    const token = rawToken({ alg: "HS256", kid: "music-current-2026-08" }, validClaims({ scope: "all" }));
    expectTokenError(() => service().verify(token), "TOKEN_INVALID");
  });

  it("still requires every mandatory claim", () => {
    const claims = validClaims();
    delete claims.sessionVersion;
    const token = rawToken({ alg: "HS256", kid: "music-current-2026-08" }, claims);
    expectTokenError(() => service().verify(token), "TOKEN_INVALID");
  });
});
