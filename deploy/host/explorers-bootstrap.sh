#!/usr/bin/env bash
# One-time host bootstrap for the canonical stack (P2 Task 9, Steps 2-4 and the
# checks for 6-9). Run as root on the explorers host, from a copy of the repo's
# deploy/ directory:
#
#   sudo bash explorers-bootstrap.sh init  <server-name> <path/to/production.env.example>
#   sudo bash explorers-bootstrap.sh check <server-name>
#
# init:  checks the tools and headroom; creates /opt/explorers (0700) and
#        /srv/explorers; generates the two database password files if they do not
#        exist (never overwrites one); installs production.env from the example if
#        there is none, then stops and tells you to fill it in.
# check: everything init checks, plus production.env itself: ownership and mode,
#        every required variable present, no example value left, the secret-shape
#        rules the API and the gate enforce at boot, and which nginx file serves
#        <server-name> today (that file is EXPLORERS_NGINX_SITE_PATH).
#
# Idempotent. Prints every problem it finds, then exits non-zero if there was one.
# It never prints a secret value.
set -Eeuo pipefail

readonly OPT=/opt/explorers
readonly SECRETS="$OPT/secrets"
readonly ENV_FILE="$OPT/production.env"
readonly SRV=/srv/explorers
readonly MIN_DISK_GB=10
readonly MIN_MEMORY_MB=1800

problems=0
problem() { echo "FAIL: $*" >&2; problems=$((problems + 1)); }
ok() { echo "ok:   $*"; }
note() { echo "note: $*"; }

usage() { echo "usage: explorers-bootstrap.sh init <server-name> <production.env.example> | check <server-name>" >&2; exit 2; }
[[ "$#" -ge 2 ]] || usage
mode="$1"
server_name="$2"
[[ "$mode" == init && "$#" -eq 3 ]] || [[ "$mode" == check && "$#" -eq 2 ]] || usage
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
# The image identity is supplied by explorers-deploy.sh on every deploy (and
# recorded in $OPT/image.env), so it is not required here.
readonly REQUIRED=(DB_NAME DB_MIGRATOR_USER DB_RUNTIME_USER DB_MIGRATOR_PASSWORD_FILE_HOST
  DB_RUNTIME_PASSWORD_FILE_HOST MUSIC_GATE_ATTESTATION_KEY EXPLORERS_PUBLIC_ORIGIN EXPLORERS_AUTH_SECRET
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET EXPLORERS_TRUSTED_PROXY_IP EXPLORERS_MEDIA_S3_BUCKET
  EXPLORERS_MEDIA_S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY GOOGLE_BOOKS_API_KEY TMDB_ACCESS_TOKEN
  EXPLORERS_BACKUP_AGE_RECIPIENT)

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

check_env() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { problem "$ENV_FILE is missing"; return; }
  [[ "$(stat -c '%u %a' "$ENV_FILE")" == "0 600" ]] || problem "$ENV_FILE must be root-owned mode 0600"
  local name value
  for name in "${REQUIRED[@]}"; do
    value="$(env_value "$name")"
    if [[ -z "$value" ]]; then problem "production.env: $name is empty or missing"; continue; fi
    # Every dummy in production.env.example says example/EXAMPLE or is all zeros.
    if [[ "$value" =~ [Ee][Xx][Aa][Mm][Pp][Ll][Ee] || "$value" =~ ^[0.:]+$ ]]; then
      problem "production.env: $name still holds the example value"
    fi
  done
  local origin
  origin="$(env_value EXPLORERS_PUBLIC_ORIGIN)"
  [[ "$origin" == "https://$server_name" ]] || problem "production.env: EXPLORERS_PUBLIC_ORIGIN must be exactly https://$server_name (no path, no trailing slash)"
  for name in EXPLORERS_AUTH_SECRET MUSIC_GATE_ATTESTATION_KEY; do
    value="$(env_value "$name")"
    (( ${#value} >= 32 )) || problem "production.env: $name must be at least 32 characters"
  done
  local migrator runtime
  migrator="$(env_value DB_MIGRATOR_USER)"; runtime="$(env_value DB_RUNTIME_USER)"
  [[ "$migrator" != "$runtime" ]] || problem "production.env: DB_MIGRATOR_USER and DB_RUNTIME_USER must differ"
  for name in "$migrator" "$runtime"; do
    [[ "$name" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || problem "production.env: database user '$name' is not a plain lowercase identifier"
    [[ "$name" != postgres && "$name" != music_runtime ]] || problem "production.env: database user may not be '$name'"
  done
  # platform-backup.mjs's assertAgeRecipient: a public key, never an identity.
  [[ "$(env_value EXPLORERS_BACKUP_AGE_RECIPIENT)" =~ ^age1[0-9a-z]{58}$ ]] || problem "production.env: EXPLORERS_BACKUP_AGE_RECIPIENT must be the age PUBLIC key (age1 + 58 characters); every deploy after the first refuses without it"
  [[ "$(env_value EXPLORERS_TRUSTED_PROXY_IP)" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || problem "production.env: EXPLORERS_TRUSTED_PROXY_IP must be one IPv4 address"
  [[ "$(env_value DB_MIGRATOR_PASSWORD_FILE_HOST)" == "$SECRETS/db-migrator" ]] || note "DB_MIGRATOR_PASSWORD_FILE_HOST is not $SECRETS/db-migrator; checking it where it points"
  check_secret_file "$(env_value DB_MIGRATOR_PASSWORD_FILE_HOST)"
  check_secret_file "$(env_value DB_RUNTIME_PASSWORD_FILE_HOST)"
  (( problems > 0 )) || ok "$ENV_FILE is complete"
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
if [[ "$mode" == init ]]; then
  if [[ ! -e "$ENV_FILE" ]]; then
    install -m 0600 -o root -g root "$3" "$ENV_FILE"
    note "installed $ENV_FILE from the example. Fill in every value, then run: sudo bash $0 check $server_name"
    exit 1
  fi
  note "$ENV_FILE already exists; left as it is"
fi
check_env
nginx_site
if (( problems > 0 )); then echo "$problems problem(s); not ready" >&2; exit 1; fi
echo "host is ready for the first deploy"
