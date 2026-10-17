import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setupMusicHealthRoutes } from "../../deployment/music-health";
import { startMusicServer } from "../../config/music-startup";

const owned = vi.hoisted(() => ({
  registerRoutes: vi.fn(),
  closeSession: vi.fn(),
  closePool: vi.fn(),
  stopRoutes: vi.fn(),
}));

vi.mock("../../routes/index", () => ({ registerRoutes: owned.registerRoutes }));
vi.mock("../../storage", () => ({ storage: { sessionStore: { close: owned.closeSession } } }));
vi.mock("../../db", () => ({ pool: { end: owned.closePool } }));
vi.mock("../../security-containment", () => ({
  assertContainmentStartup: () => undefined,
  containmentErrorHandler: () => undefined,
  installSafeConsole: () => undefined,
  requestIdFor: () => "test-request",
}));
vi.mock("../../routes/musicIdentityRoutes", () => ({ setupMusicIdentityBodylessPreflight: () => undefined }));

import { createApp } from "../../app";

const config = {
  mode: "fixture",
  strapiOrigin: "http://127.0.0.1:1337",
  fetchImpl: fetch,
  overallTimeoutMs: 1000,
  isTrustedProxy: () => false,
} as never;

beforeEach(() => {
  owned.registerRoutes.mockReset();
  owned.closeSession.mockReset().mockResolvedValue(undefined);
  owned.closePool.mockReset().mockResolvedValue(undefined);
  owned.stopRoutes.mockReset().mockResolvedValue(undefined);
});

const tunesRoot = resolve(import.meta.dirname, "../../..");
const fixtureEnvironment = Object.fromEntries(readFileSync(resolve(tunesRoot, "../.env.music.test.example"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

function startupDependencies() {
  return {
    apiOnly: true,
    resolveIdentityConfig: async () => config,
    resolveDatabaseConnection: async () => ({ connectionString: "postgresql://fixture/fixture" }) as never,
    verifyDatabaseConnection: async () => undefined,
    ensureAnalyticsSchema: async () => undefined,
    host: "127.0.0.1",
    port: 0,
  };
}

describe("real API-only app composition", () => {
  it.each(["production", "development"])("uses real API middleware, health handlers and owned shutdown in %s", async (nodeEnv) => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      MUSIC_DEPLOYMENT_HEALTH_ENABLED: process.env.MUSIC_DEPLOYMENT_HEALTH_ENABLED,
    };
    const previousDirectory = process.cwd();
    const directory = mkdtempSync(resolve(tmpdir(), "api-only-source-sentinel-"));
    writeFileSync(resolve(directory, "package.json"), '{"private":"source sentinel"}');
    writeFileSync(resolve(directory, "vite.config.ts"), "source sentinel");
    process.chdir(directory);
    process.env.NODE_ENV = nodeEnv;
    process.env.MUSIC_DEPLOYMENT_HEALTH_ENABLED = "true";
    owned.registerRoutes.mockImplementation(async (app) => {
      setupMusicHealthRoutes(app, { pool: { query: async () => ({ rows: [] }) } as never });
      return { server: createServer(app), shutdown: owned.stopRoutes };
    });
    try {
      const started = await startMusicServer({ ...fixtureEnvironment }, startupDependencies());
      try {
        const address = started.server.address();
        if (!address || typeof address === "string") throw new Error("missing TCP listener");
        const base = `http://127.0.0.1:${address.port}`;
        const health = await fetch(`${base}/health/live`);
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ live: true });
        for (const path of ["/api/absent", "/package.json", "/vite.config.ts"]) {
          const response = await fetch(`${base}${path}`);
          expect(response.status, path).toBe(404);
          expect(response.headers.get("content-type"), path).toMatch(/application\/json/);
          expect(await response.json(), path).toMatchObject({ error: { code: "NOT_FOUND" } });
        }
      } finally {
        await started.shutdown();
      }
      expect(started.server.listening).toBe(false);
      expect(owned.stopRoutes).toHaveBeenCalledTimes(1);
      expect(owned.closeSession).toHaveBeenCalledTimes(1);
      expect(owned.closePool).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(previousDirectory);
      rmSync(directory, { recursive: true, force: true });
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("closes the session store and pool when route registration fails before listener creation", async () => {
    const cause = new Error("injected route registration failure");
    owned.registerRoutes.mockRejectedValue(cause);

    await expect(createApp(config, undefined, true)).rejects.toBe(cause);
    expect(owned.closeSession).toHaveBeenCalledTimes(1);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });

  it("preserves the registration error even when both owned cleanup actions fail", async () => {
    const cause = new Error("injected route registration failure");
    owned.registerRoutes.mockRejectedValue(cause);
    owned.closeSession.mockRejectedValue(new Error("private session cleanup failure"));
    owned.closePool.mockRejectedValue(new Error("private pool cleanup failure"));

    await expect(createApp(config, undefined, true)).rejects.toBe(cause);
    expect(owned.closeSession).toHaveBeenCalledTimes(1);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });
});
