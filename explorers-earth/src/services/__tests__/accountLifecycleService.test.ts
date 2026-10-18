import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanonicalAccountLifecycleService } from "../accountLifecycleService";
import useAuthStore from "../../store/store";

let authStateBeforeTest: ReturnType<typeof useAuthStore.getState>;
beforeEach(() => { authStateBeforeTest = useAuthStore.getState(); });
afterEach(() => {
  useAuthStore.setState(authStateBeforeTest, true);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("canonical cookie account lifecycle service", () => {
  const lifecycle = { accountId: "account-a", status: "active", operationId: null, revision: 7 };
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("uses only same-origin cookie requests for every read and write shape", async () => {
    const fetchImpl = vi.fn(async (path: string) => response(path.endsWith("deletion-feedback")
      ? { feedback: { id: "feedback-a" } } : { lifecycle }));
    const service = createCanonicalAccountLifecycleService({ isCurrent: () => true, fetchImpl: fetchImpl as typeof fetch });
    await expect(service.status()).resolves.toEqual(lifecycle);
    await expect(service.recordDeletionFeedback("  reason  ", "feedback-key")).resolves.toEqual({ id: "feedback-a" });
    await expect(service.deactivate(7, "deactivate-key")).resolves.toEqual(lifecycle);
    await expect(service.deleteAccount(7, "feedback-a", "delete-key")).resolves.toEqual(lifecycle);
    expect(fetchImpl.mock.calls).toEqual([
      ["/api/explorers/v1/account/lifecycle", { method: "GET", credentials: "include", cache: "no-store", headers: undefined, body: undefined }],
      ["/api/explorers/v1/account/deletion-feedback", { method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "feedback-key" }, body: JSON.stringify({ reason: "reason" }) }],
      ["/api/explorers/v1/account/deactivation", { method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "deactivate-key" }, body: JSON.stringify({ expectedRevision: 7 }) }],
      ["/api/explorers/v1/account/deletion", { method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "delete-key" },
        body: JSON.stringify({ expectedRevision: 7, feedbackId: "feedback-a" }) }],
    ]);
  });

  it("uses platform fetch and omits an absent idempotency key", async () => {
    const fetchImpl = vi.fn(async () => response({ lifecycle }));
    vi.stubGlobal("fetch", fetchImpl);
    const service = createCanonicalAccountLifecycleService({ isCurrent: () => true });
    await expect(service.deactivate(7, "")).resolves.toEqual(lifecycle);
    expect(fetchImpl).toHaveBeenCalledWith("/api/explorers/v1/account/deactivation", {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: 7 }),
    });
  });

  it("blocks stale identity before fetch and after an in-flight response", async () => {
    let current = false;
    const fetchImpl = vi.fn(async () => { current = false; return response({ lifecycle }); });
    const service = createCanonicalAccountLifecycleService({ isCurrent: () => current, fetchImpl: fetchImpl as typeof fetch });
    await expect(service.status()).rejects.toMatchObject({ code: "AUTH_CHANGED", status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
    current = true;
    await expect(service.status()).rejects.toMatchObject({ code: "AUTH_CHANGED", status: 401 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("redacts transport failures and refuses to surface one after account switch", async () => {
    let current = true;
    const service = createCanonicalAccountLifecycleService({ isCurrent: () => current,
      fetchImpl: async () => { throw new Error("transport secret"); } });
    await expect(service.status()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503, retryable: true });
    current = false;
    await expect(service.status()).rejects.toMatchObject({ code: "AUTH_CHANGED", status: 401 });
    const switched = createCanonicalAccountLifecycleService({ isCurrent: () => current,
      fetchImpl: async () => { current = false; throw new Error("transport secret"); } });
    current = true;
    await expect(switched.status()).rejects.toMatchObject({ code: "AUTH_CHANGED", status: 401 });
  });

  it("ends the current session on 401 but does not revoke a newer generation", async () => {
    const original = useAuthStore.getState().generation;
    const denied = createCanonicalAccountLifecycleService({ isCurrent: () => true,
      fetchImpl: async () => response({ error: { code: "UNAUTHENTICATED", message: "Expired" } }, 401) });
    await expect(denied.status()).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Expired", retryable: false });
    expect(useAuthStore.getState().generation).toBe(original + 1);
    expect(useAuthStore.getState().status).toBe("signed-out");

    const newer = createCanonicalAccountLifecycleService({ isCurrent: () => true,
      fetchImpl: async () => { useAuthStore.getState().beginVerification(); return response({ error: { code: "UNAUTHENTICATED" } }, 401); } });
    const generation = useAuthStore.getState().generation;
    await expect(newer.status()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(useAuthStore.getState().generation).toBe(generation + 1);
    expect(useAuthStore.getState().status).toBe("loading");
  });

  it("preserves conflict and unavailable errors, with safe defaults for malformed JSON", async () => {
    for (const [status, body, expected] of [
      [409, { error: { code: "STALE_REVISION", message: "Revision changed" } }, { code: "STALE_REVISION", message: "Revision changed", retryable: true }],
      [503, "invalid-json", { code: "SERVICE_UNAVAILABLE", message: "Account service is unavailable.", retryable: true }],
      [400, { error: {} }, { code: "SERVICE_UNAVAILABLE", message: "Account service is unavailable.", retryable: false }],
    ] as const) {
      const service = createCanonicalAccountLifecycleService({ isCurrent: () => true,
        fetchImpl: async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }) });
      await expect(service.status()).rejects.toMatchObject({ status, ...expected });
    }
  });
});

