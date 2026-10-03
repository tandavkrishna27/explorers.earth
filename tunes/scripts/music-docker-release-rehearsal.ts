import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoExternalFixtureAuthority,
  assertEquivalentLocalImageTransfer,
  assertStableLocalImageTransfer,
  assertPrivateFixtureFileUnchanged,
  assertTrustedSystemExecutableUnchanged,
  assertTrustedFixtureSourceUnchanged,
  captureTrustedSystemExecutable,
  capturePrivateFixtureFile,
  captureTrustedFixtureSource,
  createSanitizedFixtureEnvironment,
  createInternalFixturePolicyScript,
  requireReviewedFixtureImage,
  requireRegistryReturnedDigest,
  REVIEWED_FIXTURE_IMAGES,
  resolveTrustedSystemDirectory,
  type PrivateFixtureFile,
  type ReviewedFixtureImageName,
  type TrustedSystemExecutable,
  type TrustedFixtureSource,
} from "./music-docker-release-authority";
import { requireNativeMusicReleaseLauncher } from "./music-release-channel.mjs";

requireNativeMusicReleaseLauncher("rehearsal");

let repoRoot = "";
const dockerAuthority = captureTrustedSystemExecutable("Docker", process.platform === "win32"
  ? ["C:/Program Files/Docker/Docker/resources/bin/docker.exe"]
  : process.platform === "darwin"
    ? ["/Applications/Docker.app/Contents/Resources/bin/docker", "/usr/local/bin/docker"]
    : ["/usr/bin/docker", "/usr/local/bin/docker"]);
const bashAuthority = captureTrustedSystemExecutable("Bash", process.platform === "win32"
  ? ["C:/Program Files/Git/bin/bash.exe"] : ["/bin/bash"]);
const curlAuthority = captureTrustedSystemExecutable("curl", process.platform === "win32"
  ? ["C:/Program Files/Git/mingw64/bin/curl.exe", "C:/Windows/System32/curl.exe"]
  : ["/usr/bin/curl", "/usr/local/bin/curl"]);
const nodeAuthority = captureTrustedSystemExecutable("Node", process.platform === "win32"
  ? ["C:/Program Files/nodejs/node.exe"] : ["/usr/bin/node", "/usr/local/bin/node"]);
const composeAuthority = captureTrustedSystemExecutable("Docker Compose", process.platform === "win32"
  ? [
      "C:/Program Files/Docker/cli-plugins/docker-compose.exe",
      "C:/Program Files/Docker/Docker/resources/cli-plugins/docker-compose.exe",
    ]
  : process.platform === "darwin"
    ? ["/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose"]
    : [
        "/usr/libexec/docker/cli-plugins/docker-compose",
        "/usr/lib/docker/cli-plugins/docker-compose",
        "/usr/local/lib/docker/cli-plugins/docker-compose",
      ]);
const whoamiAuthority = process.platform === "win32"
  ? captureTrustedSystemExecutable("whoami", ["C:/Windows/System32/whoami.exe"]) : undefined;
const icaclsAuthority = process.platform === "win32"
  ? captureTrustedSystemExecutable("icacls", ["C:/Windows/System32/icacls.exe"]) : undefined;
const docker = dockerAuthority.path;
const bash = bashAuthority.path;
const curl = curlAuthority.path;
const trustedTools: TrustedSystemExecutable[] = [dockerAuthority, composeAuthority, bashAuthority, curlAuthority, nodeAuthority,
  ...(whoamiAuthority ? [whoamiAuthority] : []), ...(icaclsAuthority ? [icaclsAuthority] : [])];
const trustedPathEntries = process.platform === "win32"
  ? [
      resolveTrustedSystemDirectory("Git Unix tools", "C:/Program Files/Git/usr/bin"),
      resolveTrustedSystemDirectory("Git MinGW tools", "C:/Program Files/Git/mingw64/bin"),
      resolveTrustedSystemDirectory("Node tools", "C:/Program Files/nodejs"),
      resolveTrustedSystemDirectory("Windows system tools", "C:/Windows/System32"),
    ]
  : [resolveTrustedSystemDirectory("system tools", "/usr/bin"), resolveTrustedSystemDirectory("base system tools", "/bin")];
const source = "https://github.com/explorers-earth/explorers.earth";
const containment = "d226f7e4dc5a54195a59804ec729f72b5e8f10d7";
const marker = "0037_explorers_movies_provider_context";
const resourceScope = "music-c10-release";
let project = "";
let registryContainer = "";
let secretVolume = "";
let root = "";
let composeFile = "";
let environmentFile = "";
let requestFile = "";
let hmacFile = "";
let curlShim = "";
let publicProbeHeaders = "";
let derivedDockerfile = "";
let baseImage = "";
let dockerConfigDirectory = "";
let dockerConfigFile = "";
let dockerConfigAuthority: PrivateFixtureFile | undefined;
let childEnvironment: NodeJS.ProcessEnv | undefined;
const localTags: string[] = [];
let registryStarted = false;
let composeCreated = false;
let labelsVerified = false;
let secretVolumeCreated = false;
let dockerAuthorityValidated = false;
let dockerEndpoint = "";
let dockerPlatform = "";
let rootCreated = false;
let trustedSource: TrustedFixtureSource | undefined;
let trustedCode: PrivateFixtureFile[] = [];
let approvedTunesImages: string[] = [];
const internalAuthorityBytes = new Map<string, Buffer>();

function privateTemporaryDirectory(prefix: string, environment: NodeJS.ProcessEnv): string {
  const directory = mkdtempSync(prefix);
  if (process.platform !== "win32") {
    chmodSync(directory, 0o700);
    return directory;
  }
  assert(whoamiAuthority !== undefined && icaclsAuthority !== undefined, "Windows fixture security tools are unavailable");
  assertTrustedSystemExecutableUnchanged(whoamiAuthority);
  const identity = spawnSync(whoamiAuthority.path, ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  assertTrustedSystemExecutableUnchanged(whoamiAuthority);
  const sid = identity.stdout.match(/,"([^"]+)"\s*$/)?.[1];
  assert(identity.status === 0 && sid !== undefined, "Windows fixture identity is unavailable");
  assertTrustedSystemExecutableUnchanged(icaclsAuthority);
  const hardened = spawnSync(icaclsAuthority.path, [directory, "/inheritance:r", "/grant:r",
    `*${sid}:(OI)(CI)(F)`, "*S-1-5-18:(OI)(CI)(F)", "*S-1-5-32-544:(OI)(CI)(F)"], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  assertTrustedSystemExecutableUnchanged(icaclsAuthority);
  assert(hardened.status === 0, "Windows fixture root hardening failed");
  return directory;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sanitize(value: string): string {
  return value
    .replaceAll(root, "<fixture-root>")
    .replaceAll(root.replaceAll("\\", "/"), "<fixture-root>")
    .replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi, "<developer-home>")
    .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{32,}/g, "<redacted>")
    .slice(-2_000);
}

