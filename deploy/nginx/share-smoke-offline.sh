#!/bin/sh
# Exercise deploy/nginx/explorers.conf's HTML routing in containers, offline.
#
#   sh deploy/nginx/share-smoke-offline.sh
#
# validate-offline.sh proves the file parses; this proves what it does. A stub API
# on 127.0.0.1:5000 answers /api/explorers/v1/share-page the way
# explorersSharePageRoutes.ts does, and real nginx runs in the stub's network
# namespace so the committed loopback upstream resolves. Then it checks that the
# API's status reaches the client, that SSI expands the shell halves around the
# API's head, that the halves cannot be fetched directly, that an API failure
# falls back to the static shell with 200, that files skip the API, and that
# HSTS rides every HTTPS response. Needs docker and openssl.
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
nginx_image="${NGINX_IMAGE:-nginx:1.27-alpine}"
node_image="${NODE_IMAGE:-node:20-alpine}"
work="$(mktemp -d)"
name="explorers-share-smoke-$$"
cleanup() { docker rm -f "$name-nginx" "$name-api" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

mkdir -p "$work/current/runtime/shell" "$work/current/dist/assets" "$work/tls" "$work/api"
printf 'add_header X-Content-Type-Options "nosniff" always;\n' > "$work/current/runtime/headers.conf"
printf '<!doctype html><html><head><meta name="robots" content="index,follow" />' > "$work/current/runtime/shell/head.html"
printf '</head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>' > "$work/current/runtime/shell/tail.html"
printf '<!doctype html><html><head><title>explorers</title></head><body>static shell</body></html>' > "$work/current/dist/index.html"
printf 'console.log(1)' > "$work/current/dist/assets/app.js"
printf 'icon' > "$work/current/dist/favicon.svg"
MSYS2_ARG_CONV_EXCL=/CN openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=explorers.test" \
  -keyout "$work/tls/privkey.pem" -out "$work/tls/fullchain.pem" 2>/dev/null

cat > "$work/api/stub.mjs" <<'STUB'
import { createServer } from "node:http";
const head = '<!--# include virtual="/__explorers_shell/head.html" -->';
const tail = '<!--# include virtual="/__explorers_shell/tail.html" -->';
createServer((req, res) => {
  if (!req.url.startsWith("/api/explorers/v1/share-page")) { res.writeHead(418).end(); return; }
  const path = req.headers["x-explorers-path"] ?? "";
  if (path === "/boom") { res.writeHead(500).end("boom"); return; }
  const status = path.startsWith("/ada") ? 200 : 404;
  const meta = `<title>${status === 200 ? "Ada" : "explorers"}</title><meta property="og:url" content="https://explorers.test${status === 200 ? "/ada" : "/404"}" />`;
  res.writeHead(status, { "content-type": "text/html", "cache-control": "no-store", "x-seen-path": encodeURIComponent(path) });
  res.end(head + meta + tail);
}).listen(5000, "127.0.0.1");
// Probe: run inside the same namespace, against nginx's TLS listener.
STUB
cat > "$work/api/probe.mjs" <<'PROBE'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const [path] = process.argv.slice(2);
const res = await fetch(`https://127.0.0.1${path}`, { headers: { host: "explorers.test" }, redirect: "manual" });
console.log(JSON.stringify({ status: res.status, hsts: res.headers.get("strict-transport-security"),
  csp: res.headers.get("x-content-type-options"), body: await res.text() }));
PROBE

EXPLORERS_SERVER_NAME=explorers.test \
EXPLORERS_TLS_CERTIFICATE=/etc/explorers-tls/fullchain.pem \
EXPLORERS_TLS_CERTIFICATE_KEY=/etc/explorers-tls/privkey.pem \
  sh "$here/render-site.sh" "$here/explorers.conf" "$work/explorers.conf"

MSYS_NO_PATHCONV=1 docker run -d --name "$name-api" -v "$(host_path "$work/api"):/stub:ro" \
  "$node_image" node /stub/stub.mjs >/dev/null
MSYS_NO_PATHCONV=1 docker run -d --name "$name-nginx" --network "container:$name-api" --entrypoint nginx \
  -v "$(host_path "$work/explorers.conf"):/etc/nginx/conf.d/default.conf:ro" \
  -v "$(host_path "$work/current"):/srv/explorers/current:ro" \
  -v "$(host_path "$work/tls"):/etc/explorers-tls:ro" \
  "$nginx_image" -g "daemon off;" >/dev/null

probe() { MSYS_NO_PATHCONV=1 docker exec "$name-api" node --no-warnings /stub/probe.mjs "$1"; }
for _ in 1 2 3 4 5 6 7 8 9 10; do probe /favicon.svg >/dev/null 2>&1 && break; sleep 1; done

failures=0
check() {
  label="$1" path="$2" expression="$3"
  result="$(probe "$path")"
  if printf '%s' "$result" | MSYS_NO_PATHCONV=1 docker exec -i "$name-api" node -e "
    const r = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    process.exit(($expression) ? 0 : 1);"; then
    echo "ok   $label"
  else
    echo "FAIL $label: $result" >&2
    failures=$((failures + 1))
  fi
}

HSTS="r.hsts === 'max-age=31536000; includeSubDomains'"
check "profile: 200, SSI-expanded, HSTS" /ada \
  "r.status === 200 && $HSTS && r.csp === 'nosniff' && r.body.startsWith('<!doctype html><html><head><meta name=\"robots\"') && r.body.includes('<title>Ada</title>') && r.body.includes('<script src=\"/assets/app.js\">') && !r.body.includes('<!--#')"
check "unknown path: 404 with the shell" /no/such/page \
  "r.status === 404 && $HSTS && r.body.includes('<div id=\"root\">') && !r.body.includes('<!--#')"
check "root goes through the API" / "r.status === 404 && r.body.includes('<div id=\"root\">')"
check "API failure: static shell, 200" /boom "r.status === 200 && r.body.includes('static shell') && $HSTS"
check "shell halves are internal" /__explorers_shell/head.html "r.status === 404"
check "files skip the API" /favicon.svg "r.status === 200 && r.body === 'icon' && $HSTS"
check "assets keep HSTS" /assets/app.js "r.status === 200 && $HSTS"
check "index.html keeps HSTS" /index.html "r.status === 200 && $HSTS && r.body.includes('static shell')"
check "API responses keep HSTS" /api/anything "r.status === 418 && $HSTS"

docker logs "$name-nginx" 2>&1 | grep -i "emerg\|crit" >&2 && failures=$((failures + 1)) || true
[ "$failures" -eq 0 ] || { echo "share-smoke-offline: $failures check(s) failed" >&2; exit 1; }
echo "share-smoke-offline: all checks passed"
