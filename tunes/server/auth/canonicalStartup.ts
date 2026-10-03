import {startAnalyticsMaintenance} from '../application/analyticsMaintenance';
import { createServer, type Server } from "node:http";
import pg, { type Pool } from "pg";
import { resolveMusicDatabaseConnection } from "../config/music-database-config";
import { verifyMusicRuntimeDatabaseConnection } from "../db/music-runtime-role";
import { checkMusicDatabaseReadiness } from "../db/readiness";
import { createCanonicalApp } from "./canonicalApp";
import { resolveExplorersAuthConfig } from "./betterAuth";
import { runAccountLifecycleMaintenance } from "../application/accountLifecycleMaintenance";
import { resolveObjectStorage } from "../services/objectStorage";

type Environment = Record<string, string | undefined>;

export interface CanonicalStartupOptions {
  /** Injected only by the disposable integration harness. */
  pool?: Pool;
  host?: string;
  port?: number;
}

export async function startCanonicalServer(
  environment: Environment,
  options: CanonicalStartupOptions = {},
): Promise<{ httpServer: Server; shutdown: () => Promise<void> }> {
  const config = resolveExplorersAuthConfig(environment);
  process.env.TZ = "UTC";
  let pool = options.pool;
  const ownsPool = !pool;
  if (!pool) {
    const connection = await resolveMusicDatabaseConnection(environment, "runtime");
    await verifyMusicRuntimeDatabaseConnection(connection, environment.MUSIC_DATABASE_MIGRATOR_USER ?? "");
    pool = new pg.Pool({ connectionString: connection.connectionString, max: 10 });
  }
  try {
    const readiness = await checkMusicDatabaseReadiness(pool);
    if (!readiness.ready) throw new Error("Canonical identity schema is not ready");
    const { app } = createCanonicalApp(pool, config);
    const httpServer = createServer(app);
    const port = options.port ?? Number(environment.PORT ?? "5000");
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("PORT must be a valid TCP port");
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, options.host ?? "0.0.0.0", () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
    const storage = resolveObjectStorage(environment);
    const stopAnalyticsMaintenance=startAnalyticsMaintenance(pool);
    let maintenance: Promise<void> | undefined;
    const maintain = () => {
      if (maintenance) return;
      maintenance = runAccountLifecycleMaintenance(pool!, storage).then(()=>undefined).catch(() => {
        process.stderr.write("Account lifecycle maintenance failed; retry is scheduled\n");
      }).finally(() => { maintenance = undefined; });
    };
    maintain();
    const maintenanceTimer = setInterval(maintain, 60_000);
    maintenanceTimer.unref();
    return {
      httpServer,
      shutdown: async () => {
        clearInterval(maintenanceTimer);
        await Promise.all([maintenance,stopAnalyticsMaintenance()]);
        await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
        if (ownsPool) await pool.end();
      },
    };
  } catch (error) {
    if (ownsPool) await pool.end().catch(() => undefined);
    throw error;
  }
}
