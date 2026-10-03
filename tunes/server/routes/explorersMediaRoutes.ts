import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import type { Pool } from "pg";
import type { ExplorersAuth, ExplorersAuthConfig } from "../auth/betterAuth";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { MediaService, MediaInputError, MediaUnavailable, type MediaUploadInput } from "../application/media";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (status: number, code: string, message: string) => ({ status, body: { error: { code, message, requestId: randomUUID() } } });

export function setupExplorersMediaRoutes(app: Express, pool: Pool, auth: ExplorersAuth, config: ExplorersAuthConfig,
  service = new MediaService(pool)): void {
  app.post("/api/explorers/v1/media", async (request, response, next) => {
    if (request.get("origin") !== config.baseURL) {
      const result = failure(403, "FORBIDDEN", "Origin is not trusted");
      return response.status(result.status).json(result.body);
    }
    try { request.explorersActor = await requireActor(request, auth, pool); next(); }
    catch (error) { sendActorError(request, response, error); }
  }, express.raw({ type: () => true, limit: "10mb" }), async (request, response) => {
    try {
      const actor = request.explorersActor!;
      const media = await service.createMedia(actor, { purpose: request.get("x-media-purpose") as MediaUploadInput["purpose"],
        filename: request.get("x-file-name") ?? "", mimeType: request.get("content-type") ?? "",
        length: Number(request.get("content-length")), bytes: request.body } , { requestId: randomUUID() });
      return response.status(201).json({ media });
    } catch (error) {
      if (error instanceof MediaInputError) { const result = failure(422, "INVALID_INPUT", error.message); return response.status(result.status).json(result.body); }
      sendActorError(request, response, error);
    }
  });

  app.delete("/api/explorers/v1/media/:id", async (request, response) => {
    if (request.get("origin") !== config.baseURL) { const result = failure(403, "FORBIDDEN", "Origin is not trusted"); return response.status(result.status).json(result.body); }
    try {
      const actor = await requireActor(request, auth, pool);
      if (!uuid.test(request.params.id)) throw new MediaUnavailable("Media unavailable");
      await service.deleteMedia(actor, request.params.id, { requestId: randomUUID() });
      return response.status(204).end();
    } catch (error) {
      if (error instanceof MediaUnavailable) { const result = failure(404, "NOT_FOUND", "Media unavailable"); return response.status(result.status).json(result.body); }
      sendActorError(request, response, error);
    }
  });

  const content = async (request: express.Request, response: express.Response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!uuid.test(request.params.id)) throw new MediaUnavailable("Media unavailable");
      let actor = null;
      if (request.headers.cookie) {
        try { actor = await requireActor(request, auth, pool); }
        catch { actor = null; }
      }
      const object = await service.resolveMediaContent(actor, request.params.id);
      const etag = `"${object.sha256}"`;
      response.setHeader("ETag", etag);
      response.setHeader("Content-Type", object.mimeType);
      response.setHeader("Accept-Ranges", "bytes");
      const range = request.get("range");
      if (!range && request.get("if-none-match") === etag) return response.status(304).end();
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return response.status(416).end();
        let start = match[1] ? Number(match[1]) : Math.max(0, object.length - Number(match[2]));
        let end = match[2] && match[1] ? Number(match[2]) : object.length - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= object.length)
          return response.status(416).end();
        end = Math.min(end, object.length - 1);
        response.setHeader("Content-Range", `bytes ${start}-${end}/${object.length}`);
        response.setHeader("Content-Length", end - start + 1);
        return response.status(206).end(request.method === "HEAD" ? undefined : object.bytes.subarray(start, end + 1));
      }
      response.setHeader("Content-Length", object.length);
      return response.status(200).end(request.method === "HEAD" ? undefined : object.bytes);
    } catch {
      response.removeHeader("ETag"); response.removeHeader("Content-Type"); response.removeHeader("Content-Length");
      const result = failure(404, "NOT_FOUND", "Media unavailable"); return response.status(result.status).json(result.body);
    }
  };
  app.get("/api/explorers/v1/media/:id/content", content);
  app.head("/api/explorers/v1/media/:id/content", content);
}
