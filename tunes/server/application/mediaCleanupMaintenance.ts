import type { Pool } from "pg";
import type { ObjectStorage } from "../services/objectStorage";
import { MediaRepository } from "../repositories/mediaRepository";
import { MediaService } from "./media";

/**
 * Scheduled form of MediaService.retryPendingDeletes. Without it the retry only ran inside
 * an upload or a movie import, so an account that never uploaded again kept its
 * pending_delete rows, and the storage objects behind them, forever.
 *
 * Each account is visited under the same session advisory lock createMedia holds across its
 * put. A try-lock that fails means a live writer owns the account, and that account waits
 * for the next tick rather than having its reservation swept from under it.
 */
export async function runMediaCleanupMaintenance(pool: Pool, storage: ObjectStorage, batchSize = 25): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Invalid maintenance batch size");
  const accounts = await new MediaRepository(pool).accountsNeedingCleanup(storage.environment, batchSize);
  const media = new MediaService(pool, storage);
  let visited = 0;
  for (const accountId of accounts) {
    const gate = await pool.connect();
    let locked = false;
    try {
      locked = (await gate.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(44024,hashtext($1)) AS locked", [accountId])).rows[0]?.locked === true;
      if (!locked) continue;
      await media.retryPendingDeletes(accountId);
      visited += 1;
    } finally {
      if (locked) await gate.query("SELECT pg_advisory_unlock(44024,hashtext($1))", [accountId]).catch(() => undefined);
      gate.release();
    }
  }
  return visited;
}
