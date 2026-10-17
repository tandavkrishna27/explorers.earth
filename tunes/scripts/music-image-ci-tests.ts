import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { attestC10StandalonePostgresAuthority, startC10StandalonePostgres, stopC10StandalonePostgres,
  type OwnedC10StandalonePostgresAuthority } from "./music-qualification-postgres";

export const IMAGE_TEST_COMMANDS: readonly (readonly string[])[] = [
  ["test", "--", "--maxWorkers=2"], ["run", "test:integration"],
  ["run", "test:music-c8:coverage"], ["run", "test:music-c8:repository-coverage"],
  ["run", "music:types:scoped"], ["run", "music:types:baseline"],
];

export interface ImageTestDependencies {
  commit(): string;
  port(): Promise<number>;
  secret(): { password: string; path: string; remove(): void };
  pull(): void;
  start: typeof startC10StandalonePostgres;
  attest: typeof attestC10StandalonePostgresAuthority;
  stop: typeof stopC10StandalonePostgres;
  absent(authority: OwnedC10StandalonePostgresAuthority): void;
  command(args: readonly string[], environment: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void>;
  signals(handler: () => void): () => void;
}

export function imageTestEnvironment(environment: NodeJS.ProcessEnv, authority: OwnedC10StandalonePostgresAuthority,
  password: string): NodeJS.ProcessEnv {
  if (Object.entries(environment).some(([key, value]) => Boolean(value) && (
    ["DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "MUSIC_DEPLOY_PRODUCTION", "MUSIC_DEPLOY_PROD", "DATABASE_URL", "DATABASE_URL_TEST"].includes(key)
    || key.startsWith("MUSIC_UAT_DATABASE_") || key.startsWith("MUSIC_C10_STANDALONE_POSTGRES_")))) {
    throw new Error("Image test runner rejects ambient database, Docker, production, UAT or C10 authority");
  }
  return { ...environment, MUSIC_C3_POSTGRES_TEST: "1", MUSIC_C5_POSTGRES_TEST: "1",
    MUSIC_C8_POSTGRES_TEST: "1", MUSIC_C9_PUBLICATION_POSTGRES_TEST: "1",
    STRAPI_ANALYTICS_ACCESS_TOKEN: "fixture-analytics-token",
    DATABASE_URL_TEST: `postgresql://music_migrator:${encodeURIComponent(password)}@127.0.0.1:${authority.port}/music_fixture`,
    MUSIC_C10_STANDALONE_POSTGRES_ACK: "C10_LABELED_LOCAL_PG15",
    MUSIC_C10_STANDALONE_POSTGRES_PORT: String(authority.port),
    MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID: authority.containerId,
    MUSIC_C10_STANDALONE_POSTGRES_COMMIT: authority.commit };
}

export async function runImageCiTests(environment: NodeJS.ProcessEnv, dependencies: ImageTestDependencies): Promise<void> {
  // Validate before any resource acquisition; the temporary authority is never used.
  imageTestEnvironment(environment, {} as OwnedC10StandalonePostgresAuthority, "");
  const controller = new AbortController();
  const removeSignals = dependencies.signals(() => controller.abort());
  let secret: ReturnType<ImageTestDependencies["secret"]> | undefined;
  let authority: OwnedC10StandalonePostgresAuthority | undefined;
  let failure: unknown;
  try {
    const commit = dependencies.commit();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Image tests require exact checkout HEAD");
    const port = await dependencies.port();
    if (!Number.isSafeInteger(port) || port < 10240 || port > 65535 || port === 55432) throw new Error("Image tests require disposable loopback port");
    secret = dependencies.secret();
    dependencies.pull();
    controller.signal.throwIfAborted();
    authority = await dependencies.start({ commit, port, passwordFile: secret.path });
    const childEnvironment = imageTestEnvironment(environment, authority, secret.password);
    const attested = dependencies.attest(childEnvironment, commit);
    if (!attested || attested.imageId !== authority.imageId) throw new Error("Image test authority changed");
    for (const command of IMAGE_TEST_COMMANDS) {
      controller.signal.throwIfAborted();
      await dependencies.command(command, childEnvironment, controller.signal);
    }
  } catch (error) { failure = error; }
  finally {
    try {
      if (authority) {
        await dependencies.stop(authority);
        dependencies.absent(authority);
      }
      secret?.remove();
    } catch (cleanupError) {
      failure = failure ? new AggregateError([failure, cleanupError], "Image tests and owned cleanup failed") : cleanupError;
    }
    removeSignals();
  }
  if (failure) throw failure;
}

async function allocatePort(): Promise<number> {
  for (;;) {
    const server = createServer();
    const port = await new Promise<number>((accept, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("Loopback allocation failed"));
        server.close((error) => error ? reject(error) : accept(address.port));
      });
    });
    if (port >= 10240 && port !== 55432) return port;
  }
}

