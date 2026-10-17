import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync as nodeMkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  resolveMusicIdentityRuntimeConfig,
  type MusicIdentityAddressResolver,
  type MusicIdentityConfigDependencies,
} from "../config/music-identity-config";
import { readSecureMusicSecretFile } from "../config/secure-music-secret-file";
import { semanticWindowsSecurityInspection } from "./helpers/semantic-windows-security";

const windowsEffectiveUserSid = process.platform === "win32"
  ? execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .match(/,"([^"]+)"\s*$/)?.[1]
  : undefined;

function mkdtempSync(prefix: string): string {
  const directory = nodeMkdtempSync(prefix);
  if (process.platform === "win32") {
    if (!windowsEffectiveUserSid) throw new Error("Windows test runner SID is unavailable");
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r",
      `*${windowsEffectiveUserSid}:(OI)(CI)(F)`, "*S-1-5-18:(OI)(CI)(F)", "*S-1-5-32-544:(OI)(CI)(F)"],
    { windowsHide: true });
  }
  return directory;
}

const secretRoot = mkdtempSync(join(tmpdir(), "music-key-config-"));
const externalSecretRoot = mkdtempSync(join(tmpdir(), "music-key-external-"));
const validCurrentPath = join(secretRoot, "current");
const validProofPath = join(secretRoot, "lifecycle-proof");
const validPublicationPath = join(secretRoot, "publication-current");
const validPublicIdPath = join(secretRoot, "public-id-hmac");
const validDatabasePath = join(secretRoot, "database-runtime");
writeFileSync(validCurrentPath, Buffer.alloc(32, 0x51).toString("base64url"), { mode: 0o600 });
writeFileSync(validProofPath, "dedicated-read-only-proof-token", { mode: 0o600 });
writeFileSync(validPublicationPath, Buffer.alloc(32, 0x52).toString("base64url"), { mode: 0o600 });
writeFileSync(validPublicIdPath, Buffer.alloc(32, 0x54).toString("base64url"), { mode: 0o600 });
writeFileSync(validDatabasePath, "dedicated-runtime-database-password", { mode: 0o600 });
chmodSync(validCurrentPath, 0o600);
chmodSync(validProofPath, 0o600);
chmodSync(validPublicationPath, 0o600);
chmodSync(validPublicIdPath, 0o600);
chmodSync(validDatabasePath, 0o600);

afterAll(() => {
  rmSync(secretRoot, { recursive: true, force: true });
  rmSync(externalSecretRoot, { recursive: true, force: true });
});

const liveBase = {
  NODE_ENV: "production",
  MUSIC_MODE: "live",
  STRAPI_URL: "https://cms.example.com",
  STRAPI_ACCESS_TOKEN: "generic-write-capable-token",
  STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: validProofPath,
  MUSIC_STRAPI_ALLOWED_ORIGINS: "https://cms.example.com",
  TRUST_PROXY_HOPS: "1",
  MUSIC_TRUSTED_PROXY_IP: "172.31.250.2",
  MUSIC_IDENTITY_MAX_CONCURRENCY: "8",
  MUSIC_IDENTITY_MAX_PENDING: "32",
  MUSIC_IDENTITY_MAX_INFLIGHT: "32",
  MUSIC_IDENTITY_RETRIES: "2",
  MUSIC_CONNECT_TIMEOUT_MS: "2000",
  MUSIC_READ_TIMEOUT_MS: "4000",
  MUSIC_IDENTITY_OVERALL_TIMEOUT_MS: "10000",
  MUSIC_IDENTITY_CACHE_TTL_MS: "30000",
  MUSIC_CIRCUIT_FAILURE_THRESHOLD: "3",
  MUSIC_IDENTITY_CIRCUIT_OPEN_MS: "15000",
  MUSIC_RATE_LIMIT_PER_MINUTE: "30",
  MUSIC_IDENTITY_GLOBAL_RATE_PER_MINUTE: "300",
  MUSIC_IDENTITY_RATE_MAX_ENTRIES: "10000",
  MUSIC_TOKEN_CURRENT_KID: "music-current-2026-08",
  MUSIC_TOKEN_CURRENT_SECRET_FILE: validCurrentPath,
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "publication-current-2026-08",
  MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: validPublicationPath,
  MUSIC_PUBLIC_ID_HMAC_KEY_FILE: validPublicIdPath,
  MUSIC_DATABASE_PASSWORD_FILE: validDatabasePath,
  SESSION_SECRET: "dedicated-session-secret-at-least-thirty-two-bytes",
  COOKIE_SECRET: "dedicated-cookie-secret-at-least-thirty-two-bytes",
  STRAPI_JWT_SECRET: "dedicated-strapi-jwt-secret-at-least-thirty-two-bytes",
  MUSIC_GATE_ATTESTATION_KEY: "dedicated-gate-attestation-key-at-least-thirty-two-bytes",
  MUSIC_TOKEN_LIFETIME_SECONDS: "600",
  MUSIC_TOKEN_CLOCK_SKEW_SECONDS: "15",
} as const;

