import { describe, expect, it } from "vitest";
import { starsFromValue, valueFromStars, stepValue } from "../starRatingScale";

describe("starRatingScale", () => {
  it.each([
    [null, 0], [1, 0.5], [2, 1], [5, 2.5], [9, 4.5], [10, 5],
  ])("value %s shows %s stars", (value, stars) => {
    expect(starsFromValue(value)).toBe(stars);
  });

  it.each([
    [0, null], [0.5, 1], [1, 2], [3.5, 7], [5, 10],
  ])("%s stars stores %s", (stars, value) => {
    expect(valueFromStars(stars)).toBe(value);
  });

  it("round-trips every stored value 1-10", () => {
    for (let v = 1; v <= 10; v++) expect(valueFromStars(starsFromValue(v))).toBe(v);
  });

  it("steps by one half star and clamps", () => {
    expect(stepValue(null, 1)).toBe(1);
    expect(stepValue(10, 1)).toBe(10);
    expect(stepValue(1, -1)).toBe(null);
    expect(stepValue(6, -1)).toBe(5);
  });

  it("rejects out-of-range input", () => {
    expect(() => starsFromValue(11)).toThrow(RangeError);
    expect(() => valueFromStars(0.25)).toThrow(RangeError);
  });
});
