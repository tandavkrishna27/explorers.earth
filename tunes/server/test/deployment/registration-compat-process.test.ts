import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const entrypoint = resolve(import.meta.dirname, "../../deployment/run-registration-compat.ts");

type ProcessIdentity = { pid: number; started: string };

function readProcessIdentity(pid: number): ProcessIdentity | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("invalid child PID");
  if (process.platform === "linux") {
    try {
      const stat = readFileSync("/proc/" + pid + "/stat", "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] ?? "")) throw new Error("malformed process start time");
      return { pid, started: fields[19]! };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  if (process.platform !== "win32") throw new Error("fixture identity platform unsupported");
  const command = "$ErrorActionPreference='Stop'; try { "
    + "$p=[System.Diagnostics.Process]::GetProcessById(" + pid + "); "
    + "$p.StartTime.ToUniversalTime().Ticks.ToString() } "
    + "catch [System.ArgumentException] { exit 3 }";
  try {
    const started = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", timeout: 1_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!/^\d+$/.test(started)) throw new Error("malformed process creation time");
    return { pid, started };
  } catch (error) {
    if ((error as { status?: number }).status === 3) return undefined;
    throw error;
  }
}

function within<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(message)), milliseconds);
    promise.then((value) => {
      clearTimeout(timer);
      resolvePromise(value);
    }, (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

const compatDiagnosticReason = Symbol("compatDiagnosticReason");
const compatStderrLimit = 8_192;

function withCompatStderr(error: unknown, stderr: string): Error {
  const candidate = error instanceof Error ? error : new Error(String(error), { cause: error });
  const reason = (candidate as Error & { [compatDiagnosticReason]?: Error })[compatDiagnosticReason] ?? candidate;
  const suffix = stderr.slice(-compatStderrLimit);
  if (!suffix) return reason;
  const diagnosed = new Error(`${reason.message}\ncompat stderr (bounded suffix): ${suffix}`, { cause: reason });
  Object.defineProperty(diagnosed, compatDiagnosticReason, { value: reason });
  return diagnosed;
}

type FixtureStopDependencies = {
  readIdentity?: typeof readProcessIdentity;
  waitWithin?: typeof within;
};

async function stopFixture(
  child: ChildProcess,
  closed: Promise<void>,
  before?: ProcessIdentity,
  dependencies: FixtureStopDependencies = {},
): Promise<void> {
  const readIdentity = dependencies.readIdentity ?? readProcessIdentity;
  const waitWithin = dependencies.waitWithin ?? within;
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  try {
    await waitWithin(closed, 2_000, "fixture cooperative close timeout");
  } catch {
    if (!before) throw new Error("fixture identity unavailable; escalation refused");
    const current = readIdentity(before.pid);
    if (!current) {
      await waitWithin(closed, 1_000, "departed fixture close not observed");
      return;
    }
    if (current.pid !== before.pid || current.started !== before.started) {
      throw new Error("fixture identity changed; escalation refused");
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await waitWithin(closed, 2_000, "fixture force-close not observed");
  }
  if (before) {
    const current = readIdentity(before.pid);
    if (current && current.started === before.started) throw new Error("owned fixture survived cleanup");
  }
}

type StopRequest = { signal: NodeJS.Signals; accepted?: boolean };
type NativeObservation = {
  code: number | null;
  signal: NodeJS.Signals | null;
  priorRequestCount: number;
};
type OrderedNativeObservation = NativeObservation & { order: number };

function isOwnedTermination(event: NativeObservation, requests: StopRequest[]): boolean {
  return event.code === null
    && (event.signal === "SIGTERM" || event.signal === "SIGKILL")
    && requests.slice(0, event.priorRequestCount)
      .some((request) => request.accepted === true && request.signal === event.signal);
}

type OwnedCompatibilityProcess = {
  child: ChildProcess;
  closed: Promise<void>;
  identity?: ProcessIdentity;
  beginOwnedStop(): void;
  recordStopRequest(signal: NodeJS.Signals, send: () => boolean): boolean;
  assertHealthy(): void;
  assertStopped(): void;
  dispose(): void;
};

function observeCompatibility(child: ChildProcess): Omit<OwnedCompatibilityProcess, "child" | "identity"> & {
  ready: Promise<number>;
} {
  let buffer = "";
  let receivedCharacters = 0;
  let stderr = "";
  let seen = false;
  let fault: Error | undefined;
  let preStopFault: Error | undefined;
  let ownedStopStarted = false;
  let eventOrder = 0;
  let exitEvent: OrderedNativeObservation | undefined;
  let closeEvent: OrderedNativeObservation | undefined;
  const requests: StopRequest[] = [];
  let resolveReady!: (port: number) => void;
  let rejectReady!: (error: Error) => void;
  let resolveClosed!: () => void;
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  const closed = new Promise<void>((resolvePromise) => { resolveClosed = resolvePromise; });
  const readiness = new Promise<number>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const fail = (error: Error) => {
    fault ??= error;
    rejectReady(error);
  };
  const recordPreStopDeparture = () => {
    preStopFault ??= new Error("compat child departed before owned stop");
  };
  const onError = (error: Error) => fail(error);
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    exitEvent = { code, signal, priorRequestCount: requests.length, order: ++eventOrder };
    if (!ownedStopStarted) recordPreStopDeparture();
  };
  const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
    closeEvent = { code, signal, priorRequestCount: requests.length, order: ++eventOrder };
    if (!ownedStopStarted) recordPreStopDeparture();
    resolveClosed();
    if (!seen) fail(new Error("compat child exited before readiness"));
  };
  const onData = (chunk: string) => {
    receivedCharacters += chunk.length;
    buffer += chunk;
    if (receivedCharacters > 8_192) {
      fail(new Error("oversized compatibility readiness"));
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const record = JSON.parse(line) as { port?: unknown };
        if (seen || !Number.isInteger(record.port) || Number(record.port) < 1 || Number(record.port) > 65_535) {
          throw new Error("invalid or duplicate compatibility readiness");
        }
        if (child.exitCode !== null || child.signalCode !== null) throw new Error("departed compatibility child");
        seen = true;
        resolveReady(Number(record.port));
      } catch (error) {
        fail(error instanceof Error ? error : new Error("invalid compatibility readiness"));
      }
    }
  };
  child.on("exit", onExit);
  child.on("close", onClose);
  child.on("error", onError);
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", onData);
  const onStderr = (chunk: string) => {
    stderr = chunk.length >= compatStderrLimit
      ? chunk.slice(-compatStderrLimit)
      : (stderr + chunk).slice(-compatStderrLimit);
  };
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", onStderr);
  const ready = new Promise<number>((resolvePromise, rejectPromise) => {
    readinessTimer = setTimeout(() => rejectPromise(new Error("compatibility readiness timeout")), 5_000);
    readiness.then((port) => {
      if (readinessTimer) clearTimeout(readinessTimer);
      readinessTimer = undefined;
      resolvePromise(port);
    }, (error) => {
      if (readinessTimer) clearTimeout(readinessTimer);
      readinessTimer = undefined;
      rejectPromise(error);
    });
  }).catch((error) => {
    fault ??= error instanceof Error ? error : new Error(String(error));
    throw withCompatStderr(error, stderr);
  });
  void ready.catch(() => {});
  return {
    ready,
    closed,
    beginOwnedStop() {
      if (exitEvent || closeEvent || child.exitCode !== null || child.signalCode !== null) recordPreStopDeparture();
      ownedStopStarted = true;
    },
    recordStopRequest(signal, send) {
      const request: StopRequest = { signal };
      requests.push(request);
      const accepted = send();
      request.accepted = accepted;
      return accepted;
    },
    assertHealthy() {
      if (fault) throw withCompatStderr(fault, stderr);
      if (preStopFault) throw withCompatStderr(preStopFault, stderr);
      if (buffer.trim()) throw withCompatStderr(new Error("unterminated compatibility readiness line"), stderr);
    },
    assertStopped() {
      const failures: unknown[] = [];
      const cleanupEvidence = { requests, exitEvent: exitEvent ?? null, closeEvent: closeEvent ?? null };
      if (fault) failures.push(withCompatStderr(fault, stderr));
      if (preStopFault) failures.push(withCompatStderr(preStopFault, stderr));
      if (buffer.trim()) failures.push(withCompatStderr(new Error("unterminated compatibility readiness line"), stderr));
      if (!exitEvent) failures.push(new Error("compat child exit was not observed"));
      if (!closeEvent) failures.push(new Error("compat child close was not observed"));
      if (exitEvent && closeEvent) {
        if (exitEvent.order >= closeEvent.order) failures.push(new Error("compat child close was not observed after exit"));
        if (exitEvent.code !== closeEvent.code || exitEvent.signal !== closeEvent.signal) {
          failures.push(new Error("compat child exit and close outcomes differ"));
        }
        if (!isOwnedTermination(exitEvent, requests)) failures.push(new Error("compat child exit was not an accepted owned termination"));
        if (!isOwnedTermination(closeEvent, requests)) failures.push(new Error("compat child close was not an accepted owned termination"));
      }
      if (failures.length) {
        throw new AggregateError(failures,
          `compat child stopped outside owned termination: ${JSON.stringify(cleanupEvidence)}`);
      }
      if (child.pid) process.stdout.write(`COMPAT_CHILD_CLEANUP ${JSON.stringify(cleanupEvidence)}\n`);
    },
    dispose() {
      if (readinessTimer) clearTimeout(readinessTimer);
      readinessTimer = undefined;
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onStderr);
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("close", onClose);
    },
  };
}

