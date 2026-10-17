import { createServer as createHttpServer, type Server } from "node:http";
import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createServer as createViteServer, type ViteDevServer, type UserConfig } from "vite";
import viteConfig from "../../../../vite.config";
import { createMusicDevelopmentFetch } from "../musicDevelopmentTransport";

const { fixtureEnv } = vi.hoisted(() => ({ fixtureEnv: {} as Record<string, string> }));
vi.mock("vite", async (original) => ({ ...await original<typeof import("vite")>(), loadEnv: () => fixtureEnv }));
let upstream: Server | undefined;
let proxy: ViteDevServer | undefined;
let proxyRoot: string | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(fixtureEnv)) delete fixtureEnv[key];
  await proxy?.close(); proxy = undefined;
  if (proxyRoot) { await rm(proxyRoot, { recursive: true, force: true }); proxyRoot = undefined; }
  if (upstream) { upstream.closeAllConnections(); await new Promise<void>((resolve) => upstream!.close(() => resolve())); upstream = undefined; }
});

it("fails startup when explicitly enabled local Music routing is malformed", async () => {
  Object.assign(fixtureEnv, { VITE_LOCAL_TUNES_API_URL: "invalid", MUSIC_DEV_PROXY_TARGET: "http://remote.example:5000", MUSIC_DEV_PROXY_ENABLED: "true" });
  expect(() => (viteConfig as (env: { mode: string; command: string }) => UserConfig)({ mode: "development", command: "serve" }))
    .toThrow("Local Music development proxy configuration is invalid");
});

it("retains verified HTTPS remote development proxy and disallows local overrides outside development", async () => {
  Object.assign(fixtureEnv, { VITE_LOCAL_TUNES_API_URL: "https://music.example" });
  const configure = viteConfig as (env: { mode: string; command: string }) => UserConfig;
  const remote = await configure({ mode: "development", command: "serve" });
  expect(remote.server?.proxy?.["/__localtunes"]).toMatchObject({ target: "https://music.example", secure: true, ws: true });
  Object.assign(fixtureEnv, { MUSIC_DEV_PROXY_TARGET: "http://127.0.0.1:5000", MUSIC_DEV_PROXY_ENABLED: "true" });
  const production = await configure({ mode: "production", command: "build" });
  expect(production.server?.proxy?.["/__localtunes"]).toBeUndefined();
});

it("forwards analytics GET/POST, polling and websocket upgrade through the configured loopback Vite proxy", async () => {
  const requests: Array<{ method?: string; url?: string; body: string; authorization?: string }> = [];
  upstream = createHttpServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
  });
  const upgrades: string[] = [];
  upstream.on("upgrade", (req, socket) => {
    upgrades.push(req.url!);
    const accept = createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const upstreamPort = (upstream.address() as { port: number }).port;
  Object.assign(fixtureEnv, { VITE_LOCAL_TUNES_API_URL: "https://music.localhost", MUSIC_DEV_PROXY_ENABLED: "true", MUSIC_DEV_PROXY_TARGET: `http://127.0.0.1:${upstreamPort}` });
  const config = await (viteConfig as (env: { mode: string; command: string }) => UserConfig)({ mode: "development", command: "serve" });
  // A proxy-only test must not invalidate the running application's Vite cache.
  proxyRoot = await mkdtemp(join(tmpdir(), "music-proxy-test-"));
  const musicRoute = config.server?.proxy?.["/__localtunes"];
  expect(musicRoute).toBeDefined();
  if (!musicRoute) throw new Error("Music proxy fixture route missing");
  proxy = await createViteServer({
    root: proxyRoot,
    configFile: false,
    envDir: false,
    envPrefix: "CONTAINED_UNIT_NEVER_AMBIENT_",
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      watch: null,
      proxy: { "/__localtunes": musicRoute },
    },
    appType: "custom",
  });
  expect(Object.keys(proxy.config.server.proxy ?? {})).toEqual(["/__localtunes"]);
  await proxy.listen();
  const port = (proxy.httpServer!.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  vi.stubGlobal("location", new URL(origin));
  const browserFetch: typeof fetch = (input, init) => fetch(input instanceof Request ? input : new URL(String(input), origin), init);
  const transport = createMusicDevelopmentFetch(browserFetch, true, "https://music.localhost");
  expect((await transport("https://music.localhost/api/explorers/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"eventId":"synthetic-event"}',
  })).status).toBe(200);
  expect((await transport("https://music.localhost/api/explorers/analytics/events?accountId=account-query-value&fromDate=2026-08-01&toDate=2026-08-24&timeZone=America%2FNew_York", {
    method: "GET",
    headers: { Authorization: "Bearer synthetic-dashboard-token" },
  })).status).toBe(200);
  const controller = new AbortController();
  expect((await transport(new Request("https://music.localhost/api/music/test?x=1", {
    method: "POST", headers: { Authorization: "Bearer test-only" }, body: "test-payload", signal: controller.signal,
  }))).status).toBe(200);
  controller.abort();
  await expect(transport(new Request("https://music.localhost/api/music/aborted", {
    method: "POST", body: "never-transmitted", signal: controller.signal,
  }))).rejects.toMatchObject({ name: "AbortError" });
  expect((await fetch(`${origin}/__localtunes/ws/?EIO=4&transport=polling`)).status).toBe(200);
  const handshake = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Websocket proxy handshake timeout")); }, 2_000);
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
    socket.on("connect", () => socket.write("GET /__localtunes/ws/?EIO=4&transport=websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"));
    socket.once("data", (data) => { clearTimeout(timer); socket.destroy(); resolve(data.toString()); });
  });
  expect(handshake).toContain("101 Switching Protocols");
  expect(upgrades).toEqual(["/ws/?EIO=4&transport=websocket"]);
  expect(requests).toEqual([
    { method: "POST", url: "/api/explorers/analytics/events", body: '{"eventId":"synthetic-event"}', authorization: undefined },
    { method: "GET", url: "/api/explorers/analytics/events?accountId=account-query-value&fromDate=2026-08-01&toDate=2026-08-24&timeZone=America%2FNew_York", body: "", authorization: "Bearer synthetic-dashboard-token" },
    { method: "POST", url: "/api/music/test?x=1", body: "test-payload", authorization: "Bearer test-only" },
    { method: "GET", url: "/ws/?EIO=4&transport=polling", body: "", authorization: undefined },
  ]);
});
