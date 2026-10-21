import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Ticket 5.1. The BUG-5 behaviours, unchanged in substance against the native command: a
// pre-flight failure must not reach the create, and a failure of the refresh *after* a
// successful create must not be reported as a create failure — otherwise a retry creates
// a duplicate list.
const { toastError, axiosGet, createList, upload, importPlacePhoto, setSelectedCity } = vi.hoisted(() => ({
  toastError: vi.fn(),
  axiosGet: vi.fn().mockRejectedValue(new Error("boom")),
  createList: vi.fn(),
  upload: vi.fn(),
  importPlacePhoto: vi.fn(),
  setSelectedCity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

// The very first network call in the flow rejects.
vi.mock("axios", () => ({ default: { get: axiosGet, post: vi.fn() } }));

vi.mock("../api/placesCommands", () => ({
  usePlacesCommands: () => ({ createList, upload, importPlacePhoto, loading: false }),
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

import { ExplorersApiError } from "../../../lib/explorersApiClient";
import { useCreateLocation } from "../hooks/useCreateLocation";

describe("useCreateLocation error handling (BUG-5)", () => {
  beforeEach(() => {
    toastError.mockClear();
    axiosGet.mockClear();
    createList.mockClear();
    upload.mockClear();
    importPlacePhoto.mockReset();
    createList.mockReset();
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

  it("names a duplicate URL instead of a generic failure", async () => {
    axiosGet.mockResolvedValueOnce({ data: { photos: undefined, location: { latitude: 1, longitude: 2 } } });
    createList.mockRejectedValueOnce(new ExplorersApiError(409, "CONFLICT", "Content conflicts with an existing resource"));
    const { result } = renderHook(() =>
      useCreateLocation({
        setIsLocationModalOpen: vi.fn(),
        refetchCities: vi.fn(),
        setIsLoading: vi.fn(),
        cities: { recommendationLists: [] },
        onCreated: vi.fn(),
      })
    );
    expect(await result.current.handleLocationSubmit({ placeId: "x", listName: "Y" } as never)).toBe(false);
    expect(toastError).toHaveBeenCalledWith("dashboard.recommendations.toastMessages.listUrlTaken");
  });

  // This used to assert the opposite: a photo that could not be fetched aborted the whole
  // create, so the creator was not left with a coverless list and no idea which step failed.
  // In production that turned one optional, provider-side asset into a hard dependency: when
  // the photo host was unreachable (CSP, 2026-10-21) no Places list could be created at all.
  // The cover is optional (a place with no photos already creates without one), so the list
  // is now created and the failed step is NAMED in its own error toast - the "no way to tell"
  // half of the original intent is kept, the "nothing works" half is not.
  it.each([
    ["the photo URI lookup fails", () => { axiosGet.mockRejectedValueOnce(new Error("lookup boom")); }],
    ["the provider answers no photo URI", () => { axiosGet.mockResolvedValueOnce({ data: {} }); }],
    ["the server-side import fails", () => {
      axiosGet.mockResolvedValueOnce({ data: { photoUri: "https://lh3.googleusercontent.com/p/x" } });
      importPlacePhoto.mockRejectedValueOnce(new ExplorersApiError(422, "INVALID_INPUT", "Place photo unavailable"));
    }],
  ])("creates the list without a cover and names the cover failure when %s", async (_case, arrange) => {
    axiosGet.mockResolvedValueOnce({ data: { photos: [{ name: "places/x/photos/ref" }], location: { latitude: 1, longitude: 2 } } });
    arrange();
    createList.mockResolvedValueOnce({ id: "c1", title: "Y", slug: "y", description: null });
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

    expect(ok).toBe(true);
    expect(createList).toHaveBeenCalledTimes(1);
    expect(createList.mock.calls[0][0]).not.toHaveProperty("coverMediaId");
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("dashboard.recommendations.toastMessages.listCoverImportFailed");
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
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
