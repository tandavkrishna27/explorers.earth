import type { Express } from "express";
import type { Server } from "http";

const legacyServers = new WeakMap<Express, Server>();

export function ensureLegacyRemainingRoutes(app: Express): Server {
  const existingServer = legacyServers.get(app);
  if (existingServer) {
    return existingServer;
  }
  throw new Error("The canonical Music socket server must be registered before route modules.");
}

export function registerCanonicalMusicServer(app: Express, server: Server): void {
  if (legacyServers.has(app)) throw new Error("The Music server is already registered.");
  legacyServers.set(app, server);
}
