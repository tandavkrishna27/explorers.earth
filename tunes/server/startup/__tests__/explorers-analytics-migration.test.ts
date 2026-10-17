import { describe, expect, it, vi } from "vitest";
import { ensureExplorersAnalyticsSchema } from "../explorers-analytics-migration";

describe("ensureExplorersAnalyticsSchema", () => {
  it("creates the analytics receipt table idempotently before traffic", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await ensureExplorersAnalyticsSchema({ query });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "CREATE TABLE IF NOT EXISTS explorers_analytics_receipts",
    );
    expect(query.mock.calls[0][0]).toContain(
      "CHECK (status IN ('pending', 'committed', 'failed'))",
    );
  });
});
