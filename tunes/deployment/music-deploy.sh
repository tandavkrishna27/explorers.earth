#!/usr/bin/env bash
set -euo pipefail

umask 077

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "secure regular file required: $path"
  if [[ "${MUSIC_DEPLOY_TEST_MODE:-0}" != 1 ]]; then
    [[ -O "$path" ]] || fail "deployment file has wrong owner: $path"
    local mode
    mode="$(stat -c '%a' "$path")"
    [[ "$mode" == 600 || "$mode" == 400 ]] \
      || fail "deployment file mode must be 0600 or 0400: $path"
  fi
}

require_code_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "regular deployment code file required: $path"
  if [[ "${MUSIC_DEPLOY_TEST_MODE:-0}" != 1 ]]; then
    [[ -O "$path" ]] || fail "deployment code file has wrong owner: $path"
  fi
}

[[ "${MUSIC_DEPLOY_MODE:-production}" == production ]] \
  || fail "production deployment mode is required"
[[ -z "${MUSIC_DEPLOY_FIXTURE_ACK:-}" \
  && -z "${MUSIC_DEPLOY_FIXTURE_REGISTRY:-}" \
  && -z "${MUSIC_DEPLOY_FIXTURE_COMPOSE_PROJECT:-}" ]] \
  || fail "fixture deployment settings are forbidden in production mode"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
engine_file="$script_dir/music-deploy-engine.sh"
authority_file="${MUSIC_DEPLOY_AUTHORITY_FILE:-}"
ghcr_token_file="${MUSIC_DEPLOY_GHCR_TOKEN_FILE:-}"
ghcr_user="${MUSIC_DEPLOY_GHCR_USER:-}"
repository="${MUSIC_DEPLOY_EXPECTED_REPOSITORY:-}"
expected_source="${MUSIC_DEPLOY_EXPECTED_SOURCE:-}"

if [[ -n "$authority_file" ]]; then
  require_regular_file "$authority_file"
  mapfile -t authority_lines < "$authority_file"
  [[ ${#authority_lines[@]} -eq 4 && "${authority_lines[0]}" == music-deploy-authority-v1 \
    && "${authority_lines[1]}" == repository=* && "${authority_lines[2]}" == source=* \
    && "${authority_lines[3]}" == ghcr_user=* ]] || fail "invalid deployment authority schema"
  repository="${authority_lines[1]#repository=}"
  expected_source="${authority_lines[2]#source=}"
  ghcr_user="${authority_lines[3]#ghcr_user=}"
fi

[[ "$repository" =~ ^ghcr\.io/[a-z0-9]([a-z0-9_.-]{0,37}[a-z0-9])?/explorers-tunes$ ]] \
  || fail "canonical image repository is invalid"
[[ "$expected_source" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
  || fail "expected OCI source is invalid"
[[ "$ghcr_user" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "GHCR deploy user is invalid"
require_regular_file "$ghcr_token_file"
require_code_file "$engine_file"

readonly MUSIC_DEPLOY_POLICY_ID=production-ghcr-v1
readonly MUSIC_DEPLOY_POLICY_REPOSITORY="$repository"
readonly MUSIC_DEPLOY_POLICY_SOURCE="$expected_source"
export MUSIC_DEPLOY_EXPECTED_REPOSITORY="$repository"
export MUSIC_DEPLOY_EXPECTED_SOURCE="$expected_source"
export MUSIC_DEPLOY_GHCR_USER="$ghcr_user"
production_registry_logged_in=false

music_deploy_registry_materialize() {
  local auth_dir="$1" candidate_image="$2"
  docker --config "$auth_dir" login ghcr.io --username "$ghcr_user" --password-stdin \
    < "$ghcr_token_file" >/dev/null
  production_registry_logged_in=true
  docker --config "$auth_dir" pull "$candidate_image"
}

music_deploy_registry_cleanup() {
  local auth_dir="$1"
  if [[ "$production_registry_logged_in" == true ]]; then
    docker --config "$auth_dir" logout ghcr.io >/dev/null 2>&1 || true
  fi
  rm -f -- "$auth_dir/config.json"
  rmdir -- "$auth_dir" 2>/dev/null || true
  if [[ "${MUSIC_DEPLOY_EPHEMERAL_CREDENTIAL_FILES:-0}" == 1 ]]; then
    rm -f -- "${MUSIC_DEPLOY_REQUEST_FILE:-}" "${MUSIC_DEPLOY_HMAC_KEY_FILE:-}" \
      "$ghcr_token_file" "$authority_file"
  fi
}

music_deploy_validate_compose_project() {
  local compose_project="$1" observed_project observed_service running
  [[ "${operation:-}" == bootstrap ]] || return 0
  running="$(docker inspect --format '{{.State.Running}}' "$requested_legacy_service")" \
    || fail "legacy container unavailable"
  [[ "$running" == true ]] || fail "legacy container is not running"
  observed_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$requested_legacy_service")" \
    || fail "legacy container Compose project unavailable"
  [[ "$observed_project" == "$compose_project" ]] \
    || fail "legacy container Compose project mismatch"
  observed_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$requested_legacy_service")" \
    || fail "legacy container Compose service unavailable"
  [[ "$observed_service" == tunes ]] || fail "legacy container is not the Tunes Compose service"
}

music_deploy_router_security() {
  cat <<'EOF'
      tls:
        certResolver: letsencrypt
EOF
}

music_deploy_route_committed() {
  return 0
}

# shellcheck source=music-deploy-engine.sh
source "$engine_file"
