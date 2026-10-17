export interface PlatformAuthority {
  version: 1;
  project: string;
  database: string;
  host: string;
  port: number;
  containerId: string;
  commit: string;
}

export const PLATFORM_PROJECT = "explorers-replatform-local";
export const PLATFORM_DATABASE = "music_fixture";
export const PLATFORM_PORT = 51434;

export type PlatformCommand = { command: "provision" | "start" | "check" | "stop" | "reset" } | { command: "seed"; dataset: "acceptance" } | { command: "test:integration" | "test:routes" };

export function parsePlatformCommand(args: string[]): PlatformCommand {
  if (args.length === 1 && ["provision", "start", "check", "stop", "reset", "test:integration", "test:routes"].includes(args[0])) {
    return { command: args[0] as Exclude<PlatformCommand["command"], "seed"> };
  }
  if (args.length === 3 && args[0] === "seed" && args[1] === "--dataset" && args[2] === "acceptance") {
    return { command: "seed", dataset: "acceptance" };
  }
  throw new Error("replatform local arguments rejected");
}

function refuse(): never { throw new Error("replatform local authority rejected"); }

function validReceipt(value: PlatformAuthority | undefined): value is PlatformAuthority {
  return !!value && value.version === 1 && value.project === PLATFORM_PROJECT
    && value.database === PLATFORM_DATABASE && value.host === "127.0.0.1"
    && value.port === PLATFORM_PORT && /^[a-f0-9]{64}$/.test(value.containerId)
    && /^[a-f0-9]{40}$/.test(value.commit);
}

export function validatePlatformAuthority(receipt: PlatformAuthority | undefined, target: string, commit: string, environment: NodeJS.ProcessEnv = {}): PlatformAuthority {
  if (!validReceipt(receipt) || receipt.commit !== commit) refuse();
  if (Object.entries(environment).some(([key, value]) => value !== undefined && (
    /^MUSIC_UAT_DATABASE_/i.test(key) || /^MUSIC_C10_STANDALONE_POSTGRES_/i.test(key)
    || ["GATE_PROD", "DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "DATABASE_URL_TEST"].includes(key.toUpperCase())
  ))) refuse();
  if (target) {
    let url: URL;
    try { url = new URL(target); } catch { return refuse(); }
    if (url.protocol !== "postgresql:" || url.hostname !== receipt.host || url.port !== String(receipt.port)
      || url.pathname !== `/${receipt.database}` || url.username !== "music_migrator" || !url.password
      || url.search || url.hash) refuse();
  }
  return receipt;
}

export function assertPlatformResetTarget(receipt: PlatformAuthority, target: PlatformAuthority): PlatformAuthority {
  if (!validReceipt(receipt) || !validReceipt(target)
    || Object.keys(receipt).length !== 7 || Object.keys(target).length !== 7
    || Object.keys(receipt).some((key) => receipt[key as keyof PlatformAuthority] !== target[key as keyof PlatformAuthority])) refuse();
  return receipt;
}

export function validatePlatformComposeModel<T>(model: T): T {
  if (!model || typeof model !== "object") refuse();
  const value = model as Record<string, unknown>;
  if (value.name !== PLATFORM_PROJECT) refuse();
  for (const kind of ["services", "networks", "volumes"]) {
    const resources = value[kind];
    if (!resources || typeof resources !== "object" || !Object.keys(resources).length) refuse();
    for (const resource of Object.values(resources as Record<string, unknown>)) {
      if (!resource || typeof resource !== "object") refuse();
      const labels = (resource as Record<string, unknown>).labels;
      if (!labels || typeof labels !== "object"
        || (labels as Record<string, unknown>)["com.explorers.replatform.fixture"] !== "true"
        || (labels as Record<string, unknown>)["com.explorers.replatform.project"] !== PLATFORM_PROJECT) refuse();
    }
  }
  if (!(value.services as Record<string, unknown>).postgres) refuse();
  return model;
}

export function assertResetComposeModel<T>(model: T): T {
  if (!model || typeof model !== "object") refuse();
  const value = model as Record<string, any>;
  if (value.name !== PLATFORM_PROJECT) refuse();
  const exactKeys = (actual: unknown, expected: string[]) => {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)
      || Object.keys(actual).sort().join(",") !== expected.slice().sort().join(",")) refuse();
  };
  exactKeys(value.services, ["postgres", "strapi", "tunes-migrate", "tunes", "explorers"]);
  const targets = {
    networks: {
      "replatform-local": `${PLATFORM_PROJECT}_replatform-local`,
      "replatform-edge": `${PLATFORM_PROJECT}_replatform-edge`,
    },
    volumes: {
      "replatform-local-postgres": `${PLATFORM_PROJECT}_replatform-local-postgres`,
      "replatform-local-gates": `${PLATFORM_PROJECT}_replatform-local-gates`,
    },
  } as const;
  for (const kind of ["networks", "volumes"] as const) {
    exactKeys(value[kind], Object.keys(targets[kind]));
    for (const [key, name] of Object.entries(targets[kind])) {
      const resource = value[kind][key];
      if (!resource || typeof resource !== "object" || resource.name !== name || resource.external === true) refuse();
    }
  }
  if (value.networks["replatform-local"].internal !== true) refuse();
  for (const service of Object.values(value.services) as Array<Record<string, any>>) {
    if (!Array.isArray(service.volumes ?? [])) refuse();
    if (service.volumes_from !== undefined && (!Array.isArray(service.volumes_from) || service.volumes_from.length > 0)) refuse();
    for (const mount of service.volumes ?? []) {
      if (!mount || typeof mount !== "object") refuse();
      if (mount.type === "volume" && !Object.keys(targets.volumes).includes(mount.source)) refuse();
      if (mount.type !== "volume" && mount.type !== "bind") refuse();
    }
  }
  return model;
}

