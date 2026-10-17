import type { Server } from "node:http";

export interface LocalMusicShutdownResources {
  server: Pick<Server, "listening" | "close"> & {
    closeAllConnections?: () => void;
    once?: (event: "close", listener: () => void) => unknown;
  };
  stopRoutes(): Promise<void>;
  closeSessionStore(): Promise<void>;
  closePool(): Promise<void>;
}

const localShutdownOwners = new WeakMap<object, () => Promise<void>>();

export async function closeLocalMusicOwnedResources(resources: {
  closeSessionStore(): Promise<void>;
  closePool(): Promise<void>;
}): Promise<void> {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => resources.closeSessionStore()),
    Promise.resolve().then(() => resources.closePool()),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Local Music owned-resource cleanup failed");
  }
}

export async function failAfterLocalMusicOwnedCleanup(
  cause: unknown,
  resources: Parameters<typeof closeLocalMusicOwnedResources>[0],
): Promise<never> {
  await closeLocalMusicOwnedResources(resources).catch(() => undefined);
  if (cause instanceof Error) throw cause;
  throw new Error("Local Music composition failed");
}

export function requestLocalMusicRuntimeShutdown(server: object & { listening?: boolean; close?: () => unknown }): void {
  const owner = localShutdownOwners.get(server);
  if (owner) { void owner().catch(() => undefined); return; }
  if (server.listening) server.close?.();
}

/** Idempotent, awaited owner for every local runtime resource. */
export function createLocalMusicRuntimeShutdown(resources: LocalMusicShutdownResources): () => Promise<void> {
  let shutdown: Promise<void> | undefined;
  const run = () => shutdown ??= (async () => {
    const failures: unknown[] = [];
    let pendingHttpClose: Promise<void> | undefined;
    try { await resources.stopRoutes(); } catch (error) { failures.push(error); }
    if (resources.server.listening) {
      let closeStarted = false;
      const closed = new Promise<void>((resolve) => {
        try {
          resources.server.close((error) => {
            if (error) failures.push(error);
            resolve();
          });
          closeStarted = true;
        } catch (error) {
          failures.push(error);
          resolve();
        }
      });
      let forceCloseSucceeded = true;
      try { resources.server.closeAllConnections?.(); }
      catch (error) { forceCloseSucceeded = false; failures.push(error); }
      if (closeStarted) {
        if (forceCloseSucceeded) await closed;
        else pendingHttpClose = closed;
      }
    } else {
      try { resources.server.closeAllConnections?.(); }
      catch (error) { failures.push(error); }
    }
    const ownedCleanup = closeLocalMusicOwnedResources(resources);
    if (pendingHttpClose) {
      const results = await Promise.allSettled([pendingHttpClose, ownedCleanup]);
      for (const result of results) if (result.status === "rejected") failures.push(result.reason);
    } else {
      try { await ownedCleanup; }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new Error("Local Music runtime shutdown failed");
  })();
  localShutdownOwners.set(resources.server, run);
  resources.server.once?.("close", () => { void run().catch(() => undefined); });
  return run;
}
