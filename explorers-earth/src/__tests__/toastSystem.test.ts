import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : files(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("toast system", () => {
  it("the legacy toast modules are gone", () => {
    expect(existsSync(join(src, "features/LandingPage/hooks/use-toast.ts"))).toBe(false);
    expect(existsSync(join(src, "hooks/useToast.ts"))).toBe(false);
    expect(existsSync(join(src, "features/LandingPage/components/ui/toast.tsx"))).toBe(false);
  });

  it("no source file imports a toast module other than sonner", () => {
    const offenders = files(src)
      .filter(f => !f.endsWith("toastSystem.test.ts"))
      .filter(f => /from\s+["'][^"']*(use-toast|hooks\/useToast|ui\/toast|@radix-ui\/react-toast)["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the single Toaster sits bottom-centre", () => {
    expect(readFileSync(join(src, "main.tsx"), "utf8")).toMatch(/<Toaster[^>]*position="bottom-center"/);
  });
});
