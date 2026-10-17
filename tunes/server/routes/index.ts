import {startAnalyticsMaintenance} from '../application/analyticsMaintenance';
import type { Express } from "express";
import type { Server } from "http";
import type { IStorage } from "../storage";
import { setupSeoRoutes } from "../seo-routes";
import { setupAuthRoutes } from "./authRoutes";
import { setupPlaylistRoutes } from "./playlistRoutes";
import { setupReactivationRoutes } from "./reactivationRoutes";
import { setupMusicFixtureProbeRoute } from "./musicFixtureProbe";
import { pool } from "../db";
import { setupMusicHealthRoutes } from "../deployment/music-health";
import { checkMusicDatabaseReadiness } from "../db/readiness";
import { setupNativeSessionContainment, setupOwnerContainment } from "../security-containment";
import { setupMusicIdentityRoutes } from "./musicIdentityRoutes";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { StrapiIdentityGateway } from "../services/strapiIdentityGateway";
import { MusicProjectionService } from "../services/musicProjectionService";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { createMusicCohortEntryResolver, parseMusicCohortConfiguration } from "../deployment/music-deployment";
import type { MusicIdentityRuntimeConfig } from "../config/music-identity-config";
import { MusicTokenService } from "../services/musicTokenService";
import { createMusicSocketCredentialVerifier, MusicPrincipalService } from "../middleware/musicPrincipal";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";
import { MusicPublicationOperationRepository } from "../repositories/musicPublicationOperationRepository";
import { MusicPublicationResponseCipher } from "../services/musicPublicationResponseCrypto";
import { createYouTubeReadService } from "../services/youtubeReadService";
import { setupCanonicalMusicRoutes, setupMusicSurfaceBoundary } from "./musicSurfaceRoutes";
import { setupMusicOpenApiRoutes } from "./musicOpenApiRoutes";
import { MusicLifecycleService } from "../services/musicLifecycleService";
import { MusicOwnerSocketRegistry, MusicPublicSocketRegistry } from "../socket/musicSocketServer";
import { startMusicPublicChangeListener } from "../services/musicPublicChangeListener";
import { createMusicPublicObservability } from "../observability/musicPublicObservability";
import {
  runMusicLifecycleWorkerOnce,
  startMusicLifecycleWorker,
  type AuthoritativeAbsence,
} from "../workers/musicLifecycleWorker";
import { startMusicReconciliationSuspensionListener } from "../services/musicReconciliationSuspensionListener";
import { MusicFeatureDecisionService, type MusicFeatureFlag } from "../services/musicFeatureDecisionService";
import { setupMusicFeatureRoutes } from "./musicFeatureRoutes";
import { setupExplorersAnalyticsRoutes } from "./explorersAnalyticsRoutes";
import { setupExplorersPublicProfileRoutes } from "./explorersPublicProfileRoutes";
import { PublicProfileService } from "../publicProfile/publicProfileService";
import { StrapiPublicProfileGateway } from "../publicProfile/strapiPublicProfileGateway";
import { resolvePublicProfileGatewayConfig } from "../config/public-profile-gateway-config";
import { createExplorersAnalyticsDependencies } from "../services/explorers-analytics-composition";
import { setupLocalMusicBoundary } from "./musicLocalBoundary";
import { setupLocalMusicHealthRoutes } from "../deployment/music-local-health";
import { assertValidatedLocalMusicProfile, type ValidatedLocalMusicProfile } from "../config/music-local-profile";
import { installProfileOptionalMusicIntegrations, musicCompositionPolicy } from "../config/music-local-composition";
import { assertCanonicalPlatformRouteGraph } from "../config/platform-route-graph";
import { requestLocalMusicRuntimeShutdown } from "../config/music-local-shutdown";

const featureAllowlist = (value?: string) => new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
const featurePercentage = (value?: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0; };

