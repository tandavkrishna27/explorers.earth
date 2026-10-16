import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMusicMigrations } from "../../db/migrate";

describe("canonical Music numeric retirement schema", () => {
  it("retains canonical numeric IDs without fabricating a Strapi tombstone", () => {
    const migration = loadMusicMigrations().find(({ id }) => id === "0052_canonical_music_numeric_retirement");
    expect(migration).toBeDefined();
    const sql = migration!.sql;
    expect(sql).toMatch(/CREATE TABLE public\.canonical_music_numeric_retirements/);
    expect(sql).toMatch(/REFERENCES public\.account_lifecycle_operations\(id,account_id\) ON DELETE RESTRICT/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE/);
    expect(sql).toMatch(/BEFORE UPDATE OF id ON public\.users/);
    const release = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION finalize_canonical_music_venue_deletion"));
    expect(release.indexOf("lock_music_numeric_user_id(p_music_user_id)")).toBeLessThan(release.indexOf("FOR UPDATE"));
    expect(release.indexOf("INSERT INTO public.canonical_music_numeric_retirements")).toBeLessThan(release.indexOf("DELETE FROM users"));
    expect(release).not.toMatch(/INSERT INTO music_identity_tombstones/);
  });

  it("repairs and attests immutable runtime retirement permissions", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../db/music-runtime-role.ts"), "utf8");
    expect(source).toContain('"canonical_music_numeric_retirements"');
    expect(source).toMatch(/REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\s+ON canonical_music_numeric_retirements/);
    expect(source).toMatch(/row\.object_name === "canonical_music_numeric_retirements"\s*\? \[true, true, false, false\]/);
    for (const inventory of ["expectedRuntimeTables", "expectedRuntimeFunctions"]) {
      const body = source.split(`const ${inventory} = [`)[1].split("] as const")[0];
      const names = Array.from(body.matchAll(/"([^"]+)"/g), match => match[1]);
      expect(names).toEqual([...names].sort());
    }
  });
});
