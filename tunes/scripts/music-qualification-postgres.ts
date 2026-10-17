import { execFileSync, spawnSync } from "node:child_process";

export interface C10StandalonePostgresAuthority {
  port: number;
  containerId: string;
  commit: string;
}

export interface DockerContainerInspect {
  Id?: unknown;
  Name?: unknown;
  Image?: unknown;
  Config?: { Image?: unknown; Labels?: Record<string, unknown> };
  State?: { Running?: unknown; Health?: { Status?: unknown } };
  HostConfig?: { PortBindings?: Record<string, unknown> };
}

export interface OwnedC10StandalonePostgresAuthority extends C10StandalonePostgresAuthority {
  imageId: string;
  contextHost: string;
  owned: true;
}

interface C10StandalonePostgresLifecycleOptions {
  dockerRead?: (args: string[]) => string;
  dockerOptionalRead?: (args: string[]) => string | undefined;
  dockerRun?: (args: string[]) => string;
  healthyInspect?: (authority: C10StandalonePostgresAuthority, contextHost: string) => Promise<DockerContainerInspect>;
}

const LOCAL_DOCKER_HOSTS = new Set([
  "npipe:////./pipe/docker_engine",
  "npipe:////./pipe/dockerDesktopLinuxEngine",
  "unix:///var/run/docker.sock",
]);

function authorityError(message: string): Error {
  return new Error(`C10 standalone PostgreSQL authority rejected: ${message}`);
}

function requireLocalDockerHost(contextHost: string): void {
  const locallyOwnedSocket = LOCAL_DOCKER_HOSTS.has(contextHost)
    || /^unix:\/\/\/run\/user\/\d+\/docker\.sock$/.test(contextHost);
  if (!locallyOwnedSocket) throw authorityError("a local Docker socket is required");
}

export function parseC10StandalonePostgresAuthority(
  environment: NodeJS.ProcessEnv,
): C10StandalonePostgresAuthority | undefined {
  const acknowledgement = environment.MUSIC_C10_STANDALONE_POSTGRES_ACK;
  const rawPort = environment.MUSIC_C10_STANDALONE_POSTGRES_PORT;
  const containerId = environment.MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID;
  const commit = environment.MUSIC_C10_STANDALONE_POSTGRES_COMMIT;
  if (![acknowledgement, rawPort, containerId, commit].some(Boolean)) return undefined;
  if (acknowledgement !== "C10_LABELED_LOCAL_PG15" || !rawPort || !containerId || !commit) {
    throw authorityError("the exact acknowledgement, port, container ID, and commit are required");
  }
  if (["DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "MUSIC_DEPLOY_PRODUCTION", "MUSIC_DEPLOY_PROD"]
    .some((key) => Boolean(environment[key]))) {
    throw authorityError("ambient Docker or production authority is forbidden");
  }
  if (!/^\d{4,5}$/.test(rawPort)) throw authorityError("port is invalid");
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 10_240 || port > 65_535) {
    throw authorityError("port is outside the disposable range");
  }
  if (port === 55_432) throw authorityError("the five-service fixture port is reserved");
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw authorityError("container ID is not an exact immutable ID");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw authorityError("commit is not an exact source commit");
  return { port, containerId, commit };
}

