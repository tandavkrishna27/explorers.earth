import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import {
  assertLoopbackAddress,
  createLoopbackSupertestScope,
  openLoopbackSupertest,
} from "./loopback-supertest";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function closeCallerOwnedServer(server: Server): Promise<void> {
  if (!server.listening && server.address() === null) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
    server.closeAllConnections?.();
  });
}

function listenOnLoopback(server: Server): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  });
}

function minimalApp(): RequestListener {
  const app = express();
  app.use(express.json());
  let count = 0;
  app.post("/counter", (request, response) => {
    if (request.get("Authorization") !== "Bearer exact") {
      response.status(401).json({ message: "unauthorized" });
      return;
    }
    count += Number(request.body.delta);
    response.status(200).json({ count });
  });
  app.get("/cookie/set", (_request, response) => {
    response.cookie("loopback-session", "present").status(204).end();
  });
  app.get("/cookie/required", (request, response) => {
    response.sendStatus(request.get("Cookie")?.includes("loopback-session=present") ? 200 : 401);
  });
  app.get("/reject", (request) => {
    request.socket.destroy();
  });
  return app;
}

function expectClosed(server: Server | undefined): void {
  expect(server?.listening).toBe(false);
  expect(server?.address()).toBeNull();
}

describe("assertLoopbackAddress", () => {
  it("accepts the exact IPv4 loopback authority", () => {
    expect(assertLoopbackAddress({
      address: "127.0.0.1",
      family: "IPv4",
      port: 49_152,
    })).toEqual({ host: "127.0.0.1", port: 49_152 });
  });

  it.each([
    ["a null address", null],
    ["a pipe name", "loopback-test-pipe"],
    ["an IPv6 wildcard", { address: "::", family: "IPv6", port: 49_152 }],
    ["IPv6 loopback", { address: "::1", family: "IPv6", port: 49_152 }],
    ["an IPv4 wildcard", { address: "0.0.0.0", family: "IPv4", port: 49_152 }],
    ["a non-loopback IPv4 host", { address: "192.0.2.1", family: "IPv4", port: 49_152 }],
    ["port zero", { address: "127.0.0.1", family: "IPv4", port: 0 }],
    ["a non-integral port", { address: "127.0.0.1", family: "IPv4", port: 49_152.5 }],
    ["a malformed family", { address: "127.0.0.1", family: "ipv4", port: 49_152 }],
    ["an incompatible family", { address: "127.0.0.1", family: "IPv6", port: 49_152 }],
  ] as const)("rejects %s", (_description, address) => {
    expect(() => assertLoopbackAddress(address as ReturnType<Server["address"]>)).toThrow();
  });
});

