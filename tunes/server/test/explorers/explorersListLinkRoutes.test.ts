import {describe, expect, it} from "vitest";
import {setupExplorersRecommendationRoutes} from "../../routes/explorersRecommendationRoutes";

function recorder() {
  const seen: string[] = [];
  const router: any = new Proxy({}, {get: (_t, method: string) => (path: string) => { if (typeof path === "string") seen.push(`${method.toUpperCase()} ${path}`); return router; }});
  return {seen, factory: (() => router) as never};
}

describe("list link routes (WP10)", () => {
  it("registers the link routes and no longer registers the Places-only location route", () => {
    const {seen, factory} = recorder();
    const app: any = {use: () => undefined};
    const pool = {query: async () => ({rows: []})};
    setupExplorersRecommendationRoutes(app, pool as never, {} as never, {baseURL: "http://127.0.0.1:5000", secret: "x".repeat(32)} as never,
      undefined, {} as never, undefined, {} as never, factory);
    expect(seen).toEqual(expect.arrayContaining([
      "POST /api/explorers/v1/collections/:id/links",
      "PATCH /api/explorers/v1/collections/:id/links/:linkId",
      "DELETE /api/explorers/v1/collections/:id/links/:linkId",
      "ALL /api/explorers/v1/collections/:id/links",
      "ALL /api/explorers/v1/collections/:id/links/:linkId",
    ]));
    expect(seen.filter(r => r.endsWith("/collections/:id/location"))).toEqual([]);
  });
});