export function assertResetResourceInventory(targets: string[], owned: string[], existing: string[]): void {
  if ([targets, owned, existing].some(names => new Set(names).size !== names.length)) refuse();
  for (const name of targets) if (existing.includes(name) && !owned.includes(name)) refuse();
  for (const name of owned) if (!targets.includes(name)) refuse();
}

export function assertResetContainerMounts(mounts: unknown): void {
  if (!Array.isArray(mounts)) refuse();
  const allowed = new Set([`${PLATFORM_PROJECT}_replatform-local-postgres`, `${PLATFORM_PROJECT}_replatform-local-gates`]);
  for (const mount of mounts) {
    if (!mount || typeof mount !== "object") refuse();
    if (mount.Type === "volume" && !allowed.has(mount.Name)) refuse();
    if (mount.Type !== "volume" && mount.Type !== "bind") refuse();
  }
}

export function assertPlatformContainer(receipt: PlatformAuthority, inspect: unknown, allowStopped = false): PlatformAuthority {
  if (!validReceipt(receipt) || !inspect || typeof inspect !== "object") refuse();
  const value = inspect as Record<string, any>;
  const labels = value.Config?.Labels ?? {};
  const bindings = value.HostConfig?.PortBindings;
  if (value.Id !== receipt.containerId || value.Name !== `/${receipt.project}-postgres-1`
    || value.Config?.Image !== "public.ecr.aws/docker/library/postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81"
    || labels["com.docker.compose.project"] !== receipt.project
    || labels["com.docker.compose.service"] !== "postgres"
    || labels["com.explorers.replatform.fixture"] !== "true"
    || labels["com.explorers.replatform.project"] !== receipt.project
    || (!allowStopped && (value.State?.Running !== true || value.State?.Health?.Status !== "healthy"))
    || !bindings || Object.keys(bindings).length !== 1
    || !Array.isArray(bindings["5432/tcp"]) || bindings["5432/tcp"].length !== 1
    || bindings["5432/tcp"][0]?.HostIp !== receipt.host
    || bindings["5432/tcp"][0]?.HostPort !== String(receipt.port)) refuse();
  return receipt;
}

export function assertPlatformNetwork<T>(inspect: T): T {
  if (!inspect || typeof inspect !== "object") refuse();
  const network = inspect as Record<string, any>;
  const labels = network.Labels ?? {};
  if (network.Name !== `${PLATFORM_PROJECT}_replatform-local` || network.Internal !== true
    || labels["com.docker.compose.project"] !== PLATFORM_PROJECT
    || labels["com.explorers.replatform.fixture"] !== "true"
    || labels["com.explorers.replatform.project"] !== PLATFORM_PROJECT) refuse();
  return inspect;
}

export function assertPlatformServiceNetworks<T>(service: "postgres" | "strapi" | "tunes" | "explorers", inspect: T): T {
  if (!inspect || typeof inspect !== "object") refuse();
  const value = inspect as Record<string, any>;
  const networks = Object.keys(value.NetworkSettings?.Networks ?? {}).sort().join(",");
  const privateName = `${PLATFORM_PROJECT}_replatform-local`;
  const expected = service === "explorers" ? `${PLATFORM_PROJECT}_replatform-edge,${privateName}` : privateName;
  if (networks !== expected) refuse();
  return inspect;
}

export async function resetPlatformLocal(
  receipt: PlatformAuthority,
  target: PlatformAuthority,
  inspect: () => Promise<unknown>,
  inspectModel: () => Promise<unknown>,
  mutate: (attestedModel: unknown) => Promise<void>,
): Promise<void> {
  assertPlatformResetTarget(receipt, target);
  assertPlatformContainer(receipt, await inspect(), true);
  const model = assertResetComposeModel(await inspectModel());
  await mutate(model);
}

// Cleanup authority is independent of delivery readiness: a failed image build
// can leave only the attested database and a subset of declared resources.
export async function stopPlatformLocal(
  receipt: PlatformAuthority,
  target: PlatformAuthority,
  inspect: () => Promise<unknown>,
  inspectModel: () => Promise<unknown>,
  inspectInventory: () => Promise<void>,
  mutate: (attestedModel: unknown) => Promise<void>,
): Promise<void> {
  assertPlatformResetTarget(receipt, target);
  assertPlatformContainer(receipt, await inspect(), true);
  const model = assertResetComposeModel(await inspectModel());
  await inspectInventory();
  await mutate(model);
}
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertLocalDockerEndpoint } from "../tunes/scripts/music-local-docker";
import { MUSIC_UAT_DATABASE_ACK } from "../tunes/scripts/music-uat-database";
import { verifyPlatformIngress } from "./replatform-route-parity";


