import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveNpmCommand } from "./music-cli";
import { OwnedProcessRunner } from "./music-process-runner";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface CliEnvelope {
  command?: string;
  status?: string;
  phase?: string;
  checkpoint?: string;
}

function cliEnvelope(output: string): CliEnvelope {
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const candidate = JSON.parse(line) as CliEnvelope;
      if (candidate.command) return candidate;
    } catch {
      // Only the exact final C0 JSON envelope is authoritative.
    }
  }
  throw new Error("Music CLI did not emit a JSON envelope");
}

const root = resolve(import.meta.dirname, "../..");
const npm = resolveNpmCommand({
  npmExecPath: process.env.npm_execpath,
  nodeExecPath: process.execPath,
  platform: process.platform,
});
const interruptedRunner = new OwnedProcessRunner();
const interrupted = await interruptedRunner.run(npm.file, [
  ...npm.args, "run", "--silent", "music-cli", "--", "test:fast", "--format", "json",
], { cwd: root, env: { ...process.env, MUSIC_C10_INTERRUPT_PROBE: "1" } });
assert(interrupted.exitCode === 130, `actual Music CLI interrupt exited ${interrupted.exitCode}`);
const interruptedEnvelope = cliEnvelope(interrupted.stdout);
assert(interruptedEnvelope.command === "test:fast" && interruptedEnvelope.phase === "interrupted",
  "actual Music CLI did not emit its interrupted checkpoint envelope");
assert(typeof interruptedEnvelope.checkpoint === "string", "actual Music CLI interrupt checkpoint is absent");
const checkpoint = JSON.parse(readFileSync(interruptedEnvelope.checkpoint, "utf8")) as {
  exitCode?: number;
  phase?: string;
  details?: { ownedChildrenTerminated?: boolean };
};
assert(checkpoint.exitCode === 130 && checkpoint.phase === "interrupted", "interrupt checkpoint is not exit 130");
assert(checkpoint.details?.ownedChildrenTerminated === true, "owned child cleanup was not complete before checkpoint");

const resumedEnvironment = { ...process.env };
delete resumedEnvironment.MUSIC_C10_INTERRUPT_PROBE;
const resumedRunner = new OwnedProcessRunner();
const resumed = await resumedRunner.run(npm.file, [
  ...npm.args, "run", "--silent", "music-cli", "--", "test:fast", "--format", "json",
  "--resume", interruptedEnvelope.checkpoint,
], { cwd: root, env: resumedEnvironment });
const resumedEnvelope = cliEnvelope(resumed.stdout);
assert(resumed.exitCode === 0 && resumedEnvelope.command === "test:fast" && resumedEnvelope.status === "success",
  `checkpoint-bound Music CLI resume exited ${resumed.exitCode}`);

process.stdout.write(`${JSON.stringify({
  schemaVersion: "music-operation/v1",
  metric: "interrupt-resume",
  interruptCleanup: "verified",
  resume: "verified",
})}\n`);
