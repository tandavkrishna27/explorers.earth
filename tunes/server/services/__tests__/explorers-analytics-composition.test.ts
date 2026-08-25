import { describe, expect, it } from "vitest";
import { resolveAnalyticsStrapiAccessToken } from "../explorers-analytics-composition";

describe("resolveAnalyticsStrapiAccessToken", () => {
  it("uses the dedicated analytics token instead of the shared Strapi token", () => {
    expect(
      resolveAnalyticsStrapiAccessToken({
        STRAPI_ANALYTICS_ACCESS_TOKEN: "analytics-token",
        STRAPI_ACCESS_TOKEN: "shared-token",
      }),
    ).toBe("analytics-token");
  });

  it("fails closed when only the shared Strapi token is configured", () => {
    expect(() =>
      resolveAnalyticsStrapiAccessToken({
        STRAPI_ACCESS_TOKEN: "shared-token",
      }),
    ).toThrow("STRAPI_ANALYTICS_ACCESS_TOKEN is not configured");
  });

  it("rejects a whitespace-only dedicated analytics token", () => {
    expect(() =>
      resolveAnalyticsStrapiAccessToken({
        STRAPI_ANALYTICS_ACCESS_TOKEN: "   ",
      }),
    ).toThrow("STRAPI_ANALYTICS_ACCESS_TOKEN is not configured");
  });
});
