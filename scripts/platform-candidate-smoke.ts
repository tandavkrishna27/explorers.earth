import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, realpath, mkdtemp, open, unlink, rmdir } from "node:fs/promises";
import { isAbsolute, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { EXPECTED_MUSIC_MIGRATION_CHAIN, EXPECTED_MUSIC_MIGRATION_ID } from "../tunes/shared/music-migration-contract";
import { readSecureMusicSecretFile } from "../tunes/server/config/secure-music-secret-file";
import { verifyMusicDatabase, type MusicMigration } from "../tunes/server/db/migrate";
import { sanitizeMusicCliText } from "../tunes/scripts/music-output-redaction";
import { parseStrictJson } from "../tunes/server/deployment/platform-release-contract";

const REPOSITORY = "tandavkrishna27/explorers.earth";
const REF = "refs/heads/codex/unified-replatform";
const SUBJECTS = { api: "ghcr.io/tandavkrishna27/explorers-api", web: "ghcr.io/tandavkrishna27/explorers-web" } as const;
const OPERATION_MS = 10_000;
const PHASE_MS = 120_000;
type Kind = keyof typeof SUBJECTS;
type Mode = "retained-oci" | "published-digest";
type Data = Record<string, any>;
type Code = "INPUT_INVALID" | "ADAPTER_INVALID" | "GRAPH_INVALID" | "PUBLISHED_INVALID" | "LOAD_IDENTITY_INVALID" | "SCHEMA_INVALID" | "PROBE_INVALID" | "CONTAINER_IDENTITY_INVALID" | "OPERATION_FAILED" | "OPERATION_TIMEOUT" | "CLEANUP_FAILED" | "CUSTODY_RETAINED" | "EXECUTION_AUTHORIZATION_INVALID" | "PREBUILT_SMOKE_EXECUTION_UNAVAILABLE";
type Dependency = "OCI_IMPORT_AUTHORITY_UNAVAILABLE" | "PUBLISHED_TRANSPORT_AUTHORITY_UNAVAILABLE" | "SOURCE_MATERIAL_AUTHORITY_UNAVAILABLE" | "MUSIC_SMOKE_DEPENDENCY_UNAVAILABLE" | "WEB_RENDERER_AUTHORITY_UNAVAILABLE" | "PROTECTED_FILE_AUTHORITY_UNAVAILABLE" | "NATIVE_DOCKER_AUTHORITY_UNAVAILABLE" | "CANONICAL_STARTUP_DEPENDENCY_UNAVAILABLE" | "IMAGE_MIGRATION_INVENTORY_AUTHORITY_UNAVAILABLE" | "POSIX_ROOT_HOST_REQUIRED";
export class PrebuiltSmokeError extends Error {
  readonly code: Code;
  readonly phase?: string;
  readonly originalPhase?: string;
  readonly retained?: boolean;
  readonly dependency?: Dependency;
  constructor(code: Code, details: { phase?: string; originalPhase?: string; retained?: boolean; dependency?: Dependency } = {}) {
    super(code); this.name = "PrebuiltSmokeError"; this.code = code;
    Object.assign(this, details);
  }
}
const refuse = (code: Code): never => { throw new PrebuiltSmokeError(code); };
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const fullId = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function requireCondition(condition: unknown, code: Code): asserts condition { if (!condition) refuse(code); }
function keys(value: unknown, expected: readonly string[], code: Code): asserts value is Data {
  requireCondition(value !== null && typeof value === "object" && !Array.isArray(value), code);
  requireCondition([Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireCondition(Reflect.ownKeys(descriptors).length === expected.length, code);
  for (const key of expected) requireCondition(descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], "value"), code);
}
/** Copies primitive data without executing getters, toJSON, iterators or prototype code. */
function snapshot(value: unknown, code: Code, depth = 0): any {
  requireCondition(depth < 16, code);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") { requireCondition(Buffer.byteLength(value) <= 1_048_576, code); return value; }
  if (typeof value === "number") { requireCondition(Number.isFinite(value), code); return value; }
  requireCondition(typeof value === "object" && value !== null, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    requireCondition(Object.getPrototypeOf(value) === Array.prototype && value.length <= 256 && Reflect.ownKeys(descriptors).length === value.length + 1, code);
    return Array.from({ length: value.length }, (_, n) => {
      const d = descriptors[String(n)]; requireCondition(d?.enumerable && Object.hasOwn(d, "value"), code);
      return snapshot(d.value, code, depth + 1);
    });
  }
  requireCondition([Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(descriptors).length <= 64, code);
  const result: Data = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    requireCondition(typeof key === "string" && key !== "__proto__", code);
    const d = descriptors[key]; requireCondition(d.enumerable && Object.hasOwn(d, "value"), code);
    result[key] = snapshot(d.value, code, depth + 1);
  }
  return result;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
}
function equal(a: unknown, b: unknown): boolean {
  const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered) : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
function inputSnapshot(raw: unknown): Data {
  const code = "INPUT_INVALID";
  keys(raw, ["policyVersion", "mode", "repository", "workflowRef", "sourceCommit", "producerRunId", "producerRunAttempt", "architecture", "images"], code);
  const x = snapshot(raw, code);
  requireCondition(x.policyVersion === "prebuilt-smoke/v1" && ["retained-oci", "published-digest"].includes(x.mode) && x.repository === REPOSITORY && x.workflowRef === REF && x.architecture === "linux/amd64", code);
  requireCondition(typeof x.sourceCommit === "string" && /^[a-f0-9]{40}$/.test(x.sourceCommit), code);
  for (const id of [x.producerRunId, x.producerRunAttempt]) requireCondition(typeof id === "string" && /^[1-9][0-9]{0,15}$/.test(id) && Number.isSafeInteger(Number(id)), code);
  keys(x.images, ["api", "web"], code);
  for (const image of Object.values(x.images) as Data[]) {
    keys(image, ["archiveDigest", "manifestDigest", "configDigest", "layerDigests", "diffIds"], code);
    requireCondition(Array.isArray(image.layerDigests) && Array.isArray(image.diffIds) && image.layerDigests.length > 0 && image.layerDigests.length <= 64 && image.layerDigests.length === image.diffIds.length, code);
    const facts = [image.archiveDigest, image.manifestDigest, image.configDigest, ...image.layerDigests];
    requireCondition(facts.every(digest) && new Set(facts).size === facts.length && image.diffIds.every(digest) && new Set(image.diffIds).size === image.diffIds.length && image.diffIds.every((d: string) => !facts.includes(d)), code);
  }
  return freeze(x);
}

export interface ImageComparison {
  archiveDigest: string; manifestDigest: string; configDigest: string;
  layerDigests: readonly string[]; diffIds: readonly string[];
}
export interface SmokeComparison {
  policyVersion: "prebuilt-smoke/v1"; mode: Mode; repository: typeof REPOSITORY;
  workflowRef: typeof REF; sourceCommit: string; producerRunId: string;
  producerRunAttempt: string; architecture: "linux/amd64";
  images: Readonly<Record<Kind, ImageComparison>>;
}
export interface OwnedSmokeResources {
  nonce: string; custody: string; endpoint: string; pgImageId: string;
  ids: Readonly<{ pg: string; api: string | null; web: string | null }>;
  runtimeRole: "candidate_runtime"; migratorRole: "candidate_migrator";
}
/** Results remain unknown across the untrusted seam and are exact-shaped by the
 * dedicated graph/load/schema/probe/resource validators before any later operation. */
export interface SmokeAdapter {
  now(): number;
  observeGraph(request: Readonly<{ kind: Kind; image: ImageComparison; sourceCommit: string }>): Promise<unknown>;
  observePublished(request: Readonly<{ kind: Kind; subject: string; graph: Data }>): Promise<unknown>;
  inspectLoaded(request: Readonly<{ kind: Kind; image: ImageComparison; sourceCommit: string }>): Promise<unknown>;
  prepare(request: Readonly<{ input: SmokeComparison }>): Promise<unknown>;
  settle(request: Readonly<{ sourceCommit: string; resources: OwnedSmokeResources | null }>): Promise<unknown>;
  migrate(request: Readonly<{ resources: OwnedSmokeResources; configId: string; subject: string; sourceCommit: string; command: readonly ["node", "dist/server/deployment/run-migration-gate.js"] }>): Promise<unknown>;
  startCandidates(request: Readonly<{ resources: OwnedSmokeResources; input: SmokeComparison }>): Promise<unknown>;
  inspectContainers(request: Readonly<{ resources: OwnedSmokeResources; input: SmokeComparison }>): Promise<unknown>;
  probe(request: Readonly<{ resources: OwnedSmokeResources; input: SmokeComparison }>): Promise<unknown>;
  observeSchema(request: Readonly<{ resources: OwnedSmokeResources }>): Promise<unknown>;
  restart(request: Readonly<{ resources: OwnedSmokeResources }>): Promise<unknown>;
  cleanup(request: Readonly<{ resources: OwnedSmokeResources; reverseIds: readonly string[] }>): Promise<unknown>;
}
const methods = ["now", "observeGraph", "observePublished", "inspectLoaded", "prepare", "settle", "migrate", "startCandidates", "inspectContainers", "probe", "observeSchema", "restart", "cleanup"] as const;
function adapterSnapshot(raw: unknown): SmokeAdapter {
  keys(raw, methods, "ADAPTER_INVALID");
  const result: Data = {};
  for (const method of methods) { const fn = Object.getOwnPropertyDescriptor(raw, method)?.value; requireCondition(typeof fn === "function", "ADAPTER_INVALID"); result[method] = fn; }
  return Object.freeze(result) as SmokeAdapter;
}
function graphObservation(raw: unknown, image: Data): Data {
  const code = "GRAPH_INVALID", g = snapshot(raw, code);
  keys(g, ["archiveDigest", "architecture", "manifest", "config", "layers", "descriptors", "manifestBytes"], code);
  requireCondition(g.archiveDigest === image.archiveDigest && g.architecture === "linux/amd64", code);
  for (const [name, mediaType] of [["manifest", "application/vnd.oci.image.manifest.v1+json"], ["config", "application/vnd.oci.image.config.v1+json"]]) {
    keys(g[name], ["digest", "size", "mediaType"], code);
    requireCondition(g[name].digest === image[`${name}Digest`] && Number.isSafeInteger(g[name].size) && g[name].size > 0 && g[name].size <= (name === "manifest" ? 65_536 : 1_048_576) && g[name].mediaType === mediaType, code);
  }
  requireCondition(typeof g.manifestBytes === "string" && Buffer.byteLength(g.manifestBytes) === g.manifest.size && hash(g.manifestBytes) === g.manifest.digest, code);
  requireCondition(Array.isArray(g.layers) && g.layers.length === image.layerDigests.length, code);
  g.layers.forEach((layer: Data, n: number) => {
    keys(layer, ["digest", "size", "mediaType", "diffId"], code);
    requireCondition(layer.digest === image.layerDigests[n] && layer.diffId === image.diffIds[n] && Number.isSafeInteger(layer.size) && layer.size > 0 && layer.size <= 536_870_912 && layer.mediaType === "application/vnd.oci.image.layer.v1.tar+gzip", code);
  });
  try {
    const manifest = snapshot(parseStrictJson(g.manifestBytes), code);
    keys(manifest, ["schemaVersion", "mediaType", "config", "layers"], code);
    requireCondition(manifest.schemaVersion === 2 && manifest.mediaType === g.manifest.mediaType && equal(manifest.config, g.config) && equal(manifest.layers, g.layers.map(({ digest, size, mediaType }: Data) => ({ digest, size, mediaType }))), code);
  } catch { refuse(code); }
  requireCondition(equal(g.descriptors, [image.manifestDigest, image.configDigest, ...image.layerDigests]), code);
  return freeze(g);
}
function inventoryObservation(raw: unknown): Data {
  const code = "SCHEMA_INVALID", v = snapshot(raw, code); keys(v, ["chain", "schemaChecksum"], code);
  requireCondition(fullId(v.schemaChecksum) && Array.isArray(v.chain) && v.chain.length === EXPECTED_MUSIC_MIGRATION_CHAIN.length, code);
  v.chain.forEach((row: Data, n: number) => { keys(row, ["id", "checksum"], code); requireCondition(row.id === EXPECTED_MUSIC_MIGRATION_CHAIN[n] && fullId(row.checksum), code); });
  requireCondition(v.chain.at(-1).id === EXPECTED_MUSIC_MIGRATION_ID, code);
  return freeze(v);
}
function loadedObservation(raw: unknown, kind: Kind, image: Data, source: string): Data {
  const code = "LOAD_IDENTITY_INVALID", v = snapshot(raw, code);
  keys(v, ["configId", "diffIds", "architecture", "sourceCommit", "sourceRepository", "sourceMaterialCommit", "inventory"], code);
  requireCondition(v.configId === image.configDigest && equal(v.diffIds, image.diffIds) && v.architecture === "linux/amd64" && v.sourceCommit === source && v.sourceMaterialCommit === source && v.sourceRepository === REPOSITORY, code);
  if (kind === "api") v.inventory = inventoryObservation(v.inventory); else requireCondition(v.inventory === null, code);
  return freeze(v);
}
function resourceObservation(raw: unknown): Data {
  const code = "CUSTODY_RETAINED", r = snapshot(raw, code);
  keys(r, ["nonce", "custody", "endpoint", "pgImageId", "ids", "runtimeRole", "migratorRole"], code);
  requireCondition(typeof r.nonce === "string" && /^[a-f0-9]{32}$/.test(r.nonce) && digest(r.custody) && digest(r.pgImageId) && ["unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine", "npipe:////./pipe/dockerDesktopLinuxEngine"].includes(r.endpoint), code);
  keys(r.ids, ["pg", "api", "web"], code);
  requireCondition(fullId(r.ids.pg) && [r.ids.api, r.ids.web].every(id => id === null || fullId(id)), code);
  const knownIds = Object.values(r.ids).filter(id => id !== null); requireCondition(new Set(knownIds).size === knownIds.length, code);
  requireCondition(r.runtimeRole === "candidate_runtime" && r.migratorRole === "candidate_migrator", code);
  return freeze(r);
}
function schemaObservation(raw: unknown, expected: Data, resources: Data): Data {
  const code = "SCHEMA_INVALID", v = snapshot(raw, code);
  keys(v, ["inventory", "runtimeRole", "migratorRole", "runtimePrivileges", "migratorProvisioned"], code);
  requireCondition(equal(inventoryObservation(v.inventory), expected) && v.runtimeRole === resources.runtimeRole && v.migratorRole === resources.migratorRole && equal(v.runtimePrivileges, ["music_runtime"]) && v.migratorProvisioned === true, code);
  return freeze(v);
}
function containersObservation(raw: unknown, resources: Data, input: Data): void {
  const code = "CONTAINER_IDENTITY_INVALID", v = snapshot(raw, code); keys(v, ["custody", "containers"], code);
  requireCondition(v.custody === resources.custody && Array.isArray(v.containers) && v.containers.length === 3, code);
  for (const [n, kind] of ["pg", "api", "web"].entries()) {
    const c = v.containers[n]; keys(c, ["kind", "id", "configId", "sourceCommit", "nonce", "running"], code);
    requireCondition(c.kind === kind && c.id === resources.ids[kind] && c.configId === (kind === "pg" ? resources.pgImageId : input.images[kind].configDigest) && c.sourceCommit === (kind === "pg" ? null : input.sourceCommit) && c.nonce === resources.nonce && c.running === true, code);
  }
}
function probeObservation(raw: unknown): void {
  const code = "PROBE_INVALID", v = snapshot(raw, code);
  keys(v, ["live", "session", "protected", "web", "runtimeConfig", "asset", "assetPath", "music"], code);
  const response = (r: Data, status: number, mime: RegExp, noStore = false) => {
    keys(r, ["status", "headers", "body"], code);
    requireCondition(r.status === status && typeof r.body === "string" && Buffer.byteLength(r.body) <= 65_536 && r.headers && typeof r.headers === "object" && mime.test(r.headers["content-type"]) && (!noStore || r.headers["cache-control"] === "no-store"), code);
    requireCondition(Object.keys(r.headers).every(k => ["content-type", "cache-control"].includes(k)), code);
  };
  response(v.live, 200, /^application\/json(?:;|$)/); response(v.session, 200, /^application\/json(?:;|$)/, true);
  response(v.protected, 401, /^application\/json(?:;|$)/, true); response(v.web, 200, /^text\/html(?:;|$)/);
  response(v.runtimeConfig, 200, /^application\/json(?:;|$)/); response(v.asset, 200, /^(?:text|application)\/javascript(?:;|$)/);
  try {
    requireCondition(equal(JSON.parse(v.live.body), { status: "live" }) && JSON.parse(v.session.body) === null, code);
    requireCondition(equal(JSON.parse(v.runtimeConfig.body), { version: 1, environment: "qa", origin: "https://127.0.0.1:51475", apiPath: "/api", socketPath: "/socket.io", analytics: { enabled: false } }), code);
  } catch { refuse(code); }
  requireCondition(typeof v.assetPath === "string" && /^\/assets\/[a-zA-Z0-9_-]+\.js$/.test(v.assetPath) && v.web.body.includes(`src="${v.assetPath}"`) && v.asset.body.length > 0, code);
  keys(v.music, ["status", "dependency"], code);
  // Exact executed Music semantics are deliberately unresolved. A fake marker names
  // that dependency; no invented route, arbitrary HTTP200 or composition boolean is
  // accepted as executed Music evidence. Native preflight denies it before allocation.
  requireCondition(v.music.status === "MUSIC_SMOKE_SIMULATED_UNQUALIFIED" && v.music.dependency === "MUSIC_SMOKE_DEPENDENCY_UNAVAILABLE", code);
}

async function orchestrate(input: Data, adapter: SmokeAdapter, native: boolean): Promise<Data> {
  const start = adapter.now(); requireCondition(Number.isFinite(start), "ADAPTER_INVALID");
  let clockValue = start;
  const now = () => { const value = adapter.now(); requireCondition(Number.isFinite(value) && value >= clockValue, "ADAPTER_INVALID"); clockValue = value; return value; };
  let resources: Data | null = null, creationStarted = false, phase = "observeGraph", failure: PrebuiltSmokeError | undefined;
  let inventory: Data | undefined;
  const invoke = async (method: Exclude<keyof SmokeAdapter, "now">, request: Data, settlement = false): Promise<unknown> => {
    phase = method; const began = now();
    const remaining = settlement ? OPERATION_MS : Math.min(OPERATION_MS, PHASE_MS - (began - start));
    if (remaining <= 0 || !Number.isFinite(began)) throw new PrebuiltSmokeError("OPERATION_TIMEOUT", { phase });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve((adapter[method] as (request: Data) => Promise<unknown>)(freeze(request))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PrebuiltSmokeError("OPERATION_TIMEOUT", { phase: method })), remaining); }),
      ]);
      if (now() - began > remaining) throw new PrebuiltSmokeError("OPERATION_TIMEOUT", { phase });
      return result;
    } catch (error) { if (error instanceof PrebuiltSmokeError) throw error; throw new PrebuiltSmokeError("OPERATION_FAILED", { phase }); }
    finally { if (timer) clearTimeout(timer); }
  };
  try {
    for (const kind of ["api", "web"] as const) {
      const image = input.images[kind], request = { kind, image, sourceCommit: input.sourceCommit };
      const graph = graphObservation(await invoke("observeGraph", request), image);
      if (input.mode === "published-digest") {
        const subject = `${SUBJECTS[kind]}@${image.manifestDigest}`;
        const published = snapshot(await invoke("observePublished", { kind, subject, graph }), "PUBLISHED_INVALID");
        keys(published, ["subject", "freshPull", "manifestBytes", "graph"], "PUBLISHED_INVALID");
        requireCondition(published.subject === subject && published.freshPull === true && published.manifestBytes === graph.manifestBytes && equal(graphObservation(published.graph, image), graph), "PUBLISHED_INVALID");
      }
      const loaded = loadedObservation(await invoke("inspectLoaded", request), kind, image, input.sourceCommit);
      if (kind === "api") inventory = loaded.inventory;
    }
    creationStarted = true;
    resources = resourceObservation(await invoke("prepare", { input }));
    const settled = snapshot(await invoke("settle", { sourceCommit: input.sourceCommit, resources }, true), "CUSTODY_RETAINED");
    keys(settled, ["state", "resources"], "CUSTODY_RETAINED"); requireCondition(settled.state === "known" && equal(resourceObservation(settled.resources), resources), "CUSTODY_RETAINED");
    schemaObservation(await invoke("migrate", { resources, configId: input.images.api.configDigest, subject: `${SUBJECTS.api}@${input.images.api.manifestDigest}`, sourceCommit: input.sourceCommit, command: ["node", "dist/server/deployment/run-migration-gate.js"] }), inventory!, resources);
    const started = resourceObservation(await invoke("startCandidates", { resources, input }));
    requireCondition(started.custody === resources.custody && started.nonce === resources.nonce && started.ids.pg === resources.ids.pg && fullId(started.ids.api) && fullId(started.ids.web), "CUSTODY_RETAINED"); resources = started;
    containersObservation(await invoke("inspectContainers", { resources, input }), resources, input);
    probeObservation(await invoke("probe", { resources, input }));
    schemaObservation(await invoke("observeSchema", { resources }), inventory!, resources);
    const restart = snapshot(await invoke("restart", { resources }), "CONTAINER_IDENTITY_INVALID"); keys(restart, ["restartedId"], "CONTAINER_IDENTITY_INVALID"); requireCondition(restart.restartedId === resources.ids.api, "CONTAINER_IDENTITY_INVALID");
    containersObservation(await invoke("inspectContainers", { resources, input }), resources, input);
    probeObservation(await invoke("probe", { resources, input }));
    schemaObservation(await invoke("observeSchema", { resources }), inventory!, resources);
  } catch (error) { failure = error instanceof PrebuiltSmokeError ? new PrebuiltSmokeError(error.code, { phase: error.phase ?? phase }) : new PrebuiltSmokeError("OPERATION_FAILED", { phase }); }
  finally {
    if (creationStarted) {
      const originalPhase = failure?.phase ?? (failure ? phase : undefined);
      try {
        const settled = snapshot(await invoke("settle", { sourceCommit: input.sourceCommit, resources }, true), "CUSTODY_RETAINED");
        keys(settled, ["state", "resources"], "CUSTODY_RETAINED");
        requireCondition(settled.state === "known", "CUSTODY_RETAINED");
        const known = resourceObservation(settled.resources);
        requireCondition(resources === null || (resources.custody === known.custody && resources.nonce === known.nonce && resources.endpoint === known.endpoint && resources.pgImageId === known.pgImageId && Object.entries(resources.ids).every(([kind, id]) => id === null || known.ids[kind] === id)), "CUSTODY_RETAINED"); resources = known;
        const reverseIds = [known.ids.web, known.ids.api, known.ids.pg].filter(id => id !== null);
        const cleanup = snapshot(await invoke("cleanup", { resources: known, reverseIds }, true), "CLEANUP_FAILED");
        keys(cleanup, ["settled", "custody", "removedIds", "absentIds", "enumerationSucceeded", "protectedFilesRemoved"], "CLEANUP_FAILED");
        requireCondition(cleanup.custody === known.custody, "CUSTODY_RETAINED");
        requireCondition(cleanup.settled === true && equal(cleanup.removedIds, reverseIds) && equal([...cleanup.absentIds].sort(), [...reverseIds].sort()) && cleanup.enumerationSucceeded === true && cleanup.protectedFilesRemoved === true, "CLEANUP_FAILED");
      } catch (cleanupError) {
        const code = cleanupError instanceof PrebuiltSmokeError && cleanupError.code === "CUSTODY_RETAINED" ? "CUSTODY_RETAINED" : "CLEANUP_FAILED";
        failure = new PrebuiltSmokeError(code, { phase, originalPhase, retained: true });
      }
    }
  }
  if (failure) throw failure;
  return freeze({ status: native ? "PREBUILT_SMOKE_EXECUTED_UNQUALIFIED" : "PREBUILT_SMOKE_SIMULATED_UNQUALIFIED", mode: input.mode, sourceCommit: input.sourceCommit, subjects: { api: `${SUBJECTS.api}@${input.images.api.manifestDigest}`, web: `${SUBJECTS.web}@${input.images.web.manifestDigest}` }, releaseQualified: false, executedSmokeVerified: native, registryAuthenticated: false, cryptographicallyVerified: false, buildOperations: 0, cleanupVerified: true });
}