function run(
  phase: string,
  file: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; allowFailure?: boolean; input?: string | Buffer } = {},
) {
  const environment = options.env ?? childEnvironment;
  assert(environment !== undefined, "sanitized child environment is unavailable");
  const executableAuthority = trustedTools.find(({ path }) => path === file);
  if (executableAuthority) assertTrustedSystemExecutableUnchanged(executableAuthority);
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? repoRoot,
    env: environment,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
    input: options.input,
  });
  if (executableAuthority) assertTrustedSystemExecutableUnchanged(executableAuthority);
  const status = result.status ?? (result.error ? 127 : 1);
  if (!options.allowFailure && status !== 0) {
    throw new Error(`${phase} failed with exit ${status}: ${sanitize(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)}`);
  }
  return { status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function dockerRun(phase: string, args: string[], options: { timeoutMs?: number; allowFailure?: boolean; input?: string | Buffer } = {}) {
  assert(dockerAuthorityValidated && dockerEndpoint !== "" && dockerConfigAuthority !== undefined,
    "local Docker authority is not validated");
  assertPrivateFixtureFileUnchanged(dockerConfigAuthority);
  if (args[0] === "compose") assertTrustedSystemExecutableUnchanged(composeAuthority);
  const result = run(phase, docker, ["--config", dockerConfigDirectory, "--host", dockerEndpoint, ...args], {
    timeoutMs: options.timeoutMs,
    allowFailure: options.allowFailure,
    input: options.input,
  });
  if (args[0] === "compose") assertTrustedSystemExecutableUnchanged(composeAuthority);
  assertPrivateFixtureFileUnchanged(dockerConfigAuthority);
  return result;
}

function validateLocalDockerAuthority(): void {
  assert(dockerConfigAuthority !== undefined, "private Docker configuration is unavailable");
  const endpoint = process.platform === "win32"
    ? "npipe:////./pipe/dockerDesktopLinuxEngine"
    : "unix:///var/run/docker.sock";
  assertTrustedSystemExecutableUnchanged(composeAuthority);
  const composeInspection = run("protected Docker Compose plugin inspection", docker, [
    "--config", dockerConfigDirectory, "--host", endpoint, "compose", "version", "--short",
  ], { allowFailure: true });
  assertTrustedSystemExecutableUnchanged(composeAuthority);
  assert(composeInspection.status === 0 && /^v?[0-9]+\.[0-9]+\.[0-9]+/.test(composeInspection.stdout.trim()),
    "protected Docker Compose plugin is unavailable");
  const inspection = run("fixed local Docker endpoint inspection", docker, [
    "--config", dockerConfigDirectory, "--host", endpoint,
    "version", "--format", "{{.Server.Os}}/{{.Server.Arch}}",
  ], { allowFailure: true });
  assert(inspection.status === 0 && inspection.stdout.trim() === "linux/amd64",
    "fixed local Docker endpoint must provide the reviewed linux/amd64 platform");
  dockerEndpoint = endpoint;
  dockerPlatform = inspection.stdout.trim();
  dockerAuthorityValidated = true;
}

function requireReviewedLocalImage(name: ReviewedFixtureImageName): string {
  const manifest = REVIEWED_FIXTURE_IMAGES[dockerPlatform as keyof typeof REVIEWED_FIXTURE_IMAGES];
  if (!manifest) return requireReviewedFixtureImage(name, dockerPlatform, {});
  const reference = manifest[name];
  const inspection = dockerRun(`reviewed ${name} image prerequisite`, ["image", "inspect", reference], { allowFailure: true });
  assert(inspection.status === 0, `required reviewed image is unavailable offline: ${name}`);
  const rows = JSON.parse(inspection.stdout) as Array<Record<string, unknown>>;
  assert(rows.length === 1, `reviewed fixture image identity mismatch: ${name}`);
  return requireReviewedFixtureImage(name, dockerPlatform, rows[0]!);
}

function shellPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return process.platform === "win32" ? `/${normalized[0]!.toLowerCase()}${normalized.slice(2)}` : normalized;
}

function shellLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function privateFile(path: string, value: string): void {
  writeFileSync(path, value, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  internalAuthorityBytes.set(path, Buffer.from(value, "utf8"));
}

function secret(): string {
  return randomBytes(32).toString("base64url");
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveReady());
  });
  const address = server.address();
  assert(address && typeof address !== "string", "could not reserve a loopback port");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

function labels() {
  return {
    "com.explorers.fixture.scope": resourceScope,
    "com.explorers.fixture.project": project,
  };
}

