import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../../..");
describe("Places-only link surface is retired (WP10, OWN-13)", () => {
  it("has no linked add pages and no add-people/add-products routes", () => {
    expect(existsSync(resolve(root, "src/features/Favorites/components/AddLinkedPeoplePage.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/features/Favorites/components/AddLinkedProductsPage.tsx"))).toBe(false);
    const routes = readFileSync(resolve(root, "src/routes/ProtectedRoutes.tsx"), "utf8");
    expect(routes).not.toMatch(/add-people|add-products|AddLinked/);
  });
  it("has no client path to the location route", () => {
    expect(readFileSync(resolve(root, "src/lib/explorersApiClient.ts"), "utf8")).not.toMatch(/\/location'|setMyCollectionLocation|explorersPlaceLinkContract|parentLocation/);
    expect(readFileSync(resolve(root, "src/features/Favorites/api/placesClient.ts"), "utf8")).not.toMatch(/setLocationLink/);
  });
});
