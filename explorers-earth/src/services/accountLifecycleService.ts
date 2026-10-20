import useAuthStore from "../store/store";

export interface CanonicalAccountLifecycleDto {
  accountId: string;
  status: "active" | "suspended" | "pending_deletion" | "deleted";
  operationId: string | null;
  revision: number;
  /** Present on a deletion request's response: when the deletion becomes final unless cancelled. */
  scheduledDeletionAt?: string;
}

/** The canonical route derives identity from the Better Auth cookie, never request JSON. */
export function createCanonicalAccountLifecycleService(input: { fetchImpl?: typeof fetch; isCurrent: () => boolean }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new AccountLifecycleError("AUTH_CHANGED", 401, "The signed-in account changed.", false);
  };
  const request = async <T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<T> => {
    assertCurrent();
    const generation = useAuthStore.getState().generation;
    let response: Response;
    try {
      response = await fetchImpl(`/api/explorers/v1/account/${path}`, { method, credentials: "include", cache: "no-store",
        headers: method === "POST" ? { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) } : undefined,
        body: method === "POST" ? JSON.stringify(body) : undefined });
    } catch {
      assertCurrent();
      throw new AccountLifecycleError("SERVICE_UNAVAILABLE", 503, "Account service is unavailable.", true);
    }
    const result = await response.json().catch(() => null);
    assertCurrent();
    if (response.status === 401 && useAuthStore.getState().generation === generation) useAuthStore.getState().logout();
    if (!response.ok) throw new AccountLifecycleError(result?.error?.code ?? "SERVICE_UNAVAILABLE", response.status,
      result?.error?.message ?? "Account service is unavailable.", response.status >= 500 || response.status === 409);
    return result as T;
  };
  return {
    status: async () => (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("lifecycle", "GET")).lifecycle,
    recordDeletionFeedback: async (reason: string, key: string) =>
      (await request<{ feedback: { id: string } }>("deletion-feedback", "POST", { reason: reason.trim() }, key)).feedback,
    deactivate: async (expectedRevision: number, key: string) =>
      (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("deactivation", "POST", { expectedRevision }, key)).lifecycle,
    deleteAccount: async (expectedRevision: number, feedbackId: string, key: string) =>
      (await request<{ lifecycle: CanonicalAccountLifecycleDto }>("deletion", "POST", { expectedRevision, feedbackId }, key)).lifecycle,
  };
}

export class AccountLifecycleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AccountLifecycleError";
  }
}
