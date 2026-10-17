import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyPublicationAuthority } from "../../../deployment/verify-publication-authority.mjs";

const script = resolve(import.meta.dirname, "../../../deployment/verify-publication-authority.mjs");
const encoded = (byte: number) => Buffer.alloc(32, byte).toString("base64url");
const validDeadline = new Date(Date.now() + 3_600_000).toISOString();

describe("privileged publication authority separation verifier", () => {
  let root: string;
  let environmentPath: string;
  let hmacPath: string;
  let paths: Record<string, string>;

  const secret = (name: string, value: string) => {
    const path = join(root, name);
    writeFileSync(path, value, { mode: 0o600 });
    chmodSync(path, 0o600);
    return path;
  };
  const writeEnvironment = (overrides: Record<string, string> = {}) => {
    const values = {
      MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST: paths.publication,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "publication-current-v1",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-previous-v1",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: "/run/secrets/music-publication-response/previous",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: validDeadline,
      MUSIC_TOKEN_SECRET_DIRECTORY_HOST: paths.token,
      MUSIC_TOKEN_CURRENT_KID: "token-current-v1",
      MUSIC_TOKEN_PREVIOUS_KID: "token-previous-v1",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: "/run/secrets/music-token/previous",
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: validDeadline,
      DB_RUNTIME_PASSWORD_FILE_HOST: paths.runtimeDatabase,
      DB_MIGRATOR_PASSWORD_FILE_HOST: paths.migratorDatabase,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST: paths.lifecycleProof,
      STRAPI_RECONCILIATION_TOKEN_FILE_HOST: paths.reconciliation,
      SESSION_SECRET: "dedicated-session-authority",
      COOKIE_SECRET: "dedicated-cookie-authority",
      STRAPI_ACCESS_TOKEN: "dedicated-strapi-access-authority",
      STRAPI_JWT_SECRET: "dedicated-strapi-jwt-authority",
      MUSIC_GATE_ATTESTATION_KEY: "dedicated-gate-attestation-authority",
      MUSIC_SIGNING_KEY_CURRENT_SECRET: "dedicated-signing-current-authority",
      MUSIC_SIGNING_KEY_PREVIOUS_SECRET: "dedicated-signing-previous-authority",
      ...overrides,
    };
    writeFileSync(environmentPath, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
    chmodSync(environmentPath, 0o600);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "music-publication-authority-"));
    const publication = join(root, "publication");
    const token = join(root, "token");
    mkdirSync(publication);
    mkdirSync(token);
    secret("publication/current", encoded(0x70));
    secret("publication/previous", encoded(0x71));
    const publicId = secret("publication/public-id", encoded(0x76));
    secret("token/current", encoded(0x72));
    secret("token/previous", encoded(0x73));
    paths = {
      publication,
      publicId,
      token,
      runtimeDatabase: secret("database-runtime", "dedicated-runtime-password"),
      migratorDatabase: secret("database-migrator", "dedicated-migrator-password"),
      lifecycleProof: secret("strapi-lifecycle", "dedicated-lifecycle-proof"),
      reconciliation: secret("strapi-reconciliation", "dedicated-reconciliation-proof"),
    };
    environmentPath = join(root, "production.env");
    hmacPath = secret("deployment-hmac", "dedicated-deployment-hmac-authority");
    writeEnvironment();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("accepts distinct current/previous publication and stable public-ID material without exposing any authority", async () => {
    await expect(verifyPublicationAuthority(environmentPath, hmacPath)).resolves.toBeUndefined();
  });

  it("requires the stable public-ID authority before candidate Docker activity", async () => {
    rmSync(paths.publicId);
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it.each([
    ["publication current", () => writeFileSync(paths.publicId, encoded(0x70))],
    ["token current", () => writeFileSync(paths.publicId, encoded(0x72))],
    ["migrator database", () => writeFileSync(paths.migratorDatabase, encoded(0x76))],
    ["deployment HMAC", () => writeFileSync(hmacPath, encoded(0x76))],
    ["session", () => writeEnvironment({ SESSION_SECRET: encoded(0x76) })],
  ])("rejects public-ID material shared with %s", async (_label, arrange) => {
    arrange();
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it("reads the exact configured nested previous publication path instead of a safe decoy", async () => {
    mkdirSync(join(paths.publication, "rotations"));
    secret("publication/rotations/previous-v2", encoded(0x74));
    writeEnvironment({
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-previous-v2",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: "/run/secrets/music-publication-response/rotations/previous-v2",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: validDeadline,
    });
    await expect(verifyPublicationAuthority(environmentPath, hmacPath)).resolves.toBeUndefined();
  });

  it.each([
    ["runtime database", "runtimeDatabase"],
    ["migrator database", "migratorDatabase"],
    ["deployment HMAC", "deploymentHmac"],
    ["lifecycle proof", "lifecycleProof"],
    ["reconciliation proof", "reconciliation"],
  ] as const)("rejects a configured custom previous key that aliases %s while the decoy previous is safe", async (_label, authority) => {
    mkdirSync(join(paths.publication, "rotations"));
    const custom = secret("publication/rotations/previous-v2", encoded(0x75));
    const privilegedPath = authority === "deploymentHmac" ? hmacPath : paths[authority];
    writeFileSync(privilegedPath, encoded(0x75));
    writeEnvironment({
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-previous-v2",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: "/run/secrets/music-publication-response/rotations/previous-v2",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: validDeadline,
    });
    expect(custom).not.toBe(join(paths.publication, "previous"));
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it.each([
    ["missing custom file", "/run/secrets/music-publication-response/rotations/missing", "publication-previous-v2", validDeadline],
    ["directory traversal", "/run/secrets/music-publication-response/../music-token/current", "publication-previous-v2", validDeadline],
    ["malformed KID", "/run/secrets/music-publication-response/previous", "../previous", validDeadline],
    ["malformed deadline", "/run/secrets/music-publication-response/previous", "publication-previous-v2", "tomorrow"],
    ["impossible exact-looking deadline", "/run/secrets/music-publication-response/previous", "publication-previous-v2", "2026-02-31T00:00:00.000Z"],
  ])("fails closed for %s in the configured previous authority triple", async (_label, path, kid, deadline) => {
    writeEnvironment({
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: kid,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: path,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: deadline,
    });
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it("rejects a POSIX container path containing Windows separators before native host joining", async () => {
    secret("escaped-publication", encoded(0x76));
    writeEnvironment({
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-previous-v2",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE:
        "/run/secrets/music-publication-response/rotations\\..\\..\\escaped-publication",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: validDeadline,
    });
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it.each([
    ["publication current KID", { MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-current-v1" }],
    ["token current KID", { MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "token-current-v1" }],
    ["token previous KID", { MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "token-previous-v1" }],
    ["malformed publication current KID", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "../current" }],
    ["publication current KID shared with token current", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "token-current-v1" }],
  ])("rejects %s reuse or malformation before reading candidate authority", async (_label, overrides) => {
    writeEnvironment(overrides);
    await expect(verifyPublicationAuthority(environmentPath, hmacPath))
      .rejects.toThrow("Publication authority verification failed.");
  });

  it.each([
    ["expired", "2026-08-20T23:59:59.999Z"],
    ["longer than 24 hours", "2026-08-22T00:00:00.001Z"],
  ])("rejects a %s previous-key deadline before Docker", async (_label, deadline) => {
    writeEnvironment({ MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: deadline });
    await expect(verifyPublicationAuthority(environmentPath, hmacPath, {
      now: () => Date.parse("2026-08-21T00:00:00.000Z"),
    })).rejects.toThrow("Publication authority verification failed.");
  });

  it.each([
    ["runtime database content", () => writeFileSync(paths.runtimeDatabase, encoded(0x70))],
    ["migrator database identity", () => writeEnvironment({ DB_MIGRATOR_PASSWORD_FILE_HOST: join(paths.publication, "current") })],
    ["deployment HMAC content", () => writeFileSync(hmacPath, encoded(0x70))],
    ["token content", () => writeFileSync(join(paths.token, "current"), encoded(0x70))],
    ["lifecycle proof content", () => writeFileSync(paths.lifecycleProof, encoded(0x70))],
    ["reconciliation content", () => writeFileSync(paths.reconciliation, encoded(0x70))],
    ["session content", () => writeEnvironment({ SESSION_SECRET: encoded(0x70) })],
    ["Strapi access content", () => writeEnvironment({ STRAPI_ACCESS_TOKEN: encoded(0x70) })],
    ["publication current/previous content", () => writeFileSync(join(paths.publication, "previous"), encoded(0x70))],
  ])("fails closed for shared %s with a contained error", async (_label, arrange) => {
    arrange();
    const error = await verifyPublicationAuthority(environmentPath, hmacPath).catch((cause) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Publication authority verification failed.");
    expect(error.message).not.toContain(encoded(0x70));
  });

  it("CLI output contains no authority material on failure", () => {
    writeEnvironment({ COOKIE_SECRET: encoded(0x70) });
    const result = spawnSync(process.execPath, [script, environmentPath, hmacPath], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("Publication authority verification failed.");
    expect(`${result.stdout}${result.stderr}`).not.toContain(encoded(0x70));
  });
});
