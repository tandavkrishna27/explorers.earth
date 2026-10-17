import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  installProfileOptionalMusicIntegrations,
  musicCompositionPolicy,
} from "../config/music-local-composition";
import {
  closeLocalMusicOwnedResources,
  createLocalMusicRuntimeShutdown,
  failAfterLocalMusicOwnedCleanup,
  requestLocalMusicRuntimeShutdown,
} from "../config/music-local-shutdown";
import type { ValidatedLocalMusicProfile } from "../config/music-local-profile";
import { MusicFeatureDecisionService } from "../services/musicFeatureDecisionService";

const localProfile = { kind: "local-music" } as ValidatedLocalMusicProfile;

describe("local Music composition", () => {
  it("does not execute native auth, analytics publisher, or reactivation factories", () => {
    const installers = {
      nativeAuth: vi.fn(),
      analyticsPublishing: vi.fn(),
      reactivation: vi.fn(),
    };
    installProfileOptionalMusicIntegrations(localProfile, installers);
    expect(installers.nativeAuth).not.toHaveBeenCalled();
    expect(installers.analyticsPublishing).not.toHaveBeenCalled();
    expect(installers.reactivation).not.toHaveBeenCalled();
  });

  it("retains canonical REST/socket surfaces and both database safety listeners", () => {
    expect(musicCompositionPolicy(localProfile)).toEqual({
      canonicalRest: true,
      canonicalSockets: true,
      publicChangeSafetyListener: true,
      suspensionSafetyListener: true,
      lifecycleWorker: false,
    });
  });

  it("enables only owner/guest workspaces for the immutable local user cohort", () => {
    const cohort = new Set(["user_document_1"]);
    const decisions = new MusicFeatureDecisionService({
      killSwitch: () => false,
      salt: "",
      cohortVersion: "local-test",
      allowlists: { ownerWorkspace: cohort, guestWorkspace: cohort, playlistImports: new Set() },
      percentages: { ownerWorkspace: 0, guestWorkspace: 0, playlistImports: 0 },
      allowlistIdentity: (principal) => principal.subject,
      exposureId: () => "exposure",
      now: () => 0,
    });
    expect(decisions.decide({ subject: "user_document_1", accountDocumentId: "different_account", musicUserId: 1, sessionVersion: 1 } as never))
      .toMatchObject({ ownerWorkspace: true, guestWorkspace: true, playlistImports: false });
    expect(decisions.decide({ subject: "outside_cohort", accountDocumentId: "user_document_1", musicUserId: 2, sessionVersion: 1 } as never))
      .toMatchObject({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false });
  });

  it("retains the existing optional integration behavior with no local profile", () => {
    const events: string[] = [];
    installProfileOptionalMusicIntegrations(undefined, {
      nativeAuth: () => events.push("auth"),
      analyticsPublishing: () => events.push("analytics"),
      reactivation: () => events.push("reactivation"),
    });
    expect(events).toEqual(["auth", "analytics", "reactivation"]);
    expect(musicCompositionPolicy(undefined).lifecycleWorker).toBe(true);
  });
});

