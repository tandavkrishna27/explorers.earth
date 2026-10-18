#!/usr/bin/env node
/**
 * Ticket 8.1a's static scan, made absolute by P6-3: a ratchet on the production server's
 * Strapi coupling.
 *
 * It does NOT assert that Strapi is retired — it is not, and the legacy-music
 * server still speaks to it by design until P3-7 deletes that path. What it
 * asserts is measured over the union of the static import closures of every
 * entry point a production container runs (PRODUCTION_ENTRIES):
 *
 *   1. no Strapi client is constructed anywhere in the closure;
 *   2. no module in the closure names a STRAPI_* identifier or string in code;
 *   3. no Strapi-named module enters the closure;
 *   4. the closure is complete (every relative, `@shared/*` and `#auth-runtime`
 *      import resolves) and no smaller than MINIMUM_MODULES.
 *
 * The allowlists are empty since P6-3 and stay as checked arrays: re-adding an entry
 * is a decision someone has to write down here with a reason and a disposition, and
 * an entry that no longer matches a site still fails as stale. The failure mode this
 * guards against is coupling creeping back in one import at a time while every suite
 * stays green.
 *
 * Full classification and the evidence behind each former allowlist entry:
 * docs/replatform-audit/strapi-server-classification.md
 *
 * Usage: node scripts/check-retired-dependencies.mjs [--json]
 * Test-only: [--root <dir> --entry <path relative to root> ...] scans a fixture tree instead.
 * Exit 0 when every invariant holds, 1 on a violation, 2 on a scan error.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tunesRoot = join(repositoryRoot, "tunes");

/**
 * Every entry point a production container runs: the API (canonicalStartup, via
 * server/api.ts in canonical mode), the `migrate` service (deploy/production.compose.yml)
 * and the reviewed-taxonomy apply command the cutover runbook runs in that service.
 *
 * Left out until P3-7 has dealt with them, and added back by P6-12 if they survive:
 * server/api.ts (reaches the whole legacy composition until P3-7 collapses apiMode),
 * server/deployment/run-registration-compat.ts (Music-only; P3-7 deletes it) and
 * server/deployment/run-production-graph-smoke.ts (imports server/app.ts).
 */
const PRODUCTION_ENTRIES = [
  "server/auth/canonicalStartup.ts",
  "server/deployment/run-migration-gate.ts",
  "scripts/apply-reviewed-taxonomy.ts",
];

/** 90% of the measured union (P6-3, 2026-10-19), rounded down. A mis-resolved entry point fails this instead of passing clean. */
const MINIMUM_MODULES = 135; // measured union 150 (canonical 143, migrate gate 11, taxonomy 8)

/** Sites inside the closure that may name a STRAPI_* variable. Empty since P6-3. */
const ENV_READ_ALLOWLIST = [];

/** Strapi-named modules permitted inside the closure. Empty since 2026-10-09. */
const MODULE_ALLOWLIST = [];

/** Constructions that would mean a production request can reach Strapi. */
const CLIENT_CONSTRUCTION = /new\s+(Strapi[A-Za-z]*)\s*\(/;

/**
 * Strapi client constructions permitted inside the closure. Empty since P6-2, which
 * deleted the historical analytics read and the legacy analytics composition that
 * constructed StrapiAnalyticsPublisher and StrapiAnalyticsTargetValidator.
 */
const CLIENT_ALLOWLIST = [];

/**
 * Any STRAPI_* token in code, read through any binding (process.env, env, environment,
 * a destructure) or written as a string. Stricter than a read detector, and correct now
 * that nothing in the closure is allowed to name one.
 */
const STRAPI_TOKEN = /\b[A-Za-z0-9_]*STRAPI_[A-Za-z0-9_]+/g;

function parseArguments(argv) {
  let root = tunesRoot;
  const entries = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--root") root = resolve(argv[++index]);
    else if (argv[index] === "--entry") entries.push(argv[++index]);
  }
  return { json: argv.includes("--json"), root, entries: entries.length ? entries : PRODUCTION_ENTRIES, fixture: root !== tunesRoot };
}

/** The `#auth-runtime` package import (tunes/package.json "imports"): a local wrapper around better-auth, walked like any module. */
const PACKAGE_IMPORTS = { "#auth-runtime": "auth-runtime/index.js" };

