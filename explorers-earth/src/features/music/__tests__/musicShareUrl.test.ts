import { describe, expect, it } from "vitest";
import { publicMusicShareUrl } from "../musicShareUrl";

describe("publicMusicShareUrl", () => {
  it("returns a bare slug URL only for public publication mode", () => {
    expect(publicMusicShareUrl("https://explorers.example", { mode: "public", publicSlug: "public slug" }))
      .toBe("https://explorers.example/music/share/public%20slug");
    expect(publicMusicShareUrl("https://explorers.example", { mode: "unlisted", publicSlug: "secret-slug" }))
      .toBeUndefined();
    expect(publicMusicShareUrl("https://explorers.example", { mode: "private", publicSlug: "private-slug" }))
      .toBeUndefined();
  });
});
