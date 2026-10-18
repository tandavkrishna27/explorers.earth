import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(__dirname, "..", "..");

/**
 * vite.platform.config.ts sets `envDir: false` and `envPrefix: []`, so a platform
 * build inlines NO environment variable of any prefix. Every direct
 * `import.meta.env.VITE_*` read evaluates to `undefined` in production and falls
 * through to its `||` default. The build succeeds, the bundle check passes, and
 * the failure only appears in a browser.
 */
function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") sourceFiles(path, found);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

function offenders(pattern: RegExp, allowed: readonly string[] = []): string[] {
  return sourceFiles(SOURCE_ROOT)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"))
    .filter((path) => !allowed.includes(path));
}

/**
 * Every statement that mentions a localhost origin must hand it to `runtimeOrigin()`,
 * which substitutes the runtime config's origin in a platform build. Statements are a
 * coarse split on `;`, which is enough to separate these one-expression builders.
 */
function unguardedLocalhostOrigins(): string[] {
  return sourceFiles(SOURCE_ROOT)
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      if (!/localhost:1337/.test(source)) return false;
      return source
        .replace(/\s+/g, " ")
        .split(";")
        .filter((statement) => statement.includes("localhost:1337"))
        .some((statement) => !statement.includes("runtimeOrigin("));
    })
    .map((path) => relative(SOURCE_ROOT, path).replace(/\\/g, "/"));
}

describe("platform build leaks", () => {
  it("routes the Google Maps browser key through exactly one module", () => {
    // Break caught: a platform build ships with every map, Places autocomplete and
    // Street View call missing its key. They fail per-request, so the page renders
    // and only the maps are blank.
    expect(offenders(/import\.meta\.env\.VITE_GOOGLE_MAPS_API_KEY/,
      ["lib/publicRuntimeConfig.ts"])).toEqual([]);
  });

  it("never reaches Strapi from a hardcoded origin", () => {
    // Break caught: Register.tsx sends the user to Strapi's OAuth endpoint
    // regardless of build mode, so sign-up depends on the system being retired.
    expect(offenders(/api\.localqr\.earth/)).toEqual([]);
  });

  it("never reaches a localhost origin outside the runtime-origin guard", () => {
    // Break caught: seven image-URL builders defaulted to http://localhost:1337 when
    // VITE_REST_API_URL is undefined, which it always is in a platform build. Every
    // profile and recommendation image became a blocked mixed-content request with
    // no error anywhere — the single most visible cutover defect.
    //
    // The literal survives as runtimeOrigin()'s legacy argument, which is the
    // convention the eight existing callers already use (publicMusicClient.ts:313),
    // and runtimeOrigin() returns the runtime config's origin whenever
    // isCanonicalRuntime() holds. So the invariant is not "the string is absent" but
    // "no statement reaches that origin without the guard" — a raw fallback added to
    // a new builder still fails here.
    expect(unguardedLocalhostOrigins()).toEqual([]);
  });
});
