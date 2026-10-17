#!/bin/sh
set -eu

if [ "$#" -ne 16 ]; then
  printf '%s\n' 'trusted native qualification preflight arguments are invalid' >&2
  exit 64
fi

node_path=$1
git_path=$2
sha256_path=$3
stat_path=$4
find_path=$5
npm_root=$6
npm_cli_path=$7
npm_path=$8
playwright_path=$9
expected_uid=${10}
expected_gid=${11}
expected_mode=${12}
expected_node_version=${13}
browser_pattern=${14}
expected_npm_cli_sha256=${15}
browser_manifest_path=${16}

metadata_matches() {
  [ -e "$1" ] && [ ! -L "$1" ] \
    && [ "$("$stat_path" -c '%u:%g:%a' "$1")" = "$expected_uid:$expected_gid:$expected_mode" ]
}

for executable in "$node_path" "$git_path" "$sha256_path" "$find_path"; do
  if [ ! -x "$executable" ] || ! metadata_matches "$executable"; then
    printf '%s\n' 'trusted native release executable is unavailable' >&2
    exit 78
  fi
done
if [ "$("$node_path" --version)" != "$expected_node_version" ]; then
  printf '%s\n' 'trusted native release executable is unavailable' >&2
  exit 78
fi

npm_cli_digest=$("$sha256_path" "$npm_cli_path" 2>/dev/null || true)
npm_cli_digest=${npm_cli_digest%% *}
if [ ! -d "$npm_root" ] || [ -L "$npm_root" ] \
  || [ ! -f "$npm_cli_path" ] || [ ! -x "$npm_cli_path" ] || ! metadata_matches "$npm_cli_path" \
  || [ "$npm_cli_digest" != "$expected_npm_cli_sha256" ] \
  || [ ! -f "$npm_path" ] || [ ! -x "$npm_path" ] || ! metadata_matches "$npm_path" \
  || [ -n "$("$find_path" "$npm_root" -xdev \( ! -uid "$expected_uid" -o ! -gid "$expected_gid" -o -perm /022 \) -print -quit)" ]; then
  printf '%s\n' 'trusted native npm authority is unavailable' >&2
  exit 78
fi

if [ ! -d "$playwright_path" ] || [ -L "$playwright_path" ] \
  || [ -n "$("$find_path" "$playwright_path" -xdev \( ! -uid "$expected_uid" -o ! -gid "$expected_gid" -o -perm /022 \) -print -quit)" ]; then
  printf '%s\n' 'trusted native Playwright authority is unavailable' >&2
  exit 78
fi
browser_executables=$("$find_path" "$playwright_path" -xdev -type f -path "$browser_pattern" -print)
browser_count=0
browser_executable=
while IFS= read -r candidate; do
  [ -z "$candidate" ] && continue
  browser_count=$((browser_count + 1))
  browser_executable=$candidate
done <<EOF
$browser_executables
EOF
browser_expected_digest=
if [ -f "$browser_manifest_path" ] && [ ! -L "$browser_manifest_path" ]; then
  IFS= read -r browser_expected_digest < "$browser_manifest_path" || true
fi
browser_actual_digest=$("$sha256_path" "$browser_executable" 2>/dev/null || true)
browser_actual_digest=${browser_actual_digest%% *}
if [ "$browser_count" -ne 1 ] || ! metadata_matches "$browser_executable" \
  || [ ! -f "$browser_manifest_path" ] || [ -L "$browser_manifest_path" ] \
  || [ "$browser_actual_digest" != "$browser_expected_digest" ] \
  || [ ! -x "$browser_executable" ]; then
  printf '%s\n' 'trusted native Playwright authority is unavailable' >&2
  exit 78
fi
