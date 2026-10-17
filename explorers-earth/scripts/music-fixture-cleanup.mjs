export function prepareMusicFixtureArtifacts({ directory, authPath, storagePath, mkdir, write, chmod }) {
  mkdir(directory);
  write(storagePath, `${JSON.stringify({ cookies: [], origins: [] })}\n`);
  chmod(storagePath);
  return { authPath, storagePath };
}

const STATE_SERVICE_PRIVATE_STREAM_LIMIT = 64 * 1024;

function stateServiceTerminalRecord(code, signal) {
  return {
    status: "observed",
    code: Number.isSafeInteger(code) && code >= 0 && code <= 255 ? code : null,
    signal: typeof signal === "string" && /^[A-Z][A-Z0-9]{0,31}$/.test(signal) ? signal : null,
  };
}

function createStateServiceStreamCapture(child, stream) {
  const source = child?.[stream];
  const capture = {
    source: "state-service",
    stream,
    status: source && typeof source.on === "function" ? "captured" : "unavailable",
    observedBytes: 0,
    retainedSourceBytes: 0,
    chunks: [],
  };
  if (capture.status === "captured") {
    source.on("data", (chunk) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ""));
      capture.observedBytes += value.length;
      const remaining = STATE_SERVICE_PRIVATE_STREAM_LIMIT - capture.retainedSourceBytes;
      if (remaining <= 0) return;
      const retained = value.subarray(0, remaining);
      capture.chunks.push(retained);
      capture.retainedSourceBytes += retained.length;
    });
  }
  return capture;
}

export function createMusicFixtureStateServiceGuard({
  child,
  onFailure,
  stopTimeoutMs = 5_000,
} = {}) {
  if (!child || typeof child.once !== "function" || typeof onFailure !== "function"
      || !Number.isSafeInteger(stopTimeoutMs) || stopTimeoutMs < 1 || stopTimeoutMs > 60_000) {
    throw new Error("state service guard contract is invalid");
  }
  const lifecycle = {
    schemaVersion: "explorers-public-state-service-lifecycle/v1",
    error: { status: "unavailable" },
    exit: { status: "unavailable" },
    close: { status: "unavailable" },
  };
  const captures = [
    createStateServiceStreamCapture(child, "stdout"),
    createStateServiceStreamCapture(child, "stderr"),
  ];
  const terminalWaiters = new Set();
  let stopping = false;
  let failureStarted = false;
  let stopPromise;
  let resolveFailure;
  const failure = new Promise((resolve) => { resolveFailure = resolve; });

  const notifyTerminalWaiters = () => {
    for (const waiter of [...terminalWaiters]) waiter();
  };
  const startFailure = (reason) => {
    if (stopping || failureStarted) return;
    failureStarted = true;
    Promise.resolve()
      .then(() => onFailure({ reason }))
      .then(
        () => resolveFailure({ reason, status: "handled" }),
        () => resolveFailure({ reason, status: "handler-failed" }),
      );
  };
  child.once("error", () => {
    lifecycle.error = { status: "observed" };
    notifyTerminalWaiters();
    startFailure("state-service-error");
  });
  child.once("exit", (code, signal) => {
    lifecycle.exit = stateServiceTerminalRecord(code, signal);
    notifyTerminalWaiters();
    startFailure("state-service-exit");
  });
  child.once("close", (code, signal) => {
    lifecycle.close = stateServiceTerminalRecord(code, signal);
    notifyTerminalWaiters();
    startFailure("state-service-close");
  });

  const waitForClose = () => {
    if (lifecycle.close.status === "observed") return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer;
      const observe = () => {
        if (lifecycle.close.status !== "observed") return;
        clearTimeout(timer);
        terminalWaiters.delete(observe);
        resolve();
      };
      terminalWaiters.add(observe);
      timer = setTimeout(() => {
        terminalWaiters.delete(observe);
        reject(new Error("state service stop was not attested before timeout"));
      }, stopTimeoutMs);
      observe();
    });
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopping = true;
    stopPromise = (async () => {
      let signalSent = false;
      if (lifecycle.close.status !== "observed" && lifecycle.exit.status !== "observed"
          && lifecycle.error.status !== "observed") {
        if (typeof child.kill !== "function" || child.kill("SIGKILL") !== true) {
          throw new Error("state service did not accept the stop signal");
        }
        signalSent = true;
      }
      await waitForClose();
      if (lifecycle.error.status === "observed") {
        throw new Error("state service lifecycle reported a failure");
      }
      const terminal = lifecycle.close;
      const normallyExited = terminal.code === 0 && terminal.signal === null;
      const expectedForcedExit = terminal.code === null && terminal.signal === "SIGKILL";
      const exitMatchesClose = lifecycle.exit.status !== "observed"
        || (lifecycle.exit.code === terminal.code && lifecycle.exit.signal === terminal.signal);
      if ((!normallyExited && !expectedForcedExit) || !exitMatchesClose) {
        throw new Error("state service exited without verified cleanup");
      }
      return { status: signalSent ? "stopped" : "already-stopped" };
    })();
    return stopPromise;
  };
  const snapshot = () => ({
    lifecycle: structuredClone(lifecycle),
    streams: captures.map(({ source, stream, status, observedBytes, retainedSourceBytes }) => ({
      source,
      stream,
      status,
      observedBytes,
      retainedSourceBytes,
      truncated: observedBytes > retainedSourceBytes,
    })),
  });
  const streamInputs = () => captures.map((capture) => ({
    source: capture.source,
    stream: capture.stream,
    status: capture.status,
    observedBytes: capture.observedBytes,
    chunks: capture.chunks.map((chunk) => Buffer.from(chunk)),
    truncated: capture.observedBytes > capture.retainedSourceBytes,
  }));
  return { failure, stop, snapshot, streamInputs };
}

export async function stopMusicFixture({ artifactPaths, artifactDirectories = [], exists, unlink, removeDirectory, stopStateService, down }) {
  let status = 0;
  for (const artifact of artifactPaths) {
    try { if (artifact && exists(artifact)) unlink(artifact); } catch { status = 1; }
  }
  for (const directory of artifactDirectories) {
    try { if (directory && exists(directory)) removeDirectory(directory); } catch { status = 1; }
  }
  try { await stopStateService(); } catch { status = 1; }
  try { if (await down() !== 0) status = 1; } catch { status = 1; }
  return status;
}
