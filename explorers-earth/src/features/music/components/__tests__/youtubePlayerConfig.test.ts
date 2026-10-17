import { describe, expect, it } from "vitest";
import { createYouTubePlayerConfig, isYouTubeEmbedRejection, youTubeWatchUrl } from "../youtubePlayerConfig";

describe("YouTube player configuration", () => {
  it("supplies the current public origin and a referrer policy accepted by the YouTube player", () => {
    expect(createYouTubePlayerConfig("http://127.0.0.1:5174", "http://127.0.0.1:5174/tk2727/music")).toEqual({
      youtube: {
        origin: "http://127.0.0.1:5174",
        widget_referrer: "http://127.0.0.1:5174/tk2727/music",
        referrerpolicy: "strict-origin-when-cross-origin",
      },
    });
  });

  it.each([101, 150, 153])("classifies YouTube embed rejection %s for a direct watch fallback", (code) => {
    expect(isYouTubeEmbedRejection({ currentTarget: { error: { code } } })).toBe(true);
  });

  it("does not misclassify an ordinary connectivity failure as an embed rejection", () => {
    expect(isYouTubeEmbedRejection(new TypeError("offline"))).toBe(false);
  });

  it("builds a direct YouTube URL only from the validated video id", () => {
    expect(youTubeWatchUrl("abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
});
