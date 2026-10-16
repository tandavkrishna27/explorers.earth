import type { Server } from "node:http";
import express, { type Express } from "express";
import type { LocalPublicProfileGatewayConfig } from "../config/local-public-profile-gateway";
import { setupExplorersPublicProfileRoutes } from "../routes/explorersPublicProfileRoutes";
import { PublicProfileService, type PublicProfileGateway } from "./publicProfileService";

function applyLocalCors(app: Express, allowedOrigins: readonly string[]): void {
  app.use((request, response, next) => {
    const origin = request.get("origin");
    const allowed = Boolean(origin && allowedOrigins.includes(origin));
    if (allowed) {
      response.setHeader("Access-Control-Allow-Origin", origin!);
      response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Accept, Cache-Control, If-None-Match");
    }
    response.setHeader("Vary", "Origin, Access-Control-Request-Headers");
    if (allowed && request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  });
}

export function createLocalPublicProfileGatewayApp(config: LocalPublicProfileGatewayConfig, gateway: PublicProfileGateway): Express {
  const app = express();
  applyLocalCors(app, config.allowedOrigins);
  app.get("/health/live", (_request, response) => response.status(200).json({ status: "ok" }));
  const profiles = new PublicProfileService(gateway);
  setupExplorersPublicProfileRoutes(app, {
    peopleSector:(username,sectorSlug,limit,options)=>profiles.peopleSector(username,sectorSlug,limit,options),
    movieGenre:(username,genreSlug,limit,options)=>profiles.movieGenre(username,genreSlug,limit,options),
    shell: (username, options) => profiles.shell(username, options),
    category: (username, category, limit, options) => profiles.category(username, category, limit, options),
    detail: (username, category, slug, limit, options) => profiles.detail(username, category, slug, limit, options),
  });
  return app;
}

type StartDependencies = {
  readToken(tokenFile: string): Promise<string>;
  createGateway(token: string): PublicProfileGateway;
  listen?(app: Express, host: string, port: number): Promise<Server>;
};

function listen(app: Express, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function startLocalPublicProfileGateway(
  config: LocalPublicProfileGatewayConfig,
  dependencies: StartDependencies,
): Promise<{ shutdown(): Promise<void> }> {
  try {
    const token = await dependencies.readToken(config.tokenFile);
    if (!token || token.length < 16 || /\s/.test(token)) throw new Error("token");
    const app = createLocalPublicProfileGatewayApp(config, dependencies.createGateway(token));
    const server = await (dependencies.listen ?? listen)(app, config.host, config.port);
    return { shutdown: () => close(server) };
  } catch {
    throw new Error("LOCAL_PUBLIC_PROFILE_GATEWAY_REFUSED");
  }
}
