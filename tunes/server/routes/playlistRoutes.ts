import type { Express } from "express";
import type { Server } from "http";
import { registerCanonicalMusicServer } from "./legacyRemainingRoutes";
import { createMusicSocketServer, type MusicSocketDependencies } from "../socket/musicSocketServer";

export function setupPlaylistRoutes(app: Express, dependencies: MusicSocketDependencies): Server {
  const server = createMusicSocketServer(app, dependencies);
  registerCanonicalMusicServer(app, server);
  return server;
}