const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const STATE = join(ROOT, ".replatform-local");
const RECEIPT = join(STATE, "authority.json");
const RESET_INTENT = join(STATE, "reset-intent.json");
const COMPOSE = join(ROOT, "docker-compose.replatform.yml");
const DOCKER = process.platform === "win32" ? "docker.exe" : "docker";
const SECRET_NAMES = ["db-migrator", "db-runtime", "music-token"] as const;
export type PlatformPhase = "docker-endpoint" | "compose-model" | "resource-inventory" | "secret-inventory"
  | "postgres-start" | "postgres-attestation" | "service-build" | "service-check" | "receipt-check"
  /*
   * Ingress verification, which used to report as "receipt-check" because the phase was set
   * before `check()` and never advanced. One label covered "the authority receipt is bad"
   * and "a route answered the wrong thing" - unrelated failures with unrelated remedies,
   * and `platform-fixture` has flapped on the second while the handoff explained only the
   * first.
   */
  | "ingress-check";
type PlatformBuildFailure = "registry-rate-limit" | "registry-auth" | "image-resolution" | "compose-option"
  | "local-fixture-pull-denied" | "upstream-registry-auth" | "mixed-registry-auth"
  | "resource-exhaustion" | "service-health" | "build-command"
  | "port-unavailable" | "compose-config-invalid" | "unclassified";
/**
  * Why an ingress probe refused, as a closed set. Carries no path, status, body or host:
  * the probe messages do name a path, and they are never printed - only the category is.
  */
export type PlatformIngressFailure = "canonical-route-absent" | "canonical-handler-mismatch"
  | "fixture-route-mismatch" | "fixture-handler-mismatch" | "fixture-identity-boundary"
  | "ingress-unreachable" | "ingress-malformed-body" | "ingress-html-shell" | "unclassified";

/**
 * Which phases classify child output into a closed cause set, and which report bare.
 *
 * A named seam rather than an inline condition, because the condition is the whole
 * behaviour: `postgres-start` failed in CI with no cause for want of being listed here,
 * and a test asserting the classifier directly cannot see that - mutation-testing proved
 * it, leaving seven cause cases green while the wiring was reverted. Pinned per phase.
 */
export function classifiesChildOutput(phase: PlatformPhase): boolean {
  return phase === "service-build" || phase === "postgres-start";
}

/** Only a real build emits BuildKit step lines, so only a build can carry a stage. */
export function carriesBuildStage(phase: PlatformPhase): boolean {
  return phase === "service-build";
}

let failurePhase: PlatformPhase = "docker-endpoint";
let failureCause: PlatformBuildFailure | PlatformIngressFailure | undefined;
type PlatformBuildStage = "base-image-pull" | "npm-build-command" | "build-command" | "unknown";
let failureStage: PlatformBuildStage | undefined;

