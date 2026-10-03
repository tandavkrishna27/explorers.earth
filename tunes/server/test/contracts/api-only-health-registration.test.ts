import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ pool: {} }));
vi.mock("../../services/musicTokenService", () => ({
  MusicTokenService: class {
    constructor() { throw new Error("stop after health registration"); }
  },
}));

import { registerRoutes } from "../../routes/index";

const config = {
  mode: "live",
  strapiOrigin: "https://cms.example.com",
  fetchImpl: fetch,
  maxConcurrency: 1,
  maxPending: 1,
  retries: 0,
  connectTimeoutMs: 1000,
  readTimeoutMs: 1000,
  overallTimeoutMs: 1000,
  cacheTtlMs: 1000,
  circuitFailureThreshold: 1,
  circuitOpenMs: 1000,
  maxInflight: 1,
} as never;

const previous = {
  MUSIC_DEPLOYMENT_HEALTH_ENABLED: process.env.MUSIC_DEPLOYMENT_HEALTH_ENABLED,
  MUSIC_MODE: process.env.MUSIC_MODE,
};
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("actual route graph health registration", () => {
  it.each(["true", "false"])("mounts production liveness only when MUSIC_DEPLOYMENT_HEALTH_ENABLED is %s", async (enabled) => {
    process.env.MUSIC_DEPLOYMENT_HEALTH_ENABLED = enabled;
    process.env.MUSIC_MODE = "live";
    const app = express();
    await expect(registerRoutes(app, {} as never, config, { proveAbsence: async () => ({}) as never }))
      .rejects.toThrow("stop after health registration");
    const server = createServer(app);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing TCP listener");
      const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
      expect(response.status).toBe(enabled === "true" ? 200 : 404);
      if (enabled === "true") expect(await response.json()).toEqual({ live: true });
    } finally {
      await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    }
  });
});
