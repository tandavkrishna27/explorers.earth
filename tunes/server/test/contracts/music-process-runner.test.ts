import type { ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { EXIT, terminateBeforeCheckpoint } from "../../../scripts/music-cli.ts";
import { OwnedProcessRunner } from "../../../scripts/music-process-runner.ts";
import { runUnixTerminationContract } from "./helpers/music-process-runner-unix-harness.ts";

describe("owned process termination", () => {
  it("preserves the native close signal field on natural child completion", async () => {
    const runner = new OwnedProcessRunner();
    const result = await runner.run(process.execPath, ["-e", "process.exit(0)"], {
      cwd: process.cwd(), env: process.env,
    });
    expect(result).toMatchObject({ exitCode: 0, signal: null });
  });

  it.skipIf(process.platform === "win32")("preserves a native child termination signal", async () => {
    const runner = new OwnedProcessRunner();
    const result = await runner.run(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], {
      cwd: process.cwd(), env: process.env,
    });
    expect(result.signal).toBe("SIGTERM");
    expect(result.exitCode).not.toBe(0);
  });

  it("rejects a child that resumes after an empty termination snapshot", async () => {
    const runner = new OwnedProcessRunner();
    await runner.terminateAll();
    await expect(runner.run(process.execPath, ["-e", "process.exit(0)"], {
      cwd: process.cwd(),
      env: process.env,
    })).rejects.toThrow(/terminating/i);
    expect(runner.activeChildCount).toBe(0);
  });

  it("bounds Unix escalation for a real stubborn child before checkpoint and exit 130", async () => {
    // Production break caught: Unix SIGTERM has no deadline or SIGKILL, so an
    // ignoring child prevents checkpoint persistence and exit 130 forever.
    const directory = mkdtempSync(join(tmpdir(), "music-stubborn-child-"));
    const marker = join(directory, "ready");
    const signals: NodeJS.Signals[] = [];
    const Runner = OwnedProcessRunner as unknown as new (options: {
      platform: NodeJS.Platform;
      terminationGraceMs: number;
      forceKillWaitMs: number;
      sendUnixGroupSignal: (child: ChildProcess, signal: NodeJS.Signals) => void;
    }) => OwnedProcessRunner;
    const runner = new Runner({
      platform: "linux",
      terminationGraceMs: 50,
      forceKillWaitMs: 500,
      sendUnixGroupSignal: (child, signal) => {
        signals.push(signal);
        if (signal === "SIGKILL") child.kill("SIGKILL");
      },
    });
    const completion = runner.run(process.execPath, ["-e", `
      const fs = require("node:fs");
      process.on("SIGTERM", () => {});
      fs.writeFileSync(${JSON.stringify(marker)}, "ready");
      setTimeout(() => process.exit(0), 4000);
      setInterval(() => {}, 1000);
    `], { cwd: directory, env: process.env });

    try {
      const readyDeadline = Date.now() + 2_000;
      while (!existsSync(marker) && Date.now() < readyDeadline) await delay(10);
      expect(existsSync(marker)).toBe(true);
      const events: string[] = [];
      const started = Date.now();
      await terminateBeforeCheckpoint(
        async () => { await runner.terminateAll(); events.push("terminated"); },
        () => { events.push("checkpoint"); },
      );
      const result = await completion;
      expect(Date.now() - started).toBeLessThan(1_500);
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
      expect(events).toEqual(["terminated", "checkpoint"]);
      expect(EXIT.interrupted).toBe(130);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await runner.terminateAll();
      await completion.catch(() => undefined);
      rmSync(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it.skipIf(process.platform === "win32")("escalates a stubborn Unix process group before checkpoint and exit 130", async () => {
    // Production break caught: a child that ignores SIGTERM keeps shutdown
    // awaiting close forever, so no interruption checkpoint or exit 130 occurs.
    await runUnixTerminationContract();
  }, 10_000);
});
