import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AddAppPage success navigation", () => {
  it("requests the list visibility prompt after creating an app", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/AppsAndTools/components/dashboard/AddAppPage.tsx"),
      "utf8"
    );

    // AppListView opens the publish prompt off justAddedRecommendation. The Strapi page
    // also passed refetch: true, which nothing in Apps ever read - the native command
    // invalidates the owner read itself.
    expect(source).toContain("justAddedRecommendation: true");
    expect(source).toContain("navigate(`/recommendations/apps/${listId}`, { state: { justAddedRecommendation: true } })");
  });

  it("does not call the retired app scraper", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/AppsAndTools/components/dashboard/AddAppPage.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/fetch\(\s*`?\/api\/apps\/scrape-url/);
    expect(source).not.toContain("VITE_REST_API_URL");
  });
});
