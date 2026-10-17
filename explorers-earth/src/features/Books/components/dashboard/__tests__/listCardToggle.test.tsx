import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookListCard } from "../BooksHome";
import { GameListCard } from "../../../../Games/components/dashboard/GamesHome";
import { MovieListCard } from "../../../../Movies/components/dashboard/MoviesHome";

const makeList = (visKey: "visibility" | "Visibility", itemsKey: string) =>
  ({
    documentId: "list-1",
    List_Name: "Test List",
    slug: "test-list",
    [visKey]: false,
    display_order: 0,
    top_reads_heading: null,
    top_picks_heading: null,
    [itemsKey]: [
      { documentId: "i1", is_pinned: false, title: "Item 1", volume_id: "v1" },
    ],
  }) as any;

const cases = [
  { name: "BookListCard", Card: BookListCard, list: makeList("visibility", "recommended_books") },
  { name: "GameListCard", Card: GameListCard, list: makeList("Visibility", "recommended_games") },
  { name: "MovieListCard", Card: MovieListCard, list: makeList("Visibility", "recommended_movies") },
];

describe.each(cases)("$name publish toggle", ({ Card, list }) => {
  it("toggles WITHOUT triggering card navigation (stopPropagation)", async () => {
    const onOpen = vi.fn();
    const onToggleVisibility = vi.fn();
    render(
      <Card
        list={list}
        onOpen={onOpen}
        onToggleVisibility={onToggleVisibility}
        togglingId={null}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: /toggle/i }));
    expect(onToggleVisibility).toHaveBeenCalledWith("list-1", false);
    expect(onOpen).not.toHaveBeenCalled(); // navigation must NOT fire
  });
});
