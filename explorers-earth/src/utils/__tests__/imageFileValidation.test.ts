import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, validateImageFiles } from "../imageFileValidation";

const file = (name: string, type: string, size: number) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("validateImageFiles", () => {
  it("accepts png, jpeg, webp and gif within the limit", () => {
    const files = ["image/png", "image/jpeg", "image/webp", "image/gif"].map((t) => file("a", t, 100));
    expect(validateImageFiles(files)).toEqual({ valid: files, rejected: [] });
  });
  it("rejects videos and other types, naming the reason", () => {
    const { valid, rejected } = validateImageFiles([file("clip.mp4", "video/mp4", 100), file("notes.txt", "text/plain", 10), file("ok.png", "image/png", 10)]);
    expect(valid.map((f) => f.name)).toEqual(["ok.png"]);
    expect(rejected.map((r) => [r.file.name, r.reason])).toEqual([["clip.mp4", "type"], ["notes.txt", "type"]]);
  });
  it("rejects oversized and empty files", () => {
    const { rejected } = validateImageFiles([file("big.png", "image/png", MAX_IMAGE_BYTES + 1), file("empty.png", "image/png", 0)]);
    expect(rejected.map((r) => r.reason)).toEqual(["size", "empty"]);
  });
});
