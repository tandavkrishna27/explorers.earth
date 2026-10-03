import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync as nodeMkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  fixtureUsesAttestedAnalyticsSchema,
  startMusicServer,
  type MusicServerRuntime,
} from "../config/music-startup";
import type { MusicDatabaseConnection } from "../config/music-database-config";
import type { MusicIdentityRuntimeConfig } from "../config/music-identity-config";
import { semanticWindowsSecurityInspection } from "./helpers/semantic-windows-security";
import { productionEnvironmentFixture } from "./fixtures/music-production-environment";

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

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const signingRoot = mkdtempSync(resolve(tmpdir(), "music-startup-key-"));
const signingPath = resolve(signingRoot, "current");

describe("fixture analytics schema authority", () => {
  it("requires the exact fixture lane and admin-applied schema marker", () => {
    expect(() => fixtureUsesAttestedAnalyticsSchema({
      MUSIC_MODE: "live",
      MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL: "true",
      MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER: "explorers-analytics-receipts-v1",
    })).toThrow(/live runtime cannot bypass/);
    expect(() => fixtureUsesAttestedAnalyticsSchema({
      MUSIC_MODE: "fixture",
      MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL: "true",
    })).toThrow(/marker is missing or mismatched/);
    expect(fixtureUsesAttestedAnalyticsSchema({
      MUSIC_MODE: "fixture",
      MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL: "true",
      MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER: "explorers-analytics-receipts-v1",
    })).toBe(true);
  });
});
const runtimeDatabasePasswordPath = resolve(signingRoot, "database-runtime");
const lifecycleProofPath = resolve(signingRoot, "lifecycle-proof");
const publicationResponsePath = resolve(signingRoot, "publication-response");
const publicIdHmacPath = resolve(signingRoot, "public-id-hmac");
writeFileSync(signingPath, Buffer.alloc(32, 0x61).toString("base64url"), { mode: 0o600 });
writeFileSync(runtimeDatabasePasswordPath, Buffer.alloc(32, 0x62).toString("base64url"), { mode: 0o600 });
writeFileSync(lifecycleProofPath, "dedicated-read-only-lifecycle-proof-token", { mode: 0o600 });
writeFileSync(publicationResponsePath, Buffer.alloc(32, 0x63).toString("base64url"), { mode: 0o600 });
writeFileSync(publicIdHmacPath, Buffer.alloc(32, 0x64).toString("base64url"), { mode: 0o600 });
chmodSync(signingPath, 0o600);
chmodSync(runtimeDatabasePasswordPath, 0o600);
chmodSync(lifecycleProofPath, 0o600);
chmodSync(publicationResponsePath, 0o600);
chmodSync(publicIdHmacPath, 0o600);
afterAll(() => rmSync(signingRoot, { recursive: true, force: true }));

function withSigningFile(environment: Readonly<Record<string, string>>): Record<string, string> {
  const fixture = environment.MUSIC_MODE === "fixture";
  return {
    ...environment,
    MUSIC_TOKEN_CURRENT_SECRET: "",
    MUSIC_TOKEN_CURRENT_SECRET_FILE: signingPath,
    DATABASE_URL: "",
    MUSIC_DATABASE_HOST: fixture ? "postgres" : "db",
    MUSIC_DATABASE_PORT: "5432",
    MUSIC_DATABASE_NAME: fixture ? "music_fixture" : "music",
    MUSIC_DATABASE_USER: "music_runtime_login",
    MUSIC_DATABASE_MIGRATOR_USER: "music_migrator",
    MUSIC_DATABASE_PASSWORD_FILE: runtimeDatabasePasswordPath,
    STRAPI_LIFECYCLE_PROOF_TOKEN: fixture ? "fixture-read-only-token" : "",
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: fixture ? "" : lifecycleProofPath,
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: fixture
      ? "fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI"
      : "",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: fixture ? "" : publicationResponsePath,
    MUSIC_PUBLIC_ID_HMAC_KEY: fixture ? "VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ" : "",
    MUSIC_PUBLIC_ID_HMAC_KEY_FILE: fixture ? "" : publicIdHmacPath,
  };
}

