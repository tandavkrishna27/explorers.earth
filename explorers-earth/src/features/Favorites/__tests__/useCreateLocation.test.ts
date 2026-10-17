import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Ticket 5.1. The same behaviours this file always asserted — the created list becomes the
// selected city, and onCreated fires with its id — now against the native owner command
// instead of the Strapi createRecommendationList mutation. The Places-specific assertions
// below are new: the list and its location are created in one command, and the thumbnail
// is imported into owned media rather than linked from the provider.
const CREATED = {
  id: "new_1",
  title: "My Cafe List",
  slug: "my-cafe-list",
  description: null,
  visibility: "private",
  publicationState: "draft",
};

const { axiosGet, createList, upload, setSelectedCity } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  createList: vi.fn(),
  upload: vi.fn(),
  setSelectedCity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

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

import { useCreateLocation, locationSnapshot } from "../hooks/useCreateLocation";

const hook = (over: Record<string, unknown> = {}) => renderHook(() =>
  useCreateLocation({
    setIsLocationModalOpen: vi.fn(),
    refetchCities: vi.fn().mockResolvedValue({ data: { recommendationLists: [] } }),
    setIsLoading: vi.fn(),
    cities: { recommendationLists: [] },
    onCreated: vi.fn(),
    ...over,
  } as never)
);

describe("useCreateLocation — Places create focuses the new list (BUG-3 parity)", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    createList.mockReset();
    upload.mockReset();
    setSelectedCity.mockReset();
  });

  it("selects the created list so Favorites can open into it, and calls onCreated with its id", async () => {
    // Place lookup succeeds with no photos → no thumbnail import.
    axiosGet.mockResolvedValueOnce({
      data: { photos: [], displayName: { text: "Bengaluru" }, formattedAddress: "Bengaluru, India", location: { latitude: 12.9715987, longitude: 77.5945627 } },
    });
    createList.mockResolvedValueOnce(CREATED);
    const refetchCities = vi.fn().mockResolvedValue({ data: { recommendationLists: [] } });
    const onCreated = vi.fn();

    const { result } = hook({ refetchCities, onCreated });
    const ok = await result.current.handleLocationSubmit({ placeId: "place_123", listName: "My Cafe List" } as never);

    expect(ok).toBe(true);
    // The new list must become the selected city — the precondition Favorites' step-2
    // focus (setStep(2)) relies on to render the new list's detail view.
    expect(setSelectedCity).toHaveBeenCalledWith(expect.objectContaining({ documentId: "new_1" }));
    expect(onCreated).toHaveBeenCalledWith("new_1");
    expect(upload).not.toHaveBeenCalled();
  });

  it("creates the list and its location in one command, with the provider place id", async () => {
    axiosGet.mockResolvedValueOnce({
      data: { photos: [], displayName: { text: "Bengaluru" }, formattedAddress: "Bengaluru, Karnataka, India", location: { latitude: 12.9715987, longitude: 77.5945627 } },
    });
    createList.mockResolvedValueOnce(CREATED);
    const { result } = hook();
    await result.current.handleLocationSubmit({ placeId: "ChIJ_city", listName: "My Cafe List", note: "A guide", recommendationSocialLink: "https://example.com/reel" } as never);

    expect(createList).toHaveBeenCalledTimes(1);
    expect(createList.mock.calls[0][0]).toMatchObject({
      title: "My Cafe List", slug: "my-cafe-list", description: "A guide",
      placeLocation: {
        locationEntityId: null, instagramMediaUrl: "https://example.com/reel",
        locationSnapshot: { version: 1, name: "Bengaluru", address: "Bengaluru, Karnataka, India", providerPlaceId: "ChIJ_city", latitude: 12.9715987, longitude: 77.5945627 },
      },
    });
  });

  it("imports the provider thumbnail into owned collection media rather than linking it", async () => {
    axiosGet.mockResolvedValueOnce({
      data: { photos: [{ name: "places/ChIJ_city/photos/ref1" }], displayName: { text: "Bengaluru" }, location: { latitude: 1, longitude: 2 } },
    });
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    upload.mockResolvedValueOnce({ id: "media_1" });
    createList.mockResolvedValueOnce({ ...CREATED });

    const { result } = hook();
    const ok = await result.current.handleLocationSubmit({ placeId: "ChIJ_city", listName: "My Cafe List" } as never);

    expect(ok).toBe(true);
    // The collection purpose is what 0030's guard requires of a list cover.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toBe("collection");
    expect(createList.mock.calls[0][0].coverMediaId).toBe("media_1");
    // Nothing in the stored location points at a provider URL.
    expect(JSON.stringify(createList.mock.calls[0][0].placeLocation)).not.toContain("googleapis");
    vi.unstubAllGlobals();
  });

  it("keeps a zero coordinate and refuses to fabricate one from a half-known pair", () => {
    // The ticket's own requirement, at the edge where the provider response is read.
    expect(locationSnapshot({ placeId: "p", location: { latitude: 0, longitude: 0 } })).toMatchObject({ latitude: 0, longitude: 0 });
    expect(locationSnapshot({ placeId: "p", location: { latitude: 12.97, longitude: undefined } })).toMatchObject({ latitude: null, longitude: null });
    expect(locationSnapshot({ placeId: "p", location: null })).toMatchObject({ latitude: null, longitude: null });
    // A provider double beyond the stored precision is rounded to it, not refused.
    expect(locationSnapshot({ placeId: "p", location: { latitude: 12.97159871234, longitude: 77.5945627 } }).latitude).toBe(12.9715987);
    // An empty provider name is absent, not an empty string.
    expect(locationSnapshot({ placeId: "", name: "  ", location: null })).toMatchObject({ providerPlaceId: null, name: null });
  });
});
