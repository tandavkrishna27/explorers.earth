import { describe, expect, it, vi } from "vitest";

// Same precondition fake as canonical-startup-listener.test.ts: readiness needs a migrated
// PostgreSQL, and this file is about what the started server schedules, not readiness.
vi.mock("../../db/readiness", () => ({
  checkMusicDatabaseReadiness: async () => ({ ready: true, currentId: "fixture", currentChecksum: "fixture" }),
}));

const { startCanonicalServer } = await import("../../auth/canonicalStartup");

function recordingPool() {
  const statements: string[] = [];
  const answer = async (sql: unknown) => { statements.push(String(sql)); return { rows: [], rowCount: 0 }; };
  return { statements, pool: { query: answer, connect: async () => ({ query: answer, release: () => undefined }), end: async () => undefined } };
}

describe("canonical startup media cleanup", () => {
  it("runs the media cleanup sweep on the maintenance tick", async () => {
    // Break caught: retryPendingDeletes only ever ran inside an upload or a movie import,
    // so an account that never uploaded again kept its pending_delete rows - and the
    // storage objects behind them - forever. The 60s maintenance tick never called it.
    const { statements, pool } = recordingPool();
    const started = await startCanonicalServer({
      EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
      EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
      GOOGLE_CLIENT_ID: "fixture-google-id",
      GOOGLE_CLIENT_SECRET: "fixture-google-secret",
    }, { pool: pool as never, host: "127.0.0.1", port: 0 });
    try {
      await vi.waitFor(() => {
        expect(statements.some((sql) => sql.includes("m.status='pending_delete' OR"))).toBe(true);
      });
    } finally {
      await started.shutdown();
    }
  });
});
