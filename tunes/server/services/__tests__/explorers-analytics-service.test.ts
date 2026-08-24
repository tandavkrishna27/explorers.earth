import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  explorersAnalyticsInputSchema,
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
    };
  }

  async commit(eventId: string, documentId: string) {
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
  locationId: null,
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

  it("reconciles a recovered receipt with Strapi before republishing", async () => {
    const commit = vi.fn();
    const recoveredReceipts: AnalyticsReceiptRepository = {
      begin: vi.fn().mockResolvedValue({
        acquired: true,
        recovered: true,
        payloadHash: "replaced-before-use",
        status: "pending",
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
    });

    const recoveredPublisher: AnalyticsPublisher = {
      publish: vi.fn(),
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
    ).resolves.toEqual({
      status: "committed",
      documentId: "strapi-event-existing",
      duplicate: true,
    });
    expect(recoveredPublisher.publish).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith(
      baseInput().eventId,
      "strapi-event-existing",
    );
  });
});
