import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildLocalMusicEnvironment,
  createValidatedLocalMusicProfile,
  hasValidatedLocalMusicRuntime,
  type LocalMusicManifest,
} from "../config/music-local-profile";
import {
  startLocalMusicServer,
  startMusicServer,
  type MusicServerRuntime,
} from "../config/music-startup";
import { sanitizeLocalMusicStartFailure, startLocalMusic } from "../../scripts/music-local";

const worktreeRoot = path.resolve(import.meta.dirname, "../../..");
const stateDirectory = path.join(tmpdir(), "ExplorersMusicLocal", "task3");

function manifest(cohortUserDocumentIds: string[] = []): LocalMusicManifest {
  return {
    version: 1,
    instanceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    worktreeRoot,
    ownerId: "S-1-5-21-1",
    imageId: `sha256:${"a".repeat(64)}`,
    stateDirectory,
    lifecycleProofFile: path.join(stateDirectory, "lifecycle-proof"),
    cohortUserDocumentIds,
  };
}

function localProfile(enableCohort = false, cohort = ["user_document_1"]) {
  const localManifest = manifest(cohort);
  return createValidatedLocalMusicProfile({
    manifest: localManifest,
    applicationEnvironment: buildLocalMusicEnvironment(localManifest),
    resourcesValidated: true,
    credentialsValidated: true,
    databaseReady: true,
    enableCohort,
    source: { commit: "b".repeat(40), dirty: true },
  });
}

function identityConfig() {
  return {
    mode: "live", strapiOrigin: "https://api.localqr.earth", trustedProxyHops: 1,
    isTrustedProxy: () => true, pinnedAddresses: ["8.8.8.8"], lookup: vi.fn(), fetchImpl: fetch,
    maxConcurrency: 1, maxPending: 1, maxInflight: 1, retries: 0, connectTimeoutMs: 100,
    readTimeoutMs: 100, overallTimeoutMs: 100, cacheTtlMs: 0, circuitFailureThreshold: 1,
    circuitOpenMs: 100, rateLimitPerMinute: 1, globalRateLimitPerMinute: 1, rateMaxEntries: 2,
    musicToken: {}, lifecycleProofToken: "proof", publicationResponse: {}, publicIdHmacKey: Buffer.alloc(32),
  } as never;
}

function controlledRuntime(events: string[], listenError?: Error): MusicServerRuntime {
  const server = new EventEmitter() as EventEmitter & {
    listening: boolean;
    listen(port: number, host: string, callback: () => void): typeof server;
    close(callback?: (error?: Error) => void): typeof server;
  };
  server.listening = false;
  server.listen = (port, host, callback) => {
    events.push(`listen:${host}:${port}`);
    if (listenError) queueMicrotask(() => server.emit("error", listenError));
    else { server.listening = true; callback(); }
    return server;
  };
  server.close = (callback) => { server.listening = false; callback?.(); return server; };
  return {
    createApp: async (_config, profile) => {
      events.push(`create:${profile?.kind ?? "production"}`);
      return {
        app: { get: () => "development" } as never,
        server: server as never,
        shutdown: async () => { events.push("shutdown"); },
      };
    },
    setupVite: async () => { events.push("vite"); },
    serveStatic: () => { events.push("static"); },
  };
}

