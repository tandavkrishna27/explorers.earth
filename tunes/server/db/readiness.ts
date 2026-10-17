import type { Pool } from "pg";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../../shared/music-migration-contract";
import { expectedMigrationContract, verifyMusicDatabase } from "./migrate";

export type MusicDatabaseReadiness =
  | { ready: true; currentId: string; currentChecksum: string }
  | { ready: false; reason: "migration-state-invalid"; expectedId: string };

export async function checkMusicDatabaseReadiness(pool: Pick<Pool, "connect">): Promise<MusicDatabaseReadiness> {
  try {
    const expected = expectedMigrationContract();
    const state = await verifyMusicDatabase(pool);
    if (state.currentId !== expected.id || state.currentChecksum !== expected.checksum) throw new Error("exact migration mismatch");
    return { ready: true, currentId: state.currentId, currentChecksum: state.currentChecksum };
  } catch {
    return { ready: false, reason: "migration-state-invalid", expectedId: EXPECTED_MUSIC_MIGRATION_ID };
  }
}
