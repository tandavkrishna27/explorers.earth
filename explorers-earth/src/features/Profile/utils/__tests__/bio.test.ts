import { describe, expect, it } from "vitest";
import { bioToHtml, htmlToPlainText, toBioPlain, toBioRich } from "../bio";

describe("bio helpers (PRF-X03)", () => {
  it("turns editor HTML into clean plain text", () => {
    expect(toBioPlain("<p>Hello&nbsp;world &amp; co</p><p>Second line</p>")).toBe("Hello world & co\nSecond line");
    expect(htmlToPlainText("<p><br></p>")).toBe("");
  });
  it("leaves plain text alone", () => {
    expect(toBioPlain("  I like 1 < 2  ")).toBe("I like 1 < 2");
  });
  it("builds the contract bioRich blocks, or null when empty", () => {
    expect(toBioRich("<p>One</p><p>Two</p>")).toEqual({ blocks: [{ text: "One" }, { text: "Two" }] });
    expect(toBioRich("<p><br></p>")).toBeNull();
  });
  it("renders plain text as escaped paragraphs and passes legacy HTML through", () => {
    expect(bioToHtml("1 < 2 & 3\nsecond")).toBe("<p>1 &lt; 2 &amp; 3</p><p>second</p>");
    expect(bioToHtml("<p>legacy&nbsp;html</p>")).toBe("<p>legacy&nbsp;html</p>");
    expect(bioToHtml(null)).toBe("");
  });
});
