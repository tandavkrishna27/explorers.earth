import { resolveMusicDatabaseConnection, type MusicDatabaseConnection } from "../server/config/music-database-config";

type Environment = Record<string, string | undefined>;

/**
 * Operator commands (taxonomy apply, person suppression) run as the database migrator.
 * The refusal comes from the principal check itself, before any host, name or credential
 * file is consulted. Kept in its own module with no main guard, so each operator bundle
 * can import it without inlining another command's entry point.
 */
export async function assertOperatorMigratorPrincipal(environment: Environment, command: string):
  Promise<{ migrator: MusicDatabaseConnection; runtimeLoginRole: string }> {
  const runtimeLoginRole = environment.MUSIC_RUNTIME_DATABASE_USER;
  if (!runtimeLoginRole) throw new Error("MUSIC_RUNTIME_DATABASE_USER is required");
  if (environment.MUSIC_DATABASE_USER === runtimeLoginRole || environment.MUSIC_DATABASE_USER === "music_runtime") {
    throw new Error(`${command} must run as the database migrator, not the runtime role`);
  }
  const migrator = await resolveMusicDatabaseConnection(environment, "migrator");
  return { migrator, runtimeLoginRole };
}
