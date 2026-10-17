import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  explorersAnalyticsInputSchema,
  AnalyticsPublishDispatchError,
  ExplorersAnalyticsService,
  IdempotencyConflictError,
  type AnalyticsPublisher,
  type AnalyticsReceiptRepository,
  type NormalizedExplorersAnalyticsEvent,
} from "../explorers-analytics-service";

class MemoryReceipts implements AnalyticsReceiptRepository {
  private receipts = new Map<
    string,
    { payloadHash: string; status: "pending" | "committed"; documentId?: string }
  >();

  async begin(eventId: string, payloadHash: string) {
    const existing = this.receipts.get(eventId);
    if (existing) return { acquired: false as const, recovered: false as const, ...existing };
    this.receipts.set(eventId, { payloadHash, status: "pending" });
    return {
      acquired: true as const,
      recovered: false as const,
      payloadHash,
      status: "pending" as const,
      leaseId: `lease-${eventId}`,
    };
  }

  async commit(eventId: string, documentId: string, _leaseId: string) {
    const current = this.receipts.get(eventId);
    if (!current) throw new Error("missing receipt");
    this.receipts.set(eventId, {
      ...current,
      status: "committed",
      documentId,
    });
  }

  seed(
    eventId: string,
    payloadHash: string,
    status: "pending" | "committed",
    documentId?: string,
  ) {
    this.receipts.set(eventId, { payloadHash, status, documentId });
  }
}

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

