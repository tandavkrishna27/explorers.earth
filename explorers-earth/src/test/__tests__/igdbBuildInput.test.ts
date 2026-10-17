/**
 * Ticket 4.2:38 — no IGDB provider credential may be a browser build input.
 *
 * The obligation is that the IGDB client-secret variable "disappear from runtime browser
 * code **and build inputs**". Runtime code was already clean; the build inputs were not.
 * `e2e/general.vite.config.ts` declared both the IGDB client id and client secret as Vite
 * `define` entries set to `''`, and an empty value does not satisfy the obligation: a
 * *declared* browser build input for a provider client secret is the thing forbidden,
 * whatever it happens to hold.
 *
 * Why this test exists rather than just the deletion: there was already a guard, and it
 * could not see this. `contained-unit.launcher.test.ts` scans for VITE identifiers and
 * permits the IGDB secret in exactly one file — but it scans **`src/` only**, so a
 * declaration under `e2e/` was outside its reach. That blind spot is why the declaration
 * survived to be found by a ticket audit rather than by CI.
 *
 * **Every provider identifier here is composed at runtime, never written as a literal.**
 * That is required, not stylistic: the launcher guard reads this file too, matches
 * `VITE_[A-Z0-9_]+`, requires each identifier it finds to exist in the synthetic
 * environment, and forbids any `import.meta.env` reference to the secret. A literal
 * mention in a comment or a regex here would be indistinguishable from a real declaration
 * and would fail that guard — the same trap that made two banned-word assertions in this
 * repository fail on their own prose. Composing the names keeps this file's text clean, so
 * the existing guard needed no widening to accommodate it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../../..");
const repoRoot = resolve(appRoot, "..");

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", ".artifacts",
  ".replatform-local", "playwright-report", "test-results", ".vite"]);

/** Assembled so this file contains no literal provider-variable token. */
const PREFIX = `VITE_${"IGDB"}_`;
const SECRET = `${PREFIX}CLIENT_SECRET`;
const anyIgdb = new RegExp(`${PREFIX}[A-Z0-9_]+`);
const buildInput = new RegExp(`import\\.meta\\.env\\.${PREFIX}[A-Z0-9_]+`);

function sources(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".music-cli-contract-isolated-") || SKIP.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(?:ts|tsx|js|cjs|mjs|json|ya?ml)$/.test(entry.name)) found.push(absolute);
    }
  };
  walk(root);
  return found;
}

const posix = (file: string) => relative(repoRoot, file).replaceAll("\\", "/");

describe("IGDB credentials are not a browser build input (ticket 4.2:38)", () => {
  /*
   * `explorers-earth` plus the workflow directory covers both halves of the obligation:
   * `:38`'s build inputs and `:43`'s "workflow/build secret injection".
   */
  const files = [...sources(appRoot), ...sources(join(repoRoot, ".github"))];
  const self = resolve(__dirname, "igdbBuildInput.test.ts");

  it("scans a non-trivial set, so the assertions below are not vacuous", () => {
    // A broken walk would return nothing and everything after this would pass for free.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((file) => posix(file).endsWith("explorers-earth/e2e/general.vite.config.ts"))).toBe(true);
    expect(files.some((file) => posix(file).includes(".github/workflows/"))).toBe(true);
  });

  /*
   * Test files are excluded from the build-input check, and narrowly: a Vite `define` lives
   * in a config, never in a test, so this cannot hide the real case —
   * `e2e/general.vite.config.ts` is a config and is still covered.
   */
  const isTest = (file: string) => {
    const path = posix(file);
    return path.includes("/__tests__/") || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
  };

  it("declares no IGDB value as an import.meta.env build input", () => {
    const offenders = files.filter((file) => file !== self && !isTest(file))
      .filter((file) => buildInput.test(readFileSync(file, "utf8")))
      .map(posix);
    expect(offenders).toEqual([]);
  });

  it("injects no IGDB secret from a workflow", () => {
    const offenders = files.filter((file) => posix(file).includes(".github/"))
      .filter((file) => anyIgdb.test(readFileSync(file, "utf8")))
      .map(posix);
    expect(offenders).toEqual([]);
  });

  it("keeps the credential out of runtime browser code entirely", () => {
    // Broader than the build-input form: no runtime module may name it at all. Tests may,
    // in order to assert its absence, so only non-test sources are checked.
    const offenders = files
      .filter((file) => posix(file).includes("explorers-earth/src/") && !isTest(file))
      .filter((file) => anyIgdb.test(readFileSync(file, "utf8")))
      .map(posix);
    expect(offenders).toEqual([]);
  });

  it("keeps the two existing guards in place, so excluding tests hides nothing", () => {
    /*
     * The price of that exclusion: if the other guards were deleted, nothing would notice.
     * So they are asserted present by content, with the expected substrings composed for
     * the same reason the patterns are.
     */
    const launcher = readFileSync(resolve(appRoot, "src/test/__tests__/contained-unit.launcher.test.ts"), "utf8");
    expect(launcher).toContain(SECRET);
    expect(launcher).toContain(`not.toContain('import.meta.env.${SECRET}')`);
    const local = readFileSync(resolve(appRoot, "src/features/music/__tests__/replatformLocalVite.test.ts"), "utf8");
    expect(local).toContain(`expect(config.env.${SECRET}).toBeUndefined()`);
  });
});
