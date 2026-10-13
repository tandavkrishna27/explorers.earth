import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";
import {
  MUSIC_UAT_DATABASE_ACK,
  MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES,
  MUSIC_UAT_DATABASE_TEST_FILES,
  buildUatDatabaseTestCommand,
  executeOwnedUatEvidence,
  parseUatDatabaseAuthority,
  prepareOwnedUatDatabaseAcquisition,
  runUatDatabaseTestChild,
  startOwnedUatDatabase,
  stopOwnedUatDatabase,
  validateUatDatabaseInspect,
  withOwnedUatDatabase,
} from "../../../scripts/music-uat-database";

const runId = "1".repeat(32);
const database = `music_uat_${runId}`;
const commit = "c".repeat(40);
const containerId = "a".repeat(64);
const imageId = `sha256:${"b".repeat(64)}`;
const contextHost = "npipe:////./pipe/dockerDesktopLinuxEngine";

function authorityEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MUSIC_UAT_DATABASE_ACK,
    MUSIC_UAT_DATABASE_RUN_ID: runId,
    MUSIC_UAT_DATABASE_NAME: database,
    MUSIC_UAT_DATABASE_PORT: "58543",
    MUSIC_UAT_DATABASE_CONTAINER_ID: containerId,
    MUSIC_UAT_DATABASE_COMMIT: commit,
    ...overrides,
  };
}

function ownedInspect() {
  return {
    Id: containerId,
    Name: `/explorers-music-uat-db-${runId}`,
    Image: imageId,
    Config: {
      Image: "postgres:15-alpine",
      Env: [
        "POSTGRES_USER=music_migrator",
        `POSTGRES_DB=${database}`,
        "POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password",
      ],
      Labels: {
        "com.explorers.music.fixture": "true",
        "com.explorers.music.project": "explorers-music-fixture",
        "com.explorers.music.uat-database": "true",
        "com.explorers.music.uat-run": runId,
        "com.explorers.music.database": database,
        "com.explorers.music.commit": commit,
      },
    },
    State: { Running: true, Health: { Status: "healthy" } },
    HostConfig: {
      PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58543" }] },
      Tmpfs: { "/var/lib/postgresql/data": "rw,noexec,nosuid,size=2147483648" },
    },
    Mounts: [{ Type: "bind", Destination: "/run/secrets/music-uat-database-password", RW: false }],
  };
}

