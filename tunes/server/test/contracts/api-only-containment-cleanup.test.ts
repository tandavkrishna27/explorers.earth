import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const owned = vi.hoisted(() => ({ closeSession: vi.fn(), closePool: vi.fn(), registerRoutes: vi.fn() }));
vi.mock("../../storage", () => ({ storage: { sessionStore: { close: owned.closeSession } } }));
vi.mock("../../db", () => ({ pool: { end: owned.closePool } }));
vi.mock("../../routes/index", () => ({ registerRoutes: owned.registerRoutes }));
vi.mock("../../routes/musicIdentityRoutes", () => ({ setupMusicIdentityBodylessPreflight: () => undefined }));

import { createApp } from "../../app";

const config = {
  mode: "live",
  strapiOrigin: "https://cms.example.com",
  fetchImpl: fetch,
  overallTimeoutMs: 1000,
  isTrustedProxy: () => false,
} as never;
const variableNames = ["NODE_ENV", "DATABASE_URL", "SESSION_SECRET", "COOKIE_SECRET", "STRAPI_JWT_SECRET", "ALLOWED_ORIGINS"] as const;
const previous = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));

beforeEach(() => {
  owned.closeSession.mockReset().mockResolvedValue(undefined);
  owned.closePool.mockReset().mockResolvedValue(undefined);
  owned.registerRoutes.mockReset();
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://fixture:fixture@db.example.com/music";
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.COOKIE_SECRET = "c".repeat(32);
  process.env.STRAPI_JWT_SECRET = "j".repeat(32);
  delete process.env.ALLOWED_ORIGINS;
});

afterEach(() => {
  for (const name of variableNames) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("API-only pre-registration ownership", () => {
  it("closes both resources for a real production containment rejection", async () => {
    await expect(createApp(config, undefined, true)).rejects.toThrow("ALLOWED_ORIGINS is a mandatory production credential");
    expect(owned.registerRoutes).not.toHaveBeenCalled();
    expect(owned.closeSession).toHaveBeenCalledTimes(1);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });

  it("preserves the containment error when both cleanup actions reject", async () => {
    owned.closeSession.mockRejectedValue(new Error("session cleanup failed"));
    owned.closePool.mockRejectedValue(new Error("pool cleanup failed"));
    await expect(createApp(config, undefined, true)).rejects.toThrow("ALLOWED_ORIGINS is a mandatory production credential");
    expect(owned.registerRoutes).not.toHaveBeenCalled();
    expect(owned.closeSession).toHaveBeenCalledTimes(1);
    expect(owned.closePool).toHaveBeenCalledTimes(1);
  });
});
