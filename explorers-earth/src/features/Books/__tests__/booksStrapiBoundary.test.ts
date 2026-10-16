/**
 * Ticket 3.3's `**Done:**` clause says "no Books flow requires Strapi", and the ticket's
 * own review records that as **unproven at an exact SHA**: the real-backend Books spec
 * runs against a local owned fixture only, appears in no workflow, and so has never been
 * re-attested hosted at a named commit.
 *
 * This discharges the **static half** of that, and only that half. It proves that no
 * module reachable from the Books feature can reach Strapi, at whatever commit it runs
 * on. It cannot prove anything about a hosted runtime, which is what the remaining
 * obligation at ticket-3-3.md:50 asks for - a passing closure walk is not a hosted
 * attestation and must not be cited as one.
 *
 * Why a closure walk rather than a file list: `legacyMusicBoundary.test.ts` lists seven
 * files by hand, which is exact today and silently incomplete the moment the feature
 * gains a module. Walking the import graph from the feature's public entry point cannot
 * go stale that way - a new import pulls its target into the assertion automatically.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
/** The feature's public surface: what the route files actually import. */
const ENTRY = "src/features/Books/index.ts";

function resolveImport(fromAbsolute: string, specifier: string): string | null {
  // Only relative specifiers: a bare specifier is a package, which is not this feature's
  // source and is covered by the dependency audit instead.
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromAbsolute), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`,
    resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function closure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [resolve(root, entry)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    // Tests are not shipped and may legitimately mention a retired surface in order to
    // assert against it, so they are not part of the production closure.
    if (seen.has(file) || /__tests__|\.test\.tsx?$/.test(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

/**
 * Comments are blanked so prose naming a retired surface is never read as code.
 *
 * The CRLF normalisation is required, not cosmetic. This repository is CRLF throughout,
 * and splitting on a newline leaves a trailing carriage return on each line; a carriage
 * return is a regex line terminator, so `.` will not match it and `$` without the `m`
 * flag anchors only at the end of the whole string. Without normalising first, the
 * line-comment strip below matches nothing. `check-retired-dependencies.mjs` had the same
 * defect and was fixed in the same change.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

describe("Books has no Strapi in its import closure", () => {
  const files = closure(ENTRY);
  const sources = files.map((file) => ({ path: relative(root, file).replaceAll("\\", "/"),
    code: codeOnly(readFileSync(file, "utf8")) }));
  const matching = (pattern: RegExp) =>
    sources.filter((source) => pattern.test(source.code)).map((source) => source.path);

  it("reaches a non-trivial closure, so the assertions below are not vacuous", () => {
    // Guards the walk itself. A broken resolver would return just the entry file and
    // every assertion below would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
    expect(sources.some((source) => source.path.endsWith("src/features/Books/index.ts"))).toBe(true);
    expect(sources.some((source) => source.path.includes("components/dashboard/BookListView"))).toBe(true);
    expect(sources.some((source) => source.path.includes("components/public/PublicBooks"))).toBe(true);
  });

  it("executes no GraphQL operation and holds no GraphQL document", () => {
    // Execution, not import: a `gql` document with no executor cannot reach a server, and
    // the retired documents elsewhere in the tree are exactly that. Both are asserted here
    // because Books should have neither.
    expect(matching(/useQuery\s*\(|useMutation\s*\(|useLazyQuery\s*\(|useApolloClient\s*\(/)).toEqual([]);
    expect(matching(/\.(?:query|mutate)\s*\(/)).toEqual([]);
    expect(matching(/gql`/)).toEqual([]);
    expect(matching(/@apollo\/client/)).toEqual([]);
  });

  it("reads no Strapi origin, for data or for assets", () => {
    /*
     * `VITE_REST_API_URL` and `VITE_API_URL` are the Strapi REST and GraphQL origins.
     * Both are asserted absent because the variable does two jobs in this codebase -
     * Strapi API calls and legacy asset-origin concatenation - and Books needs neither:
     * `bookHelpers.buildCoverUrl` returns "" for an unrecognised relative path instead of
     * pointing it at another host.
     */
    expect(matching(/VITE_REST_API_URL|VITE_API_URL/)).toEqual([]);
    expect(matching(/localhost:1337|:1337\b/)).toEqual([]);
    // Strapi's own REST shapes, in case an origin arrives by another route.
    expect(matching(/\/api\/users\/me|usersPermissionsUser|\/send-email-confirmation|\/upload\/files\//)).toEqual([]);
    expect(matching(/documentId.*filters%5B|filters%5B/)).toEqual([]);
  });

  it("names Strapi only as an erased type, and in exactly two known files", () => {
    /*
     * The closure does still say "Strapi", and the distinction matters: every occurrence is
     * the TypeScript interface `StrapiMedia`, which is erased at build time and cannot
     * reach a server. A naming residue is ticket 8.3's mechanical rename, not a dependency.
     *
     * Pinned to the two files rather than allowed everywhere, so a *new* kind of mention -
     * a value, an import, a URL - fails here instead of blending into a blanket exemption.
     */
    expect(matching(/\bstrapi/i)).toEqual([
      "src/features/Books/types/index.ts",
      "src/features/Games/types/index.ts",
    ]);
    for (const source of sources) {
      for (const line of source.code.split("\n").filter((text) => /\bstrapi/i.test(text))) {
        expect(line, `${source.path} mentions Strapi outside a type position`).toMatch(/StrapiMedia/);
      }
    }
  });
});
