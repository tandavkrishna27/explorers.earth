import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const tunesRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(tunesRoot, "..");
const baselinePath = join(repositoryRoot, "docs", "testing", "music-typescript-baseline.txt");
const diagnosticHeader = /^(.*?\.(?:ts|tsx|js|jsx)\(\d+,\d+\):\s+error\s+TS\d+:\s+.*)$/;

export function normalizeTypeScriptDiagnostics(output: string): string[] {
  const diagnostics: string[] = [];
  for (const rawLine of output.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    const line = rawLine.replaceAll("\\", "/").trimEnd();
    const match = diagnosticHeader.exec(line);
    if (match) {
      diagnostics.push(match[1].trim());
    } else if (diagnostics.length && /^\s+\S/.test(rawLine)) {
      diagnostics[diagnostics.length - 1] += ` ${line.trim()}`;
    }
  }
  return diagnostics;
}

export function compareDiagnosticSets(baseline: string[], current: string[]) {
  const accepted = new Set(baseline.filter(Boolean));
  const observed = new Set(current.filter(Boolean));
  return {
    ok: [...observed].every((diagnostic) => accepted.has(diagnostic)),
    newDiagnostics: [...observed].filter((diagnostic) => !accepted.has(diagnostic)).sort(),
    resolvedDiagnostics: [...accepted].filter((diagnostic) => !observed.has(diagnostic)).sort(),
  };
}

function collectCurrentDiagnostics(): { diagnostics: string[]; compilerExitCode: number } {
  const compiler = join(tunesRoot, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [compiler, "--pretty", "false", "--incremental", "false"], {
    cwd: tunesRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const diagnostics = normalizeTypeScriptDiagnostics(output);
  const compilerExitCode = result.status ?? 1;
  if (compilerExitCode !== 0 && diagnostics.length === 0) throw new Error(`TypeScript exited ${compilerExitCode} without parseable diagnostics`);
  return { diagnostics, compilerExitCode };
}

function main(): number {
  const mode = process.argv[2] ?? "--compare";
  const { diagnostics, compilerExitCode } = collectCurrentDiagnostics();
  if (mode === "--write") {
    writeFileSync(baselinePath, `${[...new Set(diagnostics)].sort().join("\n")}\n`);
    process.stdout.write(`wrote ${new Set(diagnostics).size} normalized TypeScript diagnostics to ${baselinePath}\n`);
    return 0;
  }
  if (mode !== "--compare") {
    process.stderr.write("usage: music-typescript-baseline.ts [--compare|--write]\n");
    return 2;
  }
  if (!existsSync(baselinePath)) {
    process.stderr.write(`baseline is missing: ${baselinePath}\n`);
    return 1;
  }
  const baseline = readFileSync(baselinePath, "utf8").split(/\r?\n/).filter(Boolean);
  const comparison = compareDiagnosticSets(baseline, diagnostics);
  if (!comparison.ok) {
    process.stderr.write(`TypeScript regression: ${comparison.newDiagnostics.length} new normalized diagnostic(s)\n${comparison.newDiagnostics.join("\n")}\n`);
    return 1;
  }
  process.stdout.write(`TypeScript baseline clean: ${diagnostics.length} current, ${comparison.resolvedDiagnostics.length} resolved, compiler exit ${compilerExitCode}\n`);
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/music-typescript-baseline.ts")) process.exitCode = main();
