import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = () => read("../../../migrations/0054_explorers_place_individual_pins.sql");
const routine = (sql: string, name: string) => sql.match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([^]*?END \\$\\$;`))?.[0] ?? "";

describe("Places pins forward migration source contract (resource free; PostgreSQL acceptance is separate)", () => {
  it("uses owned bigint live ranks and staging identities without live recommendation FKs or product caps", () => {
    const sql = migration();
    expect(sql).toContain("position bigint NOT NULL CHECK(position BETWEEN 0 AND 9007199254740990)");
    expect(sql).toContain("UNIQUE(collection_id,position) DEFERRABLE INITIALLY DEFERRED");
    expect(sql).toContain("REFERENCES public.collection_items(collection_id,recommendation_id) ON DELETE CASCADE");
    const items = sql.match(/CREATE TABLE public.place_pin_draft_items \([^]*?\n\);/)?.[0] ?? "";
    expect(items).toContain("PRIMARY KEY(draft_id,chunk_index,item_index)");
    expect(items).not.toContain("REFERENCES public.recommendations");
    expect(items).not.toMatch(/UNIQUE.*recommendation_id/);
    for (const column of ["expected_collection_revision", "expected_category_content_revision", "policy_snapshot", "accepted_bytes", "terminal_result", "acknowledgement"]) expect(sql).toContain(column);
    expect(sql).not.toMatch(/DEFAULT.*(?:interval|policy)/i);
  });

  it("preserves every latest typed scope branch while coordinating only Places", () => {
    const previous = read("../../../migrations/0050_explorers_guide_sections.sql");
    const sql = migration();
    for (const name of ["insert", "update", "delete"]) {
      const oldBody = routine(previous, `explorers_content_revision_${name}`);
      const newBody = routine(sql, `explorers_content_revision_${name}`);
      expect(oldBody).not.toBe("");
      for (const line of oldBody.split("\n").filter((line) => line.includes("scope_sql :=") || line.includes("TG_TABLE_NAME NOT IN"))) expect(newBody).toContain(line);
      expect(newBody).toContain("IF scope.category='places' THEN");
      expect(newBody).toContain("ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1");
      const restored = newBody
        .replace("  IF scope.category='places' THEN\n   PERFORM public.explorers_places_category_mutation(scope.account_id);\n  ELSE\n", "")
        .replace("  END IF;\n END LOOP;", " END LOOP;");
      expect(restored).toBe(oldBody);
    }
    expect(sql).toContain("places_last_mutation_xid xid8");
    expect(sql).toContain("pg_catalog.pg_current_xact_id()");
    expect(sql).not.toMatch(/set_config|current_setting|txid_current\(/);
  });

  it("preserves the guarded latest lifecycle purge and adds personal staging cleanup", () => {
    const oldBody = routine(read("../../../migrations/0053_explorers_taxonomy_catalogs.sql"), "purge_explorers_account_content");
    const newBody = routine(migration(), "purge_explorers_account_content");
    expect(oldBody).not.toBe("");
    expect(newBody.replace(" DELETE FROM public.place_pin_drafts WHERE account_id=target_account;\n", "")).toBe(oldBody);
  });

  it("routes actual live DML through private guarded collection authority and archive BEFORE cleanup", () => {
    const sql = migration();
    expect(sql).toContain("CREATE TRIGGER collection_place_pins_revision AFTER INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("CREATE TRIGGER places_collection_cleanup BEFORE UPDATE OR DELETE");
    expect(sql).toContain("NEW.revision:=OLD.revision+1");
    expect(sql).toContain("NEW.revision:=OLD.revision");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED FOR EACH ROW");
    for (const name of ["explorers_places_category_mutation", "explorers_places_collection_claim", "explorers_place_pins_revision", "explorers_place_pins_cleanup", "explorers_place_pins_validate", "explorers_place_draft_immutable"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*FROM PUBLIC,music_runtime`));
    }
    expect(sql).toContain("REVOKE ALL ON public.places_collection_mutation_state FROM PUBLIC,music_runtime");
    expect(sql).not.toMatch(/GRANT.*places_collection_mutation_state/);
  });

  it("adds the exact new public inventory and denies private helper capability", () => {
    const role = read("../../db/music-runtime-role.ts");
    for (const table of ["collection_place_pins", "place_pin_drafts", "place_pin_draft_chunks", "place_pin_draft_items", "places_collection_mutation_state"]) expect(role).toContain(`"${table}"`);
    for (const name of ["explorers_places_category_mutation(uuid)", "explorers_places_collection_claim(uuid)", "explorers_place_pins_revision()", "explorers_place_pins_cleanup()", "explorers_place_pins_validate()", "explorers_place_draft_immutable()"]) expect(role).toContain(`"${name}"`);
    expect(role).toContain('row.function_signature.startsWith("explorers_place")');
  });

  it("matches the migration function metadata and keeps inventories sorted and unique", () => {
    const role = read("../../db/music-runtime-role.ts");
    for (const name of ["expectedRuntimeTables", "expectedRuntimeFunctions"]) {
      const entries = [...(role.match(new RegExp(`const ${name} = \\[([^]*?)\\] as const;`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries).toEqual([...new Set(entries)].sort());
    }
    const created = [...migration().matchAll(/CREATE FUNCTION public\.(explorers_place\w+)\(([^)]*)\)/g)].map((match) => {
      const types = match[2].split(",").filter(Boolean).map((arg) => arg.trim().split(/\s+/).at(-1));
      return `${match[1]}(${types.join(",")})`;
    }).sort();
    const inventoried = [...role.matchAll(/"(explorers_place[^\"]+)"/g)].map((match) => match[1]).filter((name) => name.includes("(")).sort();
    expect(inventoried).toEqual(created);
    for (const signature of created) expect(role).toContain(signature);
  });

  it("narrows login provisioning after broad grants and denies every marker operation", () => {
    const role = read("../../db/music-runtime-role.ts");
    const provisioning = role.slice(role.indexOf("export async function provisionMusicRuntimeLogin"));
    expect(provisioning.indexOf("REVOKE ALL ON places_collection_mutation_state")).toBeGreaterThan(provisioning.indexOf("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES"));
    expect(provisioning.indexOf("REVOKE ALL ON FUNCTION explorers_places_category_mutation")).toBeGreaterThan(provisioning.indexOf("GRANT EXECUTE ON ALL FUNCTIONS"));
    expect(provisioning).toContain("REVOKE UPDATE,TRUNCATE,REFERENCES,TRIGGER ON place_pin_draft_chunks,place_pin_draft_items");
    expect(role).toContain('"SELECT * FROM places_collection_mutation_state LIMIT 0"');
    expect(role).toContain('"INSERT INTO places_collection_mutation_state DEFAULT VALUES"');
    expect(role).toContain('"DELETE FROM places_collection_mutation_state WHERE false"');
    expect(role).toContain('"SELECT explorers_places_collection_claim(NULL::uuid)"');
  });

  it("prevents later edits to acknowledged chunk contents and validates complete chunk shape", () => {
    const sql = migration();
    expect(sql).toContain("CREATE FUNCTION public.explorers_place_chunk_validate()");
    expect(sql).toContain("Accepted chunk deletion requires terminal draft");
    expect(sql).toContain("Chunk item count and ordinals must match accepted content");
    expect(sql).toContain("place_pin_draft_chunks_dirty AFTER INSERT");
    expect(sql).toContain("place_pin_draft_items_dirty AFTER INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.explorers_place_chunk_validate() FROM PUBLIC,music_runtime");
    expect(sql).toContain("IF draft_state='open'");
    const chunkValidator = routine(sql, "explorers_place_chunk_validate");
    expect(chunkValidator).toContain("IF FOUND THEN");
    expect(chunkValidator).toMatch(/END IF;\n DELETE FROM public\.places_chunk_validation_dirty/);
    expect(sql.indexOf("UPDATE public.place_pin_drafts SET state='aborted'")).toBeLessThan(sql.indexOf("DELETE FROM public.place_pin_draft_chunks WHERE draft_id IN"));
  });

  it("coalesces deferred full scans through private dirty scopes and requeues later changes", () => {
    const sql = migration();
    for (const table of ["places_pin_validation_dirty", "places_chunk_validation_dirty"]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC,music_runtime`);
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*${table}`));
    }
    expect(sql).toContain("PRIMARY KEY(validation_xid,collection_id)");
    expect(sql).toContain("PRIMARY KEY(validation_xid,draft_id,chunk_index)");
    expect(sql).toContain("ON CONFLICT(validation_xid,collection_id) DO NOTHING");
    expect(sql).toContain("ON CONFLICT(validation_xid,draft_id,chunk_index) DO NOTHING");
    expect(sql).toContain("places_pin_validation_final AFTER INSERT ON public.places_pin_validation_dirty DEFERRABLE INITIALLY DEFERRED");
    expect(sql).toContain("places_chunk_validation_final AFTER INSERT ON public.places_chunk_validation_dirty DEFERRABLE INITIALLY DEFERRED");
    const pins = routine(sql, "explorers_place_pins_validate");
    const chunks = routine(sql, "explorers_place_chunk_validate");
    expect(pins).toContain("DELETE FROM public.places_pin_validation_dirty");
    expect(chunks).toContain("DELETE FROM public.places_chunk_validation_dirty");
    expect(pins).not.toContain("FOR target IN");
    expect(chunks).toContain("validation_xid=NEW.validation_xid");
    expect(sql).not.toMatch(/CREATE CONSTRAINT TRIGGER \w+ (?:AFTER INSERT OR UPDATE OR DELETE|AFTER INSERT) ON public\.(?:collection_place_pins|place_pin_draft_items|place_pin_draft_chunks)/);
    const role = read("../../db/music-runtime-role.ts");
    for (const table of ["places_pin_validation_dirty", "places_chunk_validation_dirty"]) {
      expect(role).toContain(`"${table}"`);
      expect(role).toContain(`"SELECT * FROM ${table} LIMIT 0"`);
    }
  });
});
