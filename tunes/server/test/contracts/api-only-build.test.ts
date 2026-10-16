import express from "express";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { startMusicServer, type MusicServerRuntime } from "../../config/music-startup";

const tunesRoot = resolve(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml") as { load(source: string): any };
const fixtureEnvironment = Object.fromEntries(readFileSync(resolve(tunesRoot, "../.env.music.test.example"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

function runtime(events: string[]): MusicServerRuntime {
  return {
    createApp: async (_config, _profile, apiOnly) => {
      expect(apiOnly).toBe(true);
      const app = express();
      app.get("/health/live", (_request, response) => response.json({ status: "ok" }));
      const server = createServer(app);
      return {
        app,
        server,
        shutdown: async () => {
          events.push("owned shutdown");
          if (server.listening) await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
        },
      };
    },
    setupVite: async () => { throw new Error("Vite was imported"); },
    serveStatic: () => { throw new Error("client assets were served"); },
  };
}

describe("API-only build and startup", () => {
  it("enables the production health path in the disposable API fixture", () => {
    const compose = parseYaml(readFileSync(resolve(tunesRoot, "../docker-compose.replatform.yml"), "utf8"));
    expect(compose.services.tunes.environment.MUSIC_DEPLOYMENT_HEALTH_ENABLED).toBe("true");
  });

  it("releases owned resources when startup rejects its listener configuration", async () => {
    const events: string[] = [];
    await expect(startMusicServer({ ...fixtureEnvironment, PORT: "invalid" }, {
      apiOnly: true,
      resolveIdentityConfig: async () => ({ mode: "fixture" }) as never,
      resolveDatabaseConnection: async () => ({ connectionString: "postgresql://fixture/fixture" }) as never,
      verifyDatabaseConnection: async () => undefined,
      ensureAnalyticsSchema: async () => undefined,
      loadRuntime: async () => runtime(events),
    })).rejects.toThrow(/PORT must be/);
    expect(events).toEqual(["owned shutdown"]);
  });

  it.each(["production", "development"])("serves JSON API responses and closes owned resources in %s without client assets", async (nodeEnv) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    const events: string[] = [];
    try {
      const started = await startMusicServer({ ...fixtureEnvironment, PORT: "0" }, {
        apiOnly: true,
        resolveIdentityConfig: async () => ({ mode: "fixture" }) as never,
        resolveDatabaseConnection: async () => ({ connectionString: "postgresql://fixture/fixture" }) as never,
        verifyDatabaseConnection: async () => undefined,
        ensureAnalyticsSchema: async () => undefined,
        loadRuntime: async () => runtime(events),
        host: "127.0.0.1",
        port: 0,
      });
      try {
        const address = started.server.address();
        if (!address || typeof address === "string") throw new Error("missing TCP listener");
        const base = `http://127.0.0.1:${address.port}`;
        const health = await fetch(`${base}/health/live`);
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ status: "ok" });
        for (const path of ["/api/absent", "/package.json", "/server/index.ts", "/vite.config.ts"]) {
          const response = await fetch(`${base}${path}`);
          expect(response.status, path).toBe(404);
          expect(response.headers.get("content-type"), path).toMatch(/application\/json/);
          expect(await response.json(), path).toMatchObject({ error: { code: "NOT_FOUND" } });
        }
      } finally {
        await started.shutdown();
      }
      expect(started.server.listening).toBe(false);
      expect(events).toEqual(["owned shutdown"]);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("keeps Vite and client source out of the API bundle graph while retaining deployment gates", async () => {
    const packageJson = JSON.parse(readFileSync(resolve(tunesRoot, "package.json"), "utf8"));
    const rootPackage = JSON.parse(readFileSync(resolve(tunesRoot, "../package.json"), "utf8"));
    expect(rootPackage.scripts["build:api"]).toBe("npm run build:api --prefix tunes");
    expect(packageJson.scripts["build:api"]).toContain("server/api.ts");
    expect(packageJson.scripts["build:api"]).toContain("clean-api-dist.mjs");
    expect(packageJson.scripts["build:api"]).toContain("run-migration-gate.ts");
    expect(packageJson.scripts["build:api"]).toContain("run-registration-compat.ts");
    expect(packageJson.scripts["build:api"]).toContain("run-production-graph-smoke.ts");
    const result = await build({
      absWorkingDir: tunesRoot,
      entryPoints: ["server/api.ts"],
      platform: "node",
      packages: "external",
      bundle: true,
      splitting: true,
      format: "esm",
      outdir: "dist/server",
      write: false,
      metafile: true,
    });
    for (const file of ['shared/explorersGameContract.ts','shared/explorersGameOwnerContract.ts']) expect(Object.keys(result.metafile.inputs)).toContain(file);
    expect(Object.keys(result.metafile.inputs).filter((path) => /(^|\/)client\/|(^|\/)vite\.config\.ts$|(^|\/)server\/vite\.ts$/.test(path))).toEqual([]);
  });
});
