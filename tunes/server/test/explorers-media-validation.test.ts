import { describe, expect, it } from "vitest";
import { mediaUploadProblem, type MediaUploadInput } from "../application/media";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const input = (over: Partial<MediaUploadInput> = {}): MediaUploadInput => ({
  purpose: "recommendation", filename: "cover.png", mimeType: "image/png", length: png.length, bytes: png, ...over });

describe("mediaUploadProblem (MED-X01)", () => {
  it("accepts a well-formed image", () => {
    expect(mediaUploadProblem(input())).toBeNull();
  });

  it("names a file type outside the allowlist", () => {
    const pdf = Buffer.from("%PDF-1.7 hello");
    expect(mediaUploadProblem(input({ mimeType: "application/pdf", bytes: pdf, length: pdf.length })))
      .toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", message: expect.stringMatching(/JPEG, PNG, WebP or GIF/) });
  });

  it("rejects a video for an image-only purpose as a type problem", () => {
    const mp4 = Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0]);
    expect(mediaUploadProblem(input({ mimeType: "video/mp4", bytes: mp4, length: mp4.length })))
      .toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("names the size limit for a file that is too large", () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    png.copy(big);
    expect(mediaUploadProblem(input({ bytes: big, length: big.length })))
      .toMatchObject({ code: "MEDIA_TOO_LARGE", message: expect.stringMatching(/5 MB/) });
  });

  it("calls a file whose bytes do not match its declared type unreadable", () => {
    const junk = Buffer.from("not really a png");
    expect(mediaUploadProblem(input({ bytes: junk, length: junk.length })))
      .toMatchObject({ code: "UNREADABLE_MEDIA" });
    expect(mediaUploadProblem(input({ bytes: Buffer.alloc(0), length: 0 })))
      .toMatchObject({ code: "UNREADABLE_MEDIA" });
  });

  it("keeps a generic code for an invalid purpose or file name", () => {
    expect(mediaUploadProblem(input({ purpose: "nope" as never }))).toMatchObject({ code: "INVALID_INPUT" });
    expect(mediaUploadProblem(input({ filename: "bad/name.png" }))).toMatchObject({ code: "INVALID_INPUT" });
  });
});