describe("validated local Music startup", () => {
  it("keeps launcher diagnostics phase-only", () => {
    expect(sanitizeLocalMusicStartFailure(new Error("LOCAL_MUSIC_REFUSED_RUNTIME"))).toBe("LOCAL_MUSIC_REFUSED_RUNTIME");
    expect(sanitizeLocalMusicStartFailure(new Error("database password=secret"))).toBe("LOCAL_MUSIC_REFUSED");
  });

  it("does not treat a raw local environment marker as validated dotenv authority", () => {
    expect(hasValidatedLocalMusicRuntime({ MUSIC_RUNTIME_PROFILE: "local-music" })).toBe(false);
  });

  it.each(["live", "fixture"])("does not let regular %s startup accept an ambient local marker", async (mode) => {
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    await expect(startMusicServer({ MUSIC_MODE: mode, MUSIC_RUNTIME_PROFILE: "local-music" }, { loadRuntime }))
      .rejects.toThrow(/local.*launcher|runtime profile/i);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("binds only the exact loopback target and never installs Vite or static serving", async () => {
    const profile = localProfile();
    const environment = buildLocalMusicEnvironment(manifest(["user_document_1"]));
    const events: string[] = [];
    const result = await startLocalMusicServer(environment, profile, {
      resolveIdentityConfig: async () => identityConfig(),
      resolveDatabaseConnection: async () => ({ connectionString: "postgresql://local", password: "x", user: "explorers_music_local_uat_runtime", database: "explorers_music_local_uat", host: "127.0.0.1", port: 55433 }),
      verifyDatabaseConnection: async () => undefined,
      loadRuntime: async () => controlledRuntime(events),
    });
    expect(events).toEqual(["create:local-music", "listen:127.0.0.1:5000"]);
    await result.shutdown();
    expect(events).toContain("shutdown");
  });

  it("accepts a private YouTube key passed by the validated local launcher", async () => {
    const profile = localProfile();
    const environment = { ...buildLocalMusicEnvironment(manifest(["user_document_1"])), YOUTUBE_API_KEY: "private-key" };
    const result = await startLocalMusicServer(environment, profile, {
      resolveIdentityConfig: async () => identityConfig(),
      resolveDatabaseConnection: async () => ({ connectionString: "postgresql://local", password: "x", user: "explorers_music_local_uat_runtime", database: "explorers_music_local_uat", host: "127.0.0.1", port: 55433 }),
      verifyDatabaseConnection: async () => undefined,
      loadRuntime: async () => controlledRuntime([]),
    });
    await result.shutdown();
  });

  it("rejects a changed local target before runtime import", async () => {
    const profile = localProfile();
    const loadRuntime = vi.fn(async () => controlledRuntime([]));
    await expect(startLocalMusicServer({
      ...buildLocalMusicEnvironment(manifest(["user_document_1"])), HOST: "0.0.0.0",
    }, profile, { loadRuntime })).rejects.toThrow(/local.*target|environment/i);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("cleans a constructed runtime when listen fails", async () => {
    const events: string[] = [];
    await expect(startLocalMusicServer(buildLocalMusicEnvironment(manifest(["user_document_1"])), localProfile(), {
      resolveIdentityConfig: async () => identityConfig(),
      resolveDatabaseConnection: async () => ({ connectionString: "postgresql://local", password: "x", user: "explorers_music_local_uat_runtime", database: "explorers_music_local_uat", host: "127.0.0.1", port: 55433 }),
      verifyDatabaseConnection: async () => undefined,
      loadRuntime: async () => controlledRuntime(events, new Error("EADDRINUSE")),
    })).rejects.toThrow("EADDRINUSE");
    expect(events).toContain("shutdown");
  });

  it("refuses missing private credentials before importing startup", async () => {
    const importRuntime = vi.fn();
    await expect(startLocalMusic(path.join(stateDirectory, "manifest.json"), { enableCohort: false }, {
      loadState: async () => ({ manifest: manifest(), resourceIdentity: { version: 1, instanceId: manifest().instanceId, endpoint: "npipe:////./pipe/docker_engine", containerId: "a".repeat(64), volumeCreatedAt: new Date(0).toISOString() } }),
      requireOwnedResources: async () => undefined,
      readSecret: async (file) => { if (file.endsWith("publication-key")) throw new Error("missing"); return `secret-${path.basename(file)}`; },
      readOptionalSecret: async () => undefined,
      checkDatabase: vi.fn(), sourceIdentity: async () => ({ commit: "c".repeat(40), dirty: false }),
      installEnvironment: vi.fn(), loadStartup: importRuntime,
    })).rejects.toThrow(/refused/i);
    expect(importRuntime).not.toHaveBeenCalled();
  });

  it("reports only the safe runtime phase when startup import fails", async () => {
    await expect(startLocalMusic(path.join(stateDirectory, "manifest.json"), { enableCohort: false }, {
      loadState: async () => ({ manifest: manifest(), resourceIdentity: { version: 1, instanceId: manifest().instanceId, endpoint: "npipe:////./pipe/docker_engine", containerId: "a".repeat(64), volumeCreatedAt: new Date(0).toISOString() } }),
      requireOwnedResources: async () => undefined,
      readSecret: async (file) => `${path.basename(file)}-${"x".repeat(43)}`,
      readOptionalSecret: async () => undefined,
      checkDatabase: async () => ({ ready: true, migrationId: "0021", migrationChecksum: "checksum", schemaChecksum: "schema" }),
      sourceIdentity: async () => ({ commit: "c".repeat(40), dirty: false }),
      installEnvironment: vi.fn(),
      loadStartup: async () => { throw new Error("untrusted startup detail"); },
    })).rejects.toThrow("LOCAL_MUSIC_REFUSED_RUNTIME");
  });

  it("passes a present private YouTube key only to the local server runtime", async () => {
    const start = vi.fn(async (environment) => ({
      app: {} as never, server: {} as never, config: identityConfig(), shutdown: async () => undefined,
      environment,
    }));
    await startLocalMusic(path.join(stateDirectory, "manifest.json"), { enableCohort: false }, {
      loadState: async () => ({ manifest: manifest(), resourceIdentity: { version: 1, instanceId: manifest().instanceId, endpoint: "npipe:////./pipe/docker_engine", containerId: "a".repeat(64), volumeCreatedAt: new Date(0).toISOString() } }),
      requireOwnedResources: async () => undefined,
      readSecret: async (file) => `${path.basename(file)}-${"x".repeat(43)}`,
      readOptionalSecret: async (file) => file.endsWith("youtube-api") ? "youtube-private-key" : undefined,
      checkDatabase: async () => ({ ready: true, migrationId: "0021", migrationChecksum: "checksum", schemaChecksum: "schema" }),
      sourceIdentity: async () => ({ commit: "c".repeat(40), dirty: false }),
      installEnvironment: vi.fn(), loadStartup: async () => ({ startLocalMusicServer: start as never }),
    });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ YOUTUBE_API_KEY: "youtube-private-key" }), expect.anything());
  });

  it("admits a cohort only after owned resources, all private files and schema readiness", async () => {
    const events: string[] = [];
    const start = vi.fn(async (_environment, profile) => {
      events.push(`start:${profile.admission.choice}`);
      return { app: {} as never, server: {} as never, config: identityConfig(), shutdown: async () => undefined };
    });
    const result = await startLocalMusic(path.join(stateDirectory, "manifest.json"), { enableCohort: true }, {
      loadState: async () => ({ manifest: manifest(["user_document_1"]), resourceIdentity: { version: 1, instanceId: manifest().instanceId, endpoint: "npipe:////./pipe/docker_engine", containerId: "a".repeat(64), volumeCreatedAt: new Date(0).toISOString() } }),
      requireOwnedResources: async () => { events.push("resources"); },
      readSecret: async (file) => `${path.basename(file)}-${"x".repeat(43)}`,
      readOptionalSecret: async () => undefined,
      checkDatabase: async () => { events.push("database"); return { ready: true, migrationId: "0021", migrationChecksum: "checksum", schemaChecksum: "schema" }; },
      sourceIdentity: async () => ({ commit: "c".repeat(40), dirty: false }),
      installEnvironment: () => { events.push("environment"); },
      loadStartup: async () => ({ startLocalMusicServer: start as never }),
    });
    expect(events).toEqual(["resources", "database", "environment", "start:cohort"]);
    expect(result.profile.admission).toMatchObject({
      choice: "cohort", newEntryKillSwitch: false, workspaceKillSwitch: false,
      ownerWorkspace: true, guestWorkspace: true, playlistImports: false,
    });
  });

  it.each([
    [[], { ready: true }],
    [["user_document_1"], { ready: false }],
  ])("refuses --enable-cohort for an empty cohort or unready database", async (cohort, database) => {
    const importRuntime = vi.fn();
    await expect(startLocalMusic(path.join(stateDirectory, "manifest.json"), { enableCohort: true }, {
      loadState: async () => ({ manifest: manifest(cohort as string[]), resourceIdentity: { version: 1, instanceId: manifest().instanceId, endpoint: "npipe:////./pipe/docker_engine", containerId: "a".repeat(64), volumeCreatedAt: new Date(0).toISOString() } }),
      requireOwnedResources: async () => undefined,
      readSecret: async (file) => `${path.basename(file)}-${"x".repeat(43)}`,
      readOptionalSecret: async () => undefined,
      checkDatabase: async () => database as never,
      sourceIdentity: async () => ({ commit: "c".repeat(40), dirty: false }),
      installEnvironment: vi.fn(), loadStartup: importRuntime,
    })).rejects.toThrow(/refused/i);
    expect(importRuntime).not.toHaveBeenCalled();
  });
});
