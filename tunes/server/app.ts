import { contentBodyParser } from './application/contentBodyParser';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes/index";
import { log } from "./runtime";
import cookieParser from "cookie-parser";
import type { Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { assertContainmentStartup, containmentErrorHandler, installSafeConsole, requestIdFor } from "./security-containment";
import { setupMusicIdentityBodylessPreflight } from "./routes/musicIdentityRoutes";
import type { MusicIdentityRuntimeConfig } from "./config/music-identity-config";
import { MusicIdentityError, musicErrorEnvelope } from "../shared/musicError";
import { StrapiIdentityAbsenceProof } from "./services/strapiIdentityAbsenceProof";
import { assertValidatedLocalMusicProfile, type ValidatedLocalMusicProfile } from "./config/music-local-profile";
import { createLocalMusicRuntimeShutdown, failAfterLocalMusicOwnedCleanup } from "./config/music-local-shutdown";

export function sanitizedRequestLogTarget(request: Pick<Request, "path">): string {
  return request.path;
}

/**
 * Builds the Express app with all middleware + routes wired, and returns it
 * alongside the http.Server that registerRoutes() creates (Socket.IO is attached
 * to that server). This is split out of index.ts so tests (Supertest) can import
 * the app WITHOUT calling listen() or starting Vite.
 *
 *   index.ts (entrypoint)            app.ts (this file)              tests
 *   ─────────────────────            ──────────────────              ─────
 *   createApp() ────────────────────► express() + middleware
 *                                     registerRoutes(app, storage)
 *                                     error handler
 *   ◄──────────── { app, server } ───┘
 *   setupVite / serveStatic
 *   server.listen(...)                                               request(app)...
 */
export async function createApp(musicIdentityConfig: MusicIdentityRuntimeConfig, localProfile?: ValidatedLocalMusicProfile, apiOnly = false): Promise<{
  app: express.Express;
  server: Server;
  shutdown?: () => Promise<void>;
}> {
  try {
    return await composeApp(musicIdentityConfig, localProfile, apiOnly);
  } catch (error) {
    if (localProfile || apiOnly) return failAfterLocalMusicOwnedCleanup(error, {
      closeSessionStore: closeLocalSessionStore,
      closePool: async () => { await pool.end(); },
    });
    throw error;
  }
}

async function composeApp(musicIdentityConfig: MusicIdentityRuntimeConfig, localProfile: ValidatedLocalMusicProfile | undefined, apiOnly: boolean): Promise<Awaited<ReturnType<typeof createApp>>> {
  installSafeConsole();
  if (localProfile) {
    assertValidatedLocalMusicProfile(localProfile, process.env);
    if (!process.env.COOKIE_SECRET || !process.env.SESSION_SECRET
        || process.env.COOKIE_SECRET === process.env.SESSION_SECRET) {
      throw new Error("Local runtime cookie and session authorities are required");
    }
  } else assertContainmentStartup(process.env);
  const app = express();

  // Enable trust proxy FIRST, before any middleware
  // This is critical for secure cookies to work properly
  app.set("trust proxy", (peerAddress: string) => musicIdentityConfig.isTrustedProxy(peerAddress));

  // Basic middleware setup
  app.use((req, res, next) => {
    res.setHeader("X-Request-Id", requestIdFor(req));
    next();
  });
  app.use((req, res, next) => {
    const declared = req.get("content-length");
    if (declared && /^\d+$/.test(declared) && Number(declared) > 64 * 1024) {
      const requestId = requestIdFor(req); let sent = false;
      const reject = () => { if (sent) return; sent = true; res.setHeader("Connection", "close"); res.status(413).json(musicErrorEnvelope(new MusicIdentityError("PAYLOAD_TOO_LARGE", 413, "The Music request payload is too large.", "none", false), requestId)); };
      const deadline = setTimeout(reject, 25); deadline.unref();
      req.once("end", reject); req.resume(); return;
    }
    next();
  });
  setupMusicIdentityBodylessPreflight(app);
  app.use(contentBodyParser());
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-only-cookie-secret'));

  // Serve favicon and related files directly from root and public directories
  // This ensures maximum browser compatibility for favicon display
  if (!localProfile && !apiOnly) {
    app.use(express.static('.')); // Serve files from root directory
    app.use(express.static('public')); // Serve files from public directory
  }

  // Enhanced CORS configuration for all environments
  // This is critical for cookie persistence and cross-origin requests
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin) {
      // Get allowed origins from environment variable (comma-separated list) as well as localhost:5173
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5173'];

      // If ALLOWED_ORIGINS is set, validate the origin
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes(origin)) {
          // Origin is in the allowed list
          res.header("Access-Control-Allow-Origin", origin);
        } else {
          // Origin not allowed, don't set CORS headers
          // This will cause the browser to block the request
          return next();
        }
      } else {
        // No ALLOWED_ORIGINS set, allow any origin (development mode)
        res.header("Access-Control-Allow-Origin", origin);
      }

      // Allow credentials (cookies, authorization headers, etc)
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Expose-Headers", "Retry-After");
      // Allow necessary headers
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token, Idempotency-Key, X-Music-Guest-Capability"
      );
      // Allow necessary methods
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      // Set max age for preflight requests
      res.header("Access-Control-Max-Age", "86400"); // 24 hours
    }

    // Handle preflight OPTIONS requests
    if (req.method === "OPTIONS" && req.get("access-control-request-method")) {
      return res.sendStatus(200);
    }

    next();
  });

  // Enhanced request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    // Log ALL POST requests, and GET requests to API
    const isApiRoute = path.startsWith("/api/");
    const isPost = req.method === 'POST';

    // Detailed request logging for API routes
    if (isApiRoute || isPost) {
      console.log(`\n🟦 ============================================`);
      console.log(`🟦 [Request Logger] ${req.method} ${sanitizedRequestLogTarget(req)}`);
      console.log(`🟦 Path: ${path}`);
      console.log(`🟦 Content-Type: ${req.headers['content-type']}`);
      console.log(`🟦 ============================================\n`);
    }

    // Response logging
    res.on("finish", () => {
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (isApiRoute || isPost) {
        console.log(`🟦 [Response] ${logLine}`);
      } else {
        log(logLine);
      }
    });

    next();
  });

  console.log('Starting server initialization...');
  const { lifecycleProofToken, ...routeMusicConfig } = musicIdentityConfig;
  const identityAbsenceProof = new StrapiIdentityAbsenceProof({
    baseUrl: musicIdentityConfig.strapiOrigin,
    accessToken: lifecycleProofToken,
    fetchImpl: musicIdentityConfig.fetchImpl,
    timeoutMs: Math.min(musicIdentityConfig.overallTimeoutMs, 30_000),
  });
  const registered = await registerRoutes(app, storage, routeMusicConfig, {
    proveAbsence: (identity) => identityAbsenceProof.prove(identity),
    fixtureReadToken: musicIdentityConfig.mode === "fixture" ? lifecycleProofToken : undefined,
  }, localProfile);
  const { server } = registered;

  // Error handling middleware (registered after routes, before the Vite/static
  // catch-all that the entrypoint adds — preserves the original ordering)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    containmentErrorHandler(err, req, res);
  });

  if (!localProfile && !apiOnly) return { app, server };
  return {
    app,
    server,
    shutdown: createLocalMusicRuntimeShutdown({
      server,
      stopRoutes: registered.shutdown,
      closeSessionStore: closeLocalSessionStore,
      closePool: async () => { await pool.end(); },
    }),
  };
}

async function closeLocalSessionStore(): Promise<void> {
  const sessionStore = storage.sessionStore as typeof storage.sessionStore & {
    close?: () => void | Promise<void>;
    stopInterval?: () => void;
  };
  if (sessionStore.close) await sessionStore.close();
  else sessionStore.stopInterval?.();
}
