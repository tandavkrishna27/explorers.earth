import { describe, expect, it } from "vitest";
import { notePreviewText } from "../notePreviewText";

describe("notePreviewText", () => {
  it("drops tags and decodes entities instead of showing them literally", () => {
    expect(notePreviewText("<p>Great&nbsp;film &amp; score</p><p>Watch it</p>")).toBe("Great film & score Watch it");
  });
  it("leaves plain text alone", () => {
    expect(notePreviewText("Just text")).toBe("Just text");
  });
});
