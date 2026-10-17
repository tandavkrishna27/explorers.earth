import { describe, expect, it } from "vitest";
import { createReplatformViteConfig } from "../../../../vite.replatform.config";
import { isAllowedLocalFixtureUrl } from "../../../../e2e/setup/deny-hosted-egress";
import { resolveConfig } from "vite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

describe("replatform local Vite", () => {
  it("routes every API proxy to a loopback fixture", () => {
    const config = createReplatformViteConfig();
    const proxy = config.server?.proxy ?? {};
    expect(Object.keys(proxy)).toEqual(expect.arrayContaining(["/__localtunes", "/api", "/graphql"]));
    for (const entry of Object.values(proxy)) {
      const target = typeof entry === "string" ? entry : entry.target;
      expect(new URL(target).hostname).toBe("127.0.0.1");
    }
    expect((proxy["/__localtunes"] as { target: string }).target).toBe("http://127.0.0.1:51474");
    expect((proxy["/graphql"] as { target: string }).target).toBe("http://127.0.0.1:51474");
  });
  it("allows the platform gateway and Vite origins while denying hosted destinations", () => {
    expect(isAllowedLocalFixtureUrl(new URL("http://127.0.0.1:51474/api/music"))).toBe(true);
    expect(isAllowedLocalFixtureUrl(new URL("http://127.0.0.1:5175/"))).toBe(true);
    expect(isAllowedLocalFixtureUrl(new URL("http://localhost:55173/"))).toBe(true);
    expect(isAllowedLocalFixtureUrl(new URL("https://example.com/api/music"))).toBe(false);
    expect(isAllowedLocalFixtureUrl(new URL("http://127.0.0.1.example.com/"))).toBe(false);
  });
  it("ignores synthetic developer dotenv credentials in its dedicated config", async () => {
    const root = mkdtempSync(join(tmpdir(), "replatform-vite-env-"));
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error("temporary Vite root escaped OS temp");
    const previousIgdb = process.env.VITE_IGDB_CLIENT_SECRET;
    const previousPayment = process.env.VITE_PAYMENT_API_URL;
    try {
      delete process.env.VITE_IGDB_CLIENT_SECRET;
      delete process.env.VITE_PAYMENT_API_URL;
      writeFileSync(join(root, ".env.local"), "VITE_IGDB_CLIENT_SECRET=SYNTHETIC_SENTINEL\nVITE_PAYMENT_API_URL=https://hosted.example\n");
      const config = await resolveConfig({ ...createReplatformViteConfig(), root }, "serve", "development");
      expect(config.env.VITE_IGDB_CLIENT_SECRET).toBeUndefined();
      expect(config.env.VITE_PAYMENT_API_URL).toBeUndefined();
    } finally {
      if (previousIgdb === undefined) delete process.env.VITE_IGDB_CLIENT_SECRET;
      else process.env.VITE_IGDB_CLIENT_SECRET = previousIgdb;
      if (previousPayment === undefined) delete process.env.VITE_PAYMENT_API_URL;
      else process.env.VITE_PAYMENT_API_URL = previousPayment;
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("applies the same hosted-fetch CSP at the static gateway", () => {
    const nginx = readFileSync(resolve(import.meta.dirname, "../../../../nginx.replatform.conf"), "utf8");
    const policy = nginx.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
    expect(policy).toBe(createReplatformViteConfig().server?.headers?.["Content-Security-Policy"]);
    expect(policy).toContain("connect-src 'self' http://127.0.0.1:*");
    expect(policy).not.toContain("https://");
  });
});
