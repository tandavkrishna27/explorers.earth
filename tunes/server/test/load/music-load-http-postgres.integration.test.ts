import { performance } from "node:perf_hooks";
import express, { type Express } from "express";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { percentile } from "../../../scripts/music-qualification";
import { migrateMusicDatabase } from "../../db/migrate";
import { BoundedIdentityRateLimiter } from "../../middleware/identityRateLimit";
import { MusicPrincipalService } from "../../middleware/musicPrincipal";
import { MusicIdentityRepository } from "../../repositories/musicIdentityRepository";
import { setupMusicIdentityBodylessPreflight, setupMusicIdentityRoutes } from "../../routes/musicIdentityRoutes";
import { MusicProjectionService } from "../../services/musicProjectionService";
import { StrapiIdentityGateway } from "../../services/strapiIdentityGateway";
import { MusicTokenService } from "../../services/musicTokenService";

const exactTarget = process.env.DATABASE_URL_TEST;
const enabled = process.env.MUSIC_C10_POSTGRES_TEST === "1" && Boolean(exactTarget);
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_c10_http_load_${process.pid}`;

type HttpServer = ReturnType<Express["listen"]>;
type Metric = {
  outcome: string;
  latencyMs: number;
  upstreamCallCount: number;
  retryCount: number;
  circuit: "closed" | "open" | "half-open";
  singleFlight: "leader" | "coalesced";
  cache: "hit" | "miss" | "none";
  conflict: string;
};

let admin: pg.Pool;
let pool: pg.Pool;
let strapiServer: HttpServer;
let tunesServer: HttpServer;
let tunesOrigin = "";
let strapiCalls = 0;
let peakWaiting = 0;
const metrics: Metric[] = [];
const logs: Array<Record<string, unknown>> = [];

function listen(app: Express): Promise<{ server: HttpServer; origin: string }> {
  return new Promise((resolveListen, rejectListen) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return rejectListen(new Error("local load server did not bind"));
      resolveListen({ server, origin: `http://127.0.0.1:${address.port}` });
    });
    server.once("error", rejectListen);
  });
}

function close(server: HttpServer | undefined): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function proofIdentity(proof: string): { userDocumentId: string; accountDocumentId: string } {
  const suffix = proof === "fixture-load-shared-proof" ? "shared" : proof.replace(/^fixture-load-proof-/, "").replace(/-authority$/, "");
  return { userDocumentId: `load-user-${suffix}`, accountDocumentId: `load-account-${suffix}` };
}

async function timedRequest(path: string, init: RequestInit): Promise<{ response: Response; durationMs: number }> {
  const started = performance.now();
  const response = await fetch(`${tunesOrigin}${path}`, init);
  return { response, durationMs: performance.now() - started };
}

async function ensure(proof: string, requestId: string) {
  return timedRequest("/api/music/identity/ensure", {
    method: "POST",
    headers: { authorization: `Bearer ${proof}`, "x-request-id": requestId },
  });
}

