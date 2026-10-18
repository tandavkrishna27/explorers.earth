import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// P2 Task 5: deploy/assemble-release.sh turns a platform vite build into the
// release layout deploy/nginx/explorers.conf serves. A synthetic dist stands in
// for the build; the renderer and its contract are the real ones.
const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const script = resolve(repositoryRoot, "deploy/assemble-release.sh");

const PUBLIC = {
  version: 1, environment: "production", origin: "https://explorers.example",
  apiPath: "/api", socketPath: "/socket.io", mapsBrowserKey: "SyntheticBrowserKey_0000",
};

let work: string;
let dist: string;

function assemble(config: unknown, release = join(work, "releases", "abc123")) {
  const input = join(work, `public-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(input, JSON.stringify(config));
  execFileSync("sh", [script, input, dist, release], { stdio: "pipe" });
  return release;
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "release-assembly-"));
  dist = join(work, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  // What vite leaves behind: its own shell, and public/'s robots.txt and sitemap.xml.
  writeFileSync(join(dist, "index.html"), "<html><head><title>vite</title></head><body></body></html>");
  writeFileSync(join(dist, "robots.txt"), "from public/\n");
  writeFileSync(join(dist, "sitemap.xml"), "from public/\n");
  writeFileSync(join(dist, "assets", "app-abc.js"), "console.log(1)");
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("release assembly", () => {
  it("merges the rendered runtime files into dist and keeps headers.conf outside it", () => {
    // Break caught: rendering straight into dist fails on the wx flag after writing
    // only runtime-config.json, leaving no headers.conf and an nginx that will not start.
    const release = assemble(PUBLIC);
    expect(JSON.parse(readFileSync(join(release, "dist", "runtime-config.json"), "utf8"))).toEqual(PUBLIC);
    const shell = readFileSync(join(release, "dist", "index.html"), "utf8");
    expect(shell).toContain('<link rel="canonical" href="https://explorers.example/" />');
    expect(readFileSync(join(release, "dist", "robots.txt"), "utf8")).toContain("Sitemap: https://explorers.example/sitemap.xml");
    expect(readFileSync(join(release, "dist", "sitemap.xml"), "utf8")).toContain("<loc>https://explorers.example/</loc>");
    expect(readFileSync(join(release, "dist", "assets", "app-abc.js"), "utf8")).toBe("console.log(1)");
    expect(existsSync(join(release, "dist", "headers.conf"))).toBe(false);
    const headers = readFileSync(join(release, "runtime", "headers.conf"), "utf8");
    expect(headers).toContain("Content-Security-Policy");
    expect(headers).toContain("https://maps.googleapis.com");
  });

  it("leaves the maps origins out of the CSP when no browser key is configured", () => {
    const { mapsBrowserKey: _omitted, ...withoutKey } = PUBLIC;
    const release = assemble(withoutKey);
    expect(readFileSync(join(release, "runtime", "headers.conf"), "utf8")).not.toContain("maps.googleapis.com");
  });

  it("refuses a config the SPA would reject, and writes no release", () => {
    const release = join(work, "releases", "bad");
    expect(() => assemble({ ...PUBLIC, origin: "http://explorers.example" }, release)).toThrow();
    expect(existsSync(release)).toBe(false);
  });

  it("never overwrites an existing release", () => {
    const release = assemble(PUBLIC);
    expect(() => assemble(PUBLIC, release)).toThrow();
  });
});
