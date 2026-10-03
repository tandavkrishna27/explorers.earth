import type { Express } from "express";
import type { Server } from "node:http";
import { parseMusicRuntimeFixtureEnvironment } from "./music-environment";
import {
  resolveMusicIdentityRuntimeConfig,
  type MusicIdentityConfigDependencies,
  type MusicIdentityRuntimeConfig,
} from "./music-identity-config";
import { resolveMusicDatabaseConnection } from "./music-database-config";
import type { MusicDatabaseConnection } from "./music-database-config";
import {
  LOCAL_MUSIC_TARGET,
  assertValidatedLocalMusicProfile,
  type ValidatedLocalMusicProfile,
} from "./music-local-profile";
import {
  verifyMusicRuntimeDatabaseConnection,
} from "../db/music-runtime-role";

type Environment = Record<string, string | undefined>;

export interface MusicServerRuntime {
  createApp: (config: MusicIdentityRuntimeConfig, localProfile?: ValidatedLocalMusicProfile, apiOnly?: boolean) => Promise<{
    app: Express;
    server: Server;
    shutdown?: () => Promise<void>;
  }>;
  setupVite: (app: Express, server: Server) => Promise<void>;
  serveStatic: (app: Express) => void;
}

export interface MusicStartupDependencies extends MusicIdentityConfigDependencies {
  apiOnly?: boolean;
  loadRuntime?: () => Promise<MusicServerRuntime>;
  ensureAnalyticsSchema?: () => Promise<void>;
  resolveDatabaseConnection?: typeof resolveMusicDatabaseConnection;
  verifyDatabaseConnection?: (connection: MusicDatabaseConnection) => Promise<void>;
  resolveIdentityConfig?: typeof resolveMusicIdentityRuntimeConfig;
  host?: string;
  port?: number;
}

export function fixtureUsesAttestedAnalyticsSchema(environment: Environment): boolean {
  const requested = environment.MUSIC_FIXTURE_SKIP_ANALYTICS_SCHEMA_DDL === "true";
  if (requested && environment.MUSIC_MODE !== "fixture") {
    throw new Error("live runtime cannot bypass analytics schema migration");
  }
  if (!requested) return false;
  if (environment.MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER !== "explorers-analytics-receipts-v1") {
    throw new Error("fixture analytics schema attestation marker is missing or mismatched");
  }
  return true;
}

export async function loadProductionRuntime(): Promise<MusicServerRuntime> {
  const [{ createApp }, { serveStatic }] = await Promise.all([
    import("../app"),
    import("../runtime"),
  ]);
  return {
    createApp,
    serveStatic,
    setupVite: async () => { throw new Error("Combined development serving must be supplied by the web entrypoint"); },
  };
}

/** The only startup discriminator. No routes, storage, or listener are loaded before it succeeds. */
export async function validateMusicStartupEnvironment(
  environment: Environment,
  dependencies: MusicStartupDependencies = {},
): Promise<MusicIdentityRuntimeConfig> {
  if (environment.MUSIC_RUNTIME_PROFILE !== undefined) {
    throw new Error("A local runtime profile is accepted only by the validated local launcher");
  }
  if (environment.MUSIC_MODE === "fixture") parseMusicRuntimeFixtureEnvironment(environment);
  else if (environment.MUSIC_MODE !== "live") throw new Error("MUSIC_MODE must be live or fixture");
  const config = await (dependencies.resolveIdentityConfig ?? resolveMusicIdentityRuntimeConfig)(environment, dependencies);
  const database = await (dependencies.resolveDatabaseConnection ?? resolveMusicDatabaseConnection)(
    environment,
    "runtime",
    dependencies,
  );
  if (dependencies.verifyDatabaseConnection) await dependencies.verifyDatabaseConnection(database);
  else await verifyMusicRuntimeDatabaseConnection(database, environment.MUSIC_DATABASE_MIGRATOR_USER ?? "");
  environment.DATABASE_URL = database.connectionString;
  return config;
}

export async function createValidatedApp(
  environment: Environment = process.env,
  dependencies: MusicStartupDependencies = {},
): Promise<{ app: Express; server: Server }> {
  const config = await validateMusicStartupEnvironment(environment, dependencies);
  const runtime = await (dependencies.loadRuntime ?? loadProductionRuntime)();
  return runtime.createApp(config);
}

