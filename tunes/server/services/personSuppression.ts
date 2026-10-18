import type { Pool } from "pg";

/**
 * The write path for person_entity_details.suppressed_at (0045). A recommended person has
 * no account, so a takedown is an operator action: it runs as the migrator, never the
 * runtime role (which 0045 grants only SELECT,INSERT), and every change leaves one row in
 * person_suppression_actions naming who did it and why. Before this, a takedown was
 * hand-written SQL with no record at all.
 *
 * Idempotent: asking for the state the person is already in changes nothing and records
 * nothing, so a re-run after a lost reply cannot stack audit rows or move suppressed_at.
 */
export type PersonSuppressionCommand = {
  entityId: string;
  action: "suppress" | "restore";
  reason: string;
  operator: string;
};

export type PersonSuppressionReceipt = {
  entityId: string;
  action: "suppress" | "restore";
  changed: boolean;
  auditId: string | null;
  previousSuppressedAt: string | null;
  suppressedAt: string | null;
};

export class PersonSuppressionError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const boundedText = (value: string, max: number) =>
  value.length >= 1 && value.length <= max && value.trim().length > 0 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value);

export function validatePersonSuppressionCommand(command: PersonSuppressionCommand): PersonSuppressionCommand {
  if (!uuid.test(command.entityId)) throw new PersonSuppressionError("entity id must be a UUID");
  if (command.action !== "suppress" && command.action !== "restore") throw new PersonSuppressionError("action must be suppress or restore");
  if (!boundedText(command.reason, 1000)) throw new PersonSuppressionError("reason must be 1-1000 visible characters");
  if (!boundedText(command.operator, 200) || /[\n\r\t]/.test(command.operator)) throw new PersonSuppressionError("operator must be 1-200 visible characters on one line");
  return { ...command, entityId: command.entityId.toLowerCase() };
}

const iso = (value: Date | null) => value ? value.toISOString() : null;

export async function readPersonSuppression(pool: Pick<Pool, "query">, entityId: string): Promise<{ title: string; suppressedAt: string | null }> {
  if (!uuid.test(entityId)) throw new PersonSuppressionError("entity id must be a UUID");
  const row = (await pool.query<{ title: string; suppressed_at: Date | null }>(
    `SELECT e.title,p.suppressed_at FROM person_entity_details p JOIN entities e ON e.id=p.entity_id AND e.kind='person'
     WHERE p.entity_id=$1`, [entityId])).rows[0];
  if (!row) throw new PersonSuppressionError("no person entity has that id");
  return { title: row.title, suppressedAt: iso(row.suppressed_at) };
}

export async function applyPersonSuppression(pool: Pool, raw: PersonSuppressionCommand): Promise<PersonSuppressionReceipt> {
  const command = validatePersonSuppressionCommand(raw);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = (await db.query<{ suppressed_at: Date | null }>(
      `SELECT p.suppressed_at FROM person_entity_details p JOIN entities e ON e.id=p.entity_id AND e.kind='person'
       WHERE p.entity_id=$1 FOR UPDATE OF p`, [command.entityId])).rows[0];
    if (!current) throw new PersonSuppressionError("no person entity has that id");
    const previous = current.suppressed_at;
    if ((command.action === "suppress") === (previous !== null)) {
      await db.query("COMMIT");
      return { entityId: command.entityId, action: command.action, changed: false, auditId: null,
        previousSuppressedAt: iso(previous), suppressedAt: iso(previous) };
    }
    const next = (await db.query<{ suppressed_at: Date | null }>(
      `UPDATE person_entity_details SET suppressed_at=CASE WHEN $2='suppress' THEN clock_timestamp() ELSE NULL END
       WHERE entity_id=$1 RETURNING suppressed_at`, [command.entityId, command.action])).rows[0].suppressed_at;
    const audit = (await db.query<{ id: string }>(
      `INSERT INTO person_suppression_actions(entity_id,action,reason,operator,previous_suppressed_at,resulting_suppressed_at)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [command.entityId, command.action, command.reason, command.operator, previous, next])).rows[0].id;
    await db.query("COMMIT");
    return { entityId: command.entityId, action: command.action, changed: true, auditId: audit,
      previousSuppressedAt: iso(previous), suppressedAt: iso(next) };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}
