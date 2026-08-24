import { describe, expect, it } from "vitest";
import {
  normalizePublicEmailHref,
  normalizePublicWebHref,
  sanitizePublicRichText,
} from "../publicProfileContent";

describe("public profile content policy", () => {
  it.each([
    "JaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "mailto:alice@example.com",
  ])("rejects %s from HTTP(S)-only public links", (value) => {
    expect(normalizePublicWebHref(value)).toBeUndefined();
  });

  it.each([
    ["https://example.com/path", "https://example.com/path"],
    ["http://example.com/path", "http://example.com/path"],
    ["//example.com/path", "https://example.com/path"],
    ["www.example.com/path", "https://www.example.com/path"],
  ])("normalizes public web URL %s to %s", (value, expected) => {
    expect(normalizePublicWebHref(value)).toBe(expected);
  });

  it.each([
    ["alice@example.com", "mailto:alice@example.com"],
    ["mailto:alice@example.com", "mailto:alice@example.com"],
    [
      "mailto:alice@example.com?subject=Hello",
      "mailto:alice@example.com?subject=Hello",
    ],
  ])("normalizes public email value %s to %s", (value, expected) => {
    expect(normalizePublicEmailHref(value)).toBe(expected);
  });

  it.each([
    "JaVaScRiPt:alert(1)",
    "java\rscript:alert(1)",
    "data:text/html,hello",
    "vbscript:msgbox(1)",
    "https://example.com",
    "mailto:alice@example.com?subject=Hi%0d%0aBcc:attacker@example.com",
  ])("rejects %s from mailto-only public email links", (value) => {
    expect(normalizePublicEmailHref(value)).toBeUndefined();
  });

  it("keeps narrow formatting while stripping active content and normalizing anchors", () => {
    const result = sanitizePublicRichText(
      [
        '<p onclick="alert(1)">Hello <strong>world</strong></p>',
        '<img src="x" onerror="alert(1)">',
        '<script>alert(1)</script>',
        '<a href="JaVaScRiPt:alert(1)">Unsafe</a>',
        '<a href="//example.com/path">Safe</a>',
        '<a href="mailto:alice@example.com">Email</a>',
      ].join(""),
    );
    const template = document.createElement("template");
    template.innerHTML = result;

    expect(template.content.querySelector("strong")?.textContent).toBe("world");
    expect(template.content.querySelector("img")).toBeNull();
    expect(template.content.querySelector("script")).toBeNull();
    expect(template.content.querySelector("[onclick]")).toBeNull();
    expect(template.content.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(template.content.querySelectorAll("a")[1]).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(template.content.querySelectorAll("a")[1].getAttribute("href")).toBe(
      "https://example.com/path",
    );
    expect(template.content.querySelectorAll("a")[2].getAttribute("href")).toBe(
      "mailto:alice@example.com",
    );
    expect(template.content.querySelectorAll("a")[2].hasAttribute("target")).toBe(
      false,
    );
  });

  it("preserves bounded Quill formatting without allowing arbitrary attributes or CSS", () => {
    const result = sanitizePublicRichText(
      [
        '<h1 onclick="alert(1)">Heading one</h1>',
        "<h2>Heading two</h2><h3>Heading three</h3>",
        '<p><span style="color: rgb(230, 0, 0); background-color: #ffff00; position: fixed; background-image: url(javascript:alert(1))">Inline palette</span></p>',
        '<p><span class="ql-color-red ql-bg-blue arbitrary-class" style="color: expression(alert(1))">Class palette</span></p>',
        '<ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>Ordered item</li>',
        '<li data-list="bullet"><span class="ql-ui arbitrary-class" onmouseover="alert(1)"></span>Bullet item</li>',
        '<li data-list="not-a-quill-list">Untrusted list type</li></ol>',
      ].join(""),
    );
    const template = document.createElement("template");
    template.innerHTML = result;

    expect(template.content.querySelector("h1")?.textContent).toBe("Heading one");
    expect(template.content.querySelector("h2")?.textContent).toBe("Heading two");
    expect(template.content.querySelector("h3")?.textContent).toBe("Heading three");

    const inlinePalette = template.content.querySelectorAll("span")[0] as HTMLElement;
    expect(inlinePalette.style.color).toBe("rgb(230, 0, 0)");
    expect(inlinePalette.style.backgroundColor).toBe("rgb(255, 255, 0)");
    expect(inlinePalette.style.position).toBe("");
    expect(inlinePalette.style.backgroundImage).toBe("");

    const classPalette = template.content.querySelectorAll("span")[1];
    expect(Array.from(classPalette.classList)).toEqual(["ql-color-red", "ql-bg-blue"]);
    expect(classPalette.hasAttribute("style")).toBe(false);

    const listItems = template.content.querySelectorAll("li");
    expect(listItems[0].getAttribute("data-list")).toBe("ordered");
    expect(listItems[1].getAttribute("data-list")).toBe("bullet");
    expect(listItems[2].hasAttribute("data-list")).toBe(false);
    expect(listItems[0].parentElement?.tagName).toBe("OL");
    expect(listItems[1].parentElement?.tagName).toBe("UL");
    expect(listItems[0].querySelector(".ql-ui")).not.toBeNull();
    expect(listItems[1].querySelector(".ql-ui")).not.toBeNull();
    expect(listItems[1].querySelector(".arbitrary-class")).toBeNull();

    expect(template.content.querySelector("[onclick]")).toBeNull();
    expect(template.content.querySelector("[onmouseover]")).toBeNull();
    expect(result).not.toMatch(/expression|javascript:|position|background-image/i);
  });
});
