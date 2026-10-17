import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { MusicPrincipalError, resolveMusicPrincipalRequest, type MusicPrincipal } from "../middleware/musicPrincipal";
import type { MusicFeatureExposure } from "../services/musicFeatureDecisionService";
import { isExactMusicOriginAllowed } from "./musicSurfaceRoutes";

export function setupMusicFeatureRoutes(app: Express, dependencies: {
  resolvePrincipal(token: string): Promise<MusicPrincipal>;
  decide(principal: MusicPrincipal): MusicFeatureExposure;
  allowedOrigins: string[];
  requestIdFactory?: () => string;
}): void {
  app.get("/api/music/features", async (req: Request, res: Response) => {
    const requestId = dependencies.requestIdFactory?.() ?? randomUUID();
    res.setHeader("X-Request-Id", requestId);
    if (!isExactMusicOriginAllowed(req, dependencies.allowedOrigins)) {
      res.status(403).json({ version: "music-error/v1", error: { code: "ORIGIN_FORBIDDEN", message: "The request origin is not allowed.", action: "none", retryable: false, requestId } });
      return;
    }
    let principal: MusicPrincipal;
    try {
      principal = await resolveMusicPrincipalRequest(req, dependencies.resolvePrincipal);
    } catch (cause) {
      if (!(cause instanceof MusicPrincipalError)) {
        res.setHeader("Retry-After", "1");
        res.status(503).json({ version: "music-error/v1", error: { code: "SERVICE_UNAVAILABLE", message: "Music features are temporarily unavailable.", action: "retry", retryable: true, requestId } });
        return;
      }
      res.status(cause.status).json({ version: "music-error/v1", error: { code: cause.code, message: cause.message, action: cause.status === 403 ? "contact_support" : "authenticate", retryable: false, requestId } });
      return;
    }
    try {
      res.status(200).json(dependencies.decide(principal));
    } catch {
      res.setHeader("Retry-After", "1");
      res.status(503).json({ version: "music-error/v1", error: { code: "SERVICE_UNAVAILABLE", message: "Music features are temporarily unavailable.", action: "retry", retryable: true, requestId } });
    }
  });
}
