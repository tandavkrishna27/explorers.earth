#!/bin/sh
# Assemble one release directory from a platform SPA build (P2 Task 5).
#
#   sh deploy/assemble-release.sh <public.json> <vite-dist-dir> <release-dir>
#
# Produces the layout host nginx (deploy/nginx/explorers.conf) serves:
#   <release-dir>/dist/              the build, with the rendered index.html,
#                                    runtime-config.json, robots.txt, sitemap.xml
#   <release-dir>/runtime/headers.conf   included by nginx, outside the served root
#   <release-dir>/runtime/shell/{head,tail}.html   the shell halves nginx SSI wraps around
#                                    the API's per-page head, also outside the root
#
# render-platform-runtime.mjs writes every output with flag 'wx', and vite has
# already put index.html, robots.txt and sitemap.xml into dist/. Rendering straight
# into dist/ therefore fails with only "Public runtime generation failed", after
# writing runtime-config.json and before headers.conf - a partial tree that stops
# nginx starting. So render into an empty directory of its own, check all five
# outputs exist, and only then merge.
set -eu

[ "$#" -eq 3 ] || { echo "usage: assemble-release.sh <public.json> <vite-dist-dir> <release-dir>" >&2; exit 2; }
public_json="$1"
vite_dist="$2"
release="$3"

repo="$(cd "$(dirname "$0")/.." && pwd)"
renderer="$repo/explorers-earth/scripts/render-platform-runtime.mjs"

[ -f "$public_json" ] || { echo "assemble-release: $public_json not found" >&2; exit 1; }
[ -f "$vite_dist/index.html" ] || { echo "assemble-release: $vite_dist has no index.html; run the platform build first" >&2; exit 1; }
[ ! -e "$release" ] || { echo "assemble-release: $release already exists; releases are never overwritten" >&2; exit 1; }

rendered="$(mktemp -d)"
trap 'rm -rf "$rendered"' EXIT
# The renderer creates its output directory; hand it one that does not exist yet.
rendered_out="$rendered/out"

if ! node "$renderer" "$public_json" "$vite_dist/index.html" "$rendered_out"; then
  echo "assemble-release: render-platform-runtime.mjs rejected the input (check public.json against publicRuntimeContract.ts)" >&2
  exit 1
fi
for name in index.html runtime-config.json robots.txt sitemap.xml headers.conf shell-head.html shell-tail.html; do
  [ -s "$rendered_out/$name" ] || { echo "assemble-release: renderer did not produce $name" >&2; exit 1; }
done

mkdir -p "$release/runtime"
cp -R "$vite_dist" "$release/dist"
# Overwrite vite's shell and the public/ copies; add the runtime config.
for name in index.html runtime-config.json robots.txt sitemap.xml; do
  cp -f "$rendered_out/$name" "$release/dist/$name"
done
cp "$rendered_out/headers.conf" "$release/runtime/headers.conf"
# The two halves of the shell nginx's SSI wraps around the API's per-page head
# (location @share). Outside the served root, like headers.conf.
mkdir -p "$release/runtime/shell"
cp "$rendered_out/shell-head.html" "$release/runtime/shell/head.html"
cp "$rendered_out/shell-tail.html" "$release/runtime/shell/tail.html"

if [ -e "$release/dist/headers.conf" ]; then
  echo "assemble-release: headers.conf must never sit inside the served root" >&2
  exit 1
fi
echo "assemble-release: wrote $release"
