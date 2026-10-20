#!/usr/bin/env bash
# One-time host bootstrap for the canonical stack (P2 Task 9, Steps 2-4 and the
# checks for 6-9). Run as root on the explorers host, from a copy of the repo's
# deploy/ directory:
#
#   sudo bash explorers-bootstrap.sh init  <server-name>
#   sudo bash explorers-bootstrap.sh check <server-name>
#
# production.env is never written by hand: every deploy renders it from the
# explorers-production GitHub environment and installs it root-owned 0600
# (docs/operations/explorers-github-configuration.md). Before the first deploy
# there is none, and that is fine.
#
# init:  checks the tools and headroom; creates /opt/explorers (0700) and
#        /srv/explorers; generates the two database password files if they do not
#        exist (never overwrites one; they never leave the host); then runs check.
# check: everything init checks, plus production.env when it exists: a regular
#        file, ownership and mode, and the rules in validate-production-env.sh
#        (the same file the deploy workflow validates with) - every required
#        variable present, no example value left, the secret-shape rules the API
#        and the gate enforce at boot; then the password files it names, and
#        which nginx file serves <server-name> today (that file is
#        EXPLORERS_NGINX_SITE_PATH).
#
# Idempotent. Prints every problem it finds, then exits non-zero if there was one.
# It never prints a secret value.
set -Eeuo pipefail

readonly OPT=/opt/explorers
readonly SECRETS="$OPT/secrets"
readonly ENV_FILE="$OPT/production.env"
VALIDATOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/validate-production-env.sh"
readonly VALIDATOR
readonly SRV=/srv/explorers
readonly MIN_DISK_GB=10
readonly MIN_MEMORY_MB=1800

problems=0
problem() { echo "FAIL: $*" >&2; problems=$((problems + 1)); }
ok() { echo "ok:   $*"; }
note() { echo "note: $*"; }