async function stopCompatibilityProcess(
  owned: OwnedCompatibilityProcess,
  dependencies: FixtureStopDependencies = {},
): Promise<void> {
  const failures: unknown[] = [];
  const originalKill = owned.child.kill;
  try {
    owned.beginOwnedStop();
    owned.child.kill = ((signal) => {
      if (signal !== "SIGTERM" && signal !== "SIGKILL") {
        throw new Error("unexpected compat stop request");
      }
      return owned.recordStopRequest(signal, () => originalKill.call(owned.child, signal));
    }) as ChildProcess["kill"];
  } catch (error) { failures.push(error); }
  try {
    try { await stopFixture(owned.child, owned.closed, owned.identity, dependencies); }
    catch (error) { failures.push(error); }
    try { owned.assertStopped(); }
    catch (error) { failures.push(error); }
  } finally {
    owned.child.kill = originalKill;
    try { owned.dispose(); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "compat teardown failed");
}

function injectedCompatibilityChild(): ChildProcess {
  const child = new ChildProcess();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (() => true) as ChildProcess["kill"];
  return child;
}

const immediateTimeout = (<T>(_promise: Promise<T>, _milliseconds: number, message: string) =>
  Promise.reject(new Error(message))) as typeof within;

function failureText(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map(failureText)].join("\n");
  }
  if (error instanceof Error) return `${error.message}\n${failureText(error.cause)}`;
  return error === undefined ? "" : String(error);
}

