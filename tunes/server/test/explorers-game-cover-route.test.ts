import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { setupExplorersMediaRoutes } from "../routes/explorersMediaRoutes";
import { GameCoverFetcher } from "../services/gameCoverFetch";
import { PlacePhotoFetchFailure } from "../services/placePhotoFetch";

/**
 * POST /api/explorers/v1/media/game-cover: an IGDB search hit's cover, fetched here from
 * images.igdb.com by its image id and stored as the game's first snapshot through the same
 * createMedia path as an upload, so the saved game shows it and the browser never hot-links.
 */
vi.mock("../middleware/explorersPrincipal", () => ({
  requireActor: vi.fn(async (req: express.Request) => {
    if (req.get("cookie") !== "session=ok") throw Object.assign(new Error("unauthenticated"), { status: 401 });
    return { accountId: "acc_1" };
  }),
  sendActorError: (_req: express.Request, res: express.Response) => res.status(401).json({ error: { code: "UNAUTHENTICATED" } }),
}));

const jpeg = Buffer.from([255, 216, 255, 224]);
function app(fetch = vi.fn(async () => ({ bytes: jpeg, mimeType: "image/jpeg" }))) {
  const createMedia = vi.fn(async () => ({ id: "m1", url: "/api/explorers/v1/media/m1/content", mimeType: "image/jpeg", size: 4, alternativeText: null, caption: null }));
  const instance = express();
  setupExplorersMediaRoutes(instance, {} as never, {} as never, { baseURL: "https://explorers.test" } as never,
    { createMedia } as never, undefined, undefined, undefined, { fetch } as never);
  return { instance, createMedia, fetch };
}
const post = (instance: express.Express, body: unknown, origin = "https://explorers.test", cookie = "session=ok") =>
  request(instance).post("/api/explorers/v1/media/game-cover").set("origin", origin).set("cookie", cookie).send(body as object);

describe("game cover import route", () => {
  it("fetches the IGDB cover and stores it as recommendation media", async () => {
    const { instance, createMedia, fetch } = app();
    const response = await post(instance, { imageId: "co3byy" });
    expect(response.status).toBe(201);
    expect(response.body.media.id).toBe("m1");
    expect(fetch).toHaveBeenCalledWith("co3byy");
    expect(createMedia).toHaveBeenCalledWith({ accountId: "acc_1" },
      expect.objectContaining({ purpose: "recommendation", filename: "game-cover", mimeType: "image/jpeg", bytes: jpeg }), expect.anything());
  });
  it("refuses an untrusted origin or anonymous caller before fetching", async () => {
    const { instance, fetch } = app();
    expect((await post(instance, { imageId: "co3byy" }, "https://evil.example")).status).toBe(403);
    expect((await post(instance, { imageId: "co3byy" }, undefined, "")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[{}], [{ imageId: 42 }], [{ imageId: "co3byy", extra: 1 }], [{ imageId: "../x" }], [{ imageId: "https://evil.example/x.jpg" }]])("refuses a malformed body %j before fetching", async body => {
    const { instance, fetch } = app();
    expect((await post(instance, body)).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("answers an unfetchable cover as 422 and stores nothing", async () => {
    const { instance, createMedia } = app(vi.fn(async () => { throw new PlacePhotoFetchFailure(); }));
    expect((await post(instance, { imageId: "co3byy" })).status).toBe(422);
    expect(createMedia).not.toHaveBeenCalled();
  });
});

describe("GameCoverFetcher", () => {
  const fixture = (host: string[] = []) => ({ mode: "deterministic-fixture" as const,
    resolve: async (h: string) => { host.push(h); return [{ address: "8.8.8.8", family: 4 }]; },
    connect: async (t: { url: URL }) => { host.push(t.url.href); return { status: 200, mimeType: "image/jpeg", length: 4, body: (async function* () { yield jpeg; })() }; } });
  it("requests only the t_cover_big jpeg on images.igdb.com", async () => {
    const seen: string[] = [];
    const cover = await new GameCoverFetcher(fixture(seen)).fetch("co3byy");
    expect(cover.mimeType).toBe("image/jpeg");
    expect(seen).toEqual(["images.igdb.com", "https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg"]);
  });
  it.each(["", "../co1", "co1/x", "co1.jpg", "a".repeat(201)])("refuses image id %j before any lookup", async id => {
    const seen: string[] = [];
    await expect(new GameCoverFetcher(fixture(seen)).fetch(id)).rejects.toBeInstanceOf(PlacePhotoFetchFailure);
    expect(seen).toEqual([]);
  });
});
