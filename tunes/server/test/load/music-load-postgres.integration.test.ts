import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { percentile } from "../../../scripts/music-qualification";
import { runOwnedMusicLoadPostgresTest } from "./music-load-postgres-test-authority";

const describePg = process.env.MUSIC_C10_POSTGRES_TEST === "1" ? describe.sequential : describe.skip;

describePg("real PostgreSQL Music pool saturation", () => {
  it("bounds a 50-query burst through the four-connection disposable pool", async () => {
    const result = await runOwnedMusicLoadPostgresTest(
      process.env,
      async (config) => {
        const { default: pg } = await import("pg");
        return new pg.Pool(config);
      },
      async (pool) => {
        const samples = await Promise.all(Array.from({ length: 50 }, async () => {
          const started = performance.now();
          const query = await pool.query("SELECT pg_sleep(0.01), 1 AS owned");
          return { durationMs: performance.now() - started, owned: Number(query.rows[0]?.owned) };
        }));
        const durations = samples.map(({ durationMs }) => durationMs);
        const p95Ms = percentile(durations, 0.95);
        expect(samples.every(({ owned }) => owned === 1)).toBe(true);
        expect(pool.totalCount).toBeLessThanOrEqual(4);
        expect(p95Ms).toBeLessThan(2_000);
        console.info(JSON.stringify({
          schemaVersion: "music-load/v1",
          metric: "postgres-pool",
          concurrentQueries: 50,
          poolMax: 4,
          p50Ms: percentile(durations, 0.5),
          p95Ms,
        }));
      },
    );
    expect(result.executed).toBe(true);
  });
});
