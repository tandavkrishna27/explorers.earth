import { describe, expect, it } from "vitest";
import { normalizeRichTextHtml } from "../richTextHtml";

describe("normalizeRichTextHtml", () => {
  it("turns non-breaking spaces into plain spaces and keeps formatting", () => {
    expect(normalizeRichTextHtml("<p>UAT&nbsp;note&nbsp;with\u00a0<strong>spaces</strong></p>"))
      .toBe("<p>UAT note with <strong>spaces</strong></p>");
  });

  it("treats empty editor output as empty", () => {
    expect(normalizeRichTextHtml("<p></p>")).toBe("");
    expect(normalizeRichTextHtml("<p><br></p>")).toBe("");
    expect(normalizeRichTextHtml(undefined)).toBe("");
  });

  it("keeps other entities intact", () => {
    expect(normalizeRichTextHtml("<p>a &amp; b &lt;c&gt;</p>")).toBe("<p>a &amp; b &lt;c&gt;</p>");
  });
});
