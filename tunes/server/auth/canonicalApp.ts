import {createAppsEnrichmentRegistryBinding,type AppsEnrichmentRegistryBinding} from '../../scripts/apps-enrichment-browser-support';
import {createCanonicalHandlerCustody} from './canonicalHandlerCustody';
import {createCanonicalSessionNodeHandler} from './canonicalSessionNodeHandler';
import {createAppsCanonicalAdmission,type AppsCanonicalAdmissionOptions} from '../../scripts/apps-canonical-admission';
import {MovieMediaImportService} from '../application/movieMediaImport';
import {MovieImageFetcher} from '../services/movieImageFetch';
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
import { pendingDeletionScheduleFor } from "../application/accountDeletionGrace";
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
import { setupExplorersAppEnrichmentRoutes } from "../routes/explorersAppEnrichmentRoutes";
import {appSourceChoiceSchema,type AppSourceChoice} from '../../shared/explorersAppEnrichmentContract';
import { setupExplorersPublicContentRoutes } from "../routes/explorersPublicContentRoutes";
import {setupExplorersCatalogRoutes} from '../routes/explorersCatalogRoutes';
import {setupExplorersPlacesRoutes} from '../routes/explorersPlacesRoutes';
import {PlacesNearbyService} from '../services/placesNearby';
import {BookCoverFetcher} from '../services/bookCoverFetch';
import {BookCoverImportService} from '../application/bookCoverImport';
import {createLinkPreviewService,type LinkPreviewService} from '../application/linkPreview';
import {BookCatalog} from '../services/bookCatalog';
import { resolveTrustedProxy, setupCanonicalTerminator } from "../middleware/canonicalTerminator";
import { setupCanonicalRetiredSurfaces } from "../routes/canonicalRetiredSurfaceRoutes";
import { setupExplorersSeoRoutes } from "../routes/explorersSeoRoutes";
import { SharePageService, setupExplorersSharePageRoutes } from "../routes/explorersSharePageRoutes";
import { checkMusicDatabaseReadiness } from "../db/readiness";
import { logServerErrorResponses } from "../http/unexpectedError";

function errorResponse(res: Response, status: number, code: ApiError["error"]["code"], message: string): void {
  res.status(status).json({ error: { code, message, requestId: randomUUID() } } satisfies ApiError);
}

