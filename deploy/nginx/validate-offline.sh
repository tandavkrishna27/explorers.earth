#!/bin/sh
# Validate deploy/nginx/explorers.conf with `nginx -t` in a container, offline.
#
#   sh deploy/nginx/validate-offline.sh [headers.conf]
#
# The site includes /srv/explorers/current/runtime/headers.conf, which the deploy
# renders, and names TLS files that exist only on the host. Both are resolved at
# parse time, so this mounts stand-ins at those exact paths: the headers file you
# pass (default: a one-line stub) and a throwaway self-signed certificate. The
# committed TLS lines are rendered, never deleted. Needs docker and openssl.
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
image="${NGINX_IMAGE:-nginx:1.27-alpine}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/current/runtime" "$work/current/dist" "$work/tls"
if [ "$#" -ge 1 ]; then
  cp "$1" "$work/current/runtime/headers.conf"
else
  printf 'add_header X-Content-Type-Options "nosniff" always;\n' > "$work/current/runtime/headers.conf"
fi
# MSYS2_ARG_CONV_EXCL stops Git Bash on Windows rewriting -subj as a path; inert elsewhere.
MSYS2_ARG_CONV_EXCL=/CN openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=explorers.test" \
  -keyout "$work/tls/privkey.pem" -out "$work/tls/fullchain.pem" 2>/dev/null

EXPLORERS_SERVER_NAME=explorers.test \
EXPLORERS_TLS_CERTIFICATE=/etc/explorers-tls/fullchain.pem \
EXPLORERS_TLS_CERTIFICATE_KEY=/etc/explorers-tls/privkey.pem \
  sh "$here/render-site.sh" "$here/explorers.conf" "$work/explorers.conf"

# Git Bash on Windows hands docker an unusable /tmp path and the bind mount then
# silently falls back to the image's stock default.conf. Give docker native paths.
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

# --entrypoint nginx skips the image's entrypoint scripts, which rewrite conf.d.
# -T tests and also dumps what was parsed, so a mount that did not take fails below
# instead of passing against the stock config.
status=0
MSYS_NO_PATHCONV=1 docker run --rm --entrypoint nginx \
  -v "$(host_path "$work/explorers.conf"):/etc/nginx/conf.d/default.conf:ro" \
  -v "$(host_path "$work/current"):/srv/explorers/current:ro" \
  -v "$(host_path "$work/tls"):/etc/explorers-tls:ro" \
  "$image" -T > "$work/parsed.txt" 2> "$work/result.txt" || status=$?
cat "$work/result.txt" >&2
[ "$status" -eq 0 ] || exit "$status"
if ! grep -q 'server_name explorers.test;' "$work/parsed.txt"; then
  echo "validate-offline: nginx did not parse the rendered site file (mount failed?)" >&2
  exit 1
fi
echo "validate-offline: explorers.conf passes nginx -t"
