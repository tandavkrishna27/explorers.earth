import { describe, expect, it } from "vitest";
import { mergePublicPage, readPublicPageRows } from "../publicProfilePagination";
import type { PublicCategory } from "../publicProfileGatewayClient";

const fields: [PublicCategory, string, string][] = [
  ["places", "recommendationLists", "recommended_places"],
  ["movies", "movieLists", "recommended_movies"],
  ["books", "bookLists", "recommended_books"],
  ["games", "gameLists", "recommended_games"],
  ["guides", "guides", "guide_sections"],
  ["apps", "appLists", "recommended_apps"],
  ["products", "productLists", "recommended_products"],
  ["people", "personLists", "recommended_people"],
];

describe("public page collections", () => {
  it.each([0, 13, 25, 100, NaN])("rejects unsupported page size %s even for valid rows", (pageSize) => {
    const page = { appLists: [{ documentId: "app" }] };
    expect(() => readPublicPageRows(page, "apps", false, pageSize as 12)).toThrow("PUBLIC_PROFILE_INVALID_RESPONSE");
    expect(() => mergePublicPage(page, page, "apps", false, pageSize as 12)).toThrow("PUBLIC_PROFILE_INVALID_RESPONSE");
  });
  it.each(fields)("reads and merges %s roots and detail children", (category, root, child) => {
    const first = { documentId: "first" };
    const second = { documentId: "second" };
    const rootPage = { [root]: [first, first] };
    expect(readPublicPageRows(rootPage, category, false)).toEqual([first, first]);
    expect(mergePublicPage(rootPage, { [root]: [first, second] }, category, false)[root]).toEqual([first, second]);
    const detail = { [root]: [{ documentId: "parent", title: "original", [child]: [first, first] }] };
    expect(readPublicPageRows(detail, category, true)).toEqual([first, first]);
    expect(mergePublicPage(detail, { [root]: [{ documentId: "parent", title: "changed", [child]: [first, second] }] }, category, true)).toEqual({
      [root]: [{ documentId: "parent", title: "original", [child]: [first, second] }],
    });
  });

  it.each([{}, { appLists: null }, { appLists: [{}] }, { appLists: [{ documentId: "" }] }])("rejects malformed category pages: %j", (page) => {
    expect(() => readPublicPageRows(page as never, "apps", false)).toThrow("PUBLIC_PROFILE_INVALID_RESPONSE");
  });

  it.each([
    {}, { appLists: [{}] }, { appLists: [{ documentId: "parent" }] },
    { appLists: [{ documentId: "parent", recommended_apps: [{}] }] },
    { appLists: [{ documentId: "parent", recommended_apps: [] }, { documentId: "other", recommended_apps: [] }] },
  ])("rejects malformed detail pages: %j", (page) => {
    expect(() => readPublicPageRows(page as never, "apps", true)).toThrow("PUBLIC_PROFILE_INVALID_RESPONSE");
  });

  it("treats a valid empty detail root as unavailable", () => {
    expect(() => readPublicPageRows({ appLists: [] }, "apps", true)).toThrow("PUBLIC_PROFILE_404");
  });

  it("preserves partial collection content and raw null slots for cursor accounting", () => {
    const partial = { appLists: [null, { documentId: "valid" }] };
    expect(readPublicPageRows(partial, "apps", false)).toEqual([null, { documentId: "valid" }]);
    expect(mergePublicPage(partial, partial, "apps", false)).toEqual({ appLists: [{ documentId: "valid" }] });
    const detail = { appLists: [{ documentId: "parent", recommended_apps: [null, { documentId: "child" }] }] };
    expect(readPublicPageRows(detail, "apps", true)).toHaveLength(2);
    expect(mergePublicPage(detail, detail, "apps", true)).toEqual({ appLists: [{ documentId: "parent", recommended_apps: [{ documentId: "child" }] }] });
  });

  it("rejects a changed detail parent instead of appending unrelated children", () => {
    expect(() => mergePublicPage(
      { appLists: [{ documentId: "original", recommended_apps: [] }] },
      { appLists: [{ documentId: "other", recommended_apps: [{ documentId: "wrong" }] }] },
      "apps", true,
    )).toThrow("PUBLIC_PROFILE_INVALID_RESPONSE");
  });
});
