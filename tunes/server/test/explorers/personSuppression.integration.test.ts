import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPersonSuppression, PersonSuppressionError, readPersonSuppression } from "../../services/personSuppression";

let pool: pg.Pool;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 2 }); });
afterAll(async () => { await pool?.end(); });

async function person(kind = "person") {
  const id = (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Suppressible Person','manual') RETURNING id", [kind])).rows[0].id as string;
  if (kind === "person") await pool.query("INSERT INTO person_entity_details(entity_id) VALUES($1)", [id]);
  return id;
}
const audit = async (entityId: string) => (await pool.query(
  "SELECT action,reason,operator,previous_suppressed_at,resulting_suppressed_at FROM person_suppression_actions WHERE entity_id=$1 ORDER BY created_at,id", [entityId])).rows;

describe("person suppression write path (P5-9)", () => {
  it("suppresses and restores with one attributed audit row per change", async () => {
    // Break caught: takedowns were hand-written UPDATEs that left no record of who
    // removed a person, when, or why.
    const entityId = await person();
    const suppressed = await applyPersonSuppression(pool, { entityId, action: "suppress", reason: "Asked to be removed", operator: "Ops A" });
    expect(suppressed).toMatchObject({ entityId, action: "suppress", changed: true, previousSuppressedAt: null });
    expect(suppressed.suppressedAt).not.toBeNull();
    expect((await readPersonSuppression(pool, entityId)).suppressedAt).toBe(suppressed.suppressedAt);

    // A re-run after a lost reply changes nothing and stacks no audit row.
    const repeat = await applyPersonSuppression(pool, { entityId, action: "suppress", reason: "retry", operator: "Ops A" });
    expect(repeat).toMatchObject({ changed: false, auditId: null, suppressedAt: suppressed.suppressedAt });

    const restored = await applyPersonSuppression(pool, { entityId, action: "restore", reason: "Request withdrawn", operator: "Ops B" });
    expect(restored).toMatchObject({ changed: true, previousSuppressedAt: suppressed.suppressedAt, suppressedAt: null });
    const rows = await audit(entityId);
    expect(rows.map(({ action, reason, operator }) => ({ action, reason, operator }))).toEqual([
      { action: "suppress", reason: "Asked to be removed", operator: "Ops A" },
      { action: "restore", reason: "Request withdrawn", operator: "Ops B" },
    ]);
    expect(rows[0].previous_suppressed_at).toBeNull();
    expect(rows[1].resulting_suppressed_at).toBeNull();
  });

  it("refuses an unknown or non-person entity without writing", async () => {
    await expect(applyPersonSuppression(pool, { entityId: randomUUID(), action: "suppress", reason: "x", operator: "o" }))
      .rejects.toBeInstanceOf(PersonSuppressionError);
    const book = await person("book");
    await expect(applyPersonSuppression(pool, { entityId: book, action: "suppress", reason: "x", operator: "o" }))
      .rejects.toBeInstanceOf(PersonSuppressionError);
    expect(await audit(book)).toEqual([]);
  });

  it("keeps the audit append-only and out of the runtime role's reach", async () => {
    const entityId = await person();
    await applyPersonSuppression(pool, { entityId, action: "suppress", reason: "Takedown", operator: "Ops" });
    await expect(pool.query("UPDATE person_suppression_actions SET reason='edited' WHERE entity_id=$1", [entityId])).rejects.toMatchObject({ code: "42501" });
    await expect(pool.query("DELETE FROM person_suppression_actions WHERE entity_id=$1", [entityId])).rejects.toMatchObject({ code: "42501" });
    const grants = (await pool.query(`SELECT has_table_privilege('music_runtime','person_suppression_actions','SELECT') AS can_read,
      has_table_privilege('music_runtime','person_suppression_actions','INSERT') AS can_write,
      has_table_privilege('music_runtime','person_entity_details','UPDATE') AS can_suppress`)).rows[0];
    expect(grants).toEqual({ can_read: false, can_write: false, can_suppress: false });
  });
});
