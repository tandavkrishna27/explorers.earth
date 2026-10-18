#!/bin/sh
# Render deploy/nginx/explorers.conf's host parameters into a site file.
#
#   EXPLORERS_SERVER_NAME=explorers.earth \
#   EXPLORERS_TLS_CERTIFICATE=/etc/letsencrypt/live/explorers.earth/fullchain.pem \
#   EXPLORERS_TLS_CERTIFICATE_KEY=/etc/letsencrypt/live/explorers.earth/privkey.pem \
#     sh deploy/nginx/render-site.sh deploy/nginx/explorers.conf <output>
#
# Comment lines are left alone. Refuses to write anything if a value is missing or
# malformed, or if any parameter token survives outside a comment. The values land
# in a file nginx parses as configuration, so the patterns are narrow on purpose:
# no whitespace, no `;`, no `{`.
set -eu

[ "$#" -eq 2 ] || { echo "usage: render-site.sh <template> <output>" >&2; exit 2; }
template="$1"
output="$2"

require() {
  name="$1" pattern="$2"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "render-site: $name is not set" >&2
    exit 1
  fi
  if ! printf '%s' "$value" | grep -Eqx "$pattern"; then
    echo "render-site: $name is malformed" >&2
    exit 1
  fi
}

require EXPLORERS_SERVER_NAME '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+'
require EXPLORERS_TLS_CERTIFICATE '/[A-Za-z0-9._/-]+'
require EXPLORERS_TLS_CERTIFICATE_KEY '/[A-Za-z0-9._/-]+'

tmp="$output.tmp.$$"
sed \
  -e "/^[[:space:]]*#/!s|@EXPLORERS_SERVER_NAME@|$EXPLORERS_SERVER_NAME|g" \
  -e "/^[[:space:]]*#/!s|@EXPLORERS_TLS_CERTIFICATE@|$EXPLORERS_TLS_CERTIFICATE|g" \
  -e "/^[[:space:]]*#/!s|@EXPLORERS_TLS_CERTIFICATE_KEY@|$EXPLORERS_TLS_CERTIFICATE_KEY|g" \
  "$template" > "$tmp"

if grep -v '^[[:space:]]*#' "$tmp" | grep '@[A-Z_]*@' >&2; then
  rm -f "$tmp"
  echo "render-site: unrendered parameter left in the site file" >&2
  exit 1
fi
mv "$tmp" "$output"
