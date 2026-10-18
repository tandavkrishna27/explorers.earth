import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { errorEnvelope, type ContainmentCode } from "../containment-error-contract";
import { matchCanonicalRetiredSurface } from "../policies/canonicalRetiredSurfaces";

function requestIdFor(supplied: string | undefined): string {
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied) ? supplied : randomUUID();
}

function codeFor(family: string): ContainmentCode {
  if (family === "graphql-service-proxy") return "GRAPHQL_PROXY_REMOVED";
  if (family === "legacy-browser-identity") return "LEGACY_IDENTITY_ROUTE_REMOVED";
  return "LEGACY_OWNER_ROUTE_REMOVED";
}

/**
 * Fail-closed 410 boundary for every surface the Music composition retired.
 * Mounted ahead of contentBodyParser() so a retired path never has its body read.
 *
 * The `"/{*name}"` wildcard is the idiom already used by
 * routes/musicSurfaceRoutes.ts:735 and is pinned by the route inventory.
 */
export function setupCanonicalRetiredSurfaces(app: Express): void {
  app.all("/{*canonicalRetiredPath}", (request, response, next) => {
    const retirement = matchCanonicalRetiredSurface(request.originalUrl);
    if (!retirement) return next();
    const requestId = requestIdFor(request.get("x-request-id"));
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Cache-Control", "no-store");
    return response.status(410).json(errorEnvelope(codeFor(retirement.family), requestId));
  });
}
