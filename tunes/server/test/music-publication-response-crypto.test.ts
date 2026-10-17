import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MusicPublicationResponseCipher,
  hashPublicationIdempotencyKey,
  publicationRequestFingerprint,
} from "../services/musicPublicationResponseCrypto";

const current = { kid: "publication-current-v1", key: Buffer.alloc(32, 0x31) };
const context = {
  musicUserId: 41,
  idempotencyKeyHash: hashPublicationIdempotencyKey("publication-command-1"),
  requestFingerprint: publicationRequestFingerprint("unlisted"),
};
const response = {
  version: "music-publication/v1" as const,
  publication: { mode: "unlisted" as const, publicSlug: "owner-public-slug" },
  capability: "C".repeat(43),
};

describe("durable publication response cryptography", () => {
  it("domain-separates raw operation keys and exact request fingerprints", () => {
    expect(hashPublicationIdempotencyKey("publication-command-1")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPublicationIdempotencyKey("publication-command-1")).not.toBe(hashPublicationIdempotencyKey("publication-command-2"));
    expect(publicationRequestFingerprint("private")).not.toBe(publicationRequestFingerprint("public"));
    expect(publicationRequestFingerprint("unlisted")).toBe(context.requestFingerprint);
  });

  it("AES-256-GCM encrypts and exactly replays the canonical response without plaintext storage", () => {
    const cipher = new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, {
      randomBytes: (size) => Buffer.alloc(size, 0x42),
    });
    const encrypted = cipher.encrypt(context, response);
    expect(encrypted).toMatchObject({ responseKeyId: current.kid });
    expect(encrypted.responseNonce).toHaveLength(12);
    expect(encrypted.responseTag).toHaveLength(16);
    expect(encrypted.responseCiphertext.toString("utf8")).not.toContain(response.capability);
    expect(cipher.decrypt(context, encrypted)).toEqual(response);
  });

  it.each([
    [{ ...context, musicUserId: 42 }, "owner"],
    [{ ...context, idempotencyKeyHash: "0".repeat(64) }, "operation hash"],
    [{ ...context, requestFingerprint: publicationRequestFingerprint("public") }, "request fingerprint"],
  ])("rejects ciphertext moved to a different %s binding", (changed) => {
    const cipher = new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, {
      randomBytes: (size) => Buffer.alloc(size, 0x42),
    });
    expect(() => cipher.decrypt(changed, cipher.encrypt(context, response))).toThrow(/publication response|authenticate|decrypt/i);
  });

  it("decrypts unexpired prior-key rows but writes only with the current key", () => {
    const previous = { kid: "publication-previous-v1", key: Buffer.alloc(32, 0x30), acceptUntil: Date.parse("2026-08-23T00:00:00.000Z") };
    const oldCipher = new MusicPublicationResponseCipher({ current: previous, retentionSeconds: 86_400 });
    const stored = oldCipher.encrypt(context, response);
    const rotated = new MusicPublicationResponseCipher({ current, previous, retentionSeconds: 86_400 }, {
      now: () => Date.parse("2026-08-22T00:00:00.000Z"),
      randomBytes: (size) => Buffer.alloc(size, 0x43),
    });
    expect(rotated.decrypt(context, stored)).toEqual(response);
    expect(rotated.encrypt(context, response).responseKeyId).toBe(current.kid);
  });

  it("fails closed for unavailable, expired, or tampered response keys and data", () => {
    const old = { kid: "publication-previous-v1", key: Buffer.alloc(32, 0x30) };
    const stored = new MusicPublicationResponseCipher({ current: old, retentionSeconds: 86_400 }).encrypt(context, response);
    expect(() => new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }).decrypt(context, stored))
      .toThrow(/publication response key unavailable/i);
    const expired = new MusicPublicationResponseCipher({
      current,
      previous: { ...old, acceptUntil: Date.parse("2026-08-20T00:00:00.000Z") },
      retentionSeconds: 86_400,
    }, { now: () => Date.parse("2026-08-21T00:00:00.000Z") });
    expect(() => expired.decrypt(context, stored)).toThrow(/publication response key unavailable/i);
    const active = new MusicPublicationResponseCipher({ current: old, retentionSeconds: 86_400 });
    const tampered = { ...stored, responseTag: Buffer.alloc(16, 0) };
    expect(() => active.decrypt(context, tampered)).toThrow(/publication response|authenticate|decrypt/i);
  });

  it("rejects invalid nonces, ciphertext bounds, and authenticated noncanonical payloads", () => {
    const cipher = new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, {
      randomBytes: (size) => Buffer.alloc(size, 0x42),
    });
    const stored = cipher.encrypt(context, response);
    for (const invalid of [
      { ...stored, responseNonce: Buffer.alloc(11) },
      { ...stored, responseTag: Buffer.alloc(15) },
      { ...stored, responseCiphertext: Buffer.alloc(0) },
      { ...stored, responseCiphertext: Buffer.alloc(4097) },
    ]) expect(() => cipher.decrypt(context, invalid)).toThrow(/ciphertext is invalid/i);

    const nonce = Buffer.alloc(12, 0x44);
    const aad = Buffer.from([
      "explorers.music.publication.response-aead/v1",
      "schema=music-publication/v1",
      `owner=${context.musicUserId}`,
      `operation=${context.idempotencyKeyHash}`,
      `request=${context.requestFingerprint}`,
      `kid=${current.kid}`,
    ].join("\n"));
    const encryptor = createCipheriv("aes-256-gcm", current.key, nonce, { authTagLength: 16 });
    encryptor.setAAD(aad);
    const responseCiphertext = Buffer.concat([encryptor.update(JSON.stringify({ version: "invalid" })), encryptor.final()]);
    expect(() => cipher.decrypt(context, {
      responseKeyId: current.kid,
      responseNonce: nonce,
      responseCiphertext,
      responseTag: encryptor.getAuthTag(),
    })).toThrow(/payload is invalid/i);
  });

  it("rejects every malformed keyring and request context boundary", () => {
    const keyring = { current, retentionSeconds: 86_400 as const };
    for (const invalid of [
      { ...keyring, retentionSeconds: 1 },
      { ...keyring, current: { ...current, kid: " bad" } },
      { ...keyring, current: { ...current, key: Buffer.alloc(31) } },
      { ...keyring, previous: { kid: " bad", key: Buffer.alloc(32, 2), acceptUntil: 1 } },
      { ...keyring, previous: { kid: "previous", key: Buffer.alloc(31), acceptUntil: 1 } },
      { ...keyring, previous: { kid: current.kid, key: Buffer.alloc(32, 2), acceptUntil: 1 } },
      { ...keyring, previous: { kid: "previous", key: current.key, acceptUntil: 1 } },
      { ...keyring, previous: { kid: "previous", key: Buffer.alloc(32, 2), acceptUntil: 1.5 } },
    ]) expect(() => new MusicPublicationResponseCipher(invalid as never)).toThrow(/key configuration is invalid/i);

    const cipher = new MusicPublicationResponseCipher(keyring);
    for (const invalid of [
      { ...context, musicUserId: 1.5 },
      { ...context, musicUserId: 0 },
      { ...context, idempotencyKeyHash: "x" },
      { ...context, requestFingerprint: "x" },
    ]) expect(() => cipher.encrypt(invalid, response)).toThrow(/context is invalid/i);
  });

  it("rejects every noncanonical response shape and nonce generator", () => {
    const cipher = new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 });
    const invalidResponses: unknown[] = [
      null,
      "response",
      [],
      { ...response, version: "wrong" },
      { version: "music-publication/v1" },
      { ...response, publication: "bad" },
      { ...response, publication: [] },
      { ...response, publication: { ...response.publication, mode: "secret" } },
      { ...response, publication: { ...response.publication, publicSlug: 4 } },
      { ...response, publication: { ...response.publication, publicSlug: "short" } },
      { ...response, publication: { ...response.publication, extra: true } },
      { ...response, extra: true },
      { ...response, capability: 4 },
      { ...response, capability: "short" },
      { ...response, publication: { ...response.publication, mode: "private" } },
      { version: "music-publication/v1", publication: response.publication },
    ];
    for (const invalid of invalidResponses) {
      expect(() => cipher.encrypt(context, invalid as never)).toThrow(/payload is invalid/i);
    }
    expect(() => new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, {
      randomBytes: () => "not-a-buffer" as never,
    }).encrypt(context, response)).toThrow(/nonce generation failed/i);
    expect(() => new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, {
      randomBytes: () => Buffer.alloc(11),
    }).encrypt(context, response)).toThrow(/nonce generation failed/i);
    expect(cipher.encrypt(context, { version: "music-publication/v1", publication: { mode: "private", publicSlug: "private-owner" } }).responseKeyId)
      .toBe(current.kid);
    expect(cipher.encrypt(context, { version: "music-publication/v1", publication: { mode: "public", publicSlug: "public-owner" } }).responseKeyId)
      .toBe(current.kid);
  });

  it("reports exact current and previous replay-key readiness boundaries", () => {
    const now = Date.parse("2026-08-21T00:00:00.000Z");
    const previous = { kid: "publication-previous-v1", key: Buffer.alloc(32, 0x30), acceptUntil: now + 1_000 };
    const cipher = new MusicPublicationResponseCipher({ current, previous: { ...previous, acceptUntil: now + 1_000 }, retentionSeconds: 86_400 }, { now: () => now });
    expect(cipher.acceptsReplayKey(current.kid)).toBe(true);
    expect(cipher.acceptsReplayKey(previous.kid)).toBe(true);
    expect(cipher.acceptsReplayKey("missing")).toBe(false);
    const withoutPrevious = new MusicPublicationResponseCipher({ current, retentionSeconds: 86_400 }, { now: () => now });
    expect(withoutPrevious.acceptsReplayKey(previous.kid)).toBe(false);
    const afterCutoff = new MusicPublicationResponseCipher({ current, previous: { ...previous, acceptUntil: now - 1 }, retentionSeconds: 86_400 }, { now: () => now });
    expect(afterCutoff.acceptsReplayKey(previous.kid)).toBe(false);
  });
});