describePg("C10 real HTTP, identity service, repository, and PostgreSQL load", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const databaseUrl = new URL(exactTarget!);
    databaseUrl.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: databaseUrl.toString(), max: 4 });
    await migrateMusicDatabase(pool);

    const strapi = express();
    strapi.get("/api/users/me", (request, response) => {
      strapiCalls += 1;
      const proof = String(request.get("authorization") ?? "").replace(/^Bearer /, "");
      const identity = proofIdentity(proof);
      response.json({
        documentId: identity.userDocumentId,
        username: `load-${identity.userDocumentId}`,
        email: `${identity.userDocumentId}@example.invalid`,
        provider: "local",
        confirmed: true,
        blocked: false,
      });
    });
    strapi.get("/api/accounts", (request, response) => {
      strapiCalls += 1;
      const userDocumentId = String(request.query["filters[users_permissions_user][documentId][$eq]"] ?? "");
      response.json({ data: [{
        documentId: userDocumentId.replace("load-user-", "load-account-"),
        Account_Name: "Qualification Load",
        Account_Type: "Personal",
        mobile_number: "+15555550199",
      }] });
    });
    const strapiListener = await listen(strapi);
    strapiServer = strapiListener.server;

    const gateway = new StrapiIdentityGateway({
      baseUrl: strapiListener.origin,
      maxConcurrency: 16,
      maxPending: 128,
      retries: 0,
      connectTimeoutMs: 1_000,
      readTimeoutMs: 1_000,
      overallTimeoutMs: 4_000,
      cacheTtlMs: 30_000,
      circuitFailureThreshold: 3,
      circuitOpenMs: 1_000,
    });
    const repository = new MusicIdentityRepository(pool, {
      afterWrite: async () => { await new Promise((resolveDelay) => setTimeout(resolveDelay, 10)); },
    });
    const projection = new MusicProjectionService(gateway, repository, 64);
    const tokens = new MusicTokenService({
      current: { kid: "c10-load", secret: Buffer.alloc(32, 0x63).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 10,
    });
    const principals = new MusicPrincipalService(tokens, repository);
    const app = express();
    setupMusicIdentityBodylessPreflight(app);
    app.use(express.json());
    setupMusicIdentityRoutes(app, {
      ensure: (proof, requestId) => projection.ensure(proof, requestId),
      mintCredential: (identity) => tokens.mint(identity),
      resolvePrincipal: (token) => principals.resolve(token),
      limiter: new BoundedIdentityRateLimiter({ limit: 1_000, globalLimit: 5_000, windowMs: 60_000, maxEntries: 1_024 }),
      entryEnabled: () => true,
      telemetry: () => ({ ...gateway.stats(), coalesced: projection.stats().coalesced }),
      metrics: (entry) => metrics.push(entry),
      logger: (entry) => logs.push(entry),
    });
    const tunesListener = await listen(app);
    tunesServer = tunesListener.server;
    tunesOrigin = tunesListener.origin;
  }, 30_000);

  afterAll(async () => {
    await close(tunesServer);
    await close(strapiServer);
    await pool?.end();
    if (admin) {
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await admin.end();
    }
  }, 30_000);

  it("measures first ensure, cache, ordinary owner, token storm, single-flight, pool saturation, and emitted labels", async () => {
    const sharedProof = "fixture-load-shared-proof";
    const first = await Promise.all(Array.from({ length: 50 }, (_, index) => ensure(sharedProof, `first-${index}`)));
    expect(first.every(({ response }) => response.status === 200)).toBe(true);
    expect(strapiCalls).toBe(2);
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id='load-user-shared'")).rows[0].count)).toBe(1);
    const firstDurations = first.map(({ durationMs }) => durationMs);
    const firstP95Ms = percentile(firstDurations, 0.95);
    expect(firstP95Ms).toBeLessThan(1_000);

    const cached = [] as Array<{ response: Response; durationMs: number }>;
    for (let index = 0; index < 200; index += 1) cached.push(await ensure(sharedProof, `cached-${index}`));
    expect(cached.every(({ response }) => response.status === 200)).toBe(true);
    expect(strapiCalls).toBe(2);
    const cachedDurations = cached.map(({ durationMs }) => durationMs);
    const cachedP95Ms = percentile(cachedDurations, 0.95);
    expect(cachedP95Ms).toBeLessThan(100);
    console.info(JSON.stringify({
      schemaVersion: "music-load/v1",
      metric: "ensure",
      firstEnsure50Ms: Math.ceil(Math.max(...firstDurations)),
      firstEnsureP50Ms: percentile(firstDurations, 0.5),
      firstEnsureP95Ms: firstP95Ms,
      cachedCalls: cached.length,
      cachedP50Ms: percentile(cachedDurations, 0.5),
      cachedP95Ms,
      strapiCalls,
    }));

    const credential = (await first[0].response.json() as { credential: { token: string } }).credential.token;
    const strapiBeforeOwner = strapiCalls;
    const owner = await Promise.all(Array.from({ length: 200 }, () => timedRequest("/api/music/identity/current", {
      method: "GET", headers: { authorization: `Bearer ${credential}` },
    })));
    expect(owner.every(({ response }) => response.status === 200)).toBe(true);
    const ownerDurations = owner.map(({ durationMs }) => durationMs);
    const ownerP95Ms = percentile(ownerDurations, 0.95);
    expect(ownerP95Ms).toBeLessThan(500);
    const invalid = await Promise.all(Array.from({ length: 200 }, (_, index) => timedRequest("/api/music/identity/current", {
      method: "GET", headers: { authorization: `Bearer bad${index}.invalid.credential` },
    })));
    expect(invalid.every(({ response }) => response.status === 401)).toBe(true);
    expect(strapiCalls).toBe(strapiBeforeOwner);
    console.info(JSON.stringify({
      schemaVersion: "music-load/v1",
      metric: "owner",
      ownerCalls: owner.length,
      ownerP50Ms: percentile(ownerDurations, 0.5),
      ownerP95Ms,
      strapiCalls: strapiCalls - strapiBeforeOwner,
      invalidTokensRejected: invalid.length,
    }));

    const monitor = setInterval(() => { peakWaiting = Math.max(peakWaiting, pool.waitingCount); }, 1);
    const saturated = await Promise.all(Array.from({ length: 50 }, (_, index) => {
      const proof = `fixture-load-proof-${index}-authority`;
      return ensure(proof, `pool-${index}`);
    })).finally(() => clearInterval(monitor));
    expect(saturated.every(({ response }) => response.status === 200)).toBe(true);
    expect(pool.totalCount).toBe(4);
    expect(peakWaiting).toBeGreaterThan(0);
    const poolDurations = saturated.map(({ durationMs }) => durationMs);
    const poolP95Ms = percentile(poolDurations, 0.95);
    expect(poolP95Ms).toBeLessThan(2_000);
    console.info(JSON.stringify({
      schemaVersion: "music-load/v1",
      metric: "postgres-pool",
      concurrentQueries: saturated.length,
      poolMax: pool.totalCount,
      p50Ms: percentile(poolDurations, 0.5),
      p95Ms: poolP95Ms,
    }));

    const metricKeySets = new Set(metrics.map((entry) => Object.keys(entry).sort().join(",")));
    const metricKeySet = [...metricKeySets][0] ?? "";
    const forbiddenMetricKeys = [...new Set(metrics.flatMap((entry) => Object.keys(entry)))]
      .filter((key) => /request|user|account|proof|token|path|email|username/i.test(key));
    const labelValueCardinality = ["outcome", "circuit", "singleFlight", "cache", "conflict"]
      .reduce((total, key) => total + new Set(metrics.map((entry) => String(entry[key as keyof Metric]))).size, 0);
    expect(metricKeySets).toEqual(new Set([
      "cache,circuit,conflict,latencyMs,outcome,retryCount,singleFlight,upstreamCallCount",
    ]));
    expect(forbiddenMetricKeys).toEqual([]);
    expect(labelValueCardinality).toBeLessThanOrEqual(16);
    expect(logs.every((entry) => Object.keys(entry).every((key) => ["event", "requestId", "outcome", "status", "latencyMs"].includes(key)))).toBe(true);
    const serializedTelemetry = JSON.stringify({ metrics, logs });
    expect(serializedTelemetry).not.toMatch(/fixture-load-(?:shared-)?proof|credential\":|example\.invalid/);
    console.info(JSON.stringify({
      schemaVersion: "music-load/v1",
      metric: "telemetry-labels",
      events: metrics.length,
      distinctMetricKeySets: metricKeySets.size,
      maxMetricKeys: Math.max(...metrics.map((entry) => Object.keys(entry).length)),
      forbiddenMetricKeys: forbiddenMetricKeys.length,
      labelValueCardinality,
      metricKeySet,
    }));
  }, 30_000);
});