export function classifyPlatformBuildStage(output: string): PlatformBuildStage {
  const steps = new Map<string, PlatformBuildStage>();
  const failures = new Set<PlatformBuildStage>();
  // Bound parsing; correlate error lines to their BuildKit step rather than
  // inferring a failed registry from unrelated successful progress output.
  for (const line of output.slice(-1024 * 1024).split(/\r?\n/)) {
    const match = /^(#\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const [, id, detail] = match;
    if (/\[.*\]\s+(?:load metadata for|FROM\s)/i.test(detail)) steps.set(id, "base-image-pull");
    if (/\[.*\]\s+RUN\s/i.test(detail)) steps.set(id, /\bnpm\s+(?:ci|install|run)\b/i.test(detail) ? "npm-build-command" : "build-command");
    if (/\bERROR:|\bnpm (?:ERR!|error)|toomanyrequests|\b429\b/i.test(detail)) failures.add(steps.get(id) ?? "unknown");
  }
  return failures.size === 1 ? [...failures][0] : "unknown";
}

export function classifyPlatformBuildFailure(output: string): PlatformBuildFailure {
  if (/toomanyrequests|rate.limit|\b429\b/i.test(output)) return "registry-rate-limit";
  // Only classify an image mentioned in the denial itself. Merely seeing the
  // local tag in build progress does not establish which registry request failed.
  // Emit fixed categories only; never return image names, URLs or child output.
  let localPullDenied = false;
  let upstreamDenied = /failed to authorize:[^\r\n]*(?:unauthorized|authentication required|access denied|\b401\b|\b403\b)/i.test(output);
  for (const match of output.matchAll(/pull access denied for ([^\s,]{1,512})(?=[\s,]|$)/gi)) {
    if (/^(?:docker\.io\/library\/)?explorers-replatform-local-tunes(?::c4)?$/i.test(match[1])) {
      localPullDenied = true;
    } else {
      upstreamDenied = true;
    }
  }
  if (localPullDenied && upstreamDenied) return "mixed-registry-auth";
  if (localPullDenied) return "local-fixture-pull-denied";
  if (upstreamDenied) return "upstream-registry-auth";
  if (/unauthorized|authentication required|access denied/i.test(output)) return "registry-auth";
  if (/manifest unknown|failed to resolve source metadata|pull access denied|not found:.*image/i.test(output)) return "image-resolution";
  if (/unknown flag|unknown shorthand flag|unsupported option/i.test(output)) return "compose-option";
  if (/no space left|out of memory|\bENOBUFS\b|cannot allocate memory/i.test(output)) return "resource-exhaustion";
  /*
   * Two categories a service start can hit that a build cannot, added when
   * `phase=postgres-start` first appeared in CI with no cause at all. Both are remedied by
   * the environment rather than by the compose file or the image, so they are worth
   * separating from `unclassified` - that is the same reason `ingress-malformed-body`
   * exists.
   */
  /*
   * The alternatives are not stylistic. A real failure was captured by running this
   * service's own compose definition against a host where its port is unavailable, and the
   * daemon said:
   *
   *   ports are not available: exposing port TCP 127.0.0.1:51434 -> 127.0.0.1:0:
   *   listen tcp4 127.0.0.1:51434: bind: An attempt was made to access a socket in a way
   *   forbidden by its access permissions.
   *
   * which contains none of "port is already allocated", "address already in use" or
   * "bind for ... failed" - the three forms this arm was first written with. It would have
   * reported `unclassified`, which is the bug this whole closed set exists to avoid, so
   * the daemon's own prefix and the bare `bind:` form are matched too.
   */
  if (/ports are not available|port is already allocated|address already in use|bind for [^\s]+ failed|:\s*bind:\s/i.test(output)) return "port-unavailable";
  if (/no such service|services\.\S+ (?:must be|Additional property)|yaml: |is invalid because|validating \S+\.yml/i.test(output)) return "compose-config-invalid";
  if (/unhealthy|dependency failed to start|timed out waiting for/i.test(output)) return "service-health";
  if (/failed to solve|did not complete successfully|npm (?:ERR!|error)/i.test(output)) return "build-command";
  return "unclassified";
}

export function classifyPlatformIngressFailure(error: unknown): PlatformIngressFailure {
  const message = error instanceof Error ? error.message : "";
  // Matched on the fixed prefixes `replatform-route-parity.ts` produces, never echoed.
  if (message.startsWith("canonical route absent")) return "canonical-route-absent";
  if (message.startsWith("canonical handler mismatch")) return "canonical-handler-mismatch";
  if (message.startsWith("fixture ingress mismatch")) return "fixture-route-mismatch";
  if (message.startsWith("fixture handler mismatch")) return "fixture-handler-mismatch";
  if (message.startsWith("fixture Strapi boundary mismatch")) return "fixture-identity-boundary";
  // A transport failure: nothing listening, or a probe timed out. Distinct from every
  // mismatch above because the remedy is the fixture's state, not a route.
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|aborted|timed? ?out|TimeoutError/i.test(message)) {
    return "ingress-unreachable";
  }
  /*
   * The route answered with the expected status and then `response.json()` threw, so the
   * body is not JSON - an HTML error page from something in front of the app, or an empty
   * body. Separated from `unclassified` because the first observed failure of this gate in
   * CI (`phase=ingress-check; cause=unclassified`) was neither a mismatch nor a transport
   * error, and this is the remaining way `verifyPlatformIngress` can throw.
   */
  /*
   * The SPA shell, which is the specific case `ingress-malformed-body` turned out to be
   * hiding. A route absent from the fixture falls through to the catch-all and is answered
   * 200 with `index.html`, so the status assertion passes and only the body gives it away.
   * Named separately because the remedy is to mount the route.
   */
  if (message.startsWith("ingress served the application shell")) return "ingress-html-shell";
  if (error instanceof SyntaxError
      || /JSON|Unexpected token|Unexpected end of/i.test(message)) return "ingress-malformed-body";
  return "unclassified";
}

export function formatPlatformFailure(phase: PlatformPhase, cause?: PlatformBuildFailure | PlatformIngressFailure, stage?: PlatformBuildStage): string {
  return `Replatform local command refused or failed; phase=${phase}${cause ? `; cause=${cause}` : ""}${stage ? `; build-stage=${stage}` : ""}; authority details redacted.\n`;
}

export function validateProvisionSecretInventory(entries: Array<{ name: string; kind: "file" | "directory" | "symlink"; nlink: number; size: number }>): "create" | "reuse" {
  if (entries.length === 0) return "create";
  if (entries.length !== SECRET_NAMES.length || new Set(entries.map((entry) => entry.name)).size !== SECRET_NAMES.length) refuse();
  for (const entry of entries) {
    if (!SECRET_NAMES.includes(entry.name as typeof SECRET_NAMES[number]) || entry.kind !== "file" || entry.nlink !== 1 || entry.size !== 43) refuse();
  }
  return "reuse";
}

export function validateResetIntent(receipt: PlatformAuthority, value: unknown): boolean {
  if (!value || typeof value !== "object") refuse();
  const intent = value as { status?: string; authority?: PlatformAuthority };
  if (intent.status !== "pending" && intent.status !== "consumed") refuse();
  assertPlatformResetTarget(receipt, intent.authority as PlatformAuthority);
  return intent.status === "pending";
}

