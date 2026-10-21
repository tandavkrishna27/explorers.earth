import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Static contract for the host nginx site (P2 Task 4). `nginx -t` proves syntax
// (deploy/nginx/validate-offline.sh); these prove the properties nginx accepts
// silently: a dropped CSP, a container upstream, an SPA-shell health check.
const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const raw = readFileSync(resolve(repositoryRoot, "deploy/nginx/explorers.conf"), "utf8");

const HEADERS_INCLUDE = "include /srv/explorers/current/runtime/headers.conf;";
const API_UPSTREAM = "http://127.0.0.1:5000";
const PUBLIC_UPSTREAMS = ["https://id.twitch.tv/", "https://api.igdb.com/"];
const PARAMETERS = ["@EXPLORERS_SERVER_NAME@", "@EXPLORERS_TLS_CERTIFICATE@", "@EXPLORERS_TLS_CERTIFICATE_KEY@"];

type Block = { header: string; body: string; directives: string[]; children: Block[] };

function stripComments(source: string): string {
  return source.split(/\r?\n/).map((line) => line.replace(/(^|\s)#.*$/, "")).join("\n");
}

// Enough of nginx's grammar for this file: `name args { ... }` blocks and `name args;`.
function parse(source: string): Block {
  let index = 0;
  const readBlock = (header: string): Block => {
    const block: Block = { header, body: "", directives: [], children: [] };
    let token = "";
    const start = index;
    while (index < source.length) {
      const char = source[index++];
      if (char === "{") {
        block.children.push(readBlock(token.trim()));
        token = "";
      } else if (char === "}") {
        block.body = source.slice(start, index - 1);
        return block;
      } else if (char === ";") {
        block.directives.push(token.trim().replace(/\s+/g, " "));
        token = "";
      } else {
        token += char;
      }
    }
    block.body = source.slice(start);
    return block;
  };
  return readBlock("root");
}

const config = parse(stripComments(raw));
const servers = config.children.filter((block) => block.header === "server");
const canonical = (server: Block) => server.directives.includes("server_name @EXPLORERS_SERVER_NAME@");
const www = (server: Block) => server.directives.includes("server_name www.@EXPLORERS_SERVER_NAME@");
const tls = servers.find((server) => canonical(server) && server.directives.some((d) => d.startsWith("listen 443")));
const locations = tls?.children.filter((block) => block.header.startsWith("location ")) ?? [];
const location = (match: string) => locations.find((block) => block.header === `location ${match}`);

describe("production nginx site", () => {
  it("has a TLS server and a port-80 server that only redirects", () => {
    expect(tls).toBeDefined();
    const plain = servers.find((server) => canonical(server) && server.directives.includes("listen 80"));
    expect(plain?.children).toEqual([]);
    expect(plain?.directives).toContain("return 301 https://@EXPLORERS_SERVER_NAME@$request_uri");
  });

  it("redirects www to the canonical host on ports 80 and 443 and serves nothing else there", () => {
    // Break caught: the deploy replaces the live site file, so a template with no
    // www server leaves www.<name> unserved after cutover.
    const target = "return 301 https://@EXPLORERS_SERVER_NAME@$request_uri";
    const wwwServers = servers.filter(www);
    expect(wwwServers).toHaveLength(2);
    const plain = wwwServers.find((server) => server.directives.includes("listen 80"));
    const secure = wwwServers.find((server) => server.directives.includes("listen 443 ssl http2"));
    expect(plain?.children).toEqual([]);
    expect(plain?.directives).toContain(target);
    expect(secure?.children).toEqual([]);
    expect(secure?.directives).toEqual(expect.arrayContaining([
      target, "ssl_certificate @EXPLORERS_TLS_CERTIFICATE@", "ssl_certificate_key @EXPLORERS_TLS_CERTIFICATE_KEY@",
      "ssl_protocols TLSv1.2 TLSv1.3",
    ]));
  });

  it("serves the release through the current symlink, with headers.conf outside the served root", () => {
    expect(tls!.directives).toContain("root /srv/explorers/current/dist");
    expect(HEADERS_INCLUDE.includes("/current/dist/")).toBe(false);
    expect(tls!.directives).toContain(HEADERS_INCLUDE.slice(0, -1));
    expect(location("= /headers.conf")?.directives).toEqual(["return 404"]);
  });

  it("repeats the headers include in every location that declares its own add_header", () => {
    // Break caught: add_header replaces rather than merges, so a location with its
    // own Cache-Control and no include ships every .js and .css without a CSP.
    const withHeaders = locations.filter((block) => block.directives.some((d) => d.startsWith("add_header ")));
    expect(withHeaders.map((block) => block.header)).toEqual(expect.arrayContaining([
      "location = /index.html", "location = /runtime-config.json", "location /assets/",
    ]));
    for (const block of withHeaders) {
      expect(block.directives, block.header).toContain(HEADERS_INCLUDE.slice(0, -1));
    }
  });

  it("never caches the shell or the runtime config", () => {
    for (const path of ["= /index.html", "= /runtime-config.json"]) {
      expect(location(path)?.directives, path).toContain('add_header Cache-Control "no-store" always');
    }
  });

  it("proxies the API surface, health, robots and sitemap to the loopback API", () => {
    // Break caught: /health/ready falling to `location /` answers 200 with index.html.
    for (const path of [
      "^~ /api", "= /graphql", "^~ /socket.io", "= /health/live", "= /health/ready", "= /robots.txt", "= /sitemap.xml",
      "^~ /api/apps/scrape-url", "^~ /api/products/scrape-link", "^~ /api/people/scrape-profile", "^~ /api/proxy-image",
    ]) {
      expect(location(path)?.directives, path).toContain(`proxy_pass ${API_UPSTREAM}`);
    }
  });

  it("names no upstream nginx cannot resolve at startup", () => {
    // Break caught: `tunes-app:5000` stops nginx starting, SPA included.
    const targets = [...raw.matchAll(/^\s*proxy_pass\s+([^;]+);/gm)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect([API_UPSTREAM, ...PUBLIC_UPSTREAMS], target).toContain(target);
    expect(raw).not.toMatch(/api\.localqr\.earth/);
  });

  it("uses no regex locations, so no API path can fall through to an asset rule", () => {
    for (const block of locations) expect(block.header, block.header).not.toMatch(/^location\s+~/);
  });

  it("accepts media uploads the API accepts", () => {
    expect(tls!.directives).toContain("client_max_body_size 20m");
  });

  it("forwards the client address the API's trust-proxy setting reads", () => {
    expect(tls!.directives).toEqual(expect.arrayContaining([
      "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for", "proxy_set_header X-Forwarded-Proto $scheme",
    ]));
  });

  it("uses only the documented host parameters, and documents each one", () => {
    const used = new Set(stripComments(raw).match(/@[A-Z_]+@/g));
    expect([...used].sort()).toEqual([...PARAMETERS].sort());
    const header = raw.slice(0, raw.indexOf("server {"));
    for (const parameter of PARAMETERS) expect(header).toContain(parameter);
  });
});