export async function inspectUnqualifiedPrebuiltSmokeSimulation(raw: unknown, fakeAdapter: unknown): Promise<Data> {
  const input = inputSnapshot(raw); const adapter = adapterSnapshot(fakeAdapter);
  return orchestrate(input, adapter, false);
}
export async function runCandidatePrebuiltSmoke(raw: unknown, authorization: unknown): Promise<Data> {
  const input = inputSnapshot(raw);
  keys(authorization, ["execute"], "EXECUTION_AUTHORIZATION_INVALID"); requireCondition(authorization.execute === true, "EXECUTION_AUTHORIZATION_INVALID");
  // A literal execute flag authorizes an attempt, never supplies image/resource authority.
  const native = nativeAdapter(input.mode);
  return orchestrate(input, native, true);
}
function rootHostPrerequisite(uid: unknown, candidateUser: unknown): void {
  if (uid !== 0 || !["", "0"].includes(candidateUser as string)) unavailable("POSIX_ROOT_HOST_REQUIRED");
}
type ImageDefaults = { Entrypoint: string[] | null; Cmd: string[] | null; Env: string[]; User: string; Labels: Record<string, string> };
const PG_TMPFS = "rw,noexec,nosuid,size=2147483648";
const GATE_TMPFS = "rw,noexec,nosuid,size=1048576";
const MEDIA_TMPFS = "rw,noexec,nosuid,size=67108864";
function networkSpecification(nonce: string, source: string): Data {
  return { Driver: "bridge", Scope: "local", Internal: true, Attachable: false, Ingress: false, EnableIPv6: false, Options: {}, IPAM: { Driver: "default", Options: null, Config: [{ Subnet: "172.30.250.0/24", Gateway: "172.30.250.1" }] }, Labels: { "com.explorers.candidate.nonce": nonce, "com.explorers.candidate.source": source, "com.explorers.candidate.purpose": "prebuilt-smoke" }, Containers: {} };
}
/** Specification is derived only from fixed private argv and verified image defaults,
 * never from the first container inspection or a public caller's commands. */