export async function transferImageAuthority(acquire: () => Promise<OwnedC10StandalonePostgresAuthority>,
  persist: (authority: OwnedC10StandalonePostgresAuthority) => void,
  stop: ImageTestDependencies["stop"], absent: ImageTestDependencies["absent"]): Promise<OwnedC10StandalonePostgresAuthority> {
  const authority = await acquire();
  try {
    persist(authority);
    return authority;
  } catch (failure) {
    try { await stop(authority); absent(authority); }
    catch (cleanupError) { throw new AggregateError([failure, cleanupError], "Authority transfer and owned cleanup failed"); }
    throw failure;
  }
}

export function settleImageCommand(child: ChildProcess, terminate: () => void,
  proveTerminated: () => void | Promise<void>, timeoutMs = 10000): Promise<void> {
  return new Promise((accept, reject) => {
    let firstFailure: unknown;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    child.on("error", (error) => {
      firstFailure ??= error;
      if (!timeout) timeout = setTimeout(() => {
        try { terminate(); } catch (error) { firstFailure ??= error; }
        // No close means no cleanup permission: native stop separately guards custody.
        reject(firstFailure);
      }, timeoutMs);
    });
    child.once("close", async (code, signal) => {
      if (timeout) clearTimeout(timeout);
      if (code !== 0 || signal) firstFailure ??= new Error(`Image command failed (${code ?? signal})`);
      try { await proveTerminated(); }
      catch (error) {
        reject(firstFailure ? new AggregateError([firstFailure, error], "Command and termination proof failed") : error);
        return;
      }
      if (firstFailure) reject(firstFailure); else accept();
    });
  });
}

