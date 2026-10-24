import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Flex children default to min-width:auto, so a bare <input> keeps its intrinsic width and
// pushes the Key/Value row past the card on narrow screens.
it("lets specification Key/Value inputs shrink inside the card", () => {
  const source = readFileSync(resolve(__dirname, "../AddProductPage.tsx"), "utf8");
  const inputs = source.split("\n").filter(line => /aria-label=\{`Key fact (name|value)/.test(line));
  expect(inputs).toHaveLength(2);
  for (const line of inputs) expect(line).toContain("min-w-0 flex-1");
});