function readResetIntent(): unknown {
  const stat = lstatSync(RESET_INTENT);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) refuse();
  return JSON.parse(readFileSync(RESET_INTENT, "utf8")) as unknown;
}

export function prepareResetIntent(receipt: PlatformAuthority, value: unknown): { status: "pending"; authority: PlatformAuthority } {
  validateResetIntent(receipt, value);
  return { status: "pending", authority: receipt };
}

function childEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of allowed) if (source[key]) environment[key] = source[key];
  for (const [name, filename] of [
    ["MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "db-migrator"],
    ["MUSIC_DB_RUNTIME_SECRET_FILE_HOST", "db-runtime"],
    ["MUSIC_TOKEN_SECRET_FILE_HOST", "music-token"],
  ]) environment[name] = join(STATE, filename);
  environment.MUSIC_STRAPI_HOST_PORT = "51338";
  return environment;
}

export function platformViteEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...childEnvironment(source),
    VITE_API_URL: "http://127.0.0.1:51474/graphql",
    VITE_REST_API_URL: "http://127.0.0.1:51474",
    VITE_PUBLIC_ACCESS_TOKEN: "fixture-public-token",
    VITE_LOCAL_TUNES_API_URL: "https://localtunes.earth",
    MUSIC_DEV_PROXY_ENABLED: "true",
    MUSIC_DEV_PROXY_TARGET: "http://127.0.0.1:51474",
  };
}

