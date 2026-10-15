import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chmod, link, lstat, mkdir, mkdtemp as nodeMkdtemp, open, realpath, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HttpMusicReconciliationSource,
  assertMusicReconciliationResume,
  formatMusicReconciliationReport,
  interruptMusicReconciliationCheckpoint,
  parseWindowsCheckpointSecurityOutput,
  readMusicReconciliationCheckpoint,
  reconcileMusicIdentities,
  writeMusicReconciliationCheckpoint,
  type MusicReconciliationCheckpoint,
  type MusicReconciliationResumeContext,
} from "../commands/reconcileMusicIdentities";
import {
  STRAPI_RECONCILIATION_SCHEMA_VERSION,
  type MusicReconciliationReport,
  type ReconciliationSourceMetadata,
} from "../services/musicReconciler";

const checkpointFilesystemTimeoutMs = process.platform === "win32" ? 10_000 : 5_000;

const windowsUntrustedWriterSid = process.platform === "win32"
  ? execFileSync("whoami.exe", ["/groups", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .split(/\r?\n/)
    .map((line) => line.match(/^[^,]*,[^,]*,"([^"]+)","([^"]*)"$/))
    .find((match) => match?.[1]
      && !["S-1-5-18", "S-1-5-32-544", "S-1-1-0", "S-1-5-4", "S-1-5-7", "S-1-5-11", "S-1-5-32-545", "S-1-5-32-546", "S-1-15-2-1"].includes(match[1])
      && !match[2]?.includes("deny only")
      && !match[1].startsWith("S-1-16-"))?.[1]
  : undefined;

const windowsEffectiveUserSid = process.platform === "win32"
  ? execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .match(/,"([^"]+)"\s*$/)?.[1]
  : undefined;

async function mkdtemp(prefix: string): Promise<string> {
  const directory = await nodeMkdtemp(prefix);
  if (process.platform === "win32") {
    if (!windowsEffectiveUserSid) throw new Error("Windows test runner SID is unavailable");
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r",
      `*${windowsEffectiveUserSid}:(OI)(CI)(F)`, "*S-1-5-18:(OI)(CI)(F)", "*S-1-5-32-544:(OI)(CI)(F)"],
    { windowsHide: true });
  }
  return directory;
}

const source: ReconciliationSourceMetadata = {
  schemaVersion: STRAPI_RECONCILIATION_SCHEMA_VERSION,
  sourceSnapshot: "snapshot-1",
  sourceChecksum: "a".repeat(64),
  total: 2,
  pageCount: 1,
};
const context: MusicReconciliationResumeContext = {
  commit: "a".repeat(40),
  fixtureVersion: "1",
  fixtureSchemaVersion: "strapi-identity-fixture/v1",
  environment: "fixture",
  environmentFingerprint: "b".repeat(64),
  gateValues: { MUSIC_RECONCILIATION_ENABLED: "false", MUSIC_RECONCILIATION_MAX_ROWS: "0" },
  thresholds: {
    pageSize: 100,
    maxRows: 1_000,
    batchSize: 100,
    maxChangeAbsolute: 2,
    maxChangePercent: 1,
    maxPages: 1_000,
    scanTimeoutMs: 1_800_000,
    requestTimeoutMs: 120_000,
    maxResponseBytes: 16 * 1024 * 1024,
    maxCanonicalBytes: 16 * 1024 * 1024,
    databaseLockTimeoutMs: 5_000,
    databaseStatementTimeoutMs: 120_000,
    databaseIdleTransactionTimeoutMs: 30_000,
  },
};

function checkpoint(overrides: Partial<MusicReconciliationCheckpoint> = {}): MusicReconciliationCheckpoint {
  return {
    schemaVersion: "music-reconciliation-checkpoint/v1",
    state: "reviewed",
    runId: "run-1",
    scanNonce: "1".repeat(64),
    ...context,
    source,
    nextPage: 2,
    review: { scanNonce: "1".repeat(64), source, planFingerprint: "c".repeat(64), approvalToken: "d".repeat(64) },
    report: {
      schemaVersion: "music-reconciliation/v1",
      runId: "run-1",
      scanNonce: "1".repeat(64),
      status: "success",
      mode: "dry-run",
      source,
      local: { total: 2, eligible: 2 },
      changes: {
        matched: 2, missing: 0, firstMisses: 0, secondMisses: 0,
        projectedUpdates: 0, proposedChangePercent: 0, suspended: 0, tombstoneConflicts: 0, applied: false,
      },
      thresholds: { maxChangeAbsolute: 2, maxChangePercent: 1 },
      metrics: { pages: 1, databaseBatches: 1, durationMs: 5 },
      anomalies: [],
      planFingerprint: "c".repeat(64),
      approvalToken: "d".repeat(64),
    },
    ...overrides,
  };
}

