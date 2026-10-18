import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountGenerationCacheReset from "../AccountGenerationCacheReset";
import useAuthStore from "../../store/store";

// The non-Music cases of the former AuthSyncManager.test.tsx (P3-4).
const calls = vi.hoisted(() => ({ refresh: vi.fn(async () => undefined), clearStore: vi.fn(async () => undefined),
  cancelQueries: vi.fn(async () => undefined), removeQueries: vi.fn() }));
vi.mock("@apollo/client", () => ({ useApolloClient: () => ({ clearStore: calls.clearStore }) }));
vi.mock("../../lib/authClient", () => ({ authClient: { refresh: calls.refresh } }));
vi.mock("../../lib/queryClient", () => ({ queryClient: { cancelQueries: calls.cancelQueries, removeQueries: calls.removeQueries } }));

const verify = (accountId: string) => {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: `user-${accountId}`, username: accountId,
    email: `${accountId}@example.invalid`, onboardingStatus: "complete", revision: 1 });
};

describe("AccountGenerationCacheReset", () => {
  beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().logout(); });
  // Bootstrapping here would put an auth request on every anonymous public profile view;
  // sessionBootstrap.test.tsx covers the surfaces that own it.
  it("does not start cookie verification for a visitor who needs no auth state", () => {
    render(<AccountGenerationCacheReset />);
    expect(calls.refresh).not.toHaveBeenCalled();
  });
  it("clears nothing on first mount", () => {
    verify("account-a");
    render(<AccountGenerationCacheReset />);
    expect(calls.clearStore).not.toHaveBeenCalled();
    expect(calls.removeQueries).not.toHaveBeenCalled();
  });
  it("clears account caches when the session ends", async () => {
    verify("account-a");
    render(<AccountGenerationCacheReset />);
    act(() => useAuthStore.getState().logout());
    await waitFor(() => expect(calls.clearStore).toHaveBeenCalledTimes(1));
    expect(calls.cancelQueries).toHaveBeenCalledTimes(1);
    expect(calls.removeQueries).toHaveBeenCalledWith({ queryKey: ["explorers-account"] });
  });
  it("fences A→B→A by generation even when the account id repeats", async () => {
    verify("account-a");
    render(<AccountGenerationCacheReset />);
    const first = useAuthStore.getState().generation;
    act(() => { verify("account-b"); verify("account-a"); });
    expect(useAuthStore.getState().generation).toBe(first + 2);
    await waitFor(() => expect(calls.clearStore).toHaveBeenCalled());
  });
});
