import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAnalyticsStrapiAccessToken } from "../explorers-analytics-composition";

vi.mock("dotenv", () => {
  throw new Error("DEFAULT_TEST_DOTENV_IMPORT_FORBIDDEN");
});

const databaseBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  const reject = (operation: string) => (..._args: unknown[]): never => {
    unexpected.push(operation);
    throw new Error(`Unexpected database use: ${operation}`);
  };
  return {
    unexpected,
    pool: {
      query: reject("pool.query"),
      connect: reject("pool.connect"),
      end: reject("pool.end"),
    },
  };
});

vi.mock("../../db", () => ({ pool: databaseBoundary.pool }));

afterEach(() => {
  expect(databaseBoundary.unexpected).toEqual([]);
});

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

