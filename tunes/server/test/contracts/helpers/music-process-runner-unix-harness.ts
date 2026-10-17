import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { EXIT, terminateBeforeCheckpoint } from "../../../../scripts/music-cli.ts";
import { OwnedProcessRunner } from "../../../../scripts/music-process-runner.ts";

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for stubborn child state");
    await delay(10);
  }
}

export async function runUnixTerminationContract(): Promise<void> {
  assert.notEqual(process.platform, "win32", "Unix termination contract requires a Unix process group");
  const directory = mkdtempSync(join(tmpdir(), "music-stubborn-group-"));
  const marker = join(directory, "pids.txt");
  const Runner = OwnedProcessRunner as unknown as new (options: { terminationGraceMs: number; forceKillWaitMs: number }) => OwnedProcessRunner;
  const runner = new Runner({ terminationGraceMs: 75, forceKillWaitMs: 750 });
  const stubbornProgram = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "process.on('SIGTERM', () => {});",
    "const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 4000); setInterval(() => {}, 1000);`], { stdio: 'ignore' });",
    `fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid) + ',' + String(child.pid));`,
    "setTimeout(() => process.exit(0), 4000);",
    "setInterval(() => {}, 1000);",
  ].join(" ");
  const completion = runner.run(process.execPath, ["-e", stubbornProgram], { cwd: directory, env: process.env });

  try {
    await waitFor(() => existsSync(marker), 2_000);
    const events: string[] = [];
    const started = Date.now();
    await terminateBeforeCheckpoint(
      async () => { await runner.terminateAll(); events.push("terminated"); },
      () => { events.push("checkpoint"); },
    );
    const elapsed = Date.now() - started;
    const result = await completion;
    assert.ok(elapsed < 1_500, `stubborn Unix group termination took ${elapsed}ms`);
    assert.deepEqual(events, ["terminated", "checkpoint"]);
    assert.equal(EXIT.interrupted, 130);
    assert.notEqual(result.exitCode, 0);
    const pids = readFileSync(marker, "utf8").split(",").map(Number);
    await waitFor(() => pids.every((pid) => {
      try { process.kill(pid, 0); return false; }
      catch { return true; }
    }), 1_000);
  } finally {
    await runner.terminateAll();
    await completion.catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void runUnixTerminationContract().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
