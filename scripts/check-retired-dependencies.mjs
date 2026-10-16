#!/usr/bin/env node
/**
 * Ticket 8.1a's static scan: a ratchet on the canonical server's Strapi coupling.
 *
 * It does NOT assert that Strapi is retired — it is not, and the legacy-music
 * server still speaks to it by design until step 12 deletes that path. What it
 * asserts is the property 8.1a's exit gate depends on, measured over the static
 * import closure of the canonical entrypoint:
 *
 *   1. no Strapi client is constructed anywhere in the canonical closure;
 *   2. no module in the canonical closure reads a STRAPI_* variable, except the
 *      few sites allowlisted below with a reason and a disposition;
 *   3. no Strapi-named module enters the canonical closure beyond the one
 *      allowlisted below.
 *
 * Each allowlist entry is a known, measured site — not a waiver. Adding a new
 * one is a decision someone has to write down here, which is the point: the
 * failure mode this guards against is coupling creeping back in one import at a
 * time while every suite stays green.
 *
 * Full classification and the evidence behind each allowlist entry:
 * docs/replatform-audit/strapi-server-classification.md
 *
 * Usage: node scripts/check-retired-dependencies.mjs [--json]
 * Exit 0 when every invariant holds, 1 on a violation, 2 on a scan error.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tunesRoot = join(repositoryRoot, "tunes");
const canonicalEntry = join(tunesRoot, "server/auth/canonicalStartup.ts");

/**
 * Sites inside the canonical closure that may read a STRAPI_* variable.
 * `reason` says why it is not a live dependency; `disposition` says what retires it.
 */
const ENV_READ_ALLOWLIST = [
  {
    file: "server/security-containment.ts",
    variable: "STRAPI_JWT_SECRET",
    reason:
      "Read inside verifyStrapiToken's body, so it cannot fail startup. Its only caller is now security-containment's own legacy bearer path: the legacy jwt-auth-middleware was deleted on 2026-10-09, being unreachable from every entrypoint.",
    disposition: "Deleted with the legacy-music path in step 12 (8.1b/8.2).",
  },
  {
    file: "server/services/explorers-analytics-composition.ts",
    variable: "STRAPI_URL",
    reason:
      "Read inside createLegacyExplorersAnalyticsDependencies(). Reachable only via the historical analytics read, which is dead: its client requires an auth-store token that the canonical acceptVerified path sets to null and nothing outside tests ever sets.",
    disposition:
      "Deleted once the dashboard is repointed at GET /api/explorers/analytics/summary (ticket 3.4).",
  },
  {
    file: "server/config/music-local-profile.ts",
    variable: "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE",
    reason: "Optional, guarded by an explicit !== undefined check, in the local/fixture profile.",
    disposition: "Retires with the local legacy profile.",
  },
];

/**
 * Strapi-named modules permitted inside the canonical closure.
 *
 * Empty since 2026-10-09, and that is the point of ticket 8.1a's last engineering item.
 * The single entry was `server/services/strapiIdentityGateway.ts`, allowlisted on filename
 * alone: the closure imported `fingerprintStrapiProof` (a bare sha256) and
 * `cancelResponseBody`/`readBoundedResponseBody` (generic Response-body helpers also used
 * by youtubeReadService), while the gateway class itself is constructed only in
 * routes/index.ts, outside the closure. Those four symbols now live in
 * `proofFingerprint.ts` and `upstreamResponseBody.ts`, so no Strapi-named module is in the
 * closure at all and the entry would now be stale - which this scan fails on.
 */
const MODULE_ALLOWLIST = [];

