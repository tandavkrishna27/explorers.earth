import { describe, expect, it } from "vitest";
import { SLUG_MAX, slugify, slugProblem } from "../slugRules";

// Mirrors contentSlug in tunes/shared/explorersContract.ts: max 200, /^[a-z0-9]+(-[a-z0-9]+)*$/.
describe("slugRules", () => {
  it("uses the contract max length", () => expect(SLUG_MAX).toBe(200));
  it.each([["Comfort Movies!", "comfort-movies"], ["  Café   crawl ", "cafe-crawl"], ["a--b", "a-b"], ["Мумбаи", ""]])("slugify %s", (a, b) => expect(slugify(a)).toBe(b));
  it("slugify caps at the contract max", () => expect(slugify("y".repeat(250))).toHaveLength(200));
  it.each([
    ["", "Enter a URL name"],
    ["ab", null],
    ["x".repeat(200), null],
    ["has space", "Use lowercase letters, numbers and dashes"],
    ["-start", "Use lowercase letters, numbers and dashes"],
    ["end-", "Use lowercase letters, numbers and dashes"],
    ["a--b", "Use lowercase letters, numbers and dashes"],
    ["Upper", "Use lowercase letters, numbers and dashes"],
    ["x".repeat(201), "Keep it to 200 characters or fewer"],
  ])("problem %s", (s, p) => expect(slugProblem(s)).toBe(p));
});