function run(file: string, args: string[], environment = childEnvironment(), timeout = 30_000, input?: string): string {
  const result = spawnSync(file, args, {
    cwd: ROOT, env: environment, encoding: "utf8", windowsHide: true,
    shell: false, timeout, maxBuffer: 8 * 1024 * 1024, input,
  });
  if (result.error || result.status !== 0) {
    /*
     * `postgres-start` is classified with the same closed set as `service-build`. It was
     * omitted here, so when CI started failing at `phase=postgres-start` the log carried
     * no cause and the failure could not be told apart from a dozen others - and the
     * details are redacted by design, so the category is the only thing that can speak.
     * The build *stage* is deliberately not set: there is no BuildKit output to parse.
     */
    if (classifiesChildOutput(failurePhase)) {
      const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}\n${result.error?.message ?? ""}`;
      failureCause = classifyPlatformBuildFailure(output);
      if (carriesBuildStage(failurePhase)) failureStage = classifyPlatformBuildStage(output);
    }
    throw new Error("local subprocess failed");
  }
  return result.stdout.trim();
}

function localDockerHost(): string {
  if (Object.entries(process.env).some(([key, value]) => value !== undefined && ["DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "DATABASE_URL", "DATABASE_URL_TEST"].includes(key.toUpperCase()))) refuse();
  const context = run(DOCKER, ["context", "show"]);
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(context)) refuse();
  let host: unknown;
  try { host = JSON.parse(run(DOCKER, ["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"])) as unknown; }
  catch { return refuse(); }
  if (typeof host !== "string") refuse();
  assertLocalDockerEndpoint(host);
  return host;
}

function compose(host: string, args: string[], timeout = 30_000): string {
  return run(DOCKER, ["--host", host, "compose", "-p", PLATFORM_PROJECT, "-f", COMPOSE, ...args], childEnvironment(), timeout);
}

function composeFromAttestedModel(host: string, model: unknown, args: string[], timeout = 30_000): string {
  assertResetComposeModel(model);
  return run(DOCKER, ["--host", host, "compose", "-p", PLATFORM_PROJECT, "-f", "-", ...args], childEnvironment(), timeout, JSON.stringify(model));
}

function checkedModel(host: string): Record<string, any> {
  const model = JSON.parse(compose(host, ["config", "--format", "json"])) as Record<string, any>;
  validatePlatformComposeModel(model);
  assertResetComposeModel(model);
  if (model.networks?.["replatform-local"]?.internal !== true) refuse();
  const port = model.services?.postgres?.ports;
  if (!Array.isArray(port) || port.length !== 1 || port[0]?.host_ip !== "127.0.0.1" || String(port[0]?.published) !== String(PLATFORM_PORT) || port[0]?.target !== 5432) refuse();
  for (const service of ["strapi", "tunes"]) if ((model.services?.[service]?.ports ?? []).length !== 0) refuse();
  const edgePorts = model.services?.explorers?.ports;
  if (!Array.isArray(edgePorts) || edgePorts.length !== 1 || edgePorts[0]?.host_ip !== "127.0.0.1" || String(edgePorts[0]?.published) !== "51474") refuse();
  if (Object.keys(model.services?.explorers?.networks ?? {}).sort().join(",") !== "replatform-edge,replatform-local") refuse();
  for (const service of ["postgres", "strapi", "tunes", "tunes-migrate"]) {
    if (Object.keys(model.services?.[service]?.networks ?? {}).join(",") !== "replatform-local") refuse();
  }
  const services = Object.keys(model.services ?? {}).sort().join(",");
  if (services !== "explorers,postgres,strapi,tunes,tunes-migrate") refuse();
  return model;
}

function privateDirectory(): void {
  if (!existsSync(STATE)) mkdirSync(STATE, { mode: 0o700 });
  const stat = lstatSync(STATE);
  if (!stat.isDirectory() || stat.isSymbolicLink()) refuse();
}

function readReceipt(forExactReset = false): PlatformAuthority {
  privateDirectory();
  if (!existsSync(RECEIPT)) refuse();
  const stat = lstatSync(RECEIPT);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) refuse();
  const value = JSON.parse(readFileSync(RECEIPT, "utf8")) as PlatformAuthority;
  validatePlatformAuthority(value, "", forExactReset ? value.commit : sourceCommit(), process.env);
  assertPlatformResetTarget(value, { ...value });
  return value;
}

function sourceCommit(): string {
  const commit = run("git", ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(commit)) refuse();
  return commit;
}

function inspectPostgres(host: string, receipt?: PlatformAuthority, allowStopped = false): Record<string, unknown> {
  const id = compose(host, ["ps", "--all", "--quiet", "postgres"]);
  if (!/^[a-f0-9]{64}$/.test(id) || (receipt && id !== receipt.containerId)) refuse();
  const inspect = JSON.parse(run(DOCKER, ["--host", host, "inspect", "--type", "container", "--format", "{{json .}}", id])) as Record<string, unknown>;
  if (receipt) assertPlatformContainer(receipt, inspect, allowStopped);
  return inspect;
}

function inspectService(host: string, service: "strapi" | "tunes" | "explorers"): Record<string, any> {
  const id = compose(host, ["ps", "--all", "--quiet", service]);
  if (!/^[a-f0-9]{64}$/.test(id)) refuse();
  const value = JSON.parse(run(DOCKER, ["--host", host, "inspect", "--type", "container", "--format", "{{json .}}", id])) as Record<string, any>;
  const labels = value.Config?.Labels ?? {};
  if (value.Id !== id || value.Name !== `/${PLATFORM_PROJECT}-${service}-1`
    || labels["com.docker.compose.project"] !== PLATFORM_PROJECT || labels["com.docker.compose.service"] !== service
    || labels["com.explorers.replatform.fixture"] !== "true" || labels["com.explorers.replatform.project"] !== PLATFORM_PROJECT
    || value.State?.Running !== true || value.State?.Health?.Status !== "healthy") refuse();
  assertPlatformServiceNetworks(service, value);
  return value;
}

function query(host: string, receipt: PlatformAuthority, sql: string): string {
  assertPlatformContainer(receipt, inspectPostgres(host, receipt));
  return run(DOCKER, ["--host", host, "exec", receipt.containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "music_migrator", "-d", PLATFORM_DATABASE, "-Atqc", sql]);
}

function check(host: string, receipt: PlatformAuthority): { ready: true; project: string; database: string; postgresVersion: number; migrationCount: number } {
  checkedModel(host);
  const network = JSON.parse(run(DOCKER, ["--host", host, "network", "inspect", "--format", "{{json .}}", `${PLATFORM_PROJECT}_replatform-local`])) as unknown;
  assertPlatformNetwork(network);
  const postgres = inspectPostgres(host, receipt);
  assertPlatformContainer(receipt, postgres);
  assertPlatformServiceNetworks("postgres", postgres);
  for (const service of ["strapi", "tunes", "explorers"] as const) inspectService(host, service);
  const version = Number(query(host, receipt, "SHOW server_version_num"));
  if (!Number.isSafeInteger(version) || version < 150000 || version >= 160000) refuse();
  const count = Number(query(host, receipt, "SELECT count(*) FROM music_schema_migrations"));
  if (!Number.isSafeInteger(count) || count < 21) refuse();
  return { ready: true, project: receipt.project, database: receipt.database, postgresVersion: version, migrationCount: count };
}

function createSecrets(recovering = false): void {
  privateDirectory();
  if (existsSync(RECEIPT) && !recovering) refuse();
  const inventory = readdirSync(STATE).filter((name) => name !== "authority.json" && name !== "reset-intent.json").map((name) => {
    const stat = lstatSync(join(STATE, name));
    return { name, kind: stat.isSymbolicLink() ? "symlink" as const : stat.isFile() ? "file" as const : "directory" as const, nlink: stat.nlink, size: stat.size };
  });
  if (validateProvisionSecretInventory(inventory) === "reuse") return;
  for (const filename of SECRET_NAMES) {
    const path = join(STATE, filename);
    if (existsSync(path)) refuse();
    writeFileSync(path, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
  }
}

export function buildAndStartPlatformServices(runCompose: (args: string[], timeout: number) => unknown): void {
  // The migrator consumes the API's local-only tag but has no build definition.
  // Compose may try to pull that dependency before an `up --build` builds Tunes.
  runCompose(["build", "tunes", "explorers"], 900_000);
  runCompose(["up", "-d", "--no-build", "--wait", "explorers"], 900_000);
}

function provision(host: string): unknown {
  failurePhase = "compose-model";
  checkedModel(host);
  failurePhase = "receipt-check";
  const prior = existsSync(RECEIPT) ? readReceipt(true) : undefined;
  const recovering = prior && existsSync(RESET_INTENT)
    ? validateResetIntent(prior, readResetIntent()) : false;
  if (prior && !recovering) {
    if (prior.commit !== sourceCommit()) refuse();
    inspectPostgres(host, prior, true);
    verifyAllProjectResources(host, prior);
    compose(host, ["up", "-d", "--wait", "explorers"], 120_000);
    return check(host, prior);
  }
  failurePhase = "resource-inventory";
  for (const args of [
    ["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`],
    ["network", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`],
    ["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`],
  ]) if (run(DOCKER, ["--host", host, ...args])) refuse();
  failurePhase = "secret-inventory";
  createSecrets(recovering);
  failurePhase = "postgres-start";
  compose(host, ["up", "-d", "--wait", "postgres"], 120_000);
  failurePhase = "postgres-attestation";
  const inspect = inspectPostgres(host);
  const receipt: PlatformAuthority = {
    version: 1, project: PLATFORM_PROJECT, database: PLATFORM_DATABASE, host: "127.0.0.1", port: PLATFORM_PORT,
    containerId: String(inspect.Id), commit: sourceCommit(),
  };
  assertPlatformContainer(receipt, inspect);
  writeFileSync(RECEIPT, JSON.stringify(receipt), { flag: recovering ? "w" : "wx", mode: 0o600 });
  if (recovering) writeFileSync(RESET_INTENT, JSON.stringify({ status: "consumed", authority: receipt }), { flag: "w", mode: 0o600 });
  failurePhase = "service-build";
  // Capture build output for fixed-category failure diagnosis; never print it.
  buildAndStartPlatformServices((args, timeout) => compose(host, args, timeout));
  failurePhase = "service-check";
  return check(host, receipt);
}