describe("HttpMusicReconciliationSource", () => {
  it("uses the explicit stable paged read-only contract without leaking its token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [], meta: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = new HttpMusicReconciliationSource({
      baseUrl: "https://strapi.example.test/root/",
      serviceToken: "read-only-secret",
      timeoutMs: 1_000,
      maxResponseBytes: 4_096,
      fetchImpl,
    });

    await client.fetchPage({ page: 2, pageSize: 100, order: "documentId:asc", sourceSnapshot: "snap 1" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://strapi.example.test/api/music-identities?pagination%5Bpage%5D=2&pagination%5BpageSize%5D=100&sort=documentId%3Aasc&sourceSnapshot=snap+1");
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { authorization: "Bearer read-only-secret", accept: "application/json" } });
    expect(JSON.stringify({ url, init }).replaceAll("read-only-secret", "[secret]")).not.toContain("read-only-secret");
  });

  it.each([
    ["non-success", new Response("no", { status: 503, headers: { "content-type": "application/json" } })],
    ["non-json", new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })],
    ["oversized", new Response(JSON.stringify({ value: "x".repeat(128) }), { status: 200, headers: { "content-type": "application/json" } })],
    ["malformed", new Response("{", { status: 200, headers: { "content-type": "application/json" } })],
    ["empty", new Response(null, { status: 200, headers: { "content-type": "application/json" } })],
  ])("fails closed for a %s upstream response", async (_name, response) => {
    const client = new HttpMusicReconciliationSource({
      baseUrl: "https://strapi.example.test",
      serviceToken: "secret",
      timeoutMs: 100,
      maxResponseBytes: 64,
      fetchImpl: vi.fn(async () => response),
    });
    await expect(client.fetchPage({ page: 1, pageSize: 1, order: "documentId:asc" })).rejects.toThrow();
  });

  it("validates constructor bounds and advertised response length", async () => {
    const valid = { baseUrl: "https://strapi.example.test", serviceToken: "secret", timeoutMs: 100, maxResponseBytes: 64 };
    for (const options of [
      { ...valid, serviceToken: "" },
      { ...valid, serviceToken: "x".repeat(4_097) },
      { ...valid, timeoutMs: 0 },
      { ...valid, timeoutMs: 120_001 },
      { ...valid, timeoutMs: 1.5 },
      { ...valid, maxResponseBytes: 0 },
      { ...valid, maxResponseBytes: 16 * 1024 * 1024 + 1 },
      { ...valid, maxResponseBytes: 1.5 },
    ]) expect(() => new HttpMusicReconciliationSource(options)).toThrow();

    const client = new HttpMusicReconciliationSource({
      ...valid,
      fetchImpl: vi.fn(async () => new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "1000" },
      })),
    });
    await expect(client.fetchPage({ page: 1, pageSize: 1, order: "documentId:asc" })).rejects.toThrow(/size limit/i);
  });

  it("uses the platform fetch only when no transport is injected", async () => {
    const original = globalThis.fetch;
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const client = new HttpMusicReconciliationSource({
        baseUrl: "https://strapi.example.test", serviceToken: "secret", timeoutMs: 100, maxResponseBytes: 64,
      });
      await expect(client.fetchPage({ page: 1, pageSize: 1, order: "documentId:asc" })).resolves.toEqual({});
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.stubGlobal("fetch", original);
    }
  });

  it("cancels an unadvertised response stream as soon as the byte bound is crossed", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40));
        controller.enqueue(new Uint8Array(40));
      },
      cancel() { cancelled = true; },
    });
    const client = new HttpMusicReconciliationSource({
      baseUrl: "https://strapi.example.test", serviceToken: "secret", timeoutMs: 100, maxResponseBytes: 64,
      fetchImpl: vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } })),
    });
    await expect(client.fetchPage({ page: 1, pageSize: 1, order: "documentId:asc" })).rejects.toThrow(/size limit/i);
    expect(cancelled).toBe(true);
  });
});