async function rejectedText(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error("expected operation to reject");
  } catch (error) {
    return failureText(error);
  }
}

describe("compatibility process cleanup boundaries", () => {
  it("keeps cleanup pending until the retained child close is observed", async () => {
    const child = new ChildProcess();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const signals: string[] = [];
    child.kill = ((signal) => {
      signals.push(String(signal)); return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout.emit("data", '{"port":43210}\n');
    await observation.ready;
    let finished = false;
    const completion = stopCompatibilityProcess({ child, ...observation })
      .then(() => { finished = true; });
    try {
      try {
        await Promise.resolve(); await Promise.resolve();
        expect(finished).toBe(false);
        expect(signals).toEqual(["SIGTERM"]);
      } finally {
        child.emit("exit", null, "SIGTERM");
        child.emit("close", null, "SIGTERM");
      }
      await completion;
      expect(finished).toBe(true);
    } finally {
      try { await completion; }
      finally { observation.dispose(); }
    }
  });

  it("waits for a complete newline-framed port record across fragmented output", async () => {
    const child = injectedCompatibilityChild();
    const observation = observeCompatibility(child);
    let settled = false;
    void observation.ready.then(() => { settled = true; });
    try {
      child.stdout!.emit("data", '{"port":');
      await Promise.resolve();
      expect(settled).toBe(false);
      child.stdout!.emit("data", '43210}\n');
      await expect(observation.ready).resolves.toBe(43_210);
      observation.assertHealthy();
    } finally {
      observation.dispose();
    }
  });

  it("rejects malformed and out-of-range port records", async () => {
    for (const line of ["not-json\n", '{"port":0}\n', '{"port":65536}\n', '{"port":1.5}\n']) {
      const child = injectedCompatibilityChild();
      const observation = observeCompatibility(child);
      try {
        child.stdout!.emit("data", line);
        await expect(observation.ready).rejects.toThrow();
        expect(() => observation.assertHealthy()).toThrow();
      } finally {
        observation.dispose();
      }
    }
  });

  it("rejects a spawn error before readiness", async () => {
    const child = injectedCompatibilityChild();
    const observation = observeCompatibility(child);
    try {
      child.emit("error", new Error("injected compat spawn failure"));
      await expect(observation.ready).rejects.toThrow("injected compat spawn failure");
    } finally {
      observation.dispose();
    }
  });

  it("rejects close before readiness", async () => {
    const child = injectedCompatibilityChild();
    const observation = observeCompatibility(child);
    try {
      child.emit("close", 1, null);
      await expect(observation.ready).rejects.toThrow("compat child exited before readiness");
    } finally {
      observation.dispose();
    }
  });

  it("retains a readiness timeout while awaiting owned teardown", async () => {
    vi.useFakeTimers();
    try {
      const child = injectedCompatibilityChild();
      const signals: string[] = [];
      child.kill = ((signal) => {
        signals.push(String(signal));
        child.emit("exit", null, signal);
        child.emit("close", null, signal);
        return true;
      }) as ChildProcess["kill"];
      const observation = observeCompatibility(child);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(observation.ready).rejects.toThrow("compatibility readiness timeout");
      const failure = await rejectedText(stopCompatibilityProcess({
        child, ...observation, identity: { pid: 123, started: "original" },
      }, { readIdentity: () => undefined }));
      expect(failure).toContain("compatibility readiness timeout");
      expect(signals).toEqual(["SIGTERM"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses force escalation when the captured identity is absent", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({ child, ...observation }, {
      waitWithin: immediateTimeout,
    }));
    expect(failure).toContain("fixture identity unavailable; escalation refused");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("propagates identity lookup errors without force escalation", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, {
      waitWithin: immediateTimeout,
      readIdentity: () => { throw new Error("identity lookup failed"); },
    }));
    expect(failure).toContain("identity lookup failed");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("refuses force escalation when the process identity changed", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, {
      waitWithin: immediateTimeout,
      readIdentity: (pid) => ({ pid, started: "replacement" }),
    }));
    expect(failure).toContain("fixture identity changed; escalation refused");
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("fails when exact-identity force-close is not observed", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, {
      waitWithin: immediateTimeout,
      readIdentity: (pid) => ({ pid, started: "original" }),
    }));
    expect(failure).toContain("fixture force-close not observed");
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("fails when the captured process survives cooperative cleanup", async () => {
    const child = injectedCompatibilityChild();
    child.kill = ((signal) => {
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
      return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, { readIdentity: (pid) => ({ pid, started: "original" }) }));
    expect(failure).toContain("owned fixture survived cleanup");
  });

  it("disposes readiness timers and listeners after failed readiness", async () => {
    vi.useFakeTimers();
    try {
      const child = injectedCompatibilityChild();
      const observation = observeCompatibility(child);
      expect(child.listenerCount("exit")).toBe(1);
      expect(child.listenerCount("close")).toBe(1);
      expect(child.listenerCount("error")).toBe(1);
      child.stdout!.emit("data", "not-json\n");
      await expect(observation.ready).rejects.toThrow();
      observation.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(child.listenerCount("exit")).toBe(0);
      expect(child.listenerCount("close")).toBe(0);
      expect(child.listenerCount("error")).toBe(0);
      expect(child.stdout!.listenerCount("data")).toBe(0);
      expect(child.stderr!.listenerCount("data")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  for (const departure of [
    { name: "rejects a post-readiness crash before owned stopping", code: 7, signal: null },
    { name: "rejects exit zero before owned stopping", code: 0, signal: null },
    { name: "rejects an unrelated signal before owned stopping", code: null, signal: "SIGKILL" as NodeJS.Signals },
  ]) {
    it(departure.name, async () => {
      const child = injectedCompatibilityChild();
      const signals: string[] = [];
      let survivorProbes = 0;
      child.kill = ((signal) => { signals.push(String(signal)); return true; }) as ChildProcess["kill"];
      const waitWithin = vi.fn(async (promise: Promise<unknown>) => promise) as typeof within;
      const observation = observeCompatibility(child);
      child.stdout!.emit("data", '{"port":43210}\n');
      await observation.ready;
      child.exitCode = departure.code;
      child.signalCode = departure.signal;
      child.emit("exit", departure.code, departure.signal);
      child.emit("close", departure.code, departure.signal);
      const failure = await rejectedText(stopCompatibilityProcess({
        child, ...observation, identity: { pid: 123, started: "original" },
      }, {
        waitWithin,
        readIdentity: () => { survivorProbes += 1; return undefined; },
      }));
      expect(failure).toContain("compat child departed before owned stop");
      expect(waitWithin).toHaveBeenCalledOnce();
      expect(waitWithin).toHaveBeenCalledWith(observation.closed, 2_000, "fixture cooperative close timeout");
      expect(survivorProbes).toBe(1);
      expect(signals).toEqual([]);
    });
  }

  it("accepts the observed owned cooperative termination", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    child.kill = ((signal) => {
      signals.push(String(signal));
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
      return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    await expect(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, { readIdentity: () => undefined })).resolves.toBeUndefined();
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("accepts observed identity-checked owned escalation", async () => {
    const child = injectedCompatibilityChild();
    const signals: string[] = [];
    const sequence: string[] = [];
    let identityReads = 0;
    let waits = 0;
    child.kill = ((signal) => {
      signals.push(String(signal));
      sequence.push(`request ${signal}`);
      if (signal === "SIGKILL") {
        child.emit("exit", null, signal);
        child.emit("close", null, signal);
      }
      return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    await expect(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, {
      waitWithin: async (promise) => {
        waits += 1;
        if (waits === 1) throw new Error("cooperative timeout");
        return promise;
      },
      readIdentity: (pid) => {
        identityReads += 1;
        sequence.push(`identity ${identityReads}`);
        return identityReads === 1 ? { pid, started: "original" } : undefined;
      },
    })).resolves.toBeUndefined();
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(sequence).toEqual(["request SIGTERM", "identity 1", "request SIGKILL", "identity 2"]);
  });

  it("rejects exit without observed close", async () => {
    const child = injectedCompatibilityChild();
    child.kill = ((signal) => {
      child.emit("exit", null, signal);
      return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, { waitWithin: immediateTimeout, readIdentity: () => undefined }));
    expect(failure).toContain("departed fixture close not observed");
    expect(failure).toContain("compat child close was not observed");
  });

  it("rejects an unrelated post-request signal", async () => {
    const child = injectedCompatibilityChild();
    child.kill = (() => {
      child.emit("exit", null, "SIGKILL");
      child.emit("close", null, "SIGKILL");
      return true;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, { readIdentity: () => undefined }));
    expect(failure).toContain("compat child exit was not an accepted owned termination");
    expect(failure).toContain("compat child close was not an accepted owned termination");
  });

  it("rejects an unaccepted termination request", async () => {
    const child = injectedCompatibilityChild();
    child.kill = ((signal) => {
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
      return false;
    }) as ChildProcess["kill"];
    const observation = observeCompatibility(child);
    child.stdout!.emit("data", '{"port":43210}\n');
    await observation.ready;
    const failure = await rejectedText(stopCompatibilityProcess({
      child, ...observation, identity: { pid: 123, started: "original" },
    }, { readIdentity: () => undefined }));
    expect(failure).toContain("compat child exit was not an accepted owned termination");
    expect(failure).toContain("compat child close was not an accepted owned termination");
  });
});

describe("registration compatibility process", () => {
  let owned: OwnedCompatibilityProcess | undefined;

  afterEach(async () => {
    const current = owned;
    if (!current) return;
    try {
      await stopCompatibilityProcess(current);
    } finally { owned = undefined; }
  }, 8_000);

  async function start(): Promise<string> {
    const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PORT: "0",
        MUSIC_COMPAT_HOST: "127.0.0.1",
        MUSIC_COMPAT_REPORT_ADDRESS: "1",
      },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const observation = observeCompatibility(child);
    owned = { child, ...observation };
    if (!child.pid) throw new Error("compat child PID unavailable");
    owned.identity = readProcessIdentity(child.pid);
    if (!owned.identity) throw new Error("compat child departed before identity capture");
    const port = await observation.ready;
    observation.assertHealthy();
    return `http://127.0.0.1:${port}`;
  }

  async function rawRequest(
    port: number,
    chunks: Array<{ bytes: string; delayMs?: number }>,
    hardTimeoutMs = 5_000,
  ): Promise<string> {
    return new Promise((resolveResponse, reject) => {
      const socket = connect(port, "127.0.0.1");
      let response = "";
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error("raw request timed out")); }, hardTimeoutMs);
      socket.setEncoding("utf8");
      socket.on("data", (data) => { response += data; });
      socket.on("error", reject);
      socket.on("close", () => { clearTimeout(timeout); resolveResponse(response); });
      socket.on("connect", async () => {
        for (const chunk of chunks) {
          if (chunk.delayMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, chunk.delayMs));
          if (!socket.destroyed) socket.write(chunk.bytes);
        }
      });
    });
  }

  it("serves only the DB-free typed registration denial without reflecting input", async () => {
    const baseUrl = await start();
    const sentinel = "FORGED_SERVER_OWNED_IDENTITY_DO_NOT_REFLECT";
    for (const path of ["/api/register", "/api/register/", "/API/REGISTER", "/aPi/ReGiStEr/?source=legacy"]) {
      for (const body of ["{}", JSON.stringify({
        strapiUserDocumentId: sentinel,
        strapiAccountDocumentId: sentinel,
        lifecycleOperationId: sentinel,
        guestCapabilityHash: sentinel,
      })]) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        const responseBody = await response.text();
        const parsed = JSON.parse(responseBody);
        expect(response.status).toBe(410);
        expect(response.headers.get("x-request-id")).toBe(parsed.error.requestId);
        expect(Number(response.headers.get("content-length"))).toBe(Buffer.byteLength(responseBody));
        expect(parsed.error).toMatchObject({
          code: "LEGACY_IDENTITY_ROUTE_REMOVED",
          action: "upgrade_client",
          retryable: false,
        });
        expect(responseBody.length).toBeLessThan(512);
        expect(responseBody).not.toContain(sentinel);
      }
    }
    await expect(fetch(`${baseUrl}/api/register`)).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${baseUrl}/api/register//`, { method: "POST", body: "{}" })).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${baseUrl}/api/register/extra`, { method: "POST", body: "{}" })).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${baseUrl}/not-registration`, { method: "POST", body: "{}" })).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${baseUrl}/health/live`)).resolves.toMatchObject({ status: 200 });
  }, 10_000);

  it("rejects declared and chunked oversized bodies and closes slow requests", async () => {
    const baseUrl = await start();
    const port = Number(new URL(baseUrl).port);
    const declared = await rawRequest(port, [{ bytes: [
      "POST /api/register HTTP/1.1", "Host: localtunes.earth", "Content-Length: 9000", "Connection: close", "", "",
    ].join("\r\n") }]);
    expect(declared).toMatch(/^HTTP\/1\.1 413 /);
    expect(declared).toContain('"code":"PAYLOAD_TOO_LARGE"');
    expect(declared).not.toContain("9000");

    const chunked = await rawRequest(port, [{ bytes: [
      "POST /API/REGISTER/ HTTP/1.1", "Host: localtunes.earth", "Transfer-Encoding: chunked", "Connection: close", "",
      "2329", "x".repeat(9001), "0", "", "",
    ].join("\r\n") }]);
    expect(chunked).toMatch(/^HTTP\/1\.1 413 /);
    expect(chunked).toContain('"code":"PAYLOAD_TOO_LARGE"');

    const slow = await rawRequest(port, [
      { bytes: ["POST /api/register HTTP/1.1", "Host: localtunes.earth", "Content-Length: 2", "Connection: close", "", "{"].join("\r\n") },
      { delayMs: 2_500, bytes: "}" },
    ]);
    expect(slow).not.toContain("LEGACY_IDENTITY_ROUTE_REMOVED");
    expect(slow).toMatch(/^HTTP\/1\.1 408 |^$/);
  }, 15_000);

  it("enforces partial-header and keep-alive socket deadlines", async () => {
    const baseUrl = await start();
    const port = Number(new URL(baseUrl).port);

    const partialStartedAt = Date.now();
    const partial = await rawRequest(port, [{
      bytes: "POST /api/register HTTP/1.1\r\nHost: localtunes.earth\r\nX-Incomplete: ",
    }], 3_250);
    expect(partial).not.toContain("LEGACY_IDENTITY_ROUTE_REMOVED");
    expect(Date.now() - partialStartedAt).toBeLessThanOrEqual(3_000);

    const keepAliveStartedAt = Date.now();
    const keepAlive = await rawRequest(port, [{ bytes: [
      "GET /health/live HTTP/1.1", "Host: localtunes.earth", "", "",
    ].join("\r\n") }], 2_250);
    expect(keepAlive).toMatch(/^HTTP\/1\.1 200 /);
    expect(Date.now() - keepAliveStartedAt).toBeLessThanOrEqual(2_250);
  }, 10_000);
});