describe("staged owned UAT database acquisition", () => {
  const passwordFile = String.raw`C:\Users\TK\fixture\current-secret`;
  const input = { runId, database, commit, port: 58543, passwordFile };
  const ok = (stdout = "") => ({ status: 0, stdout, timedOut: false });
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  function fixture() {
    const commands: string[][] = [];
    let inspect = { ...ownedInspect(), Config: { ...ownedInspect().Config, Image: imageId },
      Mounts: [{ ...ownedInspect().Mounts[0], Source: passwordFile }] };
    let absent = ok();
    let creation = async () => ok(containerId);
    let removal = ok();
    let health = async () => inspect;
    let inode = 1n;
    let ancestorInode = 2n;
    let canonical = passwordFile;
    let host = contextHost;
    let image = imageId;
    let readFailure = "";
    let now = 0;
    const timers = new Map<number, { at: number; callback: () => void }>();
    let timerId = 0;
    const dependencies = {
      clock: { now: () => now,
        setTimeout: (callback: () => void, ms: number) => { const id = ++timerId; timers.set(id, { at: now + ms, callback }); return id; },
        clearTimeout: (id: unknown) => { timers.delete(id as number); } },
      command: async (args: string[], timeout: number) => {
        expect(timeout).toBeGreaterThan(0);
        expect(timeout).toBeLessThanOrEqual(args.includes("run") || args.includes("rm") ? 45000 : 15000);
        commands.push([...args]);
        if (readFailure && args.includes(readFailure)) throw new Error("private path and password stderr");
        if (args[0] === "context" && args[1] === "show") return ok("desktop-linux");
        if (args[0] === "context") return ok(JSON.stringify(host));
        expect(args.slice(0, 2)).toEqual(["--host", contextHost]);
        if (args.includes("image")) return ok(image);
        if (args.includes("ls")) return absent;
        if (args.includes("run")) return creation();
        if (args.includes("rm")) return removal;
        if (args.includes("inspect")) return ok(JSON.stringify(inspect));
        throw new Error("unexpected command");
      },
      healthyInspect: async (authority: { containerId: string }) => {
        expect(authority.containerId).toBe(containerId);
        return health();
      },
      fileSystem: {
        realpath: (path: string) => path === passwordFile ? canonical : path,
        lstat: (path: string) => ({ dev: 1n, ino: path === passwordFile ? inode : ancestorInode,
          mode: 0o600n, uid: 1n, gid: 1n, size: 32n, nlink: 1n, mtimeNs: 1n, ctimeNs: 1n,
          isFile: () => path === passwordFile, isDirectory: () => path !== passwordFile,
          isSymbolicLink: () => false }),
      },
    };
    return { dependencies, commands, setInspect: (value: typeof inspect) => { inspect = value; },
      getInspect: () => inspect, setAbsent: (value: typeof absent) => { absent = value; },
      setCreation: (value: typeof creation) => { creation = value; },
      setRemoval: (value: typeof removal) => { removal = value; },
      setHealth: (value: typeof health) => { health = value; },
      changeFile: () => { inode++; }, changeAncestor: () => { ancestorInode++; },
      setCanonical: (value: string) => { canonical = value; },
      setHost: (value: string) => { host = value; }, setImage: (value: string) => { image = value; },
      failRead: (value: string) => { readFailure = value; },
      advance: (ms: number) => { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } } };
  }

  it.each(['creation-custody','creation-command','creation-result','health-inspect','secret-custody','secret-mount','container-witness'] as const)('brands only the actual failed acquisition coordinate %s and preserves its error identity',async coordinate=>{const module=await import('../../../scripts/music-uat-database'),f=fixture(),stage=await prepareOwnedUatDatabaseAcquisition(input,f.dependencies);let reads=0;const foreign=new Proxy({stage:'creation-result'},{get(){reads++;throw Error('private getter');}});if(coordinate==='creation-custody')f.changeFile();if(coordinate==='creation-command')f.setCreation(async()=>({status:1,stdout:'',timedOut:false}));if(coordinate==='creation-result')f.setCreation(async()=>ok('invalid'));if(coordinate==='health-inspect')f.setHealth(async()=>{throw foreign;});if(coordinate==='secret-custody')f.setHealth(async()=>{f.changeAncestor();return f.getInspect();});if(coordinate==='secret-mount')f.setInspect({...f.getInspect(),Mounts:[{...f.getInspect().Mounts[0],Source:passwordFile+'-foreign'}]});if(coordinate==='container-witness')f.setInspect({...f.getInspect(),Id:'d'.repeat(64)});const error=await stage.create().catch(value=>value);expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic).toBeTypeOf('function');expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic(error)).toEqual({stage:coordinate});expect(Object.isFrozen(module.extractOwnedUatDatabaseAcquisitionDiagnostic(error))).toBe(true);expect(await stage.create().catch(value=>value)).toBe(error);expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic(foreign)).toBeUndefined();expect(reads).toBe(0);expect(Object.hasOwn(error,'stage')).toBe(false);});
  it('successful staged acquisition exports no coordinate and foreign getter/proxy metadata cannot mint one',async()=>{const module=await import('../../../scripts/music-uat-database'),f=fixture(),stage=await prepareOwnedUatDatabaseAcquisition(input,f.dependencies),owned=await stage.create();expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic).toBeTypeOf('function');expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic(owned)).toBeUndefined();let reads=0;const getter=Object.defineProperty({},'stage',{get(){reads++;throw Error('private');}}),proxy=new Proxy({stage:'secret-mount'},{get(){reads++;throw Error('private');}});for(const value of [getter,proxy,new Error('creation-command'),'secret-mount',null])expect(module.extractOwnedUatDatabaseAcquisitionDiagnostic(value)).toBeUndefined();expect(reads).toBe(0);});
  const mutations = (f: ReturnType<typeof fixture>) => f.commands.filter(a => a.includes("run") || a.includes("rm"));
  it("prepares frozen helper-derived intent without mutation and disposal prevents creation", async () => {
    const f = fixture();
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    expect(stage.intent).toEqual({ ...input, containerName: `explorers-music-uat-db-${runId}`, contextHost, imageId });
    expect(Object.isFrozen(stage.intent)).toBe(true);
    expect(mutations(f)).toEqual([]);
    const dispose = stage.dispose(async () => { throw new Error("unexpected SQL"); });
    expect(stage.dispose(async () => {})).toBe(dispose);
    await dispose;
    await expect(stage.create()).rejects.toThrow(/disposed/);
    expect(mutations(f)).toEqual([]);
  });
  it.each([ok(containerId), ok("garbage"), ok(`${containerId}\n${containerId}`),
    { status: 1, stdout: "", timedOut: false }, { status: 0, stdout: "", timedOut: true }])(
    "refuses every unconfirmed name absence %j", async result => {
      const f = fixture(); f.setAbsent(result);
      await expect(prepareOwnedUatDatabaseAcquisition(input, f.dependencies)).rejects.toThrow();
      expect(mutations(f)).toEqual([]);
    });
  it.each(["runId", "database", "commit", "port", "passwordFile"])("refuses invalid %s", async key => {
    const f = fixture();
    await expect(prepareOwnedUatDatabaseAcquisition({ ...input, [key]: key === "port" ? 1 : "bad" }, f.dependencies)).rejects.toThrow();
    expect(mutations(f)).toEqual([]);
  });
  it("refuses remote context and invalid image without mutation", async () => {
    const remote = fixture(); remote.setHost("tcp://remote.example:2376");
    await expect(prepareOwnedUatDatabaseAcquisition(input, remote.dependencies)).rejects.toThrow();
    expect(mutations(remote)).toEqual([]);
    const image = fixture(); image.setImage("postgres:15-alpine");
    await expect(prepareOwnedUatDatabaseAcquisition(input, image.dependencies)).rejects.toThrow();
    expect(mutations(image)).toEqual([]);
  });
  it("refuses command errors without exposing private diagnostics", async () => {
    const f = fixture(); f.failRead("ls");
    await expect(prepareOwnedUatDatabaseAcquisition(input, f.dependencies)).rejects.toThrow("staged acquisition preparation refused");
    expect(mutations(f)).toEqual([]);
  });
  it("rejects accessor and hidden input authority before reading it", async () => {
    const f = fixture(); let reads = 0;
    const accessor = { ...input };
    Object.defineProperty(accessor, "passwordFile", { enumerable: true, get: () => { reads++; return passwordFile; } });
    await expect(prepareOwnedUatDatabaseAcquisition(accessor, f.dependencies)).rejects.toThrow();
    expect(reads).toBe(0);
    const hidden = { ...input }; Object.defineProperty(hidden, "contextHost", { value: contextHost });
    await expect(prepareOwnedUatDatabaseAcquisition(hidden, f.dependencies)).rejects.toThrow();
    expect(f.commands).toEqual([]);
  });
  it("rejects coercible identity values", async () => {
    const f = fixture();
    await expect(prepareOwnedUatDatabaseAcquisition({ ...input,
      commit: { toString: () => commit } as unknown as string }, f.dependencies)).rejects.toThrow();
    expect(f.commands).toEqual([]);
  });
  async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  it("bounds unsettled create and pending disposal without late revival", async () => {
    const f = fixture(); const command = deferred<ReturnType<typeof ok>>(); f.setCreation(() => command.promise);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    const create = stage.create(); const disposal = stage.dispose(async () => {});
    const createRejected = expect(create).rejects.toThrow(/retained/);
    const disposeRejected = expect(disposal).rejects.toThrow(/retained/);
    await flush(); f.advance(120001); await flush();
    await createRejected; await disposeRejected;
    command.resolve(ok(containerId)); await flush();
    expect(stage.create()).toBe(create); expect(stage.dispose(async () => {})).toBe(disposal);
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("enforces the mutation command ceiling before the whole stage deadline", async () => {
    const f = fixture(); const command = deferred<ReturnType<typeof ok>>(); f.setCreation(() => command.promise);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); const create = stage.create();
    const rejected = expect(create).rejects.toThrow(/retained/);
    await flush(); f.advance(45001); await flush(); await rejected;
    await expect(stage.dispose(async () => {})).rejects.toThrow(/retained/);
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("captures command deadline before invocation advances the clock", async () => {
    const f = fixture();
    f.setCreation(async () => { f.advance(45001); return ok(containerId); });
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await expect(stage.create()).rejects.toThrow(/retained/);
    await expect(stage.dispose(async () => {})).rejects.toThrow(/retained/);
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("observes command rejection even when invocation consumes its deadline", async () => {
    const f = fixture();
    f.setCreation(async () => { f.advance(45001); throw new Error("late private command failure"); });
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await expect(stage.create()).rejects.toThrow(/retained/);
    await expect(stage.dispose(async () => {})).rejects.toThrow(/retained/);
  });
  it("bounds unsettled health and preserves known ID for later creation-only cleanup", async () => {
    const f = fixture(); const health = deferred<ReturnType<typeof f.getInspect>>(); f.setHealth(() => health.promise);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); const create = stage.create();
    const rejected = expect(create).rejects.toThrow(/retained/);
    await flush(); f.advance(120001); await flush(); await rejected;
    await stage.dispose(async () => { throw new Error("unexpected SQL"); });
    health.resolve(f.getInspect()); await flush();
    expect(f.commands.filter(a => a.includes("rm"))).toHaveLength(1);
  });
  it("bounds unsettled DROP and retains without removal", async () => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); await stage.create();
    const drop = deferred<void>(); const disposal = stage.dispose(() => drop.promise);
    const rejected = expect(disposal).rejects.toThrow(/retained/);
    await flush(); f.advance(120001); await flush(); await rejected;
    drop.resolve(); await flush(); expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("pins retained image despite later tag drift", async () => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    f.setImage(`sha256:${"d".repeat(64)}`); await stage.create(); await stage.dispose(async () => {});
    expect(f.commands.find(a => a.includes("run"))!.at(-1)).toBe(imageId);
    expect(f.commands.filter(a => a.includes("image"))).toHaveLength(1);
  });
  it("retains known creation when fresh inspect fails", async () => {
    const f = fixture(); f.setHealth(async () => { throw new Error("failed health"); });
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await expect(stage.create()).rejects.toThrow(); f.failRead("inspect");
    await expect(stage.dispose(async () => {})).rejects.toThrow(/retained/);
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("pins all creation settings and retains the actual ID before blocked health", async () => {
    const f = fixture(); const health = deferred<ReturnType<typeof f.getInspect>>();
    f.setHealth(() => health.promise);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    const created = stage.create(); expect(stage.create()).toBe(created);
    await Promise.resolve(); await Promise.resolve();
    const args = f.commands.find(a => a.includes("run"))!;
    expect(args.at(-1)).toBe(imageId);
    expect(args.filter(a => a === "--label")).toHaveLength(6);
    for (const value of ["127.0.0.1:58543:5432", "POSTGRES_USER=music_migrator", `POSTGRES_DB=${database}`,
      "POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password",
      `type=bind,src=${passwordFile},dst=/run/secrets/music-uat-database-password,readonly`,
      "/var/lib/postgresql/data:rw,noexec,nosuid,size=2147483648",
      `pg_isready -U music_migrator -d ${database} -h 127.0.0.1 -p 5432`]) expect(args).toContain(value);
    expect(args).not.toContain("postgres:15-alpine");
    const disposed = stage.dispose(async () => {}); expect(stage.dispose(async () => {})).toBe(disposed);
    expect(f.commands.some(a => a.includes("rm"))).toBe(false);
    health.reject(new Error("health failed"));
    await expect(created).rejects.toThrow(); await disposed;
    expect(f.commands.find(a => a.includes("rm"))!.at(-1)).toBe(containerId);
  });
  it("waits physical creation settlement before pending disposal", async () => {
    const f = fixture(); const creation = deferred<ReturnType<typeof ok>>();
    f.setCreation(() => creation.promise);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    const create = stage.create(); const disposal = stage.dispose(async () => {});
    let settled = false; void disposal.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false); expect(f.commands.some(a => a.includes("rm"))).toBe(false);
    creation.resolve({ status: 1, stdout: "", timedOut: true });
    await expect(create).rejects.toThrow(); await expect(disposal).rejects.toThrow(/retained/);
  });
  it.each([ok("bad-id"), { status: 1, stdout: containerId, timedOut: false },
    { status: 0, stdout: containerId, timedOut: true }])("retains uncertain create %j", async result => {
    const f = fixture(); f.setCreation(async () => result);
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await expect(stage.create()).rejects.toThrow(); f.setAbsent(ok(containerId));
    await expect(stage.dispose(async () => { throw new Error("unexpected SQL"); })).rejects.toThrow(/retained/);
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it("cleans known-created stopped failure without SQL", async () => {
    const f = fixture(); f.setHealth(async () => { throw new Error("health failed"); });
    const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await expect(stage.create()).rejects.toThrow();
    f.setInspect({ ...f.getInspect(), State: { Running: false, Health: { Status: "unhealthy" } } });
    await stage.dispose(async () => { throw new Error("unexpected SQL"); });
    expect(f.commands.filter(a => a.includes("rm"))).toHaveLength(1);
  });
  it.each(["id", "name", "image", "configImage", "labels", "port", "tmpfs", "source", "rw", "duplicate", "file", "ancestor", "canonical"])(
    "retains known-created cleanup on fresh %s mismatch", async kind => {
      const f = fixture(); f.setHealth(async () => { throw new Error("health failed"); });
      const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
      await expect(stage.create()).rejects.toThrow();
      const value = f.getInspect();
      if (kind === "id") value.Id = "d".repeat(64);
      if (kind === "name") value.Name += "-other";
      if (kind === "image") value.Image = `sha256:${"d".repeat(64)}`;
      if (kind === "configImage") value.Config.Image = "postgres:15-alpine";
      if (kind === "labels") value.Config.Labels["com.explorers.music.commit"] = "d".repeat(40);
      if (kind === "port") value.HostConfig.PortBindings["5432/tcp"][0].HostIp = "0.0.0.0";
      if (kind === "tmpfs") value.HostConfig.Tmpfs["/var/lib/postgresql/data"] = "rw,size=1";
      if (kind === "source") value.Mounts[0].Source = passwordFile.toLowerCase();
      if (kind === "rw") value.Mounts[0].RW = true;
      if (kind === "duplicate") value.Mounts.push({ ...value.Mounts[0] });
      if (kind === "file") f.changeFile(); if (kind === "ancestor") f.changeAncestor();
      if (kind === "canonical") f.setCanonical(passwordFile.toLowerCase());
      await expect(stage.dispose(async () => {})).rejects.toThrow();
      expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
    });
  it("preserves DROP failure after freshly attested exact removal", async () => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies);
    await stage.create();
    await expect(stage.dispose(async () => { throw new Error("private SQL password"); })).rejects.toThrow(/DROP failed/);
    expect(f.commands.filter(a => a.includes("inspect") && !a.includes("image") && a[0] !== "context")).toHaveLength(2);
    expect(f.commands.filter(a => a.includes("rm"))).toHaveLength(1);
    expect(f.commands.at(-1)).toEqual(["--host", contextHost, "container", "ls", "--all", "--no-trunc", "--filter", `id=${containerId}`, "--format", "{{.ID}}"]);
  });
  it("refuses removal after DROP changes custody", async () => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); await stage.create();
    await expect(stage.dispose(async () => { f.changeAncestor(); })).rejects.toThrow();
    expect(f.commands.filter(a => a.includes("rm"))).toEqual([]);
  });
  it.each([ok(containerId), ok("garbage"), { status: 1, stdout: "", timedOut: false },
    { status: 0, stdout: "", timedOut: true }])("requires confirmed post-removal absence %j", async result => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); await stage.create();
    f.setAbsent(result); await expect(stage.dispose(async () => {})).rejects.toThrow();
  });
  it("never upgrades removal timeout using a later empty list", async () => {
    const f = fixture(); const stage = await prepareOwnedUatDatabaseAcquisition(input, f.dependencies); await stage.create();
    f.setRemoval({ status: 0, stdout: "", timedOut: true });
    await expect(stage.dispose(async () => {})).rejects.toThrow();
    expect(f.commands.filter(a => a.includes("ls"))).toHaveLength(1);
  });
  it.each([String.raw`c:\Users\TK\fixture\current-secret`, "C:/Users/TK/fixture/current-secret",
    String.raw`C:\Users\TK\fixture\..\current-secret`, String.raw`C:\Users\TK\fixture\\current-secret`,
    String.raw`\\host\secret`, String.raw`C:\Users\TK\fixture\current-secret:stream`])(
    "refuses unknown canonical custody spelling %s", async path => {
      const f = fixture(); await expect(prepareOwnedUatDatabaseAcquisition({ ...input, passwordFile: path }, f.dependencies)).rejects.toThrow();
    });
});

