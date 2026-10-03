import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inventoryRuntimeTables, validateRuntimeTableManifest } from "../../../scripts/inventory-runtime-tables.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("runtime table manifest", () => {
  it("discovers executable SQL literals without treating comments, prose, or test fixtures as runtime tables", () => {
    // Break caught: regex spanning source-level prose invents tables, and test
    // fixtures can incorrectly become runtime migration requirements.
    const root = mkdtempSync(resolve(tmpdir(), "music-table-inventory-"));
    try {
      mkdirSync(resolve(root, "tunes/shared"), { recursive: true });
      mkdirSync(resolve(root, "tunes/server/test"), { recursive: true });
      writeFileSync(resolve(root, "tunes/shared/schema.ts"), 'export const users = pgTable("users", {});');
      writeFileSync(resolve(root, "tunes/server/runtime.ts"), [
        '// sql`SELECT * FROM a` is an example, not a query.',
        '/* db.query(`SELECT * FROM an`) */',
        'const prose = "sql`SELECT * FROM invented`";',
        'db.query(`DELETE FROM real_deletions WHERE id = $1`);',
        'db.query("SELECT * FROM real_reads JOIN real_joined ON true");',
        "db.query('UPDATE real_updates SET value = 1');",
        'const result = sql`INSERT INTO real_inserts (id) VALUES (${id})`;',
        'db.query(`SELECT extract(epoch FROM expires_at), id FROM real_reads`);',
        'db.query<{ id: number }>(`WITH RECURSIVE incoming(id) AS (SELECT id FROM real_reads) SELECT * FROM incoming`);',
        'db.query(`WITH eligible AS MATERIALIZED (SELECT id FROM real_reads), ranked AS NOT MATERIALIZED (SELECT id FROM eligible) SELECT * FROM ranked`);',
        'db.query(`SELECT * FROM ${table} ORDER BY id`);',
        'const TABLE_NAME = "real_constant"; db.query(`SELECT * FROM ${TABLE_NAME}`);',
        'db.query(`SELECT * FROM public.real_qualified`);',
        'db.query(`SELECT * FROM public.${table} ORDER BY id`);',
        'db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);',
        'for (const probe of ["SELECT * FROM real_probes LIMIT 0"]) db.query(probe);',
        'db.query(`SELECT * FROM real_reads JOIN LATERAL unnest(ids) value ON true`);',
      ].join("\n"));
      writeFileSync(resolve(root, "tunes/server/test/fixture.test.ts"), 'db.query("SELECT * FROM fixture_only");');
      expect(inventoryRuntimeTables(root).rawSqlTables).toEqual([
        "real_constant", "real_deletions", "real_inserts", "real_joined", "real_probes", "real_qualified", "real_reads", "real_updates",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("discovers the real raw-SQL deletion dependencies", () => {
    // Production break caught: clean cutover can omit unmanaged tables that are
    // referenced only by raw SQL in the user deletion transaction.
    const inventory = inventoryRuntimeTables(repositoryRoot);
    expect(inventory.rawSqlTables).toEqual(expect.arrayContaining([
      "youtube_music_playlists",
      "youtube_music",
      "youtube_tokens",
      "youtube_playlists",
      "widgets",
      "youtube_api_calls",
      "playback_states",
    ]));
    expect(inventory.rawSqlTables).not.toContain("skip");
    expect(inventory.rawSqlTables).not.toContain("set");
  });

  it("validates the committed manifest against generated repository references", () => {
    const inventory = inventoryRuntimeTables(repositoryRoot);
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "fixtures/db/music-runtime-table-manifest.json"), "utf8"));
    expect(() => validateRuntimeTableManifest({
      manifestTables: manifest.tables.map((entry: { name: string }) => entry.name),
      controlTables: manifest.migrationChain.controlTables,
      referencedTables: inventory.applicationTables,
      migratedTables: inventory.drizzleTables,
      unmanagedTables: manifest.tables.filter((entry: { managedBy: string }) => entry.managedBy === "unmanaged-raw-sql").map((entry: { name: string }) => entry.name),
    })).not.toThrow();
  });
});
