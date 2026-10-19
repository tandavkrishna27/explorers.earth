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
    city: boundedMetadataString.optional(),
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
    sector: boundedMetadataString.optional(),
    genre: boundedMetadataString.optional(),
    subject: boundedMetadataString.optional(),
    guideId: boundedMetadataString.optional(),
    guideName: boundedMetadataString.optional(),
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
  // Either the legacy consented write (consent: true/false) or an anonymous public-page
  // event (basis 'anonymous-v1'): no cookie, stored visitor ID or stored address is involved,
  // so it needs no consent banner. Exactly one of the two must be present.
  consent: z.boolean().optional(),
  basis: z.literal("anonymous-v1").optional(),
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
  if ((input.consent === undefined) === (input.basis === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["basis"],
      message: "an analytics event is either consented or anonymous",
    });
  }
  const metadata = input.event.metadata;
  const metadataLocationId = metadata?.listId ?? metadata?.cityId;
  const metadataRecommendationId =
    metadata?.recommendationId ?? metadata?.placeId ?? metadata?.guideId ?? metadata?.id;

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
      : input.event.page === "public-music" && segments[0] === "music" && segments[1] === "share"
        ? segments.length === 2
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

export class IdempotencyConflictError extends Error {
  constructor() {
    super("The event ID has already been used for a different payload");
    this.name = "IdempotencyConflictError";
  }
}
