import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes/index";
import { log } from "./vite";
import cookieParser from "cookie-parser";
import type { Server } from "http";
import { storage } from "./storage";
import {
  resolveTrustProxySetting,
  shouldLogRequestBody,
} from "./security/request-security-policy";

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
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();
  const trustProxySetting = resolveTrustProxySetting(
    process.env.TRUST_PROXY_CIDRS,
  );

  // Trust only the configured ingress hops. This keeps req.ip useful for
  // coarse country resolution without accepting arbitrary forwarded IPs.
  app.set("trust proxy", trustProxySetting);

  // Basic middleware setup
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-only-cookie-secret'));

  // Serve favicon and related files directly from root and public directories
  // This ensures maximum browser compatibility for favicon display
  app.use(express.static('.')); // Serve files from root directory
  app.use(express.static('public')); // Serve files from public directory

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
      // Allow necessary headers
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Cookie, Authorization, X-CSRF-Token, X-Username"
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
    if (req.method === "OPTIONS") {
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
      console.log(`🟦 [Request Logger] ${req.method} ${req.originalUrl}`);
      console.log(`🟦 Path: ${path}`);
      console.log(`🟦 Content-Type: ${req.headers['content-type']}`);
      if (isPost && shouldLogRequestBody(path)) {
        // Log body preview for POST requests
        try {
          const bodyPreview = JSON.stringify(req.body).substring(0, 200);
          console.log(`🟦 Body Preview: ${bodyPreview}...`);
        } catch (e) {
          console.log('🟦 Body not serializable');
        }
      }
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
  const server = await registerRoutes(app, storage);
  // Auth setup historically changed this setting; restore the single global
  // policy after every route has registered.
  app.set("trust proxy", trustProxySetting);

  // Error handling middleware (registered after routes, before the Vite/static
  // catch-all that the entrypoint adds — preserves the original ordering)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  return { app, server };
}
