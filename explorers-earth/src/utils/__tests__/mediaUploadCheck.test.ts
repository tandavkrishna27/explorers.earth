import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaUploadProblem, safeMediaFileName } from "../mediaUploadCheck";
import { explorersApiClient } from "../../lib/explorersApiClient";

const file = (type: string, size: number, name = "photo.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("mediaUploadProblem (MED-X01)", () => {
  it("accepts an image within 5 MB", () => {
    expect(mediaUploadProblem(file("image/png", 1000), "recommendation")).toBeNull();
  });
  it("names the wrong type", () => {
    expect(mediaUploadProblem(file("application/pdf", 1000), "profile"))
      .toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", message: expect.stringMatching(/JPEG, PNG, WebP or GIF/) });
    expect(mediaUploadProblem(file("video/mp4", 1000), "recommendation")).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(mediaUploadProblem(file("video/mp4", 1000), "feed")).toBeNull();
  });
  it("names the 5 MB limit", () => {
    expect(mediaUploadProblem(file("image/jpeg", 5 * 1024 * 1024 + 1), "collection"))
      .toMatchObject({ code: "MEDIA_TOO_LARGE", message: expect.stringMatching(/5 MB/) });
  });
  it("refuses an empty file", () => {
    expect(mediaUploadProblem(file("image/jpeg", 0), "guide")).toMatchObject({ code: "UNREADABLE_MEDIA" });
  });
  it("makes file names the server accepts", () => {
    expect(safeMediaFileName("photo (1).jpg")).toBe("photo -1-.jpg");
    expect(safeMediaFileName("()")).toBe("-");
  });
});

describe("createMedia pre-check", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects with the specific reason without calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(explorersApiClient.createMedia(file("image/png", 6 * 1024 * 1024), "recommendation"))
      .rejects.toMatchObject({ status: 422, code: "MEDIA_TOO_LARGE", message: expect.stringMatching(/5 MB/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends a server-safe file name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ media: { id: "m" } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await explorersApiClient.createMedia(file("image/png", 10, "my photo (1).png"), "recommendation").catch(() => undefined);
    expect(fetchMock.mock.calls[0][1].headers["X-File-Name"]).toBe("my photo -1-.png");
  });
});
