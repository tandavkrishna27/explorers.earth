import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(
  resolve(process.cwd(), "src/features/Products/components/dashboard/AddProductPage.tsx"),
  "utf8"
);

describe("AddProductPage success navigation", () => {
  it("requests the list visibility prompt after creating a product", () => {
    // ProductListView opens the publish prompt off justAddedRecommendation. The Strapi
    // page also passed refetch: true, which nothing in Products read - the native
    // command invalidates the owner read itself.
    expect(source()).toContain("justAddedRecommendation: true");
    expect(source()).toContain("navigate(`/recommendations/products/${listId}`, { state: { justAddedRecommendation: true } })");
  });

  it("does not call the retired product scraper or the Strapi upload", () => {
    expect(source()).not.toMatch(/fetch\(\s*`?\/api\/products\/scrape-link/);
    expect(source()).not.toContain("VITE_REST_API_URL");
  });

  it("declares the amount input as decimal text", () => {
    expect(source()).toContain('inputMode="decimal"');
  });
});