describe("music reconciliation checkpoints", () => {
  it("writes atomically with owner-only permissions and contains no identity rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());

    expect(await readMusicReconciliationCheckpoint(path)).toEqual(checkpoint());
    const contents = readFileSync(path, "utf8");
    expect(contents).not.toContain("identities");
    expect(contents).not.toContain("email");
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  }, checkpointFilesystemTimeoutMs);

  it("creates a missing owner-only checkpoint directory without following links", async () => {
    const root = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-create-"));
    const path = join(root, "new", "nested", "checkpoint.json");
    try {
      await writeMusicReconciliationCheckpoint(path, checkpoint());
      await expect(readMusicReconciliationCheckpoint(path)).resolves.toEqual(checkpoint());
      if (process.platform !== "win32") {
        expect((await stat(join(root, "new"))).mode & 0o777).toBe(0o700);
        expect((await stat(join(root, "new", "nested"))).mode & 0o777).toBe(0o700);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a checkpoint reached through a symlink or junction ancestor", async () => {
    const root = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-root-"));
    const external = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-external-"));
    const linkedParent = join(root, "linked-parent");
    try {
      await symlink(external, linkedParent, process.platform === "win32" ? "junction" : "dir");
      await expect(writeMusicReconciliationCheckpoint(join(linkedParent, "checkpoint.json"), checkpoint()))
        .rejects.toThrow(/ancestor|directory|link|secure|checkpoint/i);
      expect(await readdir(external)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it("rejects a multi-link checkpoint as resume evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-hardlink-"));
    const path = join(directory, "checkpoint.json");
    const alias = join(directory, "checkpoint-alias.json");
    try {
      await writeMusicReconciliationCheckpoint(path, checkpoint());
      await link(path, alias);
      await expect(readMusicReconciliationCheckpoint(alias)).rejects.toThrow(/link|invalid|secure/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("descriptor-binds a checkpoint read against pathname replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-race-"));
    const path = join(directory, "checkpoint.json");
    const replacement = join(directory, "replacement.json");
    const original = join(directory, "original.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    await writeMusicReconciliationCheckpoint(replacement, checkpoint({ runId: "replacement-run", report: undefined, review: undefined, state: "blocked" }));
    let swapped = false;
    try {
      const attempt = Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        platform: process.platform,
        effectiveUserId: process.geteuid?.(),
        fileSystem: {
          lstat: (target: string) => lstat(target, { bigint: true }),
          realpath,
          open: async (target: string, flags: number) => {
            if (target === path) {
              await rename(path, original);
              await rename(replacement, path);
              swapped = true;
            }
            return open(target, flags);
          },
        },
      }]);
      await expect(attempt).rejects.toThrow(/changed|identity|invalid|secure/i);
      expect(swapped).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  // Harness budget, not a product relaxation. Real filesystem + Windows ACL work: 3312ms measured
  // in isolation, over the 5000ms default under full-sweep load. 30000ms keeps a genuine hang failing.
  it("revalidates pathname identity after descriptor read and atomic write replacement", { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-post-race-"));
    const readPath = join(directory, "read.json");
    const readReplacement = join(directory, "read-replacement.json");
    const displacedRead = join(directory, "read-original.json");
    const writePath = join(directory, "write.json");
    const writeReplacement = join(directory, "write-replacement.json");
    const displacedWrite = join(directory, "write-original.json");
    try {
      await writeMusicReconciliationCheckpoint(readPath, checkpoint());
      await writeMusicReconciliationCheckpoint(readReplacement, checkpoint({ runId: "read-replacement", state: "blocked", review: undefined, report: undefined }));
      await expect(Reflect.apply(readMusicReconciliationCheckpoint, undefined, [readPath, {
        fileSystem: {
          open: async (target: string, flags: number) => {
            const handle = await open(target, flags);
            if (target !== readPath) return handle;
            const originalRead = handle.read.bind(handle);
            handle.read = async (...args: Parameters<typeof handle.read>) => {
              const result = await originalRead(...args);
              await rename(readPath, displacedRead);
              await rename(readReplacement, readPath);
              return result;
            };
            return handle;
          },
        },
      }])).rejects.toThrow(/invalid|secure/i);

      await writeMusicReconciliationCheckpoint(writeReplacement, checkpoint({ runId: "write-replacement", state: "blocked", review: undefined, report: undefined }));
      await expect(Reflect.apply(writeMusicReconciliationCheckpoint, undefined, [writePath, checkpoint(), {
        fileSystem: {
          rename: async (oldPath: string, newPath: string) => {
            await rename(oldPath, newPath);
            if (newPath === writePath) {
              await rename(writePath, displacedWrite);
              await rename(writeReplacement, writePath);
            }
          },
        },
      }])).rejects.toThrow(/invalid|secure/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses an atomic no-overwrite commit for a new output artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-exclusive-"));
    const path = join(directory, "checkpoint.json");
    const competing = checkpoint({ runId: "competing-run", state: "blocked", review: undefined, report: undefined });
    try {
      await expect(Reflect.apply(writeMusicReconciliationCheckpoint, undefined, [path, checkpoint(), {
        requireAbsent: true,
        fileSystem: {
          link: async (oldPath: string, newPath: string) => {
            await writeFile(newPath, `${JSON.stringify(competing, null, 2)}\n`, { mode: 0o600, flag: "wx" });
            return link(oldPath, newPath);
          },
        },
      }])).rejects.toThrow(/checkpoint|exist|invalid|secure/i);
      await expect(readMusicReconciliationCheckpoint(path)).resolves.toEqual(competing);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical checkpoint paths before descriptor use", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-canonical-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    try {
      await expect(Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        fileSystem: { realpath: async (target: string) => target === path ? join(directory, "different.json") : realpath(target) },
      }])).rejects.toThrow(/invalid|secure/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects checkpoint ancestor identity and canonical-parent changes after descriptor read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-parent-race-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    try {
      let directoryReads = 0;
      await expect(Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        fileSystem: {
          lstat: async (target: string) => {
            const metadata = await lstat(target, { bigint: true });
            if (target !== directory || ++directoryReads === 1) return metadata;
            return new Proxy(metadata, { get: (value, property) => {
              if (property === "ino") return value.ino + BigInt(1);
              const member = Reflect.get(value, property, value);
              return typeof member === "function" ? member.bind(value) : member;
            } });
          },
        },
      }])).rejects.toThrow(/invalid|secure/i);

      await expect(Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        fileSystem: {
          realpath: async (target: string) => target === directory ? join(directory, "different-parent") : realpath(target),
        },
      }])).rejects.toThrow(/invalid|secure/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects group-writable checkpoint directories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-mode-"));
    const path = join(directory, "checkpoint.json");
    try {
      await chmod(directory, 0o770);
      await expect(writeMusicReconciliationCheckpoint(path, checkpoint())).rejects.toThrow(/owner|permission|secure|directory/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["a non-runner owner", { ownerMatchesEffectiveUser: false }],
    ["an untrusted writable DACL", { unsafeWritePrincipalCount: 1 }],
    ["a malformed native device identity", { nativeDev: "not-a-device" }],
    ["a malformed native file identity", { nativeIno: "not-a-file" }],
    ["a mismatched native device identity", { nativeDev: "0" }],
    ["a mismatched native file identity", { nativeIno: "0" }],
    ["a non-integral unsafe-principal count", { unsafeWritePrincipalCount: 0.5 }],
    ["a missing inspection result", null],
  ])("fails closed on Windows checkpoint security with %s", async (_name, result) => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-win-security-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    const inspectWindowsCheckpointSecurity = vi.fn(async (target: string) => {
      if (result === null) return undefined as never;
      const metadata = await lstat(target, { bigint: true });
      return {
        nativeDev: String(metadata.dev),
        nativeIno: String(metadata.ino),
        ownerMatchesEffectiveUser: true,
        unsafeWritePrincipalCount: 0,
        ...result,
      };
    });
    try {
      await expect(Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        platform: "win32",
        inspectWindowsCheckpointSecurity,
      }])).rejects.toThrow(/owner|permission|secure|checkpoint/i);
      expect(inspectWindowsCheckpointSecurity).toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts a checkpoint when the injected Windows security inspector proves its owner and ACL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-win-valid-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    try {
      const restored = await Reflect.apply(readMusicReconciliationCheckpoint, undefined, [path, {
        platform: "win32",
        inspectWindowsCheckpointSecurity: async (target: string) => {
          const metadata = await lstat(target, { bigint: true });
          return {
            nativeDev: String(metadata.dev),
            nativeIno: String(metadata.ino),
            ownerMatchesEffectiveUser: true,
            unsafeWritePrincipalCount: 0,
          };
        },
      }]);
      expect(restored).toEqual(checkpoint());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed or incomplete native Windows security output", () => {
    const valid = JSON.stringify({
      nativeDev: "1",
      nativeIno: "2",
      ownerMatchesEffectiveUser: true,
      unsafeWritePrincipalCount: 0,
    });
    expect(parseWindowsCheckpointSecurityOutput(valid, 1)).toHaveLength(1);
    for (const output of [
      "",
      `${valid}\n${valid}`,
      JSON.stringify({ nativeIno: "2", ownerMatchesEffectiveUser: true, unsafeWritePrincipalCount: 0 }),
      JSON.stringify({ nativeDev: "1", ownerMatchesEffectiveUser: true, unsafeWritePrincipalCount: 0 }),
      JSON.stringify({ nativeDev: "1", nativeIno: "2", unsafeWritePrincipalCount: 0 }),
      JSON.stringify({ nativeDev: "1", nativeIno: "2", ownerMatchesEffectiveUser: true }),
    ]) expect(() => parseWindowsCheckpointSecurityOutput(output, 1)).toThrow(/checkpoint|secure|invalid/i);
  });

  it.skipIf(process.platform !== "win32")("rejects an actual broad Windows write-only directory ACL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-win-acl-"));
    const path = join(directory, "checkpoint.json");
    try {
      await writeMusicReconciliationCheckpoint(path, checkpoint());
      execFileSync("icacls.exe", [directory, "/grant", "*S-1-1-0:(CI)(W)"], { windowsHide: true });
      await expect(readMusicReconciliationCheckpoint(path)).rejects.toThrow(/permission|secure|checkpoint/i);
    } finally {
      execFileSync("icacls.exe", [directory, "/remove:g", "*S-1-1-0", "/T", "/C"], { windowsHide: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "win32")("rejects an inherit-only Windows ACE that can write checkpoint children", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-win-inherit-only-"));
    const path = join(directory, "checkpoint.json");
    try {
      await writeMusicReconciliationCheckpoint(path, checkpoint());
      execFileSync("icacls.exe", [directory, "/grant", "*S-1-1-0:(OI)(CI)(IO)(W)"], { windowsHide: true });
      const output = execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        join(import.meta.dirname, "../../scripts/windows-write-through.ps1"),
        "inspect-security", directory,
      ], { encoding: "utf8", windowsHide: true });
      expect(parseWindowsCheckpointSecurityOutput(output, 1)[0]?.unsafeWritePrincipalCount).toBeGreaterThan(0);
    } finally {
      execFileSync("icacls.exe", [directory, "/remove:g", "*S-1-1-0", "/T", "/C"], { windowsHide: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "win32" || !windowsUntrustedWriterSid)("rejects an arbitrary non-owner Windows group writer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-checkpoint-win-group-"));
    const path = join(directory, "checkpoint.json");
    try {
      await writeMusicReconciliationCheckpoint(path, checkpoint());
      execFileSync("icacls.exe", [directory, "/grant", `*${windowsUntrustedWriterSid}:(W)`], { windowsHide: true });
      await expect(readMusicReconciliationCheckpoint(path)).rejects.toThrow(/permission|secure|checkpoint/i);
    } finally {
      execFileSync("icacls.exe", [directory, "/remove:g", `*${windowsUntrustedWriterSid}`, "/C"], { windowsHide: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["commit", { commit: "different" }],
    ["fixture version", { fixtureVersion: "2" }],
    ["fixture schema", { fixtureSchemaVersion: "changed" }],
    ["environment", { environment: "staging" as const }],
    ["environment fingerprint", { environmentFingerprint: "changed" }],
    ["gate", { gateValues: { ...context.gateValues, MUSIC_RECONCILIATION_ENABLED: "true" } }],
    ["threshold", { thresholds: { ...context.thresholds, maxChangeAbsolute: 3 } }],
  ])("rejects %s drift", (_name, drift) => {
    expect(() => assertMusicReconciliationResume(checkpoint(), { ...context, ...drift })).toThrow(/resume/i);
  });

  it("rejects source drift independently of other resume context", () => {
    expect(() => assertMusicReconciliationResume(checkpoint(), context, "snapshot-2")).toThrow(/source snapshot/i);
  });

  // Harness budget, not a product relaxation. 4007ms measured in isolation, over the 5000ms default
  // under full-sweep load. 30000ms keeps a genuine hang failing.
  it("atomically marks only an in-progress checkpoint interrupted", { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-interrupt-"));
    const path = join(directory, "checkpoint.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint({ state: "scanning", review: undefined, report: undefined }));
    await expect(interruptMusicReconciliationCheckpoint(path)).resolves.toBe(true);
    await expect(readMusicReconciliationCheckpoint(path)).resolves.toMatchObject({ state: "interrupted" });
    await expect(interruptMusicReconciliationCheckpoint(path)).resolves.toBe(true);
    await expect(interruptMusicReconciliationCheckpoint(join(directory, "missing.json"))).resolves.toBe(false);
  });

  it("rejects semantically inconsistent checkpoints and invalid filesystem targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconciliation-invalid-"));
    const path = join(directory, "checkpoint.json");
    const invalidReviewed = [
      checkpoint({ state: "reviewed", review: undefined }),
      checkpoint({ state: "reviewed", report: { ...checkpoint().report!, mode: "apply" } }),
      checkpoint({ state: "reviewed", report: { ...checkpoint().report!, status: "blocked" } }),
      checkpoint({ state: "reviewed", report: { ...checkpoint().report!, runId: "another-run" } }),
      checkpoint({ state: "reviewed", report: { ...checkpoint().report!, scanNonce: "e".repeat(64) } }),
      checkpoint({ state: "reviewed", review: { ...checkpoint().review!, scanNonce: "e".repeat(64) } }),
      checkpoint({ state: "reviewed", scanNonce: "e".repeat(64) }),
      checkpoint({ state: "reviewed", review: { ...checkpoint().review!, planFingerprint: "e".repeat(64) } }),
      checkpoint({ state: "reviewed", review: { ...checkpoint().review!, approvalToken: "e".repeat(64) } }),
      checkpoint({ state: "reviewed", review: { ...checkpoint().review!, source: { ...source, sourceSnapshot: "snapshot-2" } } }),
      checkpoint({ state: "reviewed", source: { ...source, sourceSnapshot: "snapshot-2" } }),
    ];
    const invalidApplied = [
      checkpoint({ state: "applied", review: undefined, report: { ...checkpoint().report!, mode: "apply" } }),
      checkpoint({ state: "applied" }),
      checkpoint({ state: "applied", report: { ...checkpoint().report!, mode: "apply", status: "blocked" } }),
      checkpoint({ state: "applied", report: { ...checkpoint().report!, mode: "apply", changes: undefined } }),
      checkpoint({ state: "applied", report: { ...checkpoint().report!, mode: "apply", changes: { ...checkpoint().report!.changes!, applied: false } } }),
    ];
    for (const invalid of [...invalidReviewed, ...invalidApplied]) {
      await expect(writeMusicReconciliationCheckpoint(path, invalid)).rejects.toThrow();
    }

    const targetDirectory = join(directory, "target-directory");
    await mkdir(targetDirectory);
    const before = await readdir(directory);
    await expect(writeMusicReconciliationCheckpoint(targetDirectory, checkpoint())).rejects.toThrow();
    expect(await readdir(directory)).toEqual(before);

    await expect(readMusicReconciliationCheckpoint(targetDirectory)).rejects.toThrow(/invalid/i);
    await writeFile(path, "x");
    await expect(readMusicReconciliationCheckpoint(path)).rejects.toThrow(/invalid/i);
    await writeFile(path, "x".repeat(1024 * 1024 + 1));
    await expect(readMusicReconciliationCheckpoint(path)).rejects.toThrow(/invalid/i);
    for (const invalidPath of ["", "relative-checkpoint.json", `${directory}${"x".repeat(1_025)}`]) {
      await expect(readMusicReconciliationCheckpoint(invalidPath)).rejects.toThrow(/invalid/i);
      await expect(writeMusicReconciliationCheckpoint(invalidPath, checkpoint())).rejects.toThrow(/invalid/i);
    }
    const link = join(directory, "checkpoint-link.json");
    try {
      await symlink(path, link, "file");
      await expect(readMusicReconciliationCheckpoint(link)).rejects.toThrow(/invalid/i);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  });
});

describe("reconcileMusicIdentities", () => {
  it("generates one scan nonce and persists it across the report, review, and atomic checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-scan-nonce-"));
    const path = join(directory, "checkpoint.json");
    let observedNonce: string | undefined;
    const run = vi.fn(async (input: Parameters<Parameters<typeof reconcileMusicIdentities>[0]["reconciler"]["run"]>[0]) => {
      observedNonce = (input as typeof input & { scanNonce?: string }).scanNonce;
      return { ...checkpoint().report!, scanNonce: observedNonce } as MusicReconciliationReport;
    });

    await reconcileMusicIdentities({
      reconciler: { run },
      checkpointPath: path,
      context,
      run: {
        runId: "run-1", environment: "fixture", applyEnabled: false,
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    });

    const saved = await readMusicReconciliationCheckpoint(path) as MusicReconciliationCheckpoint & {
      scanNonce?: string;
      review?: MusicReconciliationCheckpoint["review"] & { scanNonce?: string };
      report?: MusicReconciliationReport & { scanNonce?: string };
    };
    expect(observedNonce).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.scanNonce).toBe(observedNonce);
    expect(saved.review?.scanNonce).toBe(observedNonce);
    expect(saved.report?.scanNonce).toBe(observedNonce);
  });

  // Harness budget, not a product relaxation. 3211ms measured in isolation, over the 5000ms default
  // under full-sweep load. 30000ms keeps a genuine hang failing.
  it("persists scanning and reviewed checkpoints around a default dry-run", { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-command-"));
    const path = join(directory, "checkpoint.json");
    const report = checkpoint().report!;
    const run = vi.fn(async (input: Parameters<Parameters<typeof reconcileMusicIdentities>[0]["reconciler"]["run"]>[0]) => {
      await input.onSourceCheckpoint?.({ ...source, nextPage: 2 });
      return { ...report, scanNonce: input.scanNonce! };
    });

    const result = await reconcileMusicIdentities({
      reconciler: { run },
      checkpointPath: path,
      context,
      run: {
        runId: "run-1", environment: "fixture", applyEnabled: false,
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    });

    expect(result).toEqual({ ...report, scanNonce: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ requestedMode: "dry-run" }));
    expect(await readMusicReconciliationCheckpoint(path)).toMatchObject({ state: "reviewed", source, review: { source } });
  });

  // Harness budget, not a product relaxation. 4363ms measured in isolation (the worst case in this
  // file without an explicit budget), over the 5000ms default under full-sweep load. 30000ms is ~6.9x
  // that measurement and keeps a genuine hang failing.
  it("requires a reviewed resume artifact for apply and pins its source", { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-apply-"));
    const resumePath = join(directory, "review.json");
    const checkpointPath = join(directory, "apply.json");
    await writeMusicReconciliationCheckpoint(resumePath, checkpoint());
    const applied: MusicReconciliationReport = { ...checkpoint().report!, runId: "run-2", mode: "apply", changes: { ...checkpoint().report!.changes!, applied: true } };
    const run = vi.fn(async () => applied);

    await reconcileMusicIdentities({
      reconciler: { run }, checkpointPath, resumePath, context,
      run: {
        runId: "run-2", environment: "fixture", applyEnabled: true,
        requestedMode: "apply", approvalToken: "d".repeat(64),
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    });

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      review: checkpoint().review,
      expectedSource: source,
      requestedMode: "apply",
    }));
    expect(await readMusicReconciliationCheckpoint(checkpointPath)).toMatchObject({ state: "applied", runId: "run-2" });
    expect(await readMusicReconciliationCheckpoint(resumePath)).toMatchObject({ state: "reviewed", runId: "run-1" });
  });

  it("refuses to overwrite an existing output artifact before reconciliation starts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-existing-output-"));
    const resumePath = join(directory, "review.json");
    const checkpointPath = join(directory, "existing.json");
    const existing = checkpoint({ state: "blocked", review: undefined, report: undefined });
    await writeMusicReconciliationCheckpoint(resumePath, checkpoint());
    await writeMusicReconciliationCheckpoint(checkpointPath, existing);
    const run = vi.fn(async () => checkpoint().report!);

    await expect(reconcileMusicIdentities({
      reconciler: { run }, checkpointPath, resumePath, context,
      run: {
        runId: "run-new", environment: "fixture", applyEnabled: true,
        requestedMode: "apply", approvalToken: "d".repeat(64),
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    })).rejects.toThrow(/checkpoint|exist|new|overwrite|secure/i);

    expect(run).not.toHaveBeenCalled();
    await expect(readMusicReconciliationCheckpoint(checkpointPath)).resolves.toEqual(existing);
    await expect(readMusicReconciliationCheckpoint(resumePath)).resolves.toEqual(checkpoint());
  }, checkpointFilesystemTimeoutMs);

  it("refuses to overwrite the reviewed resume evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-preserve-review-"));
    const path = join(directory, "review.json");
    await writeMusicReconciliationCheckpoint(path, checkpoint());
    await expect(reconcileMusicIdentities({
      reconciler: { run: vi.fn() }, checkpointPath: path, resumePath: path, context,
      run: {
        runId: "run-2", environment: "fixture", applyEnabled: true,
        requestedMode: "apply", approvalToken: "d".repeat(64),
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    })).rejects.toThrow(/distinct.*reviewed/i);
    expect(await readMusicReconciliationCheckpoint(path)).toMatchObject({ state: "reviewed", runId: "run-1" });
  });

  it("refuses a hard-linked output that aliases reviewed evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-hardlink-review-"));
    const resumePath = join(directory, "review.json");
    const checkpointPath = join(directory, "apply.json");
    await writeMusicReconciliationCheckpoint(resumePath, checkpoint());
    await link(resumePath, checkpointPath);

    await expect(reconcileMusicIdentities({
      reconciler: { run: vi.fn() }, checkpointPath, resumePath, context,
      run: {
        runId: "run-2", environment: "fixture", applyEnabled: true,
        requestedMode: "apply", approvalToken: "d".repeat(64),
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    })).rejects.toThrow(/distinct.*reviewed/i);
    expect(readFileSync(resumePath, "utf8")).toBe(readFileSync(checkpointPath, "utf8"));
  });

  it("propagates non-missing filesystem failures while comparing review evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-invalid-path-"));
    const resumePath = join(directory, "review.json");
    await writeMusicReconciliationCheckpoint(resumePath, checkpoint());
    await expect(reconcileMusicIdentities({
      reconciler: { run: vi.fn() }, checkpointPath: `${directory}\0invalid.json`, resumePath, context,
      run: {
        runId: "run-2", environment: "fixture", applyEnabled: true,
        requestedMode: "apply", approvalToken: "d".repeat(64),
        pageSize: 100, maxRows: 1_000, batchSize: 100,
        maxChangeAbsolute: 2, maxChangePercent: 1,
      },
    })).rejects.toThrow();
  });

  it("refuses mismatched thresholds and apply without a reviewed checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-refusal-"));
    const path = join(directory, "checkpoint.json");
    const reconciler = { run: vi.fn(async () => checkpoint().report!) };
    await expect(reconcileMusicIdentities({
      reconciler, checkpointPath: path, context,
      run: { runId: "run", environment: "fixture", applyEnabled: false, pageSize: 99, maxRows: 1_000, batchSize: 100, maxChangeAbsolute: 2, maxChangePercent: 1 },
    })).rejects.toThrow(/threshold/i);
    await expect(reconcileMusicIdentities({
      reconciler, checkpointPath: path, context,
      run: { runId: "run", environment: "fixture", applyEnabled: true, requestedMode: "apply", pageSize: 100, maxRows: 1_000, batchSize: 100, maxChangeAbsolute: 2, maxChangePercent: 1 },
    })).rejects.toThrow(/reviewed/i);
    await writeMusicReconciliationCheckpoint(path, checkpoint({ state: "scanning", review: undefined, report: undefined }));
    await expect(reconcileMusicIdentities({
      reconciler, checkpointPath: join(directory, "apply.json"), resumePath: path, context,
      run: { runId: "run", environment: "fixture", applyEnabled: true, requestedMode: "apply", pageSize: 100, maxRows: 1_000, batchSize: 100, maxChangeAbsolute: 2, maxChangePercent: 1 },
    })).rejects.toThrow(/reviewed/i);
    expect(reconciler.run).not.toHaveBeenCalled();
  });

  it("checkpoints partial progress and every non-review terminal state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "music-reconcile-terminal-"));
    const baseRun = { runId: "run-terminal", environment: "fixture" as const, applyEnabled: false, pageSize: 100, maxRows: 1_000, batchSize: 100, maxChangeAbsolute: 2, maxChangePercent: 1 };
    const blocked: MusicReconciliationReport = {
      schemaVersion: "music-reconciliation/v1", runId: "run-terminal", scanNonce: "1".repeat(64), status: "blocked", mode: "dry-run",
      metrics: { pages: 0, databaseBatches: 0, durationMs: 1 }, anomalies: [{ code: "SOURCE_UNAVAILABLE", message: "unavailable" }],
    };
    const blockedPath = join(directory, "blocked.json");
    await reconcileMusicIdentities({
      reconciler: { run: async (input) => { await input.onSourceCheckpoint?.({ nextPage: 2 }); return { ...blocked, scanNonce: input.scanNonce! }; } },
      checkpointPath: blockedPath, context, run: baseRun,
    });
    const blockedCheckpoint = await readMusicReconciliationCheckpoint(blockedPath);
    expect(blockedCheckpoint).toMatchObject({ state: "blocked", nextPage: 1 });
    expect(blockedCheckpoint).not.toHaveProperty("source");

    const incomplete: MusicReconciliationReport = { ...checkpoint().report!, runId: "run-terminal", approvalToken: undefined };
    const incompletePath = join(directory, "incomplete.json");
    await reconcileMusicIdentities({ reconciler: { run: async (input) => ({ ...incomplete, scanNonce: input.scanNonce! }) }, checkpointPath: incompletePath, context, run: baseRun });
    await expect(readMusicReconciliationCheckpoint(incompletePath)).resolves.toMatchObject({ state: "blocked" });

    const resumePath = join(directory, "review.json");
    await writeMusicReconciliationCheckpoint(resumePath, checkpoint());
    const unapplied: MusicReconciliationReport = { ...checkpoint().report!, runId: "run-terminal", mode: "apply", changes: { ...checkpoint().report!.changes!, applied: false } };
    const applyPath = join(directory, "unapplied.json");
    await reconcileMusicIdentities({
      reconciler: { run: async () => unapplied }, checkpointPath: applyPath, resumePath, context,
      run: { ...baseRun, applyEnabled: true, requestedMode: "apply", approvalToken: "d".repeat(64) },
    });
    await expect(readMusicReconciliationCheckpoint(applyPath)).resolves.toMatchObject({ state: "blocked", review: checkpoint().review });
  }, 15_000);
});

