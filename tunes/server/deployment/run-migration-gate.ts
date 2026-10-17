import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveMusicDatabaseConnection } from "../config/music-database-config";
import { migrateMusicDatabase } from "../db/migrate";
import { assertMusicMigratorAuthority, assertMusicRuntimeCapabilityPreflight, provisionMusicRuntimeLogin, verifyMusicRuntimeLogin } from "../db/music-runtime-role";
import { createGateAttestation, CURRENT_MIGRATION_MARKER } from "./music-deployment";
import { deploymentImageFromEnvironment } from "./music-health";

async function run(): Promise<void> {
  const image = deploymentImageFromEnvironment(process.env);
  if (image.migrationMarker !== CURRENT_MIGRATION_MARKER) throw new Error(`same-image gate requires ${CURRENT_MIGRATION_MARKER}`);
  const key = process.env.MUSIC_GATE_ATTESTATION_KEY ?? "";
  const target = process.env.MUSIC_GATE_ATTESTATION_PATH;
  if (!target) throw new Error("MUSIC_GATE_ATTESTATION_PATH is required");

  const migrator = await resolveMusicDatabaseConnection(process.env, "migrator");
  const runtimeEnvironment = {
    ...process.env,
    DATABASE_URL: undefined,
    MUSIC_DATABASE_USER: process.env.MUSIC_RUNTIME_DATABASE_USER,
    MUSIC_DATABASE_PASSWORD_FILE: process.env.MUSIC_RUNTIME_DATABASE_PASSWORD_FILE,
    MUSIC_DATABASE_MIGRATOR_USER: migrator.user,
  };
  const runtime = await resolveMusicDatabaseConnection(runtimeEnvironment, "runtime");
  const { default: pg } = await import("pg");
  const ownerPool = new pg.Pool({ connectionString: migrator.connectionString, max: 2 });
  let runtimePool: InstanceType<typeof pg.Pool> | undefined;
  try {
    await assertMusicMigratorAuthority(ownerPool, { runtimeLoginRole: runtime.user });
    await assertMusicRuntimeCapabilityPreflight(ownerPool, { runtimeLoginRole: runtime.user });
    const migration = await migrateMusicDatabase(ownerPool);
    if (!migration.ready || migration.currentId !== CURRENT_MIGRATION_MARKER || !migration.currentChecksum) {
      throw new Error("exact migration journal state was not reached");
    }
    await provisionMusicRuntimeLogin(ownerPool, { loginRole: runtime.user, password: runtime.password });
    runtimePool = new pg.Pool({ connectionString: runtime.connectionString, max: 2 });
    await verifyMusicRuntimeLogin(ownerPool, runtimePool, { loginRole: runtime.user });

    const attestation = createGateAttestation(image, key, migration.currentChecksum);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(attestation)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  } finally {
    await runtimePool?.end().catch(() => undefined);
    await ownerPool.end().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error("Music migration deployment gate failed", error);
  process.exitCode = 1;
});
