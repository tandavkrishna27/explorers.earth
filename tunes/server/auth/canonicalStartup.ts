import {startAnalyticsMaintenance} from '../application/analyticsMaintenance';
import { createServer, type Server } from "node:http";
import pg, { type Pool } from "pg";
import { resolveMusicDatabaseConnection } from "../config/music-database-config";
import { verifyMusicRuntimeDatabaseConnection } from "../db/music-runtime-role";
import { checkMusicDatabaseReadiness } from "../db/readiness";
import { createCanonicalApp } from "./canonicalApp";
import { resolveExplorersAuthConfig } from "./betterAuth";
import { runAccountLifecycleMaintenance } from "../application/accountLifecycleMaintenance";
import { runMediaCleanupMaintenance } from "../application/mediaCleanupMaintenance";
import { resolveObjectStorage } from "../services/objectStorage";
import {resolveAppProviderOwnerChoices} from '../config/app-provider-configuration';

type Environment = Record<string, string | undefined>;

export interface CanonicalStartupOptions {
  /** Injected only by the disposable integration harness. */
  pool?: Pool;
  host?: string;
  port?: number;
}

/** Recovery-only pause for the two maintenance loops. Both reach object storage:
 *  the account lifecycle loop deletes objects for pending deletions
 *  (accountLifecycleMaintenance.ts) and the lazy media sweeper deletes the bytes of
 *  any ready asset with no remaining references (mediaRepository.ts `abandoned`).
 *  Booting against a database restored to an earlier point than the bucket would
 *  therefore destroy bytes the restore is trying to preserve.
 *
 *  A truthy-string check is deliberately rejected: an accidental
 *  EXPLORERS_MAINTENANCE_PAUSED=1 left in production would silently stop every
 *  account deletion, which is a legal obligation, so only the exact
 *  acknowledgement is honoured and anything else is a hard startup failure. */
export function resolveMaintenanceAdmission(environment: Environment): { paused: boolean } {
  const value = environment.EXPLORERS_MAINTENANCE_PAUSED;
  if (value === undefined) return { paused: false };
  if (value !== "RESTORE_IN_PROGRESS") {
    throw new Error("EXPLORERS_MAINTENANCE_PAUSED must be absent or exactly RESTORE_IN_PROGRESS");
  }
  return { paused: true };
}

export async function startCanonicalServer(
  environment: Environment,
  options: CanonicalStartupOptions = {},
): Promise<{ httpServer: Server; shutdown: () => Promise<void> }> {
  const maintenanceAdmission = resolveMaintenanceAdmission(environment);
  const config = resolveExplorersAuthConfig(environment);
  const appEnrichmentChoices=resolveAppProviderOwnerChoices(environment);
  process.env.TZ = "UTC";
  let pool = options.pool;
  const ownsPool = !pool;
  if (!pool) {
    const connection = await resolveMusicDatabaseConnection(environment, "runtime");
    await verifyMusicRuntimeDatabaseConnection(connection, environment.MUSIC_DATABASE_MIGRATOR_USER ?? "");
    // PROD-06. A bounded acquire wait turns pool exhaustion into a classified, retryable
    // 429 (explorersPrincipal.ts) instead of an unbounded hang, and an idle client that
    // PostgreSQL drops is logged rather than left as an unhandled 'error' event.
    const max = Number(environment.EXPLORERS_DB_POOL_MAX ?? "10");
    if (!Number.isInteger(max) || max < 2 || max > 50) throw new Error("EXPLORERS_DB_POOL_MAX must be an integer from 2 to 50");
    pool = new pg.Pool({ connectionString: connection.connectionString, max, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 });
    pool.on("error", (error) => console.error(JSON.stringify({ event: "db_pool_idle_error", code: (error as { code?: string }).code ?? null })));
  }
  /** Declared outside the try so the catch can close a listener the try opened. */
  let listening: Server | undefined;
  try {
    const readiness = await checkMusicDatabaseReadiness(pool);
    if (!readiness.ready) throw new Error("Canonical identity schema is not ready");
    const { app } = createCanonicalApp(pool, config,{appEnrichmentChoices});
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
    listening = httpServer;
    const storage = resolveObjectStorage(environment);
    if (maintenanceAdmission.paused) {
      process.stderr.write("Maintenance loops are paused for recovery; account deletion and media sweeps will not run\n");
    }
    const stopAnalyticsMaintenance = maintenanceAdmission.paused ? async () => undefined : startAnalyticsMaintenance(pool);
    let maintenance: Promise<void> | undefined;
    const maintain = () => {
      if (maintenance || maintenanceAdmission.paused) return;
      maintenance = runAccountLifecycleMaintenance(pool!, storage).then(()=>undefined).catch(() => {
        process.stderr.write("Account lifecycle maintenance failed; retry is scheduled\n");
      }).then(() => runMediaCleanupMaintenance(pool!, storage)).then(()=>undefined).catch(() => {
        process.stderr.write("Media cleanup maintenance failed; retry is scheduled\n");
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
    // Anything that throws after listen() resolves — resolveObjectStorage with a
    // configured media tier but no bucket is the live example — used to rethrow with
    // the listener still open. api.ts only sets process.exitCode, so the open handle
    // kept the event loop alive: the process never exited, Docker never restarted it,
    // and /health/live (the Dockerfile healthcheck) answered 200 forever.
    if (listening) await new Promise<void>((resolve) => listening!.close(() => resolve()));
    if (ownsPool) await pool.end().catch(() => undefined);
    throw error;
  }
}
