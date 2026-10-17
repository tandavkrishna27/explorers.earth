import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireExactContainerAbsent } from "../../../scripts/music-qualification";

const yaml = require("js-yaml") as { load(source: string): any; dump(value: unknown): string };
const repoRoot = resolve(import.meta.dirname, "../../../..");
const tunesRoot = resolve(repoRoot, "tunes");
const compatEntrypoint = resolve(tunesRoot, "server/deployment/run-registration-compat.ts");
const fixtureDiagnosticReason = Symbol("fixtureDiagnosticReason");
const fixtureStderrLimit = 8_192;

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

function withFixtureStderr(error: unknown, stderr: string): Error {
  const candidate = error instanceof Error ? error : new Error(String(error), { cause: error });
  const reason = (candidate as Error & { [fixtureDiagnosticReason]?: Error })[fixtureDiagnosticReason] ?? candidate;
  const suffix = stderr.slice(-fixtureStderrLimit);
  if (!suffix) return reason;
  const diagnosed = new Error(`${reason.message}\nfixture stderr (bounded suffix): ${suffix}`, { cause: reason });
  Object.defineProperty(diagnosed, fixtureDiagnosticReason, { value: reason });
  return diagnosed;
}

function observeFixture(child: ChildProcess) {
  let buffer = "";
  let stderr = "";
  let seen = false;
  let fault: Error | undefined;
  let resolveReady!: (port: number) => void;
  let rejectReady!: (error: Error) => void;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolvePromise) => { resolveClosed = resolvePromise; });
  const readiness = new Promise<number>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const fail = (error: Error) => {
    fault ??= error;
    rejectReady(error);
  };
  const onError = (error: Error) => fail(error);
  const onClose = () => {
    resolveClosed();
    if (!seen) fail(new Error("fixture exited before readiness"));
  };
  const onData = (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 8_192) {
      fail(new Error("oversized readiness"));
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (seen || !record || typeof record !== "object"
          || Object.keys(record).length !== 1 || !("port" in record)
          || !Number.isInteger(record.port) || Number(record.port) < 1 || Number(record.port) > 65_535) {
          throw new Error("invalid or duplicate compatibility readiness");
        }
        if (child.exitCode !== null || child.signalCode !== null) throw new Error("departed fixture");
        seen = true;
        resolveReady(Number(record.port));
      } catch (error) {
        fail(error instanceof Error ? error : new Error("invalid readiness"));
      }
    }
  };
  child.once("close", onClose);
  child.once("error", onError);
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", onData);
  const onStderr = (chunk: string) => {
    stderr = chunk.length >= fixtureStderrLimit
      ? chunk.slice(-fixtureStderrLimit)
      : (stderr + chunk).slice(-fixtureStderrLimit);
  };
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", onStderr);
  const ready = within(readiness, 5_000, "fixture readiness timeout")
    .catch((error) => { throw withFixtureStderr(error, stderr); });
  void ready.catch(() => {});
  return {
    ready,
    closed,
    withDiagnostics(error: unknown) { return withFixtureStderr(error, stderr); },
    assertHealthy() {
      if (fault) throw withFixtureStderr(fault, stderr);
      if (buffer.trim()) throw withFixtureStderr(new Error("unterminated readiness line"), stderr);
    },
    dispose() {
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    },
  };
}

async function stopFixture(child: ChildProcess, closed: Promise<void>, before?: ProcessIdentity): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  try {
    await within(closed, 2_000, "fixture cooperative close timeout");
  } catch {
    if (!before) throw new Error("fixture identity unavailable; escalation refused");
    const current = readProcessIdentity(before.pid);
    if (!current) {
      await within(closed, 1_000, "departed fixture close not observed");
      return;
    }
    if (current.pid !== before.pid || current.started !== before.started) {
      throw new Error("fixture identity changed; escalation refused");
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await within(closed, 2_000, "fixture force-close not observed");
  }
  if (before) {
    const current = readProcessIdentity(before.pid);
    if (current && current.started === before.started) throw new Error("owned fixture survived cleanup");
  }
}

