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

const { axiosGet, createList, upload, importPlacePhoto, setSelectedCity } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  createList: vi.fn(),
  upload: vi.fn(),
  importPlacePhoto: vi.fn(),
  setSelectedCity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

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
    importPlacePhoto.mockReset();
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

  // PLC-01. The modal shows an editable share-link field; the slug typed there was ignored
  // and the list name re-slugged instead.
  it("uses the share slug the owner typed, slugged, over one derived from the name", async () => {
    axiosGet.mockResolvedValueOnce({ data: { photos: [], location: { latitude: 1, longitude: 2 } } });
    createList.mockResolvedValueOnce(CREATED);
    const { result } = hook();
    await result.current.handleLocationSubmit({ placeId: "ChIJ_city", listName: "Paris", placeUrl: "My Paris Picks" } as never);
    expect(createList.mock.calls[0][0].slug).toBe("my-paris-picks");
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

  it("imports the provider thumbnail into owned collection media through the API, never from the browser", async () => {
    axiosGet
      .mockResolvedValueOnce({
        data: { photos: [{ name: "places/ChIJ_city/photos/ref1" }], displayName: { text: "Bengaluru" }, location: { latitude: 1, longitude: 2 } },
      })
      // skipHttpRedirect answers JSON from places.googleapis.com, which CSP already allows.
      .mockResolvedValueOnce({ data: { photoUri: "https://lh3.googleusercontent.com/place-photos/abc=s4800-w400" } });
    const browserFetch = vi.fn();
    vi.stubGlobal("fetch", browserFetch);
    importPlacePhoto.mockResolvedValueOnce({ id: "media_1" });
    createList.mockResolvedValueOnce({ ...CREATED });

    const { result } = hook();
    const ok = await result.current.handleLocationSubmit({ placeId: "ChIJ_city", listName: "My Cafe List" } as never);

    expect(ok).toBe(true);
    expect(String(axiosGet.mock.calls[1][0])).toContain("/ChIJ_city/photos/ref1/media?");
    expect(String(axiosGet.mock.calls[1][0])).toContain("skipHttpRedirect=true");
    // Only the key-free photo URI leaves the browser; the API fetches the bytes.
    expect(importPlacePhoto).toHaveBeenCalledWith("https://lh3.googleusercontent.com/place-photos/abc=s4800-w400");
    expect(browserFetch).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
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
