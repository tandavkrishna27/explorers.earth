import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import type { Pool } from "pg";
import type { ExplorersAuth, ExplorersAuthConfig } from "../auth/betterAuth";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { MediaService, MediaInputError, MediaUnavailable, type MediaUploadInput } from "../application/media";
import { fromNodeHeaders } from "#auth-runtime";
import { GoogleAvatarFetcher } from "../services/googleAvatarFetch";
import { PlacePhotoFetcher, PlacePhotoFetchFailure } from "../services/placePhotoFetch";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * `no-cache` (not max-age): a cache may keep the bytes but must revalidate with the origin on
 * every use. Revalidation re-runs the public-attachment check, so an unpublished image answers
 * 404 on the very next use instead of lingering for a max-age window (UAT MED-01 / visibility
 * freshness). While it is still public the answer is a 304 with no body. Worst-case staleness
 * of a media response is therefore 0 s for a cache that honours the header; a browser page
 * that already rendered the <img> keeps showing it until its next load or revalidation tick.
 */
const PUBLIC_MEDIA_CACHE_CONTROL = "public, no-cache";
const failure = (status: number, code: string, message: string) => ({ status, body: { error: { code, message, requestId: randomUUID() } } });

export function setupExplorersMediaRoutes(app: Express, pool: Pool, auth: ExplorersAuth, config: ExplorersAuthConfig,
  service = new MediaService(pool),beforeMediaCommand?:express.RequestHandler,avatarFetcher = new GoogleAvatarFetcher(),
  placePhotos = new PlacePhotoFetcher()): void {
  app.post("/api/explorers/v1/media", async (request, response, next) => {
    if (request.get("origin") !== config.baseURL) {
      const result = failure(403, "FORBIDDEN", "Origin is not trusted");
      return response.status(result.status).json(result.body);
    }
    try { request.explorersActor = await requireActor(request, auth, pool); next(); }
    catch (error) { sendActorError(request, response, error); }
  }, express.raw({ type: () => true, limit: "10mb" }), ...(beforeMediaCommand?[beforeMediaCommand]:[]), async (request, response) => {
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

  /**
   * Imports the signed-in user's Google profile photo as their own profile media, so the photo
   * onboarding offered is stored like any upload and served through the same gate. The URL is
   * read from the session, never from the request, and the fetcher only reaches Google's photo
   * hosts. Nothing references the new media until the caller attaches it to the account.
   */
  app.post("/api/explorers/v1/media/provider-avatar", async (request, response, next) => {
    if (request.get("origin") !== config.baseURL) {
      const result = failure(403, "FORBIDDEN", "Origin is not trusted");
      return response.status(result.status).json(result.body);
    }
    try { request.explorersActor = await requireActor(request, auth, pool); next(); }
    catch (error) { sendActorError(request, response, error); }
  }, ...(beforeMediaCommand?[beforeMediaCommand]:[]), async (request, response) => {
    try {
      const actor = request.explorersActor!;
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      const image = session?.user?.id === actor.userId ? session.user.image : null;
      let photo: { bytes: Buffer; mimeType: string };
      try { if (!image) throw new MediaUnavailable("No profile photo"); photo = await avatarFetcher.fetch(image); }
      catch { const result = failure(404, "NOT_FOUND", "Profile photo unavailable"); return response.status(result.status).json(result.body); }
      const media = await service.createMedia(actor, { purpose: "profile", filename: "google-profile-photo",
        mimeType: photo.mimeType, length: photo.bytes.length, bytes: photo.bytes }, { requestId: randomUUID() });
      return response.status(201).json({ media });
    } catch (error) {
      if (error instanceof MediaInputError) { const result = failure(422, "INVALID_INPUT", error.message); return response.status(result.status).json(result.body); }
      sendActorError(request, response, error);
    }
  });

  // A Places list cover, fetched here from the photoUri Google answers with skipHttpRedirect
  // rather than by the browser (see placePhotoFetch). The owner is authenticated before any
  // outbound request, and the bytes take the same createMedia path as an uploaded cover.
  app.post("/api/explorers/v1/media/place-photo", async (request, response, next) => {
    if (request.get("origin") !== config.baseURL) {
      const result = failure(403, "FORBIDDEN", "Origin is not trusted");
      return response.status(result.status).json(result.body);
    }
    try { request.explorersActor = await requireActor(request, auth, pool); next(); }
    catch (error) { sendActorError(request, response, error); }
  }, express.json({ limit: "4kb" }), ...(beforeMediaCommand?[beforeMediaCommand]:[]), async (request, response) => {
    try {
      const body = request.body as { photoUri?: unknown; purpose?: unknown } | null, purpose = body?.purpose ?? "collection"; // a list cover; a place item's gallery photo (PLC-02) is "recommendation"
      if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "photoUri" && key !== "purpose") || typeof body.photoUri !== "string" || (purpose !== "collection" && purpose !== "recommendation"))
        throw new MediaInputError("Invalid place photo");
      const photo = await placePhotos.fetch(body.photoUri);
      const media = await service.createMedia(request.explorersActor!, { purpose, filename: "place-photo",
        mimeType: photo.mimeType, length: photo.bytes.length, bytes: photo.bytes }, { requestId: randomUUID() });
      return response.status(201).json({ media });
    } catch (error) {
      if (error instanceof MediaInputError || error instanceof PlacePhotoFetchFailure) {
        const result = failure(422, "INVALID_INPUT", error.message); return response.status(result.status).json(result.body);
      }
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
      // Media is written once per id, so bytes for a given URL never change and a cache
      // hit can never be wrong about content. What can change is whether they may be
      // served at all, which is why only an already-public attachment is cacheable and
      // why it must revalidate on every use: unpublishing takes effect on the next request.
      // Owner-only bytes stay no-store.
      //
      // Until now every public view re-downloaded the full object through this server:
      // no-store meant browsers kept no ETag, so the 304 branch below could never be
      // reached from a browser.
      if (object.publicAttachment) response.setHeader("Cache-Control", PUBLIC_MEDIA_CACHE_CONTROL);
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
      const result = failure(404, "NOT_FOUND", "Media unavailable");
      // End the denial directly: Express send/json would mint a new ETag after
      // the authorized object's validator was removed.
      return response.status(result.status).type("json").end(JSON.stringify(result.body));
    }
  };
  app.get("/api/explorers/v1/media/:id/content", content);
  app.head("/api/explorers/v1/media/:id/content", content);
}
