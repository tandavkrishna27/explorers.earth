import { describe, expect, it } from "vitest";
import { updateAccountRequestSchema } from "../../shared/explorersContract";

const parse = (fields: Record<string, unknown>) => updateAccountRequestSchema.safeParse({ expectedRevision: 1, ...fields }).success;

describe("profile nested write contract", () => {
  it("rejects malformed and unapproved nested payloads", () => {
    for (const fields of [
      { primaryAddress: 27 }, { additionalAddresses: [null] }, { socialLinks: [null] },
      { themeSettings: { notApproved: true } },
      { themeSettings: { wallpaperUrl: "https://arbitrary.invalid/a" } },
      { businessDetails: { token: "secret" } },
      { feedItems: [{ mediaId: null, externalUrl: "https://example.invalid/a", source: "google", type: "image", caption: null, details: { actorId: "x" } }] },
    ]) expect(parse(fields)).toBe(false);
  });

  it("accepts supported address, rich bio, theme, social and feed metadata", () => {
    expect(parse({ bioRich: { blocks: [{ text: "नमस्ते" }] }, primaryAddress: { address: "Jaipur" },
      publicAddress: { title: "Studio", website: "https://example.com" },
      themeSettings: { preset: "cinematic-dark", recommendations: { layout: "grid", categoryOrder: ["places", "books"] } },
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/example", visible: true }],
      feedItems: [{ mediaId: "11111111-1111-4111-8111-111111111111", externalUrl: null, source: "manual",
        type: "image", caption: null, details: { fileName: "a.png", width: 800, height: 1000, aspectRatio: "4:5" } }],
    })).toBe(true);
  });
});