export async function startMusicServer(
  environment: Environment,
  dependencies: MusicStartupDependencies = {},
): Promise<{ app: Express; server: Server; config: MusicIdentityRuntimeConfig; shutdown: () => Promise<void> }> {
  const config = await validateMusicStartupEnvironment(environment, dependencies);
  const fixtureSkipsAnalyticsDdl = fixtureUsesAttestedAnalyticsSchema(environment);
  let earlyPool: { end: () => Promise<void> } | undefined;
  let appCreationStarted = false;
  let constructed: Awaited<ReturnType<MusicServerRuntime["createApp"]>>;
  try {
    if (dependencies.ensureAnalyticsSchema) await dependencies.ensureAnalyticsSchema();
    else {
      const { pool } = await import("../db");
      earlyPool = pool;
      const { EXPLORERS_ANALYTICS_SCHEMA_MARKER, verifyExplorersAnalyticsSchema } = await import("../startup/explorers-analytics-migration");
      await verifyExplorersAnalyticsSchema(pool, fixtureSkipsAnalyticsDdl
        ? environment.MUSIC_FIXTURE_ANALYTICS_SCHEMA_MARKER
        : EXPLORERS_ANALYTICS_SCHEMA_MARKER);
    }
    const runtime = await (dependencies.loadRuntime ?? loadProductionRuntime)();
    appCreationStarted = true;
    constructed = await runtime.createApp(config, undefined, dependencies.apiOnly === true);
    const { app, server } = constructed;
    if (dependencies.apiOnly) {
      app.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
    } else if (app.get("env") === "development") await runtime.setupVite(app, server);
    else runtime.serveStatic(app);
  } catch (error) {
    if (dependencies.apiOnly && !appCreationStarted) await earlyPool?.end().catch(() => undefined);
    throw error;
  }
  const { app, server, shutdown } = constructed;

  try {
    const port = dependencies.port ?? Number.parseInt(environment.PORT ?? "5000", 10);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("PORT must be a valid TCP port");
    const host = dependencies.host ?? "0.0.0.0";
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });
  } catch (error) {
    await shutdown?.().catch(() => undefined);
    throw error;
  }
  return { app, server, config, shutdown: shutdown ?? (() => closeServer(server)) };
}

async function validateLocalStartupEnvironment(
  environment: Environment,
  profile: ValidatedLocalMusicProfile,
  dependencies: MusicStartupDependencies,
): Promise<MusicIdentityRuntimeConfig> {
  assertValidatedLocalMusicProfile(profile, environment);
  if (environment.MUSIC_MODE !== "live"
      || environment.MUSIC_RUNTIME_PROFILE !== "local-music"
      || environment.HOST !== LOCAL_MUSIC_TARGET.apiHost
      || environment.PORT !== String(LOCAL_MUSIC_TARGET.apiPort)
      || environment.MUSIC_DATABASE_HOST !== LOCAL_MUSIC_TARGET.databaseHost
      || environment.MUSIC_DATABASE_PORT !== String(LOCAL_MUSIC_TARGET.databasePort)
      || environment.MUSIC_DATABASE_NAME !== LOCAL_MUSIC_TARGET.databaseName
      || environment.MUSIC_DATABASE_USER !== LOCAL_MUSIC_TARGET.runtimeUser) {
    throw new Error("Local Music environment target is invalid");
  }
  const config = await (dependencies.resolveIdentityConfig ?? resolveMusicIdentityRuntimeConfig)(environment, dependencies);
  const database = await (dependencies.resolveDatabaseConnection ?? resolveMusicDatabaseConnection)(environment, "runtime", dependencies);
  if (dependencies.verifyDatabaseConnection) await dependencies.verifyDatabaseConnection(database);
  else await verifyMusicRuntimeDatabaseConnection(database, environment.MUSIC_DATABASE_MIGRATOR_USER ?? "");
  environment.DATABASE_URL = database.connectionString;
  return config;
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

/** Local-only entry. The opaque profile cannot be selected through process environment. */
export async function startLocalMusicServer(
  environment: Environment,
  profile: ValidatedLocalMusicProfile,
  dependencies: MusicStartupDependencies = {},
): Promise<{
  app: Express;
  server: Server;
  config: MusicIdentityRuntimeConfig;
  shutdown: () => Promise<void>;
}> {
  const config = await validateLocalStartupEnvironment(environment, profile, dependencies);
  const runtime = await (dependencies.loadRuntime ?? loadProductionRuntime)();
  const constructed = await runtime.createApp(config, profile);
  let stopped = false;
  const shutdown = async () => {
    if (stopped) return;
    stopped = true;
    if (constructed.shutdown) await constructed.shutdown();
    else await closeServer(constructed.server);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      constructed.server.once("error", onError);
      constructed.server.listen(LOCAL_MUSIC_TARGET.apiPort, LOCAL_MUSIC_TARGET.apiHost, () => {
        constructed.server.off("error", onError);
        resolve();
      });
    });
  } catch (error) {
    await shutdown().catch(() => undefined);
    throw error;
  }
  return { app: constructed.app, server: constructed.server, config, shutdown };
}
