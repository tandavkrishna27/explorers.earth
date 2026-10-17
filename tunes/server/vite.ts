import { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  // CRITICAL: Add middleware BEFORE creating Vite server to ensure API routes are never processed by Vite
  // This must be registered before vite.middlewares to prevent API routes from being intercepted
  app.use((req, res, next) => {
    // Skip ALL API routes - they should be handled by route handlers registered earlier
    const isApiRoute = req.originalUrl?.startsWith("/api/") || req.path?.startsWith("/api/");
    if (isApiRoute) {
      console.log(`🟢 [Pre-Vite Middleware] Skipping API route: ${req.method} ${req.originalUrl}`);
      // Don't process API routes with Vite - let them fall through to route handlers
      return next();
    }
    console.log(`🟡 [Pre-Vite Middleware] Passing to Vite: ${req.method} ${req.originalUrl}`);
    // Continue to next middleware (which will be Vite) for non-API routes
    next();
  });

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Only apply Vite middleware to non-API routes
  // API routes should be handled by route handlers registered before this
  app.use((req, res, next) => {
    // Explicitly skip all API routes - CRITICAL: This prevents Vite from intercepting API requests
    const isApiRoute = req.originalUrl?.startsWith("/api/") || req.path?.startsWith("/api/");
    if (isApiRoute) {
      console.log(`🟢 [Vite Middleware Wrapper] Skipping API route: ${req.method} ${req.originalUrl}`);
      // Skip Vite middleware for API routes - let route handlers process them
      return next();
    }
    console.log(`🟡 [Vite Middleware Wrapper] Processing with Vite: ${req.method} ${req.originalUrl}`);
    // For non-API routes, use Vite middleware
    vite.middlewares(req, res, next);
  });
  
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes - they should be handled by route handlers registered before this middleware
    if (url.startsWith("/api/")) {
      console.log(`🟢 [Vite Catch-all] Skipping API route: ${req.method} ${url}`);
      return next();
    }
    console.log(`🔴 [Vite Catch-all] Serving HTML for: ${req.method} ${url}`);

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
