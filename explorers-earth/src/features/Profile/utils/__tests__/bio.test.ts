import { describe, expect, it } from "vitest";
import { bioToHtml, editorBioToPlain, htmlToPlainText, toBioPlain, toBioRich } from "../bio";

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

// PRF-X04: a save with no edits must hand back exactly the text that was stored.
// Stored bioPlain -> editor HTML (bioToHtml) -> save (editorBioToPlain) must be the identity.
describe("bio round trip is lossless for plain text (PRF-X04)", () => {
  const plainCases: Array<[string, string]> = [
    ["literal tag text", "<b>x</b>"],
    ["literal tag inside a sentence", "Edited <b> & line"],
    ["literal block tag text", "use <p> for paragraphs and <div> for blocks"],
    ["multi-line", "line one\nline two\nline three"],
    ["blank line between paragraphs", "first\n\nsecond"],
    ["emoji", "Hello \u{1F30D} caf\u00e9 \u{1F469}\u200D\u{1F4BB} \u2764\uFE0F"],
    ["ampersand entity text", "Tom &amp; Jerry &lt;3 &nbsp; 5 &gt; 4"],
    ["bare symbols", "1 < 2 & 3 > 2 \"quoted\" 'single'"],
    ["the reported bio", "Verification persona r4a. Edited <b> & line\nsecond line"],
  ];

  it.each(plainCases)("%s survives a no-change save", (_label, stored) => {
    expect(editorBioToPlain(bioToHtml(stored))).toBe(stored);
    // And reading it back for display/SEO leaves it untouched too.
    expect(toBioPlain(stored)).toBe(stored);
  });

  it("escapes angle brackets on the way into the editor instead of treating them as markup", () => {
    expect(bioToHtml("<b>x</b>")).toBe("<p>&lt;b&gt;x&lt;/b&gt;</p>");
    expect(bioToHtml("a\n\nb")).toBe("<p>a</p><p><br></p><p>b</p>");
    expect(bioToHtml("one\r\ntwo")).toBe("<p>one</p><p>two</p>");
  });

  it("keeps real editor HTML working: tags are dropped, entities decoded", () => {
    expect(editorBioToPlain("<p><strong>Bold</strong> and &lt;b&gt; text</p><p>Two</p>")).toBe("Bold and <b> text\nTwo");
    expect(toBioRich("<p>&lt;b&gt;x&lt;/b&gt;</p><p>second</p>")).toEqual({ blocks: [{ text: "<b>x</b>" }, { text: "second" }] });
  });

  const legacyCases: Array<[string, string, string]> = [
    ["paragraphs with entities", "<p>legacy&nbsp;html &amp; more</p><p>two</p>", "legacy html & more\ntwo"],
    ["formatted paragraph", "<p><strong>Hi</strong> there</p>", "Hi there"],
    ["list", "<ul><li>one</li><li>two</li></ul>", "one\ntwo"],
  ];

  it.each(legacyCases)("HTML already stored in bioPlain (%s) is still read as HTML", (_label, stored, plain) => {
    expect(bioToHtml(stored)).toBe(stored);
    expect(toBioPlain(stored)).toBe(plain);
    // Through the editor and back it settles on the clean text, and stays there.
    expect(editorBioToPlain(bioToHtml(stored))).toBe(plain);
    expect(editorBioToPlain(bioToHtml(plain))).toBe(plain);
  });
});
