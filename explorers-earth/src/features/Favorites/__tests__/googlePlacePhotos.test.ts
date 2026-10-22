import { beforeEach, describe, expect, it, vi } from "vitest";

// PLC-02. A place item's Google photos are imported by the API (as #175 did for list covers):
// the browser only asks Google for each photo's key-free URI, and never fetches the bytes,
// which redirect to googleusercontent.com and are refused by CSP.
const { axiosGet, importPlacePhoto } = vi.hoisted(() => ({ axiosGet: vi.fn(), importPlacePhoto: vi.fn() }));
vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("../api/placesClient", () => ({ PlacesClient: { importPlacePhoto } }));
vi.mock("../../../lib/publicRuntimeConfig", () => ({ mapsBrowserKey: () => "k" }));

import { importGooglePlacePhotos } from "../api/googlePlacePhotos";

const details = (count: number) => ({ data: { photos: Array.from({ length: count }, (_, i) => ({ name: `places/P/photos/r${i}` })) } });

describe("importGooglePlacePhotos", () => {
  beforeEach(() => { axiosGet.mockReset(); importPlacePhoto.mockReset(); });

  it("imports each photo URI as recommendation media through the API, never fetching bytes in the browser", async () => {
    const browserFetch = vi.fn();
    vi.stubGlobal("fetch", browserFetch);
    axiosGet.mockResolvedValueOnce(details(2))
      .mockResolvedValueOnce({ data: { photoUri: "https://lh3.googleusercontent.com/a" } })
      .mockResolvedValueOnce({ data: { photoUri: "https://lh3.googleusercontent.com/b" } });
    importPlacePhoto.mockResolvedValueOnce({ id: "m0", url: "/media/m0" }).mockResolvedValueOnce({ id: "m1", url: "/media/m1" });

    const result = await importGooglePlacePhotos("P", 10);

    expect(result).toEqual({ photos: [{ id: "m0", url: "/media/m0" }, { id: "m1", url: "/media/m1" }], failed: 0 });
    expect(String(axiosGet.mock.calls[1][0])).toContain("/P/photos/r0/media?");
    expect(String(axiosGet.mock.calls[1][0])).toContain("skipHttpRedirect=true");
    expect(importPlacePhoto).toHaveBeenCalledWith("https://lh3.googleusercontent.com/a", "recommendation", undefined);
    expect(browserFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("stops at the item's photo limit", async () => {
    axiosGet.mockResolvedValueOnce(details(5));
    axiosGet.mockResolvedValue({ data: { photoUri: "https://lh3.googleusercontent.com/x" } });
    importPlacePhoto.mockResolvedValue({ id: "m", url: "/m" });
    const result = await importGooglePlacePhotos("P", 3);
    expect(result.photos).toHaveLength(3);
    expect(importPlacePhoto).toHaveBeenCalledTimes(3);
  });

  it("counts photos that could not be imported instead of failing the rest", async () => {
    axiosGet.mockResolvedValueOnce(details(3))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { photoUri: "https://lh3.googleusercontent.com/b" } })
      .mockRejectedValueOnce(new Error("quota"));
    importPlacePhoto.mockResolvedValueOnce({ id: "m1", url: "/m1" });
    expect(await importGooglePlacePhotos("P", 10)).toEqual({ photos: [{ id: "m1", url: "/m1" }], failed: 2 });
  });

  it("answers no photos when the place has none", async () => {
    axiosGet.mockResolvedValueOnce({ data: {} });
    expect(await importGooglePlacePhotos("P", 10)).toEqual({ photos: [], failed: 0 });
  });
});
