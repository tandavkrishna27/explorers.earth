import { describe, expect, it, vi } from "vitest";
import { PostgresAnalyticsReceiptRepository } from "../explorers-analytics-receipts";

describe("PostgresAnalyticsReceiptRepository", () => {
  it("atomically inserts a new pending receipt", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          event_id: "evt-1",
          payload_hash: "hash-1",
          status: "pending",
          strapi_document_id: null,
        },
      ],
    });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await expect(repository.begin("evt-1", "hash-1")).resolves.toEqual({
      acquired: true,
      recovered: false,
      payloadHash: "hash-1",
      status: "pending",
      documentId: undefined,
    });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(query.mock.calls[0][1]).toEqual(["evt-1", "hash-1"]);
  });

  it("returns the existing committed receipt after an idempotency collision", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-1",
            payload_hash: "hash-1",
            status: "committed",
            strapi_document_id: "strapi-1",
          },
        ],
      });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await expect(repository.begin("evt-1", "hash-1")).resolves.toEqual({
      acquired: false,
      recovered: false,
      payloadHash: "hash-1",
      status: "committed",
      documentId: "strapi-1",
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("status = 'failed'");
    expect(query.mock.calls[2][0]).toContain("WHERE event_id = $1");
  });

  it("atomically reacquires a failed or stale receipt for one recovery worker", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-1",
            payload_hash: "hash-1",
            status: "pending",
            strapi_document_id: null,
          },
        ],
      });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await expect(repository.begin("evt-1", "hash-1")).resolves.toEqual({
      acquired: true,
      recovered: true,
      payloadHash: "hash-1",
      status: "pending",
      documentId: undefined,
    });
    expect(query.mock.calls[1][0]).toContain("updated_at < NOW() - INTERVAL");
    expect(query.mock.calls[1][0]).toContain("payload_hash = $2");
  });

  it("leaves an active pending receipt owned by the first worker", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-1",
            payload_hash: "hash-1",
            status: "pending",
            strapi_document_id: null,
          },
        ],
      });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await expect(repository.begin("evt-1", "hash-1")).resolves.toMatchObject({
      acquired: false,
      recovered: false,
      status: "pending",
    });
  });

  it("records committed and failed terminal state without storing payload data", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await repository.commit("evt-1", "strapi-1");
    await repository.fail("evt-2", "upstream unavailable");

    expect(query.mock.calls[0][0]).toContain("status = 'committed'");
    expect(query.mock.calls[0][1]).toEqual(["evt-1", "strapi-1"]);
    expect(query.mock.calls[1][0]).toContain("status = 'failed'");
    expect(query.mock.calls[1][1]).toEqual([
      "evt-2",
      "upstream unavailable",
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toMatch(/Stats|metadata|utm/i);
  });
});