describe("openLoopbackSupertest", () => {
  it("binds a real app only to IPv4 loopback and preserves request and agent semantics until awaited cleanup", async () => {
    const scope = createLoopbackSupertestScope();
    let observedServer: Server | undefined;
    try {
      const session = await scope.open({ app: minimalApp() });
      observedServer = session.server;
      expect(session.server.listening).toBe(true);
      expect(session.server.address()).toMatchObject({ address: "127.0.0.1", family: "IPv4" });
      expect(session.address.port).toBeGreaterThan(0);

      await session.request.post("/counter")
        .set("Authorization", "Bearer exact")
        .send({ delta: 1 })
        .expect(200, { count: 1 });
      await session.request.post("/counter")
        .set("Authorization", "Bearer exact")
        .send({ delta: 1 })
        .expect(200, { count: 2 });

      await session.agent.get("/cookie/set").expect(204);
      await session.agent.get("/cookie/required").expect(200);
    } finally {
      await scope.closeAll();
    }
    expectClosed(observedServer);
  });

  it("resolves only after listening and address validation", async () => {
    const server = createServer(minimalApp());
    const allowListen = deferred();
    const listenCalled = deferred();
    const originalListen = server.listen;
    server.listen = function (...arguments_: Parameters<Server["listen"]>): Server {
      listenCalled.resolve();
      void allowListen.promise.then(() => {
        Reflect.apply(originalListen, server, arguments_);
      });
      return server;
    } as Server["listen"];

    let session: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    try {
      const opening = openLoopbackSupertest({ server });
      const observedOpening = opening.then(
        (value) => ({ state: "fulfilled" as const, value }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );
      const first = await Promise.race([
        listenCalled.promise.then(() => ({ state: "listen-called" as const })),
        observedOpening,
      ]);
      if (first.state === "rejected") throw first.error;
      expect(first.state).toBe("listen-called");
      let settled = false;
      void opening.then(
        () => { settled = true; },
        () => { settled = true; },
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      allowListen.resolve();
      session = await opening;
      expect(session.address).toEqual({
        host: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
      });
    } finally {
      server.listen = originalListen;
      if (session) await session.close();
      else await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("uses the exact supplied unbound server", async () => {
    const server = createServer(minimalApp());
    const session = await openLoopbackSupertest({ server });
    try {
      expect(session.server).toBe(server);
      await session.request.post("/counter")
        .set("Authorization", "Bearer exact")
        .send({ delta: 1 })
        .expect(200, { count: 1 });
    } finally {
      await session.close();
    }
    expectClosed(server);
  });

  it("rejects an already-listening server without closing or rebinding it", async () => {
    const server = createServer(minimalApp());
    await listenOnLoopback(server);
    const before = server.address();
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toThrow(/already|listening/i);
      expect(server.listening).toBe(true);
      expect(server.address()).toEqual(before);
    } finally {
      await closeCallerOwnedServer(server);
    }
  });

  it("keeps a supplied server listening after an ordinary request until session.close", async () => {
    const server = createServer(minimalApp());
    let session: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    try {
      session = await openLoopbackSupertest({ server });
      await session.request.post("/counter")
        .set("Authorization", "Bearer exact")
        .send({ delta: 1 })
        .expect(200);
      expect(server.listening).toBe(true);
      expect(server.address()).toMatchObject({ address: "127.0.0.1", family: "IPv4" });
      await session.close();
    } finally {
      await session?.close().catch(() => undefined);
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("coalesces concurrent session closes while a held request is active", async () => {
    const responseStarted = deferred();
    const releaseResponse = deferred();
    const app = express();
    app.get("/hold", async (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.write("held");
      responseStarted.resolve();
      await releaseResponse.promise;
      response.end("released");
    });
    let session: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    let heldResult: Promise<void> | undefined;
    try {
      session = await openLoopbackSupertest({ app });
      heldResult = session.request.get("/hold").then(() => undefined);
      const observedHeldResult = heldResult.then(
        () => ({ state: "request-finished" as const }),
        (error: unknown) => ({ state: "request-rejected" as const, error }),
      );
      const first = await Promise.race([
        responseStarted.promise.then(() => ({ state: "response-started" as const })),
        observedHeldResult,
      ]);
      if (first.state === "request-rejected") throw first.error;
      expect(first.state).toBe("response-started");

      const firstClose = session.close();
      const secondClose = session.close();
      expect(secondClose).toBe(firstClose);
      let closeSettled = false;
      void firstClose.then(
        () => { closeSettled = true; },
        () => { closeSettled = true; },
      );
      await Promise.resolve();
      expect(closeSettled).toBe(false);

      releaseResponse.resolve();
      await heldResult;
      await expect(firstClose).resolves.toBeUndefined();
      await expect(secondClose).resolves.toBeUndefined();
      expectClosed(session.server);
    } finally {
      releaseResponse.resolve();
      await heldResult?.catch(() => undefined);
      await session?.close().catch(() => undefined);
      if (session) await closeCallerOwnedServer(session.server);
    }
  });

  it("surfaces one terminal close failure to every concurrent caller", async () => {
    const server = createServer(minimalApp());
    const originalClose = server.close;
    const closeFailure = new Error("EXACT_CLOSE_FAILURE");
    server.close = function (callback?: (error?: Error) => void): Server {
      return originalClose.call(server, () => callback?.(closeFailure));
    } as Server["close"];
    const session = await openLoopbackSupertest({ server });
    try {
      const firstClose = session.close();
      const secondClose = session.close();
      expect(secondClose).toBe(firstClose);
      await expect(firstClose).rejects.toBe(closeFailure);
      await expect(secondClose).rejects.toBe(closeFailure);
      expect(session.close()).toBe(firstClose);
    } finally {
      server.close = originalClose;
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("rejects after both bounded close phases when closure cannot reach the terminal predicate", async () => {
    const server = createServer(minimalApp());
    const originalClose = server.close;
    const originalCloseAllConnections = server.closeAllConnections;
    server.close = function (): Server { return server; } as Server["close"];
    server.closeAllConnections = () => undefined;
    const session = await openLoopbackSupertest({ server });
    try {
      await expect(session.close()).rejects.toThrow(/close|closed|timeout/i);
      expect(server.listening).toBe(true);
    } finally {
      server.close = originalClose;
      server.closeAllConnections = originalCloseAllConnections;
      await closeCallerOwnedServer(server);
    }
  }, 6_000);

  it("rejects a synchronous listen throw and leaves no server handle", async () => {
    const server = createServer(minimalApp());
    const originalListen = server.listen;
    const exactFailure = new Error("EXACT_SYNCHRONOUS_LISTEN_FAILURE");
    server.listen = function (): Server { throw exactFailure; } as Server["listen"];
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toBe(exactFailure);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("settles an emitted open error once and leaves no server handle", async () => {
    const server = createServer(minimalApp());
    const originalListen = server.listen;
    const exactFailure = new Error("EXACT_EMITTED_LISTEN_FAILURE");
    server.listen = function (): Server {
      queueMicrotask(() => server.emit("error", exactFailure));
      return server;
    } as Server["listen"];
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toBe(exactFailure);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("rejects after the bounded readiness phase when listen emits neither listening nor error", async () => {
    const server = createServer(minimalApp());
    const originalListen = server.listen;
    server.listen = function (): Server { return server; } as Server["listen"];
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toThrow(/listen|ready|timeout/i);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  }, 3_000);

  it("prevents a deferred listen from exposing a listener after readiness timeout", async () => {
    const server = createServer(minimalApp());
    const originalListen = server.listen;
    let capturedArguments: Parameters<Server["listen"]> | undefined;
    server.listen = function (...arguments_: Parameters<Server["listen"]>): Server {
      capturedArguments = arguments_;
      return server;
    } as Server["listen"];
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toThrow(/listen|ready|timeout/i);
      expect(capturedArguments).toBeDefined();
      const observedLateClose = new Promise<void>((resolveClose, rejectClose) => {
        const timer = setTimeout(() => rejectClose(new Error("LATE_LISTENER_SURVIVED")), 1_000);
        server.once("close", () => {
          clearTimeout(timer);
          resolveClose();
        });
      });
      Reflect.apply(originalListen, server, capturedArguments!);
      await observedLateClose;
      expectClosed(server);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
  }, 4_000);

  it("closes after post-readiness address rejection", async () => {
    const server = createServer(minimalApp());
    const originalAddress = server.address;
    server.address = function (): ReturnType<Server["address"]> {
      server.address = originalAddress;
      return { address: "0.0.0.0", family: "IPv4", port: 49_152 };
    };
    try {
      await expect(openLoopbackSupertest({ server })).rejects.toThrow();
      expectClosed(server);
    } finally {
      server.address = originalAddress;
      await closeCallerOwnedServer(server);
    }
  });

  it("aggregates post-readiness address rejection with cleanup failure", async () => {
    const server = createServer(minimalApp());
    const originalAddress = server.address;
    const originalClose = server.close;
    const cleanupFailure = new Error("EXACT_OPEN_CLEANUP_FAILURE");
    server.address = function (): ReturnType<Server["address"]> {
      server.address = originalAddress;
      return { address: "::", family: "IPv6", port: 49_152 };
    };
    server.close = function (callback?: (error?: Error) => void): Server {
      return originalClose.call(server, () => callback?.(cleanupFailure));
    } as Server["close"];
    try {
      const failure = await openLoopbackSupertest({ server }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        expect.any(Error),
        cleanupFailure,
      ]);
    } finally {
      server.address = originalAddress;
      server.close = originalClose;
      await closeCallerOwnedServer(server);
    }
    expectClosed(server);
  });

  it("cleans up after a rejected Supertest request", async () => {
    const scope = createLoopbackSupertestScope();
    let observedServer: Server | undefined;
    try {
      const session = await scope.open({ app: minimalApp() });
      observedServer = session.server;
      await expect(session.request.get("/reject")).rejects.toThrow();
    } finally {
      await scope.closeAll();
    }
    expectClosed(observedServer);
  });

  it("preserves an assertion failure while finally awaits cleanup", async () => {
    const scope = createLoopbackSupertestScope();
    let observedServer: Server | undefined;
    let assertionFailure: unknown;
    try {
      const session = await scope.open({ app: minimalApp() });
      observedServer = session.server;
      try {
        const response = await session.request.post("/counter")
          .set("Authorization", "Bearer exact")
          .send({ delta: 1 })
          .expect(200);
        expect(response.status).toBe(418);
      } catch (error) {
        assertionFailure = error;
      } finally {
        await scope.closeAll();
      }
    } finally {
      await scope.closeAll();
    }
    expect(assertionFailure).toBeInstanceOf(Error);
    expect(String(assertionFailure)).toMatch(/expected.*418|418/i);
    expectClosed(observedServer);
  });

  it("keeps ordinary request cookies isolated while agent persists cookies", async () => {
    const session = await openLoopbackSupertest({ app: minimalApp() });
    try {
      await session.request.get("/cookie/set").expect(204);
      await session.request.get("/cookie/required").expect(401);
      await session.agent.get("/cookie/set").expect(204);
      await session.agent.get("/cookie/required").expect(200);
    } finally {
      await session.close();
    }
  });
});

describe("createLoopbackSupertestScope", () => {
  it("closes two sessions sequentially in reverse creation order", async () => {
    const order: string[] = [];
    const firstServer = createServer(minimalApp());
    const secondServer = createServer(minimalApp());
    const firstClose = firstServer.close;
    const secondClose = secondServer.close;
    firstServer.close = function (callback?: (error?: Error) => void): Server {
      order.push("first");
      return firstClose.call(firstServer, callback);
    } as Server["close"];
    secondServer.close = function (callback?: (error?: Error) => void): Server {
      order.push("second");
      return secondClose.call(secondServer, callback);
    } as Server["close"];
    const scope = createLoopbackSupertestScope();
    try {
      await scope.open({ server: firstServer });
      await scope.open({ server: secondServer });
      await scope.closeAll();
      expect(order).toEqual(["second", "first"]);
      expectClosed(firstServer);
      expectClosed(secondServer);
    } finally {
      await scope.closeAll().catch(() => undefined);
      firstServer.close = firstClose;
      secondServer.close = secondClose;
      await closeCallerOwnedServer(firstServer);
      await closeCallerOwnedServer(secondServer);
    }
  });

  it("coalesces concurrent drains while a held close is active", async () => {
    const responseStarted = deferred();
    const releaseResponse = deferred();
    const app = express();
    app.get("/hold", async (_request, response) => {
      response.writeHead(200);
      response.write("held");
      responseStarted.resolve();
      await releaseResponse.promise;
      response.end("released");
    });
    const scope = createLoopbackSupertestScope();
    let session: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    let heldResult: Promise<void> | undefined;
    try {
      session = await scope.open({ app });
      heldResult = session.request.get("/hold").then(() => undefined);
      const observedHeldResult = heldResult.then(
        () => ({ state: "request-finished" as const }),
        (error: unknown) => ({ state: "request-rejected" as const, error }),
      );
      const first = await Promise.race([
        responseStarted.promise.then(() => ({ state: "response-started" as const })),
        observedHeldResult,
      ]);
      if (first.state === "request-rejected") throw first.error;
      expect(first.state).toBe("response-started");

      const firstDrain = scope.closeAll();
      const secondDrain = scope.closeAll();
      expect(secondDrain).toBe(firstDrain);
      let drainSettled = false;
      void firstDrain.then(
        () => { drainSettled = true; },
        () => { drainSettled = true; },
      );
      await Promise.resolve();
      expect(drainSettled).toBe(false);

      releaseResponse.resolve();
      await heldResult;
      await expect(firstDrain).resolves.toBeUndefined();
      await expect(secondDrain).resolves.toBeUndefined();
      expectClosed(session.server);
    } finally {
      releaseResponse.resolve();
      await heldResult?.catch(() => undefined);
      await scope.closeAll().catch(() => undefined);
      if (session) await closeCallerOwnedServer(session.server);
    }
  });

  it("drains an opening registered immediately before closeAll without leaking", async () => {
    const server = createServer(minimalApp());
    const allowListen = deferred();
    const listenCalled = deferred();
    const originalListen = server.listen;
    server.listen = function (...arguments_: Parameters<Server["listen"]>): Server {
      listenCalled.resolve();
      void allowListen.promise.then(() => Reflect.apply(originalListen, server, arguments_));
      return server;
    } as Server["listen"];
    const scope = createLoopbackSupertestScope();
    try {
      const opening = scope.open({ server });
      const observedOpening = opening.then(
        (value) => ({ state: "fulfilled" as const, value }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );
      const first = await Promise.race([
        listenCalled.promise.then(() => ({ state: "listen-called" as const })),
        observedOpening,
      ]);
      if (first.state === "rejected") throw first.error;
      expect(first.state).toBe("listen-called");
      const draining = scope.closeAll();
      const observedDraining = draining.then(
        () => ({ state: "fulfilled" as const }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );
      allowListen.resolve();
      const session = await opening;
      const drainResult = await observedDraining;
      if (drainResult.state === "rejected") throw drainResult.error;
      expectClosed(session.server);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
  });

  it("observes a pending controlled open failure exactly once during drain", async () => {
    const server = createServer(minimalApp());
    const releaseFailure = deferred();
    const listenCalled = deferred();
    const originalListen = server.listen;
    const exactFailure = new Error("EXACT_PENDING_OPEN_FAILURE");
    let observedRejections = 0;
    server.listen = function (): Server {
      listenCalled.resolve();
      void releaseFailure.promise.then(() => server.emit("error", exactFailure));
      return server;
    } as Server["listen"];
    const scope = createLoopbackSupertestScope();
    try {
      const opening = scope.open({ server });
      const observedOpening = opening.catch((error: unknown) => {
        observedRejections += 1;
        throw error;
      });
      const safelyObservedOpening = observedOpening.then(
        (value) => ({ state: "fulfilled" as const, value }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );
      const first = await Promise.race([
        listenCalled.promise.then(() => ({ state: "listen-called" as const })),
        safelyObservedOpening,
      ]);
      if (first.state === "rejected") throw first.error;
      expect(first.state).toBe("listen-called");
      const draining = scope.closeAll();
      const observedDraining = draining.then(
        () => ({ state: "fulfilled" as const }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );
      releaseFailure.resolve();
      await expect(observedOpening).rejects.toBe(exactFailure);
      const drainResult = await observedDraining;
      if (drainResult.state === "rejected") throw drainResult.error;
      expect(observedRejections).toBe(1);
      expectClosed(server);
    } finally {
      server.listen = originalListen;
      await closeCallerOwnedServer(server);
    }
  });

  it("rejects opens during an active drain before listen and is reusable after success", async () => {
    const responseStarted = deferred();
    const releaseResponse = deferred();
    const activeApp = express();
    activeApp.get("/hold", async (_request, response) => {
      response.writeHead(200);
      response.write("held");
      responseStarted.resolve();
      await releaseResponse.promise;
      response.end("released");
    });
    const scope = createLoopbackSupertestScope();
    let active: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    let reused: Awaited<ReturnType<typeof openLoopbackSupertest>> | undefined;
    let heldResult: Promise<void> | undefined;
    const rejectedServer = createServer(minimalApp());
    let listenCalls = 0;
    const originalListen = rejectedServer.listen;
    rejectedServer.listen = function (): Server {
      listenCalls += 1;
      return rejectedServer;
    } as Server["listen"];
    try {
      active = await scope.open({ app: activeApp });
      heldResult = active.request.get("/hold").then(() => undefined);
      const observedHeldResult = heldResult.then(
        () => ({ state: "request-finished" as const }),
        (error: unknown) => ({ state: "request-rejected" as const, error }),
      );
      const first = await Promise.race([
        responseStarted.promise.then(() => ({ state: "response-started" as const })),
        observedHeldResult,
      ]);
      if (first.state === "request-rejected") throw first.error;
      expect(first.state).toBe("response-started");
      const draining = scope.closeAll();
      const observedDraining = draining.then(
        () => ({ state: "fulfilled" as const }),
        (error: unknown) => ({ state: "rejected" as const, error }),
      );

      await expect(scope.open({ server: rejectedServer })).rejects.toThrow(/drain|closing/i);
      expect(listenCalls).toBe(0);
      expectClosed(rejectedServer);
      releaseResponse.resolve();
      await heldResult;
      const drainResult = await observedDraining;
      if (drainResult.state === "rejected") throw drainResult.error;
      reused = await scope.open({ app: minimalApp() });
      await scope.closeAll();
      expectClosed(reused.server);
    } finally {
      releaseResponse.resolve();
      await heldResult?.catch(() => undefined);
      await scope.closeAll().catch(() => undefined);
      if (active) await closeCallerOwnedServer(active.server);
      if (reused) await closeCallerOwnedServer(reused.server);
      rejectedServer.listen = originalListen;
      await closeCallerOwnedServer(rejectedServer);
    }
  });

  it("retains a pending open cleanup failure in the memoized poisoned drain", async () => {
    const server = createServer(minimalApp());
    const originalAddress = server.address;
    const originalClose = server.close;
    const cleanupFailure = new Error("EXACT_PENDING_OPEN_CLEANUP_FAILURE");
    server.address = function (): ReturnType<Server["address"]> {
      server.address = originalAddress;
      return { address: "0.0.0.0", family: "IPv4", port: 49_152 };
    };
    server.close = function (callback?: (error?: Error) => void): Server {
      return originalClose.call(server, () => callback?.(cleanupFailure));
    } as Server["close"];

    const rejectedServer = createServer(minimalApp());
    const originalRejectedListen = rejectedServer.listen;
    let rejectedListenCalls = 0;
    rejectedServer.listen = function (): Server {
      rejectedListenCalls += 1;
      throw new Error("POISONED_SCOPE_CALLED_LISTEN");
    } as Server["listen"];

    const scope = createLoopbackSupertestScope();
    try {
      const opening = scope.open({ server });
      const observedOpening = opening.then(
        (session) => ({ status: "fulfilled" as const, session }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      const firstDrain = scope.closeAll();
      const secondDrain = scope.closeAll();
      expect(secondDrain).toBe(firstDrain);
      const firstDrainOutcome = firstDrain.then(
        () => ({ status: "fulfilled" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      const secondDrainOutcome = secondDrain.then(
        () => ({ status: "fulfilled" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      const openingOutcome = await observedOpening;
      expect(openingOutcome).toEqual(expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          errors: [expect.any(Error), cleanupFailure],
        }),
      }));
      const [firstOutcome, secondOutcome] = await Promise.all([
        firstDrainOutcome,
        secondDrainOutcome,
      ]);
      expect(firstOutcome).toEqual(expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ errors: [cleanupFailure] }),
      }));
      expect(secondOutcome).toEqual(firstOutcome);
      expect(scope.closeAll()).toBe(firstDrain);
      await expect(scope.open({ server: rejectedServer })).rejects.toThrow(/drain|poison/i);
      expect(rejectedListenCalls).toBe(0);
    } finally {
      await scope.closeAll().catch(() => undefined);
      server.address = originalAddress;
      server.close = originalClose;
      rejectedServer.listen = originalRejectedListen;
      await closeCallerOwnedServer(server);
      await closeCallerOwnedServer(rejectedServer);
    }
  });

  it("aggregates every reverse-order cleanup failure and poisons the scope", async () => {
    const scope = createLoopbackSupertestScope();
    const firstServer = createServer(minimalApp());
    const secondServer = createServer(minimalApp());
    const firstNativeClose = firstServer.close;
    const secondNativeClose = secondServer.close;
    const firstFailure = new Error("EXACT_FIRST_CLOSE_FAILURE");
    const secondFailure = new Error("EXACT_SECOND_CLOSE_FAILURE");
    firstServer.close = function (callback?: (error?: Error) => void): Server {
      return firstNativeClose.call(firstServer, () => callback?.(firstFailure));
    } as Server["close"];
    secondServer.close = function (callback?: (error?: Error) => void): Server {
      return secondNativeClose.call(secondServer, () => callback?.(secondFailure));
    } as Server["close"];
    const unopened = createServer(minimalApp());
    try {
      await scope.open({ server: firstServer });
      await scope.open({ server: secondServer });
      const drain = scope.closeAll();
      await expect(drain).rejects.toEqual(expect.objectContaining({
        errors: [secondFailure, firstFailure],
      }));
      expect(scope.closeAll()).toBe(drain);
      await expect(scope.open({ server: unopened })).rejects.toThrow();
      expectClosed(unopened);
    } finally {
      await scope.closeAll().catch(() => undefined);
      firstServer.close = firstNativeClose;
      secondServer.close = secondNativeClose;
      await closeCallerOwnedServer(firstServer);
      await closeCallerOwnedServer(secondServer);
      await closeCallerOwnedServer(unopened);
    }
  });
});