/** Constructions that would mean a canonical request can reach Strapi. */
const CLIENT_CONSTRUCTION = /new\s+(Strapi[A-Za-z]*)\s*\(/;

/**
 * Strapi client constructions permitted inside the canonical closure.
 * Keyed by file and class, never by line, so ordinary edits do not break the scan.
 *
 * Both entries sit inside createLegacyExplorersAnalyticsDependencies(), the same
 * dead factory as the STRAPI_URL read allowlisted above: they are constructed
 * only if the historical analytics read runs, and it cannot. Constructing them
 * is also inert on its own — neither touches the network until a method is
 * called.
 */
const CLIENT_ALLOWLIST = [
  {
    file: "server/services/explorers-analytics-composition.ts",
    symbol: "StrapiAnalyticsPublisher",
    reason:
      "Built inside createLegacyExplorersAnalyticsDependencies(), reachable only through the dead historical analytics read. Canonical writes never publish externally.",
    disposition: "Deleted with the legacy analytics factory once ticket 3.4 repoints the dashboard.",
  },
  {
    file: "server/services/explorers-analytics-composition.ts",
    symbol: "StrapiAnalyticsTargetValidator",
    reason: "Same factory, same dead path; validatePublicTarget is replaced canonically by a constant true.",
    disposition: "Deleted with the legacy analytics factory once ticket 3.4 repoints the dashboard.",
  },
];

const ENV_READ = /(?:process\.)?env(?:\.|\[["'])([A-Za-z_]*STRAPI[A-Za-z_0-9]*)/g;

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
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

/**
 * Blank out comments so a mention in prose is never read as code.
 *
 * The CRLF normalisation on the first line is load-bearing, not tidiness. Every file in
 * this repository is CRLF, and splitting on a newline leaves a trailing carriage return
 * on each line. In a JavaScript regex a carriage return is a line terminator, so `.` does
 * not match it and `$` without the `m` flag anchors only at the very end of the string -
 * which made the line-comment strip below match nothing at all. Line comments were
 * therefore never stripped, and this function's own contract did not hold: a STRAPI_*
 * mention inside a line comment in the canonical closure failed the scan as though it
 * were a real read.
 *
 * Demonstrated by probe rather than argued: a line comment naming process.env.STRAPI_URL
 * added to a closure module passes with this normalisation and reports a violation
 * without it.
 *
 * That direction is over-strict rather than unsafe, so no violation was missed by it. It
 * did cost real time twice, both times diagnosed as "the assertion trips on my own
 * comment" rather than as this.
 */
function codeOnly(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function walkClosure(entry) {
  const seen = new Set();
  const unresolved = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const specifiers = [
      ...text.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g),
      ...text.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g),
      ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveImport(file, specifier);
      if (resolved) queue.push(resolved);
      else unresolved.push({ from: relative(tunesRoot, file), specifier });
    }
  }
  return { modules: [...seen], unresolved };
}

function main() {
  if (!existsSync(canonicalEntry)) {
    console.error(
      `check-retired-dependencies: canonical entrypoint not found at ${relative(repositoryRoot, canonicalEntry)}.\n` +
        "If the canonical server moved, update this script — do not delete the check."
    );
    return 2;
  }

  const { modules, unresolved } = walkClosure(canonicalEntry);
  const violations = [];

  // An unresolved relative import means the closure is incomplete, so a clean
  // scan would be a false negative. Treat it as a scan failure, not a pass.
  if (unresolved.length > 0) {
    violations.push({
      invariant: "closure-complete",
      detail: `${unresolved.length} relative import(s) could not be resolved; the scan cannot prove the closure is complete.`,
      sites: unresolved.map((item) => `${item.from} -> ${item.specifier}`),
    });
  }

  const envAllowed = new Map(
    ENV_READ_ALLOWLIST.map((entry) => [`${entry.file}::${entry.variable}`, entry])
  );
  const moduleAllowed = new Set(MODULE_ALLOWLIST.map((entry) => entry.file));
  const clientAllowed = new Map(
    CLIENT_ALLOWLIST.map((entry) => [`${entry.file}::${entry.symbol}`, entry])
  );
  const usedEnvAllowances = new Set();
  const usedModuleAllowances = new Set();
  const usedClientAllowances = new Set();

  for (const absolute of modules.sort()) {
    const file = relative(tunesRoot, absolute).replace(/\\/g, "/");
    const source = readFileSync(absolute, "utf8");
    const code = codeOnly(source);
    const lines = code.split("\n");

    if (/strapi/i.test(file)) {
      if (moduleAllowed.has(file)) usedModuleAllowances.add(file);
      else
        violations.push({
          invariant: "no-strapi-module-in-canonical-closure",
          detail: `${file} is reachable from the canonical entrypoint.`,
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
            invariant: "no-strapi-client-in-canonical-closure",
            detail: `${file}:${index + 1} constructs ${construction[1]}, reachable from canonical startup.`,
            sites: [`${file}:${index + 1} ${line.trim()}`],
          });
      }
      for (const match of line.matchAll(ENV_READ)) {
        const key = `${file}::${match[1]}`;
        if (envAllowed.has(key)) usedEnvAllowances.add(key);
        else
          violations.push({
            invariant: "no-unallowlisted-strapi-env-in-canonical-closure",
            detail: `${file}:${index + 1} reads ${match[1]} and is reachable from canonical startup.`,
            sites: [`${file}:${index + 1} ${line.trim()}`],
          });
      }
    });
  }

  // A stale allowlist entry is its own problem: it reads as a live exemption
  // long after the site is gone, so the next person believes coupling exists.
  const staleEnv = [...envAllowed.keys()].filter((key) => !usedEnvAllowances.has(key));
  const staleModules = [...moduleAllowed].filter((file) => !usedModuleAllowances.has(file));
  for (const key of staleEnv)
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Allowlist entry ${key} no longer matches any site. The coupling is gone — delete the entry.`,
      sites: [key],
    });
  for (const file of staleModules)
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Module allowlist entry ${file} is no longer in the canonical closure. Delete the entry.`,
      sites: [file],
    });
  for (const key of [...clientAllowed.keys()].filter((entry) => !usedClientAllowances.has(entry)))
    violations.push({
      invariant: "no-stale-allowlist",
      detail: `Client allowlist entry ${key} no longer matches any construction. Delete the entry.`,
      sites: [key],
    });

  const report = {
    entry: relative(repositoryRoot, canonicalEntry).replace(/\\/g, "/"),
    canonicalModuleCount: modules.length,
    allowlistedEnvReads: ENV_READ_ALLOWLIST.length,
    allowlistedModules: MODULE_ALLOWLIST.length,
    allowlistedClientConstructions: CLIENT_ALLOWLIST.length,
    violations,
    ok: violations.length === 0,
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  console.log(`canonical closure: ${report.canonicalModuleCount} modules from ${report.entry}`);
  if (report.ok) {
    console.log(
      `OK — every Strapi construction and STRAPI_* read in the canonical closure is one of the ${CLIENT_ALLOWLIST.length + ENV_READ_ALLOWLIST.length} allowlisted legacy sites, each on a path measured as unreachable.`
    );
    console.log(
      "This does NOT mean Strapi is retired: the legacy-music server still depends on it until step 12."
    );
    return 0;
  }

  console.error(`FAILED — ${violations.length} violation(s):\n`);
  for (const violation of violations) {
    console.error(`  [${violation.invariant}] ${violation.detail}`);
    for (const site of violation.sites) console.error(`      ${site}`);
  }
  console.error(
    "\nIf a new coupling is deliberate, add it to the allowlist in this file with a reason\n" +
      "and a disposition, and record it in docs/replatform-audit/strapi-server-classification.md."
  );
  return 1;
}

process.exitCode = main();
