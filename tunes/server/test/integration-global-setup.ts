import { execFileSync } from "node:child_process";
import pg from "pg";
import { migrateMusicDatabase } from "../db/migrate";
import {
  attestC10StandalonePostgresAuthority,
  parseC10StandalonePostgresAuthority,
} from "../../scripts/music-qualification-postgres";
import {
  attestUatDatabaseAuthority,
  parseUatDatabaseAuthority,
} from "../../scripts/music-uat-database";

export function validateIntegrationDatabaseTarget(rawTarget: string, environment: NodeJS.ProcessEnv = process.env): URL {
  let target: URL;
  try { target = new URL(rawTarget); }
  catch { throw new Error("integration tests require the exact disposable PostgreSQL target"); }
  const standalone = parseC10StandalonePostgresAuthority(environment);
  const uat = parseUatDatabaseAuthority(environment);
  if (standalone && uat) throw new Error("integration tests require one disposable PostgreSQL authority");
  const expectedPort = uat?.port ?? standalone?.port ?? 55_432;
  const expectedDatabase = uat?.database ?? "music_fixture";
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1"
      || target.port !== String(expectedPort)
      || target.pathname !== `/${expectedDatabase}` || target.username !== "music_migrator" || !target.password
      || target.search || target.hash) {
    throw new Error("integration tests require the exact disposable PostgreSQL target");
  }
  return target;
}

export default async function setupIntegrationDatabase(): Promise<void> {
  if (process.env.MUSIC_C3_POSTGRES_TEST !== "1") {
    throw new Error("MUSIC_C3_POSTGRES_TEST=1 is required for the destructive integration suite");
  }
  const rawTarget = process.env.DATABASE_URL_TEST ?? "";
  validateIntegrationDatabaseTarget(rawTarget);
  let sourceCommit: string;
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("integration tests require an exact source commit for PostgreSQL attestation");
  }
  if (parseUatDatabaseAuthority(process.env)) attestUatDatabaseAuthority(process.env, sourceCommit);
  else attestC10StandalonePostgresAuthority(process.env, sourceCommit);
  const pool = new pg.Pool({ connectionString: rawTarget, max: 2 });
  try {
    const version = await pool.query<{ server_version_num: string }>("SHOW server_version_num");
    const versionNumber = Number(version.rows[0]?.server_version_num);
    if (!Number.isSafeInteger(versionNumber) || versionNumber < 150_000 || versionNumber >= 160_000) {
      throw new Error("integration tests require PostgreSQL 15 before migration");
    }
    await migrateMusicDatabase(pool);
  } finally {
    await pool.end();
  }
}