usage() { echo "usage: explorers-bootstrap.sh init|check <server-name>" >&2; exit 2; }
[[ "$#" -eq 2 ]] || usage
mode="$1"
server_name="$2"
[[ "$mode" == init || "$mode" == check ]] || usage
[[ "$server_name" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "server name '$server_name' is malformed" >&2; exit 2; }
[[ "$(id -u)" -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 2; }

# --- Step 2: tools and headroom ------------------------------------------------
tools() {
  local tool
  for tool in docker nginx curl openssl basenc stat find node; do
    command -v "$tool" >/dev/null || problem "$tool is not installed"
  done
  if docker compose version >/dev/null 2>&1; then
    ok "$(docker --version); $(docker compose version)"
  else
    problem "docker compose v2 is not available (apt install docker-compose-v2, or the docker-ce compose plugin)"
  fi
  docker info >/dev/null 2>&1 || problem "the docker daemon is not reachable"
  command -v nginx >/dev/null && ok "$(nginx -v 2>&1)"
  # The pre-deploy and scheduled backups run platform-backup.mjs with the host's node.
  if command -v node >/dev/null; then
    local node_major; node_major="$(node -p 'process.versions.node.split(".")[0]')"
    if (( node_major < 24 )); then problem "node $(node --version) is too old; the backups need Node 24"; else ok "node $(node --version)"; fi
  fi

  local root free_gb memory_mb
  root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
  free_gb="$(df -BG --output=avail "$(dirname "$root")" | tail -n 1 | tr -dc '0-9')"
  if (( free_gb < MIN_DISK_GB )); then problem "only ${free_gb}G free under $root; want at least ${MIN_DISK_GB}G for images, PostgreSQL and logs"
  else ok "${free_gb}G free under $root"; fi
  memory_mb="$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)"
  if (( memory_mb < MIN_MEMORY_MB )); then problem "only ${memory_mb}MB memory available; PostgreSQL, the API and nginx want about ${MIN_MEMORY_MB}MB"
  else ok "${memory_mb}MB memory available"; fi
}

# --- Step 3: directories and database password files ---------------------------
# secure-music-secret-file.ts: mode & 077 == 0, nlink == 1, owner root, and no
# symlink anywhere in the path.
check_secret_file() {
  local file="$1" part="" segment value
  [[ -f "$file" ]] || { problem "$file does not exist"; return; }
  IFS=/ read -ra segments <<<"${file#/}"
  for segment in "${segments[@]}"; do
    part="$part/$segment"
    [[ -L "$part" ]] && { problem "$part is a symlink; secret paths must have none"; return; }
  done
  [[ "$(stat -c '%u %a %h' "$file")" == "0 600 1" ]] || problem "$file must be owned by root, mode 0600, one hard link (is: $(stat -c 'uid %u mode %a links %h' "$file"))"
  value="$(tr -d '\n' <"$file")"
  [[ "$value" =~ ^[A-Za-z0-9_-]+$ ]] || { problem "$file is not one base64url value"; return; }
  (( ${#value} >= 43 )) || problem "$file holds fewer than 32 decoded bytes"
}

directories() {
  install -d -m 0700 -o root -g root "$OPT" "$SECRETS"
  install -d -m 0755 -o root -g root "$SRV" "$SRV/releases"
  ok "$OPT (0700) and $SRV exist"
  local name
  for name in db-migrator db-runtime; do
    if [[ ! -e "$SECRETS/$name" ]]; then
      (umask 077 && openssl rand 48 | basenc --base64url -w0 >"$SECRETS/$name")
      chown root:root "$SECRETS/$name"; chmod 0600 "$SECRETS/$name"
      ok "generated $SECRETS/$name"
    fi
    check_secret_file "$SECRETS/$name"
  done
}

# --- production.env -------------------------------------------------------------
# Written by every deploy from the explorers-production GitHub environment. The
# content rules live in validate-production-env.sh, shared with the workflow;
# this adds what only the host can check: the file itself and the password files.
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

check_env() {
  if [[ -L "$ENV_FILE" ]]; then problem "$ENV_FILE is a symlink; it must be a regular file"; return; fi
  if [[ ! -e "$ENV_FILE" ]]; then
    ok "$ENV_FILE does not exist yet: the first deploy writes it from the explorers-production GitHub environment"
    return
  fi
  [[ -f "$ENV_FILE" ]] || { problem "$ENV_FILE is not a regular file"; return; }
  local before=$problems
  [[ "$(stat -c '%u %a' "$ENV_FILE")" == "0 600" ]] || problem "$ENV_FILE must be root-owned mode 0600"
  if [[ ! -f "$VALIDATOR" ]]; then
    problem "$VALIDATOR is missing; copy the whole deploy/ directory to the host"
  elif ! bash "$VALIDATOR" "$ENV_FILE" "$server_name" >/dev/null; then
    problem "$ENV_FILE fails validate-production-env.sh (each rule above); fix the value in the explorers-production environment and redeploy"
  fi
  [[ "$(env_value DB_MIGRATOR_PASSWORD_FILE_HOST)" == "$SECRETS/db-migrator" ]] || note "DB_MIGRATOR_PASSWORD_FILE_HOST is not $SECRETS/db-migrator; checking it where it points"
  check_secret_file "$(env_value DB_MIGRATOR_PASSWORD_FILE_HOST)"
  check_secret_file "$(env_value DB_RUNTIME_PASSWORD_FILE_HOST)"
  (( problems > before )) || ok "$ENV_FILE is complete"
}

# --- Step 6 and the nginx site file ------------------------------------------------
nginx_site() {
  local dump files
  dump="$(nginx -T 2>/dev/null)" || { problem "nginx -T failed; fix the current config first"; return; }
  files="$(awk -v name="$server_name" '
    /^# configuration file / { file = $4; sub(/:$/, "", file) }
    $1 == "server_name" { for (i = 2; i <= NF; i++) { n = $i; sub(/;$/, "", n); if (n == name) print file } }
  ' <<<"$dump" | sort -u)"
  if [[ -z "$files" ]]; then
    note "no nginx file serves $server_name yet; choose EXPLORERS_NGINX_SITE_PATH freely (e.g. /etc/nginx/conf.d/explorers.conf)"
  elif [[ "$(wc -l <<<"$files")" -eq 1 ]]; then
    ok "nginx serves $server_name from $files: set EXPLORERS_NGINX_SITE_PATH to that path"
    [[ -L "$files" ]] && note "$files is a symlink; the deploy replaces it with a regular file (install -D). Point EXPLORERS_NGINX_SITE_PATH at the link's target instead if you want to keep the link"
  else
    problem "several nginx files serve $server_name: $(tr '\n' ' ' <<<"$files")- remove all but one, then set EXPLORERS_NGINX_SITE_PATH to it"
  fi
  note "save the full config before the first deploy: sudo nginx -T > ~/nginx-T-before-cutover.txt (never commit it; the repo is public)"
}

tools
directories
check_env
nginx_site
if (( problems > 0 )); then echo "$problems problem(s); not ready" >&2; exit 1; fi
echo "host is ready for the first deploy"
