import { describe, expect, it } from "vitest";
import { publicGuideSlug } from "../publicGuideSlug";

describe("publicGuideSlug", () => {
  it.each([
    ["Unicode title", "東京 — 一日", null],
    ["punctuation title", "Eat / Pray? Go!", null],
    ["empty title", "", null],
  ])("uses the stable documentId for a null slug regardless of the %s", (_case, Title, slug) => {
    expect(publicGuideSlug({ Title, slug, documentId: "guide-document-123" })).toBe("guide-document-123");
  });

  it.each(["stored-slug", "Stored_Slug-2026", "A1"])("preserves the route-safe stored slug %s", (slug) => {
    expect(publicGuideSlug({ slug, documentId: "guide-document-123" })).toBe(slug);
  });

  it.each([
    "has spaces",
    "nested/path",
    "query?draft=true",
    "fragment#draft",
    "percent%2Fescape",
    "punctuation!",
    "a".repeat(161),
    "",
  ])("rejects the unsafe stored slug %s and uses the documentId", (slug) => {
    expect(publicGuideSlug({ slug, documentId: "guide-document-123" })).toBe("guide-document-123");
  });
});
