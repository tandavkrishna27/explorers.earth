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

export function createExplorersAnalyticsDependencies(): ExplorersAnalyticsRouteDependencies {
  const strapiUrl = process.env.STRAPI_URL || "";
  const accessToken = process.env.STRAPI_ACCESS_TOKEN || "";
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
  };
}