function tunesEnvironment(slot: "blue" | "green") {
  const upper = slot.toUpperCase();
  return {
    NODE_ENV: "production",
    PORT: "5000",
    MUSIC_MODE: "live",
    MUSIC_DATABASE_HOST: "db",
    MUSIC_DATABASE_PORT: "5432",
    MUSIC_DATABASE_NAME: "music_release_fixture",
    MUSIC_DATABASE_USER: "music_runtime_login",
    MUSIC_DATABASE_MIGRATOR_USER: "music_migrator",
    MUSIC_DATABASE_PASSWORD_FILE: "/run/music-secrets/database-runtime",
    SESSION_SECRET: "${SESSION_SECRET}",
    COOKIE_SECRET: "${COOKIE_SECRET}",
    STRAPI_URL: "${STRAPI_URL}",
    MUSIC_STRAPI_ALLOWED_ORIGINS: "https://8.8.8.8",
    STRAPI_ACCESS_TOKEN: "${STRAPI_ACCESS_TOKEN}",
    STRAPI_JWT_SECRET: "${STRAPI_JWT_SECRET}",
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: "/run/music-secrets/strapi-lifecycle",
    TRUST_PROXY_HOPS: "1",
    MUSIC_TRUSTED_PROXY_IP: "${TRAEFIK_PROXY_IP}",
    ALLOWED_ORIGINS: "https://localtunes.earth",
    MUSIC_GATE_ATTESTATION_KEY: "${MUSIC_GATE_ATTESTATION_KEY}",
    MUSIC_DEPLOYMENT_HEALTH_ENABLED: "true",
    MUSIC_NEW_ENTRY_KILL_SWITCH: "true",
    MUSIC_COHORT_ENABLED: "false",
    MUSIC_TOKEN_CURRENT_KID: "fixture-token-current-v1",
    MUSIC_TOKEN_CURRENT_SECRET_FILE: "/run/music-secrets/music-token/current",
    MUSIC_TOKEN_LIFETIME_SECONDS: "600",
    MUSIC_TOKEN_CLOCK_SKEW_SECONDS: "15",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-current-v1",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: "/run/music-secrets/music-publication-response/current",
    MUSIC_PUBLIC_ID_HMAC_KEY_FILE: "/run/music-secrets/music-publication-response/public-id",
    MUSIC_IMAGE_DIGEST: `\${TUNES_${upper}_DIGEST}`,
    MUSIC_IMAGE_COMMIT: `\${TUNES_${upper}_COMMIT}`,
    MUSIC_MIGRATION_MARKER: `\${TUNES_${upper}_MIGRATION}`,
    MUSIC_GATE_ATTESTATION_PATH: `/deployment-gates/\${TUNES_${upper}_DIGEST}.json`,
  };
}

function tunesService(slot: "blue" | "green") {
  const upper = slot.toUpperCase();
  return {
    image: `\${TUNES_${upper}_IMAGE}`,
    pull_policy: "never",
    restart: "unless-stopped",
    depends_on: { db: { condition: "service_healthy" } },
    environment: tunesEnvironment(slot),
    volumes: [
      "music-gate-attestations:/deployment-gates:ro",
      "fixture-secrets:/run/music-secrets:ro",
    ],
    networks: ["proxy", "internal"],
    healthcheck: {
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:5000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],
      interval: "2s",
      timeout: "2s",
      retries: 20,
    },
    labels: labels(),
  };
}

function writeRequest(operation: "bootstrap" | "deploy" | "rollback", digest: string, commit: string, legacyService: string): void {
  privateFile(requestFile, [
    "music-deploy-request-v2",
    `operation=${operation}`,
    `digest=${digest}`,
    `commit=${commit}`,
    `compose_project=${operation === "bootstrap" ? project : "-"}`,
    `legacy_service=${operation === "bootstrap" ? legacyService : "-"}`,
    "",
  ].join("\n"));
}

function deploymentEnvironment(registryPort: number, traefikProxyIp: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  assert(childEnvironment !== undefined, "sanitized child environment is unavailable");
  return {
    ...childEnvironment,
    MUSIC_DEPLOY_MODE: "fixture",
    MUSIC_DEPLOY_TEST_MODE: "1",
    MUSIC_DEPLOY_FIXTURE_ACK: "C10_LOCAL_REGISTRY_DISPOSABLE_ONLY",
    MUSIC_DEPLOY_FIXTURE_REGISTRY: `127.0.0.1:${registryPort}`,
    MUSIC_DEPLOY_FIXTURE_COMPOSE_PROJECT: project,
    MUSIC_DEPLOY_ROOT: shellPath(root),
    MUSIC_DEPLOY_REQUEST_FILE: shellPath(requestFile),
    MUSIC_DEPLOY_HMAC_KEY_FILE: shellPath(hmacFile),
    MUSIC_DEPLOY_TEST_CURL_COMMAND: shellPath(curlShim),
    MUSIC_DEPLOY_TEST_READINESS_ATTEMPTS: "20",
    TRAEFIK_PROXY_IP: traefikProxyIp,
    ...extra,
  };
}

function deploy(registryPort: number, traefikProxyIp: string, extra: NodeJS.ProcessEnv = {}, allowFailure = false) {
  assert(trustedSource !== undefined && trustedCode.length === 3 && dockerConfigAuthority !== undefined,
    "trusted deployment code is unavailable");
  assertTrustedFixtureSourceUnchanged(trustedSource);
  const dynamicAuthorities = [composeFile, environmentFile, requestFile, hmacFile].map((path) => {
    const expected = internalAuthorityBytes.get(path);
    assert(expected !== undefined, "internal fixture authority bytes are unavailable");
    return capturePrivateFixtureFile(path, expected);
  });
  assertTrustedSystemExecutableUnchanged(nodeAuthority);
  assertTrustedSystemExecutableUnchanged(dockerAuthority);
  assertTrustedSystemExecutableUnchanged(composeAuthority);
  const privateAuthorities = [dockerConfigAuthority, ...trustedCode, ...dynamicAuthorities];
  const authorities = [nodeAuthority, dockerAuthority, composeAuthority, ...privateAuthorities];
  const engine = trustedCode.find(({ path }) => basename(path) === "music-deploy-engine.sh");
  assert(engine !== undefined, "trusted deployment engine is unavailable");
  const adapter = createInternalFixturePolicyScript({
    engineFile: shellPath(engine.path),
    root: shellPath(root),
    repository: `127.0.0.1:${registryPort}/explorers-tunes`,
    source,
    composeProject: project,
    nodeExecutable: shellPath(nodeAuthority.path),
    dockerExecutable: shellPath(docker),
    dockerConfigDirectory: shellPath(dockerConfigDirectory),
    dockerEndpoint,
    approvedImages: approvedTunesImages,
    authorities: authorities.map(({ path, digest, device, inode, links, size }) => ({
      path: shellPath(path), digest, device, inode, links, size,
    })),
  });
  const result = run("shared deployment engine", bash, ["--noprofile", "--norc", "-s"], {
    env: deploymentEnvironment(registryPort, traefikProxyIp, extra),
    timeoutMs: 8 * 60_000,
    allowFailure: true,
    input: adapter,
  });
  for (const authority of privateAuthorities) assertPrivateFixtureFileUnchanged(authority);
  assertTrustedSystemExecutableUnchanged(nodeAuthority);
  assertTrustedSystemExecutableUnchanged(dockerAuthority);
  assertTrustedSystemExecutableUnchanged(composeAuthority);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`shared deployment engine failed with exit ${result.status}: ${sanitize(`${result.stdout}\n${result.stderr}`)}`);
  }
  return result;
}