function containerSpecification(args: readonly string[], defaults: ImageDefaults): Data {
  requireCondition(args[0] === "create", "CUSTODY_RETAINED");
  const labels = { ...defaults.Labels }, env = new Map(defaults.Env.map(v => { const i = v.indexOf("="); requireCondition(i > 0, "CUSTODY_RETAINED"); return [v.slice(0, i), v.slice(i + 1)] as const; }));
  const ports: Data = {}, tmpfs: Data = {}, mounts: Data[] = [];
  let entrypoint = defaults.Entrypoint, user = defaults.User, network = "", i = 1;
  while (args[i]?.startsWith("--")) {
    const flag = args[i++], value = args[i++]; requireCondition(typeof value === "string", "CUSTODY_RETAINED");
    if (flag === "--label" || flag === "--env") { const at = value.indexOf("="); requireCondition(at > 0, "CUSTODY_RETAINED"); if (flag === "--label") labels[value.slice(0, at)] = value.slice(at + 1); else env.set(value.slice(0, at), value.slice(at + 1)); }
    else if (flag === "--network") network = value;
    else if (flag === "--network-alias") requireCondition(value === "candidate-pg", "CUSTODY_RETAINED");
    else if (flag === "--entrypoint") entrypoint = [value];
    else if (flag === "--user") user = value;
    else if (flag === "--publish") { const m = /^127\.0\.0\.1:([0-9]+):([0-9]+)$/.exec(value); requireCondition(m, "CUSTODY_RETAINED"); ports[`${m[2]}/tcp`] = [{ HostIp: "127.0.0.1", HostPort: m[1] }]; }
    else if (flag === "--tmpfs") { const at = value.indexOf(":"); requireCondition(at > 0, "CUSTODY_RETAINED"); const target = value.slice(0, at), options = value.slice(at + 1); requireCondition([PG_TMPFS, GATE_TMPFS, MEDIA_TMPFS].includes(options), "CUSTODY_RETAINED"); tmpfs[target] = options; mounts.push({ Type: "tmpfs", Source: "", Destination: target, RW: true }); }
    else if (flag === "--mount") { const m = /^type=bind,src=([^,]+),dst=([^,]+),readonly$/.exec(value); requireCondition(m, "CUSTODY_RETAINED"); mounts.push({ Type: "bind", Source: m[1], Destination: m[2], RW: false }); }
    else refuse("CUSTODY_RETAINED");
  }
  const image = args[i++]; requireCondition(digest(image) && fullId(network) && ["", "0"].includes(user), "CUSTODY_RETAINED");
  return { Image: image, Config: { Image: image, Entrypoint: entrypoint, Cmd: i < args.length ? args.slice(i) : defaults.Cmd, Env: [...env].map(([k, v]) => `${k}=${v}`).sort(), User: user, Labels: labels }, HostConfig: { NetworkMode: network, Privileged: false, PublishAllPorts: false, PortBindings: ports, Tmpfs: tmpfs }, Mounts: mounts };
}
function validateFirstContainer(raw: unknown, id: string, expected: Data): void {
  const v = snapshot(raw, "CUSTODY_RETAINED");
  requireCondition(v.Id === id && v.Image === expected.Image && v.Config, "CUSTODY_RETAINED");
  for (const name of ["Image", "Entrypoint", "Cmd", "User", "Labels"]) requireCondition(equal(v.Config[name], expected.Config[name]), "CUSTODY_RETAINED");
  requireCondition(Array.isArray(v.Config.Env) && equal([...v.Config.Env].sort(), expected.Config.Env), "CUSTODY_RETAINED");
  for (const name of ["NetworkMode", "Privileged", "PublishAllPorts"]) requireCondition(v.HostConfig?.[name] === expected.HostConfig[name], "CUSTODY_RETAINED");
  for (const name of ["PortBindings", "Tmpfs"]) requireCondition(equal(v.HostConfig?.[name] ?? {}, expected.HostConfig[name]), "CUSTODY_RETAINED");
  requireCondition(Array.isArray(v.Mounts), "CUSTODY_RETAINED");
  const mounts = v.Mounts.map((m: Data) => ({ Type: m.Type, Source: m.Source, Destination: m.Destination, RW: m.RW })).sort((a: Data, b: Data) => a.Destination.localeCompare(b.Destination));
  requireCondition(equal(mounts, [...expected.Mounts].sort((a: Data, b: Data) => a.Destination.localeCompare(b.Destination))), "CUSTODY_RETAINED");
}
function validateFirstNetwork(raw: unknown, id: string, expected: Data): void {
  const v = snapshot(raw, "CUSTODY_RETAINED"); requireCondition(v.Id === id, "CUSTODY_RETAINED");
  for (const key of Object.keys(expected)) requireCondition(equal(v[key], expected[key]), "CUSTODY_RETAINED");
}
/** Complete fake-only seam exercises the very validators used before native adoption.
 * It cannot supply NativeAuthority or authorize cleanup; it performs no native calls. */
