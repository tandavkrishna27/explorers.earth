import { describe, expect, it, vi } from "vitest";

const collectionPoolEnd = vi.hoisted(() => vi.fn(async () => undefined));
const poolConstructionOnCollection = vi.hoisted(() => vi.fn(function Pool() {
  return {
    end: collectionPoolEnd,
    query: vi.fn(),
    totalCount: 0,
  };
}));

vi.hoisted(() => {
  for (const key of [
    "MUSIC_C10_POSTGRES_TEST",
    "DATABASE_URL_TEST",
    "MUSIC_UAT_DATABASE_ACK",
    "MUSIC_UAT_DATABASE_RUN_ID",
    "MUSIC_UAT_DATABASE_NAME",
    "MUSIC_UAT_DATABASE_PORT",
    "MUSIC_UAT_DATABASE_CONTAINER_ID",
    "MUSIC_UAT_DATABASE_COMMIT",
    "MUSIC_C10_STANDALONE_POSTGRES_ACK",
    "MUSIC_C10_STANDALONE_POSTGRES_PORT",
    "MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID",
    "MUSIC_C10_STANDALONE_POSTGRES_COMMIT",
  ]) delete process.env[key];
});

vi.mock("pg", () => ({ default: { Pool: poolConstructionOnCollection } }));

import {
  createIdempotentMusicLoadPostgresTeardown,
  runOwnedMusicLoadPostgresTest,
  type MusicLoadPostgresPool,
} from "../load/music-load-postgres-test-authority";
import "../load/music-load-postgres.integration.test";

const runId = "1".repeat(32);
const database = `music_uat_${runId}`;

function databaseTarget(overrides: {
  host?: string;
  port?: string;
  database?: string;
  username?: string;
} = {}): string {
  const target = new URL("postgresql://127.0.0.1");
  target.hostname = overrides.host ?? "127.0.0.1";
  target.port = overrides.port ?? "58543";
  target.pathname = `/${overrides.database ?? database}`;
  target.username = overrides.username ?? "music_migrator";
  target.password = ["fixture", "contract", "password"].join("-");
  return target.toString();
}

function exactOwnedEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MUSIC_C10_POSTGRES_TEST: "1",
    MUSIC_UAT_DATABASE_ACK: "TASK4_FIXTURE_OWNED_DISPOSABLE_PG15",
    MUSIC_UAT_DATABASE_RUN_ID: runId,
    MUSIC_UAT_DATABASE_NAME: database,
    MUSIC_UAT_DATABASE_PORT: "58543",
    MUSIC_UAT_DATABASE_CONTAINER_ID: "a".repeat(64),
    MUSIC_UAT_DATABASE_COMMIT: "c".repeat(40),
    DATABASE_URL_TEST: databaseTarget(),
    ...overrides,
  };
}

function controlledPool() {
  const query = vi.fn(async () => ({ rows: [{ owned: 1 }] }));
  const end = vi.fn(async () => undefined);
  const pool: MusicLoadPostgresPool = { query, end, totalCount: 1 };
  const createPool = vi.fn(async (_input: { connectionString: string; max: 4 }) => pool);
  const execute = vi.fn(async (ownedPool: MusicLoadPostgresPool) => {
    const result = await ownedPool.query("SELECT 1 AS owned");
    return Number(result.rows[0]?.owned);
  });
  return { pool, query, end, createPool, execute };
}

