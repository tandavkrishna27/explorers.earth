import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { friendlyErrorMessage, isSafeContentUrl, urlFieldError } from "../friendlyError";

const raw = JSON.stringify([{ code: "custom", message: "Invalid URL", path: ["details", "appUrl"] }], null, 2);

describe("url rule", () => {
  it.each([
    ["https://example.com/app", true],
    ["http://example.com", true],
    ["ftp://example.com", false],
    ["https://example.com:8443/x", false],
    ["https://user:pass@example.com", false],
    ["not a url", false],
  ])("%s -> %s", (value, ok) => expect(isSafeContentUrl(value)).toBe(ok));

  it("is silent for empty optional values and explains the rule otherwise", () => {
    expect(urlFieldError("  ")).toBeNull();
    expect(urlFieldError("https://example.com")).toBeNull();
    expect(urlFieldError("https://example.com:8443")).toMatch(/Ports.*usernames or passwords/);
  });
});

describe("friendlyErrorMessage", () => {
  it("turns a serialised zod issue array into a plain message", () => {
    const text = friendlyErrorMessage(new Error(raw), "x");
    expect(text).not.toContain("{");
    expect(text).toMatch(/http:\/\/ or https:\/\//);
  });

  it("handles a thrown ZodError and non-url fields", () => {
    const error = new ZodError([{ code: "custom", message: "Required", path: ["details", "brandName"] }]);
    expect(friendlyErrorMessage(error, "x")).toBe("Please check the brand name field.");
  });

  it("keeps ordinary messages and falls back for non-errors", () => {
    expect(friendlyErrorMessage(new Error("Reload the app"), "x")).toBe("Reload the app");
    expect(friendlyErrorMessage(null, "fallback")).toBe("fallback");
  });
});