export async function inspectUnqualifiedNativeCustodySimulation(raw: unknown, metadata: unknown, fakeAdapter: unknown): Promise<Data> {
  const input = inputSnapshot(raw); keys(metadata, ["hostUid", "candidateUser"], "INPUT_INVALID"); const meta = snapshot(metadata, "INPUT_INVALID"); rootHostPrerequisite(meta.hostUid, meta.candidateUser);
  const names = ["now", "createNetwork", "inspectNetwork", "createContainer", "inspectContainer"];
  keys(fakeAdapter, names, "ADAPTER_INVALID"); const adapter: Data = {};
  for (const name of names) { const fn = Object.getOwnPropertyDescriptor(fakeAdapter, name)?.value; requireCondition(typeof fn === "function", "ADAPTER_INVALID"); adapter[name] = fn; }
  const began = adapter.now(); requireCondition(Number.isFinite(began), "ADAPTER_INVALID"); let clock = began;
  const call = async (name: string, request: unknown) => {
    const start = adapter.now(); requireCondition(Number.isFinite(start) && start >= clock, "ADAPTER_INVALID"); clock = start;
    const duration = Math.min(OPERATION_MS, PHASE_MS - (start - began)); requireCondition(duration > 0, "OPERATION_TIMEOUT");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([Promise.resolve(adapter[name](freeze(request))), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PrebuiltSmokeError("OPERATION_TIMEOUT")), duration); })]);
      const ended = adapter.now(); requireCondition(Number.isFinite(ended) && ended >= clock, "ADAPTER_INVALID"); clock = ended; requireCondition(ended - start <= duration, "OPERATION_TIMEOUT"); return result;
    } finally { if (timer) clearTimeout(timer); }
  };
  const nonce = "b".repeat(32), networkExpected = networkSpecification(nonce, input.sourceCommit);
  const knownIds: string[] = [];
  try {
    const networkId = await call("createNetwork", { expected: networkExpected }); requireCondition(fullId(networkId), "CUSTODY_RETAINED"); knownIds.push(networkId);
    validateFirstNetwork(await call("inspectNetwork", networkId), networkId, networkExpected);
    const labels = Object.entries(networkExpected.Labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]);
    for (const kind of ["pg", "migrator", "api", "web"]) {
      const image = kind === "pg" ? `sha256:${"9".repeat(64)}` : input.images[kind === "web" ? "web" : "api"].configDigest;
      const defaults: ImageDefaults = { Entrypoint: [kind === "web" ? "/docker-entrypoint.sh" : "docker-entrypoint.sh"], Cmd: kind === "pg" ? ["postgres"] : kind === "web" ? ["nginx", "-g", "daemon off;"] : ["node", "dist/server/api.js"], Env: [], User: meta.candidateUser, Labels: {} };
      const mounts = kind === "web" ? ["--mount", "type=bind,src=/candidate-owned/rendered,dst=/runtime-web,readonly"] : (kind === "migrator" ? ["migrator", "runtime"] : [kind === "pg" ? "migrator" : "runtime"]).flatMap(name => ["--mount", `type=bind,src=/candidate-owned/${name},dst=/run/secrets/${name},readonly`]);
      const args = ["create", ...labels, "--network", networkId, ...mounts, ...(kind === "pg" ? ["--publish", "127.0.0.1:55434:5432", "--tmpfs", `/var/lib/postgresql/data:${PG_TMPFS}`] : kind === "migrator" ? ["--tmpfs", `/run/gate:${GATE_TMPFS}`, "--entrypoint", "node"] : kind === "api" ? ["--publish", "127.0.0.1:51474:5000", "--tmpfs", `/run/media:${MEDIA_TMPFS}`] : ["--publish", "127.0.0.1:51475:80"]), image, ...(kind === "migrator" ? ["dist/server/deployment/run-migration-gate.js"] : [])];
      const expected = containerSpecification(args, defaults);
      const id = await call("createContainer", { kind, args, expected }); requireCondition(fullId(id) && !knownIds.includes(id), "CUSTODY_RETAINED"); knownIds.push(id);
      validateFirstContainer(await call("inspectContainer", id), id, expected);
      validateFirstContainer(await call("inspectContainer", id), id, expected);
    }
  } catch { throw new PrebuiltSmokeError("CUSTODY_RETAINED", { retained: true, phase: knownIds.length ? "firstInspection" : "creation" }); }
  return freeze({ status: "NATIVE_CUSTODY_SIMULATED_UNQUALIFIED", releaseQualified: false, executedSmokeVerified: false, cleanupAuthorized: false });
}

