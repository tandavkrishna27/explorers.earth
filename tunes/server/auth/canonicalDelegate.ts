import type { Pool } from "pg";
import type { RequestHandler } from "express";

/**
 * Combined fixture startup: the canonical surfaces that the canonical application
 * must answer even while the Music composition owns the same listener.
 *
 * The platform fixture has to present ONE ingress that mounts both route graphs.
 * Ticket 1.2's route-graph invariant probes canonical surfaces, while the Music
 * HTTP and Socket.IO behaviour the end-to-end journey depends on has to keep
 * working. `server/api.ts` can only pick one startup, so the canonical graph is
 * delegated into the Music app rather than started as a second listener.
 *
 * `/api/explorers/v1/profiles/` is deliberately NOT delegated. The Music
 * composition mounts that prefix itself (`routes/index.ts` calls
 * `setupExplorersPublicProfileRoutes`) and fixture ingress keeps it on the Strapi
 * fixture (`nginx.replatform.conf`), so delegating it would move an existing
 * surface for no canonical probe's benefit. The longest-prefix exclusion here
 * mirrors the longest-prefix `^~` rule at nginx.
 */
const DELEGATED = /^\/(?:health\/live|api\/auth|api\/explorers\/v1)(?:\/|$)/;
const RETAINED_BY_MUSIC = /^\/api\/explorers\/v1\/profiles(?:\/|$)/;

/** Exported so the delegation boundary is assertable without a listener. */
export function isCanonicalDelegatedPath(path: string): boolean {
  return DELEGATED.test(path) && !RETAINED_BY_MUSIC.test(path);
}

/**
 * Builds the canonical application over the Music runtime's existing pool and
 * returns it as a single Express middleware.
 *
 * It must be installed BEFORE any Music body parser: Better Auth consumes the
 * original request stream, so a delegate appended after `createApp` would see a
 * body already drained by `contentBodyParser()`. Requests the canonical app does
 * not own call `next()` and continue through the Music composition untouched.
 *
 * The readiness assertion is the same one `startCanonicalServer` makes, repeated
 * here so combined startup cannot come up against an unmigrated canonical schema.
 */
export async function createCanonicalDelegate(
  pool: Pool,
  environment: NodeJS.ProcessEnv,
): Promise<RequestHandler> {
  const [{ createCanonicalApp }, { resolveExplorersAuthConfig }, { checkMusicDatabaseReadiness }] =
    await Promise.all([
      import("./canonicalApp"),
      import("./betterAuth"),
      import("../db/readiness"),
    ]);
  const config = resolveExplorersAuthConfig(environment);
  const readiness = await checkMusicDatabaseReadiness(pool);
  if (!readiness.ready) throw new Error("Canonical identity schema is not ready");
  const { app: canonical } = createCanonicalApp(pool, config);
  return (request, response, next) => {
    if (!isCanonicalDelegatedPath(request.path)) return next();
    return canonical(request, response, next);
  };
}
