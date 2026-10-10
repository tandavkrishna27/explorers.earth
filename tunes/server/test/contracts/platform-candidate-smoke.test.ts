import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { inspectUnqualifiedPrebuiltSmokeSimulation as simulate, inspectUnqualifiedNativeCustodySimulation as nativeSimulation, runCandidatePrebuiltSmoke } from "../../../../scripts/platform-candidate-smoke";
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from "../../../shared/music-migration-contract";

const digest = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;
const sourceCommit = "a".repeat(40);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const bytes = (kind: string) => {
  const n = kind === "api" ? 1 : 11;
  return JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json", config: { digest: digest(n + 2), size: 512, mediaType: "application/vnd.oci.image.config.v1+json" }, layers: [{ digest: digest(n + 3), size: 1024, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip" }] });
};
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function input(mode = "retained-oci") {
  const image = (n: number) => ({ archiveDigest: digest(n), manifestDigest: hash(bytes(n === 1 ? "api" : "web")), configDigest: digest(n + 2), layerDigests: [digest(n + 3)], diffIds: [digest(n + 4)] });
  return { policyVersion: "prebuilt-smoke/v1", mode, repository: "tandavkrishna27/explorers.earth", workflowRef: "refs/heads/codex/unified-replatform", sourceCommit, producerRunId: "123", producerRunAttempt: "2", architecture: "linux/amd64", images: { api: image(1), web: image(11) } };
}
const inventory = () => ({ chain: EXPECTED_MUSIC_MIGRATION_CHAIN.map((id, n) => ({ id, checksum: digest(n + 100).slice(7) })), schemaChecksum: digest(500).slice(7) });
function harness() {
  const calls: Array<{ method: string; request: any }> = [];
  const ids = { pg: "1".repeat(64), api: "2".repeat(64), web: "3".repeat(64) };
  let time = 0;
  let started = false;
  const resources = () => ({ nonce: "b".repeat(32), custody: digest(900), endpoint: "unix:///var/run/docker.sock", pgImageId: digest(901), ids: { pg: ids.pg, api: started ? ids.api : null, web: started ? ids.web : null }, runtimeRole: "candidate_runtime", migratorRole: "candidate_migrator" });
  const record = (method: string, fn: (r: any) => any) => async (request: any) => { calls.push({ method, request: clone(request) }); return fn(request); };
  const json = (body: unknown) => ({ status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
  const adapter: any = {
    now: () => time,
    observeGraph: record("observeGraph", r => ({ archiveDigest: r.image.archiveDigest, architecture: "linux/amd64", manifest: { digest: r.image.manifestDigest, size: Buffer.byteLength(bytes(r.kind)), mediaType: "application/vnd.oci.image.manifest.v1+json" }, config: { digest: r.image.configDigest, size: 512, mediaType: "application/vnd.oci.image.config.v1+json" }, layers: r.image.layerDigests.map((d: string, i: number) => ({ digest: d, size: 1024, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", diffId: r.image.diffIds[i] })), descriptors: [r.image.manifestDigest, r.image.configDigest, ...r.image.layerDigests], manifestBytes: bytes(r.kind) })),
    observePublished: record("observePublished", r => ({ subject: r.subject, freshPull: true, manifestBytes: r.graph.manifestBytes, graph: clone(r.graph) })),
    inspectLoaded: record("inspectLoaded", r => ({ configId: r.image.configDigest, diffIds: clone(r.image.diffIds), architecture: "linux/amd64", sourceCommit, sourceRepository: "tandavkrishna27/explorers.earth", sourceMaterialCommit: sourceCommit, inventory: r.kind === "api" ? inventory() : null })),
    prepare: record("prepare", () => resources()),
    settle: record("settle", () => ({ state: "known", resources: resources() })),
    migrate: record("migrate", () => ({ inventory: inventory(), runtimeRole: "candidate_runtime", migratorRole: "candidate_migrator", runtimePrivileges: ["music_runtime"], migratorProvisioned: true })),
    startCandidates: record("startCandidates", () => { started = true; return resources(); }),
    inspectContainers: record("inspectContainers", r => ({ custody: digest(900), containers: ["pg", "api", "web"].map(kind => ({ kind, id: ids[kind as keyof typeof ids], configId: kind === "pg" ? digest(901) : r.input.images[kind].configDigest, sourceCommit: kind === "pg" ? null : sourceCommit, nonce: "b".repeat(32), running: true })) })),
    probe: record("probe", () => ({ live: json({ status: "live" }), session: json(null), protected: { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: '{"error":"Unauthorized"}' }, web: { status: 200, headers: { "content-type": "text/html" }, body: '<html><script src="/assets/candidate.js"></script></html>' }, runtimeConfig: json({ version: 1, environment: "qa", origin: "https://127.0.0.1:51475", apiPath: "/api", socketPath: "/socket.io", analytics: { enabled: false } }), asset: { status: 200, headers: { "content-type": "text/javascript" }, body: "export {};" }, assetPath: "/assets/candidate.js", music: { status: "MUSIC_SMOKE_SIMULATED_UNQUALIFIED", dependency: "MUSIC_SMOKE_DEPENDENCY_UNAVAILABLE" } })),
    observeSchema: record("observeSchema", () => ({ inventory: inventory(), runtimeRole: "candidate_runtime", migratorRole: "candidate_migrator", runtimePrivileges: ["music_runtime"], migratorProvisioned: true })),
    restart: record("restart", () => ({ restartedId: ids.api })),
    cleanup: record("cleanup", r => ({ settled: true, custody: digest(900), removedIds: clone(r.reverseIds), absentIds: [...r.reverseIds].reverse(), enumerationSucceeded: true, protectedFilesRemoved: true })),
  };
  return { adapter, calls, ids, advance: (ms: number) => { time += ms; } };
}
describe("candidate prebuilt smoke contract", () => {
  it.each(["retained-oci", "published-digest"])("keeps %s simulation unqualified with exact requests and settled cleanup", async mode => {
    const h = harness(); const result = await simulate(input(mode), h.adapter);
    expect(result).toMatchObject({ status: "PREBUILT_SMOKE_SIMULATED_UNQUALIFIED", mode, releaseQualified: false, executedSmokeVerified: false, registryAuthenticated: false, cryptographicallyVerified: false, buildOperations: 0, cleanupVerified: true });
    expect(h.calls.map(c => c.method)).toEqual(["observeGraph", ...(mode === "published-digest" ? ["observePublished"] : []), "inspectLoaded", "observeGraph", ...(mode === "published-digest" ? ["observePublished"] : []), "inspectLoaded", "prepare", "settle", "migrate", "startCandidates", "inspectContainers", "probe", "observeSchema", "restart", "inspectContainers", "probe", "observeSchema", "settle", "cleanup"]);
    expect(h.calls.find(c => c.method === "migrate")?.request.command).toEqual(["node", "dist/server/deployment/run-migration-gate.js"]);
    expect(h.calls.find(c => c.method === "migrate")?.request.configId).toBe(input().images.api.configDigest);
    expect(h.calls.find(c => c.method === "migrate")?.request.subject).toBe(`ghcr.io/tandavkrishna27/explorers-api@${input().images.api.manifestDigest}`);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.subjects)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/candidate_runtime|candidate_migrator|docker.sock|retained-manifest|password/i);
  });
  it.each([
    ["extra", (x: any) => { x.tag = "latest"; }], ["repo", (x: any) => { x.repository = "fork/repo"; }], ["ref", (x: any) => { x.workflowRef = "refs/heads/main"; }], ["architecture", (x: any) => { x.architecture = "linux/arm64"; }], ["source", (x: any) => { x.sourceCommit = "A".repeat(40); }], ["run", (x: any) => { x.producerRunId = "01"; }], ["unsafe attempt", (x: any) => { x.producerRunAttempt = "9007199254740992"; }], ["image repository", (x: any) => { x.images.api.repository = "evil"; }], ["archive as manifest", (x: any) => { x.images.api.manifestDigest = x.images.api.archiveDigest; }], ["config as manifest", (x: any) => { x.images.api.manifestDigest = x.images.api.configDigest; }], ["layer as config", (x: any) => { x.images.api.configDigest = x.images.api.layerDigests[0]; }], ["diff substitution", (x: any) => { x.images.api.diffIds[0] = x.images.api.layerDigests[0]; }], ["too many layers", (x: any) => { x.images.api.layerDigests = Array(65).fill(digest(1000)); }],
  ])("rejects input %s before any adapter call", async (_name, mutate) => {
    const h = harness(); const x = input(); mutate(x); await expect(simulate(x, h.adapter)).rejects.toMatchObject({ code: "INPUT_INVALID" }); expect(h.calls).toEqual([]);
  });
  it("rejects getters without invoking them or using native fallback", async () => {
    const h = harness(); const x = input(); let read = false;
    Object.defineProperty(x, "mode", { enumerable: true, get: () => { read = true; return "retained-oci"; } });
    await expect(simulate(x, h.adapter)).rejects.toMatchObject({ code: "INPUT_INVALID" }); expect(read).toBe(false); expect(h.calls).toEqual([]);
  });
  it.each(["missing", "extra", "getter"])("requires complete exact adapter: %s", async mode => {
    const h = harness(); if (mode === "missing") delete h.adapter.cleanup;
    else if (mode === "extra") h.adapter.build = () => undefined;
    else Object.defineProperty(h.adapter, "probe", { enumerable: true, get: () => { throw Error("secret"); } });
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "ADAPTER_INVALID" }); expect(h.calls).toEqual([]);
  });
  it("copies input before the first await and copies observations", async () => {
    const h = harness(); const x = input(); const original = h.adapter.observeGraph; let graph: any;
    h.adapter.observeGraph = async (r: any) => { graph = await original(r); x.sourceCommit = "c".repeat(40); return graph; };
    const result = await simulate(x, h.adapter); graph.archiveDigest = digest(999); expect(result.sourceCommit).toBe(sourceCommit);
  });
  it.each([
    ["size", (g: any) => { g.manifest.size = 0; }], ["media", (g: any) => { g.layers[0].mediaType = "foreign"; }], ["index", (g: any) => { g.manifest.mediaType = "application/vnd.oci.image.index.v1+json"; }], ["missing layer", (g: any) => { g.layers = []; }], ["duplicate", (g: any) => { g.descriptors.push(g.descriptors[0]); }], ["extra", (g: any) => { g.descriptors.push(digest(999)); }], ["order", (g: any) => { g.layers[0].diffId = digest(999); }], ["raw archive", (g: any) => { g.archiveDigest = digest(999); }], ["descriptor getter", (g: any) => { Object.defineProperty(g.config, "digest", { enumerable: true, get: () => { throw Error("secret"); } }); }],
  ])("rejects observed graph %s before resources", async (_name, mutate) => {
    const h = harness(); const original = h.adapter.observeGraph; h.adapter.observeGraph = async (r: any) => { const g = await original(r); mutate(g); return g; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "GRAPH_INVALID" }); expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
  it.each(["transformed", "not fresh", "wrong subject"])("requires independent published pull: %s", async fault => {
    const h = harness(); const original = h.adapter.observePublished; h.adapter.observePublished = async (r: any) => { const p = await original(r); if (fault === "transformed") p.manifestBytes = "transformed"; if (fault === "not fresh") p.freshPull = false; if (fault === "wrong subject") p.subject = "repo:latest"; return p; };
    await expect(simulate(input("published-digest"), h.adapter)).rejects.toMatchObject({ code: "PUBLISHED_INVALID" }); expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
  it.each(["configId", "sourceCommit", "sourceMaterialCommit", "diffIds"])("rejects loaded %s before resources", async key => {
    const h = harness(); const original = h.adapter.inspectLoaded; h.adapter.inspectLoaded = async (r: any) => { const v = await original(r); v[key] = key === "diffIds" ? [digest(999)] : digest(999); return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "LOAD_IDENTITY_INVALID" }); expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
  it.each(["schema38", "schema51", "checksum", "role", "privileges"])("rejects migration %s and cleans exactly once", async fault => {
    const h = harness(); const original = h.adapter.migrate; h.adapter.migrate = async (r: any) => { const v = await original(r); if (fault === "schema38") v.inventory.chain = v.inventory.chain.slice(0, 38); if (fault === "schema51") v.inventory.chain.pop(); if (fault === "checksum") v.inventory.chain[0].checksum = "0".repeat(64); if (fault === "role") v.runtimeRole = v.migratorRole; if (fault === "privileges") v.runtimePrivileges.push("superuser"); return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "SCHEMA_INVALID" }); expect(h.calls.filter(c => c.method === "cleanup")).toHaveLength(1);
  });
  it.each(["live", "session", "protected", "web", "runtimeConfig", "asset", "music"])("rejects incorrect %s observations with cleanup", async key => {
    const h = harness(); const original = h.adapter.probe; h.adapter.probe = async (r: any) => { const v = await original(r); v[key].status = 500; return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "PROBE_INVALID" }); expect(h.calls.filter(c => c.method === "cleanup")).toHaveLength(1);
  });
  it.each(["prepare", "migrate", "startCandidates", "inspectContainers", "probe", "observeSchema", "restart"])("settles and cleans after %s failure without exposing raw cause", async method => {
    const h = harness(); h.adapter[method] = async () => { throw Error("password=secret /private/path http://secret.invalid"); };
    try { await simulate(input(), h.adapter); expect.fail("must fail"); } catch (e: any) { expect(e.code).toBe("OPERATION_FAILED"); expect(e.phase).toBe(method); expect(JSON.stringify(e)).not.toMatch(/secret|private\/path/); }
    expect(h.calls.filter(c => c.method === "cleanup")).toHaveLength(1);
  });
  it("cleans late-known creation after deadline expiry", async () => {
    const h = harness(); const original = h.adapter.prepare; h.adapter.prepare = async (r: any) => { const v = await original(r); h.advance(10_001); return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "OPERATION_TIMEOUT", phase: "prepare" }); expect(h.calls.filter(c => c.method === "cleanup")).toHaveLength(1);
  });
  it("retains custody when creation cannot settle", async () => {
    const h = harness(); h.adapter.prepare = async () => { throw Error("late create"); }; h.adapter.settle = async () => ({ state: "unknown", resources: null });
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "CUSTODY_RETAINED", originalPhase: "prepare", retained: true }); expect(h.calls.some(c => c.method === "cleanup")).toBe(false);
  });
  it.each(["custody", "absence", "cleanup exception"])("refuses apparent success after %s failure", async fault => {
    const h = harness(); const original = h.adapter.cleanup; h.adapter.cleanup = async (r: any) => { if (fault === "cleanup exception") throw Error("secret"); const v = await original(r); if (fault === "custody") v.custody = digest(999); else v.enumerationSucceeded = false; return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: fault === "custody" ? "CUSTODY_RETAINED" : "CLEANUP_FAILED", retained: true });
  });
  it("rejects changed identity after restart and unchanged-checksum violations", async () => {
    const h = harness(); const original = h.adapter.inspectContainers; let count = 0; h.adapter.inspectContainers = async (r: any) => { const v = await original(r); if (++count === 2) v.containers[1].sourceCommit = "d".repeat(40); return v; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "CONTAINER_IDENTITY_INVALID" });
    const second = harness(); const schema = second.adapter.observeSchema; let observed = 0; second.adapter.observeSchema = async (r: any) => { const v = await schema(r); if (++observed === 2) v.inventory.schemaChecksum = "e".repeat(64); return v; };
    await expect(simulate(input(), second.adapter)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
  it("rejects forged simulation receipts and names missing native graph authority before resources", async () => {
    const h = harness(); const forged = { ...(await simulate(input(), h.adapter)), executedSmokeVerified: true };
    await expect(runCandidatePrebuiltSmoke(input(), forged)).rejects.toMatchObject({ code: "EXECUTION_AUTHORIZATION_INVALID" });
    await expect(runCandidatePrebuiltSmoke(input(), { execute: true })).rejects.toMatchObject({ code: "PREBUILT_SMOKE_EXECUTION_UNAVAILABLE", dependency: "OCI_IMPORT_AUTHORITY_UNAVAILABLE" });
  });
  it.each(["observeGraph", "observePublished", "inspectLoaded"])("never allocates resources after %s failure", async method => {
    const h = harness(); h.adapter[method] = async () => { throw Error("private token"); };
    await expect(simulate(input("published-digest"), h.adapter)).rejects.toMatchObject({ code: "OPERATION_FAILED", phase: method });
    expect(h.calls.some(c => ["prepare", "cleanup"].includes(c.method))).toBe(false);
  });
  it("enforces the total phase deadline independently of individual operations", async () => {
    const h = harness();
    for (const [key, operation] of Object.entries(h.adapter)) if (key !== "now" && !["settle", "cleanup"].includes(key)) h.adapter[key] = async (r: any) => { const value = await (operation as Function)(r); h.advance(9_000); return value; };
    await expect(simulate(input("published-digest"), h.adapter)).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" });
    expect(h.calls.filter(c => c.method === "cleanup")).toHaveLength(1);
  });
  it("retains custody after settlement identity mutation instead of removing by name", async () => {
    const h = harness(); const original = h.adapter.settle; let count = 0;
    h.adapter.settle = async (r: any) => { const value = await original(r); if (++count === 2) value.resources.ids.pg = "9".repeat(64); return value; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "CUSTODY_RETAINED", retained: true });
    expect(h.calls.some(c => c.method === "cleanup")).toBe(false);
  });
  it("retains original failure stage when cleanup overrides it", async () => {
    const h = harness(); h.adapter.probe = async () => { throw Error("secret"); }; h.adapter.cleanup = async () => { throw Error("secret"); };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "CLEANUP_FAILED", originalPhase: "probe", retained: true });
  });
  it("rejects nonmonotonic clock evidence", async () => {
    const h = harness(); const original = h.adapter.observeGraph;
    h.adapter.observeGraph = async (r: any) => { const graph = await original(r); h.advance(-1); return graph; };
    await expect(simulate(input(), h.adapter)).rejects.toMatchObject({ code: "ADAPTER_INVALID" });
    expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
  it("rejects a manifest whose hashed bytes disagree with modeled descriptor membership", async () => {
    const h = harness(); const x = input(); const original = h.adapter.observeGraph;
    const changed = JSON.parse(bytes("api")); changed.config.digest = digest(999);
    const raw = JSON.stringify(changed); x.images.api.manifestDigest = hash(raw);
    h.adapter.observeGraph = async (r: any) => { const g = await original(r); if (r.kind === "api") { g.manifestBytes = raw; g.manifest.size = Buffer.byteLength(raw); } return g; };
    await expect(simulate(x, h.adapter)).rejects.toMatchObject({ code: "GRAPH_INVALID" });
    expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
  it.each(["root", "escaped root", "nested", "escaped nested"])("rejects decoded duplicate manifest keys: %s", async fault => {
    const h = harness(); const x = input(); const original = h.adapter.observeGraph;
    let raw = bytes("api");
    if (fault.includes("root")) raw = raw.replace('"config":', `"${fault.includes("escaped") ? "con\\u0066ig" : "config"}":{"digest":"${digest(999)}"},"config":`);
    else raw = raw.replace('"size":512', `"${fault.includes("escaped") ? "si\\u007ae" : "size"}":1,"size":512`);
    x.images.api.manifestDigest = hash(raw);
    h.adapter.observeGraph = async (r: any) => { const g = await original(r); if (r.kind === "api") { g.manifestBytes = raw; g.manifest.size = Buffer.byteLength(raw); } return g; };
    await expect(simulate(x, h.adapter)).rejects.toMatchObject({ code: "GRAPH_INVALID" }); expect(h.calls.some(c => c.method === "prepare")).toBe(false);
  });
});

function nativeHarness() {
  const calls: any[] = []; const expected = new Map<string, any>();
  const adapter = {
    now: () => 0,
    createNetwork: async (request: any) => { calls.push({ method: "createNetwork", request: clone(request) }); const id = "8".repeat(64); expected.set(id, { Id: id, ...clone(request.expected) }); return id; },
    inspectNetwork: async (id: string) => { calls.push({ method: "inspectNetwork", id }); return clone(expected.get(id)); },
    createContainer: async (request: any) => { calls.push({ method: "createContainer", request: clone(request) }); const id = String(calls.length % 7 + 1).repeat(64); expected.set(id, { Id: id, ...clone(request.expected) }); return id; },
    inspectContainer: async (id: string) => { calls.push({ method: "inspectContainer", id }); return clone(expected.get(id)); },
  };
  return { adapter, calls };
}
describe("native custody resource-free contract", () => {
  it("requires actual root host metadata before modeled root-default credential allocation", async () => {
    const h = nativeHarness(); await expect(nativeSimulation(input(), { hostUid: 1001, candidateUser: "" }, h.adapter)).rejects.toMatchObject({ code: "PREBUILT_SMOKE_EXECUTION_UNAVAILABLE", dependency: "POSIX_ROOT_HOST_REQUIRED" }); expect(h.calls).toEqual([]);
  });
  it("checks fixed requests and first/later immutable inspections without granting cleanup authority", async () => {
    const h = nativeHarness(); const result = await nativeSimulation(input(), { hostUid: 0, candidateUser: "" }, h.adapter);
    expect(result).toMatchObject({ status: "NATIVE_CUSTODY_SIMULATED_UNQUALIFIED", releaseQualified: false, executedSmokeVerified: false, cleanupAuthorized: false });
    const pg = h.calls.find(c => c.request?.kind === "pg");
    expect(pg.request.expected.HostConfig.Tmpfs).toEqual({ "/var/lib/postgresql/data": "rw,noexec,nosuid,size=2147483648" });
    expect(pg.request.expected.Config.User).toBe(""); expect(pg.request.expected.Config.Entrypoint).toEqual(["docker-entrypoint.sh"]);
    expect(h.calls.filter(c => c.method === "inspectContainer")).toHaveLength(8);
  });
  it.each(["image", "mount source", "mount writable", "command", "environment", "entrypoint", "user", "port", "tmpfs", "network", "purpose"])("retains known ID after wrong first %s despite a correct later response", async fault => {
    const h = nativeHarness(); const original = h.adapter.inspectContainer; let observed = 0;
    h.adapter.inspectContainer = async id => { const v = await original(id); if (++observed === 1) {
      if (fault === "image") v.Image = digest(999);
      if (fault === "mount source") v.Mounts[0].Source = "/foreign/secret";
      if (fault === "mount writable") v.Mounts[0].RW = true;
      if (fault === "command") v.Config.Cmd = ["sh"];
      if (fault === "environment") v.Config.Env.push("DATABASE_URL=foreign");
      if (fault === "entrypoint") v.Config.Entrypoint = ["sh"];
      if (fault === "user") v.Config.User = "1001";
      if (fault === "port") v.HostConfig.PortBindings["5432/tcp"][0].HostIp = "0.0.0.0";
      if (fault === "tmpfs") v.HostConfig.Tmpfs["/var/lib/postgresql/data"] = "rw";
      if (fault === "network") v.HostConfig.NetworkMode = "host";
      if (fault === "purpose") v.Config.Labels["com.explorers.candidate.purpose"] = "other";
    } return v; };
    await expect(nativeSimulation(input(), { hostUid: 0, candidateUser: "" }, h.adapter)).rejects.toMatchObject({ code: "CUSTODY_RETAINED", retained: true });
    expect(observed).toBe(1); expect(h.calls.filter(c => c.method === "createContainer")).toHaveLength(1);
  });
  it.each(["driver", "options", "ipam", "source", "topology"])("retains network after wrong first %s", async fault => {
    const h = nativeHarness(); const original = h.adapter.inspectNetwork;
    h.adapter.inspectNetwork = async id => { const v = await original(id); if (fault === "driver") v.Driver = "overlay"; if (fault === "options") v.Options = { unsafe: "yes" }; if (fault === "ipam") v.IPAM.Config[0].Subnet = "10.0.0.0/8"; if (fault === "source") v.Labels["com.explorers.candidate.source"] = "f".repeat(40); if (fault === "topology") v.Internal = false; return v; };
    await expect(nativeSimulation(input(), { hostUid: 0, candidateUser: "" }, h.adapter)).rejects.toMatchObject({ code: "CUSTODY_RETAINED", retained: true }); expect(h.calls.some(c => c.method === "createContainer")).toBe(false);
  });
});
