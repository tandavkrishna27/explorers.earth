import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecommendationsPresentationControls from "../RecommendationsPresentationControls";
import type { RecommendationCategoryId } from "../../types/themeTypes";

const CANONICAL_ORDER: RecommendationCategoryId[] = [
  "places",
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
];

describe("RecommendationsPresentationControls", () => {
  it("offers all three layouts without adding visibility controls", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("radio", { name: "Classic Shelves" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Category Mosaic" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Featured First" }),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("emits the complete normalized order when the layout changes", () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Category Mosaic" }));

    expect(onChange).toHaveBeenLastCalledWith({
      layout: "grid",
      categoryOrder: CANONICAL_ORDER,
    });
  });

  it("moves a category, retains button focus, and announces its position", () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );
    const moveDown = screen.getByRole("button", { name: "Move Places down" });

    moveDown.focus();
    fireEvent.click(moveDown);

    expect(onChange).toHaveBeenLastCalledWith({
      layout: "shelves",
      categoryOrder: [
        "music",
        "places",
        "movies",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
    expect(moveDown).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Places moved to position 2 of 9",
    );
  });

  it("disables only the unavailable boundary moves", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Move Places up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Places down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move People up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move People down" })).toBeDisabled();
  });

  it("uses the First view promotion in the illustrative preview", () => {
    render(
      <RecommendationsPresentationControls
        value={{ layout: "featured", categoryOrder: CANONICAL_ORDER }}
        landingTab="music"
        onChange={vi.fn()}
      />,
    );

    const preview = screen.getByRole("region", {
      name: "Recommendations layout preview",
    });
    expect(preview).toHaveAttribute("data-layout", "featured");
    expect(preview).toHaveTextContent("Illustrative preview");
    expect(
      within(preview)
        .getAllByTestId("recommendations-preview-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
      "music",
      "places",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
  });
});