function compose(args: string[], allowFailure = false) {
  const authorities = [composeFile, environmentFile].map((path) => {
    const expected = internalAuthorityBytes.get(path);
    assert(expected !== undefined, "internal Compose authority bytes are unavailable");
    return capturePrivateFixtureFile(path, expected);
  });
  const result = dockerRun("fixture Compose", [
    "compose", "-p", project, "--project-directory", root, "--env-file", environmentFile,
    "-f", composeFile, ...args,
  ], { timeoutMs: 3 * 60_000, allowFailure });
  for (const authority of authorities) assertPrivateFixtureFileUnchanged(authority);
  return result;
}

function activeState(): { slot: string; digest: string; commit: string } {
  const fields = readFileSync(join(root, "deployment-state/music-state.tsv"), "utf8").trim().split("\t");
  assert(fields.length === 10 && fields[0] === "music-state-v2", "deployment state evidence is malformed");
  return { slot: fields[2]!, digest: fields[3]!, commit: fields[4]! };
}

function publicJson(path: string, method: "GET" | "POST" = "GET", expectedStatus = 200): Record<string, unknown> {
  privateFile(publicProbeHeaders, "");
  const curlShimAuthority = capturePrivateFixtureFile(curlShim, internalAuthorityBytes.get(curlShim)!);
  assertTrustedSystemExecutableUnchanged(curlAuthority);
  const result = run("public fixture probe", bash, [
    shellPath(curlShim), "--silent", "--show-error",
    ...(method === "POST" ? ["--request", "POST", "--data", "{}"] : []),
    "--dump-header", shellPath(publicProbeHeaders),
    `https://localtunes.earth${path}`,
  ], {
    timeoutMs: 15_000,
  });
  assertPrivateFixtureFileUnchanged(curlShimAuthority);
  assertTrustedSystemExecutableUnchanged(curlAuthority);
  const statusMatches = Array.from(readFileSync(publicProbeHeaders, "utf8").matchAll(/^HTTP\/\S+\s+(\d{3})/gm));
  const actualStatus = Number(statusMatches.at(-1)?.[1] ?? 0);
  assert(actualStatus === expectedStatus,
    `public fixture probe status mismatch: expected=${expectedStatus}, actual=${actualStatus || "transport"}`);
  privateFile(publicProbeHeaders, "");
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function verifyResourceLabels(): void {
  const ids = dockerRun("fixture resource discovery", [
    "ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}",
  ]).stdout.split(/\r?\n/).filter(Boolean);
  assert(ids.length >= 4, "disposable deployment services are missing");
  const inspected = JSON.parse(dockerRun("fixture label verification", ["inspect", ...ids]).stdout) as Array<{
    Config?: { Labels?: Record<string, string> };
  }>;
  assert(inspected.every((entry) => entry.Config?.Labels?.["com.explorers.fixture.scope"] === resourceScope
    && entry.Config.Labels["com.explorers.fixture.project"] === project), "disposable deployment labels are invalid");
  const registryInspection = JSON.parse(dockerRun("registry label verification", ["inspect", registryContainer]).stdout) as Array<{
    Config?: { Labels?: Record<string, string> };
  }>;
  assert(registryInspection[0]?.Config?.Labels?.["com.explorers.fixture.scope"] === resourceScope
    && registryInspection[0]?.Config?.Labels?.["com.explorers.fixture.project"] === project,
  "loopback registry labels are invalid");
  const volumeInspection = JSON.parse(dockerRun("secret volume label verification", ["volume", "inspect", secretVolume]).stdout) as Array<{
    Labels?: Record<string, string>;
  }>;
  assert(volumeInspection[0]?.Labels?.["com.explorers.fixture.scope"] === resourceScope
    && volumeInspection[0]?.Labels?.["com.explorers.fixture.project"] === project,
  "secret volume labels are invalid");
  labelsVerified = true;
}

function cleanupLabelsAreAuthorized(): boolean {
  const ids = dockerRun("cleanup resource discovery", [
    "ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}",
  ], { allowFailure: true }).stdout.split(/\r?\n/).filter(Boolean);
  if (ids.length) {
    const inspected = JSON.parse(dockerRun("cleanup label verification", ["inspect", ...ids], { allowFailure: true }).stdout || "[]") as Array<{
      Config?: { Labels?: Record<string, string> };
    }>;
    if (inspected.length !== ids.length || !inspected.every((entry) => entry.Config?.Labels?.["com.explorers.fixture.scope"] === resourceScope
      && entry.Config.Labels["com.explorers.fixture.project"] === project)) return false;
  }
  if (registryStarted) {
    const inspection = dockerRun("cleanup registry label verification", ["inspect", registryContainer], { allowFailure: true });
    if (inspection.status !== 0) return false;
    const rows = JSON.parse(inspection.stdout) as Array<{ Config?: { Labels?: Record<string, string> } }>;
    if (rows[0]?.Config?.Labels?.["com.explorers.fixture.scope"] !== resourceScope
      || rows[0]?.Config?.Labels?.["com.explorers.fixture.project"] !== project) return false;
  }
  if (secretVolumeCreated) {
    const inspection = dockerRun("cleanup secret volume label verification", ["volume", "inspect", secretVolume], { allowFailure: true });
    if (inspection.status !== 0) return false;
    const rows = JSON.parse(inspection.stdout) as Array<{ Labels?: Record<string, string> }>;
    if (rows[0]?.Labels?.["com.explorers.fixture.scope"] !== resourceScope
      || rows[0]?.Labels?.["com.explorers.fixture.project"] !== project) return false;
  }
  return true;
}

async function main(): Promise<void> {
  assertNoExternalFixtureAuthority(process.env);
  trustedSource = captureTrustedFixtureSource(fileURLToPath(import.meta.url));
  repoRoot = trustedSource.nativeRepoRoot;
  const preRootEnvironment = createSanitizedFixtureEnvironment(repoRoot, trustedPathEntries);
  assertTrustedFixtureSourceUnchanged(trustedSource);
  project = `music-c10-release-${randomBytes(4).toString("hex")}`;
  registryContainer = `${project}-registry`;
  secretVolume = `${project}-secrets`;
  root = privateTemporaryDirectory(join(dirname(repoRoot), `${project}-`), preRootEnvironment);
  rootCreated = true;
  childEnvironment = createSanitizedFixtureEnvironment(root, trustedPathEntries);
  composeFile = join(root, "docker-compose.yml");
  environmentFile = join(root, "production.env");
  requestFile = join(root, "request.txt");
  hmacFile = join(root, "hmac.key");
  curlShim = join(root, "fixture-curl.sh");
  publicProbeHeaders = join(root, "public-probe.headers");
  derivedDockerfile = join(root, "Dockerfile.candidate");
  baseImage = `${project}-base:local`;
  dockerConfigDirectory = join(root, ".docker-client");
  dockerConfigFile = join(dockerConfigDirectory, "config.json");
  mkdirSync(dockerConfigDirectory, { mode: 0o700 });
  privateFile(dockerConfigFile, '{"auths":{}}\n');
  dockerConfigAuthority = capturePrivateFixtureFile(dockerConfigFile, internalAuthorityBytes.get(dockerConfigFile)!);
  validateLocalDockerAuthority();
  assert(basename(root).startsWith(`${project}-`), "unsafe fixture root");
  const commit = trustedSource.commit;
  const trustedCodeDirectory = join(root, ".tracked-deployment-code");
  mkdirSync(trustedCodeDirectory, { mode: 0o700 });
  trustedCode = Object.entries(trustedSource.codeFiles).map(([name, bytes]) => {
    const path = join(trustedCodeDirectory, name);
    privateFile(path, bytes.toString("utf8"));
    return capturePrivateFixtureFile(path, bytes);
  });
  const registryPort = await unusedPort();
  const traefikPort = await unusedPort();
  const repository = `127.0.0.1:${registryPort}/explorers-tunes`;
  const legacyService = `${project}-legacy`;

  const prerequisiteImages = {
    registry: requireReviewedLocalImage("registry"),
    postgres: requireReviewedLocalImage("postgres"),
    traefik: requireReviewedLocalImage("traefik"),
    node: requireReviewedLocalImage("node"),
  };
  assertTrustedFixtureSourceUnchanged(trustedSource);

  const secretDirectory = join(root, "secrets");
  const tokenDirectory = join(secretDirectory, "music-token");
  const publicationDirectory = join(secretDirectory, "music-publication-response");
  mkdirSync(tokenDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(publicationDirectory, { recursive: true, mode: 0o700 });
  const secretPaths = {
    tokenDirectory,
    publicationDirectory,
    runtimePassword: join(secretDirectory, "database-runtime"),
    migratorPassword: join(secretDirectory, "database-migrator"),
    lifecycle: join(secretDirectory, "strapi-lifecycle"),
    reconciliation: join(secretDirectory, "strapi-reconciliation"),
  };
  const migratorPassword = secret();
  const tokenSecret = secret();
  const publicationSecret = secret();
  const publicIdSecret = secret();
  const runtimePassword = secret();
  const lifecycleSecret = secret();
  privateFile(join(tokenDirectory, "current"), tokenSecret);
  privateFile(join(publicationDirectory, "current"), publicationSecret);
  privateFile(join(publicationDirectory, "public-id"), publicIdSecret);
  privateFile(secretPaths.runtimePassword, runtimePassword);
  privateFile(secretPaths.migratorPassword, migratorPassword);
  privateFile(secretPaths.lifecycle, lifecycleSecret);
  privateFile(secretPaths.reconciliation, secret());
  privateFile(hmacFile, secret());

  const environment = {
    DB_NAME: "music_release_fixture",
    DB_MIGRATOR_USER: "music_migrator",
    DB_RUNTIME_USER: "music_runtime_login",
    SESSION_SECRET: secret(),
    COOKIE_SECRET: secret(),
    STRAPI_URL: "https://8.8.8.8",
    STRAPI_ACCESS_TOKEN: secret(),
    STRAPI_JWT_SECRET: secret(),
    MUSIC_GATE_ATTESTATION_KEY: secret(),
    MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST: publicationDirectory.replaceAll("\\", "/"),
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "fixture-publication-current-v1",
    MUSIC_TOKEN_SECRET_DIRECTORY_HOST: tokenDirectory.replaceAll("\\", "/"),
    MUSIC_TOKEN_CURRENT_KID: "fixture-token-current-v1",
    DB_RUNTIME_PASSWORD_FILE_HOST: secretPaths.runtimePassword.replaceAll("\\", "/"),
    DB_MIGRATOR_PASSWORD_FILE_HOST: secretPaths.migratorPassword.replaceAll("\\", "/"),
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST: secretPaths.lifecycle.replaceAll("\\", "/"),
    STRAPI_RECONCILIATION_TOKEN_FILE_HOST: secretPaths.reconciliation.replaceAll("\\", "/"),
  };
  privateFile(environmentFile, `${Object.entries(environment).map(([name, value]) => `${name}=${value}`).join("\n")}\n`);
  privateFile(curlShim, `#!/usr/bin/env bash
set -euo pipefail
mapped=()
for argument in "$@"; do
  if [[ "$argument" == https://localtunes.earth* ]]; then
    mapped+=("http://127.0.0.1:${traefikPort}\${argument#https://localtunes.earth}")
  else
    mapped+=("$argument")
  fi
done
exec ${shellLiteral(shellPath(curl))} --header "Host: localtunes.earth" "\${mapped[@]}"
`);
  chmodSync(curlShim, 0o700);

  dockerRun("loopback registry start", [
    "run", "--pull=never", "-d", "--name", registryContainer,
    "--label", `com.explorers.fixture.scope=${resourceScope}`,
    "--label", `com.explorers.fixture.project=${project}`,
    "-p", `127.0.0.1:${registryPort}:5000`, prerequisiteImages.registry,
  ], { timeoutMs: 3 * 60_000 });
  registryStarted = true;
  let registryReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${registryPort}/v2/`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) { registryReady = true; break; }
    } catch { /* bounded readiness retry */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert(registryReady, "loopback registry did not become ready");

  const registryDigest = async (repositoryName: string, tag: string): Promise<string> => {
    const response = await fetch(`http://127.0.0.1:${registryPort}/v2/${repositoryName}/manifests/${tag}`, {
      method: "HEAD",
      headers: {
        accept: [
          "application/vnd.oci.image.index.v1+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.docker.distribution.manifest.v2+json",
        ].join(", "),
      },
      signal: AbortSignal.timeout(5_000),
    });
    assert(response.ok, `${repositoryName} registry manifest lookup failed`);
    return requireRegistryReturnedDigest(response.headers.get("docker-content-digest") ?? undefined);
  };

  const localImageId = (phase: string, reference: string): string => {
    const id = dockerRun(phase, ["image", "inspect", "--format", "{{.Id}}", reference]).stdout.trim();
    assert(/^sha256:[a-f0-9]{64}$/.test(id), `${phase} returned an invalid image identity`);
    return id;
  };

  const localImageInspection = (phase: string, reference: string): Record<string, unknown> => {
    const rows = JSON.parse(dockerRun(phase, ["image", "inspect", reference]).stdout) as Array<Record<string, unknown>>;
    assert(rows.length === 1, `${phase} returned an invalid image inspection`);
    return rows[0]!;
  };

  const transferLocalImage = async (
    sourceImage: string,
    repositoryName: string,
    destinationTag = "fixture",
  ): Promise<string> => {
    const repository = `127.0.0.1:${registryPort}/${repositoryName}`;
    const tag = `${repository}:${destinationTag}`;
    const sourceInspection = localImageInspection(`${repositoryName} source inspection`, sourceImage);
    const sourceId = sourceInspection.Id;
    assert(typeof sourceId === "string" && /^sha256:[a-f0-9]{64}$/.test(sourceId),
      `${repositoryName} source inspection returned an invalid image identity`);
    if (sourceImage !== tag) dockerRun(`${repositoryName} local tag`, ["image", "tag", sourceImage, tag]);
    localTags.push(tag);
    assertStableLocalImageTransfer(repositoryName, sourceId, [
      localImageId(`${repositoryName} source identity after tag`, sourceImage),
      localImageId(`${repositoryName} destination identity after tag`, tag),
    ]);
    dockerRun(`${repositoryName} loopback transfer`, ["push", tag], { timeoutMs: 3 * 60_000 });
    assertStableLocalImageTransfer(repositoryName, sourceId, [
      localImageId(`${repositoryName} source identity after push`, sourceImage),
      localImageId(`${repositoryName} destination identity after push`, tag),
    ]);
    const exactImage = `${repository}@${await registryDigest(repositoryName, destinationTag)}`;
    dockerRun(`${repositoryName} immutable registry pull`, ["pull", exactImage], { timeoutMs: 3 * 60_000 });
    assertStableLocalImageTransfer(repositoryName, sourceId, [
      localImageId(`${repositoryName} source identity after immutable pull`, sourceImage),
    ]);
    assertEquivalentLocalImageTransfer(repositoryName, exactImage, sourceInspection,
      localImageInspection(`${repositoryName} immutable local identity`, exactImage));
    localTags.push(exactImage);
    return exactImage;
  };

  const traefikImage = prerequisiteImages.traefik;
  const postgresImage = prerequisiteImages.postgres;

  assertTrustedFixtureSourceUnchanged(trustedSource);
  assert(requireReviewedLocalImage("node") === prerequisiteImages.node,
    "preloaded Node build image identity changed");
  dockerRun("exact Tunes source image build", [
    "build", "--pull=false", "--file", "Dockerfile", "--tag", baseImage,
    "--build-arg", `BUILD_COMMIT=${commit}`, "--build-arg", `BUILD_SOURCE=${source}`,
    "-",
  ], { timeoutMs: 15 * 60_000, input: trustedSource.tunesArchive });
  assert(requireReviewedLocalImage("node") === prerequisiteImages.node,
    "preloaded Node build image identity changed");
  const immutableBaseImage = await transferLocalImage(baseImage, "fixture-tunes-base");
  privateFile(derivedDockerfile, [
    `FROM ${immutableBaseImage}`,
    "ARG CANDIDATE",
    `LABEL org.opencontainers.image.revision=${commit}`,
    `LABEL org.opencontainers.image.source=${source}`,
    `LABEL com.explorers.music.minimum-containment-commit=${containment}`,
    "LABEL com.explorers.music.fixture.candidate=$CANDIDATE",
    "",
  ].join("\n"));
  privateFile(join(root, ".dockerignore"), "**\n!Dockerfile.candidate\n");

  const digests: string[] = [];
  for (const candidate of ["a", "b"] as const) {
    const tag = `${repository}:candidate-${candidate}`;
    localTags.push(tag);
    dockerRun(`candidate ${candidate} build`, [
      "build", "--pull=false", "--file", derivedDockerfile, "--tag", tag, "--build-arg", `CANDIDATE=${candidate}`, root,
    ], { timeoutMs: 3 * 60_000 });
    const exactCandidate = await transferLocalImage(tag, "explorers-tunes", `candidate-${candidate}`);
    digests.push(exactCandidate.slice(exactCandidate.lastIndexOf("@") + 1));
  }
  const [digestA, digestB] = digests;
  assert(digestA && digestB && digestA !== digestB, "local candidates must have distinct immutable digests");
  const initialImage = `${repository}@${digestA}`;
  approvedTunesImages = [`${repository}@${digestA}`, `${repository}@${digestB}`];
  localTags.push(initialImage, `${repository}@${digestB}`);
  privateFile(environmentFile, `${readFileSync(environmentFile, "utf8")}${[
    `TUNES_BLUE_IMAGE=${repository}@${digestA}`,
    `TUNES_BLUE_DIGEST=${digestA}`,
    `TUNES_BLUE_COMMIT=${commit}`,
    `TUNES_BLUE_MIGRATION=${marker}`,
    `TUNES_GREEN_IMAGE=${repository}@${digestA}`,
    `TUNES_GREEN_DIGEST=${digestA}`,
    `TUNES_GREEN_COMMIT=${commit}`,
    `TUNES_GREEN_MIGRATION=${marker}`,
    `TUNES_CANDIDATE_IMAGE=${repository}@${digestA}`,
    `TUNES_CANDIDATE_DIGEST=${digestA}`,
    `TUNES_CANDIDATE_COMMIT=${commit}`,
    `TUNES_CANDIDATE_MIGRATION=${marker}`,
    `TUNES_COMPAT_IMAGE=${repository}@${digestA}`,
    "TUNES_GATE_ENTRYPOINT=dist/server/deployment/run-migration-gate.js",
    "",
  ].join("\n")}`);

  dockerRun("labeled secret volume creation", [
    "volume", "create",
    "--label", `com.explorers.fixture.scope=${resourceScope}`,
    "--label", `com.explorers.fixture.project=${project}`,
    secretVolume,
  ]);
  secretVolumeCreated = true;
  const writeContainerSecrets = (databaseMigratorPassword: string) => dockerRun("private container secret provisioning", [
    "run", "--pull=never", "--rm", "-i", "-v", `${secretVolume}:/secrets`, immutableBaseImage, "sh", "-c", [
      "set -eu", "umask 077", "mkdir -p /secrets/music-token /secrets/music-publication-response",
      "IFS= read -r runtime", "IFS= read -r migrator", "IFS= read -r token", "IFS= read -r publication", "IFS= read -r public_id", "IFS= read -r lifecycle",
      "printf %s \"$runtime\" > /secrets/database-runtime",
      "printf %s \"$migrator\" > /secrets/database-migrator",
      "printf %s \"$token\" > /secrets/music-token/current",
      "printf %s \"$publication\" > /secrets/music-publication-response/current",
      "printf %s \"$public_id\" > /secrets/music-publication-response/public-id",
      "printf %s \"$lifecycle\" > /secrets/strapi-lifecycle",
      "chmod 600 /secrets/database-runtime /secrets/database-migrator /secrets/music-token/current /secrets/music-publication-response/current /secrets/music-publication-response/public-id /secrets/strapi-lifecycle",
    ].join("; "),
  ], { input: `${runtimePassword}\n${databaseMigratorPassword}\n${tokenSecret}\n${publicationSecret}\n${publicIdSecret}\n${lifecycleSecret}\n` });
  writeContainerSecrets(migratorPassword);

  const commonVolumes = [
    "music-gate-attestations:/deployment-gates",
    "fixture-secrets:/run/music-secrets:ro",
  ];
  const composeAuthority = {
    name: project,
    services: {
      traefik: {
        image: traefikImage,
        pull_policy: "never",
        command: [
          "--api.dashboard=false",
          "--providers.docker=false",
          "--providers.file.directory=/deployment-routing",
          "--providers.file.watch=true",
          "--entrypoints.websecure.address=:443",
        ],
        ports: [`127.0.0.1:${traefikPort}:443`],
        volumes: [
          `${join(root, "deployment-routing").replaceAll("\\", "/")}:/deployment-routing:ro`,
        ],
        networks: ["proxy"],
        labels: labels(),
      },
      db: {
        image: postgresImage,
        pull_policy: "never",
        environment: {
          POSTGRES_USER: "music_migrator",
          POSTGRES_PASSWORD_FILE: "/run/music-secrets/database-migrator",
          POSTGRES_DB: "music_release_fixture",
        },
        volumes: ["postgres-data:/var/lib/postgresql/data", "fixture-secrets:/run/music-secrets:ro"],
        networks: ["internal"],
        healthcheck: {
          test: ["CMD-SHELL", "pg_isready -U music_migrator -d music_release_fixture"],
          interval: "2s",
          timeout: "2s",
          retries: 30,
        },
        labels: labels(),
      },
      "legacy-tunes": {
        image: `${repository}@${digestA}`,
        pull_policy: "never",
        container_name: legacyService,
        command: ["node", "-e", "require('node:http').createServer((q,s)=>{s.writeHead(200,{'content-type':'text/plain'});s.end('legacy')}).listen(5000,'0.0.0.0')"],
        networks: ["proxy"],
        labels: labels(),
      },
      "tunes-blue": tunesService("blue"),
      "tunes-green": tunesService("green"),
      "tunes-gate": {
        profiles: ["deployment"],
        image: "${TUNES_CANDIDATE_IMAGE}",
        pull_policy: "never",
        restart: "no",
        command: ["node", "${TUNES_GATE_ENTRYPOINT:-dist/server/deployment/run-migration-gate.js}"],
        environment: {
          MUSIC_MODE: "live",
          MUSIC_DATABASE_HOST: "db",
          MUSIC_DATABASE_PORT: "5432",
          MUSIC_DATABASE_NAME: "music_release_fixture",
          MUSIC_DATABASE_USER: "music_migrator",
          MUSIC_DATABASE_PASSWORD_FILE: "/run/music-secrets/database-migrator",
          MUSIC_RUNTIME_DATABASE_USER: "music_runtime_login",
          MUSIC_RUNTIME_DATABASE_PASSWORD_FILE: "/run/music-secrets/database-runtime",
          MUSIC_IMAGE_DIGEST: "${TUNES_CANDIDATE_DIGEST}",
          MUSIC_IMAGE_COMMIT: "${TUNES_CANDIDATE_COMMIT}",
          MUSIC_MIGRATION_MARKER: "${TUNES_CANDIDATE_MIGRATION}",
          MUSIC_GATE_ATTESTATION_KEY: "${MUSIC_GATE_ATTESTATION_KEY}",
          MUSIC_GATE_ATTESTATION_PATH: "/deployment-gates/${TUNES_CANDIDATE_DIGEST}.json",
        },
        depends_on: { db: { condition: "service_healthy" } },
        volumes: commonVolumes,
        networks: ["internal"],
        labels: labels(),
      },
      "tunes-register-compat": {
        profiles: ["deployment"],
        image: "${TUNES_COMPAT_IMAGE}",
        pull_policy: "never",
        restart: "unless-stopped",
        command: ["node", "dist/server/deployment/run-registration-compat.js"],
        environment: { PORT: "5100" },
        networks: ["proxy"],
        labels: labels(),
      },
    },
    networks: { proxy: {}, internal: { internal: true } },
    volumes: {
      "postgres-data": {},
      "music-gate-attestations": {},
      "fixture-secrets": { external: true, name: secretVolume },
    },
  };
  privateFile(composeFile, `${JSON.stringify(composeAuthority, null, 2)}\n`);
  composeCreated = true;
  compose(["up", "-d", "db", "legacy-tunes", "traefik"]);
  const traefikContainerId = compose(["ps", "-q", "traefik"]).stdout.trim();
  assert(/^[a-f0-9]{12,64}$/.test(traefikContainerId), "fixture Traefik container is missing");
  const traefikNetworks = JSON.parse(dockerRun("fixture Traefik network inspection", [
    "inspect", "--format", "{{json .NetworkSettings.Networks}}", traefikContainerId,
  ]).stdout) as Record<string, { IPAddress?: string }>;
  const traefikProxyIp = Object.entries(traefikNetworks)
    .find(([name]) => name.endsWith("_proxy"))?.[1].IPAddress;
  assert(traefikProxyIp && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(traefikProxyIp), "fixture Traefik proxy address is invalid");
  privateFile(environmentFile, `${readFileSync(environmentFile, "utf8")}TRAEFIK_PROXY_IP=${traefikProxyIp}\n`);
  writeContainerSecrets(secret());
  writeRequest("bootstrap", digestA, commit, legacyService);
  const migrationFailure = deploy(registryPort, traefikProxyIp, {}, true);
  assert(migrationFailure.status !== 0, "migration credential fault unexpectedly promoted");
  const routerFile = join(root, "deployment-routing/music-router.yml");
  assert(existsSync(routerFile),
    `migration fault stopped before stable routing: ${sanitize(migrationFailure.stderr)}`);
  assert(readFileSync(routerFile, "utf8").includes(`http://${legacyService}:5000`),
    "migration failure changed the general-service target");
  writeContainerSecrets(migratorPassword);
  const bootstrap = deploy(registryPort, traefikProxyIp, {}, true);
  if (bootstrap.status !== 0) {
    const serviceLogs = compose(["logs", "--no-color", "--tail", "80", "tunes-blue"], true);
    const serviceDiagnostics = serviceLogs.stdout.split(/\r?\n/)
      .filter((line) => /Failed to start server|Error:|Database initialized|Server listening/i.test(line))
      .slice(-10).join("\n");
    const gateDiagnostics = bootstrap.stderr.split(/\r?\n/)
      .filter((line) => /(?:Music migration deployment gate failed|error:|password|database|permission|candidate|readiness|containment)/i.test(line))
      .slice(-20).join("\n");
    throw new Error(`exact bootstrap failed: ${sanitize(`${serviceDiagnostics}\n${gateDiagnostics}`)}`);
  }
  assert(bootstrap.status === 0 && activeState().digest === digestA, "exact bootstrap did not promote candidate A");

  const stableRoute = readFileSync(join(root, "deployment-routing/music-router.yml"));
  const stableState = readFileSync(join(root, "deployment-state/music-state.tsv"));
  const normalEnvironment = readFileSync(environmentFile, "utf8");
  privateFile(environmentFile, normalEnvironment.replace("STRAPI_URL=https://8.8.8.8", "STRAPI_URL=http://8.8.8.8"));
  writeRequest("deploy", digestB, commit, legacyService);
  const readinessFailure = deploy(registryPort, traefikProxyIp, { MUSIC_DEPLOY_TEST_READINESS_ATTEMPTS: "1" }, true);
  assert(readinessFailure.status !== 0, "readiness fault unexpectedly promoted");
  assert(readFileSync(join(root, "deployment-routing/music-router.yml")).equals(stableRoute)
    && readFileSync(join(root, "deployment-state/music-state.tsv")).equals(stableState),
  "readiness failure changed prior route or state authority");
  privateFile(environmentFile, normalEnvironment);
  assert(deploy(registryPort, traefikProxyIp).status === 0 && activeState().digest === digestB, "candidate B promotion failed");

  writeRequest("rollback", digestA, "-", legacyService);
  assert(deploy(registryPort, traefikProxyIp).status === 0, "exact digest rollback failed");
  const rolledBack = activeState();
  assert(rolledBack.digest === digestA && rolledBack.commit === commit, "rollback did not restore exact candidate A");
  const ready = publicJson("/health/ready");
  assert(ready.ready === true && ready.digest === digestA && ready.commit === commit && ready.migrationMarker === marker,
    "public readiness did not bind exact rollback authority");

  writeRequest("rollback", `sha256:${"f".repeat(64)}`, "-", legacyService);
  const unknownRollback = deploy(registryPort, traefikProxyIp, {}, true);
  assert(unknownRollback.status !== 0 && unknownRollback.stderr.includes("unknown secure digest"),
    "unknown rollback was not refused by signed history");
  writeRequest("rollback", digestA, "-", legacyService);
  const preFloorRollback = deploy(registryPort, traefikProxyIp, {
    MUSIC_DEPLOY_TEST_CURRENT_MARKER_OVERRIDE: "0012_publication_replay_expiry_guard",
  }, true);
  assert(preFloorRollback.status !== 0 && /schema compatibility floor/i.test(preFloorRollback.stderr),
    "older schema-floor executable was not refused");

  const entryPolicy = publicJson("/api/music-entry/status");
  assert(entryPolicy.killSwitch === true && entryPolicy.newMusicEntryEnabled === false && entryPolicy.legacyMusicEntryEnabled === false,
    "kill switch did not keep both Music entry paths closed");
  const compatibility = publicJson("/api/register", "POST", 410);
  assert((compatibility.error as { code?: string } | undefined)?.code === "LEGACY_IDENTITY_ROUTE_REMOVED",
    "compatibility route did not retain the typed denial");

  verifyResourceLabels();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "music-operation/v1",
    metric: "real-docker-release",
    compatibilityRouteUsage: 0,
    migrationFailureObserved: true,
    readinessFailureObserved: true,
    rollbackRestored: true,
    unknownRollbackRefused: true,
    preFloorRollbackRefused: true,
    killSwitchVerified: true,
  })}\n`);
}

try {
  await main();
} finally {
  if (dockerAuthorityValidated) {
    const cleanupAuthorized = cleanupLabelsAreAuthorized();
    if (composeCreated && cleanupAuthorized) compose(["--profile", "deployment", "down", "--volumes", "--remove-orphans"], true);
    else if (composeCreated) compose(["stop"], true);
    if (registryStarted && cleanupAuthorized) dockerRun("loopback registry cleanup", ["rm", "-f", registryContainer], { allowFailure: true });
    if (secretVolumeCreated && cleanupAuthorized) dockerRun("secret volume cleanup", ["volume", "rm", secretVolume], { allowFailure: true });
    for (const image of [...localTags, baseImage]) dockerRun("local image cleanup", ["image", "rm", "--force", image], { allowFailure: true });
    if (labelsVerified) {
      const leftovers = dockerRun("cleanup verification", [
        "ps", "-a", "--filter", `label=com.explorers.fixture.project=${project}`, "--format", "{{.ID}}",
      ], { allowFailure: true }).stdout.trim();
      assert(leftovers === "", "labeled disposable containers remain after cleanup");
    }
    assert(cleanupAuthorized, "fixture cleanup refused resources with missing or mismatched labels");
  } else {
    assert(!registryStarted && !composeCreated && !secretVolumeCreated && localTags.length === 0,
      "Docker mutation occurred before local endpoint validation");
  }
  if (rootCreated) {
    assert(basename(root).startsWith(`${project}-`) && dirname(root) === dirname(repoRoot), "unsafe fixture cleanup root");
    rmSync(root, { recursive: true, force: true });
  }
}
