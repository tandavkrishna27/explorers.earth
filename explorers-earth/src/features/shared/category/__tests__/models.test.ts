import { describe, expect, it } from "vitest";
import { toItemTopPicks, toListCards } from "../models";

const lists = [
  { documentId: "l1", List_Name: "Comfort movies", Visibility: true, recommended_movies: [
    { documentId: "m1", title: "Chef", poster_path: "/a.jpg", is_pinned: true, pin_order: 2 },
    { documentId: "m2", title: "Zodiac", poster_path: null, is_pinned: false },
    { documentId: "m1", title: "Chef", poster_path: "/a.jpg", is_pinned: true, pin_order: 2 },
  ] },
  { documentId: "l2", List_Name: "Slow-burn thrillers", Visibility: false, recommended_movies: [
    { documentId: "m3", title: "Prisoners", poster_path: "/p.jpg", is_pinned: true, pin_order: 1 },
  ] },
];

describe("toListCards", () => {
  it("maps status, unique item count, pinned count and up to 4 covers", () => {
    const cards = toListCards(lists, { relation: "recommended_movies", visibility: "Visibility", cover: (item) => (item.poster_path ? `img${item.poster_path}` : null) });
    expect(cards[0]).toEqual({ id: "l1", title: "Comfort movies", status: "public", itemCount: 2, pinnedCount: 1, covers: ["img/a.jpg"] });
    expect(cards[1]).toMatchObject({ id: "l2", status: "draft", itemCount: 1, pinnedCount: 1 });
  });
  it("reads the lowercase visibility field used by Books", () => {
    const cards = toListCards([{ documentId: "b", List_Name: "Reads", visibility: true, recommended_books: [] }], { relation: "recommended_books", visibility: "visibility", cover: () => null });
    expect(cards[0].status).toBe("public");
  });
});

describe("toItemTopPicks", () => {
  it("returns pinned items once, ordered by pin_order, with the list that holds them", () => {
    const picks = toItemTopPicks(lists, { relation: "recommended_movies", title: (i) => i.title, image: (i) => i.poster_path ?? null, subtitle: () => null });
    expect(picks.map((p) => p.id)).toEqual(["m3", "m1"]);
    expect(picks[0]).toMatchObject({ listId: "l2", listTitle: "Slow-burn thrillers", pinned: true });
  });
  it("returns all unique items as candidates when pinnedOnly is false", () => {
    const all = toItemTopPicks(lists, { relation: "recommended_movies", title: (i) => i.title, image: () => null, subtitle: () => null }, false);
    expect(all.map((p) => p.id).sort()).toEqual(["m1", "m2", "m3"]);
  });
});
