import { describe, expect, it } from "vitest";
import { explorersAnalyticsInputSchema, IdempotencyConflictError } from "../explorers-analytics-service";

const baseInput = () => ({
  consent: true,
  eventId: "evt-20260824-0001",
  accountId: "account-document-1",
  locationId: "reading-list",
  recommendationId: "recommendation-1",
  event: {
    type: "click" as const,
    timestamp: "2026-08-24T03:30:00.000Z",
    page: "public-books",
    element: "book-card-clean-code",
    canonicalPath: "/tk2727/books/reading-list",
    referrerOrigin: "https://www.google.com",
    metadata: {
      listId: "reading-list",
    },
    utmParams: {
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "summer launch",
      utm_term: "travel creators",
      utm_content: "hero card",
    },
  },
});

describe("explorersAnalyticsInputSchema", () => {
  it("rejects unknown event fields and metadata keys that can carry PII or secrets", () => {
    const unknownEventField = baseInput();
    (unknownEventField.event as Record<string, unknown>).authorization =
      "Bearer secret";
    expect(explorersAnalyticsInputSchema.safeParse(unknownEventField).success).toBe(false);

    const piiMetadata = baseInput();
    piiMetadata.event.metadata = {
      listId: "reading-list",
      email: "visitor@example.com",
      token: "secret",
    } as any;
    expect(explorersAnalyticsInputSchema.safeParse(piiMetadata).success).toBe(false);
  });

  it("accepts every privacy-safe category descriptor emitted by the Explorer client", () => {
    const input = baseInput();
    input.event.metadata = {
      listId: "reading-list",
      genre: "Documentary",
      subject: "Architecture",
      sector: "Productivity",
      city: "Hyderabad",
      guideId: "recommendation-1",
      guideName: "Weekend guide",
    } as typeof input.event.metadata;

    expect(explorersAnalyticsInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects card/list identity metadata when the validated top-level target is omitted", () => {
    const missingListTarget = baseInput();
    missingListTarget.locationId = null;
    expect(explorersAnalyticsInputSchema.safeParse(missingListTarget).success).toBe(false);

    const missingRecommendationTarget = baseInput();
    missingRecommendationTarget.recommendationId = null;
    missingRecommendationTarget.event.metadata = {
      recommendationId: "recommendation-1",
    };
    expect(
      explorersAnalyticsInputSchema.safeParse(missingRecommendationTarget).success,
    ).toBe(false);

    const missingGuideTarget = baseInput();
    missingGuideTarget.recommendationId = null;
    missingGuideTarget.event.metadata = {
      listId: "reading-list",
      guideId: "guide-document-1",
    } as typeof missingGuideTarget.event.metadata;
    expect(
      explorersAnalyticsInputSchema.safeParse(missingGuideTarget).success,
    ).toBe(false);

    const mismatchedGuideTarget = baseInput();
    mismatchedGuideTarget.event.metadata = {
      listId: "reading-list",
      guideId: "guide-document-1",
    } as typeof mismatchedGuideTarget.event.metadata;
    expect(
      explorersAnalyticsInputSchema.safeParse(mismatchedGuideTarget).success,
    ).toBe(false);

    const forgedCardWithoutAnyTarget = baseInput();
    forgedCardWithoutAnyTarget.locationId = null;
    forgedCardWithoutAnyTarget.recommendationId = null;
    forgedCardWithoutAnyTarget.event.metadata = { title: "Forged movie" };
    forgedCardWithoutAnyTarget.event.element = "movie-card-forged";
    expect(
      explorersAnalyticsInputSchema.safeParse(forgedCardWithoutAnyTarget).success,
    ).toBe(false);
  });

  it("rejects unsupported analytics pages and page/path mismatches", () => {
    const unknownPage = baseInput();
    unknownPage.event.page = "invented-dashboard-total" as any;
    expect(explorersAnalyticsInputSchema.safeParse(unknownPage).success).toBe(false);

    const wrongPath = baseInput();
    wrongPath.event.canonicalPath = "/tk2727/movies/forged";
    expect(explorersAnalyticsInputSchema.safeParse(wrongPath).success).toBe(false);
  });

  it.each([
    "/tk2727/books/hello%20world",
    "/tk2727/Books/caf%C3%A9-picks",
  ])("accepts safe encoded and case-normalized public paths", (canonicalPath) => {
    const input = baseInput();
    input.event.canonicalPath = canonicalPath;
    expect(explorersAnalyticsInputSchema.safeParse(input).success).toBe(true);
  });
  it("rejects referrers that include paths, queries, or unsafe protocols", () => {
    for (const referrerOrigin of [
      "https://www.google.com/search?q=private",
      "javascript:alert(1)",
      "not-a-url",
    ]) {
      const input = baseInput();
      input.event.referrerOrigin = referrerOrigin;
      expect(explorersAnalyticsInputSchema.safeParse(input).success).toBe(false);
    }
  });

});

describe("IdempotencyConflictError", () => {
  it("names the conflict canonical ingest maps to 409", () => {
    const error = new IdempotencyConflictError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IdempotencyConflictError");
    expect(error.message).toBe("The event ID has already been used for a different payload");
  });
});
