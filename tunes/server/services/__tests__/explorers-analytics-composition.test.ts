import { afterEach, describe, expect, it, vi } from "vitest";
import { hashGuestCapability } from "../../policies/musicSurfacePolicy";
import { resolveAnalyticsStrapiAccessToken, resolveFriendlyMusicAnalyticsTarget, resolvePublicMusicAnalyticsTarget } from "../explorers-analytics-composition";

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

describe("resolvePublicMusicAnalyticsTarget", () => {
  it("resolves one active public owner without returning route authority", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ strapi_account_document_id: "account-1", guest_discoverable: true }] });
    await expect(resolvePublicMusicAnalyticsTarget({ query } as never, "public-owner")).resolves.toEqual({ accountId: "account-1", mode: "public" });
    expect(query.mock.calls[0][1]).toEqual(["0".repeat(64), "public-owner", false]);
  });

  it("accepts only a slug-bound current unlisted capability and never sends the raw capability to SQL", async () => {
    const capability = "C".repeat(43);
    const query = vi.fn().mockResolvedValue({ rows: [{
      strapi_account_document_id: "account-1",
      guest_discoverable: false,
      guest_capability_hash: hashGuestCapability(capability),
      guest_capability_revoked_at: null,
    }] });
    await expect(resolvePublicMusicAnalyticsTarget({ query } as never, "unlisted-owner", capability)).resolves.toEqual({ accountId: "account-1", mode: "unlisted" });
    expect(JSON.stringify(query.mock.calls)).not.toContain(capability);
  });

  it.each([
    [[]],
    [[{ strapi_account_document_id: "account-1", guest_discoverable: true }, { strapi_account_document_id: "account-2", guest_discoverable: true }]],
    [[{ strapi_account_document_id: "", guest_discoverable: true }]],
  ])("fails closed for missing, colliding, or malformed ownership", async (rows) => {
    await expect(resolvePublicMusicAnalyticsTarget({ query: vi.fn().mockResolvedValue({ rows }) } as never, "public-owner")).resolves.toBeUndefined();
  });
});

describe("resolveFriendlyMusicAnalyticsTarget", () => {
  it("resolves exactly one active local binding by account descriptor", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ strapi_account_document_id: "account-1" }] });
    await expect(resolveFriendlyMusicAnalyticsTarget({ query } as never, "account-1"))
      .resolves.toEqual({ accountId: "account-1", mode: "friendly" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("identity_status='active'"), ["account-1"]);
  });

  it.each([[[]], [[{ strapi_account_document_id: "other" }]], [[{ strapi_account_document_id: "account-1" }, { strapi_account_document_id: "account-1" }]]])
    ("fails closed for missing, mismatched, or colliding bindings", async (rows) => {
      await expect(resolveFriendlyMusicAnalyticsTarget({ query: vi.fn().mockResolvedValue({ rows }) } as never, "account-1"))
        .resolves.toBeUndefined();
    });
});