export function validateC10StandalonePostgresInspect(
  authority: C10StandalonePostgresAuthority,
  input: { contextHost: string; imageId: string; inspect: DockerContainerInspect },
): C10StandalonePostgresAuthority & { imageId: string } {
  requireLocalDockerHost(input.contextHost);
  const expectedImageId = /^sha256:[a-f0-9]{64}$/.test(input.imageId) ? input.imageId : "";
  const labels = input.inspect.Config?.Labels ?? {};
  const bindingKeys = Object.keys(input.inspect.HostConfig?.PortBindings ?? {});
  const bindings = input.inspect.HostConfig?.PortBindings?.["5432/tcp"];
  const binding = Array.isArray(bindings) && bindings.length === 1 ? bindings[0] as Record<string, unknown> : undefined;
  const expectedName = `/music-c10-qualification-${authority.commit.slice(0, 7)}-pg15`;
  if (input.inspect.Id !== authority.containerId
      || input.inspect.Name !== expectedName
      || input.inspect.Config?.Image !== "postgres:15-alpine"
      || !expectedImageId || input.inspect.Image !== expectedImageId
      || labels["com.explorers.music.c10-qualification"] !== "true"
      || labels["com.explorers.music.owner"] !== "task10"
      || labels["com.explorers.music.commit"] !== authority.commit
      || input.inspect.State?.Running !== true
      || input.inspect.State?.Health?.Status !== "healthy"
      || bindingKeys.length !== 1 || bindingKeys[0] !== "5432/tcp"
      || binding?.HostIp !== "127.0.0.1" || binding?.HostPort !== String(authority.port)) {
    throw authorityError("container is not the exact healthy owned PG15 sidecar");
  }
  return { ...authority, imageId: expectedImageId };
}

