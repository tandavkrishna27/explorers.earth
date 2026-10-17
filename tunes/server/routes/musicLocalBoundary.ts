import type { Express } from "express";

const disabledNamespaces = [
  "/api/login", "/api/logout", "/api/register", "/api/check", "/api/csrf-token",
  "/api/auth", "/api/connect", "/api/verify-email", "/api/resend-verification",
  "/api/user/request-reactivation", "/api/user/reactivate",
  "/api/explorers/analytics", "/api/analytics",
] as const;
const lifecycleNamespace = "/api/music/identity/lifecycle";

function within(pathname: string, namespace: string): boolean {
  return pathname === namespace || pathname.startsWith(`${namespace}/`);
}

function normalizedPath(rawPath: string): string | undefined {
  let decoded = rawPath;
  try {
    // Also contain aliases decoded by another middleware or reverse proxy.
    for (let depth = 0; decoded.includes("%") && depth < 4; depth++) {
      decoded = decodeURIComponent(decoded);
    }
  } catch { return undefined; }
  if (decoded.includes("%")) return undefined;
  return decoded.toLowerCase().replace(/\/+/g, "/").replace(/\/+$/, "");
}

/** Install before native-session containment and all integration handlers. */
export function setupLocalMusicBoundary(app: Express): void {
  app.use((req, res, next) => {
    const pathname = normalizedPath(req.path);
    const lifecycleRead = pathname === `${lifecycleNamespace}/status`
      && (req.method === "GET" || req.method === "HEAD");
    if (pathname === undefined
        || disabledNamespaces.some((namespace) => within(pathname, namespace))
        || (within(pathname, lifecycleNamespace) && !lifecycleRead)) {
      return res.status(503).json({ error: { code: "LOCAL_CAPABILITY_DISABLED" } });
    }
    return next();
  });
}
