import { createHash, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { setupExplorersMediaRoutes } from "../routes/explorersMediaRoutes";
import { MediaUnavailable, type AuthorizedMediaObject } from "../application/media";

/**
 * The cache policy on the media content route, with the service stubbed so the policy is
 * tested on its own rather than through a database.
 *
 * Why this matters: public pages serve every image through this route, and until now it
 * answered `no-store`, so each view re-downloaded the full object through the server and
 * browsers kept no ETag - leaving the route's own 304 branch unreachable from a browser.
 *
 * The rule is narrow on purpose. Bytes for a given id never change, so a cache hit cannot
 * be wrong about content; what can change is whether the bytes may be served at all, so
 * only an already-public attachment is cacheable, and the window bounds how long a shared
 * cache may keep handing out an image after it is unpublished.
 */
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function app(object: AuthorizedMediaObject | "unavailable") {
  const instance = express();
  setupExplorersMediaRoutes(instance, {} as never, {} as never, { baseURL: "https://explorers.test" } as never, {
    resolveMediaContent: async () => {
      if (object === "unavailable") throw new MediaUnavailable("Media unavailable");
      return object;
    },
  } as never);
  return instance;
}

const object = (publicAttachment: boolean): AuthorizedMediaObject => ({
  key: `prod/${randomUUID()}/${randomUUID()}`, mimeType: "image/png", length: png.length, bytes: png,
  sha256: createHash("sha256").update(png).digest("hex"), publicAttachment,
});

const url = `/api/explorers/v1/media/${randomUUID()}/content`;

describe("media content cache policy", () => {
  it("lets a public attachment be cached briefly, and revalidate for no bytes", async () => {
    const served = await request(app(object(true))).get(url);
    expect(served.status).toBe(200);
    expect(served.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    // The validator is the content hash, so revalidation is exact rather than heuristic.
    expect(served.headers.etag).toBe(`"${createHash("sha256").update(png).digest("hex")}"`);

    const revalidated = await request(app(object(true))).get(url).set("if-none-match", served.headers.etag!);
    expect(revalidated.status).toBe(304);
    expect(revalidated.body.length ?? 0).toBe(0);
  });

  it("keeps owner-only bytes out of every cache", async () => {
    const served = await request(app(object(false))).get(url);
    expect(served.status).toBe(200);
    expect(served.headers["cache-control"]).toBe("no-store");
  });

  it("never caches a refusal, so a later publication is not hidden by it", async () => {
    const refused = await request(app("unavailable")).get(url);
    expect(refused.status).toBe(404);
    expect(refused.headers["cache-control"]).toBe("no-store");
  });

  it("keeps a ranged public read cacheable and a ranged private read not", async () => {
    const open = await request(app(object(true))).get(url).set("range", "bytes=0-3");
    expect(open.status).toBe(206);
    expect(open.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    const closed = await request(app(object(false))).get(url).set("range", "bytes=0-3");
    expect(closed.status).toBe(206);
    expect(closed.headers["cache-control"]).toBe("no-store");
  });

  it("answers HEAD with the same policy and no body", async () => {
    const head = await request(app(object(true))).head(url);
    expect(head.status).toBe(200);
    expect(head.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    expect(head.headers["content-length"]).toBe(String(png.length));
  });
});
