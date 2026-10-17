import { createServer, type RequestListener, type Server } from "node:http";
import type { Socket } from "node:net";
import supertest from "supertest";

export type LoopbackTarget =
  | { app: RequestListener }
  | { server: Server };

export type LoopbackAddress = Readonly<{
  host: "127.0.0.1";
  port: number;
}>;

export type LoopbackSupertestSession = Readonly<{
  server: Server;
  address: LoopbackAddress;
  request: ReturnType<typeof supertest>;
  agent: ReturnType<typeof supertest.agent>;
  close(): Promise<void>;
}>;

export function assertLoopbackAddress(
  address: ReturnType<Server["address"]>,
): LoopbackAddress {
  if (
    address === null
    || typeof address === "string"
    || address.address !== "127.0.0.1"
    || address.family !== "IPv4"
    || !Number.isInteger(address.port)
    || address.port <= 0
    || address.port > 65_535
  ) {
    throw new Error("server did not bind to an ephemeral IPv4 loopback address");
  }
  return { host: "127.0.0.1", port: address.port };
}

const READINESS_TIMEOUT_MS = 2_000;
const CLOSE_PHASE_TIMEOUT_MS = 2_000;

function serverIsClosed(server: Server): boolean {
  return server.listening === false && server.address() === null;
}

function waitForSignalOrTimeout(signal: Promise<void>, milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveWait();
    };
    const timer = setTimeout(finish, milliseconds);
    void signal.then(finish, finish);
  });
}

function combineFailures(message: string, failures: unknown[]): unknown {
  return failures.length === 1 ? failures[0] : new AggregateError(failures, message);
}

function createSessionLifecycle(server: Server) {
  const trackedSockets = new Map<Socket, () => void>();
  const onConnection = (socket: Socket) => {
    const onSocketClose = () => trackedSockets.delete(socket);
    trackedSockets.set(socket, onSocketClose);
    socket.once("close", onSocketClose);
  };
  server.on("connection", onConnection);

  const detachTracking = () => {
    server.off("connection", onConnection);
    trackedSockets.forEach((onSocketClose, socket) => {
      socket.off("close", onSocketClose);
    });
    trackedSockets.clear();
  };

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (serverIsClosed(server)) {
        detachTracking();
        return;
      }

      const failures: unknown[] = [];
      let closeObserved = false;
      let notifyClosed!: () => void;
      const closedSignal = new Promise<void>((resolveClosed) => { notifyClosed = resolveClosed; });
      const onClose = () => {
        closeObserved = true;
        notifyClosed();
      };
      server.once("close", onClose);

      try {
        try {
          server.close((error) => {
            if (error) failures.push(error);
            if (serverIsClosed(server)) {
              closeObserved = true;
              notifyClosed();
            }
          });
        } catch (error) {
          failures.push(error);
        }
        try {
          server.closeIdleConnections?.();
        } catch (error) {
          failures.push(error);
        }

        if (!closeObserved || !serverIsClosed(server)) {
          await waitForSignalOrTimeout(closedSignal, CLOSE_PHASE_TIMEOUT_MS);
        }
        if (!closeObserved || !serverIsClosed(server)) {
          trackedSockets.forEach((_onSocketClose, socket) => socket.destroy());
          try {
            server.closeAllConnections?.();
          } catch (error) {
            failures.push(error);
          }
          if (!closeObserved || !serverIsClosed(server)) {
            await waitForSignalOrTimeout(closedSignal, CLOSE_PHASE_TIMEOUT_MS);
          }
        }
        if (!closeObserved || !serverIsClosed(server)) {
          failures.push(new Error("loopback server did not close within the bounded cleanup phases"));
        }
      } finally {
        server.off("close", onClose);
        detachTracking();
      }

      if (failures.length > 0) throw combineFailures("loopback server cleanup failed", failures);
    })();
    return closePromise;
  };

  return { close };
}

function waitForLoopbackReadiness(server: Server, controller: AbortController): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.off("error", onError);
      server.off("listening", onListening);
      if (error === undefined) resolveReady();
      else rejectReady(error);
    };
    const onError = (error: Error) => settle(error);
    const onListening = () => settle();
    const timer = setTimeout(() => {
      controller.abort();
      settle(new Error("loopback server readiness timeout"));
    }, READINESS_TIMEOUT_MS);

    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen({
        host: "127.0.0.1",
        port: 0,
        exclusive: true,
        signal: controller.signal,
      });
    } catch (error) {
      settle(error);
    }
  });
}

