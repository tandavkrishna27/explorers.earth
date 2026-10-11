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

  it("retains global taxonomy authority outside the account lifecycle manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "fixtures/db/music-runtime-table-manifest.json"), "utf8"));
    for (const table of ["taxonomy_catalogs", "taxonomy_source_mappings", "taxonomy_legacy_slug_mappings", "taxonomy_import_receipts"]) {
      expect(manifest.migrationChain.controlTables).toContain(table);
      expect(manifest.tables.map((entry: { name: string }) => entry.name)).not.toContain(table);
      expect(inventoryRuntimeTables(repositoryRoot).applicationTables).toContain(table);
    }
  });

  it("discovers all Places0054 SQL relations and keeps private controls separate from personal runtime data", () => {
    const inventory = inventoryRuntimeTables(repositoryRoot);
    const sql = readFileSync(resolve(repositoryRoot, "tunes/migrations/0054_explorers_place_individual_pins.sql"), "utf8");
    const names = [...sql.matchAll(/CREATE TABLE public\.([a-z_]+)/g)].map(match => match[1]);
    expect(names).toEqual(["places_collection_mutation_state", "places_pin_validation_dirty", "places_chunk_validation_dirty", "collection_place_pins", "place_pin_drafts", "place_pin_draft_chunks", "place_pin_draft_items"]);
    expect(inventory.migrationTables).toEqual(expect.arrayContaining(names));
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "fixtures/db/music-runtime-table-manifest.json"), "utf8"));
    const runtime = manifest.tables.map((entry: { name: string }) => entry.name);
    for (const name of names.slice(0, 3)) {
      expect(manifest.migrationChain.controlTables).toContain(name);
      expect(runtime).not.toContain(name);
      expect(manifest.controlTablePolicies).toContainEqual(expect.objectContaining({name, managedBy: "unmanaged-raw-sql", family: "security-audit"}));
    }
    for (const name of names.slice(3)) {
      expect(manifest.tables).toContainEqual({ name, managedBy: "unmanaged-raw-sql", family: "user-content", lifecycle: "strip-on-deletion" });
      expect(manifest.migrationChain.controlTables).not.toContain(name);
    }
    const input = {manifestTables: runtime, controlTables: manifest.migrationChain.controlTables, referencedTables: inventory.applicationTables, migratedTables: [...inventory.drizzleTables, ...inventory.migrationTables], unmanagedTables: manifest.tables.filter((entry: { managedBy: string }) => entry.managedBy === "unmanaged-raw-sql").map((entry: {name: string}) => entry.name)};
    expect(() => validateRuntimeTableManifest(input)).not.toThrow();
    for (const name of names) expect(() => validateRuntimeTableManifest({...input, manifestTables: runtime.filter((entry: string) => entry !== name), controlTables: input.controlTables.filter((entry: string) => entry !== name)})).toThrow();
    expect(() => validateRuntimeTableManifest({...input, manifestTables: [...runtime, names[0]]})).toThrow(/both a runtime and control/);
    expect(() => validateRuntimeTableManifest({...input, manifestTables: [...runtime, runtime[0]]})).toThrow(/duplicate/);
    expect(() => validateRuntimeTableManifest({...input, controlTables: [...input.controlTables, input.controlTables[0]]})).toThrow(/duplicate/);
  });
  it("validates the committed manifest against generated repository references", () => {
    const inventory = inventoryRuntimeTables(repositoryRoot);
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "fixtures/db/music-runtime-table-manifest.json"), "utf8"));
    expect(() => validateRuntimeTableManifest({
      manifestTables: manifest.tables.map((entry: { name: string }) => entry.name),
      controlTables: manifest.migrationChain.controlTables,
      referencedTables: inventory.applicationTables,
      migratedTables: [...inventory.drizzleTables, ...inventory.migrationTables],
      unmanagedTables: manifest.tables.filter((entry: { managedBy: string }) => entry.managedBy === "unmanaged-raw-sql").map((entry: { name: string }) => entry.name),
    })).not.toThrow();
  });
});
