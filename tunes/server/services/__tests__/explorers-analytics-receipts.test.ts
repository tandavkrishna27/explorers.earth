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
          lease_id: "lease-1",
        },
      ],
    });
    const repository = new PostgresAnalyticsReceiptRepository({ query }, () => "lease-1");

    await expect(repository.begin("evt-1", "hash-1")).resolves.toEqual({
      acquired: true,
      recovered: false,
      payloadHash: "hash-1",
      status: "pending",
      documentId: undefined,
      leaseId: "lease-1",
    });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(query.mock.calls[0][1]).toEqual(["evt-1", "hash-1", "lease-1"]);
  });

  it("returns the existing committed receipt after an idempotency collision", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt-1",
            payload_hash: "hash-1",
            status: "committed",
            strapi_document_id: "strapi-1",
            lease_id: null,
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
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][0]).toContain("WHERE event_id = $1");
  });

  it("reacquires only a known pre-dispatch failure", async () => {
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
          lease_id: "lease-1",
          },
        ],
      });
    const repository = new PostgresAnalyticsReceiptRepository({ query }, () => "lease-2");

    await expect(repository.begin("evt-1", "hash-1")).resolves.toEqual({
      acquired: true,
      recovered: true,
      payloadHash: "hash-1",
      status: "pending",
      documentId: undefined,
      leaseId: "lease-1",
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("last_error LIKE 'retryable:%'");
  });

  it("leaves an active pending receipt owned by the first worker", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
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

  it("records committed and classified terminal state without storing payload data", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    await repository.commit("evt-1", "strapi-1", "lease-1");
    await repository.fail("evt-2", "upstream unavailable", "lease-2", "indeterminate");

    expect(query.mock.calls[0][0]).toContain("status = 'committed'");
    expect(query.mock.calls[0][0]).toContain("lease_id = $3");
    expect(query.mock.calls[0][1]).toEqual(["evt-1", "strapi-1", "lease-1"]);
    expect(query.mock.calls[1][0]).toContain("status = 'failed'");
    expect(query.mock.calls[1][1]).toEqual([
      "evt-2",
      "upstream unavailable",
      "lease-2",
      "indeterminate",
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toMatch(/Stats|metadata|utm/i);
  });

  it("terminally classifies an expired in-flight publish instead of reacquiring it", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        event_id: "evt-1", payload_hash: "hash-1", status: "failed",
        strapi_document_id: null, lease_id: "lease-1",
        last_error: "indeterminate:publish outcome unknown",
      }] });
    const repository = new PostgresAnalyticsReceiptRepository({ query });
    await expect(repository.begin("evt-1", "hash-1")).resolves.toMatchObject({
      acquired: false, status: "failed", indeterminate: true,
    });
    expect(query.mock.calls[2][0]).toContain("status='failed'");
    expect(query.mock.calls[2][0]).toContain("updated_at < NOW() - INTERVAL '2 minutes'");
  });

  it.each(["commit", "fail"] as const)("rejects %s after another worker replaces the lease", async (operation) => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const repository = new PostgresAnalyticsReceiptRepository({ query });

    const terminal = operation === "commit"
      ? repository.commit("evt-1", "strapi-stale", "expired-lease")
      : repository.fail("evt-1", "stale failure", "expired-lease", "indeterminate");

    await expect(terminal).rejects.toThrow("Analytics receipt lease was lost");
    expect(query.mock.calls[0][0]).toContain("lease_id = $3");
    expect(query.mock.calls[0][0]).toContain("status = 'pending'");
  });
});
