import { describe, expect, it, vi } from "vitest";
import { createCanonicalAccountLifecycleService } from "../accountLifecycleService";

describe("canonical lifecycle browser adapter", () => {
  it("retries failed deletion feedback with the same idempotency key and no caller identity", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify(calls.length === 1
        ? { error: { code: "UNAVAILABLE", message: "Retry" } } : { feedback: { id: "feedback-a" } }),
      { status: calls.length === 1 ? 503 : 201 });
    });
    const service = createCanonicalAccountLifecycleService({ fetchImpl: fetchImpl as typeof fetch, isCurrent: () => true });
    await expect(service.recordDeletionFeedback("  Leaving  ", "repeat-key-123")).rejects.toThrow();
    await expect(service.recordDeletionFeedback("  Leaving  ", "repeat-key-123")).resolves.toEqual({ id: "feedback-a" });
    expect(calls.map((call) => JSON.parse(String(call.body)))).toEqual([{ reason: "Leaving" }, { reason: "Leaving" }]);
    expect(calls.map((call) => (call.headers as Record<string, string>)["Idempotency-Key"])).toEqual(["repeat-key-123", "repeat-key-123"]);
  });

  it("rejects a lifecycle response from the previous session generation", async () => {
    let current = true;
    const fetchImpl = vi.fn(async () => { current = false; return new Response(JSON.stringify({ lifecycle: { accountId: "A", status: "suspended", revision: 2, operationId: "op" } }), { status: 200 }); });
    const service = createCanonicalAccountLifecycleService({ fetchImpl: fetchImpl as typeof fetch, isCurrent: () => current });
    await expect(service.deactivate(1, "deactivate-key-123")).rejects.toThrow(/changed/i);
  });
});
