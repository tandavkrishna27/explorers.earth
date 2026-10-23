import { describe, expect, it } from "vitest";
import { filterTerms, rootsOf, childrenOf, type TaxonomyTerm } from "../taxonomyFilter";

const terms: TaxonomyTerm[] = [
  { id: "r1", parentId: null, position: 1, label: "Food & Drink" },
  { id: "r2", parentId: null, position: 0, label: "Nature" },
  { id: "c1", parentId: "r1", position: 0, label: "Café" },
  { id: "c2", parentId: "r1", position: 1, label: "Street food" },
  { id: "c3", parentId: "r2", position: 0, label: "Beach" },
];

describe("taxonomyFilter", () => {
  it("roots sorted by position", () => expect(rootsOf(terms).map((t) => t.id)).toEqual(["r2", "r1"]));
  it("children of a root", () => expect(childrenOf(terms, "r1").map((t) => t.id)).toEqual(["c1", "c2"]));
  it("matches accent- and case-insensitively", () => expect(filterTerms(terms, "cafe").map((t) => t.id)).toEqual(["c1"]));
  it("matches word starts before substrings", () => expect(filterTerms(terms, "f").map((t) => t.id)).toEqual(["r1", "c2"]));
  it("empty query returns the input order", () => expect(filterTerms(terms, " ")).toHaveLength(5));
  it("filters 335 terms in under 5 ms", () => {
    const many = Array.from({ length: 335 }, (_, i) => ({ id: `t${i}`, parentId: i < 25 ? null : `t${i % 25}`, position: i, label: `Term number ${i}` }));
    const start = performance.now();
    for (let i = 0; i < 20; i++) filterTerms(many, "number 3");
    expect((performance.now() - start) / 20).toBeLessThan(5);
  });
});