function constructCanonicalApp(pool: Pool, config: ExplorersAuthConfig,
  options: { mediaStorage?: ObjectStorage; bookCatalog?:BookCatalog; bookCoverFetcher?:BookCoverFetcher;movieCatalog?:MovieCatalog;movieImageFetcher?:MovieImageFetcher;appEnrichmentChoices?:readonly AppSourceChoice[];placesNearby?:Pick<PlacesNearbyService,'nearby'>;linkPreviewService?:LinkPreviewService } = {}, custodyMode=false,appsInput?:Omit<AppsCanonicalAdmissionOptions,'pool'>,
  ) {
  const admission=appsInput?createAppsCanonicalAdmission({pool,...appsInput}):undefined;
  const actualApp = express(), instrument=custodyMode?createCanonicalHandlerCustody(actualApp,admission):undefined;
  const app = instrument?.registration ?? actualApp;
  // Configuration, not a layer — it registers nothing on the router stack and so
  // shifts no positional index. Set on actualApp: the custody view
  // (canonicalHandlerCustody.ts:63) overrides only route-registration methods,
  // so `app.set` would work too; actualApp makes that independence explicit.
  actualApp.set("trust proxy", resolveTrustedProxy(process.env));
  // PROD-06. First, so every 5xx below is logged with its request id.
  if(!instrument)app.use(logServerErrorResponses);
  if(admission)app.use(admission.beforeDispatch);
  const auth = createExplorersAuth(pool, config, appsInput?{appsReadOnlySessionFixture:true}:undefined);

  // Better Auth must consume the original request stream before Express body parsers.
  const authHandler = toNodeHandler(auth);
  // Installed better-call setResponse starts a detached response pump. Its
  // returned promise alone cannot authorize physical auth stream teardown.
  instrument?.markUncovered(authHandler);
  if(admission)app.get('/api/auth/get-session',createCanonicalSessionNodeHandler(auth,config.baseURL));
  setupCanonicalRetiredSurfaces(app);
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
  if(admission)app.use(admission.afterJsonParser);
  app.get("/health/live", (_request, response) => response.status(200).json({ status: "live" }));
  setupExplorersSeoRoutes(app, pool);
  setupExplorersSharePageRoutes(app, new SharePageService(pool, config.baseURL));
  app.get("/health/ready", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
    } catch {
      response.status(503).json({ ready: false, reason: "database-unreachable" });
      return;
    }
    const readiness = await checkMusicDatabaseReadiness(pool)
      .catch(() => ({ ready: false as const, reason: "migration-state-invalid" as const }));
    if (!readiness.ready) {
      response.status(503).json({ ready: false, reason: "migration-state-invalid" });
      return;
    }
    response.status(200).json({ ready: true });
  });
  setupExplorersAccountRoutes(app, pool, auth, config);
  setupCanonicalAnalyticsRoutes(app,pool,auth);
  const books=options.bookCatalog??new BookCatalog({apiKey:process.env.GOOGLE_BOOKS_API_KEY,secret:config.secret});
  const movies=options.movieCatalog??new MovieCatalog({accessToken:process.env.TMDB_ACCESS_TOKEN,apiKey:process.env.TMDB_API_KEY,authorize:a=>authorizeOperation(pool,a,'entities:resolve',a.accountId)});
  setupExplorersRecommendationRoutes(app, pool, auth, config,books,new BookCoverImportService(pool,new MediaService(pool,options.mediaStorage),options.bookCoverFetcher),movies,new MovieMediaImportService(pool,new MediaService(pool,options.mediaStorage),options.movieImageFetcher),instrument?.routerFactory);
  const appSourceChoices=appSourceChoiceSchema.array().parse(options.appEnrichmentChoices??[]);
  setupExplorersAppEnrichmentRoutes(app, pool, auth, config, appSourceChoices.map(choice=>choice.identity), instrument?.routerFactory,appSourceChoices);
  setupExplorersCatalogRoutes(app,pool,auth,config,books,movies,options.linkPreviewService??createLinkPreviewService(pool,options.mediaStorage));
  setupExplorersPlacesRoutes(app,pool,auth,options.placesNearby??new PlacesNearbyService({googleApiKey:process.env.GOOGLE_PLACES_API_KEY}));
  setupExplorersPublicContentRoutes(app, pool, config.secret,instrument?.routerFactory);
  setupExplorersLifecycleRoutes(app, pool, auth, config);
  setupExplorersMediaRoutes(app, pool, auth, config, new MediaService(pool, options.mediaStorage),admission?.beforeMediaCommand);
  // Privacy changes must be visible on the very next public request, including across app replicas.
  const publicProfiles = new PublicProfileService(new PostgresPublicProfileGateway(pool,config.secret), { ttlMs: 0 });
  setupExplorersPublicProfileRoutes(app, { shell: publicProfiles.shell.bind(publicProfiles),
    peopleSector:publicProfiles.peopleSector.bind(publicProfiles), movieGenre:publicProfiles.movieGenre.bind(publicProfiles), category: publicProfiles.category.bind(publicProfiles), detail: publicProfiles.detail.bind(publicProfiles) });

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
      // The caller holds this account's own session, so a pending deletion's date is theirs to see.
      const unavailable = async () => {
        const scheduledDeletionAt = await pendingDeletionScheduleFor(pool, userId);
        throw new AuthorizationError(403, "FORBIDDEN", "Account access is unavailable",
          scheduledDeletionAt ? { status: "pending_deletion", scheduledDeletionAt } : undefined);
      };
      if (security.rows[0]?.blocked_at) return await unavailable();
      const existing = await pool.query<{ status: string }>(`SELECT a.status FROM initial_account_bindings b
        JOIN creator_accounts a ON a.id=b.account_id WHERE b.user_id=$1`, [userId]);
      if (existing.rows[0] && existing.rows[0].status !== "active") return await unavailable();
      const { accountId } = await ensureInitialAccount(pool, userId);
      const actor = await requireActor(request, auth, pool);
      if (actor.accountId !== accountId) throw new AuthorizationError(404, "NOT_FOUND", "Account is unavailable");
      const account = await new ProfileService(pool).getMyProfile(actor);
      response.json({ account: accountDtoSchema.parse(account) });
    } catch (error) {
      sendActorError(request, response, error);
    }
  });

  setupCanonicalTerminator(app);
  instrument?.completeRegistration();
  return {composed:{app:actualApp,auth},custody:instrument?.custody,admission};
}