function docker(args: string[], timeout: number) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr}`);
  return result;
}

function requireOwnedTraefikContainer(inspectOutput: string, containerId: string, containerName: string): void {
  let inspected: unknown;
  try {
    inspected = JSON.parse(inspectOutput);
  } catch (error) {
    throw new Error("Traefik ownership inspect was malformed", { cause: error });
  }
  if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error("Traefik ownership inspect was not singular");
  const container = inspected[0] as {
    Id?: unknown;
    Name?: unknown;
    Config?: { Labels?: Record<string, unknown> };
  };
  if (container.Id !== containerId || container.Name !== `/${containerName}`
    || container.Config?.Labels?.["com.explorers.music.fixture"] !== "true"
    || container.Config?.Labels?.["com.explorers.music.project"] !== "explorers-music-traefik-route") {
    throw new Error("Traefik container ownership mismatch");
  }
}

function listen(server: Server): Promise<number> {
  return within(new Promise<number>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("listener has no TCP address"));
      else resolvePort(address.port);
    });
  }), 2_000, "listener startup timeout");
}

function close(server: Server): Promise<void> {
  return within(new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  }), 2_000, "server close timeout");
}

function post(port: number, path: string, body: string, forwardedFor?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveResponse, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1", port, path, method: "POST",
      headers: {
        host: "localtunes.earth",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolveResponse({ status: response.statusCode ?? 0, body: responseBody }));
    });
    request.on("error", reject);
    request.setTimeout(2_000, () => request.destroy(new Error("request timeout")));
    request.end(body);
  });
}

describe("production registration compatibility route through Traefik", () => {
  let sandbox: string;
  const containerName = `music-register-traefik-${process.pid}-${Date.now()}`;
  let compat: ChildProcess;
  let compatIdentity: ProcessIdentity | undefined;
  let compatObservation: ReturnType<typeof observeFixture> | undefined;
  let general: Server;
  let candidate: Server;
  let traefikPort: number;
  let generalCalls = 0;
  let dockerRunAttempted = false;
  let containerId: string | undefined;

  beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), "music-register-traefik-"));
    general = createServer((_request, response) => {
      generalCalls += 1;
      response.writeHead(418, { "content-type": "text/plain", "content-length": "12" });
      response.end("C2_FALLBACK!", "utf8");
    });
    const generalPort = await listen(general);
    candidate = createServer((_request, response) => response.end("private-candidate"));
    await listen(candidate);

    compat = spawn(process.execPath, ["--import", "tsx", compatEntrypoint], {
      cwd: tunesRoot,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PORT: "0",
        MUSIC_COMPAT_HOST: "0.0.0.0",
        MUSIC_COMPAT_REPORT_ADDRESS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    compatObservation = observeFixture(compat);
    compatIdentity = readProcessIdentity(compat.pid ?? 0);
    if (!compatIdentity) throw new Error("fixture identity unavailable");
    const compatPort = await compatObservation.ready;

    const deploySource = readFileSync(resolve(repoRoot, "tunes/deployment/music-deploy-engine.sh"), "utf8");
    const heredocStart = deploySource.indexOf('    cat > "$temporary" <<EOF');
    const heredocEnd = deploySource.indexOf("\nEOF", heredocStart);
    if (heredocStart < 0 || heredocEnd < 0) throw new Error("production compatibility route template missing");
    const template = deploySource.slice(deploySource.indexOf("\n", heredocStart) + 1, heredocEnd)
      .replaceAll("\\`", "`")
      .replaceAll("${router_security}", "      tls:\n        certResolver: letsencrypt")
      .replace("http://tunes-register-compat:5100", `http://host.docker.internal:${compatPort}`)
      .replace("http://${service}:5000", `http://host.docker.internal:${generalPort}`);
    const dynamic = yaml.load(template);
    for (const router of Object.values(dynamic.http.routers) as any[]) {
      router.entryPoints = ["web"];
      delete router.tls;
    }
    const dynamicFile = join(sandbox, "music-router.yml");
    writeFileSync(dynamicFile, yaml.dump(dynamic));

    dockerRunAttempted = true;
    const started = docker([
      "run", "--pull=never", "-d", "--rm", "--name", containerName,
      "--label", "com.explorers.music.fixture=true",
      "--label", "com.explorers.music.project=explorers-music-traefik-route",
      "--add-host", "host.docker.internal:host-gateway",
      "-p", "127.0.0.1::8080",
      "--mount", `type=bind,src=${dynamicFile},dst=/etc/traefik/dynamic.yml,readonly`,
      "traefik:v3.1",
      "--providers.file.filename=/etc/traefik/dynamic.yml",
      "--entrypoints.web.address=:8080",
      "--log.level=ERROR",
    ], 20_000);
    const startedId = started.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(startedId)) throw new Error("Traefik run did not return an exact container ID");
    containerId = startedId;
    const mapping = docker(["port", containerId, "8080/tcp"], 10_000);
    const match = mapping.stdout.match(/:(\d+)\s*$/);
    if (!match) throw new Error(`Traefik port mapping missing: ${mapping.stdout} ${mapping.stderr}`);
    traefikPort = Number(match[1]);
    const readinessDeadline = Date.now() + 15_000;
    for (let attempt = 0; attempt < 30 && Date.now() < readinessDeadline; attempt += 1) {
      try {
        const response = await post(traefikPort, "/not-registration", "{}");
        if (response.status === 418) {
          compatObservation.assertHealthy();
          return;
        }
      } catch { /* startup retry */ }
      const remaining = readinessDeadline - Date.now();
      if (remaining > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(200, remaining)));
    }
    throw new Error("Traefik route did not become ready");
  }, 60_000);

  afterAll(async () => {
    const failures: unknown[] = [];
    let childCleanupVerified = !compat;
    let containerCleanupVerified = !dockerRunAttempted;

    if (compat && compatObservation) {
      try {
        await stopFixture(compat, compatObservation.closed, compatIdentity);
        childCleanupVerified = true;
      } catch (error) {
        failures.push(compatObservation.withDiagnostics(error));
      }
      try {
        compatObservation.assertHealthy();
      } catch (error) {
        failures.push(error);
      } finally {
        compatObservation.dispose();
      }
    } else if (compat) {
      failures.push(new Error("compatibility child observation unavailable; cleanup unverified"));
    }

    if (dockerRunAttempted && !containerId) {
      failures.push(new Error("Docker run outcome unresolved; exact container identity unavailable"));
    } else if (containerId) {
      let ownershipAttested = false;
      try {
        const inspected = docker(["inspect", "--type", "container", containerId], 10_000);
        requireOwnedTraefikContainer(inspected.stdout, containerId, containerName);
        ownershipAttested = true;
      } catch (error) {
        failures.push(error);
      }
      if (ownershipAttested) {
        try {
          docker(["stop", "--time", "1", containerId], 10_000);
        } catch (error) {
          failures.push(error);
        }
      }
      const absent = spawnSync("docker", ["inspect", "--type", "container", containerId], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        requireExactContainerAbsent({
          error: absent.error,
          status: absent.status,
          signal: absent.signal,
          stdout: absent.stdout,
          stderr: absent.stderr,
        }, containerId);
        containerCleanupVerified = true;
      } catch (error) {
        failures.push(error);
      }
    }

    if (candidate?.listening) {
      try { await close(candidate); } catch (error) { failures.push(error); }
    }
    if (general?.listening) {
      try { await close(general); } catch (error) { failures.push(error); }
    }
    if (sandbox && childCleanupVerified && containerCleanupVerified) {
      try { rmSync(sandbox, { recursive: true, force: true }); } catch (error) { failures.push(error); }
    }
    if (failures.length > 0) throw new AggregateError(failures, "Traefik fixture cleanup failed");
  }, 60_000);

  it("denies every Express alias before the gate and after a private candidate readiness failure", async () => {
    const aliases = ["/api/register", "/api/register/?source=legacy", "/API/REGISTER?source=legacy", "/aPi/ReGiStEr/"];
    const forged = JSON.stringify({ strapiUserDocumentId: "DO_NOT_INSERT", strapiAccountDocumentId: "DO_NOT_INSERT" });
    for (const phase of ["before-gate", "after-readiness-failure"]) {
      if (phase === "after-readiness-failure") await close(candidate);
      for (const path of aliases) {
        for (const body of ["{}", forged]) {
          const response = await post(traefikPort, path, body);
          expect(response.status, `${phase} ${path}`).toBe(410);
          expect(JSON.parse(response.body).error.code).toBe("LEGACY_IDENTITY_ROUTE_REMOVED");
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 275));
        }
      }
      expect(generalCalls, phase).toBe(1);
    }
    for (const path of ["/api/register//", "/api/register/extra"]) {
      expect((await post(traefikPort, path, "{}")).status).toBe(418);
    }
    expect(generalCalls).toBe(3);
    compatObservation?.assertHealthy();
  }, 20_000);

  it("rate limits one remote peer despite forged forwarding headers and recovers", async () => {
    // Production omits sourceCriterion, so Traefik keys this limiter by the
    // direct peer. Distinct untrusted XFF values must remain one source bucket;
    // the refill wait deliberately exceeds the configured one-second period.
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_250));
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      post(traefikPort, "/api/register", "{}", `203.0.113.${index + 1}`)));
    expect(responses.some(({ status }) => status === 410)).toBe(true);
    expect(responses.some(({ status }) => status === 429)).toBe(true);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_250));
    expect((await post(traefikPort, "/API/REGISTER/", "{}", "198.51.100.200")).status).toBe(410);
    compatObservation?.assertHealthy();
  }, 10_000);
});
