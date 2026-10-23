import { describe, expect, it } from "vitest";
import { isSafeInternalPath, readOrigin, resolveBack, withOrigin } from "../originBack";

const fallback = { to: "/recommendations/books", label: "Books" };

describe("isSafeInternalPath", () => {
  it.each([
    ["/recommendations/books/b1", true],
    ["/home", true],
    ["/recommendations/places?list=abc", true],
    ["//evil.example/x", false],
    ["/\\evil.example", false],
    ["https://evil.example", false],
    ["javascript:alert(1)", false],
    ["recommendations/books", false],
    ["", false],
    [undefined, false],
    [42, false],
  ])("%s -> %s", (value, expected) => {
    expect(isSafeInternalPath(value)).toBe(expected);
  });
});

describe("withOrigin", () => {
  it("captures pathname + search and the label", () => {
    expect(withOrigin({ pathname: "/recommendations/books/b1", search: "?tab=manage" }, "Weekend reads"))
      .toEqual({ from: { pathname: "/recommendations/books/b1", search: "?tab=manage", label: "Weekend reads" } });
  });

  it("merges into extra state without dropping it", () => {
    expect(withOrigin({ pathname: "/home", search: "" }, "Home", { justCreatedList: true }))
      .toEqual({ justCreatedList: true, from: { pathname: "/home", search: "", label: "Home" } });
  });
});

describe("readOrigin", () => {
  it("returns the origin from router state", () => {
    expect(readOrigin({ from: { pathname: "/home", search: "", label: "Home" } }))
      .toEqual({ pathname: "/home", search: "", label: "Home" });
  });

  it.each([null, undefined, "x", { from: "x" }, { from: { pathname: "//evil" } }, { from: { pathname: "/ok", label: 7 } }])(
    "ignores malformed state %#",
    (state) => {
      const origin = readOrigin(state);
      if (origin) expect(origin.label).toBeUndefined();
      else expect(origin).toBeNull();
    },
  );
});

describe("resolveBack", () => {
  it("prefers state.from (in-app navigation)", () => {
    expect(resolveBack({
      state: { from: { pathname: "/recommendations/places", search: "?list=goa", label: "Weekend in Goa" } },
      search: "",
      currentPathname: "/recommendations/people/p1/add",
      fallback,
    })).toEqual({ to: "/recommendations/places?list=goa", label: "Weekend in Goa", source: "state" });
  });

  it("uses a safe ?redirectBack= when there is no state (linked pages)", () => {
    expect(resolveBack({
      state: null,
      search: "?redirectBack=%2Frecommendations%2Fplaces%3Flist%3Dgoa",
      currentPathname: "/recommendations/people/p1/add",
      fallback,
    })).toEqual({ to: "/recommendations/places?list=goa", label: undefined, source: "redirectBack" });
  });

  it("ignores an unsafe ?redirectBack= and falls back", () => {
    expect(resolveBack({
      state: null,
      search: "?redirectBack=https%3A%2F%2Fevil.example",
      currentPathname: "/recommendations/books/b1/add",
      fallback,
    })).toEqual({ to: "/recommendations/books", label: "Books", source: "fallback" });
  });

  it("deep link (no state, no param) falls back to the category page", () => {
    expect(resolveBack({ state: undefined, search: "", currentPathname: "/recommendations/books/b1", fallback }))
      .toEqual({ to: "/recommendations/books", label: "Books", source: "fallback" });
  });

  it("never returns the current page (self-loop guard)", () => {
    expect(resolveBack({
      state: { from: { pathname: "/recommendations/books/b1", search: "", label: "Loop" } },
      search: "",
      currentPathname: "/recommendations/books/b1",
      fallback,
    })).toEqual({ to: "/recommendations/books", label: "Books", source: "fallback" });
  });
});