describe("owned Task-4 UAT database lane", () => {
  it("requires one complete unique fixture-owned database authority tuple", () => {
    expect(parseUatDatabaseAuthority({})).toBeUndefined();
    expect(parseUatDatabaseAuthority(authorityEnvironment())).toEqual({
      runId, database, port: 58543, containerId, commit,
    });
    expect(() => parseUatDatabaseAuthority({ MUSIC_UAT_DATABASE_ACK }))
      .toThrow(/exact acknowledgement.*run ID.*database.*port.*container ID.*commit/i);
    expect(() => parseUatDatabaseAuthority(authorityEnvironment({
      MUSIC_UAT_DATABASE_NAME: "music_fixture",
    }))).toThrow(/unique database/i);
    expect(() => parseUatDatabaseAuthority(authorityEnvironment({
      MUSIC_UAT_DATABASE_NAME: `music_uat_${"2".repeat(32)}`,
    }))).toThrow(/run ID/i);
    for (const hostile of [
      { DOCKER_HOST: "tcp://production.example:2376" },
      { DOCKER_CONTEXT: "production" },
      { DATABASE_URL: "postgresql://production.example/music" },
      { GATE_PROD: "1" },
    ]) {
      expect(() => parseUatDatabaseAuthority(authorityEnvironment(hostile))).toThrow(/ambient.*forbidden/i);
    }
  });

  it("attests exact local fixture labels, identity, loopback binding, secret mount, and tmpfs", () => {
    const authority = parseUatDatabaseAuthority(authorityEnvironment())!;
    expect(validateUatDatabaseInspect(authority, {
      contextHost, imageId, inspect: ownedInspect(),
    })).toEqual(expect.objectContaining({ database, imageId }));
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost: "tcp://production.example:2376", imageId, inspect: ownedInspect(),
    })).toThrow(/local Docker/i);
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost, imageId,
      inspect: { ...ownedInspect(), Config: { ...ownedInspect().Config, Labels: {} } },
    })).toThrow(/exact fixture-owned/i);
    expect(() => validateUatDatabaseInspect(authority, {
      contextHost, imageId,
      inspect: { ...ownedInspect(), HostConfig: { ...ownedInspect().HostConfig, Tmpfs: {} } },
    })).toThrow(/exact fixture-owned/i);
  });

  it("requires the exact bounded 2GiB migration-suite tmpfs capacity", () => {
    const authority = parseUatDatabaseAuthority(authorityEnvironment())!;
    for (const options of ["rw,noexec,nosuid,size=536870912", "rw,noexec,nosuid,size=4294967296", "rw,nosuid,size=2147483648", "rw,noexec,nosuid,size=2147483648,size=4294967296"]) {
      const inspect = ownedInspect(); inspect.HostConfig!.Tmpfs!["/var/lib/postgresql/data"] = options;
      expect(() => validateUatDatabaseInspect(authority, { contextHost, imageId, inspect })).toThrow(/exact fixture-owned/i);
    }
  });

  it("creates the unique database without an argument secret and always drops/removes the exact owner", async () => {
    const passwordFile = "C:\\protected\\music-uat-db-password";
    const mutations: string[][] = [];
    const drops: string[] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      if (args.includes("inspect") && args.includes(containerId)) return JSON.stringify(ownedInspect());
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    const authority = await startOwnedUatDatabase({
      runId, database, commit, port: 58543, passwordFile,
    }, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return containerId; },
      healthyInspect: async () => ownedInspect(),
    });
    expect(authority).toEqual({
      runId, database, port: 58543, containerId, commit, imageId, contextHost, owned: true,
    });
    const creation = mutations[0]!;
    expect(creation).toEqual(expect.arrayContaining([
      "--rm",
      "--publish", "127.0.0.1:58543:5432",
      "--env", `POSTGRES_DB=${database}`,
      "--env", "POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=2147483648",
    ]));
    expect(creation.join(" ")).toContain("com.explorers.music.fixture=true");
    expect(creation.join(" ")).toContain(`com.explorers.music.uat-run=${runId}`);
    expect(creation.join(" ")).toContain(passwordFile);
    expect(creation.join(" ")).not.toContain("known-password-value");

    await stopOwnedUatDatabase(authority, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return ""; },
      dropDatabase: async (owned) => { drops.push(owned.database); },
    });
    expect(drops).toEqual([database]);
    expect(mutations.at(-1)).toEqual(["--host", contextHost, "rm", "--force", "--volumes", containerId]);
  });

  it("releases the exact owned database once when the repository child fails", async () => {
    const authority = { owned: true as const, containerId };
    const events: string[] = [];
    await expect(withOwnedUatDatabase({
      acquire: async () => { events.push("acquire"); return authority; },
      run: async (value) => { events.push(`run:${value.containerId}`); throw new Error("repository lane red"); },
      release: async (value) => { events.push(`release:${value.containerId}`); },
    })).rejects.toThrow("repository lane red");
    expect(events).toEqual(["acquire", `run:${containerId}`, `release:${containerId}`]);
  });

  it("removes the exact container even when SQL drop reports failure", async () => {
    const mutations: string[][] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      if (args.includes("inspect") && args.includes(containerId)) return JSON.stringify(ownedInspect());
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    const authority = {
      runId, database, port: 58543, containerId, commit, imageId, contextHost, owned: true as const,
    };
    await expect(stopOwnedUatDatabase(authority, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return ""; },
      dropDatabase: async () => { throw new Error("injected drop failure"); },
    })).rejects.toThrow(/database drop failed/i);
    expect(mutations).toEqual([
      ["--host", contextHost, "rm", "--force", "--volumes", containerId],
    ]);
  });

  it("removes the created exact ID when startup attestation fails", async () => {
    const mutations: string[][] = [];
    const dockerRead = (args: string[]) => {
      if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
      if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(contextHost);
      if (args.includes("image")) return `${imageId}\n`;
      throw new Error(`unexpected read: ${args.join(" ")}`);
    };
    await expect(startOwnedUatDatabase({
      runId, database, commit, port: 58543, passwordFile: "C:\\protected\\music-uat-db-password",
    }, {
      dockerRead,
      dockerOptionalRead: () => undefined,
      dockerRun: (args) => { mutations.push(args); return containerId; },
      healthyInspect: async () => ({
        ...ownedInspect(),
        Config: { ...ownedInspect().Config, Labels: {} },
      }),
    })).rejects.toThrow(/exact fixture-owned/i);
    expect(mutations.at(-1)).toEqual([
      "--host", contextHost, "rm", "--force", "--volumes", containerId,
    ]);
  });

  it("allows integration setup to reach only the tuple-bound unique database", () => {
    const environment = authorityEnvironment();
    expect(validateIntegrationDatabaseTarget(
      `postgresql://music_migrator:secret@127.0.0.1:58543/${database}`,
      environment,
    ).pathname).toBe(`/${database}`);
    expect(() => validateIntegrationDatabaseTarget(
      "postgresql://music_migrator:secret@127.0.0.1:58543/music_fixture",
      environment,
    )).toThrow(/exact disposable/i);
    expect(() => validateIntegrationDatabaseTarget(
      `postgresql://music_migrator:secret@localhost:58543/${database}`,
      environment,
    )).toThrow(/exact disposable/i);
  });

  it("publishes one narrow root command and a frozen repository integration allowlist", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const tunesPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "tunes/package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.scripts["music:test:uat-database"])
      .toBe("npm --prefix tunes run music:test:uat-database --");
    expect(tunesPackage.scripts["music:test:uat-database"])
      .toBe("tsx scripts/music-uat-database.ts");
    const runnerSource = readFileSync(resolve(repositoryRoot, "tunes/scripts/music-uat-database.ts"), "utf8");
    expect(runnerSource).toContain("prepareFixtureMusicTokenSecret");
    expect(runnerSource).toContain("readSecureMusicSecretFile");
    expect(runnerSource).toContain("cleanupFixtureMusicTokenSecret");
    expect(runnerSource).toContain('MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST: "1"');
    expect(runnerSource).toContain('MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST: "1"');
    expect(runnerSource).not.toContain("writeFileSync(passwordFile");
    expect(MUSIC_UAT_DATABASE_TEST_FILES).toEqual([
      "server/test/explorers-lifecycle.integration.test.ts",
      "server/test/account-recovery.test.ts",
      "server/test/explorers-recovery.integration.test.ts",
      "server/test/explorers-recovery-callback.integration.test.ts",
      "server/test/explorers-profile.integration.test.ts",
      "server/test/explorers-media.integration.test.ts",
      "server/test/canonical-music-identity.integration.test.ts",
      "server/test/canonical-music-public-lifecycle.integration.test.ts",
      "server/test/explorers/collectionCoverVisibility.integration.test.ts",
      "server/test/explorers/guideMediaVisibility.integration.test.ts",
      "server/test/explorers/placeLinks.integration.test.ts",
      "server/test/migrations/music-migration.integration.test.ts",
      "server/test/music-credential.integration.test.ts",
      "server/test/music-domain-repository.integration.test.ts",
      "server/test/music-identity-projection.integration.test.ts",
      "server/test/music-publication-operation.integration.test.ts",
      "server/test/music-runtime-role.integration.test.ts",
      "server/test/musicLifecycle.integration.test.ts",
      "server/test/musicReconciler.integration.test.ts",
      "server/test/reconciliationRepository.integration.test.ts",
      "server/test/load/music-load-postgres.integration.test.ts",
      "server/test/music-e2e-state-restore.integration.test.ts",
      "server/test/music-e2e-initial-capture.integration.test.ts",
      "server/test/music-e2e-identity-count-adapter.integration.test.ts",
      "server/test/explorers-recommendation-api.integration.test.ts",
    ]);
    const restoreIntegration = readFileSync(resolve(
      repositoryRoot, "tunes/server/test/music-e2e-state-restore.integration.test.ts",
    ), "utf8");
    expect(restoreIntegration).toContain("MUSIC_C11_STATE_RESTORE_POSTGRES_TEST");
    expect(restoreIntegration).toContain("runMusicFixtureRestoreTransaction");
    expect(restoreIntegration).toContain("replay-failed-rolled-back");
    const captureIntegration = readFileSync(resolve(
      repositoryRoot, "tunes/server/test/music-e2e-initial-capture.integration.test.ts",
    ), "utf8");
    expect(captureIntegration).toContain("MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST");
    expect(captureIntegration).toContain("captureMusicFixtureState");
    expect(captureIntegration).toContain("requestMusicFixturePrivateProfileSnapshot");
    expect(captureIntegration).toMatch(/127\.0\.0\.1/);
    expect(captureIntegration).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write/);

    const adapterIntegrationPath = resolve(
      repositoryRoot, "tunes/server/test/music-e2e-identity-count-adapter.integration.test.ts",
    );
    expect(existsSync(adapterIntegrationPath)).toBe(true);
    if (existsSync(adapterIntegrationPath)) {
      const adapterIntegration = readFileSync(adapterIntegrationPath, "utf8");
      expect(adapterIntegration).toContain("MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST");
      expect(adapterIntegration).toContain("runMusicFixtureIdentityCountPsql");
      expect(adapterIntegration).toContain("attestUatDatabaseAuthority");
      expect(adapterIntegration).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write/);
    }
  });

  it("scopes the verified ten-second timeout to the exact owned database child command", () => {
    expect(buildUatDatabaseTestCommand("C:\\node\\npm-cli.js", "C:\\owned\\vitest.json")).toEqual({
      file: process.execPath,
      args: [
        "C:\\node\\npm-cli.js", "run", "test:integration", "--",
        ...MUSIC_UAT_DATABASE_TEST_FILES,
        "--maxWorkers=1", "--fileParallelism=false", "--testTimeout=10000",
        "--reporter=default", "--reporter=json", "--outputFile.json=C:\\owned\\vitest.json",
      ],
    });
  });

  it("releases owned authority before constructing and writing successful UAT evidence", async () => {
    const events: string[] = [];
    const vitestRaw = JSON.stringify({ success: true });
    const written: unknown[] = [];
    const result = await executeOwnedUatEvidence({
      acquire: async () => { events.push("acquire"); return { id: "owned" }; },
      run: async () => { events.push("run"); return { exitCode: 0, signal: null }; },
      release: async () => { events.push("release"); },
      readRaw: () => { events.push("read"); return vitestRaw; },
      buildEnvelope: (input) => { events.push("build"); return { ...input, ok: true }; },
      writeEnvelope: async (envelope) => { events.push("write"); written.push(envelope); },
    });
    expect(events).toEqual(["acquire", "run", "release", "read", "build", "write"]);
    expect(result).toEqual(written[0]);
  });

  it("does not construct or write successful UAT evidence when cleanup fails", async () => {
    const events: string[] = [];
    await expect(executeOwnedUatEvidence({
      acquire: async () => ({ id: "owned" }),
      run: async () => ({ exitCode: 0, signal: null }),
      release: async () => { events.push("release"); throw new Error("cleanup failed"); },
      readRaw: () => { events.push("read"); return "{}"; },
      buildEnvelope: () => { events.push("build"); return { ok: true }; },
      writeEnvelope: async () => { events.push("write"); },
    })).rejects.toThrow("cleanup failed");
    expect(events).toEqual(["release"]);
  });

  it("redacts hostile database and configured secrets before child output reaches writers", async () => {
    const hostilePassword = "hostile:/@output-password%9f1d";
    const configuredSecret = "configured-session-secret-4e2a";
    const target = new URL(`postgresql://music_migrator@127.0.0.1:58543/${database}`);
    target.password = hostilePassword;
    const databaseUrl = target.toString();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const source = [
      `process.stdout.write(${JSON.stringify("useful stdout before ")});`,
      `process.stdout.write(${JSON.stringify(hostilePassword.slice(0, 11))});`,
      `process.stdout.write(${JSON.stringify(`${hostilePassword.slice(11)} useful stdout after\n`)});`,
      `process.stderr.write(${JSON.stringify(`assertion mismatch DATABASE_URL_TEST=${databaseUrl}\n`)});`,
      `process.stderr.write(${JSON.stringify(`SESSION_SECRET=${configuredSecret}\n`)});`,
      "process.exitCode = 1;",
    ].join("");

    const result = await runUatDatabaseTestChild(
      { file: process.execPath, args: ["-e", source] },
      { DATABASE_URL_TEST: databaseUrl, SESSION_SECRET: configuredSecret },
      {
        setChild: () => undefined,
        exactSensitiveValues: [hostilePassword],
        writeStdout: (value) => { stdout.push(value); },
        writeStderr: (value) => { stderr.push(value); },
      },
    );

    const retained = [...stdout, ...stderr].join("");
    expect(result).toEqual({ exitCode: 1, signal: null });
    expect(retained).toContain("useful stdout before");
    expect(retained).toContain("useful stdout after");
    expect(retained).toContain("assertion mismatch");
    expect(retained).not.toContain(hostilePassword);
    expect(retained).not.toContain(encodeURIComponent(hostilePassword));
    expect(retained).not.toContain(databaseUrl);
    expect(retained).not.toContain(configuredSecret);
  });

  it("discards an independently overflowing child stream without emitting its raw prefix", async () => {
    const hostilePrefix = "overflow-secret-prefix-18d2";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const source = [
      `process.stdout.write(${JSON.stringify(hostilePrefix)});`,
      `process.stdout.write("x".repeat(${MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES}));`,
      `process.stderr.write(${JSON.stringify("useful bounded stderr\n")});`,
    ].join("");

    const result = await runUatDatabaseTestChild(
      { file: process.execPath, args: ["-e", source] },
      { HOSTILE_SECRET: hostilePrefix },
      {
        setChild: () => undefined,
        writeStdout: (value) => { stdout.push(value); },
        writeStderr: (value) => { stderr.push(value); },
      },
    );

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(stdout.join("")).toContain("stdout discarded");
    expect(stdout.join("")).not.toContain(hostilePrefix);
    expect(stdout.join("")).not.toContain("xxxxx");
    expect(stderr.join("")).toBe("useful bounded stderr\n");
  });

  it("binds the migration suite admin lifecycle to the validated owned target and tolerates setup refusal", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/migrations/music-migration.integration.test.ts",
    ), "utf8");
    expect(source).toContain("validateIntegrationDatabaseTarget(adminUrl)");
    expect(source).not.toContain("127.0.0.1:55432/music_fixture");
    expect(source).not.toContain('pathname: "/music_fixture"');
    expect(source).toMatch(/afterAll\(async \(\) => \{\s+if \(!admin\) return;[\s\S]+await admin\.end\(\)/);
  });

  it("derives the runtime-role migration count from the checked-in migration inventory", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("EXPECTED_MUSIC_MIGRATION_CHAIN.length");
    expect(source).not.toMatch(/music_schema_migrations[\s\S]{0,160}\.toBe\(20\)/);
  });

  it("uses a file-backed public ID key in the live runtime-role fixture and cleans its protected root", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("writeFileSync(publicIdHmacPath");
    expect(source).toContain("chmodSync(publicIdHmacPath, 0o600)");
    expect(source).toContain("delete values.MUSIC_PUBLIC_ID_HMAC_KEY");
    expect(source).toContain("MUSIC_PUBLIC_ID_HMAC_KEY_FILE: publicIdHmacPath");
    expect(source).toMatch(/afterAll\(async \(\) => \{[\s\S]+finally \{\s+rmSync\(runtimeSecretRoot, \{ recursive: true, force: true \}\)/);
  });

  it("keeps live runtime-role startup on the owned database socket after file-key validation", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const source = readFileSync(resolve(
      repositoryRoot,
      "tunes/server/test/music-runtime-role.integration.test.ts",
    ), "utf8");
    expect(source).toContain("const databaseAuthority = new URL(ownerTarget)");
    expect(source).toContain("MUSIC_DATABASE_HOST: databaseAuthority.hostname");
    expect(source).toContain("MUSIC_DATABASE_PORT: databaseAuthority.port");
  });
});

