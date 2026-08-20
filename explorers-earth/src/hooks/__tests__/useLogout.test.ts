import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../store/store";
import { useLogout } from "../useLogout";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockClearStore = vi.fn();

vi.mock("@apollo/client", () => ({ useApolloClient: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../store/store", () => ({ default: vi.fn() }));

describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClearStore.mockResolvedValue(undefined);
    (useApolloClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ clearStore: mockClearStore });
    (useNavigate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ logout: mockLogout });
  });

  it("clears the Apollo cache, clears storage, and redirects to /login", async () => {
    localStorage.setItem("qrtoken", "jwt");
    const { result } = renderHook(() => useLogout());

    await result.current();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearStore).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("qrtoken")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("still redirects even if clearing the cache rejects", async () => {
    mockClearStore.mockRejectedValueOnce(new Error("cache boom"));
    const { result } = renderHook(() => useLogout());

    await result.current();

    expect(mockClearStore).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
