import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { setupExplorersMediaRoutes } from "../routes/explorersMediaRoutes";
import { PlacePhotoFetchFailure } from "../services/placePhotoFetch";

/**
 * POST /api/explorers/v1/media/place-photo, with the actor, media service and fetcher
 * stubbed so the route's own policy is what is under test: trusted origin, an
 * authenticated owner before any outbound fetch, and the bytes stored through the same
 * createMedia path (and "collection" purpose) as an uploaded list cover.
 */
vi.mock("../middleware/explorersPrincipal", () => ({
  requireActor: vi.fn(async (req: express.Request) => {
    if (req.get("cookie") !== "session=ok") throw Object.assign(new Error("unauthenticated"), { status: 401 });
    return { accountId: "acc_1" };
  }),
  sendActorError: (_req: express.Request, res: express.Response) => res.status(401).json({ error: { code: "UNAUTHENTICATED" } }),
}));

const jpeg = Buffer.from([255, 216, 255, 224]);
const photoUri = "https://lh3.googleusercontent.com/place-photos/abc=s4800-w400";

function app(fetch = vi.fn(async () => ({ bytes: jpeg, mimeType: "image/jpeg" }))) {
  const createMedia = vi.fn(async () => ({ id: "m1", url: "/api/explorers/v1/media/m1/content", mimeType: "image/jpeg", size: 4, alternativeText: null, caption: null }));
  const instance = express();
  setupExplorersMediaRoutes(instance, {} as never, {} as never, { baseURL: "https://explorers.test" } as never,
    { createMedia } as never, undefined, undefined, { fetch } as never);
  return { instance, createMedia, fetch };
}
const post = (instance: express.Express, body: unknown, origin = "https://explorers.test", cookie = "session=ok") =>
  request(instance).post("/api/explorers/v1/media/place-photo").set("origin", origin).set("cookie", cookie).send(body as object);

describe("place photo import route", () => {
  it("fetches the photo URI and stores it as collection media", async () => {
    const { instance, createMedia, fetch } = app();
    const response = await post(instance, { photoUri });
    expect(response.status).toBe(201);
    expect(response.body.media.id).toBe("m1");
    expect(fetch).toHaveBeenCalledWith(photoUri);
    expect(createMedia).toHaveBeenCalledWith({ accountId: "acc_1" },
      expect.objectContaining({ purpose: "collection", mimeType: "image/jpeg", length: 4, bytes: jpeg }), expect.anything());
  });
  it("refuses an untrusted origin before fetching", async () => {
    const { instance, fetch } = app();
    expect((await post(instance, { photoUri }, "https://evil.example")).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses an anonymous caller before fetching", async () => {
    const { instance, fetch } = app();
    expect((await post(instance, { photoUri }, undefined, "")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[{}], [{ photoUri: 42 }], [{ photoUri, extra: 1 }]])("refuses a malformed body %j before fetching", async body => {
    const { instance, fetch } = app();
    expect((await post(instance, body)).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("answers an unfetchable photo as 422 and stores nothing", async () => {
    const { instance, createMedia } = app(vi.fn(async () => { throw new PlacePhotoFetchFailure(); }));
    const response = await post(instance, { photoUri });
    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe("Place photo unavailable");
    expect(createMedia).not.toHaveBeenCalled();
  });
});
