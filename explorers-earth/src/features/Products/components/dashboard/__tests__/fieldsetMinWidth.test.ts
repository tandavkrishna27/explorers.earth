import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A <fieldset> defaults to min-width: min-content, so a flex row of inputs inside one cannot
// shrink below its natural width and overflows a phone screen. The add-item forms give every
// fieldset min-w-0.
const forms = [
  "Products/components/dashboard/AddProductPage.tsx",
  "People/components/dashboard/AddPersonPage.tsx",
  "AppsAndTools/components/dashboard/AddAppPage.tsx",
  "AppsAndTools/components/dashboard/AppEnrichmentPanel.tsx",
];

describe("add-item form fieldsets", () => {
  it.each(forms)("%s lets every fieldset shrink", (file) => {
    const source = readFileSync(resolve(__dirname, "../../../..", file), "utf8");
    const tags = source.match(/<fieldset\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toMatch(/min-w-0/);
  });
});