// Native custody is deliberately private. No CLI argument/env/file or simulation can
// supply it. Each unresolved prerequisite fails before constructing runtime resources.
function unavailable(dependency: Dependency): never { throw new PrebuiltSmokeError("PREBUILT_SMOKE_EXECUTION_UNAVAILABLE", { dependency }); }
interface NativeAuthority {
  dockerExecutable: string; endpoint: "unix:///var/run/docker.sock"; pgImageId: string;
  sourceMaterial: string; renderedWebDirectory: string; sourceCommit: string;
  canonicalLocalBootApproved: boolean; musicProbeApproved: boolean;
  imageMigrations: readonly MusicMigration[] | null;
  imageDefaults: Record<"pg" | "api" | "web", ImageDefaults>;
}
function acquireNativeAuthority(_mode: Mode): NativeAuthority {
  // Approved OCI traversal/import/pull executable, version/cap policy and retained
  // locations have not been allocated. Docker inspect/load is not a substitute.
  return unavailable("OCI_IMPORT_AUTHORITY_UNAVAILABLE");
}

/** Native implementations below are source-only until acquireNativeAuthority is approved. */
function nativeAdapter(mode: Mode): SmokeAdapter {
  const authority = acquireNativeAuthority(mode);
  // Current canonical production startup requires S3, while test mode does not start
  // api.js. A reviewed compiled local startup is required; guessed env is forbidden.
  if (!authority.canonicalLocalBootApproved) unavailable("CANONICAL_STARTUP_DEPENDENCY_UNAVAILABLE");
  if (!authority.musicProbeApproved) unavailable("MUSIC_SMOKE_DEPENDENCY_UNAVAILABLE");
  if (!authority.imageMigrations) unavailable("IMAGE_MIGRATION_INVENTORY_AUTHORITY_UNAVAILABLE");
  if (!authority.sourceMaterial) unavailable("SOURCE_MATERIAL_AUTHORITY_UNAVAILABLE");
  if (!authority.renderedWebDirectory) unavailable("WEB_RENDERER_AUTHORITY_UNAVAILABLE");
  if (process.platform === "win32") unavailable("PROTECTED_FILE_AUTHORITY_UNAVAILABLE");
  rootHostPrerequisite(process.getuid?.(), authority.imageDefaults.api.User);
  let stage: ProtectedStage | undefined;
  let state: Data | null = null;
  const ledger: Array<{ id: string; kind: string; inspect: string | null; removed: boolean }> = [];
  let uncertainCreation = false;
  let network: { id: string; inspect: string | null } | undefined;
  const pending = new Set<Promise<unknown>>();
  const docker = (args: readonly string[]) => nativeDocker(authority, args);
  const identity = (raw: Data) => JSON.stringify({ id: raw.Id, image: raw.Image, config: raw.Config, mounts: raw.Mounts, host: raw.HostConfig });
  const networkIdentity = (raw: Data) => JSON.stringify({ id: raw.Id, driver: raw.Driver, scope: raw.Scope, internal: raw.Internal, attachable: raw.Attachable, ingress: raw.Ingress, options: raw.Options, labels: raw.Labels, ipam: raw.IPAM, ipv6: raw.EnableIPv6 });
  const inspectContainer = async (id: string) => {
    const raw = JSON.parse(await docker(["inspect", "--type", "container", id]));
    requireCondition(Array.isArray(raw) && raw.length === 1 && raw[0].Id === id, "CUSTODY_RETAINED"); return raw[0];
  };
  const rememberCreation = async (kind: string, args: readonly string[]) => {
    const expected = containerSpecification(args, authority.imageDefaults[kind === "migrator" ? "api" : kind as "pg" | "api" | "web"]);
    const operation = docker(args); pending.add(operation);
    try {
      const id = (await operation).trim(); requireCondition(fullId(id), "CUSTODY_RETAINED");
      requireCondition(!ledger.some(resource => resource.id === id) && network?.id !== id, "CUSTODY_RETAINED");
      const record = { id, kind, inspect: null as string | null, removed: false }; ledger.push(record);
      // Exact independently inspected bytes authorize cleanup; a name never does.
      const raw = await inspectContainer(id);
      validateFirstContainer(raw, id, expected);
      record.inspect = identity(raw); return id;
    } catch (error) { uncertainCreation = true; throw error; }
    finally { pending.delete(operation); }
  };
  const recheck = async () => {
    if (!stage) unavailable("PROTECTED_FILE_AUTHORITY_UNAVAILABLE");
    await stage.recheck();
    for (const resource of ledger.filter(r => !r.removed)) requireCondition(resource.inspect !== null && identity(await inspectContainer(resource.id)) === resource.inspect, "CUSTODY_RETAINED");
    if (network) {
      const raw = JSON.parse(await docker(["network", "inspect", network.id]))[0];
      requireCondition(network.inspect !== null && networkIdentity(raw) === network.inspect && Object.keys(raw.Containers ?? {}).every(id => ledger.some(resource => resource.id === id && !resource.removed)), "CUSTODY_RETAINED");
    }
  };
  const labels = () => ["--label", `com.explorers.candidate.nonce=${state!.nonce}`, "--label", `com.explorers.candidate.source=${authority.sourceCommit}`, "--label", "com.explorers.candidate.purpose=prebuilt-smoke"];
  const mount = (name: string, target: string) => ["--mount", `type=bind,src=${stage!.files[name].path},dst=${target},readonly`];
  const envArgs = (values: Record<string, string>) => Object.entries(values).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
  const dbEnvironment = (runtime: boolean) => ({ MUSIC_DATABASE_HOST: "candidate-pg", MUSIC_DATABASE_PORT: "5432", MUSIC_DATABASE_NAME: "candidate_smoke", MUSIC_DATABASE_USER: runtime ? "candidate_runtime" : "candidate_migrator", MUSIC_DATABASE_PASSWORD_FILE: runtime ? "/run/secrets/runtime" : "/run/secrets/migrator", MUSIC_DATABASE_MIGRATOR_USER: "candidate_migrator" });
  return {
    now: () => performance.now(),
    observeGraph: async () => unavailable("OCI_IMPORT_AUTHORITY_UNAVAILABLE"),
    observePublished: async () => unavailable("PUBLISHED_TRANSPORT_AUTHORITY_UNAVAILABLE"),
    inspectLoaded: async () => unavailable("SOURCE_MATERIAL_AUTHORITY_UNAVAILABLE"),
    prepare: async request => {
      // Runtime topology/source/rendering are not inferred from local source or labels.
      // No stage/container is allocated without a separately reviewed image bridge.
      if (!authority.sourceMaterial) unavailable("SOURCE_MATERIAL_AUTHORITY_UNAVAILABLE");
      if (!authority.renderedWebDirectory) unavailable("WEB_RENDERER_AUTHORITY_UNAVAILABLE");
      // These owned primitives require the earlier private prerequisite acquisition.
      // They never accept caller environment/paths/commands/credentials.
      stage = await createProtectedStage();
      state = { nonce: randomBytes(16).toString("hex"), custody: hash(JSON.stringify(stage.files)), endpoint: authority.endpoint, pgImageId: authority.pgImageId, ids: { pg: null, api: null, web: null }, runtimeRole: "candidate_runtime", migratorRole: "candidate_migrator" };
      const expectedNetwork = networkSpecification(state.nonce, authority.sourceCommit);
      const creatingNetwork = docker(["network", "create", "--driver", "bridge", "--ipam-driver", "default", "--subnet", "172.30.250.0/24", "--gateway", "172.30.250.1", "--internal", ...labels(), `candidate-${state.nonce}`]); pending.add(creatingNetwork);
      try {
        const id = (await creatingNetwork).trim(); requireCondition(fullId(id), "CUSTODY_RETAINED");
        network = { id, inspect: null };
        const inspect = await docker(["network", "inspect", id]); const observed = JSON.parse(inspect);
        requireCondition(observed.length === 1, "CUSTODY_RETAINED"); validateFirstNetwork(observed[0], id, expectedNetwork);
        network.inspect = networkIdentity(observed[0]);
      } catch (error) { uncertainCreation = true; throw error; } finally { pending.delete(creatingNetwork); }
      const pg = await rememberCreation("pg", ["create", ...labels(), "--network", network.id, "--network-alias", "candidate-pg", "--publish", "127.0.0.1:55434:5432", "--tmpfs", `/var/lib/postgresql/data:${PG_TMPFS}`, ...mount("migrator", "/run/secrets/migrator"), ...envArgs({ POSTGRES_USER: "candidate_migrator", POSTGRES_DB: "candidate_smoke", POSTGRES_PASSWORD_FILE: "/run/secrets/migrator" }), authority.pgImageId]);
      state.ids.pg = pg; await docker(["start", pg]); await stage.recheck();
      requireCondition(request.input.sourceCommit === authority.sourceCommit, "CUSTODY_RETAINED");
      return snapshot(state, "CUSTODY_RETAINED");
    },
    settle: async () => {
      await Promise.allSettled([...pending]);
      if (uncertainCreation || pending.size || !state?.ids.pg) return { state: "unknown", resources: null };
      await recheck(); return { state: "known", resources: snapshot(state, "CUSTODY_RETAINED") };
    },
    migrate: async request => {
      await recheck();
      // Migrator runs in a separate exact candidate API image before API/web creation.
      // Runtime credentials are provided only for least-privilege provisioning here;
      // migrator credentials never enter the API/web container.
      const gate = await readSecureMusicSecretFile(stage!.files.gate.path, { mode: "live" });
      const migrating = await rememberCreation("migrator", ["create", ...labels(), "--network", network!.id, ...mount("migrator", "/run/secrets/migrator"), ...mount("runtime", "/run/secrets/runtime"), "--tmpfs", `/run/gate:${GATE_TMPFS}`, ...envArgs({ ...dbEnvironment(false), MUSIC_MODE: "production", MUSIC_RUNTIME_DATABASE_USER: "candidate_runtime", MUSIC_RUNTIME_DATABASE_PASSWORD_FILE: "/run/secrets/runtime", MUSIC_IMAGE_DIGEST: request.subject.slice(request.subject.indexOf("@") + 1), MUSIC_IMAGE_COMMIT: authority.sourceCommit, MUSIC_MIGRATION_MARKER: EXPECTED_MUSIC_MIGRATION_ID, MUSIC_GATE_ATTESTATION_PATH: "/run/gate/attestation.json", MUSIC_GATE_ATTESTATION_KEY: gate }), "--entrypoint", "node", request.configId, "dist/server/deployment/run-migration-gate.js"]);
      await docker(["start", "--attach", migrating]);
      const finished = await inspectContainer(migrating); requireCondition(finished.State.Status === "exited" && finished.State.ExitCode === 0, "SCHEMA_INVALID");
      const record = ledger.find(r => r.id === migrating)!; requireCondition(identity(finished) === record.inspect, "CUSTODY_RETAINED");
      await docker(["rm", migrating]); record.removed = true;
      await stage!.recheck();
      return nativeSchema(stage!, request.resources, authority.imageMigrations!);
    },
    startCandidates: async request => {
      await recheck(); requireCondition(state && request.input.sourceCommit === authority.sourceCommit, "CUSTODY_RETAINED");
      const authSecret = await readSecureMusicSecretFile(stage!.files.auth.path, { mode: "live" });
      // Compiled local boot semantics still require a separate reviewed authority. No
      // arbitrary source command or injected source revision supplies that authority.
      state.ids.api = await rememberCreation("api", ["create", ...labels(), "--network", network!.id, "--publish", "127.0.0.1:51474:5000", ...mount("runtime", "/run/secrets/runtime"), "--tmpfs", `/run/media:${MEDIA_TMPFS}`, ...envArgs({ ...dbEnvironment(true), MUSIC_MODE: "production", EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474", EXPLORERS_AUTH_SECRET: authSecret, PORT: "5000" }), request.input.images.api.configDigest]);
      state.ids.web = await rememberCreation("web", ["create", ...labels(), "--network", network!.id, "--publish", "127.0.0.1:51475:80", "--mount", `type=bind,src=${authority.renderedWebDirectory},dst=/runtime-web,readonly`, request.input.images.web.configDigest]);
      await docker(["start", state.ids.api]); await stage!.recheck(); await docker(["start", state.ids.web]); await stage!.recheck();
      return snapshot(state, "CUSTODY_RETAINED");
    },
    inspectContainers: async request => {
      await recheck(); const containers = [];
      for (const kind of ["pg", "api", "web"]) {
        const id = request.resources.ids[kind as "pg" | "api" | "web"]; requireCondition(fullId(id), "CONTAINER_IDENTITY_INVALID");
        const data = JSON.parse(await docker(["inspect", "--type", "container", id!]))[0];
        containers.push({ kind, id: data.Id, configId: data.Image, sourceCommit: kind === "pg" ? null : data.Config.Labels?.["org.opencontainers.image.revision"], nonce: data.Config.Labels?.["com.explorers.candidate.nonce"], running: data.State.Running });
      }
      return { custody: request.resources.custody, containers };
    },
    probe: async () => {
      await recheck();
      // HTTP primitive is complete; the image-owned runtime contract and exact compiled
      // fixture identity/Music semantics must be acquired before composing a receipt.
      await nativeHttp(51474, "/health/live");
      unavailable("MUSIC_SMOKE_DEPENDENCY_UNAVAILABLE");
    },
    observeSchema: async request => { await recheck(); return nativeSchema(stage!, request.resources, authority.imageMigrations!); },
    restart: async request => { await recheck(); requireCondition(fullId(request.resources.ids.api), "CONTAINER_IDENTITY_INVALID"); await docker(["restart", "--time", "5", request.resources.ids.api!]); await stage!.recheck(); return { restartedId: request.resources.ids.api }; },
    cleanup: async request => {
      await recheck(); requireCondition(pending.size === 0, "CUSTODY_RETAINED");
      requireCondition(!uncertainCreation && equal(ledger.filter(r => !r.removed && r.kind !== "migrator").map(v => v.id).reverse(), request.reverseIds), "CUSTODY_RETAINED");
      const removedIds: string[] = [];
      // Failed migration's attested transient container is also removed exactly once.
      for (const resource of ledger.filter(r => !r.removed).reverse()) {
        requireCondition(identity(await inspectContainer(resource.id)) === resource.inspect, "CUSTODY_RETAINED");
        await docker(["rm", "--force", resource.id]); resource.removed = true;
        if (request.reverseIds.includes(resource.id)) removedIds.push(resource.id);
      }
      const listed = (await docker(["ps", "-a", "--no-trunc", "--format", "{{.ID}}"])).split(/\r?\n/).filter(Boolean);
      requireCondition(listed.every(fullId) && ledger.every(resource => !listed.includes(resource.id)), "CLEANUP_FAILED");
      requireCondition(network && networkIdentity(JSON.parse(await docker(["network", "inspect", network.id]))[0]) === network.inspect, "CUSTODY_RETAINED");
      await docker(["network", "rm", network.id]);
      const networks = (await docker(["network", "ls", "--no-trunc", "--format", "{{.ID}}"])).split(/\r?\n/).filter(Boolean);
      requireCondition(networks.every(fullId) && !networks.includes(network.id), "CLEANUP_FAILED");
      await stage!.remove(); return { settled: true, custody: request.resources.custody, removedIds, absentIds: [...request.reverseIds], enumerationSucceeded: true, protectedFilesRemoved: true };
    },
  };
}

function nativeDocker(authority: NativeAuthority, args: readonly string[]): Promise<string> {
  // No ambient Docker context/host/provider credentials; executable/endpoint are private
  // reviewed authority. execFile uses argv, never shell interpolation.
  if (!isAbsolute(authority.dockerExecutable) || authority.endpoint !== "unix:///var/run/docker.sock") unavailable("NATIVE_DOCKER_AUTHORITY_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    execFile(authority.dockerExecutable, ["--host", authority.endpoint, ...args], { timeout: OPERATION_MS, maxBuffer: 1_048_576, windowsHide: true, env: { PATH: dirname(authority.dockerExecutable), LANG: "C", LC_ALL: "C" } }, (error, stdout) => {
      if (error) { sanitizeMusicCliText(String(error)); reject(new PrebuiltSmokeError("OPERATION_FAILED")); }
      else resolve(stdout);
    });
  });
}
async function nativeHttp(port: 51474 | 51475, path: string): Promise<Data> {
  requireCondition(["/health/live", "/api/auth/get-session", "/api/explorers/v1/me", "/", "/runtime-config.json"].includes(path) || /^\/assets\/[a-zA-Z0-9_-]+\.js$/.test(path), "PROBE_INVALID");
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "error", signal: AbortSignal.timeout(OPERATION_MS) });
  let size = 0, body = ""; const reader = response.body?.getReader();
  try {
    if (reader) { const decoder = new TextDecoder("utf-8", { fatal: true }); for (;;) { const { done, value } = await reader.read(); if (done) { body += decoder.decode(); break; } size += value.length; requireCondition(size <= 65_536, "PROBE_INVALID"); body += decoder.decode(value, { stream: true }); } }
  } finally { await reader?.cancel(); }
  const headers: Data = {}; for (const key of ["content-type", "cache-control"]) { const value = response.headers.get(key); if (value !== null) headers[key] = value; }
  return { status: response.status, headers, body };
}

