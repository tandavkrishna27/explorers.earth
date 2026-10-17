import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PublicPlaceCard from "../PublicPlaceCard";
import { IMAGE_CONFIG } from "../../../../config";

// PublicPlaceCard does not itself use react-i18next, but mock defensively in
// case shared imports pull it in.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const base = {
  title: "Lalbagh",
  image: "",
  onAction: () => {},
};

const renderCard = (props: Record<string, unknown>) =>
  render(
    <MemoryRouter>
      <PublicPlaceCard {...base} {...props} />
    </MemoryRouter>
  );

describe("PublicPlaceCard rating", () => {
  it("does not crash and hides rating when rating is an empty string", () => {
    expect(() => renderCard({ rating: "" as unknown as number })).not.toThrow();
    expect(screen.queryByText(/★/)).toBeNull();
  });

  it("renders a numeric string rating without throwing", () => {
    expect(() =>
      renderCard({ rating: "8.8" as unknown as number })
    ).not.toThrow();
    expect(screen.getByText(/8\.8/)).toBeTruthy();
  });

  it("renders a numeric rating", () => {
    renderCard({ rating: 8.8 });
    expect(screen.getByText(/8\.8/)).toBeTruthy();
  });

  it("renders a zero rating as 0.0", () => {
    renderCard({ rating: 0 });
    expect(screen.getByText(/0\.0/)).toBeTruthy();
  });

  it("hides rating when undefined", () => {
    renderCard({ rating: undefined });
    expect(screen.queryByText(/★/)).toBeNull();
  });
});

describe("PublicPlaceCard semantics", () => {
  it("renders navigation cards as real links", () => {
    renderCard({ href: "/alice/places/list-1", onAction: undefined });

    expect(screen.getByRole("link", { name: "Lalbagh" })).toHaveAttribute(
      "href",
      "/alice/places/list-1",
    );
  });

  it("renders modal cards as native buttons and invokes the action", () => {
    const onAction = vi.fn();
    renderCard({ onAction });

    fireEvent.click(screen.getByRole("button", { name: "Lalbagh" }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses one fallback for missing and broken images without changing dimensions", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PublicPlaceCard title="Missing" image={null} href="/missing" />
      </MemoryRouter>,
    );
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      IMAGE_CONFIG.defaultImages.place,
    );

    rerender(
      <MemoryRouter>
        <PublicPlaceCard title="Broken" image="/broken.jpg" href="/broken" />
      </MemoryRouter>,
    );
    const image = document.querySelector("img") as HTMLImageElement;
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", IMAGE_CONFIG.defaultImages.place);
    expect(image).toHaveClass("absolute", "inset-0", "h-full", "w-full");
  });

  it("caps decorative collage images at four and lazy-loads them", () => {
    renderCard({
      image: null,
      previewImages: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"],
    });

    const images = Array.from(document.querySelectorAll("img"));
    expect(images).toHaveLength(4);
    expect(images.every((image) => image.getAttribute("loading") === "lazy")).toBe(
      true,
    );
  });
});
