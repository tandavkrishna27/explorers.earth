import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { ObjectStorage } from "../services/objectStorage";
import { ACCOUNT_DELETION_GRACE_DAYS, deletionGraceElapsedSql, scheduledDeletionAtSql } from "../application/accountDeletionGrace";
import { runAccountLifecycleMaintenance } from "../application/accountLifecycleMaintenance";
import { classifyLifecycleObservation, lifecycleObservationSchema } from "../../shared/explorersLifecycleObservation";

describe("account deletion grace period", () => {
  it("is thirty days, defined once", () => {
    expect(ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
    expect(deletionGraceElapsedSql("x")).toBe("x.deletion_requested_at<=clock_timestamp()-interval '30 days'");
    expect(scheduledDeletionAtSql("x")).toBe("x.deletion_requested_at+interval '30 days'");
  });

  it("makes every maintenance query that selects due deletions wait for the grace period", async () => {
    const statements: string[] = [];
    const pool = { query: async (sql: string) => { statements.push(sql); return { rows: [], rowCount: 0 }; },
      connect: async () => { throw new Error("nothing is due, so no connection is needed"); } } as unknown as Pool;
    const storage: ObjectStorage = { environment: "local", put: async () => undefined, get: async () => Buffer.alloc(0), delete: async () => undefined };
    await runAccountLifecycleMaintenance(pool, storage);
    const selecting = statements.filter((sql) => sql.includes("pending_deletion"));
    // Venue release, Music boundary marking and the claim of due deletions.
    expect(selecting).toHaveLength(3);
    for (const sql of selecting) {
      expect(sql).toContain("a.deletion_requested_at<=clock_timestamp()-interval '30 days'");
      // Never the old rule that finalised within one maintenance tick.
      expect(sql).not.toMatch(/deletion_requested_at<=clock_timestamp\(\)(?!-)/);
    }
  });

  it("reports the scheduled date only for a pending deletion", () => {
    const base = { accountId: "00000000-0000-4000-8000-000000000001", revision: 3,
      scheduledDeletionAt: "2026-11-18T10:00:00.000Z",
      operation: { id: "00000000-0000-4000-8000-000000000002", kind: "delete", state: "pending", failureCode: null } };
    const pending = classifyLifecycleObservation({ ...base, status: "pending_deletion" });
    expect(pending).toMatchObject({ outcome: "pending", scheduledDeletionAt: "2026-11-18T10:00:00.000Z" });
    expect(lifecycleObservationSchema.safeParse(pending).success).toBe(true);
    const suspended = classifyLifecycleObservation({ ...base, status: "suspended" });
    expect(suspended).toMatchObject({ outcome: "pending", scheduledDeletionAt: null });
    expect(classifyLifecycleObservation({ ...base, status: "active" })).not.toHaveProperty("scheduledDeletionAt");
  });
});
