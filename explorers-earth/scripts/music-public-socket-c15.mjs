import { io } from "socket.io-client";
import {
  MUSIC_PREBROWSER_C14_ACK,
  runMusicPrebrowserC14Integration,
} from "./music-public-prebrowser-c14.mjs";

export const MUSIC_PUBLIC_SOCKET_C15_VERSION = "explorers-public-socket-c15/v1";

const EXPLORER_ORIGIN = "http://localhost:55173";
const SOCKET_PATH = "/ws";
const CONNECT_TIMEOUT_MS = 10_000;
const CODES = new Set(["none", "connection-failed", "connection-timeout", "disconnect-failed"]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

export function validateMusicPublicSocketC15Record(value) {
  if (!exactKeys(value, [
    "schemaVersion", "status", "code", "connections", "reconnects", "closed",
  ]) || value.schemaVersion !== MUSIC_PUBLIC_SOCKET_C15_VERSION
      || !["passed", "failed"].includes(value.status) || !CODES.has(value.code)
      || !Number.isSafeInteger(value.connections) || value.connections < 0 || value.connections > 2
      || !Number.isSafeInteger(value.reconnects) || value.reconnects < 0 || value.reconnects > 1
      || typeof value.closed !== "boolean") return false;
  return value.status === "passed"
    ? value.code === "none" && value.connections === 2 && value.reconnects === 1 && value.closed
    : value.connections === 2 && value.reconnects === 1
      ? value.code === "disconnect-failed" && !value.closed
      : value.code !== "none";
}

function isPositivelyDisconnected(socket) {
  return socket?.connected === false && socket?.disconnected === true;
}

function waitForConnection(socket) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("connect", connected);
      socket.off("connect_error", failed);
      resolve(code);
    };
    const connected = () => finish("none");
    const failed = () => finish("connection-failed");
    const timer = setTimeout(() => finish("connection-timeout"), CONNECT_TIMEOUT_MS);
    socket.once("connect", connected);
    socket.once("connect_error", failed);
    try { socket.connect(); }
    catch { finish("connection-failed"); }
  });
}

/**
 * Browser-free transport probe. It connects only to the fixed Explorer origin,
 * uses the exact Socket.IO path, disconnects once, then establishes one fresh
 * connection. Returned metadata is bounded and contains no slug or endpoint.
 */
export async function runMusicPublicSocketProxyProbe({
  explorerOrigin,
  publicSlug,
  socketFactory = io,
} = {}) {
  if (explorerOrigin !== EXPLORER_ORIGIN
      || typeof publicSlug !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(publicSlug)
      || typeof socketFactory !== "function") {
    throw new Error("C15 socket proxy qualification refused");
  }
  let socket;
  let connections = 0;
  let reconnects = 0;
  let closed = false;
  let code = "connection-failed";
  try {
    socket = socketFactory(EXPLORER_ORIGIN, {
      autoConnect: false,
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      auth: { publicSlug },
      extraHeaders: { Origin: EXPLORER_ORIGIN },
      reconnection: true,
    });
    if (!socket || typeof socket.connect !== "function" || typeof socket.disconnect !== "function"
        || typeof socket.once !== "function" || typeof socket.off !== "function") {
      throw new Error("C15 socket proxy qualification refused");
    }
    code = await waitForConnection(socket);
    if (code !== "none") throw new Error("C15 socket connection failed");
    connections = 1;
    try { socket.disconnect(); }
    catch {
      code = "disconnect-failed";
      throw new Error("C15 socket disconnect failed");
    }
    if (!isPositivelyDisconnected(socket)) {
      code = "disconnect-failed";
      throw new Error("C15 socket disconnect failed");
    }
    reconnects = 1;
    code = await waitForConnection(socket);
    if (code !== "none") throw new Error("C15 socket reconnection failed");
    connections = 2;
  } catch {
    // Only the fixed code selected at the transport boundary is retained.
  } finally {
    if (socket && typeof socket.disconnect === "function") {
      try {
        socket.disconnect();
        closed = isPositivelyDisconnected(socket);
        if (!closed) code = "disconnect-failed";
      } catch {
        code = "disconnect-failed";
        closed = false;
      }
    }
  }
  const passed = connections === 2 && reconnects === 1 && closed && code === "none";
  const record = {
    schemaVersion: MUSIC_PUBLIC_SOCKET_C15_VERSION,
    status: passed ? "passed" : "failed",
    code: passed ? "none" : code,
    connections,
    reconnects,
    closed,
  };
  if (!validateMusicPublicSocketC15Record(record)) {
    throw new Error("C15 socket proxy qualification contract failed");
  }
  return record;
}

/**
 * C15 deliberately reuses the exact C14 qualification and lifecycle contract.
 * Its socket probe runs while the published public resource is still inside
 * the C14 transactional snapshot; C14 then restores the phase and baseline.
 */
export async function runMusicPublicSocketC15Qualification({
  authority,
  initialSnapshot,
  fetchImpl,
  socketFactory = io,
  prebrowserRunner = runMusicPrebrowserC14Integration,
} = {}) {
  if (typeof socketFactory !== "function" || typeof prebrowserRunner !== "function") {
    throw new Error("C15 socket proxy qualification refused");
  }
  return prebrowserRunner({
    ack: MUSIC_PREBROWSER_C14_ACK,
    authority,
    initialSnapshot,
    fetchImpl,
    publicCapabilityProbe: async ({ publicSlug }) => {
      const record = await runMusicPublicSocketProxyProbe({
        explorerOrigin: authority?.explorerOrigin,
        publicSlug,
        socketFactory,
      });
      return record.status === "passed";
    },
  });
}
