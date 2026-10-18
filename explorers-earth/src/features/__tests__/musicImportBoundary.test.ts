import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SOURCE_ROOT = join(__dirname, "..", "..");
const MUSIC_ROOT = join(SOURCE_ROOT, "features", "music");

// Emptied by P3-4, which removed the Music surface. features/music no longer exists, so
// this list must stay empty: nothing outside it may import Music again.
const REMOVED_IN_P3_4: readonly string[] = [];

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "__tests__" && path !== MUSIC_ROOT) sourceFiles(path, found);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * Every static, side-effect and dynamic import specifier, resolved against the
 * importing file. Matching the specifier text alone misses `../../music/...` from a
 * file two levels below `features/`.
 */
function importsMusic(path: string): boolean {
  const source = readFileSync(path, "utf8");
  const specifiers = [...source.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)].map((match) => match[1]);
  return specifiers.some((specifier) => {
    if (!specifier.startsWith(".")) return /(^|\/)features\/music\//.test(specifier);
    const target = resolve(dirname(path), specifier);
    return target === MUSIC_ROOT || target.startsWith(MUSIC_ROOT + sep);
  });
}

describe("Music import boundary", () => {
  it("has no production module outside features/music importing from it", () => {
    // Break caught: P3-4 deletes features/music/ and takes the public profile,
    // the dashboard layout, navigation and logout down with it.
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter(importsMusic)
      .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"))
      .filter((path) => !REMOVED_IN_P3_4.includes(path));
    expect(offenders).toEqual([]);
  });

  it("lists only files that still import Music, so the list cannot go stale", () => {
    const importers = new Set(sourceFiles(SOURCE_ROOT).filter(importsMusic)
      .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/")));
    expect(REMOVED_IN_P3_4.filter((path) => !importers.has(path))).toEqual([]);
  });

});
