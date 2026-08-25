import { describe, expect, it, vi } from "vitest";
import {
  RecommendationMediaSaveError,
  saveRecommendationMedia,
} from "../recommendationMediaSave";

describe("saveRecommendationMedia", () => {
  it("looks up the created recommendation, uploads its selected media, then saves metadata", async () => {
    const lookup = vi.fn().mockResolvedValue({ id: 17, documentId: "place-17" });
    const upload = vi.fn().mockResolvedValue({
      thumbnail: { id: 1, url: "/uploads/thumb.jpg" },
      imageDetails: [{ id: 2, url: "/uploads/photo.jpg" }],
    });
    const saveMetadata = vi.fn().mockResolvedValue(undefined);

    await expect(saveRecommendationMedia({ lookup, upload, saveMetadata })).resolves.toEqual({
      id: 17,
      documentId: "place-17",
    });
    expect(saveMetadata).toHaveBeenCalledWith("place-17", {
      thumbnail: { id: 1, url: "/uploads/thumb.jpg" },
      imageDetails: [{ id: 2, url: "/uploads/photo.jpg" }],
    });
  });

  it("stops before upload when the created recommendation cannot be looked up", async () => {
    const upload = vi.fn();
    const saveMetadata = vi.fn();

    await expect(
      saveRecommendationMedia({
        lookup: vi.fn().mockRejectedValue(new Error("lookup unavailable")),
        upload,
        saveMetadata,
      }),
    ).rejects.toMatchObject<Partial<RecommendationMediaSaveError>>({ stage: "lookup" });
    expect(upload).not.toHaveBeenCalled();
    expect(saveMetadata).not.toHaveBeenCalled();
  });

  it("stops before metadata when uploading selected media fails", async () => {
    const saveMetadata = vi.fn();

    await expect(
      saveRecommendationMedia({
        lookup: vi.fn().mockResolvedValue({ id: 17, documentId: "place-17" }),
        upload: vi.fn().mockRejectedValue(new Error("upload unavailable")),
        saveMetadata,
      }),
    ).rejects.toMatchObject<Partial<RecommendationMediaSaveError>>({ stage: "upload" });
    expect(saveMetadata).not.toHaveBeenCalled();
  });

  it("reports a metadata failure after media has uploaded so the caller can remain on the form", async () => {
    await expect(
      saveRecommendationMedia({
        lookup: vi.fn().mockResolvedValue({ id: 17, documentId: "place-17" }),
        upload: vi.fn().mockResolvedValue({ thumbnail: null, imageDetails: [] }),
        saveMetadata: vi.fn().mockRejectedValue(new Error("metadata unavailable")),
      }),
    ).rejects.toMatchObject<Partial<RecommendationMediaSaveError>>({ stage: "metadata" });
  });
});
