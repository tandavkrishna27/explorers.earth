import { beforeEach, describe, expect, it, vi } from "vitest";
const axios = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("axios", () => ({ default: axios }));
vi.mock("../../../lib/publicRuntimeConfig", () => ({ mapsBrowserKey: () => "k" }));
import { importPlaceCover } from "../hooks/useCreateLocation";

beforeEach(() => vi.clearAllMocks());

describe("importPlaceCover", () => {
  it("imports the first provider photo and returns its media id plus the place details", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { displayName: { text: "Goa" }, photos: [{ name: "places/P1/photos/ref1" }] } })
      .mockResolvedValueOnce({ data: { photoUri: "https://lh3.example/photo" } });
    const importPlacePhoto = vi.fn().mockResolvedValue({ id: "media-1" });
    const result = await importPlaceCover("P1", importPlacePhoto);
    expect(importPlacePhoto).toHaveBeenCalledWith("https://lh3.example/photo");
    expect(result).toMatchObject({ coverMediaId: "media-1", coverImportFailed: false, details: { displayName: { text: "Goa" } } });
  });
  it("returns no cover and a failure flag when the photo step fails", async () => {
    axios.get.mockResolvedValueOnce({ data: { photos: [{ name: "places/P1/photos/ref1" }] } }).mockRejectedValueOnce(new Error("quota"));
    const result = await importPlaceCover("P1", vi.fn());
    expect(result).toMatchObject({ coverMediaId: undefined, coverImportFailed: true });
  });
  it("returns no cover and no failure when the place has no photos", async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    expect(await importPlaceCover("P1", vi.fn())).toMatchObject({ coverMediaId: undefined, coverImportFailed: false });
  });
});
