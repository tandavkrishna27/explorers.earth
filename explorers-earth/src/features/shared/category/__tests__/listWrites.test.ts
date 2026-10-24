import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createMyCollection: vi.fn(), getMyEditableCollection: vi.fn(), updateMyCollection: vi.fn(),
}));
const reorder = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: api }));
vi.mock("../../../../lib/reorderCategoryLists", () => ({ reorderCategoryLists: reorder }));

import { createList, orderLists, setListPin, setListStatus } from "../listWrites";

beforeEach(() => { vi.clearAllMocks(); api.getMyEditableCollection.mockResolvedValue({ id: "c1", revision: 3 }); });

describe("listWrites", () => {
  it("creates a private draft list with an idempotency key", async () => {
    api.createMyCollection.mockResolvedValue({ id: "new" });
    await createList({ category: "movies", title: "Comfort", slug: "comfort", description: null });
    expect(api.createMyCollection).toHaveBeenCalledWith(
      { category: "movies", title: "Comfort", slug: "comfort", description: null, visibility: "private", publicationState: "draft" },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
  it("passes placeLocation and coverMediaId only when given", async () => {
    api.createMyCollection.mockResolvedValue({ id: "p" });
    const placeLocation = { locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null };
    await createList({ category: "places", title: "Goa food", slug: "goa-food", description: null, placeLocation, coverMediaId: "m1" });
    expect(api.createMyCollection.mock.calls[0][0]).toMatchObject({ placeLocation, coverMediaId: "m1" });
  });
  it("publishes and unpublishes against a fresh observation", async () => {
    await setListStatus("c1", "public");
    expect(api.updateMyCollection).toHaveBeenLastCalledWith({ id: "c1", revision: 3 }, { visibility: "public", publicationState: "published" }, expect.any(String));
    await setListStatus("c1", "draft");
    expect(api.updateMyCollection).toHaveBeenLastCalledWith({ id: "c1", revision: 3 }, { visibility: "private", publicationState: "draft" }, expect.any(String));
  });
  it("sets and clears a list pin", async () => {
    await setListPin("c1", 2);
    expect(api.updateMyCollection).toHaveBeenLastCalledWith({ id: "c1", revision: 3 }, { pinOrder: 2 }, expect.any(String));
    await setListPin("c1", null);
    expect(api.updateMyCollection).toHaveBeenLastCalledWith({ id: "c1", revision: 3 }, { pinOrder: null }, expect.any(String));
  });
  it("orders lists through the display scope", async () => {
    await orderLists("games", ["a", "b"]);
    expect(reorder).toHaveBeenCalledWith("games", "display", ["a", "b"]);
  });
});