function defaultDockerRead(args: string[]): string {
  try {
    return execFileSync(process.platform === "win32" ? "docker.exe" : "docker", args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw authorityError("read-only Docker attestation failed");
  }
}

function dockerExecutable(): string {
  return process.platform === "win32" ? "docker.exe" : "docker";
}

function defaultDockerOptionalRead(args: string[]): string | undefined {
  const result = spawnSync(dockerExecutable(), args, {
    encoding: "utf8", windowsHide: true, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout : undefined;
}

function defaultDockerRun(args: string[]): string {
  try {
    return execFileSync(dockerExecutable(), args, {
      encoding: "utf8", windowsHide: true, timeout: 45_000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw authorityError("owned Docker mutation failed");
  }
}

async function defaultHealthyInspect(
  authority: C10StandalonePostgresAuthority,
  contextHost: string,
  dockerRead: (args: string[]) => string,
): Promise<DockerContainerInspect> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const inspect = JSON.parse(dockerRead([
      "--host", contextHost, "inspect", "--type", "container", "--format", "{{json .}}", authority.containerId,
    ])) as DockerContainerInspect;
    if (inspect.State?.Running === true && inspect.State?.Health?.Status === "healthy") return inspect;
    if (inspect.State?.Running !== true || inspect.State?.Health?.Status === "unhealthy") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw authorityError("owned PG15 sidecar did not become healthy");
}

function readLocalDockerContext(dockerRead: (args: string[]) => string): string {
  const contextName = dockerRead(["context", "show"]).trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(contextName)) throw authorityError("Docker context name is invalid");
  const contextHost = JSON.parse(dockerRead([
    "context", "inspect", contextName, "--format", "{{json .Endpoints.docker.Host}}",
  ])) as string;
  requireLocalDockerHost(contextHost);
  return contextHost;
}

export async function startC10StandalonePostgres(
  input: { commit: string; port: number; passwordFile: string },
  options: C10StandalonePostgresLifecycleOptions = {},
): Promise<OwnedC10StandalonePostgresAuthority> {
  if (!/^[a-f0-9]{40}$/.test(input.commit)) throw authorityError("commit is not an exact source commit");
  if (!Number.isSafeInteger(input.port) || input.port < 10_240 || input.port > 65_535 || input.port === 55_432) {
    throw authorityError("port is outside the disposable range or reserved");
  }
  if (!input.passwordFile) throw authorityError("protected password file is required");
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  const dockerOptionalRead = options.dockerOptionalRead ?? defaultDockerOptionalRead;
  const dockerRun = options.dockerRun ?? defaultDockerRun;
  const contextHost = readLocalDockerContext(dockerRead);
  const containerName = `music-c10-qualification-${input.commit.slice(0, 7)}-pg15`;
  if (dockerOptionalRead(["--host", contextHost, "inspect", "--type", "container", containerName])) {
    throw authorityError("owned PG15 sidecar name is already in use");
  }
  const imageId = dockerRead(["--host", contextHost, "image", "inspect", "--format", "{{.Id}}", "postgres:15-alpine"]).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw authorityError("PostgreSQL image ID is invalid");
  const mount = `type=bind,src=${input.passwordFile},dst=/run/secrets/music-c10-postgres-password,readonly`;
  const containerId = dockerRun([
    "--host", contextHost, "run", "--detach", "--name", containerName,
    "--label", "com.explorers.music.c10-qualification=true",
    "--label", "com.explorers.music.owner=task10",
    "--label", `com.explorers.music.commit=${input.commit}`,
    "--publish", `127.0.0.1:${input.port}:5432`,
    "--env", "POSTGRES_USER=music_migrator", "--env", "POSTGRES_DB=music_fixture",
    "--env", "POSTGRES_PASSWORD_FILE=/run/secrets/music-c10-postgres-password",
    "--mount", mount,
    "--health-cmd", "pg_isready -U music_migrator -d music_fixture",
    "--health-interval", "1s", "--health-timeout", "5s", "--health-retries", "30",
    "postgres:15-alpine",
  ]).trim();
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw authorityError("created container ID is invalid");
  const authority = { port: input.port, containerId, commit: input.commit };
  try {
    const inspect = options.healthyInspect
      ? await options.healthyInspect(authority, contextHost)
      : await defaultHealthyInspect(authority, contextHost, dockerRead);
    validateC10StandalonePostgresInspect(authority, { contextHost, imageId, inspect });
    return { ...authority, imageId, contextHost, owned: true };
  } catch (error) {
    dockerRun(["--host", contextHost, "rm", "--force", containerId]);
    throw error;
  }
}

export async function stopC10StandalonePostgres(
  authority: OwnedC10StandalonePostgresAuthority,
  options: Pick<C10StandalonePostgresLifecycleOptions, "dockerRead" | "dockerRun"> = {},
): Promise<void> {
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  const dockerRun = options.dockerRun ?? defaultDockerRun;
  const attested = attestC10StandalonePostgresAuthority({
    MUSIC_C10_STANDALONE_POSTGRES_ACK: "C10_LABELED_LOCAL_PG15",
    MUSIC_C10_STANDALONE_POSTGRES_PORT: String(authority.port),
    MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID: authority.containerId,
    MUSIC_C10_STANDALONE_POSTGRES_COMMIT: authority.commit,
  }, authority.commit, { dockerRead });
  if (!attested || attested.imageId !== authority.imageId) throw authorityError("owned PG15 cleanup attestation changed");
  dockerRun(["--host", authority.contextHost, "rm", "--force", authority.containerId]);
}

export function attestC10StandalonePostgresAuthority(
  environment: NodeJS.ProcessEnv,
  expectedCommit: string,
  options: { dockerRead?: (args: string[]) => string } = {},
): (C10StandalonePostgresAuthority & { imageId: string }) | undefined {
  const authority = parseC10StandalonePostgresAuthority(environment);
  if (!authority) return undefined;
  if (authority.commit !== expectedCommit) throw authorityError("container commit does not match the source commit");
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  let contextHost: string;
  let inspect: DockerContainerInspect;
  try {
    const contextName = dockerRead(["context", "show"]).trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(contextName)) throw authorityError("Docker context name is invalid");
    contextHost = JSON.parse(dockerRead(["context", "inspect", contextName, "--format", "{{json .Endpoints.docker.Host}}"]));
    requireLocalDockerHost(contextHost);
    inspect = JSON.parse(dockerRead(["--host", contextHost, "inspect", "--type", "container", "--format", "{{json .}}", authority.containerId]));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("C10 standalone")) throw error;
    throw authorityError("Docker attestation returned invalid structured data");
  }
  const imageId = dockerRead(["--host", contextHost, "image", "inspect", "--format", "{{.Id}}", "postgres:15-alpine"]).trim();
  return validateC10StandalonePostgresInspect(authority, { contextHost, imageId, inspect });
}