type OpeningCleanupOutcome =
  | { status: "not-required" }
  | { status: "succeeded" }
  | { status: "failed"; error: unknown };

async function openLoopbackSupertestWithCleanupOutcome(
  target: LoopbackTarget,
  observeCleanup: (outcome: OpeningCleanupOutcome) => void,
): Promise<LoopbackSupertestSession> {
  const server = "app" in target ? createServer(target.app) : target.server;
  if (server.listening) {
    throw new Error("already-listening server remains caller-owned");
  }

  const controller = new AbortController();
  const lifecycle = createSessionLifecycle(server);
  try {
    await waitForLoopbackReadiness(server, controller);
  } catch (openingError) {
    controller.abort();
    try {
      await lifecycle.close();
      observeCleanup({ status: "succeeded" });
    } catch (cleanupError) {
      observeCleanup({ status: "failed", error: cleanupError });
      throw new AggregateError([openingError, cleanupError], "loopback server open and cleanup failed");
    }
    throw openingError;
  }

  let address: LoopbackAddress;
  try {
    address = assertLoopbackAddress(server.address());
  } catch (openingError) {
    try {
      await lifecycle.close();
      observeCleanup({ status: "succeeded" });
    } catch (cleanupError) {
      observeCleanup({ status: "failed", error: cleanupError });
      throw new AggregateError([openingError, cleanupError], "loopback server address validation and cleanup failed");
    } finally {
      controller.abort();
    }
    throw openingError;
  }

  return {
    server,
    address,
    request: supertest(server),
    agent: supertest.agent(server),
    close: lifecycle.close,
  };
}

export async function openLoopbackSupertest(
  target: LoopbackTarget,
): Promise<LoopbackSupertestSession> {
  return openLoopbackSupertestWithCleanupOutcome(target, () => undefined);
}

export function createLoopbackSupertestScope(): {
  open(target: LoopbackTarget): Promise<LoopbackSupertestSession>;
  closeAll(): Promise<void>;
} {
  type Entry = {
    promise: Promise<LoopbackSupertestSession>;
    openingCleanup: OpeningCleanupOutcome;
  };
  const entries: Entry[] = [];
  let activeDrain: Promise<void> | undefined;

  return {
    open(target: LoopbackTarget): Promise<LoopbackSupertestSession> {
      if (activeDrain) return Promise.reject(new Error("loopback scope is draining or poisoned"));

      let resolveOpen!: (session: LoopbackSupertestSession) => void;
      let rejectOpen!: (error: unknown) => void;
      const promise = new Promise<LoopbackSupertestSession>((resolvePromise, rejectPromise) => {
        resolveOpen = resolvePromise;
        rejectOpen = rejectPromise;
      });
      const entry: Entry = {
        promise,
        openingCleanup: { status: "not-required" },
      };
      entries.push(entry);
      queueMicrotask(() => {
        void openLoopbackSupertestWithCleanupOutcome(target, (outcome) => {
          entry.openingCleanup = outcome;
        }).then(resolveOpen, rejectOpen);
      });
      return promise;
    },
    closeAll(): Promise<void> {
      if (activeDrain) return activeDrain;
      const snapshot = entries.splice(0);
      let resolveDrain!: () => void;
      let rejectDrain!: (error: unknown) => void;
      const drain = new Promise<void>((resolvePromise, rejectPromise) => {
        resolveDrain = resolvePromise;
        rejectDrain = rejectPromise;
      });
      activeDrain = drain;
      void (async () => {
        const outcomes = await Promise.all(snapshot.map(async (entry) => {
          try {
            return { status: "fulfilled" as const, session: await entry.promise };
          } catch (openingError) {
            return {
              status: "rejected" as const,
              openingError,
              openingCleanup: entry.openingCleanup,
            };
          }
        }));
        const cleanupFailures: unknown[] = [];
        for (const outcome of outcomes.reverse()) {
          if (outcome.status === "rejected") {
            if (outcome.openingCleanup.status === "failed") {
              cleanupFailures.push(outcome.openingCleanup.error);
            }
            continue;
          }
          try {
            await outcome.session.close();
          } catch (error) {
            cleanupFailures.push(error);
          }
        }
        if (cleanupFailures.length > 0) {
          throw new AggregateError(cleanupFailures, "loopback scope cleanup failed");
        }
      })().then(resolveDrain, rejectDrain);
      void drain.then(
        () => {
          if (activeDrain === drain) activeDrain = undefined;
        },
        () => undefined,
      );
      return drain;
    },
  };
}

export type LoopbackSupertestResponse = supertest.Response;
