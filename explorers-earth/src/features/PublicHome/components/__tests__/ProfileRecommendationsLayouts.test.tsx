import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RecommendationCategorySlotViewModel } from "../ProfileRecommendationsLayouts";
import ProfileRecommendationsLayouts from "../ProfileRecommendationsLayouts";

const TestIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" {...props} />
);

const longTitle =
  "A deliberately long recommendation title that reaches sixty-four chars";

const categories: RecommendationCategorySlotViewModel[] = [
  {
    status: "ready",
    id: "music",
    label: "Music",
    color: "#10B981",
    icon: TestIcon,
    lists: [
      {
        id: "music-1",
        title: longTitle,
        image: "/music.jpg",
        previewImages: ["/m1.jpg", "/m2.jpg", "/m3.jpg", "/m4.jpg"],
        href: "/alice/music/music-1",
      },
    ],
    listCount: 1,
    itemCountLabel: "1 playlist",
    href: "/alice/music",
  },
  {
    status: "ready",
    id: "places",
    label: "الأماكن الموصى بها والمفضلة محليًا",
    color: "#38BDF8",
    icon: TestIcon,
    lists: Array.from({ length: 14 }, (_, index) => ({
      id: `place-${index}`,
      title: `Place ${index}`,
      image: index === 0 ? null : `/place-${index}.jpg`,
      href: `/alice/places/place-${index}`,
    })),
    listCount: 1234,
    itemCountLabel: "1,234 recommendations",
    href: "/alice/places",
  },
];

const renderLayouts = (
  layout: "shelves" | "grid" | "featured",
  slots = categories,
) =>
  render(
    <MemoryRouter>
      <ProfileRecommendationsLayouts layout={layout} slots={slots} />
    </MemoryRouter>,
  );

describe("ProfileRecommendationsLayouts", () => {
  it.each([
    ["shelves", "recommendations-shelves"],
    ["grid", "recommendations-grid"],
    ["featured", "recommendations-featured"],
  ] as const)("renders %s in the supplied order", (layout, testId) => {
    renderLayouts(layout);
    const root = screen.getByTestId(testId);
    const headings = within(root).getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Music",
      "الأماكن الموصى بها والمفضلة محليًا",
    ]);
  });

  it("uses the first category as the Featured First spotlight", () => {
    renderLayouts("featured");
    expect(screen.getByTestId("featured-category")).toHaveTextContent("Music");
  });

  it("renders every grid category as one semantic route link", () => {
    renderLayouts("grid");
    const link = screen.getByRole("link", { name: "Open Music" });

    expect(link).toHaveAttribute("href", "/alice/music");
    expect(link.querySelector("a, button")).toBeNull();
    expect(link.querySelectorAll("img")).toHaveLength(3);
  });

  it("caps Classic Shelves to twelve cards and uses real list links", () => {
    renderLayouts("shelves");
    const places = screen
      .getByTestId("recommendations-shelves")
      .querySelector('[data-category-id="places"]');
    expect(places).not.toBeNull();

    expect(within(places as HTMLElement).getAllByRole("link")).toHaveLength(13);
    expect(
      within(places as HTMLElement).getByRole("link", { name: "Place 0" }),
    ).toHaveAttribute("href", "/alice/places/place-0");
  });

  it("caps featured imagery at four and compact-row imagery at one", () => {
    renderLayouts("featured");
    expect(
      screen.getByTestId("featured-category").querySelectorAll("img"),
    ).toHaveLength(4);
    expect(
      screen
        .getByTestId("featured-compact-categories")
        .querySelectorAll("img"),
    ).toHaveLength(1);
  });

  it("keeps loading slots in order while ready categories render", () => {
    renderLayouts("grid", [
      { status: "loading", id: "music", label: "Music" },
      categories[1],
    ]);
    const roots = screen
      .getByTestId("recommendations-grid")
      .querySelectorAll("[data-category-id]");

    expect(Array.from(roots).map((root) => root.getAttribute("data-category-id")))
      .toEqual(["music", "places"]);
    expect(screen.getByLabelText("Loading Music")).toBeVisible();
    expect(screen.getByRole("link", { name: /Open الأماكن/ })).toBeVisible();
  });

  it("returns no layout wrapper for an empty slot list", () => {
    const { container } = renderLayouts("featured", []);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses native link keyboard activation without a nested click target", () => {
    renderLayouts("featured");
    const featured = screen.getByRole("link", { name: "Open Music" });
    featured.focus();
    fireEvent.keyDown(featured, { key: "Enter" });
    expect(featured).toHaveFocus();
    expect(featured.querySelector("button, a")).toBeNull();
  });
});