export async function registerRoutes(
  app: Express,
  _storage: IStorage,
  musicConfig: Omit<MusicIdentityRuntimeConfig, "lifecycleProofToken">,
  lifecycleAbsenceProof: {
    proveAbsence(identity: { userDocumentId: string; accountDocumentId: string }): Promise<AuthoritativeAbsence>;
    fixtureReadToken?: string;
  },
  localProfile?: ValidatedLocalMusicProfile,
): Promise<{ server: Server; shutdown: () => Promise<void> }> {
  assertCanonicalPlatformRouteGraph(musicConfig.mode, localProfile);
  if (localProfile) {
    assertValidatedLocalMusicProfile(localProfile, process.env);
    setupLocalMusicBoundary(app);
    setupLocalMusicHealthRoutes(app, { profile: localProfile, pool });
  } else if (process.env.MUSIC_DEPLOYMENT_HEALTH_ENABLED === "true") {
    setupMusicHealthRoutes(app, { pool });
  }
  if (!localProfile && process.env.MUSIC_MODE === "fixture") setupMusicFixtureProbeRoute(app, {
    mode: "fixture",
    databaseQuery: (sql) => pool.query(sql),
    migrationReadiness: () => checkMusicDatabaseReadiness(pool),
    strapiUrl: process.env.STRAPI_URL ?? "",
    strapiReadToken: lifecycleAbsenceProof.fixtureReadToken ?? "",
    fetchImpl: fetch,
  });
  setupNativeSessionContainment(app);
  const identityGateway = new StrapiIdentityGateway({
    baseUrl: musicConfig.strapiOrigin,
    fetchImpl: musicConfig.fetchImpl,
    maxConcurrency: musicConfig.maxConcurrency,
    maxPending: musicConfig.maxPending,
    retries: musicConfig.retries,
    connectTimeoutMs: musicConfig.connectTimeoutMs,
    readTimeoutMs: musicConfig.readTimeoutMs,
    overallTimeoutMs: musicConfig.overallTimeoutMs,
    cacheTtlMs: musicConfig.cacheTtlMs,
    circuitFailureThreshold: musicConfig.circuitFailureThreshold,
    circuitOpenMs: musicConfig.circuitOpenMs,
    ...(localProfile ? { diagnostic: (entry: Record<string, unknown>) => console.info("music_identity_upstream", entry) } : {}),
  });
  const identityRepository = new MusicIdentityRepository(pool);
  const identityProjection = new MusicProjectionService(identityGateway, identityRepository, musicConfig.maxInflight);
  const cohortEntryEnabled = createMusicCohortEntryResolver({
    killSwitch: () => localProfile?.admission.newEntryKillSwitch
      ?? process.env.MUSIC_NEW_ENTRY_KILL_SWITCH !== "false",
    cohort: localProfile ? {
      enabled: localProfile.admission.choice === "cohort",
      userDocumentIds: new Set(localProfile.admission.cohortUserDocumentIds),
    } : parseMusicCohortConfiguration(process.env),
    resolveIdentity: (proof, requestId) => identityGateway.resolve(proof, requestId),
  });
  const musicTokens = new MusicTokenService(musicConfig.musicToken);
  const musicPrincipals = new MusicPrincipalService(musicTokens, identityRepository);
  const ownerSocketRegistry = new MusicOwnerSocketRegistry();
  const publicSocketRegistry = new MusicPublicSocketRegistry();
  const publicMusicObservability = createMusicPublicObservability();
  const lifecycle = new MusicLifecycleService(identityGateway, identityRepository, {
    disconnectOwner: (musicUserId) => ownerSocketRegistry.disconnectOwner(musicUserId),
  });
  setupMusicIdentityRoutes(app, {
    ensure: (proof, requestId) => identityProjection.ensure(proof, requestId),
    mintCredential: (identity) => musicTokens.mint(identity),
    resolvePrincipal: (token) => musicPrincipals.resolve(token),
    lifecycle,
    isMusicCredential: (token) => {
      try { musicTokens.verify(token); return true; }
      catch { return false; }
    },
    entryEnabled: cohortEntryEnabled,
    trustedProxyHops: musicConfig.trustedProxyHops,
    isTrustedProxy: musicConfig.isTrustedProxy,
    telemetry: () => ({ ...identityGateway.stats(), coalesced: identityProjection.stats().coalesced }),
    metrics: (entry) => console.info("music_identity_metric", entry),
    limiter: new BoundedIdentityRateLimiter({
      limit: musicConfig.rateLimitPerMinute,
      globalLimit: musicConfig.globalRateLimitPerMinute,
      windowMs: 60_000,
      maxEntries: musicConfig.rateMaxEntries,
    }),
  });
  const publicationOperations = new MusicPublicationOperationRepository(
    pool,
    new MusicPublicationResponseCipher(musicConfig.publicationResponse),
  );
  await publicationOperations.verifyReplayReadiness();
  const musicDomain = new MusicDomainRepository(pool, publicationOperations, musicConfig.publicIdHmacKey);
  const canonicalDependencies = {
    repository: musicDomain,
    resolvePrincipal: (token: string) => musicPrincipals.resolve(token),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["http://localhost:5173"],
    trustedProxyHops: musicConfig.trustedProxyHops,
    isTrustedProxy: musicConfig.isTrustedProxy,
    youtube: createYouTubeReadService(process.env.YOUTUBE_API_KEY),
    observability: publicMusicObservability,
    // Ticket 6.3. The socket admits only a purpose-limited handshake ticket, so this mint
    // is the single way an owner can open a live connection. It is not optional.
    mintSocketTicket: musicTokens.mintSocketTicket.bind(musicTokens),
  };
  const featureFlags: MusicFeatureFlag[] = ["ownerWorkspace", "guestWorkspace", "playlistImports"];
  const featureEnvironment: Record<MusicFeatureFlag, string> = { ownerWorkspace: "OWNER_WORKSPACE", guestWorkspace: "GUEST_WORKSPACE", playlistImports: "PLAYLIST_IMPORTS" };
  const localFeatureCohort = new Set(localProfile?.admission.cohortUserDocumentIds ?? []);
  const allowlists = localProfile ? {
    ownerWorkspace: localProfile.admission.ownerWorkspace ? localFeatureCohort : new Set<string>(),
    guestWorkspace: localProfile.admission.guestWorkspace ? localFeatureCohort : new Set<string>(),
    playlistImports: new Set<string>(),
  } : Object.fromEntries(featureFlags.map((flag) => [flag, featureAllowlist(process.env[`MUSIC_FEATURE_${featureEnvironment[flag]}_ALLOWLIST`])])) as Record<MusicFeatureFlag, Set<string>>;
  const percentages = localProfile ? { ownerWorkspace: 0, guestWorkspace: 0, playlistImports: 0 }
    : Object.fromEntries(featureFlags.map((flag) => [flag, featurePercentage(process.env[`MUSIC_FEATURE_${featureEnvironment[flag]}_PERCENT`])])) as Record<MusicFeatureFlag, number>;
  const featureDecisions = new MusicFeatureDecisionService({
    killSwitch: () => localProfile?.admission.workspaceKillSwitch
      ?? process.env.MUSIC_WORKSPACE_KILL_SWITCH !== "false",
    salt: localProfile ? "" : process.env.MUSIC_FEATURE_COHORT_SALT ?? "",
    cohortVersion: localProfile ? `local-${localProfile.instanceId}` : process.env.MUSIC_FEATURE_COHORT_VERSION ?? "disabled-v1",
    allowlists,
    percentages,
    allowlistIdentity: localProfile ? (principal) => principal.subject : undefined,
    log: (entry) => console.info("music_feature_exposure", entry),
  });
  setupMusicFeatureRoutes(app, { resolvePrincipal: (token) => musicPrincipals.resolve(token), decide: (principal) => featureDecisions.decide(principal), allowedOrigins: canonicalDependencies.allowedOrigins });
  setupCanonicalMusicRoutes(app, canonicalDependencies);
  setupMusicOpenApiRoutes(app);
  const publicProfileGateway = resolvePublicProfileGatewayConfig(process.env);
  if (publicProfileGateway.enabled) {
    const publicProfileService = new PublicProfileService(new StrapiPublicProfileGateway({
      origin: musicConfig.strapiOrigin,
      token: publicProfileGateway.token,
      fetchImpl: musicConfig.fetchImpl,
    }));
    setupExplorersPublicProfileRoutes(app, { shell: publicProfileService.shell.bind(publicProfileService), category: publicProfileService.category.bind(publicProfileService), detail: publicProfileService.detail.bind(publicProfileService) });
  }
  let canonicalAnalyticsEnabled=false;
  installProfileOptionalMusicIntegrations(localProfile, {
    nativeAuth: () => setupAuthRoutes(app),
    analyticsPublishing: () => {setupExplorersAnalyticsRoutes(app, createExplorersAnalyticsDependencies());canonicalAnalyticsEnabled=true;},
    reactivation: () => setupReactivationRoutes(app, {
      reactivateMusic: async (identity) => { await lifecycle.reactivateBoundIdentity(identity); },
    }),
  });
  setupMusicSurfaceBoundary(app, canonicalDependencies);
  setupOwnerContainment(app);
  const server = setupPlaylistRoutes(app, {
    allowedOrigins: canonicalDependencies.allowedOrigins,
    ownerCredentials: createMusicSocketCredentialVerifier(musicPrincipals),
    resolveGuestCapability: (capability) => musicDomain.resolveGuestSocketAuthority(capability),
    resolvePublicMusicAuthority: (publicSlug, capability) => musicDomain.resolvePublicMusicSocketAuthority(publicSlug, capability),
    resolvePublicMusicRevision: (musicUserId) => musicDomain.resolvePublicSnapshotRevision(musicUserId),
    ownerRegistry: ownerSocketRegistry,
    publicRegistry: publicSocketRegistry,
    observability: publicMusicObservability,
  });
  let publicChangeListener: Awaited<ReturnType<typeof startMusicPublicChangeListener>> | undefined;
  let suspensionListener: Awaited<ReturnType<typeof startMusicReconciliationSuspensionListener>> | undefined;
  let lifecycleWorker: ReturnType<typeof startMusicLifecycleWorker> | undefined;
  let publicationShredTimer: NodeJS.Timeout | undefined;
  let stopAnalyticsMaintenance:(()=>Promise<void>)|undefined;
  let cleanupPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => cleanupPromise ??= (async () => {
    lifecycleWorker?.stop();
    await stopAnalyticsMaintenance?.();
    if (publicationShredTimer) clearInterval(publicationShredTimer);
    await ownerSocketRegistry.disconnectAllSockets().catch(() => undefined);
    await Promise.allSettled([
      suspensionListener?.stop(),
      publicChangeListener?.stop(),
    ].filter((operation): operation is Promise<void> => operation !== undefined));
  })();
  try {
  if(canonicalAnalyticsEnabled)stopAnalyticsMaintenance=startAnalyticsMaintenance(pool);
  publicChangeListener = await startMusicPublicChangeListener({
    pool,
    fanout: (change) => publicSocketRegistry.publish(change),
    catchUp: () => publicSocketRegistry.catchUp(),
    observability: publicMusicObservability,
    onFatal: () => {
      console.error("music_public_change_listener_failed");
      if (localProfile) requestLocalMusicRuntimeShutdown(server);
      else if (server.listening) server.close();
      void ownerSocketRegistry.disconnectAllSockets().catch(() => undefined);
    },
  });
  let suspensionSafetyFailed = false;
  const failClosedSuspensionSafety = (): void => {
    if (suspensionSafetyFailed) return;
    suspensionSafetyFailed = true;
    const wasListening = server.listening;
    if (wasListening) {
      if (localProfile) requestLocalMusicRuntimeShutdown(server);
      else server.close();
    }
    void ownerSocketRegistry.disconnectAllSockets().catch(() => {
      console.error("music_reconciliation_socket_shutdown_failed");
    }).finally(() => {
      if (!wasListening) server.emit("error", new Error("Music reconciliation suspension safety failed"));
    });
  };
  suspensionListener = await startMusicReconciliationSuspensionListener({
    pool,
    disconnectOwner: (musicUserId) => ownerSocketRegistry.disconnectOwner(musicUserId),
    onDisconnectError: () => {
      console.error("music_reconciliation_owner_disconnect_failed");
      failClosedSuspensionSafety();
    },
    onFatal: () => {
      console.error("music_reconciliation_suspension_listener_failed");
      failClosedSuspensionSafety();
    },
  });
  setupSeoRoutes(app, { listPublishedMusicPlaylists: () => musicDomain.listPublishedMusicPlaylists() });
  if (musicCompositionPolicy(localProfile).lifecycleWorker) lifecycleWorker = startMusicLifecycleWorker({
    intervalMs: 30_000,
    onError: () => console.error("music_lifecycle_worker_failed"),
    runOnce: async () => {
      const result = await runMusicLifecycleWorkerOnce({
        repository: identityRepository,
        proveAbsence: (identity) => lifecycleAbsenceProof.proveAbsence(identity),
        maxAttempts: 5,
        batchSize: 10,
      });
      if (result.claimed > 0) console.info("music_lifecycle_worker", result);
    },
  });
  publicationShredTimer = setInterval(() => {
    void publicationOperations.shredExpiredResponses(1_000)
      .then(() => publicationOperations.compactExpiredOperations(1_000))
      .catch(() => {
      console.error("music_publication_response_shred_failed");
      });
  }, 60 * 1_000);
  publicationShredTimer.unref();
  server.once("close", () => { void shutdown(); });

  
  return { server, shutdown };
  } catch (error) {
    await shutdown();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
}