describe("ExplorersAnalyticsService", () => {
  let receipts: MemoryReceipts;
  let publish: ReturnType<typeof vi.fn<AnalyticsPublisher["publish"]>>;
  let publisher: AnalyticsPublisher;
  let resolveCountry: ReturnType<typeof vi.fn>;
  let service: ExplorersAnalyticsService;

  beforeEach(() => {
    receipts = new MemoryReceipts();
    publish = vi.fn().mockResolvedValue({ documentId: "strapi-event-1" });
    publisher = { publish, readAccountEvents: vi.fn().mockResolvedValue([]) };
    resolveCountry = vi.fn().mockReturnValue("IN");
    service = new ExplorersAnalyticsService({
      receipts,
      publisher,
      resolveCountry,
    });
  });

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

  it("uses a server timestamp instead of the client supplied timestamp", async () => {
    service = new ExplorersAnalyticsService({
      receipts,
      publisher,
      resolveCountry,
      now: () => new Date("2026-08-25T10:00:00.000Z"),
    });
    const input = baseInput();
    input.event.timestamp = "2001-01-01T00:00:00.000Z";

    await service.ingest(input, { getIp: () => "8.8.8.8" });

    expect(publish.mock.calls[0][0].event.timestamp).toBe(
      "2026-08-25T10:00:00.000Z",
    );
  });

  it("checks consent before reading the request IP or writing anything", async () => {
    const getIp = vi.fn(() => "203.0.113.60");
    const result = await service.ingest(
      { ...baseInput(), consent: false },
      { getIp },
    );

    expect(result).toEqual({ status: "consent-denied" });
    expect(getIp).not.toHaveBeenCalled();
    expect(resolveCountry).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes all five UTM fields, coarse referrer, and country without any raw IP", async () => {
    const result = await service.ingest(baseInput(), {
      getIp: () => "203.0.113.60",
    });

    expect(result).toEqual({
      status: "committed",
      documentId: "strapi-event-1",
      duplicate: false,
    });
    const payload = publish.mock.calls[0][0] as NormalizedExplorersAnalyticsEvent;
    expect(payload.event.utmParams).toEqual(baseInput().event.utmParams);
    expect(payload.event.referrerOrigin).toBe("https://www.google.com");
    expect(payload.event.country).toBe("IN");
    expect(payload.event.metadata).toEqual({ listId: "reading-list" });
    expect(JSON.stringify(payload)).not.toContain("203.0.113.");
    expect(JSON.stringify(payload)).not.toMatch(/ipAddress|rawIp|\"ip\"/i);
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

  it("keeps a valid event with an explicit unknown country when lookup fails", async () => {
    resolveCountry.mockReturnValue(null);

    await service.ingest(baseInput(), { getIp: () => "127.0.0.1" });

    expect(publish.mock.calls[0][0].event.country).toBeNull();
  });

  it("returns the original receipt and never republishes a committed event ID", async () => {
    const first = await service.ingest(baseInput(), {
      getIp: () => "203.0.113.60",
    });
    const second = await service.ingest(baseInput(), {
      getIp: () => "203.0.113.60",
    });

    expect(first.status).toBe("committed");
    expect(second).toEqual({
      status: "committed",
      documentId: "strapi-event-1",
      duplicate: true,
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an event ID for a different payload", async () => {
    await service.ingest(baseInput(), { getIp: () => "203.0.113.60" });

    const conflicting = baseInput();
    conflicting.event.element = "different-book";

    await expect(
      service.ingest(conflicting, { getIp: () => "203.0.113.60" }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("retries a repository lease only when recovery represents a known pre-dispatch failure", async () => {
    const commit = vi.fn();
    const recoveredReceipts: AnalyticsReceiptRepository = {
      begin: vi.fn().mockResolvedValue({
        acquired: true,
        recovered: true,
        payloadHash: "replaced-before-use",
        status: "pending",
        leaseId: "recovery-lease",
      }),
      commit,
    };
    // Return the real hash from a first service pass, then simulate a stale
    // lease whose Strapi publish succeeded before the receipt commit.
    const firstReceipts = new MemoryReceipts();
    const firstService = new ExplorersAnalyticsService({
      receipts: firstReceipts,
      publisher,
      resolveCountry,
    });
    await firstService.ingest(baseInput(), { getIp: () => "8.8.8.8" });
    const committedReceipt = await firstReceipts.begin(
      baseInput().eventId,
      "ignored",
    );
    (recoveredReceipts.begin as ReturnType<typeof vi.fn>).mockResolvedValue({
      acquired: true,
      recovered: true,
      payloadHash: committedReceipt.payloadHash,
      status: "pending",
      leaseId: "recovery-lease",
    });

    const recoveredPublisher: AnalyticsPublisher = {
      publish: vi.fn().mockResolvedValue({ documentId: "strapi-event-retried" }),
      readAccountEvents: vi.fn(),
      findByEventId: vi.fn().mockResolvedValue("strapi-event-existing"),
    };
    const recoveredService = new ExplorersAnalyticsService({
      receipts: recoveredReceipts,
      publisher: recoveredPublisher,
      resolveCountry,
    });

    await expect(
      recoveredService.ingest(baseInput(), { getIp: () => "8.8.8.8" }),
    ).resolves.toEqual({ status: "committed", documentId: "strapi-event-retried", duplicate: false });
    expect(recoveredPublisher.publish).toHaveBeenCalledOnce();
    expect(recoveredPublisher.findByEventId).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith(baseInput().eventId, "strapi-event-retried", "recovery-lease");
  });

  it("fails closed for a stale external-publish receipt instead of risking a duplicate Strapi write", async () => {
    const firstReceipts = new MemoryReceipts();
    const firstService = new ExplorersAnalyticsService({ receipts: firstReceipts, publisher, resolveCountry });
    await firstService.ingest(baseInput(), { getIp: () => "8.8.8.8" });
    const receipt = await firstReceipts.begin(baseInput().eventId, "ignored");
    const staleReceipts: AnalyticsReceiptRepository = {
      begin: vi.fn().mockResolvedValue({
        acquired: false, recovered: false, payloadHash: receipt.payloadHash,
        status: "failed", indeterminate: true, leaseId: undefined,
      }),
      commit: vi.fn(),
    };
    const unsafePublisher: AnalyticsPublisher = {
      publish: vi.fn(), readAccountEvents: vi.fn(), findByEventId: vi.fn().mockResolvedValue(null),
    };
    const staleService = new ExplorersAnalyticsService({ receipts: staleReceipts, publisher: unsafePublisher, resolveCountry });
    await expect(staleService.ingest(baseInput(), { getIp: () => "8.8.8.8" }))
      .resolves.toEqual({ status: "dropped", duplicate: true });
    expect(unsafePublisher.findByEventId).not.toHaveBeenCalled();
    expect(unsafePublisher.publish).not.toHaveBeenCalled();
  });

  it("retries only a failure explicitly proven to occur before dispatch", async () => {
    const retryableReceipts: AnalyticsReceiptRepository = {
      begin: vi.fn().mockResolvedValue({ acquired: true, recovered: true, payloadHash: "placeholder", status: "pending", leaseId: "retry-lease" }),
      commit: vi.fn(), fail: vi.fn(),
    };
    const seed = new MemoryReceipts();
    const seedService = new ExplorersAnalyticsService({ receipts: seed, publisher, resolveCountry });
    await seedService.ingest(baseInput(), { getIp: () => null });
    const known = await seed.begin(baseInput().eventId, "ignored");
    (retryableReceipts.begin as ReturnType<typeof vi.fn>).mockResolvedValue({
      acquired: true, recovered: true, payloadHash: known.payloadHash, status: "pending", leaseId: "retry-lease",
    });
    const retryPublisher: AnalyticsPublisher = { publish: vi.fn().mockResolvedValue({ documentId: "retried" }), readAccountEvents: vi.fn() };
    const retryService = new ExplorersAnalyticsService({ receipts: retryableReceipts, publisher: retryPublisher, resolveCountry });
    await expect(retryService.ingest(baseInput(), { getIp: () => null }))
      .resolves.toEqual({ status: "committed", documentId: "retried", duplicate: false });
    expect(retryPublisher.publish).toHaveBeenCalledOnce();
  });

  it.each([
    [new AnalyticsPublishDispatchError("not dispatched", true), "retryable"],
    [new Error("timeout after dispatch may have committed"), "indeterminate"],
  ] as const)("classifies publish failure fencing: %s", async (failure, disposition) => {
    const fail = vi.fn();
    const receipts: AnalyticsReceiptRepository = {
      begin: vi.fn().mockImplementation(async (_eventId, payloadHash) => ({
        acquired: true, recovered: false, payloadHash, status: "pending", leaseId: "lease-1",
      })),
      commit: vi.fn(), fail,
    };
    const failedPublisher: AnalyticsPublisher = {
      publish: vi.fn().mockRejectedValue(failure), readAccountEvents: vi.fn(),
    };
    const failedService = new ExplorersAnalyticsService({ receipts, publisher: failedPublisher, resolveCountry });
    await expect(failedService.ingest(baseInput(), { getIp: () => null })).rejects.toBe(failure);
    expect(fail).toHaveBeenCalledWith(baseInput().eventId, failure.message, "lease-1", disposition);
  });
});