interface FileIdentity { path: string; dev: string; ino: string; mode: number; uid: number; gid: number; size: string; digest: string }
interface ProtectedStage { root: string; files: Record<string, FileIdentity>; recheck(): Promise<void>; remove(): Promise<void> }
async function createProtectedStage(): Promise<ProtectedStage> {
  // Windows live reader validates ACLs, but reviewed exclusive protected directory/ACL
  // creation is not allocated here. Never downgrade to fixture mode.
  if (process.platform === "win32" || process.getuid === undefined) unavailable("PROTECTED_FILE_AUTHORITY_UNAVAILABLE");
  rootHostPrerequisite(process.getuid(), "");
  const root = await mkdtemp(join(tmpdir(), "explorers-candidate-"));
  const rootStat = await lstat(root, { bigint: true });
  requireCondition(isAbsolute(root) && await realpath(root) === root && rootStat.isDirectory() && !rootStat.isSymbolicLink() && Number(rootStat.uid) === process.getuid() && (Number(rootStat.mode) & 0o777) === 0o700, "CUSTODY_RETAINED");
  const ancestors: Array<{ path: string; dev: bigint; ino: bigint; mode: bigint; uid: bigint; gid: bigint }> = [];
  for (let path = root;; path = dirname(path)) {
    const s = await lstat(path, { bigint: true }); requireCondition(s.isDirectory() && !s.isSymbolicLink() && await realpath(path) === path, "CUSTODY_RETAINED");
    // World-writable shared temp ancestors require the sticky bit; ordinary writable
    // non-owned ancestors cannot establish custody.
    requireCondition(Number(s.uid) === process.getuid() || Number(s.uid) === 0, "CUSTODY_RETAINED");
    requireCondition((Number(s.mode) & 0o022) === 0 || (Number(s.mode) & 0o1000) !== 0, "CUSTODY_RETAINED");
    ancestors.push({ path, dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid, gid: s.gid }); if (dirname(path) === path) break;
  }
  const files: Record<string, FileIdentity> = {};
  for (const name of ["migrator", "runtime", "gate", "auth"]) {
    const path = join(root, name), value = randomBytes(32).toString("base64url");
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
    const s = await lstat(path, { bigint: true }); requireCondition(s.isFile() && !s.isSymbolicLink() && s.nlink === 1n && Number(s.uid) === process.getuid(), "CUSTODY_RETAINED");
    requireCondition(await readSecureMusicSecretFile(path, { mode: "live" }) === value, "CUSTODY_RETAINED");
    files[name] = { path, dev: s.dev.toString(), ino: s.ino.toString(), mode: Number(s.mode), uid: Number(s.uid), gid: Number(s.gid), size: s.size.toString(), digest: hash(value) };
  }
  const recheck = async () => {
    for (const a of ancestors) { const s = await lstat(a.path, { bigint: true }); requireCondition(await realpath(a.path) === a.path && !s.isSymbolicLink() && s.dev === a.dev && s.ino === a.ino && s.mode === a.mode && s.uid === a.uid && s.gid === a.gid, "CUSTODY_RETAINED"); }
    for (const f of Object.values(files)) {
      const s = await lstat(f.path, { bigint: true });
      requireCondition(s.isFile() && s.nlink === 1n && !s.isSymbolicLink() && await realpath(f.path) === f.path && s.dev.toString() === f.dev && s.ino.toString() === f.ino && Number(s.mode) === f.mode && Number(s.uid) === f.uid && Number(s.gid) === f.gid && s.size.toString() === f.size && hash(await readSecureMusicSecretFile(f.path, { mode: "live" })) === f.digest, "CUSTODY_RETAINED");
    }
  };
  return { root, files, recheck, remove: async () => { await recheck(); for (const f of Object.values(files).reverse()) await unlink(f.path); await rmdir(root); } };
}

