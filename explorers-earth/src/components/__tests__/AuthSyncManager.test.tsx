import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthSyncManager from "../AuthSyncManager";
import useAuthStore from "../../store/store";

const calls = vi.hoisted(() => ({ refresh: vi.fn(async () => undefined), clearStore: vi.fn(async () => undefined),
  logout: vi.fn(), reset: vi.fn(), clearCommands: vi.fn(), clearWorkspace: vi.fn(async () => undefined),
  cancelQueries: vi.fn(async () => undefined), removeQueries: vi.fn(),
  reconcile: vi.fn(async () => undefined) }));
vi.mock("@apollo/client", () => ({ useApolloClient: () => ({ clearStore: calls.clearStore }) }));
vi.mock("../../lib/authClient", () => ({ authClient: { refresh: calls.refresh } }));
vi.mock("../../features/music/musicApi", () => ({ musicApi: { logout: calls.logout },
  musicIdentityCoordinator: { reset: calls.reset, reconcile: calls.reconcile } }));
vi.mock("../../features/music/musicPublicationCommandRegistry", () => ({ clearMusicPublicationCommands: calls.clearCommands }));
vi.mock("../../hooks/useTunesDashboard", () => ({ clearAllMusicWorkspaceQueries: calls.clearWorkspace }));
vi.mock("../../lib/queryClient", () => ({ queryClient: { cancelQueries: calls.cancelQueries, removeQueries: calls.removeQueries } }));

const verify = (accountId: string) => {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: `user-${accountId}`, username: accountId,
    email: `${accountId}@example.invalid`, onboardingStatus: "complete", revision: 1 });
};

describe("AuthSyncManager canonical session boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().logout(); });
  it("starts cookie verification on mount", () => {
    render(<AuthSyncManager />);
    expect(calls.refresh).toHaveBeenCalledTimes(1);
  });
  it("reconciles Music owner provisioning from the verified canonical session", async () => {
    // Nothing called reconcile() before this, so isReadyFor() stayed false and every
    // Music publication control rendered disabled in the real application.
    verify("account-a");
    render(<AuthSyncManager />);
    await waitFor(() => expect(calls.reconcile).toHaveBeenCalledTimes(1));
    expect(calls.reconcile).toHaveBeenCalledWith({ provider: "google", authenticated: true, verified: true,
      userDocumentId: "user-account-a", account: { documentId: "account-a" } });
  });
  it("reconciles no Music owner without a verified session", () => {
    render(<AuthSyncManager />);
    expect(calls.reconcile).not.toHaveBeenCalled();
  });
  it("clears account caches when the session ends", async () => {
    verify("account-a");
    render(<AuthSyncManager />);
    act(() => useAuthStore.getState().logout());
    await waitFor(() => expect(calls.clearStore).toHaveBeenCalledTimes(1));
    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(calls.reset).toHaveBeenCalledTimes(1);
    expect(calls.clearCommands).toHaveBeenCalledTimes(1);
    expect(calls.cancelQueries).toHaveBeenCalledTimes(1);
    expect(calls.removeQueries).toHaveBeenCalledWith({ queryKey: ["explorers-account"] });
  });
  it("fences A→B→A by generation even when the account id repeats", async () => {
    verify("account-a");
    render(<AuthSyncManager />);
    const first = useAuthStore.getState().generation;
    act(() => { verify("account-b"); verify("account-a"); });
    expect(useAuthStore.getState().generation).toBe(first + 2);
    await waitFor(() => expect(calls.clearStore).toHaveBeenCalled());
  });
});