const publicResolver: MusicIdentityAddressResolver = vi.fn(async () => ["8.8.8.8", "2606:4700:4700::1111"]);

const nativeWindowsOperationTimeoutMs = 20_000;

function semanticLiveDependencies(
  overrides: MusicIdentityConfigDependencies = {},
): MusicIdentityConfigDependencies {
  return {
    resolveAddresses: publicResolver,
    windowsSecurityInspection: semanticWindowsSecurityInspection,
    ...overrides,
  };
}

describe("central Music identity startup configuration", () => {
  describe("injected Windows security inspection", () => {
    it("validates injected Windows output at both real secure-read boundaries", async () => {
      const inspect = vi.fn(semanticWindowsSecurityInspection);
      await expect(readSecureMusicSecretFile(validCurrentPath, {
        mode: "live", platform: "win32", windowsSecurityInspection: inspect,
      })).resolves.toBe(Buffer.alloc(32, 0x51).toString("base64url"));
      expect(inspect).toHaveBeenCalledTimes(2);
    });

    it("rejects changed second-boundary Windows inspection output", async () => {
      const inspect = vi.fn(semanticWindowsSecurityInspection)
        .mockImplementationOnce(semanticWindowsSecurityInspection)
        .mockImplementationOnce(() => "not-json");
      await expect(readSecureMusicSecretFile(validCurrentPath, {
        mode: "live", platform: "win32", windowsSecurityInspection: inspect,
      })).rejects.toThrow();
      expect(inspect).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["owner", { ownerMatchesEffectiveUser: false }],
      ["writer", { unsafeWritePrincipalCount: 1 }],
      ["inode", {}],
    ])("rejects invalid injected Windows %s evidence", async (_name, invalid) => {
      const inspect = (paths: readonly string[]) =>
        semanticWindowsSecurityInspection(paths).split("\n")
          .map(line => {
            const evidence = JSON.parse(line);
            return JSON.stringify(_name === "inode"
              ? { ...evidence, nativeIno: (BigInt(evidence.nativeIno) + 1n).toString() }
              : { ...evidence, ...invalid });
          }).join("\n");
      await expect(readSecureMusicSecretFile(validCurrentPath, {
        mode: "live", platform: "win32", windowsSecurityInspection: inspect,
      })).rejects.toThrow();
    });
  });

  it("loads one dedicated 256-bit publication-response key with exact 24-hour retention", async () => {
    const inspect = vi.fn(semanticWindowsSecurityInspection);
    const resolved = await resolveMusicIdentityRuntimeConfig(liveBase, semanticLiveDependencies({
      windowsSecurityInspection: inspect,
    }));
    expect(resolved.publicationResponse).toEqual({
      current: { kid: "publication-current-2026-08", key: Buffer.alloc(32, 0x52) },
      retentionSeconds: 86_400,
    });
    expect(inspect).toHaveBeenCalledTimes(process.platform === "win32" ? 8 : 0);
  });

  it("loads a dedicated stable 256-bit public-ID HMAC key without exposing encoded material", async () => {
    const resolved = await resolveMusicIdentityRuntimeConfig(liveBase, { resolveAddresses: publicResolver });
    expect(resolved.publicIdHmacKey).toEqual(Buffer.alloc(32, 0x54));
    expect(JSON.stringify(resolved)).not.toContain(Buffer.alloc(32, 0x54).toString("base64url"));
  }, nativeWindowsOperationTimeoutMs);

  it.each([
    ["missing live key file", { MUSIC_PUBLIC_ID_HMAC_KEY_FILE: undefined }],
    ["inline live key", { MUSIC_PUBLIC_ID_HMAC_KEY_FILE: undefined, MUSIC_PUBLIC_ID_HMAC_KEY: Buffer.alloc(32, 0x54).toString("base64url") }],
    ["publication path alias", { MUSIC_PUBLIC_ID_HMAC_KEY_FILE: validPublicationPath }],
    ["token path alias", { MUSIC_PUBLIC_ID_HMAC_KEY_FILE: validCurrentPath }],
  ])("rejects an unsafe %s for public IDs before route registration", async (_label, overrides) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
      .rejects.toThrow(/public.?id|HMAC|dedicated|distinct|alias|secure file/i);
  });

  it("rejects public-ID HMAC material shared with another protected authority", async () => {
    const duplicatePath = join(secretRoot, "public-id-duplicate-content");
    writeFileSync(duplicatePath, Buffer.alloc(32, 0x52).toString("base64url"), { mode: 0o600 });
    chmodSync(duplicatePath, 0o600);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: duplicatePath,
    }, semanticLiveDependencies())).rejects.toThrow(/public.?id|HMAC|dedicated|distinct|authority/i);
  });

  it("allows an all-or-none previous publication key only through its bounded UTC replay deadline", async () => {
    const now = Date.parse("2026-08-21T00:00:00.000Z");
    const previousPath = join(secretRoot, "publication-previous");
    writeFileSync(previousPath, Buffer.alloc(32, 0x53).toString("base64url"), { mode: 0o600 });
    chmodSync(previousPath, 0o600);
    const acceptUntil = new Date(now + 86_400_000).toISOString();
    const resolved = await resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-previous-2026-08",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: previousPath,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: acceptUntil,
    }, semanticLiveDependencies({ now: () => now }));
    expect(resolved.publicationResponse.previous).toEqual({
      kid: "publication-previous-2026-08", key: Buffer.alloc(32, 0x53), acceptUntil: now + 86_400_000,
    });
  });

  it.each([
    ["missing current kid", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: undefined }],
    ["missing current key file", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: undefined }],
    ["inline live key", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: undefined, MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: Buffer.alloc(32, 0x52).toString("base64url") }],
    ["partial previous key", { MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "previous" }],
    ["duplicate key IDs", {
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID: "publication-current-2026-08",
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE: validPublicationPath,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL: new Date(Date.now() + 86_400_000).toISOString(),
    }],
    ["native token file alias", { MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: validCurrentPath }],
  ])("rejects %s publication response authority before route registration", async (_label, overrides) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
      .rejects.toThrow(/publication|response|key|file|dedicated|alias/i);
  });

  it("rejects publication key content shared with any configured authority even through another file", async () => {
    const duplicatePath = join(secretRoot, "publication-duplicate-content");
    writeFileSync(duplicatePath, Buffer.alloc(32, 0x51).toString("base64url"), { mode: 0o600 });
    chmodSync(duplicatePath, 0o600);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: duplicatePath,
    }, semanticLiveDependencies())).rejects.toThrow(/publication|distinct|dedicated|key material/i);
  });

  it.each([
    ["runtime database file identity", { MUSIC_DATABASE_PASSWORD_FILE: validPublicationPath }],
    ["session authority content", { SESSION_SECRET: Buffer.alloc(32, 0x52).toString("base64url") }],
    ["cookie authority content", { COOKIE_SECRET: Buffer.alloc(32, 0x52).toString("base64url") }],
    ["Strapi JWT content", { STRAPI_JWT_SECRET: Buffer.alloc(32, 0x52).toString("base64url") }],
    ["gate attestation content", { MUSIC_GATE_ATTESTATION_KEY: Buffer.alloc(32, 0x52).toString("base64url") }],
  ])("rejects publication authority shared with the app-accessible %s", async (_label, overrides) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
      .rejects.toThrow(/publication|distinct|dedicated|authority|alias/i);
  });

  it("permits only the exact separate deterministic publication key in fixture mode", async () => {
    const fixtureBase = {
      ...liveBase,
      NODE_ENV: "test",
      MUSIC_MODE: "fixture",
      STRAPI_URL: "http://strapi:1337",
      MUSIC_FIXTURE_STRAPI_ORIGIN: "http://strapi:1337",
      TRUST_PROXY_HOPS: "0",
      MUSIC_TRUSTED_PROXY_IP: undefined,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined,
      STRAPI_ACCESS_TOKEN: "fixture-read-only-token",
      STRAPI_LIFECYCLE_PROOF_TOKEN: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-v1",
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI",
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: undefined,
      MUSIC_PUBLIC_ID_HMAC_KEY: "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ",
    };
    await expect(resolveMusicIdentityRuntimeConfig(fixtureBase)).resolves.toMatchObject({
      publicationResponse: { current: { kid: "fixture-publication-v1" }, retentionSeconds: 86_400 },
    });
    await expect(resolveMusicIdentityRuntimeConfig({
      ...fixtureBase,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: Buffer.alloc(32, 0x71).toString("base64url"),
    })).rejects.toThrow(/fixture publication|deterministic|key/i);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...fixtureBase,
      MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY: Buffer.alloc(32, 0x72).toString("base64url"),
    })).rejects.toThrow(/fixture publication|deterministic|key/i);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...fixtureBase,
      MUSIC_PUBLIC_ID_HMAC_KEY: Buffer.alloc(32, 0x71).toString("base64url"),
    })).rejects.toThrow(/fixture public.?id|deterministic|HMAC|key/i);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...fixtureBase,
      MUSIC_PUBLIC_ID_HMAC_KEY: undefined,
    })).rejects.toThrow(/fixture public.?id|deterministic|HMAC|key/i);
  });

  it("requires a dedicated file-backed live lifecycle proof credential and rejects generic authority aliasing", async () => {
    // Break caught: the destructive worker starts with a generic write-capable Strapi token.
    const resolved = await resolveMusicIdentityRuntimeConfig(liveBase, semanticLiveDependencies());
    expect(resolved.lifecycleProofToken).toBe("dedicated-read-only-proof-token");
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined,
    }, semanticLiveDependencies())).rejects.toThrow(/lifecycle proof|STRAPI_LIFECYCLE_PROOF_TOKEN/i);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined,
      STRAPI_LIFECYCLE_PROOF_TOKEN: "inline-live-proof",
    }, semanticLiveDependencies())).rejects.toThrow(/secure file|live mode/i);
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      STRAPI_ACCESS_TOKEN: "dedicated-read-only-proof-token",
    }, semanticLiveDependencies())).rejects.toThrow(/dedicated|alias|separate/i);
  });

  it.each([
    ["missing URL", { STRAPI_URL: undefined }],
    ["HTTP", { STRAPI_URL: "http://cms.example.com", MUSIC_STRAPI_ALLOWED_ORIGINS: "http://cms.example.com" }],
    ["userinfo", { STRAPI_URL: "https://user:pass@cms.example.com" }],
    ["path", { STRAPI_URL: "https://cms.example.com/api" }],
    ["query", { STRAPI_URL: "https://cms.example.com?x=1" }],
    ["fragment", { STRAPI_URL: "https://cms.example.com#x" }],
    ["not allowlisted", { STRAPI_URL: "https://other.example.com" }],
    ["malformed", { STRAPI_URL: "https://[broken" }],
    ["malformed trusted proxy", { MUSIC_TRUSTED_PROXY_IP: "not-an-ip" }],
  ])("rejects live %s before route registration", async (_label, overrides) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
      .rejects.toThrow(/STRAPI|origin|URL|proxy/i);
  });

  it.each([
    "0.0.0.0", "127.0.0.1", "10.0.0.4", "169.254.1.2", "192.168.1.2", "100.64.0.1",
    "192.0.2.1", "192.88.99.1", "224.0.0.1",
    "::1", "64:ff9b::1", "100::1", "2001:1::1", "2001:db8::1", "2002:c0a8:101::", "fe80::1", "fd00::1",
  ])("rejects a live hostname resolving to non-public address %s", async (address) => {
    await expect(resolveMusicIdentityRuntimeConfig(liveBase, semanticLiveDependencies({
      resolveAddresses: async () => [address],
    })))
      .rejects.toThrow(/public|address|STRAPI/i);
  });

  it.each([
    ["MUSIC_IDENTITY_MAX_CONCURRENCY", "NaN"],
    ["MUSIC_IDENTITY_MAX_PENDING", "Infinity"],
    ["MUSIC_IDENTITY_MAX_INFLIGHT", "0"],
    ["MUSIC_IDENTITY_RETRIES", "-1"],
    ["MUSIC_CONNECT_TIMEOUT_MS", "0"],
    ["MUSIC_READ_TIMEOUT_MS", "-1"],
    ["MUSIC_IDENTITY_OVERALL_TIMEOUT_MS", "999999"],
    ["MUSIC_IDENTITY_CACHE_TTL_MS", "30001"],
    ["MUSIC_CIRCUIT_FAILURE_THRESHOLD", "0"],
    ["MUSIC_IDENTITY_CIRCUIT_OPEN_MS", "0"],
    ["MUSIC_RATE_LIMIT_PER_MINUTE", "0"],
    ["MUSIC_IDENTITY_GLOBAL_RATE_PER_MINUTE", "-1"],
    ["MUSIC_IDENTITY_RATE_MAX_ENTRIES", "1"],
    ["TRUST_PROXY_HOPS", "2"],
  ])("rejects invalid bounded control %s=%s", async (name, value) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, [name]: value }, semanticLiveDependencies()))
      .rejects.toThrow(new RegExp(name));
  });

  it("enforces cross-field queue/deadline/rate bounds", async () => {
    for (const overrides of [
      { MUSIC_IDENTITY_MAX_PENDING: "4", MUSIC_IDENTITY_MAX_CONCURRENCY: "8" },
      { MUSIC_IDENTITY_MAX_INFLIGHT: "33", MUSIC_IDENTITY_MAX_PENDING: "32" },
      { MUSIC_IDENTITY_OVERALL_TIMEOUT_MS: "1000", MUSIC_READ_TIMEOUT_MS: "4000" },
      { MUSIC_IDENTITY_GLOBAL_RATE_PER_MINUTE: "10", MUSIC_RATE_LIMIT_PER_MINUTE: "30" },
    ]) {
      await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
        .rejects.toThrow(/bounded|must be|configuration/i);
    }
  });

  it("accepts only the exact declared fixture origin without DNS and pins every live DNS answer", async () => {
    const resolver = vi.fn(async () => ["8.8.8.8", "2606:4700:4700::1111"]);
    const live = await resolveMusicIdentityRuntimeConfig(liveBase, semanticLiveDependencies({ resolveAddresses: resolver }));
    expect(live.strapiOrigin).toBe("https://cms.example.com");
    expect(live.isTrustedProxy("::ffff:172.31.250.2")).toBe(true);
    expect(live.isTrustedProxy("172.31.250.3")).toBe(false);
    expect(live.pinnedAddresses).toEqual(["8.8.8.8", "2606:4700:4700::1111"]);
    await expect(live.lookup("cms.example.com", { all: true })).resolves.toEqual([
      { address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 },
    ]);
    await expect(live.lookup("cms.example.com", { family: 6 })).resolves.toEqual({
      address: "2606:4700:4700::1111", family: 6,
    });
    await expect(live.fetchImpl("https://other.example.com/api/users/me")).rejects.toThrow(/unpinned/i);
    expect(resolver).toHaveBeenCalledTimes(1);

    const fixture = await resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      NODE_ENV: "test",
      MUSIC_MODE: "fixture",
      STRAPI_URL: "http://strapi:1337",
      MUSIC_FIXTURE_STRAPI_ORIGIN: "http://strapi:1337",
      TRUST_PROXY_HOPS: "0",
      MUSIC_TRUSTED_PROXY_IP: undefined,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined,
      STRAPI_ACCESS_TOKEN: "fixture-read-only-token",
      STRAPI_LIFECYCLE_PROOF_TOKEN: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-v1",
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI",
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: undefined,
      MUSIC_PUBLIC_ID_HMAC_KEY: "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ",
    }, { resolveAddresses: vi.fn(async () => { throw new Error("fixture DNS must not run"); }) });
    expect(fixture.strapiOrigin).toBe("http://strapi:1337");
    expect(fixture.lifecycleProofToken).toBe("fixture-read-only-token");
    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      NODE_ENV: "test",
      MUSIC_MODE: "fixture",
      STRAPI_URL: "http://127.0.0.1:1337",
      MUSIC_FIXTURE_STRAPI_ORIGIN: "http://strapi:1337",
      TRUST_PROXY_HOPS: "0",
      MUSIC_TRUSTED_PROXY_IP: undefined,
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined,
      STRAPI_ACCESS_TOKEN: "fixture-read-only-token",
      STRAPI_LIFECYCLE_PROOF_TOKEN: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: undefined,
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-v1",
      MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI",
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: undefined,
      MUSIC_PUBLIC_ID_HMAC_KEY: "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ",
    })).rejects.toThrow(/fixture origin/i);
  });

  it("rejects the entire live answer set when even one resolved address is non-public", async () => {
    await expect(resolveMusicIdentityRuntimeConfig(liveBase, semanticLiveDependencies({
      resolveAddresses: async () => ["8.8.8.8", "127.0.0.1"],
    }))).rejects.toThrow(/public addresses/i);
  });

  it.each([
    ["missing current kid", { MUSIC_TOKEN_CURRENT_KID: undefined }],
    ["missing current secret", { MUSIC_TOKEN_CURRENT_SECRET_FILE: undefined }],
    ["wrong token lifetime", { MUSIC_TOKEN_LIFETIME_SECONDS: "601" }],
    ["excess clock skew", { MUSIC_TOKEN_CLOCK_SKEW_SECONDS: "31" }],
    ["partial previous key", { MUSIC_TOKEN_PREVIOUS_KID: "previous" }],
    ["inline live previous secret", {
      MUSIC_TOKEN_PREVIOUS_KID: "previous",
      MUSIC_TOKEN_PREVIOUS_SECRET: Buffer.alloc(32, 0x70).toString("base64url"),
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: new Date(Date.now() + 60_000).toISOString(),
    }],
    ["same key IDs", {
      MUSIC_TOKEN_PREVIOUS_KID: "music-current-2026-08",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: validCurrentPath,
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: new Date(Date.now() + 60_000).toISOString(),
    }],
    ["non-UTC cutoff", {
      MUSIC_TOKEN_PREVIOUS_KID: "previous",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: validCurrentPath,
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: "2026-08-14T12:00:00+05:30",
    }],
    ["unbounded overlap", {
      MUSIC_TOKEN_PREVIOUS_KID: "previous",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: validCurrentPath,
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: new Date(Date.now() + 3_600_000).toISOString(),
    }],
  ])("rejects %s before route registration", async (_label, overrides) => {
    await expect(resolveMusicIdentityRuntimeConfig({ ...liveBase, ...overrides }, semanticLiveDependencies()))
      .rejects.toThrow(/token|key|kid|secret|lifetime|skew|overlap|UTC/i);
  });

  it("loads live current/previous keys only from secure regular files", async () => {
    const now = Date.now();
    const current = Buffer.alloc(32, 0x61).toString("base64url");
    const previous = Buffer.alloc(32, 0x62).toString("base64url");
    const currentPath = join(secretRoot, "valid-current");
    const previousPath = join(secretRoot, "valid-previous");
    writeFileSync(currentPath, `${current}\n`, { mode: 0o600 });
    writeFileSync(previousPath, previous, { mode: 0o600 });
    chmodSync(currentPath, 0o600);
    chmodSync(previousPath, 0o600);
    const config = await resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_TOKEN_CURRENT_SECRET_FILE: currentPath,
      MUSIC_TOKEN_PREVIOUS_KID: "music-previous-2026-08",
      MUSIC_TOKEN_PREVIOUS_SECRET_FILE: previousPath,
      MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL: new Date(now + 300_000).toISOString(),
    }, semanticLiveDependencies({ now: () => now }));
    expect(config.musicToken).toEqual({
      current: { kid: "music-current-2026-08", secret: current },
      previous: {
        kid: "music-previous-2026-08",
        secret: previous,
        acceptUntil: new Date(now + 300_000).getTime(),
      },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 15,
    });
    expect(lstatSync(currentPath).isFile()).toBe(true);
  });

  it("requires live keys to use the file authority and rejects insecure file metadata before startup", async () => {
    const secret = Buffer.alloc(32, 0x63).toString("base64url");
    const permissivePath = join(secretRoot, "world-readable-key-sentinel");
    const oversizedPath = join(secretRoot, "oversized-key-sentinel");
    const directoryPath = join(secretRoot, "directory-key-sentinel");
    const symlinkPath = join(secretRoot, "junction-key-sentinel");
    const junctionTarget = join(secretRoot, "junction-target");
    writeFileSync(permissivePath, secret, { mode: 0o644 });
    chmodSync(permissivePath, 0o644);
    writeFileSync(oversizedPath, "A".repeat(300), { mode: 0o600 });
    chmodSync(oversizedPath, 0o600);
    mkdirSync(directoryPath);
    mkdirSync(junctionTarget);
    symlinkSync(junctionTarget, symlinkPath, "junction");

    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_TOKEN_CURRENT_SECRET_FILE: undefined,
      MUSIC_TOKEN_CURRENT_SECRET: secret,
    }, { resolveAddresses: publicResolver })).rejects.toThrow(/file|secret/i);

    for (const [path, dependencies] of [
      [permissivePath, { resolveAddresses: publicResolver, platform: "linux" as const, effectiveUserId: 0 }],
      [oversizedPath, { resolveAddresses: publicResolver }],
      [directoryPath, { resolveAddresses: publicResolver }],
      [symlinkPath, { resolveAddresses: publicResolver }],
    ] as const) {
      const failure = resolveMusicIdentityRuntimeConfig({
        ...liveBase,
        MUSIC_TOKEN_CURRENT_SECRET_FILE: path,
      }, dependencies);
      await expect(failure).rejects.toThrow(/secret|secure|regular|permission|size|link/i);
      await expect(failure).rejects.not.toThrow(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("rejects a key file whose identity or metadata changes between checks", async () => {
    const path = join(secretRoot, "changed-key-sentinel");
    writeFileSync(path, Buffer.alloc(32, 0x64).toString("base64url"), { mode: 0o600 });
    chmodSync(path, 0o600);
    let changed = false;
    const failure = resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_TOKEN_CURRENT_SECRET_FILE: path,
    }, semanticLiveDependencies({
      secretFileSystem: {
        lstat: (target: string) => lstat(target, { bigint: true }),
        open: async (target: string, flags: number) => {
          const handle = await open(target, flags);
          changed = true;
          writeFileSync(path, Buffer.alloc(33, 0x65).toString("base64url"), { mode: 0o600 });
          return handle;
        },
      },
    }));
    await expect(failure).rejects.toThrow(/changed|secret|secure/i);
    expect(changed).toBe(true);
  });

  it("rejects a regular key reached through a symlink or junction ancestor", async () => {
    const externalKey = join(externalSecretRoot, "current");
    const linkedParent = join(secretRoot, "linked-parent");
    writeFileSync(externalKey, Buffer.alloc(32, 0x66).toString("base64url"), { mode: 0o600 });
    chmodSync(externalKey, 0o600);
    symlinkSync(externalSecretRoot, linkedParent, "junction");

    await expect(resolveMusicIdentityRuntimeConfig({
      ...liveBase,
      MUSIC_TOKEN_CURRENT_SECRET_FILE: join(linkedParent, "current"),
    }, { resolveAddresses: publicResolver })).rejects.toThrow(/ancestor|directory|link|secure/i);
    expect(readFileSync(externalKey, "utf8")).toBe(Buffer.alloc(32, 0x66).toString("base64url"));
  });
});
