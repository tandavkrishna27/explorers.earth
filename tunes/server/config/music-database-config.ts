import {
  readSecureMusicSecretFile,
  type SecureMusicSecretFileSystem,
} from "./secure-music-secret-file";

type Environment = Record<string, string | undefined>;

export interface MusicDatabaseConfigDependencies {
  secretFileSystem?: SecureMusicSecretFileSystem;
  readSecretFile?: typeof readSecureMusicSecretFile;
  platform?: NodeJS.Platform;
  effectiveUserId?: number;
}

export interface MusicDatabaseConnection {
  connectionString: string;
  password: string;
  user: string;
  database: string;
  host: string;
  port: number;
}

export async function resolveMusicDatabaseConnection(
  environment: Environment,
  authority: "runtime" | "migrator",
  dependencies: MusicDatabaseConfigDependencies = {},
): Promise<MusicDatabaseConnection> {
  if (environment.DATABASE_URL) throw new Error("DATABASE_URL must be derived from the protected database credential file");
  const host = required(environment.MUSIC_DATABASE_HOST, "MUSIC_DATABASE_HOST");
  const database = required(environment.MUSIC_DATABASE_NAME, "MUSIC_DATABASE_NAME");
  const user = required(environment.MUSIC_DATABASE_USER, "MUSIC_DATABASE_USER");
  const passwordFile = required(environment.MUSIC_DATABASE_PASSWORD_FILE, "MUSIC_DATABASE_PASSWORD_FILE");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host)) throw new Error("MUSIC_DATABASE_HOST is invalid");
  if (!/^[a-z_][a-z0-9_]{1,62}$/.test(database)) throw new Error("MUSIC_DATABASE_NAME is invalid");
  if (!/^[a-z_][a-z0-9_]{1,62}$/.test(user)) throw new Error("MUSIC_DATABASE_USER is invalid");
  const portValue = environment.MUSIC_DATABASE_PORT ?? "5432";
  if (!/^[1-9][0-9]{0,4}$/.test(portValue)) throw new Error("MUSIC_DATABASE_PORT is invalid");
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port > 65_535) throw new Error("MUSIC_DATABASE_PORT is invalid");
  if (authority === "runtime") {
    const migratorUser = required(environment.MUSIC_DATABASE_MIGRATOR_USER, "MUSIC_DATABASE_MIGRATOR_USER");
    if (user === migratorUser || user === "postgres" || user === "music_runtime") {
      throw new Error("runtime database role must be distinct from owner, migrator, and capability roles");
    }
  }
  const password = await (dependencies.readSecretFile ?? readSecureMusicSecretFile)(passwordFile, {
    mode: environment.MUSIC_MODE === "fixture" ? "fixture" : "live",
    fileSystem: dependencies.secretFileSystem,
    platform: dependencies.platform,
    effectiveUserId: dependencies.effectiveUserId,
  });
  const decoded = Buffer.from(password, "base64url");
  if (decoded.length < 32 || decoded.toString("base64url") !== password) throw new Error("database credential file is invalid");
  const connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  return { connectionString, password, user, database, host, port };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