function parseEnvironmentFile(path: string): Record<string, string> {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

function controlledIdentityConfig(): MusicIdentityRuntimeConfig {
  return {
    mode: "live",
    strapiOrigin: "https://cms.example.com",
    trustedProxyHops: 1,
    trustedProxyAddress: "172.31.250.2",
    isTrustedProxy: () => true,
    pinnedAddresses: ["8.8.8.8"],
    lookup: vi.fn(),
    fetchImpl: fetch,
    maxConcurrency: 1,
    maxPending: 1,
    maxInflight: 1,
    retries: 0,
    connectTimeoutMs: 100,
    readTimeoutMs: 100,
    overallTimeoutMs: 100,
    cacheTtlMs: 0,
    circuitFailureThreshold: 1,
    circuitOpenMs: 100,
    rateLimitPerMinute: 1,
    globalRateLimitPerMinute: 1,
    rateMaxEntries: 2,
    musicToken: {
      current: { kid: "controlled-current", secret: Buffer.alloc(32, 0x71).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 0,
    },
    lifecycleProofToken: "controlled-lifecycle-proof",
    publicationResponse: {
      current: { kid: "controlled-publication", key: Buffer.alloc(32, 0x72) },
      retentionSeconds: 86_400,
    },
    publicIdHmacKey: Buffer.alloc(32, 0x73),
  };
}

function controlledRuntime(events: string[]): MusicServerRuntime {
  const server = {
    once: () => server,
    off: () => server,
    listen: (_port: number, _host: string, callback: () => void) => {
      events.push("listen");
      callback();
      return server;
    },
  };
  return {
    createApp: async () => {
      events.push("create-app");
      return { app: { get: () => "production" }, server };
    },
    setupVite: async () => { events.push("vite"); },
    serveStatic: () => { events.push("static"); },
  } as unknown as MusicServerRuntime;
}

describe("discriminated Music startup bootstrap", () => {
  it("uses an injected runtime database resolver after validating the fixture contract", async () => {
    const environment = withSigningFile(parseEnvironmentFile(resolve(repositoryRoot, ".env.music.test.example")));
    const database: MusicDatabaseConnection = {
      connectionString: "postgresql://music_runtime_login:test@127.0.0.1:55432/music_fixture",
      database: "music_fixture",
      host: "127.0.0.1",
      password: "test",
      port: 55432,
      user: "music_runtime_login",
    };
    const resolveDatabaseConnection = vi.fn(async () => database);

    await startMusicServer(environment, {
      resolveDatabaseConnection,
      verifyDatabaseConnection: async () => undefined,
      ensureAnalyticsSchema: async () => undefined,
      loadRuntime: async () => controlledRuntime([]),
    });

    expect(resolveDatabaseConnection).toHaveBeenCalledTimes(1);
    expect(environment.DATABASE_URL).toBe(database.connectionString);
  });

  it("validates the literal production environment fixture exactly once before application import and listen", async () => {
    const environment = withSigningFile(productionEnvironmentFixture());
    expect(environment.MUSIC_MIGRATION_MARKER).toBe("0037_explorers_movies_provider_context");
    for (const fixtureOnly of [
      "MUSIC_FIXTURE_VERSION", "STRAPI_FIXTURE_URL", "DATABASE_URL_TEST",
      "MUSIC_SIGNING_KEY_CURRENT_ID", "MUSIC_SIGNING_KEY_CURRENT_SECRET",
      "MUSIC_SIGNING_KEY_PREVIOUS_ID", "MUSIC_SIGNING_KEY_PREVIOUS_SECRET",
      "MUSIC_PROVISIONING_KILL_SWITCH", "MUSIC_PROVISIONING_COHORT",
      "MUSIC_RECONCILIATION_ENABLED", "MUSIC_RECONCILIATION_MAX_ROWS",
    ]) expect(environment).not.toHaveProperty(fixtureOnly);

    const events: string[] = [];
    const resolver = vi.fn(async () => {
      events.push("resolve-dns");
      return ["8.8.8.8", "2606:4700:4700::1111"];
    });
    const loadRuntime = vi.fn(async () => {
      expect(environment.DATABASE_URL).toMatch(/^postgresql:\/\/music_runtime_login:[A-Za-z0-9_-]+@db:5432\/music$/);
      events.push("load-routes");
      return controlledRuntime(events);
    });
    await startMusicServer(environment, {
      resolveAddresses: resolver,
      verifyDatabaseConnection: async () => { events.push("verify-runtime-db"); },
      ensureAnalyticsSchema: async () => { events.push("ensure-analytics-schema"); },
      loadRuntime,
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["resolve-dns", "verify-runtime-db", "ensure-analytics-schema", "load-routes", "create-app", "static", "listen"]);
  }, 20_000);

  it("rejects a wrong runtime database credential before importing routes or binding", async () => {
    const resolveIdentityConfig = vi.fn(async () => controlledIdentityConfig());
    const database: MusicDatabaseConnection = {
      connectionString: "postgresql://music_runtime_login:controlled@db:5432/music",
      database: "music",
      host: "db",
      password: "controlled",
      port: 5432,
      user: "music_runtime_login",
    };
    const resolveDatabaseConnection = vi.fn(async () => database);
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    const verifyDatabaseConnection = vi.fn(async () => { throw new Error("runtime database authentication failed"); });
    await expect(startMusicServer(withSigningFile(productionEnvironmentFixture()), {
      resolveIdentityConfig,
      resolveDatabaseConnection,
      verifyDatabaseConnection,
      loadRuntime,
    })).rejects.toThrow(/database authentication/i);
    expect(resolveIdentityConfig).toHaveBeenCalledTimes(1);
    expect(resolveDatabaseConnection).toHaveBeenCalledTimes(1);
    expect(verifyDatabaseConnection).toHaveBeenCalledTimes(1);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["missing runtime user", { MUSIC_DATABASE_USER: "" }, /MUSIC_DATABASE_USER is required/],
    ["missing runtime secret", { MUSIC_DATABASE_PASSWORD_FILE: "" }, /MUSIC_DATABASE_PASSWORD_FILE is required/],
    ["owner/migrator runtime user", { MUSIC_DATABASE_USER: "music_migrator" }, /runtime database role must be distinct/],
  ] as const)("rejects %s before importing routes or binding", async (_label, override, expectedError) => {
    const resolveIdentityConfig = vi.fn(async () => controlledIdentityConfig());
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    await expect(startMusicServer({ ...withSigningFile(productionEnvironmentFixture()), ...override }, {
      resolveIdentityConfig,
      loadRuntime,
    })).rejects.toThrow(expectedError);
    expect(resolveIdentityConfig).toHaveBeenCalledTimes(1);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP URL", { STRAPI_URL: "http://cms.example.com" }, ["8.8.8.8"], true],
    ["wrong proxy policy", { TRUST_PROXY_HOPS: "2" }, ["8.8.8.8"], false],
    ["invalid numeric bound", { MUSIC_IDENTITY_MAX_PENDING: "Infinity" }, ["8.8.8.8"], false],
    ["private DNS", {}, ["127.0.0.1"], true],
  ] as const)("rejects invalid live %s before importing or binding", async (_label, override, answers, reachesSecureReads) => {
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    const resolveAddresses = vi.fn(async () => answers);
    const failure = startMusicServer({ ...withSigningFile(productionEnvironmentFixture()), ...override }, {
      resolveAddresses,
      ...(reachesSecureReads ? { windowsSecurityInspection: semanticWindowsSecurityInspection } : {}),
      loadRuntime,
    });
    if (_label === "private DNS") {
      await expect(failure).rejects.toThrow(/public addresses/i);
      expect(resolveAddresses).toHaveBeenCalledTimes(1);
    } else {
      await expect(failure).rejects.toThrow();
    }
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("retains the exact C0 fixture contract before importing the application", async () => {
    const fixture = withSigningFile(parseEnvironmentFile(resolve(repositoryRoot, ".env.music.test.example")));
    const events: string[] = [];
    await startMusicServer(fixture, {
      resolveAddresses: async () => { throw new Error("fixture startup must not resolve DNS"); },
      verifyDatabaseConnection: async () => undefined,
      ensureAnalyticsSchema: async () => undefined,
      loadRuntime: async () => {
        events.push("load-routes");
        return controlledRuntime(events);
      },
    });
    expect(events).toEqual(["load-routes", "create-app", "static", "listen"]);

    const loadInvalid = vi.fn(async () => controlledRuntime([]));
    const { MUSIC_FIXTURE_VERSION: _removed, ...invalid } = fixture;
    await expect(startMusicServer(invalid, {
      loadRuntime: loadInvalid,
    })).rejects.toThrow(/MUSIC_FIXTURE_VERSION/);
    expect(loadInvalid).not.toHaveBeenCalled();
  });

  it("rejects a missing public-ID HMAC authority before route import or listener bind", async () => {
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    await expect(startMusicServer({
      ...withSigningFile(productionEnvironmentFixture()),
      MUSIC_PUBLIC_ID_HMAC_KEY_FILE: "",
    }, {
      resolveAddresses: async () => ["8.8.8.8"],
      windowsSecurityInspection: semanticWindowsSecurityInspection,
      loadRuntime,
    })).rejects.toThrow(/MUSIC_PUBLIC_ID_HMAC_KEY_FILE is required/i);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("rejects an insecure live key file before route import or listener bind", async () => {
    const insecurePath = resolve(signingRoot, "startup-world-readable-sentinel");
    writeFileSync(insecurePath, Buffer.alloc(32, 0x66).toString("base64url"), { mode: 0o644 });
    chmodSync(insecurePath, 0o644);
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    const failure = startMusicServer({
      ...withSigningFile(productionEnvironmentFixture()),
      MUSIC_TOKEN_CURRENT_SECRET_FILE: insecurePath,
    }, { resolveAddresses: async () => ["8.8.8.8"], platform: "linux", effectiveUserId: 0, loadRuntime });
    await expect(failure).rejects.toThrow(/secret|secure|permission/i);
    await expect(failure).rejects.not.toThrow(/world-readable-sentinel/);
    expect(loadRuntime).not.toHaveBeenCalled();
  });
});
