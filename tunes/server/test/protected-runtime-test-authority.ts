import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { resolveMusicDatabaseConnection } from "../config/music-database-config";
import type { MusicStartupDependencies } from "../config/music-startup";
import { provisionMusicRuntimeLogin } from "../db/music-runtime-role";

export async function prepareProtectedRuntimeTestAuthority(): Promise<MusicStartupDependencies> {
  const target = new URL(process.env.DATABASE_URL_TEST ?? "");
  const runtimePassword = randomBytes(32).toString("base64url");
  const authority = new pg.Pool({ connectionString: target.toString(), max: 1 });
  try {
    await provisionMusicRuntimeLogin(authority, {
      loginRole: process.env.MUSIC_DATABASE_USER ?? "music_runtime_login",
      password: runtimePassword,
    });
  } finally {
    await authority.end();
  }
  const secretDirectory = mkdtempSync(join(tmpdir(), "music-runtime-integration-"));
  const passwordFile = join(secretDirectory, "runtime-password");
  writeFileSync(passwordFile, runtimePassword, { mode: 0o600 });
  process.env.MUSIC_DATABASE_NAME = target.pathname.slice(1);
  process.env.MUSIC_DATABASE_PASSWORD_FILE = passwordFile;
  delete process.env.DATABASE_URL;
  return {
    resolveDatabaseConnection: (environment, authorityName, dependencies) =>
      resolveMusicDatabaseConnection({
        ...environment,
        MUSIC_DATABASE_HOST: target.hostname,
        MUSIC_DATABASE_PORT: target.port,
      }, authorityName, dependencies),
  };
}

export async function releaseProtectedRuntimeTestAuthority(): Promise<void> {
  const authority = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
  try {
    await authority.query("REVOKE music_runtime FROM music_runtime_login");
  } finally {
    await authority.end();
  }
}
