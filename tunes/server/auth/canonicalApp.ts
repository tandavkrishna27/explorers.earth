import {MovieCatalog} from '../services/movieCatalog';
import {authorizeOperation} from '../application/authorization';
import {setupCanonicalAnalyticsRoutes} from '../routes/explorersCanonicalAnalyticsRoutes';
import { contentBodyParser } from '../application/contentBodyParser';
import { randomUUID } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { fromNodeHeaders, toNodeHandler } from "#auth-runtime";
import type { Pool } from "pg";
import { ensureInitialAccount } from "./initialAccount";
import { createExplorersAuth, type ExplorersAuthConfig } from "./betterAuth";
import { accountDtoSchema, type ApiError } from "../../shared/explorersContract";
import { createRecoveryIntent, recoveryCookieOptions, recoveryIntentCookie, recoveryProofCookie,
  recoveryProofCookieOptions } from "./recoveryCallback";
import { revokeRecoveryProof } from "./recoveryProof";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { AuthorizationError } from "../application/authorization";
import { ProfileService } from "../application/profiles";
import { setupExplorersAccountRoutes } from "../routes/explorersAccountRoutes";
import { setupExplorersPublicProfileRoutes } from "../routes/explorersPublicProfileRoutes";
import { PublicProfileService } from "../publicProfile/publicProfileService";
import { PostgresPublicProfileGateway } from "../publicProfile/postgresPublicProfileGateway";
import { setupExplorersMediaRoutes } from "../routes/explorersMediaRoutes";
import { MediaService } from "../application/media";
import type { ObjectStorage } from "../services/objectStorage";
import { setupExplorersLifecycleRoutes } from "../routes/explorersLifecycleRoutes";
import { setupExplorersRecommendationRoutes } from "../routes/explorersRecommendationRoutes";
import { setupExplorersPublicContentRoutes } from "../routes/explorersPublicContentRoutes";
import {setupExplorersCatalogRoutes} from '../routes/explorersCatalogRoutes';
import {BookCoverFetcher} from '../services/bookCoverFetch';
import {BookCoverImportService} from '../application/bookCoverImport';
import {BookCatalog} from '../services/bookCatalog';

function errorResponse(res: Response, status: number, code: ApiError["error"]["code"], message: string): void {
  res.status(status).json({ error: { code, message, requestId: randomUUID() } } satisfies ApiError);
}

export function createCanonicalApp(pool: Pool, config: ExplorersAuthConfig,
  options: { mediaStorage?: ObjectStorage; bookCatalog?:BookCatalog; bookCoverFetcher?:BookCoverFetcher;movieCatalog?:MovieCatalog } = {}): { app: Express; auth: ReturnType<typeof createExplorersAuth> } {
  const app = express();
  const auth = createExplorersAuth(pool, config);

  // Better Auth must consume the original request stream before Express body parsers.
  const authHandler = toNodeHandler(auth);
  app.use("/api/auth", (request, response, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)
        && request.get("origin") !== config.baseURL) {
      return errorResponse(response, 403, "FORBIDDEN", "Auth request origin is not trusted");
    }
    next();
  });
  app.all("/api/auth", authHandler);
  app.all("/api/auth/*splat", authHandler);
  app.use(cookieParser());
  app.use(contentBodyParser());
  app.get("/health/live", (_request, response) => response.status(200).json({ status: "live" }));
  setupExplorersAccountRoutes(app, pool, auth, config);
  setupCanonicalAnalyticsRoutes(app,pool,auth);
  const books=options.bookCatalog??new BookCatalog({apiKey:process.env.GOOGLE_BOOKS_API_KEY,secret:config.secret});
  const movies=options.movieCatalog??new MovieCatalog({accessToken:process.env.TMDB_ACCESS_TOKEN,apiKey:process.env.TMDB_API_KEY,authorize:a=>authorizeOperation(pool,a,'entities:resolve',a.accountId)});
  setupExplorersRecommendationRoutes(app, pool, auth, config,books,new BookCoverImportService(pool,new MediaService(pool,options.mediaStorage),options.bookCoverFetcher),movies);
  setupExplorersCatalogRoutes(app,pool,auth,config,books,movies);
  setupExplorersPublicContentRoutes(app, pool, config.secret);
  setupExplorersLifecycleRoutes(app, pool, auth, config);
  setupExplorersMediaRoutes(app, pool, auth, config, new MediaService(pool, options.mediaStorage));
  // Privacy changes must be visible on the very next public request, including across app replicas.
  const publicProfiles = new PublicProfileService(new PostgresPublicProfileGateway(pool), { ttlMs: 0 });
  setupExplorersPublicProfileRoutes(app, { shell: publicProfiles.shell.bind(publicProfiles),
    category: publicProfiles.category.bind(publicProfiles), detail: publicProfiles.detail.bind(publicProfiles) });

  app.post("/api/explorers/v1/recovery/start", async (request, response) => {
    if (request.get("origin") !== config.baseURL) {
      return errorResponse(response, 403, "FORBIDDEN", "Recovery request origin is not trusted");
    }
    response.clearCookie(recoveryIntentCookie, recoveryCookieOptions(config));
    response.clearCookie(recoveryProofCookie, recoveryProofCookieOptions(config));
    try {
      const previousProof = request.cookies?.[recoveryProofCookie];
      if (typeof previousProof === "string") await revokeRecoveryProof(pool, previousProof);
    } catch {
      return errorResponse(response, 503, "FORBIDDEN", "Recovery service is unavailable");
    }
    response.cookie(recoveryIntentCookie, createRecoveryIntent(config.secret), {
      ...recoveryCookieOptions(config), maxAge: 300_000,
    });
    response.status(204).end();
  });

  app.get("/api/explorers/v1/me", async (request: Request, response: Response) => {
    try {
      if (request.headers.authorization || request.headers["x-account-id"] || request.headers["x-user-id"])
        throw new AuthorizationError(401, "UNAUTHENTICATED", "Ambiguous credentials");
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (!session?.user?.id) return errorResponse(response, 401, "UNAUTHENTICATED", "Sign in is required");
      if (Object.keys(request.query).length) throw new AuthorizationError(422, "INVALID_INPUT", "Query parameters are not accepted");
      const userId = session.user.id;
      const provider = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM auth_account WHERE user_id=$1 AND provider_id='google') AS exists", [userId],
      );
      if (!provider.rows[0]?.exists) return errorResponse(response, 403, "FORBIDDEN", "Google identity is required");
      const security = await pool.query<{ blocked_at: Date | null }>(
        "SELECT blocked_at FROM user_security_state WHERE user_id=$1", [userId],
      );
      if (security.rows[0]?.blocked_at) return errorResponse(response, 403, "FORBIDDEN", "Account access is unavailable");
      const existing = await pool.query<{ status: string }>(`SELECT a.status FROM initial_account_bindings b
        JOIN creator_accounts a ON a.id=b.account_id WHERE b.user_id=$1`, [userId]);
      if (existing.rows[0] && existing.rows[0].status !== "active") {
        return errorResponse(response, 403, "FORBIDDEN", "Account access is unavailable");
      }
      const { accountId } = await ensureInitialAccount(pool, userId);
      const actor = await requireActor(request, auth, pool);
      if (actor.accountId !== accountId) throw new AuthorizationError(404, "NOT_FOUND", "Account is unavailable");
      const account = await new ProfileService(pool).getMyProfile(actor);
      response.json({ account: accountDtoSchema.parse(account) });
    } catch (error) {
      sendActorError(request, response, error);
    }
  });

  return { app, auth };
}