export function createCanonicalApp(pool:Pool,config:ExplorersAuthConfig,options:Parameters<typeof constructCanonicalApp>[2]={}) {return constructCanonicalApp(pool,config,options).composed;} 
export function createCanonicalAppWithCustody(pool:Pool,config:ExplorersAuthConfig,options:Parameters<typeof constructCanonicalApp>[2]={}) {const result=constructCanonicalApp(pool,config,options,true);return {composed:result.composed,custody:result.custody!};}
export type CanonicalPlacesFixtureInput={mediaStorage:ObjectStorage};
/** Fixed private Places construction. No caller middleware, route or custody hooks are accepted. */
export function createCanonicalPlacesFixtureApp(pool:Pool,config:ExplorersAuthConfig,input:CanonicalPlacesFixtureInput){
 if(!input||Object.keys(input).sort().join(',')!=='mediaStorage'||!input.mediaStorage)throw Error('Canonical Places fixture configuration denied');
 return constructCanonicalApp(pool,config,{mediaStorage:input.mediaStorage}).composed;
}
export type CanonicalAppsFixtureInput={mediaStorage:ObjectStorage;runAuthority:AppsCanonicalAdmissionOptions['runAuthority'];personasWithActualAccountIds:AppsCanonicalAdmissionOptions['personas']};
/** Fixed Apps construction; no caller middleware, route or policy hooks. */
export function createCanonicalAppsFixtureApp(pool:Pool,config:ExplorersAuthConfig,input:CanonicalAppsFixtureInput){
 if(!input||Object.keys(input).sort().join(',')!=='mediaStorage,personasWithActualAccountIds,runAuthority'||!input.mediaStorage)throw Error('Canonical Apps fixture configuration denied');
 const result=constructCanonicalApp(pool,config,{mediaStorage:input.mediaStorage},true,{runAuthority:input.runAuthority,personas:input.personasWithActualAccountIds});
 return {composed:result.composed,custody:result.custody!,admission:result.admission!};
}

export type CanonicalAppsEnrichmentFixtureInput=CanonicalAppsFixtureInput&{registry:AppsEnrichmentRegistryBinding};
/** Distinct qualification composition. Registry data cannot replace Root custody/admission. */
export function createCanonicalAppsEnrichmentFixtureApp(pool:Pool,config:ExplorersAuthConfig,input:CanonicalAppsEnrichmentFixtureInput){
 if(!input||Object.keys(input).sort().join(',')!=='mediaStorage,personasWithActualAccountIds,registry,runAuthority'||!input.mediaStorage)throw Error('Canonical Apps enrichment fixture configuration denied');
 const registry=createAppsEnrichmentRegistryBinding(input.registry);
 const result=constructCanonicalApp(pool,config,{mediaStorage:input.mediaStorage,appEnrichmentChoices:registry.choices},true,{runAuthority:input.runAuthority,personas:input.personasWithActualAccountIds,enrichmentSources:registry.choices.map(choice=>choice.identity)});
 return {composed:result.composed,custody:result.custody!,admission:result.admission!};
}
