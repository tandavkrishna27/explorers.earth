import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../i18n";
import QrCardTagline from "../QrCardTagline";

const NON_PLACES_LIST_VIEWS = [
  "features/Movies/components/dashboard/MovieListView.tsx",
  "features/Books/components/dashboard/BookListView.tsx",
  "features/Games/components/dashboard/GameListView.tsx",
  "features/AppsAndTools/components/dashboard/AppListView.tsx",
  "features/Products/components/dashboard/ProductListView.tsx",
];

describe("QR card tagline", () => {
  it("renders the neutral scan line", () => {
    render(<QrCardTagline className="pill" />);
    expect(screen.getByText("Scan for picks")).toHaveClass("pill");
  });

  it.each(NON_PLACES_LIST_VIEWS)("%s does not say Travel like a local", (file) => {
    const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toContain("Travel like a local");
    expect(source).toContain("<QrCardTagline");
  });
});
