import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../store/store";
import { useLogout } from "../useLogout";
import { getMusicCredential, setMusicCredential } from "../../lib/musicCredentialStore";
import { queryClient } from "../../lib/queryClient";

const mockNavigate = vi.fn();
const mockClearStore = vi.fn();

vi.mock("@apollo/client", () => ({ useApolloClient: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClearStore.mockResolvedValue(undefined);
    (useApolloClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ clearStore: mockClearStore });
    (useNavigate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
    useAuthStore.getState().setLogoutError(false);
    useAuthStore.getState().logout();
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  });

  it("clears the Apollo cache, clears storage, and redirects to /login", async () => {
    localStorage.setItem("qrtoken", "jwt");
    const { result } = renderHook(() => useLogout());

    await result.current();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockClearStore).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("qrtoken")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("clears the Music credential synchronously before async cache clearing or navigation", async () => {
    let finishClear!: () => void;
    mockClearStore.mockImplementationOnce(() => new Promise<void>((resolve) => { finishClear = resolve; }));
    setMusicCredential({ token: "account-a.music.credential", expiresAt: Date.now() + 60_000 });
    const { result } = renderHook(() => useLogout());

    const logout = result.current();
    expect(getMusicCredential()).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
    finishClear();
    await logout;
  });

  it("cancels and removes every private Music identity query while preserving unrelated query data", async () => {
    queryClient.setQueryData(["music-workspace", "user-a", "account-a"], { playlists: ["A"] });
    queryClient.setQueryData(["music-workspace", "user-b", "account-b"], { playlists: ["B"] });
    queryClient.setQueryData(["unrelated"], "keep");
    const { result } = renderHook(() => useLogout());
    await result.current();
    expect(queryClient.getQueriesData({ queryKey: ["music-workspace"] })).toEqual([]);
    expect(queryClient.getQueryData(["unrelated"])).toBe("keep");
  });

  it("still redirects even if clearing the cache rejects", async () => {
    mockClearStore.mockRejectedValueOnce(new Error("cache boom"));
    const { result } = renderHook(() => useLogout());

    await result.current();

    expect(mockClearStore).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("fences local authority immediately and ends the server session while preserving presentation preferences", async () => {
    localStorage.setItem("theme-storage", "dark");
    useAuthStore.getState().login({ id: "A", documentId: "A", username: "A", email: "a@example.invalid", blocked: false, token: "legacy" });
    const { result } = renderHook(() => useLogout());
    const pending = result.current();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    await pending;
    expect(fetch).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(localStorage.getItem("theme-storage")).toBe("dark");
  });

  it("keeps failed server revocation visible without restoring owner content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    useAuthStore.getState().login({ id: "A", documentId: "A", username: "A", email: "a@example.invalid", blocked: false, token: "legacy" });
    const { result } = renderHook(() => useLogout());
    await result.current();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, status: "signed-out", logoutError: true });
    expect(localStorage.getItem("explorers-logout-pending")).toBe(useAuthStore.getState().logoutAttemptId);
  });
});
