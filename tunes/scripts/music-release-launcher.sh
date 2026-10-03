#!/bin/sh
set -eu

rejected_message='native Music release launcher rejected Node startup authority'
if /usr/bin/env | /usr/bin/grep -Eq '^NODE(_.*)?='; then
  printf '%s\n' "$rejected_message" >&2
  exit 78
fi

case "${1-}" in
  qualification|nightly|rehearsal) mode=$1 ;;
  *) printf '%s\n' 'native Music release launcher mode is invalid' >&2; exit 64 ;;
esac

script_root=$(CDPATH= cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_root/../.." && pwd -P)
node_path=/usr/bin/node
git_path=/usr/bin/git
sha256_path=/usr/bin/sha256sum
stat_path=/usr/bin/stat
find_path=/usr/bin/find
if [ ! -x "$stat_path" ] || [ -L "$stat_path" ]; then
  printf '%s\n' 'trusted native release executable is unavailable' >&2
  exit 78
fi
for executable in "$node_path" "$git_path" "$sha256_path" "$find_path"; do
  if [ ! -x "$executable" ] || [ -L "$executable" ] || [ "$("$stat_path" -c '%u:%g:%a' "$executable")" != 0:0:755 ]; then
    printf '%s\n' 'trusted native release executable is unavailable' >&2
    exit 78
  fi
done
if [ "$("$node_path" --version)" != v24.21.0 ]; then
  printf '%s\n' 'trusted native release executable is unavailable' >&2
  exit 78
fi

channel_path=$script_root/music-release-channel.mjs
register_path=$script_root/music-native-typescript-register.mjs
resolver_path=$script_root/music-native-typescript-loader.mjs
preflight_path=$script_root/music-linux-qualification-preflight.sh
if [ "$mode" = qualification ] || [ "$mode" = nightly ]; then
  target_path=$script_root/music-cli.ts
else
  target_path=$script_root/music-docker-release-rehearsal.ts
fi
for authority in "$0" "$channel_path" "$register_path" "$resolver_path" "$target_path" "$preflight_path"; do
  if [ ! -f "$authority" ] || [ -L "$authority" ]; then
    printf '%s\n' 'trusted native release source authority is unavailable' >&2
    exit 78
  fi
done
cd -- "$repository_root"

npm_authority_root=/opt/explorers-music-node-v24.21.0
npm_root=/opt/explorers-music-node-v24.21.0/lib/node_modules/npm
npm_cli_path=/opt/explorers-music-node-v24.21.0/lib/node_modules/npm/bin/npm-cli.js
npm_path=/opt/explorers-music-node-v24.21.0/bin/npm
playwright_path=/opt/explorers-music-playwright
browser_manifest_path=/opt/explorers-music-playwright/.chromium-executable.sha256
browser_pattern='*/chrome-linux*/chrome'
npm_cli_sha256=8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7
additional_authorities=
if [ "$mode" = qualification ] || [ "$mode" = nightly ]; then
  "$preflight_path" "$node_path" "$git_path" "$sha256_path" "$stat_path" "$find_path" \
    "$npm_root" "$npm_cli_path" "$npm_path" "$playwright_path" 0 0 755 v24.21.0 "$browser_pattern" "$npm_cli_sha256" "$browser_manifest_path"
  browser_executable=$("$find_path" "$playwright_path" -xdev -type f -path "$browser_pattern" -print)
  additional_authorities="$npm_cli_path $npm_path $browser_executable $browser_manifest_path"
fi

# additional_authorities is preflight-constrained to paths without whitespace.
# shellcheck disable=SC2086
before=$("$sha256_path" "$node_path" "$git_path" "$sha256_path" "$find_path" "$channel_path" "$register_path" "$resolver_path" "$target_path" "$preflight_path" $additional_authorities)
empty_global_npm_config=/etc/explorers-music-release-empty.npmrc
if [ -e "$empty_global_npm_config" ]; then
  printf '%s\n' 'trusted empty npm global configuration authority is unavailable' >&2
  exit 78
fi
source_status=$(/usr/bin/env -i HOME=/ PATH=/usr/bin:/bin LANG=C LC_ALL=C \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
  GIT_ATTR_NOSYSTEM=1 GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GIT_PAGER= \
  "$git_path" --no-replace-objects -c core.fsmonitor=false -c core.untrackedCache=false \
  -c diff.external= status --porcelain=v1 --untracked-files=all)
if [ -n "$source_status" ]; then
  printf '%s\n' 'native release source checkout must be clean' >&2
  exit 78
fi

nonce=$(/usr/bin/od -An -N32 -tx1 /dev/urandom | /usr/bin/tr -d ' \n')
set -- \
  HOME=/ \
  TMPDIR=/tmp \
  PATH=/usr/bin:/bin \
  LANG=C \
  LC_ALL=C \
  NPM_CONFIG_USERCONFIG=/dev/null \
  NPM_CONFIG_GLOBALCONFIG="$empty_global_npm_config" \
  NPM_CONFIG_AUDIT=false \
  NPM_CONFIG_FUND=false \
  NPM_CONFIG_UPDATE_NOTIFIER=false
if [ "$mode" = qualification ] || [ "$mode" = nightly ]; then
  set -- "$@" "PATH=$npm_authority_root/bin:/usr/bin:/bin" \
    "npm_execpath=$npm_cli_path" "PLAYWRIGHT_BROWSERS_PATH=$playwright_path"
fi
[ -z "${MUSIC_C10_STANDALONE_POSTGRES_ACK-}" ] || set -- "$@" "MUSIC_C10_STANDALONE_POSTGRES_ACK=$MUSIC_C10_STANDALONE_POSTGRES_ACK"
[ -z "${MUSIC_C10_STANDALONE_POSTGRES_PORT-}" ] || set -- "$@" "MUSIC_C10_STANDALONE_POSTGRES_PORT=$MUSIC_C10_STANDALONE_POSTGRES_PORT"
[ -z "${MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID-}" ] || set -- "$@" "MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID=$MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID"
[ -z "${MUSIC_C10_STANDALONE_POSTGRES_COMMIT-}" ] || set -- "$@" "MUSIC_C10_STANDALONE_POSTGRES_COMMIT=$MUSIC_C10_STANDALONE_POSTGRES_COMMIT"

channel_uri=file://$channel_path
register_uri=file://$register_path
set +e
if [ "$mode" = qualification ] || [ "$mode" = nightly ]; then
  if [ "$mode" = qualification ]; then lane=test:release; else lane=test:nightly; fi
  printf '%s\n' "$nonce" | /usr/bin/env -i "$@" "$node_path" \
    --no-warnings=ExperimentalWarning --experimental-transform-types \
    --import "$channel_uri" --import "$register_uri" "$target_path" "$lane" --format json \
    --music-native-release-channel "$mode" "$nonce"
else
  printf '%s\n' "$nonce" | /usr/bin/env -i "$@" "$node_path" \
    --no-warnings=ExperimentalWarning --experimental-transform-types \
    --import "$channel_uri" --import "$register_uri" "$target_path" \
    --music-native-release-channel "$mode" "$nonce"
fi
exit_code=$?
set -e
# shellcheck disable=SC2086
after=$("$sha256_path" "$node_path" "$git_path" "$sha256_path" "$find_path" "$channel_path" "$register_path" "$resolver_path" "$target_path" "$preflight_path" $additional_authorities)
if [ "$before" != "$after" ]; then
  printf '%s\n' 'trusted native release authority changed during execution' >&2
  exit 78
fi
exit "$exit_code"
