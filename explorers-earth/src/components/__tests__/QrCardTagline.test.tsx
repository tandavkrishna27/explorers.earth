import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import QrCardTagline from "../QrCardTagline";

const NON_PLACES_LIST_VIEWS = [
  "features/Movies/components/dashboard/MovieListView.tsx",
  "features/Books/components/dashboard/BookListView.tsx",
  "features/Games/components/dashboard/GameListView.tsx",
  "features/AppsAndTools/components/dashboard/AppListView.tsx",
  "features/Products/components/dashboard/ProductListView.tsx",
  "features/People/components/dashboard/PersonListView.tsx",
];

const CATEGORIES = ["apps", "products", "people", "movies", "books", "games", "places"] as const;

describe("QR card tagline", () => {
  it("renders the category's own line", () => {
    render(<QrCardTagline category="people" className="pill" />);
    expect(screen.getByText("Connect with creators")).toHaveClass("pill");
  });

  it("has a distinct line per category", () => {
    const texts = CATEGORIES.map((c) => String(i18n.t(`qrCard.tagline.${c}`, { lng: "en" })));
    expect(new Set(texts).size).toBe(CATEGORIES.length);
  });

  it("translates the line", async () => {
    await i18n.changeLanguage("es");
    try {
      const { container } = render(<QrCardTagline category="apps" className="pill" />);
      expect(container.textContent).toBe("Descubre mis aplicaciones favoritas");
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it.each(NON_PLACES_LIST_VIEWS)("%s does not say Travel like a local", (file) => {
    const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toContain("Travel like a local");
    expect(source).toContain("<QrCardTagline");
    expect(source).not.toContain("Connect with creators");
  });
});