function resolveImport(root, fromFile, specifier) {
  let base;
  if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else if (specifier.startsWith("@shared/")) base = join(root, "shared", specifier.slice("@shared/".length));
  else if (PACKAGE_IMPORTS[specifier]) base = join(root, PACKAGE_IMPORTS[specifier]);
  else return undefined; // an ordinary package import: out of scope
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/, ".ts"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** TypeScript from tunes' own dependencies; the scan needs `npm ci --prefix tunes` first. */
function loadTypeScript() {
  return createRequire(join(tunesRoot, "package.json"))("typescript");
}

/**
 * Blank out comments, and only comments, so a mention in prose is never read as code.
 *
 * Built on TypeScript's own parser: every token's leading and trailing comment ranges are
 * collected and blanked (newlines kept, so line numbers hold). The previous regex stripper
 * removed `//` to end of line without respecting strings, so a URL string hid the rest of
 * its line from the scan.
 */
function codeOnly(ts, file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.m?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const ranges = new Map();
  const collect = (list) => { for (const range of list ?? []) ranges.set(range.pos, range.end); };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  // Split by UTF-16 unit, not code point, so indices match TypeScript's positions.
  const units = text.split("");
  for (const [start, end] of ranges)
    for (let index = start; index < end; index++) if (units[index] !== "\n" && units[index] !== "\r") units[index] = " ";
  return units.join("");
}

/**
 * Runtime edges only. A whole-statement `import type` / `export type` is erased by esbuild and
 * tsc, so it puts nothing in a production bundle (apps-canonical-admission.ts imports only a
 * type from music-uat-database.ts, which would otherwise drag the fixture tooling in). A mixed
 * `import { type A, b }` is still an edge.
 */
function extractSpecifiers(text) {
  return [
    ...[...text.matchAll(/(?:^|\n)\s*(?:import|export)(\s+type\s)?[\s\S]*?from\s*["']([^"']+)["']/g)]
      .filter((match) => !match[1]).map((match) => [match[0], match[2]]),
    ...text.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

function walkClosure(ts, root, entries) {
  const seen = new Set();
  const unresolved = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    // Edges are read from code only, so a commented-out import is not an edge.
    const text = codeOnly(ts, file, readFileSync(file, "utf8"));
    for (const specifier of extractSpecifiers(text)) {
      const resolved = resolveImport(root, file, specifier);
      if (resolved) queue.push(resolved);
      else if (resolved === null) unresolved.push({ from: relative(root, file).replace(/\\/g, "/"), specifier });
    }
  }
  return { modules: [...seen], unresolved };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const entries = options.entries.map((entry) => join(options.root, entry));
  const missing = entries.filter((entry) => !existsSync(entry));
  if (missing.length > 0) {
    console.error(
      `check-retired-dependencies: production entry point(s) not found: ${missing.map((entry) => relative(repositoryRoot, entry)).join(", ")}.\n` +
        "If an entry point moved, update PRODUCTION_ENTRIES in this script — do not delete the check."
    );
    return 2;
  }
  let ts;
  try { ts = loadTypeScript(); }
  catch {
    console.error("check-retired-dependencies: the typescript package is not installed; run `npm ci --prefix tunes` first.");
    return 2;
  }

  const { modules, unresolved } = walkClosure(ts, options.root, entries);
  const violations = [];

  // An unresolved relative or alias import means the closure is incomplete, so a clean
  // scan would be a false negative. Treat it as a scan failure, not a pass.
  if (unresolved.length > 0) {
    violations.push({
      invariant: "closure-incomplete",
      detail: `${unresolved.length} relative, @shared/* or #auth-runtime import(s) could not be resolved; the scan cannot prove the closure is complete.`,
      sites: unresolved.map((item) => `${item.from} -> ${item.specifier}`),
    });
  }
  if (!options.fixture && modules.length < MINIMUM_MODULES) {
    violations.push({
      invariant: "closure-floor",
      detail: `The production closure has ${modules.length} modules, fewer than the floor of ${MINIMUM_MODULES}. An entry point was mis-resolved or the walker went blind.`,
      sites: options.entries,
    });
  }

  const envAllowed = new Map(ENV_READ_ALLOWLIST.map((entry) => [`${entry.file}::${entry.variable}`, entry]));
  const moduleAllowed = new Set(MODULE_ALLOWLIST.map((entry) => entry.file));
  const clientAllowed = new Map(CLIENT_ALLOWLIST.map((entry) => [`${entry.file}::${entry.symbol}`, entry]));
  const usedEnvAllowances = new Set();
  const usedModuleAllowances = new Set();
  const usedClientAllowances = new Set();

  for (const absolute of modules.sort()) {
    const file = relative(options.root, absolute).replace(/\\/g, "/");
    const lines = codeOnly(ts, absolute, readFileSync(absolute, "utf8")).split(/\r?\n/);

    if (/strapi/i.test(file)) {
      if (moduleAllowed.has(file)) usedModuleAllowances.add(file);
      else
        violations.push({
          invariant: "no-strapi-module-in-production-closure",
          detail: `${file} is reachable from a production entry point.`,
          sites: [file],
        });
    }

    lines.forEach((line, index) => {
      const construction = line.match(CLIENT_CONSTRUCTION);
      if (construction) {
        const key = `${file}::${construction[1]}`;
        if (clientAllowed.has(key)) usedClientAllowances.add(key);
        else
          violations.push({
            invariant: "no-strapi-client-in-production-closure",
            detail: `${file}:${index + 1} constructs ${construction[1]}, reachable from a production entry point.`,
            sites: [`${file}:${index + 1} ${line.trim()}`],
          });
      }
      for (const match of line.matchAll(STRAPI_TOKEN)) {
        const key = `${file}::${match[0]}`;
        if (envAllowed.has(key)) usedEnvAllowances.add(key);
        else
          violations.push({
            invariant: "no-strapi-variable-in-production-closure",
            detail: `${file}:${index + 1} names ${match[0]} and is reachable from a production entry point.`,
            sites: [`${file}:${index + 1} ${line.trim()}`],
          });
      }
    });
  }

  // A stale allowlist entry is its own problem: it reads as a live exemption
  // long after the site is gone, so the next person believes coupling exists.
  for (const key of [...envAllowed.keys()].filter((entry) => !usedEnvAllowances.has(entry)))
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Allowlist entry ${key} no longer matches any site. The coupling is gone — delete the entry.`,
      sites: [key],
    });
  for (const file of [...moduleAllowed].filter((entry) => !usedModuleAllowances.has(entry)))
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Module allowlist entry ${file} is no longer in the production closure. Delete the entry.`,
      sites: [file],
    });
  for (const key of [...clientAllowed.keys()].filter((entry) => !usedClientAllowances.has(entry)))
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Client allowlist entry ${key} no longer matches any construction. Delete the entry.`,
      sites: [key],
    });

  const report = {
    entries: entries.map((entry) => relative(repositoryRoot, entry).replace(/\\/g, "/")),
    canonicalModuleCount: modules.length,
    minimumModules: MINIMUM_MODULES,
    allowlistedEnvReads: ENV_READ_ALLOWLIST.length,
    allowlistedModules: MODULE_ALLOWLIST.length,
    allowlistedClientConstructions: CLIENT_ALLOWLIST.length,
    violations,
    ok: violations.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  console.log(`production closure: ${report.canonicalModuleCount} modules from ${report.entries.join(", ")}`);
  if (report.ok) {
    console.log("OK — no production entry point reaches a Strapi construction, a STRAPI_* identifier or a Strapi-named module.");
    console.log(
      "This does NOT mean Strapi is retired: the legacy-music server still depends on it until P3-7."
    );
    return 0;
  }

  console.error(`FAILED — ${violations.length} violation(s):\n`);
  for (const violation of violations) {
    console.error(`  [${violation.invariant}] ${violation.detail}`);
    for (const site of violation.sites) console.error(`      ${site}`);
  }
  console.error(
    "\nCut the coupling (move the shared helper out of the Strapi-coupled module, as P6-3 did for\n" +
      "requestIdFor and deploymentImageFromEnvironment). Do not re-add an allowlist entry to get green."
  );
  return 1;
}

process.exitCode = main();
