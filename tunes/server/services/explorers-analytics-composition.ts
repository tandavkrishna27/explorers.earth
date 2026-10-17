import {createCanonicalAnalyticsDependencies} from '../routes/explorersCanonicalAnalyticsRoutes';
import type { Request } from "express";
import { pool } from "../db";
import {
  resolveCountryFromIp,
  StrapiAnalyticsPublisher,
  StrapiAnalyticsTargetValidator,
  verifyAnalyticsAccountOwnership,
} from "./explorers-analytics-adapters";
import { InMemoryAnalyticsRateLimiter } from "./explorers-analytics-rate-limit";
import { PostgresAnalyticsReceiptRepository } from "./explorers-analytics-receipts";
import { ExplorersAnalyticsService } from "./explorers-analytics-service";
import type { ExplorersAnalyticsRouteDependencies } from "../routes/explorersAnalyticsRoutes";
import { hashGuestCapability, verifyGuestCapability } from "../policies/musicSurfacePolicy";

type AnalyticsStrapiEnvironment = Partial<
  Record<
    "STRAPI_ANALYTICS_ACCESS_TOKEN" | "STRAPI_ACCESS_TOKEN",
    string | undefined
  >
>;

export function resolveAnalyticsStrapiAccessToken(
  environment: AnalyticsStrapiEnvironment = process.env,
): string {
  const accessToken = environment.STRAPI_ANALYTICS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("STRAPI_ANALYTICS_ACCESS_TOKEN is not configured");
  }
  return accessToken;
}

export async function resolvePublicMusicAnalyticsTarget(
  database: Pick<typeof pool, "query">,
  publicSlug: string,
  capability?: string,
): Promise<{ accountId: string; mode: "public" | "unlisted" } | undefined> {
  const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
  const capabilityHash = capabilityValid ? hashGuestCapability(capability) : "0".repeat(64);
  const rows = (await database.query(
    `SELECT strapi_account_document_id,guest_discoverable,guest_capability_hash,guest_capability_revoked_at
       FROM users
      WHERE guest_url=$2 AND identity_status='active'
        AND (guest_discoverable=true OR ($3::boolean AND guest_capability_hash=$1 AND guest_capability_revoked_at IS NULL))
      LIMIT 2`,
    [capabilityHash, publicSlug, capabilityValid],
  )).rows;
  if (rows.length !== 1) return undefined;
  const row = rows[0];
  const accountId = row.strapi_account_document_id;
  if (typeof accountId !== "string" || accountId.length < 1 || accountId.length > 128) return undefined;
  if (row.guest_discoverable === true) return { accountId, mode: "public" };
  return capabilityValid && verifyGuestCapability(capability, row.guest_capability_hash)
    ? { accountId, mode: "unlisted" }
    : undefined;
}

export async function resolveFriendlyMusicAnalyticsTarget(
  database: Pick<typeof pool, "query">,
  accountDocumentId: string,
): Promise<{ accountId: string; mode: "friendly" } | undefined> {
  const rows = (await database.query(
    `SELECT strapi_account_document_id FROM users
      WHERE strapi_account_document_id=$1 AND identity_status='active' LIMIT 2`,
    [accountDocumentId],
  )).rows;
  if (rows.length !== 1 || rows[0].strapi_account_document_id !== accountDocumentId) return undefined;
  return { accountId: accountDocumentId, mode: "friendly" };
}

export function createLegacyExplorersAnalyticsDependencies(): ExplorersAnalyticsRouteDependencies {
  const strapiUrl = process.env.STRAPI_URL || "";
  const accessToken = resolveAnalyticsStrapiAccessToken();
  const service = new ExplorersAnalyticsService({
    receipts: new PostgresAnalyticsReceiptRepository(pool),
    publisher: new StrapiAnalyticsPublisher({ strapiUrl, accessToken }),
    resolveCountry: resolveCountryFromIp,
  });
  const targetValidator = new StrapiAnalyticsTargetValidator({
    strapiUrl,
    accessToken,
  });
  const writeLimiter = new InMemoryAnalyticsRateLimiter();

  return {
    service,
    authorizeOwner: (request: Request, accountId: string) =>
      verifyAnalyticsAccountOwnership({
        strapiUrl,
        authorization: request.headers.authorization,
        accountId,
      }),
    validatePublicTarget: (input) => targetValidator.validate(input),
    allowWrite: (request, accountId) => writeLimiter.allow(request, accountId),
    resolvePublicMusicAnalyticsTarget: (publicSlug, capability) =>
      resolvePublicMusicAnalyticsTarget(pool, publicSlug, capability),
    resolveFriendlyMusicAnalyticsTarget: (accountDocumentId) =>
      resolveFriendlyMusicAnalyticsTarget(pool, accountDocumentId),
  };
}

/** Canonical writes are local transactions; only historical GET loads legacy credentials. */
export function createExplorersAnalyticsDependencies(): ExplorersAnalyticsRouteDependencies {
 return createCanonicalAnalyticsDependencies(pool);
}