describe('readonly staged owned database attestation',()=>{
 const passwordFile=String.raw`C:\Users\TK\fixture\current-secret`,authority={owned:true as const,runId,database,commit,containerId,port:58543,imageId,contextHost};
 function fixture(){let inspect={...ownedInspect(),Config:{...ownedInspect().Config,Image:imageId},Mounts:[{...ownedInspect().Mounts[0],Source:passwordFile}]},host=contextHost,image=imageId,inode=1n,ancestor=2n;const reads:string[][]=[];const dependencies={dockerRead:(args:string[])=>{reads.push([...args]);if(args[0]==='context'&&args[1]==='show')return'desktop-linux';if(args[0]==='context')return JSON.stringify(host);if(args.includes('image'))return image;return JSON.stringify(inspect);},fileSystem:{realpath:(path:string)=>path,lstat:(path:string)=>({dev:1n,ino:path===passwordFile?inode:ancestor,mode:0o600n,uid:1n,gid:1n,size:32n,nlink:1n,mtimeNs:1n,ctimeNs:1n,isFile:()=>path===passwordFile,isDirectory:()=>path!==passwordFile,isSymbolicLink:()=>false})}};return{dependencies,reads,get inspect(){return inspect;},set inspect(value){inspect=value;},set host(value:string){host=value;},set image(value:string){image=value;},mutateSecret(){inode++;},mutateAncestor(){ancestor++;}};}
 it('accepts the actual pinned staged image while legacy tagged attestation continues refusing it',async()=>{const module=await import('../../../scripts/music-uat-database'),f=fixture();expect(()=>module.attestUatDatabaseAuthority(authorityEnvironment(),commit,{dockerRead:f.dependencies.dockerRead})).toThrow();expect(module.attestOwnedStagedUatDatabaseAuthority).toBeTypeOf('function');expect(module.attestOwnedStagedUatDatabaseAuthority(authority,passwordFile,f.dependencies)).toEqual(authority);expect(f.reads.every(args=>!args.some(arg=>['run','rm','create','start','stop'].includes(arg)))).toBe(true);expect(f.reads.some(args=>args.includes('image')&&args.at(-1)===imageId)).toBe(true);});
 it.each(['cid','commit','image','context','mount','health'] as const)('refuses foreign %s without mutation',async mode=>{const module=await import('../../../scripts/music-uat-database'),f=fixture();if(mode==='cid')f.inspect={...f.inspect,Id:'d'.repeat(64)};if(mode==='commit')f.inspect.Config.Labels['com.explorers.music.commit']='d'.repeat(40);if(mode==='image')f.image='sha256:'+'d'.repeat(64);if(mode==='context')f.host='npipe:////./pipe/docker_engine';if(mode==='mount')f.inspect.Mounts[0].Source=passwordFile+'-foreign';if(mode==='health')f.inspect.State.Health.Status='unhealthy';expect(()=>module.attestOwnedStagedUatDatabaseAuthority(authority,passwordFile,f.dependencies)).toThrow();});
 it.each(['secret','ancestor'] as const)('refuses %s identity mutation during readonly Docker inspection',async mode=>{const module=await import('../../../scripts/music-uat-database'),f=fixture(),read=f.dependencies.dockerRead;f.dependencies.dockerRead=args=>{const result=read(args);if(args.includes('image'))mode==='secret'?f.mutateSecret():f.mutateAncestor();return result;};expect(()=>module.attestOwnedStagedUatDatabaseAuthority(authority,passwordFile,f.dependencies)).toThrow();});
 it('refuses proxy/getter/extra authority and partial adapters before reading them or using native effects',async()=>{const module=await import('../../../scripts/music-uat-database'),f=fixture();let reads=0;const proxy=new Proxy(authority,{ownKeys(){reads++;throw Error('private');}}),getter=Object.defineProperty({...authority},'containerId',{enumerable:true,get(){reads++;throw Error('private');}});for(const input of [proxy,getter,{...authority,extra:true},{...authority,owned:false}])expect(()=>module.attestOwnedStagedUatDatabaseAuthority(input as any,passwordFile,f.dependencies)).toThrow();for(const deps of [{dockerRead:f.dependencies.dockerRead},{fileSystem:f.dependencies.fileSystem},{...f.dependencies,command:()=>{throw Error('mutation');}}])expect(()=>module.attestOwnedStagedUatDatabaseAuthority(authority,passwordFile,deps as any)).toThrow();expect(reads).toBe(0);expect(f.reads).toHaveLength(0);});
});
