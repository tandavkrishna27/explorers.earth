import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getCompleteMyCategoryContent: vi.fn(), setMyCategoryTopPicks: vi.fn() }));
const writes = vi.hoisted(() => ({ setListPin: vi.fn().mockResolvedValue(undefined) }));
const reorder = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: api }));
vi.mock("../../category/listWrites", () => writes);
vi.mock("../../../../lib/reorderCategoryLists", () => ({ reorderCategoryLists: reorder }));
import { saveItemPins, saveListPins } from "../topPicksWrites";

const observed = {
  topPicks: [{ recommendationId: "r1", collectionId: "c2" }],
  memberships: [
    { recommendationId: "r1", collectionId: "c1", collectionArchived: false, recommendationArchived: false },
    { recommendationId: "r1", collectionId: "c2", collectionArchived: false, recommendationArchived: false },
    { recommendationId: "r2", collectionId: "c1", collectionArchived: false, recommendationArchived: false },
    { recommendationId: "r3", collectionId: "c9", collectionArchived: true, recommendationArchived: false },
  ],
};
beforeEach(() => { vi.clearAllMocks(); api.getCompleteMyCategoryContent.mockResolvedValue(observed); });

describe("saveItemPins", () => {
  it("writes the exact ordered pin set, keeping each pin's saved collection", async () => {
    await saveItemPins("movies", ["r2", "r1"]);
    expect(api.getCompleteMyCategoryContent).toHaveBeenCalledWith({ category: "movies", status: "active" }, undefined, true);
    expect(api.setMyCategoryTopPicks).toHaveBeenCalledWith(observed, [
      { recommendationId: "r2", collectionId: "c1" }, { recommendationId: "r1", collectionId: "c2" },
    ], expect.any(String));
  });
  it("refuses an item with no live membership", async () => {
    await expect(saveItemPins("movies", ["r3"])).rejects.toThrow(/changed/);
    expect(api.setMyCategoryTopPicks).not.toHaveBeenCalled();
  });
});

describe("saveListPins", () => {
  it("unpins removed lists, pins added ones after the kept ones, then writes the pinned order", async () => {
    await saveListPins("places", ["a", "b"], ["b", "c"]);
    expect(writes.setListPin.mock.calls).toEqual([["a", null], ["c", 1]]);
    expect(reorder).toHaveBeenCalledWith("places", "pinned", ["b", "c"]);
  });
  it("skips the order write when nothing stays pinned", async () => {
    await saveListPins("guides", ["a"], []);
    expect(writes.setListPin.mock.calls).toEqual([["a", null]]);
    expect(reorder).not.toHaveBeenCalled();
  });
});
