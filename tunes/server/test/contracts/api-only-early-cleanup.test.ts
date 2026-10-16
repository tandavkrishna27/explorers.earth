import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const owned = vi.hoisted(() => ({ closePool: vi.fn(), verifyAnalytics: vi.fn() }));
vi.mock("../../db", () => ({ pool: { end: owned.closePool } }));
vi.mock("../../startup/explorers-analytics-migration", () => ({
  EXPLORERS_ANALYTICS_SCHEMA_MARKER: "explorers-analytics-receipts-v1",
  verifyExplorersAnalyticsSchema: owned.verifyAnalytics,
}));

import { startMusicServer } from "../../config/music-startup";

const tunesRoot = resolve(import.meta.dirname, "../../..");
const fixtureEnvironment = Object.fromEntries(readFileSync(resolve(tunesRoot, "../.env.music.test.example"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

const dependencies = {
  apiOnly: true,
  resolveIdentityConfig: async () => ({ mode: "fixture" }) as never,
  resolveDatabaseConnection: async () => ({ connectionString: "postgresql://fixture/fixture" }) as never,
  verifyDatabaseConnection: async () => undefined,
};

beforeEach(() => {
  owned.closePool.mockReset().mockResolvedValue(undefined);
  owned.verifyAnalytics.mockReset().mockResolvedValue(undefined);
});

describe("API-only startup before app ownership", () => {
  it("closes the acquired pool if analytics verification rejects", async () => {
    const cause = new Error("analytics verification failed");
    owned.verifyAnalytics.mockRejectedValue(cause);
    await expect(startMusicServer({ ...fixtureEnvironment }, dependencies)).rejects.toBe(cause);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });

  it("closes the acquired pool if loading runtime rejects and preserves that cause", async () => {
    const cause = new Error("runtime import failed");
    owned.closePool.mockRejectedValue(new Error("pool close failed"));
    await expect(startMusicServer({ ...fixtureEnvironment }, {
      ...dependencies,
      loadRuntime: async () => { throw cause; },
    })).rejects.toBe(cause);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });
});