async function seed(host: string, receipt: PlatformAuthority): Promise<unknown> {
  check(host, receipt);
  const response = await fetch("http://127.0.0.1:51474/api/music/identity/ensure", {
    method: "POST", headers: { authorization: "Bearer fixture-read-only-token", origin: "http://127.0.0.1:51474" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("local acceptance identity seed failed");
  const body = await response.json() as { identity?: { status?: string } };
  if (body.identity?.status !== "active") throw new Error("local acceptance identity seed is inactive");
  const rows = query(host, receipt, "SELECT count(*),min(id),max(id) FROM users WHERE strapi_user_document_id='e2e-public-music-fixture-user'").split("|");
  if (rows.length !== 3 || rows[0] !== "1" || rows[1] !== rows[2]) refuse();
  return { dataset: "acceptance", existingMusicIdentityRows: 1, stableMusicIdentityId: rows[1], canonicalDomainSeeds: "pending-owning-epics" };
}

async function stop(host: string, receipt: PlatformAuthority): Promise<unknown> {
  await stopPlatformLocal(receipt, { ...receipt }, async () => inspectPostgres(host, receipt, true),
    async () => checkedModel(host), async () => verifyAllProjectResources(host, receipt),
    async model => { composeFromAttestedModel(host, model, ["stop"], 120_000); });
  return { stopped: true, project: receipt.project };
}

function verifyAllProjectResources(host: string, receipt: PlatformAuthority): void {
  const ids = run(DOCKER, ["--host", host, "ps", "--all", "--no-trunc", "--quiet", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`]).split(/\r?\n/).filter(Boolean);
  if (!ids.includes(receipt.containerId) || ids.length < 1 || ids.length > 5) refuse();
  const allowedServices = new Set(["postgres", "strapi", "tunes-migrate", "tunes", "explorers"]);
  const seenServices = new Set<string>();
  for (const id of ids) {
    if (!/^[a-f0-9]{64}$/.test(id)) refuse();
    const value = JSON.parse(run(DOCKER, ["--host", host, "inspect", "--type", "container", "--format", "{{json .}}", id])) as Record<string, any>;
    const labels = value.Config?.Labels ?? {};
    const service = labels["com.docker.compose.service"];
    if (value.Id !== id || !allowedServices.has(service) || seenServices.has(service) || value.Name !== `/${PLATFORM_PROJECT}-${service}-1`
      || labels["com.docker.compose.project"] !== PLATFORM_PROJECT
      || labels["com.explorers.replatform.fixture"] !== "true" || labels["com.explorers.replatform.project"] !== PLATFORM_PROJECT) refuse();
    assertResetContainerMounts(value.Mounts);
    seenServices.add(service);
    const networks = Object.keys(value.NetworkSettings?.Networks ?? {});
    const allowedNetworks = service === "explorers" ? [`${PLATFORM_PROJECT}_replatform-local`, `${PLATFORM_PROJECT}_replatform-edge`] : [`${PLATFORM_PROJECT}_replatform-local`];
    if (networks.some(name => !allowedNetworks.includes(name))) refuse();
  }
  const allNames = run(DOCKER, ["--host", host, "ps", "--all", "--format", "{{.Names}}"] ).split(/\r?\n/).filter(Boolean);
  assertResetResourceInventory([...allowedServices].map(service => `${PLATFORM_PROJECT}-${service}-1`),
    [...seenServices].map(service => `${PLATFORM_PROJECT}-${service}-1`), allNames);
  for (const kind of ["network", "volume"] as const) {
    const names = run(DOCKER, ["--host", host, kind, "ls", "--quiet", "--filter", `label=com.docker.compose.project=${PLATFORM_PROJECT}`]).split(/\r?\n/).filter(Boolean);
    if (names.length > 2) refuse();
    const ownedNames: string[] = [];
    for (const name of names) {
      const value = JSON.parse(run(DOCKER, ["--host", host, kind, "inspect", "--format", "{{json .}}", name])) as Record<string, any>;
      const labels = value.Labels ?? {};
      const allowedName = kind === "network" ? [`${PLATFORM_PROJECT}_replatform-local`, `${PLATFORM_PROJECT}_replatform-edge`].includes(value.Name)
        : [`${PLATFORM_PROJECT}_replatform-local-postgres`, `${PLATFORM_PROJECT}_replatform-local-gates`].includes(value.Name);
      if (!allowedName || (kind === "network" && value.Name.endsWith("_replatform-local") && value.Internal !== true)
        || labels["com.docker.compose.project"] !== PLATFORM_PROJECT || labels["com.explorers.replatform.fixture"] !== "true"
        || labels["com.explorers.replatform.project"] !== PLATFORM_PROJECT) refuse();
      ownedNames.push(value.Name);
    }
    const expectedNames = kind === "network" ? [`${PLATFORM_PROJECT}_replatform-local`, `${PLATFORM_PROJECT}_replatform-edge`]
      : [`${PLATFORM_PROJECT}_replatform-local-postgres`, `${PLATFORM_PROJECT}_replatform-local-gates`];
    const existingNames = run(DOCKER, ["--host", host, kind, "ls", "--format", "{{.Name}}"]).split(/\r?\n/).filter(Boolean);
    assertResetResourceInventory(expectedNames, ownedNames, existingNames);
  }
}

async function main(args: string[]): Promise<void> {
  const command = parsePlatformCommand(args);
  failurePhase = "docker-endpoint";
  failureCause = undefined;
  failureStage = undefined;
  if (command.command === "test:integration") {
    const host = localDockerHost();
    failurePhase = "receipt-check";
    check(host, readReceipt());
    const npmCli = process.env.npm_execpath;
    if (!npmCli) refuse();
    const output = run(process.execPath, [npmCli, "--prefix", "tunes", "run", "music:test:uat-database", "--", "--ack", MUSIC_UAT_DATABASE_ACK], childEnvironment(), 900_000);
    process.stdout.write(`${output}\n`);
    return;
  }
  if (command.command === "test:routes") {
    const host = localDockerHost();
    failurePhase = "receipt-check";
    check(host, readReceipt());
    failurePhase = "ingress-check";
    let checked: number;
    try {
      checked = await verifyPlatformIngress("http://127.0.0.1:51474");
    } catch (error) {
      failureCause = classifyPlatformIngressFailure(error);
      throw error;
    }
    process.stdout.write(`${JSON.stringify({ ingressHandlersChecked: checked })}\n`);
    return;
  }
  const host = localDockerHost();
  failurePhase = "receipt-check";
  const result = command.command === "provision" ? provision(host) : await (async () => {
    const receipt = readReceipt(command.command === "reset");
    if (command.command === "check") return check(host, receipt);
    if (command.command === "seed") return await seed(host, receipt);
    if (command.command === "stop") return stop(host, receipt);
    if (command.command === "reset") {
      await resetPlatformLocal(receipt, { ...receipt }, async () => inspectPostgres(host, receipt, true), async () => checkedModel(host), async (attestedModel) => {
        verifyAllProjectResources(host, receipt);
        if (existsSync(RESET_INTENT)) {
          const next = prepareResetIntent(receipt, readResetIntent());
          writeFileSync(RESET_INTENT, JSON.stringify(next), { flag: "w", mode: 0o600 });
        } else writeFileSync(RESET_INTENT, JSON.stringify({ status: "pending", authority: receipt }), { flag: "wx", mode: 0o600 });
        composeFromAttestedModel(host, attestedModel, ["down", "--volumes"], 120_000);
      });
      return { reset: true, project: receipt.project };
    }
    if (command.command === "start") {
      checkedModel(host);
      inspectPostgres(host, receipt, true);
      compose(host, ["up", "-d", "--wait", "explorers"], 120_000);
      check(host, receipt);
      const npmCli = process.env.npm_execpath;
      if (!npmCli) refuse();
      const env = platformViteEnvironment();
      const child = spawnSync(process.execPath, [npmCli, "--prefix", "explorers-earth", "run", "dev", "--", "--config", "vite.replatform.config.ts", "--host", "127.0.0.1", "--port", "5175", "--strictPort"], {
        cwd: ROOT, env, stdio: "inherit", windowsHide: true,
      });
      if (child.error || child.status !== 0) throw new Error("local Vite process failed");
      return { stopped: true };
    }
    return refuse();
  })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write(formatPlatformFailure(failurePhase, failureCause, failureStage));
    process.exitCode = 1;
  });
}
