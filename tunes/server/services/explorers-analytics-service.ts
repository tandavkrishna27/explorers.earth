import { createHash } from "node:crypto";
import { z } from "zod";

const utmSchema = z
  .object({
    utm_source: z.string().trim().min(1).max(100).optional(),
    utm_medium: z.string().trim().min(1).max(100).optional(),
    utm_campaign: z.string().trim().min(1).max(100).optional(),
    utm_term: z.string().trim().min(1).max(100).optional(),
    utm_content: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const boundedMetadataString = z.string().trim().min(1).max(512);
const referrerOriginSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        value === parsed.origin
      );
    } catch {
      return false;
    }
  }, "referrerOrigin must be an HTTP(S) origin without a path or query");
const metadataSchema = z
  .object({
    action: boundedMetadataString.optional(),
    index: z.number().int().min(0).max(10_000).optional(),
    totalItems: z.number().int().min(0).max(100_000).optional(),
    context: boundedMetadataString.optional(),
    platform: boundedMetadataString.optional(),
    originalElement: boundedMetadataString.optional(),
    cityId: boundedMetadataString.optional(),
    cityName: boundedMetadataString.optional(),
    cityname: boundedMetadataString.optional(),
    viewType: boundedMetadataString.optional(),
    recommendationId: boundedMetadataString.optional(),
    placeId: boundedMetadataString.optional(),
    placeName: boundedMetadataString.optional(),
    category: boundedMetadataString.optional(),
    recommendationType: boundedMetadataString.optional(),
    id: boundedMetadataString.optional(),
    title: boundedMetadataString.optional(),
    authors: boundedMetadataString.optional(),
    listId: boundedMetadataString.optional(),
    listName: boundedMetadataString.optional(),
    mediaType: boundedMetadataString.optional(),
    genres: boundedMetadataString.optional(),
    guideType: boundedMetadataString.optional(),
    artist: boundedMetadataString.optional(),
    youtubeId: boundedMetadataString.optional(),
    placeSlug: boundedMetadataString.optional(),
    selectedCity: boundedMetadataString.optional(),
  })
  .strict();

const analyticsPageSchema = z.enum([
  "public-profile",
  "public-home",
  "recommendation-detail",
  "public-music",
  "public-movies",
  "public-books",
  "public-games",
  "public-apps",
  "public-products",
  "public-people",
  "public-guides",
]);

const canonicalPublicPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    if (!value.startsWith("/") || /[?#\\\u0000-\u001f]/.test(value)) return false;
    const encodedSegments = value.split("/").filter(Boolean);
    if (encodedSegments.length === 0) return false;
    return encodedSegments.every((segment) => {
      try {
        const decoded = decodeURIComponent(segment).trim();
        return Boolean(decoded) && decoded !== "." && decoded !== ".." && !decoded.includes("/");
      } catch {
        return false;
      }
    });
  }, "canonicalPath must be a safe public route path");

export const explorersAnalyticsInputSchema = z.object({
  consent: z.boolean(),
  eventId: z.string().trim().min(8).max(128),
  accountId: z.string().trim().min(1).max(128),
  locationId: z.string().trim().min(1).max(128).nullable().optional(),
  recommendationId: z.string().trim().min(1).max(128).nullable().optional(),
  event: z
    .object({
      type: z.enum(["view", "click", "interaction"]),
      timestamp: z.string().datetime(),
      page: analyticsPageSchema,
      element: z.string().trim().min(1).max(256).optional(),
      canonicalPath: canonicalPublicPathSchema,
      referrerOrigin: referrerOriginSchema.optional(),
      metadata: metadataSchema.optional(),
      utmParams: utmSchema.optional(),
    })
    .strict(),
}).strict().superRefine((input, context) => {
  const metadata = input.event.metadata;
  const metadataLocationId = metadata?.listId ?? metadata?.cityId;
  const metadataRecommendationId =
    metadata?.recommendationId ?? metadata?.placeId ?? metadata?.id;

  if (metadataLocationId && input.locationId !== metadataLocationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["locationId"],
      message: "locationId must match the metadata list target",
    });
  }
  if (
    metadataRecommendationId &&
    input.recommendationId !== metadataRecommendationId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recommendationId"],
      message: "recommendationId must match the metadata item target",
    });
  }
  if (
    /(?:^|-)card(?:-|$)/i.test(input.event.element ?? "") &&
    !input.locationId &&
    !input.recommendationId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["event", "element"],
      message: "card events require a validated list or item target",
    });
  }

  const segments = input.event.canonicalPath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).trim().toLowerCase());
  const expectedCategoryByPage: Partial<
    Record<(typeof analyticsPageSchema)["_output"], string>
  > = {
    "public-home": "places",
    "recommendation-detail": "places",
    "public-music": "music",
    "public-movies": "movies",
    "public-books": "books",
    "public-games": "games",
    "public-apps": "apps",
    "public-products": "products",
    "public-people": "people",
    "public-guides": "guides",
  };
  const expectedCategory = expectedCategoryByPage[input.event.page];
  const pathMatchesPage =
    input.event.page === "public-profile"
      ? segments.length === 1
      : segments.length >= 2 && segments[1] === expectedCategory;
  if (!pathMatchesPage) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["event", "canonicalPath"],
      message: "canonicalPath does not match the analytics page",
    });
  }
});

export type ExplorersAnalyticsInput = z.infer<typeof explorersAnalyticsInputSchema>;

