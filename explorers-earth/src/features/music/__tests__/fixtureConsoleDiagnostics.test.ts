import { describe, expect, it } from "vitest";
import { isKnownMusicFixtureProviderDiagnostic } from "../fixtureConsoleDiagnostics";

describe("Music fixture console diagnostics", () => {
  it("allows only the exact known YouTube iframe compute-pressure diagnostic", () => {
    expect(isKnownMusicFixtureProviderDiagnostic({
      message: "Permissions policy violation: compute-pressure is not allowed in this document.",
      sourceUrl: "https://www.youtube.com/embed/abcdefghijk",
    })).toBe(true);
  });

  it("keeps first-party and unknown console errors fatal", () => {
    for (const input of [
      { message: "Permissions policy violation: compute-pressure is not allowed in this document", sourceUrl: "https://www.youtube.com/embed/abcdefghijk" },
      { message: "Permissions policy violation: geolocation is not allowed in this document.", sourceUrl: "https://www.youtube.com/embed/abcdefghijk" },
      { message: "Permissions policy violation: compute-pressure is not allowed in this document.", sourceUrl: "http://localhost:55173/assets/index.js" },
      { message: "MusicClientError: Music authorization is temporarily unavailable.", sourceUrl: "http://localhost:55173/assets/index.js" },
      { message: "Uncaught TypeError: Cannot read properties of null", sourceUrl: "http://localhost:55173/assets/index.js" },
      { message: "YouTube player failed to initialize", sourceUrl: "https://www.youtube.com/embed/abcdefghijk" },
    ]) expect(isKnownMusicFixtureProviderDiagnostic(input)).toBe(false);
  });
});
