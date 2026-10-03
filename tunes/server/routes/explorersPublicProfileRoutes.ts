import { createHash } from "node:crypto";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { parsePublicProfileDetailRequest, parsePublicProfileRequest, parsePublicProfileUsername } from "../publicProfile/publicProfileContract";
import type { PublicCategory } from "../publicProfile/publicProfilePolicy";

const notFound = { version: "explorers-public-error/v1", error: { code: "NOT_FOUND" } };
const badRequest = { version: "explorers-public-error/v1", error: { code: "BAD_REQUEST" } };
const unavailable = { version: "explorers-public-error/v1", error: { code: "UNAVAILABLE", retryable: true } };
const rateLimited = { version: "explorers-public-error/v1", error: { code: "RATE_LIMITED", retryable: true } };

export function setupExplorersPublicProfileRoutes(
  app: Express,
  dependencies: { shell?(username: string, options?: { bypassCache?: boolean }): Promise<unknown | undefined>; category(username: string, category: PublicCategory, limit: number, options?: { bypassCache?: boolean; cursor?: string }): Promise<unknown | undefined>; detail?(username: string, category: PublicCategory, slug: string, limit: number, options?: { bypassCache?: boolean; cursor?: string }): Promise<unknown | undefined> },
  options: { rateLimit?: { windowMs?: number; limit?: number } } = {},
): void {
  app.use("/api/explorers/v1/profiles", rateLimit({
    windowMs: options.rateLimit?.windowMs ?? 60_000,
    limit: options.rateLimit?.limit ?? 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json(rateLimited),
  }));
  app.use("/api/explorers/v1/profiles", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/explorers/v1/profiles/:username", async (req, res) => {
    let username: string;
    try { username = parsePublicProfileUsername(req.params.username); }
    catch { return res.status(400).json(badRequest); }
    let value: unknown | undefined;
    try { value = await dependencies.shell?.(username, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? "") }); }
    catch { return res.status(503).json(unavailable); }
    if (!value) return res.status(404).json(notFound);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
  });
  app.get("/api/explorers/v1/profiles/:username/recommendations/:category", async (req, res) => {
    let parsed: { username: string; category: PublicCategory; limit: number; cursor?: string };
    try { parsed = parsePublicProfileRequest({ username: req.params.username, category: req.params.category, limit: req.query.limit, cursor: req.query.cursor }); }
    catch { return res.status(400).json(badRequest); }
    let value: unknown | undefined;
    try { value = await dependencies.category(parsed.username, parsed.category, parsed.limit, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? ""), cursor: parsed.cursor }); }
    catch {
      return res.status(503).json(unavailable);
    }
    if (!value) return res.status(404).json(notFound);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
  });
  app.get("/api/explorers/v1/profiles/:username/recommendations/:category/:slug", async (req, res) => {
    let parsed: { username: string; category: PublicCategory; slug: string; limit: number; cursor?: string };
    try { parsed = parsePublicProfileDetailRequest({ username: req.params.username, category: req.params.category, slug: req.params.slug, limit: req.query.limit, cursor: req.query.cursor }); }
    catch { return res.status(400).json(badRequest); }
    let value: unknown | undefined;
    try { value = await dependencies.detail?.(parsed.username, parsed.category, parsed.slug, parsed.limit, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? ""), cursor: parsed.cursor }); }
    catch { return res.status(503).json(unavailable); }
    if (!value) return res.status(404).json(notFound);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
  });
}