describe("formatMusicReconciliationReport", () => {
  it("emits redacted aggregate-only human and JSON reports", () => {
    const report = checkpoint().report!;
    const human = formatMusicReconciliationReport(report, "human");
    const json = formatMusicReconciliationReport(report, "json");
    expect(human).toContain("matched=2");
    expect(human).toContain("eligibleTotal=2");
    expect(human).toContain("changePercent=0");
    expect(human).toContain("maxChangeAbsolute=2 maxChangePercent=1");
    expect(human).not.toContain("approvalToken");
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: "music-reconciliation/v1", changes: { matched: 2 } });
    expect(`${human}\n${json}`).not.toContain("email");
  });

  it("formats blocked reports with unavailable aggregates and anomaly codes", () => {
    const report: MusicReconciliationReport = {
      schemaVersion: "music-reconciliation/v1", runId: "blocked", status: "blocked", mode: "dry-run",
      metrics: { pages: 0, databaseBatches: 0, durationMs: 0 },
      anomalies: [{ code: "SOURCE_UNAVAILABLE", message: "The source is unavailable." }],
    };
    expect(formatMusicReconciliationReport(report, "human")).toContain("sourceTotal=unavailable localTotal=unavailable");
    expect(formatMusicReconciliationReport(report, "human")).toContain("anomalies=SOURCE_UNAVAILABLE");
  });
});