describe("Music PostgreSQL load-test owned authority", () => {
  it("collects the real load suite without database side effects when its flag is absent", () => {
    // Break caught: a top-level pg.Pool construction made mere test discovery
    // attempt authentication against the machine's default PostgreSQL target.
    expect(poolConstructionOnCollection).toHaveBeenCalledTimes(0);
    expect(collectionPoolEnd).toHaveBeenCalledTimes(0);
  });

  it("keeps collection inert when the owned PostgreSQL execution flag is absent", async () => {
    // Break caught: evaluating an unguarded suite used to construct pg.Pool even
    // though no owned-lane execution flag had authorized database work.
    const controlled = controlledPool();
    const result = await runOwnedMusicLoadPostgresTest(
      { DATABASE_URL_TEST: databaseTarget({ host: "localhost", port: "", database: "postgres" }) },
      controlled.createPool,
      controlled.execute,
    );

    expect(result).toEqual({ executed: false });
    expect(controlled.createPool).toHaveBeenCalledTimes(0);
    expect(controlled.execute).toHaveBeenCalledTimes(0);
    expect(controlled.query).toHaveBeenCalledTimes(0);
    expect(controlled.end).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["missing owned tuple", {
      MUSIC_C10_POSTGRES_TEST: "1",
      DATABASE_URL_TEST: databaseTarget({ port: "55432", database: "music_fixture" }),
    }],
    ["missing target", exactOwnedEnvironment({ DATABASE_URL_TEST: undefined })],
    ["malformed target", exactOwnedEnvironment({ DATABASE_URL_TEST: "not-a-postgres-url" })],
    ["localhost default", exactOwnedEnvironment({
      DATABASE_URL_TEST: databaseTarget({ host: "localhost", port: "" }),
    })],
    ["mismatched host", exactOwnedEnvironment({
      DATABASE_URL_TEST: databaseTarget({ host: "production.example" }),
    })],
    ["mismatched port", exactOwnedEnvironment({
      DATABASE_URL_TEST: databaseTarget({ port: "55432" }),
    })],
    ["mismatched database", exactOwnedEnvironment({
      DATABASE_URL_TEST: databaseTarget({ database: "music_fixture" }),
    })],
    ["mismatched user", exactOwnedEnvironment({
      DATABASE_URL_TEST: databaseTarget({ username: "postgres" }),
    })],
  ])("rejects %s before pool construction or connection", async (_label, environment) => {
    // Break caught: falling back to pg defaults or validating only part of the
    // URL could let the load test reach an unowned PostgreSQL endpoint.
    const controlled = controlledPool();

    await expect(runOwnedMusicLoadPostgresTest(
      environment,
      controlled.createPool,
      controlled.execute,
    )).rejects.toThrow(/owned|exact disposable PostgreSQL target/i);

    expect(controlled.createPool).toHaveBeenCalledTimes(0);
    expect(controlled.execute).toHaveBeenCalledTimes(0);
    expect(controlled.query).toHaveBeenCalledTimes(0);
    expect(controlled.end).toHaveBeenCalledTimes(0);
  });

  it("allows the exact owned tuple and closes its pool after execution", async () => {
    // Break caught: an over-broad fail-closed gate could make the reviewed UAT
    // tuple unusable even though every authority component matches.
    const controlled = controlledPool();
    const result = await runOwnedMusicLoadPostgresTest(
      exactOwnedEnvironment(),
      controlled.createPool,
      controlled.execute,
    );

    expect(result).toEqual({ executed: true, value: 1 });
    const poolInput = controlled.createPool.mock.calls[0]?.[0];
    expect(poolInput?.max).toBe(4);
    const target = new URL(poolInput?.connectionString ?? "");
    expect({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      pathname: target.pathname,
      username: target.username,
      password: target.password,
    }).toEqual({
      protocol: "postgresql:",
      hostname: "127.0.0.1",
      port: "58543",
      pathname: `/${database}`,
      username: "music_migrator",
      password: "fixture-contract-password",
    });
    expect(controlled.execute).toHaveBeenCalledTimes(1);
    expect(controlled.query).toHaveBeenCalledWith("SELECT 1 AS owned");
    expect(controlled.end).toHaveBeenCalledTimes(1);
  });

  it("closes once through finally when the load assertion fails", async () => {
    // Break caught: a query/assertion rejection must not strand the owned pool
    // and produce teardown noise after the runner removes PostgreSQL.
    const controlled = controlledPool();
    await expect(runOwnedMusicLoadPostgresTest(
      exactOwnedEnvironment(),
      controlled.createPool,
      async () => { throw new Error("injected load assertion failure"); },
    )).rejects.toThrow("injected load assertion failure");

    expect(controlled.end).toHaveBeenCalledTimes(1);
  });

  it("makes repeated teardown calls share one pool end", async () => {
    // Break caught: overlapping cleanup paths must not call pg.Pool.end twice.
    const controlled = controlledPool();
    const teardown = createIdempotentMusicLoadPostgresTeardown(controlled.pool);

    await Promise.all([teardown(), teardown()]);

    expect(controlled.end).toHaveBeenCalledTimes(1);
  });
});