export function nativeImageTestDependencies(): ImageTestDependencies {
  if (process.platform !== "linux") throw new Error("Image CI runner requires the authorized Linux job");
  const receipt = ownershipReceiptPath();
  let secretDirectory: string | undefined;
  let owned: OwnedC10StandalonePostgresAuthority | undefined;
  let absenceProven = false;
  let childTerminationProven = true;
  return {
    commit: () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    port: allocatePort,
    secret: () => {
      const directory = mkdtempSync(join(tmpdir(), "music-image-ci-"));
      chmodSync(directory, 0o700);
      secretDirectory = directory;
      const path = join(directory, "postgres-password");
      const password = randomBytes(32).toString("base64url");
      writeFileSync(path, password, { mode: 0o600, flag: "wx" });
      return { password, path, remove: () => {
        if (existsSync(receipt) && !absenceProven) throw new Error("Owned acquisition cleanup could not be proven; protected secret retained");
        rmSync(directory, { recursive: true });
        if (owned) writeFileSync(receipt, JSON.stringify({ state: "absent", authority: owned }), { mode: 0o600 });
      } };
    },
    pull: () => { execFileSync("docker", ["pull", "postgres:15-alpine"], { stdio: "inherit" }); },
    start: async (input) => {
      // Pending receipts cannot authorize deletion: abrupt acquisition failure
      // remains a failed lane requiring diagnosis instead of deletion by name.
      writeFileSync(receipt, JSON.stringify({ state: "pending", commit: input.commit }), { mode: 0o600, flag: "wx" });
      return transferImageAuthority(async () => {
        owned = await startC10StandalonePostgres(input);
        return owned;
      }, (authority) => writeFileSync(receipt, JSON.stringify({ state: "owned", authority, secretDirectory }), { mode: 0o600 }),
      stopC10StandalonePostgres, (authority) => { assertOwnedContainerAbsent(authority); absenceProven = true; });
    },
    attest: attestC10StandalonePostgresAuthority,
    stop: async (authority) => {
      if (!childTerminationProven) throw new Error("Owned npm process termination unproven; database custody retained");
      await stopC10StandalonePostgres(authority);
    },
    absent: (authority) => {
      assertOwnedContainerAbsent(authority);
      absenceProven = true;
    },
    command: async (args, environment, signal) => {
      signal.throwIfAborted();
      // The always verifier must also fail closed while npm custody is active.
      writeFileSync(receipt, JSON.stringify({ state: "command-running", authority: owned, secretDirectory }), { mode: 0o600 });
      const child = spawn("npm", [...args], { env: environment, stdio: "inherit", detached: true });
      childTerminationProven = false;
      const killGroup = (termination: NodeJS.Signals) => {
        if (!child.pid) return;
        try { process.kill(-child.pid, termination); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      };
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const abort = () => {
        killGroup("SIGTERM");
        escalation = setTimeout(() => killGroup("SIGKILL"), 5000);
        child.emit("error", new Error("Image test command interrupted"));
      };
      const settled = settleImageCommand(child, () => killGroup("SIGKILL"), async () => {
        // npm close alone does not prove descendants stopped. Only this detached
        // process group belongs to this invocation; never target ambient processes.
        killGroup("SIGTERM");
        const deadline = Date.now() + 5000;
        while (child.pid) {
          try { process.kill(-child.pid, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
            childTerminationProven = true;
            return;
          }
          if (Date.now() >= deadline) throw new Error("Owned npm process group remains after bounded termination");
          killGroup("SIGKILL");
          await new Promise((accept) => setTimeout(accept, 50));
        }
        childTerminationProven = true; // Failed spawn has no PID or descendants.
      });
      signal.addEventListener("abort", abort, { once: true });
      let commandFailure: unknown;
      try { await settled; } catch (error) { commandFailure = error; }
      finally {
        signal.removeEventListener("abort", abort);
        if (escalation) clearTimeout(escalation);
      }
      if (childTerminationProven) {
        try { writeFileSync(receipt, JSON.stringify({ state: "owned", authority: owned, secretDirectory }), { mode: 0o600 }); }
        catch (error) { commandFailure = commandFailure ? new AggregateError([commandFailure, error], "Command and receipt update failed") : error; }
      }
      if (commandFailure) throw commandFailure;
    },
    signals: (handler) => {
      process.on("SIGINT", handler); process.on("SIGTERM", handler);
      return () => { process.off("SIGINT", handler); process.off("SIGTERM", handler); };
    },
  };
}

function ownershipReceiptPath(): string {
  if (!process.env.RUNNER_TEMP) throw new Error("Image CI cleanup requires the job-owned RUNNER_TEMP");
  return join(process.env.RUNNER_TEMP, "music-image-ci-ownership.json");
}

function assertOwnedContainerAbsent(authority: OwnedC10StandalonePostgresAuthority): void {
  const ids = execFileSync("docker", ["--host", authority.contextHost, "ps", "--all", "--no-trunc", "--format", "{{.ID}}"], { encoding: "utf8" }).trim().split(/\s+/);
  if (ids.includes(authority.containerId)) throw new Error("Owned image test container remains after cleanup");
}

export async function verifyNativeImageCleanup(): Promise<void> {
  if (process.platform !== "linux") throw new Error("Image CI cleanup requires the authorized Linux job");
  const receipt = ownershipReceiptPath();
  if (!existsSync(receipt)) return; // No acquisition was begun.
  const record = JSON.parse(readFileSync(receipt, "utf8"));
  if (!["owned", "absent"].includes(record.state)) throw new Error("Interrupted acquisition has no immutable cleanup authority");
  const authority = record.authority as OwnedC10StandalonePostgresAuthority;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!authority || authority.commit !== commit || !/^[a-f0-9]{64}$/.test(authority.containerId)
    || !/^sha256:[a-f0-9]{64}$/.test(authority.imageId) || authority.owned !== true) throw new Error("Cleanup receipt authority changed");
  const context = execFileSync("docker", ["context", "show"], { encoding: "utf8" }).trim();
  const host = JSON.parse(execFileSync("docker", ["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"], { encoding: "utf8" }));
  if (host !== authority.contextHost || !(host === "unix:///var/run/docker.sock" || /^unix:\/\/\/run\/user\/\d+\/docker.sock$/.test(host))) throw new Error("Cleanup Docker context changed");
  if (record.state === "owned") {
    // Existing helper reattests exact ID, image, labels, binding and health.
    await stopC10StandalonePostgres(authority);
  }
  assertOwnedContainerAbsent(authority);
  if (record.secretDirectory) {
    const directory = resolve(record.secretDirectory);
    if (!directory.startsWith(`${resolve(tmpdir())}/music-image-ci-`) || !/^music-image-ci-[A-Za-z0-9]+$/.test(directory.slice(directory.lastIndexOf("/") + 1))) {
      throw new Error("Cleanup secret directory is outside the owned temporary boundary");
    }
    rmSync(directory, { recursive: true });
  }
  rmSync(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (process.argv.slice(2).length === 0 ? runImageCiTests(process.env, nativeImageTestDependencies())
    : process.argv.slice(2).join(" ") === "--cleanup" ? verifyNativeImageCleanup()
      : Promise.reject(new Error("Unsupported image CI runner arguments"))).catch((error) => {
    console.error(error instanceof AggregateError
      ? "Image CI tests failed AND owned cleanup failed; inspect the first child diagnostic and ownership receipt"
      : "Owned image CI test sequence or cleanup failed; inspect the first child diagnostic and ownership receipt");
    process.exitCode = 1;
  });
}