describe("local Music shutdown owner", () => {
  function resources(options: { routeFailure?: boolean } = {}) {
    const events: string[] = [];
    const server = new EventEmitter() as EventEmitter & {
      listening: boolean;
      close(callback: (error?: Error) => void): typeof server;
      closeAllConnections(): void;
    };
    server.listening = true;
    server.close = (callback) => { events.push("server"); server.listening = false; callback(); return server; };
    server.closeAllConnections = () => { events.push("connections"); };
    return {
      events,
      server,
      input: {
        server: server as never,
        stopRoutes: async () => { events.push("routes-and-sockets"); if (options.routeFailure) throw new Error("listener detail"); },
        closeSessionStore: async () => { events.push("session-pruner"); },
        closePool: async () => { events.push("pool"); },
      },
    };
  }

  it("closes sockets/listeners, HTTP, session pruner and pool exactly once", async () => {
    const harness = resources();
    const shutdown = createLocalMusicRuntimeShutdown(harness.input);
    await Promise.all([shutdown(), shutdown()]);
    expect(harness.events).toEqual(["routes-and-sockets", "server", "connections", "session-pruner", "pool"]);
  });

  it("still closes every owned resource after an earlier cleanup failure", async () => {
    const harness = resources({ routeFailure: true });
    await expect(createLocalMusicRuntimeShutdown(harness.input)()).rejects.toThrow("Local Music runtime shutdown failed");
    expect(harness.events).toEqual(["routes-and-sockets", "server", "connections", "session-pruner", "pool"]);
    expect(JSON.stringify(harness.events)).not.toContain("listener detail");
  });

  it("attempts the pool after partial-composition session cleanup fails", async () => {
    const events: string[] = [];
    await expect(closeLocalMusicOwnedResources({
      closeSessionStore: async () => { events.push("session-pruner"); throw new Error("private session detail"); },
      closePool: async () => { events.push("pool"); },
    })).rejects.toThrow("Local Music owned-resource cleanup failed");
    expect(events).toEqual(["session-pruner", "pool"]);
  });

  it("preserves the original composition failure after attempting all owned cleanup", async () => {
    const events: string[] = [];
    const startupFailure = new Error("original startup failure");
    await expect(failAfterLocalMusicOwnedCleanup(startupFailure, {
      closeSessionStore: async () => { events.push("session-pruner"); throw new Error("cleanup detail"); },
      closePool: async () => { events.push("pool"); },
    })).rejects.toBe(startupFailure);
    expect(events).toEqual(["session-pruner", "pool"]);
  });

  it("runs the full owner when a listener-fatal path closes the server", async () => {
    const harness = resources();
    createLocalMusicRuntimeShutdown(harness.input);
    harness.server.listening = false;
    harness.server.emit("close");
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.events).toEqual(["routes-and-sockets", "connections", "session-pruner", "pool"]);
  });

  it("lets a local listener-fatal path request the full owner directly", async () => {
    const harness = resources();
    createLocalMusicRuntimeShutdown(harness.input);
    requestLocalMusicRuntimeShutdown(harness.server);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.events).toEqual(["routes-and-sockets", "server", "connections", "session-pruner", "pool"]);
  });

  it("force-closes active connections before awaiting the close callback", async () => {
    const events: string[] = [];
    let closed: ((error?: Error) => void) | undefined;
    const server = new EventEmitter() as EventEmitter & {
      listening: boolean;
      close(callback: (error?: Error) => void): typeof server;
      closeAllConnections(): void;
    };
    server.listening = true;
    server.close = (callback) => { events.push("server-close-started"); closed = callback; return server; };
    server.closeAllConnections = () => { events.push("connections-force-closed"); server.listening = false; closed?.(); server.emit("close"); };
    const result = createLocalMusicRuntimeShutdown({
      server: server as never,
      stopRoutes: async () => { events.push("routes-and-sockets"); },
      closeSessionStore: async () => { events.push("session-pruner"); },
      closePool: async () => { events.push("pool"); },
    })();
    await result;
    expect(events).toEqual([
      "routes-and-sockets", "server-close-started", "connections-force-closed", "session-pruner", "pool",
    ]);
  });

  it("keeps awaiting an initiated HTTP close when force-close throws while owned cleanup proceeds", async () => {
    const events: string[] = [];
    let closed: ((error?: Error) => void) | undefined;
    const server = new EventEmitter() as EventEmitter & {
      listening: boolean;
      close(callback: (error?: Error) => void): typeof server;
      closeAllConnections(): void;
    };
    server.listening = true;
    server.close = (callback) => { events.push("server-close-started"); closed = callback; return server; };
    server.closeAllConnections = () => { events.push("connections-force-failed"); throw new Error("private force-close detail"); };
    const shutdown = createLocalMusicRuntimeShutdown({
      server: server as never,
      stopRoutes: async () => { events.push("routes-and-sockets"); },
      closeSessionStore: async () => { events.push("session-pruner"); },
      closePool: async () => { events.push("pool"); },
    })();
    let settled = false;
    void shutdown.then(() => { settled = true; }, () => { settled = true; });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([
      "routes-and-sockets", "server-close-started", "connections-force-failed", "session-pruner", "pool",
    ]);
    expect(settled).toBe(false);
    closed?.();
    await expect(shutdown).rejects.toThrow("Local Music runtime shutdown failed");
    expect(settled).toBe(true);
  });
});
