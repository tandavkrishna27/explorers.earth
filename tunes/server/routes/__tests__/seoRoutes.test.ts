import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSitemapXml, EXPLORERS_STATIC_SITEMAP_URLS, setupSeoRoutes } from "../../seo-routes";
import { createLoopbackSupertestScope } from "../../test/helpers/loopback-supertest";

vi.mock("dotenv", () => {
  throw new Error("DEFAULT_TEST_DOTENV_IMPORT_FORBIDDEN");
});

const storageBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  return {
    unexpected,
    storage: new Proxy({}, {
      get(_target, property): never {
        unexpected.push(String(property));
        throw new Error(`Unexpected storage use: ${String(property)}`);
      },
    }),
  };
});

vi.mock("../../storage", () => ({ storage: storageBoundary.storage }));

describe("explorers sitemap static pages", () => {
  const loopback = createLoopbackSupertestScope();

  afterEach(async () => {
    try {
      expect(storageBoundary.unexpected).toEqual([]);
    } finally {
      try {
        await loopback.closeAll();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it("includes the About and Use Cases marketing routes", () => {
    const xml = buildSitemapXml(EXPLORERS_STATIC_SITEMAP_URLS);

    expect(xml).toContain("<loc>https://explorers.earth/about</loc>");
    expect(xml).toContain("<loc>https://explorers.earth/use-cases</loc>");
  });

  it("serves the marketing routes from the public sitemap endpoint", async () => {
    vi.stubEnv("STRAPI_URL", "");
    vi.stubEnv("STRAPI_ACCESS_TOKEN", "");
    const app = express();
    setupSeoRoutes(app);

    const { request } = await loopback.open({ app });
    const response = await request.get("/api/explorers-sitemap.xml");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/xml/);
    expect(response.text).toContain("<loc>https://explorers.earth/about</loc>");
    expect(response.text).toContain("<loc>https://explorers.earth/use-cases</loc>");
  });

  it("serves only the repository-filtered active public playlist set without caching capability authority", async () => {
    // Break caught: sitemap generation bypasses lifecycle/publication filtering or caches stale publication authority.
    const app = express();
    setupSeoRoutes(app, {
      listPublishedMusicPlaylists: async () => [{ guestUrl: "active-public", updatedAt: new Date("2026-08-14T00:00:00Z") }],
    });

    const { request } = await loopback.open({ app });
    const response = await request.get("/sitemap.xml");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toContain("<loc>https://localtunes.earth/playlist/active-public</loc>");
    expect(response.text).not.toContain("capability");
  });
});
