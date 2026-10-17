import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Ticket 5.1. The BUG-5 behaviours, unchanged in substance against the native command: a
// pre-flight failure must not reach the create, and a failure of the refresh *after* a
// successful create must not be reported as a create failure — otherwise a retry creates
// a duplicate list.
const { toastError, axiosGet, createList, upload, setSelectedCity } = vi.hoisted(() => ({
  toastError: vi.fn(),
  axiosGet: vi.fn().mockRejectedValue(new Error("boom")),
  createList: vi.fn(),
  upload: vi.fn(),
  setSelectedCity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

// The very first network call in the flow rejects.
vi.mock("axios", () => ({ default: { get: axiosGet, post: vi.fn() } }));

vi.mock("../api/placesCommands", () => ({
  usePlacesCommands: () => ({ createList, upload, loading: false }),
}));

vi.mock("../../../store/store", () => ({
  default: () => ({ user: { documentId: "u1", username: "qa" }, accountId: "acc_1" }),
}));

vi.mock("../../../store/useCityStore", () => ({
  useCityStore: () => ({ setSelectedCity }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useCreateLocation } from "../hooks/useCreateLocation";

describe("useCreateLocation error handling (BUG-5)", () => {
  beforeEach(() => {
    toastError.mockClear();
    axiosGet.mockClear();
    createList.mockClear();
    upload.mockClear();
  });

  it("surfaces a create error, resets loading, and returns false", async () => {
    const setIsLoading = vi.fn();
    const refetchCities = vi.fn();

    const { result } = renderHook(() =>
      useCreateLocation({
        setIsLocationModalOpen: vi.fn(),
        refetchCities,
        setIsLoading,
        cities: { recommendationLists: [] },
        onCreated: vi.fn(),
      })
    );

    const ok = await result.current.handleLocationSubmit({ placeId: "x", listName: "Y" } as never);

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    // Loading turned on then off (finally).
    expect(setIsLoading).toHaveBeenCalledWith(true);
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
    // The command must not run when the pre-flight lookup fails.
    expect(createList).not.toHaveBeenCalled();
  });

  it("does not create a list when the thumbnail import fails", async () => {
    // A provider photo that cannot be fetched must not leave a list created with no
    // thumbnail and no way for the creator to tell which step failed.
    axiosGet.mockResolvedValueOnce({ data: { photos: [{ name: "places/x/photos/ref" }], location: { latitude: 1, longitude: 2 } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const setIsLoading = vi.fn();

    const { result } = renderHook(() =>
      useCreateLocation({
        setIsLocationModalOpen: vi.fn(),
        refetchCities: vi.fn(),
        setIsLoading,
        cities: { recommendationLists: [] },
        onCreated: vi.fn(),
      })
    );
    const ok = await result.current.handleLocationSubmit({ placeId: "x", listName: "Y" } as never);

    expect(ok).toBe(false);
    expect(createList).not.toHaveBeenCalled();
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
    vi.unstubAllGlobals();
  });

  it("returns true when the command succeeds but the follow-up refresh fails (no duplicate-create path)", async () => {
    axiosGet.mockResolvedValueOnce({ data: { photos: undefined, location: { latitude: 1, longitude: 2 } } });
    createList.mockResolvedValueOnce({ id: "c1", title: "Y", slug: "y", description: null });
    // The refresh AFTER a successful create fails — this must NOT be reported as a create
    // failure (otherwise a retry would create a duplicate).
    const refetchCities = vi.fn().mockRejectedValue(new Error("refetch boom"));
    const setIsLoading = vi.fn();
    const onCreated = vi.fn();

    const { result } = renderHook(() =>
      useCreateLocation({
        setIsLocationModalOpen: vi.fn(),
        refetchCities,
        setIsLoading,
        cities: { recommendationLists: [] },
        onCreated,
      })
    );

    const ok = await result.current.handleLocationSubmit({ placeId: "x", listName: "Y" } as never);

    expect(ok).toBe(true);
    expect(refetchCities).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("c1");
    // The new list is still selected even though the refresh failed.
    expect(setSelectedCity).toHaveBeenCalledWith(expect.objectContaining({ documentId: "c1" }));
    expect(toastError).not.toHaveBeenCalled();
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
  });
});
