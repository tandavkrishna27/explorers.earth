// Post-deploy checks against an explorers host, run from outside it. Used by the
// cutover rehearsal against the stand-in host, and usable as-is against
// production once DNS points at the new host (omit --connect and --ca there).
//
//   node node_modules/tsx/dist/cli.mjs deploy/rehearsal/probe.mts \
//     --origin https://explorers.rehearsal.test --connect 127.0.0.1:8443 --ca ca.pem \
//     --google-client-id <id> [--hidden-handle <handle> --hidden-category <category>] \
//     [--public-json <path>]
//
// --connect sends every request to that address while keeping the origin's
// hostname for SNI, certificate checks and the Host header, so nothing on the
// machine running this has to resolve the hostname.
//
// It checks, in order: verifyCanonicalIngress (P2 Task 6); that Google sign-in
// starts and names the right callback (Task 9 Step 8) without contacting Google;
// the served headers (Task 10 Step 5); the runtime config the SPA boots from; and
// that an unknown handle is a 404, never 200 {} (Task 10 Step 6).
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { verifyCanonicalIngress } from "../../scripts/replatform-route-parity";

function argument(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && !value) throw new Error(`--${name} is required`);
  return value;
}

const origin = argument("origin")!;
const connect = argument("connect", false);
const caPath = argument("ca", false);
const googleClientId = argument("google-client-id")!;
const publicJsonPath = argument("public-json", false);
const hidden = {
  handle: argument("hidden-handle", false) ?? "rehearsal-no-such-handle",
  category: argument("hidden-category", false) ?? "places",
};

const url = new URL(origin);
if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("--origin must be a bare https origin");
const ca = caPath ? readFileSync(caPath) : undefined;
const [connectHost, connectPort] = connect ? [connect.split(":")[0], Number(connect.split(":")[1] ?? 443)] : [url.hostname, 443];

// A fetch that dials --connect but is otherwise the origin. Enough of fetch for
// verifyCanonicalIngress: method, headers, body, status, headers.get, text/json.
const fetchVia = ((input: string | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
  const target = new URL(String(input));
  const headers: Record<string, string> = { host: target.host, ...(init.headers as Record<string, string> | undefined) };
  const body = typeof init.body === "string" ? init.body : undefined;
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
  const outgoing = request({
    host: connectHost, port: connectPort, servername: target.hostname, ca,
    method: init.method ?? "GET", path: `${target.pathname}${target.search}`, headers,
    signal: init.signal ?? undefined,
  }, (incoming) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) responseHeaders.append(name, item);
      }
      const status = incoming.statusCode ?? 0;
      const nullBody = status === 204 || status === 304;
      resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
    });
    incoming.on("error", reject);
  });
  outgoing.on("error", reject);
  outgoing.end(body);
})) as typeof fetch;

let failures = 0;
async function check(name: string, run: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await run();
    console.log(`ok   ${name}${detail ? ` - ${detail}` : ""} (${Date.now() - started}ms)`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name} - ${error instanceof Error ? error.message : String(error)}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await check("verifyCanonicalIngress", async () => {
  const probes = await verifyCanonicalIngress(origin, hidden, fetchVia);
  return `${probes} probes; hidden-category target ${hidden.handle}/${hidden.category}`;
});

await check("Google sign-in starts and names this origin's callback", async () => {
  const response = await fetchVia(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/" }),
  });
  const text = await response.text();
  expect(response.status === 200, `answered ${response.status}: ${text.slice(0, 200)}`);
  const authorize = new URL((JSON.parse(text) as { url: string }).url);
  expect(authorize.hostname === "accounts.google.com", `redirects to ${authorize.hostname}`);
  expect(authorize.searchParams.get("client_id") === googleClientId, "client_id is not GOOGLE_CLIENT_ID");
  const callback = authorize.searchParams.get("redirect_uri");
  expect(callback === `${origin}/api/auth/callback/google`, `redirect_uri is ${callback}`);
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split("=")[0]);
  expect(cookies.some((name) => name.startsWith("__Secure-")), `no __Secure- state cookie (got ${cookies.join(", ") || "none"})`);
  return `redirect_uri ${callback}`;
});

await check("CSP and security headers as served", async () => {
  const shell = await fetchVia(`${origin}/`);
  const html = await shell.text();
  const csp = shell.headers.get("content-security-policy") ?? "";
  expect(shell.status === 200 && html.includes('id="root"'), `/ answered ${shell.status} without the SPA shell`);
  expect(csp.includes("default-src 'self'"), "no Content-Security-Policy on /");
  const assetPath = html.match(/\/assets\/[^"']+\.js/)?.[0];
  expect(assetPath, "no hashed /assets/*.js in the served index.html");
  const asset = await fetchVia(`${origin}${assetPath}`);
  await asset.arrayBuffer();
  expect(asset.status === 200, `${assetPath} answered ${asset.status}`);
  expect(asset.headers.get("x-content-type-options") === "nosniff", `${assetPath} lost X-Content-Type-Options (add_header inheritance)`);
  expect(asset.headers.get("content-security-policy"), `${assetPath} lost the CSP (add_header inheritance)`);
  expect((asset.headers.get("cache-control") ?? "").includes("immutable"), `${assetPath} is not cached immutable`);
  const index = await fetchVia(`${origin}/index.html`);
  await index.text();
  expect((index.headers.get("cache-control") ?? "").includes("no-store"), "/index.html is cacheable");
  const headersFile = await fetchVia(`${origin}/headers.conf`);
  await headersFile.text();
  expect(headersFile.status === 404, `/headers.conf answered ${headersFile.status}`);
  return `maps origins in CSP: ${csp.includes("maps.googleapis.com")}`;
});

await check("runtime-config.json is what the SPA will accept", async () => {
  const response = await fetchVia(`${origin}/runtime-config.json`);
  const served = await response.text();
  expect(response.status === 200, `answered ${response.status}`);
  expect((response.headers.get("cache-control") ?? "").includes("no-store"), "runtime-config.json is cacheable");
  const config = JSON.parse(served) as { origin?: string; environment?: string };
  expect(config.origin === origin, `origin is ${config.origin}, the browser will refuse it`);
  if (publicJsonPath) {
    expect(JSON.stringify(JSON.parse(readFileSync(publicJsonPath, "utf8"))) === JSON.stringify(config), "differs from public.json");
  }
  return `environment ${config.environment}`;
});

await check("unknown handle is 404, not 200 {}", async () => {
  const response = await fetchVia(`${origin}/api/explorers/v1/profiles/rehearsal-no-such-handle`);
  const body = await response.text();
  expect(response.status === 404, `answered ${response.status}: ${body.slice(0, 120)}`);
  return "";
});

await check("legacy paths answer from the API, not the SPA shell", async () => {
  const results: string[] = [];
  for (const path of ["/graphql", "/socket.io/?EIO=4&transport=polling", "/api/proxy-image", "/sitemap.xml", "/robots.txt"]) {
    const response = await fetchVia(`${origin}${path}`);
    const body = await response.text();
    expect(!body.includes('id="root"'), `${path} answered with the SPA shell`);
    results.push(`${path.split("?")[0]} ${response.status}`);
  }
  return results.join(", ");
});

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("all checks passed");
}