export interface NormalizedExplorersAnalyticsEvent {
  eventId: string;
  accountId: string;
  locationId: string | null;
  recommendationId: string | null;
  event: {
    type: "view" | "click" | "interaction";
    timestamp: string;
    page: string;
    element?: string;
    canonicalPath: string;
    referrerOrigin?: string;
    metadata?: Record<string, unknown>;
    utmParams?: {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_term?: string;
      utm_content?: string;
    };
    country: string | null;
  };
}

export interface AnalyticsReceipt {
  acquired: boolean;
  recovered: boolean;
  payloadHash: string;
  status: "pending" | "committed" | "failed";
  documentId?: string;
  leaseId?: string;
}

export interface AnalyticsReceiptRepository {
  begin(eventId: string, payloadHash: string): Promise<AnalyticsReceipt>;
  commit(eventId: string, documentId: string, leaseId: string): Promise<void>;
  fail?(eventId: string, message: string, leaseId: string): Promise<void>;
}

export interface AnalyticsPublisher {
  publish(
    payload: NormalizedExplorersAnalyticsEvent,
  ): Promise<{ documentId: string }>;
  readAccountEvents(scope: {
    accountId: string;
    from: string;
    to: string;
  }): Promise<unknown[]>;
  findByEventId?(accountId: string, eventId: string): Promise<string | null>;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("The event ID has already been used for a different payload");
    this.name = "IdempotencyConflictError";
  }
}

const FORBIDDEN_IP_KEYS = new Set([
  "ip",
  "ipaddress",
  "rawip",
  "clientip",
  "x-forwarded-for",
  "xforwardedfor",
]);

function stripRawIp(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRawIp);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FORBIDDEN_IP_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, stripRawIp(child)]),
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

const normalizeCountry = (country: string | null | undefined) =>
  typeof country === "string" && /^[A-Za-z]{2}$/.test(country)
    ? country.toUpperCase()
    : null;

type IngestResult =
  | { status: "consent-denied" }
  | { status: "pending"; duplicate: true }
  | {
      status: "committed";
      documentId: string;
      duplicate: boolean;
    };

export class ExplorersAnalyticsService {
  private readonly receipts: AnalyticsReceiptRepository;
  private readonly publisher: AnalyticsPublisher;
  private readonly resolveCountry: (ip: string | null) => string | null;
  private readonly now: () => Date;

  constructor({
    receipts,
    publisher,
    resolveCountry,
    now = () => new Date(),
  }: {
    receipts: AnalyticsReceiptRepository;
    publisher: AnalyticsPublisher;
    resolveCountry: (ip: string | null) => string | null;
    now?: () => Date;
  }) {
    this.receipts = receipts;
    this.publisher = publisher;
    this.resolveCountry = resolveCountry;
    this.now = now;
  }

  async ingest(
    rawInput: ExplorersAnalyticsInput,
    context: { getIp: () => string | null },
  ): Promise<IngestResult> {
    if (!rawInput.consent) return { status: "consent-denied" };

    const input = explorersAnalyticsInputSchema.parse(rawInput);
    const metadata = stripRawIp(input.event.metadata) as
      | Record<string, unknown>
      | undefined;
    const normalizedWithoutCountry = {
      eventId: input.eventId,
      accountId: input.accountId,
      locationId: input.locationId ?? null,
      recommendationId: input.recommendationId ?? null,
      event: {
        type: input.event.type,
        page: input.event.page,
        ...(input.event.element ? { element: input.event.element } : {}),
        canonicalPath: input.event.canonicalPath,
        ...(input.event.referrerOrigin
          ? { referrerOrigin: input.event.referrerOrigin }
          : {}),
        ...(metadata ? { metadata } : {}),
        ...(input.event.utmParams ? { utmParams: input.event.utmParams } : {}),
      },
    };
    const hash = payloadHash(normalizedWithoutCountry);
    const receipt = await this.receipts.begin(input.eventId, hash);

    if (receipt.payloadHash !== hash) throw new IdempotencyConflictError();
    if (!receipt.acquired && receipt.status === "committed" && receipt.documentId) {
      return {
        status: "committed",
        documentId: receipt.documentId,
        duplicate: true,
      };
    }
    if (!receipt.acquired && receipt.status === "pending") {
      return { status: "pending", duplicate: true };
    }

    if (receipt.recovered && this.publisher.findByEventId) {
      const existingDocumentId = await this.publisher.findByEventId(
        input.accountId,
        input.eventId,
      );
      if (existingDocumentId) {
        if (!receipt.leaseId) throw new Error("Analytics receipt lease is missing");
        await this.receipts.commit(input.eventId, existingDocumentId, receipt.leaseId);
        return {
          status: "committed",
          documentId: existingDocumentId,
          duplicate: true,
        };
      }
    }

    const payload: NormalizedExplorersAnalyticsEvent = {
      ...normalizedWithoutCountry,
      event: {
        ...normalizedWithoutCountry.event,
        timestamp: this.now().toISOString(),
        country: normalizeCountry(this.resolveCountry(context.getIp())),
      },
    };

    try {
      const published = await this.publisher.publish(payload);
      if (!receipt.leaseId) throw new Error("Analytics receipt lease is missing");
      await this.receipts.commit(input.eventId, published.documentId, receipt.leaseId);
      return {
        status: "committed",
        documentId: published.documentId,
        duplicate: false,
      };
    } catch (error) {
      await this.receipts.fail?.(
        input.eventId,
        error instanceof Error ? error.message : "analytics publish failed",
        receipt.leaseId ?? "",
      );
      throw error;
    }
  }

  readAccountEvents(scope: { accountId: string; from: string; to: string }) {
    return this.publisher.readAccountEvents(scope);
  }
}
