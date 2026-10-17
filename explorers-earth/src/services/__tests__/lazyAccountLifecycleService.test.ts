import { afterEach, expect, it, vi } from "vitest";
import { createLazyAccountLifecycleService } from "../lazyAccountLifecycleService";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const prepared = { version: "music-lifecycle/v1", operation: {
  operationId: "op-1", status: "pending_deletion", phase: "prepared", state: "completed",
  boundaryCrossed: false, retryable: false, deadLetter: false,
  upstreamUserDocumentId: "user-1", upstreamAccountDocumentId: "account-1",
} };
const boundary = { ...prepared, operation: { ...prepared.operation, boundaryCrossed: true, state: "requested", retryable: true } };

it.each([
  ["prepare", "POST", "prepare", prepared],
  ["status", "GET", "status", prepared],
  ["markBoundary", "POST", "boundary", boundary],
  ["cancel", "POST", "cancel", { ...prepared, operation: { ...prepared.operation, status: "suspended", state: "cancelled" } }],
  ["suspend", "POST", "suspend", { version: "music-lifecycle/v1", identity: { status: "suspended" } }],
  ["resume", "POST", "resume", { version: "music-lifecycle/v1", identity: { status: "active" } }],
] as const)("forwards %s with the current bearer on every call", async (operation, method, action, body) => {
  let bearer = "test-bearer-A-123456";
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(body)));
  const service = createLazyAccountLifecycleService({ baseUrl: "https://music.example", getBearer: () => bearer, fetchImpl });
  await expect(service[operation]()).resolves.toEqual(body);
  bearer = "test-bearer-B-123456";
  await expect(service[operation]()).resolves.toEqual(body);
  expect(fetchImpl.mock.calls).toEqual([
    [`https://music.example/api/music/identity/lifecycle/${action}`, { method, headers: { Authorization: "Bearer test-bearer-A-123456" } }],
    [`https://music.example/api/music/identity/lifecycle/${action}`, { method, headers: { Authorization: "Bearer test-bearer-B-123456" } }],
  ]);
});

it.each(["prepare", "status", "markBoundary", "cancel", "suspend", "resume"] as const)("preserves %s rejection details", async (operation) => {
  const service = createLazyAccountLifecycleService({ baseUrl: "https://music.example", getBearer: () => "test-bearer-A-123456", fetchImpl: async () => new Response(JSON.stringify({ error: { code: "LIFECYCLE_TEST_DENIED", retryable: false } }), { status: 409 }) });
  await expect(service[operation]()).rejects.toMatchObject({ code: "LIFECYCLE_TEST_DENIED", status: 409, retryable: false });
});

it("keeps simulated deletion prepare/boundary/presence/account/user/logout ordering", async () => {
  const sequence: string[] = [];
  const service = createLazyAccountLifecycleService({ baseUrl: "https://music.example", getBearer: () => "test-bearer-A-123456", fetchImpl: async (input) => {
    const action = String(input).split("/").at(-1)!;
    sequence.push(action);
    return new Response(JSON.stringify(action === "prepare" ? prepared : boundary));
  } });
  await service.deleteAccount({
    readAccountPresence: async (id) => { sequence.push(`presence:${id}`); return { status: "present", accountDocumentId: id }; },
    deleteExplorerAccount: async (id) => { sequence.push(`account:${id}`); return id; },
    deleteExplorerUser: async () => { sequence.push("user"); return "user-1"; },
    clearAuth: () => { sequence.push("logout"); },
  });
  expect(sequence).toEqual(["prepare", "boundary", "presence:account-1", "account:account-1", "user", "logout"]);
});

it("sends lifecycle status through the default same-origin Music adapter", async () => {
  vi.stubEnv("DEV", true);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ error: { code: "TEST_UNAVAILABLE" } }), { status: 503 });
  });
  try {
    const service = createLazyAccountLifecycleService({ baseUrl: "https://music.localhost", getBearer: () => "test-bearer-value-123456" });
    await expect(service.status()).rejects.toMatchObject({ code: "TEST_UNAVAILABLE" });
    expect(calls).toEqual(["/__localtunes/api/music/identity/lifecycle/status"]);
  } finally { vi.unstubAllGlobals(); }
});

it.each(["prepare", "status", "markBoundary", "cancel", "suspend", "resume"] as const)(
  "rejects invalid configuration on %s without sending credentials", async (operation) => {
    const fetchImpl = vi.fn();
    const service = createLazyAccountLifecycleService({ baseUrl: "http://localhost:5000", getBearer: () => "test-bearer-value-123456", fetchImpl });
    await expect(service[operation]()).rejects.toThrow("Music service origin is invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);

it("does not delete either account when lifecycle configuration is invalid", async () => {
  const service = createLazyAccountLifecycleService({ baseUrl: "invalid", getBearer: () => "test-bearer-value-123456" });
  const dependencies = {
    readAccountPresence: vi.fn(), deleteExplorerAccount: vi.fn(), deleteExplorerUser: vi.fn(), clearAuth: vi.fn(),
  };
  await expect(service.deleteAccount(dependencies)).rejects.toThrow();
  for (const callback of Object.values(dependencies)) expect(callback).not.toHaveBeenCalled();
});

it("preserves valid status responses and the original authenticated endpoint", async () => {
  const body = { version: "music-lifecycle/v1", operation: {
    operationId: "op-1", status: "pending_deletion", phase: "prepared", state: "completed",
    boundaryCrossed: false, retryable: false, deadLetter: false,
    upstreamUserDocumentId: "user-1", upstreamAccountDocumentId: "account-1",
  } };
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  const service = createLazyAccountLifecycleService({ baseUrl: "https://music.example", getBearer: () => "test-bearer-value-123456", fetchImpl });
  await expect(service.status()).resolves.toEqual(body);
  expect(fetchImpl).toHaveBeenCalledWith("https://music.example/api/music/identity/lifecycle/status", {
    method: "GET", headers: { Authorization: "Bearer test-bearer-value-123456" },
  });
});
