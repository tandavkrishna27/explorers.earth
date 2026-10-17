import { chmodSync, linkSync, mkdtempSync as nodeMkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseMusicReconciliationCommandConfig,
  validateMusicReconciliationServiceToken,
} from "../config/music-reconciliation-config";
import { resolveMusicIdentityTransportConfig } from "../config/music-identity-config";
import {
  readSecureMusicReconciliationAuthorities,
  readSecureMusicSecretFileWithDistinctAuthorities,
} from "../config/secure-music-secret-file";

const fixture = {
  MUSIC_MODE: "fixture",
  MUSIC_STRAPI_HOST_PORT: "51337",
  STRAPI_FIXTURE_URL: "http://127.0.0.1:51337",
  STRAPI_RECONCILIATION_TOKEN: "fixture-read-only-token",
};

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

describe("music reconciliation command configuration", () => {
  it("defaults every control to bounded report-only fixture values", () => {
    expect(parseMusicReconciliationCommandConfig(fixture)).toEqual({
      environment: "fixture",
      applyEnabled: false,
      liveContractVerified: false,
      sourceUrl: "http://127.0.0.1:51337",
      serviceToken: "fixture-read-only-token",
      pageSize: 100,
      maxRows: 1_000,
      batchSize: 100,
      maxChangeAbsolute: 0,
      maxChangePercent: 0,
      maxPages: 100,
      scanTimeoutMs: 300_000,
      timeoutMs: 10_000,
      maxResponseBytes: 1_048_576,
      maxCanonicalBytes: 16 * 1024 * 1024,
      databaseLockTimeoutMs: 5_000,
      databaseStatementTimeoutMs: 120_000,
      databaseIdleTransactionTimeoutMs: 30_000,
    });
  });

  it("parses explicit bounded thresholds separately from the C0 startup gates", () => {
    expect(parseMusicReconciliationCommandConfig({
      ...fixture,
      MUSIC_RECONCILIATION_ENVIRONMENT: "fixture",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "true",
      MUSIC_RECONCILIATION_PAGE_SIZE: "20",
      MUSIC_RECONCILIATION_SCAN_MAX_ROWS: "500",
      MUSIC_RECONCILIATION_BATCH_SIZE: "25",
      MUSIC_RECONCILIATION_MAX_CHANGE_ABSOLUTE: "3",
      MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT: "1.5",
      MUSIC_RECONCILIATION_TIMEOUT_MS: "5000",
      MUSIC_RECONCILIATION_MAX_RESPONSE_BYTES: "65536",
      MUSIC_RECONCILIATION_ENABLED: "false",
      MUSIC_RECONCILIATION_MAX_ROWS: "0",
    })).toMatchObject({ applyEnabled: true, pageSize: 20, maxRows: 500, batchSize: 25, maxChangeAbsolute: 3, maxChangePercent: 1.5 });
  });

  it("accepts an authenticated explicit loopback fixture port without widening the source boundary", () => {
    expect(parseMusicReconciliationCommandConfig({
      ...fixture,
      MUSIC_STRAPI_HOST_PORT: "52359",
      STRAPI_FIXTURE_URL: "http://127.0.0.1:52359",
    })).toMatchObject({ sourceUrl: "http://127.0.0.1:52359" });
  });

  it("requires an attested, HTTPS, dedicated file-backed authority for live reads", () => {
    const live = {
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "false",
      MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
      STRAPI_URL: "https://strapi.example.test",
      STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/strapi-reconciliation",
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle-proof",
      STRAPI_ACCESS_TOKEN_FILE: "/run/secrets/strapi-access-token",
      STRAPI_ACCESS_TOKEN: "a".repeat(32),
    };
    expect(parseMusicReconciliationCommandConfig(live)).toMatchObject({
      environment: "staging",
      liveContractVerified: true,
      sourceUrl: "https://strapi.example.test",
      serviceTokenFile: "/run/secrets/strapi-reconciliation",
      lifecycleProofTokenFile: "/run/secrets/strapi-lifecycle-proof",
      accessTokenFile: "/run/secrets/strapi-access-token",
      serviceToken: undefined,
    });
    for (const invalid of [
      { ...live, MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "false" },
      { ...live, STRAPI_URL: "http://strapi.example.test" },
      { ...live, STRAPI_RECONCILIATION_TOKEN_FILE: undefined },
      { ...live, STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: undefined },
      { ...live, STRAPI_ACCESS_TOKEN_FILE: undefined },
      { ...live, STRAPI_ACCESS_TOKEN: undefined },
      { ...live, STRAPI_RECONCILIATION_TOKEN: "inline-is-forbidden" },
      { ...live, STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/strapi-lifecycle", STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle" },
      { ...live, STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/../secrets/strapi-lifecycle", STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle" },
      { ...live, MUSIC_RECONCILIATION_ENVIRONMENT: "fixture" },
    ]) expect(() => parseMusicReconciliationCommandConfig(invalid)).toThrow();
    expect(() => validateMusicReconciliationServiceToken("short")).toThrow();
    expect(() => validateMusicReconciliationServiceToken(` ${"a".repeat(16)}`)).toThrow();
    expect(() => validateMusicReconciliationServiceToken(`${"a".repeat(16)}\n`)).toThrow();
    expect(validateMusicReconciliationServiceToken("a".repeat(16))).toBe("a".repeat(16));
  });

  it.skipIf(process.platform !== "win32")("rejects a case-only alias to another live token authority", () => {
    const live = {
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
      STRAPI_URL: "https://strapi.example.test",
      STRAPI_RECONCILIATION_TOKEN_FILE: "C:\\RUN\\SECRETS\\STRAPI-TOKEN",
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "c:\\run\\secrets\\strapi-token",
      STRAPI_ACCESS_TOKEN_FILE: "C:\\RUN\\SECRETS\\STRAPI-ACCESS-TOKEN",
      STRAPI_ACCESS_TOKEN: "a".repeat(32),
    };
    expect(() => parseMusicReconciliationCommandConfig(live)).toThrow(/dedicated/i);
  });

  it.each(["lifecycle-proof", "access-token"])("rejects a reconciliation token hardlinked to the %s authority", async (authority) => {
    const directory = mkdtempSync(join(tmpdir(), "music-reconciliation-token-"));
    const reconciliationPath = join(directory, "reconciliation-token");
    const authorityPath = join(directory, authority);
    const otherAuthorityPath = join(directory, authority === "lifecycle-proof" ? "access-token" : "lifecycle-proof");
    try {
      writeFileSync(reconciliationPath, "r".repeat(32), { mode: 0o600 });
      writeFileSync(otherAuthorityPath, "o".repeat(32), { mode: 0o600 });
      chmodSync(reconciliationPath, 0o600);
      chmodSync(otherAuthorityPath, 0o600);
      linkSync(reconciliationPath, authorityPath);
      await expect(readSecureMusicSecretFileWithDistinctAuthorities(
        reconciliationPath,
        [authorityPath, otherAuthorityPath],
        { mode: "live" },
      ))
        .rejects.toThrow(/secure|link|secret/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts a distinct owner-only reconciliation token file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "music-reconciliation-token-distinct-"));
    const reconciliationPath = join(directory, "reconciliation-token");
    const lifecyclePath = join(directory, "lifecycle-proof");
    const accessPath = join(directory, "access-token");
    try {
      writeFileSync(reconciliationPath, "r".repeat(32), { mode: 0o600 });
      writeFileSync(lifecyclePath, "l".repeat(32), { mode: 0o600 });
      writeFileSync(accessPath, "a".repeat(32), { mode: 0o600 });
      chmodSync(reconciliationPath, 0o600);
      chmodSync(lifecyclePath, 0o600);
      chmodSync(accessPath, 0o600);
      await expect(readSecureMusicSecretFileWithDistinctAuthorities(
        reconciliationPath,
        [lifecyclePath, accessPath],
        { mode: "live" },
      ))
        .resolves.toBe("r".repeat(32));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "copied reconciliation and lifecycle credentials",
      reconciliation: "r".repeat(32),
      lifecycle: "r".repeat(32),
      accessFile: "a".repeat(32),
      actualAccess: "a".repeat(32),
    },
    {
      name: "a decoy access file that does not match the consumed inline authority",
      reconciliation: "r".repeat(32),
      lifecycle: "l".repeat(32),
      accessFile: "d".repeat(32),
      actualAccess: "a".repeat(32),
    },
  ])("rejects $name before returning reconciliation authority", async ({ reconciliation, lifecycle, accessFile, actualAccess }) => {
    const directory = mkdtempSync(join(tmpdir(), "music-reconciliation-token-content-"));
    const reconciliationPath = join(directory, "reconciliation-token");
    const lifecyclePath = join(directory, "lifecycle-proof");
    const accessPath = join(directory, "access-token");
    try {
      for (const [path, value] of [
        [reconciliationPath, reconciliation],
        [lifecyclePath, lifecycle],
        [accessPath, accessFile],
      ] as const) {
        writeFileSync(path, value, { mode: 0o600 });
        chmodSync(path, 0o600);
      }
      await expect(readSecureMusicReconciliationAuthorities({
        reconciliationTokenFile: reconciliationPath,
        lifecycleProofTokenFile: lifecyclePath,
        accessTokenFile: accessPath,
      }, actualAccess, { mode: "live" })).rejects.toThrow(/secure|secret|authority|dedicated|match/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a counterpart token changed between descriptor read and final authority validation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "music-reconciliation-token-race-"));
    const reconciliationPath = join(directory, "reconciliation-token");
    const lifecyclePath = join(directory, "lifecycle-proof");
    const accessPath = join(directory, "access-token");
    try {
      for (const [path, value] of [
        [reconciliationPath, "r".repeat(32)],
        [lifecyclePath, "l".repeat(32)],
        [accessPath, "a".repeat(32)],
      ] as const) {
        writeFileSync(path, value, { mode: 0o600 });
        chmodSync(path, 0o600);
      }
      const fileSystem = {
        lstat: (path: string) => lstat(path, { bigint: true }),
        realpath,
        open: async (path: string, flags: number): Promise<FileHandle> => {
          const handle = await open(path, flags);
          if (path === lifecyclePath) {
            const originalRead = handle.read.bind(handle);
            handle.read = async (...args: Parameters<FileHandle["read"]>) => {
              const result = await originalRead(...args);
              writeFileSync(lifecyclePath, "x".repeat(32));
              return result;
            };
          }
          return handle;
        },
      };
      await expect(readSecureMusicReconciliationAuthorities({
        reconciliationTokenFile: reconciliationPath,
        lifecycleProofTokenFile: lifecyclePath,
        accessTokenFile: accessPath,
      }, "a".repeat(32), { mode: "live", fileSystem })).rejects.toThrow(/secure|secret|authority/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "win32")("rejects a Windows live token file writable by a non-owner principal", async () => {
    const directory = mkdtempSync(join(tmpdir(), "music-reconciliation-token-win-acl-"));
    const reconciliationPath = join(directory, "reconciliation-token");
    const lifecyclePath = join(directory, "lifecycle-proof");
    const accessPath = join(directory, "access-token");
    try {
      for (const [path, value] of [
        [reconciliationPath, "r".repeat(32)],
        [lifecyclePath, "l".repeat(32)],
        [accessPath, "a".repeat(32)],
      ] as const) writeFileSync(path, value, { mode: 0o600 });
      execFileSync("icacls.exe", [reconciliationPath, "/grant", "*S-1-1-0:(W)"], { windowsHide: true });
      await expect(readSecureMusicSecretFileWithDistinctAuthorities(
        reconciliationPath,
        [lifecyclePath, accessPath],
        { mode: "live" },
      )).rejects.toThrow(/secure|permission|secret/i);
    } finally {
      execFileSync("icacls.exe", [reconciliationPath, "/remove:g", "*S-1-1-0", "/C"], { windowsHide: true });
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resolves the pinned live transport without loading Music signing or lifecycle authorities", async () => {
    const transport = await resolveMusicIdentityTransportConfig({
      MUSIC_MODE: "live",
      STRAPI_URL: "https://strapi.example.test",
      MUSIC_STRAPI_ALLOWED_ORIGINS: "https://strapi.example.test",
      MUSIC_IDENTITY_MAX_CONCURRENCY: "2",
    }, { resolveAddresses: async () => ["93.184.216.34"] });
    expect(transport.strapiOrigin).toBe("https://strapi.example.test");
    expect(transport.pinnedAddresses).toEqual(["93.184.216.34"]);
    expect(transport.fetchImpl).toBeTypeOf("function");
  });

  it("permanently rejects production apply and invalid numeric bounds", () => {
    expect(() => parseMusicReconciliationCommandConfig({
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "production",
      MUSIC_RECONCILIATION_APPLY_ENABLED: "true",
      MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
      STRAPI_URL: "https://strapi.example.test",
      STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/strapi-reconciliation",
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle-proof",
      STRAPI_ACCESS_TOKEN_FILE: "/run/secrets/strapi-access-token",
      STRAPI_ACCESS_TOKEN: "a".repeat(32),
    })).toThrow(/production/i);
    for (const invalid of ["0", "100001", "1.2", "not-a-number"]) {
      expect(() => parseMusicReconciliationCommandConfig({ ...fixture, MUSIC_RECONCILIATION_SCAN_MAX_ROWS: invalid })).toThrow();
    }
  });

  it("fails closed across malformed command-only controls and authorities", () => {
    const invalidFixtureValues: Array<Record<string, unknown>> = [
      { ...fixture, MUSIC_MODE: "unknown" },
      { ...fixture, MUSIC_RECONCILIATION_ENVIRONMENT: "staging" },
      { ...fixture, MUSIC_RECONCILIATION_APPLY_ENABLED: "yes" },
      { ...fixture, MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT: "not-percent" },
      { ...fixture, MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT: "101" },
      { ...fixture, MUSIC_RECONCILIATION_MAX_CHANGE_PERCENT: "9".repeat(400) },
      { ...fixture, STRAPI_FIXTURE_URL: "http://127.0.0.1:51337/path" },
      { ...fixture, STRAPI_FIXTURE_URL: "http://127.0.0.1:51337/?query=1" },
      { ...fixture, STRAPI_FIXTURE_URL: "http://127.0.0.1:51337/#fragment" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "52359", STRAPI_FIXTURE_URL: "http://127.0.0.1:51337" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "80", STRAPI_FIXTURE_URL: "http://127.0.0.1:80" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "", STRAPI_FIXTURE_URL: "http://127.0.0.1:51337" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "55000", STRAPI_FIXTURE_URL: "http://127.0.0.1:55000" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "52359", STRAPI_FIXTURE_URL: "http://localhost:52359" },
      { ...fixture, MUSIC_STRAPI_HOST_PORT: "52359", STRAPI_FIXTURE_URL: "http://user@127.0.0.1:52359" },
      { ...fixture, STRAPI_RECONCILIATION_TOKEN: "wrong" },
      { ...fixture, STRAPI_RECONCILIATION_TOKEN: "" },
    ];
    for (const invalid of invalidFixtureValues) expect(() => parseMusicReconciliationCommandConfig(invalid)).toThrow();

    const live = {
      MUSIC_MODE: "live",
      MUSIC_RECONCILIATION_ENVIRONMENT: "staging",
      MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED: "true",
      STRAPI_URL: "https://strapi.example.test",
      STRAPI_RECONCILIATION_TOKEN_FILE: "/run/secrets/strapi-reconciliation",
      STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/secrets/strapi-lifecycle-proof",
      STRAPI_ACCESS_TOKEN_FILE: "/run/secrets/strapi-access-token",
      STRAPI_ACCESS_TOKEN: "a".repeat(32),
    };
    for (const invalid of [
      { ...live, MUSIC_RECONCILIATION_ENVIRONMENT: "" },
      { ...live, STRAPI_URL: "https://user@strapi.example.test" },
      { ...live, STRAPI_URL: "https://user:password@strapi.example.test" },
      { ...live, STRAPI_RECONCILIATION_TOKEN_FILE: " ".repeat(2) },
      { ...live, STRAPI_RECONCILIATION_TOKEN_FILE: "x".repeat(4_097) },
    ]) expect(() => parseMusicReconciliationCommandConfig(invalid)).toThrow();
    expect(parseMusicReconciliationCommandConfig(live)).toMatchObject({ environment: "staging" });
  });
});
