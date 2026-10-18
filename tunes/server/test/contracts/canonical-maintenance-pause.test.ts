import { describe, expect, it, vi } from "vitest";

// Only the readiness precondition and the two loops are faked: readiness so
// execution reaches listen() without a migrated PostgreSQL (the same reasoning as
// canonical-startup-listener.test.ts), and the loops so the test can count whether
// they started. The admission decision and its wiring are exercised for real.
const calls = vi.hoisted(() => ({ lifecycle: 0, analytics: 0 }));
vi.mock("../../db/readiness", () => ({
  checkMusicDatabaseReadiness: async () => ({ ready: true, currentId: "fixture", currentChecksum: "fixture" }),
}));
vi.mock("../../application/accountLifecycleMaintenance", () => ({
  runAccountLifecycleMaintenance: async () => { calls.lifecycle += 1; },
}));
vi.mock("../../application/analyticsMaintenance", () => ({
  startAnalyticsMaintenance: () => { calls.analytics += 1; return async () => undefined; },
}));

const { resolveMaintenanceAdmission, startCanonicalServer } = await import("../../auth/canonicalStartup");

function environment(extra: Record<string, string> = {}) {
  return {
    EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
    EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
    GOOGLE_CLIENT_ID: "fixture-google-id",
    GOOGLE_CLIENT_SECRET: "fixture-google-secret",
    ...extra,
  };
}

function stubPool() {
  const answer = async () => ({ rows: [], rowCount: 0 });
  return { query: answer, connect: async () => ({ query: answer, release: () => undefined }), end: async () => undefined };
}

describe("canonical maintenance admission", () => {
  it("runs maintenance by default", () => {
    expect(resolveMaintenanceAdmission({})).toEqual({ paused: false });
  });

  it("pauses only on the exact acknowledgement token", () => {
    expect(resolveMaintenanceAdmission({ EXPLORERS_MAINTENANCE_PAUSED: "RESTORE_IN_PROGRESS" }))
      .toEqual({ paused: true });
  });

  it.each(["1", "true", "yes", "", "restore_in_progress"])("refuses to pause on %j", (value) => {
    expect(() => resolveMaintenanceAdmission({ EXPLORERS_MAINTENANCE_PAUSED: value }))
      .toThrow(/EXPLORERS_MAINTENANCE_PAUSED/);
  });
});

describe("canonical startup honours the pause", () => {
  it("starts neither loop while paused", async () => {
    calls.lifecycle = 0; calls.analytics = 0;
    const server = await startCanonicalServer(environment({ EXPLORERS_MAINTENANCE_PAUSED: "RESTORE_IN_PROGRESS" }),
      { pool: stubPool() as never, host: "127.0.0.1", port: 0 });
    try { expect(calls).toEqual({ lifecycle: 0, analytics: 0 }); }
    finally { await server.shutdown(); }
  });

  it("starts both loops by default", async () => {
    calls.lifecycle = 0; calls.analytics = 0;
    const server = await startCanonicalServer(environment(), { pool: stubPool() as never, host: "127.0.0.1", port: 0 });
    try { expect(calls).toEqual({ lifecycle: 1, analytics: 1 }); }
    finally { await server.shutdown(); }
  });

  it("refuses to start on a malformed pause value before it listens", async () => {
    await expect(startCanonicalServer(environment({ EXPLORERS_MAINTENANCE_PAUSED: "1" }),
      { pool: stubPool() as never, host: "127.0.0.1", port: 0 })).rejects.toThrow(/EXPLORERS_MAINTENANCE_PAUSED/);
  });
});
