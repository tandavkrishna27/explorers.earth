import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(__dirname, "../../../..");
const legacy = [
  "features/Movies/components/dashboard/TopPicksManager.tsx",
  "features/Books/components/dashboard/TopReadsManager.tsx",
  "features/Games/components/dashboard/TopGamesManager.tsx",
];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("one Top Picks manager", () => {
  it.each(legacy)("%s is deleted", (file) => {
    expect(existsSync(join(src, file))).toBe(false);
  });
  it("nothing imports a legacy per-category manager", () => {
    const offenders = files(src)
      .filter((f) => !f.endsWith("legacyManagersGone.test.ts"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        const legacySpecifier = /from\s+["'][^"']*(TopReadsManager|TopGamesManager|components\/dashboard\/TopPicksManager)["']/.test(text);
        const moviesSibling = f.includes(join("features", "Movies")) && /from\s+["']\.\/TopPicksManager["']/.test(text);
        return legacySpecifier || moviesSibling;
      });
    expect(offenders).toEqual([]);
  });
});
