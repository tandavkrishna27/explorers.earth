import geoip from "geoip-lite";
import type {
  AnalyticsPublisher,
  ExplorersAnalyticsInput,
  NormalizedExplorersAnalyticsEvent,
} from "./explorers-analytics-service";

type FetchLike = typeof fetch;
type GeoLookup = (ip: string) => { country?: string } | null;

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const isPrivateOrLocalIp = (rawIp: string): boolean => {
  const ip = rawIp.trim().toLowerCase().replace(/^::ffff:/, "");
  if (!ip || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) {
    return true;
  }

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

export function resolveCountryFromIp(
  ip: string | null,
  lookup: GeoLookup = geoip.lookup,
): string | null {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  const country = lookup(ip)?.country;
  return typeof country === "string" && /^[A-Za-z]{2}$/.test(country)
    ? country.toUpperCase()
    : null;
}

const CREATE_EVENT = `
  mutation CreateExplorersAnalyticsEvent($data: PublicPageAnalyticInput!) {
    createPublicPageAnalytic(data: $data) {
      documentId
    }
  }
`;

const READ_EVENTS = `
  query ReadExplorersAnalyticsEvents(
    $accountId: String!
    $from: DateTime!
    $to: DateTime!
    $page: Int!
    $pageSize: Int!
  ) {
    publicPageAnalytics(
      filters: {
        Account_Id: { eq: $accountId }
        createdAt: { between: [$from, $to] }
      }
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["createdAt:asc"]
    ) {
      documentId
      Account_Id
      Location_Id
      Recommendation_Id
      Stats
      createdAt
    }
  }
`;

const FIND_EVENT_BY_ID = `
  query FindExplorersAnalyticsEvent(
    $accountId: String!
    $page: Int!
    $pageSize: Int!
  ) {
    publicPageAnalytics(
      filters: { Account_Id: { eq: $accountId } }
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["createdAt:desc"]
    ) {
      documentId
      Stats
    }
  }
`;

interface AnalyticsTargetDescriptor {
  accountListRelation?: string;
  listRecommendationRelation?: string;
  accountRecommendationRelation?: string;
}

// These are server-controlled GraphQL identifiers, never client input. Every
// optional public analytics target is checked through its owning Strapi
// relation without requiring any Strapi schema or application-code changes.
const ANALYTICS_TARGETS_BY_PAGE: Record<string, AnalyticsTargetDescriptor> = {
  "public-home": {
    accountListRelation: "recommendation_lists",
    listRecommendationRelation: "recommended_places",
  },
  "recommendation-detail": {
    accountListRelation: "recommendation_lists",
    listRecommendationRelation: "recommended_places",
  },
  "public-movies": {
    accountListRelation: "movie_lists",
    listRecommendationRelation: "recommended_movies",
  },
  "public-books": {
    accountListRelation: "book_lists",
    listRecommendationRelation: "recommended_books",
  },
  "public-games": {
    accountListRelation: "game_lists",
    listRecommendationRelation: "recommended_games",
  },
  "public-apps": {
    accountListRelation: "app_lists",
    listRecommendationRelation: "recommended_apps",
  },
  "public-products": {
    accountListRelation: "product_lists",
    listRecommendationRelation: "recommended_products",
  },
  "public-people": {
    accountListRelation: "person_lists",
    listRecommendationRelation: "recommended_people",
  },
  "public-guides": {
    accountRecommendationRelation: "guides",
  },
};

function buildPublicTargetValidationQuery(input: ExplorersAnalyticsInput): {
  query: string;
  variables: Record<string, string>;
} | null {
  const locationId = input.locationId ?? null;
  const recommendationId = input.recommendationId ?? null;
  const descriptor = ANALYTICS_TARGETS_BY_PAGE[input.event.page];

  if (
    (locationId && !descriptor?.accountListRelation) ||
    (recommendationId &&
      !descriptor?.listRecommendationRelation &&
      !descriptor?.accountRecommendationRelation)
  ) {
    return null;
  }

  const variableDefinitions = ["$accountId: ID!"];
  const accountSelections = ["documentId"];
  const variables: Record<string, string> = { accountId: input.accountId };

  if (locationId && descriptor?.accountListRelation) {
    variableDefinitions.push("$locationId: ID!");
    variables.locationId = locationId;
    const nestedRecommendation = recommendationId && descriptor.listRecommendationRelation
      ? `
          recommendationTargets: ${descriptor.listRecommendationRelation}(
            filters: { documentId: { eq: $recommendationId } }
            pagination: { page: 1, pageSize: 1 }
          ) {
            documentId
          }
        `
      : "";
    accountSelections.push(`
      locationTargets: ${descriptor.accountListRelation}(
        filters: { documentId: { eq: $locationId } }
        pagination: { page: 1, pageSize: 1 }
      ) {
        documentId
        ${nestedRecommendation}
      }
    `);
  }

  if (recommendationId) {
    variableDefinitions.push("$recommendationId: ID!");
    variables.recommendationId = recommendationId;
    if (descriptor?.accountRecommendationRelation) {
      accountSelections.push(`
        recommendationTargets: ${descriptor.accountRecommendationRelation}(
          filters: { documentId: { eq: $recommendationId } }
          pagination: { page: 1, pageSize: 1 }
        ) {
          documentId
        }
      `);
    } else if (
      !locationId &&
      descriptor?.accountListRelation &&
      descriptor.listRecommendationRelation
    ) {
      accountSelections.push(`
        recommendationOwnerLists: ${descriptor.accountListRelation}(
          filters: {
            ${descriptor.listRecommendationRelation}: {
              documentId: { eq: $recommendationId }
            }
          }
          pagination: { page: 1, pageSize: 1 }
        ) {
          documentId
        }
      `);
    }
  }

  return {
    query: `
      query ValidatePublicAnalyticsTarget(${variableDefinitions.join(", ")}) {
        accounts(
          filters: { documentId: { eq: $accountId } }
          pagination: { page: 1, pageSize: 1 }
        ) {
          ${accountSelections.join("\n")}
        }
      }
    `,
    variables,
  };
}

export class StrapiAnalyticsTargetValidator {
  private readonly graphqlUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly cache = new Map<
    string,
    { valid: boolean; expiresAt: number }
  >();

  constructor({
    strapiUrl,
    accessToken,
    fetchImpl = fetch,
  }: {
    strapiUrl: string;
    accessToken: string;
    fetchImpl?: FetchLike;
  }) {
    this.graphqlUrl = `${stripTrailingSlash(strapiUrl)}/graphql`;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  async validate(input: ExplorersAnalyticsInput): Promise<boolean> {
    const request = buildPublicTargetValidationQuery(input);
    if (!request) return false;

    const cacheKey = [
      input.accountId,
      input.event.page,
      input.locationId ?? "",
      input.recommendationId ?? "",
    ].join("|");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.valid;

    const response = await this.fetchImpl(this.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        query: request.query,
        variables: request.variables,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json();
    if (!response.ok || body.errors?.length) {
      throw new Error("Strapi analytics target validation failed");
    }
    const account = Array.isArray(body?.data?.accounts)
      ? body.data.accounts[0]
      : null;
    const accountValid = Boolean(account);
    const locationValid =
      !input.locationId ||
      (Array.isArray(account?.locationTargets) &&
        account.locationTargets.length === 1);
    const recommendationValid = !input.recommendationId
      ? true
      : Array.isArray(account?.recommendationTargets)
        ? account.recommendationTargets.length === 1
        : input.locationId
          ? Array.isArray(account?.locationTargets) &&
            account.locationTargets.some(
            (container: Record<string, unknown>) =>
              Array.isArray(container.recommendationTargets) &&
              container.recommendationTargets.length === 1,
            )
          : Array.isArray(account?.recommendationOwnerLists) &&
            account.recommendationOwnerLists.length === 1;
    const valid = accountValid && locationValid && recommendationValid;
    this.cache.set(cacheKey, {
      valid,
      expiresAt: Date.now() + (valid ? 5 * 60_000 : 30_000),
    });
    if (this.cache.size > 10_000) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    return valid;
  }
}

export class StrapiAnalyticsPublisher implements AnalyticsPublisher {
  private readonly graphqlUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: FetchLike;

  constructor({
    strapiUrl,
    accessToken,
    fetchImpl = fetch,
  }: {
    strapiUrl: string;
    accessToken: string;
    fetchImpl?: FetchLike;
  }) {
    this.graphqlUrl = `${stripTrailingSlash(strapiUrl)}/graphql`;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  private async request(query: string, variables: Record<string, unknown>) {
    const response = await this.fetchImpl(this.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json();
    if (!response.ok || body.errors?.length) {
      throw new Error(
        body.errors?.[0]?.message ||
          `Strapi analytics request failed with ${response.status}`,
      );
    }
    return body.data;
  }

  async publish(payload: NormalizedExplorersAnalyticsEvent) {
    const data = await this.request(CREATE_EVENT, {
      data: {
        Account_Id: payload.accountId,
        Location_Id: payload.locationId,
        Recommendation_Id: payload.recommendationId,
        Stats: [{ ...payload.event, eventId: payload.eventId }],
      },
    });
    const documentId = data?.createPublicPageAnalytic?.documentId;
    if (!documentId) throw new Error("Strapi analytics write returned no document ID");
    return { documentId };
  }

  async readAccountEvents(scope: {
    accountId: string;
    from: string;
    to: string;
  }): Promise<unknown[]> {
    const pageSize = 100;
    const records: unknown[] = [];
    for (let page = 1; ; page += 1) {
      const data = await this.request(READ_EVENTS, {
        ...scope,
        page,
        pageSize,
      });
      const batch = Array.isArray(data?.publicPageAnalytics)
        ? data.publicPageAnalytics
        : [];
      records.push(...batch);
      if (batch.length < pageSize) break;
    }
    return records;
  }

  async findByEventId(
    accountId: string,
    eventId: string,
  ): Promise<string | null> {
    const pageSize = 100;
    const maxRecoveryPages = 10;
    for (let page = 1; page <= maxRecoveryPages; page += 1) {
      const data = await this.request(FIND_EVENT_BY_ID, {
        accountId,
        page,
        pageSize,
      });
      const batch = Array.isArray(data?.publicPageAnalytics)
        ? data.publicPageAnalytics
        : [];
      const match = batch.find((record: Record<string, unknown>) =>
        Array.isArray(record.Stats) &&
        record.Stats.some(
          (event: Record<string, unknown>) => event?.eventId === eventId,
        ),
      );
      if (typeof match?.documentId === "string") return match.documentId;
      if (batch.length < pageSize) return null;
    }
    return null;
  }
}

export async function verifyAnalyticsAccountOwnership({
  strapiUrl,
  authorization,
  accountId,
  fetchImpl = fetch,
}: {
  strapiUrl: string;
  authorization?: string;
  accountId: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  const response = await fetchImpl(
    `${stripTrailingSlash(strapiUrl)}/api/users/me?populate=accounts`,
    {
      method: "GET",
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return false;
  const currentUser = await response.json();
  const accounts = Array.isArray(currentUser?.accounts)
    ? currentUser.accounts
    : Array.isArray(currentUser?.accounts?.data)
      ? currentUser.accounts.data
      : [];
  return accounts.some(
    (account: Record<string, unknown>) =>
      account.documentId === accountId || account.id === accountId,
  );
}
