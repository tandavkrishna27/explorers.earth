/**
 * READ-ONLY report: existing creator accounts whose handle the current shared rules refuse
 * (reserved route/word, profanity, malformed). Changes nothing. Usage:
 *   DATABASE_URL=... npx tsx scripts/list-reserved-handle-holders.ts
 */
import pg from "pg";
import { handleRuleViolations } from "../shared/explorersReservedHandles";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query<{ id: string; handle: string; status: string }>(
      "SELECT id, handle, status FROM creator_accounts WHERE handle IS NOT NULL ORDER BY handle");
    await client.query("ROLLBACK");
    const hits = rows.map((r) => ({ ...r, violations: handleRuleViolations(r.handle) })).filter((r) => r.violations.length > 0);
    console.table(hits.map((r) => ({ id: r.id, handle: r.handle, status: r.status, violations: r.violations.join(",") })));
    console.log(`${hits.length} of ${rows.length} accounts hold a handle the current rules refuse`);
  } finally { client.release(); }
} finally { await pool.end(); }