async function nativeSchema(stage: ProtectedStage, resources: OwnedSmokeResources, imageMigrations: readonly MusicMigration[]): Promise<Data> {
  await stage.recheck();
  const require = createRequire(new URL("../tunes/package.json", import.meta.url));
  type DatabasePool = Parameters<typeof verifyMusicDatabase>[0] & {
    query(sql: string, values?: unknown[]): Promise<{ rows: Data[] }>;
    end(): Promise<void>;
  };
  // Both runtime resolution and type surface stay within the fixed Tunes dependency.
  const pg = require("pg") as { Pool: new (options: Data) => DatabasePool };
  const pool = new pg.Pool({ host: "127.0.0.1", port: 55434, database: "candidate_smoke", user: resources.migratorRole, password: await readSecureMusicSecretFile(stage.files.migrator.path, { mode: "live" }), max: 1, connectionTimeoutMillis: OPERATION_MS, statement_timeout: OPERATION_MS, query_timeout: OPERATION_MS });
  try {
    // Same readiness semantics with inventory acquired from the verified candidate
    // image, never the launcher's checkout migrations/default-directory fallback.
    requireCondition(imageMigrations.length === EXPECTED_MUSIC_MIGRATION_CHAIN.length && imageMigrations.every((m, n) => m.id === EXPECTED_MUSIC_MIGRATION_CHAIN[n] && fullId(m.checksum) && createHash("sha256").update(m.sql).digest("hex") === m.checksum), "SCHEMA_INVALID");
    const verified = await verifyMusicDatabase(pool, { migrations: [...imageMigrations] });
    requireCondition(verified.ready && verified.currentId === EXPECTED_MUSIC_MIGRATION_ID && verified.currentChecksum === imageMigrations.at(-1)?.checksum, "SCHEMA_INVALID");
    const journal = await pool.query("SELECT id,checksum FROM public.music_schema_migrations ORDER BY id");
    const roles = await pool.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=ANY($1::text[])", [[resources.runtimeRole, resources.migratorRole]]);
    const runtime = roles.rows.find((r: Data) => r.rolname === resources.runtimeRole), migrator = roles.rows.find((r: Data) => r.rolname === resources.migratorRole);
    requireCondition(runtime?.rolcanlogin === true && !runtime.rolsuper && !runtime.rolcreatedb && !runtime.rolcreaterole && !runtime.rolbypassrls && migrator?.rolcanlogin === true, "SCHEMA_INVALID");
    const membership = await pool.query("SELECT parent.rolname FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member WHERE child.rolname=$1 ORDER BY parent.rolname", [resources.runtimeRole]);
    return { inventory: { chain: journal.rows, schemaChecksum: verified.schemaChecksum }, runtimeRole: runtime.rolname, migratorRole: migrator.rolname, runtimePrivileges: membership.rows.map((r: Data) => r.rolname), migratorProvisioned: true };
  } finally { await pool.end(); await stage.recheck(); }
}
