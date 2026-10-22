import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The add-place form's location button showed the raw key
// "dashboard.profile.account.fields.detectLocation", which no locale defines. Every key the
// address input translates must resolve in every locale.
const root = join(__dirname, "..", "..");
const source = readFileSync(join(root, "features/Profile/components/AddressInput.tsx"), "utf8");
const keys = [...source.matchAll(/\bt\(\s*["']([\w.]+)["']/g)].map(match => match[1]);
const resources = join(root, "i18n/resources");
const lookup = (tree: unknown, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe("AddressInput translation keys", () => {
  it("translates at least one key", () => expect(keys.length).toBeGreaterThan(0));
  it.each(readdirSync(resources).filter(file => file.endsWith(".json")))("are all defined in %s", file => {
    const tree = JSON.parse(readFileSync(join(resources, file), "utf8"));
    expect(keys.filter(key => typeof lookup(tree, key) !== "string")).toEqual([]);
  });
});
