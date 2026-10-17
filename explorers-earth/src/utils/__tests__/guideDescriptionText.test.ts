import { describe, expect, it } from "vitest";
import { guideDescriptionText } from "../guideDescriptionText";

describe("guideDescriptionText", () => {
  it("extracts rich-text leaves and decodes named and numeric entities to plain text", () => {
    expect(guideDescriptionText([{ children: [{ text: "A&nbsp;focused &#160; day &amp; night" }] }]))
      .toBe("A focused   day & night");
  });

  it("returns an empty string for an absent description", () => {
    expect(guideDescriptionText(undefined)).toBe("");
  });

  it("preserves ordinary Unicode in a string description", () => {
    expect(guideDescriptionText("Plain Unicode — 東京")).toBe("Plain Unicode — 東京");
  });

  it("decodes hexadecimal and named entities in string descriptions without interpreting markup", () => {
    expect(guideDescriptionText("Look &#x1F30D; &copy; <script>alert(1)</script>"))
      .toBe("Look 🌍 © <script>alert(1)</script>");
  });
});
